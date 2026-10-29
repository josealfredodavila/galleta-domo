/* ================================================================
   CSARIEL'S · VIDEOS · CÁMARA Y FILTROS (TikTok Style) v3.3
   ================================================================
   - Fix v3.3: Carga dinámica de MediaPipe 0.4.1675469240
     (evita conflicto con versiones viejas en el HTML).
   - Fix v3.3: Ocultar Marquinhos al abrir cámara.
   - Fix v3.3: Ajuste de escala de filtros.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosCamaraLoaded) return;
    window.__csarielsVideosCamaraLoaded = true;

    const CONFIG = Object.freeze({
        MAX_DURATION_SECONDS: 60,
        TARGET_FPS: 30,
        DETECTION_FPS: 24,
        VIDEO_WIDTH: 1280,
        VIDEO_HEIGHT: 720,
        MEDIAPIPE_VERSION: '0.4.1675469240',
        MEDIAPIPE_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
    });

    const GITHUB_BASE_URL = 'https://cdn.jsdelivr.net/gh/josealfredodavila/galleta-domo@main';

    const ASSETS = {
        gato: { src: `${GITHUB_BASE_URL}/orejas-gato.png`, scale: 1.0, offsetY: -0.4 },
        burro: { src: `${GITHUB_BASE_URL}/orejas-burro.png`, scale: 1.0, offsetY: -0.4 },
        gafas: { src: `${GITHUB_BASE_URL}/gafas.png`, scale: 1.0, offsetY: 0 },
        bigote: { src: `${GITHUB_BASE_URL}/bigote.png`, scale: 0.55, offsetY: 0.1 },
        corona: { src: `${GITHUB_BASE_URL}/corona.png`, scale: 0.9, offsetY: -0.5 }
    };

    const state = {
        stream: null, faceMesh: null, canvas: null, ctx: null, video: null,
        mediaRecorder: null, chunks: [], grabando: false, iniciada: false,
        filtroActual: 'ninguno', renderFrameId: null, detectionFrameId: null,
        lastDetectionTime: 0, lastResults: null, facingMode: 'user',
        timerInterval: null, segundosGrabados: 0, imagenesCargadas: {},
        filtrosDisponibles: [
            { id: 'ninguno', nombre: 'Ninguno', icono: '🚫' },
            { id: 'gato', nombre: 'Orejas', icono: '🐱' },
            { id: 'burro', nombre: 'Burro', icono: '🐴' },
            { id: 'gafas', nombre: 'Gafas', icono: '🕶️' },
            { id: 'bigote', nombre: 'Bigote', icono: '🥸' },
            { id: 'corona', nombre: 'Corona', icono: '👑' }
        ]
    };

    const $ = (id) => document.getElementById(id);

    // ============================================================
    // CARGA DINÁMICA DE MEDIAPIPE
    // ============================================================
    function cargarMediaPipe() {
        return new Promise((resolve, reject) => {
            if (typeof FaceMesh !== 'undefined') { resolve(); return; }

            const url = `${CONFIG.MEDIAPIPE_CDN}@${CONFIG.MEDIAPIPE_VERSION}/face_mesh.js`;
            const script = document.createElement('script');
            script.src = url;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('No se pudo cargar MediaPipe desde CDN'));
            document.head.appendChild(script);
        });
    }

    // ============================================================
    // OCULTAR / MOSTRAR MARQUINHOS
    // ============================================================
    let marquinhosElementos = [];

    function ocultarMarquinhos() {
        marquinhosElementos = [];
        const selectores = [
            '#marquinhos',
            '.marquinhos',
            '.marquinhos-robot',
            '[class*="marquinhos"]',
            '[id*="marquinhos"]',
            '[class*="cs-robot"]',
            '[id*="cs-robot"]'
        ];
        selectores.forEach(sel => {
            try {
                document.querySelectorAll(sel).forEach(el => {
                    if (el && el.style && el.style.display !== 'none') {
                        const displayAnterior = el.style.display || '';
                        el.dataset.marquinhosDisplayAnterior = displayAnterior;
                        el.style.display = 'none';
                        marquinhosElementos.push(el);
                    }
                });
            } catch (e) {}
        });
    }

    function mostrarMarquinhos() {
        marquinhosElementos.forEach(el => {
            try {
                const displayAnterior = el.dataset.marquinhosDisplayAnterior || '';
                el.style.display = displayAnterior;
                delete el.dataset.marquinhosDisplayAnterior;
            } catch (e) {}
        });
        marquinhosElementos = [];
    }

    function precargarImagenes() {
        return new Promise((resolve) => {
            let cargadas = 0;
            const total = Object.keys(ASSETS).length;
            if (total === 0) { resolve(); return; }
            Object.keys(ASSETS).forEach((key) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => { cargadas++; if (cargadas === total) resolve(); };
                img.onerror = () => { console.error(`Error cargando ${key}`); cargadas++; if (cargadas === total) resolve(); };
                img.src = ASSETS[key].src;
                state.imagenesCargadas[key] = img;
            });
        });
    }

    function inyectarModalCamara() {
        if ($('csModalCamara')) return;
        const modal = document.createElement('div');
        modal.id = 'csModalCamara';
        modal.className = 'cs-camara-modal';
        modal.innerHTML = `
            <div class="cs-camara-header">
                <button type="button" class="cs-camara-close" id="csCamaraClose">✕</button>
                <div class="cs-camara-timer" id="csCamaraTimer">00:00</div>
                <button type="button" class="cs-camara-flip" id="csCamaraFlip">🔄</button>
            </div>
            <div class="cs-camara-viewport">
                <video id="csCamaraVideo" playsinline autoplay muted></video>
                <canvas id="csCamaraCanvas"></canvas>
                <div class="cs-camara-rec-indicator" id="csRecIndicator">● REC</div>
                <div class="cs-camara-loading" id="csCamaraLoading">Iniciando cámara…</div>
            </div>
            <div class="cs-camara-filtros" id="csCamaraFiltros"></div>
            <div class="cs-camara-footer">
                <button type="button" class="cs-camara-record-btn" id="csBtnRecord"></button>
            </div>
        `;
        document.body.appendChild(modal);

        const style = document.createElement('style');
        style.id = 'cs-camara-styles';
        style.textContent = `
            .cs-camara-modal { position: fixed; inset: 0; z-index: 99999; background: #000; display: none; flex-direction: column; color: #fff; font-family: Inter, system-ui, sans-serif; user-select: none; }
            .cs-camara-modal.show { display: flex; }
            .cs-camara-header { position: absolute; top: 0; left: 0; right: 0; padding: 18px; display: flex; justify-content: space-between; align-items: center; z-index: 20; background: linear-gradient(to bottom, rgba(0,0,0,.65), transparent); }
            .cs-camara-close, .cs-camara-flip { width: 44px; height: 44px; border-radius: 50%; border: none; color: #fff; font-size: 1.15rem; background: rgba(0,0,0,.45); cursor: pointer; backdrop-filter: blur(10px); }
            .cs-camara-timer { display: none; font-family: ui-monospace, monospace; font-size: .95rem; padding: 5px 14px; border-radius: 999px; background: rgba(255,51,102,.85); }
            .cs-camara-timer.active { display: block; }
            .cs-camara-viewport { position: relative; flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #000; }
            #csCamaraVideo { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
            #csCamaraCanvas { width: 100%; height: 100%; object-fit: cover; display: block; }
            .cs-camara-loading { position: absolute; inset: 0; display: grid; place-items: center; font-size: .9rem; background: rgba(0,0,0,.55); z-index: 15; }
            .cs-camara-loading.hidden { display: none; }
            .cs-camara-rec-indicator { position: absolute; top: 82px; left: 50%; transform: translateX(-50%); display: none; padding: 5px 12px; border-radius: 999px; background: rgba(255,51,102,.9); font-size: .7rem; font-weight: 700; }
            .cs-camara-rec-indicator.active { display: block; animation: pulseRec 1s infinite alternate; }
            @keyframes pulseRec { from { opacity: 1; } to { opacity: .35; } }
            .cs-camara-filtros { display: flex; gap: 12px; padding: 16px; overflow-x: auto; scrollbar-width: none; z-index: 20; background: linear-gradient(to top, rgba(0,0,0,.85), transparent); }
            .cs-camara-filtros::-webkit-scrollbar { display: none; }
            .cs-filtro-btn { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: none; color: #fff; font-size: .65rem; cursor: pointer; }
            .cs-filtro-btn .icono { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 1.45rem; background: rgba(255,255,255,.1); border: 2px solid transparent; transition: transform .18s ease, border-color .18s ease, background .18s ease; }
            .cs-filtro-btn.activo .icono { border-color: #D4AF37; background: rgba(212,175,55,.22); transform: scale(1.06); }
            .cs-camara-footer { padding: 18px 0 max(28px, env(safe-area-inset-bottom)); display: flex; justify-content: center; z-index: 20; background: linear-gradient(to top, #000, transparent); }
            .cs-camara-record-btn { width: 78px; height: 78px; border-radius: 50%; border: 4px solid #fff; background: #ff3366; cursor: pointer; transition: all .18s ease; }
            .cs-camara-record-btn.grabando { width: 42px; height: 42px; border-radius: 10px; }
            .cs-camara-record-btn:disabled { opacity: .45; cursor: not-allowed; }
        `;
        document.head.appendChild(style);

        $('csCamaraClose').addEventListener('click', cerrarCamara);
        $('csCamaraFlip').addEventListener('click', cambiarCamara);
        $('csBtnRecord').addEventListener('click', toggleGrabacion);
        document.addEventListener('visibilitychange', onVisibilityChange);
        renderizarFiltros();
    }

    function renderizarFiltros() {
        const contenedor = $('csCamaraFiltros');
        if (!contenedor) return;
        contenedor.innerHTML = state.filtrosDisponibles.map((filtro) => `
            <button type="button" class="cs-filtro-btn ${state.filtroActual === filtro.id ? 'activo' : ''}" data-filtro-id="${filtro.id}">
                <span class="icono">${filtro.icono}</span>
                <span>${filtro.nombre}</span>
            </button>
        `).join('');
        contenedor.querySelectorAll('.cs-filtro-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.filtroActual = btn.dataset.filtroId;
                renderizarFiltros();
            });
        });
    }

    async function abrirCamara() {
        inyectarModalCamara();
        $('csModalCamara').classList.add('show');
        ocultarMarquinhos();
        mostrarCargando(true);
        try {
            state.video = $('csCamaraVideo');
            state.canvas = $('csCamaraCanvas');
            state.ctx = state.canvas.getContext('2d', { alpha: false });

            await cargarMediaPipe();
            await precargarImagenes();
            await iniciarStream();
            await iniciarMediaPipe();

            state.iniciada = true;
            mostrarCargando(false);
            iniciarLoopRender();
            iniciarLoopDeteccion();
        } catch (error) {
            console.error('[CSARIELS Cámara] Error al iniciar:', error);
            notificar(obtenerMensajeError(error), 'error');
            cerrarCamara();
        }
    }

    async function iniciarStream() {
        detenerStream();
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Tu navegador no permite acceder a la cámara.');
        state.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: state.facingMode }, width: { ideal: CONFIG.VIDEO_WIDTH }, height: { ideal: CONFIG.VIDEO_HEIGHT }, frameRate: { ideal: CONFIG.TARGET_FPS } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        state.video.srcObject = state.stream;
        await state.video.play().catch(() => {});
    }

    async function iniciarMediaPipe() {
        if (state.faceMesh) return;
        if (typeof FaceMesh === 'undefined') throw new Error('MediaPipe no se cargó correctamente.');
        
        const faceMesh = new FaceMesh({ locateFile: (file) => `${CONFIG.MEDIAPIPE_CDN}@${CONFIG.MEDIAPIPE_VERSION}/${file}` });
        faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        faceMesh.onResults((results) => { state.lastResults = results; });
        await faceMesh.initialize();
        state.faceMesh = faceMesh;
    }

    function iniciarLoopDeteccion() {
        const intervalo = 1000 / CONFIG.DETECTION_FPS;
        async function detectar() {
            if (!state.iniciada || !state.faceMesh || !state.video.videoWidth) {
                state.detectionFrameId = requestAnimationFrame(detectar);
                return;
            }
            const ahora = performance.now();
            if (ahora - state.lastDetectionTime >= intervalo) {
                state.lastDetectionTime = ahora;
                try { await state.faceMesh.send({ image: state.video }); } catch (e) { }
            }
            state.detectionFrameId = requestAnimationFrame(detectar);
        }
        state.detectionFrameId = requestAnimationFrame(detectar);
    }

    function iniciarLoopRender() {
        function draw() {
            if (!state.iniciada || !state.stream) return;
            const { video, canvas, ctx } = state;
            if (!video.videoWidth || !video.videoHeight) { state.renderFrameId = requestAnimationFrame(draw); return; }
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            const espejado = state.facingMode === 'user';
            ctx.save();
            if (espejado) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            const landmarks = state.lastResults?.multiFaceLandmarks?.[0];
            if (landmarks) dibujarFiltro(landmarks, canvas, ctx, espejado);
            state.renderFrameId = requestAnimationFrame(draw);
        }
        state.renderFrameId = requestAnimationFrame(draw);
    }

    function dibujarFiltro(landmarks, canvas, ctx, espejado) {
        if (state.filtroActual === 'ninguno') return;
        const assetConfig = ASSETS[state.filtroActual];
        const imagen = state.imagenesCargadas[state.filtroActual];
        if (!assetConfig || !imagen || !imagen.complete) return;

        const w = canvas.width; const h = canvas.height;
        const punto = (i) => { const p = landmarks[i]; return { x: espejado ? (1 - p.x) * w : p.x * w, y: p.y * h }; };

        const ojoA = punto(33); const ojoB = punto(263); const nariz = punto(1); const frente = punto(10);
        const mejillaA = punto(234); const mejillaB = punto(454);

        const [ojoIzq, ojoDer] = ojoA.x <= ojoB.x ? [ojoA, ojoB] : [ojoB, ojoA];
        const [mejillaIzq, mejillaDer] = mejillaA.x <= mejillaB.x ? [mejillaA, mejillaB] : [mejillaB, mejillaA];

        const anchoCara = Math.hypot(mejillaDer.x - mejillaIzq.x, mejillaDer.y - mejillaIzq.y);
        const centroX = (ojoIzq.x + ojoDer.x) / 2;
        const centroY = (ojoIzq.y + ojoDer.y) / 2;
        const angulo = Math.atan2(ojoDer.y - ojoIzq.y, ojoDer.x - ojoIzq.x);

        const tamanoImagen = anchoCara * assetConfig.scale;
        const proporcion = imagen.height / imagen.width;
        const alturaImagen = tamanoImagen * proporcion;

        let anchorX = centroX; let anchorY = centroY;

        if (state.filtroActual === 'gato' || state.filtroActual === 'burro' || state.filtroActual === 'corona') {
            anchorY = frente.y;
        } else if (state.filtroActual === 'bigote') {
            anchorY = nariz.y;
        }

        anchorY += alturaImagen * assetConfig.offsetY;

        ctx.save();
        ctx.translate(anchorX, anchorY);
        ctx.rotate(angulo);
        ctx.drawImage(imagen, -tamanoImagen / 2, -alturaImagen / 2, tamanoImagen, alturaImagen);
        ctx.restore();
    }

    function obtenerFormatoGrabacion() {
        if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
        const candidatos = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
        for (const tipo of candidatos) {
            if (MediaRecorder.isTypeSupported(tipo)) return tipo;
        }
        return '';
    }

    function toggleGrabacion() { if (state.grabando) detenerGrabacion(); else iniciarGrabacion(); }

    function iniciarGrabacion() {
        if (!state.iniciada || state.grabando) return;
        const canvasStream = state.canvas.captureStream(CONFIG.TARGET_FPS);
        const audioTracks = state.stream?.getAudioTracks() || [];
        audioTracks.forEach((track) => canvasStream.addTrack(track));

        const mimeType = obtenerFormatoGrabacion();
        const opciones = mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : {};

        try { state.mediaRecorder = new MediaRecorder(canvasStream, opciones); }
        catch (e) { notificar('Tu navegador no soporta grabación de video.', 'error'); return; }

        state.chunks = [];
        state.mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) state.chunks.push(e.data); };
        state.mediaRecorder.onstop = () => {
            const tipo = mimeType || 'video/webm'; const ext = tipo.includes('mp4') ? 'mp4' : 'webm';
            const blob = new Blob(state.chunks, { type: tipo }); 
            if (blob.size === 0) {
                notificar('Error al grabar el video. Intenta de nuevo.', 'error');
                cerrarCamara();
                return;
            }
            const archivo = new File([blob], `video-camara-${Date.now()}.${ext}`, { type: tipo });
            state.chunks = []; canvasStream.getTracks().forEach((t) => t.stop()); cerrarCamara();
            if (typeof window.csCamaraOnVideoGrabado === 'function') window.csCamaraOnVideoGrabado(archivo);
        };
        
        state.mediaRecorder.start(250); state.grabando = true;
        $('csBtnRecord').classList.add('grabando'); $('csRecIndicator').classList.add('active'); $('csCamaraTimer').classList.add('active');
        iniciarTimer();
    }

    function detenerGrabacion() {
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
        state.grabando = false;
        $('csBtnRecord')?.classList.remove('grabando'); $('csRecIndicator')?.classList.remove('active'); $('csCamaraTimer')?.classList.remove('active');
        detenerTimer();
    }

    function iniciarTimer() {
        state.segundosGrabados = 0; actualizarTimerUI();
        state.timerInterval = setInterval(() => { state.segundosGrabados++; actualizarTimerUI(); if (state.segundosGrabados >= CONFIG.MAX_DURATION_SECONDS) detenerGrabacion(); }, 1000);
    }

    function detenerTimer() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }
    function actualizarTimerUI() { const min = String(Math.floor(state.segundosGrabados / 60)).padStart(2, '0'); const seg = String(state.segundosGrabados % 60).padStart(2, '0'); const t = $('csCamaraTimer'); if (t) t.textContent = `${min}:${seg}`; }

    async function cambiarCamara() {
        if (!state.iniciada || state.grabando) return;
        const anterior = state.facingMode; state.facingMode = anterior === 'user' ? 'environment' : 'user';
        try { mostrarCargando(true); await iniciarStream(); mostrarCargando(false); }
        catch (e) { state.facingMode = anterior; mostrarCargando(false); notificar('No se pudo cambiar la cámara.', 'error'); }
    }

    function onVisibilityChange() { if (document.hidden && state.grabando) detenerGrabacion(); }
    function detenerStream() { if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; } if (state.video) state.video.srcObject = null; }

    function cerrarCamara() {
        detenerTimer(); state.iniciada = false; state.grabando = false; state.lastResults = null;
        if (state.renderFrameId) { cancelAnimationFrame(state.renderFrameId); state.renderFrameId = null; }
        if (state.detectionFrameId) { cancelAnimationFrame(state.detectionFrameId); state.detectionFrameId = null; }
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
        state.mediaRecorder = null; detenerStream();
        if (state.faceMesh) { try { state.faceMesh.close(); } catch (e) { } state.faceMesh = null; }
        mostrarMarquinhos();
        $('csModalCamara')?.classList.remove('show'); mostrarCargando(false);
    }

    function mostrarCargando(v) { const l = $('csCamaraLoading'); if (l) l.classList.toggle('hidden', !v); }
    function notificar(m, t = 'info') { if (typeof window.csToast === 'function') window.csToast(m, t); }
    function obtenerMensajeError(e) {
        const n = e?.name || '';
        if (n === 'NotAllowedError') return 'Debes permitir el acceso a cámara y micrófono.';
        if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No se encontró una cámara.';
        if (n === 'NotReadableError') return 'La cámara está en uso.';
        return e?.message || 'No se pudo iniciar la cámara.';
    }

    window.VideosCamara = { abrirCamara, cerrarCamara, cambiarCamara, setFiltro: (id) => { if (state.filtrosDisponibles.some(f => f.id === id)) { state.filtroActual = id; renderizarFiltros(); } } };

    document.addEventListener('DOMContentLoaded', function() {
        const btnCamara = document.getElementById('btnAbrirCamara');
        if (btnCamara && !btnCamara.dataset.camaraEnganchada) {
            btnCamara.dataset.camaraEnganchada = '1';
            btnCamara.addEventListener('click', (e) => { e.preventDefault(); window.VideosCamara.abrirCamara(); });
        }
    });

})();