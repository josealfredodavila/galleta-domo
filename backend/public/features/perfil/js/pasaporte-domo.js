// ================================================================
// CSARIEL'S · PERFIL · PASAPORTE DIGITAL
// PREMIUM EXPERIENCE v4.2 · EMERALD GOLD WEB3 (COMPACT 1/4)
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
            max-width: 340px;
            margin: 14px auto;
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
            padding: 3px;
            overflow: hidden;
            border-radius: 18px;
            background: linear-gradient(
                135deg,
                #FFF0A4,
                #D4AF37 24%,
                #39DFA0 48%,
                #D4AF37 74%,
                #FFF0A4
            );
            box-shadow:
                0 0 8px rgba(212,175,55,.55),
                0 0 20px rgba(101,230,149,.14),
                0 10px 26px rgba(0,0,0,.38);
        }

        #pasaporteDomo .pasaporte-shell::before {
            content: "";
            position: absolute;
            inset: 1.5px;
            border: 1px solid rgba(255,255,255,.55);
            border-radius: 16.5px;
            pointer-events: none;
            z-index: 5;
        }

        #pasaporteDomo .pasaporte-card {
            --passport-green: #071B13;
            --passport-gold: #D4AF37;
            --passport-emerald: #39E6A0;

            position: relative;
            width: 100%;
            min-height: 210px;
            padding: 15px;
            overflow: hidden;
            isolation: isolate;
            color: #F8F7F0;
            border-radius: 15px;
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
            transition:
                transform .35s ease,
                box-shadow .35s ease;
        }

        #pasaporteDomo .pasaporte-card:hover {
            box-shadow:
                inset 0 1px 0 rgba(255,255,255,.2),
                0 0 24px rgba(212,175,55,.14);
        }

        #pasaporteDomo .pasaporte-card::before {
            content: "";
            position: absolute;
            z-index: -1;
            inset: 0;
            opacity: .34;
            pointer-events: none;
            background:
                repeating-linear-gradient(
                    90deg,
                    transparent 0,
                    transparent 27px,
                    rgba(48,230,159,.08) 28px,
                    transparent 29px
                ),
                repeating-linear-gradient(
                    0deg,
                    transparent 0,
                    transparent 27px,
                    rgba(48,230,159,.055) 28px,
                    transparent 29px
                );
            mask-image: linear-gradient(
                90deg,
                transparent,
                #000 30%,
                #000 100%
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
            box-shadow: 0 0 10px rgba(212,175,55,.6);
        }

        #pasaporteDomo .pasaporte-glow {
            position: absolute;
            z-index: -1;
            top: -50px;
            left: -45px;
            width: 160px;
            height: 160px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                rgba(101,230,149,.20),
                transparent 68%
            );
            filter: blur(14px);
            pointer-events: none;
        }

        #pasaporteDomo .pasaporte-header {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 12px;
        }

        #pasaporteDomo .pasaporte-brand {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        #pasaporteDomo .pasaporte-brand-symbol {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 30px;
            height: 30px;
            color: #FFF0A4;
            font-size: 17px;
            border: 1px solid #D4AF37;
            border-radius: 9px;
            background: linear-gradient(
                135deg,
                rgba(212,175,55,.23),
                rgba(212,175,55,.04)
            );
            box-shadow:
                0 0 10px rgba(212,175,55,.22),
                inset 0 1px 0 rgba(255,255,255,.2);
        }

        #pasaporteDomo .pasaporte-brand-name {
            color: #FFFFFF;
            font-size: 11px;
            font-weight: 950;
            letter-spacing: 1.8px;
            line-height: 1.2;
        }

        #pasaporteDomo .pasaporte-brand-caption {
            display: block;
            margin-top: 2px;
            color: rgba(255,255,255,.58);
            font-size: 6.5px;
            font-weight: 800;
            letter-spacing: 1.8px;
        }

        #pasaporteDomo .pasaporte-status {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            flex-shrink: 0;
            padding: 5px 8px;
            color: #A8F0BD;
            font-size: 7.5px;
            font-weight: 950;
            letter-spacing: .9px;
            border: 1px solid rgba(65,255,145,.65);
            border-radius: 20px;
            background: rgba(0,180,83,.15);
            box-shadow:
                0 0 10px rgba(0,255,120,.12),
                inset 0 0 8px rgba(0,255,120,.06);
        }

        #pasaporteDomo .pasaporte-status-dot {
            width: 6px;
            height: 6px;
            flex-shrink: 0;
            border-radius: 50%;
            background: #65FF9A;
            box-shadow: 0 0 8px #65FF9A;
            animation: pasaportePulse 2s infinite;
        }

        #pasaporteDomo .pasaporte-divider {
            width: 100%;
            height: 1px;
            margin-bottom: 12px;
            background: linear-gradient(
                90deg,
                #D4AF37,
                rgba(212,175,55,.35),
                rgba(57,230,160,.15),
                transparent
            );
            box-shadow: 0 0 6px rgba(212,175,55,.25);
        }

        #pasaporteDomo .pasaporte-sello {
            position: relative;
            z-index: 3;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin-bottom: 8px;
            padding: 4px 9px;
            color: #171308;
            font-size: 7.5px;
            font-weight: 950;
            letter-spacing: 1.1px;
            border: 1px solid #FFF0A4;
            border-radius: 5px;
            background: linear-gradient(
                135deg,
                #FFF0A4,
                #E4B92F 50%,
                #FFF0A4
            );
            box-shadow:
                0 0 10px rgba(212,175,55,.3),
                inset 0 1px 0 rgba(255,255,255,.8);
        }

        #pasaporteDomo .pasaporte-sello-icon {
            font-size: 10px;
        }

        #pasaporteDomo .pasaporte-titulo {
            position: relative;
            z-index: 3;
            max-width: 220px;
            color: #FFFFFF;
            font-size: 17px;
            font-weight: 950;
            line-height: 1.15;
            letter-spacing: -.5px;
            text-shadow: 0 2px 10px rgba(0,0,0,.4);
        }

        #pasaporteDomo .pasaporte-subtitulo {
            position: relative;
            z-index: 3;
            margin-top: 6px;
            max-width: 210px;
            color: rgba(255,255,255,.75);
            font-size: 9.5px;
            font-weight: 500;
            letter-spacing: .15px;
            line-height: 1.45;
        }

        #pasaporteDomo .pasaporte-correo {
            position: relative;
            z-index: 3;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
            margin-top: 10px;
            padding: 6px 9px;
            overflow-wrap: anywhere;
            color: #FFF1C0;
            font-size: 9px;
            font-weight: 750;
            border: 1px solid rgba(212,175,55,.75);
            border-radius: 8px;
            background: rgba(0,0,0,.28);
        }

        #pasaporteDomo .pasaporte-correo-icon {
            color: #FFD85D;
            font-size: 11px;
        }

        #pasaporteDomo .pasaporte-token {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: flex-start;
            gap: 7px;
            margin-top: 9px;
            max-width: 215px;
            color: #B9F9D0;
            font-size: 8.5px;
            font-weight: 750;
            line-height: 1.4;
        }

        #pasaporteDomo .pasaporte-token-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            color: #FFFFFF;
            font-size: 9px;
            border: 1px solid #55FF9B;
            border-radius: 50%;
            background: rgba(0,220,105,.18);
            box-shadow: 0 0 8px rgba(65,255,145,.45);
        }

        #pasaporteDomo .pasaporte-hash {
            position: relative;
            z-index: 3;
            display: inline-block;
            max-width: 100%;
            margin-top: 8px;
            padding: 5px 8px;
            color: #E6EBD8;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 8px;
            letter-spacing: .2px;
            overflow-wrap: anywhere;
            border: 1px solid rgba(212,175,55,.42);
            border-radius: 7px;
            background: rgba(0,0,0,.27);
        }

        #pasaporteDomo .pasaporte-art {
            position: absolute;
            z-index: 1;
            top: 56px;
            right: -12px;
            width: 130px;
            height: 155px;
            pointer-events: none;
            opacity: .75;
            transform: scale(.52);
            transform-origin: top right;
        }

        #pasaporteDomo .pasaporte-globe {
            position: absolute;
            top: 0;
            right: 0;
            width: 210px;
            height: 210px;
            overflow: hidden;
            border: 1px solid rgba(77,255,190,.8);
            border-radius: 50%;
            background:
                radial-gradient(
                    circle at 32% 27%,
                    rgba(255,255,255,.8),
                    transparent 3%
                ),
                radial-gradient(
                    circle at 38% 35%,
                    rgba(35,255,170,.42),
                    transparent 48%
                ),
                radial-gradient(
                    circle at 70% 70%,
                    rgba(0,80,80,.9),
                    transparent 55%
                ),
                radial-gradient(
                    circle at 40% 40%,
                    #087C51,
                    #031E19 75%
                );
            box-shadow:
                0 0 18px rgba(0,255,160,.4),
                0 0 50px rgba(0,255,160,.18),
                inset -15px -10px 30px rgba(0,0,0,.65),
                inset 8px 5px 25px rgba(65,255,180,.3);
        }

        #pasaporteDomo .pasaporte-globe::before {
            content: "";
            position: absolute;
            inset: 9px;
            border: 1px solid rgba(104,255,190,.48);
            border-radius: 50%;
            background:
                repeating-linear-gradient(
                    0deg,
                    transparent 0,
                    transparent 23px,
                    rgba(85,255,185,.3) 24px,
                    transparent 25px
                ),
                repeating-linear-gradient(
                    90deg,
                    transparent 0,
                    transparent 23px,
                    rgba(85,255,185,.25) 24px,
                    transparent 25px
                );
            box-shadow: inset 0 0 20px rgba(0,255,160,.22);
        }

        #pasaporteDomo .pasaporte-globe::after {
            content: "";
            position: absolute;
            inset: 24px 42px;
            border: 1px solid rgba(130,255,195,.55);
            border-radius: 50%;
            transform: rotate(25deg);
            box-shadow:
                0 0 0 15px rgba(0,255,150,.06),
                0 0 0 30px rgba(0,255,150,.04);
        }

        #pasaporteDomo .pasaporte-orbit {
            position: absolute;
            top: 30px;
            right: -10px;
            width: 230px;
            height: 155px;
            border: 1px solid rgba(212,175,55,.48);
            border-radius: 50%;
            transform: rotate(-30deg);
            box-shadow: 0 0 12px rgba(212,175,55,.16);
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
            background:
                radial-gradient(
                    circle,
                    #17462D 0%,
                    #071B13 68%,
                    #030D08 100%
                );
            box-shadow:
                0 0 0 5px rgba(212,175,55,.12),
                0 0 0 9px rgba(212,175,55,.35),
                0 0 28px rgba(212,175,55,.38),
                inset 0 0 25px rgba(212,175,55,.22);
        }

        #pasaporteDomo .pasaporte-medallon-inner {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 116px;
            height: 116px;
            border: 1px solid rgba(247,230,161,.65);
            border-radius: 50%;
            background:
                radial-gradient(
                    circle,
                    rgba(212,175,55,.15),
                    transparent 70%
                );
        }

        #pasaporteDomo .pasaporte-medallon-symbol {
            color: #FFE58A;
            font-size: 62px;
            font-weight: 900;
            text-shadow:
                0 0 10px rgba(255,215,80,.8),
                0 0 25px rgba(212,175,55,.55);
        }

        #pasaporteDomo .pasaporte-medallon-name {
            position: absolute;
            bottom: -12px;
            left: 50%;
            padding: 8px 17px;
            color: #171308;
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 1.5px;
            white-space: nowrap;
            border: 1px solid #FFF0A4;
            border-radius: 5px;
            background: linear-gradient(
                135deg,
                #FFF0A4,
                #D4AF37,
                #FFF0A4
            );
            box-shadow: 0 0 15px rgba(212,175,55,.4);
            transform: translateX(-50%);
        }

        #pasaporteDomo .pasaporte-nodes {
            position: absolute;
            right: 0;
            bottom: 0;
            width: 225px;
            height: 100px;
            opacity: .65;
            background-image:
                radial-gradient(
                    circle,
                    #45FFB3 1.5px,
                    transparent 2px
                );
            background-size: 27px 25px;
            mask-image: linear-gradient(
                135deg,
                transparent,
                #000
            );
        }

        #pasaporteDomo .pasaporte-footer {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid rgba(212,175,55,.35);
        }

        #pasaporteDomo .pasaporte-meta-label {
            display: block;
            margin-bottom: 2px;
            color: rgba(255,255,255,.57);
            font-size: 6.5px;
            font-weight: 900;
            letter-spacing: 1.1px;
        }

        #pasaporteDomo .pasaporte-meta {
            color: #F7E6A1;
            font-size: 9px;
            font-weight: 850;
        }

        #pasaporteDomo .pasaporte-network {
            display: flex;
            align-items: center;
            gap: 5px;
            color: #FFFFFF;
            font-size: 7.5px;
            font-weight: 950;
            letter-spacing: .8px;
            white-space: nowrap;
        }

        #pasaporteDomo .pasaporte-network-mark {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            color: #C69AFF;
            font-size: 13px;
            border: 1px solid rgba(170,115,255,.5);
            border-radius: 6px;
            background: rgba(130,90,220,.15);
        }

        #pasaporteDomo .pasaporte-tx {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            min-height: 32px;
            margin-top: 11px;
            padding: 6px 10px;
            color: #172315 !important;
            font-size: 8.5px;
            font-weight: 950;
            letter-spacing: .7px;
            text-align: center;
            text-decoration: none !important;
            border: 1.5px solid #FFF0A4;
            border-radius: 8px;
            background: linear-gradient(
                135deg,
                #FFF2B9 0%,
                #EAC64F 48%,
                #C99A20 100%
            );
            box-shadow:
                0 0 10px rgba(212,175,55,.32),
                0 4px 12px rgba(0,0,0,.22),
                inset 0 1px 0 rgba(255,255,255,.8);
            transition:
                transform .25s ease,
                box-shadow .25s ease,
                filter .25s ease;
        }

        #pasaporteDomo .pasaporte-tx:hover {
            color: #071B13 !important;
            transform: translateY(-2px);
            filter: brightness(1.1);
        }

        #pasaporteDomo .pasaporte-tx:focus-visible {
            outline: 2px solid #65E695;
            outline-offset: 2px;
        }

        #pasaporteDomo .pasaporte-estado {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 130px;
            padding: 16px;
            color: rgba(255,255,255,.75);
            font-size: 10px;
            font-weight: 650;
            line-height: 1.5;
            text-align: center;
            border: 1px solid rgba(212,175,55,.4);
            border-radius: 16px;
            background:
                radial-gradient(
                    ellipse at 50% 0%,
                    rgba(212,175,55,.13),
                    transparent 65%
                ),
                linear-gradient(
                    135deg,
                    #123D2A,
                    #071B13
                );
            box-shadow: 0 10px 24px rgba(0,0,0,.25);
        }

        #pasaporteDomo .pasaporte-estado-error {
            color: #FFC7C7;
            border-color: rgba(255,120,120,.4);
            background: linear-gradient(
                135deg,
                #301919,
                #100909
            );
        }

        #pasaporteDomo .pasaporte-spinner {
            width: 22px;
            height: 22px;
            margin-bottom: 10px;
            border: 2.5px solid rgba(212,175,55,.2);
            border-top-color: #D4AF37;
            border-right-color: #65E695;
            border-radius: 50%;
            animation: pasaporteSpin .8s linear infinite;
        }

        #pasaporteDomo .pasaporte-anim {
            animation: pasaporteAppear .5s cubic-bezier(.2,.8,.2,1) both;
        }

        @keyframes pasaporteAppear {
            from {
                opacity: 0;
                transform: translateY(10px) scale(.985);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes pasaportePulse {
            0%, 100% {
                opacity: 1;
                box-shadow: 0 0 8px #65FF9A;
            }
            50% {
                opacity: .55;
                box-shadow: 0 0 3px rgba(101,255,154,.3);
            }
        }

        @keyframes pasaporteSpin {
            to {
                transform: rotate(360deg);
            }
        }

        @media (max-width: 520px) {
            #pasaporteDomo {
                max-width: 310px;
                margin: 12px auto;
            }

            #pasaporteDomo .pasaporte-card {
                padding: 13px;
            }

            #pasaporteDomo .pasaporte-art {
                top: 52px;
                right: -18px;
                transform: scale(.46);
                opacity: .55;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #pasaporteDomo *,
            #pasaporteDomo *::before,
            #pasaporteDomo *::after {
                animation-duration: .01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: .01ms !important;
                scroll-behavior: auto !important;
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
                    if (
                        resultado &&
                        resultado.data &&
                        resultado.data.session
                    ) {
                        user = resultado.data.session.user;
                        if (user && user.id) {
                            return { client: client, user: user };
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
                    '<div style="font-size:18px; margin-bottom:6px;">⚠️</div>' +
                    '<div>' +
                        escapeHTML(
                            mensaje ||
                            'No pudimos cargar tu Pasaporte Digital.'
                        ) +
                    '</div>' +
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
                    '<div style="font-size:20px; margin-bottom:8px; color:#F7E6A1;">◈</div>' +
                    '<div style="color:#F7E6A1; font-weight:900; letter-spacing:1.2px; font-size:9px; margin-bottom:5px;">' +
                        'PASAPORTE DIGITAL' +
                    '</div>' +
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
                renderizarError(
                    'No pudimos verificar tu credencial. Intenta recargar la página.'
                );
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
                    '<div class="pasaporte-sello">' +
                        '<span class="pasaporte-sello-icon">✦</span>' +
                        'MIEMBRO VERIFICADO' +
                    '</div>' +
                    '<div class="pasaporte-titulo">Pasaporte Digital</div>' +
                    '<div class="pasaporte-subtitulo">' +
                        'Tu identidad digital verificada dentro del ecosistema Csariel&#39;s.' +
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
                        '<span>Credencial registrada y token enviado a tu wallet en Polygon.</span>' +
                    '</div>' +
                    (
                        hashVisible
                            ? '<div class="pasaporte-hash">TX · ' +
                                hashVisible +
                              '</div>'
                            : ''
                    ) +
                    '<div class="pasaporte-art" aria-hidden="true">' +
                        '<div class="pasaporte-globe"></div>' +
                        '<div class="pasaporte-orbit"></div>' +
                        '<div class="pasaporte-medallon">' +
                            '<div class="pasaporte-medallon-inner">' +
                                '<div class="pasaporte-medallon-symbol">◈</div>' +
                            '</div>' +
                            '<div class="pasaporte-medallon-name">CSARIEL&#39;S</div>' +
                        '</div>' +
                        '<div class="pasaporte-nodes"></div>' +
                    '</div>' +
                    '<div class="pasaporte-footer">' +
                        (
                            fecha
                                ? '<div>' +
                                    '<span class="pasaporte-meta-label">FECHA DE EMISIÓN</span>' +
                                    '<div class="pasaporte-meta">' +
                                        escapeHTML(fecha) +
                                    '</div>' +
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
