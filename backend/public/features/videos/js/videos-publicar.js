/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · ENTRADA v5.4
   ================================================================
   ORQUESTADOR · CARGA INTELIGENTE · ALTO RENDIMIENTO

   - Carga secuencial controlada de módulos dependientes.
   - Evita descargas duplicadas de scripts.
   - Caché de promesas de carga para evitar inicializaciones repetidas.
   - Gestión de errores individuales sin detener todo el sistema.
   - Inicialización segura y protegida contra duplicados.
   - Delegación dinámica de funciones sin referencias obsoletas.
   - Diagnóstico de carga y tiempos de inicialización.

   v5.4: el puente window.subirVideo ya NO sobrescribe la función real
   de videos-cola.js. Antes la v5.3 la reemplazaba por un puente que
   no tenía subirVideo, y el botón Publicar lanzaba error.
   El puente solo se define si no existe ninguna función previa.

   NO modifica tablas, RPC, Supabase, rutas ni almacenamiento.
   NO reconstruye los módulos existentes.
   ================================================================ */

(function () {
    'use strict';

    /* ============================================================
       1. PROTECCIÓN GLOBAL
       ============================================================ */

    if (window.__csarielsVideosPublicarLoaded) return;

    window.__csarielsVideosPublicarLoaded = true;

    var VERSION = '5.4.0';
    var BASE = '/features/videos/js/publicar/';

    var inicio = Date.now();

    var MODULOS = [
        'publicar-base.js',
        'publicar-ui.js',
        'publicar-audio.js',
        'publicar-sheets.js',
        'publicar-preview.js',
        'publicar-subida.js',
        'publicar-borradores.js'
    ];

    var scriptsCargados = Object.create(null);
    var erroresCarga = [];
    var inicializado = false;
    var promesaArranque = null;

    /* ============================================================
       2. ESTILOS DE RESPALDO DEL COMPOSITOR
       ============================================================ */

    var CSS_RESPALDO_COMPOSITOR = [
        '#uploadSection {',
        'position:relative;',
        'margin:12px 0 20px;',
        'padding:18px 16px 16px;',
        'border:1px solid rgba(0,229,255,.16)!important;',
        'border-radius:24px!important;',
        'background:linear-gradient(170deg,rgba(10,18,30,.96),rgba(4,7,13,.98))!important;',
        'box-shadow:0 18px 50px rgba(0,0,0,.55)!important;',
        'box-sizing:border-box;',
        'contain:layout style;',
        '}',

        '.pf-composer {',
        'background:transparent!important;',
        'border:0!important;',
        'box-shadow:none!important;',
        '}',

        '.pf-composer .form-group-old {display:none!important;}',

        '.pf-composer-cabecera {',
        'display:flex!important;',
        'align-items:center;',
        'gap:10px;',
        'margin-bottom:14px;',
        '}',

        '.pf-composer-pulso {',
        'display:inline-block;',
        'width:8px;',
        'height:8px;',
        'border-radius:50%;',
        'background:#00e5ff;',
        'flex:0 0 8px;',
        '}',

        '.pf-composer-titulo {',
        'font-family:Orbitron,monospace!important;',
        'font-size:.72rem!important;',
        'letter-spacing:2px;',
        'text-transform:uppercase;',
        'color:#bfefff!important;',
        '}',

        '.pf-composer-sub {',
        'font-size:.66rem;',
        'color:#6f8ba0!important;',
        'margin-top:3px;',
        '}',

        '#uploadSection textarea#inputDescripcionVideo {',
        'width:100%!important;',
        'min-height:96px;',
        'box-sizing:border-box;',
        'background:rgba(0,0,0,.28)!important;',
        'border:1px solid rgba(255,255,255,.06)!important;',
        'border-radius:18px!important;',
        'padding:14px 16px;',
        'color:#eef6ff!important;',
        '}',

        '#uploadSection #csFileBtnVideo {',
        'width:100%!important;',
        'border:1px solid rgba(255,255,255,.08)!important;',
        'border-radius:18px!important;',
        'background:rgba(255,255,255,.03)!important;',
        'color:#7fdcff!important;',
        'padding:16px 14px!important;',
        '}',

        '#uploadSection .cs-file-btn-ico {',
        'font-size:1.2rem!important;',
        'line-height:1;',
        '}',

        '.pf-composer-barra {',
        'display:flex;',
        'align-items:center;',
        'gap:10px;',
        'margin-top:14px;',
        'flex-wrap:wrap;',
        '}',

        '.pf-composer-iconos {',
        'display:flex;',
        'gap:8px;',
        '}',

        '.pf-composer-icono {',
        'width:40px!important;',
        'height:40px!important;',
        'min-width:40px!important;',
        'border-radius:14px!important;',
        'padding:0!important;',
        'border:1px solid rgba(255,255,255,.07)!important;',
        'background:rgba(255,255,255,.03)!important;',
        'color:#7fdcff!important;',
        'display:inline-flex;',
        'align-items:center;',
        'justify-content:center;',
        '}',

        '.pf-composer-icono svg {',
        'width:18px!important;',
        'height:18px!important;',
        'fill:none!important;',
        'stroke:currentColor;',
        'stroke-width:1.8;',
        '}',

        '.pf-composer-pie {',
        'margin-left:auto;',
        'display:flex;',
        'align-items:center;',
        'gap:10px;',
        '}',

        '.pf-composer-anillo {',
        'position:relative;',
        'width:36px!important;',
        'height:36px!important;',
        'flex:0 0 36px;',
        'overflow:hidden;',
        '}',

        '.pf-composer-anillo svg {',
        'width:36px!important;',
        'height:36px!important;',
        'transform:rotate(-90deg);',
        'display:block;',
        '}',

        '.pf-composer-anillo circle {',
        'fill:none!important;',
        'stroke-width:3;',
        '}',

        '.pf-composer-anillo .fondo {',
        'stroke:rgba(255,255,255,.08);',
        '}',

        '.pf-composer-anillo .progreso {',
        'stroke:#00e5ff;',
        'stroke-linecap:round;',
        'stroke-dasharray:94.25;',
        'stroke-dashoffset:94.25;',
        '}',

        '.pf-composer-contador {',
        'font-family:Orbitron,monospace;',
        'font-size:.58rem;',
        'color:#6f8ba0;',
        'min-width:58px;',
        'text-align:right;',
        '}',

        '.pf-composer #btnSubirVideo {',
        'display:inline-flex;',
        'align-items:center;',
        'justify-content:center;',
        'gap:8px;',
        'padding:11px 22px;',
        'border:0;',
        'border-radius:14px;',
        'cursor:pointer;',
        'background:linear-gradient(120deg,#00e5ff 0%,#3b82f6 55%,#8b5cf6 100%)!important;',
        'color:#04070d!important;',
        'font-family:Orbitron,monospace;',
        'font-size:.68rem;',
        'font-weight:700;',
        'letter-spacing:1.5px;',
        'text-transform:uppercase;',
        '}',

        '.pf-composer #btnSubirVideo svg {',
        'width:15px!important;',
        'height:15px!important;',
        'fill:none!important;',
        'stroke:currentColor;',
        'stroke-width:2.2;',
        '}',

        '@media(max-width:480px) {',
        '.pf-composer #btnSubirVideo {',
        'width:100%;',
        'justify-content:center;',
        '}',
        '}'
    ].join('\n');

    /* ============================================================
       3. INYECCIÓN DE CSS
       ============================================================ */

    function inyectarEstilosRespaldo() {
        if (!document.head) return false;

        if (document.getElementById('cs-composer-respaldo')) {
            return true;
        }

        var st = document.createElement('style');

        st.id = 'cs-composer-respaldo';
        st.textContent = CSS_RESPALDO_COMPOSITOR;

        document.head.appendChild(st);

        return true;
    }

    /* ============================================================
       4. ACCESO AL NAMESPACE
       ============================================================ */

    function ns() {
        return window.VideosPublicarNS || null;
    }

    function obtenerModulo(nombre) {
        var N = ns();

        return N && N[nombre] ? N[nombre] : null;
    }

    /* ============================================================
       5. DELEGACIÓN DINÁMICA
       ============================================================ */

    function delegar(modulo, fn) {
        return function () {
            var m = obtenerModulo(modulo);

            if (!m || typeof m[fn] !== 'function') {
                console.warn(
                    '[VideosPublicar] Función no disponible:',
                    modulo + '.' + fn
                );

                return undefined;
            }

            return m[fn].apply(m, arguments);
        };
    }

    /* ============================================================
       6. ESTADO SEGURO DE PUBLICACIÓN
       ============================================================ */

    function getState() {
        var N = ns();

        var estadoVacio = {
            sonido: null,
            sonidoUrl: null,
            sonidoNombre: null,
            ubicacion: null,
            ubicacionNombre: null,
            archivoVideo: null,
            archivoConAudioMezclado: false,
            borradorId: null,
            subiendo: false
        };

        if (!N || !N.state || !N.u) {
            return estadoVacio;
        }

        try {
            var S = N.state;
            var U = N.u;

            var sonido = S.sonidoSeleccionado || null;

            if (
                sonido &&
                (
                    typeof U.urlSonidoValida !== 'function' ||
                    !U.urlSonidoValida(sonido.url)
                )
            ) {
                sonido = null;
            }

            var ubicacion = S.ubicacionSeleccionada || null;

            var ubicacionNombre = '';

            if (
                ubicacion &&
                typeof U.textoUbicacion === 'function'
            ) {
                ubicacionNombre = U.textoUbicacion(ubicacion);
            }

            return {
                sonido: sonido,

                sonidoUrl: sonido ? sonido.url : null,

                sonidoNombre: sonido
                    ? (sonido.nombre || '') +
                      ' — ' +
                      (sonido.artista || '')
                    : null,

                ubicacion: ubicacion,

                ubicacionNombre: ubicacionNombre,

                archivoVideo: S.archivoVideo
                    ? S.archivoVideo.name
                    : null,

                archivoConAudioMezclado:
                    S.archivoConAudioMezclado === true,

                borradorId: S.borradorEditandoId || null,

                subiendo: S.subiendo === true
            };

        } catch (e) {
            console.error(
                '[VideosPublicar] Error leyendo estado:',
                e
            );

            return estadoVacio;
        }
    }

    /* ============================================================
       7. CONFIGURACIÓN
       ============================================================ */

    function getConfig() {
        var N = ns();

        if (!N || !N.C || !N.C.CONFIG) {
            return null;
        }

        return Object.assign({}, N.C.CONFIG, {
            FEED_UI: Object.assign(
                {},
                N.C.FEED_UI || {}
            ),

            MARCA_AGUA: Object.assign(
                {},
                N.C.MARCA_AGUA || {}
            ),

            LIMITE_BORRADORES:
                N.C.LIMITE_BORRADORES,

            RUTA_MEMBRESIA_PRO:
                N.C.RUTA_MEMBRESIA_PRO
        });
    }

    /* ============================================================
       8. CONFIGURACIÓN DINÁMICA DEL FEED
       ============================================================ */

    function setFeedUI(parcial) {
        var N = ns();

        if (
            !N ||
            !N.C ||
            !N.C.FEED_UI ||
            !N.ui
        ) {
            return false;
        }

        Object.assign(
            N.C.FEED_UI,
            parcial || {}
        );

        var old = document.getElementById('cs-feed-ui');

        if (old && old.parentNode) {
            old.parentNode.removeChild(old);
        }

        if (
            typeof N.ui.inyectarEstilosFeed === 'function'
        ) {
            N.ui.inyectarEstilosFeed();
        }

        return true;
    }

    /* ============================================================
       9. CARGADOR INTELIGENTE DE SCRIPTS
       ============================================================ */

    function cargarScript(nombre) {
        if (scriptsCargados[nombre]) {
            return scriptsCargados[nombre];
        }

        scriptsCargados[nombre] = new Promise(function (resolve) {
            var existente = document.querySelector(
                'script[data-cs-publicar="' + nombre + '"]'
            );

            if (existente) {
                if (existente.getAttribute('data-loaded') === 'true') {
                    resolve(true);
                    return;
                }

                if (existente.getAttribute('data-error') === 'true') {
                    resolve(false);
                    return;
                }

                existente.addEventListener('load', function () {
                    existente.setAttribute('data-loaded', 'true');
                    resolve(true);
                }, { once: true });

                existente.addEventListener('error', function () {
                    existente.setAttribute('data-error', 'true');
                    resolve(false);
                }, { once: true });

                return;
            }

            var s = document.createElement('script');

            s.src = BASE + nombre;
            s.async = false;
            s.dataset.csPublicar = nombre;

            s.onload = function () {
                s.dataset.loaded = 'true';
                resolve(true);
            };

            s.onerror = function () {
                s.dataset.error = 'true';

                erroresCarga.push(nombre);

                console.error(
                    '[VideosPublicar] No se pudo cargar:',
                    BASE + nombre
                );

                resolve(false);
            };

            document.head.appendChild(s);
        });

        return scriptsCargados[nombre];
    }

    /* ============================================================
       10. CARGA SECUENCIAL CONTROLADA
       ============================================================ */

    function cargarModulos() {
        return MODULOS.reduce(function (promesa, nombre) {
            return promesa.then(function () {
                return cargarScript(nombre);
            });
        }, Promise.resolve());
    }

    /* ============================================================
       11. EJECUCIÓN AISLADA DE FUNCIONES
       ============================================================ */

    function paso(nombre, fn) {
        try {
            var resultado = fn();

            if (
                resultado &&
                typeof resultado.catch === 'function'
            ) {
                resultado.catch(function (e) {
                    console.error(
                        '[VideosPublicar] Falló:',
                        nombre,
                        e
                    );
                });
            }

            return resultado;

        } catch (e) {
            console.error(
                '[VideosPublicar] Falló:',
                nombre,
                e
            );

            return undefined;
        }
    }

    /* ============================================================
       12. VALIDACIÓN DE MÓDULOS
       ============================================================ */

    function validarModulos() {
        var N = ns();

        if (!N || !N.C || !N.ui) {
            return false;
        }

        var requeridos = [
            'sheets',
            'preview',
            'borradores'
        ];

        for (var i = 0; i < requeridos.length; i++) {
            if (!N[requeridos[i]]) {
                console.error(
                    '[VideosPublicar] Módulo ausente:',
                    requeridos[i]
                );

                return false;
            }
        }

        return true;
    }

    /* ============================================================
       13. INICIALIZACIÓN DEL ECOSISTEMA
       ============================================================ */

    function arrancar() {
        if (inicializado) return true;

        if (document.readyState === 'loading') {
            return false;
        }

        paso(
            'estilos de respaldo',
            inyectarEstilosRespaldo
        );

        var N = ns();

        if (!validarModulos()) {
            console.error(
                '[VideosPublicar] No se puede inicializar: faltan módulos.'
            );

            return false;
        }

        inicializado = true;

        window.VideosPublicar.Z =
            N.C.Z || null;

        window.VideosPublicar._seed =
            N.DATA || null;

        paso(
            'estilos del feed',
            function () {
                if (typeof N.ui.inyectarEstilosFeed === 'function') {
                    N.ui.inyectarEstilosFeed();
                }
            }
        );

        paso(
            'estilos del compositor',
            function () {
                if (typeof N.ui.inyectarEstilosExtra === 'function') {
                    N.ui.inyectarEstilosExtra();
                }
            }
        );

        paso(
            'botones del header',
            function () {
                if (typeof N.ui.inyectarBotonesHeader === 'function') {
                    N.ui.inyectarBotonesHeader();
                }

                if (
                    typeof N.ui.actualizarBotonesSonidoUbicacion ===
                    'function'
                ) {
                    N.ui.actualizarBotonesSonidoUbicacion();
                }
            }
        );

        paso(
            'hojas',
            function () {
                N.sheets.inicializar();
            }
        );

        paso(
            'vista previa',
            function () {
                N.preview.inicializar();
            }
        );

        paso(
            'borradores',
            function () {
                N.borradores.inicializar();
            }
        );

        paso(
            'marca del feed',
            function () {
                if (typeof N.ui.iniciarMarcaFeed === 'function') {
                    N.ui.iniciarMarcaFeed();
                }
            }
        );

        paso(
            'restauración de borradores',
            function () {
                if (typeof N.borradores.restaurarLocal === 'function') {
                    return N.borradores.restaurarLocal();
                }
            }
        );

        console.info(
            '[VideosPublicar] Inicializado correctamente.',
            {
                version: VERSION,
                tiempo: Date.now() - inicio,
                errores: erroresCarga.length
            }
        );

        return true;
    }

    /* ============================================================
       14. INICIALIZACIÓN SEGURA
       ============================================================ */

    function iniciar() {
        if (promesaArranque) {
            return promesaArranque;
        }

        promesaArranque = cargarModulos().then(function () {
            return new Promise(function (resolve) {
                if (document.readyState !== 'loading') {
                    resolve(arrancar());
                    return;
                }

                document.addEventListener(
                    'DOMContentLoaded',
                    function () {
                        resolve(arrancar());
                    },
                    { once: true }
                );
            });
        });

        return promesaArranque;
    }

    /* ============================================================
       15. CONTRATO PÚBLICO
       ============================================================ */

    window.VideosPublicar = {

        version: VERSION,

        abrirModalSonidos:
            delegar('sheets', 'abrirModalSonidos'),

        abrirModalUbicacion:
            delegar('sheets', 'abrirModalUbicacion'),

        abrirModalBorradores:
            delegar('sheets', 'abrirModalBorradores'),

        cerrarTodosLosSheets:
            delegar('sheets', 'cerrarTodosLosSheets'),

        abrirPreview:
            delegar('preview', 'abrirPreview'),

        cerrarPreview:
            delegar('preview', 'cerrarPreview'),

        mostrarPreviewVideo:
            delegar('preview', 'mostrarPreviewVideo'),

        quitarVideoSeleccionado:
            delegar('preview', 'quitarVideoSeleccionado'),

        resetFormularioPublicacion:
            delegar('preview', 'resetFormularioPublicacion'),

        refrescarFeedAutomatico:
            delegar('preview', 'refrescarFeedAutomatico'),

        subirMultimedia:
            delegar('subida', 'subirMultimedia'),

        guardarBorrador:
            delegar('borradores', 'guardarBorrador'),

        abrirBorrador:
            delegar('borradores', 'abrirBorrador'),

        eliminarBorrador:
            delegar('borradores', 'eliminarBorrador'),

        mostrarAvisoCuota:
            delegar('borradores', 'mostrarAvisoCuota'),

        csToast:
            delegar('ui', 'csToast'),

        csConfirm:
            delegar('ui', 'csConfirm'),

        getConfig: getConfig,

        setProvider: function (p) {
            var N = ns();

            if (
                N &&
                N.C &&
                N.C.CONFIG
            ) {
                N.C.CONFIG.PROVIDER = p;
            }
        },

        setFeedUI: setFeedUI,

        getState: getState,

        getDiagnostics: function () {
            return {
                version: VERSION,
                inicializado: inicializado,
                tiempoCarga: Date.now() - inicio,
                modulos: MODULOS.slice(),
                errores: erroresCarga.slice(),
                estado: getState()
            };
        },

        Z: null,

        _seed: null,

        inicializar: iniciar
    };

    /* ============================================================
       16. PUENTE window.subirVideo (solo si no existe)
       videos-cola.js define la función real de subida. Este puente
       NUNCA la sobrescribe: solo se define si todavía no existe, y
       en ese caso avisa con un error claro en lugar de fallar en
       silencio.
       ============================================================ */

    function puenteSubirVideo() {
        if (typeof window.subirVideo === 'function') return;

        window.subirVideo = function () {
            var msg = 'La función de subida no está cargada (revisa videos-cola.js).';

            console.error('[VideosPublicar] ' + msg);

            if (typeof window.csToast === 'function') {
                window.csToast(msg, 'error');
            }

            throw new Error(msg);
        };
    }

    /* ============================================================
       17. ARRANQUE
       ============================================================ */

    paso('puente subirVideo', puenteSubirVideo);

    paso(
        'estilos iniciales',
        inyectarEstilosRespaldo
    );

    iniciar().catch(function (e) {
        console.error(
            '[VideosPublicar] Error crítico de inicialización:',
            e
        );
    });

})();