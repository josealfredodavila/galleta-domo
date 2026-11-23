/* ================================================================
   VISOR-MEDIA-GLOBAL.JS · Csariel's · v1.0
   Visor de pantalla completa compartido para fotos y videos.
   - Muestra la foto o el video COMPLETO (sin recortar por defecto).
   - Deslizar a izquierda/derecha para cambiar; hacia abajo para cerrar.
   - Controles de video: reproducir/pausar, progreso, velocidad, PiP, ajustar.
   - Hoja de acciones: guardar, ocultar, reportar y eliminar (si es tuya).

   Uso:
     VisorMediaGlobal.abrir({
         items: [{ url, tipo: 'imagen' | 'video', permiteDescarga, postId, esDueno }],
         indice: 0,
         onEliminar: function (item) {},
         onOcultar: function (item) {}
     });

   Requiere window.supabaseClient para ocultar y reportar.
   ================================================================ */
(function () {
    'use strict';

    var VERSION = '1.0';

    if (window.VisorMediaGlobal && window.VisorMediaGlobal.version === VERSION) return;

    var CSS_PATH = '/features/shared/css/visor-media-global.css';
    var VELOCIDADES = [1, 1.5, 2];

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
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">' + cuerpo + '</svg>';
    };

    var ICONO = {
        cerrar: SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
        menu: SVG('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
        play: '<svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
        velocidad: SVG('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
        pip: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="11" width="8" height="6" rx="1"/>'),
        expandir: SVG('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
        descargar: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
        ocultar: SVG('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/>'),
        reportar: SVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
        eliminar: SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>')
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
        inicioX: 0,
        inicioY: 0,
        movido: false
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

    function asegurarCss() {
        if (document.querySelector('link[href="' + CSS_PATH + '"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CSS_PATH;
        document.head.appendChild(link);
    }

    function ref(nombre) {
        return st.root.querySelector('[data-ref="' + nombre + '"]');
    }

    function videoActual() {
        return st.root ? st.root.querySelector('[data-ref="escenario"] video') : null;
    }

    async function uidActual(cliente) {
        var s = await cliente.auth.getSession();
        return s.data && s.data.session ? s.data.session.user.id : null;
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

        var escenario = ref('escenario');

        escenario.addEventListener('click', function () {
            if (st.movido) return;
            if (videoActual()) togglePlay();
            else programarOcultado();
        });

        escenario.addEventListener('touchstart', function (e) {
            if (!e.touches || !e.touches.length) return;
            st.inicioX = e.touches[0].clientX;
            st.inicioY = e.touches[0].clientY;
            st.movido = false;
        }, { passive: true });

        escenario.addEventListener('touchmove', function (e) {
            if (!e.touches || !e.touches.length) return;
            if (Math.abs(e.touches[0].clientX - st.inicioX) > 10 || Math.abs(e.touches[0].clientY - st.inicioY) > 10) {
                st.movido = true;
            }
        }, { passive: true });

        escenario.addEventListener('touchend', function (e) {
            if (!e.changedTouches || !e.changedTouches.length) return;

            var dx = e.changedTouches[0].clientX - st.inicioX;
            var dy = e.changedTouches[0].clientY - st.inicioY;

            if (dy > 120 && Math.abs(dy) > Math.abs(dx)) { cerrar(); return; }
            if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) { navegar(dx < 0 ? 1 : -1); }
        }, { passive: true });

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
                if (!ref('hoja').hidden) ocultarHoja();
                else cerrar();
            } else if (e.key === 'ArrowRight') {
                navegar(1);
            } else if (e.key === 'ArrowLeft') {
                navegar(-1);
            } else if (e.key === ' ' && videoActual()) {
                e.preventDefault();
                togglePlay();
            }
        });

        window.addEventListener('resize', aplicarFit);
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
        var v = videoActual();
        if (v) { try { v.pause(); } catch (e) {} }
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
        centro.hidden = !v.paused;
        actualizarTiempo();
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
        var e = ref('escenario').querySelector('video, img');
        if (!e) return;
        e.style.objectFit = st.fit;
        e.style.objectPosition = 'center';
    }

    function velocidad() {
        st.velIdx = (st.velIdx + 1) % VELOCIDADES.length;
        var v = videoActual();
        if (v) v.playbackRate = VELOCIDADES[st.velIdx];
        ref('vel').textContent = VELOCIDADES[st.velIdx] + 'x';
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

    /* ================= MOSTRAR Y NAVEGAR ================= */

    function mostrarItem() {
        var item = st.items[st.indice];
        var url = item ? safeHttps(item.url) : null;

        if (!url) {
            toast('No se pudo abrir este archivo.', 'error');
            return;
        }

        pausar();

        var esc = ref('escenario');
        esc.innerHTML = '';

        st.velIdx = 0;
        ref('vel').textContent = '1x';
        ref('contador').textContent = st.items.length > 1 ? (st.indice + 1) + ' / ' + st.items.length : '';

        ocultarHoja();

        if (item.tipo === 'video') {
            var v = document.createElement('video');
            v.src = url;
            v.preload = 'auto';
            v.playsInline = true;
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            if (item.permiteDescarga === false) v.setAttribute('controlsList', 'nodownload');

            v.addEventListener('loadedmetadata', actualizarTiempo);
            v.addEventListener('timeupdate', actualizarTiempo);
            v.addEventListener('play', estadoVideo);
            v.addEventListener('pause', estadoVideo);
            v.addEventListener('ended', estadoVideo);
            v.addEventListener('error', function () {
                toast('No se pudo cargar este video.', 'error');
            });

            esc.appendChild(v);
            aplicarFit();
            v.play().then(estadoVideo).catch(estadoVideo);
        } else {
            var img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.draggable = false;

            esc.appendChild(img);
            aplicarFit();
            estadoVideo();
        }
    }

    function navegar(dir) {
        var nuevo = st.indice + dir;
        if (nuevo < 0 || nuevo >= st.items.length) return;
        st.indice = nuevo;
        mostrarItem();
    }

    /* ================= HOJA DE ACCIONES ================= */

    function boton(nombreAccion, icono, texto, extra) {
        return '<button type="button" class="vmg-op ' + (extra || '') + '" data-accion="' + nombreAccion + '">' + icono + ' ' + texto + '</button>';
    }

    function pintarHoja(vista) {
        var item = st.items[st.indice] || {};
        var hoja = ref('hoja');
        var html = '';

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

    function ocultarHoja() {
        if (!st.root) return;
        ref('hoja').hidden = true;
        ref('hoja').innerHTML = '';
        ref('fondo').hidden = true;
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
            case 'guardar':
                ocultarHoja();
                descargar(st.items[st.indice]);
                break;
            case 'ocultar': ocultar(); break;
            case 'reportar': pintarHoja('motivos'); break;
            case 'motivo':
                st.motivo = btn.getAttribute('data-motivo') || '';
                pintarHoja('confirmar');
                break;
            case 'enviar-reporte': reportar(); break;
            case 'eliminar': eliminar(); break;
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
            a.download = 'csariels-' + Date.now() + '.' + (item.tipo === 'video' ? 'mp4' : 'jpg');
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(function () { URL.revokeObjectURL(objUrl); }, 2000);
        } catch (e) {
            toast('No se pudo guardar el archivo', 'error');
        }
    }

    async function ocultar() {
        var item = st.items[st.indice] || {};
        var c = window.supabaseClient;

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
        var item = st.items[st.indice] || {};
        var c = window.supabaseClient;

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
        var item = st.items[st.indice];

        ocultarHoja();
        cerrar();

        if (item && typeof st.opts.onEliminar === 'function') st.opts.onEliminar(item);
    }

    /* ================= ABRIR Y CERRAR ================= */

    function abrir(opts) {
        construir();

        opts = opts || {};

        if (!Array.isArray(opts.items) || !opts.items.length) return;

        st.opts = opts;
        st.items = opts.items;
        st.indice = Math.min(Math.max(0, parseInt(opts.indice, 10) || 0), st.items.length - 1);
        st.fit = 'contain';
        st.abierto = true;

        st.root.hidden = false;
        document.body.style.overflow = 'hidden';

        mostrarItem();
    }

    function cerrar() {
        if (!st.root || !st.abierto) return;

        pausar();

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(function () {});
        }

        clearTimeout(st.timerOcultar);
        ref('escenario').innerHTML = '';
        ocultarHoja();

        st.root.hidden = true;
        st.root.classList.remove('vmg-oculto');

        st.abierto = false;
        st.items = [];

        document.body.style.overflow = '';
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