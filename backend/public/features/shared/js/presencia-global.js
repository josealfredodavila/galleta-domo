/* ================================================================
   PRESENCIA GLOBAL — SARIEL'S ECOSYSTEM v1.0
   ================================================================
   Emite window 'sar:presence:sync' con el mapa de usuarios activos.
   Expone window.presenciaUsuarios y window.Presencia.

   REGLAS:
   - Solo trackea si hay sesión Y la página NO es data-public.
   - En páginas data-public solo escucha (no crea canal propio).
   - Sin polling. Todo por Supabase Realtime Presence.
   - Contrato del mapa:
       { "<userId>": { user_id, visible, en: "ISO" }, ... }
     Solo incluye usuarios con visible !== false.

   CONTRATO CON EL RESTO DEL ECOSISTEMA:
   - El evento 'sar:presence:sync' lleva el mapa en .detail.
   - Se emite cada vez que cambia.
   - perfil-estado.js (v7) lo escucha si está cargado.
   - perfil-publico.html lo escucha SIEMPRE (solo lectura).
   ================================================================ */

(function () {
    'use strict';

    if (window.__sarielsPresenciaGlobalLoaded) {
        return;
    }
    window.__sarielsPresenciaGlobalLoaded = true;

    // ----------------------------------------------------------------
    // Estado interno
    // ----------------------------------------------------------------
    var canal = null;
    var conectado = false;
    var visible = true;
    var usuarioActualId = null;
    var mapa = {};              // { userId: { user_id, visible, en } }
    var suscriptor = null;

    // ----------------------------------------------------------------
    // Config
    // ----------------------------------------------------------------
    var NOMBRE_CANAL = 'sariels-presencia-global';
    var EVENTO_PRESENCE = 'sync';
    var MS_DEBOUNCE_EMITIR = 80;

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------
    function paginaEsPublica() {
        return document.documentElement.hasAttribute('data-public');
    }

    function paginaRequiereAuth() {
        // Cualquier página que NO tenga data-public y esté protegida.
        return !paginaEsPublica();
    }

    async function obtenerCliente() {
        try {
            var c = await window.supabaseReady;
            if (c) return c;
        } catch (e) { /* fallback */ }
        return window.supabaseClient || null;
    }

    async function obtenerSesion() {
        var client = await obtenerCliente();
        if (!client || !client.auth) return null;
        try {
            var r = await client.auth.getSession();
            return (r && r.data && r.data.session) || null;
        } catch (e) {
            return null;
        }
    }

    // ----------------------------------------------------------------
    // Emisión del mapa (debounced para no saturar)
    // ----------------------------------------------------------------
    var emitirTimer = null;

    function emitirSync() {
        if (emitirTimer) return;
        emitirTimer = setTimeout(function () {
            emitirTimer = null;
            try {
                window.presenciaUsuarios = mapa;
                window.dispatchEvent(new CustomEvent('sar:presence:sync', {
                    detail: mapa
                }));
            } catch (e) {
                console.warn('[Presencia] Error emitiendo sync:', e);
            }
        }, MS_DEBOUNCE_EMITIR);
    }

    // ----------------------------------------------------------------
    // Transforma el state de Supabase Presence al contrato del mapa
    // ----------------------------------------------------------------
    function transformarEstado(state) {
        var ahora = new Date().toISOString();
        var nuevo = {};

        if (!state || typeof state !== 'object') {
            return nuevo;
        }

        Object.keys(state).forEach(function (canalKey) {
            var presencia = state[canalKey];
            if (!Array.isArray(presencia)) return;

            presencia.forEach(function (meta) {
                if (!meta || !meta.user_id) return;
                if (meta.visible === false) return;   // respeta ocultos

                nuevo[meta.user_id] = {
                    user_id: meta.user_id,
                    visible: meta.visible !== false,
                    en: meta.en || ahora
                };
            });
        });

        return nuevo;
    }

    // ----------------------------------------------------------------
    // API pública
    // ----------------------------------------------------------------
    async function iniciar(userId, opciones) {
        if (canal) return canal;

        if (!userId) {
            var sesion = await obtenerSesion();
            if (!sesion || !sesion.user) return null;
            userId = sesion.user.id;
        }

        usuarioActualId = userId;

        var client = await obtenerCliente();
        if (!client) return null;

        var opts = opciones || {};
        var trackear = opts.track !== false;   // por defecto true

        canal = client.channel(NOMBRE_CANAL, {
            config: {
                presence: {
                    key: userId
                }
            }
        });

        canal
            .on('presence', { event: 'sync' }, function () {
                var state = canal.presenceState();
                mapa = transformarEstado(state);
                emitirSync();
            })
            .on('presence', { event: 'join' }, function () {
                var state = canal.presenceState();
                mapa = transformarEstado(state);
                emitirSync();
            })
            .on('presence', { event: 'leave' }, function () {
                var state = canal.presenceState();
                mapa = transformarEstado(state);
                emitirSync();
            });

        canal.subscribe(async function (status) {
            if (status === 'SUBSCRIBED') {
                conectado = true;

                if (trackear) {
                    try {
                        await canal.track({
                            user_id: userId,
                            visible: visible !== false,
                            en: new Date().toISOString()
                        });
                    } catch (e) {
                        console.warn('[Presencia] Error al trackear:', e);
                    }
                }

                // Emitir un sync inicial vacío para que las páginas
                // sepan que la presencia ya está activa.
                emitirSync();

                if (typeof opts.onConexionCambia === 'function') {
                    try { opts.onConexionCambia(true); } catch (_) {}
                }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                conectado = false;
                if (typeof opts.onConexionCambia === 'function') {
                    try { opts.onConexionCambia(false); } catch (_) {}
                }
            }
        });

        return canal;
    }

    function detener() {
        if (!canal) return;
        try {
            canal.untrack();
        } catch (e) { /* noop */ }
        try {
            canal.unsubscribe();
        } catch (e) { /* noop */ }
        canal = null;
        conectado = false;
        mapa = {};
        emitirSync();
    }

    async function setVisible(v) {
        visible = v !== false;
        if (!canal || !usuarioActualId) return;
        try {
            await canal.track({
                user_id: usuarioActualId,
                visible: visible,
                en: new Date().toISOString()
            });
        } catch (e) {
            console.warn('[Presencia] setVisible falló:', e);
        }
    }

    function estaConectado() {
        return conectado === true;
    }

    function esVisible() {
        return visible === true;
    }

    // ----------------------------------------------------------------
    // Exponer API
    // ----------------------------------------------------------------
    window.Presencia = {
        iniciar: iniciar,
        detener: detener,
        setVisible: setVisible,
        estaConectado: estaConectado,
        esVisible: esVisible
    };

    window.presenciaUsuarios = mapa;

    // ----------------------------------------------------------------
    // Auto-arranque
    // ----------------------------------------------------------------
    // Reglas:
    //   - data-public          → NO trackear, NO crear canal.
    //   - data-require-auth    → trackear (hay sesión obligatoria).
    //   - sin data-public      → trackear si hay sesión.
    // ----------------------------------------------------------------
    (async function autoArranque() {
        if (paginaEsPublica()) {
            // En páginas públicas no hacemos nada.
            // El listener de 'sar:presence:sync' ya lo pone la propia
            // página si necesita el mapa (perfil-publico.html).
            return;
        }

        // Esperar a que auth-global.js resuelva la sesión.
        var intentos = 0;
        while (intentos++ < 50) {
            if (window.sarielsSession !== undefined || window.__sarielsAuthenticated !== null) {
                break;
            }
            await new Promise(function (r) { setTimeout(r, 100); });
        }

        var sesion = await obtenerSesion();
        if (!sesion || !sesion.user) {
            // Sin sesión en página protegida. auth-global.js ya redirige.
            return;
        }

        await iniciar(sesion.user.id, { track: true });

        // Suscribirse a cambios de sesión: si el usuario cierra sesión,
        // detener la presencia.
        try {
            var client = await obtenerCliente();
            if (client && client.auth && typeof client.auth.onAuthStateChange === 'function') {
                client.auth.onAuthStateChange(function (event) {
                    if (event === 'SIGNED_OUT') {
                        detener();
                    }
                });
            }
        } catch (e) { /* noop */ }

        // Detener al cerrar la pestaña (buena práctica, no obligatorio).
        window.addEventListener('beforeunload', function () {
            try { if (canal) canal.untrack(); } catch (e) {}
        });
    })();

    console.log('[Presencia] ✅ Módulo global v1.0 cargado');
})();