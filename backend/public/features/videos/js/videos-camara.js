/* ================================================================
   CSARIEL'S · VIDEOS · CÁMARA Y FILTROS (TikTok Style) v4.8
   ================================================================
   - MediaPipe Face Mesh se carga dinámicamente desde este archivo
     (no hace falta ningún <script> de MediaPipe en videos.html).
   - Si la versión principal falla, prueba una de respaldo.
   - Si MediaPipe no carga, la cámara y la grabación siguen
     funcionando, solo sin filtros.
   - Envíos a Face Mesh secuenciales (MediaPipe no admite dos a la vez).
   - Cerrar la cámara durante una grabación descarta el video.
   - Marquinhos se oculta al abrir la cámara y se restaura al cerrar.
   - v4.7: cada filtro puede tener varias partes con su propia ancla
     (payaso = peluca + nariz; perro = orejas + hocico).
   - v4.8: rutas de PNG ajustadas a los nombres reales de backend/assets
     (orejas-gato-3, orejas-burro-2, gafas-2, bigote-2, corona-2).
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
        VIDEO_BITRATE: 4000000,
        MEDIAPIPE_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        MEDIAPIPE_VERSIONS: ['0.4.1675469240', '0.4.1633559619'],
        SCRIPT_TIMEOUT_MS: 20000
    });

    // Carpeta donde están los PNG de los filtros en el repo
    const ASSETS_BASE = 'https://cdn.jsdelivr.net/gh/josealfredodavila/galleta-domo@main/backend/assets';

    // Cada filtro tiene una lista de "partes". Cada parte se dibuja por separado.
    // scale    = ancho de la parte como múltiplo del ancho de la cara
    // offsetY  = desplazamiento vertical como fracción de la altura de la parte
    //            (negativo = sube, positivo = baja)
    // ancla    = 'frente' (cabeza), 'nariz' (base de la nariz) u 'ojos' (centro de los ojos)
    // aplanar  = (opcional) factor para la altura; 1 = proporción original, 0.4 = aplastado
    const ASSETS = {
        gato: {
            partes: [
                { src: `${ASSETS_BASE}/orejas-gato-3.png`, scale: 1.0, offsetY: -0.4, ancla: 'frente' }
            ]
        },
        burro: {
            partes: [
                { src: `${ASSETS_BASE}/orejas-burro-2.png`, scale: 1.0, offsetY: -0.4, ancla: 'frente' }
            ]
        },
        gafas: {
            partes: [
                { src: `${ASSETS_BASE}/gafas-2.png`, scale: 1.0, offsetY: 0, ancla: 'ojos' }
            ]
        },
        // Thug Life: el lente está en la parte superior de la imagen.
        // offsetY positivo baja la imagen para que los lentes queden sobre los ojos.
        thug: {
            partes: [
                { src: `${ASSETS_BASE}/thug-life-1.png`, scale: 1.1, offsetY: 0.3, ancla: 'ojos' }
            ]
        },
        corazon: {
            partes: [
                { src: `${ASSETS_BASE}/corazon-1.png`, scale: 0.9, offsetY: 0, ancla: 'ojos' }
            ]
        },
        bigote: {
            partes: [
                { src: `${ASSETS_BASE}/bigote-2.png`, scale: 0.45, offsetY: 0.5, ancla: 'nariz' }
            ]
        },
        corona: {
            partes: [
                { src: `${ASSETS_BASE}/corona-2.png`, scale: 0.9, offsetY: -0.5, ancla: 'frente' }
            ]
        },
        diamante: {
            partes: [
                { src: `${ASSETS_BASE}/corona-diamante-1.png`, scale: 0.9, offsetY: -0.5, ancla: 'frente' }
            ]
        },
        // Perro: orejas arriba (sobre las cejas) y hocico sobre la nariz.
        perro: {
            partes: [
                { src: `${ASSETS_BASE}/perro-orejas-1.png`, scale: 1.6, offsetY: -0.30, ancla: 'frente' },
                { src: `${ASSETS_BASE}/perro-hocico-1.png`, scale: 0.6, offsetY: 0.1,   ancla: 'nariz' }
            ]
        },
        diablo: {
            partes: [
                { src: `${ASSETS_BASE}/diablo-1.png`, scale: 1.0, offsetY: -0.6, ancla: 'frente' }
            ]
        },
        angel: {
            partes: [
                { src: `${ASSETS_BASE}/angel-1.png`, scale: 1.0, offsetY: -0.6, ancla: 'frente', aplanar: 0.4 }
            ]
        },
        // Payaso: peluca sobre la frente y nariz roja sobre la nariz real.
        payaso: {
            partes: [
                { src: `${ASSETS_BASE}/payaso-1.png`,       scale: 0.9, offsetY: 0.44,  ancla: 'frente' },
                { src: `${ASSETS_BASE}/payaso-nariz-1.png`, scale: 0.2, offsetY: -0.15, ancla: 'nariz' }
            ]
        },
        charro: {
            partes: [
                { src: `${ASSETS_BASE}/charro-1.png`, scale: 1.2, offsetY: -0.7, ancla: 'frente' }
            ]
        },
        vikingo: {
            partes: [
                { src: `${ASSETS_BASE}/vikingo-1.png`, scale: 1.1, offsetY: -0.3, ancla: 'frente' }
            ]
        },
        leon: {
            partes: [
                { src: `${ASSETS_BASE}/leon-1.png`, scale: 0.95, offsetY: 0, ancla: 'ojos' }
            ]
        },
        mascara: {
            partes: [
                { src: `${ASSETS_BASE}/mascara-lucha-1.png`, scale: 1.0, offsetY: 0, ancla: 'ojos' }
            ]
        },
        alien: {
            partes: [
                { src: `${ASSETS_BASE}/antenas-alien-1.png`, scale: 1.1, offsetY: -0.27, ancla: 'ojos' }
            ]
        }
    };

    const SELECTORES_MARQUINHOS = [
        '#marquinhos', '.marquinhos', '.marquinhos-robot',
        '[class*="marquinhos"]', '[id*="marquinhos"]',
        '[class*="cs-robot"]', '[id*="cs-robot"]'
    ];

    const state = {
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
        imagenes: {},          // clave: URL de la imagen
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

    const $ = (id) => document.getElementById(id);

    // ============================================================
    // UTILIDADES
    // ============================================================
    function notificar(m, t = 'info') {
        if (typeof window.csToast === 'function') window.csToast(m, t);
        else if (typeof window.showToast === 'function') window.showToast(m, t);
        else console.warn('[CSARIELS Cámara]', m);
    }

    function obtenerMensajeError(e) {
        const n = e?.name || '';
        if (n === 'NotAllowedError' || n === 'SecurityError') return 'Debes permitir el acceso a la cámara y al micrófono.';
        if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No se encontró una cámara en este dispositivo.';
        if (n === 'NotReadableError') return 'La cámara está en uso por otra app.';
        return e?.message || 'No se pudo iniciar la cámara.';
    }

    function mostrarCargando(v, texto) {
        const l = $('csCamaraLoading');
        if (!l) return;
        if (texto) l.textContent = texto;
        l.classList.toggle('hidden', !v);
    }

    // ============================================================
    // MEDIAPIPE: CARGA DINÁMICA CON RESPALDO
    // ============================================================
    function cargarScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.crossOrigin = 'anonymous';
            s.async = true;
            const timer = setTimeout(() => {
                s.remove();
                reject(new Error('Tiempo agotado cargando ' + url));
            }, CONFIG.SCRIPT_TIMEOUT_MS);
            s.onload = () => { clearTimeout(timer); resolve(); };
            s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error('No se pudo descargar ' + url)); };
            document.head.appendChild(s);
        });
    }

    // Devuelve la versión que quedó cargada.
    async function cargarMediaPipe() {
        if (typeof window.FaceMesh === 'function') return CONFIG.MEDIAPIPE_VERSIONS[0];
        let ultimoError = null;
        for (const version of CONFIG.MEDIAPIPE_VERSIONS) {
            try {
                await cargarScript(`${CONFIG.MEDIAPIPE_CDN}@${version}/face_mesh.js`);
                if (typeof window.FaceMesh === 'function') return version;
                ultimoError = new Error('El script de MediaPipe ' + version + ' no expuso FaceMesh.');
            } catch (e) {
                ultimoError = e;
            }
        }
        throw ultimoError || new Error('MediaPipe no disponible.');
    }

    async function iniciarFaceMesh() {
        if (state.faceMesh) return true;
        try {
            const version = await cargarMediaPipe();
            const fm = new window.FaceMesh({
                locateFile: (file) => `${CONFIG.MEDIAPIPE_CDN}@${version}/${file}`
            });
            fm.setOptions({
                maxNumFaces: 1,
                refineLandmarks: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            fm.onResults((results) => { state.lastResults = results; });
            await fm.initialize();
            state.faceMesh = fm;
            return true;
        } catch (e) {
            console.error('[CSARIELS Cámara] MediaPipe no disponible, se graba sin filtros:', e);
            return false;
        }
    }

    // ============================================================
    // CÁMARA
    // ============================================================
    async function pedirStream() {
        const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        const intentos = [
            { video: { facingMode: { ideal: state.facingMode }, width: { ideal: CONFIG.VIDEO_WIDTH }, height: { ideal: CONFIG.VIDEO_HEIGHT } }, audio },
            { video: { facingMode: state.facingMode }, audio: true },
            { video: true, audio: true },
            { video: true, audio: false }
        ];
        let ultimo = null;
        for (const constraints of intentos) {
            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (e) {
                ultimo = e;
                if (e.name === 'NotAllowedError' || e.name === 'SecurityError') break;
            }
        }
        throw ultimo || new Error('No se pudo acceder a la cámara.');
    }

    function esperarDimensiones(video) {
        return new Promise((resolve) => {
            if (video.videoWidth) { resolve(); return; }
            const timer = setInterval(() => {
                if (video.videoWidth) { clearInterval(timer); resolve(); }
            }, 50);
            setTimeout(() => { clearInterval(timer); resolve(); }, 4000);
        });
    }

    async function iniciarStream() {
        detenerStream();
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Tu navegador no permite acceder a la cámara.');
        state.stream = await pedirStream();
        state.video.muted = true;
        state.video.srcObject = state.stream;
        await state.video.play().catch(() => {});
        await esperarDimensiones(state.video);
    }

    function detenerStream() {
        if (state.stream) {
            state.stream.getTracks().forEach((t) => t.stop());
            state.stream = null;
        }
        if (state.video) state.video.srcObject = null;
    }

    async function cambiarCamara() {
        if (!state.iniciada || state.grabando) return;
        const anterior = state.facingMode;
        state.facingMode = anterior === 'user' ? 'environment' : 'user';
        try {
            mostrarCargando(true, 'Cambiando cámara…');
            await iniciarStream();
            mostrarCargando(false);
        } catch (e) {
            state.facingMode = anterior;
            mostrarCargando(false);
            notificar('No se pudo cambiar la cámara.', 'error');
        }
    }

    // ============================================================
    // IMÁGENES DE FILTROS
    // ============================================================
    // Recorre todas las partes de todos los filtros y descarga cada PNG una sola vez.
    function precargarImagenes() {
        return new Promise((resolve) => {
            const urls = new Set();
            Object.values(ASSETS).forEach((f) => f.partes.forEach((p) => urls.add(p.src)));
            let pendientes = urls.size;
            if (pendientes === 0) { resolve(); return; }
            const terminar = () => { pendientes--; if (pendientes === 0) resolve(); };
            urls.forEach((url) => {
                if (state.imagenes[url]?.complete && state.imagenes[url].naturalWidth) { terminar(); return; }
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = terminar;
                img.onerror = () => { console.error('[CSARIELS Cámara] Error cargando filtro', url); terminar(); };
                img.src = url;
                state.imagenes[url] = img;
            });
        });
    }

    // ============================================================
    // MARQUINHOS
    // ============================================================
    function ocultarMarquinhos() {
        state.ocultos = [];
        const elementos = new Set();
        SELECTORES_MARQUINHOS.forEach((sel) => {
            try {
                document.querySelectorAll(sel).forEach((el) => {
                    if (el.closest('#csModalCamara')) return;
                    elementos.add(el);
                });
            } catch (e) {}
        });
        elementos.forEach((el) => {
            state.ocultos.push({
                el,
                prev: el.style.getPropertyValue('display'),
                prioridad: el.style.getPropertyPriority('display')
            });
            el.style.setProperty('display', 'none', 'important');
        });
    }

    function restaurarMarquinhos() {
        state.ocultos.forEach(({ el, prev, prioridad }) => {
            try {
                if (prev) el.style.setProperty('display', prev, prioridad);
                else el.style.removeProperty('display');
            } catch (e) {}
        });
        state.ocultos = [];
    }

    // ============================================================
    // MODAL
    // ============================================================
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

        const style = document.createElement('style');
        style.id = 'cs-camara-styles';
        style.textContent = `
            .cs-camara-modal { position: fixed; inset: 0; z-index: 99999; background: #000; display: none; flex-direction: column; color: #fff; font-family: Inter, system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
            .cs-camara-modal.show { display: flex; }
            .cs-camara-header { position: absolute; top: 0; left: 0; right: 0; padding: max(14px, env(safe-area-inset-top)) 18px 14px; display: flex; justify-content: space-between; align-items: center; z-index: 20; background: linear-gradient(to bottom, rgba(0,0,0,.65), transparent); }
            .cs-camara-close, .cs-camara-flip { width: 44px; height: 44px; border-radius: 50%; border: none; color: #fff; font-size: 1.15rem; background: rgba(0,0,0,.45); cursor: pointer; }
            .cs-camara-timer { display: none; font-family: ui-monospace, monospace; font-size: .95rem; padding: 5px 14px; border-radius: 999px; background: rgba(255,51,102,.85); }
            .cs-camara-timer.active { display: block; }
            .cs-camara-viewport { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #000; }
            #csCamaraVideo { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
            #csCamaraCanvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
            .cs-camara-loading { position: absolute; inset: 0; display: grid; place-items: center; font-size: .9rem; background: rgba(0,0,0,.55); z-index: 15; }
            .cs-camara-loading.hidden { display: none; }
            .cs-camara-rec-indicator { position: absolute; top: 90px; left: 50%; transform: translateX(-50%); display: none; padding: 5px 12px; border-radius: 999px; background: rgba(255,51,102,.9); font-size: .7rem; font-weight: 700; z-index: 16; }
            .cs-camara-rec-indicator.active { display: block; animation: csPulseRec 1s infinite alternate; }
            @keyframes csPulseRec { from { opacity: 1; } to { opacity: .35; } }
            .cs-camara-filtros { display: flex; gap: 12px; padding: 16px; overflow-x: auto; scrollbar-width: none; z-index: 20; background: linear-gradient(to top, rgba(0,0,0,.85), transparent); }
            .cs-camara-filtros::-webkit-scrollbar { display: none; }
            .cs-filtro-btn { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: none; color: #fff; font-size: .65rem; cursor: pointer; }
            .cs-filtro-btn .icono { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 1.45rem; background: rgba(255,255,255,.1); border: 2px solid transparent; transition: transform .18s ease, border-color .18s ease, background .18s ease; }
            .cs-filtro-btn.activo .icono { border-color: #D4AF37; background: rgba(212,175,55,.22); transform: scale(1.06); }
            .cs-camara-footer { padding: 18px 0 max(28px, env(safe-area-inset-bottom)); display: flex; justify-content: center; z-index: 20; background: linear-gradient(to top, #000, transparent); }
            .cs-camara-record-btn { width: 78px; height: 78px; border-radius: 50%; border: 4px solid #fff; background: #ff3366; cursor: pointer; transition: all .18s ease; }
            .cs-camara-record-btn.grabando { width: 42px; height: 42px; border-radius: 10px; }
        `;
        document.head.appendChild(style);

        $('csCamaraClose').addEventListener('click', () => cerrarCamara());
        $('csCamaraFlip').addEventListener('click', cambiarCamara);
        $('csBtnRecord').addEventListener('click', toggleGrabacion);
        $('csCamaraFiltros').addEventListener('click', (e) => {
            const btn = e.target.closest('.cs-filtro-btn');
            if (!btn) return;
            state.filtroActual = btn.dataset.filtroId;
            renderizarFiltros();
        });
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
    }

    // ============================================================
    // BUCLES: DETECCIÓN Y RENDER
    // ============================================================
    function iniciarLoopDeteccion() {
        const intervalo = 1000 / CONFIG.DETECTION_FPS;
        const detectar = async () => {
            if (!state.iniciada) return;
            const ahora = performance.now();
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
                } catch (e) {
                    console.warn('[CSARIELS Cámara] Error en detección:', e);
                } finally {
                    state.enviando = false;
                }
            }
            state.detectionFrameId = requestAnimationFrame(detectar);
        };
        state.detectionFrameId = requestAnimationFrame(detectar);
    }

    function iniciarLoopRender() {
        const draw = () => {
            if (!state.iniciada) return;
            const { video, canvas, ctx } = state;
            if (video.readyState >= 2 && video.videoWidth) {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }
                const espejado = state.facingMode === 'user';
                ctx.save();
                if (espejado) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                ctx.restore();

                const lm = state.lastResults?.multiFaceLandmarks?.[0];
                if (lm && lm.length > 454) dibujarFiltro(lm, canvas, ctx, espejado);
            }
            state.renderFrameId = requestAnimationFrame(draw);
        };
        state.renderFrameId = requestAnimationFrame(draw);
    }

    // Dibuja todas las partes del filtro activo.
    function dibujarFiltro(landmarks, canvas, ctx, espejado) {
        const filtro = ASSETS[state.filtroActual];
        if (!filtro) return;

        const w = canvas.width;
        const h = canvas.height;
        const pt = (i) => {
            const p = landmarks[i];
            return { x: espejado ? (1 - p.x) * w : p.x * w, y: p.y * h };
        };

        // Ordenar de izquierda a derecha en pantalla: así el ángulo sale bien en modo espejo.
        const ojoA = pt(33), ojoB = pt(263);
        const [ojoIzq, ojoDer] = ojoA.x <= ojoB.x ? [ojoA, ojoB] : [ojoB, ojoA];
        const mA = pt(234), mB = pt(454);
        const [mIzq, mDer] = mA.x <= mB.x ? [mA, mB] : [mB, mA];

        const anchoCara = Math.hypot(mDer.x - mIzq.x, mDer.y - mIzq.y);
        const angulo = Math.atan2(ojoDer.y - ojoIzq.y, ojoDer.x - ojoIzq.x);
        const centro = { x: (ojoIzq.x + ojoDer.x) / 2, y: (ojoIzq.y + ojoDer.y) / 2 };

        filtro.partes.forEach((parte) => {
            const img = state.imagenes[parte.src];
            if (!img || !img.complete || !img.naturalWidth) return;

            const ancho = anchoCara * parte.scale;
            const alto = ancho * (img.naturalHeight / img.naturalWidth) * (parte.aplanar ?? 1);

            // Punto de anclaje de esta parte
            let ax = centro.x;
            let ay = centro.y;
            if (parte.ancla === 'frente') ay = pt(10).y;    // frente
            else if (parte.ancla === 'nariz') ay = pt(2).y; // base de la nariz
            ay += alto * parte.offsetY;

            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(angulo);
            ctx.drawImage(img, -ancho / 2, -alto / 2, ancho, alto);
            ctx.restore();
        });
    }

    // ============================================================
    // GRABACIÓN
    // ============================================================
    function obtenerFormatoGrabacion() {
        if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
        const candidatos = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4'
        ];
        return candidatos.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    }

    function toggleGrabacion() {
        if (state.grabando) detenerGrabacion();
        else iniciarGrabacion();
    }

    function iniciarGrabacion() {
        if (!state.iniciada || state.grabando) return;
        if (typeof state.canvas.captureStream !== 'function') {
            notificar('Tu navegador no permite grabar desde la cámara.', 'error');
            return;
        }

        const canvasStream = state.canvas.captureStream(CONFIG.TARGET_FPS);
        (state.stream ? state.stream.getAudioTracks() : []).forEach((t) => canvasStream.addTrack(t));

        const mimeType = obtenerFormatoGrabacion();
        let rec;
        try {
            rec = new MediaRecorder(canvasStream, mimeType ? { mimeType, videoBitsPerSecond: CONFIG.VIDEO_BITRATE } : {});
        } catch (e) {
            canvasStream.getTracks().forEach((t) => t.stop());
            notificar('Tu navegador no soporta grabación de video.', 'error');
            return;
        }

        state.mediaRecorder = rec;
        state.chunks = [];
        state.descartar = false;

        rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) state.chunks.push(e.data); };
        rec.onstop = () => {
            const tipo = rec.mimeType || mimeType || 'video/webm';
            const ext = tipo.includes('mp4') ? 'mp4' : 'webm';
            const blob = new Blob(state.chunks, { type: tipo });
            state.chunks = [];
            canvasStream.getTracks().forEach((t) => t.stop());

            if (state.descartar) { liberarRecursos(); return; }
            if (blob.size === 0) {
                notificar('No se pudo grabar el video. Intenta de nuevo.', 'error');
                liberarRecursos();
                return;
            }

            const archivo = new File([blob], `video-camara-${Date.now()}.${ext}`, { type: tipo });
            liberarRecursos();
            if (typeof window.csCamaraOnVideoGrabado === 'function') window.csCamaraOnVideoGrabado(archivo);
        };

        rec.start(250);
        state.grabando = true;
        $('csBtnRecord')?.classList.add('grabando');
        $('csRecIndicator')?.classList.add('active');
        $('csCamaraTimer')?.classList.add('active');
        iniciarTimer();
    }

    function detenerGrabacion() {
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
        }
        state.grabando = false;
        $('csBtnRecord')?.classList.remove('grabando');
        $('csRecIndicator')?.classList.remove('active');
        $('csCamaraTimer')?.classList.remove('active');
        detenerTimer();
    }

    function iniciarTimer() {
        state.segundosGrabados = 0;
        actualizarTimerUI();
        state.timerInterval = setInterval(() => {
            state.segundosGrabados++;
            actualizarTimerUI();
            if (state.segundosGrabados >= CONFIG.MAX_DURATION_SECONDS) detenerGrabacion();
        }, 1000);
    }

    function detenerTimer() {
        if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    }

    function actualizarTimerUI() {
        const min = String(Math.floor(state.segundosGrabados / 60)).padStart(2, '0');
        const seg = String(state.segundosGrabados % 60).padStart(2, '0');
        const t = $('csCamaraTimer');
        if (t) t.textContent = `${min}:${seg}`;
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

            await iniciarStream();
            await precargarImagenes();
            const filtrosListos = await iniciarFaceMesh();
            if (!filtrosListos) notificar('Filtros no disponibles. Puedes grabar sin filtro.', 'warning');

            state.iniciada = true;
            state.lastDetectionTime = 0;
            mostrarCargando(false);
            iniciarLoopRender();
            if (filtrosListos) iniciarLoopDeteccion();
        } catch (error) {
            console.error('[CSARIELS Cámara] Error al iniciar:', error);
            notificar(obtenerMensajeError(error), 'error');
            liberarRecursos();
        } finally {
            state.abriendo = false;
        }
    }

    // Cierra la cámara. Si hay una grabación en curso, se descarta.
    function cerrarCamara() {
        detenerTimer();
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.descartar = true;
            state.grabando = false;
            $('csModalCamara')?.classList.remove('show');
            state.mediaRecorder.stop(); // onstop llama a liberarRecursos()
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

        if (state.renderFrameId) { cancelAnimationFrame(state.renderFrameId); state.renderFrameId = null; }
        if (state.detectionFrameId) { cancelAnimationFrame(state.detectionFrameId); state.detectionFrameId = null; }
        detenerStream();
        detenerTimer();

        $('csBtnRecord')?.classList.remove('grabando');
        $('csRecIndicator')?.classList.remove('active');
        $('csCamaraTimer')?.classList.remove('active');
        $('csModalCamara')?.classList.remove('show');
        mostrarCargando(false);
        restaurarMarquinhos();
    }

    // ============================================================
    // API PÚBLICA
    // ============================================================
    window.VideosCamara = {
        abrirCamara,
        cerrarCamara,
        cambiarCamara,
        setFiltro: (id) => {
            if (ASSETS[id] || id === 'ninguno') {
                state.filtroActual = id;
                renderizarFiltros();
            }
        }
    };

    // Engancha el botón de videos.html (solo una vez).
    document.addEventListener('DOMContentLoaded', function () {
        const btnCamara = document.getElementById('btnAbrirCamara');
        if (btnCamara && !btnCamara.dataset.camaraEnganchada) {
            btnCamara.dataset.camaraEnganchada = '1';
            btnCamara.addEventListener('click', (e) => {
                e.preventDefault();
                window.VideosCamara.abrirCamara();
            });
        }
    });

})();
