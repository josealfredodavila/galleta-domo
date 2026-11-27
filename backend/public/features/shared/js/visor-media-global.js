/* ================================================================
   VISOR-MEDIA-GLOBAL.JS · Csariel's · v2.2
   Visor de pantalla completa compartido para fotos y videos.

   CAMBIOS v2.2:
   · Menos consultas por cambio de video: el conteo de comentarios se
     toma de item.comentarios (dato de la página) o de la caché del
     video. Solo si no existe ningún dato se pide el conteo, una vez por
     video. Con item.comentarios enviado por la página, cada cambio de
     video hace una sola consulta (el resumen de reacciones).
   · Peticiones obsoletas: cada cambio de video (y cerrar el visor)
     cancela la consulta de comentarios en curso con AbortController y
     descarta cualquier resultado tardío mediante una secuencia de video.
     Así no hay datos cruzados entre videos.
   · Al cerrar la hoja de comentarios, el contador del botón se actualiza
     con el total real de la lista cargada (sin consulta extra).
   · Al cambiar de video con la hoja de comentarios abierta, la hoja se
     cierra para que nunca se comente sobre un video distinto.
   · Comentarios con avatar (o inicial) y nombre del autor.
   · Barra de reacciones sin caja negra sobre el video (CSS interno).
   · API pública sin cambios. Sin sessionStorage.

   API pública (sin cambios):
     VisorMediaGlobal.abrir, cerrar, estaAbierto, contieneVideo, version.
   ================================================================ */
