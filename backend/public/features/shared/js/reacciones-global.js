/* ================================================================
   VISOR-MEDIA-GLOBAL.JS · Csariel's · v1.7
   Visor de pantalla completa compartido para fotos y videos.

   Cambios v1.7:
   - Navegación por índice (ya no depende del scroll nativo). Deslizar
     con el dedo avanza o regresa al video anterior sin reiniciar nada.
   - Gestos con pointer events: vertical en videos, horizontal en fotos,
     y arrastre horizontal para adelantar/regresar dentro de un video.
   - Barra lateral (como X): reacciones y comentarios sin salir del video.
   - Hoja de comentarios dentro del visor (lee y escribe en
     publicaciones_comentarios / publicaciones_comentarios_publicos).
   - Estilos extra inyectados desde este archivo (no requiere cambios
     en visor-media-global.css).
   - Se conserva el letrero «¿Te interesa?» y sus reglas.

   API pública (sin cambios):
     VisorMediaGlobal.abrir, cerrar, estaAbierto, contieneVideo, version.
   ================================================================ */
(function () {
    'use strict';

    var VERSION = '1.7';

    if (window.VisorMediaGlobal && window.VisorMediaGlobal.version === VERSION) return;

    var CSS_PATH = '/features/shared/css/visor-media-global.css';
    var VELOCIDADES = [1, 1.25, 1.5, 2];
    var EXT_IMAGEN_RE = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?|#|$)/i;

    var NOTIF_DELAY_MS = 6000;
    var NOTIF_ENFRIAMIENTO_VIDEOS = 4;
    var NOTIF_MAX_POR_SESION = 2;

    var MOTIVOS = [
        'Problema que involucra a un menor de 18 años',
        'Bullying, acoso o abuso',
        'Suicidio o autolesión',
        'Contenido violento, perturbador o que incita al odio',
        'Venta o promoción de artículos restringidos',
        'Contenido para adultos',
        'Estafa, fraude o información falsa',
        'Propiedad intelectual'
    ];

    var SVG = function (cuerpo) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">' + cuerpo + '</svg>';
    };

    var ICONO = {
        cerrar: SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
        menu: SVG('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
        comentario: SVG('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
        play: '<svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
        velocidad: SVG('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
        pip: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="11" width="8" height="6" rx="1"/>'),
        expandir: SVG('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
        descargar: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
        ocultar: SVG('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/>'),
        reportar: SVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
        eliminar: SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
        flecha: SVG('<polyline points="6 9 12 15 18 9"/>')
    };

    var st = {
        root: null,
        items: [],
        indice: 0,
        opts: {},
        abierto: false,
        velIdx: 0,
        fit: 'contain',
        motivo: '',
        timerOcultar: null,
        arrastrando: false,
        // modo: 'v' (videos, vertical) | 'h' (fotos, horizontal)
        modo: 'h',
        carrusel: false,
        slides: [],
        track: null,
        offsetPx: 0,
        drag: null,
        // history
        historyDepth: 0,
        popstateHandler: null,
        hojaHistory: false,
        ignorarPopstate: false,
        // preferencias
        autoReproducir: true,
        ahorradorDatos: false,
        videosAltaCalidad: true,
        // notificación de interés
        notifTimer: null,
        notifDescartados: new Set(),
        onInteres: null,
        onRechazo: null,
        notifSesionUsos: 0,
        notifVideosDesdeUltima: 0,
        notifItemActual: null,
        // lateral (reacciones / comentarios)
        lateralToken: 0
    };

    /* ================= UTILIDADES ================= */

    function escapeHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function safeHttps(u) {
        if (!u) return null;
        try {
            var x = new URL(String(u), window.location.href);
            return x.protocol === 'https:' ? x.href : null;
        } catch (e) { return null; }
    }

    function esVideoReal(item) {
        if (!item || item.tipo !== 'video') return false;
        var url = safeHttps(item.url);
        if (!url) return false;
        if (EXT_IMAGEN_RE.test(url)) return false;
        return true;
    }

    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') window.showToast(msg, tipo || 'info');
    }

    function fmt(seg) {
        if (!isFinite(seg) || seg < 0) seg = 0;
        var s = Math.floor(seg);
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function cliente() {
        return window.supabaseClient || null;
    }

    async function uidActual(c) {
        if (!c) return null;
        try {
            var s = await c.auth.getSession();
            return s.data && s.data.session ? s.data.session.user.id : null;
        } catch (e) {
            return null;
        }
    }

    function asegurarCss() {
        if (!document.querySelector('link[href="' + CSS_PATH + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = CSS_PATH;
            document.head.appendChild(link);
        }
        if (!document.getElementById('vmg2-estilos')) {
            var st2 = document.createElement('style');
            st2.id = 'vmg2-estilos';
            st2.textContent =
                '.vmg-escenario{touch-action:none;overflow:hidden;}' +
                '.vmg-pg-track{position:absolute;inset:0;}' +
                '.vmg-pg-slide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;will-change:transform;}' +
                '.vmg-pg-slide video,.vmg-pg-slide img{width:100%;height:100%;object-fit:contain;background:#000;display:block;user-select:none;-webkit-user-drag:none;}' +
                '.vmg-pg-err{color:rgba(255,255,255,.6);font-size:14px;}' +
                '.vmg2-lateral{position:absolute;right:10px;bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:6;display:flex;flex-direction:column;align-items:center;gap:14px;}' +
                '.vmg2-lateral[hidden]{display:none!important;}' +
                '.vmg-oculto .vmg2-lateral{opacity:0;pointer-events:none;}' +
                '.vmg2-lat-btn{width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(10,14,22,.72);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:11px;cursor:pointer;}' +
                '.vmg2-lat-btn svg{width:22px;height:22px;}' +
                '.vmg2-lat-n{font-size:10px;line-height:1;color:rgba(255,255,255,.85);}' +
                '.vmg-hoja.vmg-hoja-cm{padding:0;display:flex;flex-direction:column;}' +
                '.vmg-cm-lista{flex:1;min-height:30dvh;max-height:52dvh;overflow-y:auto;padding:4px 0;}' +
                '.vmg-cm-item{padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px;color:#eef6ff;line-height:1.4;}' +
                '.vmg-cm-autor{font-weight:700;color:#d4af37;margin-right:6px;}' +
                '.vmg-cm-vacio{color:#8c949c;font-size:13px;padding:16px 14px;}' +
                '.vmg-cm-form{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(255,255,255,.08);}' +
                '.vmg-cm-form input{flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-size:16px;outline:none;}' +
                '.vmg-cm-form button{padding:10px 14px;border-radius:12px;border:0;background:#00e5ff;color:#04070d;font-weight:700;cursor:pointer;}' +
                '.vmg-cm-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);color:#f0f4f8;}' +
                '.vmg-cm-head button{background:transparent;border:0;color:#fff;cursor:pointer;}';
            document.head.appendChild(st2);
        }
    }

    function ref(nombre) {
        return st.root.querySelector('[data-ref="' + nombre + '"]');
    }

    function videoActual() {
        if (!st.root) return null;
        var s = st.slides[st.indice];
        if (!s || !s.media) return null;
        return s.media.tagName === 'VIDEO' ? s.media : null;
    }

    function itemActual() {
        return st.items[st.indice] || null;
    }

    function mismoItem(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        if (a.postId && b.postId) return String(a.postId) === String(b.postId);
        return a.url === b.url;
    }

    function dimension() {
        var esc = ref('escenario');
        if (st.modo === 'v') return esc.clientHeight || window.innerHeight;
        return esc.clientWidth || window.innerWidth;
    }

    /* ================= HISTORY (botón atrás) ================= */

    function pushHistorySeguro() {
        try {
            history.pushState({ vmg: true, depth: st.historyDepth + 1 }, '');
            st.historyDepth++;
        } catch (e) { /* ignorar */ }
    }

    function consumirEstadoSinPopstate() {
        if (st.historyDepth <= 0) return;
        st.historyDepth--;
        st.ignorarPopstate = true;
        try {
            history.back();
        } catch (e) {
            st.ignorarPopstate = false;
        }
        setTimeout(function () { st.ignorarPopstate = false; }, 400);
    }

    function instalarPopstate() {
        if (st.popstateHandler) return;
        st.popstateHandler = function () {
            if (st.ignorarPopstate) {
                st.ignorarPopstate = false;
                return;
            }

            st.historyDepth = Math.max(0, st.historyDepth - 1);

            if (!st.root) return;

            if (!ref('hoja').hidden) {
                st.hojaHistory = false;
                ocultarHoja(true);
                if (st.historyDepth === 0) desinstalarPopstate();
                return;
            }

            if (st.abierto) {
                cerrar(true);
                if (st.historyDepth === 0) desinstalarPopstate();
            }
        };
        window.addEventListener('popstate', st.popstateHandler);
    }

    function desinstalarPopstate() {
        if (!st.popstateHandler) return;
        window.removeEventListener('popstate', st.popstateHandler);
        st.popstateHandler = null;
    }

    /* ================= CONSTRUCCIÓN ================= */

    function construir() {
        if (st.root) return st.root;

        asegurarCss();

        var el = document.createElement('div');
        el.id = 'visorMediaGlobal';
        el.className = 'vmg';
        el.hidden = true;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', 'Visor multimedia');

        el.innerHTML =
            '<div class="vmg-cabecera">' +
                '<button type="button" class="vmg-btn-circ" data-accion="cerrar" aria-label="Cerrar">' + ICONO.cerrar + '</button>' +
                '<span class="vmg-contador" data-ref="contador"></span>' +
                '<button type="button" class="vmg-btn-circ" data-accion="menu" aria-label="Opciones">' + ICONO.menu + '</button>' +
            '</div>' +
            '<div class="vmg-escenario" data-ref="escenario"></div>' +
            '<button type="button" class="vmg-play-central" data-ref="centro" data-accion="toggle" hidden aria-label="Reproducir">' + ICONO.play + '</button>' +
            '<div class="vmg2-lateral" data-ref="lateral" hidden></div>' +
            '<div class="vmg-controles" data-ref="controles" hidden>' +
                '<div class="vmg-barra" data-ref="barra" role="slider" aria-label="Progreso"><div class="vmg-progreso" data-ref="progreso"></div></div>' +
                '<div class="vmg-fila">' +
                    '<span class="vmg-tiempo" data-ref="tiempo">0:00 / 0:00</span>' +
                    '<div class="vmg-acciones">' +
                        '<button type="button" class="vmg-btn-ctrl" data-accion="velocidad" aria-label="Velocidad">' + ICONO.velocidad + '<small data-ref="vel">1x</small></button>' +
                        '<button type="button" class="vmg-btn-ctrl" data-accion="pip" aria-label="Ventana flotante">' + ICONO.pip + '</button>' +
                        '<button type="button" class="vmg-btn-ctrl" data-accion="ajustar" aria-label="Ajustar a pantalla">' + ICONO.expandir + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="vmg-notif" data-ref="notif" hidden aria-live="polite">' +
                '<span class="vmg-notif-texto">' + ICONO.flecha + ' ¿Te interesa?</span>' +
                '<div class="vmg-notif-acciones">' +
                    '<button type="button" class="vmg-notif-btn vmg-notif-si" data-accion="interes-si">Sí</button>' +
                    '<button type="button" class="vmg-notif-btn vmg-notif-no" data-accion="interes-no">No me interesa</button>' +
                '</div>' +
            '</div>' +
            '<div class="vmg-fondo-hoja" data-ref="fondo" data-accion="cerrarhoja" hidden></div>' +
            '<div class="vmg-hoja" data-ref="hoja" hidden></div>';

        document.body.appendChild(el);
        st.root = el;
        enlazar();
        return el;
    }

    function enlazar() {
        var r = st.root;

        r.addEventListener('click', function (e) {
            var b = e.target.closest('[data-accion]');
            if (!b) return;
            e.stopPropagation();
            accion(b.getAttribute('data-accion'), b);
        });

        var barra = ref('barra');

        barra.addEventListener('pointerdown', function (e) {
            e.stopPropagation();
            st.arrastrando = true;
            try { barra.setPointerCapture(e.pointerId); } catch (x) {}
            buscar(e);
        });

        barra.addEventListener('pointermove', function (e) {
            if (st.arrastrando) buscar(e);
        });

        var finArrastre = function (e) {
            st.arrastrando = false;
            try { barra.releasePointerCapture(e.pointerId); } catch (x) {}
        };

        barra.addEventListener('pointerup', finArrastre);
        barra.addEventListener('pointercancel', finArrastre);

        document.addEventListener('keydown', function (e) {
            if (!st.abierto) return;

            if (e.key === 'Escape') {
                if (!ref('hoja').hidden) ocultarHoja(true);
                else cerrar();
            } else if (e.key === 'ArrowRight' && st.modo === 'h') {
                navegar(1);
            } else if (e.key === 'ArrowLeft' && st.modo === 'h') {
                navegar(-1);
            } else if (e.key === 'ArrowDown' && st.modo === 'v') {
                navegar(1);
            } else if (e.key === 'ArrowUp' && st.modo === 'v') {
                navegar(-1);
            } else if (e.key === ' ' && videoActual()) {
                e.preventDefault();
                togglePlay();
            }
        });

        window.addEventListener('resize', function () {
            aplicarFit();
            colocar(false);
        });
    }

    /* ================= GESTOS (pointer events) ================= */

    function bindGestos(esc) {
        esc.onpointerdown = function (e) {
            if (e.button !== undefined && e.button > 0) return;
            var v = videoActual();
            st.drag = {
                id: e.pointerId,
                x0: e.clientX,
                y0: e.clientY,
                t0: Date.now(),
                axis: null,
                moved: false,
                seek0: v && isFinite(v.duration) ? (v.currentTime || 0) : 0
            };
            try { esc.setPointerCapture(e.pointerId); } catch (x) {}
        };

        esc.onpointermove = function (e) {
            var d = st.drag;
            if (!d || d.id !== e.pointerId) return;

            var dx = e.clientX - d.x0;
            var dy = e.clientY - d.y0;

            if (!d.axis) {
                if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                d.moved = true;

                if (st.modo === 'v') {
                    if (Math.abs(dy) >= Math.abs(dx)) {
                        d.axis = 'v';
                    } else {
                        d.axis = videoActual() ? 'seek' : 'none';
                    }
                } else {
                    d.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'vclose';
                }
            }

            if (d.axis === 'v' || d.axis === 'h') {
                st.offsetPx = resistir(d.axis === 'v' ? dy : dx);
                colocar(false);
            } else if (d.axis === 'seek') {
                var v = videoActual();
                if (v && isFinite(v.duration) && v.duration > 0) {
                    var w = esc.clientWidth || 1;
                    var t = d.seek0 + (dx / w) * v.duration;
                    if (t < 0) t = 0;
                    if (t > v.duration) t = v.duration;
                    try { v.currentTime = t; } catch (x) {}
                    actualizarTiempo();
                    mostrarControles();
                }
            }
        };

        esc.onpointerup = function (e) { finGesto(esc, e, false); };
        esc.onpointercancel = function (e) { finGesto(esc, e, true); };
    }

    function resistir(raw) {
        var n = st.items.length;
        if ((st.indice === 0 && raw > 0) || (st.indice === n - 1 && raw < 0)) {
            return raw * 0.35;
        }
        return raw;
    }

    function finGesto(esc, e, cancelado) {
        var d = st.drag;
        st.drag = null;
        if (!d || d.id !== e.pointerId) return;

        try { esc.releasePointerCapture(e.pointerId); } catch (x) {}

        var dx = e.clientX - d.x0;
        var dy = e.clientY - d.y0;
        var dt = Math.max(1, Date.now() - d.t0);

        if (cancelado) {
            st.offsetPx = 0;
            colocar(true);
            return;
        }

        if (d.axis === 'v' || d.axis === 'h') {
            var raw = d.axis === 'v' ? dy : dx;
            var vel = raw / dt;
            var umbral = dimension() * 0.18;
            var next = st.indice;

            if (raw < -umbral || vel < -0.5) next = st.indice + 1;
            else if (raw > umbral || vel > 0.5) next = st.indice - 1;

            if (next < 0) next = 0;
            if (next > st.items.length - 1) next = st.items.length - 1;

            st.offsetPx = 0;
            var cambio = next !== st.indice;
            st.indice = next;
            colocar(true);
            if (cambio) onIndiceCambio();
            return;
        }

        if (d.axis === 'seek') {
            st.offsetPx = 0;
            mostrarControles();
            return;
        }

        if (d.axis === 'vclose') {
            if (dy > 120 && Math.abs(dy) > Math.abs(dx)) cerrar();
            return;
        }

        if (!d.moved) {
            if (videoActual()) togglePlay();
            else programarOcultado();
        }
    }

    /* ================= COLOCAR SLIDES ================= */

    function limpiarEscenario() {
        var esc = ref('escenario');
        st.slides.forEach(function (s) { quitarMedia(s); });
        esc.innerHTML = '';
        esc.style.overflow = 'hidden';
        esc.style.touchAction = 'none';
        st.slides = [];
        st.track = null;
    }

    function montar() {
        limpiarEscenario();

        var esc = ref('escenario');
        var track = document.createElement('div');
        track.className = 'vmg-pg-track';
        esc.appendChild(track);
        st.track = track;

        st.items.forEach(function (item, i) {
            var s = document.createElement('div');
            s.className = 'vmg-pg-slide';
            track.appendChild(s);
            st.slides.push({ el: s, item: item, media: null, i: i });
        });

        bindGestos(esc);
        st.offsetPx = 0;
        colocar(false);
    }

    function colocar(animar) {
        var size = dimension();
        var esVertical = st.modo === 'v';

        st.slides.forEach(function (s) {
            var off = s.i - st.indice;
            var pos = off * size + st.offsetPx;

            s.el.style.transition = animar ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
            s.el.style.transform = esVertical
                ? 'translate3d(0,' + pos + 'px,0)'
                : 'translate3d(' + pos + 'px,0,0)';

            if (Math.abs(off) <= 1) asegurarMedia(s);
            else quitarMedia(s);
        });
    }

    function asegurarMedia(s) {
        if (s.media) return;
        var item = s.item;
        var url = safeHttps(item.url);

        if (!url) {
            s.el.innerHTML = '<div class="vmg-pg-err">No se pudo cargar</div>';
            return;
        }

        if (esVideoReal(item)) {
            var v = crearVideo(item);
            if (!v) {
                s.el.innerHTML = '<div class="vmg-pg-err">No se pudo cargar</div>';
                return;
            }
            v.preload = st.ahorradorDatos ? 'none' : (s.i === st.indice ? 'auto' : 'metadata');
            s.el.appendChild(v);
            s.media = v;
        } else {
            var img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.draggable = false;
            s.el.appendChild(img);
            s.media = img;
        }

        s.media.style.objectFit = st.fit;
    }

    function quitarMedia(s) {
        if (!s || !s.media) return;
        if (s.media.tagName === 'VIDEO') {
            try { s.media.pause(); } catch (e) {}
            s.media.removeAttribute('src');
            try { s.media.load(); } catch (e) {}
        }
        s.el.innerHTML = '';
        s.media = null;
    }

    function onIndiceCambio() {
        actualizarContador();
        activarActual();
        alCambiarVideo();
        refrescarLateral();
    }

    function activarActual() {
        st.slides.forEach(function (s) {
            if (s.media && s.media.tagName === 'VIDEO' && s.i !== st.indice) {
                try { s.media.pause(); } catch (e) {}
            }
        });

        var v = videoActual();

        if (v) {
            try { v.playbackRate = VELOCIDADES[st.velIdx]; } catch (e) {}
            if (st.autoReproducir) {
                v.play().then(function () { estadoVideo(); }).catch(function () { estadoVideo(); });
            } else {
                estadoVideo();
            }
        } else {
            estadoVideo();
        }
    }

    /* ================= REPRODUCCIÓN ================= */

    function buscar(e) {
        var v = videoActual();
        var barra = ref('barra');
        if (!v || !isFinite(v.duration) || v.duration <= 0) return;

        var rect = barra.getBoundingClientRect();
        if (!rect.width) return;

        var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        v.currentTime = ratio * v.duration;
        actualizarTiempo();
    }

    function togglePlay() {
        var v = videoActual();
        if (!v) return;

        if (v.paused) v.play().catch(function () {});
        else v.pause();

        programarOcultado();
    }

    function pausar() {
        st.slides.forEach(function (s) {
            if (s.media && s.media.tagName === 'VIDEO') {
                try { s.media.pause(); } catch (e) {}
            }
        });
    }

    function actualizarTiempo() {
        var v = videoActual();
        if (!v) return;

        var dur = isFinite(v.duration) ? v.duration : 0;
        var cur = v.currentTime || 0;

        ref('progreso').style.width = (dur > 0 ? Math.min(100, (cur / dur) * 100) : 0) + '%';
        ref('tiempo').textContent = fmt(cur) + ' / ' + fmt(dur);
    }

    function estadoVideo() {
        var v = videoActual();
        var centro = ref('centro');
        var controles = ref('controles');

        if (!v) {
            centro.hidden = true;
            controles.hidden = true;
            return;
        }

        controles.hidden = false;
        if (v.paused) {
            centro.hidden = false;
            centro.innerHTML = ICONO.play;
            centro.setAttribute('aria-label', 'Reproducir');
        } else {
            centro.hidden = true;
        }
        actualizarTiempo();
        programarOcultado();
    }

    function mostrarControles() {
        var controles = ref('controles');
        if (videoActual()) controles.hidden = false;
        programarOcultado();
    }

    function programarOcultado() {
        clearTimeout(st.timerOcultar);
        st.root.classList.remove('vmg-oculto');

        var v = videoActual();
        if (v && !v.paused) {
            st.timerOcultar = setTimeout(function () {
                st.root.classList.add('vmg-oculto');
            }, 2500);
        }
    }

    function aplicarFit() {
        if (!st.root) return;
        st.slides.forEach(function (s) {
            if (s.media) {
                s.media.style.objectFit = st.fit;
                s.media.style.objectPosition = 'center';
            }
        });
    }

    function velocidad() {
        st.velIdx = (st.velIdx + 1) % VELOCIDADES.length;
        var val = VELOCIDADES[st.velIdx];
        var v = videoActual();
        if (v) {
            try { v.playbackRate = val; } catch (e) {}
        }
        ref('vel').textContent = val + 'x';
        programarOcultado();
    }

    function pip() {
        var v = videoActual();

        if (!v || typeof v.requestPictureInPicture !== 'function') {
            toast('Tu navegador no admite ventana flotante.', 'warning');
            return;
        }

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(function () {});
        } else {
            v.requestPictureInPicture().catch(function () {
                toast('No se pudo activar la ventana flotante.', 'warning');
            });
        }
    }

    function crearVideo(item) {
        var url = safeHttps(item.url);
        if (!url) return null;
        var v = document.createElement('video');
        v.src = url;
        v.preload = st.ahorradorDatos ? 'none' : 'metadata';
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        if (item.permiteDescarga === false) v.setAttribute('controlsList', 'nodownload');

        v.addEventListener('loadedmetadata', function () {
            if (videoActual() === v) actualizarTiempo();
        });
        v.addEventListener('timeupdate', function () {
            if (videoActual() === v) actualizarTiempo();
        });
        v.addEventListener('play', function () {
            if (videoActual() === v) estadoVideo();
        });
        v.addEventListener('pause', function () {
            if (videoActual() === v) estadoVideo();
        });
        v.addEventListener('ended', function () {
            if (videoActual() === v) {
                estadoVideo();
                alRepetirVideo();
            }
        });
        v.addEventListener('error', function () {
            if (videoActual() === v) toast('No se pudo cargar este video.', 'error');
        });

        return v;
    }

    /* ================= NAVEGACIÓN ================= */

    function navegar(dir) {
        var n = st.indice + dir;
        if (n < 0 || n >= st.items.length) return;
        st.indice = n;
        colocar(true);
        onIndiceCambio();
    }

    function actualizarContador() {
        ref('contador').textContent = st.items.length > 1 ? (st.indice + 1) + ' / ' + st.items.length : '';
    }

    /* ================= LATERAL: REACCIONES Y COMENTARIOS ================= */

    async function refrescarLateral() {
        var token = ++st.lateralToken;
        var lat = ref('lateral');
        if (!lat) return;

        lat.innerHTML = '';
        lat.hidden = true;

        var item = itemActual();
        if (!item || !item.postId) return;

        lat.hidden = false;

        var btnCom = document.createElement('button');
        btnCom.type = 'button';
        btnCom.className = 'vmg2-lat-btn';
        btnCom.setAttribute('data-accion', 'comentarios');
        btnCom.setAttribute('aria-label', 'Comentarios');
        btnCom.innerHTML = ICONO.comentario + '<span class="vmg2-lat-n" data-ref="ncom">…</span>';
        lat.appendChild(btnCom);

        var c = cliente();
        if (!c || !window.ReaccionesGlobal) return;

        var uid = await uidActual(c);
        if (token !== st.lateralToken) return;

        try {
            await window.ReaccionesGlobal.preparar(c);
        } catch (e) { /* usa respaldo */ }

        var resumen = { totales: {}, total: 0, miTipo: null };
        try {
            resumen = await window.ReaccionesGlobal.cargarResumen(c, item.postId, uid);
        } catch (e) { /* ignorar */ }
        if (token !== st.lateralToken) return;

        var barra = window.ReaccionesGlobal.crearBarra({
            client: c,
            publicacionId: item.postId,
            usuarioId: uid,
            resumen: resumen
        });
        lat.insertBefore(barra.el, lat.firstChild);

        try {
            var r = await c.from('publicaciones_comentarios')
                .select('id', { count: 'exact', head: true })
                .eq('publicacion_id', item.postId);
            if (token !== st.lateralToken) return;
            var n = ref('ncom');
            if (n) n.textContent = String(r.count || 0);
        } catch (e) {
            var n2 = ref('ncom');
            if (n2) n2.textContent = '';
        }
    }

    function sumarComentariosLateral(delta) {
        var n = ref('ncom');
        if (!n) return;
        var actual = parseInt(n.textContent, 10);
        if (isNaN(actual)) actual = 0;
        n.textContent = String(Math.max(0, actual + delta));
    }

    function pintarComentarios() {
        var hoja = ref('hoja');
        hoja.classList.add('vmg-hoja-cm');
        hoja.innerHTML =
            '<div class="vmg-cm-head"><strong>Comentarios</strong>' +
                '<button type="button" data-accion="cerrarhoja" aria-label="Cerrar">' + ICONO.cerrar + '</button></div>' +
            '<div class="vmg-cm-lista" data-ref="cmLista"><div class="vmg-cm-vacio">Cargando…</div></div>' +
            '<form class="vmg-cm-form" data-ref="cmForm">' +
                '<input type="text" maxlength="500" placeholder="Escribe un comentario…" data-ref="cmInput" autocomplete="off">' +
                '<button type="submit">Enviar</button>' +
            '</form>';

        hoja.hidden = false;
        ref('fondo').hidden = false;

        if (!st.hojaHistory) {
            pushHistorySeguro();
            st.hojaHistory = true;
        }

        ref('cmForm').addEventListener('submit', function (e) {
            e.preventDefault();
            enviarComentario();
        });

        cargarComentarios();
    }

    async function cargarComentarios() {
        var item = itemActual();
        var lista = ref('cmLista');
        if (!item || !item.postId || !lista) return;

        var c = cliente();
        if (!c) {
            lista.innerHTML = '<div class="vmg-cm-vacio">Sin conexión.</div>';
            return;
        }

        try {
            var r = await c.from('publicaciones_comentarios_publicos')
                .select('id, contenido, created_at, usuario_nombre, usuario_handle')
                .eq('publicacion_id', item.postId)
                .order('created_at', { ascending: true })
                .limit(100);
            if (r.error) throw r.error;

            var l = ref('cmLista');
            if (!l) return;

            var filas = r.data || [];
            l.innerHTML = filas.length
                ? filas.map(function (f) {
                    return '<div class="vmg-cm-item"><span class="vmg-cm-autor">' +
                        escapeHtml(f.usuario_nombre || f.usuario_handle || 'Miembro') +
                        '</span>' + escapeHtml(f.contenido || '') + '</div>';
                }).join('')
                : '<div class="vmg-cm-vacio">Sin comentarios todavía.</div>';
            l.scrollTop = l.scrollHeight;
        } catch (e) {
            var l2 = ref('cmLista');
            if (l2) l2.innerHTML = '<div class="vmg-cm-vacio">No se pudieron cargar los comentarios.</div>';
        }
    }

    async function enviarComentario() {
        var item = itemActual();
        var input = ref('cmInput');
        if (!item || !item.postId || !input) return;

        var texto = String(input.value || '').trim();
        if (!texto) return;

        var c = cliente();
        var uid = await uidActual(c);
        if (!uid) {
            toast('Inicia sesión para comentar', 'error');
            return;
        }

        input.disabled = true;
        var r = await c.from('publicaciones_comentarios').insert({
            publicacion_id: item.postId,
            usuario_id: uid,
            contenido: texto
        });
        input.disabled = false;

        if (r.error) {
            toast('No se pudo comentar', 'error');
            return;
        }

        input.value = '';
        input.focus();
        sumarComentariosLateral(1);
        cargarComentarios();
    }

    /* ================= LETRERO «¿TE INTERESA?» ================= */

    function puedeMostrarNotifAhora() {
        if (st.notifSesionUsos >= NOTIF_MAX_POR_SESION) return false;
        if (st.notifVideosDesdeUltima < NOTIF_ENFRIAMIENTO_VIDEOS) return false;
        return true;
    }

    function ocultarNotif() {
        if (!st.root) return;
        var n = ref('notif');
        if (n) n.hidden = true;
        clearTimeout(st.notifTimer);
        st.notifTimer = null;
    }

    function cancelarTimerNotif() {
        clearTimeout(st.notifTimer);
        st.notifTimer = null;
    }

    function programarNotif() {
        cancelarTimerNotif();

        if (!st.root) return;

        var item = itemActual();
        if (!esVideoReal(item)) return;
        if (!st.onInteres && !st.onRechazo) return;
        if (item.postId && st.notifDescartados.has(String(item.postId))) return;
        if (!puedeMostrarNotifAhora()) return;

        st.notifItemActual = item;

        st.notifTimer = setTimeout(function () {
            st.notifTimer = null;
            if (!st.abierto) return;
            var actual = itemActual();
            if (!mismoItem(actual, st.notifItemActual)) return;
            if (!esVideoReal(actual)) return;
            if (actual.postId && st.notifDescartados.has(String(actual.postId))) return;
            if (!puedeMostrarNotifAhora()) return;

            var n = ref('notif');
            if (!n) return;

            n.hidden = false;
            st.notifSesionUsos++;
            st.notifVideosDesdeUltima = 0;
        }, NOTIF_DELAY_MS);
    }

    function alCambiarVideo() {
        cancelarTimerNotif();
        ocultarNotif();

        st.notifVideosDesdeUltima++;
        st.notifItemActual = null;

        programarNotif();
    }

    function alRepetirVideo() {
        var item = itemActual();
        if (!esVideoReal(item)) return;
        if (st.notifItemActual && mismoItem(st.notifItemActual, item)) return;
        programarNotif();
    }

    function responderInteres(positivo) {
        var item = itemActual();
        if (!item) return;

        if (item.postId) st.notifDescartados.add(String(item.postId));

        ocultarNotif();
        cancelarTimerNotif();

        try {
            if (positivo && typeof st.onInteres === 'function') st.onInteres(item);
            if (!positivo && typeof st.onRechazo === 'function') st.onRechazo(item);
        } catch (e) {
            console.warn('[VisorMediaGlobal] interes:', e);
        }

        if (!positivo && st.indice < st.items.length - 1) {
            setTimeout(function () { navegar(1); }, 50);
        }
    }

    /* ================= HOJA DE ACCIONES ================= */

    function boton(nombreAccion, icono, texto, extra) {
        return '<button type="button" class="vmg-op ' + (extra || '') + '" data-accion="' + nombreAccion + '">' + icono + ' ' + texto + '</button>';
    }

    function pintarHoja(vista) {
        var item = st.items[st.indice] || {};
        var hoja = ref('hoja');
        var html = '';

        hoja.classList.remove('vmg-hoja-cm');

        if (vista === 'acciones') {
            html += boton('guardar', ICONO.descargar, 'Guardar');

            if (item.esDueno) {
                html += boton('eliminar', ICONO.eliminar, 'Eliminar publicación', 'vmg-peligro');
            } else {
                html += boton('ocultar', ICONO.ocultar, 'No quiero ver esto');
                html += boton('reportar', ICONO.reportar, 'Reportar contenido →');
            }
        } else if (vista === 'motivos') {
            html += '<button type="button" class="vmg-op" data-accion="menu">‹ Volver</button>';
            html += '<h3>¿Por qué quieres reportar este contenido?</h3>';
            MOTIVOS.forEach(function (m) {
                html += '<button type="button" class="vmg-op" data-accion="motivo" data-motivo="' + escapeHtml(m) + '">' + escapeHtml(m) + ' ›</button>';
            });
        } else if (vista === 'confirmar') {
            html += '<button type="button" class="vmg-op" data-accion="reportar">‹ Motivos</button>';
            html += '<h3>Vas a enviar un reporte</h3>';
            html += '<p>Motivo: <strong>' + escapeHtml(st.motivo) + '</strong></p>';
            html += '<p>Solo eliminamos contenido que infringe nuestras <strong>Normas comunitarias</strong>.</p>';
            html += '<button type="button" class="vmg-btn-primario" data-accion="enviar-reporte">Enviar reporte</button>';
        }

        hoja.innerHTML = html;
        hoja.hidden = false;
        ref('fondo').hidden = false;

        if (!st.hojaHistory) {
            pushHistorySeguro();
            st.hojaHistory = true;
        }
    }

    function ocultarHoja(desdePop) {
        if (!st.root) return;
        var hoja = ref('hoja');
        var estabaAbierta = !hoja.hidden;
        hoja.hidden = true;
        hoja.innerHTML = '';
        hoja.classList.remove('vmg-hoja-cm');
        ref('fondo').hidden = true;

        var teniaHistory = st.hojaHistory;
        st.hojaHistory = false;

        if (estabaAbierta && teniaHistory && !desdePop) {
            consumirEstadoSinPopstate();
        }
    }

    function accion(nombre, btn) {
        switch (nombre) {
            case 'cerrar': cerrar(); break;
            case 'menu': pintarHoja('acciones'); break;
            case 'toggle': togglePlay(); break;
            case 'velocidad': velocidad(); break;
            case 'pip': pip(); break;
            case 'ajustar':
                st.fit = st.fit === 'cover' ? 'contain' : 'cover';
                aplicarFit();
                break;
            case 'cerrarhoja': ocultarHoja(); break;
            case 'comentarios': pintarComentarios(); break;
            case 'guardar':
                ocultarHoja();
                descargar(itemActual());
                break;
            case 'ocultar': ocultar(); break;
            case 'reportar': pintarHoja('motivos'); break;
            case 'motivo':
                st.motivo = btn.getAttribute('data-motivo') || '';
                pintarHoja('confirmar');
                break;
            case 'enviar-reporte': reportar(); break;
            case 'eliminar': eliminar(); break;
            case 'interes-si': responderInteres(true); break;
            case 'interes-no': responderInteres(false); break;
        }
    }

    /* ================= ACCIONES CON BASE DE DATOS ================= */

    async function descargar(item) {
        if (!item) return;

        if (item.permiteDescarga === false) {
            toast('La descarga no está permitida para este contenido.', 'warning');
            return;
        }

        var url = safeHttps(item.url);
        if (!url) return;

        try {
            toast('Preparando descarga...', 'info');

            var res = await fetch(url);
            if (!res.ok) throw new Error('red');

            var blob = await res.blob();
            var objUrl = URL.createObjectURL(blob);

            var a = document.createElement('a');
            a.href = objUrl;
            a.download = 'csariels-' + Date.now() + '.' + (esVideoReal(item) ? 'mp4' : 'jpg');
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(function () { URL.revokeObjectURL(objUrl); }, 2000);
        } catch (e) {
            toast('No se pudo guardar el archivo', 'error');
        }
    }

    async function ocultar() {
        var item = itemActual() || {};
        var c = cliente();

        if (!item.postId || !c) {
            toast('No se pudo ocultar esta publicación.', 'error');
            return;
        }

        try {
            var uid = await uidActual(c);
            if (!uid) throw new Error('Inicia sesión');

            var r = await c.from('publicaciones_ocultas').insert({
                usuario_id: uid,
                publicacion_id: item.postId
            });

            if (r.error && r.error.code !== '23505') throw r.error;

            toast('Publicación oculta para ti.', 'success');
            cerrar();

            if (typeof st.opts.onOcultar === 'function') st.opts.onOcultar(item);
        } catch (e) {
            toast('Error al ocultar la publicación.', 'error');
        }
    }

    async function reportar() {
        var item = itemActual() || {};
        var c = cliente();

        if (!item.postId || !c) {
            toast('No se pudo enviar el reporte.', 'error');
            return;
        }

        try {
            var uid = await uidActual(c);
            if (!uid) throw new Error('Inicia sesión');

            var r = await c.from('publicacion_reportes').insert({
                publicacion_id: item.postId,
                usuario_id: uid,
                motivo: st.motivo,
                estado: 'pendiente'
            });

            if (r.error && r.error.code !== '23505') throw r.error;

            ocultarHoja();
            toast(
                r.error ? 'Ya habías reportado esta publicación.' : 'Reporte enviado con éxito.',
                r.error ? 'warning' : 'success'
            );
        } catch (e) {
            toast('Error al enviar el reporte.', 'error');
        }
    }

    function eliminar() {
        var item = itemActual();

        ocultarHoja();
        cerrar();

        if (item && typeof st.opts.onEliminar === 'function') st.opts.onEliminar(item);
    }

    /* ================= ABRIR Y CERRAR ================= */

    function abrir(opts) {
        construir();

        opts = opts || {};

        if (!Array.isArray(opts.items) || !opts.items.length) return;

        var indiceSolicitado = Math.min(Math.max(0, parseInt(opts.indice, 10) || 0), opts.items.length - 1);
        var itemSolicitado = opts.items[indiceSolicitado] || null;
        var itemsFinales = opts.items.slice();
        var indiceFinal = indiceSolicitado;

        // Carrusel vertical: solo videos reales.
        if (opts.carruselVertical === true) {
            itemsFinales = itemsFinales.filter(esVideoReal);
            if (!itemsFinales.length) return;

            indiceFinal = 0;
            if (itemSolicitado) {
                for (var i = 0; i < itemsFinales.length; i++) {
                    if (mismoItem(itemsFinales[i], itemSolicitado)) {
                        indiceFinal = i;
                        break;
                    }
                }
            }
        }

        st.opts = opts;
        st.items = itemsFinales;
        st.indice = indiceFinal;
        st.carrusel = opts.carruselVertical === true;
        st.modo = st.carrusel ? 'v' : 'h';
        st.fit = 'contain';
        st.abierto = true;
        st.velIdx = 0;
        st.hojaHistory = false;
        st.ignorarPopstate = false;
        st.drag = null;
        st.offsetPx = 0;
        ref('vel').textContent = '1x';

        st.onInteres = typeof opts.onInteres === 'function' ? opts.onInteres : null;
        st.onRechazo = typeof opts.onRechazo === 'function' ? opts.onRechazo : null;
        st.autoReproducir = opts.autoReproducir !== false;
        st.ahorradorDatos = opts.ahorradorDatos === true;
        st.videosAltaCalidad = opts.videosAltaCalidad !== false;
        st.notifDescartados = new Set();

        st.notifSesionUsos = 0;
        st.notifVideosDesdeUltima = NOTIF_ENFRIAMIENTO_VIDEOS;
        st.notifItemActual = null;

        st.root.hidden = false;
        st.root.classList.remove('vmg-oculto');
        document.body.style.overflow = 'hidden';

        instalarPopstate();
        pushHistorySeguro();

        montar();
        actualizarContador();
        activarActual();
        alCambiarVideo();
        refrescarLateral();
    }

    function cerrar(desdePop) {
        if (!st.root || !st.abierto) return;

        pausar();

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(function () {});
        }

        clearTimeout(st.timerOcultar);
        cancelarTimerNotif();

        limpiarEscenario();
        ref('lateral').innerHTML = '';
        ref('lateral').hidden = true;

        ocultarHoja(true);
        ocultarNotif();

        st.root.hidden = true;
        st.root.classList.remove('vmg-oculto');

        st.abierto = false;
        st.items = [];
        st.carrusel = false;
        st.drag = null;
        st.notifItemActual = null;
        st.lateralToken++;

        document.body.style.overflow = '';

        if (!desdePop) {
            consumirEstadoSinPopstate();
        }

        if (st.historyDepth <= 0) {
            st.historyDepth = 0;
            desinstalarPopstate();
        }
    }

    /* ================= API PÚBLICA ================= */

    window.VisorMediaGlobal = {
        version: VERSION,
        abrir: abrir,
        cerrar: cerrar,
        estaAbierto: function () { return st.abierto; },
        contieneVideo: function (v) { return Boolean(v && st.root && st.root.contains(v)); }
    };
})();