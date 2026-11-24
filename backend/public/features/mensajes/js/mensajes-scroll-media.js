// ================================================================
// MENSAJES · SCROLL Y MEDIA v2.2 · MÓDULO 2 DE 8
// Ruta: backend/public/features/mensajes/js/mensajes-scroll-media.js
// Depende de: mensajes-core.js (db, $, toast, session, signedCache,
//             isUserAtBottom, unreadCount, scrollRetryTimer,
//             SCROLL_THRESHOLD, TTL_SIGNED_MS)
// Cambios v2.2 (corrección de atascos):
//  - scrollToBottom ya no usa intervalos de 100 ms con scrollIntoView.
//    Hace un solo scroll por frame (requestAnimationFrame) y, como
//    máximo, dos reintentos cortos.
//  - observarCargaMultimedia usa UN solo listener de captura en el
//    contenedor de mensajes, en vez de tres por cada imagen/audio/video.
//  - detectarSiEstaAbajo se limita a una lectura de layout por frame.
//  - Las firmas de adjuntos se deduplican (una sola petición por mensaje
//    aunque se pida varias veces) y se limitan a 4 simultáneas.
// Cambios v2.1: adjuntos firmados desde el backend, solo remitente o
//               destinatario; reutilización de firmas 50 minutos.
// ================================================================

'use strict';

/* ---------------- Scroll ---------------- */

let scrollFramePendiente = false;
let detectarFramePendiente = false;

/* Un solo ajuste de scroll por frame, aunque lleguen muchos eventos. */
function irAlFondoAhora(box) {
    if (!box || scrollFramePendiente) return;
    scrollFramePendiente = true;
    requestAnimationFrame(function () {
        scrollFramePendiente = false;
        box.scrollTop = box.scrollHeight;
    });
}

function scrollToBottom(force = false) {
    const box = $('messages');
    if (!box) return;
    if (!force && !isUserAtBottom) return;

    irAlFondoAhora(box);

    /* Dos reintentos cortos: cubren el caso de que el layout aún no esté
       listo al pintar. Ya no hay intervalos de 100 ms. */
    if (scrollRetryTimer) clearTimeout(scrollRetryTimer);
    scrollRetryTimer = setTimeout(function () {
        scrollRetryTimer = null;
        if (force || isUserAtBottom) irAlFondoAhora(box);
    }, 150);

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

/* Se llama en cada evento de scroll, pero solo lee el layout una vez por frame. */
function detectarSiEstaAbajo() {
    if (detectarFramePendiente) return;
    detectarFramePendiente = true;
    requestAnimationFrame(function () {
        detectarFramePendiente = false;
        const box = $('messages');
        if (!box) return;
        const distanciaAlFondo = box.scrollHeight - box.scrollTop - box.clientHeight;
        const estabaAbajo = isUserAtBottom;
        isUserAtBottom = distanciaAlFondo < SCROLL_THRESHOLD;
        if (isUserAtBottom && !estabaAbajo) ocultarFlechaNuevos();
    });
}

/* ---------------- Carga de multimedia ---------------- */

let listenerMediaInstalado = false;

/* Un solo listener de captura en el contenedor. Las imágenes, audios y
   videos que se carguen dentro disparan el mismo ajuste (agrupado por frame). */
function observarCargaMultimedia(box) {
    if (!box || listenerMediaInstalado) return;
    listenerMediaInstalado = true;

    const alCargar = function () {
        if (!isUserAtBottom) return;
        irAlFondoAhora(box);
    };

    box.addEventListener('load', alCargar, true);
    box.addEventListener('loadedmetadata', alCargar, true);
}

/* ---------------- Firmas de archivos ---------------- */

async function firmarConCache(bucket, filePath) {
    const clave = bucket + '/' + filePath;
    const enCache = signedCache.get(clave);
    if (enCache && Date.now() - enCache.ts < TTL_SIGNED_MS) return enCache.url;
    const { data, error } = await db.storage.from(bucket).createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) return null;
    signedCache.set(clave, { ts: Date.now(), url: data.signedUrl });
    return data.signedUrl;
}

/* Firma de adjuntos de chat desde el backend (chat-attachments y chat-audio).
   El backend verifica que el usuario sea remitente o destinatario. */
const firmasChat = new Map();
const firmasPendientes = new Map();
const TTL_FIRMA_CHAT_MS = 50 * 60 * 1000;

/* Límite de peticiones simultáneas al backend: evita saturar la red
   y el teléfono cuando un chat tiene muchos archivos. */
const FIRMA_CONCURRENCIA_MAX = 4;
let firmaEnVuelo = 0;
const firmaCola = [];

function drenarColaFirmas() {
    while (firmaEnVuelo < FIRMA_CONCURRENCIA_MAX && firmaCola.length) {
        const tarea = firmaCola.shift();
        firmaEnVuelo++;
        Promise.resolve()
            .then(tarea.fn)
            .then(tarea.resolve, tarea.reject)
            .finally(function () {
                firmaEnVuelo--;
                drenarColaFirmas();
            });
    }
}

function conLimiteFirma(fn) {
    return new Promise(function (resolve, reject) {
        firmaCola.push({ fn: fn, resolve: resolve, reject: reject });
        drenarColaFirmas();
    });
}

async function firmarMediaChat(mensajeId) {
    const enCache = firmasChat.get(mensajeId);
    if (enCache && Date.now() - enCache.ts < TTL_FIRMA_CHAT_MS) return enCache.url;

    /* Si ya hay una petición en curso para este mensaje, se reutiliza. */
    if (firmasPendientes.has(mensajeId)) return firmasPendientes.get(mensajeId);

    const promesa = conLimiteFirma(async function () {
        try {
            const s = await session();
            if (!s) return null;

            const r = await fetch('/api/media/chat/' + encodeURIComponent(mensajeId) + '/url', {
                headers: { 'Authorization': 'Bearer ' + s.access_token }
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.ok || !d.url) return null;

            firmasChat.set(mensajeId, { ts: Date.now(), url: d.url });
            return d.url;
        } catch (e) {
            console.warn('No se pudo firmar el adjunto:', e);
            return null;
        }
    }).finally(function () {
        firmasPendientes.delete(mensajeId);
    });

    firmasPendientes.set(mensajeId, promesa);
    return promesa;
}

async function getSignedUrlForMessage(m) {
    if (!m.imagen_url || m.tipo === 'texto') return null;
    const raw = m.imagen_url;

    if (raw.startsWith('bucket://chat-')) {
        return m.id ? await firmarMediaChat(m.id) : null;
    }

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

/* ---------------- Visor de fotos ---------------- */

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