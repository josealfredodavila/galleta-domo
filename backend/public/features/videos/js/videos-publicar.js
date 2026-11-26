/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · ENTRADA (v5.0)
   ================================================================
   Entrada del módulo de publicar. Sustituye al videos-publicar.js
   monolítico (v4.0) y conserva el mismo contrato global.
   - Crea window.VideosPublicar al instante; cada función delega en su
     módulo al momento de usarla (no depende del orden de carga).
   - Carga en orden los módulos de js/publicar/ sin tocar videos.html.
   - Arranca cada módulo en el orden correcto, aislando errores.
   Orden de carga de los módulos:
     publicar-base → publicar-ui → publicar-audio → publicar-sheets
     → publicar-preview → publicar-subida → publicar-borradores
   Requiere en videos.html: videos-config.js y videos-utils.js antes.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosPublicarLoaded) return;
    window.__csarielsVideosPublicarLoaded = true;

    var BASE = '/features/videos/js/publicar/';

    var MODULOS = [
        'publicar-base.js',
        'publicar-ui.js',
        'publicar-audio.js',
        'publicar-sheets.js',
        'publicar-preview.js',
        'publicar-subida.js',
        'publicar-borradores.js'
    ];

    /* Espacio de nombres creado por publicar-base.js. */
    function ns() {
        return window.VideosPublicarNS || null;
    }

    /* Devuelve una función que llama a NS[modulo][fn] en el momento de la llamada. */
    function delegar(modulo, fn) {
        return function () {
            var N = ns();
            var m = N && N[modulo];
            if (!m || typeof m[fn] !== 'function') {
                console.warn('[VideosPublicar] ' + modulo + '.' + fn + ' aún no está disponible');
                return undefined;
            }
            return m[fn].apply(m, arguments);
        };
    }

    /* Estado de la publicación para la cola de subida (videos-cola.js). */
    function getState() {
        var N = ns();
        if (!N) {
            return {
                sonido: null, sonidoUrl: null, sonidoNombre: null,
                ubicacion: null, ubicacionNombre: null,
                archivoVideo: null, archivoConAudioMezclado: false,
                borradorId: null, subiendo: false
            };
        }

        var S = N.state;
        var U = N.u;
        var sonido = S.sonidoSeleccionado && U.urlSonidoValida(S.sonidoSeleccionado.url)
            ? S.sonidoSeleccionado
            : null;

        return {
            sonido: sonido,
            sonidoUrl: sonido ? sonido.url : null,
            sonidoNombre: sonido ? sonido.nombre + ' — ' + sonido.artista : null,
            ubicacion: S.ubicacionSeleccionada,
            ubicacionNombre: U.textoUbicacion(S.ubicacionSeleccionada),
            archivoVideo: S.archivoVideo ? S.archivoVideo.name : null,
            archivoConAudioMezclado: S.archivoConAudioMezclado === true,
            borradorId: S.borradorEditandoId,
            subiendo: S.subiendo
        };
    }

    /* Configuración efectiva, para depuración. */
    function getConfig() {
        var N = ns();
        if (!N) return null;
        return Object.assign({}, N.C.CONFIG, {
            FEED_UI: Object.assign({}, N.C.FEED_UI),
            MARCA_AGUA: Object.assign({}, N.C.MARCA_AGUA),
            LIMITE_BORRADORES: N.C.LIMITE_BORRADORES,
            RUTA_MEMBRESIA_PRO: N.C.RUTA_MEMBRESIA_PRO
        });
    }

    /* Cambia qué controles del feed se ocultan y vuelve a aplicar los estilos. */
    function setFeedUI(parcial) {
        var N = ns();
        if (!N) return;
        Object.assign(N.C.FEED_UI, parcial || {});
        var old = document.getElementById('cs-feed-ui');
        if (old) old.remove();
        N.ui.inyectarEstilosFeed();
    }

    /* Contrato público. Se crea de inmediato para que otros módulos puedan llamarlo. */
    window.VideosPublicar = {
        abrirModalSonidos: delegar('sheets', 'abrirModalSonidos'),
        abrirModalUbicacion: delegar('sheets', 'abrirModalUbicacion'),
        abrirModalBorradores: delegar('sheets', 'abrirModalBorradores'),
        cerrarTodosLosSheets: delegar('sheets', 'cerrarTodosLosSheets'),

        abrirPreview: delegar('preview', 'abrirPreview'),
        cerrarPreview: delegar('preview', 'cerrarPreview'),
        mostrarPreviewVideo: delegar('preview', 'mostrarPreviewVideo'),
        quitarVideoSeleccionado: delegar('preview', 'quitarVideoSeleccionado'),
        resetFormularioPublicacion: delegar('preview', 'resetFormularioPublicacion'),
        refrescarFeedAutomatico: delegar('preview', 'refrescarFeedAutomatico'),

        subirMultimedia: delegar('subida', 'subirMultimedia'),

        guardarBorrador: delegar('borradores', 'guardarBorrador'),
        abrirBorrador: delegar('borradores', 'abrirBorrador'),
        eliminarBorrador: delegar('borradores', 'eliminarBorrador'),
        mostrarAvisoCuota: delegar('borradores', 'mostrarAvisoCuota'),

        csToast: delegar('ui', 'csToast'),
        csConfirm: delegar('ui', 'csConfirm'),

        getConfig: getConfig,
        setProvider: function (p) {
            var N = ns();
            if (N) N.C.CONFIG.PROVIDER = p;
        },
        setFeedUI: setFeedUI,
        getState: getState,

        /* Se completan en arrancar(), cuando los módulos ya existen. */
        Z: null,
        _seed: null
    };

    /* ----------------------------------------------------------------
       CARGA DE MÓDULOS (en orden, uno tras otro)
       ---------------------------------------------------------------- */

    function cargarScript(nombre) {
        return new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = BASE + nombre;
            s.async = false;
            s.onload = function () { resolve(true); };
            s.onerror = function () {
                console.error('[VideosPublicar] No se pudo cargar ' + BASE + nombre);
                resolve(false);
            };
            document.head.appendChild(s);
        });
    }

    /* Carga cada módulo después del anterior. Si uno falla, sigue con el resto. */
    function cargarModulos() {
        return MODULOS.reduce(function (promesa, nombre) {
            return promesa.then(function () { return cargarScript(nombre); });
        }, Promise.resolve());
    }

    /* ----------------------------------------------------------------
       ARRANQUE DE LOS MÓDULOS
       ---------------------------------------------------------------- */

    /* Ejecuta un paso; si falla, lo registra y sigue con el siguiente. */
    function paso(nombre, fn) {
        try {
            var r = fn();
            if (r && typeof r.catch === 'function') {
                r.catch(function (e) {
                    console.error('[VideosPublicar] Falló el paso "' + nombre + '":', e);
                });
            }
        } catch (e) {
            console.error('[VideosPublicar] Falló el paso "' + nombre + '":', e);
        }
    }

    function arrancar() {
        var N = ns();
        if (!N || !N.C || !N.ui || !N.sheets || !N.preview || !N.borradores) {
            console.error('[VideosPublicar] Faltan módulos: no se inicializa la publicación.');
            return;
        }

        window.VideosPublicar.Z = N.C.Z;
        window.VideosPublicar._seed = N.DATA;

        paso('estilos del feed', function () { N.ui.inyectarEstilosFeed(); });
        paso('estilos del compositor', function () { N.ui.inyectarEstilosExtra(); });
        paso('botones del header', function () {
            N.ui.inyectarBotonesHeader();
            N.ui.actualizarBotonesSonidoUbicacion();
        });
        paso('hojas', function () { N.sheets.inicializar(); });
        paso('vista previa', function () { N.preview.inicializar(); });
        paso('borradores', function () { N.borradores.inicializar(); });
        paso('marca del feed', function () { N.ui.iniciarMarcaFeed(); });
        paso('progreso local', function () { return N.borradores.restaurarLocal(); });
    }

    cargarModulos().then(function () {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', arrancar);
        } else {
            arrancar();
        }
    });
})();