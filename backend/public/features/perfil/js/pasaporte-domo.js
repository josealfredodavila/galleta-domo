// ================================================================
// CSARIEL'S · PERFIL · PASAPORTE DIGITAL
// PREMIUM EXPERIENCE v3.0 · MAXI PRO
// ================================================================
//
//   - Credencial digital premium, radiante e institucional Web3.
//   - Verde bosque profundo, oro metálico, brillo luminoso y profundidad.
//   - Estados: cargando, activo, sin credencial y error.
//   - Sello de Miembro Fundador.
//   - Indicador de autenticidad y red Polygon.
//   - Enlace directo y seguro a PolygonScan.
//   - Animaciones elegantes, accesibles y adaptables.
//   - Consulta credenciales_digitales.
//   - Escucha INSERT y UPDATE mediante Supabase Realtime.
//   - Usa window.supabaseClient y window.sessionUser.
//   - No depende de muro-utils.js.
//
// SEGURIDAD:
//   - El frontend NUNCA activa, emite ni modifica credenciales.
//   - La emisión debe permanecer exclusivamente en backend / Edge Function.
//   - La sesión se obtiene con Supabase Auth; para decisiones sensibles,
//     el backend siempre debe validar el token y aplicar RLS.
// ================================================================

(function () {
    'use strict';

    // ============================================================
    // CONFIGURACIÓN
    // ============================================================

    var PASAPORTE_TIPO = 'pasaporte_domo';
    var TABLA_CREDENCIALES = 'credenciales_digitales';

    var REINTENTOS_MAX = 80;
    var INTERVALO_REINTENTO = 250;

    var canalPasaporte = null;
    var iniciado = false;
    var estiloInstalado = false;

    var usuarioActual = null;
    var clienteActual = null;
    var credencialActual = null;

    // ============================================================
    // HELPERS SEGUROS
    // ============================================================

    function escapeHTML(valor) {
        if (valor === null || valor === undefined) return '';

        return String(valor)
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
            console.log('[Pasaporte] ' + mensaje);
        }
    }

    function esperar(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function obtenerElemento(id) {
        return document.getElementById(id);
    }

    function formatearFecha(fecha) {
        if (!fecha) return '';

        var fechaObjeto = new Date(fecha);

        if (isNaN(fechaObjeto.getTime())) return '';

        return fechaObjeto.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function construirUrlPolygon(txHash) {
        var hash = String(txHash || '').trim();

        if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
            return '';
        }

        return 'https://polygonscan.com/tx/' + encodeURIComponent(hash);
    }

    function acortarHash(txHash) {
        var hash = String(txHash || '').trim();

        if (hash.length <= 18) return hash;

        return hash.slice(0, 10) + '…' + hash.slice(-8);
    }

    // ============================================================
    // DISEÑO PREMIUM
    // ============================================================

    function instalarEstilos() {
        if (estiloInstalado || document.getElementById('csarielPasaporteMaxiProCSS')) {
            estiloInstalado = true;
            return;
        }

        var css = `
        /* ========================================================
           CSARIEL'S · DIGITAL PASSPORT · MAXI PRO
        ======================================================== */

        #pasaporteDomo {
            width: 100%;
            box-sizing: border-box;
            margin: 26px 0;
            font-family: inherit;
        }

        #pasaporteDomo *,
        #pasaporteDomo *::before,
        #pasaporteDomo *::after {
            box-sizing: border-box;
        }

        #pasaporteDomo .pasaporte-shell {
            position: relative;
            width: 100%;
            border-radius: 26px;
        }

        #pasaporteDomo .pasaporte-card {
            --passport-green: #071B13;
            --passport-green-soft: #102E21;
            --passport-gold: #D4AF37;
            --passport-gold-light: #F7E6A1;
            --passport-emerald: #65E695;

            position: relative;
            width: 100%;
            min-height: 300px;
            padding: 30px;
            overflow: hidden;
            isolation: isolate;
            color: #F8F7F0;
            border: 1px solid rgba(212, 175, 55, .50);
            border-radius: 26px;
            background:
                radial-gradient(
                    ellipse 75% 55% at 92% 3%,
                    rgba(212, 175, 55, .20),
                    transparent 48%
                ),
                radial-gradient(
                    ellipse 85% 60% at 4% 104%,
                    rgba(35, 116, 77, .30),
                    transparent 52%
                ),
                radial-gradient(
                    ellipse 60% 45% at 55% 0%,
                    rgba(255, 255, 255, .05),
                    transparent 60%
                ),
                linear-gradient(
                    135deg,
                    #123326 0%,
                    #071B13 46%,
                    #0B251A 100%
                );
            box-shadow:
                0 22px 60px rgba(0, 0, 0, .30),
                0 0 0 1px rgba(255, 255, 255, .03) inset,
                0 1px 0 rgba(255, 255, 255, .10) inset,
                0 -1px 0 rgba(212, 175, 55, .13) inset;
            transition:
                transform .35s cubic-bezier(.2, .8, .2, 1),
                box-shadow .35s ease,
                border-color .35s ease;
        }

        #pasaporteDomo .pasaporte-card:hover {
            transform: translateY(-4px);
            border-color: rgba(247, 230, 161, .85);
            box-shadow:
                0 28px 70px rgba(0, 0, 0, .38),
                0 0 34px rgba(212, 175, 55, .13),
                0 1px 0 rgba(255, 255, 255, .14) inset;
        }

        #pasaporteDomo .pasaporte-card::before {
            content: "";
            position: absolute;
            z-index: -1;
            top: -120px;
            right: -95px;
            width: 310px;
            height: 310px;
            border: 1px solid rgba(212, 175, 55, .22);
            border-radius: 50%;
            box-shadow:
                0 0 0 18px rgba(212, 175, 55, .03),
                0 0 0 38px rgba(212, 175, 55, .028),
                0 0 0 58px rgba(212, 175, 55, .02);
            pointer-events: none;
        }

        #pasaporteDomo .pasaporte-card::after {
            content: "";
            position: absolute;
            z-index: -1;
            top: 0;
            left: 0;
            width: 3px;
            height: 100%;
            background: linear-gradient(
                180deg,
                transparent,
                #F7E6A1 20%,
                #D4AF37 74%,
                transparent
            );
            opacity: .95;
        }

        #pasaporteDomo .pasaporte-glow {
            position: absolute;
            z-index: -1;
            top: -70px;
            left: -60px;
            width: 260px;
            height: 260px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                rgba(101, 230, 149, .13),
                transparent 66%
            );
            filter: blur(18px);
            pointer-events: none;
        }

        #pasaporteDomo .pasaporte-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-bottom: 30px;
        }

        #pasaporteDomo .pasaporte-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }

        #pasaporteDomo .pasaporte-brand-symbol {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 42px;
            height: 42px;
            color: #F7E6A1;
            font-size: 25px;
            border: 1px solid rgba(212, 175, 55, .60);
            border-radius: 13px;
            background:
                linear-gradient(
                    135deg,
                    rgba(212, 175, 55, .16),
                    rgba(212, 175, 55, .04)
                );
            box-shadow:
                0 0 22px rgba(212, 175, 55, .13),
                inset 0 1px 0 rgba(255, 255, 255, .12);
        }

        #pasaporteDomo .pasaporte-brand-name {
            color: #FFFFFF;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 2.6px;
            line-height: 1.35;
        }

        #pasaporteDomo .pasaporte-brand-caption {
            display: block;
            margin-top: 3px;
            color: rgba(255, 255, 255, .50);
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 2px;
        }

        #pasaporteDomo .pasaporte-status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
            padding: 8px 13px;
            color: #A8F0BD;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 1.1px;
            text-transform: uppercase;
            border: 1px solid rgba(105, 220, 139, .30);
            border-radius: 30px;
            background: rgba(46, 160, 91, .13);
            box-shadow: 0 0 18px rgba(101, 230, 149, .08);
        }

        #pasaporteDomo .pasaporte-status-dot {
            width: 8px;
            height: 8px;
            flex-shrink: 0;
            border-radius: 50%;
            background: #65E695;
            box-shadow: 0 0 11px rgba(101, 230, 149, .85);
            animation: pasaportePulse 2.2s infinite;
        }

        #pasaporteDomo .pasaporte-divider {
            width: 100%;
            height: 1px;
            margin: 0 0 25px;
            background: linear-gradient(
                90deg,
                rgba(212, 175, 55, .70),
                rgba(212, 175, 55, .14),
                transparent
            );
        }

        #pasaporteDomo .pasaporte-sello {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 13px;
            padding: 7px 12px;
            color: #F7D977;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 2.1px;
            text-transform: uppercase;
            border: 1px solid rgba(212, 175, 55, .30);
            border-radius: 30px;
            background: rgba(212, 175, 55, .08);
        }

        #pasaporteDomo .pasaporte-sello-icon {
            font-size: 15px;
        }

        #pasaporteDomo .pasaporte-titulo {
            max-width: 500px;
            color: #FFFFFF;
            font-size: clamp(23px, 5.4vw, 33px);
            font-weight: 900;
            line-height: 1.15;
            letter-spacing: -.8px;
            text-wrap: balance;
            text-shadow: 0 3px 18px rgba(0, 0, 0, .25);
        }

        #pasaporteDomo .pasaporte-subtitulo {
            margin-top: 10px;
            max-width: 480px;
            color: rgba(255, 255, 255, .60);
            font-size: 12px;
            font-weight: 500;
            letter-spacing: .35px;
            line-height: 1.55;
        }

        #pasaporteDomo .pasaporte-correo {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            max-width: 100%;
            margin-top: 22px;
            padding: 10px 14px;
            overflow-wrap: anywhere;
            color: #F5E9C3;
            font-size: 11px;
            font-weight: 650;
            border: 1px solid rgba(212, 175, 55, .22);
            border-radius: 11px;
            background: rgba(0, 0, 0, .18);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, .05);
        }

        #pasaporteDomo .pasaporte-correo-icon {
            color: #D4AF37;
            font-size: 13px;
        }

        #pasaporteDomo .pasaporte-token {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin-top: 20px;
            color: #B5F0C7;
            font-size: 10.5px;
            font-weight: 700;
            line-height: 1.55;
        }

        #pasaporteDomo .pasaporte-token-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            flex-shrink: 0;
            color: #A8F0BD;
            font-size: 12px;
            border: 1px solid rgba(105, 220, 139, .38);
            border-radius: 50%;
            background: rgba(46, 160, 91, .14);
            box-shadow: 0 0 12px rgba(101, 230, 149, .10);
        }

        #pasaporteDomo .pasaporte-footer {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 16px;
            margin-top: 27px;
            padding-top: 18px;
            border-top: 1px solid rgba(255, 255, 255, .10);
        }

        #pasaporteDomo .pasaporte-meta-label {
            display: block;
            margin-bottom: 6px;
            color: rgba(255, 255, 255, .45);
            font-size: 8px;
            font-weight: 900;
            letter-spacing: 1.7px;
            text-transform: uppercase;
        }

        #pasaporteDomo .pasaporte-meta {
            color: #F1E8D0;
            font-size: 11.5px;
            font-weight: 700;
        }

        #pasaporteDomo .pasaporte-network {
            display: flex;
            align-items: center;
            gap: 8px;
            color: rgba(255, 255, 255, .60);
            font-size: 9px;
            font-weight: 800;
            letter-spacing: .9px;
            white-space: nowrap;
        }

        #pasaporteDomo .pasaporte-network-mark {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            color: #C3A0FF;
            font-size: 13px;
            border: 1px solid rgba(160, 120, 255, .32);
            border-radius: 8px;
            background: rgba(130, 90, 220, .13);
        }

        #pasaporteDomo .pasaporte-tx {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            min-height: 42px;
            margin-top: 20px;
            padding: 0 17px;
            color: #172315 !important;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: .6px;
            text-decoration: none !important;
            border: 1px solid #F0D47C;
            border-radius: 11px;
            background: linear-gradient(
                135deg,
                #FFF0B9,
                #D4AF37
            );
            box-shadow:
                0 7px 20px rgba(212, 175, 55, .17),
                inset 0 1px 0 rgba(255, 255, 255, .45);
            transition: all .25s ease;
        }

        #pasaporteDomo .pasaporte-tx:hover {
            color: #071B13 !important;
            transform: translateY(-2px);
            background: linear-gradient(
                135deg,
                #FFF7D2,
                #E7C34C
            );
            box-shadow:
                0 10px 26px rgba(212, 175, 55, .28),
                inset 0 1px 0 rgba(255, 255, 255, .55);
        }

        #pasaporteDomo .pasaporte-hash {
            margin-top: 15px;
            color: rgba(255, 255, 255, .42);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 9.5px;
            letter-spacing: .3px;
            overflow-wrap: anywhere;
        }

        #pasaporteDomo .pasaporte-estado {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            padding: 30px;
            color: rgba(255, 255, 255, .62);
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            border: 1px dashed rgba(212, 175, 55, .28);
            border-radius: 26px;
            background:
                radial-gradient(
                    ellipse at 50% 0%,
                    rgba(212, 175, 55, .06),
                    transparent 60%
                ),
                linear-gradient(
                    135deg,
                    rgba(16, 46, 33, .75),
                    rgba(7, 27, 19, .85)
                );
        }

        #pasaporteDomo .pasaporte-estado-error {
            color: #FFC7C7;
            border-color: rgba(255, 120, 120, .30);
            background:
                radial-gradient(
                    ellipse at 50% 0%,
                    rgba(255, 90, 90, .08),
                    transparent 60%
                ),
                linear-gradient(
                    135deg,
                    rgba(30, 16, 16, .78),
                    rgba(10, 8, 8, .88)
                );
        }

        #pasaporteDomo .pasaporte-spinner {
            width: 25px;
            height: 25px;
            margin-bottom: 14px;
            border: 2px solid rgba(212, 175, 55, .18);
            border-top-color: #D4AF37;
            border-radius: 50%;
            animation: pasaporteSpin .8s linear infinite;
        }

        #pasaporteDomo .pasaporte-anim {
            animation: pasaporteAppear .7s cubic-bezier(.2, .8, .2, 1) both;
        }

        @keyframes pasaporteAppear {
            from {
                opacity: 0;
                transform: translateY(15px) scale(.985);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes pasaportePulse {
            0%, 100% {
                opacity: 1;
                box-shadow: 0 0 11px rgba(101, 230, 149, .85);
            }
            50% {
                opacity: .55;
                box-shadow: 0 0 4px rgba(101, 230, 149, .30);
            }
        }

        @keyframes pasaporteSpin {
            to {
                transform: rotate(360deg);
            }
        }

        @media (max-width: 520px) {
            #pasaporteDomo {
                margin: 19px 0;
            }

            #pasaporteDomo .pasaporte-card {
                padding: 22px;
                border-radius: 20px;
                min-height: 0;
            }

            #pasaporteDomo .pasaporte-estado {
                padding: 22px;
                border-radius: 20px;
                min-height: 230px;
            }

            #pasaporteDomo .pasaporte-header {
                margin-bottom: 23px;
                gap: 9px;
            }

            #pasaporteDomo .pasaporte-brand {
                gap: 9px;
            }

            #pasaporteDomo .pasaporte-brand-symbol {
                width: 34px;
                height: 34px;
                font-size: 20px;
            }

            #pasaporteDomo .pasaporte-brand-name {
                font-size: 10px;
                letter-spacing: 1.9px;
            }

            #pasaporteDomo .pasaporte-brand-caption {
                font-size: 7px;
            }

            #pasaporteDomo .pasaporte-status {
                padding: 6px 9px;
                font-size: 8px;
                letter-spacing: .5px;
            }

            #pasaporteDomo .pasaporte-footer {
                align-items: flex-start;
                flex-direction: column;
                gap: 13px;
            }

            #pasaporteDomo .pasaporte-network {
                align-self: flex-start;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #pasaporteDomo *,
            #pasaporteDomo *::before,
            #pasaporteDomo *::after {
                animation-duration: .01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: .01ms !important;
            }
        }
        `;

        var style = document.createElement('style');
        style.id = 'csarielPasaporteMaxiProCSS';
        style.textContent = css;

        document.head.appendChild(style);
        estiloInstalado = true;
    }

    // ============================================================
    // ESPERAR SUPABASE Y SESIÓN
    // ============================================================

    async function esperarListo() {
        var client = null;
        var user = null;

        for (var i = 0; i < REINTENTOS_MAX; i++) {
            client = window.supabaseClient;

            if (client) {
                try {
                    var resultado = await client.auth.getSession();

                    if (
                        resultado &&
                        resultado.data &&
                        resultado.data.session
                    ) {
                        user = resultado.data.session.user;

                        if (user && user.id) {
                            return {
                                client: client,
                                user: user
                            };
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[Pasaporte] Esperando sesión:',
                        error && error.message ? error.message : error
                    );
                }
            }

            if (window.sessionUser && window.supabaseClient) {
                user = window.sessionUser;

                if (user && user.id) {
                    return {
                        client: window.supabaseClient,
                        user: user
                    };
                }
            }

            await esperar(INTERVALO_REINTENTO);
        }

        return {
            client: client,
            user: user
        };
    }

    // ============================================================
    // RENDER DE ESTADOS
    // ============================================================

    function renderizarCargando() {
        var contenedor = obtenerElemento('pasaporteDomo');

        if (!contenedor) return;

        instalarEstilos();

        contenedor.innerHTML =
            '<div class="pasaporte-estado pasaporte-anim">' +
                '<div class="pasaporte-spinner"></div>' +
                '<div>Verificando tu Pasaporte Digital…</div>' +
            '</div>';
    }

    function renderizarError(mensaje) {
        var contenedor = obtenerElemento('pasaporteDomo');

        if (!contenedor) return;

        instalarEstilos();

        contenedor.innerHTML =
            '<div class="pasaporte-estado pasaporte-estado-error pasaporte-anim">' +
                '<div>' +
                    '<div style="font-size:22px; margin-bottom:10px;">⚠️</div>' +
                    '<div>' + escapeHTML(mensaje || 'No pudimos cargar tu Pasaporte Digital.') + '</div>' +
                '</div>' +
            '</div>';
    }

    function renderizarSinCredencial() {
        var contenedor = obtenerElemento('pasaporteDomo');

        if (!contenedor) return;

        instalarEstilos();

        contenedor.innerHTML =
            '<div class="pasaporte-estado pasaporte-anim">' +
                '<div>' +
                    '<div style="font-size:26px; margin-bottom:11px;">◈</div>' +
                    '<div style="color:#F7E6A1; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; font-size:10px; margin-bottom:8px;">' +
                        'PASAPORTE DIGITAL' +
                    '</div>' +
                    '<div>Aún no tienes una credencial activa en este ecosistema.</div>' +
                '</div>' +
            '</div>';
    }

    // ============================================================
    // CONSULTAR CREDENCIAL
    // ============================================================

    async function cargarPasaporte(client, user) {
        var contenedor = obtenerElemento('pasaporteDomo');

        if (!contenedor) return;

        try {
            renderizarCargando();

            var res = await client
                .from(TABLA_CREDENCIALES)
                .select('id, tipo, tx_hash, emitida_en, estado')
                .eq('usuario_id', user.id)
                .eq('tipo', PASAPORTE_TIPO)
                .order('emitida_en', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (res.error) {
                throw res.error;
            }

            if (!res.data) {
                credencialActual = null;
                renderizarSinCredencial();
            } else {
                credencialActual = res.data;
                renderizarPasaporte(res.data, user);
            }

            suscribirPasaporte(client, user);

        } catch (error) {
            console.warn(
                '[Pasaporte] Error cargando credencial:',
                error
            );

            renderizarError(
                'No pudimos verificar tu credencial. Intenta recargar la página.'
            );
        }
    }

    // ============================================================
    // SUPABASE REALTIME
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
                        table: TABLA_CREDENCIALES,
                        filter: 'usuario_id=eq.' + user.id
                    },
                    function (payload) {
                        if (
                            payload.new &&
                            payload.new.tipo === PASAPORTE_TIPO
                        ) {
                            credencialActual = payload.new;
                            renderizarPasaporte(payload.new, user);

                            toast(
                                'Tu Pasaporte Digital fue activado',
                                'success'
                            );
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: TABLA_CREDENCIALES,
                        filter: 'usuario_id=eq.' + user.id
                    },
                    function (payload) {
                        if (
                            payload.new &&
                            payload.new.tipo === PASAPORTE_TIPO
                        ) {
                            credencialActual = payload.new;
                            renderizarPasaporte(payload.new, user);

                            toast(
                                'Tu Pasaporte Digital fue actualizado',
                                'success'
                            );
                        }
                    }
                )
                .subscribe();

        } catch (error) {
            console.warn(
                '[Pasaporte] No se pudo suscribir a Realtime:',
                error
            );
        }
    }

    // ============================================================
    // RENDERIZAR CREDENCIAL PREMIUM
    // ============================================================

    function renderizarPasaporte(cred, user) {
        var contenedor = obtenerElemento('pasaporteDomo');

        if (!contenedor || !cred) return;

        instalarEstilos();

        var fecha = formatearFecha(cred.emitida_en);
        var correo = user && user.email ? escapeHTML(user.email) : '';
        var txHash = cred.tx_hash ? String(cred.tx_hash).trim() : '';
        var txUrl = construirUrlPolygon(txHash);
        var hashVisible = txHash ? escapeHTML(acortarHash(txHash)) : '';

        var html =
            '<div class="pasaporte-shell pasaporte-anim">' +

                '<div class="pasaporte-card">' +

                    '<div class="pasaporte-glow"></div>' +

                    '<div class="pasaporte-header">' +

                        '<div class="pasaporte-brand">' +

                            '<div class="pasaporte-brand-symbol">◈</div>' +

                            '<div>' +
                                '<div class="pasaporte-brand-name">CSARIEL\'S</div>' +
                                '<span class="pasaporte-brand-caption">DIGITAL IDENTITY</span>' +
                            '</div>' +

                        '</div>' +

                        '<div class="pasaporte-status">' +
                            '<span class="pasaporte-status-dot"></span>' +
                            'ACTIVO' +
                        '</div>' +

                    '</div>' +

                    '<div class="pasaporte-divider"></div>' +

                    '<div class="pasaporte-sello">' +
                        '<span class="pasaporte-sello-icon">✧</span>' +
                        'MIEMBRO FUNDADOR' +
                    '</div>' +

                    '<div class="pasaporte-titulo">Pasaporte Digital</div>' +

                    '<div class="pasaporte-subtitulo">' +
                        'Tu identidad digital verificada dentro del ecosistema Csariel\'s.' +
                    '</div>' +

                    (
                        correo
                            ? '<div class="pasaporte-correo">' +
                                '<span class="pasaporte-correo-icon">◉</span>' +
                                correo +
                              '</div>'
                            : ''
                    ) +

                    '<div class="pasaporte-token">' +
                        '<span class="pasaporte-token-icon">✓</span>' +
                        '<span>Credencial registrada y token enviado a tu wallet en Polygon.</span>' +
                    '</div>' +

                    (
                        hashVisible
                            ? '<div class="pasaporte-hash">TX · ' + hashVisible + '</div>'
                            : ''
                    ) +

                    '<div class="pasaporte-footer">' +

                        (
                            fecha
                                ? '<div>' +
                                    '<span class="pasaporte-meta-label">FECHA DE EMISIÓN</span>' +
                                    '<div class="pasaporte-meta">' + escapeHTML(fecha) + '</div>' +
                                  '</div>'
                                : '<div></div>'
                        ) +

                        '<div class="pasaporte-network">' +
                            '<span class="pasaporte-network-mark">⬡</span>' +
                            'POLYGON NETWORK' +
                        '</div>' +

                    '</div>' +

                    (
                        txUrl
                            ? '<a class="pasaporte-tx"' +
                                ' href="' + escapeHTML(txUrl) + '"' +
                                ' target="_blank"' +
                                ' rel="noopener noreferrer">' +
                                'VERIFICAR TRANSACCIÓN' +
                                '<span>↗</span>' +
                              '</a>'
                            : ''
                    ) +

                '</div>' +

            '</div>';

        contenedor.innerHTML = html;
    }

    // ============================================================
    // LIMPIEZA DE REALTIME
    // ============================================================

    function detenerPasaporte() {
        if (canalPasaporte && clienteActual) {
            try {
                clienteActual.removeChannel(canalPasaporte);
            } catch (error) {
                console.warn(
                    '[Pasaporte] Error limpiando canal:',
                    error
                );
            }

            canalPasaporte = null;
        }
    }

    window.addEventListener('beforeunload', detenerPasaporte);
    window.addEventListener('pagehide', detenerPasaporte);

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================

    async function iniciar() {
        if (iniciado) return;

        iniciado = true;

        instalarEstilos();
        renderizarCargando();

        var ctx = await esperarListo();

        if (!ctx.client || !ctx.user || !ctx.user.id) {
            iniciado = false;
            renderizarError('No pudimos validar tu sesión.');
            return;
        }

        clienteActual = ctx.client;
        usuarioActual = ctx.user;

        await cargarPasaporte(ctx.client, ctx.user);
    }

    // ============================================================
    // ARRANQUE AUTOMÁTICO
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }

    // ============================================================
    // API PÚBLICA DEL MÓDULO
    // ============================================================

    window.iniciarPasaporteDomo = iniciar;

    window.recargarPasaporteDomo = async function () {
        if (!clienteActual || !usuarioActual) {
            iniciado = false;
            return iniciar();
        }

        await cargarPasaporte(clienteActual, usuarioActual);
    };

})();