/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · ENTRADA (v5.1)
   ================================================================
   Entrada del módulo de publicar.
   - Crea window.VideosPublicar al instante; cada función delega en su
     módulo al momento de usarla (no depende del orden de carga).
   - Carga en orden los módulos de js/publicar/ sin tocar videos.html.
   - Arranca cada módulo en el orden correcto, aislando errores.
   v5.1: inyecta un bloque mínimo de estilos del compositor
         (respaldo) para que la hoja de publicar se vea bien aunque el
         CSS del servidor esté desactualizado.
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

    /* Respaldo de estilos del compositor. Solo lo esencial para que la hoja
       de publicar se vea bien. Si el CSS del servidor ya está actualizado,
       estas reglas coinciden con él y no lo contradicen. */
    var CSS_RESPALDO_COMPOSITOR = [
        '#uploadSection { position: relative; margin: 12px 0 20px; padding: 18px 16px 16px;',
        '  border: 1px solid rgba(0,229,255,.16) !important; border-radius: 24px !important;',
        '  background: linear-gradient(170deg, rgba(10,18,30,.96), rgba(4,7,13,.98)) !important;',
        '  box-shadow: 0 18px 50px rgba(0,0,0,.55) !important; box-sizing: border-box; }',
        '.pf-composer { background: transparent !important; border: 0 !important; box-shadow: none !important; }',
        '.pf-composer .form-group-old { display: none !important; }',
        '.pf-composer-cabecera { display: flex !important; align-items: center; gap: 10px; margin-bottom: 14px; }',
        '.pf-composer-pulso { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #00e5ff; flex: 0 0 8px; }',
        '.pf-composer-titulo { font-family: Orbitron, monospace !important; font-size: .72rem !important; letter-spacing: 2px; text-transform: uppercase; color: #bfefff !important; }',
        '.pf-composer-sub { font-size: .66rem; color: #6f8ba0 !important; margin-top: 3px; }',
        '#uploadSection textarea#inputDescripcionVideo { width: 100% !important; min-height: 96px; box-sizing: border-box; background: rgba(0,0,0,.28) !important; border: 1px solid rgba(255,255,255,.06) !important; border-radius: 18px !important; padding: 14px 16px; color: #eef6ff !important; }',
        '#uploadSection #csFileBtnVideo { width: 100% !important; border: 1px solid rgba(255,255,255,.08) !important; border-radius: 18px !important; background: rgba(255,255,255,.03) !important; color: #7fdcff !important; padding: 16px 14px !important; }',
        '#uploadSection .cs-file-btn-ico { font-size: 1.2rem !important; line-height: 1; }',
        '.pf-composer-barra { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }',
        '.pf-composer-iconos { display: flex; gap: 8px; }',
        '.pf-composer-icono { width: 40px !important; height: 40px !important; min-width: 40px !important; border-radius: 14px !important; padding: 0 !important; border: 1px solid rgba(255,255,255,.07) !important; background: rgba(255,255,255,.03) !important; color: #7fdcff !important; display: inline-flex; align-items: center; justify-content: center; }',
        '.pf-composer-icono svg { width: 18px !important; height: 18px !important; fill: none !important; stroke: currentColor; stroke-width: 1.8; }',
        '.pf-composer-pie { margin-left: auto; display: flex; align-items: center; gap: 10px; }',
        '.pf-composer-anillo { position: relative; width: 36px !important; height: 36px !important; flex: 0 0 36px; overflow: hidden; }',
        '.pf-composer-anillo svg { width: 36px !important; height: 36px !important; transform: rotate(-90deg); display: block; }',
        '.pf-composer-anillo circle { fill: none !important; stroke-width: 3; }',
        '.pf-composer-anillo .fondo { stroke: rgba(255,255,255,.08); }',
        '.pf-composer-anillo .progreso { stroke: #00e5ff; stroke-linecap: round; stroke-dasharray: 94.25; stroke-dashoffset: 94.25; }',
        '.pf-composer-contador { font-family: Orbitron, monospace; font-size: .58rem; color: #6f8ba0; min-width: 58px; text-align: right; }',
        '.pf-composer #btnSubirVideo { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 22px; border: 0; border-radius: 14px; cursor: pointer; background: linear-gradient(120deg,#00e5ff 0%,#3b82f6 55%,#8b5cf6 100%) !important; color: #04070d !important; font-family: Orbitron, monospace; font-size: .68rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }',
        '.pf-composer #btnSubirVideo svg { width: 15px !important; height: 15px !important; fill: none !important; stroke: currentColor; stroke-width: 2.2; }',
        '@media (max-width: 480px) { .pf-composer #btnSubirVideo { width: 100%; justify-content: center; } }'
    ].join('\n');

    /* Inserta el respaldo de estilos una sola vez. */
    function inyectarEstilosRespaldo() {
        if (document.getElementById('cs-composer-respaldo')) return;
        var st = document.createElement('style');
        st.id = 'cs-composer-respaldo';
        st.textContent = CSS_RESPALDO_COMPOSITOR;
        document.head.appendChild(st);
    }

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
        paso('respaldo de estilos', inyectarEstilosRespaldo);

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

    /* El respaldo de estilos se inyecta también antes de cargar los módulos,
       para que la hoja no se vea sin estilo mientras llegan. */
    inyectarEstilosRespaldo();

    cargarModulos().then(function () {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', arrancar);
        } else {
            arrancar();
        }
    });
})();