/* ================================================================
   PERFIL-PUBLICO.JS — Csariel's
   v4: esperas con límite de tiempo + vídeo 9:16 / visor 100dvh
       (#pubVisorFull) + reacciones en cápsula vertical + picker 97 emojis.
   ================================================================ */
(function () {
    'use strict';

    var RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';
    var HANDLE_RE = /^[A-Za-z0-9_]{1,40}$/;
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var POSTS_PAGE = 20;
    var COMENTARIOS_LIMITE = 50;

    var TIMEOUT_CLIENTE_MS = 5000;
    var TIMEOUT_SESION_MS = 4000;
    var TIMEOUT_PERFIL_MS = 12000;

    var REACCIONES_CATALOGO = ['❤️', '😂', '🥺', '💎'];
    var CLASE_EMOJI = {
        '❤️': 'emo-corazon',
        '😂': 'emo-risa',
        '🥺': 'emo-brillo',
        '💎': 'emo-diamante'
    };

    var EMOJIS_97 = [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
        '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
        '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
        '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
        '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
        '🤧', '🥵', '🥶', '🥴', ' dizzy', '🤯', '🤠', '🥳', '😎', '🤓',
        '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺',
        '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
        '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '👍',
        '👎', '👏', '🙌', '🔥', '💎', '❤️'
    ].map(function (e) { return e.trim(); });

    var perfil = null;
    var direccionWallet = null;
    var pub = { cargando: false, antes: null, total: 0, idsVistos: new Set() };
    var medioActivo = null;

    var visorState = {
        abierto: false,
        items: [],
        indice: 0,
        post: null,
        modoEscala: 'cover', // 'cover' | 'contain'
        velocidades: [1, 1.5, 2],
        velIdx: 0,
        hideTimer: null,
        arrastrandoProgreso: false,
        touchStartX: 0,
        touchStartY: 0,
        touchMoved: false
    };

    window.usuarioActualId = null;

    function $(id) { return document.getElementById(id); }

    var el = {
        cargando: $('pvCargando'),
        noEncontrado: $('pvNoEncontrado'),
        noEncontradoTitulo: $('pvNoEncontradoTitulo'),
        noEncontradoTexto: $('pvNoEncontradoTexto'),
        error: $('pvError'),
        errorTexto: $('pvErrorTexto'),
        reintentar: $('pvReintentar'),
        perfil: $('pvPerfil'),
        avatar: $('pvAvatar'),
        nombre: $('pvNombre'),
        verificado: $('pvVerificado'),
        handle: $('pvHandle'),
        estado: $('pvEstado'),
        estadoDot: $('pvEstadoDot'),
        estadoTexto: $('pvEstadoTexto'),
        wallet: $('pvWallet'),
        walletDir: $('pvWalletDir'),
        seguidores: $('pvSeguidores'),
        siguiendo: $('pvSiguiendo'),
        compartir: $('pvCompartir'),
        pasaporte: $('pvPasaporte'),
        amigosSection: $('pvAmigosSection'),
        pubSection: $('pvPubSection'),
        pubLista: $('pvPubLista'),
        pubMsg: $('pvPubMsg'),
        pubMas: $('pvPubMas'),
        pubContador: $('pvPubContador'),
        volver: $('pvVolver'),
        lightbox: $('pvLightbox'),
        lightboxBody: $('pvLightboxBody'),
        lightboxCerrar: $('pvLightboxCerrar')
    };

    var vf = {
        root: null,
        mediaWrap: null,
        header: null,
        btnClose: null,
        btnMenu: null,
        centerControls: null,
        btnPlayCenter: null,
        controls: null,
        progressBar: null,
        progressFill: null,
        timeLabel: null,
        btnSpeed: null,
        btnPip: null,
        btnExpand: null,
        sheetBackdrop: null,
        sheet: null,
        sheetMainView: null,
        sheetReportView: null,
        sheetConfirmView: null,
        reportMotivoActual: ''
    };

    /* ================= UTILIDADES ================= */
    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') { window.showToast(msg, tipo || 'success'); return; }
        var t = $('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:#111827;color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;z-index:100000;opacity:0;transition:all .25s ease;pointer-events:none;border:1px solid rgba(212,175,55,.35);';
            document.body.appendChild(t);
        }
        t.textContent = String(msg || '');
        t.className = 'toast' + (tipo ? ' ' + tipo : '') + ' show';
        t.style.opacity = '1';
        t.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(window.__pvToastTimer);
        window.__pvToastTimer = setTimeout(function () {
            t.classList.remove('show');
            t.style.opacity = '0';
            t.style.transform = 'translateX(-50%) translateY(20px)';
        }, 3600);
    }

    function msgError(e) {
        if (!e) return 'error desconocido';
        return e.message || e.details || e.hint || e.code || 'error desconocido';
    }

    function conTimeout(promesa, ms, mensaje) {
        var id;
        var limite = new Promise(function (_, reject) {
            id = setTimeout(function () { reject(new Error(mensaje)); }, ms);
        });
        return Promise.race([Promise.resolve(promesa), limite]).finally(function () {
            clearTimeout(id);
        });
    }

    function safeHttps(u) {
        if (!u) return null;
        try {
            var x = new URL(String(u), window.location.href);
            return x.protocol === 'https:' ? x.href : null;
        } catch (e) { return null; }
    }

    function mostrar(panel) {
        [el.cargando, el.noEncontrado, el.error, el.perfil].forEach(function (n) {
            if (n) n.hidden = (n !== panel);
        });
    }

    function acortar(d) { return d.slice(0, 6) + '…' + d.slice(-4); }

    function fechaUTC(iso) {
        if (!iso) return null;
        return /(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : iso + 'Z';
    }

    function tiempoRelativo(iso) {
        var ms = Date.now() - new Date(iso).getTime();
        if (!isFinite(ms) || ms < 0) ms = 0;
        var min = Math.floor(ms / 60000);
        if (min < 1) return 'hace un momento';
        if (min < 60) return 'hace ' + min + ' min';
        var h = Math.floor(min / 60);
        if (h < 24) return 'hace ' + h + ' h';
        var d = Math.floor(h / 24);
        if (d < 30) return 'hace ' + d + ' d';
        return 'hace más de un mes';
    }

    function fechaPost(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function formatoTiempo(seg) {
        if (!isFinite(seg) || seg < 0) seg = 0;
        var total = Math.floor(seg);
        var min = Math.floor(total / 60);
        var rem = total % 60;
        return min + ':' + (rem < 10 ? '0' : '') + rem;
    }

    function urlPerfil() {
        return window.location.origin + window.location.pathname + '?u=' + encodeURIComponent(perfil.handle);
    }

    function RG() {
        if (window.ReaccionesGlobal) return window.ReaccionesGlobal;
        return {
            EMOJIS: REACCIONES_CATALOGO,
            POR_DEFECTO: '❤️',
            normalizar: function (e) {
                return REACCIONES_CATALOGO.indexOf(e) !== -1 ? e : '❤️';
            },
            aplicarMotor: function (node, emoji) {
                aplicarAnimacionEmoji(node, emoji);
            },
            resumir: function (filas, uid) {
                var t = {}, total = 0, mi = null, self = this;
                (filas || []).forEach(function (f) {
                    var x = self.normalizar(f.tipo);
                    t[x] = (t[x] || 0) + 1;
                    total++;
                    if (uid && f.usuario_id === uid) mi = x;
                });
                return { totales: t, total: total, miTipo: mi };
            }
        };
    }

    function aplicarAnimacionEmoji(node, emoji) {
        if (!node) return;
        var clase = CLASE_EMOJI[emoji] || 'emo-corazon';
        node.classList.remove('emo-corazon', 'emo-risa', 'emo-brillo', 'emo-diamante');
        node.classList.add(clase);
        var dur = (0.75 + Math.random() * 0.65).toFixed(2) + 's';
        var delay = (Math.random() * 0.35).toFixed(2) + 's';
        node.style.setProperty('--dur', dur);
        node.style.setProperty('--delay', delay);
    }

    function registrarReproductorUnico(elMedia) {
        elMedia.addEventListener('play', function () {
            if (medioActivo && medioActivo !== elMedia) {
                try { medioActivo.pause(); } catch (e) {}
            }
            medioActivo = elMedia;
        });
    }

    /* ================= ESTILOS BASE PARA VISOR & EMOJIS ================= */
    function inyectarEstilosBase() {
        if ($('pvEstilosVisorEmojis')) return;
        var st = document.createElement('style');
        st.id = 'pvEstilosVisorEmojis';
        st.textContent = [
            '.pub-media-container{width:100%;aspect-ratio:9/16;border-radius:8px;background:#000;overflow:hidden;position:relative;margin-top:12px;cursor:pointer;}',
            '.pub-media-container>video,.pub-media-container>img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;}',
            '#pubVisorFull{position:fixed;inset:0;width:100%;height:100dvh;background:#000;z-index:9990;display:flex;flex-direction:column;justify-content:space-between;user-select:none;touch-action:none;}',
            '#pubVisorFull[hidden]{display:none;}',
            '.pub-vf-media{position:fixed;inset:0;width:100%;height:100dvh;background:#000;z-index:1;display:flex;align-items:center;justify-content:center;overflow:hidden;}',
            '.pub-vf-media>video,.pub-vf-media>img{width:100%;height:100%;display:block;transition:object-fit .2s ease;}',
            '.pub-vf-header{position:relative;z-index:4;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;transition:opacity .25s ease;}',
            '.pub-vf-btn-circle{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(12,16,24,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;font-size:20px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}',
            '#pubVfCenterControls{position:fixed;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none;transition:opacity .25s ease;}',
            '#pubVfCenterControls[hidden]{display:none;}',
            '#pubVfBtnPlayCenter{width:80px;height:80px;border-radius:50%;border:2px solid rgba(212,175,55,.75);background:rgba(10,14,22,.68);backdrop-filter:blur(8px);color:#D4AF37;font-size:32px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;}',
            '.pub-vf-controls{position:relative;z-index:4;padding:28px 16px 20px;background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.42) 65%,transparent);transition:opacity .25s ease;}',
            '#pubVfProgressBar{width:100%;height:18px;display:flex;align-items:center;cursor:pointer;touch-action:none;margin-bottom:10px;}',
            '#pubVfProgressTrack{width:100%;height:4px;border-radius:999px;background:rgba(255,255,255,.24);overflow:hidden;position:relative;}',
            '#pubVfProgressFill{height:100%;width:0%;background:#D4AF37;border-radius:999px;}',
            '.pub-vf-actions-row{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff;font-size:13px;}',
            '.pub-vf-right-actions{display:flex;align-items:center;gap:8px;}',
            '.pub-vf-pill-btn{height:34px;padding:0 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(15,20,30,.72);color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}',
            '#pubVisorFull.controls-hidden .pub-vf-header,#pubVisorFull.controls-hidden .pub-vf-controls{opacity:0;pointer-events:none;}',
            '#pubVfSheetBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;}',
            '#pubVfSheetBackdrop[hidden]{display:none;}',
            '#pubVfSheet{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0b1016;border-top:1px solid rgba(212,175,55,.35);border-radius:18px 18px 0 0;padding:16px;max-height:78dvh;overflow:hidden;color:#fff;}',
            '#pubVfSheet[hidden]{display:none;}',
            '.pub-vf-sheet-track{display:flex;width:300%;transition:transform .26s cubic-bezier(.22,.61,.36,1);}',
            '.pub-vf-sheet-view{width:33.3333%;flex-shrink:0;display:flex;flex-direction:column;gap:8px;}',
            '.pub-vf-sheet-item{width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#fff;font-size:14px;cursor:pointer;}',
            '.pub-vf-sheet-item.danger{color:#ff6b8b;border-color:rgba(255,51,102,.3);}',
            '.reaccion-wrap{position:relative;display:inline-flex;align-items:center;}',
            '.reaccion-trigger{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid rgba(212,175,55,.35);background:rgba(11,16,22,.85);color:#fff;font-size:13px;cursor:pointer;}',
            '.reaccion-trigger.activo{border-color:#D4AF37;background:rgba(212,175,55,.16);}',
            '.reaccion-dropdown{position:absolute;bottom:calc(100% + 8px);left:0;display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:24px;background:#0b1016;border:1px solid rgba(212,175,55,.45);box-shadow:0 12px 28px rgba(0,0,0,.65);z-index:60;}',
            '.reaccion-dropdown[hidden]{display:none;}',
            '.reaccion-opcion-btn{position:relative;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);font-size:20px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}',
            '.reaccion-opcion-btn.activo{border-color:#D4AF37;background:rgba(212,175,55,.2);}',
            '.mini-count{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#D4AF37;color:#05080f;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;line-height:1;}',
            '.mini-count:empty{display:none;}',
            '#emojiPickerPerfil{position:fixed;bottom:84px;right:16px;width:300px;max-width:calc(100vw - 32px);background:#0b1016;border:1px solid rgba(212,175,55,.45);border-radius:14px;padding:10px;z-index:9950;box-shadow:0 14px 36px rgba(0,0,0,.75);}',
            '#emojiPickerPerfil[hidden]{display:none;}',
            '#emojiGridPerfil{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-height:220px;overflow-y:auto;}',
            '.emoji-picker-item{width:100%;aspect-ratio:1/1;border:none;background:transparent;border-radius:6px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
            '.emoji-picker-item:hover{background:rgba(212,175,55,.2);}'
        ].join('\n');
        document.head.appendChild(st);
    }

    /* ================= VISOR INMERSIVO (#pubVisorFull) ================= */
    function construirVisorInmersivo() {
        if ($('pubVisorFull')) {
            enlazarReferenciasVisor();
            return;
        }

        var root = document.createElement('div');
        root.id = 'pubVisorFull';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Visor multimedia');

        var mediaWrap = document.createElement('div');
        mediaWrap.className = 'pub-vf-media';

        var header = document.createElement('div');
        header.className = 'pub-vf-header';

        var btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.id = 'btnPubVfClose';
        btnClose.className = 'pub-vf-btn-circle';
        btnClose.setAttribute('aria-label', 'Cerrar visor');
        btnClose.textContent = '×';

        var btnMenu = document.createElement('button');
        btnMenu.type = 'button';
        btnMenu.id = 'btnPubVfMenu';
        btnMenu.className = 'pub-vf-btn-circle';
        btnMenu.setAttribute('aria-label', 'Más opciones');
        btnMenu.textContent = '⋮';

        header.appendChild(btnClose);
        header.appendChild(btnMenu);

        var centerControls = document.createElement('div');
        centerControls.id = 'pubVfCenterControls';
        centerControls.hidden = true;

        var btnPlayCenter = document.createElement('button');
        btnPlayCenter.type = 'button';
        btnPlayCenter.id = 'pubVfBtnPlayCenter';
        btnPlayCenter.setAttribute('aria-label', 'Reproducir');
        btnPlayCenter.textContent = '▶';
        centerControls.appendChild(btnPlayCenter);

        var controls = document.createElement('div');
        controls.className = 'pub-vf-controls';

        var progressBar = document.createElement('div');
        progressBar.id = 'pubVfProgressBar';
        progressBar.setAttribute('role', 'slider');
        progressBar.setAttribute('aria-label', 'Progreso del vídeo');

        var progressTrack = document.createElement('div');
        progressTrack.id = 'pubVfProgressTrack';

        var progressFill = document.createElement('div');
        progressFill.id = 'pubVfProgressFill';
        progressTrack.appendChild(progressFill);
        progressBar.appendChild(progressTrack);

        var actionsRow = document.createElement('div');
        actionsRow.className = 'pub-vf-actions-row';

        var timeLabel = document.createElement('span');
        timeLabel.id = 'pubVfTimeLabel';
        timeLabel.textContent = '0:00 / 0:00';

        var rightActions = document.createElement('div');
        rightActions.className = 'pub-vf-right-actions';

        var btnSpeed = document.createElement('button');
        btnSpeed.type = 'button';
        btnSpeed.id = 'btnPubVfSpeed';
        btnSpeed.className = 'pub-vf-pill-btn';
        btnSpeed.textContent = '1x';

        var btnPip = document.createElement('button');
        btnPip.type = 'button';
        btnPip.id = 'btnPubVfPip';
        btnPip.className = 'pub-vf-pill-btn';
        btnPip.textContent = 'PiP';

        var btnExpand = document.createElement('button');
        btnExpand.type = 'button';
        btnExpand.id = 'btnPubVfExpand';
        btnExpand.className = 'pub-vf-pill-btn';
        btnExpand.textContent = 'Expandir';

        rightActions.appendChild(btnSpeed);
        rightActions.appendChild(btnPip);
        rightActions.appendChild(btnExpand);

        actionsRow.appendChild(timeLabel);
        actionsRow.appendChild(rightActions);

        controls.appendChild(progressBar);
        controls.appendChild(actionsRow);

        root.appendChild(mediaWrap);
        root.appendChild(header);
        root.appendChild(centerControls);
        root.appendChild(controls);

        var backdrop = document.createElement('div');
        backdrop.id = 'pubVfSheetBackdrop';
        backdrop.hidden = true;

        var sheet = document.createElement('div');
        sheet.id = 'pubVfSheet';
        sheet.hidden = true;

        var track = document.createElement('div');
        track.className = 'pub-vf-sheet-track';

        var mainView = document.createElement('div');
        mainView.className = 'pub-vf-sheet-view';

        var reportView = document.createElement('div');
        reportView.className = 'pub-vf-sheet-view';

        var confirmView = document.createElement('div');
        confirmView.className = 'pub-vf-sheet-view';

        track.appendChild(mainView);
        track.appendChild(reportView);
        track.appendChild(confirmView);
        sheet.appendChild(track);

        document.body.appendChild(root);
        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);

        enlazarReferenciasVisor();
        registrarEventosVisor();
    }

    function enlazarReferenciasVisor() {
        vf.root = $('pubVisorFull');
        vf.mediaWrap = vf.root ? vf.root.querySelector('.pub-vf-media') : null;
        vf.header = vf.root ? vf.root.querySelector('.pub-vf-header') : null;
        vf.btnClose = $('btnPubVfClose');
        vf.btnMenu = $('btnPubVfMenu');
        vf.centerControls = $('pubVfCenterControls');
        vf.btnPlayCenter = $('pubVfBtnPlayCenter');
        vf.controls = vf.root ? vf.root.querySelector('.pub-vf-controls') : null;
        vf.progressBar = $('pubVfProgressBar');
        vf.progressFill = $('pubVfProgressFill');
        vf.timeLabel = $('pubVfTimeLabel');
        vf.btnSpeed = $('btnPubVfSpeed');
        vf.btnPip = $('btnPubVfPip');
        vf.btnExpand = $('btnPubVfExpand');
        vf.sheetBackdrop = $('pubVfSheetBackdrop');
        vf.sheet = $('pubVfSheet');
        if (vf.sheet) {
            var views = vf.sheet.querySelectorAll('.pub-vf-sheet-view');
            vf.sheetMainView = views[0] || null;
            vf.sheetReportView = views[1] || null;
            vf.sheetConfirmView = views[2] || null;
        }
    }

    function obtenerVideoActualVisor() {
        if (!vf.mediaWrap) return null;
        return vf.mediaWrap.querySelector('video');
    }

    function aplicarEscalaMediaVisor() {
        if (!vf.mediaWrap) return;
        var elem = vf.mediaWrap.querySelector('video, img');
        if (!elem) return;
        elem.style.objectFit = visorState.modoEscala;
        elem.style.objectPosition = 'center';
        if (vf.btnExpand) {
            vf.btnExpand.textContent = visorState.modoEscala === 'cover' ? 'Ajustar' : 'Expandir';
        }
    }

    function alternarEscalaVisor() {
        visorState.modoEscala = visorState.modoEscala === 'cover' ? 'contain' : 'cover';
        aplicarEscalaMediaVisor();
    }

    function limpiarTimerControles() {
        if (visorState.hideTimer) {
            clearTimeout(visorState.hideTimer);
            visorState.hideTimer = null;
        }
    }

    function mostrarControlesVisor(programarAutoOcultar) {
        if (!vf.root) return;
        vf.root.classList.remove('controls-hidden');
        limpiarTimerControles();
        var vid = obtenerVideoActualVisor();
        if (programarAutoOcultar && vid && !vid.paused) {
            visorState.hideTimer = setTimeout(function () {
                if (visorState.abierto && vid && !vid.paused && !visorState.arrastrandoProgreso) {
                    vf.root.classList.add('controls-hidden');
                }
            }, 2500);
        }
    }

    function sincronizarEstadoPlayPausa() {
        var vid = obtenerVideoActualVisor();
        if (!vid) {
            if (vf.centerControls) vf.centerControls.hidden = true;
            if (vf.controls) vf.controls.hidden = true;
            mostrarControlesVisor(false);
            return;
        }
        if (vf.controls) vf.controls.hidden = false;
        if (vid.paused) {
            if (vf.centerControls) vf.centerControls.hidden = false;
            mostrarControlesVisor(false);
        } else {
            if (vf.centerControls) vf.centerControls.hidden = true;
            mostrarControlesVisor(true);
        }
    }

    function actualizarProgresoVisor() {
        var vid = obtenerVideoActualVisor();
        if (!vid) return;
        var dur = vid.duration || 0;
        var cur = vid.currentTime || 0;
        var pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
        if (vf.progressFill) vf.progressFill.style.width = pct + '%';
        if (vf.timeLabel) vf.timeLabel.textContent = formatoTiempo(cur) + ' / ' + formatoTiempo(dur);
    }

    function buscarEnProgresoPorEvento(ev) {
        var vid = obtenerVideoActualVisor();
        if (!vid || !vf.progressBar || !isFinite(vid.duration) || vid.duration <= 0) return;
        var rect = vf.progressBar.getBoundingClientRect();
        if (!rect.width) return;
        var ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        vid.currentTime = ratio * vid.duration;
        actualizarProgresoVisor();
    }

    function alternarReproduccionVisor() {
        var vid = obtenerVideoActualVisor();
        if (!vid) return;
        if (vid.paused) {
            vid.play().catch(function () {});
        } else {
            vid.pause();
        }
    }

    function ciclarVelocidadVisor() {
        var vid = obtenerVideoActualVisor();
        visorState.velIdx = (visorState.velIdx + 1) % visorState.velocidades.length;
        var vel = visorState.velocidades[visorState.velIdx];
        if (vid) vid.playbackRate = vel;
        if (vf.btnSpeed) vf.btnSpeed.textContent = vel + 'x';
        mostrarControlesVisor(true);
    }

    async function activarPiPVisor() {
        var vid = obtenerVideoActualVisor();
        if (!vid) { toast('Solo disponible para vídeos', 'error'); return; }
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (typeof vid.requestPictureInPicture === 'function') {
                await vid.requestPictureInPicture();
                cerrarVisorInmersivo(true);
            } else {
                toast('Tu navegador no soporta ventana flotante', 'error');
            }
        } catch (e) {
            toast('No se pudo activar PiP', 'error');
        }
    }

    function renderizarItemEnVisor(index) {
        if (!vf.mediaWrap || !visorState.items.length) return;
        var idx = ((index % visorState.items.length) + visorState.items.length) % visorState.items.length;
        visorState.indice = idx;
        var item = visorState.items[idx];
        var segura = safeHttps(item.url);
        if (!segura) return;

        var prevVid = obtenerVideoActualVisor();
        if (prevVid) {
            try { prevVid.pause(); } catch (e) {}
        }

        vf.mediaWrap.innerHTML = '';
        visorState.velIdx = 0;
        if (vf.btnSpeed) vf.btnSpeed.textContent = '1x';

        if (item.tipo === 'video') {
            var vid = document.createElement('video');
            vid.src = segura;
            vid.controls = false;
            vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');
            vid.playbackRate = 1;
            if (visorState.post && visorState.post.permitir_descarga === false) {
                vid.setAttribute('controlsList', 'nodownload');
            }

            vid.addEventListener('loadedmetadata', actualizarProgresoVisor);
            vid.addEventListener('timeupdate', actualizarProgresoVisor);
            vid.addEventListener('play', function () {
                sincronizarEstadoPlayPausa();
            });
            vid.addEventListener('pause', function () {
                sincronizarEstadoPlayPausa();
            });
            vid.addEventListener('ended', function () {
                sincronizarEstadoPlayPausa();
            });

            registrarReproductorUnico(vid);
            vf.mediaWrap.appendChild(vid);
            aplicarEscalaMediaVisor();
            actualizarProgresoVisor();
            vid.play().then(function () {
                sincronizarEstadoPlayPausa();
            }).catch(function () {
                sincronizarEstadoPlayPausa();
            });
        } else {
            var img = document.createElement('img');
            img.src = segura;
            img.alt = '';
            vf.mediaWrap.appendChild(img);
            aplicarEscalaMediaVisor();
            sincronizarEstadoPlayPausa();
        }
    }

    function abrirVisorInmersivo(items, indiceInicial, postData) {
        if (!Array.isArray(items) || !items.length) return;
        construirVisorInmersivo();
        if (!vf.root) return;

        if (medioActivo) {
            try { medioActivo.pause(); } catch (e) {}
        }

        visorState.abierto = true;
        visorState.items = items;
        visorState.post = postData || null;
        visorState.modoEscala = 'cover';

        vf.root.hidden = false;
        renderizarItemEnVisor(indiceInicial || 0);
    }

    function cerrarVisorInmersivo(mantenerPip) {
        cerrarSheetVisor();
        limpiarTimerControles();
        visorState.abierto = false;
        var vid = obtenerVideoActualVisor();
        if (vid && !mantenerPip) {
            try { vid.pause(); } catch (e) {}
            if (medioActivo === vid) medioActivo = null;
        }
        if (vf.mediaWrap && !mantenerPip) {
            vf.mediaWrap.innerHTML = '';
        }
        if (vf.root) {
            vf.root.hidden = true;
            vf.root.classList.remove('controls-hidden');
        }
    }

    /* ================= BOTTOM SHEET (#pubVfSheet) ================= */
    function irVistaSheet(step) {
        if (!vf.sheet) return;
        var track = vf.sheet.querySelector('.pub-vf-sheet-track');
        if (track) track.style.transform = 'translateX(-' + (step * 33.3333) + '%)';
    }

    async function descargarMediaActualBlob() {
        var item = visorState.items[visorState.indice];
        if (!item || !item.url) return;
        if (visorState.post && visorState.post.permitir_descarga === false) {
            toast('La descarga está deshabilitada para este contenido', 'error');
            return;
        }
        try {
            toast('Descargando archivo...', 'success');
            var resp = await fetch(item.url);
            if (!resp.ok) throw new Error('Error de red');
            var blob = await resp.blob();
            var ext = item.tipo === 'video' ? 'mp4' : (item.tipo === 'audio' ? 'mp3' : 'jpg');
            var blobUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = blobUrl;
            a.download = 'csariels-media-' + Date.now() + '.' + ext;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 2000);
        } catch (e) {
            toast('No se pudo descargar el archivo', 'error');
        }
    }

    function construirContenidoSheet() {
        if (!vf.sheetMainView || !vf.sheetReportView || !vf.sheetConfirmView) return;
        var post = visorState.post || {};
        var esDueno = Boolean(window.usuarioActualId && post.usuario_id && String(post.usuario_id) === String(window.usuarioActualId));

        vf.sheetMainView.innerHTML = '';

        var btnGuardar = document.createElement('button');
        btnGuardar.type = 'button';
        btnGuardar.className = 'pub-vf-sheet-item';
        btnGuardar.textContent = 'Guardar';
        btnGuardar.addEventListener('click', function () {
            cerrarSheetVisor();
            descargarMediaActualBlob();
        });
        vf.sheetMainView.appendChild(btnGuardar);

        if (!esDueno) {
            var btnNoInteresa = document.createElement('button');
            btnNoInteresa.type = 'button';
            btnNoInteresa.className = 'pub-vf-sheet-item';
            btnNoInteresa.textContent = 'No quiero ver esto';
            btnNoInteresa.addEventListener('click', function () {
                if (post.id && el.pubLista) {
                    var art = el.pubLista.querySelector('[data-pub-id="' + post.id + '"]');
                    if (art && art.closest('.pv-post')) art.closest('.pv-post').remove();
                }
                cerrarSheetVisor();
                cerrarVisorInmersivo(false);
                toast('Ocultamos esta publicación de tu vista', 'success');
            });
            vf.sheetMainView.appendChild(btnNoInteresa);

            var btnReportar = document.createElement('button');
            btnReportar.type = 'button';
            btnReportar.className = 'pub-vf-sheet-item danger';
            btnReportar.textContent = 'Reportar →';
            btnReportar.addEventListener('click', function () {
                irVistaSheet(1);
            });
            vf.sheetMainView.appendChild(btnReportar);
        } else {
            var btnEliminar = document.createElement('button');
            btnEliminar.type = 'button';
            btnEliminar.className = 'pub-vf-sheet-item danger';
            btnEliminar.textContent = 'Eliminar';
            btnEliminar.addEventListener('click', async function () {
                if (!post.id) return;
                try {
                    var client = await obtenerCliente();
                    if (!client) throw new Error('Sin conexión');
                    var del = await client.from('publicaciones').delete().eq('id', post.id);
                    if (del.error) throw del.error;
                    if (el.pubLista) {
                        var card = el.pubLista.querySelector('[data-pub-id="' + post.id + '"]');
                        if (card && card.closest('.pv-post')) card.closest('.pv-post').remove();
                    }
                    cerrarSheetVisor();
                    cerrarVisorInmersivo(false);
                    toast('Publicación eliminada', 'success');
                } catch (e) {
                    toast('No se pudo eliminar: ' + msgError(e), 'error');
                }
            });
            vf.sheetMainView.appendChild(btnEliminar);
        }

        // Vista 2: Motivos de reporte
        vf.sheetReportView.innerHTML = '';
        var btnAtrasRep = document.createElement('button');
        btnAtrasRep.type = 'button';
        btnAtrasRep.className = 'pub-vf-sheet-item';
        btnAtrasRep.textContent = '← Volver';
        btnAtrasRep.addEventListener('click', function () { irVistaSheet(0); });
        vf.sheetReportView.appendChild(btnAtrasRep);

        ['Spam o estafa', 'Contenido inapropiado o violento', 'Acoso o suplantación', 'Derechos de autor'].forEach(function (motivo) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'pub-vf-sheet-item';
            b.textContent = motivo;
            b.addEventListener('click', function () {
                vf.reportMotivoActual = motivo;
                pintarConfirmacionReporte();
                irVistaSheet(2);
            });
            vf.sheetReportView.appendChild(b);
        });
    }

    function pintarConfirmacionReporte() {
        if (!vf.sheetConfirmView) return;
        vf.sheetConfirmView.innerHTML = '';

        var btnAtrasConf = document.createElement('button');
        btnAtrasConf.type = 'button';
        btnAtrasConf.className = 'pub-vf-sheet-item';
        btnAtrasConf.textContent = '← Cambiar motivo';
        btnAtrasConf.addEventListener('click', function () { irVistaSheet(1); });
        vf.sheetConfirmView.appendChild(btnAtrasConf);

        var resumen = document.createElement('div');
        resumen.style.cssText = 'padding:12px;font-size:13px;color:#cbd5e1;';
        resumen.textContent = 'Motivo seleccionado: ' + vf.reportMotivoActual + '. ¿Confirmas enviar el reporte?';
        vf.sheetConfirmView.appendChild(resumen);

        var btnConfirmar = document.createElement('button');
        btnConfirmar.type = 'button';
        btnConfirmar.className = 'pub-vf-sheet-item danger';
        btnConfirmar.textContent = 'Enviar reporte';
        btnConfirmar.addEventListener('click', async function () {
            try {
                var client = await obtenerCliente();
                if (client && visorState.post && visorState.post.id && window.usuarioActualId) {
                    await client.from('publicaciones_reportes').insert({
                        publicacion_id: visorState.post.id,
                        usuario_id: window.usuarioActualId,
                        motivo: vf.reportMotivoActual
                    });
                }
            } catch (e) {}
            cerrarSheetVisor();
            toast('Reporte enviado. Gracias por ayudar a cuidar la comunidad.', 'success');
        });
        vf.sheetConfirmView.appendChild(btnConfirmar);
    }

    function abrirSheetVisor() {
        construirContenidoSheet();
        irVistaSheet(0);
        if (vf.sheetBackdrop) vf.sheetBackdrop.hidden = false;
        if (vf.sheet) vf.sheet.hidden = false;
    }

    function cerrarSheetVisor() {
        if (vf.sheetBackdrop) vf.sheetBackdrop.hidden = true;
        if (vf.sheet) vf.sheet.hidden = true;
        irVistaSheet(0);
    }

    function registrarEventosVisor() {
        if (!vf.root) return;

        if (vf.btnClose) {
            vf.btnClose.addEventListener('click', function (ev) {
                ev.stopPropagation();
                cerrarVisorInmersivo(false);
            });
        }

        if (vf.btnMenu) {
            vf.btnMenu.addEventListener('click', function (ev) {
                ev.stopPropagation();
                abrirSheetVisor();
            });
        }

        if (vf.btnPlayCenter) {
            vf.btnPlayCenter.addEventListener('click', function (ev) {
                ev.stopPropagation();
                alternarReproduccionVisor();
            });
        }

        if (vf.btnSpeed) {
            vf.btnSpeed.addEventListener('click', function (ev) {
                ev.stopPropagation();
                ciclarVelocidadVisor();
            });
        }

        if (vf.btnPip) {
            vf.btnPip.addEventListener('click', function (ev) {
                ev.stopPropagation();
                activarPiPVisor();
            });
        }

        if (vf.btnExpand) {
            vf.btnExpand.addEventListener('click', function (ev) {
                ev.stopPropagation();
                alternarEscalaVisor();
            });
        }

        if (vf.progressBar) {
            vf.progressBar.addEventListener('pointerdown', function (ev) {
                ev.stopPropagation();
                visorState.arrastrandoProgreso = true;
                try { vf.progressBar.setPointerCapture(ev.pointerId); } catch (e) {}
                buscarEnProgresoPorEvento(ev);
            });
            vf.progressBar.addEventListener('pointermove', function (ev) {
                if (!visorState.arrastrandoProgreso) return;
                ev.stopPropagation();
                buscarEnProgresoPorEvento(ev);
            });
            var soltarProgreso = function (ev) {
                if (!visorState.arrastrandoProgreso) return;
                ev.stopPropagation();
                visorState.arrastrandoProgreso = false;
                try { vf.progressBar.releasePointerCapture(ev.pointerId); } catch (e) {}
                mostrarControlesVisor(true);
            };
            vf.progressBar.addEventListener('pointerup', soltarProgreso);
            vf.progressBar.addEventListener('pointercancel', soltarProgreso);
        }

        if (vf.mediaWrap) {
            vf.mediaWrap.addEventListener('touchstart', function (ev) {
                if (!ev.touches || !ev.touches.length) return;
                visorState.touchStartX = ev.touches[0].clientX;
                visorState.touchStartY = ev.touches[0].clientY;
                visorState.touchMoved = false;
            }, { passive: true });

            vf.mediaWrap.addEventListener('touchmove', function (ev) {
                if (!ev.touches || !ev.touches.length) return;
                var dx = Math.abs(ev.touches[0].clientX - visorState.touchStartX);
                var dy = Math.abs(ev.touches[0].clientY - visorState.touchStartY);
                if (dx > 10 || dy > 10) visorState.touchMoved = true;
            }, { passive: true });

            vf.mediaWrap.addEventListener('touchend', function (ev) {
                if (!ev.changedTouches || !ev.changedTouches.length) return;
                var endX = ev.changedTouches[0].clientX;
                var endY = ev.changedTouches[0].clientY;
                var diffX = endX - visorState.touchStartX;
                var diffY = endY - visorState.touchStartY;

                // Deslizar hacia abajo (> 120px) cierra el visor
                if (diffY > 120 && Math.abs(diffY) > Math.abs(diffX)) {
                    cerrarVisorInmersivo(false);
                    return;
                }

                // Deslizar horizontalmente (> 55px) navega entre archivos
                if (Math.abs(diffX) > 55 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0) {
                        renderizarItemEnVisor(visorState.indice + 1);
                    } else {
                        renderizarItemEnVisor(visorState.indice - 1);
                    }
                    return;
                }

                // Toque simple pausa/reanuda (o muestra controles)
                if (!visorState.touchMoved) {
                    var vid = obtenerVideoActualVisor();
                    if (vid) {
                        alternarReproduccionVisor();
                    } else {
                        mostrarControlesVisor(false);
                    }
                }
            }, { passive: true });

            vf.mediaWrap.addEventListener('click', function (ev) {
                if (ev.detail === 0) return;
                var vid = obtenerVideoActualVisor();
                if (vid) alternarReproduccionVisor();
            });
        }

        if (vf.sheetBackdrop) {
            vf.sheetBackdrop.addEventListener('click', cerrarSheetVisor);
        }

        window.addEventListener('resize', function () {
            if (visorState.abierto) {
                alternarEscalaVisor();
            }
        });
    }

    /* ================= VISOR MULTIMEDIA LEGACY / FALLBACK ================= */
    function cerrarLightbox() {
        cerrarVisorInmersivo(false);
        var lb = el.lightbox;
        var body = el.lightboxBody;
        if (medioActivo && body && body.contains(medioActivo)) {
            try { medioActivo.pause(); } catch (e) {}
            medioActivo = null;
        }
        if (lb) lb.hidden = true;
        if (body) body.innerHTML = '';
    }

    function abrirLightbox(tipo, url) {
        var segura = safeHttps(url);
        if (!segura) return;
        abrirVisorInmersivo([{ tipo: tipo || 'imagen', url: segura }], 0, null);
    }

    /* ================= SELECTOR DE 97 EMOJIS (#emojiPickerPerfil) ================= */
    var pickerState = {
        targetInput: null,
        construido: false
    };

    function asegurarPicker97Emojis() {
        var picker = $('emojiPickerPerfil');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'emojiPickerPerfil';
            picker.hidden = true;
            picker.setAttribute('role', 'dialog');
            picker.setAttribute('aria-label', 'Selector de emojis');

            var grid = document.createElement('div');
            grid.id = 'emojiGridPerfil';
            picker.appendChild(grid);
            document.body.appendChild(picker);
        }

        var gridEl = $('emojiGridPerfil');
        if (gridEl && !pickerState.construido) {
            gridEl.innerHTML = '';
            EMOJIS_97.forEach(function (emo) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'emoji-picker-item';
                btn.textContent = emo;
                btn.setAttribute('aria-label', 'Insertar ' + emo);
                btn.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    insertarEmojiEnCursor(emo);
                });
                gridEl.appendChild(btn);
            });
            pickerState.construido = true;
        }
        return picker;
    }

    function insertarEmojiEnCursor(emoji) {
        var inp = pickerState.targetInput || document.querySelector('#nuevaPublicacionTexto, #pubContenido, .pv-comentario-input');
        if (!inp) return;
        inp.focus();
        var val = String(inp.value || '');
        var start = typeof inp.selectionStart === 'number' ? inp.selectionStart : val.length;
        var end = typeof inp.selectionEnd === 'number' ? inp.selectionEnd : val.length;
        inp.value = val.slice(0, start) + emoji + val.slice(end);
        var nuevaPos = start + emoji.length;
        try { inp.setSelectionRange(nuevaPos, nuevaPos); } catch (e) {}
        inp.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function alternarPicker97Emojis(inputEl, anchorEl) {
        var picker = asegurarPicker97Emojis();
        if (inputEl) pickerState.targetInput = inputEl;
        var seraVisible = picker.hidden;
        picker.hidden = !seraVisible;
        if (seraVisible && anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
            var r = anchorEl.getBoundingClientRect();
            picker.style.bottom = (window.innerHeight - r.top + 8) + 'px';
            picker.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
            picker.style.left = 'auto';
        }
    }

    /* ================= IDENTIDAD ================= */
    function leerIdentificador() {
        var sp = new URLSearchParams(window.location.search);
        var tieneU = sp.has('u'), tieneId = sp.has('id');
        var u = (sp.get('u') || '').trim().replace(/^@+/, '');
        var id = (sp.get('id') || '').trim();
        var uOk = HANDLE_RE.test(u), idOk = UUID_RE.test(id);
        if (tieneU && tieneId) return (uOk && idOk) ? { tipo: 'verificado', handle: u, id: id } : { tipo: 'invalido' };
        if (tieneU && uOk) return { tipo: 'handle', valor: u };
        if (tieneId && idOk) return { tipo: 'id', valor: id };
        if (tieneU || tieneId) return { tipo: 'invalido' };
        return null;
    }

    async function cargarPerfil(client, ident) {
        var llamada;
        if (ident.tipo === 'verificado') llamada = client.rpc('perfil_publico_verificado', { p_handle: ident.handle, p_id: ident.id });
        else if (ident.tipo === 'handle') llamada = client.rpc('perfil_publico_por_handle', { p_handle: ident.valor });
        else llamada = client.rpc('perfil_publico_por_id', { p_id: ident.valor });

        var r = await conTimeout(llamada, TIMEOUT_PERFIL_MS, 'El servidor tardó demasiado en responder el perfil.');
        if (r.error) throw r.error;
        var fila = Array.isArray(r.data) ? r.data[0] : r.data;
        return fila || null;
    }

    async function resolverSinPerfil(client, ident) {
        var id = ident.tipo === 'verificado' ? ident.id : (ident.tipo === 'id' ? ident.valor : null);
        if (!id) return 'no_encontrado';
        var params = { p_id: id };
        if (ident.tipo === 'verificado') params.p_handle = ident.handle;
        try {
            var r = await conTimeout(client.rpc('perfil_visibilidad_estado', params), TIMEOUT_PERFIL_MS, 'Sin respuesta');
            if (!r.error && r.data) return r.data;
        } catch (e) {}
        return 'no_encontrado';
    }

    function mensajeNoEncontrado(titulo, texto) {
        el.noEncontradoTitulo.removeAttribute('data-clave');
        el.noEncontradoTexto.removeAttribute('data-clave');
        el.noEncontradoTitulo.textContent = titulo;
        el.noEncontradoTexto.textContent = texto;
        mostrar(el.noEncontrado);
    }

    function mostrarErrorIdentidad() {
        el.errorTexto.removeAttribute('data-clave');
        el.errorTexto.textContent = 'No pudimos verificar la identidad de este perfil. Por seguridad no se muestran sus datos.';
        mostrar(el.error);
    }

    function mostrarErrorGeneral(detalle) {
        el.errorTexto.removeAttribute('data-clave');
        el.errorTexto.textContent = 'No pudimos cargar este perfil. ' + (detalle || 'Intenta de nuevo.');
        mostrar(el.error);
    }

    /* ================= RENDER PERFIL ================= */
    function pintarAvatar(url) {
        el.avatar.textContent = '';
        var seguro = safeHttps(url);
        if (!seguro) { el.avatar.textContent = '◈'; return; }
        var img = document.createElement('img');
        img.alt = ''; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
        img.onerror = function () { el.avatar.textContent = '◈'; };
        img.src = seguro;
        el.avatar.appendChild(img);
    }

    function pintarEstado(p) {
        if (!p.ultima_conexion && p.online !== true) { el.estado.hidden = true; return; }
        el.estado.hidden = false;
        if (p.online === true) {
            el.estadoDot.className = 'pv-dot activo';
            el.estadoTexto.textContent = 'Activo ahora';
        } else {
            el.estadoDot.className = 'pv-dot inactivo';
            el.estadoTexto.textContent = 'Inactivo · ' + tiempoRelativo(fechaUTC(p.ultima_conexion));
        }
    }

    function pintarPasaporte(p) {
        el.pasaporte.innerHTML = '';
        var card = document.createElement('div');
        card.className = 'pv-pasaporte';
        var sello = document.createElement('div'); sello.className = 'pv-pasaporte-sello';
        sello.textContent = '◈ Csariel\'s · Digital Identity';
        var titulo = document.createElement('div'); titulo.className = 'pv-pasaporte-titulo';
        titulo.textContent = 'Pasaporte Digital';
        var sub = document.createElement('div'); sub.className = 'pv-pasaporte-sub';
        sub.textContent = 'Identidad en Csariel\'s.';
        card.appendChild(sello); card.appendChild(titulo); card.appendChild(sub);
        if (p.verificado) {
            var verif = document.createElement('div'); verif.className = 'pv-pasaporte-verif';
            verif.textContent = '✓ Miembro verificado';
            card.appendChild(verif);
        }
        el.pasaporte.appendChild(card);
    }

    function renderPerfil(p) {
        el.nombre.textContent = p.nombre || p.handle;
        el.handle.textContent = '@' + p.handle;
        el.verificado.hidden = !p.verificado;
        el.seguidores.textContent = String(p.seguidores_count || 0);
        el.siguiendo.textContent = String(p.siguiendo_count || 0);
        pintarAvatar(p.avatar_url);
        pintarEstado(p);
        pintarPasaporte(p);
        actualizarMeta(p);
    }

    function actualizarMeta(p) {
        var url = urlPerfil();
        var titulo = (p.nombre || p.handle) + " (@" + p.handle + ") · Csariel's";
        var desc = "Perfil público de " + (p.nombre || p.handle) + " en Csariel's · WEB3";
        var img = safeHttps(p.avatar_url) || "";
        document.title = titulo;
        var set = function (id, attr, val) {
            var n = document.getElementById(id);
            if (n) n.setAttribute(attr, val);
        };
        set('ogTitle', 'content', titulo);
        set('ogDesc', 'content', desc);
        set('ogImage', 'content', img);
        set('canonicalLink', 'href', url);
    }

    async function cargarWallet(client, id) {
        var r = await client.from('wallet_publica').select('wallet_address').eq('id', id).maybeSingle();
        if (r.error || !r.data || !r.data.wallet_address) return;
        direccionWallet = r.data.wallet_address;
        el.walletDir.textContent = acortar(direccionWallet);
        el.wallet.hidden = false;
    }

    function copiarWallet() {
        if (!direccionWallet || !navigator.clipboard) return;
        navigator.clipboard.writeText(direccionWallet).then(function () {
            toast('Dirección copiada', 'success');
        }).catch(function () {
            toast('No se pudo copiar', 'error');
        });
    }

    async function compartirPerfil() {
        var url = urlPerfil();
        var texto = (perfil.nombre || perfil.handle) + ' en Csariel\'s';
        if (navigator.share) {
            try { await navigator.share({ title: texto, text: texto, url: url }); return; }
            catch (e) { if (e && e.name === 'AbortError') return; }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
                toast('Enlace copiado', 'success');
            }).catch(function () { window.prompt('Copia este enlace:', url); });
        } else { window.prompt('Copia este enlace:', url); }
    }

    /* ================= AMIGOS ================= */
    function cargarAmigos(client, id) {
        if (!el.amigosSection) return;
        el.amigosSection.hidden = false;
        if (window.PerfilPublicoAmigos && typeof window.PerfilPublicoAmigos.cargar === 'function') {
            window.PerfilPublicoAmigos.cargar(client, id);
        }
    }

    /* ================= MEDIA Y PUBLICACIONES ================= */
    function extraerListaMediaPost(p) {
        var lista = [];
        if (Array.isArray(p.media_items)) {
            p.media_items.forEach(function (m) {
                var u = safeHttps(m && (m.url || m.media_url));
                if (!u) return;
                var t = String((m && (m.tipo || m.media_type)) || '').toLowerCase();
                if (!t) t = /\.(mp4|webm|mov)(\?|$)/i.test(u) ? 'video' : 'imagen';
                lista.push({ url: u, tipo: t });
            });
        }
        if (!lista.length) {
            var uPrincipal = safeHttps(p.media_url);
            if (uPrincipal) {
                var tPrincipal = String(p.media_type || '').toLowerCase();
                if (!tPrincipal) {
                    if (/\.(mp4|webm|mov)(\?|$)/i.test(uPrincipal)) tPrincipal = 'video';
                    else if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(uPrincipal)) tPrincipal = 'audio';
                    else tPrincipal = 'imagen';
                }
                lista.push({ url: uPrincipal, tipo: tPrincipal });
            }
        }
        return lista;
    }

    function resolverMedia(p) {
        var items = extraerListaMediaPost(p);
        return items.length ? items[0] : null;
    }

    function renderMedia(meta, p) {
        var items = extraerListaMediaPost(p);
        var media = items[0];
        if (!media) return;
        var sinDescarga = p.permitir_descarga === false;

        if (media.tipo === 'video') {
            var cont = document.createElement('div');
            cont.className = 'pub-media-container';

            var vid = document.createElement('video');
            vid.className = 'pv-post-video';
            vid.src = media.url;
            vid.controls = false;
            vid.preload = 'metadata';
            vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');
            if (sinDescarga) vid.setAttribute('controlsList', 'nodownload');

            registrarReproductorUnico(vid);
            cont.appendChild(vid);

            cont.addEventListener('click', function () {
                try { vid.pause(); } catch (e) {}
                abrirVisorInmersivo(items, 0, p);
            });

            meta.appendChild(cont);
        } else if (media.tipo === 'audio') {
            var aud = document.createElement('audio');
            aud.className = 'pv-post-audio';
            aud.src = media.url;
            aud.controls = true;
            aud.preload = 'none';
            if (sinDescarga) aud.setAttribute('controlsList', 'nodownload');
            registrarReproductorUnico(aud);
            meta.appendChild(aud);
        } else {
            var contImg = document.createElement('div');
            contImg.className = 'pub-media-container';

            var img = document.createElement('img');
            img.className = 'pv-post-img';
            img.alt = '';
            img.loading = 'eager';
            img.decoding = 'async';
            img.src = media.url;
            contImg.appendChild(img);

            contImg.addEventListener('click', function () {
                abrirVisorInmersivo(items, 0, p);
            });
            meta.appendChild(contImg);
        }
    }

    /* ================= REACCIONES EN CÁPSULA VERTICAL (.reaccion-wrap) ================= */
    function cerrarTodosLosDropdownsReaccion(excepto) {
        document.querySelectorAll('.reaccion-dropdown').forEach(function (dd) {
            if (dd !== excepto) dd.hidden = true;
        });
    }

    function pintarBarraReacciones(bar, resumen) {
        var rg = RG();
        var r = resumen || { totales: {}, total: 0, miTipo: null };
        bar.innerHTML = '';
        bar._resumen = r;

        var wrap = document.createElement('div');
        wrap.className = 'reaccion-wrap';

        var dropdown = document.createElement('div');
        dropdown.className = 'reaccion-dropdown';
        dropdown.hidden = true;
        dropdown.setAttribute('role', 'menu');

        REACCIONES_CATALOGO.forEach(function (emoji) {
            var optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.className = 'reaccion-opcion-btn' + (r.miTipo === emoji ? ' activo' : '');
            optBtn.setAttribute('data-tipo', emoji);
            optBtn.setAttribute('aria-label', 'Reaccionar con ' + emoji);

            var emoSpan = document.createElement('span');
            emoSpan.textContent = emoji;
            aplicarAnimacionEmoji(emoSpan, emoji);
            if (typeof rg.aplicarMotor === 'function') {
                rg.aplicarMotor(emoSpan, emoji);
            }

            var mini = document.createElement('span');
            mini.className = 'mini-count';
            var n = r.totales[emoji] || 0;
            mini.textContent = n > 0 ? String(n) : '';

            optBtn.appendChild(emoSpan);
            optBtn.appendChild(mini);
            dropdown.appendChild(optBtn);
        });

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'reaccion-trigger' + (r.miTipo ? ' activo' : '');
        trigger.setAttribute('aria-haspopup', 'true');
        trigger.setAttribute('aria-expanded', 'false');

        var activeEmojiSpan = document.createElement('span');
        var emojiActivo = r.miTipo || rg.POR_DEFECTO || '❤️';
        activeEmojiSpan.textContent = emojiActivo;
        aplicarAnimacionEmoji(activeEmojiSpan, emojiActivo);

        var labelSpan = document.createElement('span');
        labelSpan.textContent = r.total > 0 ? String(r.total) : 'Reaccionar';

        trigger.appendChild(activeEmojiSpan);
        trigger.appendChild(labelSpan);

        trigger.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var seraAbierto = dropdown.hidden;
            cerrarTodosLosDropdownsReaccion(dropdown);
            dropdown.hidden = !seraAbierto;
            trigger.setAttribute('aria-expanded', String(seraAbierto));
            if (seraAbierto) {
                dropdown.querySelectorAll('.reaccion-opcion-btn span:first-child').forEach(function (sp, idx) {
                    aplicarAnimacionEmoji(sp, REACCIONES_CATALOGO[idx]);
                });
            }
        });

        wrap.appendChild(dropdown);
        wrap.appendChild(trigger);
        bar.appendChild(wrap);
    }

    async function refrescarReacciones(client, pubId, bar) {
        var r = await client.from('publicaciones_reacciones').select('tipo, usuario_id').eq('publicacion_id', pubId);
        if (r.error) throw r.error;
        pintarBarraReacciones(bar, RG().resumir(r.data || [], window.usuarioActualId));
    }

    async function alternarReaccion(client, pubId, tipo, bar) {
        if (!window.usuarioActualId) {
            toast('Inicia sesión para reaccionar', 'error');
            return;
        }
        var botones = bar.querySelectorAll('button');
        botones.forEach(function (b) { b.disabled = true; });
        try {
            var miTipo = bar._resumen ? bar._resumen.miTipo : null;
            var res;
            if (miTipo === tipo) {
                res = await client.from('publicaciones_reacciones').delete().eq('publicacion_id', pubId).eq('usuario_id', window.usuarioActualId);
            } else if (miTipo) {
                res = await client.from('publicaciones_reacciones').update({ tipo: tipo }).eq('publicacion_id', pubId).eq('usuario_id', window.usuarioActualId);
            } else {
                res = await client.from('publicaciones_reacciones').insert({ publicacion_id: pubId, usuario_id: window.usuarioActualId, tipo: tipo });
            }
            if (res.error) throw res.error;
            await refrescarReacciones(client, pubId, bar);
        } catch (e) {
            console.warn('[PerfilPublico] Reacción:', e);
            toast('No se pudo reaccionar: ' + msgError(e), 'error');
        } finally {
            botones.forEach(function (b) { b.disabled = false; });
        }
    }

    function pintarComentarios(listaEl, filas) {
        listaEl.innerHTML = '';
        if (!filas.length) {
            var vacio = document.createElement('div');
            vacio.className = 'pv-comentario-item';
            vacio.textContent = 'Sin comentarios todavía.';
            listaEl.appendChild(vacio);
            return;
        }
        filas.forEach(function (c) {
            var item = document.createElement('div');
            item.className = 'pv-comentario-item';
            var autor = document.createElement('span');
            autor.className = 'pv-comentario-autor';
            autor.textContent = c.usuario_nombre || c.usuario_handle || 'Miembro';
            var txt = document.createElement('span');
            txt.textContent = c.contenido || '';
            item.appendChild(autor); item.appendChild(txt);
            listaEl.appendChild(item);
        });
    }

    async function cargarComentarios(client, pubId, listaEl, countEl) {
        listaEl.innerHTML = '<div class="pv-comentario-item">Cargando comentarios...</div>';
        try {
            var r = await client
                .from('publicaciones_comentarios_publicos')
                .select('id, usuario_id, contenido, created_at, usuario_nombre, usuario_handle')
                .eq('publicacion_id', pubId)
                .order('created_at', { ascending: true })
                .limit(COMENTARIOS_LIMITE);
            if (r.error) throw r.error;
            var filas = Array.isArray(r.data) ? r.data : [];
            pintarComentarios(listaEl, filas);
            if (countEl) countEl.textContent = String(filas.length);
        } catch (e) {
            console.warn('[PerfilPublico] Comentarios:', e);
            listaEl.innerHTML = '<div class="pv-comentario-item">No se pudieron cargar los comentarios: ' + msgError(e) + '</div>';
        }
    }

    async function enviarComentario(client, pubId, inputEl, listaEl, countEl) {
        if (!window.usuarioActualId) {
            toast('Inicia sesión para comentar', 'error');
            return;
        }
        var texto = String(inputEl.value || '').trim();
        if (!texto) return;
        inputEl.disabled = true;
        try {
            var ins = await client.from('publicaciones_comentarios').insert({ publicacion_id: pubId, usuario_id: window.usuarioActualId, contenido: texto });
            if (ins.error) throw ins.error;
            inputEl.value = '';
            await cargarComentarios(client, pubId, listaEl, countEl);
        } catch (e) {
            console.warn('[PerfilPublico] Comentar:', e);
            toast('No se pudo comentar: ' + msgError(e), 'error');
        } finally {
            inputEl.disabled = false; inputEl.focus();
        }
    }

    function crearPost(client, p) {
        var pubId = p.id;
        var art = document.createElement('article');
        art.className = 'pv-post';

        var av = document.createElement('div');
        av.className = 'pv-post-av';
        var avatarUrl = safeHttps(p.usuario_avatar_url);
        if (avatarUrl) {
            var im = document.createElement('img'); im.alt = ''; im.src = avatarUrl;
            av.appendChild(im);
        } else {
            av.textContent = (p.usuario_nombre || 'U').charAt(0).toUpperCase();
        }

        var meta = document.createElement('div');
        meta.className = 'pv-post-meta';

        var nombre = document.createElement('div');
        nombre.className = 'pv-post-nombre';
        nombre.textContent = p.usuario_nombre || p.usuario_handle || 'Usuario';

        var sub = document.createElement('div');
        sub.className = 'pv-post-sub';
        sub.textContent = (p.usuario_handle ? '@' + p.usuario_handle + ' · ' : '') + fechaPost(p.created_at);

        meta.appendChild(nombre); meta.appendChild(sub);

        if (p.contenido) {
            var texto = document.createElement('div');
            texto.className = 'pv-post-texto';
            texto.textContent = p.contenido;
            meta.appendChild(texto);
        }

        renderMedia(meta, p);

        if (p.aviso_moderacion === 'lenguaje_inapropiado') {
            var aviso = document.createElement('div');
            aviso.className = 'pv-post-aviso';
            aviso.textContent = 'Este mensaje contiene lenguaje inapropiado.';
            meta.appendChild(aviso);
        }

        var barra = document.createElement('div');
        barra.className = 'pv-post-barra';

        var reacciones = document.createElement('div');
        reacciones.className = 'pv-reacciones';
        reacciones.dataset.pubId = pubId;

        var btnCom = document.createElement('button');
        btnCom.type = 'button';
        btnCom.className = 'pv-btn-comentar';
        var iconoCom = document.createElement('span');
        iconoCom.textContent = '💬';
        var comCount = document.createElement('span');
        comCount.textContent = String(Number(p.comentarios) || 0);
        btnCom.appendChild(iconoCom); btnCom.appendChild(comCount);

        barra.appendChild(reacciones); barra.appendChild(btnCom);
        meta.appendChild(barra);

        var cajaCom = document.createElement('div');
        cajaCom.className = 'pv-comentarios';
        cajaCom.hidden = true;

        var listaCom = document.createElement('div');
        listaCom.className = 'pv-comentarios-lista';

        var formCom = document.createElement('form');
        formCom.className = 'pv-comentario-form';

        var inputCom = document.createElement('input');
        inputCom.type = 'text'; inputCom.className = 'pv-comentario-input';
        inputCom.maxLength = 500; inputCom.placeholder = 'Escribe un comentario...';
        inputCom.setAttribute('aria-label', 'Escribe un comentario');

        var btnEnviar = document.createElement('button');
        btnEnviar.type = 'submit';
        btnEnviar.className = 'btn btn-outline btn-sm';
        btnEnviar.textContent = 'Enviar';

        formCom.appendChild(inputCom); formCom.appendChild(btnEnviar);
        cajaCom.appendChild(listaCom); cajaCom.appendChild(formCom);
        meta.appendChild(cajaCom);

        btnCom.addEventListener('click', function () {
            var abrir = cajaCom.hidden;
            cajaCom.hidden = !abrir;
            if (abrir) cargarComentarios(client, pubId, listaCom, comCount);
        });

        formCom.addEventListener('submit', function (ev) {
            ev.preventDefault();
            enviarComentario(client, pubId, inputCom, listaCom, comCount);
        });

        reacciones.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var optBtn = ev.target.closest('button.reaccion-opcion-btn[data-tipo]');
            if (!optBtn) return;
            var dd = reacciones.querySelector('.reaccion-dropdown');
            if (dd) dd.hidden = true;
            alternarReaccion(client, pubId, optBtn.getAttribute('data-tipo'), reacciones);
        });

        art.appendChild(av); art.appendChild(meta);
        return art;
    }

    function mostrarMensajePub(texto) {
        el.pubMsg.textContent = texto || '';
        el.pubMsg.hidden = !texto;
    }

    async function cargarPublicaciones(client, handle, reiniciar) {
        if (pub.cargando || !handle) return;
        pub.cargando = true;

        if (reiniciar) {
            pub.antes = null; pub.total = 0; pub.idsVistos.clear();
            el.pubLista.innerHTML = '';
        }
        el.pubMas.disabled = true;

        try {
            var r = await conTimeout(
                client.rpc('perfil_publicaciones_contactos', {
                    p_handle: handle, p_antes: reiniciar ? null : pub.antes, p_limite: POSTS_PAGE
                }),
                TIMEOUT_PERFIL_MS,
                'Las publicaciones tardaron demasiado en cargar.'
            );
            if (r.error) {
                el.pubSection.hidden = false; el.pubMas.hidden = true;
                mostrarMensajePub(r.error.code === '42501'
                    ? 'Inicia sesión para ver las publicaciones de tus contactos.'
                    : 'No se pudieron cargar las publicaciones.');
                return;
            }
            var d = r.data || {};
            if (d.estado === 'bloqueado' || d.estado === 'no_encontrado') { el.pubSection.hidden = true; return; }
            el.pubSection.hidden = false;
            if (d.estado === 'no_autenticado') {
                el.pubLista.innerHTML = ''; el.pubMas.hidden = true; el.pubContador.textContent = '';
                mostrarMensajePub('Inicia sesión para ver las publicaciones de tus contactos.');
                return;
            }
            if (d.estado === 'no_contacto') {
                el.pubLista.innerHTML = ''; el.pubMas.hidden = true; el.pubContador.textContent = '';
                mostrarMensajePub('Solo tus contactos pueden ver las publicaciones de esta persona.');
                return;
            }

            var posts = Array.isArray(d.posts) ? d.posts : [];
            var nuevos = posts.filter(function (p) {
                if (!p.id || pub.idsVistos.has(p.id)) return false;
                pub.idsVistos.add(p.id); return true;
            });

            var ids = nuevos.map(function (p) { return p.id; });
            var resumenes = new Map();
            if (ids.length) {
                try {
                    var rReac = await client.from('publicaciones_reacciones').select('publicacion_id, tipo, usuario_id').in('publicacion_id', ids);
                    var porPub = {};
                    (rReac.data || []).forEach(function (row) {
                        var k = String(row.publicacion_id);
                        if (!porPub[k]) porPub[k] = [];
                        porPub[k].push(row);
                    });
                    ids.forEach(function (id) {
                        resumenes.set(String(id), RG().resumir(porPub[String(id)] || [], window.usuarioActualId));
                    });
                } catch (e) { console.warn('[PerfilPublico] Reacciones batch:', e); }
            }

            nuevos.forEach(function (p) {
                var card = crearPost(client, p);
                el.pubLista.appendChild(card);
                var bar = card.querySelector('.pv-reacciones');
                if (bar) pintarBarraReacciones(bar, resumenes.get(String(p.id)) || { totales: {}, total: 0, miTipo: null });
            });

            pub.total += nuevos.length;
            if (posts.length) pub.antes = posts[posts.length - 1].created_at;
            el.pubContador.textContent = pub.total ? String(pub.total) : '';
            mostrarMensajePub(pub.total ? '' : 'Sin publicaciones');
            el.pubMas.hidden = posts.length < POSTS_PAGE;
        } catch (e) {
            console.warn('[PerfilPublico] Publicaciones:', e);
            el.pubSection.hidden = false;
            mostrarMensajePub('No se pudieron cargar las publicaciones: ' + msgError(e));
        } finally {
            pub.cargando = false; el.pubMas.disabled = false;
        }
    }

    window.PerfilPublicoPosts = {
        crearPost: crearPost,
        pintarBarraReacciones: pintarBarraReacciones,
        cerrarLightbox: cerrarLightbox,
        abrirLightbox: abrirLightbox,
        abrirVisorInmersivo: abrirVisorInmersivo,
        cerrarVisorInmersivo: cerrarVisorInmersivo,
        toast: toast,
        msgError: msgError,
        safeHttps: safeHttps
    };

    window.PerfilPublicoEmojiPicker = {
        alternar: alternarPicker97Emojis,
        insertar: insertarEmojiEnCursor,
        emojis: EMOJIS_97
    };

    /* ================= EVENTOS ================= */
    function mismoOrigenReferrer() {
        try { return !!document.referrer && new URL(document.referrer).origin === window.location.origin; }
        catch (e) { return false; }
    }

    function configurarVolver() {
        if (el.volver) {
            el.volver.addEventListener('click', function (e) {
                if (window.history.length > 1 && mismoOrigenReferrer()) {
                    e.preventDefault();
                    window.history.back();
                }
            });
            if (!mismoOrigenReferrer()) {
                el.volver.setAttribute('href', '/');
                el.volver.textContent = '← Ir al inicio';
            }
        }
        var volverNoEnc = document.getElementById('pvVolverNoEncontrado');
        if (volverNoEnc && !mismoOrigenReferrer()) {
            volverNoEnc.setAttribute('href', '/');
            volverNoEnc.textContent = '← Ir al inicio';
        }
    }

    /* ================= CLIENTE Y SESIÓN (con límite de tiempo) ================= */
    async function obtenerCliente() {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.__sarielsSupabaseSingleton) return window.__sarielsSupabaseSingleton;

        if (window.supabaseReady && typeof window.supabaseReady.then === 'function') {
            try {
                var c = await conTimeout(window.supabaseReady, TIMEOUT_CLIENTE_MS, 'El cliente de Supabase no respondió.');
                if (c) return c;
            } catch (e) {
                console.warn('[PerfilPublico] supabaseReady:', e);
            }
        }

        var intentos = 0;
        while (intentos < 20) {
            if (window.supabaseClient) return window.supabaseClient;
            await new Promise(function (r) { setTimeout(r, 100); });
            intentos++;
        }
        return window.supabaseClient || null;
    }

    async function resolverSesion(client) {
        try {
            var r = await conTimeout(client.auth.getSession(), TIMEOUT_SESION_MS, 'La sesión tardó demasiado.');
            var user = r && r.data && r.data.session ? r.data.session.user : null;
            window.usuarioActualId = user ? user.id : null;
        } catch (e) {
            console.warn('[PerfilPublico] Sesión:', e);
            window.usuarioActualId = null;
        }
        return window.usuarioActualId;
    }

    /* ================= INIT ================= */
    async function init() {
        console.info('[PerfilPublico] iniciando');
        inyectarEstilosBase();
        construirVisorInmersivo();
        asegurarPicker97Emojis();
        mostrar(el.cargando);
        configurarVolver();

        var ident = leerIdentificador();
        if (!ident) { mostrar(el.noEncontrado); return; }
        if (ident.tipo === 'invalido') { mostrarErrorIdentidad(); return; }

        var client = await obtenerCliente();
        if (!client) {
            mostrarErrorGeneral('No se pudo conectar con la base de datos. Recarga la página.');
            return;
        }

        await resolverSesion(client);

        try {
            client.auth.onAuthStateChange(function (_e, sesion) {
                window.usuarioActualId = (sesion && sesion.user) ? sesion.user.id : null;
            });
        } catch (e) {}

        var p = await cargarPerfil(client, ident);

        if (!p) {
            var vis = await resolverSinPerfil(client, ident);
            if (vis === 'restringido') {
                mensajeNoEncontrado('Perfil restringido', 'Este perfil está restringido. Solo sus contactos pueden verlo.');
            } else if (vis === 'bloqueado' || vis === 'no_disponible') {
                mensajeNoEncontrado('Perfil no disponible', 'Este perfil no está disponible en este momento.');
            } else if (ident.tipo === 'verificado') {
                mostrarErrorIdentidad();
            } else {
                mostrar(el.noEncontrado);
            }
            return;
        }

        if (!p.handle && !p.nombre) { mostrar(el.noEncontrado); return; }

        if (ident.tipo === 'verificado' &&
            String(p.handle || '').toLowerCase() !== ident.handle.toLowerCase()) {
            mostrarErrorIdentidad(); return;
        }

        if (window.usuarioActualId && p.id === window.usuarioActualId) {
            window.location.replace(RUTA_PERFIL_PROPIO); return;
        }

        perfil = p;
        renderPerfil(p);
        mostrar(el.perfil);

        cargarWallet(client, p.id).catch(function (e) {
            console.warn('[PerfilPublico] Wallet:', e);
        });

        cargarAmigos(client, p.id);
        cargarPublicaciones(client, p.handle, true);
    }

    /* ================= LISTENERS ================= */
    el.wallet.addEventListener('click', copiarWallet);
    el.compartir.addEventListener('click', compartirPerfil);
    el.reintentar.addEventListener('click', function () { window.location.reload(); });
    el.pubMas.addEventListener('click', async function () {
        var client = await obtenerCliente();
        if (client && perfil && perfil.handle) cargarPublicaciones(client, perfil.handle, false);
    });

    if (el.lightboxCerrar) el.lightboxCerrar.addEventListener('click', cerrarLightbox);
    if (el.lightbox) {
        el.lightbox.addEventListener('click', function (e) {
            if (e.target === el.lightbox) cerrarLightbox();
        });
    }

    document.addEventListener('click', function (ev) {
        if (!ev.target.closest('.reaccion-wrap')) {
            cerrarTodosLosDropdownsReaccion(null);
        }
        var picker = $('emojiPickerPerfil');
        if (picker && !picker.hidden && !picker.contains(ev.target) && !ev.target.closest('[data-emoji-picker-trigger]')) {
            picker.hidden = true;
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (vf.sheet && !vf.sheet.hidden) {
                cerrarSheetVisor();
                return;
            }
            if (vf.root && !vf.root.hidden) {
                cerrarVisorInmersivo(false);
                return;
            }
            if (el.lightbox && !el.lightbox.hidden) cerrarLightbox();
            var picker = $('emojiPickerPerfil');
            if (picker && !picker.hidden) picker.hidden = true;
        }
    });

    /* ================= ARRANQUE ================= */
    function arrancar() {
        init().catch(function (err) {
            console.error('[PerfilPublico]', err);
            mostrarErrorGeneral(msgError(err));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar);
    } else {
        arrancar();
    }
})();
