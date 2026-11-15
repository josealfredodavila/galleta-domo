// ================================================================
// GRUPOS · ANUNCIOS (MARKETING)
// ================================================================
// Sistema de anuncios patrocinados dentro de los grupos.
// Depende de: grupos-config.js, grupos-utils.js
// v2.2 (Visor blindado + Swipe-to-close)
// ================================================================

// ================================================================
// SESIÓN DE ANUNCIOS
// ================================================================
function getOrCreateAdSessionId() {
    if (adSessionId) return adSessionId;
    adSessionId = `ads_grupo_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    return adSessionId;
}

// ================================================================
// INYECCIÓN DE ESTILOS PARA EL MENÚ Y EL VISOR
// ================================================================
function inyectarEstilosMenuAnuncios() {
    if (document.getElementById('ad-menu-styles')) return;
    var style = document.createElement('style');
    style.id = 'ad-menu-styles';
    style.appendChild(document.createTextNode(`
        /* Botón 3 puntos */
        .ad-menu-btn { position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; border-radius: 50%; background: rgba(0,0,0,0.5); border: 0; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; }
        
        /* Menú deslizante */
        .ad-sheet { position: absolute; bottom: 0; left: 0; right: 0; background: #fff; border-top-left-radius: 16px; border-top-right-radius: 16px; transform: translateY(100%); transition: transform 0.3s; z-index: 20; padding-bottom: env(safe-area-inset-bottom, 10px); display: flex; flex-direction: column; }
        .ad-sheet.show { transform: translateY(0); }
        .ad-sheet-btn { display: flex; align-items: center; gap: 15px; width: 100%; padding: 15px 20px; border: 0; border-top: 1px solid #eee; background: transparent; color: #000; font-size: 16px; text-align: left; cursor: pointer; }
        .ad-sheet-btn .icon { display: flex; align-items: center; justify-content: center; color: #333; }
        
        /* Pantalla de reporte */
        .ad-report-sheet { position: absolute; inset: 0; background: #fff; z-index: 30; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.3s; }
        .ad-report-sheet.show { transform: translateX(0); }
        .ad-report-header { display: flex; align-items: center; justify-content: space-between; padding: 15px; border-bottom: 1px solid #eee; }
        .ad-report-header span { font-weight: 700; font-size: 1.1rem; color: #000; }
        .ad-report-content { padding: 20px; overflow-y: auto; flex: 1; }
        .ad-report-option { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 16px 0; border: 0; border-bottom: 1px solid #eee; background: transparent; font-size: 1rem; font-weight: 600; color: #000; text-align: left; cursor: pointer; }
        .ad-report-footer { padding: 15px 20px; border-top: 1px solid #eee; background: #fff; }
        .ad-btn-enviar { width: 100%; padding: 16px; background: #1d7bf4; color: #fff; font-size: 1.1rem; font-weight: 700; border: 0; border-radius: 8px; cursor: pointer; }
        
        /* Visor a pantalla completa */
        .ad-visor-full { position: fixed; inset: 0; z-index: 100060; background: #000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; touch-action: manipulation; }
        .ad-visor-full.show { opacity: 1; }
        .ad-visor-full img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .ad-visor-cerrar { position: absolute; top: calc(16px + env(safe-area-inset-top, 0px)); right: 16px; width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    `));
    document.head.appendChild(style);
}

// ================================================================
// CERRAR ANUNCIO
// ================================================================
function cerrarAnuncio() {
    adCerrado = true;
    const container = document.getElementById('marketingAdContainer');
    if (container) container.classList.remove('visible');
    anuncioActual = null;
}

// ================================================================
// VISOR DE IMAGEN A PANTALLA COMPLETA (CON SWIPE)
// ================================================================
function abrirVisorAnuncio(urlImagen) {
    let visor = document.getElementById('adVisorFull');
    if (visor) visor.remove();

    visor = document.createElement('div');
    visor.id = 'adVisorFull';
    visor.className = 'ad-visor-full';

    let img = document.createElement('img');
    img.src = urlImagen;

    let btnCerrar = document.createElement('button');
    btnCerrar.className = 'ad-visor-cerrar';
    btnCerrar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    let cerrar = function() {
        visor.classList.remove('show');
        setTimeout(() => visor.remove(), 300);
        document.body.style.overflow = '';
    };

    btnCerrar.onclick = cerrar;
    visor.onclick = function(e) { if (e.target === visor) cerrar(); };

    // Gesto de deslizar hacia abajo
    let tocoY = 0;
    visor.addEventListener('touchstart', (e) => { tocoY = e.changedTouches[0].clientY; }, {passive: true});
    visor.addEventListener('touchend', (e) => {
        let dy = e.changedTouches[0].clientY - tocoY;
        if (dy > 100) cerrar();
    }, {passive: true});

    visor.appendChild(img);
    visor.appendChild(btnCerrar);
    document.body.appendChild(visor);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => visor.classList.add('show'));
}

// ================================================================
// CARGAR ANUNCIO DESDE EL BACKEND
// ================================================================
async function cargarAnuncioGrupo() {
    if (!grupoActualId) return;
    if (adCerrado) return;
    const session = await grpGetSession();
    if (!session) return;
    try {
        const response = await fetch('/api/marketing/get-ad', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                target_tipo: 'grupo',
                target_id: grupoActualId,
                session_id: getOrCreateAdSessionId()
            })
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.success || !data.ad) {
            const container = document.getElementById('marketingAdContainer');
            if (container) container.classList.remove('visible');
            return;
        }
        mostrarAnuncio(data.ad);
        anuncioActual = data.ad;
        if (adVistaTimer) clearTimeout(adVistaTimer);
        adVistaTimer = setTimeout(() => { registrarVistaAnuncio(); }, 3000);
    } catch (error) {
        console.warn('[Grupos] Error cargando anuncio:', error);
    }
}

// ================================================================
// MOSTRAR ANUNCIO EN EL DOM (CON MENÚ Y VISOR BLINDADO)
// ================================================================
function mostrarAnuncio(ad) {
    inyectarEstilosMenuAnuncios();
    
    const container = document.getElementById('marketingAdContainer');
    const media = document.getElementById('marketingAdMedia');
    const title = document.getElementById('marketingAdTitle');
    const desc = document.getElementById('marketingAdDesc');
    const cta = document.getElementById('marketingAdCta');
    if (!container || !media || !title || !desc || !cta) return;

    // Limpiar botones previos si los hay
    const oldBtn = container.querySelector('.ad-menu-btn');
    if (oldBtn) oldBtn.remove();
    const oldSheet = container.querySelector('.ad-sheet');
    if (oldSheet) oldSheet.remove();
    const oldReport = container.querySelector('.ad-report-sheet');
    if (oldReport) oldReport.remove();

    var img = grpSafeUrl(ad.imagen_url);
    var vid = grpSafeUrl(ad.video_url);

    if (img) {
        media.innerHTML = `<img src="${grpEscapeHTML(img)}" alt="${grpEscapeHTML(ad.titulo)}" loading="lazy" style="cursor:pointer;" onerror="this.parentElement.innerHTML='<span>◈</span>'">`;
        
        // BLINDAJE: Verificamos que el img exista antes de asignar el onclick
        const imgEl = media.querySelector('img');
        if (imgEl) {
            imgEl.onclick = function() { abrirVisorAnuncio(this.src); };
        }
    } else if (vid) {
        media.innerHTML = `<video src="${grpEscapeHTML(vid)}" muted autoplay loop playsinline></video>`;
    } else {
        media.innerHTML = '<span>◈</span>';
    }

    // SVG del menú
    var svgDots = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;
    var svgEyeOff = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    var svgReport = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    var svgChevron = `<svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    // Botón de 3 puntos
    const btnMenu = document.createElement('button');
    btnMenu.className = 'ad-menu-btn';
    btnMenu.innerHTML = svgDots;
    container.appendChild(btnMenu);

    // Hoja inferior (Menú)
    const sheet = document.createElement('div');
    sheet.className = 'ad-sheet';
    sheet.innerHTML = `
        <div style="width: 40px; height: 4px; background: #ccc; border-radius: 2px; margin: 10px auto 15px auto;"></div>
        <button class="ad-sheet-btn" id="ad-btn-ocultar"><span class="icon">${svgEyeOff}</span> No quiero ver este anuncio</button>
        <button class="ad-sheet-btn" id="ad-btn-reportar"><span class="icon">${svgReport}</span> Reportar anuncio</button>
    `;
    container.appendChild(sheet);

    // Pantalla de reporte
    const reportSheet = document.createElement('div');
    reportSheet.className = 'ad-report-sheet';
    reportSheet.innerHTML = `
        <div class="ad-report-header">
            <button type="button" class="ad-back-btn" style="background:transparent;border:0;padding:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
            <span>Reportar</span>
            <button type="button" class="ad-close-btn" style="background:transparent;border:0;padding:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="ad-report-content">
            <h2 style="font-size:1.2rem; color:#000; margin-bottom:20px;">¿Por qué quieres reportar este anuncio?</h2>
            <button class="ad-report-option" data-motivo="Contenido ofensivo">Contenido ofensivo ${svgChevron}</button>
            <button class="ad-report-option" data-motivo="Estafa o fraude">Estafa o fraude ${svgChevron}</button>
            <button class="ad-report-option" data-motivo="Producto prohibido">Producto prohibido ${svgChevron}</button>
            <button class="ad-report-option" data-motivo="Spam">Spam ${svgChevron}</button>
        </div>
        <div class="ad-report-footer">
            <button type="button" class="ad-btn-enviar" id="ad-enviar-final" style="display:none;" disabled>Enviar</button>
        </div>
    `;
    container.appendChild(reportSheet);

    // Lógica del menú
    btnMenu.onclick = () => sheet.classList.add('show');
    
    sheet.querySelector('#ad-btn-ocultar').onclick = () => {
        sheet.classList.remove('show');
        cerrarAnuncio();
        if (window.showToast) window.showToast('Anuncio oculto', 'success');
    };

    sheet.querySelector('#ad-btn-reportar').onclick = () => {
        sheet.classList.remove('show');
        reportSheet.classList.add('show');
    };

    reportSheet.querySelector('.ad-back-btn').onclick = () => {
        reportSheet.classList.remove('show');
        sheet.classList.add('show');
    };

    reportSheet.querySelector('.ad-close-btn').onclick = () => {
        reportSheet.classList.remove('show');
    };

    // Seleccionar motivo
    let motivoSeleccionado = '';
    const botonesMotivo = reportSheet.querySelectorAll('.ad-report-option');
    const btnEnviarFinal = reportSheet.querySelector('#ad-enviar-final');

    botonesMotivo.forEach(btn => {
        btn.onclick = function() {
            motivoSeleccionado = this.getAttribute('data-motivo');
            botonesMotivo.forEach(b => b.style.background = 'transparent');
            this.style.background = '#f0f0f0';
            btnEnviarFinal.style.display = 'block';
            btnEnviarFinal.disabled = false;
        };
    });

    // Enviar reporte a Supabase
    btnEnviarFinal.onclick = async function() {
        if (!motivoSeleccionado) return;
        this.disabled = true;
        this.textContent = 'Enviando...';
        
        try {
            const client = window.supabaseClient;
            const sessionResult = await client.auth.getSession();
            const session = sessionResult.data ? sessionResult.data.session : null;
            
            if (session) {
                await client.from('grupos_video_reportes').insert({
                    usuario_id: session.user.id,
                    motivo: motivoSeleccionado
                });
            }
            
            if (window.showToast) window.showToast('✅ Reporte enviado. Gracias.', 'success');
            reportSheet.classList.remove('show');
            cerrarAnuncio();
        } catch (e) {
            console.error('Error reportando:', e);
            if (window.showToast) window.showToast('❌ Error al reportar', 'error');
        } finally {
            this.disabled = false;
            this.textContent = 'Enviar';
        }
    };

    title.textContent = ad.titulo || 'Patrocinado';
    desc.textContent = ad.descripcion || '';
    cta.textContent = ad.cta_texto || 'Ver más';
    desc.style.display = ad.descripcion ? 'block' : 'none';
    container.classList.add('visible');
}

// ================================================================
// REGISTRAR VISTA DEL ANUNCIO
// ================================================================
async function registrarVistaAnuncio() {
    if (!anuncioActual) return;
    const session = await grpGetSession();
    if (!session) return;
    try {
        await fetch('/api/marketing/register-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                ad_id: anuncioActual.id,
                campaign_id: anuncioActual.campaign_id,
                target_tipo: 'grupo',
                target_id: grupoActualId,
                evento: 'vista',
                session_id: getOrCreateAdSessionId()
            })
        });
    } catch (error) {
        console.warn('Error registrando vista:', error);
    }
}

// ================================================================
// REGISTRAR CLIC EN EL ANUNCIO
// ================================================================
async function registrarClicAnuncio() {
    if (!anuncioActual) return;
    const session = await grpGetSession();
    if (!session) return;
    try {
        await fetch('/api/marketing/register-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                ad_id: anuncioActual.id,
                campaign_id: anuncioActual.campaign_id,
                target_tipo: 'grupo',
                target_id: grupoActualId,
                evento: 'clic',
                session_id: getOrCreateAdSessionId()
            })
        });
        if (anuncioActual.video_url) {
            window.open(grpSafeUrl(anuncioActual.video_url) || '#', '_blank', 'noopener');
        } else if (anuncioActual.imagen_url) {
            window.open(grpSafeUrl(anuncioActual.imagen_url) || '#', '_blank', 'noopener');
        }
    } catch (error) {
        console.warn('Error registrando clic:', error);
    }
}

// ================================================================
// REFRESCO AUTOMÁTICO DE ANUNCIOS
// ================================================================
function iniciarRefrescoAnuncios() {
    if (adRefreshInterval) clearInterval(adRefreshInterval);
    cargarAnuncioGrupo();
    adRefreshInterval = setInterval(() => {
        if (grupoActualId && !adCerrado) cargarAnuncioGrupo();
    }, 30000);
}

function detenerRefrescoAnuncios() {
    if (adRefreshInterval) {
        clearInterval(adRefreshInterval);
        adRefreshInterval = null;
    }
    if (adVistaTimer) {
        clearTimeout(adVistaTimer);
        adVistaTimer = null;
    }
}