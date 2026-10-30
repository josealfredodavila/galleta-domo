/* ================================================================
   CSARIEL'S · VIDEOS · CÁMARA ESTILO TIKTOK v5.3
   ================================================================
   Cambios respecto a v5.2:
   - Corrige la vista negra: el <video> de origen se decodifica siempre
     (tamaño real dentro del viewport, opacidad 0, sin pointer-events).
   - El render dibuja el video en cuanto hay dimensiones, sin esperar
     un readyState estricto.
   - FaceMesh corre en su propio bucle; si falla, la cámara sigue sin
     filtros y se avisa una sola vez.
   - Los PNG de filtro se dibujan sobre los landmarks en la misma
     escala que el video (cover), solo cuando hay resultados válidos.
   - Se mantienen modos 15 s / 60 s, botón de sonido, temporizador,
     voltear, grabación con mezcla de audio y API pública.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosCamaraLoaded) return;
    window.__csarielsVideosCamaraLoaded = true;

    var Z = { CAMARA: 99999, SHEET_BACKDROP: 100000, SHEET: 100001 };

    var CONFIG = {
        DURACIONES: [15, 60],
        DURACION_DEFAULT: 60,
        COUNTDOWN_SECONDS: 3,
        CANVAS_WIDTH: 720,
        CANVAS_HEIGHT: 1280,
        TARGET_FPS: 30,
        DETECTION_FPS: 24,
        VIDEO_WIDTH: 1280,
        VIDEO_HEIGHT: 720,
        VIDEO_BITRATE: 4000000,
        AUDIO_BITRATE: 128000,
        MEDIAPIPE_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        MEDIAPIPE_VERSIONS: ['0.4.1675469240', '0.4.1633559619'],
        SCRIPT_TIMEOUT_MS: 20000,
        PISTA_TIMEOUT_MS: 8000,
        ESPERA_DIMENSIONES_MS: 6000
    };

    var ASSETS_BASE =
        'https://cdn.jsdelivr.net/gh/josealfredodavila/galleta-domo@main/backend/assets';

    var ASSETS = {
        gato: { partes: [{ src: ASSETS_BASE + '/orejas-gato-3.png', scale: 1.0, offsetX: 0, offsetY: -0.4, ancla: 'frente' }] },
        burro: { partes: [{ src: ASSETS_BASE + '/orejas-burro-2.png', scale: 1.0, offsetX: 0, offsetY: -0.4, ancla: 'frente' }] },
        gafas: { partes: [{ src: ASSETS_BASE + '/gafas-2.png', scale: 1.0, offsetX: 0, offsetY: 0, ancla: 'ojos' }] },
        thug: { partes: [{ src: ASSETS_BASE + '/thug-life-1.png', scale: 1.1, offsetX: 0, offsetY: 0.3, ancla: 'ojos' }] },
        corazon: { partes: [{ src: ASSETS_BASE + '/corazon-1.png', scale: 0.9, offsetX: 0, offsetY: 0, ancla: 'ojos' }] },
        bigote: { partes: [{ src: ASSETS_BASE + '/bigote-2.png', scale: 0.45, offsetX: 0, offsetY: 0.5, ancla: 'nariz' }] },
        corona: { partes: [{ src: ASSETS_BASE + '/corona-2.png', scale: 0.9, offsetX: 0, offsetY: -0.5, ancla: 'frente' }] },
        diamante: { partes: [{ src: ASSETS_BASE + '/corona-diamante-1.png', scale: 0.9, offsetX: 0, offsetY: -0.5, ancla: 'frente' }] },
        perro: {
            partes: [
                { src: ASSETS_BASE + '/perro-orejas-1.png', scale: 1.6, offsetX: 0, offsetY: -0.3, ancla: 'frente' },
                { src: ASSETS_BASE + '/perro-hocico-1.png', scale: 0.6, offsetX: 0, offsetY: 0.1, ancla: 'nariz' }
            ]
        },
        diablo: { partes: [{ src: ASSETS_BASE + '/diablo-1.png', scale: 1.0, offsetX: 0, offsetY: -0.6, ancla: 'frente' }] },
        angel: { partes: [{ src: ASSETS_BASE + '/angel-1.png', scale: 1.0, offsetX: 0, offsetY: -0.6, ancla: 'frente', aplanar: 0.4 }] },
        payaso: {
            partes: [
                { id: 'peluca', src: ASSETS_BASE + '/payaso-1.png', scale: 1.35, offsetX: 0, offsetY: -0.15, ancla: 'frente' },
                { id: 'nariz', src: ASSETS_BASE + '/payaso-nariz-1.png', scale: 0.16, offsetX: 0, offsetY: 0.05, ancla: 'nariz' }
            ]
        },
        charro: { partes: [{ src: ASSETS_BASE + '/charro-1.png', scale: 1.2, offsetX: 0, offsetY: -0.7, ancla: 'frente' }] },
        vikingo: { partes: [{ src: ASSETS_BASE + '/vikingo-1.png', scale: 1.1, offsetX: 0, offsetY: -0.3, ancla: 'frente' }] },
        leon: { partes: [{ src: ASSETS_BASE + '/leon-1.png', scale: 0.95, offsetX: 0, offsetY: 0, ancla: 'ojos' }] },
        mascara: { partes: [{ src: ASSETS_BASE + '/mascara-lucha-1.png', scale: 1.0, offsetX: 0, offsetY: 0, ancla: 'ojos' }] },
        alien: { partes: [{ src: ASSETS_BASE + '/antenas-alien-1.png', scale: 1.1, offsetX: 0, offsetY: -0.27, ancla: 'ojos' }] }
    };

    var SELECTORES_MARQUINHOS = [
        '#marquinhos', '.marquinhos', '.marquinhos-robot',
        '[class*="marquinhos"]', '[id*="marquinhos"]',
        '[class*="cs-robot"]', '[id*="cs-robot"]'
    ];

    var state = {
        stream: null, faceMesh: null, faceMeshListo: false, video: null, canvas: null, ctx: null,
        mediaRecorder: null, chunks: [], grabando: false, iniciada: false,
        abriendo: false, descartar: false, enviando: false, filtroActual: 'ninguno',
        renderFrameId: null, detectionFrameId: null, lastDetectionTime: 0,
        lastResults: null, facingMode: 'user', timerInterval: null,
        segundosGrabados: 0, imagenes: {}, ocultos: [],
        duracionActual: CONFIG.DURACION_DEFAULT,
        cuentaRegresivaActiva: false, cuentaRegresivaTimer: null,
        audioCtx: null, audioDestino: null, audioPista: null,
        audioPistaUrl: null, audioMicFuente: null, audioPistaFuente: null,
        archivoConAudioMezclado: false, avisoFiltrosMostrado: false,
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

    function $(id) { return document.getElementById(id); }

    function notificar(mensaje, tipo) {
        tipo = tipo || 'info';
        if (typeof window.csToast === 'function') window.csToast(mensaje, tipo);
        else if (typeof window.showToast === 'function') window.showToast(mensaje, tipo);
        else console.warn('[CSARIELS Cámara]', mensaje);
    }

    function obtenerMensajeError(error) {
        var nombre = error && error.name ? error.name : '';
        if (nombre === 'NotAllowedError' || nombre === 'SecurityError') return 'Debes permitir el acceso a la cámara y al micrófono.';
        if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No se encontró una cámara en este dispositivo.';
        if (nombre === 'NotReadableError') return 'La cámara está en uso por otra app.';
        return error && error.message ? error.message : 'No se pudo iniciar la cámara.';
    }

    function mostrarCargando(visible, texto) {
        var elemento = $('csCamaraLoading');
        if (!elemento) return;
        if (texto) elemento.textContent = texto;
        elemento.classList.toggle('hidden', !visible);
    }

    function emitirEstado(estado) {
        window.csCamaraEstado = estado;
        try {
            window.dispatchEvent(new CustomEvent('csariels:camara:estado', { detail: { estado: estado } }));
        } catch (e) {}
    }

    function cargarScript(url) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = url; script.crossOrigin = 'anonymous'; script.async = true;
            var temporizador = setTimeout(function () {
                script.remove(); reject(new Error('Tiempo agotado cargando ' + url));
            }, CONFIG.SCRIPT_TIMEOUT_MS);
            script.onload = function () { clearTimeout(temporizador); resolve(); };
            script.onerror = function () { clearTimeout(temporizador); script.remove(); reject(new Error('No se pudo descargar ' + url)); };
            document.head.appendChild(script);
        });
    }

    async function cargarMediaPipe() {
        if (typeof window.FaceMesh === 'function') return CONFIG.MEDIAPIPE_VERSIONS[0];
        var ultimoError = null;
        for (var i = 0; i < CONFIG.MEDIAPIPE_VERSIONS.length; i++) {
            var version = CONFIG.MEDIAPIPE_VERSIONS[i];
            try {
                await cargarScript(CONFIG.MEDIAPIPE_CDN + '@' + version + '/face_mesh.js');
                if (typeof window.FaceMesh === 'function') return version;
                ultimoError = new Error('MediaPipe no expuso FaceMesh en la versión ' + version);
            } catch (error) { ultimoError = error; }
        }
        throw ultimoError || new Error('MediaPipe no disponible.');
    }

    // FaceMesh se inicializa una sola vez. Si falla, la cámara sigue sin filtros.
    async function iniciarFaceMesh() {
        if (state.faceMeshListo) return true;
        try {
            var version = await cargarMediaPipe();
            var faceMesh = new window.FaceMesh({
                locateFile: function (archivo) { return CONFIG.MEDIAPIPE_CDN + '@' + version + '/' + archivo; }
            });
            faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            faceMesh.onResults(function (resultados) { state.lastResults = resultados; });
            await faceMesh.initialize();
            state.faceMesh = faceMesh;
            state.faceMeshListo = true;
            return true;
        } catch (error) {
            console.error('[CSARIELS Cámara] MediaPipe no disponible; la cámara funciona sin filtros:', error);
            return false;
        }
    }

    async function pedirStream() {
        var audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        var intentos = [
            { video: { facingMode: { ideal: state.facingMode }, width: { ideal: CONFIG.VIDEO_WIDTH }, height: { ideal: CONFIG.VIDEO_HEIGHT } }, audio: audio },
            { video: { facingMode: state.facingMode }, audio: true },
            { video: true, audio: true },
            { video: true, audio: false }
        ];
        var ultimoError = null;
        for (var i = 0; i < intentos.length; i++) {
            try { return await navigator.mediaDevices.getUserMedia(intentos[i]); }
            catch (error) {
                ultimoError = error;
                if (error.name === 'NotAllowedError' || error.name === 'SecurityError') break;
            }
        }
        throw ultimoError || new Error('No se pudo acceder a la cámara.');
    }

    // Espera a que el video tenga dimensiones reales (hasta ESPERA_DIMENSIONES_MS).
    function esperarDimensiones(video) {
        return new Promise(function (resolve) {
            if (video.videoWidth > 0) { resolve(true); return; }
            var inicio = Date.now();
            var intervalo = setInterval(function () {
                if (video.videoWidth > 0) { clearInterval(intervalo); resolve(true); }
                else if (Date.now() - inicio > CONFIG.ESPERA_DIMENSIONES_MS) { clearInterval(intervalo); resolve(false); }
            }, 60);
        });
    }

    async function iniciarStream() {
        detenerStream();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Tu navegador no permite acceder a la cámara.');
        state.stream = await pedirStream();
        var video = state.video;
        video.muted = true;
        video.setAttribute('playsinline', '');
        video.srcObject = state.stream;
        try { await video.play(); } catch (e) {}
        var listo = await esperarDimensiones(video);
        if (!listo) throw new Error('La cámara no entregó imagen. Cierra otras apps que la usen e intenta de nuevo.');
    }

    function detenerStream() {
        if (state.stream) {
            state.stream.getTracks().forEach(function (track) { track.stop(); });
            state.stream = null;
        }
        if (state.video) state.video.srcObject = null;
    }

    async function cambiarCamara() {
        if (!state.iniciada || state.grabando || state.cuentaRegresivaActiva) return;
        var anterior = state.facingMode;
        state.facingMode = anterior === 'user' ? 'environment' : 'user';
        try {
            mostrarCargando(true, 'Cambiando cámara…');
            await iniciarStream();
            state.lastResults = null; state.lastDetectionTime = 0;
            mostrarCargando(false);
        } catch (error) {
            state.facingMode = anterior; mostrarCargando(false);
            notificar('No se pudo cambiar la cámara.', 'error');
        }
    }

    function precargarImagenes() {
        return new Promise(function (resolve) {
            var urls = new Set();
            Object.keys(ASSETS).forEach(function (id) {
                ASSETS[id].partes.forEach(function (parte) { urls.add(parte.src); });
            });
            var pendientes = urls.size;
            if (pendientes === 0) { resolve(); return; }
            function terminar() { pendientes--; if (pendientes <= 0) resolve(); }
            urls.forEach(function (url) {
                var existente = state.imagenes[url];
                if (existente && existente.complete && existente.naturalWidth > 0) { terminar(); return; }
                var imagen = new Image();
                imagen.crossOrigin = 'anonymous';
                imagen.onload = terminar;
                imagen.onerror = function () { console.error('[CSARIELS Cámara] No se pudo cargar el PNG:', url); terminar(); };
                state.imagenes[url] = imagen; imagen.src = url;
            });
        });
    }

    function ocultarMarquinhos() {
        state.ocultos = [];
        var elementos = new Set();
        SELECTORES_MARQUINHOS.forEach(function (selector) {
            try {
                document.querySelectorAll(selector).forEach(function (el) {
                    if (el.closest('#csModalCamara')) return; elementos.add(el);
                });
            } catch (error) {}
        });
        elementos.forEach(function (el) {
            state.ocultos.push({ el: el, prev: el.style.getPropertyValue('display'), prioridad: el.style.getPropertyPriority('display') });
            el.style.setProperty('display', 'none', 'important');
        });
    }

    function restaurarMarquinhos() {
        state.ocultos.forEach(function (registro) {
            try {
                if (registro.prev) registro.el.style.setProperty('display', registro.prev, registro.prioridad);
                else registro.el.style.removeProperty('display');
            } catch (error) {}
        });
        state.ocultos = [];
    }

    // ============================================================
    // INTERFAZ · estilo TikTok
    // ============================================================
    function inyectarModalCamara() {
        if ($('csModalCamara')) return;
        var modal = document.createElement('div');
        modal.id = 'csModalCamara';
        modal.className = 'cs-camara-modal';
        modal.innerHTML = `
            <div class="cs-camara-viewport" id="csCamaraViewport">
                <video id="csCamaraVideo" playsinline autoplay muted></video>
                <canvas id="csCamaraCanvas"></canvas>

                <div class="cs-camara-top">
                    <button type="button" class="cs-camara-icon-btn" id="csCamaraClose" aria-label="Cerrar">✕</button>
                    <button type="button" class="cs-camara-sound" id="csCamaraSonido">
                        <span class="cs-camara-sound-ico">♪</span>
                        <span id="csCamaraSonidoTxt">Agregar sonido</span>
                    </button>
                    <span class="cs-camara-spacer"></span>
                </div>

                <div class="cs-camara-side" id="csCamaraSide">
                    <button type="button" class="cs-camara-side-btn" id="csCamaraFlip" aria-label="Cambiar cámara">
                        <span class="ico">⟲</span><span class="lbl">Voltear</span>
                    </button>
                    <button type="button" class="cs-camara-side-btn" id="csCamaraTemp" aria-label="Temporizador">
                        <span class="ico">◷</span><span class="lbl">3 s</span>
                    </button>
                    <button type="button" class="cs-camara-side-btn" id="csCamaraSonido2" aria-label="Sonido">
                        <span class="ico">♫</span><span class="lbl">Sonido</span>
                    </button>
                </div>

                <div class="cs-camara-timer" id="csCamaraTimer">00:00</div>
                <div class="cs-camara-rec-indicator" id="csRecIndicator">● REC</div>
                <div class="cs-camara-countdown" id="csCamaraCountdown"></div>
                <div class="cs-camara-loading" id="csCamaraLoading">Iniciando cámara…</div>

                <div class="cs-camara-filtros" id="csCamaraFiltros"></div>
            </div>

            <div class="cs-camara-controles">
                <div class="cs-camara-modos" id="csCamaraModos">
                    <button type="button" class="cs-camara-modo" data-duracion="15">15 s</button>
                    <button type="button" class="cs-camara-modo activo" data-duracion="60">60 s</button>
                </div>
                <div class="cs-camara-capturar">
                    <button type="button" class="cs-camara-record-btn" id="csBtnRecord" aria-label="Grabar"><span class="cs-camara-record-inner"></span></button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        if (!$('cs-camara-styles')) {
            var style = document.createElement('style');
            style.id = 'cs-camara-styles';
            style.textContent = `
                .cs-camara-modal { position: fixed; inset: 0; z-index: ${Z.CAMARA}; background: #000; display: none; flex-direction: column; color: #fff; font-family: Inter, system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
                .cs-camara-modal.show { display: flex; }
                .cs-camara-viewport { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #000; }
                /* El video de origen se mantiene con tamaño real para que el navegador lo decodifique. Invisible y sin eventos. */
                #csCamaraVideo { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; z-index: 0; object-fit: cover; }
                #csCamaraCanvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; z-index: 1; }

                .cs-camara-top, .cs-camara-side, .cs-camara-filtros, .cs-camara-controles, .cs-camara-icon-btn, .cs-camara-sound, .cs-camara-side-btn, .cs-camara-modo, .cs-camara-record-btn, .cs-filtro-btn { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
                .cs-camara-top { position: absolute; top: 0; left: 0; right: 0; padding: max(12px, env(safe-area-inset-top)) 14px 10px; display: flex; align-items: center; gap: 10px; z-index: 30; background: linear-gradient(to bottom, rgba(0,0,0,.55), transparent); pointer-events: auto; }
                .cs-camara-icon-btn { width: 38px; height: 38px; border-radius: 50%; border: none; color: #fff; font-size: 1.05rem; background: transparent; cursor: pointer; flex-shrink: 0; }
                .cs-camara-sound { flex: 0 1 auto; margin: 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 999px; border: none; color: #fff; background: rgba(0,0,0,.35); font-size: .8rem; font-weight: 600; cursor: pointer; max-width: 70%; }
                .cs-camara-sound span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .cs-camara-sound.activo { background: rgba(212,175,55,.9); color: #05080f; }
                .cs-camara-spacer { width: 38px; flex-shrink: 0; }

                .cs-camara-side { position: absolute; right: 10px; top: 70px; display: flex; flex-direction: column; gap: 18px; align-items: center; z-index: 30; pointer-events: auto; }
                .cs-camara-side-btn { background: none; border: none; color: #fff; display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: pointer; text-shadow: 0 1px 4px rgba(0,0,0,.7); padding: 4px; }
                .cs-camara-side-btn .ico { font-size: 1.4rem; line-height: 1; }
                .cs-camara-side-btn .lbl { font-size: .6rem; font-weight: 600; }

                .cs-camara-timer { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); display: none; font-family: ui-monospace, monospace; font-size: .85rem; padding: 4px 12px; border-radius: 999px; background: rgba(255,51,102,.9); z-index: 16; }
                .cs-camara-timer.active { display: block; }
                .cs-camara-rec-indicator { position: absolute; top: 96px; left: 50%; transform: translateX(-50%); display: none; padding: 3px 10px; border-radius: 999px; background: rgba(255,51,102,.9); font-size: .65rem; font-weight: 700; z-index: 16; }
                .cs-camara-rec-indicator.active { display: block; animation: csPulseRec 1s infinite alternate; }
                @keyframes csPulseRec { from { opacity: 1; } to { opacity: .35; } }
                .cs-camara-countdown { position: absolute; inset: 0; display: none; place-items: center; font-size: 6rem; font-weight: 800; color: #fff; text-shadow: 0 4px 24px rgba(0,0,0,.6); z-index: 17; pointer-events: none; }
                .cs-camara-countdown.visible { display: grid; }
                .cs-camara-loading { position: absolute; inset: 0; display: grid; place-items: center; font-size: .9rem; background: rgba(0,0,0,.55); z-index: 15; pointer-events: none; }
                .cs-camara-loading.hidden { display: none; }

                .cs-camara-filtros { position: absolute; left: 0; right: 0; bottom: 8px; display: flex; gap: 10px; padding: 6px 12px; overflow-x: auto; scrollbar-width: none; z-index: 18; }
                .cs-camara-filtros::-webkit-scrollbar { display: none; }
                .cs-filtro-btn { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; color: #fff; font-size: .6rem; cursor: pointer; text-shadow: 0 1px 4px rgba(0,0,0,.7); }
                .cs-filtro-btn .icono { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-size: 1.25rem; background: rgba(0,0,0,.35); border: 2px solid transparent; }
                .cs-filtro-btn.activo .icono { border-color: #fff; }

                .cs-camara-controles { position: relative; z-index: 30; background: #000; padding: 8px 0 max(20px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: center; gap: 14px; }
                .cs-camara-modos { display: flex; justify-content: center; gap: 22px; }
                .cs-camara-modo { background: none; border: none; color: rgba(255,255,255,.6); font-size: .85rem; font-weight: 700; padding: 4px 6px; cursor: pointer; }
                .cs-camara-modo.activo { color: #fff; }

                .cs-camara-capturar { display: flex; justify-content: center; }
                .cs-camara-record-btn { width: 76px; height: 76px; border-radius: 50%; border: 4px solid #fff; background: #ff2d55; padding: 0; cursor: pointer; display: grid; place-items: center; transition: all .18s ease; box-shadow: 0 0 0 4px rgba(255,45,85,.25); }
                .cs-camara-record-inner { width: 60px; height: 60px; border-radius: 50%; background: #ff2d55; display: block; transition: all .18s ease; }
                .cs-camara-record-btn.grabando { border-color: #ff2d55; background: #fff; }
                .cs-camara-record-btn.grabando .cs-camara-record-inner { width: 28px; height: 28px; border-radius: 6px; background: #ff2d55; }
                .cs-camara-record-btn:disabled { opacity: .5; cursor: not-allowed; }
            `;
            document.head.appendChild(style);
        }

        $('csCamaraClose').addEventListener('click', cerrarCamara);
        $('csCamaraFlip').addEventListener('click', cambiarCamara);
        $('csCamaraSonido').addEventListener('click', abrirSelectorSonido);
        $('csCamaraSonido2').addEventListener('click', abrirSelectorSonido);
        $('csCamaraTemp').addEventListener('click', ciclarTemporizador);
        $('csBtnRecord').addEventListener('click', toggleGrabacion);
        $('csCamaraFiltros').addEventListener('click', function (evento) {
            var boton = evento.target.closest('.cs-filtro-btn');
            if (!boton) return;
            state.filtroActual = boton.dataset.filtroId;
            state.lastResults = null;
            renderizarFiltros();
        });
        $('csCamaraModos').addEventListener('click', function (evento) {
            var boton = evento.target.closest('.cs-camara-modo');
            if (!boton) return;
            if (state.grabando || state.cuentaRegresivaActiva) {
                notificar('Termina la grabación para cambiar la duración.', 'warning');
                return;
            }
            establecerDuracion(parseInt(boton.dataset.duracion, 10));
        });
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('csariels:sonido:seleccionado', onSonidoSeleccionadoDesdePublicar);
        renderizarFiltros();
        renderizarModos();
        actualizarEtiquetaSonido();
    }

    var temporizadoresCuenta = [3, 5, 10];
    function ciclarTemporizador() {
        if (state.grabando || state.cuentaRegresivaActiva) {
            notificar('Termina la grabación para cambiar el temporizador.', 'warning');
            return;
        }
        var i = temporizadoresCuenta.indexOf(CONFIG.COUNTDOWN_SECONDS);
        CONFIG.COUNTDOWN_SECONDS = temporizadoresCuenta[(i + 1) % temporizadoresCuenta.length];
        var lbl = document.querySelector('#csCamaraTemp .lbl');
        if (lbl) lbl.textContent = CONFIG.COUNTDOWN_SECONDS + ' s';
    }

    function renderizarFiltros() {
        var contenedor = $('csCamaraFiltros');
        if (!contenedor) return;
        contenedor.innerHTML = state.filtrosDisponibles.map(function (filtro) {
            return `
                <button type="button" class="cs-filtro-btn ${state.filtroActual === filtro.id ? 'activo' : ''}" data-filtro-id="${filtro.id}">
                    <span class="icono">${filtro.icono}</span>
                    <span>${filtro.nombre}</span>
                </button>`;
        }).join('');
    }

    function renderizarModos() {
        var contenedor = $('csCamaraModos');
        if (!contenedor) return;
        contenedor.querySelectorAll('.cs-camara-modo').forEach(function (boton) {
            var duracion = parseInt(boton.dataset.duracion, 10);
            boton.classList.toggle('activo', duracion === state.duracionActual);
        });
    }

    function establecerDuracion(segundos) {
        if (CONFIG.DURACIONES.indexOf(segundos) === -1) return;
        state.duracionActual = segundos;
        renderizarModos();
    }

    function actualizarEtiquetaSonido() {
        var boton = $('csCamaraSonido');
        var txt = $('csCamaraSonidoTxt');
        if (!boton || !txt) return;
        var sonido = state.audioPista ? state.audioPista.nombre : null;
        if (sonido) {
            txt.textContent = sonido;
            boton.classList.add('activo');
        } else {
            txt.textContent = 'Agregar sonido';
            boton.classList.remove('activo');
        }
    }

    function elevarSelectorSonido() {
        var ids = [
            ['csSheetSonidosBackdrop', Z.SHEET_BACKDROP],
            ['csModalSonidos', Z.SHEET]
        ];
        ids.forEach(function (par) {
            var el = $(par[0]);
            if (el) el.style.setProperty('z-index', String(par[1]), 'important');
        });
    }

    function abrirSelectorSonido(evento) {
        if (evento) { evento.preventDefault(); evento.stopPropagation(); }
        if (state.grabando || state.cuentaRegresivaActiva) {
            notificar('Termina la grabación para cambiar el sonido.', 'warning');
            return;
        }
        if (!window.VideosPublicar || typeof window.VideosPublicar.abrirModalSonidos !== 'function') {
            notificar('El selector de sonidos no está disponible.', 'warning');
            return;
        }
        elevarSelectorSonido();
        window.VideosPublicar.abrirModalSonidos();
        elevarSelectorSonido();
    }

    function onSonidoSeleccionadoDesdePublicar(evento) {
        var sonido = evento && evento.detail ? evento.detail : null;
        if (!sonido || !sonido.url) {
            state.audioPista = null;
            state.audioPistaUrl = null;
        } else {
            state.audioPista = sonido;
            state.audioPistaUrl = sonido.url;
        }
        actualizarEtiquetaSonido();
    }

    // ============================================================
    // DETECCIÓN FACIAL · bucle independiente del render
    // ============================================================
    function iniciarLoopDeteccion() {
        var intervalo = 1000 / CONFIG.DETECTION_FPS;
        async function detectar() {
            if (!state.iniciada) return;
            var ahora = performance.now();
            if (state.faceMesh && !state.enviando && state.video && state.video.videoWidth > 0 &&
                ahora - state.lastDetectionTime >= intervalo) {
                state.lastDetectionTime = ahora;
                state.enviando = true;
                try { await state.faceMesh.send({ image: state.video }); }
                catch (error) { console.warn('[CSARIELS Cámara] Error de detección:', error); }
                finally { state.enviando = false; }
            }
            if (state.iniciada) state.detectionFrameId = requestAnimationFrame(detectar);
        }
        state.detectionFrameId = requestAnimationFrame(detectar);
    }

    // ============================================================
    // RENDER · video + filtro sobre el canvas (escala cover)
    // ============================================================
    function calcularCover(video, canvas) {
        var vw = video.videoWidth, vh = video.videoHeight;
        var cw = canvas.width, ch = canvas.height;
        var escala = Math.max(cw / vw, ch / vh);
        return {
            escala: escala,
            dx: (cw - vw * escala) / 2,
            dy: (ch - vh * escala) / 2,
            dw: vw * escala,
            dh: vh * escala
        };
    }

    function dibujarVideoCover(video, canvas, ctx, espejado, cover) {
        ctx.save();
        if (espejado) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, cover.dx, cover.dy, cover.dw, cover.dh);
        ctx.restore();
    }

    function iniciarLoopRender() {
        function dibujar() {
            if (!state.iniciada) return;
            var video = state.video, canvas = state.canvas, ctx = state.ctx;

            if (video && video.videoWidth > 0 && video.videoHeight > 0) {
                if (canvas.width !== CONFIG.CANVAS_WIDTH || canvas.height !== CONFIG.CANVAS_HEIGHT) {
                    canvas.width = CONFIG.CANVAS_WIDTH;
                    canvas.height = CONFIG.CANVAS_HEIGHT;
                }
                var espejado = state.facingMode === 'user';
                var cover = calcularCover(video, canvas);

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                dibujarVideoCover(video, canvas, ctx, espejado, cover);

                var resultados = state.lastResults;
                var landmarks = resultados && resultados.multiFaceLandmarks && resultados.multiFaceLandmarks[0];
                if (landmarks && landmarks.length > 454 && state.filtroActual !== 'ninguno') {
                    dibujarFiltro(landmarks, canvas, ctx, espejado, cover);
                }
            }
            state.renderFrameId = requestAnimationFrame(dibujar);
        }
        state.renderFrameId = requestAnimationFrame(dibujar);
    }

    function dibujarFiltro(landmarks, canvas, ctx, espejado, cover) {
        var filtro = ASSETS[state.filtroActual];
        if (!filtro) return;

        // Convierte un landmark normalizado (0..1 sobre el video) a coordenadas del canvas.
        function punto(indice) {
            var p = landmarks[indice];
            var xVideo = espejado ? (1 - p.x) : p.x;
            return {
                x: xVideo * state.video.videoWidth * cover.escala + cover.dx,
                y: p.y * state.video.videoHeight * cover.escala + cover.dy
            };
        }

        var ojoA = punto(33), ojoB = punto(263);
        var ojoIzq = ojoA.x <= ojoB.x ? ojoA : ojoB;
        var ojoDer = ojoA.x <= ojoB.x ? ojoB : ojoA;
        var mejillaA = punto(234), mejillaB = punto(454);
        var mejillaIzq = mejillaA.x <= mejillaB.x ? mejillaA : mejillaB;
        var mejillaDer = mejillaA.x <= mejillaB.x ? mejillaB : mejillaA;
        var anchoCara = Math.hypot(mejillaDer.x - mejillaIzq.x, mejillaDer.y - mejillaIzq.y);
        if (!anchoCara || !isFinite(anchoCara)) return;

        var angulo = Math.atan2(ojoDer.y - ojoIzq.y, ojoDer.x - ojoIzq.x);
        var centroOjos = { x: (ojoIzq.x + ojoDer.x) / 2, y: (ojoIzq.y + ojoDer.y) / 2 };
        var frente = punto(10);
        var puntaNariz = punto(1);

        filtro.partes.forEach(function (parte) {
            var imagen = state.imagenes[parte.src];
            if (!imagen || !imagen.complete || !imagen.naturalWidth || !imagen.naturalHeight) return;
            var ancho = anchoCara * parte.scale;
            var factorAltura = parte.aplanar || 1;
            var alto = ancho * (imagen.naturalHeight / imagen.naturalWidth) * factorAltura;
            var ancla = (parte.ancla === 'frente') ? frente : (parte.ancla === 'nariz') ? puntaNariz : centroOjos;
            var desplazamientoX = (parte.offsetX || 0) * anchoCara;
            var desplazamientoY = (parte.offsetY || 0) * alto;
            ctx.save();
            ctx.translate(ancla.x + desplazamientoX, ancla.y + desplazamientoY);
            ctx.rotate(angulo);
            ctx.drawImage(imagen, -ancho / 2, -alto / 2, ancho, alto);
            ctx.restore();
        });
    }

    function obtenerFormatoGrabacion() {
        if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
        var candidatos = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
        return candidatos.find(function (tipo) { return MediaRecorder.isTypeSupported(tipo); }) || '';
    }

    function capturarFotogramaCanvas() {
        return new Promise(function (resolve) {
            try {
                var c = state.canvas;
                if (!c || !c.width) { resolve(null); return; }
                var out = document.createElement('canvas');
                var escala = Math.min(1, 480 / c.width);
                out.width = Math.round(c.width * escala);
                out.height = Math.round(c.height * escala);
                out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
                out.toBlob(function (blob) { resolve(blob || null); }, 'image/jpeg', 0.85);
            } catch (e) { resolve(null); }
        });
    }

    async function prepararMezclaAudio() {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        var ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch (e) {}
        }

        var destino = ctx.createMediaStreamDestination();

        if (state.stream && state.stream.getAudioTracks().length) {
            var micStream = new MediaStream(state.stream.getAudioTracks());
            var micFuente = ctx.createMediaStreamSource(micStream);
            micFuente.connect(destino);
            state.audioMicFuente = micFuente;
        }

        state.audioCtx = ctx;
        state.audioDestino = destino;
        return destino;
    }

    async function conectarPistaDeFondo() {
        if (!state.audioPistaUrl || !state.audioCtx) return false;

        var audioEl = new Audio();
        audioEl.crossOrigin = 'anonymous';
        audioEl.preload = 'auto';
        audioEl.src = state.audioPistaUrl;

        var cargada = await new Promise(function (resolve) {
            var timer = setTimeout(function () { resolve(false); }, CONFIG.PISTA_TIMEOUT_MS);
            audioEl.oncanplaythrough = function () { clearTimeout(timer); resolve(true); };
            audioEl.onerror = function () { clearTimeout(timer); resolve(false); };
            audioEl.load();
        });

        if (!cargada) {
            notificar('La pista no cargó. Se grabará sin sonido de fondo.', 'warning');
            return false;
        }

        try {
            var fuente = state.audioCtx.createMediaElementSource(audioEl);
            fuente.connect(state.audioDestino);
            fuente.connect(state.audioCtx.destination);
            state.audioPistaFuente = fuente;
            state.audioPista = state.audioPista || {};
            state.audioPista.elemento = audioEl;
            audioEl.currentTime = 0;
            await audioEl.play().catch(function () {});
            return true;
        } catch (error) {
            console.warn('[CSARIELS Cámara] No se pudo mezclar la pista:', error);
            return false;
        }
    }

    function liberarMezclaAudio() {
        try {
            if (state.audioPista && state.audioPista.elemento) {
                state.audioPista.elemento.pause();
                state.audioPista.elemento.removeAttribute('src');
                state.audioPista.elemento.load();
            }
        } catch (e) {}
        try { if (state.audioMicFuente) state.audioMicFuente.disconnect(); } catch (e) {}
        try { if (state.audioPistaFuente) state.audioPistaFuente.disconnect(); } catch (e) {}
        try { if (state.audioCtx && state.audioCtx.state !== 'closed') state.audioCtx.close(); } catch (e) {}
        state.audioCtx = null;
        state.audioDestino = null;
        state.audioMicFuente = null;
        state.audioPistaFuente = null;
        if (state.audioPista) delete state.audioPista.elemento;
    }

    function toggleGrabacion() {
        if (state.cuentaRegresivaActiva) return;
        if (state.grabando) detenerGrabacion();
        else iniciarCuentaRegresiva();
    }

    function iniciarCuentaRegresiva() {
        if (!state.iniciada || state.grabando) return;
        state.cuentaRegresivaActiva = true;
        var numero = CONFIG.COUNTDOWN_SECONDS;
        var contador = $('csCamaraCountdown');
        if (contador) { contador.textContent = numero; contador.classList.add('visible'); }
        state.cuentaRegresivaTimer = setInterval(function () {
            numero--;
            if (numero > 0) {
                if (contador) contador.textContent = numero;
            } else {
                clearInterval(state.cuentaRegresivaTimer);
                state.cuentaRegresivaTimer = null;
                state.cuentaRegresivaActiva = false;
                if (contador) contador.classList.remove('visible');
                iniciarGrabacion();
            }
        }, 1000);
    }

    async function iniciarGrabacion() {
        if (!state.iniciada || state.grabando) return;
        if (typeof state.canvas.captureStream !== 'function') {
            notificar('Tu navegador no permite grabar desde la cámara.', 'error'); return;
        }

        var canvasStream = state.canvas.captureStream(CONFIG.TARGET_FPS);
        state.archivoConAudioMezclado = false;

        var mezcla = await prepararMezclaAudio();
        if (mezcla) {
            if (state.audioPistaUrl) {
                state.archivoConAudioMezclado = await conectarPistaDeFondo();
            }
            mezcla.stream.getAudioTracks().forEach(function (track) { canvasStream.addTrack(track); });
        } else if (state.stream) {
            state.stream.getAudioTracks().forEach(function (track) { canvasStream.addTrack(track); });
        }

        var mimeType = obtenerFormatoGrabacion();
        var recorder;
        try {
            recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType: mimeType, videoBitsPerSecond: CONFIG.VIDEO_BITRATE, audioBitsPerSecond: CONFIG.AUDIO_BITRATE } : {});
        } catch (error) {
            canvasStream.getTracks().forEach(function (track) { track.stop(); });
            liberarMezclaAudio();
            notificar('Tu navegador no soporta grabación de video.', 'error'); return;
        }

        state.mediaRecorder = recorder; state.chunks = []; state.descartar = false;
        recorder.ondataavailable = function (evento) { if (evento.data && evento.data.size > 0) state.chunks.push(evento.data); };
        recorder.onstop = async function () {
            var tipo = recorder.mimeType || mimeType || 'video/webm';
            var extension = tipo.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
            var blob = new Blob(state.chunks, { type: tipo });
            state.chunks = [];
            canvasStream.getTracks().forEach(function (track) { track.stop(); });
            liberarMezclaAudio();
            if (state.descartar) { liberarRecursos(); return; }
            if (blob.size === 0) { notificar('No se pudo grabar el video. Intenta de nuevo.', 'error'); liberarRecursos(); return; }

            var archivo = new File([blob], 'video-camara-' + Date.now() + '.' + extension, { type: tipo });
            var portada = await capturarFotogramaCanvas();
            window.__csMiniaturaCamara = portada;
            window.__csArchivoConAudioMezclado = state.archivoConAudioMezclado;
            liberarRecursos();
            emitirEstado('listo');
            if (typeof window.csCamaraOnVideoGrabado === 'function') window.csCamaraOnVideoGrabado(archivo);
        };

        recorder.start(250);
        state.grabando = true;
        emitirEstado('grabando');
        $('csBtnRecord').classList.add('grabando');
        $('csRecIndicator').classList.add('active');
        $('csCamaraTimer').classList.add('active');
        iniciarTimer();
    }

    function detenerGrabacion() {
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
        state.grabando = false;
        if ($('csBtnRecord')) $('csBtnRecord').classList.remove('grabando');
        if ($('csRecIndicator')) $('csRecIndicator').classList.remove('active');
        if ($('csCamaraTimer')) $('csCamaraTimer').classList.remove('active');
        detenerTimer();
    }

    function iniciarTimer() {
        state.segundosGrabados = 0; actualizarTimerUI();
        state.timerInterval = setInterval(function () {
            state.segundosGrabados++; actualizarTimerUI();
            if (state.segundosGrabados >= state.duracionActual) detenerGrabacion();
        }, 1000);
    }

    function detenerTimer() {
        if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    }

    function actualizarTimerUI() {
        var minutos = String(Math.floor(state.segundosGrabados / 60)).padStart(2, '0');
        var segundos = String(state.segundosGrabados % 60).padStart(2, '0');
        var temporizador = $('csCamaraTimer');
        if (temporizador) temporizador.textContent = minutos + ':' + segundos;
    }

    function onVisibilityChange() {
        if (document.hidden && state.grabando) detenerGrabacion();
    }

    // ============================================================
    // ABRIR / CERRAR
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
            state.canvas.width = CONFIG.CANVAS_WIDTH;
            state.canvas.height = CONFIG.CANVAS_HEIGHT;

            await iniciarStream();
            state.iniciada = true;
            state.lastDetectionTime = 0;
            state.lastResults = null;
            mostrarCargando(false);
            iniciarLoopRender();
            emitirEstado('abierta');

            // Los filtros cargan en segundo plano: la cámara ya funciona sin ellos
            Promise.all([precargarImagenes(), iniciarFaceMesh()]).then(function (resultado) {
                var faceOk = resultado[1];
                if (!faceOk && !state.avisoFiltrosMostrado) {
                    state.avisoFiltrosMostrado = true;
                    notificar('Filtros no disponibles en este momento. Puedes grabar sin ellos.', 'warning');
                    return;
                }
                if (state.iniciada && faceOk) iniciarLoopDeteccion();
            });
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
        if (state.cuentaRegresivaTimer) { clearInterval(state.cuentaRegresivaTimer); state.cuentaRegresivaTimer = null; state.cuentaRegresivaActiva = false; }
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.descartar = true; state.grabando = false;
            $('csModalCamara').classList.remove('show');
            state.mediaRecorder.stop();
            return;
        }
        liberarRecursos();
    }

    function liberarRecursos() {
        state.iniciada = false; state.grabando = false;
        state.lastResults = null; state.mediaRecorder = null;
        state.chunks = []; state.enviando = false;
        if (state.renderFrameId) { cancelAnimationFrame(state.renderFrameId); state.renderFrameId = null; }
        if (state.detectionFrameId) { cancelAnimationFrame(state.detectionFrameId); state.detectionFrameId = null; }
        detenerStream(); detenerTimer();
        liberarMezclaAudio();
        if ($('csBtnRecord')) $('csBtnRecord').classList.remove('grabando');
        if ($('csRecIndicator')) $('csRecIndicator').classList.remove('active');
        if ($('csCamaraTimer')) $('csCamaraTimer').classList.remove('active');
        if ($('csModalCamara')) $('csModalCamara').classList.remove('show');
        mostrarCargando(false);
        restaurarMarquinhos();
        emitirEstado('cerrada');
    }

    function grabarDesdeStream(stream, duracionSeg) {
        return new Promise(function (resolve, reject) {
            try {
                var mimeType = obtenerFormatoGrabacion();
                var rec = new MediaRecorder(stream, mimeType ? { mimeType: mimeType, videoBitsPerSecond: CONFIG.VIDEO_BITRATE } : {});
                var chunks = [];
                rec.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
                rec.onstop = function () {
                    var tipo = rec.mimeType || mimeType || 'video/webm';
                    var ext = tipo.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
                    var blob = new Blob(chunks, { type: tipo });
                    resolve(new File([blob], 'live-canal-' + Date.now() + '.' + ext, { type: tipo }));
                };
                rec.start(250);
                if (duracionSeg) setTimeout(function () { if (rec.state !== 'inactive') rec.stop(); }, duracionSeg * 1000);
                window.__csGrabacionStreamStop = function () { if (rec.state !== 'inactive') rec.stop(); };
            } catch (e) { reject(e); }
        });
    }

    window.VideosCamara = {
        abrirCamara: abrirCamara,
        cerrarCamara: cerrarCamara,
        cambiarCamara: cambiarCamara,
        setFiltro: function (id) {
            if (ASSETS[id] || id === 'ninguno') {
                state.filtroActual = id;
                state.lastResults = null;
                renderizarFiltros();
            }
        },
        setDuracion: establecerDuracion,
        grabarDesdeStream: grabarDesdeStream,
        abrirSelectorSonido: abrirSelectorSonido
    };

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