
/* ================================================================
   CSARIEL'S · VIDEOS · CÁMARA Y FILTROS (TikTok Style) v4.9
   ================================================================
   CORRECCIÓN DEL FILTRO PAYASO:
   - Peluca y nariz roja son imágenes independientes.
   - La peluca se ancla a la frente y se ajusta al ancho facial.
   - La nariz se ancla a la punta de la nariz real.
   - Cada parte tiene escala, posición y rotación independientes.
   - Ambas partes siguen el rostro en tiempo real.
   - Se conservan cámara, audio, grabación y demás filtros.
   - MediaPipe se carga dinámicamente con versiones de respaldo.
   - Si MediaPipe falla, la cámara puede grabar sin filtros.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosCamaraLoaded) return;
    window.__csarielsVideosCamaraLoaded = true;

    var CONFIG = {
        MAX_DURATION_SECONDS: 60,
        TARGET_FPS: 30,
        DETECTION_FPS: 24,
        VIDEO_WIDTH: 1280,
        VIDEO_HEIGHT: 720,
        VIDEO_BITRATE: 4000000,
        MEDIAPIPE_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        MEDIAPIPE_VERSIONS: ['0.4.1675469240', '0.4.1633559619'],
        SCRIPT_TIMEOUT_MS: 20000
    };

    var ASSETS_BASE =
        'https://cdn.jsdelivr.net/gh/josealfredodavila/galleta-domo@main/backend/assets';

    /*
     * CONFIGURACIÓN DE FILTROS
     *
     * scale:
     *   Ancho de la imagen respecto al ancho de la cara.
     *
     * offsetX:
     *   Desplazamiento horizontal respecto al ancla.
     *   Negativo = izquierda; positivo = derecha.
     *
     * offsetY:
     *   Desplazamiento vertical respecto al ancla,
     *   expresado como fracción de la altura de la imagen.
     *
     * ancla:
     *   frente = parte superior de la frente.
     *   nariz  = punta de la nariz.
     *   ojos   = centro de los ojos.
     *
     * aplanar:
     *   Modifica la altura sin modificar el ancho.
     */

    var ASSETS = {
        gato: {
            partes: [
                {
                    src: ASSETS_BASE + '/orejas-gato-3.png',
                    scale: 1.0,
                    offsetX: 0,
                    offsetY: -0.4,
                    ancla: 'frente'
                }
            ]
        },

        burro: {
            partes: [
                {
                    src: ASSETS_BASE + '/orejas-burro-2.png',
                    scale: 1.0,
                    offsetX: 0,
                    offsetY: -0.4,
                    ancla: 'frente'
                }
            ]
        },

        gafas: {
            partes: [
                {
                    src: ASSETS_BASE + '/gafas-2.png',
                    scale: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                    ancla: 'ojos'
                }
            ]
        },

        thug: {
            partes: [
                {
                    src: ASSETS_BASE + '/thug-life-1.png',
                    scale: 1.1,
                    offsetX: 0,
                    offsetY: 0.3,
                    ancla: 'ojos'
                }
            ]
        },

        corazon: {
            partes: [
                {
                    src: ASSETS_BASE + '/corazon-1.png',
                    scale: 0.9,
                    offsetX: 0,
                    offsetY: 0,
                    ancla: 'ojos'
                }
            ]
        },

        bigote: {
            partes: [
                {
                    src: ASSETS_BASE + '/bigote-2.png',
                    scale: 0.45,
                    offsetX: 0,
                    offsetY: 0.5,
                    ancla: 'nariz'
                }
            ]
        },

        corona: {
            partes: [
                {
                    src: ASSETS_BASE + '/corona-2.png',
                    scale: 0.9,
                    offsetX: 0,
                    offsetY: -0.5,
                    ancla: 'frente'
                }
            ]
        },

        diamante: {
            partes: [
                {
                    src: ASSETS_BASE + '/corona-diamante-1.png',
                    scale: 0.9,
                    offsetX: 0,
                    offsetY: -0.5,
                    ancla: 'frente'
                }
            ]
        },

        perro: {
            partes: [
                {
                    src: ASSETS_BASE + '/perro-orejas-1.png',
                    scale: 1.6,
                    offsetX: 0,
                    offsetY: -0.3,
                    ancla: 'frente'
                },
                {
                    src: ASSETS_BASE + '/perro-hocico-1.png',
                    scale: 0.6,
                    offsetX: 0,
                    offsetY: 0.1,
                    ancla: 'nariz'
                }
            ]
        },

        diablo: {
            partes: [
                {
                    src: ASSETS_BASE + '/diablo-1.png',
                    scale: 1.0,
                    offsetX: 0,
                    offsetY: -0.6,
                    ancla: 'frente'
                }
            ]
        },

        angel: {
            partes: [
                {
                    src: ASSETS_BASE + '/angel-1.png',
                    scale: 1.0,
                    offsetX: 0,
                    offsetY: -0.6,
                    ancla: 'frente',
                    aplanar: 0.4
                }
            ]
        },

        /*
         * PAYASO: DOS PNG INDEPENDIENTES.
         *
         * 1. payaso-1.png:
         *    Peluca. Se dibuja sobre la frente.
         *
         * 2. payaso-nariz-1.png:
         *    Nariz roja. Se dibuja sobre la punta de la nariz.
         *
         * IMPORTANTE:
         * El PNG payaso-1.png debe contener únicamente la peluca
         * y sus elementos decorativos, sin una nariz roja adicional.
         * Si la imagen ya contiene una nariz, hay que corregir ese
         * PNG; cambiar la posición del filtro no elimina sus píxeles.
         */

        payaso: {
            partes: [
                {
                    id: 'peluca',
                    src: ASSETS_BASE + '/payaso-1.png',
                    scale: 1.15,
                    offsetX: 0,
                    offsetY: -0.18,
                    ancla: 'frente'
                },
                {
                    id: 'nariz',
                    src: ASSETS_BASE + '/payaso-nariz-1.png',
                    scale: 0.14,
                    offsetX: 0,
                    offsetY: 0.02,
                    ancla: 'nariz'
                }
            ]
        },

        charro: {
            partes: [
                {
                    src: ASSETS_BASE + '/charro-1.png',
                    scale: 1.2,
                    offsetX: 0,
                    offsetY: -0.7,
                    ancla: 'frente'
                }
            ]
        },

        vikingo: {
            partes: [
                {
                    src: ASSETS_BASE + '/vikingo-1.png',
                    scale: 1.1,
                    offsetX: 0,
                    offsetY: -0.3,
                    ancla: 'frente'
                }
            ]
        },

        leon: {
            partes: [
                {
                    src: ASSETS_BASE + '/leon-1.png',
                    scale: 0.95,
                    offsetX: 0,
                    offsetY: 0,
                    ancla: 'ojos'
                }
            ]
        },

        mascara: {
            partes: [
                {
                    src: ASSETS_BASE + '/mascara-lucha-1.png',
                    scale: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                    ancla: 'ojos'
                }
            ]
        },

        alien: {
            partes: [
                {
                    src: ASSETS_BASE + '/antenas-alien-1.png',
                    scale: 1.1,
                    offsetX: 0,
                    offsetY: -0.27,
                    ancla: 'ojos'
                }
            ]
        }
    };

    var SELECTORES_MARQUINHOS = [
        '#marquinhos',
        '.marquinhos',
        '.marquinhos-robot',
        '[class*="marquinhos"]',
        '[id*="marquinhos"]',
        '[class*="cs-robot"]',
        '[id*="cs-robot"]'
    ];

    var state = {
        stream: null,
        faceMesh: null,
        video: null,
        canvas: null,
        ctx: null,
        mediaRecorder: null,
        chunks: [],
        grabando: false,
        iniciada: false,
        abriendo: false,
        descartar: false,
        enviando: false,
        filtroActual: 'ninguno',
        renderFrameId: null,
        detectionFrameId: null,
        lastDetectionTime: 0,
        lastResults: null,
        facingMode: 'user',
        timerInterval: null,
        segundosGrabados: 0,
        imagenes: {},
        ocultos: [],
        filtrosDisponibles: [
            { id: 'ninguno', nombre: 'Ninguno', icono: '🚫' },
            { id: 'gato', nombre: 'Orejas', icono: '🐱' },
            { id: 'burro', nombre: 'Burro', icono: '🐴' },
            { id: 'perro', nombre: 'Perro', icono: '🐶' },
            { id: 'gafas', nombre: 'Gafas', icono: '🕶️' },
            { id: 'thug', nombre: 'Thug Life', icono: '😎' },
            { id: 'corazon', nombre: 'Amor', icono: '💖' },
            { id: 'bigote', nombre: 'Bigote', icono: '🥸' },
            { id: 'corona', nombre: 'Corona', icono: '👑' },
            { id: 'diamante', nombre: 'Diamantes', icono: '💎' },
            { id: 'angel', nombre: 'Ángel', icono: '👼' },
            { id: 'diablo', nombre: 'Diablo', icono: '😈' },
            { id: 'payaso', nombre: 'Payaso', icono: '🤡' },
            { id: 'charro', nombre: 'Charro', icono: '🤠' },
            { id: 'vikingo', nombre: 'Vikingo', icono: '🛡️' },
            { id: 'leon', nombre: 'León', icono: '🦁' },
            { id: 'mascara', nombre: 'Lucha', icono: '🤼' },
            { id: 'alien', nombre: 'Alien', icono: '👽' }
        ]
    };

    function $(id) {
        return document.getElementById(id);
    }

    // ============================================================
    // UTILIDADES
    // ============================================================

    function notificar(mensaje, tipo) {
        tipo = tipo || 'info';

        if (typeof window.csToast === 'function') {
            window.csToast(mensaje, tipo);
        } else if (typeof window.showToast === 'function') {
            window.showToast(mensaje, tipo);
        } else {
            console.warn('[CSARIELS Cámara]', mensaje);
        }
    }

    function obtenerMensajeError(error) {
        var nombre = error && error.name ? error.name : '';

        if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
            return 'Debes permitir el acceso a la cámara y al micrófono.';
        }

        if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
            return 'No se encontró una cámara en este dispositivo.';
        }

        if (nombre === 'NotReadableError') {
            return 'La cámara está en uso por otra app.';
        }

        return error && error.message
            ? error.message
            : 'No se pudo iniciar la cámara.';
    }

    function mostrarCargando(visible, texto) {
        var elemento = $('csCamaraLoading');
        if (!elemento) return;

        if (texto) elemento.textContent = texto;

        elemento.classList.toggle('hidden', !visible);
    }

    // ============================================================
    // MEDIAPIPE: CARGA DINÁMICA
    // ============================================================

    function cargarScript(url) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = url;
            script.crossOrigin = 'anonymous';
            script.async = true;

            var temporizador = setTimeout(function () {
                script.remove();
                reject(new Error('Tiempo agotado cargando ' + url));
            }, CONFIG.SCRIPT_TIMEOUT_MS);

            script.onload = function () {
                clearTimeout(temporizador);
                resolve();
            };

            script.onerror = function () {
                clearTimeout(temporizador);
                script.remove();
                reject(new Error('No se pudo descargar ' + url));
            };

            document.head.appendChild(script);
        });
    }

    async function cargarMediaPipe() {
        if (typeof window.FaceMesh === 'function') {
            return CONFIG.MEDIAPIPE_VERSIONS[0];
        }

        var ultimoError = null;

        for (var i = 0; i < CONFIG.MEDIAPIPE_VERSIONS.length; i++) {
            var version = CONFIG.MEDIAPIPE_VERSIONS[i];

            try {
                await cargarScript(
                    CONFIG.MEDIAPIPE_CDN + '@' + version + '/face_mesh.js'
                );

                if (typeof window.FaceMesh === 'function') {
                    return version;
                }

                ultimoError = new Error(
                    'MediaPipe no expuso FaceMesh en la versión ' + version
                );
            } catch (error) {
                ultimoError = error;
            }
        }

        throw ultimoError || new Error('MediaPipe no disponible.');
    }

    async function iniciarFaceMesh() {
        if (state.faceMesh) return true;

        try {
            var version = await cargarMediaPipe();

            var faceMesh = new window.FaceMesh({
                locateFile: function (archivo) {
                    return CONFIG.MEDIAPIPE_CDN + '@' + version + '/' + archivo;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            faceMesh.onResults(function (resultados) {
                state.lastResults = resultados;
            });

            await faceMesh.initialize();

            state.faceMesh = faceMesh;
            return true;
        } catch (error) {
            console.error(
                '[CSARIELS Cámara] MediaPipe no disponible; se grabará sin filtros:',
                error
            );
            return false;
        }
    }

    // ============================================================
    // CÁMARA
    // ============================================================

    async function pedirStream() {
        var audio = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        var intentos = [
            {
                video: {
                    facingMode: { ideal: state.facingMode },
                    width: { ideal: CONFIG.VIDEO_WIDTH },
                    height: { ideal: CONFIG.VIDEO_HEIGHT }
                },
                audio: audio
            },
            {
                video: { facingMode: state.facingMode },
                audio: true
            },
            { video: true, audio: true },
            { video: true, audio: false }
        ];

        var ultimoError = null;

        for (var i = 0; i < intentos.length; i++) {
            try {
                return await navigator.mediaDevices.getUserMedia(intentos[i]);
            } catch (error) {
                ultimoError = error;

                if (
                    error.name === 'NotAllowedError' ||
                    error.name === 'SecurityError'
                ) {
                    break;
                }
            }
        }

        throw ultimoError || new Error('No se pudo acceder a la cámara.');
    }

    function esperarDimensiones(video) {
        return new Promise(function (resolve) {
            if (video.videoWidth) {
                resolve();
                return;
            }

            var terminado = false;

            function finalizar() {
                if (terminado) return;
                terminado = true;
                clearInterval(intervalo);
                clearTimeout(limite);
                resolve();
            }

            var intervalo = setInterval(function () {
                if (video.videoWidth) finalizar();
            }, 50);

            var limite = setTimeout(finalizar, 4000);
        });
    }

    async function iniciarStream() {
        detenerStream();

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error('Tu navegador no permite acceder a la cámara.');
        }

        state.stream = await pedirStream();

        state.video.muted = true;
        state.video.srcObject = state.stream;

        await state.video.play().catch(function () {});
        await esperarDimensiones(state.video);
    }

    function detenerStream() {
        if (state.stream) {
            state.stream.getTracks().forEach(function (track) {
                track.stop();
            });

            state.stream = null;
        }

        if (state.video) {
            state.video.srcObject = null;
        }
    }

    async function cambiarCamara() {
        if (!state.iniciada || state.grabando) return;

        var anterior = state.facingMode;
        state.facingMode =
            anterior === 'user' ? 'environment' : 'user';

        try {
            mostrarCargando(true, 'Cambiando cámara…');

            await iniciarStream();

            state.lastResults = null;
            state.lastDetectionTime = 0;

            mostrarCargando(false);
        } catch (error) {
            state.facingMode = anterior;
            mostrarCargando(false);
            notificar('No se pudo cambiar la cámara.', 'error');
        }
    }

    // ============================================================
    // PRECARGA DE IMÁGENES
    // ============================================================

    function precargarImagenes() {
        return new Promise(function (resolve) {
            var urls = new Set();

            Object.keys(ASSETS).forEach(function (id) {
                ASSETS[id].partes.forEach(function (parte) {
                    urls.add(parte.src);
                });
            });

            var pendientes = urls.size;

            if (pendientes === 0) {
                resolve();
                return;
            }

            function terminar() {
                pendientes--;

                if (pendientes <= 0) resolve();
            }

            urls.forEach(function (url) {
                var existente = state.imagenes[url];

                if (
                    existente &&
                    existente.complete &&
                    existente.naturalWidth > 0
                ) {
                    terminar();
                    return;
                }

                var imagen = new Image();
                imagen.crossOrigin = 'anonymous';

                imagen.onload = terminar;

                imagen.onerror = function () {
                    console.error(
                        '[CSARIELS Cámara] No se pudo cargar el PNG:',
                        url
                    );
                    terminar();
                };

                state.imagenes[url] = imagen;
                imagen.src = url;
            });
        });
    }

    // ============================================================
    // MARQUINHOS
    // ============================================================

    function ocultarMarquinhos() {
        state.ocultos = [];

        var elementos = new Set();

        SELECTORES_MARQUINHOS.forEach(function (selector) {
            try {
                document.querySelectorAll(selector).forEach(function (el) {
                    if (el.closest('#csModalCamara')) return;
                    elementos.add(el);
                });
            } catch (error) {}
        });

        elementos.forEach(function (el) {
            state.ocultos.push({
                el: el,
                prev: el.style.getPropertyValue('display'),
                prioridad: el.style.getPropertyPriority('display')
            });

            el.style.setProperty('display', 'none', 'important');
        });
    }

    function restaurarMarquinhos() {
        state.ocultos.forEach(function (registro) {
            try {
                if (registro.prev) {
                    registro.el.style.setProperty(
                        'display',
                        registro.prev,
                        registro.prioridad
                    );
                } else {
                    registro.el.style.removeProperty('display');
                }
            } catch (error) {}
        });

        state.ocultos = [];
    }

    // ============================================================
    // MODAL Y DISEÑO
    // ============================================================

    function inyectarModalCamara() {
        if ($('csModalCamara')) return;

        var modal = document.createElement('div');

        modal.id = 'csModalCamara';
        modal.className = 'cs-camara-modal';

        modal.innerHTML = `
            <div class="cs-camara-header">
                <button type="button" class="cs-camara-close" id="csCamaraClose">✕</button>
                <div class="cs-camara-timer" id="csCamaraTimer">00:00</div>
                <button type="button" class="cs-camara-flip" id="csCamaraFlip">🔄</button>
            </div>

            <div class="cs-camara-viewport" id="csCamaraViewport">
                <video id="csCamaraVideo" playsinline autoplay muted></video>
                <canvas id="csCamaraCanvas"></canvas>
                <div class="cs-camara-rec-indicator" id="csRecIndicator">● REC</div>
                <div class="cs-camara-loading" id="csCamaraLoading">Iniciando cámara…</div>
            </div>

            <div class="cs-camara-filtros" id="csCamaraFiltros"></div>

            <div class="cs-camara-footer">
                <button type="button" class="cs-camara-record-btn" id="csBtnRecord" aria-label="Grabar"></button>
            </div>
        `;

        document.body.appendChild(modal);

        if (!$('cs-camara-styles')) {
            var style = document.createElement('style');
            style.id = 'cs-camara-styles';

            style.textContent = `
                .cs-camara-modal {
                    position: fixed;
                    inset: 0;
                    z-index: 99999;
                    background: #000;
                    display: none;
                    flex-direction: column;
                    color: #fff;
                    font-family: Inter, system-ui, sans-serif;
                    user-select: none;
                    -webkit-user-select: none;
                }

                .cs-camara-modal.show {
                    display: flex;
                }

                .cs-camara-header {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    padding: max(14px, env(safe-area-inset-top)) 18px 14px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    z-index: 20;
                    background: linear-gradient(to bottom, rgba(0,0,0,.65), transparent);
                }

                .cs-camara-close,
                .cs-camara-flip {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    border: none;
                    color: #fff;
                    font-size: 1.15rem;
                    background: rgba(0,0,0,.45);
                    cursor: pointer;
                }

                .cs-camara-timer {
                    display: none;
                    font-family: ui-monospace, monospace;
                    font-size: .95rem;
                    padding: 5px 14px;
                    border-radius: 999px;
                    background: rgba(255,51,102,.85);
                }

                .cs-camara-timer.active {
                    display: block;
                }

                .cs-camara-viewport {
                    position: relative;
                    flex: 1;
                    min-height: 0;
                    overflow: hidden;
                    background: #000;
                }

                #csCamaraVideo {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    opacity: 0;
                    pointer-events: none;
                }

                #csCamaraCanvas {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    display: block;
                }

                .cs-camara-loading {
                    position: absolute;
                    inset: 0;
                    display: grid;
                    place-items: center;
                    font-size: .9rem;
                    background: rgba(0,0,0,.55);
                    z-index: 15;
                }

                .cs-camara-loading.hidden {
                    display: none;
                }

                .cs-camara-rec-indicator {
                    position: absolute;
                    top: 90px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: none;
                    padding: 5px 12px;
                    border-radius: 999px;
                    background: rgba(255,51,102,.9);
                    font-size: .7rem;
                    font-weight: 700;
                    z-index: 16;
                }

                .cs-camara-rec-indicator.active {
                    display: block;
                    animation: csPulseRec 1s infinite alternate;
                }

                @keyframes csPulseRec {
                    from { opacity: 1; }
                    to { opacity: .35; }
                }

                .cs-camara-filtros {
                    display: flex;
                    gap: 12px;
                    padding: 16px;
                    overflow-x: auto;
                    scrollbar-width: none;
                    z-index: 20;
                    background: #000;
                }

                .cs-camara-filtros::-webkit-scrollbar {
                    display: none;
                }

                .cs-filtro-btn {
                    flex: 0 0 auto;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 5px;
                    background: none;
                    border: none;
                    color: #fff;
                    font-size: .65rem;
                    cursor: pointer;
                }

                .cs-filtro-btn .icono {
                    width: 52px;
                    height: 52px;
                    border-radius: 50%;
                    display: grid;
                    place-items: center;
                    font-size: 1.45rem;
                    background: rgba(255,255,255,.1);
                    border: 2px solid transparent;
                    transition: transform .18s ease, border-color .18s ease, background .18s ease;
                }

                .cs-filtro-btn.activo .icono {
                    border-color: #D4AF37;
                    background: rgba(212,175,55,.22);
                    transform: scale(1.06);
                }

                .cs-camara-footer {
                    padding: 18px 0 max(28px, env(safe-area-inset-bottom));
                    display: flex;
                    justify-content: center;
                    z-index: 20;
                    background: #000;
                }

                .cs-camara-record-btn {
                    width: 78px;
                    height: 78px;
                    border-radius: 50%;
                    border: 4px solid #fff;
                    background: #ff3366;
                    cursor: pointer;
                    transition: all .18s ease;
                }

                .cs-camara-record-btn.grabando {
                    width: 42px;
                    height: 42px;
                    border-radius: 10px;
                }
            `;

            document.head.appendChild(style);
        }

        $('csCamaraClose').addEventListener('click', cerrarCamara);
        $('csCamaraFlip').addEventListener('click', cambiarCamara);
        $('csBtnRecord').addEventListener('click', toggleGrabacion);

        $('csCamaraFiltros').addEventListener('click', function (evento) {
            var boton = evento.target.closest('.cs-filtro-btn');
            if (!boton) return;

            state.filtroActual = boton.dataset.filtroId;
            renderizarFiltros();
        });

        document.addEventListener('visibilitychange', onVisibilityChange);

        renderizarFiltros();
    }

    function renderizarFiltros() {
        var contenedor = $('csCamaraFiltros');
        if (!contenedor) return;

        contenedor.innerHTML = state.filtrosDisponibles.map(function (filtro) {
            return `
                <button type="button"
                    class="cs-filtro-btn ${state.filtroActual === filtro.id ? 'activo' : ''}"
                    data-filtro-id="${filtro.id}">
                    <span class="icono">${filtro.icono}</span>
                    <span>${filtro.nombre}</span>
                </button>
            `;
        }).join('');
    }

    // ============================================================
    // DETECCIÓN FACIAL
    // ============================================================

    function iniciarLoopDeteccion() {
        var intervalo = 1000 / CONFIG.DETECTION_FPS;

        async function detectar() {
            if (!state.iniciada) return;

            var ahora = performance.now();

            if (
                state.faceMesh &&
                !state.enviando &&
                state.video.readyState >= 2 &&
                ahora - state.lastDetectionTime >= intervalo
            ) {
                state.lastDetectionTime = ahora;
                state.enviando = true;

                try {
                    await state.faceMesh.send({ image: state.video });
                } catch (error) {
                    console.warn('[CSARIELS Cámara] Error de detección:', error);
                } finally {
                    state.enviando = false;
                }
            }

            if (state.iniciada) {
                state.detectionFrameId = requestAnimationFrame(detectar);
            }
        }

        state.detectionFrameId = requestAnimationFrame(detectar);
    }

    function iniciarLoopRender() {
        function dibujar() {
            if (!state.iniciada) return;

            var video = state.video;
            var canvas = state.canvas;
            var ctx = state.ctx;

            if (video.readyState >= 2 && video.videoWidth) {
                if (
                    canvas.width !== video.videoWidth ||
                    canvas.height !== video.videoHeight
                ) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                var espejado = state.facingMode === 'user';

                ctx.save();

                if (espejado) {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                ctx.restore();

                var landmarks =
                    state.lastResults &&
                    state.lastResults.multiFaceLandmarks &&
                    state.lastResults.multiFaceLandmarks[0];

                if (landmarks && landmarks.length > 454) {
                    dibujarFiltro(landmarks, canvas, ctx, espejado);
                }
            }

            state.renderFrameId = requestAnimationFrame(dibujar);
        }

        state.renderFrameId = requestAnimationFrame(dibujar);
    }

    // ============================================================
    // DIBUJO DE FILTROS
    // ============================================================

    function dibujarFiltro(landmarks, canvas, ctx, espejado) {
        var filtro = ASSETS[state.filtroActual];
        if (!filtro) return;

        var anchoCanvas = canvas.width;
        var altoCanvas = canvas.height;

        function punto(indice) {
            var p = landmarks[indice];

            return {
                x: espejado ? (1 - p.x) * anchoCanvas : p.x * anchoCanvas,
                y: p.y * altoCanvas
            };
        }

        var ojoA = punto(33);
        var ojoB = punto(263);

        var ojoIzq = ojoA.x <= ojoB.x ? ojoA : ojoB;
        var ojoDer = ojoA.x <= ojoB.x ? ojoB : ojoA;

        var mejillaA = punto(234);
        var mejillaB = punto(454);

        var mejillaIzq = mejillaA.x <= mejillaB.x ? mejillaA : mejillaB;
        var mejillaDer = mejillaA.x <= mejillaB.x ? mejillaB : mejillaA;

        var anchoCara = Math.hypot(
            mejillaDer.x - mejillaIzq.x,
            mejillaDer.y - mejillaIzq.y
        );

        if (!anchoCara || !isFinite(anchoCara)) return;

        var angulo = Math.atan2(
            ojoDer.y - ojoIzq.y,
            ojoDer.x - ojoIzq.x
        );

        var centroOjos = {
            x: (ojoIzq.x + ojoDer.x) / 2,
            y: (ojoIzq.y + ojoDer.y) / 2
        };

        var frente = punto(10);
        var puntaNariz = punto(2);

        filtro.partes.forEach(function (parte) {
            var imagen = state.imagenes[parte.src];

            if (
                !imagen ||
                !imagen.complete ||
                !imagen.naturalWidth ||
                !imagen.naturalHeight
            ) {
                return;
            }

            var ancho = anchoCara * parte.scale;
            var factorAltura = parte.aplanar || 1;

            var alto =
                ancho *
                (imagen.naturalHeight / imagen.naturalWidth) *
                factorAltura;

            var ancla;

            if (parte.ancla === 'frente') {
                ancla = frente;
            } else if (parte.ancla === 'nariz') {
                ancla = puntaNariz;
            } else {
                ancla = centroOjos;
            }

            /*
             * La posición de cada parte se calcula por separado.
             * La nariz no utiliza el desplazamiento de la peluca.
             */

            var desplazamientoX = (parte.offsetX || 0) * anchoCara;
            var desplazamientoY = (parte.offsetY || 0) * alto;

            var x = ancla.x + desplazamientoX;
            var y = ancla.y + desplazamientoY;

            ctx.save();

            ctx.translate(x, y);
            ctx.rotate(angulo);

            ctx.drawImage(
                imagen,
                -ancho / 2,
                -alto / 2,
                ancho,
                alto
            );

            ctx.restore();
        });
    }

    // ============================================================
    // GRABACIÓN
    // ============================================================

    function obtenerFormatoGrabacion() {
        if (
            typeof MediaRecorder === 'undefined' ||
            typeof MediaRecorder.isTypeSupported !== 'function'
        ) {
            return '';
        }

        var candidatos = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4'
        ];

        return candidatos.find(function (tipo) {
            return MediaRecorder.isTypeSupported(tipo);
        }) || '';
    }

    function toggleGrabacion() {
        if (state.grabando) {
            detenerGrabacion();
        } else {
            iniciarGrabacion();
        }
    }

    function iniciarGrabacion() {
        if (!state.iniciada || state.grabando) return;

        if (typeof state.canvas.captureStream !== 'function') {
            notificar('Tu navegador no permite grabar desde la cámara.', 'error');
            return;
        }

        var canvasStream = state.canvas.captureStream(CONFIG.TARGET_FPS);

        if (state.stream) {
            state.stream.getAudioTracks().forEach(function (track) {
                canvasStream.addTrack(track);
            });
        }

        var mimeType = obtenerFormatoGrabacion();
        var recorder;

        try {
            recorder = new MediaRecorder(
                canvasStream,
                mimeType
                    ? {
                        mimeType: mimeType,
                        videoBitsPerSecond: CONFIG.VIDEO_BITRATE
                    }
                    : {}
            );
        } catch (error) {
            canvasStream.getTracks().forEach(function (track) {
                track.stop();
            });

            notificar('Tu navegador no soporta grabación de video.', 'error');
            return;
        }

        state.mediaRecorder = recorder;
        state.chunks = [];
        state.descartar = false;

        recorder.ondataavailable = function (evento) {
            if (evento.data && evento.data.size > 0) {
                state.chunks.push(evento.data);
            }
        };

        recorder.onstop = function () {
            var tipo = recorder.mimeType || mimeType || 'video/webm';
            var extension = tipo.indexOf('mp4') !== -1 ? 'mp4' : 'webm';

            var blob = new Blob(state.chunks, { type: tipo });

            state.chunks = [];

            canvasStream.getTracks().forEach(function (track) {
                track.stop();
            });

            if (state.descartar) {
                liberarRecursos();
                return;
            }

            if (blob.size === 0) {
                notificar('No se pudo grabar el video. Intenta de nuevo.', 'error');
                liberarRecursos();
                return;
            }

            var archivo = new File(
                [blob],
                'video-camara-' + Date.now() + '.' + extension,
                { type: tipo }
            );

            liberarRecursos();

            if (typeof window.csCamaraOnVideoGrabado === 'function') {
                window.csCamaraOnVideoGrabado(archivo);
            }
        };

        recorder.start(250);

        state.grabando = true;

        $('csBtnRecord').classList.add('grabando');
        $('csRecIndicator').classList.add('active');
        $('csCamaraTimer').classList.add('active');

        iniciarTimer();
    }

    function detenerGrabacion() {
        if (
            state.mediaRecorder &&
            state.mediaRecorder.state !== 'inactive'
        ) {
            state.mediaRecorder.stop();
        }

        state.grabando = false;

        if ($('csBtnRecord')) $('csBtnRecord').classList.remove('grabando');
        if ($('csRecIndicator')) $('csRecIndicator').classList.remove('active');
        if ($('csCamaraTimer')) $('csCamaraTimer').classList.remove('active');

        detenerTimer();
    }

    function iniciarTimer() {
        state.segundosGrabados = 0;
        actualizarTimerUI();

        state.timerInterval = setInterval(function () {
            state.segundosGrabados++;
            actualizarTimerUI();

            if (state.segundosGrabados >= CONFIG.MAX_DURATION_SECONDS) {
                detenerGrabacion();
            }
        }, 1000);
    }

    function detenerTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function actualizarTimerUI() {
        var minutos = String(
            Math.floor(state.segundosGrabados / 60)
        ).padStart(2, '0');

        var segundos = String(
            state.segundosGrabados % 60
        ).padStart(2, '0');

        var temporizador = $('csCamaraTimer');

        if (temporizador) {
            temporizador.textContent = minutos + ':' + segundos;
        }
    }

    function onVisibilityChange() {
        if (document.hidden && state.grabando) {
            detenerGrabacion();
        }
    }

    // ============================================================
    // ABRIR / CERRAR CÁMARA
    // ============================================================

    async function abrirCamara() {
        if (state.abriendo || state.iniciada) return;

        state.abriendo = true;

        inyectarModalCamara();

        $('csModalCamara').classList.add('show');

        ocultarMarquinhos();
        mostrarCargando(true, 'Iniciando cámara…');

        try {
            state.video = $('csCamaraVideo');
            state.canvas = $('csCamaraCanvas');
            state.ctx = state.canvas.getContext('2d');

            await iniciarStream();
            await precargarImagenes();

            var filtrosListos = await iniciarFaceMesh();

            if (!filtrosListos) {
                notificar(
                    'Filtros no disponibles. Puedes grabar sin filtro.',
                    'warning'
                );
            }

            state.iniciada = true;
            state.lastDetectionTime = 0;
            state.lastResults = null;

            mostrarCargando(false);

            iniciarLoopRender();

            if (filtrosListos) {
                iniciarLoopDeteccion();
            }
        } catch (error) {
            console.error('[CSARIELS Cámara] Error al iniciar:', error);

            notificar(obtenerMensajeError(error), 'error');

            liberarRecursos();
        } finally {
            state.abriendo = false;
        }
    }

    function cerrarCamara() {
        detenerTimer();

        if (
            state.mediaRecorder &&
            state.mediaRecorder.state !== 'inactive'
        ) {
            state.descartar = true;
            state.grabando = false;

            $('csModalCamara').classList.remove('show');

            state.mediaRecorder.stop();
            return;
        }

        liberarRecursos();
    }

    function liberarRecursos() {
        state.iniciada = false;
        state.grabando = false;
        state.lastResults = null;
        state.mediaRecorder = null;
        state.chunks = [];
        state.enviando = false;

        if (state.renderFrameId) {
            cancelAnimationFrame(state.renderFrameId);
            state.renderFrameId = null;
        }

        if (state.detectionFrameId) {
            cancelAnimationFrame(state.detectionFrameId);
            state.detectionFrameId = null;
        }

        detenerStream();
        detenerTimer();

        if ($('csBtnRecord')) $('csBtnRecord').classList.remove('grabando');
        if ($('csRecIndicator')) $('csRecIndicator').classList.remove('active');
        if ($('csCamaraTimer')) $('csCamaraTimer').classList.remove('active');
        if ($('csModalCamara')) $('csModalCamara').classList.remove('show');

        mostrarCargando(false);
        restaurarMarquinhos();
    }

    // ============================================================
    // API PÚBLICA
    // ============================================================

    window.VideosCamara = {
        abrirCamara: abrirCamara,
        cerrarCamara: cerrarCamara,
        cambiarCamara: cambiarCamara,

        setFiltro: function (id) {
            if (ASSETS[id] || id === 'ninguno') {
                state.filtroActual = id;
                renderizarFiltros();
            }
        }
    };

    // ============================================================
    // INTEGRACIÓN CON videos.html
    // ============================================================

    function conectarBotonCamara() {
        var boton = $('btnAbrirCamara');

        if (boton && !boton.dataset.camaraEnganchada) {
            boton.dataset.camaraEnganchada = '1';

            boton.addEventListener('click', function (evento) {
                evento.preventDefault();
                window.VideosCamara.abrirCamara();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', conectarBotonCamara);
    } else {
        conectarBotonCamara();
    }

})();