(function () {
    'use strict';

    var VERSION = '2.2';

    if (window.VisorMediaGlobal && window.VisorMediaGlobal.version === VERSION) return;

    var CSS_PATH = '/features/shared/css/visor-media-global.css';
    var API_BASE = '/api';
    var VELOCIDADES = [1, 1.25, 1.5, 2];
    var EXT_IMAGEN_RE = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?|#|$)/i;
    var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    var IMPRESION_MIN_MS = 1000;
    var UMBRAL_VISIBLE = 0.6;

    var FLUSH_MS = 4000;
    var FLUSH_MAX = 10;
    var FLUSH_LOTE_MAX = 50;
    var REINTENTOS_MAX = 3;

    var NOTIF_DELAY_MS = 6000;
    var NOTIF_ENFRIAMIENTO_VIDEOS = 4;
    var NOTIF_MAX_POR_SESION = 2;

    var UMBRAL_GESTO_PX = 8;
    var COMENTARIOS_LIMITE = 100;

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

    function uuid() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }

    /* Solo en memoria de la página: no se usa sessionStorage. */
    var SESION_ID = uuid();
    var enviadasGlobal = new Set();

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
        modo: 'h',
        carrusel: false,
        slides: [],
        offsetPx: 0,
        drag: null,
        historyDepth: 0,
        popstateHandler: null,
        ignorarPopstate: false,
        autoReproducir: true,
        ahorradorDatos: false,
        videosAltaCalidad: true,
        notifTimer: null,
        notifDescartados: new Set(),
        onInteres: null,
        onRechazo: null,
        notifSesionUsos: 0,
        notifVideosDesdeUltima: 0,
        notifItemActual: null,
        lateralToken: 0,
        lateralCtrl: null,
        io: null,
        impresionTimer: null,
        visibleSince: 0,
        enviadas: enviadasGlobal,
        iniciados: new Set(),
        completados: new Set(),
        cola: [],
        flushTimer: null,
        reintentos: 0,
        token: null,
        uid: null,
        requestId: null,
        rankingVersion: null,
        scrollY: 0,
        /* Secuencia de video: cambia en cada cambio de video. Lo asíncrono
           compara su secuencia y descarta lo que llegó de otro video. */
        itemSeq: 0,
        comentariosCache: new Map(),
        cmCtrl: null,
        hojaTipo: null,
        hojaPostId: null,
        hojaSeq: -1
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

    /* Aplica la señal de cancelación a una consulta de Supabase, si el cliente lo admite. */
    function conSenal(consulta, senal) {
        if (senal && consulta && typeof consulta.abortSignal === 'function') {
            return consulta.abortSignal(senal);
        }
        return consulta;
    }

    function inicialDe(nombre) {
        var t = String(nombre || '').trim();
        return t ? t.charAt(0).toUpperCase() : '•';
    }

    function asegurarCss() {
        if (!document.querySelector('link[href="' + CSS_PATH + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = CSS_PATH;
            document.head.appendChild(link);
        }
        if (!document.getElementById('vmg2-estilos')) {
            var est = document.createElement('style');
            est.id = 'vmg2-estilos';
            est.textContent =
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

                /* Barra de reacciones dentro del visor: sin caja negra fija.
                   Solo el disparador es visible; el menú aparece al abrirlo. */
                '.vmg2-lateral .rg-wrap{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;}' +
                '.vmg2-lateral .rg-disparador{background:rgba(10,14,22,.72)!important;box-shadow:none!important;}' +
                '.vmg2-lateral .rg-menu[hidden]{display:none!important;}' +
                '.vmg2-lateral .rg-menu{background:rgba(10,14,22,.94);border-radius:24px;box-shadow:0 8px 22px rgba(0,0,0,.5);}' +

                '.vmg-hoja.vmg-hoja-cm{padding:0;display:flex;flex-direction:column;}' +
                '.vmg-cm-lista{flex:1;min-height:30dvh;max-height:52dvh;overflow-y:auto;padding:4px 0;}' +
                '.vmg-cm-fila{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);}' +
                '.vmg-cm-av{width:34px;height:34px;flex:0 0 34px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f2d1a,#d4af37);color:#fff;font-weight:700;font-size:14px;border:1.5px solid rgba(0,229,255,.4);}' +
                '.vmg-cm-av img{width:100%;height:100%;object-fit:cover;}' +
                '.vmg-cm-cuerpo{min-width:0;flex:1;}' +
                '.vmg-cm-nombre{display:block;font-weight:700;color:#5cc8ff;font-size:13px;line-height:1.3;}' +
                '.vmg-cm-texto{display:block;color:#eef6ff;font-size:14px;line-height:1.4;word-break:break-word;white-space:pre-wrap;}' +
                '.vmg-cm-vacio{color:#8c949c;font-size:13px;padding:16px 14px;}' +
                '.vmg-cm-form{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(255,255,255,.08);}' +
                '.vmg-cm-form input{flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-size:16px;outline:none;}' +
                '.vmg-cm-form button{padding:10px 14px;border-radius:12px;border:0;background:#00e5ff;color:#04070d;font-weight:700;cursor:pointer;}' +
                '.vmg-cm-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);color:#f0f4f8;}' +
                '.vmg-cm-head button{background:transparent;border:0;color:#fff;cursor:pointer;}';
            document.head.appendChild(est);
        }
    }

    function ref(nombre) {
        return st.root.querySelector('[data-ref="' + nombre + '"]');
    }

    /* Video del slide que está en el índice actual (única fuente de verdad). */
    function videoActual() {
        if (!st.root) return null;
        var s = st.slides[st.indice];
        if (!s || !s.media) return null;
        return s.media.tagName === 'VIDEO' ? s.media : null;
    }

    function itemActual() {
        return st.items[st.indice] || null;
    }

    function postIdActual() {
        var it = itemActual();
        return it && it.postId ? String(it.postId) : null;
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

    function hojaAbierta() {
        return !!st.root && !ref('hoja').hidden;
    }

    /* ================= API Y EVENTOS ================= */

    async function refrescarToken() {
        var c = cliente();
        if (!c) return;
        try {
            var r = await c.auth.getSession();
            st.token = r.data && r.data.session ? r.data.session.access_token : null;
        } catch (e) {
            st.token = null;
        }
    }

    async function apiPost(ruta, cuerpo, keepalive) {
        var t = st.token;
        if (!t) {
            await refrescarToken();
            t = st.token;
        }
        if (!t) throw new Error('sin sesión');

        var r = await fetch(API_BASE + ruta, {
            method: 'POST',
            keepalive: !!keepalive,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + t
            },
            body: JSON.stringify(cuerpo)
        });

        if (r.status === 401) st.token = null;
        if (!r.ok) throw new Error('HTTP ' + r.status);

        return r.json().catch(function () { return {}; });
    }

    function construirEvento(item, tipo, extra) {
        var base = {
            event_id: uuid(),
            item_id: String(item.postId),
            item_tipo: 'publicacion',
            tipo_evento: tipo,
            posicion: st.indice,
            session_id: SESION_ID,
            request_id: st.requestId || null,
            ranking_version: st.rankingVersion || null,
            fuente: item.fuente || null
        };
        return Object.assign(base, extra || {});
    }

    function encolar(ev) {
        st.cola.push(ev);

        if (st.cola.length >= FLUSH_MAX) {
            flush(false);
        } else if (!st.flushTimer) {
            st.flushTimer = setTimeout(function () { flush(false); }, FLUSH_MS);
        }
    }

    async function flush(keepalive) {
        clearTimeout(st.flushTimer);
        st.flushTimer = null;

        if (!st.cola.length) return;

        var lote = st.cola.splice(0, FLUSH_LOTE_MAX);

        try {
            await apiPost('/recomendacion/eventos', { eventos: lote }, keepalive);
            st.reintentos = 0;
        } catch (e) {
            if (e && e.message === 'sin sesión') return;
            if (!keepalive && st.reintentos < REINTENTOS_MAX) {
                st.reintentos++;
                st.cola = lote.concat(st.cola);
                st.flushTimer = setTimeout(function () { flush(false); }, 8000);
            }
        }
    }

    async function enviarVoto(item, voto) {
        if (!item || !item.postId || !UUID_RE.test(String(item.postId))) return;
        try {
            await apiPost('/recomendacion/interes', {
                item_id: String(item.postId),
                item_tipo: 'publicacion',
                voto: voto
            });
        } catch (e) {
            if (e && e.message === 'sin sesión') {
                toast('Inicia sesión para responder', 'error');
            } else {
                toast('No se pudo guardar tu respuesta', 'error');
            }
        }
    }

    /* ================= IMPRESIONES CON VISIBILIDAD REAL ================= */

    function cancelarImpresion() {
        clearTimeout(st.impresionTimer);
        st.impresionTimer = null;
    }

    function iniciarImpresion(item) {
        if (!item || !item.postId || !UUID_RE.test(String(item.postId))) return;
        if (st.enviadas.has(String(item.postId))) return;
        if (st.impresionTimer) return;
        if (document.hidden) return;

        st.visibleSince = Date.now();

        st.impresionTimer = setTimeout(function () {
            st.impresionTimer = null;

            if (!mismoItem(itemActual(), item)) return;
            if (st.enviadas.has(String(item.postId))) return;

            st.enviadas.add(String(item.postId));

            encolar(construirEvento(item, 'impression', {
                valor: 1,
                contexto: {
                    entrada: st.opts.entrada || 'visor',
                    visible_ms: Date.now() - st.visibleSince
                }
            }));
        }, IMPRESION_MIN_MS);
    }

    /* Observa solo el slide actual. Se vuelve a crear en cada cambio de índice. */
    function observarVisibilidad() {
        if (st.io) {
            st.io.disconnect();
            st.io = null;
        }
        cancelarImpresion();

        if (!window.IntersectionObserver || !st.abierto) return;

        var s = st.slides[st.indice];
        if (!s) return;

        var item = s.item;

        st.io = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (en) {
                if (en.target !== s.el) return;
                if (en.isIntersecting && en.intersectionRatio >= UMBRAL_VISIBLE) {
                    iniciarImpresion(item);
                } else {
                    cancelarImpresion();
                }
            });
        }, { root: ref('escenario'), threshold: [0, UMBRAL_VISIBLE, 1] });

        st.io.observe(s.el);
    }

    /* ================= HISTORIAL (solo el visor) ================= */

    function pushHistorySeguro() {
        try {
            history.pushState({ vmg: true }, '');
            st.historyDepth++;
        } catch (e) { /* ignorar */ }
    }

    /* Retira la entrada de historial que dejó el visor, sin disparar cierre. */
    function consumirEntradaVisor() {
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

            if (st.abierto) cerrar(true);
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
                if (hojaAbierta()) ocultarHoja();
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
            if (!st.abierto) return;
            aplicarFit();
            colocar(false);
        });

        window.addEventListener('pagehide', function () { flush(true); });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                cancelarImpresion();
                flush(true);
            } else if (st.abierto) {
                observarVisibilidad();
            }
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
                if (Math.abs(dx) < UMBRAL_GESTO_PX && Math.abs(dy) < UMBRAL_GESTO_PX) return;
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

    /* El índice cambia AQUÍ y solo aquí (una vez por gesto). */
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
            var siguiente = st.indice;

            if (raw < -umbral || vel < -0.5) siguiente = st.indice + 1;
            else if (raw > umbral || vel > 0.5) siguiente = st.indice - 1;

            if (siguiente < 0) siguiente = 0;
            if (siguiente > st.items.length - 1) siguiente = st.items.length - 1;

            st.offsetPx = 0;

            if (siguiente !== st.indice) {
                cambiarIndice(siguiente, true);
            } else {
                colocar(true);
            }
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

    /* Punto único de cambio de índice: contador, reproducción, letrero, lateral y observador. */
    function cambiarIndice(nuevo, animar) {
        if (nuevo === st.indice) return;
        st.indice = nuevo;
        colocar(animar);
        onIndiceCambio();
    }

    /* ================= COLOCAR SLIDES ================= */

    function limpiarEscenario() {
        var esc = ref('escenario');
        st.slides.forEach(function (s) { quitarMedia(s); });
        esc.innerHTML = '';
        esc.style.overflow = 'hidden';
        esc.style.touchAction = 'none';
        st.slides = [];
    }

    function montar() {
        limpiarEscenario();

        var esc = ref('escenario');
        var track = document.createElement('div');
        track.className = 'vmg-pg-track';
        esc.appendChild(track);

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
            var v = crearVideo(item, s);
            if (!v) {
                s.el.innerHTML = '<div class="vmg-pg-err">No se pudo cargar</div>';
                return;
            }
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

    /* Un cambio de video: nueva secuencia, cierra la hoja de comentarios,
       cancela lo pendiente del video anterior y arranca el actual. */
    function onIndiceCambio() {
        st.itemSeq++;

        if (hojaAbierta()) ocultarHoja();

        actualizarContador();
        activarActual();
        alCambiarVideo();
        refrescarLateral();
        observarVisibilidad();
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
                reproducirCuandoListo(v);
            } else {
                estadoVideo();
            }
        } else {
            estadoVideo();
        }
    }

    /* Espera a tener metadatos antes de dar play: evita negro y 0:00. */
    function reproducirCuandoListo(v) {
        var intentar = function () {
            if (videoActual() !== v) return;
            v.play().then(function () { estadoVideo(); }).catch(function () { estadoVideo(); });
        };

        if (v.readyState >= 1) {
            intentar();
        } else {
            v.addEventListener('loadedmetadata', intentar, { once: true });
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

    /* El video se crea sin reproducción automática; el ciclo de play lo decide
       activarActual(). Eventos de vista y finalización aquí. */
    function crearVideo(item, s) {
        var url = safeHttps(item.url);
        if (!url) return null;

        var v = document.createElement('video');
        v.src = url;
        v.preload = st.ahorradorDatos ? 'none' : (s.i === st.indice ? 'auto' : 'metadata');
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        v.style.background = '#000';
        if (item.permiteDescarga === false) v.setAttribute('controlsList', 'nodownload');

        v.addEventListener('loadedmetadata', function () {
            if (videoActual() === v) actualizarTiempo();
        });
        v.addEventListener('timeupdate', function () {
            if (videoActual() === v) actualizarTiempo();
        });
        v.addEventListener('play', function () {
            if (videoActual() !== v) return;
            estadoVideo();

            var it = itemActual();
            if (it && it.postId && !st.iniciados.has(String(it.postId))) {
                st.iniciados.add(String(it.postId));
                encolar(construirEvento(it, 'view_start', { valor: 1 }));
            }
        });
        v.addEventListener('pause', function () {
            if (videoActual() === v) estadoVideo();
        });
        v.addEventListener('ended', function () {
            if (videoActual() !== v) return;
            estadoVideo();

            var it = itemActual();
            if (it && it.postId && !st.completados.has(String(it.postId))) {
                st.completados.add(String(it.postId));
                encolar(construirEvento(it, 'complete', { valor: 1 }));
            }
            alRepetirVideo();
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
        cambiarIndice(n, true);
    }

    function actualizarContador() {
        ref('contador').textContent = st.items.length > 1 ? (st.indice + 1) + ' / ' + st.items.length : '';
    }

    /* ================= CONTADOR DE COMENTARIOS ================= */

    /* Valor conocido del conteo para el video actual: caché, o el dato de la página. */
    function valorComentarios(item) {
        if (!item || !item.postId) return null;
        var id = String(item.postId);
        if (st.comentariosCache.has(id)) return st.comentariosCache.get(id);
        return typeof item.comentarios === 'number' ? item.comentarios : null;
    }

    function textoComentarios(n) {
        return n == null ? '…' : String(n);
    }

    function setNcom(n) {
        var e = ref('ncom');
        if (e) e.textContent = textoComentarios(n);
    }

    /* Conteo exacto solo si no hay ningún dato previo. Se cancela con la señal. */
    async function contarComentarios(c, postId, senal) {
        try {
            var r = await conSenal(
                c.from('publicaciones_comentarios')
                    .select('id', { count: 'exact', head: true })
                    .eq('publicacion_id', postId),
                senal
            );
            if (r.error) return null;
            return r.count || 0;
        } catch (e) {
            return null;
        }
    }

    /* ================= LATERAL: REACCIONES Y COMENTARIOS ================= */

    /* Vigente solo si el video, la petición y el visor siguen siendo los mismos. */
    function vigente(seq, token) {
        return st.abierto && seq === st.itemSeq && token === st.lateralToken;
    }

    async function refrescarLateral() {
        var seq = st.itemSeq;
        var token = ++st.lateralToken;

        if (st.lateralCtrl) st.lateralCtrl.abort();
        st.lateralCtrl = typeof AbortController === 'function' ? new AbortController() : null;
        var senal = st.lateralCtrl ? st.lateralCtrl.signal : undefined;

        var lat = ref('lateral');
        if (!lat) return;

        lat.innerHTML = '';
        lat.hidden = true;

        var item = itemActual();
        if (!item || !item.postId) return;

        var postId = String(item.postId);
        lat.hidden = false;

        var btnCom = document.createElement('button');
        btnCom.type = 'button';
        btnCom.className = 'vmg2-lat-btn';
        btnCom.setAttribute('data-accion', 'comentarios');
        btnCom.setAttribute('aria-label', 'Comentarios');
        btnCom.innerHTML = ICONO.comentario;

        var nCom = document.createElement('span');
        nCom.className = 'vmg2-lat-n';
        nCom.setAttribute('data-ref', 'ncom');
        nCom.textContent = textoComentarios(valorComentarios(item));
        btnCom.appendChild(nCom);

        lat.appendChild(btnCom);

        var c = cliente();
        if (!c || !window.ReaccionesGlobal) return;

        if (!st.uid) st.uid = await uidActual(c);
        if (!vigente(seq, token)) return;

        try {
            await window.ReaccionesGlobal.preparar(c);
        } catch (e) { /* usa respaldo */ }
        if (!vigente(seq, token)) return;

        /* Única consulta de red por video: el resumen de reacciones. */
        var resumen = { totales: {}, total: 0, miTipo: null };
        try {
            resumen = await window.ReaccionesGlobal.cargarResumen(c, postId, st.uid);
        } catch (e) { /* ignorar */ }
        if (!vigente(seq, token)) return;

        var barra = window.ReaccionesGlobal.crearBarra({
            client: c,
            publicacionId: item.postId,
            usuarioId: st.uid,
            resumen: resumen
        });
        lat.insertBefore(barra.el, lat.firstChild);

        /* Solo si la página no envió el conteo ni hay caché: se pide una vez. */
        if (valorComentarios(item) == null) {
            var n = await contarComentarios(c, postId, senal);
            if (!vigente(seq, token) || n == null) return;
            st.comentariosCache.set(postId, n);
            setNcom(n);
        }
    }

    /* ================= HOJA DE COMENTARIOS ================= */

    /* Fila de comentario: avatar (o inicial) y nombre del autor, con el texto. */
    function filaComentario(f) {
        var nombre = f.usuario_nombre || f.usuario_handle || 'Miembro';

        var fila = document.createElement('div');
        fila.className = 'vmg-cm-fila';

        var av = document.createElement('div');
        av.className = 'vmg-cm-av';

        var url = safeHttps(f.usuario_avatar_url);
        if (url) {
            var img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = url;
            img.onerror = function () {
                av.textContent = inicialDe(nombre);
            };
            av.appendChild(img);
        } else {
            av.textContent = inicialDe(nombre);
        }

        var cuerpo = document.createElement('div');
        cuerpo.className = 'vmg-cm-cuerpo';

        var nom = document.createElement('span');
        nom.className = 'vmg-cm-nombre';
        nom.textContent = nombre;

        var txt = document.createElement('span');
        txt.className = 'vmg-cm-texto';
        txt.textContent = f.contenido || '';

        cuerpo.appendChild(nom);
        cuerpo.appendChild(txt);

        fila.appendChild(av);
        fila.appendChild(cuerpo);

        return fila;
    }

    /* La hoja sigue abierta y pertenece al mismo video que originó la carga. */
    function hojaComentariosVigente(seq, postId) {
        return st.abierto &&
            st.hojaTipo === 'comentarios' &&
            seq === st.itemSeq &&
            st.hojaPostId === postId &&
            !!ref('cmLista');
    }

    function pintarListaComentarios(filas) {
        var l = ref('cmLista');
        if (!l) return;

        l.innerHTML = '';

        if (!filas.length) {
            var vacio = document.createElement('div');
            vacio.className = 'vmg-cm-vacio';
            vacio.textContent = 'Sin comentarios todavía.';
            l.appendChild(vacio);
            return;
        }

        filas.forEach(function (f) {
            l.appendChild(filaComentario(f));
        });

        l.scrollTop = l.scrollHeight;
    }

    async function cargarComentarios(seq, postId) {
        var lista = ref('cmLista');
        if (!lista) return;

        var c = cliente();
        if (!c) {
            lista.innerHTML = '<div class="vmg-cm-vacio">Sin conexión.</div>';
            return;
        }

        var senal = st.cmCtrl ? st.cmCtrl.signal : undefined;

        try {
            var r = await conSenal(
                c.from('publicaciones_comentarios_publicos')
                    .select('id, contenido, created_at, usuario_nombre, usuario_handle, usuario_avatar_url')
                    .eq('publicacion_id', postId)
                    .order('created_at', { ascending: true })
                    .limit(COMENTARIOS_LIMITE),
                senal
            );
            if (r.error) throw r.error;
            if (!hojaComentariosVigente(seq, postId)) return;

            var filas = Array.isArray(r.data) ? r.data : [];
            var total = filas.length;

            /* La lista llegó completa en esta consulta; solo si está truncada se pide el total. */
            if (filas.length >= COMENTARIOS_LIMITE) {
                var n = await contarComentarios(c, postId, senal);
                if (!hojaComentariosVigente(seq, postId)) return;
                if (n != null) total = n;
            }

            st.comentariosCache.set(postId, total);
            if (postIdActual() === postId) setNcom(total);

            pintarListaComentarios(filas);
        } catch (e) {
            if (!hojaComentariosVigente(seq, postId)) return;
            var l2 = ref('cmLista');
            if (l2) l2.innerHTML = '<div class="vmg-cm-vacio">No se pudieron cargar los comentarios.</div>';
        }
    }

    function pintarComentarios() {
        var item = itemActual();
        if (!item || !item.postId) return;

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

        st.hojaTipo = 'comentarios';
        st.hojaPostId = String(item.postId);
        st.hojaSeq = st.itemSeq;

        if (st.cmCtrl) st.cmCtrl.abort();
        st.cmCtrl = typeof AbortController === 'function' ? new AbortController() : null;

        ref('cmForm').addEventListener('submit', function (e) {
            e.preventDefault();
            enviarComentario();
        });

        cargarComentarios(st.itemSeq, st.hojaPostId);
    }

    async function enviarComentario() {
        var item = itemActual();
        var input = ref('cmInput');
        if (!item || !item.postId || !input) return;

        var texto = String(input.value || '').trim();
        if (!texto) return;

        var c = cliente();
        var seq = st.itemSeq;
        var postId = String(item.postId);

        if (!st.uid) st.uid = await uidActual(c);
        if (!st.uid) {
            toast('Inicia sesión para comentar', 'error');
            return;
        }

        input.disabled = true;
        var r = await c.from('publicaciones_comentarios').insert({
            publicacion_id: item.postId,
            usuario_id: st.uid,
            contenido: texto
        });
        input.disabled = false;

        if (r.error) {
            toast('No se pudo comentar', 'error');
            return;
        }

        /* El comentario se guardó aunque el usuario ya haya cambiado de video. */
        var previo = st.comentariosCache.get(postId);
        if (previo != null) {
            st.comentariosCache.set(postId, previo + 1);
        }

        if (seq !== st.itemSeq || !hojaComentariosVigente(seq, postId)) {
            return;
        }

        input.value = '';
        input.focus();
        if (postIdActual() === postId) setNcom(st.comentariosCache.get(postId));

        cargarComentarios(seq, postId);
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
        if (!item.postId || !UUID_RE.test(String(item.postId))) return;
        if (st.notifDescartados.has(String(item.postId))) return;
        if (!puedeMostrarNotifAhora()) return;

        st.notifItemActual = item;

        st.notifTimer = setTimeout(function () {
            st.notifTimer = null;
            if (!st.abierto) return;
            var actual = itemActual();
            if (!mismoItem(actual, st.notifItemActual)) return;
            if (!esVideoReal(actual)) return;
            if (st.notifDescartados.has(String(actual.postId))) return;
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

        enviarVoto(item, positivo ? 'interesa' : 'no_interesa');

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

    /* ================= HOJA DE ACCIONES (sin historial) ================= */

    function boton(nombreAccion, icono, texto, extra) {
        return '<button type="button" class="vmg-op ' + (extra || '') + '" data-accion="' + nombreAccion + '">' + icono + ' ' + texto + '</button>';
    }

    function pintarHoja(vista) {
        var item = st.items[st.indice] || {};
        var hoja = ref('hoja');
        var html = '';

        hoja.classList.remove('vmg-hoja-cm');
        st.hojaTipo = 'acciones';

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
    }

    /* Cierra la hoja interna. No toca el historial: el visor sigue abierto.
       Al cerrar comentarios, el botón muestra el total real de la lista. */
    function ocultarHoja() {
        if (!st.root) return;

        var hoja = ref('hoja');
        var eraComentarios = st.hojaTipo === 'comentarios';
        var postId = st.hojaPostId;
        var seq = st.hojaSeq;

        if (st.cmCtrl) {
            st.cmCtrl.abort();
            st.cmCtrl = null;
        }

        hoja.hidden = true;
        hoja.innerHTML = '';
        hoja.classList.remove('vmg-hoja-cm');
        ref('fondo').hidden = true;

        st.hojaTipo = null;
        st.hojaPostId = null;
        st.hojaSeq = -1;

        if (eraComentarios && postId && seq === st.itemSeq && postIdActual() === postId) {
            var total = st.comentariosCache.get(postId);
            if (total != null) setNcom(total);
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
            var uid = st.uid || await uidActual(c);
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
            var uid = st.uid || await uidActual(c);
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

        // Carrusel vertical: solo videos reales. El índice sigue al elemento pedido.
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

        st.scrollY = window.scrollY || window.pageYOffset || 0;

        st.opts = opts;
        st.items = itemsFinales;
        st.indice = indiceFinal;
        st.carrusel = opts.carruselVertical === true;
        st.modo = st.carrusel ? 'v' : 'h';
        st.fit = 'contain';
        st.abierto = true;
        st.velIdx = 0;
        st.ignorarPopstate = false;
        st.drag = null;
        st.offsetPx = 0;
        st.requestId = opts.requestId || null;
        st.rankingVersion = opts.rankingVersion || null;
        st.iniciados = new Set();
        st.completados = new Set();
        st.comentariosCache = new Map();
        st.hojaTipo = null;
        st.hojaPostId = null;
        st.hojaSeq = -1;
        st.itemSeq++;
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

        refrescarToken();

        instalarPopstate();
        pushHistorySeguro();

        montar();
        actualizarContador();
        activarActual();
        alCambiarVideo();
        refrescarLateral();
        observarVisibilidad();
    }

    function cerrar(desdePop) {
        if (!st.root || !st.abierto) return;

        /* Invalida todo lo asíncrono pendiente del visor. */
        st.itemSeq++;
        if (st.lateralCtrl) {
            st.lateralCtrl.abort();
            st.lateralCtrl = null;
        }

        pausar();
        cancelarImpresion();
        flush(true);

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(function () {});
        }

        clearTimeout(st.timerOcultar);
        cancelarTimerNotif();

        if (st.io) {
            st.io.disconnect();
            st.io = null;
        }

        limpiarEscenario();
        ref('lateral').innerHTML = '';
        ref('lateral').hidden = true;

        ocultarHoja();
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

        // La posición de la página la restaura el perfil público al cerrar.
        st.scrollY = 0;

        /* Si el cierre viene de la interfaz, retira la entrada de historial del visor.
           Si viene del botón atrás (desdePop), la entrada ya no existe. */
        if (!desdePop) {
            consumirEntradaVisor();
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