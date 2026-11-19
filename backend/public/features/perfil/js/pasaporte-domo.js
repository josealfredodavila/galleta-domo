
// ================================================================
// CSARIEL'S · PERFIL · PASAPORTE DIGITAL
// PREMIUM EXPERIENCE v4.0 · EMERALD GOLD WEB3
// ================================================================
//
// DISEÑO:
//   - Tarjeta institucional verde esmeralda y oro luminoso.
//   - Marco exterior metálico con iluminación dorada y verde.
//   - Circuitos digitales y geometría Web3.
//   - Esfera digital holográfica.
//   - Emblema institucional Csariel's.
//   - Sello de Miembro Fundador.
//   - Botón dorado de verificación PolygonScan.
//   - Adaptación completa para móviles.
//
// FUNCIONALIDAD:
//   - Estados: cargando, activo, sin credencial y error.
//   - Consulta credenciales_digitales.
//   - Escucha INSERT y UPDATE mediante Supabase Realtime.
//   - Usa window.supabaseClient y window.sessionUser.
//   - No depende de muro-utils.js.
//
// SEGURIDAD:
//   - El frontend NUNCA activa, emite ni modifica credenciales.
//   - La emisión permanece exclusivamente en backend / Edge Function.
//   - Supabase Auth y RLS controlan el acceso.
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
    // DISEÑO PREMIUM · EMERALD GOLD WEB3
    // ============================================================

    function instalarEstilos() {
        if (
            estiloInstalado ||
            document.getElementById('csarielPasaporteMaxiProCSS')
        ) {
            estiloInstalado = true;
            return;
        }

        var css = `

        /* ========================================================
           CSARIEL'S · EMERALD GOLD DIGITAL PASSPORT
        ======================================================== */

        #pasaporteDomo {
            width: 100%;
            box-sizing: border-box;
            margin: 26px 0;
            font-family: inherit;
            color: #FFFFFF;
        }

        #pasaporteDomo *,
        #pasaporteDomo *::before,
        #pasaporteDomo *::after {
            box-sizing: border-box;
        }

        /* ========================================================
           CONTENEDOR
        ======================================================== */

        #pasaporteDomo .pasaporte-shell {
            position: relative;
            width: 100%;
            padding: 5px;
            overflow: hidden;
            border-radius: 29px;
            background: linear-gradient(
                135deg,
                #FFF0A4,
                #D4AF37 24%,
                #39DFA0 48%,
                #D4AF37 74%,
                #FFF0A4
            );
            box-shadow:
                0 0 12px rgba(212,175,55,.65),
                0 0 35px rgba(101,230,149,.18),
                0 20px 55px rgba(0,0,0,.42);
        }

        #pasaporteDomo .pasaporte-shell::before {
            content: "";
            position: absolute;
            inset: 2px;
            border: 1px solid rgba(255,255,255,.65);
            border-radius: 26px;
            pointer-events: none;
            z-index: 5;
        }

        /* ========================================================
           TARJETA PRINCIPAL
        ======================================================== */

        #pasaporteDomo .pasaporte-card {
            --passport-green: #071B13;
            --passport-gold: #D4AF37;
            --passport-emerald: #39E6A0;

            position: relative;
            width: 100%;
            min-height: 470px;
            padding: 30px;
            overflow: hidden;
            isolation: isolate;
            color: #F8F7F0;
            border-radius: 24px;
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
                0 0 35px rgba(212,175,55,.14);
        }

        /* ========================================================
           CIRCUITOS Y GEOMETRÍA DIGITAL
        ======================================================== */

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
                    transparent 39px,
                    rgba(48,230,159,.08) 40px,
                    transparent 41px
                ),
                repeating-linear-gradient(
                    0deg,
                    transparent 0,
                    transparent 39px,
                    rgba(48,230,159,.055) 40px,
                    transparent 41px
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
            width: 3px;
            height: 100%;
            background: linear-gradient(
                180deg,
                transparent,
                #FFF0A4 15%,
                #D4AF37 50%,
                #39E6A0 80%,
                transparent
            );
            box-shadow: 0 0 15px rgba(212,175,55,.65);
        }

        #pasaporteDomo .pasaporte-glow {
            position: absolute;
            z-index: -1;
            top: -90px;
            left: -80px;
            width: 300px;
            height: 300px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                rgba(101,230,149,.20),
                transparent 68%
            );
            filter: blur(20px);
            pointer-events: none;
        }

        /* ========================================================
           ENCABEZADO
        ======================================================== */

        #pasaporteDomo .pasaporte-header {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-bottom: 26px;
        }

        #pasaporteDomo .pasaporte-brand {
            display: flex;
            align-items: center;
            gap: 13px;
            min-width: 0;
        }

        #pasaporteDomo .pasaporte-brand-symbol {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 52px;
            height: 52px;
            color: #FFF0A4;
            font-size: 31px;
            border: 1px solid #D4AF37;
            border-radius: 15px;
            background: linear-gradient(
                135deg,
                rgba(212,175,55,.23),
                rgba(212,175,55,.04)
            );
            box-shadow:
                0 0 18px rgba(212,175,55,.24),
                inset 0 1px 0 rgba(255,255,255,.2);
        }

        #pasaporteDomo .pasaporte-brand-name {
            color: #FFFFFF;
            font-size: 19px;
            font-weight: 950;
            letter-spacing: 2.8px;
            line-height: 1.3;
        }

        #pasaporteDomo .pasaporte-brand-caption {
            display: block;
            margin-top: 5px;
            color: rgba(255,255,255,.58);
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 3px;
        }

        /* ========================================================
           ESTADO ACTIVO
        ======================================================== */

        #pasaporteDomo .pasaporte-status {
            display: inline-flex;
            align-items: center;
            gap: 9px;
            flex-shrink: 0;
            padding: 10px 15px;
            color: #A8F0BD;
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 1.4px;
            border: 1px solid rgba(65,255,145,.65);
            border-radius: 30px;
            background: rgba(0,180,83,.15);
            box-shadow:
                0 0 18px rgba(0,255,120,.12),
                inset 0 0 12px rgba(0,255,120,.06);
        }

        #pasaporteDomo .pasaporte-status-dot {
            width: 9px;
            height: 9px;
            flex-shrink: 0;
            border-radius: 50%;
            background: #65FF9A;
            box-shadow: 0 0 12px #65FF9A;
            animation: pasaportePulse 2s infinite;
        }

        /* ========================================================
           DIVISOR
        ======================================================== */

        #pasaporteDomo .pasaporte-divider {
            width: 100%;
            height: 1px;
            margin-bottom: 25px;
            background: linear-gradient(
                90deg,
                #D4AF37,
                rgba(212,175,55,.35),
                rgba(57,230,160,.15),
                transparent
            );
            box-shadow: 0 0 8px rgba(212,175,55,.3);
        }

        /* ========================================================
           SELLO MIEMBRO FUNDADOR
        ======================================================== */

        #pasaporteDomo .pasaporte-sello {
            position: relative;
            z-index: 3;
            display: inline-flex;
            align-items: center;
            gap: 9px;
            margin-bottom: 15px;
            padding: 9px 17px;
            color: #171308;
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 1.7px;
            border: 1px solid #FFF0A4;
            border-radius: 7px;
            background: linear-gradient(
                135deg,
                #FFF0A4,
                #E4B92F 50%,
                #FFF0A4
            );
            box-shadow:
                0 0 15px rgba(212,175,55,.35),
                inset 0 1px 0 rgba(255,255,255,.8);
        }

        #pasaporteDomo .pasaporte-sello-icon {
            font-size: 16px;
        }

        /* ========================================================
           TÍTULO Y DESCRIPCIÓN
        ======================================================== */

        #pasaporteDomo .pasaporte-titulo {
            position: relative;
            z-index: 3;
            max-width: 470px;
            color: #FFFFFF;
            font-size: clamp(27px, 5.4vw, 39px);
            font-weight: 950;
            line-height: 1.12;
            letter-spacing: -1.2px;
            text-shadow: 0 3px 18px rgba(0,0,0,.4);
        }

        #pasaporteDomo .pasaporte-subtitulo {
            position: relative;
            z-index: 3;
            margin-top: 12px;
            max-width: 410px;
            color: rgba(255,255,255,.75);
            font-size: 13px;
            font-weight: 500;
            letter-spacing: .25px;
            line-height: 1.65;
        }

        /* ========================================================
           CORREO
        ======================================================== */

        #pasaporteDomo .pasaporte-correo {
            position: relative;
            z-index: 3;
            display: inline-flex;
            align-items: center;
            gap: 11px;
            max-width: 100%;
            margin-top: 22px;
            padding: 12px 16px;
            overflow-wrap: anywhere;
            color: #FFF1C0;
            font-size: 12px;
            font-weight: 750;
            border: 1px solid rgba(212,175,55,.8);
            border-radius: 12px;
            background: rgba(0,0,0,.28);
            box-shadow:
                0 0 14px rgba(212,175,55,.12),
                inset 0 1px 0 rgba(255,255,255,.06);
        }

        #pasaporteDomo .pasaporte-correo-icon {
            color: #FFD85D;
            font-size: 17px;
        }

        /* ========================================================
           VERIFICACIÓN DE CREDENCIAL
        ======================================================== */

        #pasaporteDomo .pasaporte-token {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-top: 20px;
            max-width: 440px;
            color: #B9F9D0;
            font-size: 11px;
            font-weight: 750;
            line-height: 1.6;
        }

        #pasaporteDomo .pasaporte-token-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 27px;
            height: 27px;
            flex-shrink: 0;
            color: #FFFFFF;
            font-size: 15px;
            border: 1px solid #55FF9B;
            border-radius: 50%;
            background: rgba(0,220,105,.18);
            box-shadow:
                0 0 14px rgba(65,255,145,.5),
                inset 0 0 8px rgba(65,255,145,.15);
        }

        /* ========================================================
           HASH
        ======================================================== */

        #pasaporteDomo .pasaporte-hash {
            position: relative;
            z-index: 3;
            display: inline-block;
            max-width: 100%;
            margin-top: 17px;
            padding: 11px 15px;
            color: #E6EBD8;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 10px;
            letter-spacing: .4px;
            overflow-wrap: anywhere;
            border: 1px solid rgba(212,175,55,.42);
            border-radius: 10px;
            background: rgba(0,0,0,.27);
        }

        /* ========================================================
           ARTE HOLOGRÁFICO WEB3
           ESFERA DIGITAL + EMBLEMA INSTITUCIONAL
        ======================================================== */

        #pasaporteDomo .pasaporte-art {
            position: absolute;
            z-index: 1;
            top: 115px;
            right: 18px;
            width: 245px;
            height: 290px;
            pointer-events: none;
            opacity: .95;
        }

        /* Esfera */

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

        /* Anillo orbital */

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

        /* Medallón institucional */

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

        /* Red de nodos */

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

        /* ========================================================
           PIE DE CREDENCIAL
        ======================================================== */

        #pasaporteDomo .pasaporte-footer {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 16px;
            margin-top: 26px;
            padding-top: 19px;
            border-top: 1px solid rgba(212,175,55,.35);
        }

        #pasaporteDomo .pasaporte-meta-label {
            display: block;
            margin-bottom: 7px;
            color: rgba(255,255,255,.57);
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 1.8px;
        }

        #pasaporteDomo .pasaporte-meta {
            color: #F7E6A1;
            font-size: 13px;
            font-weight: 850;
        }

        /* ========================================================
           POLYGON
        ======================================================== */

        #pasaporteDomo .pasaporte-network {
            display: flex;
            align-items: center;
            gap: 9px;
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 1.2px;
            white-space: nowrap;
        }

        #pasaporteDomo .pasaporte-network-mark {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            color: #C69AFF;
            font-size: 23px;
            border: 1px solid rgba(170,115,255,.5);
            border-radius: 9px;
            background: rgba(130,90,220,.15);
            box-shadow: 0 0 15px rgba(155,100,255,.22);
        }

        /* ========================================================
           BOTÓN POLYGONSCAN
        ======================================================== */

        #pasaporteDomo .pasaporte-tx {
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            min-height: 54px;
            margin-top: 22px;
            padding: 12px 18px;
            color: #172315 !important;
            font-size: 12px;
            font-weight: 950;
            letter-spacing: 1px;
            text-align: center;
            text-decoration: none !important;
            border: 2px solid #FFF0A4;
            border-radius: 12px;
            background: linear-gradient(
                135deg,
                #FFF2B9 0%,
                #EAC64F 48%,
                #C99A20 100%
            );
            box-shadow:
                0 0 14px rgba(212,175,55,.38),
                0 8px 25px rgba(0,0,0,.25),
                inset 0 1px 0 rgba(255,255,255,.8);
            transition:
                transform .25s ease,
                box-shadow .25s ease,
                filter .25s ease;
        }

        #pasaporteDomo .pasaporte-tx:hover {
            color: #071B13 !important;
            transform: translateY(-3px);
            filter: brightness(1.1);
            box-shadow:
                0 0 22px rgba(255,210,70,.58),
                0 10px 30px rgba(0,0,0,.3);
        }

        #pasaporteDomo .pasaporte-tx:focus-visible {
            outline: 3px solid #65E695;
            outline-offset: 4px;
        }

        /* ========================================================
           ESTADOS GENERALES
        ======================================================== */

        #pasaporteDomo .pasaporte-estado {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 270px;
            padding: 30px;
            color: rgba(255,255,255,.75);
            font-size: 12px;
            font-weight: 650;
            line-height: 1.6;
            text-align: center;
            border: 1px solid rgba(212,175,55,.4);
            border-radius: 22px;
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
            box-shadow: 0 15px 40px rgba(0,0,0,.25);
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
            width: 32px;
            height: 32px;
            margin-bottom: 16px;
            border: 3px solid rgba(212,175,55,.2);
            border-top-color: #D4AF37;
            border-right-color: #65E695;
            border-radius: 50%;
            animation: pasaporteSpin .8s linear infinite;
        }

        #pasaporteDomo .pasaporte-anim {
            animation: pasaporteAppear .65s cubic-bezier(.2,.8,.2,1) both;
        }

        /* ========================================================
           ANIMACIONES
        ======================================================== */

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
                box-shadow: 0 0 12px #65FF9A;
            }
            50% {
                opacity: .55;
                box-shadow: 0 0 4px rgba(101,255,154,.3);
            }
        }

        @keyframes pasaporteSpin {
            to {
                transform: rotate(360deg);
            }
        }

        /* ========================================================
           TABLET
        ======================================================== */

        @media (max-width: 700px) {

            #pasaporteDomo .pasaporte-card {
                padding: 24px;
            }

            #pasaporteDomo .pasaporte-art {
                right: -5px;
                opacity: .65;
                transform: scale(.85);
                transform-origin: top right;
            }

            #pasaporteDomo .pasaporte-subtitulo {
                max-width: 340px;
            }
        }

        /* ========================================================
           MÓVILES
        ======================================================== */

        @media (max-width: 520px) {

            #pasaporteDomo {
                margin: 19px 0;
            }

            #pasaporteDomo .pasaporte-shell {
                padding: 3px;
                border-radius: 22px;
            }

            #pasaporteDomo .pasaporte-card {
                min-height: 0;
                padding: 21px;
                border-radius: 19px;
            }

            #pasaporteDomo .pasaporte-header {
                gap: 8px;
                margin-bottom: 22px;
            }

            #pasaporteDomo .pasaporte-brand {
                gap: 9px;
            }

            #pasaporteDomo .pasaporte-brand-symbol {
                width: 38px;
                height: 38px;
                font-size: 23px;
                border-radius: 11px;
            }

            #pasaporteDomo .pasaporte-brand-name {
                font-size: 12px;
                letter-spacing: 2px;
            }

            #pasaporteDomo .pasaporte-brand-caption {
                font-size: 7px;
                letter-spacing: 1.7px;
            }

            #pasaporteDomo .pasaporte-status {
                padding: 7px 9px;
                font-size: 8px;
                letter-spacing: .5px;
            }

            #pasaporteDomo .pasaporte-status-dot {
                width: 7px;
                height: 7px;
            }

            #pasaporteDomo .pasaporte-divider {
                margin-bottom: 19px;
            }

            #pasaporteDomo .pasaporte-sello {
                padding: 7px 10px;
                font-size: 8px;
                letter-spacing: 1.1px;
            }

            #pasaporteDomo .pasaporte-titulo {
                font-size: clamp(25px, 7vw, 33px);
            }

            #pasaporteDomo .pasaporte-subtitulo {
                max-width: 100%;
                font-size: 11px;
            }

            #pasaporteDomo .pasaporte-correo {
                margin-top: 17px;
                padding: 10px 11px;
                font-size: 10px;
            }

            #pasaporteDomo .pasaporte-token {
                margin-top: 16px;
                font-size: 10px;
            }

            #pasaporteDomo .pasaporte-hash {
                font-size: 9px;
            }

            #pasaporteDomo .pasaporte-art {
                top: 165px;
                right: -55px;
                transform: scale(.65);
                opacity: .23;
            }

            #pasaporteDomo .pasaporte-footer {
                align-items: flex-start;
                flex-direction: column;
                gap: 15px;
                margin-top: 22px;
                padding-top: 16px;
            }

            #pasaporteDomo .pasaporte-meta {
                font-size: 12px;
            }

            #pasaporteDomo .pasaporte-network {
                font-size: 9px;
            }

            #pasaporteDomo .pasaporte-tx {
                min-height: 48px;
                margin-top: 18px;
                padding: 10px;
                font-size: 10px;
                letter-spacing: .5px;
            }

            #pasaporteDomo .pasaporte-estado {
                min-height: 230px;
                padding: 22px;
                border-radius: 19px;
            }
        }

        /* ========================================================
           ACCESIBILIDAD
        ======================================================== */

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
                    '<div style="font-size:30px; margin-bottom:13px; color:#F7E6A1;">◈</div>' +
                    '<div style="color:#F7E6A1; font-weight:900; letter-spacing:1.5px; font-size:11px; margin-bottom:9px;">' +
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

                            renderizarPasaporte(
                                payload.new,
                                user
                            );

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

                            renderizarPasaporte(
                                payload.new,
                                user
                            );

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

        var correo = user && user.email
            ? escapeHTML(user.email)
            : '';

        var txHash = cred.tx_hash
            ? String(cred.tx_hash).trim()
            : '';

        var txUrl = construirUrlPolygon(txHash);

        var hashVisible = txHash
            ? escapeHTML(acortarHash(txHash))
            : '';

        var html =

            '<div class="pasaporte-shell pasaporte-anim">' +

                '<div class="pasaporte-card">' +

                    '<div class="pasaporte-glow"></div>' +

                    // ENCABEZADO

                    '<div class="pasaporte-header">' +

                        '<div class="pasaporte-brand">' +

                            '<div class="pasaporte-brand-symbol">◈</div>' +

                            '<div>' +
                                '<div class="pasaporte-brand-name">CSARIEL\\'S</div>' +
                                '<span class="pasaporte-brand-caption">DIGITAL IDENTITY</span>' +
                            '</div>' +

                        '</div>' +

                        '<div class="pasaporte-status">' +
                            '<span class="pasaporte-status-dot"></span>' +
                            'ACTIVO' +
                        '</div>' +

                    '</div>' +

                    '<div class="pasaporte-divider"></div>' +

                    // SELLO

                    '<div class="pasaporte-sello">' +
                        '<span class="pasaporte-sello-icon">✦</span>' +
                        'MIEMBRO FUNDADOR' +
                    '</div>' +

                    // TÍTULO

                    '<div class="pasaporte-titulo">Pasaporte Digital</div>' +

                    '<div class="pasaporte-subtitulo">' +
                        'Tu identidad digital verificada dentro del ecosistema Csariel\\'s.' +
                    '</div>' +

                    // CORREO

                    (
                        correo
                            ? '<div class="pasaporte-correo">' +
                                '<span class="pasaporte-correo-icon">✉</span>' +
                                correo +
                              '</div>'
                            : ''
                    ) +

                    // VERIFICACIÓN

                    '<div class="pasaporte-token">' +
                        '<span class="pasaporte-token-icon">✓</span>' +
                        '<span>Credencial registrada y token enviado a tu wallet en Polygon.</span>' +
                    '</div>' +

                    // HASH

                    (
                        hashVisible
                            ? '<div class="pasaporte-hash">TX · ' +
                                hashVisible +
                              '</div>'
                            : ''
                    ) +

                    // ARTE HOLOGRÁFICO

                    '<div class="pasaporte-art" aria-hidden="true">' +

                        '<div class="pasaporte-globe"></div>' +

                        '<div class="pasaporte-orbit"></div>' +

                        '<div class="pasaporte-medallon">' +

                            '<div class="pasaporte-medallon-inner">' +
                                '<div class="pasaporte-medallon-symbol">◈</div>' +
                            '</div>' +

                            '<div class="pasaporte-medallon-name">CSARIEL\\'S</div>' +

                        '</div>' +

                        '<div class="pasaporte-nodes"></div>' +

                    '</div>' +

                    // PIE

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

                    // VERIFICACIÓN BLOCKCHAIN

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

            renderizarError(
                'No pudimos validar tu sesión.'
            );

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
