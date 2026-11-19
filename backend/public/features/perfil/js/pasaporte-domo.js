// ================================================================
// CSARIEL'S · PERFIL · PASAPORTE DIGITAL
// PREMIUM EXPERIENCE v4.3 · EMERALD GOLD WEB3 (COMPACT + QR)
// ================================================================

(function () {
    'use strict';

    var PASAPORTE_TIPO = 'pasaporte_domo';
    var TABLA_CREDENCIALES = 'credenciales_digitales';

    var REINTENTOS_MAX = 80;
    var INTERVALO_REINTENTO = 250;

    // Pon en false cuando ya tengas la credencial real en Supabase y no quieras vista previa de prueba
    var PERMITIR_VISTA_PRUEBA_SI_VACIO = true;
    var HASH_PRUEBA_VISUAL = '0x1111111111111111111111111111111111111111111111111111111111111111';

    var canalPasaporte = null;
    var iniciado = false;
    var estiloInstalado = false;

    var usuarioActual = null;
    var clienteActual = null;
    var credencialActual = null;

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

    function construirCredencialPrueba(user) {
        return {
            id: 'preview-pasaporte-domo',
            usuario_id: user && user.id ? user.id : '',
            tipo: PASAPORTE_TIPO,
            estado: 'activo',
            emitida_en: new Date().toISOString(),
            tx_hash: HASH_PRUEBA_VISUAL,
            _esVistaPrevia: true
        };
    }

    function obtenerDatoQR(cred, user) {
        var uid = user && user.id ? String(user.id) : 'sin-usuario';
        var correo = user && user.email ? String(user.email) : '';
        var tx = cred && cred.tx_hash ? String(cred.tx_hash).trim() : '';
        var payload = {
            app: 'csariels',
            tipo: cred && cred.tipo ? cred.tipo : PASAPORTE_TIPO,
            credencial_id: cred && cred.id ? String(cred.id) : '',
            usuario_id: uid,
            correo: correo,
            tx_hash: tx
        };
        return JSON.stringify(payload);
    }

    function renderizarQR(cred, user) {
        var qrBox = obtenerElemento('pasaporteQrCanvas');
        if (!qrBox) return;

        var textoQR = obtenerDatoQR(cred, user);
        qrBox.innerHTML = '';

        if (typeof window.QRCode !== 'undefined' && typeof window.QRCode.toCanvas === 'function') {
            var canvas = document.createElement('canvas');
            qrBox.appendChild(canvas);
            window.QRCode.toCanvas(
                canvas,
                textoQR,
                {
                    width: 68,
                    margin: 1,
                    color: {
                        dark: '#071B13',
                        light: '#FFFDF2'
                    }
                },
                function (err) {
                    if (err) {
                        qrBox.innerHTML = '<div class="pasaporte-qr-fallback">QR WEB3</div>';
                    }
                }
            );
        } else {
            qrBox.innerHTML = '<div class="pasaporte-qr-fallback">QR WEB3</div>';
        }
    }

    function instalarEstilos() {
        if (
            estiloInstalado ||
            document.getElementById('csarielPasaporteMaxiProCSS')
        ) {
            estiloInstalado = true;
            return;
        }

        var css = `
        #pasaporteDomo {
            width: 100%;
            max-width: 280px;
            margin: 12px auto;
            box-sizing: border-box;
            font-family: inherit;
            color: #FFFFFF;
        }

        #pasaporteDomo *,
        #pasaporteDomo *::before,
        #pasaporteDomo *::after {
            box-sizing: border-box;
        }

        #pasaporteDomo .pasaporte-shell {
            position: relative;
            width: 100%;
            padding: 2.5px;
            overflow: hidden;
            border-radius: 15px;
            background: linear-gradient(
                135deg,
                #FFF0A4,
                #D4AF37 24%,
                #39DFA0 48%,
                #D4AF37 74%,
                #FFF0A4
            );
            box-shadow:
                0 0 7px rgba(212,175,55,.5),
                0 0 16px rgba(101,230,149,.12),
                0 8px 20px rgba(0,0,0,.35);
        }

        #pasaporteDomo .pasaporte-shell::before {
            content: "";
            position: absolute;
            inset: 1px;
            border: 1px solid rgba(255,255,255,.45);
            border-radius: 14px;
            pointer-events: none;
            z-index: 5;
        }

        #pasaporteDomo .pasaporte-card {
            --passport-green: #071B13;
            --passport-gold: #D4AF37;
            --passport-emerald: #39E6A0;

            position: relative;
            width: 100%;
            min-height: 165px;
            padding: 12px;
            overflow: hidden;
            isolation: isolate;
            color: #F8F7F0;
            border-radius: 12.5px;
            background:
                radial-gradient(
                    ellipse 75% 65% at 95% 40%,
                    rgba(0,255,160,.14),
                    transparent 65%
                ),
                radial-gradient(
                    ellipse 80% 55% at 0% 100%,
                    rgba(26,140,82,.28),
                    transparent 65%
                ),
                radial-gradient(
                    ellipse 65% 45% at 50% 0%,
                    rgba(212,175,55,.13),
                    transparent 65%
                ),
                linear-gradient(
                    135deg,
                    #123D2A 0%,
                    #071B13 48%,
                    #06180F 100%
                );
            box-shadow:
                inset 0 1px 0 rgba(255,255,255,.15),
                inset 0 -1px 0 rgba(212,175,55,.25);
        }

        #pasaporteDomo .pasaporte-card::before {
            content: "";
            position: absolute;
            z-index: -1;
            inset: 0;
            opacity: .28;
            pointer-events: none;
            background:
                repeating-linear-gradient(
                    90deg,
                    transparent 0,
                    transparent 23px,
                    rgba(48,230,159,.08) 24px,
                    transparent 25px
                ),
                repeating-linear-gradient(
                    0deg,
                    transparent 0,
                    transparent 23px,
                    rgba(48,230,159,.055) 24px,
                    transparent 25px
                );
        }

        #pasaporteDomo .pasaporte-card::after {
            content: "";
            position: absolute;
            z-index: -1;
            top: 0;
            left: 0;
            width: 2px;
            height: 100%;
            background: linear-gradient(
                180deg,
                transparent,
                #FFF0A4 15%,
                #D4AF37 50%,
                #39E6A0 80%,
                transparent
            );
        }

        #pasaporteDomo .pasaporte-glow {
            position: absolute;
            z-index: -1;
            top: -40px;
            left: -35px;
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                rgba(101,230,149,.18),
                transparent 68%
            );
            filter: blur(12px);
            pointer-events: none;
        }

        #pasaporteDomo .pasaporte-header {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            margin-bottom: 9px;
        }

        #pasaporteDomo .pasaporte-brand {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }

        #pasaporteDomo .pasaporte-brand-symbol {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            color: #FFF0A4;
            font-size: 13px;
            border: 1px solid #D4AF37;
            border-radius: 7px;
            background: linear-gradient(
                135deg,
                rgba(212,175,55,.23),
                rgba(212,175,55,.04)
            );
        }

        #pasaporteDomo .pasaporte-brand-name {
            color: #FFFFFF;
            font-size: 9.5px;
            font-weight: 950;
            letter-spacing: 1.4px;
            line-height: 1.15;
        }

        #pasaporteDomo .pasaporte-brand-caption {
            display: block;
            margin-top: 1.5px;
            color: rgba(255,255,255,.58);
            font-size: 5.5px;
            font-weight: 800;
            letter-spacing: 1.4px;
        }

        #pasaporteDomo .pasaporte-status {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
            padding: 3.5px 6.5px;
            color: #A8F0BD;
            font-size: 6.5px;
            font-weight: 950;
            letter-spacing: .7px;
            border: 1px solid rgba(65,255,145,.65);
            border-radius: 16px;
            background: rgba(0,180,83,.15);
        }

        #pasaporteDomo .pasaporte-status-dot {
            width: 5px;
            height: 5px;
            flex-shrink: 0;
            border-radius: 50%;
            background: #65FF9A;
            box-shadow: 0 0 6px #65FF9A;
            animation: pasaportePulse 2s infinite;
        }

        #pasaporteDomo .pasaporte-divider {
            width: 100%;
            height: 1px;
            margin-bottom: 9px;
            background: linear-gradient(
                90deg,
                #D4AF37,
                rgba(212,175,55,.35),
                rgba(57,230,160,.15),
                transparent
            );
        }

        #pasaporteDomo .pasaporte-body-grid {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
        }

        #pasaporteDomo .pasaporte-main-col {
            flex: 1;
            min-width: 0;
        }

        #pasaporteDomo .pasaporte-sello {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 6px;
            padding: 3px 7px;
            color: #171308;
            font-size: 6.5px;
            font-weight: 950;
            letter-spacing: .9px;
            border: 1px solid #FFF0A4;
            border-radius: 4px;
            background: linear-gradient(
                135deg,
                #FFF0A4,
                #E4B92F 50%,
                #FFF0A4
            );
        }

        #pasaporteDomo .pasaporte-sello-icon {
            font-size: 8px;
        }

        #pasaporteDomo .pasaporte-titulo {
            color: #FFFFFF;
            font-size: 14px;
            font-weight: 950;
            line-height: 1.15;
            letter-spacing: -.3px;
        }

        #pasaporteDomo .pasaporte-subtitulo {
            margin-top: 4px;
            color: rgba(255,255,255,.74);
            font-size: 8px;
            font-weight: 500;
            line-height: 1.35;
        }

        #pasaporteDomo .pasaporte-correo {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            max-width: 100%;
            margin-top: 7px;
            padding: 4px 7px;
            overflow-wrap: anywhere;
            color: #FFF1C0;
            font-size: 7.5px;
            font-weight: 750;
            border: 1px solid rgba(212,175,55,.7);
            border-radius: 6px;
            background: rgba(0,0,0,.28);
        }

        #pasaporteDomo .pasaporte-correo-icon {
            color: #FFD85D;
            font-size: 9px;
        }

        #pasaporteDomo .pasaporte-token {
            display: flex;
            align-items: flex-start;
            gap: 5px;
            margin-top: 7px;
            color: #B9F9D0;
            font-size: 7.5px;
            font-weight: 750;
            line-height: 1.3;
        }

        #pasaporteDomo .pasaporte-token-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 13px;
            height: 13px;
            flex-shrink: 0;
            color: #FFFFFF;
            font-size: 7.5px;
            border: 1px solid #55FF9B;
            border-radius: 50%;
            background: rgba(0,220,105,.18);
        }

        #pasaporteDomo .pasaporte-hash {
            display: inline-block;
            max-width: 100%;
            margin-top: 6px;
            padding: 3.5px 6px;
            color: #E6EBD8;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 7px;
            overflow-wrap: anywhere;
            border: 1px solid rgba(212,175,55,.4);
            border-radius: 5px;
            background: rgba(0,0,0,.27);
        }

        /* ========================================================
           QR DE ACCESO / VERIFICACIÓN
        ======================================================== */

        #pasaporteDomo .pasaporte-qr-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 78px;
            padding: 5px;
            border: 1px solid rgba(255,240,164,.75);
            border-radius: 9px;
            background: rgba(255,253,242,.95);
            box-shadow: 0 0 12px rgba(212,175,55,.28);
        }

        #pasaporteDomo .pasaporte-qr-canvas {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 68px;
            height: 68px;
        }

        #pasaporteDomo .pasaporte-qr-canvas canvas {
            display: block;
            width: 68px !important;
            height: 68px !important;
            border-radius: 4px;
        }

        #pasaporteDomo .pasaporte-qr-fallback {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 68px;
            height: 68px;
            color: #071B13;
            font-size: 8px;
            font-weight: 950;
            letter-spacing: .6px;
            border: 1px dashed #071B13;
            border-radius: 4px;
        }

        #pasaporteDomo .pasaporte-qr-caption {
            margin-top: 3px;
            color: #071B13;
            font-size: 5.5px;
            font-weight: 900;
            letter-spacing: .8px;
            text-transform: uppercase;
        }

        #pasaporteDomo .pasaporte-art {
            position: absolute;
            z-index: 1;
            top: 44px;
            right: -24px;
            width: 110px;
            height: 120px;
            pointer-events: none;
            opacity: .26;
            transform: scale(.38);
            transform-origin: top right;
        }

        #pasaporteDomo .pasaporte-globe {
            position: absolute;
            top: 0;
            right: 0;
            width: 210px;
            height: 210px;
            border: 1px solid rgba(77,255,190,.8);
            border-radius: 50%;
            background: radial-gradient(circle at 40% 40%, #087C51, #031E19 75%);
        }

        #pasaporteDomo .pasaporte-medallon {
            position: absolute;
            top: 112px;
            right: 19px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 158px;
            height: 158px;
            border: 4px double #D4AF37;
            border-radius: 50%;
            background: radial-gradient(circle, #17462D 0%, #071B13 68%, #030D08 100%);
        }

        #pasaporteDomo .pasaporte-medallon-symbol {
            color: #FFE58A;
            font-size: 62px;
            font-weight: 900;
        }

        #pasaporteDomo .pasaporte-footer {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            margin-top: 9px;
            padding-top: 8px;
            border-top: 1px solid rgba(212,175,55,.35);
        }

        #pasaporteDomo .pasaporte-meta-label {
            display: block;
            margin-bottom: 1.5px;
            color: rgba(255,255,255,.57);
            font-size: 5.5px;
            font-weight: 900;
            letter-spacing: .9px;
        }

        #pasaporteDomo .pasaporte-meta {
            color: #F7E6A1;
            font-size: 7.5px;
            font-weight: 850;
        }

        #pasaporteDomo .pasaporte-network {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #FFFFFF;
            font-size: 6.5px;
            font-weight: 950;
            letter-spacing: .6px;
            white-space: nowrap;
        }

        #pasaporteDomo .pasaporte-network-mark {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            color: #C69AFF;
            font-size: 10px;
            border: 1px solid rgba(170,115,255,.5);
            border-radius: 5px;
            background: rgba(130,90,220,.15);
        }

        #pasaporteDomo .pasaporte-tx {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            width: 100%;
            min-height: 26px;
            margin-top: 8px;
            padding: 4px 8px;
            color: #172315 !important;
            font-size: 7.5px;
            font-weight: 950;
            letter-spacing: .6px;
            text-align: center;
            text-decoration: none !important;
            border: 1.5px solid #FFF0A4;
            border-radius: 6px;
            background: linear-gradient(
                135deg,
                #FFF2B9 0%,
                #EAC64F 48%,
                #C99A20 100%
            );
            transition: transform .2s ease, filter .2s ease;
        }

        #pasaporteDomo .pasaporte-tx:hover {
            color: #071B13 !important;
            transform: translateY(-1px);
            filter: brightness(1.08);
        }

        #pasaporteDomo .pasaporte-estado {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 105px;
            padding: 12px;
            color: rgba(255,255,255,.75);
            font-size: 9px;
            font-weight: 650;
            line-height: 1.45;
            text-align: center;
            border: 1px solid rgba(212,175,55,.4);
            border-radius: 13px;
            background: linear-gradient(135deg, #123D2A, #071B13);
        }

        #pasaporteDomo .pasaporte-estado-error {
            color: #FFC7C7;
            border-color: rgba(255,120,120,.4);
            background: linear-gradient(135deg, #301919, #100909);
        }

        #pasaporteDomo .pasaporte-spinner {
            width: 18px;
            height: 18px;
            margin-bottom: 8px;
            border: 2px solid rgba(212,175,55,.2);
            border-top-color: #D4AF37;
            border-right-color: #65E695;
            border-radius: 50%;
            animation: pasaporteSpin .8s linear infinite;
        }

        #pasaporteDomo .pasaporte-anim {
            animation: pasaporteAppear .45s cubic-bezier(.2,.8,.2,1) both;
        }

        @keyframes pasaporteAppear {
            from { opacity: 0; transform: translateY(8px) scale(.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pasaportePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
        }

        @keyframes pasaporteSpin {
            to { transform: rotate(360deg); }
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

    async function esperarListo() {
        var client = null;
        var user = null;

        for (var i = 0; i < REINTENTOS_MAX; i++) {
            client = window.supabaseClient;

            if (client) {
                try {
                    var resultado = await client.auth.getSession();
                    if (resultado && resultado.data && resultado.data.session) {
                        user = resultado.data.session.user;
                        if (user && user.id) {
                            return { client: client, user: user };
                        }
                    }
                } catch (error) {
                    console.warn('[Pasaporte] Esperando sesión:', error && error.message ? error.message : error);
                }
            }

            if (window.sessionUser && window.supabaseClient) {
                user = window.sessionUser;
                if (user && user.id) {
                    return { client: window.supabaseClient, user: user };
                }
            }

            await esperar(INTERVALO_REINTENTO);
        }

        return { client: client, user: user };
    }

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
                    '<div style="font-size:15px; margin-bottom:4px;">⚠️</div>' +
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
                    '<div style="font-size:16px; margin-bottom:5px; color:#F7E6A1;">◈</div>' +
                    '<div style="color:#F7E6A1; font-weight:900; letter-spacing:1px; font-size:8px; margin-bottom:3px;">PASAPORTE DIGITAL</div>' +
                    '<div>Aún no tienes una credencial activa en este ecosistema.</div>' +
                '</div>' +
            '</div>';
    }

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
                if (PERMITIR_VISTA_PRUEBA_SI_VACIO) {
                    var credPrueba = construirCredencialPrueba(user);
                    credencialActual = credPrueba;
                    renderizarPasaporte(credPrueba, user);
                } else {
                    credencialActual = null;
                    renderizarSinCredencial();
                }
            } else {
                credencialActual = res.data;
                renderizarPasaporte(res.data, user);
            }

            suscribirPasaporte(client, user);
        } catch (error) {
            console.warn('[Pasaporte] Error cargando credencial:', error);
            if (PERMITIR_VISTA_PRUEBA_SI_VACIO) {
                var credFallback = construirCredencialPrueba(user);
                credencialActual = credFallback;
                renderizarPasaporte(credFallback, user);
                suscribirPasaporte(client, user);
            } else {
                renderizarError('No pudimos verificar tu credencial. Intenta recargar la página.');
            }
        }
    }

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
                        if (payload.new && payload.new.tipo === PASAPORTE_TIPO) {
                            credencialActual = payload.new;
                            renderizarPasaporte(payload.new, user);
                            toast('Tu Pasaporte Digital fue activado', 'success');
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
                        if (payload.new && payload.new.tipo === PASAPORTE_TIPO) {
                            credencialActual = payload.new;
                            renderizarPasaporte(payload.new, user);
                            toast('Tu Pasaporte Digital fue actualizado', 'success');
                        }
                    }
                )
                .subscribe();
        } catch (error) {
            console.warn('[Pasaporte] No se pudo suscribir a Realtime:', error);
        }
    }

    function renderizarPasaporte(cred, user) {
        var contenedor = obtenerElemento('pasaporteDomo');
        if (!contenedor || !cred) return;

        instalarEstilos();

        var fecha = formatearFecha(cred.emitida_en);
        var correo = user && user.email ? escapeHTML(user.email) : '';
        var txHash = cred.tx_hash ? String(cred.tx_hash).trim() : '';
        var txUrl = construirUrlPolygon(txHash);
        var hashVisible = txHash ? escapeHTML(acortarHash(txHash)) : '';
        var estadoTexto = cred.estado ? escapeHTML(String(cred.estado).toUpperCase()) : 'ACTIVO';

        var html =
            '<div class="pasaporte-shell pasaporte-anim">' +
                '<div class="pasaporte-card">' +
                    '<div class="pasaporte-glow"></div>' +
                    '<div class="pasaporte-header">' +
                        '<div class="pasaporte-brand">' +
                            '<div class="pasaporte-brand-symbol">◈</div>' +
                            '<div>' +
                                '<div class="pasaporte-brand-name">CSARIEL&#39;S</div>' +
                                '<span class="pasaporte-brand-caption">DIGITAL IDENTITY</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="pasaporte-status">' +
                            '<span class="pasaporte-status-dot"></span>' +
                            estadoTexto +
                        '</div>' +
                    '</div>' +
                    '<div class="pasaporte-divider"></div>' +
                    '<div class="pasaporte-body-grid">' +
                        '<div class="pasaporte-main-col">' +
                            '<div class="pasaporte-sello">' +
                                '<span class="pasaporte-sello-icon">✦</span>' +
                                'MIEMBRO VERIFICADO' +
                            '</div>' +
                            '<div class="pasaporte-titulo">Pasaporte Digital</div>' +
                            '<div class="pasaporte-subtitulo">' +
                                'Identidad verificada en Csariel&#39;s.' +
                            '</div>' +
                            (
                                correo
                                    ? '<div class="pasaporte-correo">' +
                                        '<span class="pasaporte-correo-icon">✉</span>' +
                                        correo +
                                      '</div>'
                                    : ''
                            ) +
                            '<div class="pasaporte-token">' +
                                '<span class="pasaporte-token-icon">✓</span>' +
                                '<span>Token en wallet Polygon.</span>' +
                            '</div>' +
                            (
                                hashVisible
                                    ? '<div class="pasaporte-hash">TX · ' + hashVisible + '</div>'
                                    : ''
                            ) +
                        '</div>' +
                        '<div class="pasaporte-qr-box" aria-label="Código QR de pasaporte">' +
                            '<div id="pasaporteQrCanvas" class="pasaporte-qr-canvas"></div>' +
                            '<div class="pasaporte-qr-caption">ACCESO QR</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="pasaporte-art" aria-hidden="true">' +
                        '<div class="pasaporte-globe"></div>' +
                        '<div class="pasaporte-medallon">' +
                            '<div class="pasaporte-medallon-symbol">◈</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="pasaporte-footer">' +
                        (
                            fecha
                                ? '<div>' +
                                    '<span class="pasaporte-meta-label">EMISIÓN</span>' +
                                    '<div class="pasaporte-meta">' + escapeHTML(fecha) + '</div>' +
                                  '</div>'
                                : '<div></div>'
                        ) +
                        '<div class="pasaporte-network">' +
                            '<span class="pasaporte-network-mark">⬡</span>' +
                            'POLYGON' +
                        '</div>' +
                    '</div>' +
                    (
                        txUrl
                            ? '<a class="pasaporte-tx"' +
                                ' href="' + escapeHTML(txUrl) + '"' +
                                ' target="_blank"' +
                                ' rel="noopener noreferrer">' +
                                'VERIFICAR TX' +
                                '<span>↗</span>' +
                              '</a>'
                            : ''
                    ) +
                '</div>' +
            '</div>';

        contenedor.innerHTML = html;
        renderizarQR(cred, user);
    }

    function detenerPasaporte() {
        if (canalPasaporte && clienteActual) {
            try {
                clienteActual.removeChannel(canalPasaporte);
            } catch (error) {
                console.warn('[Pasaporte] Error limpiando canal:', error);
            }
            canalPasaporte = null;
        }
    }

    window.addEventListener('beforeunload', detenerPasaporte);
    window.addEventListener('pagehide', detenerPasaporte);

    async function iniciar() {
        if (iniciado) return;
        iniciado = true;

        instalarEstilos();
        renderizarCargando();

        var ctx = await esperarListo();

        if (!ctx.client || !ctx.user || !ctx.user.id) {
            iniciado = false;
            if (PERMITIR_VISTA_PRUEBA_SI_VACIO) {
                renderizarPasaporte(construirCredencialPrueba({ email: '' }), { email: '' });
            } else {
                renderizarError('No pudimos validar tu sesión.');
            }
            return;
        }

        clienteActual = ctx.client;
        usuarioActual = ctx.user;

        await cargarPasaporte(ctx.client, ctx.user);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar, { once: true });
    } else {
        iniciar();
    }

    window.iniciarPasaporteDomo = iniciar;

    window.recargarPasaporteDomo = async function () {
        if (!clienteActual || !usuarioActual) {
            iniciado = false;
            return iniciar();
        }
        await cargarPasaporte(clienteActual, usuarioActual);
    };
})();
