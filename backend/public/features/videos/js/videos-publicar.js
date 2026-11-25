/* ================================================================
   CSARIEL'S · VIDEOS · MÓDULO PUBLICAR v4.0
   ================================================================
   Cambios v4.0:
   - Helper seguro para cambiar texto de elementos (no falla si falta el nodo).
   - Aviso de cuota neutral cuando el plan no llega del servidor.
   - Botón de archivo sin estilos en línea (lo define videos-composer-pro.css).
   - Retirados estilos sin uso y duplicados con videos-composer-pro.css.
   - Estilo para botones del header con sonido/ubicación elegidos (.cs-activo).
   Estilos de componentes que NO están en videos-publicar.css (pestañas,
   filas de sonidos, ubicaciones, vista previa modal, borradores, marca de
   agua y estados de reproducción) se mantienen en el <style> inyectado.
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosPublicarLoaded) return;
    window.__csarielsVideosPublicarLoaded = true;

    const Z = { SHEET_BACKDROP: 100000, SHEET: 100001, PREVIEW: 100030, CONFIRM: 100010, TOAST: 100020 };

    const FEED_UI = {
        ocultarLikes: true,
        ocultarCompartir: true,
        ocultarReacciones: true
    };

    /* Marca de agua (escudo con la "C"). ACTIVA: false la quita del feed y de la vista previa. */
    const MARCA_AGUA = {
        ACTIVA: true,
        OPACIDAD: 1
    };

    const EQ_COLORES = ['#ff2bd6', '#ff3d7f', '#00f0ff', '#39ff14', '#ffe600', '#b026ff'];

    const IDB_NAME = 'csVideosPublicar';
    const IDB_STORE = 'kv';
    const KEY_META = 'meta';
    const KEY_FILE = 'file';

    const MAX_FILE_SIZE_FOR_IDB = 15 * 1024 * 1024;

    const FAV_KEY = 'cs_sonidos_favoritos_v1';
    const DURACION_PREVIEW_MS = 5000;

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
        MAX_BORRADORES_LISTA: 50
    };

    const LIMITE_BORRADORES = 3;
    const RUTA_MEMBRESIA_PRO = '/membresia-pro.html';

    const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
    const SUPABASE_STORAGE_URL = SUPABASE_URL + '/storage/v1/object/public/audios';

    /* Estilo visual por género: degradado + glifo. Sin imágenes externas. */
    const GENEROS = {
        phonk:   { label: 'Phonk',   bg: 'linear-gradient(135deg,#ff2bd6,#3b0a4f 70%)', glyph: '◆' },
        epico:   { label: 'Épico',   bg: 'linear-gradient(135deg,#ffe600,#6b3d00 70%)', glyph: '✦' },
        comedia: { label: 'Comedia', bg: 'linear-gradient(135deg,#39ff14,#0b3d14 70%)', glyph: '◉' },
        trap:    { label: 'Trap',    bg: 'linear-gradient(135deg,#ff3d7f,#2a0010 70%)', glyph: '▲' },
        house:   { label: 'House',   bg: 'linear-gradient(135deg,#00f0ff,#03303d 70%)', glyph: '◈' },
        electro: { label: 'Electro', bg: 'linear-gradient(135deg,#b026ff,#00f0ff 120%)', glyph: '●' }
    };

    const SONIDOS_SEED = {
        parati: [
            { id: 'sd-phonk', nombre: 'Phonk Bass Drop', artista: 'Echoes of Lumen', genero: 'phonk', url: `${SUPABASE_STORAGE_URL}/echoes_of_lumen-phonk-bass-neon-aura-night-drive-588671.mp3`, duracion: 128 },
            { id: 'sd-suspenso', nombre: 'Suspenso Épico', artista: 'Absolute Sound', genero: 'epico', url: `${SUPABASE_STORAGE_URL}/absolutesound-suspense-tense-atmosphere-514617.mp3`, duracion: 137 },
            { id: 'sd-comedia', nombre: 'Risa y Caos', artista: 'Alex Morgan', genero: 'comedia', url: `${SUPABASE_STORAGE_URL}/alex-morgan-comedy-bgm-funny-background-music-583242.mp3`, duracion: 62 },
            { id: 'sd-n1', nombre: 'Brazilian Phonk', artista: 'Sub Clair', genero: 'phonk', url: `${SUPABASE_STORAGE_URL}/sub_clair-brazilian-phonk-instrumental-585588.mp3`, duracion: 120 },
            { id: 'sd-n2', nombre: 'Sosin Phonk Music', artista: 'Sosin', genero: 'phonk', url: `${SUPABASE_STORAGE_URL}/sosin-phonk-phonk-music-621003.mp3`, duracion: 110 },
            { id: 'sd-n3', nombre: 'Phonk No Copyright', artista: 'ARP Media', genero: 'phonk', url: `${SUPABASE_STORAGE_URL}/arpmedia-phonk-no-copyright-music-588451.mp3`, duracion: 95 },
            { id: 'sd-n4', nombre: 'Gym Workout', artista: 'Echoes of Lumen', genero: 'trap', url: `${SUPABASE_STORAGE_URL}/echoes_of_lumen-sport-phonk-gym-workout-586978.mp3`, duracion: 105 }
        ],
        populares: [
            { id: 'sd-trend1', nombre: 'Aesthetic Vibes', artista: 'Adrihuwu', genero: 'house', url: `${SUPABASE_STORAGE_URL}/adrihuwu-adrihuwu-join-my-server-209103.mp3`, duracion: 134 },
            { id: 'sd-trend2', nombre: 'Corrido Bélico (Trap)', artista: 'LN Plus Music', genero: 'trap', url: `${SUPABASE_STORAGE_URL}/lnplusmusic-cuban-latin-trap-beat-469610.mp3`, duracion: 127 },
            { id: 'sd-reward', nombre: 'Gancho de Éxito', artista: 'Freesound Community', genero: 'electro', url: `${SUPABASE_STORAGE_URL}/freesound_community-victoria_claudia_baja_fidelidad_almacen_exito_cali-79564.mp3`, duracion: 55 },
            { id: 'sd-n5', nombre: 'Dark Aggressive Bass', artista: 'Watermelon Beats', genero: 'phonk', url: `${SUPABASE_STORAGE_URL}/watermelon_beats-phonk-drift-dark-aggressive-bass-612474.mp3`, duracion: 140 },
            { id: 'sd-n6', nombre: 'House Phonk', artista: 'Alex Zavesa', genero: 'house', url: `${SUPABASE_STORAGE_URL}/alexzavesa-house-phonk-short-version-613118.mp3`, duracion: 85 },
            { id: 'sd-n7', nombre: 'Phonk Instrumental', artista: 'Sub Clair', genero: 'phonk', url: `${SUPABASE_STORAGE_URL}/sub_clair-phonk-instrumental-610091.mp3`, duracion: 115 },
            { id: 'sd-n8', nombre: 'Ultrakill', artista: 'Cloud System', genero: 'electro', url: `${SUPABASE_STORAGE_URL}/cloudsystem-ultrakill-46s-621400.mp3`, duracion: 46 }
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
        borradorPaths: null,
        subiendo: false
    };

    let pistaPreviewAudio = null;
    const objectURLsActivas = new Set();

    function $(id) { return document.getElementById(id); }
    function esc(v) {
        const d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }
    function log(...args) { console.log('[VideosPublicar]', ...args); }
    function warn(...args) { console.warn('[VideosPublicar]', ...args); }

    /* Cambia el texto de un elemento solo si existe. Evita errores si el DOM está incompleto. */
    function setTexto(el, texto) {
        if (el) el.textContent = texto;
    }

    /* Cambia el texto de un .cs-preview-txt dentro de una línea de la vista previa. */
    function setTextoLinea(contenedor, texto) {
        if (!contenedor) return;
        const txt = contenedor.querySelector('.cs-preview-txt');
        if (txt) txt.textContent = texto;
    }

    function debouncer(fn, ms) {
        let t = null;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    /* Formatea segundos como m:ss (ej. 134 → 2:14). */
    function fmtDuracion(seg) {
        const s = Math.max(0, Math.floor(Number(seg) || 0));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function generoDe(s) {
        return GENEROS[s && s.genero] || GENEROS.phonk;
    }

    function crearObjectURL(blob) {
        const url = URL.createObjectURL(blob);
        objectURLsActivas.add(url);
        return url;
    }
    function revocarObjectURL(url) {
        if (!url) return;
        try { URL.revokeObjectURL(url); } catch (e) {}
        objectURLsActivas.delete(url);
    }
    function limpiarTodasLasURLs() {
        objectURLsActivas.forEach(url => {
            try { URL.revokeObjectURL(url); } catch (e) {}
        });
        objectURLsActivas.clear();
        state.previewURL = null;
        state.portadaURL = null;
    }

    function textoUbicacion(u) {
        return u ? `${u.nombre}, ${u.pais}` : null;
    }

    function urlSonidoValida(url) {
        if (typeof url !== 'string') return false;
        try {
            const u = new URL(url);
            if (u.origin !== SUPABASE_URL) return false;
            const prefijoPath = '/storage/v1/object/public/audios/';
            return u.pathname.startsWith(prefijoPath) && u.pathname.length > prefijoPath.length;
        } catch (e) {
            return false;
        }
    }

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

    /* ----------------------------------------------------------------
       MARCA DE AGUA (escudo dorado con la "C")
       ---------------------------------------------------------------- */
    function marcaHTML() {
        return '<span class="cs-marca" aria-hidden="true" style="opacity:' + MARCA_AGUA.OPACIDAD + '">' +
            '<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="2" y="2" width="56" height="76" rx="8" fill="none" stroke="#D4AF37" stroke-width="3"/>' +
            '<text x="30" y="58" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="50" fill="#D4AF37">C</text>' +
            '</svg></span>';
    }

    function asegurarMarca(contenedor) {
        if (!MARCA_AGUA.ACTIVA || !contenedor) return;
        if (contenedor.querySelector(':scope > .cs-marca')) return;
        contenedor.insertAdjacentHTML('beforeend', marcaHTML());
    }

    function iniciarMarcaFeed() {
        if (!MARCA_AGUA.ACTIVA) return;
        const cont = $('videosContainer');
        if (!cont) return;
        const aplicar = () => {
            cont.querySelectorAll('.video-card .thumbnail').forEach(asegurarMarca);
        };
        aplicar();
        new MutationObserver(aplicar).observe(cont, { childList: true });
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

    function formatearEspacio(mb) {
        const n = Number(mb) || 0;
        return n >= 1024 ? (Math.round((n / 1024) * 10) / 10) + ' GB' : Math.round(n) + ' MB';
    }

    function descargarBlob(blob, nombre) {
        const url = crearObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre || ('video-' + Date.now() + '.webm');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => revocarObjectURL(url), 4000);
    }

    async function descargarVideoActual() {
        if (state.archivoVideo) {
            descargarBlob(state.archivoVideo, state.archivoVideo.name);
            return;
        }
        if (state.archivoPathRemoto) {
            try {
                const resp = await fetch(urlPublicaBorrador(state.archivoPathRemoto));
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const blob = await resp.blob();
                descargarBlob(blob, state.archivoPathRemoto.split('/').pop());
            } catch (e) {
                csToast('No se pudo descargar el video. Intenta de nuevo.', 'error');
            }
            return;
        }
        csToast('No hay video para descargar', 'warning');
    }

    /* Aviso de cuota. Si el servidor no informa el plan, el texto no asume ninguno. */
    function mostrarAvisoCuota(cuota) {
        document.getElementById('csModalCuota')?.remove();
        const c = cuota || {};
        const planDesconocido = c.plan == null;
        const esPro = c.plan === 'pro';
        const tieneCifras = c.limite_mb != null;

        const overlay = document.createElement('div');
        overlay.id = 'csModalCuota';
        overlay.className = 'cs-confirm-overlay show';
        overlay.style.setProperty('z-index', String(Z.CONFIRM), 'important');

        const modal = document.createElement('div');
        modal.className = 'cs-confirm-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const titulo = document.createElement('div');
        titulo.className = 'cs-confirm-titulo';
        titulo.textContent = 'Alcanzaste el límite de tu espacio';

        const detalle = document.createElement('div');
        detalle.className = 'cs-confirm-mensaje';

        if (planDesconocido) {
            detalle.textContent = (tieneCifras
                ? `Tu espacio disponible es de ${formatearEspacio(c.limite_mb)} y ya lo usaste. `
                : 'Ya usaste el espacio disponible en tu cuenta. ') +
              'Tus videos y borradores siguen guardados. Libera espacio o revisa tus planes para subir más.';
        } else if (esPro) {
            detalle.textContent = tieneCifras
                ? `Tu plan Pro incluye ${formatearEspacio(c.limite_mb)} y ya lo usaste. Libera espacio para seguir subiendo.`
                : 'Ya usaste el espacio de tu plan Pro. Libera espacio para seguir subiendo.';
        } else {
            detalle.textContent = (tieneCifras
                ? `Tu plan gratuito incluye ${formatearEspacio(c.limite_mb)} y ya lo usaste. `
                : 'Ya usaste el espacio de tu plan gratuito. ') +
              'Tus videos y borradores siguen guardados. Para subir más, amplía a Pro o libera espacio.';
        }

        const acciones = document.createElement('div');
        acciones.className = 'cs-confirm-acciones';
        acciones.style.flexDirection = 'column';

        if (!esPro) {
            const btnPro = document.createElement('button');
            btnPro.type = 'button';
            btnPro.className = 'cs-confirm-btn cs-confirm-ok';
            btnPro.textContent = planDesconocido ? 'Ver planes' : 'Subir a Pro · $300 MXN por 5 GB';
            btnPro.addEventListener('click', () => { window.location.href = RUTA_MEMBRESIA_PRO; });
            acciones.appendChild(btnPro);
        }

        const btnDescargar = document.createElement('button');
        btnDescargar.type = 'button';
        btnDescargar.className = 'cs-confirm-btn cs-confirm-cancel';
        btnDescargar.textContent = 'Descargar mi video al teléfono';
        btnDescargar.addEventListener('click', descargarVideoActual);

        const btnCerrar = document.createElement('button');
        btnCerrar.type = 'button';
        btnCerrar.className = 'cs-confirm-btn cs-confirm-cancel';
        btnCerrar.textContent = 'Ahora no';
        btnCerrar.addEventListener('click', () => overlay.remove());

        acciones.append(btnDescargar, btnCerrar);
        modal.append(titulo, detalle, acciones);
        overlay.append(modal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

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
            if (state.archivoVideo) {
                if (state.archivoVideo.size > MAX_FILE_SIZE_FOR_IDB) {
                    warn('Archivo demasiado grande para guardar en IndexedDB. Se omitirá.');
                    await idbDel(KEY_FILE);
                    return;
                }
                await idbSet(KEY_FILE, state.archivoVideo);
            } else {
                await idbDel(KEY_FILE);
            }
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
        } catch (e) { }
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
            let file = await idbGet(KEY_FILE);

            if (file && file.size > MAX_FILE_SIZE_FOR_IDB) {
                warn('Archivo recuperado excede límite. Se descarta.');
                await idbDel(KEY_FILE);
                file = null;
                csToast('El video era demasiado grande para recuperarlo automáticamente.', 'info', 4000);
            }

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

    /* ----------------------------------------------------------------
       VISUALIZADOR: el analizador controla las barras del ecualizador.
       Pausar y reanudar no destruye el contexto de audio.
       ---------------------------------------------------------------- */
    const Visualizador = (function () {
        let ctx = null;
        let analyser = null;
        let fuente = null;
        let datos = null;
        let rafId = null;
        let activo = false;
        let eqActual = null;
        let barrasActual = [];
        let audioActual = null;

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

        function pintarBarras() {
            if (!analyser || !datos || !barrasActual.length) return;
            analyser.getByteFrequencyData(datos);
            const paso = Math.floor(datos.length / barrasActual.length) || 1;
            barrasActual.forEach((barra, i) => {
                const valor = datos[i * paso] || 0;
                const energia = valor / 255;
                barra.style.height = (4 + energia * 22) + 'px';
                barra.style.opacity = String(0.55 + energia * 0.45);
            });
        }

        function bucle() {
            if (!activo) return;
            pintarBarras();
            rafId = requestAnimationFrame(bucle);
        }

        function marcarEq(elementoEq, conAnalizador) {
            eqActual = elementoEq || null;
            barrasActual = eqActual ? Array.from(eqActual.querySelectorAll('.cs-eq-bar')) : [];
            if (eqActual) eqActual.classList.toggle('cs-eq-live', !!conAnalizador);
        }

        function resetearBarras() {
            if (eqActual) eqActual.classList.remove('cs-eq-live');
            barrasActual.forEach(b => { b.style.height = ''; b.style.opacity = ''; });
        }

        function pausar() {
            activo = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            resetearBarras();
        }

        function reanudar(elementoEq, elementoAudio) {
            if (elementoAudio && audioActual === elementoAudio && fuente && analyser) {
                marcarEq(elementoEq, true);
                activo = true;
                bucle();
                return;
            }
            iniciar(elementoEq, elementoAudio);
        }

        function iniciar(elementoEq, elementoAudio) {
            pausar();
            if (fuente) { try { fuente.disconnect(); } catch (e) {} fuente = null; }
            const conAnalizador = elementoAudio ? asegurarContexto(elementoAudio) : false;
            audioActual = elementoAudio || null;
            marcarEq(elementoEq, conAnalizador);
            if (conAnalizador) {
                activo = true;
                bucle();
            }
        }

        function detener() {
            pausar();
            if (fuente) { try { fuente.disconnect(); } catch (e) {} fuente = null; }
            if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
            analyser = null;
            datos = null;
            audioActual = null;
            eqActual = null;
            barrasActual = [];
        }

        return { iniciar, pausar, reanudar, detener };
    })();

    /* ----------------------------------------------------------------
       PREVIEW DE AUDIO: reproducción de 5 s, estado y tiempo para la UI.
       ---------------------------------------------------------------- */
    const AudioPreview = (function () {
        let audio = null;
        let timerId = null;
        let tickId = null;
        let generation = 0;
        let pistaActual = null;
        let estado = 'idle';

        function eqDe(id) {
            return document.querySelector(`[data-art-id="${id}"] .cs-eq`);
        }

        function iniciarTicker() {
            detenerTicker();
            tickId = setInterval(actualizarTiempoFooter, 250);
        }

        function detenerTicker() {
            if (tickId !== null) { clearInterval(tickId); tickId = null; }
        }

        function limpiar() {
            if (timerId !== null) { clearTimeout(timerId); timerId = null; }
            detenerTicker();
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

            Visualizador.iniciar(eqDe(pista.id), nuevoAudio);
            iniciarTicker();

            timerId = setTimeout(() => {
                if (miGeneracion !== generation) return;
                if (audio === nuevoAudio) {
                    try { nuevoAudio.pause(); } catch (e) {}
                    estado = 'paused';
                    Visualizador.pausar();
                    detenerTicker();
                    actualizarTiempoFooter();
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
                Visualizador.pausar();
                detenerTicker();
                actualizarTiempoFooter();
                if (window._audioPreviewOnEstado) window._audioPreviewOnEstado('paused', pistaActual);
            }
        }

        function reanudar() {
            if (audio && estado === 'paused' && pistaActual) {
                audio.play().then(() => {
                    estado = 'playing';
                    Visualizador.reanudar(eqDe(pistaActual.id), audio);
                    iniciarTicker();
                    if (window._audioPreviewOnEstado) window._audioPreviewOnEstado('playing', pistaActual);
                }).catch(() => {});
            }
        }

        function getEstado() { return { estado, pista: pistaActual }; }

        /* Tiempo para la barra inferior. Usa la duración real si ya cargó. */
        function getTiempo() {
            if (!pistaActual) return null;
            const total = (audio && isFinite(audio.duration) && audio.duration > 0)
                ? audio.duration
                : (pistaActual.duracion || 0);
            const actual = audio ? (audio.currentTime || 0) : 0;
            return { actual, total, pista: pistaActual };
        }

        return { reproducir, detener, pausar, reanudar, getEstado, getTiempo };
    })();

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

    function validarIntegridadVideo(file) {
        return new Promise((resolve) => {
            const url = crearObjectURL(file);
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.muted = true;

            const timeout = setTimeout(() => {
                revocarObjectURL(url);
                resolve(false);
            }, 2000);

            v.onloadedmetadata = () => {
                clearTimeout(timeout);
                revocarObjectURL(url);
                resolve(true);
            };
            v.onerror = () => {
                clearTimeout(timeout);
                revocarObjectURL(url);
                resolve(false);
            };

            v.src = url;
        });
    }

    async function subirMultimediaSupabase(archivo, tipo) {
        const session = await obtenerSesion();
        if (!session) return { ok: false, error: 'Sin sesión activa' };
        const token = session.access_token;
        if (!token) return { ok: false, error: 'Sin token de sesión' };

        if (tipo === 'video') {
            const esValido = await validarIntegridadVideo(archivo);
            if (!esValido) {
                return { ok: false, error: 'El archivo de video está corrupto o no es válido.' };
            }
        }

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
            if (data && data.error === 'cuota_excedida') {
                const cuota = {
                    plan: data.plan,
                    limite_mb: data.limite_mb,
                    usado_mb: data.usado_mb,
                    disponible_mb: data.disponible_mb
                };
                mostrarAvisoCuota(cuota);
                return {
                    ok: false,
                    error: data.mensaje || 'Alcanzaste el límite de tu espacio.',
                    cuotaExcedida: true,
                    status: respuesta.status,
                    cuota
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

    async function contarBorradores(sb, usuarioId) {
        const { count, error } = await sb
            .from('videos_borradores')
            .select('id', { count: 'exact', head: true })
            .eq('usuario_id', usuarioId);
        if (error) throw new Error('No se pudo verificar tus borradores');
        return count || 0;
    }

    async function consultarCuotaCliente(session) {
        try {
            const resp = await fetch('/api/media/cuota', {
                headers: { 'Authorization': 'Bearer ' + session.access_token }
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data && data.ok ? data : null;
        } catch (e) {
            return null;
        }
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

        if (!state.borradorEditandoId) {
            const total = await contarBorradores(sb, session.user.id);
            if (total >= LIMITE_BORRADORES) {
                csToast(`Ya tienes ${LIMITE_BORRADORES} borradores. Elimina uno para guardar otro.`, 'warning', 5000);
                return;
            }
            const cuota = await consultarCuotaCliente(session);
            if (cuota && Number(cuota.usado_mb) >= Number(cuota.limite_mb)) {
                mostrarAvisoCuota(cuota);
                return;
            }
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

            const sonidoValido = sonido && urlSonidoValida(sonido.url) ? sonido : null;

            const fila = {
                usuario_id: usuarioId,
                titulo: titulo || null,
                descripcion: descripcion || null,
                sonido_id: sonidoValido ? sonidoValido.id : null,
                sonido_nombre: sonidoValido ? `${sonidoValido.nombre} — ${sonidoValido.artista}` : null,
                sonido_url: sonidoValido ? sonidoValido.url : null,
                ubicacion_nombre: textoUbicacion(ubicacion),
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
            const msg = String(e.message || '');
            if (msg.includes('limite_borradores')) {
                csToast(`Ya tienes ${LIMITE_BORRADORES} borradores. Elimina uno para guardar otro.`, 'warning', 5000);
            } else if (msg.includes('cuota_excedida')) {
                mostrarAvisoCuota({ plan: null, limite_mb: null, usado_mb: null, disponible_mb: 0 });
            } else {
                csToast(msg || 'No se pudo guardar el borrador', 'error', 4000);
            }
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
            else state.sonidoSeleccionado = null;
        } else {
            state.sonidoSeleccionado = null;
        }

        state.ubicacionSeleccionada = data.ubicacion_nombre
            ? UBICACIONES_SEED.find(u => textoUbicacion(u) === data.ubicacion_nombre) || null
            : null;

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
        setTextoLinea(pSon, s ? `${s.nombre} — ${s.artista}` : vt('videos_preview_sin_sonido', 'Sin sonido'));
        setTextoLinea(pUb, u ? textoUbicacion(u) : vt('videos_preview_sin_ubicacion', 'Sin ubicación'));
        actualizarBadgePreview();
    }

    function obtenerPortada(file) {
        return new Promise((resolve) => {
            const desdeCamara = window.__csMiniaturaCamara;
            if (desdeCamara && file.name.indexOf('video-camara-') === 0) {
                resolve(desdeCamara);
                return;
            }

            const url = crearObjectURL(file);
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
                revocarObjectURL(url);
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
            revocarObjectURL(state.portadaURL);
            state.portadaURL = null;
        }
        state.portadaBlob = blob || null;
        if (blob) {
            state.portadaURL = crearObjectURL(blob);
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
            revocarObjectURL(state.previewURL);
            state.previewURL = null;
        }
        state.previewURL = crearObjectURL(file);

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
            revocarObjectURL(state.previewURL);
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

        asegurarMarca(d.querySelector('.cs-prev-stage'));

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

        if (sonido && urlSonidoValida(sonido.url)) {
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

    function obtenerBotonPublicar() {
        const form = $('formSubirVideo');
        return $('btnSubirVideo') || (form ? form.querySelector('button[type="submit"]') : null);
    }

    function publicarDesdePreview() {
        if (state.subiendo) {
            csToast('Ya hay una publicación en curso', 'warning');
            return;
        }

        const form = $('formSubirVideo');
        const boton = obtenerBotonPublicar();
        if (!form || !boton) {
            csToast('No se encontró el botón de publicar', 'error');
            return;
        }

        state.subiendo = true;
        if (boton) boton.disabled = true;

        cerrarPreview();

        try {
            if (typeof form.requestSubmit === 'function') form.requestSubmit(boton);
            else boton.click();
        } catch (e) {
            state.subiendo = false;
            if (boton) boton.disabled = false;
            csToast('Error al iniciar publicación', 'error');
        }
    }

    function resetFormularioPublicacion() {
        state.subiendo = false;
        const btnPub = obtenerBotonPublicar();
        if (btnPub) btnPub.disabled = false;

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
            revocarObjectURL(state.previewURL);
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
        setTextoLinea($('csPreviewSonido'), vt('videos_preview_sin_sonido', 'Sin sonido'));
        setTextoLinea($('csPreviewUbicacion'), vt('videos_preview_sin_ubicacion', 'Sin ubicación'));

        const badge = $('csPreviewBadge');
        if (badge) badge.style.display = 'none';

        actualizarTextoBotonArchivo(null);
        actualizarBotonQuitar(false);

        const progressEl = $('uploadProgress');
        const progressFill = $('progressFill');
        const progressText = $('progressText');
        if (progressEl) progressEl.style.display = 'none';
        setTexto(progressFill, '');
        if (progressFill) progressFill.style.width = '0%';
        setTexto(progressText, '0%');

        const pFill = $('processingProgressFill');
        const pText = $('processingProgressText');
        if (pFill) pFill.style.width = '0%';
        setTexto(pText, '0%');

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
    }
    window.csRefrescarFeedVideos = refrescarFeedAutomatico;

    function inyectarEstilosFeed() {
        if ($('cs-feed-ui')) return;
        const ocultar = [];
        if (FEED_UI.ocultarLikes) ocultar.push('.video-card .like-btn');
        if (FEED_UI.ocultarCompartir) ocultar.push('.video-card .btn-compartir-premium');
        if (FEED_UI.ocultarReacciones) ocultar.push('.video-card .reaccion-picker');

        const st = document.createElement('style');
        st.id = 'cs-feed-ui';
        st.textContent = ocultar.length ? ocultar.join(',') + ' { display: none !important; }' : '';
        document.head.appendChild(st);
    }

    /* ----------------------------------------------------------------
       FAVORITOS (por dispositivo, en localStorage)
       ---------------------------------------------------------------- */
    function cargarFavoritos() {
        try {
            const arr = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
            return Array.isArray(arr) ? arr.filter(id => typeof id === 'string') : [];
        } catch (e) {
            return [];
        }
    }

    let favoritos = cargarFavoritos();

    function guardarFavoritos() {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(favoritos)); } catch (e) {}
    }

    function esFavorito(id) {
        return favoritos.indexOf(id) !== -1;
    }

    function listaFavoritos() {
        return favoritos.map(buscarSonidoPorId).filter(Boolean);
    }

    function alternarFavorito(id) {
        const i = favoritos.indexOf(id);
        if (i === -1) favoritos.push(id);
        else favoritos.splice(i, 1);
        guardarFavoritos();
        actualizarContadorFavoritos();
    }

    function actualizarContadorFavoritos() {
        const n = listaFavoritos().length;
        document.querySelectorAll('.cs-tab-count[data-count="favoritos"]').forEach(el => {
            el.textContent = n > 0 ? String(n) : '';
            el.style.display = n > 0 ? 'inline-flex' : 'none';
        });
    }

    /* ----------------------------------------------------------------
       ESTILOS INYECTADOS (una sola vez)
       Componentes que no están en videos-publicar.css: pestañas, filas de
       sonidos y ubicaciones, estados de reproducción, vista previa modal,
       borradores y marca de agua.
       ---------------------------------------------------------------- */
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

            /* Botones del header con sonido o ubicación elegidos */
            .cs-btn-header.cs-activo {
                background: rgba(212, 175, 55, 0.12);
                border-color: #D4AF37;
            }
            .cs-btn-ubicacion.cs-activo {
                background: rgba(0, 229, 255, 0.10);
                border-color: #00E5FF;
            }

            @keyframes cs-spin-inline { to { transform: rotate(360deg); } }

            /* ---- Marca de agua (escudo con la "C") ---- */
            .cs-marca {
                position: absolute; top: 12px; left: 12px; z-index: 7;
                width: 56px; height: 75px; pointer-events: none;
                filter: drop-shadow(0 2px 6px rgba(0,0,0,.65));
            }
            .cs-marca svg { width: 100%; height: 100%; display: block; }
            .cs-prev-stage .cs-marca { top: 70px; left: 14px; width: 60px; height: 80px; }
            .cs-preview-video .cs-marca { top: 12px; left: 12px; width: 48px; height: 64px; }
            @media (max-width: 480px) { .cs-marca { width: 56px; height: 75px; } }

            /* ---- Vista previa del video dentro de la publicación ---- */
            .cs-preview-video {
                position: relative; width: 100%; height: min(78vh, 720px);
                background: #000; border-radius: 14px; overflow: hidden;
                box-shadow: 0 0 18px rgba(255,43,214,.18);
                aspect-ratio: 9 / 16;
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

            /* ---- Vista previa a pantalla completa ---- */
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

            /* ---- Sheets de sonidos y ubicación: encabezado fijo y lista con scroll ---- */
            .cs-sheet .cs-sheet-body {
                flex: 1; min-height: 0; overflow: hidden;
                display: flex; flex-direction: column;
                padding: 0 14px;
            }
            .cs-sheet-fijo {
                flex-shrink: 0;
                padding: 12px 0 6px;
                background: #0b1410;
                position: relative; z-index: 2;
            }
            .cs-sonidos-lista, .cs-ubicaciones-lista {
                flex: 1; min-height: 0;
                overflow-y: auto; overscroll-behavior: contain;
                -webkit-overflow-scrolling: touch;
                padding-bottom: 12px;
            }

            /* ---- Pestañas de sonidos ---- */
            .cs-tabs { display: flex; gap: 4px; padding: 10px 14px 0; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
            .cs-tab {
                flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                padding: 8px 10px; background: transparent; border: none;
                border-bottom: 2px solid transparent; color: #9fb4c8;
                font-size: .72rem; font-weight: 700; cursor: pointer;
                transition: color .2s ease, border-color .2s ease;
            }
            .cs-tab.active { color: #fff; border-bottom-color: #ff2bd6; text-shadow: 0 0 10px rgba(255,43,214,.6); }
            .cs-tab-count {
                display: none; align-items: center; justify-content: center;
                min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
                background: rgba(255,43,214,.2); color: #ff2bd6; font-size: .6rem; font-weight: 800;
            }

            /* ---- Biblioteca de sonidos ---- */
            .cs-sonido-item {
                display: flex; align-items: center; gap: 12px;
                padding: 10px 4px;
                border-bottom: 1px solid rgba(255,255,255,.05);
                cursor: pointer; position: relative;
                transition: background .2s ease, transform .15s ease;
                animation: cs-fila-in .28s ease both;
                animation-delay: calc(var(--i, 0) * 18ms);
                outline: none;
            }
            .cs-sonido-item:hover { background: rgba(255,255,255,.025); }
            .cs-sonido-item:focus-visible { box-shadow: inset 0 0 0 1px #00f0ff; }
            .cs-sonido-item:active { transform: scale(.985); }
            .cs-sonido-item.activo { background: linear-gradient(90deg, rgba(255,43,214,.10), rgba(0,240,255,.06)); }
            @keyframes cs-fila-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

            .cs-sonido-art {
                position: relative; width: 46px; height: 46px; flex: 0 0 46px;
                border-radius: 12px; overflow: hidden;
                display: grid; place-items: center;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 4px 12px rgba(0,0,0,.4);
                cursor: pointer;
            }
            .cs-sonido-glyph {
                font-size: 1rem; color: rgba(255,255,255,.88);
                text-shadow: 0 0 10px rgba(255,255,255,.35);
                transition: opacity .2s ease;
            }
            .cs-sonido-play-ico {
                position: absolute; font-size: .9rem; color: #fff; opacity: 0;
                text-shadow: 0 0 8px rgba(0,0,0,.7);
                transition: opacity .2s ease;
            }
            .cs-sonido-art:hover .cs-sonido-play-ico { opacity: 1; }
            .cs-sonido-art:hover .cs-sonido-glyph { opacity: 0; }

            .cs-eq {
                position: absolute; inset: 0; display: none;
                align-items: flex-end; justify-content: center; gap: 3px;
                padding-bottom: 9px; background: rgba(0,0,0,.38);
                pointer-events: none;
            }
            .cs-eq-bar {
                width: 3px; height: 5px; border-radius: 3px;
                background: var(--eq-c, #ff2bd6);
                box-shadow: 0 0 6px var(--eq-c, #ff2bd6);
            }
            /* Modo analizador: la altura la fija el audio en tiempo real */
            .cs-eq.cs-eq-live .cs-eq-bar { animation: none; transition: height .08s linear, opacity .08s linear; }
            /* Modo respaldo: animación CSS cuando el navegador no da analizador */
            .cs-eq:not(.cs-eq-live) .cs-eq-bar { animation: cs-eq-bounce .8s ease-in-out infinite; }
            .cs-eq-bar:nth-child(2) { animation-delay: .12s !important; }
            .cs-eq-bar:nth-child(3) { animation-delay: .24s !important; }
            .cs-eq-bar:nth-child(4) { animation-delay: .36s !important; }
            .cs-eq-bar:nth-child(5) { animation-delay: .48s !important; }
            .cs-eq-bar:nth-child(6) { animation-delay: .6s !important; }
            @keyframes cs-eq-bounce { 0%,100% { height: 5px; } 50% { height: 22px; } }

            .cs-sonido-info { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
            .cs-sonido-nombre {
                color: #fff; font-weight: 700; font-size: .86rem; letter-spacing: .2px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cs-sonido-artista {
                color: #9fb4c8; font-size: .7rem;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cs-sonido-genero { color: #c9b6ff; }

            .cs-fav-btn {
                flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%;
                border: 1px solid rgba(255,255,255,.12); background: transparent;
                color: #8fa1b3; font-size: 1rem; cursor: pointer;
                display: grid; place-items: center; padding: 0;
                transition: color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .15s ease;
            }
            .cs-fav-btn:active { transform: scale(.88); }
            .cs-fav-btn.on {
                color: #ff2bd6; border-color: rgba(255,43,214,.6);
                text-shadow: 0 0 8px #ff2bd6;
                box-shadow: 0 0 12px rgba(255,43,214,.35);
                animation: cs-fav-pop .3s ease;
            }
            @keyframes cs-fav-pop { 0% { transform: scale(.8); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }

            .cs-sonido-check { color: #ff2bd6; text-shadow: 0 0 8px #ff2bd6; opacity: 0; font-size: .85rem; flex-shrink: 0; }
            .cs-sonido-item.activo .cs-sonido-check { opacity: 1; }

            /* Estados de reproducción por fila */
            .cs-sonido-item.cs-sonando { background: linear-gradient(90deg, rgba(255,43,214,.14), rgba(0,240,255,.10)); }
            .cs-sonido-item.cs-sonando .cs-sonido-art {
                box-shadow: 0 0 0 2px #00f0ff, 0 0 18px rgba(255,43,214,.55);
            }
            .cs-sonido-item.cs-sonando .cs-sonido-glyph,
            .cs-sonido-item.cs-sonando .cs-sonido-play-ico { display: none; }
            .cs-sonido-item.cs-sonando .cs-eq { display: flex; }
            .cs-sonido-item.cs-sonando .cs-sonido-nombre {
                background: linear-gradient(90deg,#ff2bd6,#00f0ff,#39ff14);
                -webkit-background-clip: text; background-clip: text; color: transparent;
            }
            .cs-sonido-item.cs-cargando .cs-sonido-glyph { opacity: 0; }
            .cs-sonido-item.cs-cargando .cs-sonido-play-ico {
                opacity: 1; color: #00f0ff; text-shadow: 0 0 8px #00f0ff;
                animation: cs-spin-inline .8s linear infinite;
            }
            .cs-sonido-item.cs-pausado .cs-sonido-glyph { opacity: 0; }
            .cs-sonido-item.cs-pausado .cs-sonido-play-ico { opacity: 1; color: #ffe600; text-shadow: 0 0 8px #ffe600; }
            .cs-sonido-item.cs-error .cs-sonido-glyph { opacity: 0; }
            .cs-sonido-item.cs-error .cs-sonido-play-ico { opacity: 1; color: #ff3d7f; text-shadow: 0 0 8px #ff3d7f; }

            .cs-vacio-favs { text-align: center; padding: 34px 18px; color: #9fb4c8; }
            .cs-vacio-favs .cs-vacio-ico { display: block; font-size: 2rem; color: #ff2bd6; text-shadow: 0 0 10px #ff2bd6; margin-bottom: 10px; }
            .cs-vacio-favs p { font-size: .8rem; line-height: 1.5; margin: 0; }

            /* ---- Barra inferior del sheet de sonidos ---- */
            .cs-footer-sonido { align-items: center; gap: 12px; }
            .cs-footer-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
            .cs-sonido-actual {
                color: #00f0ff; text-shadow: 0 0 8px rgba(0,240,255,.4);
                font-size: .76rem; font-weight: 600;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cs-sonido-meta { display: flex; align-items: center; gap: 8px; }
            .cs-sonido-tiempo {
                font-size: .66rem; color: #9fb4c8;
                font-variant-numeric: tabular-nums; white-space: nowrap;
            }
            .cs-sonido-prog {
                flex: 1; height: 3px; border-radius: 3px;
                background: rgba(255,255,255,.12); overflow: hidden;
            }
            .cs-sonido-prog > span {
                display: block; height: 100%; width: 0%;
                background: linear-gradient(90deg,#ff2bd6,#00f0ff);
                transition: width .25s linear;
            }
            .cs-footer-sonido .cs-btn-primary { flex-shrink: 0; }

            /* ---- Ubicaciones ---- */
            .cs-ubicacion-item { display: flex; align-items: center; gap: 12px; padding: 12px 4px; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,.05); cursor: pointer; text-align: left; color: var(--text-primary); }
            .cs-ubicacion-item:hover { background: rgba(255,255,255,.025); }
            .cs-ubicacion-item.activo { background: rgba(0,229,255,.06); }
            .cs-ubicacion-ico { font-size: .8rem; color: var(--cyan); }
            .cs-ubicacion-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
            .cs-ubicacion-nombre { color: var(--text-primary); font-weight: 600; font-size: .85rem; }
            .cs-ubicacion-pais { color: var(--text-muted); font-size: .7rem; }
            .cs-ubicacion-check { color: var(--cyan); font-size: .9rem; opacity: 0; }
            .cs-ubicacion-item.activo .cs-ubicacion-check { opacity: 1; }
            .cs-ubicacion-actual { flex: 1; min-width: 0; font-size: .76rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            /* ---- Borradores ---- */
            .cs-borrador-item { display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid rgba(255,43,214,0.35); border-radius: 12px; background: linear-gradient(120deg, rgba(255,43,214,.08), rgba(0,240,255,.06)); margin-bottom: 8px; box-shadow: 0 0 14px rgba(255,43,214,.12); }
            .cs-borrador-portada { width: 48px; height: 64px; border-radius: 8px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; color: #00f0ff; flex-shrink: 0; box-shadow: 0 0 10px rgba(0,240,255,.35); }
            .cs-borrador-portada img { width: 100%; height: 100%; object-fit: cover; }
            .cs-borrador-info { flex: 1; min-width: 0; }
            .cs-borrador-titulo { color: #fff; font-weight: 700; font-size: .82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cs-borrador-meta { color: #9fb4c8; font-size: .66rem; margin-top: 3px; }
            .cs-borrador-acciones { display: flex; flex-direction: column; gap: 6px; }
            .cs-borrador-acciones .cs-btn-ghost { padding: 6px 10px; font-size: .6rem; }
            .cs-btn-peligro { border-color: rgba(255,61,127,.6) !important; color: #ff3d7f !important; }

            .cs-btn-primary:not(:disabled):active { transform: scale(.97); }

            @media (prefers-reduced-motion: reduce) {
                .cs-sonido-item, .cs-fav-btn.on, #csPreviewBadge { animation: none !important; }
                .cs-eq:not(.cs-eq-live) .cs-eq-bar { animation: none !important; height: 14px; }
                .cs-sonido-item.cs-cargando .cs-sonido-play-ico { animation: none !important; }
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
                    <button type="button" role="tab" class="cs-tab active" data-tab="parati"><span data-clave="videos_sonidos_parati">Para ti</span></button>
                    <button type="button" role="tab" class="cs-tab" data-tab="populares"><span data-clave="videos_sonidos_populares">Populares</span></button>
                    <button type="button" role="tab" class="cs-tab" data-tab="favoritos"><span data-clave="videos_sonidos_favoritos">Favoritos</span><span class="cs-tab-count" data-count="favoritos"></span></button>
                </div>
                <div class="cs-sheet-body">
                    <div class="cs-sheet-fijo">
                        <div class="cs-buscar-wrap">
                            <span class="cs-ico-buscar">◇</span>
                            <input type="text" id="csBuscarSonido" data-placeholder="videos_buscar_sonido" placeholder="Buscar pista o artista..." autocomplete="off" />
                        </div>
                    </div>
                    <div class="cs-sonidos-lista" id="csSonidosLista"></div>
                </div>
                <div class="cs-sheet-footer cs-footer-sonido">
                    <div class="cs-footer-info">
                        <div class="cs-sonido-actual" id="csSonidoActualInfo" data-clave="videos_sonido_sin_sel">Sin sonido seleccionado</div>
                        <div class="cs-sonido-meta">
                            <span class="cs-sonido-tiempo" id="csSonidoTiempo">0:00 / 0:00</span>
                            <div class="cs-sonido-prog"><span id="csSonidoProg"></span></div>
                        </div>
                    </div>
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
                    <div class="cs-sheet-fijo">
                        <div class="cs-buscar-wrap">
                            <span class="cs-ico-buscar">◇</span>
                            <input type="text" id="csBuscarUbicacion" data-placeholder="videos_buscar_ubicacion" placeholder="Buscar ciudad o municipio..." autocomplete="off" />
                        </div>
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
        engancharListaSonidos();
        engancharListaUbicaciones();
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
        asegurarMarca(wrap.querySelector('.cs-preview-video'));

        $('csBtnVistaPrevia').addEventListener('click', abrirPreview);
        $('csBtnVerBorradores').addEventListener('click', abrirModalBorradores);
        $('csBtnGuardarBorrador').addEventListener('click', guardarBorrador);
        $('csQuitarVideo').addEventListener('click', quitarVideoSeleccionado);
        $('csBtnQuitarVideo').addEventListener('click', quitarVideoSeleccionado);
        actualizarBotonQuitar(false);
    }

    /* Oculta el input original y pone en su lugar el botón plano (estilo en videos-composer-pro.css). */
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
                <span class="cs-file-btn-ico" aria-hidden="true">▶</span>
                <span class="cs-file-btn-txt" id="csFileBtnTxt" data-clave="videos_elegir_galeria">Elegir video de la galería</span>
                <span class="cs-file-btn-hint" id="csFileBtnHint" data-clave="videos_archivo_hint">MP4 · WebM · MOV · Máx 100 MB</span>
            </button>`;
        if (input.parentNode) input.parentNode.insertBefore(btnWrap, input.nextSibling);

        btnWrap.querySelector('#csFileBtnVideo').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.click();
        });

        log('✅ Input file transformado en botón plano');
    }

    function abrirModalSonidos() {
        renderSonidos(state.tabSonidosActiva, '');
        actualizarContadorFavoritos();
        pintarFooterSonido(state.sonidoSeleccionado, state.sonidoSeleccionado ? (AudioPreview.getTiempo() || null) : null);
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

    /* Clase de estado para una fila según la reproducción actual. */
    function claseEstadoFila(id) {
        const actual = AudioPreview.getEstado();
        if (!actual.pista || actual.pista.id !== id) return '';
        if (actual.estado === 'loading') return 'cs-cargando';
        if (actual.estado === 'playing') return 'cs-sonando';
        if (actual.estado === 'paused') return 'cs-pausado';
        if (actual.estado === 'error') return 'cs-error';
        return '';
    }

    /* Actualiza solo las clases de las filas visibles (sin volver a renderizar). */
    function actualizarIndicadorSonido(estado, pista, error) {
        document.querySelectorAll('#csSonidosLista .cs-sonido-item').forEach(el => {
            const esActivo = pista && el.dataset.sonidoId === pista.id;
            el.classList.remove('cs-sonando', 'cs-cargando', 'cs-pausado', 'cs-error');
            if (!esActivo) return;
            if (estado === 'loading') el.classList.add('cs-cargando');
            else if (estado === 'playing') el.classList.add('cs-sonando');
            else if (estado === 'paused') el.classList.add('cs-pausado');
            else if (estado === 'error') el.classList.add('cs-error');
        });
        if (estado === 'error') {
            const mensaje = error && error.indexOf('timeout') !== -1
                ? 'La pista tardó demasiado en cargar.'
                : 'No se pudo reproducir esta pista.';
            csToast(mensaje, 'error', 3500);
        }
        if (estado === 'loading' || estado === 'playing' || estado === 'paused') {
            actualizarTiempoFooter();
        }
    }
    window._audioPreviewOnEstado = actualizarIndicadorSonido;

    function filaEqualizador() {
        const barras = EQ_COLORES.map(function (color) {
            return `<span class="cs-eq-bar" style="--eq-c:${color}"></span>`;
        }).join('');
        return `<span class="cs-eq" aria-hidden="true">${barras}</span>`;
    }

    function filaSonidoHTML(s, indice) {
        const activo = state.sonidoSeleccionado && state.sonidoSeleccionado.id === s.id;
        const g = generoDe(s);
        const fav = esFavorito(s.id);
        const clases = ['cs-sonido-item'];
        if (activo) clases.push('activo');
        const estadoClase = claseEstadoFila(s.id);
        if (estadoClase) clases.push(estadoClase);
        return `
            <div class="${clases.join(' ')}" tabindex="0" data-sonido-id="${esc(s.id)}" style="--i:${Math.min(indice, 12)}">
                <span class="cs-sonido-art" data-art-id="${esc(s.id)}" style="background:${g.bg}" role="button" aria-label="Reproducir o pausar">
                    <span class="cs-sonido-glyph" aria-hidden="true">${g.glyph}</span>
                    <span class="cs-sonido-play-ico" aria-hidden="true">▶</span>
                    ${filaEqualizador()}
                </span>
                <span class="cs-sonido-info">
                    <span class="cs-sonido-nombre">${esc(s.nombre)}</span>
                    <span class="cs-sonido-artista">${esc(s.artista)} · <span class="cs-sonido-genero">${esc(g.label)}</span> · ${esc(fmtDuracion(s.duracion))}</span>
                </span>
                <button type="button" class="cs-fav-btn ${fav ? 'on' : ''}" data-fav-id="${esc(s.id)}" aria-pressed="${fav ? 'true' : 'false'}" aria-label="${fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}">${fav ? '♥' : '♡'}</button>
                <span class="cs-sonido-check" aria-hidden="true">◆</span>
            </div>`;
    }

    function mensajeVacioSonidos(term) {
        if (term) {
            return `<div class="cs-vacio"><span class="cs-ico-vacio">♪</span><p>${esc(vt('videos_sin_resultados', 'Sin resultados.'))}</p></div>`;
        }
        if (state.tabSonidosActiva === 'favoritos') {
            return `<div class="cs-vacio-favs"><span class="cs-vacio-ico">♡</span><p>${esc(vt('videos_fav_vacio', 'Aún no tienes favoritos. Toca ♡ en cualquier sonido para guardarlo aquí.'))}</p></div>`;
        }
        return `<div class="cs-vacio"><span class="cs-ico-vacio">♪</span><p>${esc(vt('videos_sin_pistas', 'Sin pistas en esta sección.'))}</p></div>`;
    }

    function renderSonidos(tab, filtro) {
        state.tabSonidosActiva = tab || 'parati';
        const lista = $('csSonidosLista');
        if (!lista) return;

        document.querySelectorAll('#csModalSonidos .cs-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === state.tabSonidosActiva);
        });

        const term = (filtro || '').toLowerCase().trim();
        let arr = state.tabSonidosActiva === 'favoritos'
            ? listaFavoritos()
            : (SONIDOS_SEED[state.tabSonidosActiva] || []);

        if (term) {
            arr = arr.filter(s => {
                const etiqueta = (s.nombre + ' ' + s.artista + ' ' + generoDe(s).label).toLowerCase();
                return etiqueta.indexOf(term) !== -1;
            });
        }

        if (!arr.length) {
            lista.innerHTML = mensajeVacioSonidos(term);
            return;
        }

        lista.innerHTML = arr.map((s, i) => filaSonidoHTML(s, i)).join('');
        lista.scrollTop = 0;
    }

    function togglePreview(id) {
        const actual = AudioPreview.getEstado();
        if (actual.pista && actual.pista.id === id) {
            if (actual.estado === 'playing') AudioPreview.pausar();
            else if (actual.estado === 'paused') AudioPreview.reanudar();
            return;
        }
        previsualizarSonido(id);
    }

    function pintarBotonFav(btn, activo) {
        btn.classList.toggle('on', activo);
        btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
        btn.setAttribute('aria-label', activo ? 'Quitar de favoritos' : 'Guardar en favoritos');
        btn.textContent = activo ? '♥' : '♡';
    }

    /* Un solo listener delegado para toda la lista (sin uno por fila). */
    function engancharListaSonidos() {
        const lista = $('csSonidosLista');
        if (!lista || lista.dataset.enganchada === '1') return;
        lista.dataset.enganchada = '1';

        lista.addEventListener('click', (e) => {
            const fav = e.target.closest('[data-fav-id]');
            if (fav) {
                e.stopPropagation();
                const id = fav.dataset.favId;
                alternarFavorito(id);
                pintarBotonFav(fav, esFavorito(id));
                if (state.tabSonidosActiva === 'favoritos') {
                    renderSonidos('favoritos', ($('csBuscarSonido') || {}).value || '');
                }
                return;
            }

            const art = e.target.closest('[data-art-id]');
            if (art) {
                e.stopPropagation();
                togglePreview(art.dataset.artId);
                return;
            }

            const fila = e.target.closest('[data-sonido-id]');
            if (fila) seleccionarSonido(fila.dataset.sonidoId);
        });

        lista.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const fila = e.target.closest && e.target.closest('.cs-sonido-item');
            if (!fila) return;
            e.preventDefault();
            seleccionarSonido(fila.dataset.sonidoId);
        });
    }

    function buscarSonidoPorId(id) {
        const todas = [].concat(SONIDOS_SEED.parati).concat(SONIDOS_SEED.populares);
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

        document.querySelectorAll('#csSonidosLista .cs-sonido-item').forEach(el => {
            el.classList.toggle('activo', el.dataset.sonidoId === id);
        });

        const info = $('csSonidoActualInfo');
        if (info) {
            info.removeAttribute('data-clave');
            info.textContent = `${s.nombre} — ${s.artista}`;
        }
        const btn = $('csBtnConfirmarSonido');
        if (btn) btn.disabled = false;

        pintarFooterSonido(s, AudioPreview.getTiempo());
    }

    /* Barra inferior: tiempo transcurrido / total y progreso. */
    function pintarFooterSonido(pista, tiempo) {
        const txt = $('csSonidoTiempo');
        const prog = $('csSonidoProg');
        if (!txt || !prog) return;
        if (!pista) {
            txt.textContent = '0:00 / 0:00';
            prog.style.width = '0%';
            return;
        }
        const actual = tiempo && tiempo.pista && tiempo.pista.id === pista.id ? tiempo.actual : 0;
        const total = tiempo && tiempo.pista && tiempo.pista.id === pista.id
            ? tiempo.total
            : (pista.duracion || 0);
        txt.textContent = fmtDuracion(actual) + ' / ' + fmtDuracion(total);
        const pct = total > 0 ? Math.min(100, (actual / total) * 100) : 0;
        prog.style.width = pct + '%';
    }

    function actualizarTiempoFooter() {
        const t = AudioPreview.getTiempo();
        if (!t) return;
        pintarFooterSonido(t.pista, t);
    }

    function confirmarSonido() {
        actualizarResumenPreview();
        actualizarBotonesSonidoUbicacion();
        persistirMetaDebounced();
        const s = state.sonidoSeleccionado;
        const valido = s && urlSonidoValida(s.url) ? s : null;
        window.dispatchEvent(new CustomEvent('csariels:sonido:seleccionado', {
            detail: valido ? { id: valido.id, nombre: valido.nombre, artista: valido.artista, url: valido.url, duracion: valido.duracion } : null
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
    }

    function engancharListaUbicaciones() {
        const lista = $('csUbicacionesLista');
        if (!lista || lista.dataset.enganchada === '1') return;
        lista.dataset.enganchada = '1';
        lista.addEventListener('click', (e) => {
            const item = e.target.closest('[data-ubicacion-id]');
            if (item) seleccionarUbicacion(item.dataset.ubicacionId);
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
            info.textContent = textoUbicacion(u);
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
            state.subiendo = false;
            resetFormularioPublicacion();
            setTimeout(refrescarFeedAutomatico, 300);
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

        /* Cambio de pestaña: solo re-renderiza si realmente cambia. */
        document.addEventListener('click', function (e) {
            const tab = e.target.closest && e.target.closest('#csModalSonidos .cs-tab[data-tab]');
            if (!tab) return;
            if (tab.dataset.tab === state.tabSonidosActiva) return;
            renderSonidos(tab.dataset.tab, ($('csBuscarSonido') || {}).value || '');
        });

        const buscarSonidoDeb = debouncer((valor) => {
            renderSonidos(state.tabSonidosActiva, valor);
        }, 120);
        const buscarUbicacionDeb = debouncer((valor) => {
            renderUbicaciones(valor);
        }, 120);

        document.addEventListener('input', function (e) {
            if (!e.target) return;
            if (e.target.id === 'csBuscarSonido') buscarSonidoDeb(e.target.value);
            if (e.target.id === 'csBuscarUbicacion') buscarUbicacionDeb(e.target.value);
        });

        document.addEventListener('click', function (e) {
            if (e.target && e.target.id === 'csBtnConfirmarSonido') confirmarSonido();
            if (e.target && e.target.id === 'csBtnConfirmarUbicacion') confirmarUbicacion();
        });

        /* Limpieza al salir: solo recursos de la vista previa y URLs temporales. */
        window.addEventListener('beforeunload', () => {
            AudioPreview.detener();
            detenerPistaPreview();
            limpiarTodasLasURLs();
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
        mostrarAvisoCuota,
        getConfig: () => ({ ...CONFIG, FEED_UI: { ...FEED_UI }, MARCA_AGUA: { ...MARCA_AGUA }, LIMITE_BORRADORES, RUTA_MEMBRESIA_PRO }),
        setProvider: (p) => { CONFIG.PROVIDER = p; },
        setFeedUI: (parcial) => { Object.assign(FEED_UI, parcial || {}); const old = $('cs-feed-ui'); if (old) old.remove(); inyectarEstilosFeed(); },
        getState: () => {
            const sonido = state.sonidoSeleccionado && urlSonidoValida(state.sonidoSeleccionado.url)
                ? state.sonidoSeleccionado
                : null;
            return {
                sonido,
                sonidoUrl: sonido ? sonido.url : null,
                sonidoNombre: sonido ? `${sonido.nombre} — ${sonido.artista}` : null,
                ubicacion: state.ubicacionSeleccionada,
                ubicacionNombre: textoUbicacion(state.ubicacionSeleccionada),
                archivoVideo: state.archivoVideo ? state.archivoVideo.name : null,
                archivoConAudioMezclado: state.archivoConAudioMezclado === true,
                borradorId: state.borradorEditandoId,
                subiendo: state.subiendo
            };
        },
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
        iniciarMarcaFeed();
        actualizarBotonesSonidoUbicacion();
        await restaurarLocal();
        log('✅ Módulo Publicar v4.0 listo');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
