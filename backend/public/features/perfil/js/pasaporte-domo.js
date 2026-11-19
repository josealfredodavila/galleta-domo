
// ================================================================
// CSARIEL'S · PERFIL · PASAPORTE DIGITAL
// PREMIUM EXPERIENCE v2.0
// ================================================================
// Diseño premium:
//   - Credencial digital con estética institucional Web3.
//   - Verde bosque, oro metálico y detalles luminosos.
//   - Jerarquía visual mejorada y tipografía premium.
//   - Sello de miembro fundador destacado.
//   - Indicador visual de autenticidad y estado activo.
//   - Información de emisión y wallet.
//   - Acceso directo a la transacción en PolygonScan.
//   - Animaciones sutiles y efectos de profundidad.
//   - Diseño adaptable a móviles y escritorio.
//
// SEGURIDAD Y FUNCIONAMIENTO:
//   - El frontend NUNCA activa ni emite credenciales.
//   - Consulta credenciales_digitales.
//   - Escucha nuevas credenciales mediante Supabase Realtime.
//   - Usa window.supabaseClient.
//   - Usa window.sessionUser como alternativa de sesión.
//   - No depende de muro-utils.js.
// ================================================================

(function () {
    'use strict';

    var PASAPORTE_TIPO = 'pasaporte_domo';
    var canalPasaporte = null;
    var iniciado = false;
    var REINTENTOS_MAX = 60;
    var INTERVALO_REINTENTO = 250;
    var estiloInstalado = false;
    var usuarioActual = null;
    var clienteActual = null;

    // ============================================================
    // HELPERS
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

    // ============================================================
    // DISEÑO PREMIUM
    // ============================================================

    function instalarEstilos() {
        if (estiloInstalado || document.getElementById('csarielPasaportePremiumCSS')) {
            estiloInstalado = true;
            return;
        }

        var css = `
        /* ========================================================
           CSARIEL'S · DIGITAL PASSPORT · PREMIUM DESIGN
        ======================================================== */

        #pasaporteDomo {
            width: 100%;
            box-sizing: border-box;
            margin: 22px 0;
            font-family: inherit;
        }

        #pasaporteDomo *,
        #pasaporteDomo *::before,
        #pasaporteDomo *::after {
            box-sizing: border-box;
        }

        #pasaporteDomo .pasaporte-card {
            --passport-green: #0B2419;
            --passport-green-light: #153C2B;
            --passport-gold: #D4AF37;
            --passport-gold-light: #F7E6A1;

            position: relative;
            width: 100%;
            min-height: 255px;
            padding: 25px;
            overflow: hidden;
            isolation: isolate;
            color: #F8F7F0;
            border: 1px solid rgba(212, 175, 55, .48);
            border-radius: 21px;
            background:
                radial-gradient(
                    ellipse at 90% 5%,
                    rgba(212, 175, 55, .17),
                    transparent 43%
                ),
                radial-gradient(
                    ellipse at 5% 100%,
                    rgba(35, 116, 77, .28),
                    transparent 48%
                ),
                linear-gradient(
                    135deg,
                    #102E21 0%,
                    #071B13 48%,
                    #0B251A 100%
                );
            box-shadow:
                0 16px 45px rgba(0, 0, 0, .25),
                inset 0 1px 0 rgba(255, 255, 255, .09),
                inset 0 -1px 0 rgba(212, 175, 55, .12);
            transition:
                transform .3s ease,
                box-shadow .3s ease,
                border-color .3s ease;
        }

        #pasaporteDomo .pasaporte-card:hover {
            transform: translateY(-3px);
            border-color: rgba(247, 230, 161, .8);
            box-shadow:
                0 22px 55px rgba(0, 0, 0, .34),
                0 0 25px rgba(212, 175, 55, .10),
                inset 0 1px 0 rgba(255, 255, 255, .12);
        }

        #pasaporteDomo .pasaporte-card::before {
            content: "";
            position: absolute;
            z-index: -1;
            top: -105px;
            right: -90px;
            width: 270px;
            height: 270px;
            border: 1px solid rgba(212, 175, 55, .20);
            border-radius: 50%;
            box-shadow:
                0 0 0 17px rgba(212, 175, 55, .025),
                0 0 0 35px rgba(212, 175, 55, .025),
                0 0 0 53px rgba(212, 175, 55, .018);
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
                #F7E6A1 22%,
                #D4AF37 75%,
                transparent
            );
            opacity: .9;
        }

        #pasaporteDomo .pasaporte-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 27px;
        }

        #pasaporteDomo .pasaporte-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        #pasaporteDomo .pasaporte-brand-symbol {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 37px;
            height: 37px;
            color: #F7E6A1;
            font-size: 23px;
            border: 1px solid rgba(212, 175, 55, .55);
            border-radius: 11px;
            background: rgba(212, 175, 55, .09);
            box-shadow: 0 0 18px rgba(212, 175, 55, .10);
        }

        #pasaporteDomo .pasaporte-brand-name {
            color: #FFFFFF;
            font-size: 12px;
            font-weight: 850;
            letter-spacing: 2.4px;
            line-height: 1.4;
        }

        #pasaporteDomo .pasaporte-brand-caption {
            display: block;
            margin-top: 3px;
            color: rgba(255, 255, 255, .48);
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 1.8px;
        }

        #pasaporteDomo .pasaporte-status {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            flex-shrink: 0;
            padding: 7px 11px;
            color: #A8F0BD;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1px;
            text-transform: uppercase;
            border: 1px solid rgba(105, 220, 139, .27);
            border-radius: 30px;
            background: rgba(46, 160, 91, .12);
        }

        #pasaporteDomo .pasaporte-status-dot {
            width: 7px;
            height: 7px;
            flex-shrink: 0;
            border-radius: 50%;
            background: #65E695;
            box-shadow: 0 0 9px rgba(101, 230, 149, .8);
            animation: pasaportePulse 2s infinite;
        }

        #pasaporteDomo .pasaporte-divider {
            width: 100%;
            height: 1px;
            margin: 0 0 22px;
            background: linear-gradient(
                90deg,
                rgba(212, 175, 55, .65),
                rgba(212, 175, 55, .12),
                transparent
            );
        }

        #pasaporteDomo .pasaporte-sello {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 11px;
            color: #F7D977;
            font-size: 9px;
            font-weight: 850;
            letter-spacing: 2px;
            text-transform: uppercase;
        }

        #pasaporteDomo .pasaporte-sello-icon {
            font-size: 15px;
        }

        #pasaporteDomo .pasaporte-titulo {
            max-width: 440px;
            color: #FFFFFF;
            font-size: clamp(21px, 5vw, 29px);
            font-weight: 850;
            line-height: 1.2;
            letter-spacing: -.7px;
            text-wrap: balance;
            text-shadow: 0 2px 15px rgba(0, 0, 0, .2);
        }

        #pasaporteDomo .pasaporte-subtitulo {
            margin-top: 8px;
            color: rgba(255, 255, 255, .57);
            font-size: 11px;
            font-weight: 500;
            letter-spacing: .35px;
        }

        #pasaporteDomo .pasaporte-correo {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            max-width: 100%;
            margin-top: 19px;
            padding: 9px 12px;
            overflow-wrap: anywhere;
            color: #F5E9C3;
            font-size: 11px;
            font-weight: 600;
            border: 1px solid rgba(212, 175, 55, .20);
            border-radius: 9px;
            background: rgba(0, 0, 0, .15);
        }

        #pasaporteDomo .pasaporte-correo-icon {
            color: #D4AF37;
            font-size: 13px;
        }

        #pasaporteDomo .pasaporte-footer {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 14px;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid rgba(255, 255, 255, .10);
        }

        #pasaporteDomo .pasaporte-meta-label {
            display: block;
            margin-bottom: 5px;
            color: rgba(255, 255, 255, .43);
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 1.6px;
            text-transform: uppercase;
        }

        #pasaporteDomo .pasaporte-meta {
            color: #F1E8D0;
            font-size: 11px;
            font-weight: 600;
        }

        #pasaporteDomo .pasaporte-token {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 17px;
            color: #B5F0C7;
            font-size: 10px;
            font-weight: 650;
            line-height: 1.5;
        }

        #pasaporteDomo .pasaporte-token-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            color: #A8F0BD;
            font-size: 12px;
            border: 1px solid rgba(105, 220, 139, .35);
            border-radius: 50%;
            background: rgba(46, 160, 91, .12);
        }

        #pasaporteDomo .pasaporte-network {
            display: flex;
            align-items: center;
            gap: 7px;
            color: rgba(255, 255, 255, .57);
            font-size: 9px;
            font-weight: 700;
            letter-spacing: .8px;
            white-space: nowrap;
        }

        #pasaporteDomo .pasaporte-network-mark {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            color: #C3A0FF;
            font-size: 12px;
            border: 1px solid rgba(160, 120, 255, .3);
            border-radius: 7px;
            background: rgba(130, 90, 220, .12);
        }

        #pasaporteDomo .pasaporte-tx {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 39px;
            margin-top: 18px;
            padding: 0 15px;
            color: #172315 !important;
            font-size: 10px;
            font-weight: 850;
            letter-spacing: .5px;
            text-decoration: none !important;
            border: 1px solid #F0D47C;
            border-radius: 9px;
            background: linear-gradient(
                135deg,
                #F7E6A1,
                #D4AF37
            );
            box-shadow: 0 5px 16px rgba(212, 175, 55, .14);
            transition: all .25s ease;
        }

        #pasaporteDomo .pasaporte-tx:hover {
            color: #071B13 !important;
            transform: translateY(-2px);
            background: linear-gradient(
                135deg,
                #FFF0B9,
                #E7C34C
            );
            box-shadow: 0 8px 22px rgba(212, 175, 55, .25);
        }

        #pasaporteDomo .pasaporte-anim {
            animation: pasaporteAppear .65s cubic-bezier(.2, .8, .2, 1) both;
        }

        @keyframes pasaporteAppear {
            from {
                opacity: 0;
                transform: translateY(13px) scale(.985);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes pasaportePulse {
            0%, 100% {
                opacity: 1;
                box-shadow: 0 0 9px rgba(101, 230, 149, .8);
            }
            50% {
                opacity: .55;
                box-shadow: 0 0 3px rgba(101, 230, 149, .3);
            }
        }

        @media (max-width: 480px) {
            #pasaporteDomo {
                margin: 17px 0;
            }

            #pasaporteDomo .pasaporte-card {
                padding: 19px;
                border-radius: 17px;
                min-height: 0;
            }

            #pasaporteDomo .pasaporte-header {
                margin-bottom: 21px;
                gap: 7px;
            }

            #pasaporteDomo .pasaporte-brand {
                gap: 8px;
            }

            #pasaporteDomo .pasaporte-brand-symbol {
                width: 32px;
                height: 32px;
                font-size: 20px;
            }

            #pasaporteDomo .pasaporte-brand-name {
                font-size: 10px;
                letter-spacing: 1.8px;
            }

            #pasaporteDomo .pasaporte-brand-caption {
                font-size: 7px;
            }

            #pasaporteDomo .pasaporte-status {
                padding: 6px 8px;
                font-size: 8px;
                letter-spacing: .5px;
            }

            #pasaporteDomo .pasaporte-footer {
                align-items: flex-start;
                flex-direction: column;
                gap: 12px;
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
        style.id = 'csarielPasaportePremiumCSS';
        style.textContent = css;

        document.head.appendChild(style);
        estiloInstalado = true;
    }

    // ============================================================
    // ESPERAR A SUPABASE Y SESIÓN
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

                        if (user) {
                            return {
                                client: client,
                                user: user
                            };
                        }
                    }
                } catch (e) {
                    console.warn(
                        '[Pasaporte] Esperando sesión:',
                        e.message || e
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
    // CONSULTAR CREDENCIAL
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

            var contenedor = obtenerElemento('pasaporteDomo');

            if (!contenedor) return;

            if (res.data) {
                renderizarPasaporte(res.data, user);
            } else {
                contenedor.innerHTML = '';
            }

            suscribirPasaporte(client, user);

        } catch (e) {
            console.warn(
                '[Pasaporte] Error cargando credencial:',
                e
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
                        table: 'credenciales_digitales',
                        filter: 'usuario_id=eq.' + user.id
                    },
                    function (payload) {
                        if (
                            payload.new &&
                            payload.new.tipo === PASAPORTE_TIPO
                        ) {
                            renderizarPasaporte(payload.new, user);

                            toast(
                                'Tu Pasaporte Digital fue activado',
                                'success'
                            );
                        }
                    }
                )
                .subscribe();

        } catch (e) {
            console.warn(
                '[Pasaporte] No se pudo suscribir a Realtime:',
                e
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

        var correo = (
            user &&
            user.email
        )
            ? escapeHTML(user.email)
            : '';

        var txHash = cred.tx_hash
            ? String(cred.tx_hash).trim()
            : '';

        var txUrl = '';

        if (/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
            txUrl = 'https://polygonscan.com/tx/' +
                encodeURIComponent(txHash);
        }

        var html =
            '<div class="pasaporte-card pasaporte-anim">' +

                '<div class="pasaporte-header">' +

                    '<div class="pasaporte-brand">' +

                        '<div class="pasaporte-brand-symbol">◈</div>' +

                        '<div>' +
                            '<div class="pasaporte-brand-name">' +
                                'CSARIEL\'S' +
                            '</div>' +

                            '<span class="pasaporte-brand-caption">' +
                                'DIGITAL IDENTITY' +
                            '</span>' +
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

                '<div class="pasaporte-titulo">' +
                    'Pasaporte Digital' +
                '</div>' +

                '<div class="pasaporte-subtitulo">' +
                    'Tu identidad digital dentro del ecosistema Csariel\'s' +
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
                    'Credencial registrada y token enviado a tu wallet en Polygon' +
                '</div>' +

                '<div class="pasaporte-footer">' +

                    (
                        fecha
                            ? '<div>' +
                                '<span class="pasaporte-meta-label">' +
                                    'FECHA DE EMISIÓN' +
                                '</span>' +
                                '<div class="pasaporte-meta">' +
                                    escapeHTML(fecha) +
                                '</div>' +
                              '</div>'
                            : ''
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
            } catch (e) {
                console.warn(
                    '[Pasaporte] Error limpiando canal:',
                    e
                );
            }

            canalPasaporte = null;
        }
    }

    window.addEventListener(
        'beforeunload',
        detenerPasaporte
    );

    window.addEventListener(
        'pagehide',
        detenerPasaporte
    );

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================

    async function iniciar() {
        if (iniciado) return;

        iniciado = true;

        instalarEstilos();

        var ctx = await esperarListo();

        if (!ctx.client || !ctx.user || !ctx.user.id) {
            iniciado = false;
            return;
        }

        clienteActual = ctx.client;
        usuarioActual = ctx.user;

        await cargarPasaporte(
            ctx.client,
            ctx.user
        );
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

        await cargarPasaporte(
            clienteActual,
            usuarioActual
        );
    };

})();
