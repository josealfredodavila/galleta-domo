// ================================================================
// PERFIL · PASAPORTE DIGITAL DEL DOMO
// ================================================================
// Muestra la credencial del usuario y se actualiza en tiempo real
// cuando el backend la activa (tabla credenciales_digitales).
// El frontend NUNCA activa la credencial: solo la muestra.
//
// Adaptado para el módulo PERFIL:
//   - Usa window.supabaseClient (creado por perfil-config.js)
//   - Usa window.sessionUser si existe; si no, espera a la sesión
//   - Usa window.showToast (de perfil-utils.js) con fallback local
//   - escapeHTML local (no depende de muro-utils.js)
//
// Depende de:
//   - window.supabaseClient (perfil-config.js)
//   - window.showToast     (perfil-utils.js) — opcional, con fallback
// ================================================================

(function () {
    'use strict';

    var PASAPORTE_TIPO = 'pasaporte_domo';
    var canalPasaporte = null;
    var iniciado = false;
    var REINTENTOS_MAX = 60;   // 60 × 250ms ≈ 15 s esperando sesión
    var INTERVALO_REINTENTO = 250;

    // ============================================================
    // HELPERS LOCALES (sin depender de muro-utils.js)
    // ============================================================
    function escapeHTML(texto) {
        if (texto === null || texto === undefined) return '';
        return String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toast(mensaje, tipo) {
        if (typeof window.showToast === 'function') {
            window.showToast(mensaje, tipo);
        } else {
            // Fallback silencioso por si perfil-utils.js no cargó
            console.log('[Pasaporte] ' + mensaje);
        }
    }

    function esperar(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    // ============================================================
    // ESPERAR A QUE supabaseClient Y LA SESIÓN ESTÉN LISTOS
    // ============================================================
    async function esperarListo() {
        var client = null;
        var user = null;

        for (var i = 0; i < REINTENTOS_MAX; i++) {
            client = window.supabaseClient;
            if (client) {
                try {
                    var r = await client.auth.getSession();
                    if (r && r.data && r.data.session) {
                        user = r.data.session.user;
                        if (user) break;
                    }
                } catch (e) { /* sigue intentando */ }
            }
            // También acepta window.sessionUser si ya está listo
            if (window.sessionUser && window.supabaseClient) {
                user = window.sessionUser;
                break;
            }
            await esperar(INTERVALO_REINTENTO);
        }

        return { client: client, user: user };
    }

    // ============================================================
    // CARGAR LA CREDENCIAL
    // ============================================================
    async function cargarPasaporte(client, user) {
        try {
            var res = await client
                .from('credenciales_digitales')
                .select('id, tipo, tx_hash, emitida_en')
                .eq('usuario_id', user.id)
                .eq('tipo', PASAPORTE_TIPO)
                .maybeSingle();

            if (res.error) throw res.error;

            var contenedor = document.getElementById('pasaporteDomo');
            if (!contenedor) return;

            if (res.data) {
                renderizarPasaporte(res.data, user);
            } else {
                contenedor.innerHTML = ''; // no hay pasaporte aún
            }

            suscribirPasaporte(client, user);
        } catch (e) {
            console.warn('[Pasaporte] Error cargando credencial:', e);
        }
    }

    // ============================================================
    // REALTIME
    // ============================================================
    function suscribirPasaporte(client, user) {
        if (canalPasaporte) return;

        try {
            canalPasaporte = client
                .channel('pasaporte-perfil-' + user.id)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'credenciales_digitales',
                        filter: 'usuario_id=eq.' + user.id
                    },
                    function (payload) {
                        if (payload.new && payload.new.tipo === PASAPORTE_TIPO) {
                            renderizarPasaporte(payload.new, user);
                            toast('Tu Pasaporte Digital fue activado', 'success');
                        }
                    }
                )
                .subscribe();
        } catch (e) {
            console.warn('[Pasaporte] No se pudo suscribir a Realtime:', e);
        }
    }

    // ============================================================
    // RENDER
    // ============================================================
    function renderizarPasaporte(cred, user) {
        var contenedor = document.getElementById('pasaporteDomo');
        if (!contenedor) return;

        var fecha = cred.emitida_en
            ? new Date(cred.emitida_en).toLocaleDateString('es-MX', {
                year: 'numeric', month: 'long', day: 'numeric'
            })
            : '';

        var correo = user && user.email ? escapeHTML(user.email) : '';
        var txHash = cred.tx_hash || '';
        var txUrl = txHash
            ? 'https://polygonscan.com/tx/' + encodeURIComponent(txHash)
            : '';

        contenedor.innerHTML =
            '<div class="pasaporte-card pasaporte-anim">' +
                '<div class="pasaporte-sello">◈ Miembro Fundador</div>' +
                '<div class="pasaporte-titulo">Pasaporte Digital Csariel\'s</div>' +
                (correo
                    ? '<div class="pasaporte-correo">' + correo + '</div>'
                    : '') +
                (fecha
                    ? '<div class="pasaporte-meta">Emitido el ' + escapeHTML(fecha) + '</div>'
                    : '') +
                '<div class="pasaporte-token">✔ Token enviado a tu wallet en Polygon</div>' +
                (txUrl
                    ? '<a class="pasaporte-tx" href="' + escapeHTML(txUrl) + '" target="_blank" rel="noopener">Ver transacción ↗</a>'
                    : '') +
            '</div>';
    }

    // ============================================================
    // LIMPIEZA
    // ============================================================
    function detenerPasaporte() {
        if (canalPasaporte && window.supabaseClient) {
            try {
                window.supabaseClient.removeChannel(canalPasaporte);
            } catch (e) { /* ignorar */ }
            canalPasaporte = null;
        }
    }

    window.addEventListener('beforeunload', detenerPasaporte);
    window.addEventListener('pagehide', detenerPasaporte);

    // ============================================================
    // ARRANQUE
    // ============================================================
    async function iniciar() {
        if (iniciado) return;
        iniciado = true;

        var ctx = await esperarListo();
        if (!ctx.client || !ctx.user) {
            // No logueado o Supabase no cargó: no es un error, solo no se muestra
            return;
        }

        await cargarPasaporte(ctx.client, ctx.user);
    }

    // Arranca en cuanto el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar, { once: true });
    } else {
        iniciar();
    }

    // Expone también por si otro módulo quiere forzar recarga
    window.iniciarPasaporteDomo = iniciar;
})();