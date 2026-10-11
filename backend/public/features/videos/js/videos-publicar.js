/* ================================================================
   CSARIEL'S · VIDEOS · MÓDULO PUBLICAR v1.2
   ================================================================
   FASE 1: UI de modales (sonidos, ubicación, borradores, preview)
   FASE 2: Carga modular de archivos (subirMultimedia)
   FASE 3C: (N/A aquí, el INSERT lo hace videos.html)

   Novedades v1.2:
   - Input file 100% oculto con display:none !important
   - Label estilizado que reemplaza visualmente el input
   - Reset completo del formulario tras publicar exitosamente
   - Refresco automático del feed sin recargar URL
   - Reset de preview, sonido, ubicación y progreso
   ================================================================ */

(function () {
    'use strict';

    if (window.__csarielsVideosPublicarLoaded) return;
    window.__csarielsVideosPublicarLoaded = true;

    // ============================================================
    // CONFIGURACIÓN
    // ============================================================
    const CONFIG = {
        PROVIDER: 'supabase',
        BUCKET: 'videos',
        API_UPLOAD_R2: '/api/storage/r2/sign',
        API_UPLOAD_S3: '/api/storage/s3/sign',
        MAX_VIDEO_MB: 100,
        MAX_VIDEO_MB_R2: 500,
        VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
        IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp']
    };

    // ============================================================
    // SEMILLA DE SONIDOS
    // ============================================================
    const SONIDOS_SEED = {
        parati: [
            { id: 'sd-001', nombre: 'Amanecer en Puebla',   artista: 'Csariel Beats',  url: '', duracion: 32 },
            { id: 'sd-002', nombre: 'Cumbia Galáctica',     artista: 'DJ Maíz',        url: '', duracion: 45 },
            { id: 'sd-003', nombre: 'Corrido Cyberpunk',    artista: 'Los Charros AI', url: '', duracion: 38 },
            { id: 'sd-004', nombre: 'Norteño Neón',         artista: 'Sonido Web3',    url: '', duracion: 40 }
        ],
        populares: [
            { id: 'sd-101', nombre: 'Sariel Vibes',         artista: 'Csariel Sound',  url: '', duracion: 30 },
            { id: 'sd-102', nombre: 'Maíz Dorado',          artista: 'El Capitán',     url: '', duracion: 28 },
            { id: 'sd-103', nombre: 'Noche Estelar',        artista: 'Cosmos MX',      url: '', duracion: 55 },
            { id: 'sd-104', nombre: 'Perreo Intergaláctico',artista: 'Neón Kings',     url: '', duracion: 47 }
        ],
        favoritos: [
            { id: 'sd-201', nombre: 'Mi Pista Favorita',    artista: 'Tú',             url: '', duracion: 35 }
        ]
    };

    // ============================================================
    // UBICACIONES SEED
    // ============================================================
    const UBICACIONES_SEED = [
        { id: 'pue-capital',    nombre: 'Puebla Capital',    pais: 'México', lat: 19.0414, lng: -98.2063 },
        { id: 'pue-cholula',    nombre: 'Cholula',           pais: 'México', lat: 19.0621, lng: -98.3053 },
        { id: 'pue-atlixco',    nombre: 'Atlixco',           pais: 'México', lat: 18.9083, lng: -98.4367 },
        { id: 'pue-tehuacan',   nombre: 'Tehuacán',          pais: 'México', lat: 18.4611, lng: -97.3928 },
        { id: 'pue-izucar',     nombre: 'Izúcar de Matamoros', pais: 'México', lat: 18.6017, lng: -98.4646 },
        { id: 'cdmx-centro',    nombre: 'CDMX · Centro',     pais: 'México', lat: 19.4326, lng: -99.1332 },
        { id: 'gdl-centro',     nombre: 'Guadalajara',       pais: 'México', lat: 20.6597, lng: -103.3496 },
        { id: 'mty-centro',     nombre: 'Monterrey',         pais: 'México', lat: 25.6866, lng: -100.3161 },
        { id: 'cancun',         nombre: 'Cancún',            pais: 'México', lat: 21.1619, lng: -86.8515 },
        { id: 'veracruz',       nombre: 'Veracruz',          pais: 'México', lat: 19.1738, lng: -96.1342 },
        { id: 'oaxaca',         nombre: 'Oaxaca de Juárez',  pais: 'México', lat: 17.0732, lng: -96.7266 },
        { id: 'queretaro',      nombre: 'Querétaro',         pais: 'México', lat: 20.5888, lng: -100.3899 }
    ];

    // ============================================================
    // ESTADO
    // ============================================================
    const state = {
        sonidoSeleccionado: null,
        ubicacionSeleccionada: null,
        archivoVideo: null,
        urlVideoSubida: null,
        pathVideoSubida: null,
        previewURL: null,
        tabSonidosActiva: 'parati',
        sbCliente: null
    };

    // ============================================================
    // UTILIDADES
    // ============================================================
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

    // ============================================================
    // TOAST
    // ============================================================
    function csToast(mensaje, tipo, duracion) {
        const t = document.createElement('div');
        t.className = 'cs-toast cs-toast-' + (tipo || 'info');
        const iconos = { info: '◈', success: '✓', warning: '⚠', error: '✕' };
        const icono = iconos[tipo] || iconos.info;
        t.innerHTML = `<span class="cs-toast-ico">${icono}</span><span class="cs-toast-txt">${esc(mensaje)}</span>`;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 400);
        }, duracion || 3200);
    }

    // ============================================================
    // CONFIRM MODAL
    // ============================================================
    function csConfirm(opts) {
        return new Promise((resolve) => {
            const o = opts || {};
            const overlay = document.createElement('div');
            overlay.className = 'cs-confirm-overlay';
            overlay.innerHTML = `
                <div class="cs-confirm-modal" role="dialog" aria-modal="true">
                    <div class="cs-confirm-ico">${o.peligroso ? '⚠' : '◈'}</div>
                    <div class="cs-confirm-titulo">${esc(o.titulo || 'Confirmar')}</div>
                    <div class="cs-confirm-mensaje">${esc(o.mensaje || '')}</div>
                    <div class="cs-confirm-acciones">
                        <button type="button" class="cs-confirm-btn cs-confirm-cancel" data-res="0">${esc(o.textoCancelar || 'Cancelar')}</button>
                        <button type="button" class="cs-confirm-btn ${o.peligroso ? 'cs-confirm-danger' : 'cs-confirm-ok'}" data-res="1">${esc(o.textoOk || 'Aceptar')}</button>
                    </div>
                </div>
            `;
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
    // FASE 2 · subirMultimedia
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
            if (CONFIG.PROVIDER === 'r2')       return await subirMultimediaR2(archivo, tipo, opts);
            if (CONFIG.PROVIDER === 's3')       return await subirMultimediaS3(archivo, tipo, opts);
            return { ok: false, error: 'Provider desconocido' };
        } catch (e) {
            warn('Error subiendo:', e);
            return { ok: false, error: e.message || String(e) };
        }
    }

    async function subirMultimediaSupabase(archivo, tipo, opts) {
        const sb = getSupabaseClient();
        if (!sb) return { ok: false, error: 'Cliente Supabase no disponible' };
        const sessionResp = await sb.auth.getSession();
        const session = sessionResp && sessionResp.data && sessionResp.data.session;
        if (!session) return { ok: false, error: 'Sin sesión activa' };
        const ext = (archivo.name.split('.').pop() || '').toLowerCase();
        const carpeta = tipo === 'video' ? 'videos' : 'miniaturas';
        const path = `${session.user.id}/${carpeta}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await sb.storage
            .from(CONFIG.BUCKET)
            .upload(path, archivo, { cacheControl: '31536000', upsert: false, contentType: archivo.type });
        if (up.error) return { ok: false, error: up.error.message };
        const pub = sb.storage.from(CONFIG.BUCKET).getPublicUrl(path);
        const url = pub && pub.data && pub.data.publicUrl;
        if (!url) return { ok: false, error: 'No se pudo obtener URL pública' };
        return { ok: true, url, path, provider: 'supabase' };
    }
    async function subirMultimediaR2(archivo, tipo, opts) {
        return { ok: false, error: 'Proveedor R2 aún no habilitado (Fase 3 del proyecto)' };
    }
    async function subirMultimediaS3(archivo, tipo, opts) {
        return { ok: false, error: 'Proveedor S3 aún no habilitado (Fase 3 del proyecto)' };
    }

    // ============================================================
    // RESET COMPLETO DEL FORMULARIO
    // ============================================================
    function resetFormularioPublicacion() {
        const inputTitulo = document.getElementById('inputTituloVideo');
        const inputDesc = document.getElementById('inputDescripcionVideo');
        if (inputTitulo) inputTitulo.value = '';
        if (inputDesc) inputDesc.value = '';

        const inputArchivo = document.getElementById('inputArchivoVideo');
        if (inputArchivo) {
            try { inputArchivo.value = ''; } catch (e) {}
        }

        const preview = document.getElementById('csPreviewVideo');
        if (preview) {
            try { preview.pause(); } catch (e) {}
            preview.removeAttribute('src');
            try { preview.load(); } catch (e) {}
        }

        if (state.previewURL) {
            try { URL.revokeObjectURL(state.previewURL); } catch (e) {}
            state.previewURL = null;
        }
        state.archivoVideo = null;
        state.urlVideoSubida = null;
        state.pathVideoSubida = null;

        const btnTxt = document.getElementById('csFileBtnTxt');
        const btnHint = document.getElementById('csFileBtnHint');
        const btnWrap = document.querySelector('.cs-file-btn-wrap');
        if (btnTxt) btnTxt.textContent = 'Elegir video de la galería';
        if (btnHint) btnHint.textContent = 'MP4 · WebM · MOV · Máx 100 MB';
        if (btnWrap) btnWrap.classList.remove('cs-file-con-archivo');

        state.sonidoSeleccionado = null;
        state.ubicacionSeleccionada = null;
        const previewSonido = $('csPreviewSonido');
        const previewUbic = $('csPreviewUbicacion');
        if (previewSonido) previewSonido.querySelector('.cs-preview-txt').textContent = 'Sin sonido';
        if (previewUbic) previewUbic.querySelector('.cs-preview-txt').textContent = 'Sin ubicación';
        const badge = $('csPreviewBadge');
        if (badge) badge.style.display = 'none';

        const progressEl = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        if (progressEl) progressEl.style.display = 'none';
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';

        const pFill = document.getElementById('processingProgressFill');
        const pText = document.getElementById('processingProgressText');
        if (pFill) pFill.style.width = '0%';
        if (pText) pText.textContent = '0%';

        log('🔄 Formulario reseteado');
    }
    window.csResetFormularioPublicacion = resetFormularioPublicacion;

    // ============================================================
    // REFRESCAR FEED
    // ============================================================
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
            const feed = document.getElementById('videosContainer');
            if (feed) feed.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {}
    }
    window.csRefrescarFeedVideos = refrescarFeedAutomatico;

    // ============================================================
    // FASE 1 · UI
    // ============================================================
    function inyectarEstilosExtra() {
        if (document.getElementById('cs-videos-publicar-inline')) return;
        const st = document.createElement('style');
        st.id = 'cs-videos-publicar-inline';
        st.textContent = `
            .cs-spinner-inline {
                display: inline-block;
                width: 14px; height: 14px;
                border: 2px solid rgba(212,175,55,0.25);
                border-top-color: #D4AF37;
                border-radius: 50%;
                animation: cs-spin-inline 0.8s linear infinite;
                vertical-align: middle;
                margin-right: 6px;
            }
            @keyframes cs-spin-inline { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(st);
    }

    function inyectarBotonesHeader() {
        const header = document.querySelector('.header .header-actions');
        if (!header) { warn('Header no encontrado'); return; }
        if (document.getElementById('csBtnAgregarSonido')) return;

        const btnSonido = document.createElement('button');
        btnSonido.id = 'csBtnAgregarSonido';
        btnSonido.type = 'button';
        btnSonido.className = 'cs-btn-header cs-btn-sonido';
        btnSonido.innerHTML = '<span class="cs-ico">♪</span><span class="cs-btn-txt">Agregar sonido</span>';
        btnSonido.addEventListener('click', abrirModalSonidos);

        const btnUbic = document.createElement('button');
        btnUbic.id = 'csBtnUbicacion';
        btnUbic.type = 'button';
        btnUbic.className = 'cs-btn-header cs-btn-ubicacion';
        btnUbic.innerHTML = '<span class="cs-ico">◆</span><span class="cs-btn-txt">Ubicación</span>';
        btnUbic.addEventListener('click', abrirModalUbicacion);

        header.insertBefore(btnSonido, header.firstChild);
        header.insertBefore(btnUbic, btnSonido.nextSibling);
    }

    function inyectarModales() {
        if (document.getElementById('csModalSonidos')) return;
        const contenedor = document.createElement('div');
        contenedor.innerHTML = `
            <div class="cs-sheet-backdrop" id="csSheetSonidosBackdrop"></div>
            <div class="cs-sheet" id="csModalSonidos" role="dialog" aria-modal="true" aria-label="Biblioteca de sonidos">
                <div class="cs-sheet-handle"></div>
                <div class="cs-sheet-header">
                    <div class="cs-sheet-titulo">
                        <span class="cs-ico">♪</span>
                        <span>Agregar sonido</span>
                    </div>
                    <button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="sonidos">✕</button>
                </div>
                <div class="cs-tabs" role="tablist">
                    <button type="button" role="tab" class="cs-tab active" data-tab="parati">Para ti</button>
                    <button type="button" role="tab" class="cs-tab" data-tab="populares">Populares</button>
                    <button type="button" role="tab" class="cs-tab" data-tab="favoritos">Favoritos</button>
                </div>
                <div class="cs-sheet-body">
                    <div class="cs-buscar-wrap">
                        <span class="cs-ico-buscar">◇</span>
                        <input type="text" id="csBuscarSonido" placeholder="Buscar pista o artista..." autocomplete="off" />
                    </div>
                    <div class="cs-sonidos-lista" id="csSonidosLista"></div>
                </div>
                <div class="cs-sheet-footer">
                    <div class="cs-sonido-actual" id="csSonidoActualInfo">Sin sonido seleccionado</div>
                    <button type="button" class="cs-btn-primary" id="csBtnConfirmarSonido" disabled>Usar este sonido</button>
                </div>
            </div>

            <div class="cs-sheet-backdrop" id="csSheetUbicacionBackdrop"></div>
            <div class="cs-sheet" id="csModalUbicacion" role="dialog" aria-modal="true" aria-label="Seleccionar ubicación">
                <div class="cs-sheet-handle"></div>
                <div class="cs-sheet-header">
                    <div class="cs-sheet-titulo">
                        <span class="cs-ico">◆</span>
                        <span>Ubicación</span>
                    </div>
                    <button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="ubicacion">✕</button>
                </div>
                <div class="cs-sheet-body">
                    <div class="cs-buscar-wrap">
                        <span class="cs-ico-buscar">◇</span>
                        <input type="text" id="csBuscarUbicacion" placeholder="Buscar ciudad o municipio..." autocomplete="off" />
                    </div>
                    <div class="cs-ubicaciones-lista" id="csUbicacionesLista"></div>
                </div>
                <div class="cs-sheet-footer">
                    <div class="cs-ubicacion-actual" id="csUbicacionActualInfo">Sin ubicación seleccionada</div>
                    <button type="button" class="cs-btn-primary" id="csBtnConfirmarUbicacion" disabled>Usar esta ubicación</button>
                </div>
            </div>

            <div class="cs-sheet-backdrop" id="csSheetBorradoresBackdrop"></div>
            <div class="cs-sheet" id="csModalBorradores" role="dialog" aria-modal="true" aria-label="Borradores">
                <div class="cs-sheet-handle"></div>
                <div class="cs-sheet-header">
                    <div class="cs-sheet-titulo">
                        <span class="cs-ico">◈</span>
                        <span>Mis borradores</span>
                    </div>
                    <button type="button" class="cs-sheet-close" aria-label="Cerrar" data-cs-close="borradores">✕</button>
                </div>
                <div class="cs-sheet-body">
                    <div id="csBorradoresLista" class="cs-borradores-lista">
                        <div class="cs-vacio">
                            <span class="cs-ico-vacio">◈</span>
                            <p>Aún no tienes borradores.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        while (contenedor.firstChild) document.body.appendChild(contenedor.firstChild);
    }

    function inyectarSeccionPreviewEnUpload() {
        const uploadSection = document.getElementById('uploadSection');
        if (!uploadSection) return;
        if (document.getElementById('csPreviewWrap')) return;

        const form = uploadSection.querySelector('form');
        if (!form) return;

        transformarInputArchivo(uploadSection);

        const wrap = document.createElement('div');
        wrap.id = 'csPreviewWrap';
        wrap.className = 'cs-preview-wrap';
        wrap.innerHTML = `
            <div class="cs-preview-video">
                <video id="csPreviewVideo" playsinline muted preload="metadata"></video>
                <div class="cs-preview-badge" id="csPreviewBadge" style="display:none;">◆ Sonido + video</div>
            </div>
            <div class="cs-preview-meta">
                <div class="cs-preview-line" id="csPreviewSonido">
                    <span class="cs-ico">♪</span>
                    <span class="cs-preview-txt">Sin sonido</span>
                </div>
                <div class="cs-preview-line" id="csPreviewUbicacion">
                    <span class="cs-ico">◆</span>
                    <span class="cs-preview-txt">Sin ubicación</span>
                </div>
                <div class="cs-preview-actions">
                    <button type="button" class="cs-btn-ghost" id="csBtnVerBorradores">
                        <span class="cs-ico">◈</span> Borradores
                    </button>
                    <button type="button" class="cs-btn-ghost" id="csBtnGuardarBorrador">
                        <span class="cs-ico">◇</span> Guardar borrador
                    </button>
                </div>
            </div>
        `;
        const grupos = form.querySelectorAll('.form-group');
        if (grupos.length > 0) form.insertBefore(wrap, grupos[grupos.length - 1]);
        else form.appendChild(wrap);

        $('csBtnVerBorradores').addEventListener('click', abrirModalBorradores);
        $('csBtnGuardarBorrador').addEventListener('click', guardarBorrador);
    }

    function transformarInputArchivo(scope) {
        const input = scope.querySelector('#inputArchivoVideo') || document.getElementById('inputArchivoVideo');
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
                <span class="cs-file-btn-txt" id="csFileBtnTxt">Elegir video de la galería</span>
                <span class="cs-file-btn-hint" id="csFileBtnHint">MP4 · WebM · MOV · Máx 100 MB</span>
            </button>
        `;

        if (input.parentNode) {
            input.parentNode.insertBefore(btnWrap, input.nextSibling);
        }

        const btn = btnWrap.querySelector('#csFileBtnVideo');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.click();
        });

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            const txt = document.getElementById('csFileBtnTxt');
            const hint = document.getElementById('csFileBtnHint');
            if (file) {
                if (txt) txt.textContent = '◈ ' + file.name;
                if (hint) {
                    const mb = (file.size / (1024 * 1024)).toFixed(2);
                    hint.textContent = mb + ' MB · Listo para subir';
                }
                btnWrap.classList.add('cs-file-con-archivo');
            } else {
                if (txt) txt.textContent = 'Elegir video de la galería';
                if (hint) hint.textContent = 'MP4 · WebM · MOV · Máx 100 MB';
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
        backdrop.classList.add('show');
        sheet.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function cerrarSheet(sheetId, backdropId) {
        const sheet = $(sheetId);
        const backdrop = $(backdropId);
        if (sheet) sheet.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
        document.body.style.overflow = '';
    }
    function cerrarTodosLosSheets() {
        cerrarSheet('csModalSonidos', 'csSheetSonidosBackdrop');
        cerrarSheet('csModalUbicacion', 'csSheetUbicacionBackdrop');
        cerrarSheet('csModalBorradores', 'csSheetBorradoresBackdrop');
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
            lista.innerHTML = `<div class="cs-vacio"><span class="cs-ico-vacio">♪</span><p>Sin pistas en esta sección.</p></div>`;
            return;
        }
        lista.innerHTML = arr.map(s => `
            <button type="button" class="cs-sonido-item ${state.sonidoSeleccionado && state.sonidoSeleccionado.id === s.id ? 'activo' : ''}" data-sonido-id="${esc(s.id)}">
                <span class="cs-sonido-ico">▶</span>
                <span class="cs-sonido-info">
                    <span class="cs-sonido-nombre">${esc(s.nombre)}</span>
                    <span class="cs-sonido-artista">${esc(s.artista)} · ${esc(s.duracion)}s</span>
                </span>
                <span class="cs-sonido-check">◆</span>
            </button>
        `).join('');
        lista.querySelectorAll('.cs-sonido-item').forEach(btn => {
            btn.addEventListener('click', () => seleccionarSonido(btn.dataset.sonidoId));
        });
    }
    function seleccionarSonido(id) {
        const todas = [].concat(SONIDOS_SEED.parati).concat(SONIDOS_SEED.populares).concat(SONIDOS_SEED.favoritos);
        const s = todas.find(x => x.id === id);
        if (!s) return;
        state.sonidoSeleccionado = s;
        document.querySelectorAll('.cs-sonido-item').forEach(el => {
            el.classList.toggle('activo', el.dataset.sonidoId === id);
        });
        const info = $('csSonidoActualInfo');
        if (info) info.textContent = `${s.nombre} — ${s.artista}`;
        const btn = $('csBtnConfirmarSonido');
        if (btn) btn.disabled = false;
    }
    function confirmarSonido() {
        const s = state.sonidoSeleccionado;
        const preview = $('csPreviewSonido');
        if (preview) preview.querySelector('.cs-preview-txt').textContent = s ? `${s.nombre} — ${s.artista}` : 'Sin sonido';
        actualizarBadgePreview();
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
            lista.innerHTML = `<div class="cs-vacio"><span class="cs-ico-vacio">◆</span><p>Sin resultados.</p></div>`;
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
            </button>
        `).join('');
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
        if (info) info.textContent = `${u.nombre}, ${u.pais}`;
        const btn = $('csBtnConfirmarUbicacion');
        if (btn) btn.disabled = false;
    }
    function confirmarUbicacion() {
        const u = state.ubicacionSeleccionada;
        const preview = $('csPreviewUbicacion');
        if (preview) preview.querySelector('.cs-preview-txt').textContent = u ? `${u.nombre}, ${u.pais}` : 'Sin ubicación';
        cerrarTodosLosSheets();
    }

    async function renderBorradores() {
        const lista = $('csBorradoresLista');
        if (!lista) return;
        lista.innerHTML = `
            <div class="cs-vacio">
                <span class="cs-ico-vacio">◈</span>
                <p>Función de borradores en preparación.</p>
                <p style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">Pronto podrás guardar y reanudar tus publicaciones.</p>
            </div>`;
    }

    function guardarBorrador() {
        csToast('El guardado de borradores estará disponible muy pronto', 'info', 3200);
    }

    function actualizarBadgePreview() {
        const badge = $('csPreviewBadge');
        if (!badge) return;
        badge.style.display = state.sonidoSeleccionado ? 'inline-flex' : 'none';
    }

    // ============================================================
    // PREVIEW DE VIDEO
    // ============================================================
    function engancharInputArchivo() {
        const input = document.getElementById('inputArchivoVideo');
        if (!input) return;
        if (input.dataset.csPublicarEnganchado === '1') return;
        input.dataset.csPublicarEnganchado = '1';

        input.addEventListener('change', function () {
            const file = input.files && input.files[0];
            if (!file) return;
            state.archivoVideo = file;
            if (state.previewURL) {
                URL.revokeObjectURL(state.previewURL);
                state.previewURL = null;
            }
            state.previewURL = URL.createObjectURL(file);
            const v = $('csPreviewVideo');
            if (v) { v.src = state.previewURL; v.load(); }
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
    // LISTENERS GLOBALES
    // ============================================================
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

    // ============================================================
    // API PÚBLICA
    // ============================================================
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
        getConfig: () => ({ ...CONFIG }),
        setProvider: (p) => { CONFIG.PROVIDER = p; },
        getState: () => ({
            sonido: state.sonidoSeleccionado,
            ubicacion: state.ubicacionSeleccionada,
            archivoVideo: state.archivoVideo ? state.archivoVideo.name : null
        }),
        _seed: { SONIDOS_SEED, UBICACIONES_SEED }
    };

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        inyectarEstilosExtra();
        inyectarBotonesHeader();
        inyectarModales();
        inyectarSeccionPreviewEnUpload();
        engancharInputArchivo();
        engancharListenersGlobales();
        engancharEventoPublicacionExitosa();
        log('✅ Módulo Publicar v1.2 listo (Fase 3C soportada)');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();