// ================================================================
// MENSAJES · SCROLL Y MEDIA v2.0 · MÓDULO 2 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-scroll-media.js
// Depende de: mensajes-core.js (db, $, toast, esc, signedCache,
//             isUserAtBottom, unreadCount, scrollRetryTimer, etc.)
// Cambios v2.0: sin emojis en mensajes ni botones; descarga con
//               estilo plano del ecosistema.
// ================================================================

'use strict';

function scrollToBottom(force = false) {
    const box = $('messages');
    if (!box) return;
    if (!force && !isUserAtBottom) return;
    const doScroll = () => {
        const anchor = document.getElementById('scrollAnchor');
        if (anchor) anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
        else box.scrollTop = box.scrollHeight;
    };
    doScroll();
    requestAnimationFrame(doScroll);
    if (scrollRetryTimer) clearInterval(scrollRetryTimer);
    let intentos = 0;
    scrollRetryTimer = setInterval(() => {
        intentos++;
        if (force || isUserAtBottom) doScroll();
        if (intentos >= 10) { clearInterval(scrollRetryTimer); scrollRetryTimer = null; }
    }, 100);
    if (force || isUserAtBottom) ocultarFlechaNuevos();
}

function actualizarFlecha() {
    const btn = $('scrollDownBtn');
    const badge = $('newMsgBadge');
    if (!btn) return;
    if (unreadCount > 0) {
        btn.classList.add('visible');
        btn.classList.add('has-new');
        if (badge) { badge.textContent = unreadCount > 9 ? '9+' : unreadCount; badge.hidden = false; }
    } else {
        btn.classList.remove('has-new');
        if (badge) badge.hidden = true;
    }
}

function ocultarFlechaNuevos() { unreadCount = 0; actualizarFlecha(); }

function detectarSiEstaAbajo() {
    const box = $('messages');
    if (!box) return;
    const distanciaAlFondo = box.scrollHeight - box.scrollTop - box.clientHeight;
    const estabaAbajo = isUserAtBottom;
    isUserAtBottom = distanciaAlFondo < SCROLL_THRESHOLD;
    if (isUserAtBottom && !estabaAbajo) ocultarFlechaNuevos();
}

function observarCargaMultimedia(box) {
    box.querySelectorAll('img, audio, video').forEach(el => {
        if (el.dataset.scrollListener) return;
        el.dataset.scrollListener = '1';
        const onLoad = () => {
            if (isUserAtBottom) {
                const anchor = document.getElementById('scrollAnchor');
                if (anchor) anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
                else box.scrollTop = box.scrollHeight;
            }
        };
        el.addEventListener('load', onLoad, { once: true });
        el.addEventListener('loadedmetadata', onLoad, { once: true });
        el.addEventListener('error', onLoad, { once: true });
    });
}

async function firmarConCache(bucket, filePath) {
    const clave = bucket + '/' + filePath;
    const enCache = signedCache.get(clave);
    if (enCache && Date.now() - enCache.ts < TTL_SIGNED_MS) return enCache.url;
    const { data, error } = await db.storage.from(bucket).createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) return null;
    signedCache.set(clave, { ts: Date.now(), url: data.signedUrl });
    return data.signedUrl;
}

async function getSignedUrlForMessage(m) {
    if (!m.imagen_url) return null;
    const raw = m.imagen_url;
    if (raw.startsWith('http')) {
        if (raw.includes('/object/public/')) return raw;
        try {
            const url = new URL(raw);
            const parts = url.pathname.split('/').filter(Boolean);
            const idx = parts.findIndex(p => p === 'chat-audio' || p === 'chat-attachments');
            if (idx === -1) return raw;
            const bucket = parts[idx];
            const filePath = parts.slice(idx + 1).join('/');
            return (await firmarConCache(bucket, filePath)) || raw;
        } catch (e) { return raw; }
    }
    if (raw.startsWith('bucket://')) {
        try {
            const withoutPrefix = raw.replace('bucket://', '');
            const slashIdx = withoutPrefix.indexOf('/');
            if (slashIdx === -1) return null;
            const bucket = withoutPrefix.slice(0, slashIdx);
            const filePath = withoutPrefix.slice(slashIdx + 1);
            return await firmarConCache(bucket, filePath);
        } catch (e) { console.warn('Error parseando ruta:', e); return null; }
    }
    return null;
}

function urlSegura(u) {
    if (typeof u !== 'string' || !u) return null;
    try {
        const x = new URL(u, location.href);
        return (x.protocol === 'https:' || x.protocol === 'blob:') ? x.href : null;
    } catch (e) { return null; }
}

function verFotoAmpliada(url, nombre, handle) {
    if (!url) { toast('Este usuario no tiene foto de perfil.', 'warning'); return; }
    $('pvImage').src = url;
    $('pvName').textContent = nombre || 'Usuario';
    $('pvHandle').textContent = handle ? '@' + handle : '';
    $('photoViewer').classList.add('show');
}

let pvDownloadUrl = null, pvDownloadNombre = null;

function asegurarBotonDescarga() {
    let btn = document.getElementById('pvDownload');
    if (btn) return btn;
    const visor = $('photoViewer');
    if (!visor) return null;
    btn = document.createElement('button');
    btn.id = 'pvDownload';
    btn.type = 'button';
    btn.textContent = 'Descargar';
    btn.style.cssText = 'position:absolute;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:10px;border:1px solid var(--line-strong,rgba(255,255,255,.16));background:var(--panel,#0b111b);color:var(--text,#e8edf3);font-weight:600;font-size:.85rem;cursor:pointer;z-index:2;';
    btn.addEventListener('click', e => { e.stopPropagation(); descargarImagen(pvDownloadUrl, pvDownloadNombre); });
    visor.appendChild(btn);
    return btn;
}

function abrirVisorImagen(url, nombreArchivo) {
    if (!url) return;
    pvDownloadUrl = url;
    pvDownloadNombre = nombreArchivo || 'imagen.jpg';
    $('pvImage').src = url;
    $('pvName').textContent = '';
    $('pvHandle').textContent = '';
    asegurarBotonDescarga();
    $('photoViewer').classList.add('show');
}

async function descargarImagen(url, nombreArchivo) {
    if (!url) return;
    const nombre = (nombreArchivo || 'imagen.jpg').replace(/[^\w.\-]+/g, '_');
    try {
        const r = await fetch(url, { mode: 'cors' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
        toast('Descarga iniciada.', 'success');
    } catch (e) {
        console.warn('Descarga directa no disponible, abriendo en pestaña:', e);
        window.open(url, '_blank', 'noopener');
        toast('Mantén presionada la imagen para guardarla.', 'warning');
    }
}

function cerrarPhotoViewer() { $('photoViewer').classList.remove('show'); }

function abrirProfileModal() { $('profileModal').classList.add('show'); }
function cerrarProfileModal() { $('profileModal').classList.remove('show'); }