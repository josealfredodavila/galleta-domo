/* ================================================================
   CSARIEL'S · VIDEOS · MÓDULO PUBLICAR v3.0
   ================================================================
   Cambios respecto a v2.9:
   - Quitar video seleccionado antes de publicar (botón ✕ sobre el
     video y botón "Quitar video"). Conserva título, descripción,
     sonido y ubicación.
   - Feed: se ocultan reacciones (corazón) y compartir según FEED_UI.
   - Feed: botón de pausa/reproducir en la barra lateral de cada video.
   - La lógica de borradores, persistencia, vista previa y API no cambia.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosPublicarLoaded) return;
    window.__csarielsVideosPublicarLoaded = true;

    const Z = { CAMARA: 99999, SHEET_BACKDROP: 100000, SHEET: 100001, PREVIEW: 100030, CONFIRM: 100010, TOAST: 100020 };

    // Controles del feed. Pon true para volver a mostrar cada botón.
    const FEED_UI = {
        ocultarLikes: true,
        ocultarCompartir: true,
        ocultarReacciones: true
    };

    const EQ_COLORES = ['#ff2bd6', '#ff3d7f', '#00f0ff', '#39ff14', '#ffe600', '#b026ff'];

    const IDB_NAME = 'csVideosPublicar';
    const IDB_STORE = 'kv';
    const KEY_META = 'meta';
    const KEY_FILE = 'file';

    const ICONO_PAUSA = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    const ICONO_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><polygon points="7 5 19 12 7 19 7 5"/></svg>';

    function vt(clave, respaldo) {
        if (typeof window.tConFallback === 'function') return window.tConFallback(clave, respaldo);
        return respaldo !== undefined ? respaldo : clave;
    }

    const CONFIG = {
        PROVIDER: 'supabase',
        BUCKET: 'videos',
        CARPETA_BORRADORES: 'borradores',
        MAX_VIDEO_MB: 100,
        MAX_VIDEO_MB_R2: 500,
        VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
        IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
        PORTADA_TIMEOUT_MS: 4000,
        BARRAS_EQ: EQ_COLORES.length,
        MAX_BORRADORES_LISTA: 50
    };

    const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
    const SUPABASE_STORAGE_URL = SUPABASE_URL + '/storage/v1/object/public/audios';

    const SONIDOS_SEED = {
        parati: [
            { id: 'sd-phonk', nombre: 'Phonk Bass Drop', artista: 'Echoes of Lumen', url: `${SUPABASE_STORAGE_URL}/echoes_of_lumen-phonk-bass-neon-aura-night-drive-588671.mp3`, duracion: 128 },
            { id: 'sd-suspenso', nombre: 'Suspenso Épico', artista: 'Absolute Sound', url: `${SUPABASE_STORAGE_URL}/absolutesound-suspense-tense-atmosphere-514617.mp3`, duracion: 137 },
            { id: 'sd-comedia', nombre: 'Risa y Caos', artista: 'Alex Morgan', url: `${SUPABASE_STORAGE_URL}/alex-morgan-comedy-bgm-funny-background-music-583242.mp3`, duracion: 62 },
            { id: 'sd-n1', nombre: 'Brazilian Phonk', artista: 'Sub Clair', url: `${SUPABASE_STORAGE_URL}/sub_clair-brazilian-phonk-instrumental-585588.mp3`, duracion: 120 },
            { id: 'sd-n2', nombre: 'Sosin Phonk Music', artista: 'Sosin', url: `${SUPABASE_STORAGE_URL}/sosin-phonk-phonk-music-621003.mp3`, duracion: 110 },
            { id: 'sd-n3', nombre: 'Phonk No Copyright', artista: 'ARP Media', url: `${SUPABASE_STORAGE_URL}/arpmedia-phonk-no-copyright-music-588451.mp3`, duracion: 95 },
            { id: 'sd-n4', nombre: 'Gym Workout', artista: 'Echoes of Lumen', url: `${SUPABASE_STORAGE_URL}/echoes_of_lumen-sport-phonk-gym-workout-586978.mp3`, duracion: 105 }
        ],
        populares: [
            { id: 'sd-trend1', nombre: 'Aesthetic Vibes', artista: 'Adrihuwu', url: `${SUPABASE_STORAGE_URL}/adrihuwu-adrihuwu-join-my-server-209103.mp3`, duracion: 134 },
            { id: 'sd-trend2', nombre: 'Corrido Bélico (Trap)', artista: 'LN Plus Music', url: `${SUPABASE_STORAGE_URL}/lnplusmusic-cuban-latin-trap-beat-469610.mp3`, duracion: 127 },
            { id: 'sd-reward', nombre: 'Gancho de Éxito', artista: 'Freesound Community', url: `${SUPABASE_STORAGE_URL}/freesound_community-victoria_claudia_baja_fidelidad_almacen_exito_cali-79564.mp3`, duracion: 55 },
            { id: 'sd-n5', nombre: 'Dark Aggressive Bass', artista: 'Watermelon Beats', url: `${SUPABASE_STORAGE_URL}/watermelon_beats-phonk-drift-dark-aggressive-bass-612474.mp3`, duracion: 140 },
            { id: 'sd-n6', nombre: 'House Phonk', artista: 'Alex Zavesa', url: `${SUPABASE_STORAGE_URL}/alexzavesa-house-phonk-short-version-613118.mp3`, duracion: 85 },
            { id: 'sd-n7', nombre: 'Phonk Instrumental', artista: 'Sub Clair', url: `${SUPABASE_STORAGE_URL}/sub_clair-phonk-instrumental-610091.mp3`, duracion: 115 },
            { id: 'sd-n8', nombre: 'Ultrakill', artista: 'Cloud System', url: `${SUPABASE_STORAGE_URL}/cloudsystem-ultrakill-46s-621400.mp3`, duracion: 46 }
        ],
        favoritos: []
    };

    const UBICACIONES_SEED = [
        { id: 'pue-capital',  nombre: 'Puebla Capital',      pais: 'México', lat: 19.0414,  lng: -98.2063 },
        { id: 'pue-cholula',  nombre: 'Cholula',             pais: 'México', lat: 19.0621,  lng: -98.3053 },
        { id: 'pue-atlixco',  nombre: 'Atlixco',             pais: 'México', lat: 18.9083,  lng: -98.4367 },
        { id: 'pue-tehuacan', nombre: 'Tehuacán',            pais: 'México', lat: 18.4611,  lng: -97.3928 },
        { id: 'pue-izucar',   nombre: 'Izúcar de Matamoros', pais: 'México', lat: 18.6017,  lng: -98.4646 },
        { id: 'cdmx-centro',  nombre: 'CDMX · Centro',       pais: 'México', lat: 19.4326,  lng: -99.1332 },
        { id: 'gdl-centro',   nombre: 'Guadalajara',         pais: 'México', lat: 20.6597,  lng: -103.3496 },
        { id: 'mty-centro',   nombre: 'Monterrey',           pais: 'México', lat: 25.6866,  lng: -100.3161 },
        { id: 'cancun',       nombre: 'Cancún',              pais: 'México', lat: 21.1619,  lng: -86.8515 },
        { id: 'veracruz',     nombre: 'Veracruz',            pais: 'México', lat: 19.1738,  lng: -96.1342 },
        { id: 'oaxaca',       nombre: 'Oaxaca de Juárez',    pais: 'México', lat: 17.0732,  lng: -96.7266 },
        { id: 'queretaro',    nombre: 'Querétaro',           pais: 'México', lat: 20.5888,  lng: -100.3899 }
    ];

    const state = {
        sonidoSeleccionado: null,
        ubicacionSeleccionada: null,
        archivoVideo: null,
        archivoConAudioMezclado: false,
        previewURL: null,
        portadaURL: null,
        portadaBlob: null,
        tabSonidosActiva: 'parati',
        sbCliente: null,
        borradorEditandoId: null,
        guardandoBorrador: false,
        archivoPathRemoto: null,
        portadaPathRemoto: null,
        borradorPaths: null
    };

    let pistaPreviewAudio = null;

    function $(id) { return document.getElementById(id); }
    function esc(v) {
        const d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }
    function log(...args) { console.log('[VideosPublicar]', ...args); }
    function warn(...args) { console.warn('[VideosPublicar]', ...args); }

    function getSupabaseClient() {
        if (state.sbCliente) return state.sbCliente;
        try {
            if (window.sbVideos && typeof window.sbVideos.from === 'function') {
                state.sbCliente = window.sbVideos;
                return state.sbCliente;
            }
            if (window.supabaseClient) {
                state.sbCliente = window.supabaseClient;
                return state.sbCliente;
            }
        } catch (e) {}
        return null;
    }

    async function obtenerSesion() {
        const sb = getSupabaseClient();
        if (!sb) return null;
        const r = await sb.auth.getSession();
        return (r && r.data && r.data.session) || null;
    }

    function csToast(mensaje, tipo, duracion) {
        const t = document.createElement('div');
        t.className = 'cs-toast cs-toast-' + (tipo || 'info');
        const iconos = { info: '◈', success: '✓', warning: '⚠', error: '✕' };
        t.innerHTML = `<span class="cs-toast-ico">${iconos[tipo] || iconos.info}</span><span class="cs-toast-txt">${esc(mensaje)}</span>`;
        t.style.setProperty('z-index', String(Z.TOAST), 'important');
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 400);
        }, duracion || 3200);
    }

    function csConfirm(opts) {
        return new Promise((resolve) => {
            const o = opts || {};
            const overlay = document.createElement('div');
            overlay.className = 'cs-confirm-overlay';
            overlay.style.setProperty('z-index', String(Z.CONFIRM), 'important');
            overlay.innerHTML = `
                <div class="cs-confirm-modal" role="dialog" aria-modal="true">
                    <div class="cs-confirm-ico">${o.peligroso ? '⚠' : '◈'}</div>
                    <div class="cs-confirm-titulo">${esc(o.titulo || 'Confirmar')}</div>
                    <div class="cs-confirm-mensaje">${esc(o.mensaje || '')}</div>
                    <div class="cs-confirm-acciones">
                        <button type="button" class="cs-confirm-btn cs-confirm-cancel" data-res="0">${esc(o.textoCancelar || vt('cfg_cancelar', 'Cancelar'))}</button>
                        <button type="button" class="cs-confirm-btn ${o.peligroso ? 'cs-confirm-danger' : 'cs-confirm-ok'}" data-res="1">${esc(o.textoOk || 'Aceptar')}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('show'));
            function cerrar(res) {
                overlay.classList.remove('show');
                setTimeout(() => overlay.remove(), 250);
                document.removeEventListener('keydown', onKey);
                resolve(res);
            }
            function onKey(e) { if (e.key === 'Escape') cerrar(false); }
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) return cerrar(false);
                const btn = e.target.closest('[data-res]');
                if (!btn) return;
                cerrar(btn.dataset.res === '1');
            });
            document.addEventListener('keydown', onKey);
        });
    }

    window.csToast = csToast;
    window.csConfirm = csConfirm;

    // ============================================================
    // PERSISTENCIA LOCAL · IndexedDB (sobrevive a recargas)
    // ============================================================
    function abrirIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbSet(clave, valor) {
        const db = await abrirIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(valor, clave);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    }

    async function idbGet(clave) {
        const db = await abrirIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(clave);
            req.onsuccess = () => { db.close(); resolve(req.result || null); };
            req.onerror = () => { db.close(); reject(req.error); };
        });
    }

    async function idbDel(clave) {
        const db = await abrirIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(clave);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    }

    let _persistMetaTimer = null;
    function persistirMetaDebounced() {
        clearTimeout(_persistMetaTimer);
        _persistMetaTimer = setTimeout(persistirMeta, 400);
    }

    async function persistirMeta() {
        try {
            const titulo = ($('inputTituloVideo') || {}).value || '';
            const descripcion = ($('inputDescripcionVideo') || {}).value || '';
            const hayAlgo = state.archivoVideo || titulo.trim() || descripcion.trim() ||
                state.sonidoSeleccionado || state.ubicacionSeleccionada;
            if (!hayAlgo) {
                await idbDel(KEY_META);
                return;
            }
            await idbSet(KEY_META, {
                titulo,
                descripcion,
                sonidoId: state.sonidoSeleccionado ? state.sonidoSeleccionado.id : null,
                ubicacionId: state.ubicacionSeleccionada ? state.ubicacionSeleccionada.id : null,
                borradorId: state.borradorEditandoId,
                archivoPathRemoto: state.archivoPathRemoto,
                portadaPathRemoto: state.portadaPathRemoto,
                ts: Date.now()
            });
        } catch (e) { warn('No se pudo guardar el progreso local:', e); }
    }

    async function persistirArchivo() {
        try {
            if (state.archivoVideo) await idbSet(KEY_FILE, state.archivoVideo);
            else await idbDel(KEY_FILE);
        } catch (e) { warn('No se pudo guardar el video local:', e); }
    }

    async function limpiarPersistencia() {
        try {
            await idbDel(KEY_META);
            await idbDel(KEY_FILE);
        } catch (e) { warn('No se pudo limpiar la persistencia local:', e); }
    }

    function ponerArchivoEnInput(file) {
        const input = $('inputArchivoVideo');
        if (!input) return;
        try {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        } catch (e) { /* algunos navegadores no permiten asignar files; no es crítico */ }
    }

    function actualizarTextoBotonArchivo(file) {
        const txt = $('csFileBtnTxt');
        const hint = $('csFileBtnHint');
        const btnWrap = document.querySelector('.cs-file-btn-wrap');
        if (file) {
            if (txt) { txt.removeAttribute('data-clave'); txt.textContent = 'Video seleccionado'; }
            if (hint) { hint.removeAttribute('data-clave'); hint.textContent = 'Listo para subir'; }
            if (btnWrap) btnWrap.classList.add('cs-file-con-archivo');
            const pWrap = $('csPreviewWrap');
            if (pWrap) pWrap.style.display = 'block';
        } else {
            if (txt) { txt.setAttribute('data-clave', 'videos_elegir_galeria'); txt.textContent = vt('videos_elegir_galeria', 'Elegir video de la galería'); }
            if (hint) { hint.setAttribute('data-clave', 'videos_archivo_hint'); hint.textContent = vt('videos_archivo_hint', 'MP4 · WebM · MOV · Máx 100 MB'); }
            if (btnWrap) btnWrap.classList.remove('cs-file-con-archivo');
        }
    }

    async function restaurarLocal() {
        try {
            const meta = await idbGet(KEY_META);
            const file = await idbGet(KEY_FILE);
            if (!meta && !file) return;

            if (meta) {
                const titulo = $('inputTituloVideo');
                const desc = $('inputDescripcionVideo');
                if (titulo) titulo.value = meta.titulo || '';
                if (desc) desc.value = meta.descripcion || '';
                state.borradorEditandoId = meta.borradorId || null;
                state.archivoPathRemoto = meta.archivoPathRemoto || null;
                state.portadaPathRemoto = meta.portadaPathRemoto || null;
                state.borradorPaths = { archivo: state.archivoPathRemoto, portada: state.portadaPathRemoto };
                if (meta.sonidoId) {
                    const s = buscarSonidoPorId(meta.sonidoId);
                    if (s) seleccionarSonidoSinSonar(s);
                }
                if (meta.ubicacionId) {
                    const u = UBICACIONES_SEED.find(x => x.id === meta.ubicacionId);
                    if (u) state.ubicacionSeleccionada = u;
                }
            }

            if (file instanceof Blob) {
                const archivo = file instanceof File
                    ? file
                    : new File([file], 'video-recuperado-' + Date.now() + '.webm', { type: file.type || 'video/webm' });
                state.archivoVideo = archivo;
                ponerArchivoEnInput(archivo);
                mostrarPreviewVideo(archivo);
                actualizarTextoBotonArchivo(archivo);
            }

            actualizarResumenPreview();
            actualizarBotonesSonidoUbicacion();
            csToast('Recuperamos tu video en curso', 'info', 3000);
            log('Progreso local restaurado');
        } catch (e) {
            warn('No se pudo restaurar el progreso local:', e);
        }
    }

    // ============================================================
    // ANALIZADOR PARA EL ECUALIZADOR (Web Audio API)
    // ============================================================
    const Visualizador = (function () {
        let ctx = null;
        let analyser = null;
        let fuente = null;
        let datos = null;
        let rafId = null;
        let activo = false;

        function asegurarContexto(elemento) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return false;
            try {
                if (!ctx) ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                if (!analyser) {
                    analyser = ctx.createAnalyser();
                    analyser.fftSize = 64;
                    analyser.smoothingTimeConstant = 0.72;
                    analyser.connect(ctx.destination);
                    datos = new Uint8Array(analyser.frequencyBinCount);
                }
                if (fuente) { try { fuente.disconnect(); } catch (e) {} fuente = null; }
                fuente = ctx.createMediaElementSource(elemento);
                fuente.connect(analyser);
                return true;
            } catch (e) {
                return false;
            }
        }

        function pintarBarras(barras) {
            if (!analyser || !datos) return;
            analyser.getByteFrequencyData(datos);
            const paso = Math.floor(datos.length / barras.length) || 1;
            barras.forEach((barra, i) => {
                const valor = datos[i * paso] || 0;
                const energia = valor / 255;
                const altura = 4 + energia * 22;
                barra.style.height = altura + 'px';
                barra.style.opacity = String(0.55 + energia * 0.45);
                barra.style.filter = `brightness(${1 + energia * 0.6})`;
            });
        }

        function iniciar(elementoEq, elementoAudio) {
            detener();
            const barras = elementoEq ? Array.from(elementoEq.querySelectorAll('.cs-eq-bar')) : [];
            const conAnalizador = elementoAudio ? asegurarContexto(elementoAudio) : false;
            activo = true;
            function bucle() {
                if (!activo) return;
                if (conAnalizador && barras.length) pintarBarras(barras);
                rafId = requestAnimationFrame(bucle);
            }
            bucle();
        }

        function detener() {
            activo = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            if (fuente) { try { fuente.disconnect(); } catch (e) {} fuente = null; }
        }

        return { iniciar, detener };
    })();

    // ============================================================
    // MOTOR DE PREVIEW DE PISTAS (selector)
    // ============================================================
    const AudioPreview = (function () {
        let audio = null;
        let timerId = null;
        let generation = 0;
        let pistaActual = null;
        let estado = 'idle';
        const DURACION_PREVIEW_MS = 5000;

        function limpiar() {
            if (timerId !== null) { clearTimeout(timerId); timerId = null; }
            Visualizador.detener();
            if (audio) {
                try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
                audio.onerror = null;
                audio.oncanplay = null;
                audio = null;
            }
            estado = 'idle';
        }

        function detener() {
            generation++;
            limpiar();
            pistaActual = null;
        }

        async function reproducir(pista, onEstado) {
            generation++;
            const miGeneracion = generation;
            limpiar();
            pistaActual = pista;
            estado = 'loading';
            if (onEstado) onEstado('loading', pista);

            if (!pista || !pista.url) {
                estado = 'error';
                if (onEstado) onEstado('error', pista, 'URL vacía');
                return { ok: false, error: 'URL vacía' };
            }

            const nuevoAudio = new Audio();
            nuevoAudio.preload = 'auto';
            nuevoAudio.volume = 0.8;
            nuevoAudio.crossOrigin = 'anonymous';
            audio = nuevoAudio;

            const esperaDatos = new Promise((resolve, reject) => {
                let resuelto = false;
                const timeout = setTimeout(() => {
                    if (!resuelto) { resuelto = true; reject(new Error('timeout')); }
                }, 10000);
                nuevoAudio.oncanplay = () => {
                    if (!resuelto) { resuelto = true; clearTimeout(timeout); resolve(); }
                };
                nuevoAudio.onerror = () => {
                    if (!resuelto) {
                        resuelto = true;
                        clearTimeout(timeout);
                        const code = nuevoAudio.error ? nuevoAudio.error.code : 0;
                        reject(new Error('media_error_' + code));
                    }
                };
                nuevoAudio.src = pista.url;
                nuevoAudio.load();
            });

            try {
                await esperaDatos;
            } catch (e) {
                if (miGeneracion !== generation) return { ok: false, cancelado: true };
                limpiar();
                estado = 'error';
                if (onEstado) onEstado('error', pista, e.message);
                return { ok: false, error: e.message };
            }

            if (miGeneracion !== generation) {
                try { nuevoAudio.pause(); } catch (e) {}
                return { ok: false, cancelado: true };
            }

            try {
                await nuevoAudio.play();
            } catch (e) {
                if (miGeneracion !== generation) return { ok: false, cancelado: true };
                if (e.name === 'AbortError') return { ok: false, cancelado: true };
                limpiar();
                estado = 'error';
                if (onEstado) onEstado('error', pista, e.name || 'play_error');
                return { ok: false, error: e.name };
            }

            if (miGeneracion !== generation) {
                try { nuevoAudio.pause(); } catch (e) {}
                return { ok: false, cancelado: true };
            }

            estado = 'playing';
            if (onEstado) onEstado('playing', pista);

            Visualizador.iniciar(document.querySelector(`.cs-sonido-item[data-sonido-id="${pista.id}"] .cs-eq`), nuevoAudio);

            timerId = setTimeout(() => {
                if (miGeneracion !== generation) return;
                if (audio === nuevoAudio) {
                    try { nuevoAudio.pause(); } catch (e) {}
                    estado = 'paused';
                    Visualizador.detener();
                    if (onEstado) onEstado('paused', pista);
                }
                timerId = null;
            }, DURACION_PREVIEW_MS);

            return { ok: true, generacion: miGeneracion };
        }

        function pausar() {
            if (audio && estado === 'playing') {
                try { audio.pause(); } catch (e) {}
                estado = 'paused';
                Visualizador.detener();
                if (window._audioPreviewOnEstado) window._audioPreviewOnEstado('paused', pistaActual);
            }
        }

        function reanudar() {
            if (audio && estado === 'paused' && pistaActual) {
                audio.play().then(() => {
                    estado = 'playing';
                    Visualizador.iniciar(document.querySelector(`.cs-sonido-item[data-sonido-id="${pistaActual.id}"] .cs-eq`), audio);
                    if (window._audioPreviewOnEstado) window._audioPreviewOnEstado('playing', pistaActual);
                }).catch(() => {});
            }
        }

        function getEstado() { return { estado, pista: pistaActual }; }

        return { reproducir, detener, pausar, reanudar, getEstado };
    })();

    // ============================================================
    // SUBIDA DE ARCHIVOS (flujo de publicación con moderación)
    // ============================================================
    async function subirMultimedia(archivo, tipo, opciones) {
        const opts = opciones || {};
        if (!archivo) return { ok: false, error: 'Archivo vacío' };
        if (tipo === 'video' && CONFIG.VIDEO_TYPES.indexOf(archivo.type) === -1) {
            return { ok: false, error: 'Formato de video no soportado' };
        }
        if (tipo === 'imagen' && CONFIG.IMAGE_TYPES.indexOf(archivo.type) === -1) {
            return { ok: false, error: 'Formato de imagen no soportado' };
        }
        const limiteMB = CONFIG.PROVIDER === 'supabase' ? CONFIG.MAX_VIDEO_MB : CONFIG.MAX_VIDEO_MB_R2;
        if (tipo === 'video' && archivo.size > limiteMB * 1024 * 1024) {
            return { ok: false, error: `Archivo supera ${limiteMB} MB` };
        }
        try {
            if (CONFIG.PROVIDER === 'supabase') return await subirMultimediaSupabase(archivo, tipo, opts);
            if (CONFIG.PROVIDER === 'r2') return await subirMultimediaR2();
            if (CONFIG.PROVIDER === 's3') return await subirMultimediaS3();
            return { ok: false, error: 'Provider desconocido' };
        } catch (e) {
            warn('Error subiendo:', e);
            return { ok: false, error: e.message || String(e) };
        }
    }

    async function subirMultimediaSupabase(archivo, tipo) {
        const session = await obtenerSesion();
        if (!session) return { ok: false, error: 'Sin sesión activa' };
        const token = session.access_token;
        if (!token) return { ok: false, error: 'Sin token de sesión' };

        const fd = new FormData();
        fd.append('file', archivo);
        fd.append('destino', CONFIG.BUCKET);
        fd.append('tipo', tipo);

        let respuesta;
        try {
            respuesta = await fetch('/api/media/upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: fd
            });
        } catch (e) {
            warn('Error de red subiendo archivo:', e);
            return { ok: false, error: 'No se pudo conectar con el servidor' };
        }

        let data = null;
        try { data = await respuesta.json(); } catch (e) { data = {}; }

        if (!respuesta.ok || !data.ok) {
            // Cuota de almacenamiento agotada: el servidor envía un mensaje legible.
            // No disparamos csToast aquí: el llamador (pantalla de publicación) es
            // quien muestra el aviso, igual que con el resto de errores de subida.
            if (data && data.error === 'cuota_excedida') {
                const mensaje = data.mensaje || 'Llegaste al límite de tu espacio de almacenamiento.';
                return {
                    ok: false,
                    error: mensaje,
                    cuotaExcedida: true,
                    status: respuesta.status,
                    cuota: {
                        plan: data.plan,
                        limite_mb: data.limite_mb,
                        usado_mb: data.usado_mb,
                        disponible_mb: data.disponible_mb
                    }
                };
            }
            const mensaje = data && data.error ? data.error : 'No se pudo subir el archivo';
            return { ok: false, error: mensaje, status: respuesta.status };
        }
        return { ok: true, url: data.url, path: data.path, provider: 'supabase' };
    }

    async function subirMultimediaR2() {
        return { ok: false, error: 'Proveedor R2 aún no habilitado (Fase 3 del proyecto)' };
    }
    async function subirMultimediaS3() {
        return { ok: false, error: 'Proveedor S3 aún no habilitado (Fase 3 del proyecto)' };
    }

    // ============================================================
    // BORRADORES · STORAGE DIRECTO EN EL BUCKET "videos"
    // ============================================================
    function rutaBorrador(usuarioId, nombre) {
        const limpio = String(nombre || 'archivo').replace(/[^\w.\-]/g, '_');
        return `${CONFIG.CARPETA_BORRADORES}/${usuarioId}/${Date.now()}-${limpio}`;
    }

    async function subirBorradorArchivo(path, blob, contentType) {
        const sb = getSupabaseClient();
        const { error } = await sb.storage.from(CONFIG.BUCKET).upload(path, blob, {
            contentType: contentType || 'application/octet-stream',
            upsert: false
        });
        if (error) throw new Error(error.message || 'No se pudo subir el archivo del borrador');
        return path;
    }

    async function borrarBorradorArchivos(paths) {
        const validos = (paths || []).filter(Boolean);
        if (!validos.length) return;
        const sb = getSupabaseClient();
        try { await sb.storage.from(CONFIG.BUCKET).remove(validos); }
        catch (e) { warn('No se pudieron borrar archivos del borrador:', e); }
    }

    function urlPublicaBorrador(path) {
        if (!path) return null;
        return `${SUPABASE_URL}/storage/v1/object/public/${CONFIG.BUCKET}/${path}`;
    }

    function blobDePortadaActual() {
        return state.portadaBlob || null;
    }

    async function descargarArchivoBorrador(path, nombre) {
        const url = urlPublicaBorrador(path);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('No se pudo descargar el video del borrador');
        const blob = await resp.blob();
        const tipo = blob.type || 'video/webm';
        return new File([blob], nombre || ('borrador-' + Date.now() + '.webm'), { type: tipo });
    }

    async function listarBorradores() {
        const sb = getSupabaseClient();
        const session = await obtenerSesion();
        if (!sb || !session) return { ok: false, error: 'Inicia sesión para ver tus borradores', items: [] };
        const { data, error } = await sb
            .from('videos_borradores')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('updated_at', { ascending: false })
            .limit(CONFIG.MAX_BORRADORES_LISTA);
        if (error) return { ok: false, error: error.message || 'No se pudieron cargar los borradores', items: [] };
        return { ok: true, items: data || [] };
    }

    function resetEstadoBorrador() {
        state.borradorEditandoId = null;
        state.archivoPathRemoto = null;
        state.portadaPathRemoto = null;
        state.borradorPaths = null;
    }

    async function guardarBorrador() {
        if (state.guardandoBorrador) return;
        const session = await obtenerSesion();
        if (!session) { csToast('Inicia sesión para guardar borradores', 'error'); return; }
        const sb = getSupabaseClient();
        if (!sb) { csToast('Cliente Supabase no disponible', 'error'); return; }

        const titulo = (($('inputTituloVideo') || {}).value || '').trim();
        const descripcion = (($('inputDescripcionVideo') || {}).value || '').trim();
        const archivo = state.archivoVideo;
        const sonido = state.sonidoSeleccionado;
        const ubicacion = state.ubicacionSeleccionada;

        if (!titulo && !archivo && !descripcion && !sonido && !ubicacion) {
            csToast('Escribe algo o elige un video antes de guardar el borrador', 'warning');
            return;
        }

        state.guardandoBorrador = true;
        csToast('Guardando borrador…', 'info', 2000);

        const subidos = [];
        const previos = state.borradorPaths || { archivo: null, portada: null };
        try {
            const usuarioId = session.user.id;

            let archivoPath = state.archivoPathRemoto;
            if (archivo && !archivoPath) {
                archivoPath = await subirBorradorArchivo(rutaBorrador(usuarioId, archivo.name), archivo, archivo.type);
                subidos.push(archivoPath);
            }

            let portadaPath = state.portadaPathRemoto;
            const portada = blobDePortadaActual();
            if (portada && !portadaPath) {
                portadaPath = await subirBorradorArchivo(rutaBorrador(usuarioId, 'portada.jpg'), portada, 'image/jpeg');
                subidos.push(portadaPath);
            }
            if (!portada) portadaPath = null;

            let duracion = null;
            const videoEl = $('csPreviewVideo');
            if (videoEl && isFinite(videoEl.duration) && videoEl.duration > 0) duracion = Math.round(videoEl.duration);

            const fila = {
                usuario_id: usuarioId,
                titulo: titulo || null,
                descripcion: descripcion || null,
                sonido_id: sonido ? sonido.id : null,
                sonido_nombre: sonido ? `${sonido.nombre} — ${sonido.artista}` : null,
                sonido_url: sonido ? sonido.url : null,
                ubicacion_nombre: ubicacion ? `${ubicacion.nombre}, ${ubicacion.pais}` : null,
                archivo_path: archivoPath || null,
                portada_path: portadaPath || null,
                duracion_seg: duracion,
                updated_at: new Date().toISOString()
            };

            let resultado;
            if (state.borradorEditandoId) {
                resultado = await sb.from('videos_borradores')
                    .update(fila)
                    .eq('id', state.borradorEditandoId)
                    .eq('usuario_id', usuarioId)
                    .select()
                    .single();
            } else {
                resultado = await sb.from('videos_borradores').insert(fila).select().single();
            }
            if (resultado.error) throw new Error(resultado.error.message || 'No se pudo guardar el borrador');

            const reemplazados = [];
            if (previos.archivo && previos.archivo !== archivoPath) reemplazados.push(previos.archivo);
            if (previos.portada && previos.portada !== portadaPath) reemplazados.push(previos.portada);
            if (reemplazados.length) await borrarBorradorArchivos(reemplazados);

            state.borradorEditandoId = resultado.data.id;
            state.archivoPathRemoto = archivoPath || null;
            state.portadaPathRemoto = portadaPath || null;
            state.borradorPaths = { archivo: state.archivoPathRemoto, portada: state.portadaPathRemoto };
            persistirMetaDebounced();
            csToast('Borrador guardado', 'success');
        } catch (e) {
            warn('Error guardando borrador:', e);
            await borrarBorradorArchivos(subidos);
            csToast(e.message || 'No se pudo guardar el borrador', 'error', 4000);
        } finally {
            state.guardandoBorrador = false;
        }
    }

    async function renderBorradores() {
        const lista = $('csBorradoresLista');
        if (!lista) return;
        lista.innerHTML = `<div class="cs-vacio"><span class="cs-ico-vacio">◈</span><p>Cargando borradores…</p></div>`;

        const res = await listarBorradores();
        if (!res.ok) {
            lista.innerHTML = `<div class="cs-vacio"><span class="cs-ico-vacio">◈</span><p>${esc(res.error)}</p></div>`;
            return;
        }
        if (res.items.length === 0) {
            lista.innerHTML = `<div class="cs-vacio"><span class="cs-ico-vacio">◈</span><p>Aún no tienes borradores.</p></div>`;
            return;
        }

        lista.innerHTML = res.items.map(b => {
            const portada = b.portada_path ? urlPublicaBorrador(b.portada_path) : '';
            const fecha = b.updated_at ? new Date(b.updated_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            const titulo = b.titulo || 'Sin título';
            const tieneVideo = b.archivo_path ? 'Con video' : 'Solo texto';
            return `
                <div class="cs-borrador-item" data-borrador-id="${esc(b.id)}">
                    <div class="cs-borrador-portada">${portada ? `<img src="${esc(portada)}" alt="" />` : '<span>◈</span>'}</div>
                    <div class="cs-borrador-info">
                        <div class="cs-borrador-titulo">${esc(titulo)}</div>
                        <div class="cs-borrador-meta">${esc(tieneVideo)} · ${esc(fecha)}</div>
                    </div>
                    <div class="cs-borrador-acciones">
                        <button type="button" class="cs-btn-ghost" data-accion="abrir" data-id="${esc(b.id)}">Abrir</button>
                        <button type="button" class="cs-btn-ghost cs-btn-peligro" data-accion="eliminar" data-id="${esc(b.id)}">Eliminar</button>
                    </div>
                </div>`;
        }).join('');

        lista.querySelectorAll('[data-accion]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (btn.dataset.accion === 'abrir') abrirBorrador(id);
                else eliminarBorrador(id);
            });
        });
    }

    async function abrirBorrador(id) {
        const sb = getSupabaseClient();
        const session = await obtenerSesion();
        if (!sb || !session) return;

        const { data, error } = await sb.from('videos_borradores')
            .select('*').eq('id', id).eq('usuario_id', session.user.id).single();
        if (error || !data) { csToast('No se pudo abrir el borrador', 'error'); return; }

        resetEstadoBorrador();
        state.borradorEditandoId = data.id;
        state.archivoPathRemoto = data.archivo_path || null;
        state.portadaPathRemoto = data.portada_path || null;
        state.borradorPaths = { archivo: state.archivoPathRemoto, portada: state.portadaPathRemoto };

        const titulo = $('inputTituloVideo');
        const desc = $('inputDescripcionVideo');
        if (titulo) titulo.value = data.titulo || '';
        if (desc) desc.value = data.descripcion || '';

        if (data.sonido_id) {
            const s = buscarSonidoPorId(data.sonido_id);
            if (s) seleccionarSonidoSinSonar(s);
        } else {
            state.sonidoSeleccionado = null;
        }

        const ubic = data.ubicacion_nombre
            ? UBICACIONES_SEED.find(u => `${u.nombre}, ${u.pais}` === data.ubicacion_nombre) || null
            : null;
        state.ubicacionSeleccionada = ubic;

        if (data.archivo_path) {
            try {
                const archivo = await descargarArchivoBorrador(data.archivo_path, data.archivo_path.split('/').pop());
                state.archivoVideo = archivo;
                state.archivoConAudioMezclado = false;
                window.__csMiniaturaCamara = null;
                ponerArchivoEnInput(archivo);
                mostrarPreviewVideo(archivo);
                actualizarTextoBotonArchivo(archivo);
            } catch (e) {
                warn('No se pudo cargar el video del borrador:', e);
                csToast('El video del borrador no se pudo cargar', 'warning', 4000);
            }
        }

        if (data.portada_path) {
            mostrarPortadaDesdeUrl(urlPublicaBorrador(data.portada_path));
        }

        actualizarResumenPreview();
        actualizarBotonesSonidoUbicacion();
        cerrarTodosLosSheets();
        persistirMetaDebounced();
        persistirArchivo();
        csToast('Borrador cargado. Puedes editarlo y publicarlo.', 'success', 3500);
    }

    async function eliminarBorrador(id) {
        const ok = await csConfirm({
            titulo: 'Eliminar borrador',
            mensaje: 'Se borrará el borrador y su video. Esta acción no se puede deshacer.',
            textoOk: 'Eliminar',
            peligroso: true
        });
        if (!ok) return;

        const sb = getSupabaseClient();
        const session = await obtenerSesion();
        if (!sb || !session) return;

        const { data } = await sb.from('videos_borradores')
            .select('archivo_path, portada_path').eq('id', id).eq('usuario_id', session.user.id).maybeSingle();

        const { error } = await sb.from('videos_borradores')
            .delete().eq('id', id).eq('usuario_id', session.user.id);
        if (error) { csToast('No se pudo eliminar el borrador', 'error'); return; }

        if (data) await borrarBorradorArchivos([data.archivo_path, data.portada_path]);
        if (state.borradorEditandoId === id) resetEstadoBorrador();
        csToast('Borrador eliminado', 'success');
        renderBorradores();
    }

    function seleccionarSonidoSinSonar(s) {
        state.sonidoSeleccionado = s;
        const info = $('csSonidoActualInfo');
        if (info) { info.removeAttribute('data-clave'); info.textContent = `${s.nombre} — ${s.artista}`; }
        const btn = $('csBtnConfirmarSonido');
        if (btn) btn.disabled = false;
    }

    function actualizarResumenPreview() {
        const s = state.sonidoSeleccionado;
        const u = state.ubicacionSeleccionada;
        const pSon = $('csPreviewSonido');
        const pUb = $('csPreviewUbicacion');
        if (pSon) {
            const txt = pSon.querySelector('.cs-preview-txt');
            if (txt) { txt.removeAttribute('data-clave'); txt.textContent = s ? `${s.nombre} — ${s.artista}` : vt('videos_preview_sin_sonido', 'Sin sonido'); }
        }
        if (pUb) {
            const txt = pUb.querySelector('.cs-preview-txt');
            if (txt) { txt.removeAttribute('data-clave'); txt.textContent = u ? `${u.nombre}, ${u.pais}` : vt('videos_preview_sin_ubicacion', 'Sin ubicación'); }
        }
        actualizarBadgePreview();
    }

    // ============================================================
    // PORTADA / PREVIEW
    // ============================================================
    function obtenerPortada(file) {
        return new Promise((resolve) => {
            const desdeCamara = window.__csMiniaturaCamara;
            if (desdeCamara && file.name.indexOf('video-camara-') === 0) {
                resolve(desdeCamara);
                return;
            }

            const url = URL.createObjectURL(file);
            const v = document.createElement('video');
            v.muted = true;
            v.playsInline = true;
            v.preload = 'auto';
            v.src = url;

            let terminado = false;
            function terminar(blob) {
                if (terminado) return;
                terminado = true;
                try { v.pause(); } catch (e) {}
                v.removeAttribute('src');
                try { v.load(); } catch (e) {}
                URL.revokeObjectURL(url);
                resolve(blob || null);
            }

            const limite = setTimeout(() => terminar(null), CONFIG.PORTADA_TIMEOUT_MS);

            v.addEventListener('loadeddata', () => {
                const destino = (isFinite(v.duration) && v.duration > 0.2) ? 0.1 : 0.001;
                try { v.currentTime = destino; } catch (e) { clearTimeout(limite); terminar(null); }
            });

            v.addEventListener('seeked', () => {
                clearTimeout(limite);
                try {
                    const canvas = document.createElement('canvas');
                    const w = v.videoWidth || 540;
                    const h = v.videoHeight || 960;
                    const escala = Math.min(1, 480 / w);
                    canvas.width = Math.round(w * escala);
                    canvas.height = Math.round(h * escala);
                    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => terminar(blob), 'image/jpeg', 0.85);
                } catch (e) { terminar(null); }
            });

            v.addEventListener('error', () => { clearTimeout(limite); terminar(null); });
        });
    }

    function mostrarPortadaDesdeUrl(url) {
        const img = $('csPreviewPortada');
        if (!img) return;
        img.src = url;
        img.style.display = 'block';
    }

    function mostrarPortadaEnPreview(blob) {
        const img = $('csPreviewPortada');
        if (!img) return;
        if (state.portadaURL) {
            try { URL.revokeObjectURL(state.portadaURL); } catch (e) {}
            state.portadaURL = null;
        }
        state.portadaBlob = blob || null;
        if (blob) {
            state.portadaURL = URL.createObjectURL(blob);
            img.src = state.portadaURL;
            img.style.display = 'block';
        } else {
            img.removeAttribute('src');
            img.style.display = 'none';
        }
    }

    function mostrarPreviewVideo(file) {
        const v = $('csPreviewVideo');
        const wrap = $('csPreviewWrap');
        if (!v) return;

        if (wrap) wrap.style.display = 'block';

        if (state.previewURL) {
            try { URL.revokeObjectURL(state.previewURL); } catch (e) {}
            state.previewURL = null;
        }
        state.previewURL = URL.createObjectURL(file);

        v.src = state.previewURL;
        v.muted = false;
        v.playsInline = true;
        v.controls = true;
        v.preload = 'metadata';
        v.style.display = 'block';
        try { v.load(); } catch (e) {}

        actualizarBotonQuitar(true);
        obtenerPortada(file).then(mostrarPortadaEnPreview);
    }

    // ============================================================
    // QUITAR VIDEO SELECCIONADO (antes de publicar)
    // ============================================================
    function actualizarBotonQuitar(tieneVideo) {
        const tiene = typeof tieneVideo === 'boolean' ? tieneVideo : !!state.archivoVideo;
        const overlay = $('csQuitarVideo');
        const accion = $('csBtnQuitarVideo');
        const bloqueVideo = document.querySelector('#csPreviewWrap .cs-preview-video');
        if (overlay) overlay.style.display = tiene ? 'flex' : 'none';
        if (accion) accion.style.display = tiene ? '' : 'none';
        if (bloqueVideo) bloqueVideo.style.display = tiene ? '' : 'none';
    }

    async function quitarVideoSeleccionado() {
        if (!state.archivoVideo) return;
        const ok = await csConfirm({
            titulo: 'Quitar video',
            mensaje: 'Se quitará el video seleccionado. Tu título, descripción, sonido y ubicación se conservan.',
            textoOk: 'Quitar',
            peligroso: true
        });
        if (!ok) return;

        cerrarPreview();

        state.archivoVideo = null;
        state.archivoConAudioMezclado = false;
        state.archivoPathRemoto = null;
        state.portadaPathRemoto = null;
        window.__csMiniaturaCamara = null;
        window.__csArchivoConAudioMezclado = false;

        const videoEl = $('csPreviewVideo');
        if (videoEl) {
            try { videoEl.pause(); } catch (e) {}
            videoEl.removeAttribute('src');
            try { videoEl.load(); } catch (e) {}
        }
        if (state.previewURL) {
            try { URL.revokeObjectURL(state.previewURL); } catch (e) {}
            state.previewURL = null;
        }
        mostrarPortadaEnPreview(null);

        const input = $('inputArchivoVideo');
        if (input) { try { input.value = ''; } catch (e) {} }

        const wrap = $('csPreviewWrap');
        if (wrap) wrap.style.display = 'block';

        actualizarTextoBotonArchivo(null);
        actualizarBotonQuitar(false);

        await persistirArchivo();
        persistirMetaDebounced();
        csToast('Video quitado', 'success');
    }

    // ============================================================
    // VISTA PREVIA A PANTALLA COMPLETA (antes de publicar)
    // ============================================================
    function inyectarModalPreview() {
        if ($('csModalPreview')) return;
        const d = document.createElement('div');
        d.id = 'csModalPreview';
        d.className = 'cs-prev-modal';
        d.innerHTML = `
            <div class="cs-prev-top">
                <button type="button" class="cs-prev-close" id="csPrevCerrar" aria-label="Cerrar vista previa">✕</button>
                <span class="cs-prev-titulo">Así se verá tu video</span>
                <span class="cs-prev-spacer"></span>
            </div>
            <div class="cs-prev-stage">
                <video id="csPrevVideo" playsinline loop></video>
                <div class="cs-prev-sonido" id="csPrevSonido"></div>
            </div>
            <div class="cs-prev-acciones">
                <button type="button" class="cs-btn-ghost" id="csPrevSeguir">Seguir editando</button>
                <button type="button" class="cs-btn-primary" id="csPrevPublicar">Publicar ahora</button>
            </div>`;
        document.body.appendChild(d);

        $('csPrevCerrar').addEventListener('click', cerrarPreview);
        $('csPrevSeguir').addEventListener('click', cerrarPreview);
        $('csPrevPublicar').addEventListener('click', publicarDesdePreview);

        const v = $('csPrevVideo');
        v.addEventListener('click', () => {
            if (v.paused) v.play().catch(() => {});
            else v.pause();
        });
        v.addEventListener('play', () => {
            if (pistaPreviewAudio) {
                pistaPreviewAudio.currentTime = v.currentTime;
                pistaPreviewAudio.play().catch(() => {});
            }
        });
        v.addEventListener('pause', () => { if (pistaPreviewAudio) pistaPreviewAudio.pause(); });
        v.addEventListener('seeked', () => { if (pistaPreviewAudio) pistaPreviewAudio.currentTime = v.currentTime; });
        v.addEventListener('timeupdate', () => {
            if (pistaPreviewAudio && Math.abs(pistaPreviewAudio.currentTime - v.currentTime) > 0.4) {
                pistaPreviewAudio.currentTime = v.currentTime;
            }
        });
    }

    function detenerPistaPreview() {
        if (pistaPreviewAudio) {
            try { pistaPreviewAudio.pause(); pistaPreviewAudio.removeAttribute('src'); pistaPreviewAudio.load(); } catch (e) {}
            pistaPreviewAudio = null;
        }
    }

    function abrirPreview() {
        if (!state.archivoVideo) {
            csToast('Primero elige o graba un video', 'warning');
            return;
        }
        inyectarModalPreview();
        if (!state.previewURL) mostrarPreviewVideo(state.archivoVideo);

        const v = $('csPrevVideo');
        const modal = $('csModalPreview');
        const etiqueta = $('csPrevSonido');
        const sonido = state.sonidoSeleccionado;

        detenerPistaPreview();
        v.src = state.previewURL;
        v.muted = !!sonido;
        v.currentTime = 0;

        if (sonido && sonido.url) {
            pistaPreviewAudio = new Audio(sonido.url);
            pistaPreviewAudio.preload = 'auto';
            pistaPreviewAudio.crossOrigin = 'anonymous';
            pistaPreviewAudio.volume = 0.9;
            etiqueta.textContent = `♪ ${sonido.nombre} — ${sonido.artista}`;
            etiqueta.style.display = 'block';
        } else {
            etiqueta.style.display = 'none';
        }

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        v.play().catch(() => {});
    }

    function cerrarPreview() {
        const modal = $('csModalPreview');
        const v = $('csPrevVideo');
        if (v) { try { v.pause(); } catch (e) {} }
        detenerPistaPreview();
        if (modal) modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    function encontrarBotonPublicar() {
        const sec = $('uploadSection');
        if (!sec) return null;
        const candidatos = Array.from(sec.querySelectorAll('button')).filter(b =>
            !b.closest('#csPreviewWrap') &&
            !b.closest('.cs-file-btn-wrap') &&
            !b.classList.contains('cs-btn-ghost') &&
            !(b.id || '').startsWith('csFile') &&
            /subir/i.test(b.textContent || '')
        );
        return candidatos[0] || null;
    }

    function publicarDesdePreview() {
        const boton = encontrarBotonPublicar();
        if (!boton) {
            csToast('No se encontró el botón de publicar', 'error');
            return;
        }
        cerrarPreview();
        boton.click();
    }

    // ============================================================
    // RESET DEL FORMULARIO
    // ============================================================
    function resetFormularioPublicacion() {
        const inputTitulo = $('inputTituloVideo');
        const inputDesc = $('inputDescripcionVideo');
        if (inputTitulo) inputTitulo.value = '';
        if (inputDesc) inputDesc.value = '';

        const inputArchivo = $('inputArchivoVideo');
        if (inputArchivo) { try { inputArchivo.value = ''; } catch (e) {} }

        const preview = $('csPreviewVideo');
        if (preview) {
            try { preview.pause(); } catch (e) {}
            preview.removeAttribute('src');
            try { preview.load(); } catch (e) {}
        }

        const wrap = $('csPreviewWrap');
        if (wrap) wrap.style.display = 'none';

        mostrarPortadaEnPreview(null);

        if (state.previewURL) {
            try { URL.revokeObjectURL(state.previewURL); } catch (e) {}
            state.previewURL = null;
        }
        state.archivoVideo = null;
        state.archivoConAudioMezclado = false;
        resetEstadoBorrador();
        window.__csMiniaturaCamara = null;
        window.__csArchivoConAudioMezclado = false;

        AudioPreview.detener();
        cerrarPreview();

        state.sonidoSeleccionado = null;
        state.ubicacionSeleccionada = null;
        const previewSonido = $('csPreviewSonido');
        const previewUbic = $('csPreviewUbicacion');
        if (previewSonido) previewSonido.querySelector('.cs-preview-txt').textContent = vt('videos_preview_sin_sonido', 'Sin sonido');
        if (previewUbic) previewUbic.querySelector('.cs-preview-txt').textContent = vt('videos_preview_sin_ubicacion', 'Sin ubicación');
        const badge = $('csPreviewBadge');
        if (badge) badge.style.display = 'none';

        actualizarTextoBotonArchivo(null);
        actualizarBotonQuitar(false);

        const progressEl = $('uploadProgress');
        const progressFill = $('progressFill');
        const progressText = $('progressText');
        if (progressEl) progressEl.style.display = 'none';
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';

        const pFill = $('processingProgressFill');
        const pText = $('processingProgressText');
        if (pFill) pFill.style.width = '0%';
        if (pText) pText.textContent = '0%';

        limpiarPersistencia();
        actualizarBotonesSonidoUbicacion();
        log('🔄 Formulario reseteado');
    }
    window.csResetFormularioPublicacion = resetFormularioPublicacion;

    function refrescarFeedAutomatico() {
        try {
            if (typeof window.cargarVideos === 'function') {
                log('🔄 Refrescando feed con cargarVideos()...');
                Promise.resolve(window.cargarVideos()).catch((e) => {
                    warn('cargarVideos() falló, disparando evento:', e);
                    dispararEventoRefresh();
                });
                return;
            }
        } catch (e) { warn('Error llamando cargarVideos:', e); }
        dispararEventoRefresh();
    }

    function dispararEventoRefresh() {
        try {
            window.dispatchEvent(new CustomEvent('csariels:videos:refresh'));
            log('📡 Evento csariels:videos:refresh disparado');
        } catch (e) { warn('No se pudo disparar el evento:', e); }
        try {
            const feed = $('videosContainer');
            if (feed) feed.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {}
    }
    window.csRefrescarFeedVideos = refrescarFeedAutomatico;

    // ============================================================
    // FEED · controles (sin reacciones/compartir, con pausa)
    // ============================================================
    function inyectarEstilosFeed() {
        if ($('cs-feed-ui')) return;
        const ocultar = [];
        if (FEED_UI.ocultarLikes) ocultar.push('.video-card .like-btn');
        if (FEED_UI.ocultarCompartir) ocultar.push('.video-card .btn-compartir-premium');
        if (FEED_UI.ocultarReacciones) ocultar.push('.video-card .reaccion-picker');

        const st = document.createElement('style');
        st.id = 'cs-feed-ui';
        st.textContent = (ocultar.length ? ocultar.join(',') + ' { display: none !important; }' : '') + `
            .video-card .cs-pausa-btn { cursor: pointer; }
            .video-card .cs-pausa-btn .icono { display: flex; align-items: center; justify-content: center; }
            .video-card .cs-pausa-btn svg { filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6)); }
        `;
        document.head.appendChild(st);
    }

    function decorarTarjeta(card) {
        if (!card || card.dataset.csDecorada === '1') return;
        const acciones = card.querySelector('.sidebar-acciones');
        const video = card.querySelector('video');
        if (!acciones || !video) return;
        card.dataset.csDecorada = '1';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-btn cs-pausa-btn';
        btn.setAttribute('aria-label', 'Pausar o reproducir');
        btn.innerHTML = '<span class="icono cs-pausa-ico"></span>';
        acciones.insertBefore(btn, acciones.firstChild);

        const icono = btn.querySelector('.cs-pausa-ico');
        function pintar() {
            icono.innerHTML = video.paused ? ICONO_PLAY : ICONO_PAUSA;
        }
        pintar();
        video.addEventListener('play', pintar);
        video.addEventListener('pause', pintar);

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!video.getAttribute('src') && video.dataset.src) {
                video.src = video.dataset.src;
                video.load();
            }
            if (video.paused) {
                video.play().catch(() => {});
                card.classList.add('playing');
            } else {
                video.pause();
                card.classList.remove('playing');
            }
            pintar();
        });
    }

    function observarFeed() {
        const cont = $('videosContainer');
        if (!cont) return;
        cont.querySelectorAll('.video-card').forEach(decorarTarjeta);
        const obs = new MutationObserver(function () {
            cont.querySelectorAll('.video-card').forEach(decorarTarjeta);
        });
        obs.observe(cont, { childList: true });
    }

    // ============================================================
    // ESTILOS
    // ============================================================
    function inyectarEstilosExtra() {
        if ($('cs-videos-publicar-inline')) return;
        const st = document.createElement('style');
        st.id = 'cs-videos-publicar-inline';
        st.textContent = `
            .cs-sheet-backdrop { z-index: ${Z.SHEET_BACKDROP} !important; touch-action: manipulation; }
            .cs-sheet { z-index: ${Z.SHEET} !important; touch-action: manipulation; }
            .cs-confirm-overlay { z-index: ${Z.CONFIRM} !important; }
            .cs-toast { z-index: ${Z.TOAST} !important; }

            .cs-sheet button, .cs-sheet [role="button"], .cs-sheet .cs-sonido-item,
            .cs-sheet .cs-ubicacion-item, .cs-sheet .cs-tab {
                pointer-events: auto !important;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
            }

            .cs-spinner-inline { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,43,214,0.25); border-top-color: #ff2bd6; border-radius: 50%; animation: cs-spin-inline 0.8s linear infinite; vertical-align: middle; margin-right: 6px; }
            @keyframes cs-spin-inline { to { transform: rotate(360deg); } }

            /* ----- Vista previa del formulario ----- */
            .cs-preview-video {
                position: relative; width: 100%; height: min(78vh, 720px);
                background: #000; border-radius: 14px; overflow: hidden;
                box-shadow: 0 0 18px rgba(255,43,214,.18);
            }
            #csPreviewVideo {
                position: absolute; inset: 0; width: 100%; height: 100%;
                object-fit: cover; background: #000; display: block; z-index: 1;
            }
            #csPreviewPortada {
                position: absolute; inset: 0; width: 100%; height: 100%;
                object-fit: cover; background: #000; display: none; z-index: 2; pointer-events: none;
            }
            #csPreviewBadge {
                position: absolute; top: 12px; left: 12px; z-index: 3;
                background: linear-gradient(90deg,#ff2bd6,#00f0ff) !important; color: #05020a !important;
                font-weight: 800; box-shadow: 0 0 14px rgba(255,43,214,.6);
                padding: 5px 10px; border-radius: 999px; font-size: .7rem;
                animation: cs-badge-latido 1.6s ease-in-out infinite;
            }
            @keyframes cs-badge-latido { 0%,100% { box-shadow: 0 0 10px rgba(255,43,214,.5); } 50% { box-shadow: 0 0 22px rgba(0,240,255,.8); } }

            #csQuitarVideo {
                position: absolute; top: 10px; right: 10px; z-index: 4;
                width: 36px; height: 36px; border-radius: 50%;
                display: none; align-items: center; justify-content: center;
                background: rgba(0,0,0,.65); border: 1px solid rgba(255,51,102,.7);
                color: #ff3366; font-size: 1rem; cursor: pointer; padding: 0;
            }
            #csQuitarVideo:active { transform: scale(.92); }
            .cs-btn-quitar { color: #ff3366 !important; border-color: rgba(255,51,102,.6) !important; }

            /* ----- Vista previa a pantalla completa ----- */
            .cs-prev-modal { position: fixed; inset: 0; z-index: ${Z.PREVIEW}; background: #000; display: none; flex-direction: column; color: #fff; }
            .cs-prev-modal.show { display: flex; }
            .cs-prev-top { position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; padding: max(12px, env(safe-area-inset-top)) 14px 10px; background: linear-gradient(to bottom, rgba(0,0,0,.6), transparent); }
            .cs-prev-titulo { font-size: .8rem; font-weight: 700; color: #00f0ff; text-shadow: 0 0 8px rgba(0,240,255,.5); }
            .cs-prev-spacer { width: 38px; }
            .cs-prev-close { background: rgba(0,0,0,.45); border: none; color: #fff; width: 38px; height: 38px; border-radius: 50%; font-size: 1rem; cursor: pointer; }
            .cs-prev-stage { position: relative; flex: 1; min-height: 0; background: #000; }
            #csPrevVideo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #000; }
            .cs-prev-sonido { position: absolute; left: 12px; bottom: 14px; z-index: 4; font-size: .78rem; background: rgba(0,0,0,.45); padding: 6px 12px; border-radius: 999px; color: #00f0ff; max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .cs-prev-acciones { display: flex; gap: 10px; padding: 12px 14px max(16px, env(safe-area-inset-bottom)); background: #000; }
            .cs-prev-acciones button { flex: 1; padding: 14px; border-radius: 14px; font-weight: 700; cursor: pointer; }

            /* ----- Botón de reproducir con anillo neón ----- */
            .cs-sonido-play {
                position: relative; width: 44px; height: 44px; border-radius: 50%; margin-right: 12px; flex-shrink: 0;
                display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;
                background: radial-gradient(circle at 30% 30%, #2a0d3a, #0a0612 70%);
                border: 2px solid transparent;
                background-clip: padding-box;
                box-shadow: 0 0 0 1px rgba(255,43,214,.35), 0 0 12px rgba(255,43,214,.25);
                transition: box-shadow .25s ease, transform .15s ease;
            }
            .cs-sonido-play:active { transform: scale(.92); }
            .cs-sonido-ico { position: relative; z-index: 2; font-size: .9rem; color: #fff; text-shadow: 0 0 8px #ff2bd6; }
            .cs-eq { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; gap: 2px; pointer-events: none; z-index: 1; }
            .cs-eq-bar {
                width: 3px; height: 5px; border-radius: 3px;
                background: var(--eq-c, #ff2bd6);
                box-shadow: 0 0 6px var(--eq-c, #ff2bd6), 0 0 14px var(--eq-c, #ff2bd6);
                transition: height .07s linear, opacity .07s linear;
            }

            .cs-sonido-item { position: relative; overflow: hidden; transition: background .25s ease, transform .15s ease; }
            .cs-sonido-item:active { transform: scale(.985); }
            .cs-sonido-nombre { color: #fff; font-weight: 700; letter-spacing: .2px; }
            .cs-sonido-artista { color: #9fb4c8; }
            .cs-sonido-check { color: #ff2bd6; text-shadow: 0 0 8px #ff2bd6; }

            .cs-sonido-item.activo, .cs-sonido-item.cs-sonando {
                background: linear-gradient(120deg, rgba(255,43,214,.16), rgba(0,240,255,.12), rgba(57,255,20,.10));
                box-shadow: 0 0 0 1px rgba(0,240,255,.55), 0 0 22px rgba(255,43,214,.35), inset 0 0 18px rgba(0,240,255,.08);
            }
            .cs-sonido-item.cs-sonando::after {
                content: ''; position: absolute; inset: -40% -10%; pointer-events: none;
                background: conic-gradient(from 0deg, #ff2bd6, #00f0ff, #39ff14, #ffe600, #b026ff, #ff2bd6);
                opacity: .10; animation: cs-halo-giro 6s linear infinite;
            }
            @keyframes cs-halo-giro { to { transform: rotate(360deg); } }

            .cs-sonido-item.cs-sonando .cs-sonido-play {
                box-shadow: 0 0 0 2px #00f0ff, 0 0 18px #ff2bd6, 0 0 30px rgba(0,240,255,.45);
                background: radial-gradient(circle at 30% 30%, #3a0f4f, #070410 75%);
            }
            .cs-sonido-item.cs-sonando .cs-sonido-ico { display: none; }
            .cs-sonido-item.cs-sonando .cs-eq { display: flex; }
            .cs-sonido-item.cs-sonando .cs-eq-bar { animation: cs-eq-bounce .8s ease-in-out infinite; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(2) { animation-delay: .12s; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(3) { animation-delay: .24s; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(4) { animation-delay: .36s; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(5) { animation-delay: .48s; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(6) { animation-delay: .6s; }
            @keyframes cs-eq-bounce { 0%,100% { height: 5px; } 50% { height: 22px; } }

            .cs-sonido-item.cs-sonando .cs-sonido-nombre { background: linear-gradient(90deg,#ff2bd6,#00f0ff,#39ff14); -webkit-background-clip: text; background-clip: text; color: transparent; }

            .cs-sonido-item.cs-cargando .cs-sonido-ico { animation: cs-spin-inline .8s linear infinite; display: inline-block; color: #00f0ff; text-shadow: 0 0 8px #00f0ff; }
            .cs-sonido-item.cs-pausado .cs-sonido-play { box-shadow: 0 0 0 2px #ffe600, 0 0 14px rgba(255,230,0,.5); }
            .cs-sonido-item.cs-pausado .cs-sonido-ico { color: #ffe600; text-shadow: 0 0 8px #ffe600; }
            .cs-sonido-item.cs-error .cs-sonido-play { box-shadow: 0 0 0 2px #ff3d7f, 0 0 14px rgba(255,61,127,.6); }
            .cs-sonido-item.cs-error .cs-sonido-ico { color: #ff3d7f; text-shadow: 0 0 8px #ff3d7f; }

            .cs-tab { color: #9fb4c8; font-weight: 700; transition: color .2s ease; }
            .cs-tab.active { color: #fff; text-shadow: 0 0 10px rgba(255,43,214,.7); }
            .cs-tab.active::after {
                content: ''; display: block; height: 3px; margin: 6px auto 0; width: 44px; border-radius: 3px;
                background: linear-gradient(90deg,#ff2bd6,#00f0ff); box-shadow: 0 0 10px #ff2bd6;
            }

            .cs-btn-primary {
                background: linear-gradient(120deg,#ff2bd6,#b026ff 45%,#00f0ff) !important;
                color: #fff !important; border: none !important; font-weight: 800; letter-spacing: .3px;
                box-shadow: 0 0 16px rgba(255,43,214,.45), 0 0 28px rgba(0,240,255,.25);
                text-shadow: 0 1px 2px rgba(0,0,0,.4);
            }
            .cs-btn-primary:disabled { opacity: .45; box-shadow: none; }
            .cs-btn-primary:not(:disabled):active { transform: scale(.97); }

            .cs-sonido-actual { color: #00f0ff; text-shadow: 0 0 8px rgba(0,240,255,.5); }
            .cs-btn-header.cs-activo { box-shadow: 0 0 16px rgba(255,43,214,.55), 0 0 26px rgba(0,240,255,.35); }
            .cs-btn-header.cs-activo .cs-ico { color: #ff2bd6; text-shadow: 0 0 8px #ff2bd6; }

            .cs-borrador-item { display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid rgba(255,43,214,0.35); border-radius: 12px; background: linear-gradient(120deg, rgba(255,43,214,.08), rgba(0,240,255,.06)); margin-bottom: 8px; box-shadow: 0 0 14px rgba(255,43,214,.12); }
            .cs-borrador-portada { width: 48px; height: 64px; border-radius: 8px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; color: #00f0ff; flex-shrink: 0; box-shadow: 0 0 10px rgba(0,240,255,.35); }
            .cs-borrador-portada img { width: 100%; height: 100%; object-fit: cover; }
            .cs-borrador-info { flex: 1; min-width: 0; }
            .cs-borrador-titulo { color: #fff; font-weight: 700; font-size: .82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cs-borrador-meta { color: #9fb4c8; font-size: .66rem; margin-top: 3px; }
            .cs-borrador-acciones { display: flex; flex-direction: column; gap: 6px; }
            .cs-borrador-acciones .cs-btn-ghost { padding: 6px 10px; font-size: .6rem; }
            .cs-btn-peligro { border-color: rgba(255,61,127,.6) !important; color: #ff3d7f !important; }

            @media (prefers-reduced-motion: reduce) {
                .cs-sonido-item.cs-sonando .cs-eq-bar,
                .cs-sonido-item.cs-sonando::after,
                #csPreviewBadge { animation: none !important; }
                .cs-sonido-item.cs-sonando .cs-eq-bar { height: 14px; }
            }
        `;
        document.head.appendChild(st);
    }

    function inyectarBotonesHeader() {
        const header = document.querySelector('.header .header-actions');
        if (!header) { warn('Header no encontrado'); return; }
        if ($('csBtnAgregarSonido')) return;

        const btnSonido = document.createElement('button');
        btnSonido.id = 'csBtnAgregarSonido';
        btnSonido.type = 'button';
        btnSonido.className = 'cs-btn-header cs-btn-sonido';
        btnSonido.innerHTML = '<span class="cs-ico">♪</span><span class="cs-btn-txt" data-clave="videos_agregar_sonido">Agregar sonido</span>';
        btnSonido.addEventListener('click', abrirModalSonidos);

        const btnUbic = document.createElement('button');
        btnUbic.id = 'csBtnUbicacion';
        btnUbic.type = 'button';
        btnUbic.className = 'cs-btn-header cs-btn-ubicacion';
        btnUbic.innerHTML = '<span class="cs-ico">◆</span><span class="cs-btn-txt" data-clave="videos_ubicacion_btn">Ubicación</span>';
        btnUbic.addEventListener('click', abrirModalUbicacion);

        header.insertBefore(btnSonido, header.firstChild);
        header.insertBefore(btnUbic, btnSonido.nextSibling);
    }

    function actualizarBotonesSonidoUbicacion() {
        const bS = $('csBtnAgregarSonido');
        const bU = $('csBtnUbicacion');
        if (bS) bS.classList.toggle('cs-activo', !!state.sonidoSeleccionado);
        if (bU) bU.classList.toggle('cs-activo', !!state.ubicacionSeleccionada);
    }

    function inyectarModales() {
        if ($('csModalSonidos')) return;
        const contenedor = document.createElement('div');
        contenedor.innerHTML = `
            <div class="cs-sheet-backdrop" id="csSheetSonidosBackdrop"></div>
            <div class="cs-sheet" id="csModalSonidos" role="dialog" aria-modal="true" aria-label="Biblioteca de sonidos">
                <div class="cs-sheet-handle"></div>
                <div class="cs-sheet-header">
                    <div class="cs-sheet-titulo"><span class="cs-ico">♪</span><span data-clave="videos_agregar_sonido">Agregar sonido</span></div>
                    <button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="sonidos">✕</button>
                </div>
                <div class="cs-tabs" role="tablist">
                    <button type="button" role="tab" class="cs-tab active" data-tab="parati" data-clave="videos_sonidos_parati">Para ti</button>
                    <button type="button" role="tab" class="cs-tab" data-tab="populares" data-clave="videos_sonidos_populares">Populares</button>
                    <button type="button" role="tab" class="cs-tab" data-tab="favoritos" data-clave="videos_sonidos_favoritos">Favoritos</button>
                </div>
                <div class="cs-sheet-body">
                    <div class="cs-buscar-wrap">
                        <span class="cs-ico-buscar">◇</span>
                        <input type="text" id="csBuscarSonido" data-placeholder="videos_buscar_sonido" placeholder="Buscar pista o artista..." autocomplete="off" />
                    </div>
                    <div class="cs-sonidos-lista" id="csSonidosLista"></div>
                </div>
                <div class="cs-sheet-footer">
                    <div class="cs-sonido-actual" id="csSonidoActualInfo" data-clave="videos_sonido_sin_sel">Sin sonido seleccionado</div>
                    <button type="button" class="cs-btn-primary" id="csBtnConfirmarSonido" disabled data-clave="videos_btn_usar_sonido">Usar este sonido</button>
                </div>
            </div>

            <div class="cs-sheet-backdrop" id="csSheetUbicacionBackdrop"></div>
            <div class="cs-sheet" id="csModalUbicacion" role="dialog" aria-modal="true" aria-label="Seleccionar ubicación">
                <div class="cs-sheet-handle"></div>
                <div class="cs-sheet-header">
                    <div class="cs-sheet-titulo"><span class="cs-ico">◆</span><span data-clave="videos_ubicacion_btn">Ubicación</span></div>
                    <button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="ubicacion">✕</button>
                </div>
                <div class="cs-sheet-body">
                    <div class="cs-buscar-wrap">
                        <span class="cs-ico-buscar">◇</span>
                        <input type="text" id="csBuscarUbicacion" data-placeholder="videos_buscar_ubicacion" placeholder="Buscar ciudad o municipio..." autocomplete="off" />
                    </div>
                    <div class="cs-ubicaciones-lista" id="csUbicacionesLista"></div>
                </div>
                <div class="cs-sheet-footer">
                    <div class="cs-ubicacion-actual" id="csUbicacionActualInfo" data-clave="videos_ubicacion_sin_sel">Sin ubicación seleccionada</div>
                    <button type="button" class="cs-btn-primary" id="csBtnConfirmarUbicacion" disabled data-clave="videos_btn_usar_ubicacion">Usar esta ubicación</button>
                </div>
            </div>

            <div class="cs-sheet-backdrop" id="csSheetBorradoresBackdrop"></div>
            <div class="cs-sheet" id="csModalBorradores" role="dialog" aria-modal="true" aria-label="Borradores">
                <div class="cs-sheet-handle"></div>
                <div class="cs-sheet-header">
                    <div class="cs-sheet-titulo"><span class="cs-ico">◈</span><span data-clave="videos_borradores_titulo">Mis borradores</span></div>
                    <button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="borradores">✕</button>
                </div>
                <div class="cs-sheet-body">
                    <div id="csBorradoresLista" class="cs-borradores-lista">
                        <div class="cs-vacio">
                            <span class="cs-ico-vacio">◈</span>
                            <p data-clave="videos_borradores_vacio">Aún no tienes borradores.</p>
                        </div>
                    </div>
                </div>
            </div>`;
        while (contenedor.firstChild) document.body.appendChild(contenedor.firstChild);
    }

    function inyectarSeccionPreviewEnUpload() {
        const uploadSection = $('uploadSection');
        if (!uploadSection) return;
        if ($('csPreviewWrap')) return;

        const form = uploadSection.querySelector('form');
        if (!form) return;

        transformarInputArchivo(uploadSection);

        const wrap = document.createElement('div');
        wrap.id = 'csPreviewWrap';
        wrap.className = 'cs-preview-wrap';
        wrap.innerHTML = `
            <div class="cs-preview-video">
                <img id="csPreviewPortada" alt="Portada del video" />
                <video id="csPreviewVideo" controls playsinline preload="metadata"></video>
                <div class="cs-preview-badge" id="csPreviewBadge" style="display:none;" data-clave="videos_sonido_video_badge">◆ Sonido + video</div>
                <button type="button" id="csQuitarVideo" aria-label="Quitar video" title="Quitar video">✕</button>
            </div>
            <div class="cs-preview-meta">
                <div class="cs-preview-line" id="csPreviewSonido">
                    <span class="cs-ico">♪</span>
                    <span class="cs-preview-txt" data-clave="videos_preview_sin_sonido">Sin sonido</span>
                </div>
                <div class="cs-preview-line" id="csPreviewUbicacion">
                    <span class="cs-ico">◆</span>
                    <span class="cs-preview-txt" data-clave="videos_preview_sin_ubicacion">Sin ubicación</span>
                </div>
                <div class="cs-preview-actions">
                    <button type="button" class="cs-btn-ghost" id="csBtnVistaPrevia">
                        <span class="cs-ico">▶</span> <span>Vista previa</span>
                    </button>
                    <button type="button" class="cs-btn-ghost" id="csBtnVerBorradores">
                        <span class="cs-ico">◈</span> <span data-clave="videos_borradores_btn">Borradores</span>
                    </button>
                    <button type="button" class="cs-btn-ghost" id="csBtnGuardarBorrador">
                        <span class="cs-ico">◇</span> <span data-clave="videos_guardar_borrador_btn">Guardar borrador</span>
                    </button>
                    <button type="button" class="cs-btn-ghost cs-btn-quitar" id="csBtnQuitarVideo">
                        <span class="cs-ico">✕</span> <span>Quitar video</span>
                    </button>
                </div>
            </div>`;
        const grupos = form.querySelectorAll('.form-group');
        if (grupos.length > 0) form.insertBefore(wrap, grupos[grupos.length - 1]);
        else form.appendChild(wrap);

        wrap.style.display = 'none';

        $('csBtnVistaPrevia').addEventListener('click', abrirPreview);
        $('csBtnVerBorradores').addEventListener('click', abrirModalBorradores);
        $('csBtnGuardarBorrador').addEventListener('click', guardarBorrador);
        $('csQuitarVideo').addEventListener('click', quitarVideoSeleccionado);
        $('csBtnQuitarVideo').addEventListener('click', quitarVideoSeleccionado);
        actualizarBotonQuitar(false);
    }

    function transformarInputArchivo(scope) {
        const input = scope.querySelector('#inputArchivoVideo') || $('inputArchivoVideo');
        if (!input) { warn('inputArchivoVideo no encontrado'); return; }
        if (input.dataset.csTransformado === '1') return;
        input.dataset.csTransformado = '1';

        input.style.setProperty('display', 'none', 'important');
        input.style.setProperty('visibility', 'hidden', 'important');
        input.style.setProperty('position', 'absolute', 'important');
        input.style.setProperty('width', '0', 'important');
        input.style.setProperty('height', '0', 'important');
        input.style.setProperty('opacity', '0', 'important');
        input.style.setProperty('pointer-events', 'none', 'important');
        input.setAttribute('tabindex', '-1');
        input.setAttribute('aria-hidden', 'true');

        const btnWrap = document.createElement('div');
        btnWrap.className = 'cs-file-btn-wrap';
        btnWrap.innerHTML = `
            <button type="button" class="cs-file-btn" id="csFileBtnVideo" aria-label="Elegir video de la galería" style="border:1px solid rgba(255,255,255,0.15); background:transparent; border-radius:8px; padding:16px; width:100%; display:flex; flex-direction:column; align-items:center; gap:8px; color:var(--text-muted); cursor:pointer;">
                <span class="cs-file-btn-ico" style="font-size:1.5rem;">▶</span>
                <span class="cs-file-btn-txt" id="csFileBtnTxt" data-clave="videos_elegir_galeria" style="font-weight:600; font-size:0.85rem;">Elegir video de la galería</span>
                <span class="cs-file-btn-hint" id="csFileBtnHint" data-clave="videos_archivo_hint" style="font-size:0.7rem; opacity:0.7;">MP4 · WebM · MOV · Máx 100 MB</span>
            </button>`;
        if (input.parentNode) input.parentNode.insertBefore(btnWrap, input.nextSibling);

        btnWrap.querySelector('#csFileBtnVideo').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.click();
        });

        log('✅ Input file transformado en botón plano');
    }

    // ============================================================
    // MODALES · LÓGICA
    // ============================================================
    function abrirModalSonidos() {
        renderSonidos(state.tabSonidosActiva, '');
        mostrarSheet('csModalSonidos', 'csSheetSonidosBackdrop');
    }
    function abrirModalUbicacion() {
        renderUbicaciones('');
        mostrarSheet('csModalUbicacion', 'csSheetUbicacionBackdrop');
    }
    function abrirModalBorradores() {
        renderBorradores();
        mostrarSheet('csModalBorradores', 'csSheetBorradoresBackdrop');
    }

    function mostrarSheet(sheetId, backdropId) {
        const sheet = $(sheetId);
        const backdrop = $(backdropId);
        if (!sheet || !backdrop) return;
        backdrop.style.setProperty('z-index', String(Z.SHEET_BACKDROP), 'important');
        sheet.style.setProperty('z-index', String(Z.SHEET), 'important');
        backdrop.classList.add('show');
        sheet.classList.add('show');
        document.body.style.overflow = 'hidden';
        if (typeof window.aplicarTraducciones === 'function') {
            try { window.aplicarTraducciones(sheet); } catch (e) {}
        }
    }
    function cerrarSheet(sheetId, backdropId) {
        const sheet = $(sheetId);
        const backdrop = $(backdropId);
        if (sheet) sheet.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
        document.body.style.overflow = '';
    }
    function cerrarTodosLosSheets() {
        const est = AudioPreview.getEstado();
        if (est.estado === 'playing' || est.estado === 'loading') AudioPreview.detener();
        cerrarSheet('csModalSonidos', 'csSheetSonidosBackdrop');
        cerrarSheet('csModalUbicacion', 'csSheetUbicacionBackdrop');
        cerrarSheet('csModalBorradores', 'csSheetBorradoresBackdrop');
    }

    function actualizarIndicadorSonido(estado, pista, error) {
        document.querySelectorAll('.cs-sonido-item').forEach(el => {
            const ico = el.querySelector('.cs-sonido-ico');
            const esActivo = pista && el.dataset.sonidoId === pista.id;
            el.classList.remove('cs-sonando', 'cs-cargando', 'cs-pausado', 'cs-error');
            if (!ico) return;
            if (!esActivo) { ico.textContent = '▶'; return; }
            if (estado === 'loading') { ico.textContent = '◌'; el.classList.add('cs-cargando'); }
            else if (estado === 'playing') { ico.textContent = '⏸'; el.classList.add('cs-sonando'); }
            else if (estado === 'paused') { ico.textContent = '▶'; el.classList.add('cs-pausado'); }
            else if (estado === 'error') { ico.textContent = '⚠'; el.classList.add('cs-error'); }
        });
        if (estado === 'error') {
            const mensaje = error && error.indexOf('timeout') !== -1
                ? 'La pista tardó demasiado en cargar.'
                : 'No se pudo reproducir esta pista.';
            csToast(mensaje, 'error', 3500);
        }
    }
    window._audioPreviewOnEstado = actualizarIndicadorSonido;

    function filaEqualizador() {
        const barras = EQ_COLORES.map(function (color) {
            return `<span class="cs-eq-bar" style="--eq-c:${color}"></span>`;
        }).join('');
        return `<span class="cs-eq" aria-hidden="true">${barras}</span>`;
    }

    function renderSonidos(tab, filtro) {
        state.tabSonidosActiva = tab || 'parati';
        const lista = $('csSonidosLista');
        if (!lista) return;
        const fuente = SONIDOS_SEED[state.tabSonidosActiva] || [];
        const term = (filtro || '').toLowerCase().trim();
        const arr = term
            ? fuente.filter(s => (s.nombre + ' ' + s.artista).toLowerCase().indexOf(term) !== -1)
            : fuente;
        if (arr.length === 0) {
            lista.innerHTML = `<div class="cs-vacio"><span class="cs-ico-vacio">♪</span><p data-clave="videos_sin_pistas">Sin pistas en esta sección.</p></div>`;
            return;
        }

        lista.innerHTML = arr.map(s => `
            <button type="button" class="cs-sonido-item ${state.sonidoSeleccionado && state.sonidoSeleccionado.id === s.id ? 'activo' : ''}" data-sonido-id="${esc(s.id)}">
                <span class="cs-sonido-play" data-play-id="${esc(s.id)}" role="button" aria-label="Reproducir o pausar">
                    <span class="cs-sonido-ico">▶</span>
                    ${filaEqualizador()}
                </span>
                <span class="cs-sonido-info">
                    <span class="cs-sonido-nombre">${esc(s.nombre)}</span>
                    <span class="cs-sonido-artista">${esc(s.artista)} · ${esc(s.duracion)}s</span>
                </span>
                <span class="cs-sonido-check">◆</span>
            </button>`).join('');

        lista.querySelectorAll('.cs-sonido-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.playId;
                const actual = AudioPreview.getEstado();
                if (actual.pista && actual.pista.id === id) {
                    if (actual.estado === 'playing') AudioPreview.pausar();
                    else if (actual.estado === 'paused') AudioPreview.reanudar();
                } else {
                    previsualizarSonido(id);
                }
            });
        });

        lista.querySelectorAll('.cs-sonido-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.closest('.cs-sonido-play')) return;
                seleccionarSonido(btn.dataset.sonidoId);
            });
        });
    }

    function buscarSonidoPorId(id) {
        const todas = [].concat(SONIDOS_SEED.parati).concat(SONIDOS_SEED.populares).concat(SONIDOS_SEED.favoritos);
        return todas.find(x => x.id === id) || null;
    }

    function previsualizarSonido(id) {
        const s = buscarSonidoPorId(id);
        if (!s) return;
        AudioPreview.reproducir(s, actualizarIndicadorSonido);
    }

    function seleccionarSonido(id) {
        const s = buscarSonidoPorId(id);
        if (!s) return;
        state.sonidoSeleccionado = s;
        AudioPreview.reproducir(s, actualizarIndicadorSonido);

        document.querySelectorAll('.cs-sonido-item').forEach(el => {
            el.classList.toggle('activo', el.dataset.sonidoId === id);
        });
        const info = $('csSonidoActualInfo');
        if (info) {
            info.removeAttribute('data-clave');
            info.textContent = `${s.nombre} — ${s.artista}`;
        }
        const btn = $('csBtnConfirmarSonido');
        if (btn) btn.disabled = false;
    }

    function confirmarSonido() {
        actualizarResumenPreview();
        actualizarBotonesSonidoUbicacion();
        persistirMetaDebounced();
        const s = state.sonidoSeleccionado;
        window.dispatchEvent(new CustomEvent('csariels:sonido:seleccionado', {
            detail: s ? { id: s.id, nombre: s.nombre, artista: s.artista, url: s.url, duracion: s.duracion } : null
        }));
        cerrarTodosLosSheets();
    }

    function renderUbicaciones(filtro) {
        const lista = $('csUbicacionesLista');
        if (!lista) return;
        const term = (filtro || '').toLowerCase().trim();
        const arr = term
            ? UBICACIONES_SEED.filter(u => u.nombre.toLowerCase().indexOf(term) !== -1)
            : UBICACIONES_SEED;
        if (arr.length === 0) {
            lista.innerHTML = `<div class="cs-vacio"><span class="cs-ico-vacio">◆</span><p data-clave="videos_sin_resultados">Sin resultados.</p></div>`;
            return;
        }
        lista.innerHTML = arr.map(u => `
            <button type="button" class="cs-ubicacion-item ${state.ubicacionSeleccionada && state.ubicacionSeleccionada.id === u.id ? 'activo' : ''}" data-ubicacion-id="${esc(u.id)}">
                <span class="cs-ubicacion-ico">◆</span>
                <span class="cs-ubicacion-info">
                    <span class="cs-ubicacion-nombre">${esc(u.nombre)}</span>
                    <span class="cs-ubicacion-pais">${esc(u.pais)}</span>
                </span>
                <span class="cs-ubicacion-check">◆</span>
            </button>`).join('');
        lista.querySelectorAll('.cs-ubicacion-item').forEach(btn => {
            btn.addEventListener('click', () => seleccionarUbicacion(btn.dataset.ubicacionId));
        });
    }

    function seleccionarUbicacion(id) {
        const u = UBICACIONES_SEED.find(x => x.id === id);
        if (!u) return;
        state.ubicacionSeleccionada = u;
        document.querySelectorAll('.cs-ubicacion-item').forEach(el => {
            el.classList.toggle('activo', el.dataset.ubicacionId === id);
        });
        const info = $('csUbicacionActualInfo');
        if (info) {
            info.removeAttribute('data-clave');
            info.textContent = `${u.nombre}, ${u.pais}`;
        }
        const btn = $('csBtnConfirmarUbicacion');
        if (btn) btn.disabled = false;
    }

    function confirmarUbicacion() {
        actualizarResumenPreview();
        actualizarBotonesSonidoUbicacion();
        persistirMetaDebounced();
        cerrarTodosLosSheets();
    }

    function actualizarBadgePreview() {
        const badge = $('csPreviewBadge');
        if (!badge) return;
        badge.style.display = state.sonidoSeleccionado ? 'inline-flex' : 'none';
    }

    // ============================================================
    // INPUT DE ARCHIVO (galería) Y CAMPOS DEL FORMULARIO
    // ============================================================
    function engancharInputArchivo() {
        const input = $('inputArchivoVideo');
        if (!input) return;
        if (input.dataset.csPublicarEnganchado === '1') return;
        input.dataset.csPublicarEnganchado = '1';

        input.addEventListener('change', function () {
            const file = input.files && input.files[0];
            if (!file) return;
            state.archivoVideo = file;
            state.archivoPathRemoto = null;
            state.portadaPathRemoto = null;
            state.archivoConAudioMezclado = window.__csArchivoConAudioMezclado === true;
            mostrarPreviewVideo(file);
            actualizarTextoBotonArchivo(file);
            persistirArchivo();
            persistirMetaDebounced();
            log('Preview listo para:', file.name);
        });
    }

    function engancharPersistenciaCampos() {
        document.addEventListener('input', function (e) {
            if (!e.target || !e.target.id) return;
            if (e.target.id === 'inputTituloVideo' || e.target.id === 'inputDescripcionVideo') {
                persistirMetaDebounced();
            }
        });
    }

    function engancharEventoPublicacionExitosa() {
        if (window.__csPublicacionListener) return;
        window.__csPublicacionListener = true;
        window.addEventListener('csariels:videos:publicado', () => {
            log('✅ Evento publicado recibido — reseteando formulario y refrescando feed');
            resetFormularioPublicacion();
            setTimeout(refrescarFeedAutomatico, 300);
        });
    }

    // ============================================================
    // AUTOPLAY DEL FEED
    // ============================================================
    let _autoplayObserver = null;
    let _autoplayInterval = null;
    let _intersectionObserver = null;

    function iniciarVigilanteAutoplay() {
        if (_intersectionObserver) return;

        function usuarioQuiereAutoplay() {
            const pref = localStorage.getItem('contenido_auto_reproducir');
            return pref === null || pref === 'true';
        }

        function esVideoDelFeed(video) {
            if (!video) return false;
            if (video.id === 'csPreviewVideo' || video.id === 'csPrevVideo') return false;
            if (video.closest && video.closest('#csPreviewWrap')) return false;
            if (video.closest && video.closest('#csModalPreview')) return false;
            if (video.closest && video.closest('#csModalCamara')) return false;
            if (video.dataset.csAutoplayIgnorar === 'true') return false;
            return true;
        }

        _intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (!esVideoDelFeed(video)) return;
                if (entry.isIntersecting) {
                    if (usuarioQuiereAutoplay()) {
                        video.muted = true;
                        video.play().catch(e => {
                            if (e.name !== 'AbortError') console.log('Autoplay bloqueado:', e.name);
                        });
                    }
                } else {
                    try { video.pause(); video.currentTime = 0; } catch (e) {}
                }
            });
        }, { threshold: 0.5 });

        function observarVideo(video) {
            if (!esVideoDelFeed(video)) return;
            if (video.dataset.csAutoplayObservado === 'true') return;
            video.dataset.csAutoplayObservado = 'true';
            _intersectionObserver.observe(video);
        }

        function observarTodos() {
            document.querySelectorAll('video').forEach(observarVideo);
        }

        observarTodos();

        _autoplayObserver = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(nodo => {
                    if (nodo.nodeType !== 1) return;
                    if (nodo.tagName === 'VIDEO') observarVideo(nodo);
                    else if (nodo.querySelectorAll) nodo.querySelectorAll('video').forEach(observarVideo);
                });
            });
        });
        _autoplayObserver.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('csariels:videos:refresh', () => {
            setTimeout(observarTodos, 300);
        });

        _autoplayInterval = setInterval(observarTodos, 15000);

        window.addEventListener('beforeunload', () => {
            if (_autoplayObserver) { _autoplayObserver.disconnect(); _autoplayObserver = null; }
            if (_autoplayInterval) { clearInterval(_autoplayInterval); _autoplayInterval = null; }
            if (_intersectionObserver) { _intersectionObserver.disconnect(); _intersectionObserver = null; }
            AudioPreview.detener();
            detenerPistaPreview();
        });
    }

    function engancharListenersGlobales() {
        if (window.__csVideosPublicarListeners) return;
        window.__csVideosPublicarListeners = true;

        document.body.addEventListener('click', function (e) {
            const t = e.target;
            if (t.classList && t.classList.contains('cs-sheet-backdrop')) cerrarTodosLosSheets();
            if (t.closest && t.closest('[data-cs-close]')) cerrarTodosLosSheets();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                cerrarTodosLosSheets();
                cerrarPreview();
            }
        });

        document.addEventListener('click', function (e) {
            const tab = e.target.closest && e.target.closest('.cs-tab[data-tab]');
            if (!tab) return;
            document.querySelectorAll('.cs-tab').forEach(x => x.classList.remove('active'));
            tab.classList.add('active');
            renderSonidos(tab.dataset.tab, ($('csBuscarSonido') || {}).value || '');
        });

        document.addEventListener('input', function (e) {
            if (e.target && e.target.id === 'csBuscarSonido') renderSonidos(state.tabSonidosActiva, e.target.value);
            if (e.target && e.target.id === 'csBuscarUbicacion') renderUbicaciones(e.target.value);
        });

        document.addEventListener('click', function (e) {
            if (e.target && e.target.id === 'csBtnConfirmarSonido') confirmarSonido();
            if (e.target && e.target.id === 'csBtnConfirmarUbicacion') confirmarUbicacion();
        });
    }

    window.VideosPublicar = {
        abrirModalSonidos,
        abrirModalUbicacion,
        abrirModalBorradores,
        abrirPreview,
        cerrarPreview,
        cerrarTodosLosSheets,
        subirMultimedia,
        csToast,
        csConfirm,
        resetFormularioPublicacion,
        refrescarFeedAutomatico,
        mostrarPreviewVideo,
        guardarBorrador,
        abrirBorrador,
        eliminarBorrador,
        quitarVideoSeleccionado,
        getConfig: () => ({ ...CONFIG, FEED_UI: { ...FEED_UI } }),
        setProvider: (p) => { CONFIG.PROVIDER = p; },
        setFeedUI: (parcial) => { Object.assign(FEED_UI, parcial || {}); const old = $('cs-feed-ui'); if (old) old.remove(); inyectarEstilosFeed(); },
        getState: () => ({
            sonido: state.sonidoSeleccionado,
            ubicacion: state.ubicacionSeleccionada,
            archivoVideo: state.archivoVideo ? state.archivoVideo.name : null,
            archivoConAudioMezclado: state.archivoConAudioMezclado === true,
            borradorId: state.borradorEditandoId
        }),
        _seed: { SONIDOS_SEED, UBICACIONES_SEED },
        Z
    };

    async function init() {
        inyectarEstilosExtra();
        inyectarEstilosFeed();
        inyectarBotonesHeader();
        inyectarModales();
        inyectarSeccionPreviewEnUpload();
        inyectarModalPreview();
        engancharInputArchivo();
        engancharPersistenciaCampos();
        engancharListenersGlobales();
        engancharEventoPublicacionExitosa();
        iniciarVigilanteAutoplay();
        observarFeed();
        actualizarBotonesSonidoUbicacion();
        await restaurarLocal();
        log('✅ Módulo Publicar v3.0 listo');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();