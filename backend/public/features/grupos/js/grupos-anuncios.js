// ================================================================
// GRUPOS · ANUNCIOS (MARKETING)
// ================================================================
// Sistema de anuncios patrocinados dentro de los grupos.
// Depende de: grupos-config.js, grupos-utils.js
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
// CERRAR ANUNCIO
// ================================================================
function cerrarAnuncio() {
    adCerrado = true;
    const container = document.getElementById('marketingAdContainer');
    if (container) container.classList.remove('visible');
    anuncioActual = null;
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
// MOSTRAR ANUNCIO EN EL DOM
// ================================================================
function mostrarAnuncio(ad) {
    const container = document.getElementById('marketingAdContainer');
    const media = document.getElementById('marketingAdMedia');
    const title = document.getElementById('marketingAdTitle');
    const desc = document.getElementById('marketingAdDesc');
    const cta = document.getElementById('marketingAdCta');
    if (!container || !media || !title || !desc || !cta) return;

    var img = grpSafeUrl(ad.imagen_url);
    var vid = grpSafeUrl(ad.video_url);

    if (img) {
        media.innerHTML = `<img src="${grpEscapeHTML(img)}" alt="${grpEscapeHTML(ad.titulo)}" loading="lazy" onerror="this.parentElement.innerHTML='<span>◈</span>'">`;
    } else if (vid) {
        media.innerHTML = `<video src="${grpEscapeHTML(vid)}" muted autoplay loop playsinline></video>`;
    } else {
        media.innerHTML = '<span>◈</span>';
    }

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