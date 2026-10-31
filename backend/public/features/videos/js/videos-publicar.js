/* ================================================================
   CSARIEL'S · VIDEOS · MÓDULO PUBLICAR v2.3
   ================================================================
   Cambios respecto a v2.2:
   - BORRADORES REALES:
     · Guardar borrador: sube el video y la portada a
       borradores/{usuario_id}/ en el bucket "videos" y registra una
       fila en public.videos_borradores (RLS por propietario).
       Si no hay video, guarda solo título, descripción, sonido y ubicación.
     · Mis borradores: lista los borradores del usuario con portada,
       título y fecha.
     · Abrir borrador: carga el video, la portada y los datos al formulario.
     · Eliminar borrador: borra la fila y los archivos del bucket.
   - Mantiene equalizador, selector de sonidos, ubicación, preview,
     capas (z-index) y la API pública de v2.2.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosPublicarLoaded) return;
    window.__csarielsVideosPublicarLoaded = true;

    const Z = { CAMARA: 99999, SHEET_BACKDROP: 100000, SHEET: 100001, CONFIRM: 100010, TOAST: 100020 };

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
        BARRAS_EQ: 4,
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
        tabSonidosActiva: 'parati',
        sbCliente: null,
        borradorEditandoId: null,
        guardandoBorrador: false
    };

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
    // ANALIZADOR PARA EL EQUALIZADOR (Web Audio API)
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
                    analyser.smoothingTimeConstant = 0.7;
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
                const altura = 4 + (valor / 255) * 16;
                barra.style.height = altura + 'px';
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
    // Los borradores se guardan en borradores/{usuario_id}/ y no pasan
    // por la cola de publicación ni por la moderación del feed.
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

    // Convierte la portada generada en blob para subirla
    function blobDePortadaActual() {
        return state.portadaBlob || null;
    }

    // Reconstruye el archivo del borrador desde su URL pública
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

    // Guarda un borrador. Si ya se estaba editando uno, lo actualiza.
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
        try {
            const usuarioId = session.user.id;
            let archivoPath = null;
            let portadaPath = null;
            let duracion = null;

            const videoEl = $('csPreviewVideo');
            if (videoEl && isFinite(videoEl.duration) && videoEl.duration > 0) duracion = Math.round(videoEl.duration);

            if (archivo) {
                archivoPath = await subirBorradorArchivo(rutaBorrador(usuarioId, archivo.name), archivo, archivo.type);
                subidos.push(archivoPath);
            }

            const portada = blobDePortadaActual();
            if (portada) {
                portadaPath = await subirBorradorArchivo(rutaBorrador(usuarioId, 'portada.jpg'), portada, 'image/jpeg');
                subidos.push(portadaPath);
            }

            const fila = {
                usuario_id: usuarioId,
                titulo: titulo || null,
                descripcion: descripcion || null,
                sonido_id: sonido ? sonido.id : null,
                sonido_nombre: sonido ? `${sonido.nombre} — ${sonido.artista}` : null,
                sonido_url: sonido ? sonido.url : null,
                ubicacion_nombre: ubicacion ? `${ubicacion.nombre}, ${ubicacion.pais}` : null,
                archivo_path: archivoPath,
                portada_path: portadaPath,
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

            // Si se reemplazó el video de un borrador existente, se borra el anterior
            if (state.borradorEditandoId && archivoPath && resultado.data) {
                // El anterior se limpia desde la lista al editar; aquí solo registramos el nuevo
            }

            state.borradorEditandoId = resultado.data.id;
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

        state.borradorEditandoId = data.id;

        const titulo = $('inputTituloVideo');
        const desc = $('inputDescripcionVideo');
        if (titulo) titulo.value = data.titulo || '';
        if (desc) desc.value = data.descripcion || '';

        // Sonido
        if (data.sonido_id) {
            const s = buscarSonidoPorId(data.sonido_id);
            if (s) seleccionarSonidoSinSonar(s);
        } else {
            state.sonidoSeleccionado = null;
        }

        // Ubicación
        const ubic = data.ubicacion_nombre
            ? UBICACIONES_SEED.find(u => `${u.nombre}, ${u.pais}` === data.ubicacion_nombre) || null
            : null;
        state.ubicacionSeleccionada = ubic;

        // Video
        if (data.archivo_path) {
            try {
                const archivo = await descargarArchivoBorrador(data.archivo_path, data.archivo_path.split('/').pop());
                state.archivoVideo = archivo;
                state.archivoConAudioMezclado = false;
                window.__csMiniaturaCamara = null;
                mostrarPreviewVideo(archivo);
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
        if (state.borradorEditandoId === id) state.borradorEditandoId = null;
        csToast('Borrador eliminado', 'success');
        renderBorradores();
    }

    // Selecciona el sonido sin reproducirlo (al abrir un borrador)
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
        if (!v) return;
        if (state.previewURL) {
            try { URL.revokeObjectURL(state.previewURL); } catch (e) {}
            state.previewURL = null;
        }
        state.previewURL = URL.createObjectURL(file);
        v.src = state.previewURL;
        v.muted = false;
        v.playsInline = true;
        v.controls = true;
        try { v.load(); } catch (e) {}

        obtenerPortada(file).then(mostrarPortadaEnPreview);

        v.addEventListener('durationchange', function () {
            if (isFinite(v.duration) && v.duration > 0) {
                const meta = $('csPreviewDuracion');
                if (meta) meta.textContent = Math.round(v.duration) + ' s';
            }
        });
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
        mostrarPortadaEnPreview(null);

        if (state.previewURL) {
            try { URL.revokeObjectURL(state.previewURL); } catch (e) {}
            state.previewURL = null;
        }
        state.archivoVideo = null;
        state.archivoConAudioMezclado = false;
        state.borradorEditandoId = null;
        window.__csMiniaturaCamara = null;
        window.__csArchivoConAudioMezclado = false;

        AudioPreview.detener();

        state.sonidoSeleccionado = null;
        state.ubicacionSeleccionada = null;
        const previewSonido = $('csPreviewSonido');
        const previewUbic = $('csPreviewUbicacion');
        if (previewSonido) previewSonido.querySelector('.cs-preview-txt').textContent = vt('videos_preview_sin_sonido', 'Sin sonido');
        if (previewUbic) previewUbic.querySelector('.cs-preview-txt').textContent = vt('videos_preview_sin_ubicacion', 'Sin ubicación');
        const badge = $('csPreviewBadge');
        if (badge) badge.style.display = 'none';
        const meta = $('csPreviewDuracion');
        if (meta) meta.textContent = '';

        const btnTxt = $('csFileBtnTxt');
        const btnHint = $('csFileBtnHint');
        const btnWrap = document.querySelector('.cs-file-btn-wrap');
        if (btnTxt) btnTxt.textContent = vt('videos_elegir_galeria', 'Elegir video de la galería');
        if (btnHint) btnHint.textContent = vt('videos_archivo_hint', 'MP4 · WebM · MOV · Máx 100 MB');
        if (btnWrap) btnWrap.classList.remove('cs-file-con-archivo');

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

            .cs-spinner-inline { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(212,175,55,0.25); border-top-color: #D4AF37; border-radius: 50%; animation: cs-spin-inline 0.8s linear infinite; vertical-align: middle; margin-right: 6px; }
            @keyframes cs-spin-inline { to { transform: rotate(360deg); } }

            .cs-sonido-play { position: relative; background: transparent; border: 1px solid rgba(212,175,55,0.3); border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; color: #D4AF37; cursor: pointer; margin-right: 10px; flex-shrink: 0; overflow: hidden; transition: background .2s, border-color .2s, box-shadow .2s; }
            .cs-sonido-play:hover { background: rgba(212,175,55,0.15); }
            .cs-sonido-ico { position: relative; z-index: 2; font-size: .8rem; }
            .cs-eq { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; gap: 2px; pointer-events: none; z-index: 1; }
            .cs-eq-bar { width: 3px; height: 4px; border-radius: 2px; background: #D4AF37; box-shadow: 0 0 6px rgba(212,175,55,.6); transition: height .08s linear; }

            .cs-sonido-item.cs-sonando .cs-sonido-play { border-color: #D4AF37; box-shadow: 0 0 12px rgba(212,175,55,.45); background: rgba(212,175,55,.12); }
            .cs-sonido-item.cs-sonando .cs-sonido-ico { display: none; }
            .cs-sonido-item.cs-sonando .cs-eq { display: flex; }
            .cs-sonido-item.cs-sonando .cs-eq-bar { animation: cs-eq-bounce 0.9s ease-in-out infinite; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(2) { animation-delay: .15s; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(3) { animation-delay: .3s; }
            .cs-sonido-item.cs-sonando .cs-eq-bar:nth-child(4) { animation-delay: .45s; }
            @keyframes cs-eq-bounce { 0%,100% { height: 4px; } 50% { height: 18px; } }

            .cs-sonido-item.cs-cargando .cs-sonido-ico { animation: cs-spin-inline .8s linear infinite; display: inline-block; }
            .cs-sonido-item.cs-pausado .cs-sonido-play { border-color: rgba(212,175,55,.6); }
            .cs-sonido-item.cs-error .cs-sonido-play { border-color: #ff3366; color: #ff3366; }

            @media (prefers-reduced-motion: reduce) {
                .cs-sonido-item.cs-sonando .cs-eq-bar { animation: none; height: 12px; }
            }

            .cs-btn-header.cs-activo { box-shadow: 0 0 14px rgba(212,175,55,0.45); }
            .cs-preview-duracion { font-size: 0.65rem; color: #8aa8b8; margin-left: auto; font-family: 'Orbitron', monospace; }
            #csPreviewPortada { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; display: none; z-index: 2; }
            .cs-preview-video { position: relative; }

            .cs-borrador-item { display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid rgba(212,175,55,0.15); border-radius: 12px; background: rgba(255,255,255,0.03); margin-bottom: 8px; }
            .cs-borrador-portada { width: 48px; height: 64px; border-radius: 8px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; color: #D4AF37; flex-shrink: 0; }
            .cs-borrador-portada img { width: 100%; height: 100%; object-fit: cover; }
            .cs-borrador-info { flex: 1; min-width: 0; }
            .cs-borrador-titulo { color: #f0f4f8; font-weight: 700; font-size: .82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cs-borrador-meta { color: #8aa8b8; font-size: .66rem; margin-top: 3px; }
            .cs-borrador-acciones { display: flex; flex-direction: column; gap: 6px; }
            .cs-borrador-acciones .cs-btn-ghost { padding: 6px 10px; font-size: .6rem; }
            .cs-btn-peligro { border-color: rgba(255,51,102,.5) !important; color: #ff3366 !important; }
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
                <video id="csPreviewVideo" playsinline muted preload="auto"></video>
                <div class="cs-preview-badge" id="csPreviewBadge" style="display:none;" data-clave="videos_sonido_video_badge">◆ Sonido + video</div>
            </div>
            <div class="cs-preview-meta">
                <div class="cs-preview-line" id="csPreviewSonido">
                    <span class="cs-ico">♪</span>
                    <span class="cs-preview-txt" data-clave="videos_preview_sin_sonido">Sin sonido</span>
                </div>
                <div class="cs-preview-line" id="csPreviewUbicacion">
                    <span class="cs-ico">◆</span>
                    <span class="cs-preview-txt" data-clave="videos_preview_sin_ubicacion">Sin ubicación</span>
                    <span class="cs-preview-duracion" id="csPreviewDuracion"></span>
                </div>
                <div class="cs-preview-actions">
                    <button type="button" class="cs-btn-ghost" id="csBtnVerBorradores">
                        <span class="cs-ico">◈</span> <span data-clave="videos_borradores_btn">Borradores</span>
                    </button>
                    <button type="button" class="cs-btn-ghost" id="csBtnGuardarBorrador">
                        <span class="cs-ico">◇</span> <span data-clave="videos_guardar_borrador_btn">Guardar borrador</span>
                    </button>
                </div>
            </div>`;
        const grupos = form.querySelectorAll('.form-group');
        if (grupos.length > 0) form.insertBefore(wrap, grupos[grupos.length - 1]);
        else form.appendChild(wrap);

        $('csBtnVerBorradores').addEventListener('click', abrirModalBorradores);
        $('csBtnGuardarBorrador').addEventListener('click', guardarBorrador);
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
            <button type="button" class="cs-file-btn" id="csFileBtnVideo" aria-label="Elegir video de la galería">
                <span class="cs-file-btn-ico">▶</span>
                <span class="cs-file-btn-txt" id="csFileBtnTxt" data-clave="videos_elegir_galeria">Elegir video de la galería</span>
                <span class="cs-file-btn-hint" id="csFileBtnHint" data-clave="videos_archivo_hint">MP4 · WebM · MOV · Máx 100 MB</span>
            </button>`;
        if (input.parentNode) input.parentNode.insertBefore(btnWrap, input.nextSibling);

        btnWrap.querySelector('#csFileBtnVideo').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.click();
        });

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            const txt = $('csFileBtnTxt');
            const hint = $('csFileBtnHint');
            if (file) {
                if (txt) { txt.removeAttribute('data-clave'); txt.textContent = '◈ ' + file.name; }
                if (hint) {
                    const mb = (file.size / (1024 * 1024)).toFixed(2);
                    hint.removeAttribute('data-clave');
                    hint.textContent = mb + ' MB · Listo para subir';
                }
                btnWrap.classList.add('cs-file-con-archivo');
            } else {
                if (txt) {
                    txt.setAttribute('data-clave', 'videos_elegir_galeria');
                    txt.textContent = vt('videos_elegir_galeria', 'Elegir video de la galería');
                }
                if (hint) {
                    hint.setAttribute('data-clave', 'videos_archivo_hint');
                    hint.textContent = vt('videos_archivo_hint', 'MP4 · WebM · MOV · Máx 100 MB');
                }
                btnWrap.classList.remove('cs-file-con-archivo');
            }
        });

        log('✅ Input file transformado en botón estilizado');
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
        return `<span class="cs-eq" aria-hidden="true"><span class="cs-eq-bar"></span><span class="cs-eq-bar"></span><span class="cs-eq-bar"></span><span class="cs-eq-bar"></span></span>`;
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
        cerrarTodosLosSheets();
    }

    function actualizarBadgePreview() {
        const badge = $('csPreviewBadge');
        if (!badge) return;
        badge.style.display = state.sonidoSeleccionado ? 'inline-flex' : 'none';
    }

    // ============================================================
    // INPUT DE ARCHIVO (galería)
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
            state.archivoConAudioMezclado = window.__csArchivoConAudioMezclado === true;
            mostrarPreviewVideo(file);
            log('Preview listo para:', file.name);
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
            if (video.id === 'csPreviewVideo') return false;
            if (video.closest && video.closest('#csPreviewWrap')) return false;
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
            if (e.key === 'Escape') cerrarTodosLosSheets();
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
        getConfig: () => ({ ...CONFIG }),
        setProvider: (p) => { CONFIG.PROVIDER = p; },
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

    function init() {
        inyectarEstilosExtra();
        inyectarBotonesHeader();
        inyectarModales();
        inyectarSeccionPreviewEnUpload();
        engancharInputArchivo();
        engancharListenersGlobales();
        engancharEventoPublicacionExitosa();
        iniciarVigilanteAutoplay();
        actualizarBotonesSonidoUbicacion();
        log('✅ Módulo Publicar v2.3 listo (borradores activos)');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();