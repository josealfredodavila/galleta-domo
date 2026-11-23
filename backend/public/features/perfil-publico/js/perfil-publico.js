/* ================================================================
   PERFIL-PUBLICO.JS — Csariel's
   v3.2 · EMOJIS COMPACTOS + MOVIMIENTO 5X
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

    var EMOJIS_REACCION = ['❤️', '😂', '🥺', '💎'];

    var CLASES_EMOJI = {
        '❤️': 'emo-corazon',
        '😂': 'emo-risa',
        '🥺': 'emo-brillo',
        '💎': 'emo-diamante',
        '🤩': 'emo-estrellas'
    };

    var EMOJIS_97 = [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
        '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
        '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
        '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
        '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
        '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
        '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺',
        '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
        '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '👍',
        '👎', '👏', '🙌', '🔥', '💎', '❤️'
    ];

    var perfil = null;
    var direccionWallet = null;
    var pub = { cargando: false, antes: null, total: 0, idsVistos: new Set() };
    var medioActivo = null;

    var visorFullState = {
        abierto: false,
        items: [],
        indice: 0,
        post: null,
        modoFit: 'contain',
        velocidades: [1, 1.5, 2],
        velIndex: 0,
        ocultarTimer: null,
        arrastrando: false,
        startX: 0,
        startY: 0,
        movido: false,
        motivoReporte: ''
    };

    var inputEmojiDestino = null;

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

    /* ============================================================
       EMOJIS · CSS DINÁMICO v3.2
       Tamaño reducido y movimiento 5 veces más rápido e intenso.
       No modifica Supabase ni las conexiones existentes.
       ============================================================ */

    function instalarEstilosEmojis() {
        if ($('pvEmojisCSS32')) return;

        var css = document.createElement('style');
        css.id = 'pvEmojisCSS32';

        css.textContent = `
            /* SELECTOR DE 97 EMOJIS · TAMAÑO COMPACTO */
            #emojiGridPerfil .emoji-item {
                font-size: 14px !important;
                line-height: 1.2 !important;
                min-width: 20px;
                min-height: 20px;
                padding: 2px !important;
                border-radius: 6px !important;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transform: translateZ(0);
                transition:
                    transform .08s ease,
                    background .08s ease,
                    filter .08s ease;
                -webkit-tap-highlight-color: transparent;
            }

            #emojiGridPerfil .emoji-item:hover {
                transform: scale(1.35) rotate(-8deg);
                background: rgba(0, 229, 255, .13) !important;
                filter: drop-shadow(0 0 3px rgba(0, 229, 255, .4));
            }

            #emojiGridPerfil .emoji-item:active {
                transform: scale(1.45) rotate(8deg);
                background: rgba(212, 175, 55, .20) !important;
            }

            /* EMOJIS PRINCIPALES DE REACCIONES */
            .reaccion-trigger .emoji-actual {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 15px !important;
                line-height: 1.1;
                transform-origin: center;
                will-change: transform, filter;
                animation: pvEmojiTurbo32 var(--dur, .16s) linear infinite !important;
            }

            /* EMOJIS DEL MENÚ DE REACCIONES */
            .reaccion-opcion-btn {
                min-width: 22px;
                min-height: 22px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 2px;
            }

            .reaccion-opcion-btn > span:first-child {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 14px !important;
                line-height: 1.1;
                transform-origin: center;
                will-change: transform, filter;
                animation: pvEmojiTurbo32 var(--dur, .16s) linear infinite !important;
            }

            /* ACTIVACIÓN */
            .reaccion-trigger:active,
            .reaccion-opcion-btn:active {
                transform: scale(1.08);
            }

            .reaccion-trigger.activo .emoji-actual {
                filter: drop-shadow(0 0 3px rgba(212, 175, 55, .5));
            }

            .reaccion-opcion-btn.activo > span:first-child {
                filter: drop-shadow(0 0 4px rgba(0, 229, 255, .6));
            }

            /* MOVIMIENTO 5X: MÁS FRECUENCIA, GIRO Y DESPLAZAMIENTO */
            @keyframes pvEmojiTurbo32 {
                0% {
                    transform: translateY(0) scale(1) rotate(0deg);
                }
                20% {
                    transform: translateY(-3px) scale(1.28) rotate(-14deg);
                }
                40% {
                    transform: translateY(2px) scale(.92) rotate(12deg);
                }
                60% {
                    transform: translateY(-4px) scale(1.38) rotate(-16deg);
                }
                80% {
                    transform: translateY(2px) scale(.96) rotate(14deg);
                }
                100% {
                    transform: translateY(0) scale(1) rotate(0deg);
                }
            }

            /* EFECTOS SUTILES POR TIPO DE REACCIÓN */
            .emo-corazon {
                filter: drop-shadow(0 0 3px rgba(255, 55, 105, .3));
            }

            .emo-risa {
                filter: drop-shadow(0 0 3px rgba(255, 205, 50, .3));
            }

            .emo-brillo {
                filter: drop-shadow(0 0 3px rgba(0, 229, 255, .3));
            }

            .emo-diamante {
                filter: drop-shadow(0 0 4px rgba(0, 229, 255, .4));
            }

            .emo-estrellas {
                filter: drop-shadow(0 0 4px rgba(255, 215, 0, .4));
            }

            /* CONTADORES */
            .reaccion-trigger .mini-count,
            .reaccion-opcion-btn .mini-count {
                font-size: 11px;
                font-weight: 700;
            }

            /* RESPETO A USUARIOS QUE PREFIEREN MENOS MOVIMIENTO */
            @media (prefers-reduced-motion: reduce) {
                .reaccion-trigger .emoji-actual,
                .reaccion-opcion-btn > span:first-child,
                #emojiGridPerfil .emoji-item {
                    animation: none !important;
                    transition: none !important;
                }
            }
        `;

        document.head.appendChild(css);
    }

    /* ================= UTILIDADES ================= */

    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, tipo || 'success');
            return;
        }

        var t = $('toast');
        if (!t) return;

        t.textContent = String(msg || '');
        t.className = 'toast' + (tipo ? ' ' + tipo : '');

        requestAnimationFrame(function () {
            t.classList.add('show');
        });

        clearTimeout(window.__pvToastTimer);

        window.__pvToastTimer = setTimeout(function () {
            t.classList.remove('show');
        }, 3600);
    }

    function msgError(e) {
        if (!e) return 'error desconocido';
        return e.message || e.details || e.hint || e.code || 'error desconocido';
    }

    function conTimeout(promesa, ms, mensaje) {
        var id;

        var limite = new Promise(function (_, reject) {
            id = setTimeout(function () {
                reject(new Error(mensaje));
            }, ms);
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
        } catch (e) {
            return null;
        }
    }

    function mostrar(panel) {
        [el.cargando, el.noEncontrado, el.error, el.perfil].forEach(function (n) {
            if (n) n.hidden = (n !== panel);
        });
    }

    function acortar(d) {
        return d.slice(0, 6) + '…' + d.slice(-4);
    }

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

        return d.toLocaleString('es-MX', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatearDuracion(seg) {
        if (!isFinite(seg) || seg < 0) seg = 0;

        var s = Math.floor(seg);
        var m = Math.floor(s / 60);
        var r = s % 60;

        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function urlPerfil() {
        return window.location.origin + window.location.pathname +
            '?u=' + encodeURIComponent(perfil.handle);
    }

    /* ============================================================
       ANIMACIÓN DE EMOJIS · VELOCIDAD 5X
       ============================================================ */

    function aplicarVariablesEmoji(nodo, emoji) {
        if (!nodo) return;

        var cls = CLASES_EMOJI[emoji] || 'emo-fluido';

        nodo.classList.remove(
            'emo-corazon',
            'emo-risa',
            'emo-brillo',
            'emo-diamante',
            'emo-estrellas',
            'emo-fluido'
        );

        nodo.classList.add(cls);

        /* Ciclo de animación 5 veces más rápido. */
        nodo.style.setProperty(
            '--dur',
            (0.13 + Math.random() * 0.06).toFixed(2) + 's'
        );

        nodo.style.setProperty(
            '--delay',
            (Math.random() * 0.02).toFixed(2) + 's'
        );
    }

    function RG() {
        return window.ReaccionesGlobal || {
            EMOJIS: EMOJIS_REACCION,
            POR_DEFECTO: '❤️',

            normalizar: function (e) {
                return this.EMOJIS.indexOf(e) !== -1 ? e : '❤️';
            },

            aplicarMotor: function (nodo, emoji) {
                aplicarVariablesEmoji(nodo, emoji);
            },

            resumir: function (filas, uid) {
                var t = {}, total = 0, mi = null, self = this;

                (filas || []).forEach(function (f) {
                    var x = self.normalizar(f.tipo);

                    t[x] = (t[x] || 0) + 1;
                    total++;

                    if (uid && f.usuario_id === uid) mi = x;
                });

                return {
                    totales: t,
                    total: total,
                    miTipo: mi
                };
            }
        };
    }

    function registrarReproductorUnico(elMedia) {
        elMedia.addEventListener('play', function () {
            if (medioActivo && medioActivo !== elMedia) {
                try {
                    medioActivo.pause();
                } catch (e) {}
            }

            medioActivo = elMedia;
        });
    }

    /* ================= VISOR INMERSIVO ================= */

    function vfNodo() {
        return {
            root: $('pubVisorFull'),
            media: document.querySelector('#pubVisorFull .pub-vf-media'),
            btnClose: $('btnPubVfClose'),
            btnMenu: $('btnPubVfMenu'),
            centerControls: $('pubVfCenterControls'),
            btnPlayCenter: $('pubVfBtnPlayCenter'),
            controls: document.querySelector('#pubVisorFull .pub-vf-controls'),
            progressBar: $('pubVfProgressBar'),
            progressFill: $('pubVfProgressFill'),
            timeLabel: $('pubVfTimeLabel'),
            btnSpeed: $('btnPubVfSpeed'),
            btnPip: $('btnPubVfPip'),
            btnExpand: $('btnPubVfExpand'),
            sheetBackdrop: $('pubVfSheetBackdrop'),
            sheet: $('pubVfSheet'),
            sheetTrack: document.querySelector('#pubVfSheet .pub-vf-sheet-track'),
            sheetViews: document.querySelectorAll('#pubVfSheet .pub-vf-sheet-view')
        };
    }

    function obtenerVideoVisorFull() {
        var n = vfNodo();
        return n.media ? n.media.querySelector('video') : null;
    }

    function aplicarEscalaVisorFull() {
        var n = vfNodo();

        if (!n.media) return;

        var elem = n.media.querySelector('video, img');

        if (!elem) return;

        elem.style.objectFit = visorFullState.modoFit;
        elem.style.objectPosition = 'center';
    }

    function alternarEscalaVisorFull() {
        visorFullState.modoFit =
            visorFullState.modoFit === 'cover' ? 'contain' : 'cover';

        aplicarEscalaVisorFull();
    }

    function limpiarTimerControlesVisorFull() {
        if (visorFullState.ocultarTimer) {
            clearTimeout(visorFullState.ocultarTimer);
            visorFullState.ocultarTimer = null;
        }
    }

    function mostrarControlesVisorFull(autoOcultar) {
        var n = vfNodo();

        if (!n.root) return;

        n.root.classList.remove('controls-hidden');

        limpiarTimerControlesVisorFull();

        var vid = obtenerVideoVisorFull();

        if (autoOcultar && vid && !vid.paused) {
            visorFullState.ocultarTimer = setTimeout(function () {
                if (
                    visorFullState.abierto &&
                    vid &&
                    !vid.paused &&
                    !visorFullState.arrastrando
                ) {
                    n.root.classList.add('controls-hidden');
                }
            }, 2500);
        }
    }

    function actualizarControlesPlayPausaVisorFull() {
        var n = vfNodo();
        var vid = obtenerVideoVisorFull();

        if (!vid) {
            if (n.centerControls) n.centerControls.hidden = true;
            if (n.controls) n.controls.hidden = true;

            mostrarControlesVisorFull(false);
            return;
        }

        if (n.controls) n.controls.hidden = false;

        if (vid.paused) {
            if (n.centerControls) n.centerControls.hidden = false;
            mostrarControlesVisorFull(false);
        } else {
            if (n.centerControls) n.centerControls.hidden = true;
            mostrarControlesVisorFull(true);
        }
    }

    function actualizarProgresoVisorFull() {
        var n = vfNodo();
        var vid = obtenerVideoVisorFull();

        if (!vid) return;

        var dur = vid.duration || 0;
        var cur = vid.currentTime || 0;

        var pct = dur > 0
            ? Math.min(100, Math.max(0, (cur / dur) * 100))
            : 0;

        if (n.progressFill) n.progressFill.style.width = pct + '%';

        if (n.timeLabel) {
            n.timeLabel.textContent =
                formatearDuracion(cur) + ' / ' + formatearDuracion(dur);
        }
    }

    function seekProgresoVisorFull(ev) {
        var n = vfNodo();
        var vid = obtenerVideoVisorFull();

        if (!vid || !n.progressBar || !isFinite(vid.duration) || vid.duration <= 0) {
            return;
        }

        var rect = n.progressBar.getBoundingClientRect();

        if (!rect.width) return;

        var ratio = Math.min(
            1,
            Math.max(0, (ev.clientX - rect.left) / rect.width)
        );

        vid.currentTime = ratio * vid.duration;

        actualizarProgresoVisorFull();
    }

    function renderizarItemVisorFull(idx) {
        var n = vfNodo();

        if (!n.media || !visorFullState.items.length) return;

        var len = visorFullState.items.length;
        var i = ((idx % len) + len) % len;

        visorFullState.indice = i;

        var item = visorFullState.items[i];
        var segura = safeHttps(item.url);

        if (!segura) return;

        var prevVid = obtenerVideoVisorFull();

        if (prevVid) {
            try {
                prevVid.pause();
            } catch (e) {}
        }

        n.media.innerHTML = '';

        visorFullState.velIndex = 0;

        if (n.btnSpeed) n.btnSpeed.textContent = '1x';

        if (item.tipo === 'video') {
            var vid = document.createElement('video');

            vid.src = segura;
            vid.controls = false;
            vid.playsInline = true;

            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');

            if (
                visorFullState.post &&
                visorFullState.post.permitir_descarga === false
            ) {
                vid.setAttribute('controlsList', 'nodownload');
            }

            vid.addEventListener('loadedmetadata', function () {
                if (vid.videoWidth && vid.videoHeight) {
                    visorFullState.modoFit =
                        vid.videoHeight > vid.videoWidth ? 'cover' : 'contain';

                    aplicarEscalaVisorFull();
                }

                actualizarProgresoVisorFull();
            });

            vid.addEventListener('timeupdate', actualizarProgresoVisorFull);
            vid.addEventListener('play', actualizarControlesPlayPausaVisorFull);
            vid.addEventListener('pause', actualizarControlesPlayPausaVisorFull);
            vid.addEventListener('ended', actualizarControlesPlayPausaVisorFull);

            registrarReproductorUnico(vid);

            n.media.appendChild(vid);

            aplicarEscalaVisorFull();
            actualizarProgresoVisorFull();

            vid.play()
                .then(actualizarControlesPlayPausaVisorFull)
                .catch(actualizarControlesPlayPausaVisorFull);

        } else {
            var img = document.createElement('img');

            img.src = segura;
            img.alt = '';

            img.addEventListener('load', function () {
                if (img.naturalWidth && img.naturalHeight) {
                    visorFullState.modoFit =
                        img.naturalHeight > img.naturalWidth ? 'cover' : 'contain';

                    aplicarEscalaVisorFull();
                }
            });

            n.media.appendChild(img);

            aplicarEscalaVisorFull();
            actualizarControlesPlayPausaVisorFull();
        }
    }

    function abrirVisorFull(items, idxInicial, postObj) {
        var n = vfNodo();

        if (!n.root || !Array.isArray(items) || !items.length) return;

        if (medioActivo) {
            try {
                medioActivo.pause();
            } catch (e) {}
        }

        visorFullState.abierto = true;
        visorFullState.items = items;
        visorFullState.post = postObj || null;
        visorFullState.modoFit = 'contain';

        n.root.hidden = false;

        renderizarItemVisorFull(idxInicial || 0);
    }

    function cerrarVisorFull(mantenerPip) {
        var n = vfNodo();

        cerrarSheetVisorFull();
        limpiarTimerControlesVisorFull();

        visorFullState.abierto = false;

        var vid = obtenerVideoVisorFull();

        if (vid && !mantenerPip) {
            try {
                vid.pause();
            } catch (e) {}

            if (medioActivo === vid) medioActivo = null;
        }

        if (n.media && !mantenerPip) {
            n.media.innerHTML = '';
        }

        if (n.root) {
            n.root.hidden = true;
            n.root.classList.remove('controls-hidden');
        }
    }

    /* ================= HOJA DESLIZABLE ================= */

    function irPasoSheet(paso) {
        var n = vfNodo();

        if (n.sheetTrack) {
            n.sheetTrack.style.transform =
                'translateX(-' + (paso * 33.3333) + '%)';
        }
    }

    function cerrarSheetVisorFull() {
        var n = vfNodo();

        if (n.sheetBackdrop) n.sheetBackdrop.hidden = true;
        if (n.sheet) n.sheet.hidden = true;

        irPasoSheet(0);
    }

    async function guardarBlobMediaActual() {
        var item = visorFullState.items[visorFullState.indice];

        if (!item || !item.url) return;

        if (
            visorFullState.post &&
            visorFullState.post.permitir_descarga === false
        ) {
            toast('La descarga está deshabilitada para este archivo', 'error');
            return;
        }

        try {
            toast('Descargando...', 'success');

            var res = await fetch(item.url);

            if (!res.ok) throw new Error('Error de red');

            var blob = await res.blob();

            var ext = item.tipo === 'video'
                ? 'mp4'
                : (item.tipo === 'audio' ? 'mp3' : 'jpg');

            var u = URL.createObjectURL(blob);
            var a = document.createElement('a');

            a.href = u;
            a.download = 'archivo-' + Date.now() + '.' + ext;

            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(function () {
                URL.revokeObjectURL(u);
            }, 2000);

        } catch (e) {
            toast('No se pudo guardar el archivo', 'error');
        }
    }

    function abrirSheetVisorFull() {
        var n = vfNodo();

        if (!n.sheet || !n.sheetViews || n.sheetViews.length < 3) return;

        var vistaPrincipal = n.sheetViews[0];
        var vistaMotivos = n.sheetViews[1];
        var vistaConfirmar = n.sheetViews[2];

        var post = visorFullState.post || {};

        var esDueno = Boolean(
            window.usuarioActualId &&
            post.usuario_id &&
            String(post.usuario_id) === String(window.usuarioActualId)
        );

        vistaPrincipal.innerHTML = '';

        var btnGuardar = document.createElement('button');

        btnGuardar.type = 'button';
        btnGuardar.className = 'btn btn-outline btn-sm';
        btnGuardar.style.width = '100%';
        btnGuardar.style.justifyContent = 'flex-start';
        btnGuardar.textContent = 'Guardar';

        btnGuardar.addEventListener('click', function () {
            cerrarSheetVisorFull();
            guardarBlobMediaActual();
        });

        vistaPrincipal.appendChild(btnGuardar);

        if (!esDueno) {
            var btnNoVer = document.createElement('button');

            btnNoVer.type = 'button';
            btnNoVer.className = 'btn btn-outline btn-sm';
            btnNoVer.style.width = '100%';
            btnNoVer.style.justifyContent = 'flex-start';
            btnNoVer.textContent = 'No quiero ver esto';

            btnNoVer.addEventListener('click', function () {
                if (post.id && el.pubLista) {
                    var rEl = el.pubLista.querySelector(
                        '[data-pub-id="' + post.id + '"]'
                    );

                    if (rEl && rEl.closest('.pv-post')) {
                        rEl.closest('.pv-post').remove();
                    }
                }

                cerrarSheetVisorFull();
                cerrarVisorFull(false);

                toast('Publicación ocultada', 'success');
            });

            vistaPrincipal.appendChild(btnNoVer);

            var btnReportar = document.createElement('button');

            btnReportar.type = 'button';
            btnReportar.className = 'btn btn-outline btn-sm';
            btnReportar.style.width = '100%';
            btnReportar.style.justifyContent = 'flex-start';
            btnReportar.textContent = 'Reportar →';

            btnReportar.addEventListener('click', function () {
                irPasoSheet(1);
            });

            vistaPrincipal.appendChild(btnReportar);

        } else {
            var btnEliminar = document.createElement('button');

            btnEliminar.type = 'button';
            btnEliminar.className = 'btn btn-outline btn-sm';
            btnEliminar.style.width = '100%';
            btnEliminar.style.justifyContent = 'flex-start';
            btnEliminar.textContent = 'Eliminar';

            btnEliminar.addEventListener('click', async function () {
                if (!post.id) return;

                try {
                    var client = await obtenerCliente();

                    if (!client) throw new Error('Sin conexión');

                    var del = await client
                        .from('publicaciones')
                        .delete()
                        .eq('id', post.id);

                    if (del.error) throw del.error;

                    if (el.pubLista) {
                        var card = el.pubLista.querySelector(
                            '[data-pub-id="' + post.id + '"]'
                        );

                        if (card && card.closest('.pv-post')) {
                            card.closest('.pv-post').remove();
                        }
                    }

                    cerrarSheetVisorFull();
                    cerrarVisorFull(false);

                    toast('Publicación eliminada', 'success');

                } catch (e) {
                    toast('No se pudo eliminar: ' + msgError(e), 'error');
                }
            });

            vistaPrincipal.appendChild(btnEliminar);
        }

        vistaMotivos.innerHTML = '';

        var btnVolver1 = document.createElement('button');

        btnVolver1.type = 'button';
        btnVolver1.className = 'btn btn-outline btn-sm';
        btnVolver1.textContent = '← Volver';

        btnVolver1.addEventListener('click', function () {
            irPasoSheet(0);
        });

        vistaMotivos.appendChild(btnVolver1);

        ['Spam', 'Contenido inapropiado', 'Acoso o fraude', 'Otro motivo'].forEach(function (mot) {
            var b = document.createElement('button');

            b.type = 'button';
            b.className = 'btn btn-outline btn-sm';
            b.style.width = '100%';
            b.style.justifyContent = 'flex-start';
            b.textContent = mot;

            b.addEventListener('click', function () {
                visorFullState.motivoReporte = mot;

                vistaConfirmar.innerHTML = '';

                var btnVolver2 = document.createElement('button');

                btnVolver2.type = 'button';
                btnVolver2.className = 'btn btn-outline btn-sm';
                btnVolver2.textContent = '← Motivos';

                btnVolver2.addEventListener('click', function () {
                    irPasoSheet(1);
                });

                vistaConfirmar.appendChild(btnVolver2);

                var pTxt = document.createElement('p');

                pTxt.style.margin = '8px 0';
                pTxt.textContent = 'Confirmar reporte por: ' + mot;

                vistaConfirmar.appendChild(pTxt);

                var btnEnviarRep = document.createElement('button');

                btnEnviarRep.type = 'button';
                btnEnviarRep.className = 'btn btn-outline btn-sm';
                btnEnviarRep.style.width = '100%';
                btnEnviarRep.textContent = 'Confirmar reporte';

                btnEnviarRep.addEventListener('click', async function () {
                    try {
                        var client = await obtenerCliente();

                        if (client && post.id && window.usuarioActualId) {
                            await client.from('publicaciones_reportes').insert({
                                publicacion_id: post.id,
                                usuario_id: window.usuarioActualId,
                                motivo: visorFullState.motivoReporte
                            });
                        }
                    } catch (e) {}

                    cerrarSheetVisorFull();

                    toast('Reporte enviado', 'success');
                });

                vistaConfirmar.appendChild(btnEnviarRep);

                irPasoSheet(2);
            });

            vistaMotivos.appendChild(b);
        });

        irPasoSheet(0);

        if (n.sheetBackdrop) n.sheetBackdrop.hidden = false;

        n.sheet.hidden = false;
    }

    function enlazarEventosVisorFull() {
        var n = vfNodo();

        if (!n.root) return;

        if (n.btnClose) {
            n.btnClose.addEventListener('click', function (ev) {
                ev.stopPropagation();
                cerrarVisorFull(false);
            });
        }

        if (n.btnMenu) {
            n.btnMenu.addEventListener('click', function (ev) {
                ev.stopPropagation();
                abrirSheetVisorFull();
            });
        }

        if (n.btnPlayCenter) {
            n.btnPlayCenter.addEventListener('click', function (ev) {
                ev.stopPropagation();

                var vid = obtenerVideoVisorFull();

                if (vid && vid.paused) {
                    vid.play().catch(function () {});
                }
            });
        }

        if (n.btnSpeed) {
            n.btnSpeed.addEventListener('click', function (ev) {
                ev.stopPropagation();

                visorFullState.velIndex =
                    (visorFullState.velIndex + 1) %
                    visorFullState.velocidades.length;

                var v = visorFullState.velocidades[visorFullState.velIndex];
                var vid = obtenerVideoVisorFull();

                if (vid) vid.playbackRate = v;

                n.btnSpeed.textContent = v + 'x';

                mostrarControlesVisorFull(true);
            });
        }

        if (n.btnPip) {
            n.btnPip.addEventListener('click', async function (ev) {
                ev.stopPropagation();

                var vid = obtenerVideoVisorFull();

                if (!vid || typeof vid.requestPictureInPicture !== 'function') {
                    toast('PiP no disponible', 'error');
                    return;
                }

                try {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    } else {
                        await vid.requestPictureInPicture();
                        cerrarVisorFull(true);
                    }
                } catch (e) {
                    toast('No se pudo activar PiP', 'error');
                }
            });
        }

        if (n.btnExpand) {
            n.btnExpand.addEventListener('click', function (ev) {
                ev.stopPropagation();
                alternarEscalaVisorFull();
            });
        }

        if (n.progressBar) {
            n.progressBar.addEventListener('pointerdown', function (ev) {
                ev.stopPropagation();

                visorFullState.arrastrando = true;

                try {
                    n.progressBar.setPointerCapture(ev.pointerId);
                } catch (e) {}

                seekProgresoVisorFull(ev);
            });

            n.progressBar.addEventListener('pointermove', function (ev) {
                if (!visorFullState.arrastrando) return;

                ev.stopPropagation();

                seekProgresoVisorFull(ev);
            });

            var finArrastre = function (ev) {
                if (!visorFullState.arrastrando) return;

                ev.stopPropagation();

                visorFullState.arrastrando = false;

                try {
                    n.progressBar.releasePointerCapture(ev.pointerId);
                } catch (e) {}

                mostrarControlesVisorFull(true);
            };

            n.progressBar.addEventListener('pointerup', finArrastre);
            n.progressBar.addEventListener('pointercancel', finArrastre);
        }

        if (n.media) {
            n.media.addEventListener('touchstart', function (ev) {
                if (!ev.touches || !ev.touches.length) return;

                visorFullState.startX = ev.touches[0].clientX;
                visorFullState.startY = ev.touches[0].clientY;
                visorFullState.movido = false;

            }, { passive: true });

            n.media.addEventListener('touchmove', function (ev) {
                if (!ev.touches || !ev.touches.length) return;

                var dx = Math.abs(
                    ev.touches[0].clientX - visorFullState.startX
                );

                var dy = Math.abs(
                    ev.touches[0].clientY - visorFullState.startY
                );

                if (dx > 10 || dy > 10) {
                    visorFullState.movido = true;
                }

            }, { passive: true });

            n.media.addEventListener('touchend', function (ev) {
                if (!ev.changedTouches || !ev.changedTouches.length) return;

                var diffX =
                    ev.changedTouches[0].clientX - visorFullState.startX;

                var diffY =
                    ev.changedTouches[0].clientY - visorFullState.startY;

                if (diffY > 120 && Math.abs(diffY) > Math.abs(diffX)) {
                    cerrarVisorFull(false);
                    return;
                }

                if (Math.abs(diffX) > 55 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0) {
                        renderizarItemVisorFull(visorFullState.indice + 1);
                    } else {
                        renderizarItemVisorFull(visorFullState.indice - 1);
                    }

                    return;
                }

                if (!visorFullState.movido) {
                    var vid = obtenerVideoVisorFull();

                    if (vid) {
                        if (vid.paused) {
                            vid.play().catch(function () {});
                        } else {
                            vid.pause();
                        }
                    } else {
                        mostrarControlesVisorFull(false);
                    }
                }

            }, { passive: true });
        }

        if (n.sheetBackdrop) {
            n.sheetBackdrop.addEventListener('click', cerrarSheetVisorFull);
        }

        window.addEventListener('resize', function () {
            if (visorFullState.abierto) alternarEscalaVisorFull();
        });
    }

    /* ================= SELECTOR DE 97 EMOJIS ================= */

    function poblarGrid97Emojis() {
        var grid = $('emojiGridPerfil');

        if (!grid || grid.dataset.cargado === '1') return;

        grid.innerHTML = '';

        EMOJIS_97.forEach(function (emo) {
            var btn = document.createElement('button');

            btn.type = 'button';
            btn.className = 'emoji-item';
            btn.style.cssText =
                'border:none;background:transparent;font-size:14px;padding:2px;min-width:20px;min-height:20px;cursor:pointer;border-radius:6px;line-height:1.2;';

            btn.textContent = emo;

            btn.addEventListener('click', function (ev) {
                ev.stopPropagation();

                var target = inputEmojiDestino ||
                    document.querySelector(
                        '#pfComposer textarea, #pfComposer input, .pv-comentario-input'
                    );

                if (!target) return;

                target.focus();

                var v = String(target.value || '');

                var s = typeof target.selectionStart === 'number'
                    ? target.selectionStart
                    : v.length;

                var ePos = typeof target.selectionEnd === 'number'
                    ? target.selectionEnd
                    : v.length;

                target.value =
                    v.slice(0, s) + emo + v.slice(ePos);

                var nPos = s + emo.length;

                try {
                    target.setSelectionRange(nPos, nPos);
                } catch (err) {}

                target.dispatchEvent(new Event('input', { bubbles: true }));
            });

            grid.appendChild(btn);
        });

        grid.dataset.cargado = '1';
    }

    function abrirPicker97Emojis(inputEl) {
        var picker = $('emojiPickerPerfil');

        if (!picker) return;

        if (inputEl) inputEmojiDestino = inputEl;

        instalarEstilosEmojis();
        poblarGrid97Emojis();

        picker.hidden = false;
    }

    function cerrarPicker97Emojis() {
        var picker = $('emojiPickerPerfil');

        if (picker) picker.hidden = true;
    }

    /* ================= VISOR MULTIMEDIA ================= */

    function cerrarLightbox() {
        cerrarVisorFull(false);

        var lb = el.lightbox;
        var body = el.lightboxBody;

        if (medioActivo && body && body.contains(medioActivo)) {
            try {
                medioActivo.pause();
            } catch (e) {}

            medioActivo = null;
        }

        if (lb) lb.hidden = true;
        if (body) body.innerHTML = '';
    }

    function abrirLightbox(tipo, url) {
        var segura = safeHttps(url);

        if (!segura) return;

        if ($('pubVisorFull')) {
            abrirVisorFull([
                { tipo: tipo || 'imagen', url: segura }
            ], 0, null);

            return;
        }

        if (!el.lightboxBody) return;

        if (medioActivo) {
            try {
                medioActivo.pause();
            } catch (e) {}
        }

        el.lightboxBody.innerHTML = '';

        if (tipo === 'video') {
            var vid = document.createElement('video');

            vid.src = segura;
            vid.controls = true;
            vid.autoplay = true;
            vid.playsInline = true;

            vid.setAttribute('playsinline', '');

            vid.style.width = '100%';
            vid.style.maxWidth = '540px';
            vid.style.maxHeight = '85vh';
            vid.style.objectFit = 'contain';

            registrarReproductorUnico(vid);

            el.lightboxBody.appendChild(vid);

        } else {
            var img = document.createElement('img');

            img.src = segura;
            img.alt = '';

            img.style.maxWidth = '95vw';
            img.style.maxHeight = '85vh';
            img.style.objectFit = 'contain';

            el.lightboxBody.appendChild(img);
        }

        if (el.lightbox) el.lightbox.hidden = false;
    }

    /* ================= IDENTIDAD ================= */

    function leerIdentificador() {
        var sp = new URLSearchParams(window.location.search);

        var tieneU = sp.has('u');
        var tieneId = sp.has('id');

        var u = (sp.get('u') || '').trim().replace(/^@+/, '');
        var id = (sp.get('id') || '').trim();

        var uOk = HANDLE_RE.test(u);
        var idOk = UUID_RE.test(id);

        if (tieneU && tieneId) {
            return (uOk && idOk)
                ? { tipo: 'verificado', handle: u, id: id }
                : { tipo: 'invalido' };
        }

        if (tieneU && uOk) {
            return { tipo: 'handle', valor: u };
        }

        if (tieneId && idOk) {
            return { tipo: 'id', valor: id };
        }

        if (tieneU || tieneId) {
            return { tipo: 'invalido' };
        }

        return null;
    }

    async function cargarPerfil(client, ident) {
        var llamada;

        if (ident.tipo === 'verificado') {
            llamada = client.rpc('perfil_publico_verificado', {
                p_handle: ident.handle,
                p_id: ident.id
            });
        } else if (ident.tipo === 'handle') {
            llamada = client.rpc('perfil_publico_por_handle', {
                p_handle: ident.valor
            });
        } else {
            llamada = client.rpc('perfil_publico_por_id', {
                p_id: ident.valor
            });
        }

        var r = await conTimeout(
            llamada,
            TIMEOUT_PERFIL_MS,
            'El servidor tardó demasiado en responder el perfil.'
        );

        if (r.error) throw r.error;

        var fila = Array.isArray(r.data) ? r.data[0] : r.data;

        return fila || null;
    }

    async function resolverSinPerfil(client, ident) {
        var id = ident.tipo === 'verificado'
            ? ident.id
            : (ident.tipo === 'id' ? ident.valor : null);

        if (!id) return 'no_encontrado';

        var params = { p_id: id };

        if (ident.tipo === 'verificado') {
            params.p_handle = ident.handle;
        }

        try {
            var r = await conTimeout(
                client.rpc('perfil_visibilidad_estado', params),
                TIMEOUT_PERFIL_MS,
                'Sin respuesta'
            );

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

        el.errorTexto.textContent =
            'No pudimos verificar la identidad de este perfil. Por seguridad no se muestran sus datos.';

        mostrar(el.error);
    }

    function mostrarErrorGeneral(detalle) {
        el.errorTexto.removeAttribute('data-clave');

        el.errorTexto.textContent =
            'No pudimos cargar este perfil. ' + (detalle || 'Intenta de nuevo.');

        mostrar(el.error);
    }

    /* ================= RENDER PERFIL ================= */

    function pintarAvatar(url) {
        el.avatar.textContent = '';

        var seguro = safeHttps(url);

        if (!seguro) {
            el.avatar.textContent = '◈';
            return;
        }

        var img = document.createElement('img');

        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';

        img.onerror = function () {
            el.avatar.textContent = '◈';
        };

        img.src = seguro;

        el.avatar.appendChild(img);
    }

    function pintarEstado(p) {
        if (!p.ultima_conexion && p.online !== true) {
            el.estado.hidden = true;
            return;
        }

        el.estado.hidden = false;

        if (p.online === true) {
            el.estadoDot.className = 'pv-dot activo';
            el.estadoTexto.textContent = 'Activo ahora';
        } else {
            el.estadoDot.className = 'pv-dot inactivo';

            el.estadoTexto.textContent =
                'Inactivo · ' + tiempoRelativo(fechaUTC(p.ultima_conexion));
        }
    }

    function pintarPasaporte(p) {
        el.pasaporte.innerHTML = '';

        var card = document.createElement('div');
        card.className = 'pv-pasaporte';

        var sello = document.createElement('div');
        sello.className = 'pv-pasaporte-sello';
        sello.textContent = '◈ Csariel\'s · Digital Identity';

        var titulo = document.createElement('div');
        titulo.className = 'pv-pasaporte-titulo';
        titulo.textContent = 'Pasaporte Digital';

        var sub = document.createElement('div');
        sub.className = 'pv-pasaporte-sub';
        sub.textContent = 'Identidad en Csariel\'s.';

        card.appendChild(sello);
        card.appendChild(titulo);
        card.appendChild(sub);

        if (p.verificado) {
            var verif = document.createElement('div');

            verif.className = 'pv-pasaporte-verif';
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

        var titulo =
            (p.nombre || p.handle) + " (@" + p.handle + ") · Csariel's";

        var desc =
            "Perfil público de " + (p.nombre || p.handle) + " en Csariel's · WEB3";

        var img = safeHttps(p.avatar_url) || '';

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
        var r = await client
            .from('wallet_publica')
            .select('wallet_address')
            .eq('id', id)
            .maybeSingle();

        if (r.error || !r.data || !r.data.wallet_address) return;

        direccionWallet = r.data.wallet_address;

        el.walletDir.textContent = acortar(direccionWallet);
        el.wallet.hidden = false;
    }

    function copiarWallet() {
        if (!direccionWallet || !navigator.clipboard) return;

        navigator.clipboard.writeText(direccionWallet)
            .then(function () {
                toast('Dirección copiada', 'success');
            })
            .catch(function () {
                toast('No se pudo copiar', 'error');
            });
    }

    async function compartirPerfil() {
        var url = urlPerfil();

        var texto =
            (perfil.nombre || perfil.handle) + ' en Csariel\'s';

        if (navigator.share) {
            try {
                await navigator.share({
                    title: texto,
                    text: texto,
                    url: url
                });

                return;

            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(function () {
                    toast('Enlace copiado', 'success');
                })
                .catch(function () {
                    window.prompt('Copia este enlace:', url);
                });
        } else {
            window.prompt('Copia este enlace:', url);
        }
    }

    /* ================= AMIGOS ================= */

    function cargarAmigos(client, id) {
        if (!el.amigosSection) return;

        el.amigosSection.hidden = false;

        if (
            window.PerfilPublicoAmigos &&
            typeof window.PerfilPublicoAmigos.cargar === 'function'
        ) {
            window.PerfilPublicoAmigos.cargar(client, id);
        }
    }

    /* ================= MEDIA Y PUBLICACIONES ================= */

    function listaMediaPost(p) {
        var arr = [];

        if (Array.isArray(p.media_items)) {
            p.media_items.forEach(function (it) {
                var u = safeHttps(it && (it.url || it.media_url));

                if (!u) return;

                var t = String(
                    (it && (it.tipo || it.media_type)) || ''
                ).toLowerCase();

                if (!t) {
                    t = /\.(mp4|webm|mov)(\?|$)/i.test(u)
                        ? 'video'
                        : 'imagen';
                }

                arr.push({
                    url: u,
                    tipo: t
                });
            });
        }

        if (!arr.length) {
            var u0 = safeHttps(p.media_url);

            if (u0) {
                var t0 = String(p.media_type || '').toLowerCase();

                if (!t0) {
                    if (/\.(mp4|webm|mov)(\?|$)/i.test(u0)) {
                        t0 = 'video';
                    } else if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(u0)) {
                        t0 = 'audio';
                    } else {
                        t0 = 'imagen';
                    }
                }

                arr.push({
                    url: u0,
                    tipo: t0
                });
            }
        }

        return arr;
    }

    function resolverMedia(p) {
        var arr = listaMediaPost(p);
        return arr.length ? arr[0] : null;
    }

    function renderMedia(meta, p) {
        var items = listaMediaPost(p);
        var media = items[0];

        if (!media) return;

        var sinDescarga = p.permitir_descarga === false;

        if (media.tipo === 'video') {
            var marcoVideo = document.createElement('div');

            marcoVideo.className = 'pv-media-marco pub-media-container';

            marcoVideo.style.width = '100%';
            marcoVideo.style.aspectRatio = '9 / 16';
            marcoVideo.style.marginTop = '12px';
            marcoVideo.style.borderRadius = '8px';
            marcoVideo.style.overflow = 'hidden';
            marcoVideo.style.background = '#000';
            marcoVideo.style.position = 'relative';

            var vid = document.createElement('video');

            vid.className = 'pv-post-video';
            vid.src = media.url;
            vid.controls = false;
            vid.preload = 'metadata';
            vid.playsInline = true;

            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');

            if (sinDescarga) {
                vid.setAttribute('controlsList', 'nodownload');
            }

            vid.style.width = '100%';
            vid.style.height = '100%';
            vid.style.marginTop = '0';
            vid.style.objectFit = 'contain';
            vid.style.objectPosition = 'center';

            vid.addEventListener('loadedmetadata', function () {
                if (vid.videoWidth && vid.videoHeight) {
                    vid.style.objectFit =
                        vid.videoHeight > vid.videoWidth ? 'cover' : 'contain';
                }
            });

            registrarReproductorUnico(vid);

            marcoVideo.appendChild(vid);

            marcoVideo.addEventListener('click', function () {
                try {
                    vid.pause();
                } catch (e) {}

                if ($('pubVisorFull')) {
                    abrirVisorFull(items, 0, p);
                } else {
                    abrirLightbox('video', media.url);
                }
            });

            meta.appendChild(marcoVideo);

        } else if (media.tipo === 'audio') {
            var aud = document.createElement('audio');

            aud.className = 'pv-post-audio';
            aud.src = media.url;
            aud.controls = true;
            aud.preload = 'none';

            if (sinDescarga) {
                aud.setAttribute('controlsList', 'nodownload');
            }

            registrarReproductorUnico(aud);

            meta.appendChild(aud);

        } else {
            var marcoImg = document.createElement('div');

            marcoImg.className = 'pv-media-marco pub-media-container';

            marcoImg.style.width = '100%';
            marcoImg.style.aspectRatio = '9 / 16';
            marcoImg.style.marginTop = '12px';
            marcoImg.style.borderRadius = '8px';
            marcoImg.style.overflow = 'hidden';
            marcoImg.style.background = '#000';
            marcoImg.style.position = 'relative';

            var img = document.createElement('img');

            img.className = 'pv-post-img';
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = media.url;

            img.style.width = '100%';
            img.style.height = '100%';
            img.style.marginTop = '0';
            img.style.objectFit = 'contain';
            img.style.objectPosition = 'center';

            img.addEventListener('load', function () {
                if (img.naturalWidth && img.naturalHeight) {
                    img.style.objectFit =
                        img.naturalHeight > img.naturalWidth ? 'cover' : 'contain';
                }
            });

            marcoImg.appendChild(img);

            marcoImg.addEventListener('click', function () {
                if ($('pubVisorFull')) {
                    abrirVisorFull(items, 0, p);
                } else {
                    abrirLightbox('imagen', media.url);
                }
            });

            meta.appendChild(marcoImg);
        }
    }

    /* ================= REACCIONES ================= */

    function pintarBarraReacciones(bar, resumen) {
        var rg = RG();

        var r = resumen || {
            totales: {},
            total: 0,
            miTipo: null
        };

        bar.innerHTML = '';
        bar._resumen = r;

        var wrap = document.createElement('div');
        wrap.className = 'reaccion-wrap';

        var dropdown = document.createElement('div');

        dropdown.className = 'reaccion-dropdown';
        dropdown.hidden = true;

        (rg.EMOJIS || EMOJIS_REACCION).forEach(function (emoji) {
            var btn = document.createElement('button');

            btn.type = 'button';

            btn.className =
                'pv-btn-reaccion reaccion-opcion-btn' +
                (r.miTipo === emoji ? ' activo' : '');

            btn.setAttribute('data-tipo', emoji);
            btn.setAttribute('aria-label', 'Reaccionar con ' + emoji);

            aplicarVariablesEmoji(btn, emoji);
            rg.aplicarMotor(btn, emoji);

            var ico = document.createElement('span');

            ico.textContent = emoji;

            var cant = document.createElement('span');

            cant.className = 'mini-count';

            var n = r.totales[emoji] || 0;

            cant.textContent = n > 0 ? String(n) : '';

            btn.appendChild(ico);

            if (cant.textContent) {
                btn.appendChild(cant);
            }

            dropdown.appendChild(btn);
        });

        var trigger = document.createElement('button');

        trigger.type = 'button';

        trigger.className =
            'reaccion-trigger' + (r.miTipo ? ' activo' : '');

        var emojiActivo =
            r.miTipo || rg.POR_DEFECTO || '❤️';

        var trigEmoji = document.createElement('span');

        trigEmoji.className = 'emoji-actual';
        trigEmoji.textContent = emojiActivo;

        aplicarVariablesEmoji(trigEmoji, emojiActivo);
        rg.aplicarMotor(trigEmoji, emojiActivo);

        var trigTexto = document.createElement('span');

        trigTexto.className = 'mini-count';
        trigTexto.textContent = r.total > 0 ? String(r.total) : '';

        trigger.appendChild(trigEmoji);

        if (trigTexto.textContent) {
            trigger.appendChild(trigTexto);
        }

        trigger.addEventListener('click', function (ev) {
            ev.stopPropagation();

            var abrir = dropdown.hidden;

            document.querySelectorAll('.reaccion-dropdown').forEach(function (d) {
                d.hidden = true;
            });

            dropdown.hidden = !abrir;

            if (abrir) {
                dropdown.querySelectorAll('.reaccion-opcion-btn').forEach(function (b, idx) {
                    var em = (rg.EMOJIS || EMOJIS_REACCION)[idx];

                    aplicarVariablesEmoji(b, em);
                    rg.aplicarMotor(b, em);
                });
            }
        });

        wrap.appendChild(dropdown);
        wrap.appendChild(trigger);

        bar.appendChild(wrap);
    }

    async function refrescarReacciones(client, pubId, bar) {
        var r = await client
            .from('publicaciones_reacciones')
            .select('tipo, usuario_id')
            .eq('publicacion_id', pubId);

        if (r.error) throw r.error;

        pintarBarraReacciones(
            bar,
            RG().resumir(r.data || [], window.usuarioActualId)
        );
    }

    async function alternarReaccion(client, pubId, tipo, bar) {
        if (!window.usuarioActualId) {
            toast('Inicia sesión para reaccionar', 'error');
            return;
        }

        var botones = bar.querySelectorAll('button');

        botones.forEach(function (b) {
            b.disabled = true;
        });

        try {
            var miTipo = bar._resumen
                ? bar._resumen.miTipo
                : null;

            var res;

            if (miTipo === tipo) {
                res = await client
                    .from('publicaciones_reacciones')
                    .delete()
                    .eq('publicacion_id', pubId)
                    .eq('usuario_id', window.usuarioActualId);

            } else if (miTipo) {
                res = await client
                    .from('publicaciones_reacciones')
                    .update({ tipo: tipo })
                    .eq('publicacion_id', pubId)
                    .eq('usuario_id', window.usuarioActualId);

            } else {
                res = await client
                    .from('publicaciones_reacciones')
                    .insert({
                        publicacion_id: pubId,
                        usuario_id: window.usuarioActualId,
                        tipo: tipo
                    });
            }

            if (res.error) throw res.error;

            await refrescarReacciones(client, pubId, bar);

        } catch (e) {
            console.warn('[PerfilPublico] Reacción:', e);

            toast('No se pudo reaccionar: ' + msgError(e), 'error');

        } finally {
            botones.forEach(function (b) {
                b.disabled = false;
            });
        }
    }

    /* ================= COMENTARIOS ================= */

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
            autor.textContent =
                c.usuario_nombre || c.usuario_handle || 'Miembro';

            var txt = document.createElement('span');

            txt.textContent = c.contenido || '';

            item.appendChild(autor);
            item.appendChild(txt);

            listaEl.appendChild(item);
        });
    }

    async function cargarComentarios(client, pubId, listaEl, countEl) {
        listaEl.innerHTML =
            '<div class="pv-comentario-item">Cargando comentarios...</div>';

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

            if (countEl) {
                countEl.textContent =
                    filas.length > 0 ? String(filas.length) : '';
            }

        } catch (e) {
            console.warn('[PerfilPublico] Comentarios:', e);

            listaEl.innerHTML =
                '<div class="pv-comentario-item">No se pudieron cargar los comentarios: ' +
                msgError(e) + '</div>';
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
            var ins = await client
                .from('publicaciones_comentarios')
                .insert({
                    publicacion_id: pubId,
                    usuario_id: window.usuarioActualId,
                    contenido: texto
                });

            if (ins.error) throw ins.error;

            inputEl.value = '';

            await cargarComentarios(client, pubId, listaEl, countEl);

        } catch (e) {
            console.warn('[PerfilPublico] Comentar:', e);

            toast('No se pudo comentar: ' + msgError(e), 'error');

        } finally {
            inputEl.disabled = false;
            inputEl.focus();
        }
    }

    /* ================= CREAR PUBLICACIÓN ================= */

    function crearPost(client, p) {
        var pubId = p.id;

        var art = document.createElement('article');

        art.className = 'pv-post';

        var av = document.createElement('div');

        av.className = 'pv-post-av';

        var avatarUrl = safeHttps(p.usuario_avatar_url);

        if (avatarUrl) {
            var im = document.createElement('img');

            im.alt = '';
            im.loading = 'lazy';
            im.src = avatarUrl;

            av.appendChild(im);

        } else {
            av.textContent =
                (p.usuario_nombre || 'U').charAt(0).toUpperCase();
        }

        var meta = document.createElement('div');

        meta.className = 'pv-post-meta';

        var nombre = document.createElement('div');

        nombre.className = 'pv-post-nombre';
        nombre.textContent =
            p.usuario_nombre || p.usuario_handle || 'Usuario';

        var sub = document.createElement('div');

        sub.className = 'pv-post-sub';

        sub.textContent =
            (p.usuario_handle ? '@' + p.usuario_handle + ' · ' : '') +
            fechaPost(p.created_at);

        meta.appendChild(nombre);
        meta.appendChild(sub);

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
            aviso.textContent =
                'Este mensaje contiene lenguaje inapropiado.';

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

        var totalCom = Number(p.comentarios) || 0;

        var iconoCom = document.createElement('span');

        iconoCom.textContent = 'Comentarios';

        var comCount = document.createElement('span');

        comCount.textContent =
            totalCom > 0 ? String(totalCom) : '';

        btnCom.appendChild(iconoCom);

        if (comCount.textContent) {
            btnCom.appendChild(comCount);
        }

        barra.appendChild(reacciones);
        barra.appendChild(btnCom);

        meta.appendChild(barra);

        var cajaCom = document.createElement('div');

        cajaCom.className = 'pv-comentarios';
        cajaCom.hidden = true;

        var listaCom = document.createElement('div');

        listaCom.className = 'pv-comentarios-lista';

        var formCom = document.createElement('form');

        formCom.className = 'pv-comentario-form';

        var inputCom = document.createElement('input');

        inputCom.type = 'text';
        inputCom.className = 'pv-comentario-input';
        inputCom.maxLength = 500;
        inputCom.placeholder = 'Escribe un comentario...';

        inputCom.setAttribute(
            'aria-label',
            'Escribe un comentario'
        );

        var btnEnviar = document.createElement('button');

        btnEnviar.type = 'submit';
        btnEnviar.className = 'btn btn-outline btn-sm';
        btnEnviar.textContent = 'Enviar';

        formCom.appendChild(inputCom);
        formCom.appendChild(btnEnviar);

        cajaCom.appendChild(listaCom);
        cajaCom.appendChild(formCom);

        meta.appendChild(cajaCom);

        btnCom.addEventListener('click', function () {
            var abrir = cajaCom.hidden;

            cajaCom.hidden = !abrir;

            if (abrir) {
                cargarComentarios(
                    client,
                    pubId,
                    listaCom,
                    comCount
                );
            }
        });

        formCom.addEventListener('submit', function (ev) {
            ev.preventDefault();

            enviarComentario(
                client,
                pubId,
                inputCom,
                listaCom,
                comCount
            );
        });

        reacciones.addEventListener('click', function (ev) {
            ev.stopPropagation();

            var btn = ev.target.closest('button[data-tipo]');

            if (!btn) return;

            var dd = reacciones.querySelector('.reaccion-dropdown');

            if (dd) dd.hidden = true;

            alternarReaccion(
                client,
                pubId,
                btn.getAttribute('data-tipo'),
                reacciones
            );
        });

        art.appendChild(av);
        art.appendChild(meta);

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
            pub.antes = null;
            pub.total = 0;
            pub.idsVistos.clear();

            el.pubLista.innerHTML = '';
        }

        el.pubMas.disabled = true;

        try {
            var r = await conTimeout(
                client.rpc('perfil_publicaciones_contactos', {
                    p_handle: handle,
                    p_antes: reiniciar ? null : pub.antes,
                    p_limite: POSTS_PAGE
                }),
                TIMEOUT_PERFIL_MS,
                'Las publicaciones tardaron demasiado en cargar.'
            );

            if (r.error) {
                el.pubSection.hidden = false;
                el.pubMas.hidden = true;

                mostrarMensajePub(
                    r.error.code === '42501'
                        ? 'Inicia sesión para ver las publicaciones de tus contactos.'
                        : 'No se pudieron cargar las publicaciones.'
                );

                return;
            }

            var d = r.data || {};

            if (
                d.estado === 'bloqueado' ||
                d.estado === 'no_encontrado'
            ) {
                el.pubSection.hidden = true;
                return;
            }

            el.pubSection.hidden = false;

            if (d.estado === 'no_autenticado') {
                el.pubLista.innerHTML = '';
                el.pubMas.hidden = true;
                el.pubContador.textContent = '';

                mostrarMensajePub(
                    'Inicia sesión para ver las publicaciones de tus contactos.'
                );

                return;
            }

            if (d.estado === 'no_contacto') {
                el.pubLista.innerHTML = '';
                el.pubMas.hidden = true;
                el.pubContador.textContent = '';

                mostrarMensajePub(
                    'Solo tus contactos pueden ver las publicaciones de esta persona.'
                );

                return;
            }

            var posts = Array.isArray(d.posts) ? d.posts : [];

            var nuevos = posts.filter(function (p) {
                if (!p.id || pub.idsVistos.has(p.id)) return false;

                pub.idsVistos.add(p.id);

                return true;
            });

            var ids = nuevos.map(function (p) {
                return p.id;
            });

            var resumenes = new Map();

            if (ids.length) {
                try {
                    var rReac = await client
                        .from('publicaciones_reacciones')
                        .select('publicacion_id, tipo, usuario_id')
                        .in('publicacion_id', ids);

                    var porPub = {};

                    (rReac.data || []).forEach(function (row) {
                        var k = String(row.publicacion_id);

                        if (!porPub[k]) {
                            porPub[k] = [];
                        }

                        porPub[k].push(row);
                    });

                    ids.forEach(function (id) {
                        resumenes.set(
                            String(id),
                            RG().resumir(
                                porPub[String(id)] || [],
                                window.usuarioActualId
                            )
                        );
                    });

                } catch (e) {
                    console.warn(
                        '[PerfilPublico] Reacciones batch:',
                        e
                    );
                }
            }

            nuevos.forEach(function (p) {
                var card = crearPost(client, p);

                el.pubLista.appendChild(card);

                var bar = card.querySelector('.pv-reacciones');

                if (bar) {
                    pintarBarraReacciones(
                        bar,
                        resumenes.get(String(p.id)) || {
                            totales: {},
                            total: 0,
                            miTipo: null
                        }
                    );
                }
            });

            pub.total += nuevos.length;

            if (posts.length) {
                pub.antes = posts[posts.length - 1].created_at;
            }

            el.pubContador.textContent =
                pub.total ? String(pub.total) : '';

            mostrarMensajePub(
                pub.total ? '' : 'Sin publicaciones'
            );

            el.pubMas.hidden = posts.length < POSTS_PAGE;

        } catch (e) {
            console.warn('[PerfilPublico] Publicaciones:', e);

            el.pubSection.hidden = false;

            mostrarMensajePub(
                'No se pudieron cargar las publicaciones: ' + msgError(e)
            );

        } finally {
            pub.cargando = false;
            el.pubMas.disabled = false;
        }
    }

    /* ================= API PÚBLICA DEL MÓDULO ================= */

    window.PerfilPublicoPosts = {
        crearPost: crearPost,
        pintarBarraReacciones: pintarBarraReacciones,
        cerrarLightbox: cerrarLightbox,
        abrirLightbox: abrirLightbox,
        abrirVisorFull: abrirVisorFull,
        cerrarVisorFull: cerrarVisorFull,
        abrirPicker97Emojis: abrirPicker97Emojis,
        cerrarPicker97Emojis: cerrarPicker97Emojis,
        toast: toast,
        msgError: msgError,
        safeHttps: safeHttps
    };

    /* ================= EVENTOS ================= */

    function mismoOrigenReferrer() {
        try {
            return !!document.referrer &&
                new URL(document.referrer).origin === window.location.origin;
        } catch (e) {
            return false;
        }
    }

    function configurarVolver() {
        if (el.volver) {
            el.volver.addEventListener('click', function (e) {
                if (
                    window.history.length > 1 &&
                    mismoOrigenReferrer()
                ) {
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

    /* ================= CLIENTE Y SESIÓN ================= */

    async function obtenerCliente() {
        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        if (window.__sarielsSupabaseSingleton) {
            return window.__sarielsSupabaseSingleton;
        }

        if (
            window.supabaseReady &&
            typeof window.supabaseReady.then === 'function'
        ) {
            try {
                var c = await conTimeout(
                    window.supabaseReady,
                    TIMEOUT_CLIENTE_MS,
                    'El cliente de Supabase no respondió.'
                );

                if (c) return c;

            } catch (e) {
                console.warn('[PerfilPublico] supabaseReady:', e);
            }
        }

        var intentos = 0;

        while (intentos < 20) {
            if (window.supabaseClient) {
                return window.supabaseClient;
            }

            await new Promise(function (r) {
                setTimeout(r, 100);
            });

            intentos++;
        }

        return window.supabaseClient || null;
    }

    async function resolverSesion(client) {
        try {
            var r = await conTimeout(
                client.auth.getSession(),
                TIMEOUT_SESION_MS,
                'La sesión tardó demasiado.'
            );

            var user =
                r && r.data && r.data.session
                    ? r.data.session.user
                    : null;

            window.usuarioActualId = user ? user.id : null;

        } catch (e) {
            console.warn('[PerfilPublico] Sesión:', e);

            window.usuarioActualId = null;
        }

        return window.usuarioActualId;
    }

    /* ================= INIT ================= */

    async function init() {
        console.info('[PerfilPublico] iniciando v3.2');

        instalarEstilosEmojis();

        mostrar(el.cargando);

        configurarVolver();

        enlazarEventosVisorFull();

        poblarGrid97Emojis();

        var ident = leerIdentificador();

        if (!ident) {
            mostrar(el.noEncontrado);
            return;
        }

        if (ident.tipo === 'invalido') {
            mostrarErrorIdentidad();
            return;
        }

        var client = await obtenerCliente();

        if (!client) {
            mostrarErrorGeneral(
                'No se pudo conectar con la base de datos. Recarga la página.'
            );

            return;
        }

        await resolverSesion(client);

        try {
            client.auth.onAuthStateChange(function (_e, sesion) {
                window.usuarioActualId =
                    (sesion && sesion.user)
                        ? sesion.user.id
                        : null;
            });
        } catch (e) {}

        var p = await cargarPerfil(client, ident);

        if (!p) {
            var vis = await resolverSinPerfil(client, ident);

            if (vis === 'restringido') {
                mensajeNoEncontrado(
                    'Perfil restringido',
                    'Este perfil está restringido. Solo sus contactos pueden verlo.'
                );

            } else if (
                vis === 'bloqueado' ||
                vis === 'no_disponible'
            ) {
                mensajeNoEncontrado(
                    'Perfil no disponible',
                    'Este perfil no está disponible en este momento.'
                );

            } else if (ident.tipo === 'verificado') {
                mostrarErrorIdentidad();

            } else {
                mostrar(el.noEncontrado);
            }

            return;
        }

        if (!p.handle && !p.nombre) {
            mostrar(el.noEncontrado);
            return;
        }

        if (
            ident.tipo === 'verificado' &&
            String(p.handle || '').toLowerCase() !== ident.handle.toLowerCase()
        ) {
            mostrarErrorIdentidad();
            return;
        }

        if (
            window.usuarioActualId &&
            p.id === window.usuarioActualId
        ) {
            window.location.replace(RUTA_PERFIL_PROPIO);
            return;
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

    el.reintentar.addEventListener('click', function () {
        window.location.reload();
    });

    el.pubMas.addEventListener('click', async function () {
        var client = await obtenerCliente();

        if (client && perfil && perfil.handle) {
            cargarPublicaciones(client, perfil.handle, false);
        }
    });

    el.lightboxCerrar.addEventListener('click', cerrarLightbox);

    el.lightbox.addEventListener('click', function (e) {
        if (e.target === el.lightbox) {
            cerrarLightbox();
        }
    });

    document.addEventListener('click', function (ev) {
        if (!ev.target.closest('.reaccion-wrap')) {
            document.querySelectorAll('.reaccion-dropdown').forEach(function (d) {
                d.hidden = true;
            });
        }

        var picker = $('emojiPickerPerfil');

        if (
            picker &&
            !picker.hidden &&
            !picker.contains(ev.target) &&
            !ev.target.closest('[data-emoji-picker-btn]')
        ) {
            picker.hidden = true;
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var n = vfNodo();

            if (n.sheet && !n.sheet.hidden) {
                cerrarSheetVisorFull();
                return;
            }

            if (n.root && !n.root.hidden) {
                cerrarVisorFull(false);
                return;
            }

            if (!el.lightbox.hidden) {
                cerrarLightbox();
            }

            cerrarPicker97Emojis();
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