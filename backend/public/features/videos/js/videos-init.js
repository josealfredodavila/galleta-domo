// ================================================================
// CSARIEL'S · VIDEOS · ARRANQUE (v2)
// ================================================================
// Punto de entrada del módulo de videos. Se ejecuta una sola vez.
// Orden de arranque:
//   1. Cabecera y teclado móvil
//   2. Hojas, navegación del feed/cabecera, botón atrás
//   3. Sesión (usuario y contactos) → idiomas → feed
//   4. Cola de subida y jobs pendientes
//   5. Enlace ?v=id (si viene en la URL)
// Eventos globales: conexión, visibilidad, botón de audio,
// cierre de reacciones al tocar fuera, contador y botones del compositor.
// Cada paso va en su propio try: si uno falla, los demás siguen.
// Requiere: todos los módulos de videos/js cargados antes.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config) {
        console.error('[Videos] videos-init.js requiere videos-config.js.');
        return;
    }
    if (VA.__init) return;
    VA.__init = true;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;

    var CIRCUNFERENCIA_ANILLO = 94.25;

    /* Ejecuta un paso del arranque sin que un error detenga los demás. */
    async function paso(nombre, fn) {
        try {
            await fn();
        } catch (e) {
            console.error('[Videos] Falló el paso "' + nombre + '":', e);
        }
    }

    /* ----------------------------------------------------------------
       Cabecera y teclado móvil
       ---------------------------------------------------------------- */

    /* Ajusta la variable --vf-top según la altura real de la cabecera. */
    function ajustarAlturaCabecera() {
        var h = document.querySelector('.header');
        if (!h) return;
        document.documentElement.style.setProperty('--vf-top', h.offsetHeight + 'px');
    }

    /* Marca el body cuando el teclado virtual ocupa parte de la pantalla. */
    function configurarTecladoMovil() {
        if (!window.visualViewport) return;
        var vv = window.visualViewport;

        function ajustar() {
            var diff = window.innerHeight - vv.height;
            document.body.classList.toggle('teclado-abierto', diff > 150);
        }

        vv.addEventListener('resize', ajustar);
        vv.addEventListener('scroll', ajustar);
    }

    /* ----------------------------------------------------------------
       Botón de audio, cierre de reacciones y botón +
       ---------------------------------------------------------------- */

    function engancharBotonAudio() {
        var btn = document.getElementById('btnAudioGlobal');
        if (!btn || btn.dataset.initEnganchado === '1') return;
        btn.dataset.initEnganchado = '1';
        btn.addEventListener('click', function () {
            VA.audio.activarAudioGlobal();
        });
    }

    /* Un toque fuera de la barra de reacciones la cierra. */
    function engancharCierreReacciones() {
        if (document.body.dataset.initCierre === '1') return;
        document.body.dataset.initCierre = '1';
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.reac-barra, .reac-btn')) {
                VA.controles.cerrarBarrasReacciones();
            }
        });
    }

    /* Botón + (#btnAbrirPublicar): abre la hoja de publicar y pausa el video activo. */
    function engancharBotonPublicar() {
        var btn = document.getElementById('btnAbrirPublicar');
        if (!btn || btn.dataset.initEnganchado === '1') return;
        btn.dataset.initEnganchado = '1';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            // Pausar el video activo si está reproduciéndose.
            var activa = S.cardActiva && S.cardActiva.querySelector('video');
            if (activa && !activa.paused) {
                try { activa.pause(); } catch (_) {}
            }
            VA.hojas.abrirHoja('hojaPublicar');
        });
    }

    /* ----------------------------------------------------------------
       Compositor: emoji, hashtag y contador de caracteres
       ---------------------------------------------------------------- */

    /* Inserta texto en la posición del cursor de un campo. */
    function insertarTextoEnCursor(input, texto) {
        var start = input.selectionStart || 0;
        var end = input.selectionEnd || 0;
        var valor = input.value || '';
        input.value = valor.substring(0, start) + texto + valor.substring(end);

        var nuevaPos = start + texto.length;
        input.selectionStart = nuevaPos;
        input.selectionEnd = nuevaPos;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function engancharCompositor() {
        var descInput = document.getElementById('inputDescripcionVideo');

        var btnEmoji = document.getElementById('btnEmoji');
        if (btnEmoji && descInput && btnEmoji.dataset.initEnganchado !== '1') {
            btnEmoji.dataset.initEnganchado = '1';
            btnEmoji.addEventListener('click', function (e) {
                e.preventDefault();
                insertarTextoEnCursor(descInput, '😀');
            });
        }

        var btnHashtag = document.getElementById('btnHashtag');
        if (btnHashtag && descInput && btnHashtag.dataset.initEnganchado !== '1') {
            btnHashtag.dataset.initEnganchado = '1';
            btnHashtag.addEventListener('click', function (e) {
                e.preventDefault();
                insertarTextoEnCursor(descInput, '#');
            });
        }

        var contador = document.getElementById('pfContador');
        var anilloPadre = document.getElementById('pfAnillo');
        var anilloProgreso = document.getElementById('pfAnilloProgreso');
        var max = CONFIG.MAX_CARACTERES_DESCRIPCION;

        if (descInput && contador && descInput.dataset.initEnganchado !== '1') {
            descInput.dataset.initEnganchado = '1';
            descInput.addEventListener('input', function () {
                var len = descInput.value.length;
                contador.textContent = len + ' / ' + max;

                if (anilloProgreso) {
                    anilloProgreso.style.strokeDashoffset = CIRCUNFERENCIA_ANILLO * (1 - Math.min(len / max, 1));
                }
                if (anilloPadre) {
                    anilloPadre.classList.remove('cerca', 'lleno');
                    contador.classList.remove('cerca', 'lleno');
                    if (len >= max) {
                        anilloPadre.classList.add('lleno');
                        contador.classList.add('lleno');
                    } else if (len >= max * 0.9) {
                        anilloPadre.classList.add('cerca');
                        contador.classList.add('cerca');
                    }
                }
            });
        }
    }

    /* Cuando la cámara termina de grabar, el video queda listo en la hoja de publicar. */
    function engancharCamaraGrabada() {
        window.csCamaraOnVideoGrabado = function (file) {
            var input = document.getElementById('inputArchivoVideo');
            if (!input) return;
            try {
                var dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                VA.hojas.abrirHoja('hojaPublicar');
                U.showToast('Video grabado listo para publicar', 'success');
            } catch (e) {
                U.showToast('No se pudo procesar el video grabado', 'error');
            }
        };
    }

    /* ----------------------------------------------------------------
       Eventos globales de la página
       ---------------------------------------------------------------- */

    function engancharEventosGlobales() {
        window.addEventListener('resize', ajustarAlturaCabecera);

        // Al volver la conexión, los items en espera vuelven a intentarse.
        window.addEventListener('online', function () {
            VA.cola.marcarColaComoReintentable();
            VA.cola.actualizarEstadoCola();
            VA.cola.procesarCola();
        });

        // Al volver a la pestaña, se procesa la cola; al salir, se pausa el video activo.
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                VA.cola.procesarCola();
            } else {
                var activa = S.cardActiva && S.cardActiva.querySelector('video');
                if (activa && !activa.paused) activa.pause();
            }
        });

        // Publicar puede pedir refrescar el feed por evento (respaldo de cargarVideos).
        window.addEventListener('csariels:videos:refresh', function () {
            VA.feed.cargarVideos();
        });
    }

    /* ----------------------------------------------------------------
       Enlace ?v=id: abre el video indicado si está en el feed
       ---------------------------------------------------------------- */

    function abrirVideoDelEnlace() {
        var id = new URLSearchParams(window.location.search).get('v');
        if (!id) return;
        if (!VA.navegacion.irAVideoPorId(id)) {
            U.showToast('Ese video ya no está disponible', 'warning', 3500);
        }
    }

    /* ----------------------------------------------------------------
       Arranque principal
       ---------------------------------------------------------------- */

    async function arrancar() {
        await paso('cabecera', function () {
            U.aplicarI18N();
            ajustarAlturaCabecera();
            configurarTecladoMovil();
        });

        await paso('hojas', function () { VA.hojas.engancharHojas(); });
        await paso('navegacion', function () { VA.navegacion.iniciar(); });
        await paso('atras', function () { VA.atras.activar(); });
        await paso('eventos', function () {
            engancharBotonAudio();
            engancharCierreReacciones();
            engancharBotonPublicar();
            engancharCompositor();
            engancharCamaraGrabada();
            engancharEventosGlobales();
        });

        // Sesión e idiomas antes del feed, para que las traducciones y los contactos existan.
        await paso('sesion', function () { return VA.sesion.cargarUsuarioActual(); });
        await paso('idiomas', async function () {
            if (typeof window.inicializarIdiomas === 'function') await window.inicializarIdiomas();
            U.aplicarI18N();
        });
        await paso('contactos', function () { return VA.sesion.cargarSiguiendo(); });
        await paso('feed', function () { return VA.feed.cargarVideos(); });
        await paso('enlace', abrirVideoDelEnlace);

        await paso('jobs', function () { return VA.cola.reanudarJobsPendientes(); });
        await paso('cola', async function () {
            await VA.cola.cargarColaEnMemoria();
            VA.cola.actualizarEstadoCola();
            VA.cola.procesarCola();
        });

        ajustarAlturaCabecera();
    }

    /* ----------------------------------------------------------------
       Exposición de contratos globales
       ---------------------------------------------------------------- */

    // cargarVideos, subirVideo, elegirReaccion, compartirVideo, eliminarMiVideo,
    // togglePlayCard, activarAudioGlobal y abrirComentarios ya los expone cada módulo.
    window.showToast = U.showToast;
    window.cerrarAnuncioVideo = function () {};
    window.registrarClicAnuncioVideo = function () {};

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar);
    } else {
        arrancar();
    }
})();