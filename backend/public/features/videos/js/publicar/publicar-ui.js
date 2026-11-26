/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · INTERFAZ COMÚN (v1)
   ================================================================
   Segundo módulo de la división de videos-publicar.js.
   - Toast propio (.cs-toast) y confirmación (.cs-confirm-*).
   - Marca de agua (escudo con la "C") sobre los videos.
   - Estilos inyectados del compositor (una sola vez).
   - Botones ♪ y ◆ del header.
   Los botones llaman a NS.sheets al hacer clic, porque las hojas se
   cargan después de este archivo.
   Expuesto en NS.ui y en window.csToast / window.csConfirm (contrato).
   Requiere: publicar-base.js.
   ================================================================ */

(function () {
    'use strict';

    var NS = window.VideosPublicarNS;
    if (!NS || !NS.C || !NS.u || !NS.state) {
        console.error('[VideosPublicar] publicar-ui.js requiere publicar-base.js.');
        return;
    }
    if (NS.ui) return;

    var C = NS.C;
    var U = NS.u;
    var Z = C.Z;
    var $ = U.$;
    var esc = U.esc;
    var vt = U.vt;

    /* ----------------------------------------------------------------
       TOAST PROPIO
       ---------------------------------------------------------------- */

    function csToast(mensaje, tipo, duracion) {
        var t = document.createElement('div');
        t.className = 'cs-toast cs-toast-' + (tipo || 'info');
        var iconos = { info: '◈', success: '✓', warning: '⚠', error: '✕' };
        t.innerHTML = '<span class="cs-toast-ico">' + (iconos[tipo] || iconos.info) +
            '</span><span class="cs-toast-txt">' + esc(mensaje) + '</span>';
        t.style.setProperty('z-index', String(Z.TOAST), 'important');
        document.body.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 400);
        }, duracion || 3200);
    }

    /* ----------------------------------------------------------------
       CONFIRMACIÓN (devuelve una promesa true / false)
       ---------------------------------------------------------------- */

    function csConfirm(opts) {
        return new Promise(function (resolve) {
            var o = opts || {};
            var overlay = document.createElement('div');
            overlay.className = 'cs-confirm-overlay';
            overlay.style.setProperty('z-index', String(Z.CONFIRM), 'important');
            overlay.innerHTML =
                '<div class="cs-confirm-modal" role="dialog" aria-modal="true">' +
                    '<div class="cs-confirm-ico">' + (o.peligroso ? '⚠' : '◈') + '</div>' +
                    '<div class="cs-confirm-titulo">' + esc(o.titulo || 'Confirmar') + '</div>' +
                    '<div class="cs-confirm-mensaje">' + esc(o.mensaje || '') + '</div>' +
                    '<div class="cs-confirm-acciones">' +
                        '<button type="button" class="cs-confirm-btn cs-confirm-cancel" data-res="0">' +
                            esc(o.textoCancelar || vt('cfg_cancelar', 'Cancelar')) + '</button>' +
                        '<button type="button" class="cs-confirm-btn ' +
                            (o.peligroso ? 'cs-confirm-danger' : 'cs-confirm-ok') + '" data-res="1">' +
                            esc(o.textoOk || 'Aceptar') + '</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(overlay);
            requestAnimationFrame(function () { overlay.classList.add('show'); });

            function cerrar(res) {
                overlay.classList.remove('show');
                setTimeout(function () { overlay.remove(); }, 250);
                document.removeEventListener('keydown', onKey);
                resolve(res);
            }

            function onKey(e) {
                if (e.key === 'Escape') cerrar(false);
            }

            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) return cerrar(false);
                var btn = e.target.closest('[data-res]');
                if (!btn) return;
                cerrar(btn.dataset.res === '1');
            });

            document.addEventListener('keydown', onKey);
        });
    }

    /* Contrato global: lo usan videos-cola.js, videos-camara.js y los demás módulos. */
    window.csToast = csToast;
    window.csConfirm = csConfirm;

    /* ----------------------------------------------------------------
       MARCA DE AGUA (escudo con la "C")
       ---------------------------------------------------------------- */

    function marcaHTML() {
        return '<span class="cs-marca" aria-hidden="true" style="opacity:' + C.MARCA_AGUA.OPACIDAD + '">' +
            '<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="2" y="2" width="56" height="76" rx="8" fill="none" stroke="#D4AF37" stroke-width="3"/>' +
            '<text x="30" y="58" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="50" fill="#D4AF37">C</text>' +
            '</svg></span>';
    }

    /* Agrega la marca a un contenedor si todavía no la tiene. */
    function asegurarMarca(contenedor) {
        if (!C.MARCA_AGUA.ACTIVA || !contenedor) return;
        if (contenedor.querySelector(':scope > .cs-marca')) return;
        contenedor.insertAdjacentHTML('beforeend', marcaHTML());
    }

    /* Pone la marca en cada miniatura del feed, incluidas las nuevas. */
    function iniciarMarcaFeed() {
        if (!C.MARCA_AGUA.ACTIVA) return;
        var cont = $('videosContainer');
        if (!cont) return;

        function aplicar() {
            cont.querySelectorAll('.video-card .thumbnail').forEach(asegurarMarca);
        }

        aplicar();
        new MutationObserver(aplicar).observe(cont, { childList: true });
    }

    /* ----------------------------------------------------------------
       ESTILOS DEL FEED (oculta controles antiguos según FEED_UI)
       ---------------------------------------------------------------- */

    function inyectarEstilosFeed() {
        if ($('cs-feed-ui')) return;
        var ocultar = [];
        if (C.FEED_UI.ocultarLikes) ocultar.push('.video-card .like-btn');
        if (C.FEED_UI.ocultarCompartir) ocultar.push('.video-card .btn-compartir-premium');
        if (C.FEED_UI.ocultarReacciones) ocultar.push('.video-card .reaccion-picker');

        var st = document.createElement('style');
        st.id = 'cs-feed-ui';
        st.textContent = ocultar.length ? ocultar.join(',') + ' { display: none !important; }' : '';
        document.head.appendChild(st);
    }

    /* ----------------------------------------------------------------
       ESTILOS DEL COMPOSITOR (una sola inyección)
       Componentes que no están en videos-publicar.css: pestañas, filas de
       sonidos y ubicaciones, estados de reproducción, vista previa modal,
       borradores y marca de agua.
       ---------------------------------------------------------------- */

    function inyectarEstilosExtra() {
        if ($('cs-videos-publicar-inline')) return;
        var st = document.createElement('style');
        st.id = 'cs-videos-publicar-inline';
        st.textContent = `
            .cs-sheet-backdrop { z-index: ${Z.SHEET_BACKDROP} !important; touch-action: manipulation; }
            .cs-sheet { z-index: ${Z.SHEET} !important; touch-action: manipulation; }
            .cs-confirm-overlay { z-index: ${Z.CONFIRM} !important; }
            .cs-toast { z-index: ${Z.TOAST} !important; }

            .cs-sheet button, .cs-sheet [role="button"], .cs-sheet .cs-sonido-item,
            .cs-sheet .cs-ubicacion-item, .cs-sheet .cs-tab {
                pointer-events: auto !important;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
            }

            /* Botones del header con sonido o ubicación elegidos */
            .cs-btn-header.cs-activo { background: rgba(212, 175, 55, 0.12); border-color: #D4AF37; }
            .cs-btn-ubicacion.cs-activo { background: rgba(0, 229, 255, 0.10); border-color: #00E5FF; }

            @keyframes cs-spin-inline { to { transform: rotate(360deg); } }

            /* ---- Marca de agua (escudo con la "C") ---- */
            .cs-marca {
                position: absolute; top: 12px; left: 12px; z-index: 7;
                width: 56px; height: 75px; pointer-events: none;
                filter: drop-shadow(0 2px 6px rgba(0,0,0,.65));
            }
            .cs-marca svg { width: 100%; height: 100%; display: block; }
            .cs-prev-stage .cs-marca { top: 70px; left: 14px; width: 60px; height: 80px; }
            .cs-preview-video .cs-marca { top: 12px; left: 12px; width: 48px; height: 64px; }
            @media (max-width: 480px) { .cs-marca { width: 56px; height: 75px; } }

            /* ---- Vista previa del video dentro de la publicación ---- */
            .cs-preview-video {
                position: relative; width: 100%; height: min(78vh, 720px);
                background: #000; border-radius: 14px; overflow: hidden;
                box-shadow: 0 0 18px rgba(255,43,214,.18);
                aspect-ratio: 9 / 16;
            }
            #csPreviewVideo {
                position: absolute; inset: 0; width: 100%; height: 100%;
                object-fit: cover; background: #000; display: block; z-index: 1;
            }
            #csPreviewPortada {
                position: absolute; inset: 0; width: 100%; height: 100%;
                object-fit: cover; background: #000; display: none; z-index: 2; pointer-events: none;
            }
            #csPreviewBadge {
                position: absolute; top: 12px; left: 12px; z-index: 3;
                background: linear-gradient(90deg,#ff2bd6,#00f0ff) !important; color: #05020a !important;
                font-weight: 800; box-shadow: 0 0 14px rgba(255,43,214,.6);
                padding: 5px 10px; border-radius: 999px; font-size: .7rem;
                animation: cs-badge-latido 1.6s ease-in-out infinite;
            }
            @keyframes cs-badge-latido { 0%,100% { box-shadow: 0 0 10px rgba(255,43,214,.5); } 50% { box-shadow: 0 0 22px rgba(0,240,255,.8); } }

            #csQuitarVideo {
                position: absolute; top: 10px; right: 10px; z-index: 4;
                width: 36px; height: 36px; border-radius: 50%;
                display: none; align-items: center; justify-content: center;
                background: rgba(0,0,0,.65); border: 1px solid rgba(255,51,102,.7);
                color: #ff3366; font-size: 1rem; cursor: pointer; padding: 0;
            }
            #csQuitarVideo:active { transform: scale(.92); }

            /* ---- Vista previa a pantalla completa ---- */
            .cs-prev-modal { position: fixed; inset: 0; z-index: ${Z.PREVIEW}; background: #000; display: none; flex-direction: column; color: #fff; }
            .cs-prev-modal.show { display: flex; }
            .cs-prev-top { position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; padding: max(12px, env(safe-area-inset-top)) 14px 10px; background: linear-gradient(to bottom, rgba(0,0,0,.6), transparent); }
            .cs-prev-titulo { font-size: .8rem; font-weight: 700; color: #00f0ff; text-shadow: 0 0 8px rgba(0,240,255,.5); }
            .cs-prev-spacer { width: 38px; }
            .cs-prev-close { background: rgba(0,0,0,.45); border: none; color: #fff; width: 38px; height: 38px; border-radius: 50%; font-size: 1rem; cursor: pointer; }
            .cs-prev-stage { position: relative; flex: 1; min-height: 0; background: #000; }
            #csPrevVideo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #000; }
            .cs-prev-sonido { position: absolute; left: 12px; bottom: 14px; z-index: 4; font-size: .78rem; background: rgba(0,0,0,.45); padding: 6px 12px; border-radius: 999px; color: #00f0ff; max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .cs-prev-acciones { display: flex; gap: 10px; padding: 12px 14px max(16px, env(safe-area-inset-bottom)); background: #000; }
            .cs-prev-acciones button { flex: 1; padding: 14px; border-radius: 14px; font-weight: 700; cursor: pointer; }

            /* ---- Sheets de sonidos y ubicación: encabezado fijo y lista con scroll ---- */
            .cs-sheet .cs-sheet-body {
                flex: 1; min-height: 0; overflow: hidden;
                display: flex; flex-direction: column;
                padding: 0 14px;
            }
            .cs-sheet-fijo {
                flex-shrink: 0;
                padding: 12px 0 6px;
                background: #0b1410;
                position: relative; z-index: 2;
            }
            .cs-sonidos-lista, .cs-ubicaciones-lista {
                flex: 1; min-height: 0;
                overflow-y: auto; overscroll-behavior: contain;
                -webkit-overflow-scrolling: touch;
                padding-bottom: 12px;
            }

            /* ---- Pestañas de sonidos ---- */
            .cs-tabs { display: flex; gap: 4px; padding: 10px 14px 0; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
            .cs-tab {
                flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                padding: 8px 10px; background: transparent; border: none;
                border-bottom: 2px solid transparent; color: #9fb4c8;
                font-size: .72rem; font-weight: 700; cursor: pointer;
                transition: color .2s ease, border-color .2s ease;
            }
            .cs-tab.active { color: #fff; border-bottom-color: #ff2bd6; text-shadow: 0 0 10px rgba(255,43,214,.6); }
            .cs-tab-count {
                display: none; align-items: center; justify-content: center;
                min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
                background: rgba(255,43,214,.2); color: #ff2bd6; font-size: .6rem; font-weight: 800;
            }

            /* ---- Biblioteca de sonidos ---- */
            .cs-sonido-item {
                display: flex; align-items: center; gap: 12px;
                padding: 10px 4px;
                border-bottom: 1px solid rgba(255,255,255,.05);
                cursor: pointer; position: relative;
                transition: background .2s ease, transform .15s ease;
                animation: cs-fila-in .28s ease both;
                animation-delay: calc(var(--i, 0) * 18ms);
                outline: none;
            }
            .cs-sonido-item:hover { background: rgba(255,255,255,.025); }
            .cs-sonido-item:focus-visible { box-shadow: inset 0 0 0 1px #00f0ff; }
            .cs-sonido-item:active { transform: scale(.985); }
            .cs-sonido-item.activo { background: linear-gradient(90deg, rgba(255,43,214,.10), rgba(0,240,255,.06)); }
            @keyframes cs-fila-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

            .cs-sonido-art {
                position: relative; width: 46px; height: 46px; flex: 0 0 46px;
                border-radius: 12px; overflow: hidden;
                display: grid; place-items: center;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 4px 12px rgba(0,0,0,.4);
                cursor: pointer;
            }
            .cs-sonido-glyph {
                font-size: 1rem; color: rgba(255,255,255,.88);
                text-shadow: 0 0 10px rgba(255,255,255,.35);
                transition: opacity .2s ease;
            }
            .cs-sonido-play-ico {
                position: absolute; font-size: .9rem; color: #fff; opacity: 0;
                text-shadow: 0 0 8px rgba(0,0,0,.7);
                transition: opacity .2s ease;
            }
            .cs-sonido-art:hover .cs-sonido-play-ico { opacity: 1; }
            .cs-sonido-art:hover .cs-sonido-glyph { opacity: 0; }

            .cs-eq {
                position: absolute; inset: 0; display: none;
                align-items: flex-end; justify-content: center; gap: 3px;
                padding-bottom: 9px; background: rgba(0,0,0,.38);
                pointer-events: none;
            }
            .cs-eq-bar {
                width: 3px; height: 5px; border-radius: 3px;
                background: var(--eq-c, #ff2bd6);
                box-shadow: 0 0 6px var(--eq-c, #ff2bd6);
            }
            /* Modo analizador: la altura la fija el audio en tiempo real */
            .cs-eq.cs-eq-live .cs-eq-bar { animation: none; transition: height .08s linear, opacity .08s linear; }
            /* Modo respaldo: animación CSS cuando el navegador no da analizador */
            .cs-eq:not(.cs-eq-live) .cs-eq-bar { animation: cs-eq-bounce .8s ease-in-out infinite; }
            .cs-eq-bar:nth-child(2) { animation-delay: .12s !important; }
            .cs-eq-bar:nth-child(3) { animation-delay: .24s !important; }
            .cs-eq-bar:nth-child(4) { animation-delay: .36s !important; }
            .cs-eq-bar:nth-child(5) { animation-delay: .48s !important; }
            .cs-eq-bar:nth-child(6) { animation-delay: .6s !important; }
            @keyframes cs-eq-bounce { 0%,100% { height: 5px; } 50% { height: 22px; } }

            .cs-sonido-info { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
            .cs-sonido-nombre {
                color: #fff; font-weight: 700; font-size: .86rem; letter-spacing: .2px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cs-sonido-artista {
                color: #9fb4c8; font-size: .7rem;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cs-sonido-genero { color: #c9b6ff; }

            .cs-fav-btn {
                flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%;
                border: 1px solid rgba(255,255,255,.12); background: transparent;
                color: #8fa1b3; font-size: 1rem; cursor: pointer;
                display: grid; place-items: center; padding: 0;
                transition: color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .15s ease;
            }
            .cs-fav-btn:active { transform: scale(.88); }
            .cs-fav-btn.on {
                color: #ff2bd6; border-color: rgba(255,43,214,.6);
                text-shadow: 0 0 8px #ff2bd6;
                box-shadow: 0 0 12px rgba(255,43,214,.35);
                animation: cs-fav-pop .3s ease;
            }
            @keyframes cs-fav-pop { 0% { transform: scale(.8); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }

            .cs-sonido-check { color: #ff2bd6; text-shadow: 0 0 8px #ff2bd6; opacity: 0; font-size: .85rem; flex-shrink: 0; }
            .cs-sonido-item.activo .cs-sonido-check { opacity: 1; }

            /* Estados de reproducción por fila */
            .cs-sonido-item.cs-sonando { background: linear-gradient(90deg, rgba(255,43,214,.14), rgba(0,240,255,.10)); }
            .cs-sonido-item.cs-sonando .cs-sonido-art {
                box-shadow: 0 0 0 2px #00f0ff, 0 0 18px rgba(255,43,214,.55);
            }
            .cs-sonido-item.cs-sonando .cs-sonido-glyph,
            .cs-sonido-item.cs-sonando .cs-sonido-play-ico { display: none; }
            .cs-sonido-item.cs-sonando .cs-eq { display: flex; }
            .cs-sonido-item.cs-sonando .cs-sonido-nombre {
                background: linear-gradient(90deg,#ff2bd6,#00f0ff,#39ff14);
                -webkit-background-clip: text; background-clip: text; color: transparent;
            }
            .cs-sonido-item.cs-cargando .cs-sonido-glyph { opacity: 0; }
            .cs-sonido-item.cs-cargando .cs-sonido-play-ico {
                opacity: 1; color: #00f0ff; text-shadow: 0 0 8px #00f0ff;
                animation: cs-spin-inline .8s linear infinite;
            }
            .cs-sonido-item.cs-pausado .cs-sonido-glyph { opacity: 0; }
            .cs-sonido-item.cs-pausado .cs-sonido-play-ico { opacity: 1; color: #ffe600; text-shadow: 0 0 8px #ffe600; }
            .cs-sonido-item.cs-error .cs-sonido-glyph { opacity: 0; }
            .cs-sonido-item.cs-error .cs-sonido-play-ico { opacity: 1; color: #ff3d7f; text-shadow: 0 0 8px #ff3d7f; }

            .cs-vacio-favs { text-align: center; padding: 34px 18px; color: #9fb4c8; }
            .cs-vacio-favs .cs-vacio-ico { display: block; font-size: 2rem; color: #ff2bd6; text-shadow: 0 0 10px #ff2bd6; margin-bottom: 10px; }
            .cs-vacio-favs p { font-size: .8rem; line-height: 1.5; margin: 0; }

            /* ---- Barra inferior del sheet de sonidos ---- */
            .cs-footer-sonido { align-items: center; gap: 12px; }
            .cs-footer-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
            .cs-sonido-actual {
                color: #00f0ff; text-shadow: 0 0 8px rgba(0,240,255,.4);
                font-size: .76rem; font-weight: 600;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cs-sonido-meta { display: flex; align-items: center; gap: 8px; }
            .cs-sonido-tiempo {
                font-size: .66rem; color: #9fb4c8;
                font-variant-numeric: tabular-nums; white-space: nowrap;
            }
            .cs-sonido-prog {
                flex: 1; height: 3px; border-radius: 3px;
                background: rgba(255,255,255,.12); overflow: hidden;
            }
            .cs-sonido-prog > span {
                display: block; height: 100%; width: 0%;
                background: linear-gradient(90deg,#ff2bd6,#00f0ff);
                transition: width .25s linear;
            }
            .cs-footer-sonido .cs-btn-primary { flex-shrink: 0; }

            /* ---- Ubicaciones ---- */
            .cs-ubicacion-item { display: flex; align-items: center; gap: 12px; padding: 12px 4px; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,.05); cursor: pointer; text-align: left; color: var(--text-primary); }
            .cs-ubicacion-item:hover { background: rgba(255,255,255,.025); }
            .cs-ubicacion-item.activo { background: rgba(0,229,255,.06); }
            .cs-ubicacion-ico { font-size: .8rem; color: var(--cyan); }
            .cs-ubicacion-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
            .cs-ubicacion-nombre { color: var(--text-primary); font-weight: 600; font-size: .85rem; }
            .cs-ubicacion-pais { color: var(--text-muted); font-size: .7rem; }
            .cs-ubicacion-check { color: var(--cyan); font-size: .9rem; opacity: 0; }
            .cs-ubicacion-item.activo .cs-ubicacion-check { opacity: 1; }
            .cs-ubicacion-actual { flex: 1; min-width: 0; font-size: .76rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            /* ---- Borradores ---- */
            .cs-borrador-item { display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid rgba(255,43,214,0.35); border-radius: 12px; background: linear-gradient(120deg, rgba(255,43,214,.08), rgba(0,240,255,.06)); margin-bottom: 8px; box-shadow: 0 0 14px rgba(255,43,214,.12); }
            .cs-borrador-portada { width: 48px; height: 64px; border-radius: 8px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; color: #00f0ff; flex-shrink: 0; box-shadow: 0 0 10px rgba(0,240,255,.35); }
            .cs-borrador-portada img { width: 100%; height: 100%; object-fit: cover; }
            .cs-borrador-info { flex: 1; min-width: 0; }
            .cs-borrador-titulo { color: #fff; font-weight: 700; font-size: .82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cs-borrador-meta { color: #9fb4c8; font-size: .66rem; margin-top: 3px; }
            .cs-borrador-acciones { display: flex; flex-direction: column; gap: 6px; }
            .cs-borrador-acciones .cs-btn-ghost { padding: 6px 10px; font-size: .6rem; }
            .cs-btn-peligro { border-color: rgba(255,61,127,.6) !important; color: #ff3d7f !important; }

            .cs-btn-primary:not(:disabled):active { transform: scale(.97); }

            @media (prefers-reduced-motion: reduce) {
                .cs-sonido-item, .cs-fav-btn.on, #csPreviewBadge { animation: none !important; }
                .cs-eq:not(.cs-eq-live) .cs-eq-bar { animation: none !important; height: 14px; }
                .cs-sonido-item.cs-cargando .cs-sonido-play-ico { animation: none !important; }
            }
        `;
        document.head.appendChild(st);
    }

    /* ----------------------------------------------------------------
       BOTONES DEL HEADER (♪ sonido y ◆ ubicación)
       ---------------------------------------------------------------- */

    function actualizarBotonesSonidoUbicacion() {
        var bS = $('csBtnAgregarSonido');
        var bU = $('csBtnUbicacion');
        if (bS) bS.classList.toggle('cs-activo', !!NS.state.sonidoSeleccionado);
        if (bU) bU.classList.toggle('cs-activo', !!NS.state.ubicacionSeleccionada);
    }

    function inyectarBotonesHeader() {
        var header = document.querySelector('.header .header-actions');
        if (!header) {
            U.warn('Header no encontrado');
            return;
        }
        if ($('csBtnAgregarSonido')) return;

        var btnSonido = document.createElement('button');
        btnSonido.id = 'csBtnAgregarSonido';
        btnSonido.type = 'button';
        btnSonido.className = 'cs-btn-header cs-btn-sonido';
        btnSonido.innerHTML = '<span class="cs-ico">♪</span><span class="cs-btn-txt" data-clave="videos_agregar_sonido">Agregar sonido</span>';
        btnSonido.addEventListener('click', function () {
            if (NS.sheets) NS.sheets.abrirModalSonidos();
        });

        var btnUbic = document.createElement('button');
        btnUbic.id = 'csBtnUbicacion';
        btnUbic.type = 'button';
        btnUbic.className = 'cs-btn-header cs-btn-ubicacion';
        btnUbic.innerHTML = '<span class="cs-ico">◆</span><span class="cs-btn-txt" data-clave="videos_ubicacion_btn">Ubicación</span>';
        btnUbic.addEventListener('click', function () {
            if (NS.sheets) NS.sheets.abrirModalUbicacion();
        });

        header.insertBefore(btnSonido, header.firstChild);
        header.insertBefore(btnUbic, btnSonido.nextSibling);
    }

    /* ----------------------------------------------------------------
       EXPOSICIÓN
       ---------------------------------------------------------------- */

    NS.ui = {
        csToast: csToast,
        csConfirm: csConfirm,
        marcaHTML: marcaHTML,
        asegurarMarca: asegurarMarca,
        iniciarMarcaFeed: iniciarMarcaFeed,
        inyectarEstilosFeed: inyectarEstilosFeed,
        inyectarEstilosExtra: inyectarEstilosExtra,
        inyectarBotonesHeader: inyectarBotonesHeader,
        actualizarBotonesSonidoUbicacion: actualizarBotonesSonidoUbicacion
    };
})();