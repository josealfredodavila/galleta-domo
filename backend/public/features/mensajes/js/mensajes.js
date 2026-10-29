// ================================================================
// MENSAJES · JS v5.0 · WEB3 NEON UI
// Cambios v5.0:
// - Fix doble binding de emojis (binding delegado a teclado-emojis.js)
// - Bandera __livekitReady para el botón de videollamada
// - openConversation usa __livekitReady (no re-deshabilita el botón)
// ================================================================

'use strict';

const BOT_ID = 'bot-marquinhos';
const BOT_UUID = '0a000000-0000-4000-8000-000000000001';
const ESTADOS_BUCKET = 'sariels-estados';
const BOT_MAX_HISTORY = 6;

let db = null;
let user = null;
let current = null;
let msgChannel = null;
let callChannel = null;
let incomingId = null;

let recorder = null;
let audioChunks = [];
let recordingMode = null;
let recordingStartedAt = 0;

let voiceBotRecorder = null;
let voiceBotChunks = [];
let voiceBotGrabando = false;
let enviandoVozBot = false;

let isUserAtBottom = true;
let unreadCount = 0;
const SCROLL_THRESHOLD = 100;
let scrollRetryTimer = null;

let currentUserProfile = null;

let estadosCache = [];
let estadoActualIndex = 0;
let estadoActualUserId = null;
let estadoTimer = null;
let estadoProgresoActual = 0;
let estadoPausado = false;
let estadoVistos = JSON.parse(localStorage.getItem('sariels_estados_vistos') || '{}');

const call = {
    room: null, id: null, active: false, audio: null, video: null,
    screen: null, initiator: false, roomName: null, tipo: 'video'
};

const perfilCache = new Map();
const TTL_PERFIL_MS = 5 * 60 * 1000;
const signedCache = new Map();
const TTL_SIGNED_MS = 50 * 60 * 1000;

// Bandera global de LiveKit: se pone en true cuando el SDK está listo
window.__livekitReady = !!window.LivekitClient;

const $ = id => document.getElementById(id);

function toast(text, type = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast show ' + type;
    clearTimeout(el.t);
    el.t = setTimeout(() => el.classList.remove('show'), 3500);
}

function esc(v) {
    const d = document.createElement('div');
    d.textContent = v ?? '';
    return d.innerHTML;
}

function esErrorContenidoNoPermitido(err) {
    return !!(err && err.message && err.message.indexOf('contenido_no_permitido') !== -1);
}

function limpiarMarkdown(texto) {
    if (typeof texto !== 'string') return '';
    let t = texto;
    t = t.replace(/```[\s\S]*?```/g, '');
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    t = t.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    t = t.replace(/\*\*(.*?)\*\*/g, '$1');
    t = t.replace(/\*(.*?)\*/g, '$1');
    t = t.replace(/___(.*?)___/g, '$1');
    t = t.replace(/__(.*?)__/g, '$1');
    t = t.replace(/_(.*?)_/g, '$1');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/^\s{0,3}[-*+]\s+/gm, '');
    t = t.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');
    t = t.replace(/^\s{0,3}>\s?/gm, '');
    t = t.replace(/^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/gm, '');
    t = t.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    t = t.replace(/^\s*\|.*\|\s*$/gm, '');
    t = t.replace(/\|/g, ' ');
    t = t.replace(/^\s*[*#_~•◈✦🔴🟡🟢➤→»]+\s*/gm, '');
    t = t.replace(/\s+[*#_~]{2,}\s+/g, ' ');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

const NeonModal = (function () {
    let activeBackdrop = null, activeResolve = null, activeEscHandler = null;

    function _cleanup() {
        if (activeBackdrop && activeBackdrop.parentNode) activeBackdrop.parentNode.removeChild(activeBackdrop);
        if (activeEscHandler) document.removeEventListener('keydown', activeEscHandler);
        activeBackdrop = null; activeResolve = null; activeEscHandler = null;
    }

    function _open(opts, resolveFn) {
        _cleanup();
        activeResolve = resolveFn;
        const backdrop = document.createElement('div');
        backdrop.className = 'neon-modal-backdrop show';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        const danger = !!opts.danger;
        const card = document.createElement('div');
        card.className = 'neon-modal-card' + (danger ? ' danger' : '');
        const iconHtml = opts.icon ? `<div class="neon-modal-icon">${opts.icon}</div>` : '';
        const titleHtml = opts.title ? `<h3 class="neon-modal-title">${esc(opts.title)}</h3>` : '';
        const messageHtml = opts.message ? `<p class="neon-modal-message">${esc(opts.message)}</p>` : '';
        const inputHtml = opts.type === 'prompt' ? `<input class="neon-modal-input" type="text" placeholder="${esc(opts.placeholder || '')}" value="${esc(opts.defaultValue || '')}" maxlength="${opts.maxlength || 200}">` : '';
        const confirmText = opts.confirmText || 'Aceptar';
        const cancelText = opts.cancelText || 'Cancelar';
        const confirmClass = danger ? 'danger' : 'confirm';

        card.innerHTML = `
            ${iconHtml}
            ${titleHtml}
            ${messageHtml}
            ${inputHtml}
            <div class="neon-modal-actions">
                <button type="button" class="neon-modal-btn cancel" data-role="cancel">${esc(cancelText)}</button>
                <button type="button" class="neon-modal-btn ${confirmClass}" data-role="confirm">${esc(confirmText)}</button>
            </div>
        `;

        backdrop.appendChild(card);
        document.body.appendChild(backdrop);
        activeBackdrop = backdrop;

        const inputEl = card.querySelector('.neon-modal-input');
        const btnCancel = card.querySelector('[data-role="cancel"]');
        const btnConfirm = card.querySelector('[data-role="confirm"]');

        if (inputEl) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 40);
        else setTimeout(() => btnConfirm && btnConfirm.focus(), 40);

        function finish(value) {
            const r = activeResolve;
            _cleanup();
            if (typeof r === 'function') r(value);
        }

        btnCancel.addEventListener('click', () => finish(null));
        btnConfirm.addEventListener('click', () => {
            if (opts.type === 'prompt') {
                const v = inputEl ? inputEl.value.trim() : '';
                finish(v || null);
            } else finish(true);
        });
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
        if (inputEl) inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); const v = inputEl.value.trim(); finish(v || null); }
        });
        activeEscHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };
        document.addEventListener('keydown', activeEscHandler);
    }

    function confirm(opts) {
        return new Promise((resolve) => {
            _open({ type: 'confirm', title: opts.title || 'Confirmar', message: opts.message || '', icon: opts.icon || '?', confirmText: opts.confirmText || 'Aceptar', cancelText: opts.cancelText || 'Cancelar', danger: !!opts.danger }, resolve);
        });
    }

    function prompt(opts) {
        return new Promise((resolve) => {
            _open({ type: 'prompt', title: opts.title || 'Ingresa un valor', message: opts.message || '', icon: opts.icon || '✎', placeholder: opts.placeholder || '', defaultValue: opts.defaultValue || '', maxlength: opts.maxlength || 200, confirmText: opts.confirmText || 'Aceptar', cancelText: opts.cancelText || 'Cancelar', danger: !!opts.danger }, resolve);
        });
    }

    return { confirm, prompt };
})();

async function session() {
    if (!db) return null;
    const r = await db.auth.getSession();
    if (r.error) throw r.error;
    return r.data.session;
}

async function auth() {
    const s = await session();
    if (!s) { toast('⚠️ Inicia sesión para usar Mensajes', 'error'); return false; }
    user = s.user;
    return true;
}

async function subirViaBackend(file, destino, tipo) {
    const s = await session();
    if (!s) throw new Error('Inicia sesión primero');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('destino', destino);
    fd.append('tipo', tipo);
    const r = await fetch('/api/media/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + s.access_token }, body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo subir el archivo');
    return d;
}

function avatar(name, url, cls = 'avatar') {
    if (url) return `<div class="${cls}"><img src="${esc(url)}" alt=""></div>`;
    return `<div class="${cls}">${esc((name || '◈').charAt(0).toUpperCase())}</div>`;
}

async function profile(id) {
    if (id === BOT_ID) return { id: BOT_ID, nombre: "Marquinhos", handle: 'marquinhos', avatar_url: null, online: true, bot: true };
    const enCache = perfilCache.get(id);
    if (enCache && Date.now() - enCache.ts < TTL_PERFIL_MS) return enCache.data;
    const r = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url,online,ultima_conexion').eq('id', id).maybeSingle();
    const data = r.data || { id, nombre: 'Usuario', avatar_url: null, online: false };
    perfilCache.set(id, { ts: Date.now(), data });
    return data;
}

async function cargarFotoHeader() {
    if (!user || !user.id) return;
    try {
        const { data, error } = await db.from('usuarios').select('avatar_url, nombre, handle').eq('id', user.id).maybeSingle();
        if (error) { console.warn('No se pudo cargar perfil:', error.message); return; }
        currentUserProfile = data;
        const headerAvatar = $('headerAvatar');
        if (data?.avatar_url) headerAvatar.innerHTML = `<img src="${esc(data.avatar_url)}" alt="Mi foto">`;
        else { const inicial = (data?.nombre || data?.handle || '◈').charAt(0).toUpperCase(); headerAvatar.innerHTML = esc(inicial); }
        $('profileModalAvatar').innerHTML = data?.avatar_url ? `<img src="${esc(data.avatar_url)}" alt="Mi foto">` : esc((data?.nombre || data?.handle || '◈').charAt(0).toUpperCase());
        $('profileModalName').textContent = data?.nombre || 'Mi Perfil';
        $('profileModalHandle').textContent = '@' + (data?.handle || 'usuario');
    } catch (e) { console.warn('Error cargando foto del header:', e); }
}

function abrirProfileModal() { $('profileModal').classList.add('show'); }
function cerrarProfileModal() { $('profileModal').classList.remove('show'); }

async function subirFotoHeader(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!await auth()) return;
    if (file.size > 5 * 1024 * 1024) { toast('❌ La imagen no puede superar los 5 MB', 'error'); event.target.value = ''; return; }
    if (!file.type.startsWith('image/')) { toast('❌ Solo se permiten imágenes', 'error'); event.target.value = ''; return; }
    try {
        toast('⏳ Revisando y subiendo foto...', '');
        const d = await subirViaBackend(file, 'sariels-avatars', 'imagen');
        const { error: updateError } = await db.from('usuarios').update({ avatar_url: d.url + '?t=' + Date.now() }).eq('id', user.id);
        if (updateError) throw updateError;
        toast('✅ Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarFotoHeader();
    } catch (error) {
        console.error('Error al subir foto:', error);
        toast('❌ ' + (error.message || 'No se pudo subir la foto'), 'error');
        event.target.value = '';
    }
}

function verFotoAmpliada(url, nombre, handle) {
    if (!url) { toast('ℹ️ Este usuario no tiene foto de perfil', 'warning'); return; }
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
    btn.textContent = '⬇ Descargar';
    btn.style.cssText = 'position:absolute;bottom:28px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:99px;border:1px solid var(--gold);background:rgba(5,8,15,.85);color:var(--gold);font-weight:800;font-size:.85rem;cursor:pointer;z-index:2;';
    btn.addEventListener('click', e => { e.stopPropagation(); descargarImagen(pvDownloadUrl, pvDownloadNombre); });
    visor.appendChild(btn);
    return btn;
}

function abrirVisorImagen(url, nombreArchivo) {
    if (!url) return;
    pvDownloadUrl = url; pvDownloadNombre = nombreArchivo || 'imagen.jpg';
    $('pvImage').src = url; $('pvName').textContent = ''; $('pvHandle').textContent = '';
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
        a.href = objUrl; a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
        toast('✅ Descarga iniciada', 'success');
    } catch (e) {
        console.warn('Descarga directa no disponible, abriendo en pestaña:', e);
        window.open(url, '_blank', 'noopener');
        toast('ℹ️ Mantén presionada la imagen para guardarla', 'warning');
    }
}

function cerrarPhotoViewer() { $('photoViewer').classList.remove('show'); }

function marcarEstadoVisto(estadoId) { estadoVistos[estadoId] = Date.now(); localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos)); }
function estadoEsNuevo(estado) { return !estadoVistos[estado.id]; }
function limpiarVistosAntiguos() {
    const limite = Date.now() - (48 * 60 * 60 * 1000);
    Object.keys(estadoVistos).forEach(k => { if (estadoVistos[k] < limite) delete estadoVistos[k]; });
    localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos));
}
async function registrarVistaEstado(estadoId) {
    if (!user) return;
    try { await db.from('estados_vistas').upsert({ estado_id: estadoId, usuario_id: user.id }, { onConflict: 'estado_id,usuario_id', ignoreDuplicates: true }); } catch (e) { }
}
async function obtenerVistasEstado(estadoId) {
    try {
        const { count, error } = await db.from('estados_vistas').select('id', { count: 'exact', head: true }).eq('estado_id', estadoId);
        if (error) return 0;
        return count || 0;
    } catch (e) { return 0; }
}
function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';
    const diffMin = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffMin < 1440) return `hace ${Math.floor(diffMin / 60)} h`;
    return `hace ${Math.floor(diffMin / 1440)} d`;
}
async function cargarEstados() {
    const scroll = $('estadosScroll');
    scroll.innerHTML = '';
    if (!user) return;
    try {
        const { data, error } = await db.from('estados').select('id, usuario_id, imagen_url, caption, created_at, expires_at').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true });
        if (error) {
            if (error.code === '42P01') { console.warn('Tabla estados no existe aún'); return; }
            throw error;
        }
        estadosCache = data || [];
        if (estadosCache.length === 0) {
            scroll.innerHTML = '<div style="color:var(--muted);font-size:.7rem;padding:8px 4px;text-align:center;width:100%;">Sin estados</div>';
            return;
        }
        const porUsuario = {};
        estadosCache.forEach(e => { if (!porUsuario[e.usuario_id]) porUsuario[e.usuario_id] = []; porUsuario[e.usuario_id].push(e); });
        const miEstado = porUsuario[user.id];
        if (miEstado && miEstado.length > 0) {
            const tieneNuevos = miEstado.some(e => estadoEsNuevo(e));
            const ultimoEstadoId = miEstado[miEstado.length - 1].id;
            const ultimoEstadoImg = miEstado[miEstado.length - 1].imagen_url;
            const totalVistas = await obtenerVistasEstado(ultimoEstadoId);
            const html = `
                <div class="estado-item" data-userid="${user.id}" style="position:relative;">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner"><img src="${esc(ultimoEstadoImg)}" alt=""></div>
                    </div>
                    ${totalVistas > 0 ? `<span class="estado-vistas-badge">${totalVistas}</span>` : ''}
                    <div class="estado-name">Tú</div>
                </div>`;
            scroll.insertAdjacentHTML('beforeend', html);
            scroll.querySelector(`[data-userid="${user.id}"]`).onclick = () => abrirEstadoUsuario(user.id);
        }
        for (const uid of Object.keys(porUsuario)) {
            if (uid === user.id) continue;
            const p = await profile(uid);
            const estadosUsuario = porUsuario[uid];
            const tieneNuevos = estadosUsuario.some(e => estadoEsNuevo(e));
            const html = `
                <div class="estado-item" data-userid="${uid}">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase())}</div>
                    </div>
                    <div class="estado-name">${esc(p.nombre || 'Usuario')}</div>
                </div>`;
            scroll.insertAdjacentHTML('beforeend', html);
            scroll.querySelector(`[data-userid="${uid}"]`).onclick = () => abrirEstadoUsuario(uid);
        }
    } catch (e) { console.warn('Error cargando estados:', e); }
}

function abrirEstadoUsuario(uid) {
    const estados = estadosCache.filter(e => e.usuario_id === uid);
    if (estados.length === 0) { toast('ℹ️ Este usuario no tiene estados', 'warning'); return; }
    estadoActualUserId = uid; estadoActualIndex = 0; estadoProgresoActual = 0; estadoPausado = false;
    mostrarEstadoActual();
    $('estadoViewer').classList.add('show');
}

async function mostrarEstadoActual() {
    const estados = estadosCache.filter(e => e.usuario_id === estadoActualUserId);
    if (estadoActualIndex >= estados.length) { cerrarEstadoViewer(); return; }
    const estado = estados[estadoActualIndex];
    const esMiEstado = (estadoActualUserId === user.id);
    if (esMiEstado) {
        $('evAvatar').innerHTML = currentUserProfile?.avatar_url ? `<img src="${esc(currentUserProfile.avatar_url)}" alt="">` : esc((currentUserProfile?.nombre || '◈').charAt(0).toUpperCase());
        $('evName').textContent = 'Tú';
    } else {
        db.from('perfiles_publicos').select('nombre, handle, avatar_url').eq('id', estadoActualUserId).maybeSingle().then(r => {
            if (r.data) {
                $('evAvatar').innerHTML = r.data.avatar_url ? `<img src="${esc(r.data.avatar_url)}" alt="">` : esc((r.data.nombre || '◈').charAt(0).toUpperCase());
                $('evName').textContent = r.data.nombre || 'Usuario';
            }
        });
    }
    $('evImage').src = estado.imagen_url;
    $('evTime').textContent = haceTiempo(estado.created_at);
    if (estado.caption) { $('evCaption').textContent = estado.caption; $('evCaption').classList.remove('hidden'); }
    else $('evCaption').classList.add('hidden');
    marcarEstadoVisto(estado.id);
    registrarVistaEstado(estado.id);
    $('evPrev').classList.toggle('hidden', estadoActualIndex === 0);
    $('evNext').classList.toggle('hidden', estadoActualIndex >= estados.length - 1);
    if (esMiEstado) {
        const total = await obtenerVistasEstado(estado.id);
        $('evVistasCount').textContent = total;
        $('evVistas').classList.remove('hidden');
        $('evVistas').dataset.estadoId = estado.id;
    } else $('evVistas').classList.add('hidden');
    iniciarProgresoEstado();
}

function iniciarProgresoEstado() {
    const progress = $('estadoProgress');
    if (estadoTimer) clearInterval(estadoTimer);
    progress.style.width = estadoProgresoActual + '%';
    estadoTimer = setInterval(() => {
        if (estadoPausado) return;
        estadoProgresoActual += 1;
        progress.style.width = estadoProgresoActual + '%';
        if (estadoProgresoActual >= 100) { clearInterval(estadoTimer); estadoProgresoActual = 0; siguienteEstado(); }
    }, 50);
}

function siguienteEstado() {
    const estados = estadosCache.filter(e => e.usuario_id === estadoActualUserId);
    if (estadoActualIndex < estados.length - 1) { estadoActualIndex++; estadoProgresoActual = 0; estadoPausado = false; mostrarEstadoActual(); }
    else cerrarEstadoViewer();
}

function anteriorEstado() {
    if (estadoActualIndex > 0) { estadoActualIndex--; estadoProgresoActual = 0; estadoPausado = false; mostrarEstadoActual(); }
}

function cerrarEstadoViewer() {
    $('estadoViewer').classList.remove('show');
    if (estadoTimer) clearInterval(estadoTimer);
    estadoTimer = null; estadoPausado = false; estadoProgresoActual = 0; estadoActualUserId = null;
    cargarEstados();
}

function activarPausaEstado() { if (!$('estadoViewer').classList.contains('show')) return; estadoPausado = true; }
function desactivarPausaEstado() { if (!$('estadoViewer').classList.contains('show')) return; estadoPausado = false; }

async function abrirVistasModal(estadoId) {
    if (!estadoId) return;
    $('vistasModal').classList.add('show');
    const list = $('vistasList');
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>';
    $('vistasModalCount').textContent = '';
    try {
        const { data: vistas, error } = await db.from('estados_vistas').select('usuario_id, visto_at').eq('estado_id', estadoId).order('visto_at', { ascending: false });
        if (error) throw error;
        if (!vistas || vistas.length === 0) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Nadie ha visto este estado aún</div>'; return; }
        $('vistasModalCount').textContent = `(${vistas.length})`;
        const ids = vistas.map(v => v.usuario_id);
        const { data: perfiles } = await db.from('perfiles_publicos').select('id, nombre, handle, avatar_url').in('id', ids);
        const perfilMap = {};
        (perfiles || []).forEach(p => { perfilMap[p.id] = p; });
        list.innerHTML = '';
        vistas.forEach(v => {
            const p = perfilMap[v.usuario_id] || { nombre: 'Usuario', handle: '', avatar_url: null };
            const inicial = (p.nombre || '◈').charAt(0).toUpperCase();
            const avatarHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(inicial);
            list.insertAdjacentHTML('beforeend', `
                <div class="result" style="cursor:pointer;" data-handle="${esc(p.handle || '')}">
                    <div class="avatar">${avatarHTML}</div>
                    <div style="flex:1;min-width:0;"><b>${esc(p.nombre || 'Usuario')}</b><div style="font-size:.68rem;color:var(--muted);">@${esc(p.handle || 'usuario')} · ${haceTiempo(v.visto_at)}</div></div>
                </div>`);
        });
        list.querySelectorAll('.result').forEach(el => {
            el.onclick = () => { const handle = el.dataset.handle; if (handle) window.location.href = `/perfil/${handle}`; };
        });
    } catch (e) {
        console.error('Error cargando vistas:', e);
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:.8rem;">Error al cargar vistas</div>';
    }
}

function cerrarVistasModal() { $('vistasModal').classList.remove('show'); }

function abrirModalEstado() {
    $('estadoUploadModal').classList.add('show');
    $('estadoPreviewWrap').style.display = 'none';
    $('estadoPreviewImg').src = '';
    $('estadoCaption').value = '';
    $('btnPublicarEstado').disabled = true;
    $('estadoFileInput').value = '';
}

function cerrarModalEstado() { $('estadoUploadModal').classList.remove('show'); }
function seleccionarArchivoEstado() { $('estadoFileInput').click(); }

async function previewEstado(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('❌ La imagen no puede superar 5 MB', 'error'); event.target.value = ''; return; }
    if (!file.type.startsWith('image/')) { toast('❌ Solo se permiten imágenes', 'error'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => { $('estadoPreviewImg').src = e.target.result; $('estadoPreviewWrap').style.display = 'block'; $('btnPublicarEstado').disabled = false; };
    reader.readAsDataURL(file);
}

async function publicarEstado() {
    const fileInput = $('estadoFileInput');
    const file = fileInput.files[0];
    if (!file) { toast('⚠️ Selecciona una imagen', 'error'); return; }
    if (!await auth()) return;
    const caption = $('estadoCaption').value.trim();
    const btn = $('btnPublicarEstado');
    btn.disabled = true;
    btn.textContent = '⏳ Publicando...';
    try {
        const d = await subirViaBackend(file, ESTADOS_BUCKET, 'imagen');
        const { error: insertError } = await db.from('estados').insert({ usuario_id: user.id, imagen_url: d.url, caption: caption || null });
        if (insertError) throw insertError;
        toast('✅ Estado publicado (24h)', 'success');
        cerrarModalEstado();
        await cargarEstados();
    } catch (e) {
        console.error('Error publicando estado:', e);
        if (e.code === '42P01') toast('❌ Tabla "estados" no existe. Ejecuta el SQL.', 'error');
        else toast('❌ ' + (e.message || 'No se pudo publicar el estado'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Publicar estado';
    }
}

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
        btn.classList.add('has-new');
        if (badge) { badge.textContent = unreadCount > 9 ? '9+' : unreadCount; badge.style.display = 'flex'; }
    } else {
        btn.classList.remove('has-new');
        if (badge) badge.style.display = 'none';
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

let conversationFilter = '';

async function loadConversations() {
    const list = $('conversationList');
    list.innerHTML = '';
    const botEl = document.createElement('div');
    botEl.className = 'conv conv-bot' + (current?.id === BOT_ID ? ' active' : '');
    botEl.dataset.id = BOT_ID;
    botEl.dataset.name = 'marquinhos';
    botEl.innerHTML = `
        <div class="avatar avatar-bot">✦</div>
        <div class="convinfo">
            <div class="convname">Marquinhos</div>
            <div class="convmsg" id="botLastMsg">Tu asistente personal ✦</div>
        </div>
        <div class="convtime" id="botBadge" style="color:var(--success);font-size:.55rem">IA</div>`;
    botEl.onclick = () => openConversation(BOT_ID);
    list.appendChild(botEl);

    if (!await auth()) return;

    try {
        const { data: lastBot } = await db.from('mensajes_chat').select('contenido,tipo,created_at').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (lastBot) {
            const preview = $('botLastMsg');
            if (preview) preview.textContent = lastBot.tipo === 'texto' ? (lastBot.contenido || '').slice(0, 60) : ('📎 ' + (lastBot.contenido || lastBot.tipo));
        }
        const { count: noLeidos } = await db.from('mensajes_chat').select('id', { count: 'exact', head: true }).eq('remitente_id', BOT_UUID).eq('destinatario_id', user.id).eq('leido', false).eq('eliminado', false);
        const badge = $('botBadge');
        if (badge && noLeidos && noLeidos > 0) {
            badge.innerHTML = `<span style="background:var(--danger);color:#fff;font-size:.6rem;font-weight:800;padding:2px 8px;border-radius:99px;min-width:20px;text-align:center;display:inline-block;animation:pulse-badge 1.5s infinite;">${noLeidos > 9 ? '9+' : noLeidos}</span>`;
        }
    } catch (e) { console.warn('Error cargando badge bot:', e); }

    try {
        const { data: mensajes, error } = await db.from('mensajes_chat').select('id, remitente_id, destinatario_id, contenido, tipo, leido, created_at').eq('eliminado', false).neq('remitente_id', BOT_UUID).neq('destinatario_id', BOT_UUID).or(`remitente_id.eq.${user.id},destinatario_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(100);
        if (error) { console.error('Error cargando mensajes:', error); return; }
        const conversacionesMap = new Map();
        (mensajes || []).forEach(m => {
            const otherUserId = (m.remitente_id === user.id) ? m.destinatario_id : m.remitente_id;
            if (!otherUserId || otherUserId === user.id) return;
            if (otherUserId === BOT_UUID) return;
            if (!conversacionesMap.has(otherUserId)) conversacionesMap.set(otherUserId, { otherUserId, lastMsg: m, unread: 0 });
            if (m.remitente_id === otherUserId && m.destinatario_id === user.id && m.leido === false) conversacionesMap.get(otherUserId).unread++;
        });
        try {
            const { data: contactos } = await db.from('contactos').select('contacto_id').eq('usuario_id', user.id).neq('estado', 'bloqueado');
            (contactos || []).forEach(c => {
                if (!c.contacto_id) return;
                if (c.contacto_id === user.id) return;
                if (c.contacto_id === BOT_UUID) return;
                if (!conversacionesMap.has(c.contacto_id)) conversacionesMap.set(c.contacto_id, { otherUserId: c.contacto_id, lastMsg: null, unread: 0 });
            });
        } catch (e) { console.warn('No se pudieron cargar contactos extra:', e); }

        const conversaciones = Array.from(conversacionesMap.values());
        if (!conversaciones.length) { aplicarFiltroConversaciones(); return; }
        const otherIds = conversaciones.map(c => c.otherUserId);
        const { data: perfiles } = await db.from('perfiles_publicos').select('id, nombre, handle, avatar_url, online').in('id', otherIds);
        const perfilMap = {};
        (perfiles || []).forEach(p => { perfilMap[p.id] = p; });
        conversaciones.sort((a, b) => {
            const aDate = a.lastMsg?.created_at ? new Date(a.lastMsg.created_at).getTime() : 0;
            const bDate = b.lastMsg?.created_at ? new Date(b.lastMsg.created_at).getTime() : 0;
            return bDate - aDate;
        });
        conversaciones.forEach(conv => {
            const otherId = conv.otherUserId;
            const p = perfilMap[otherId] || { id: otherId, nombre: 'Usuario', handle: 'usuario', avatar_url: null, online: false };
            const last = conv.lastMsg;
            const preview = last ? (last.tipo === 'texto' ? (last.contenido || '').slice(0, 60) : ('📎 ' + (last.contenido || last.tipo))) : 'Sin mensajes';
            const hora = last?.created_at ? new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const el = document.createElement('div');
            el.className = 'conv' + (current?.id === otherId ? ' active' : '');
            el.dataset.id = otherId;
            el.dataset.name = ((p.nombre || '').toLowerCase() + ' ' + (p.handle || '').toLowerCase()).trim();
            el.innerHTML = avatar(p.nombre, p.avatar_url) + `
                <div class="convinfo">
                    <div class="convname">${esc(p.nombre || 'Usuario')}</div>
                    <div class="convmsg">${esc(preview)}</div>
                </div>
                <div class="convtime">
                    ${hora}
                    ${conv.unread > 0 ? `<span style="display:inline-block;margin-left:6px;background:var(--danger);color:#fff;font-size:.6rem;font-weight:800;padding:2px 7px;border-radius:99px;min-width:18px;text-align:center;">${conv.unread > 9 ? '9+' : conv.unread}</span>` : ''}
                </div>`;
            el.onclick = () => openConversation(otherId);
            list.appendChild(el);
        });
        aplicarFiltroConversaciones();
    } catch (e) { console.error('Error en loadConversations:', e); }
}

function aplicarFiltroConversaciones() {
    const q = conversationFilter.trim().toLowerCase();
    document.querySelectorAll('.conv').forEach(el => {
        if (!q || el.dataset.name?.includes(q) || el.querySelector('.convname')?.textContent.toLowerCase().includes(q)) el.style.display = 'flex';
        else el.style.display = 'none';
    });
}

async function openConversation(id) {
    if (!await auth()) return;
    const p = await profile(id);
    const esBot = (id === BOT_ID);
    current = { id, profile: p, bot: esBot };

    $('chatName').textContent = p.nombre || 'Usuario';
    $('chatAvatar').innerHTML = esBot ? '✦' : (p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase()));
    $('chatAvatar').className = 'avatar' + (esBot ? ' avatar-bot' : '');
    $('chatStatus').textContent = esBot ? '✦ IA · Siempre disponible' : (p.online ? '◉ En línea' : '◈ Desconectado');
    $('chatStatus').className = 'status' + (p.online ? ' online' : '');

    $('chatAvatar').onclick = () => {
        if (esBot) { toast('ℹ️ Marquinhos es un asistente IA', 'warning'); return; }
        verFotoAmpliada(p.avatar_url, p.nombre, p.handle);
    };

    $('voiceBot').style.display = esBot ? 'inline-flex' : 'none';
    $('chatActions').style.display = 'flex';

    const callBtn = $('videoCall');
    if (callBtn) {
        if (esBot) {
            callBtn.style.display = 'none';
        } else {
            callBtn.style.display = 'inline-flex';
            callBtn.title = 'Iniciar videollamada con ' + (p.nombre || 'usuario');
            // Fix: usa la bandera __livekitReady (no se re-deshabilita si ya cargó)
            callBtn.disabled = !window.__livekitReady;
        }
    }

    $('composer').style.display = 'flex';
    $('emptyState').style.display = 'none';
    $('panel').classList.add('chat-open');
    document.querySelectorAll('.conv').forEach(x => x.classList.toggle('active', x.dataset.id === id));

    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();

    if (esBot) {
        await db.from('mensajes_chat').update({ leido: true }).eq('remitente_id', BOT_UUID).eq('destinatario_id', user.id).eq('leido', false);
        const badge = $('botBadge');
        if (badge) { badge.textContent = 'IA'; badge.style.color = 'var(--success)'; }
        await abrirConversacionBot();
        return;
    }

    const r = await db.from('mensajes_chat').select('*').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${id}),and(remitente_id.eq.${id},destinatario_id.eq.${user.id})`).order('created_at', { ascending: true }).limit(100);
    if (r.error) { console.error(r.error); toast('❌ Error al cargar mensajes', 'error'); return; }
    await renderMessages(r.data || []);
    await markRead(id);
    subscribeMessages(id);
}

async function cerrarConversacion() {
    current = null;
    $('panel').classList.remove('chat-open');
    $('chatName').textContent = 'Selecciona una conversación';
    $('chatStatus').textContent = '◈ En espera';
    $('chatAvatar').innerHTML = '◈';
    $('chatAvatar').className = 'avatar';
    $('chatAvatar').onclick = null;
    $('chatActions').style.display = 'none';
    $('composer').style.display = 'none';
    $('emptyState').style.display = 'block';
    const box = $('messages');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    document.querySelectorAll('.conv').forEach(x => x.classList.remove('active'));
}

async function abrirConversacionBot() {
    const box = $('messages');
    const btn = box.querySelector('#scrollDownBtn');
    const anchor = box.querySelector('#scrollAnchor');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    if (!anchor) { const newAnchor = document.createElement('div'); newAnchor.id = 'scrollAnchor'; box.appendChild(newAnchor); }
    if (!btn) {
        const newBtn = document.createElement('button');
        newBtn.className = 'scroll-down-btn';
        newBtn.id = 'scrollDownBtn';
        newBtn.innerHTML = '↓<span class="badge-new" id="newMsgBadge" style="display:none;">1</span>';
        box.appendChild(newBtn);
        newBtn.onclick = () => { isUserAtBottom = true; scrollToBottom(true); actualizarFlecha(); };
    }

    let historial = [];
    try {
        const r = await db.from('mensajes_chat').select('*').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`).order('created_at', { ascending: true }).limit(200);
        if (!r.error) historial = r.data || [];
    } catch (e) { console.warn('No se pudo cargar el historial de Marquinhos:', e); }

    const anchorRef = box.querySelector('#scrollAnchor');
    if (!historial.length) {
        anchorRef.insertAdjacentHTML('beforebegin', `
            <div class="bubblewrap received">
                <div class="bubble">
                    <div class="bubble-bot-info">✦ MARQUINHOS</div>
                    ¡Hola! 👋 Soy Marquinhos, el asistente de Sariel's. Puedes:<br><br>
                    ◈ Escribirme un mensaje de texto<br>
                    ◈ Enviarme una nota de voz con 🎙️<br>
                    ◈ Hablarme con el botón 🔊 (te responderé con voz)<br><br>
                    ¿En qué te puedo ayudar hoy?
                </div>
            </div>`);
        isUserAtBottom = true;
        scrollToBottom(true);
        return;
    }
    const signedUrls = await Promise.all(historial.map(m => getSignedUrlForMessage(m)));
    historial.forEach((m, i) => {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });
    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

async function renderMessages(rows) {
    const box = $('messages');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    let anchor = box.querySelector('#scrollAnchor');
    if (!anchor) { anchor = document.createElement('div'); anchor.id = 'scrollAnchor'; box.appendChild(anchor); }
    if (!rows.length) {
        anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><strong>◈</strong><div>Sin mensajes</div><small>Envía el primer mensaje</small></div>');
        return;
    }
    const signedUrls = await Promise.all(rows.map(m => getSignedUrlForMessage(m)));
    rows.forEach((m, i) => {
        anchor.insertAdjacentHTML('beforebegin', messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });
    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

function urlSegura(u) {
    if (typeof u !== 'string' || !u) return null;
    try {
        const x = new URL(u, location.href);
        return (x.protocol === 'https:' || x.protocol === 'blob:') ? x.href : null;
    } catch (e) { return null; }
}

function messageHTML(m, sent, signedUrl) {
    const textoLimpio = limpiarMarkdown(m.contenido || '');
    let body = (typeof window.formatearMensajeConEmotes === 'function')
        ? window.formatearMensajeConEmotes(textoLimpio)
        : esc(textoLimpio);
    const urlToUse = urlSegura(signedUrl || m.imagen_url);
    if (urlToUse) {
        if (m.tipo === 'imagen') body = `<img src="${esc(urlToUse)}" alt="${esc(m.nombre_archivo || 'Imagen')}" loading="lazy" data-visor="1" data-src="${esc(urlToUse)}" data-nombre="${esc(m.nombre_archivo || 'imagen.jpg')}" style="cursor:zoom-in;">`;
        else if (m.tipo === 'video') body = `<video controls playsinline src="${esc(urlToUse)}"></video>`;
        else if (m.tipo === 'audio') body = `<audio controls preload="metadata" src="${esc(urlToUse)}"></audio>`;
        else { const displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido) || 'Archivo'); body = `📎 <a href="${esc(urlToUse)}" target="_blank" rel="noopener" style="color:var(--gold)">${displayName}</a>`; }
    }
    const esBotRecibido = !sent && (m.es_bot || m.bot_message);
    const headerBot = esBotRecibido ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';
    const avisoHTML = m.aviso_moderacion === 'lenguaje_inapropiado' ? '<div style="margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(247,212,74,.12);border:1px solid rgba(247,212,74,.4);color:#f7d44a;font-size:.68rem;">⚠️ Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.</div>' : '';
    return `<div class="bubblewrap ${sent ? 'sent' : 'received'}">
        <div class="bubble">${headerBot}${body}${avisoHTML}</div>
        <div class="meta">${m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}${sent ? (m.leido ? ' · ◆◆' : ' · ◈◈') : ''}</div>
    </div>`;
}

async function sendMessage(text) {
    if (!current || !text.trim()) return;
    if (!await auth()) return;
    const textoLimpio = text.trim();
    $('messageInput').value = '';

    if (current.bot) {
        if (!(await verificarTerminosMarquinhos())) { $('messageInput').value = textoLimpio; return; }
        let userMsg = { contenido: textoLimpio, created_at: new Date().toISOString(), tipo: 'texto', remitente_id: user.id, leido: true };
        try {
            const ins = await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: BOT_UUID, contenido: textoLimpio, tipo: 'texto', leido: true, editado: false, eliminado: false }).select('*').single();
            if (ins.error) throw ins.error;
            userMsg = ins.data;
        } catch (e) {
            if (esErrorContenidoNoPermitido(e)) { toast('❌ Contenido no permitido por las normas de la comunidad', 'error'); $('messageInput').value = textoLimpio; return; }
            console.warn('No se pudo guardar el mensaje del usuario:', e);
        }
        append(userMsg, true);
        mostrarTypingBot();
        try {
            const historial = await cargarHistorialParaBot();
            const respuesta = await preguntarAlBotConMemoria(textoLimpio, historial);
            quitarTypingBot();
            let botMsg = { contenido: respuesta, created_at: new Date().toISOString(), tipo: 'texto', remitente_id: BOT_UUID, leido: true, es_bot: true };
            try {
                const insBot = await db.from('mensajes_chat').insert({ remitente_id: BOT_UUID, destinatario_id: user.id, contenido: respuesta, tipo: 'texto', leido: true, editado: false, eliminado: false }).select('*').single();
                if (!insBot.error) botMsg = { ...insBot.data, es_bot: true };
            } catch (e) { console.warn('No se pudo guardar la respuesta de Marquinhos:', e); }
            append(botMsg, false);
            loadConversations();
        } catch (e) {
            quitarTypingBot();
            console.error('Error Marquinhos:', e);
            append({ contenido: '⚠️ ' + (e.message || 'Ups, tuve un problema.'), created_at: new Date().toISOString(), tipo: 'texto', remitente_id: BOT_UUID, leido: true, es_bot: true }, false);
        }
        return;
    }

    const r = await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: current.id, contenido: textoLimpio, tipo: 'texto', leido: false, editado: false, eliminado: false }).select('*').single();
    if (r.error) {
        console.error(r.error);
        if (esErrorContenidoNoPermitido(r.error)) toast('❌ Contenido no permitido por las normas de la comunidad', 'error');
        else toast('❌ Error al enviar mensaje', 'error');
        $('messageInput').value = textoLimpio;
        return;
    }
    await append(r.data, true);
    loadConversations();
}

async function verificarTerminosMarquinhos() {
    const TERMINOS_VERSION = '1.1';
    const TERMINOS_KEY = 'marquinhos_terminos_aceptados_' + TERMINOS_VERSION;
    try { if (localStorage.getItem(TERMINOS_KEY)) return true; } catch (e) {}
    try {
        const { data, error } = await db.rpc('verificar_aceptacion_terminos', { p_version: TERMINOS_VERSION });
        if (error) throw error;
        let aceptado = false;
        if (data === true || data === "true") aceptado = true;
        else if (data === false || data === null || data === undefined || data === "false" || data === "") aceptado = false;
        else if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                if (parsed === true || parsed === "true") aceptado = true;
                else if (parsed && typeof parsed === 'object') {
                    if (parsed.aceptado === true || parsed.aceptado === "true") aceptado = true;
                    else if (parsed.success === true && parsed.aceptado !== false) aceptado = true;
                }
            } catch (e) { aceptado = false; }
        } else if (typeof data === 'object') {
            if (data.aceptado === true || data.aceptado === "true") aceptado = true;
            else if (data.success === true && data.aceptado !== false) aceptado = true;
        }
        if (aceptado) {
            try { localStorage.setItem(TERMINOS_KEY, 'true'); } catch (e) {}
            return true;
        }
    } catch (e) { console.warn('Error verificando términos:', e); }
    toast('⚠️ Debes aceptar los Términos de Marquinhos primero', 'warning');
    const RUTA_TERMINOS_REAL = '/legal/terminos-marquinhos';
    setTimeout(() => { window.location.href = RUTA_TERMINOS_REAL; }, 1200);
    return false;
}

async function cargarHistorialParaBot() {
    try {
        const r = await db.from('mensajes_chat').select('remitente_id, contenido, tipo, created_at').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`).order('created_at', { ascending: false }).limit(BOT_MAX_HISTORY);
        if (r.error || !Array.isArray(r.data)) return [];
        return r.data.reverse().map(m => ({ role: m.remitente_id === user.id ? 'user' : 'assistant', content: limpiarMarkdown(m.contenido || '').slice(0, 2000) })).filter(m => m.content && m.content.length > 0);
    } catch (e) { console.warn('No se pudo cargar historial para el bot:', e); return []; }
}

async function preguntarAlBotConMemoria(mensaje, historial) {
    const s = await session();
    if (!s) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
    const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo ? window.Marquinhos.getUserInfo() : null;
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 50000);
    try {
        const r = await fetch('/api/ai/chat-pet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + s.access_token },
            body: JSON.stringify({ message: mensaje.trim(), history: Array.isArray(historial) ? historial : [], page: '/features/mensajes/mensajes.html', user_name: userInfo ? userInfo.nombre : null, memoria: '' }),
            signal: controller.signal
        });
        let data = null;
        const contentType = r.headers.get('content-type') || '';
        if (contentType.includes('application/json')) { try { data = await r.json(); } catch (_) { data = null; } }
        else {
            const texto = await r.text().catch(() => '');
            if (!r.ok) {
                if (r.status === 502 || r.status === 504) throw new Error('El servidor está tardando o no disponible. Intenta de nuevo.');
                if (r.status === 500) throw new Error('El servidor tuvo un error interno. Revisa CORS o logs de Railway.');
                throw new Error('El servidor devolvió una respuesta inesperada. Código: ' + r.status);
            }
            throw new Error('El servidor no devolvió JSON válido.');
        }
        if (!r.ok) throw new Error((data && data.error) || `Error del servidor (${r.status})`);
        if (!data || data.success === false) throw new Error((data && data.error) || 'Marquinhos no pudo responder.');
        let respuesta = typeof data.reply === 'string' ? data.reply.trim() : '';
        if (!respuesta) throw new Error('Marquinhos respondió sin contenido.');
        return limpiarMarkdown(respuesta);
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Marquinhos está tardando demasiado en responder. Intenta nuevamente.');
        if (error.name === 'TypeError' && /Failed to fetch|NetworkError/i.test(error.message || '')) throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        throw error;
    } finally { clearTimeout(timeout); }
}

function mostrarTypingBot() {
    const box = $('messages');
    const empty = box.querySelector('.empty');
    if (empty) empty.remove();
    const anchorRef = box.querySelector('#scrollAnchor');
    if (anchorRef) {
        anchorRef.insertAdjacentHTML('beforebegin', `
            <div class="bubblewrap received" id="typing-bot">
                <div class="bubble">
                    <div class="bubble-bot-info">✦ MARQUINHOS</div>
                    <div class="typing-indicator"><span></span><span></span><span></span></div>
                </div>
            </div>`);
    }
    scrollToBottom(true);
}

function quitarTypingBot() { const el = $('typing-bot'); if (el) el.remove(); }

async function append(m, sent) {
    const box = $('messages');
    const empty = box.querySelector('.empty');
    if (empty) empty.remove();
    const signedUrl = await getSignedUrlForMessage(m);
    const anchorRef = box.querySelector('#scrollAnchor');
    if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, sent, signedUrl));
    else box.insertAdjacentHTML('beforeend', messageHTML(m, sent, signedUrl));
    observarCargaMultimedia(box);
    if (!sent && !isUserAtBottom) { unreadCount++; actualizarFlecha(); return; }
    isUserAtBottom = true;
    scrollToBottom(true);
}

async function markRead(id) {
    if (!user || id === BOT_ID) return;
    await db.from('mensajes_chat').update({ leido: true }).eq('remitente_id', id).eq('destinatario_id', user.id).eq('leido', false).eq('eliminado', false);
}

async function deleteConversation() {
    if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
    if (!await auth()) return;
    const nombre = current.bot ? 'Marquinhos' : (current.profile.nombre || 'este usuario');
    const confirmado = await NeonModal.confirm({ title: 'Eliminar conversación', message: `¿Eliminar TODA la conversación con ${nombre}?\n\nEsta acción no se puede deshacer.`, icon: '🗑', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
    if (!confirmado) return;
    try {
        const targetId = current.bot ? BOT_UUID : current.id;
        const { error } = await db.from('mensajes_chat').update({ eliminado: true }).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${targetId}),and(remitente_id.eq.${targetId},destinatario_id.eq.${user.id})`);
        if (error) throw error;
        toast('✅ Conversación eliminada correctamente', 'success');
        const box = $('messages');
        box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
        const anchor = box.querySelector('#scrollAnchor');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><strong>◈</strong><div>Conversación eliminada</div><small>Envía un mensaje para empezar de nuevo</small></div>');
        unreadCount = 0;
        actualizarFlecha();
        await loadConversations();
    } catch (e) { console.error('Error eliminando conversación:', e); toast('❌ No se pudo eliminar la conversación', 'error'); }
}

function subscribeMessages(id) {
    if (id === BOT_ID) return;
    if (msgChannel) db.removeChannel(msgChannel);
    msgChannel = db.channel('chat-' + id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat' }, p => {
        const m = p.new;
        if (current?.id === id && m.remitente_id === id && m.destinatario_id === user.id) { append(m, false); markRead(id); }
    }).subscribe();
}

async function grabarVozParaBot() {
    if (!current?.bot) return;
    if (!await auth()) return;
    if (enviandoVozBot) { toast('⏳ Procesando audio anterior. Espera un momento…', 'warning'); return; }
    if (voiceBotGrabando) {
        if (voiceBotRecorder && voiceBotRecorder.state !== 'inactive') voiceBotRecorder.stop();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBotChunks = [];
        voiceBotRecorder = new MediaRecorder(stream);
        voiceBotRecorder.ondataavailable = e => { if (e.data && e.data.size) voiceBotChunks.push(e.data); };
        voiceBotRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            voiceBotGrabando = false;
            $('voiceBot').classList.remove('recording');
            $('voiceBot').textContent = '🔊';
            const blob = new Blob(voiceBotChunks, { type: voiceBotRecorder.mimeType || 'audio/webm' });
            voiceBotChunks = [];
            if (!blob.size) { toast('⚠️ No se capturó audio', 'error'); return; }
            const file = new File([blob], `voz-${Date.now()}.webm`, { type: blob.type });
            await enviarVozAlBot(file);
        };
        voiceBotRecorder.start();
        voiceBotGrabando = true;
        $('voiceBot').classList.add('recording');
        $('voiceBot').textContent = '⏹️';
        toast('🎙️ Habla ahora… presiona otra vez para enviar');
    } catch (e) { console.error('Error micrófono:', e); toast('❌ No se pudo acceder al micrófono', 'error'); }
}

async function enviarVozAlBot(file) {
    if (enviandoVozBot) { toast('⏳ Ya hay un audio en proceso. Espera…', 'warning'); return; }
    enviandoVozBot = true;
    const $btn = $('voiceBot');
    $btn.classList.add('processing');
    $btn.textContent = '⏳';
    $btn.disabled = true;
    try {
        const s = await session();
        if (!s) { enviandoVozBot = false; $btn.classList.remove('processing'); $btn.textContent = '🔊'; $btn.disabled = false; return; }
        const path = `${user.id}/bot-voice/${Date.now()}.webm`;
        const { error: upErr } = await db.storage.from('chat-audio').upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) { toast('❌ Error subiendo audio', 'error'); enviandoVozBot = false; $btn.classList.remove('processing'); $btn.textContent = '🔊'; $btn.disabled = false; return; }
        const { data: signed } = await db.storage.from('chat-audio').createSignedUrl(path, 3600);
        if (!signed?.signedUrl) { toast('❌ Error firmando audio', 'error'); enviandoVozBot = false; $btn.classList.remove('processing'); $btn.textContent = '🔊'; $btn.disabled = false; return; }
        const tempId = 'voice-user-' + Date.now();
        const box = $('messages');
        const anchorRef = box.querySelector('#scrollAnchor');
        const tempHTML = `<div class="bubblewrap sent" id="${tempId}"><div class="bubble"><div class="voice-label">🎙️ TU VOZ</div><div class="voice-loading">Enviando a Marquinhos…</div></div></div>`;
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', tempHTML); else box.insertAdjacentHTML('beforeend', tempHTML);
        scrollToBottom(true);

        let intentos = 0;
        const maxIntentos = 3;
        let exito = false;
        let data = {};
        while (intentos < maxIntentos && !exito) {
            const r = await fetch('/api/ai/voice/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token }, body: JSON.stringify({ audio_url: signed.signedUrl }) });
            data = await r.json().catch(() => ({}));
            if (r.status === 429) { intentos++; const waitTime = intentos * 2000; toast(`⏳ Servidor ocupado. Reintentando en ${waitTime / 1000}s...`, 'warning'); await new Promise(resolve => setTimeout(resolve, waitTime)); continue; }
            if (!r.ok || data.success === false) throw new Error(data.error || 'Error del servicio de voz');
            exito = true;
        }
        if (!exito) throw new Error('El servidor de IA está saturado. Intenta de nuevo en unos minutos.');
        document.getElementById(tempId)?.remove();
        try {
            await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: BOT_UUID, contenido: data.transcripcion || file.name, nombre_archivo: file.name, imagen_url: `bucket://chat-audio/${path}`, tipo: 'audio', leido: true, editado: false, eliminado: false });
        } catch (e) { console.warn('No se pudo guardar la nota de voz:', e); }
        try {
            if (data.reply) await db.from('mensajes_chat').insert({ remitente_id: BOT_UUID, destinatario_id: user.id, contenido: data.reply, tipo: 'texto', leido: true, editado: false, eliminado: false });
        } catch (e) { console.warn('No se pudo guardar la respuesta de Marquinhos:', e); }

        const botId = 'voice-bot-' + Date.now();
        let botBody = `<div class="bubble-bot-info">✦ MARQUINHOS</div>`;
        if (data.transcripcion) botBody += `<div class="bot-transcripcion">🎙️ "${esc(data.transcripcion)}"</div>`;
        botBody += `<div>${esc(limpiarMarkdown(data.reply || 'Sin respuesta'))}</div>`;
        if (data.audio_url) botBody += `<audio class="bot-audio" controls src="${esc(data.audio_url)}"></audio>`;
        const botHTML = `<div class="bubblewrap received" id="${botId}"><div class="bubble">${botBody}</div></div>`;
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', botHTML); else box.insertAdjacentHTML('beforeend', botHTML);
        observarCargaMultimedia(box);
        scrollToBottom(true);
        if (data.audio_url) { const audio = document.querySelector(`#${botId} audio`); if (audio) audio.play().catch(() => {}); }
        loadConversations();
    } catch (e) {
        console.error('Error voz bot:', e);
        if (e.message.includes('429') || e.message.includes('Too Many Requests') || e.message.includes('saturado')) toast('⏳ El asistente está saturado. Por favor, espera unos segundos e intenta de nuevo.', 'warning');
        else toast('❌ ' + e.message, 'error');
    } finally {
        enviandoVozBot = false;
        $btn.classList.remove('processing');
        $btn.textContent = '🔊';
        $btn.disabled = false;
    }
}

async function uploadFile(file) {
    if (!current || !await auth()) return;
    if (current.bot) { toast('⚠️ Para Marquinhos usa el botón 🔊, o envía nota de voz con 🎙️', 'error'); return; }
    if (file.size > 50 * 1024 * 1024) { toast('⚠️ El archivo supera 50 MB', 'error'); return; }
    const type = file.type.startsWith('image/') ? 'imagen' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'archivo';
    if (type === 'archivo') { toast('⚠️ En el chat solo se pueden enviar imágenes, videos o audios', 'error'); return; }
    let storageRef;
    try {
        if (type === 'audio') {
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `${user.id}/mensajes/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
            const up = await db.storage.from('chat-audio').upload(path, file, { contentType: file.type || 'application/octet-stream', cacheControl: '3600', upsert: false });
            if (up.error) throw up.error;
            storageRef = `bucket://chat-audio/${path}`;
        } else {
            const d = await subirViaBackend(file, 'chat-attachments', type);
            storageRef = `bucket://chat-attachments/${d.path}`;
        }
    } catch (e) { console.error('Error subiendo archivo:', e); toast('❌ ' + (e.message || 'No se pudo subir el archivo'), 'error'); return; }
    const r = await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: current.id, contenido: file.name, nombre_archivo: file.name, imagen_url: storageRef, tipo: type, leido: false, editado: false, eliminado: false }).select('*').single();
    if (r.error) {
        console.error(r.error);
        if (esErrorContenidoNoPermitido(r.error)) toast('❌ Contenido no permitido por las normas de la comunidad', 'error');
        else toast('❌ No se pudo guardar el archivo', 'error');
        return;
    }
    await append(r.data, true);
    loadConversations();
}

function newConversation() {
    $('newModal').classList.add('show');
    $('userSearch').value = '';
    $('userResults').innerHTML = '';
    setTimeout(() => $('userSearch').focus(), 50);
}

async function searchUsers(q) {
    const box = $('userResults');
    if (!q || q.trim().length < 2) { box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">Escribe al menos 2 caracteres</div>'; return; }
    if (!await auth()) return;
    const term = q.trim().replace(/[%_,\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const r = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url').or(`nombre.ilike.%${term}%,handle.ilike.%${term}%`).neq('id', user.id).neq('id', BOT_UUID).limit(12);
    if (r.error) { console.error(r.error); toast('❌ Error al buscar usuarios', 'error'); return; }
    box.innerHTML = r.data?.length ? '' : '<div style="padding:18px;text-align:center;color:var(--muted)">No se encontraron usuarios</div>';
    for (const p of r.data || []) {
        const el = document.createElement('div');
        el.className = 'result';
        el.innerHTML = avatar(p.nombre, p.avatar_url) + `
            <div style="flex:1">
                <b>${esc(p.nombre || 'Usuario')}</b>
                <div style="font-size:.68rem;color:var(--muted)">@${esc(p.handle || 'usuario')}</div>
            </div>
            <span style="color:var(--gold);font-size:.7rem">Iniciar ›</span>`;
        el.onclick = () => createConversation(p.id);
        box.appendChild(el);
    }
}

async function createConversation(id) {
    if (!await auth()) return;
    const r = await db.from('contactos').select('id').eq('usuario_id', user.id).eq('contacto_id', id).maybeSingle();
    if (r.error) { toast('❌ Error comprobando contacto', 'error'); return; }
    if (!r.data) {
        const ins = await db.from('contactos').insert({ usuario_id: user.id, contacto_id: id, estado: 'activo' });
        if (ins.error) { console.error(ins.error); toast('❌ No se pudo crear la conversación', 'error'); return; }
    }
    $('newModal').classList.remove('show');
    await loadConversations();
    await openConversation(id);
}

function getSupportedAudioMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (const type of candidates) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type; }
    return '';
}

function extensionForMime(mime) { if (mime.includes('ogg')) return 'ogg'; if (mime.includes('mp4')) return 'm4a'; return 'webm'; }

async function recordAudioNota() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
    if (!await auth()) return;
    const esBot = current.bot;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        const mimeType = getSupportedAudioMime();
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recordingMode = esBot ? 'bot' : 'normal';
        recordingStartedAt = Date.now();
        recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunks.push(e.data); };
        recorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            $('audio').classList.remove('recording');
            $('audio').textContent = '🎙️';
            const blob = new Blob(audioChunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            audioChunks = [];
            const mode = recordingMode;
            recorder = null;
            recordingMode = null;
            if (!blob.size) { toast('⚠️ No se capturó audio', 'error'); return; }
            const ext = extensionForMime(blob.type);
            const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
            if (mode === 'bot') await enviarVozAlBot(file);
            else await uploadFile(file);
        };
        recorder.start();
        $('audio').classList.add('recording');
        $('audio').textContent = '⏹️';
        toast(esBot ? '🎙️ Habla con Marquinhos… presiona otra vez para enviar' : '🎙️ Grabando… presiona otra vez para detener');
    } catch (e) { console.error('Micrófono:', e); $('audio').classList.remove('recording'); $('audio').textContent = '🎙️'; toast('❌ No se pudo acceder al micrófono', 'error'); }
}

var _canalesTimer = null, _gruposTimer = null, _pestanaActual = 'chats';

function generarSlug(nombre) {
    var slug = (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) slug = 'grupo';
    return slug + '-' + Date.now();
}

function cambiarPestana(pestana) {
    _pestanaActual = pestana;
    document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === pestana);
        btn.setAttribute('aria-selected', btn.dataset.tab === pestana ? 'true' : 'false');
    });
    var tabChats = document.getElementById('tabChats');
    var tabCanales = document.getElementById('tabCanales');
    var tabGrupos = document.getElementById('tabGrupos');
    var tabLlamadas = document.getElementById('tabLlamadas');
    if (tabChats) tabChats.classList.toggle('hidden', pestana !== 'chats');
    if (tabCanales) tabCanales.classList.toggle('hidden', pestana !== 'canales');
    if (tabGrupos) tabGrupos.classList.toggle('hidden', pestana !== 'grupos');
    if (tabLlamadas) tabLlamadas.classList.toggle('hidden', pestana !== 'llamadas');
    var fab = document.getElementById('newChat');
    if (fab) {
        if (pestana === 'chats') fab.title = 'Nueva conversación';
        else if (pestana === 'canales') fab.title = 'Nuevo canal';
        else if (pestana === 'grupos') fab.title = 'Nuevo grupo';
    }
    if (pestana === 'canales') cargarCanales();
    else if (pestana === 'grupos') cargarGrupos();
    else if (pestana === 'llamadas' && typeof window.cargarHistorialLlamadas === 'function') window.cargarHistorialLlamadas();
}

function onNuevoClick() {
    if (_pestanaActual === 'chats') newConversation();
    else if (_pestanaActual === 'canales') abrirModalCrearCanal();
    else if (_pestanaActual === 'grupos') abrirModalCrearGrupo();
}

function buscarCanalesDebounce() { if (_canalesTimer) clearTimeout(_canalesTimer); _canalesTimer = setTimeout(cargarCanales, 300); }
function buscarGruposDebounce() { if (_gruposTimer) clearTimeout(_gruposTimer); _gruposTimer = setTimeout(cargarGrupos, 300); }

async function cargarCanales() {
    var lista = document.getElementById('canalesLista');
    if (!lista) return;
    if (!await auth()) return;
    lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">✦</div><div class="empty-text">Cargando canales...</div></div>';
    try {
        var result = await db.from('grupos_video').select('*').eq('visibilidad', 'publico').eq('activo', true).order('created_at', { ascending: false }).limit(50);
        if (result.error) throw result.error;
        var canales = result.data || [];
        var searchInput = document.getElementById('searchCanales');
        var buscar = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
        var filtroEstado = document.getElementById('filtroEstadoCanal');
        var estadoSeleccionado = filtroEstado ? filtroEstado.value : '';
        if (buscar) canales = canales.filter(function(c) { return (c.nombre || '').toLowerCase().indexOf(buscar) !== -1 || (c.descripcion || '').toLowerCase().indexOf(buscar) !== -1; });
        if (estadoSeleccionado) canales = canales.filter(function(c) { return c.estado_region === estadoSeleccionado; });
        if (canales.length === 0) {
            lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">✦</div><div class="empty-text">Aún no hay canales públicos</div><button class="empty-btn" onclick="abrirModalCrearCanal()">Crear el primero</button></div>';
            return;
        }
        lista.innerHTML = canales.map(function(c) { return renderCanalCard(c, 'canal'); }).join('');
        actualizarFiltros('canal', canales);
    } catch (e) {
        console.error('[Mensajes/Canales] Error:', e);
        lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">!</div><div class="empty-text">No se pudieron cargar los canales</div><div style="font-size:.6rem;color:#ff3366;margin-top:8px;padding:8px;background:rgba(255,51,102,.1);border-radius:8px;max-width:100%;word-break:break-all;">' + esc(e.message || 'Error desconocido') + '</div></div>';
    }
}

async function cargarGrupos() {
    var lista = document.getElementById('gruposLista');
    if (!lista) return;
    if (!await auth()) return;
    lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">◆</div><div class="empty-text">Cargando grupos...</div></div>';
    try {
        var result = await db.from('grupos_video').select('*').eq('visibilidad', 'privado').eq('activo', true).order('created_at', { ascending: false }).limit(50);
        if (result.error) throw result.error;
        var grupos = result.data || [];
        var searchInput = document.getElementById('searchGrupos');
        var buscar = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
        var filtroEstado = document.getElementById('filtroEstadoGrupo');
        var estadoSeleccionado = filtroEstado ? filtroEstado.value : '';
        if (buscar) grupos = grupos.filter(function(g) { return (g.nombre || '').toLowerCase().indexOf(buscar) !== -1 || (g.descripcion || '').toLowerCase().indexOf(buscar) !== -1; });
        if (estadoSeleccionado) grupos = grupos.filter(function(g) { return g.estado_region === estadoSeleccionado; });
        if (grupos.length === 0) {
            lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">◆</div><div class="empty-text">Aún no hay grupos privados</div><button class="empty-btn" onclick="abrirModalCrearGrupo()">Crear el primero</button></div>';
            return;
        }
        lista.innerHTML = grupos.map(function(g) { return renderCanalCard(g, 'grupo'); }).join('');
        actualizarFiltros('grupo', grupos);
    } catch (e) {
        console.error('[Mensajes/Grupos] Error:', e);
        lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">!</div><div class="empty-text">No se pudieron cargar los grupos</div></div>';
    }
}

function renderCanalCard(item, tipo) {
    var esCanal = tipo === 'canal';
    var inicial = (item.nombre || '◈').charAt(0).toUpperCase();
    var avatarHTML = (item.avatar_url) ? '<img src="' + esc(item.avatar_url) + '" alt="">' : esc(inicial);
    var claseAvatar = esCanal ? 'canal-avatar' : 'canal-avatar privado';
    var claseCard = esCanal ? 'canal-card publico' : 'canal-card privado';
    var badgeVisibilidad = esCanal ? '<span class="canal-badge publico">✦ Público</span>' : '<span class="canal-badge privado">◆ Privado</span>';
    var badgeMarketplace = item.marketplace_activo ? '<span class="canal-badge marketplace">▸ Marketplace</span>' : '';
    var ubicacion = [];
    if (item.municipio) ubicacion.push(item.municipio);
    if (item.estado_region) ubicacion.push(item.estado_region);
    var ubicacionTexto = ubicacion.length > 0 ? ubicacion.join(', ') : 'Sin ubicación';
    var itemId = esc(String(item.id || ''));
    return '<div class="' + claseCard + '" onclick="abrirCanalOGrupo(\'' + itemId + '\', \'' + tipo + '\')">' +
        '<div class="' + claseAvatar + '">' + avatarHTML + '</div>' +
        '<div class="canal-info">' +
            '<div class="canal-nombre">' + esc(item.nombre || 'Sin nombre') + '</div>' +
            '<div class="canal-desc">' + esc((item.descripcion || '').substring(0, 100) || 'Sin descripción') + '</div>' +
            '<div class="canal-meta">' + badgeVisibilidad + badgeMarketplace + '<span>' + esc(ubicacionTexto) + '</span></div>' +
        '</div>' +
    '</div>';
}

function actualizarFiltros(tipo, items) {
    var selectEstadoId = tipo === 'canal' ? 'filtroEstadoCanal' : 'filtroEstadoGrupo';
    var select = document.getElementById(selectEstadoId);
    if (!select) return;
    var estados = {};
    items.forEach(function(i) { if (i.estado_region) estados[i.estado_region] = true; });
    var valorActual = select.value;
    select.innerHTML = '<option value="">Todos los estados</option>';
    Object.keys(estados).sort().forEach(function(e) {
        var opt = document.createElement('option');
        opt.value = e;
        opt.textContent = e;
        select.appendChild(opt);
    });
    if (valorActual && estados[valorActual]) select.value = valorActual;
}

function abrirCanalOGrupo(id, tipo) {
    if (!id) return;
    window.location.href = '/features/grupos/grupos.html?grupo=' + encodeURIComponent(id);
}

function abrirModalCrearCanal() {
    var modal = document.getElementById('modalCrearCanal');
    if (modal) modal.classList.add('show');
    setTimeout(function() { var input = document.getElementById('canalNombre'); if (input) input.focus(); }, 100);
}

function cerrarModalCrearCanal() {
    var modal = document.getElementById('modalCrearCanal');
    if (modal) modal.classList.remove('show');
}

function abrirModalCrearGrupo() {
    var modal = document.getElementById('modalCrearGrupo');
    if (modal) modal.classList.add('show');
    setTimeout(function() { var input = document.getElementById('grupoNombre'); if (input) input.focus(); }, 100);
}

function cerrarModalCrearGrupo() {
    var modal = document.getElementById('modalCrearGrupo');
    if (modal) modal.classList.remove('show');
}

async function crearCanal() {
    if (!await auth()) return;
    var nombre = (document.getElementById('canalNombre')?.value || '').trim();
    var descripcion = (document.getElementById('canalDescripcion')?.value || '').trim();
    var estado = (document.getElementById('canalEstado')?.value || '').trim();
    var municipio = (document.getElementById('canalMunicipio')?.value || '').trim();
    var ciudad = (document.getElementById('canalCiudad')?.value || '').trim();
    var pais = (document.getElementById('canalPais')?.value || 'México').trim();
    if (!nombre) { toast('⚠️ El nombre es obligatorio', 'error'); return; }
    if (!municipio) { toast('⚠️ El municipio es obligatorio', 'error'); return; }
    var btn = document.getElementById('btnCrearCanal');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
    try {
        var slug = generarSlug(nombre);
        var result = await db.from('grupos_video').insert({ creador_id: user.id, categoria_id: null, nombre: nombre, slug: slug, descripcion: descripcion || null, ciudad: ciudad || null, estado_region: estado || null, municipio: municipio, pais: pais, visibilidad: 'publico', modo_ingreso: 'abierto', precio_usdt: 0, marketplace_activo: false, activo: true, firma_ligera: 'Yo me hago cargo de lo que digo aquí' }).select().single();
        if (result.error) throw result.error;
        toast('✅ Canal creado correctamente', 'success');
        cerrarModalCrearCanal();
        ['canalNombre', 'canalDescripcion', 'canalEstado', 'canalMunicipio', 'canalCiudad'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
        await cargarCanales();
    } catch (e) { console.error('[Mensajes/Canales] Error creando:', e); toast('❌ Error: ' + (e.message || 'desconocido'), 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '✦ Crear Canal'; } }
}

async function crearGrupo() {
    if (!await auth()) return;
    var nombre = (document.getElementById('grupoNombre')?.value || '').trim();
    var descripcion = (document.getElementById('grupoDescripcion')?.value || '').trim();
    var estado = (document.getElementById('grupoEstado')?.value || '').trim();
    var municipio = (document.getElementById('grupoMunicipio')?.value || '').trim();
    var ciudad = (document.getElementById('grupoCiudad')?.value || '').trim();
    var pais = (document.getElementById('grupoPais')?.value || 'México').trim();
    if (!nombre) { toast('⚠️ El nombre es obligatorio', 'error'); return; }
    if (!municipio) { toast('⚠️ El municipio es obligatorio', 'error'); return; }
    var btn = document.getElementById('btnCrearGrupo');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
    try {
        var slug = generarSlug(nombre);
        var result = await db.from('grupos_video').insert({ creador_id: user.id, categoria_id: null, nombre: nombre, slug: slug, descripcion: descripcion || null, ciudad: ciudad || null, estado_region: estado || null, municipio: municipio, pais: pais, visibilidad: 'privado', modo_ingreso: 'invitacion', precio_usdt: 0, marketplace_activo: false, activo: true, firma_ligera: 'Yo me hago cargo de lo que digo aquí' }).select().single();
        if (result.error) throw result.error;
        toast('✅ Grupo creado correctamente', 'success');
        cerrarModalCrearGrupo();
        ['grupoNombre', 'grupoDescripcion', 'grupoEstado', 'grupoMunicipio', 'grupoCiudad'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
        await cargarGrupos();
    } catch (e) { console.error('[Mensajes/Grupos] Error creando:', e); toast('❌ Error: ' + (e.message || 'desconocido'), 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '◆ Crear Grupo'; } }
}

const LLAMADA_TIMEOUT_MS = 45000;
const LLAMADA_VIGENCIA_MS = 60000;

function lkSource(nombre) {
    const LK = window.LivekitClient || {};
    const fuentes = (LK.Track && LK.Track.Source) || LK.TrackSource || {};
    const respaldo = { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share' };
    return fuentes[nombre] || respaldo[nombre];
}

const MENSAJES_LLAMADA = {
    llamada_no_disponible: 'La llamada ya no está disponible.',
    servidor: 'Error del servidor. Intenta de nuevo.',
    no_autenticado: 'Tu sesión expiró. Vuelve a iniciar sesión.',
    llamada_no_permitida: 'No puedes llamar a este usuario.'
};

let llamadaTimeoutTimer = null, ringTimer = null, ringChannel = null, llamadaConectando = false, llamadaAceptando = false;

function textoErrorLlamada(err) {
    const code = err && (err.code || err.message);
    return MENSAJES_LLAMADA[code] || `No se pudo completar la acción (${code || 'desconocido'})`;
}

async function llamadaFetch(path, body = {}) {
    const s = await session();
    if (!s) { const e = new Error('no_autenticado'); e.code = 'no_autenticado'; throw e; }
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success !== true) { const code = d.error || ('http_' + r.status); const err = new Error(code); err.code = code; throw err; }
    return d.data || {};
}

async function terminarLlamadaServidor(id, body = {}) {
    if (!id) return;
    try { await llamadaFetch(`/api/llamadas/${encodeURIComponent(id)}/terminar`, body); }
    catch (e) { console.warn('[Llamadas] terminar:', e.code || e.message); }
}

function mostrarLlamando(nombre) { $('callInfo').innerHTML = `📞 <strong>Llamando a ${esc(nombre)}…</strong><br><small style="opacity:.7">Esperando respuesta</small>`; }
function mostrarEnCurso() { $('callInfo').innerHTML = '🟢 <strong>Llamada en curso</strong><br><small style="opacity:.7">Presiona ✕ para colgar</small>'; }

function crearRoom() {
    const LK = window.LivekitClient;
    if (!LK || !LK.Room || !LK.RoomEvent) throw new Error('LiveKit no está cargado correctamente');
    const room = new LK.Room();
    room.on(LK.RoomEvent.TrackSubscribed, track => {
        if (track.kind === 'video') track.attach($('remoteVideo'));
        else if (track.kind === 'audio') { const el = track.attach(); el.dataset.lk = '1'; el.style.display = 'none'; document.body.appendChild(el); el.play?.().catch(() => {}); }
    });
    room.on(LK.RoomEvent.Disconnected, reason => manejarDesconexionLlamada(room, reason));
    return room;
}

const RECONEXION_MAX_INTENTOS = 2;
const RECONEXION_ESPERA_MS = 3000;
let reconectandoLlamada = false;

async function manejarDesconexionLlamada(room, reason) {
    if (!call.active || room !== call.room) return;
    const LK = window.LivekitClient;
    const id = call.id;
    const motivo = String(reason ?? 'desconocida');
    console.warn('[Llamadas] Desconectado de LiveKit. Motivo:', reason);
    if (LK.DisconnectReason && reason === LK.DisconnectReason.CLIENT_INITIATED) {
        finalizarLlamadaLocal();
        terminarLlamadaServidor(id, { motivo: 'colgada' });
        return;
    }
    if (reconectandoLlamada) return;
    reconectandoLlamada = true;
    try {
        for (let intento = 1; intento <= RECONEXION_MAX_INTENTOS; intento++) {
            await new Promise(resolve => setTimeout(resolve, RECONEXION_ESPERA_MS));
            if (!call.active || call.id !== id) return;
            try {
                const t = await llamadaFetch(`/api/llamadas/${encodeURIComponent(id)}/token`, {});
                try { call.audio?.stop(); call.video?.stop(); } catch (e) {}
                call.active = false;
                await conectarYPublicar(t.url, t.token, call.tipo);
                console.info('[Llamadas] Reconectado a la sala en el intento', intento);
                return;
            } catch (err) {
                console.warn(`[Llamadas] Reconexión ${intento} fallida:`, err.code || err.message);
                call.active = true;
            }
        }
        finalizarLlamadaLocal();
        terminarLlamadaServidor(id, { motivo: 'desconexion_' + motivo });
    } finally {
        reconectandoLlamada = false;
    }
}

async function conectarYPublicar(url, token, tipo) {
    if (llamadaConectando) return;
    llamadaConectando = true;
    const room = crearRoom();
    let stream = null;
    try {
        await room.connect(url, token);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: tipo === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false });
        const at = stream.getAudioTracks()[0];
        const vt = stream.getVideoTracks()[0];
        if (at) { await room.localParticipant.publishTrack(at, { name: 'microphone', source: lkSource('Microphone') }); call.audio = at; }
        if (vt) { await room.localParticipant.publishTrack(vt, { name: 'camera', source: lkSource('Camera') }); call.video = vt; $('localVideo').srcObject = new MediaStream([vt]); }
        call.room = room; call.tipo = tipo; call.active = true;
    } catch (e) {
        if (stream) stream.getTracks().forEach(t => t.stop());
        try { room.disconnect(); } catch (_) {}
        throw e;
    } finally { llamadaConectando = false; }
}

function subscribeCall(llamadaId) {
    if (callChannel) { db.removeChannel(callChannel); callChannel = null; }
    callChannel = db.channel('call-' + llamadaId).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'llamadas', filter: 'id=eq.' + llamadaId }, async p => {
        if (call.id !== llamadaId) return;
        const estado = p.new?.estado;
        if (estado === 'active') {
            if (!call.initiator || call.active || llamadaConectando) return;
            clearTimeout(llamadaTimeoutTimer);
            $('callInfo').innerHTML = 'Conectando…';
            try {
                const t = await llamadaFetch(`/api/llamadas/${encodeURIComponent(llamadaId)}/token`, {});
                await conectarYPublicar(t.url, t.token, call.tipo);
                mostrarEnCurso();
            } catch (e) {
                console.error('[Llamadas] Error conectando al que llama:', e);
                toast('❌ ' + textoErrorLlamada(e), 'error');
                await terminarLlamadaServidor(llamadaId);
                await finalizarLlamadaLocal();
            }
        } else if (['ended', 'rejected', 'missed'].includes(estado)) {
            toast(estado === 'rejected' ? '📵 La llamada fue rechazada' : '📞 La llamada terminó', '');
            await finalizarLlamadaLocal();
        }
    }).subscribe();
}

function iniciarTimeoutLlamada() {
    clearTimeout(llamadaTimeoutTimer);
    llamadaTimeoutTimer = setTimeout(async () => {
        if (!call.initiator || call.active || !call.id) return;
        const id = call.id;
        toast('📵 Sin respuesta', 'warning');
        await terminarLlamadaServidor(id);
        await finalizarLlamadaLocal();
    }, LLAMADA_TIMEOUT_MS);
}

async function startCall(tipo = 'video') {
    if (current?.bot) { toast('⚠️ Marquinhos no acepta llamadas', 'warning'); return; }
    if (!current) { toast('⚠️ Selecciona una conversación primero', 'error'); return; }
    if (call.active || call.id) { $('callOverlay').classList.add('show'); return; }
    if (!window.__livekitReady) { toast('❌ Las llamadas no están disponibles en este dispositivo. Recarga la página.', 'error'); return; }
    const nombre = current.profile?.nombre || 'usuario';
    try {
        const d = await llamadaFetch('/api/llamadas/iniciar', { destinatarioId: current.id, tipo });
        call.id = d.llamadaId; call.roomName = d.roomName; call.tipo = tipo; call.initiator = true;
        subscribeCall(call.id);
        $('callOverlay').classList.add('show');
        mostrarLlamando(nombre);
        toast(`📞 Llamando a ${nombre}…`, 'success');
        iniciarTimeoutLlamada();
    } catch (e) {
        console.error('[Llamadas] Error al iniciar:', e);
        toast('❌ No se pudo iniciar la llamada: ' + textoErrorLlamada(e), 'error');
        await finalizarLlamadaLocal();
    }
}

function cerrarOverlayEntrante() {
    clearTimeout(ringTimer);
    ringTimer = null;
    if (ringChannel) { db.removeChannel(ringChannel); ringChannel = null; }
    incomingId = null;
    $('incomingOverlay').classList.remove('show');
}

async function incoming(data) {
    if (!user || !data || data.creador_id === user.id) return;
    if (data.estado && data.estado !== 'ringing') return;
    const edad = Date.now() - new Date(data.created_at || Date.now()).getTime();
    if (edad > LLAMADA_VIGENCIA_MS) return;
    if (call.active || call.id || incomingId) {
        if (incomingId !== data.id && !call.id) await terminarLlamadaServidor(data.id, { motivo: 'ocupado' });
        return;
    }
    incomingId = data.id;
    const id = data.id;
    const p = await profile(data.creador_id);
    $('incomingName').textContent = p.nombre || 'Usuario';
    $('incomingAvatar').innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase());
    const halo = $('incomingHalo');
    if (halo) { halo.innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase()); }
    $('incomingOverlay').classList.add('show');
    toast('🔔 ' + (p.nombre || 'Alguien') + ' te está llamando…', 'success');
    ringChannel = db.channel('ring-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'llamadas', filter: 'id=eq.' + id }, p2 => {
        if (incomingId === id && p2.new?.estado !== 'ringing') { cerrarOverlayEntrante(); toast('📞 La llamada ya no está disponible', 'warning'); }
    }).subscribe();
    ringTimer = setTimeout(async () => {
        if (incomingId !== id) return;
        cerrarOverlayEntrante();
        await terminarLlamadaServidor(id);
    }, LLAMADA_TIMEOUT_MS);
}

async function acceptCall() {
    if (!incomingId || llamadaAceptando) return;
    if (!window.__livekitReady) {
        toast('❌ Las llamadas no están disponibles en este dispositivo. No se puede aceptar.', 'error');
        const id = incomingId;
        cerrarOverlayEntrante();
        if (id) await terminarLlamadaServidor(id, { motivo: 'fallida' });
        return;
    }
    llamadaAceptando = true;
    const id = incomingId;
    try {
        const d = await llamadaFetch(`/api/llamadas/${encodeURIComponent(id)}/aceptar`, {});
        cerrarOverlayEntrante();
        call.id = d.llamadaId || id; call.roomName = d.roomName; call.tipo = d.tipo || 'video'; call.initiator = false;
        subscribeCall(call.id);
        $('callOverlay').classList.add('show');
        $('callInfo').innerHTML = 'Conectando…';
        await conectarYPublicar(d.url, d.token, call.tipo);
        mostrarEnCurso();
    } catch (e) {
        console.error('[Llamadas] Error al aceptar:', e);
        toast('❌ ' + textoErrorLlamada(e), 'error');
        cerrarOverlayEntrante();
        await terminarLlamadaServidor(id);
        await finalizarLlamadaLocal();
    } finally { llamadaAceptando = false; }
}

async function rejectCall() {
    const id = incomingId;
    cerrarOverlayEntrante();
    if (id) await terminarLlamadaServidor(id, { motivo: 'rechazada' });
    toast('📵 Llamada rechazada', 'warning');
}

async function hangup() {
    const id = call.id;
    await terminarLlamadaServidor(id);
    toast('📞 Llamada finalizada', 'warning');
    await finalizarLlamadaLocal();
}

async function finalizarLlamadaLocal() {
    clearTimeout(llamadaTimeoutTimer);
    llamadaTimeoutTimer = null;
    const room = call.room;
    call.room = null; call.active = false;
    try { room?.disconnect(); } catch (e) {}
    try { call.audio?.stop(); call.video?.stop(); call.screen?.stop(); } catch (e) {}
    $('localVideo').srcObject = null; $('remoteVideo').srcObject = null;
    document.querySelectorAll('audio[data-lk="1"]').forEach(el => el.remove());
    if (callChannel) { db.removeChannel(callChannel); callChannel = null; }
    Object.assign(call, { room: null, id: null, active: false, audio: null, video: null, screen: null, roomName: null, initiator: false });
    llamadaConectando = false;
    $('callOverlay').classList.remove('show');
    $('toggleMic').innerHTML = '<span class="ctrl-icon">🎤</span><span class="ctrl-label">Micrófono</span>';
    $('toggleCam').innerHTML = '<span class="ctrl-icon">📷</span><span class="ctrl-label">Cámara</span>';
    $('toggleScreen').innerHTML = '<span class="ctrl-icon">🖥️</span><span class="ctrl-label">Pantalla</span>';
}

async function cleanupCall() { await finalizarLlamadaLocal(); }

async function toggleMic() {
    if (!call.audio) return;
    call.audio.enabled = !call.audio.enabled;
    $('toggleMic').innerHTML = call.audio.enabled ? '<span class="ctrl-icon">🎤</span><span class="ctrl-label">Micrófono</span>' : '<span class="ctrl-icon">🔇</span><span class="ctrl-label">Silenciado</span>';
}

async function toggleCam() {
    if (!call.video) return;
    call.video.enabled = !call.video.enabled;
    $('toggleCam').innerHTML = call.video.enabled ? '<span class="ctrl-icon">📷</span><span class="ctrl-label">Cámara</span>' : '<span class="ctrl-icon">📷❌</span><span class="ctrl-label">Sin cámara</span>';
}

async function toggleScreen() {
    if (!call.room) return;
    try {
        if (call.screen) {
            await call.room.localParticipant.unpublishTrack(call.screen);
            call.screen.stop();
            call.screen = null;
            $('toggleScreen').innerHTML = '<span class="ctrl-icon">🖥️</span><span class="ctrl-label">Pantalla</span>';
            return;
        }
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const t = s.getVideoTracks()[0];
        await call.room.localParticipant.publishTrack(t, { name: 'screen', source: lkSource('ScreenShare') });
        call.screen = t;
        $('toggleScreen').innerHTML = '<span class="ctrl-icon">🖥️⏹️</span><span class="ctrl-label">Detener</span>';
        t.onended = () => toggleScreen();
    } catch (e) { if (e.name !== 'NotAllowedError') toast('❌ No se pudo compartir pantalla', 'error'); }
}

async function init() {
    try { db = await window.supabaseReady; } catch (e) { db = null; }
    if (!db) db = window.supabaseClient;
    if (!db) { toast('❌ No se pudo conectar a Supabase. Revisa tu conexión.', 'error'); console.error('[Mensajes] No hay cliente Supabase disponible.'); return; }

    try {
        const s = await session();
        if (s?.user) user = s.user;
    } catch (e) { console.warn('Error cargando sesión:', e); }

    const callBtn = $('videoCall');
    if (!window.__livekitReady) { if (callBtn) callBtn.disabled = true; }

    await cargarFotoHeader();
    await loadConversations();
    await cargarEstados();

    let ultimoUserId = user?.id || null;
    db.auth.onAuthStateChange((event, s) => {
        const nuevoId = s?.user?.id || null;
        if (nuevoId === ultimoUserId) return;
        ultimoUserId = nuevoId;
        user = s?.user || null;
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            loadConversations();
            cargarFotoHeader();
            cargarEstados();
        }
    });

    // Fix: bandera __livekitReady
    window.addEventListener('livekit:ready', () => {
        window.__livekitReady = true;
        if (callBtn) callBtn.disabled = false;
    });
    window.addEventListener('livekit:error', () => {
        window.__livekitReady = false;
        if (callBtn) callBtn.disabled = true;
        toast('⚠️ Las llamadas no están disponibles en este dispositivo.', 'warning');
    });

    $('headerAvatar').onclick = abrirProfileModal;
    $('avatarInput').addEventListener('change', subirFotoHeader);
    $('btnCambiarFoto').onclick = () => $('avatarInput').click();
    $('btnCerrarProfileModal').onclick = cerrarProfileModal;
    $('profileModal').addEventListener('click', e => { if (e.target.id === 'profileModal') cerrarProfileModal(); });
    $('closeVistasModal').onclick = cerrarVistasModal;
    $('vistasModal').addEventListener('click', e => { if (e.target.id === 'vistasModal') cerrarVistasModal(); });
    $('pvClose').onclick = cerrarPhotoViewer;
    $('photoViewer').addEventListener('click', e => { if (e.target.id === 'photoViewer') cerrarPhotoViewer(); });
    $('evClose').onclick = cerrarEstadoViewer;
    $('evPrev').onclick = (e) => { e.stopPropagation(); anteriorEstado(); };
    $('evNext').onclick = (e) => { e.stopPropagation(); siguienteEstado(); };
    $('evVistas').onclick = (e) => { e.stopPropagation(); const estadoId = $('evVistas').dataset.estadoId; if (estadoId) abrirVistasModal(estadoId); };

    const evBody = $('evBody');
    evBody.addEventListener('mousedown', activarPausaEstado);
    evBody.addEventListener('mouseup', desactivarPausaEstado);
    evBody.addEventListener('mouseleave', desactivarPausaEstado);
    evBody.addEventListener('touchstart', (e) => { e.preventDefault(); activarPausaEstado(); }, { passive: false });
    evBody.addEventListener('touchend', (e) => { e.preventDefault(); desactivarPausaEstado(); }, { passive: false });
    evBody.addEventListener('touchcancel', desactivarPausaEstado);

    document.addEventListener('keydown', e => {
        if (e.key === ' ' && $('estadoViewer').classList.contains('show')) {
            e.preventDefault();
            if (estadoPausado) desactivarPausaEstado(); else activarPausaEstado();
        }
    });

    $('btnSubirEstado').onclick = abrirModalEstado;
    $('closeEstadoModal').onclick = cerrarModalEstado;
    $('btnSeleccionarEstado').onclick = seleccionarArchivoEstado;
    $('estadoFileInput').addEventListener('change', previewEstado);
    $('btnPublicarEstado').onclick = publicarEstado;
    $('estadoUploadModal').addEventListener('click', e => { if (e.target.id === 'estadoUploadModal') cerrarModalEstado(); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cerrarProfileModal(); cerrarPhotoViewer(); cerrarEstadoViewer(); cerrarModalEstado(); cerrarVistasModal(); cerrarModalCrearCanal(); cerrarModalCrearGrupo();
            $('newModal').classList.remove('show');
        }
    });

    $('composer').addEventListener('submit', e => { e.preventDefault(); sendMessage($('messageInput').value); });
    $('newChat').onclick = onNuevoClick;
    $('closeModal').onclick = () => $('newModal').classList.remove('show');
    $('newModal').addEventListener('click', e => { if (e.target.id === 'newModal') $('newModal').classList.remove('show'); });
    $('userSearch').addEventListener('input', e => searchUsers(e.target.value));
    $('searchConversations').addEventListener('input', e => { conversationFilter = e.target.value; aplicarFiltroConversaciones(); });

    $('attach').onclick = () => {
        if (current?.bot) { toast('⚠️ Para Marquinhos usa el botón 🔊', 'error'); return; }
        $('fileInput').click();
    };

    // Fix: binding del teclado delegado a teclado-emojis.js (sin duplicar toggles)
    if (typeof window.inicializarTecladoEmojis === 'function') {
        window.inicializarTecladoEmojis('messageInput', 'emojiBtn');
    }

    $('fileInput').addEventListener('change', async e => {
        for (const f of e.target.files) await uploadFile(f);
        e.target.value = '';
    });

    $('audio').onclick = recordAudioNota;
    $('voiceBot').onclick = grabarVozParaBot;
    $('deleteChat').onclick = deleteConversation;
    $('videoCall').onclick = () => startCall('video');
    $('backBtn').onclick = cerrarConversacion;

    $('hangup').onclick = hangup;
    $('toggleMic').onclick = toggleMic;
    $('toggleCam').onclick = toggleCam;
    $('toggleScreen').onclick = toggleScreen;
    $('acceptCall').onclick = acceptCall;
    $('rejectCall').onclick = rejectCall;

    $('messages').addEventListener('scroll', detectarSiEstaAbajo);
    $('messages').addEventListener('click', e => { const img = e.target.closest && e.target.closest('img[data-visor]'); if (img) abrirVisorImagen(img.dataset.src, img.dataset.nombre); });
    $('scrollDownBtn').onclick = () => { isUserAtBottom = true; scrollToBottom(true); actualizarFlecha(); };

    $('searchChat').onclick = async () => {
        if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
        if (current.bot) { toast('ℹ️ Marquinhos no tiene búsqueda local aún', 'warning'); return; }
        const q = await NeonModal.prompt({ title: 'Buscar en la conversación', message: 'Escribe el texto que quieres encontrar:', icon: '🔍', placeholder: 'Texto a buscar…', confirmText: 'Buscar', cancelText: 'Cancelar' });
        if (!q || !q.trim()) return;
        const r = await db.from('mensajes_chat').select('*').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${current.id}),and(remitente_id.eq.${current.id},destinatario_id.eq.${user.id})`).ilike('contenido', '%' + q.trim() + '%').order('created_at', { ascending: true });
        if (r.error) { toast('❌ Error al buscar', 'error'); return; }
        await renderMessages(r.data || []);
    };

    $('closeModalCanal')?.addEventListener('click', cerrarModalCrearCanal);
    $('modalCrearCanal')?.addEventListener('click', e => { if (e.target.id === 'modalCrearCanal') cerrarModalCrearCanal(); });
    $('closeModalGrupo')?.addEventListener('click', cerrarModalCrearGrupo);
    $('modalCrearGrupo')?.addEventListener('click', e => { if (e.target.id === 'modalCrearGrupo') cerrarModalCrearGrupo(); });

    db.channel('incoming-calls').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'llamadas', filter: `destinatario_id=eq.${user.id}` }, p => {
        if (user && p.new.estado === 'ringing') incoming(p.new);
    }).subscribe();

    setInterval(() => { if (document.hidden) return; limpiarVistosAntiguos(); cargarEstados(); }, 10 * 60 * 1000);

    registrarPushYServiceWorker().catch(err => console.warn('[Push] No se pudo registrar:', err));

    if (user && user.id) {
        const urlObj = new URL(window.location.href);
        const usuarioParam = urlObj.searchParams.get('usuario');
        const accionParam = urlObj.searchParams.get('accion');

        if (usuarioParam && usuarioParam.length > 10) {
            setTimeout(async () => {
                try {
                    await openConversation(usuarioParam);
                    if (accionParam === 'llamada') {
                        setTimeout(async () => {
                            const ok = await NeonModal.confirm({
                                title: 'Iniciar videollamada',
                                message: '¿Quieres llamar a este usuario ahora?',
                                icon: '📹',
                                confirmText: 'Llamar',
                                cancelText: 'Cancelar'
                            });
                            if (ok && typeof startCall === 'function') {
                                try { await startCall('video'); }
                                catch (e) { console.error('[Llamadas] Error en inicio automático:', e); }
                            }
                        }, 1000);
                    }
                } catch (e) {
                    console.error('[Mensajes] Error al abrir conversación desde URL:', e);
                }
            }, 800);
        }

        if (usuarioParam || accionParam) {
            urlObj.searchParams.delete('usuario');
            urlObj.searchParams.delete('accion');
            try {
                window.history.replaceState({}, '', urlObj.pathname + urlObj.search + urlObj.hash);
            } catch (e) { console.warn('No se pudo limpiar la URL:', e); }
        }
    }

    decorarComposerWeb3();
    decorarSidebarTabsWeb3();
    decorarChatActions();

    setTimeout(async () => {
        try {
            if (typeof window.inicializarIdiomas === 'function') await window.inicializarIdiomas();
        } catch (e) { console.warn('⚠️ Error aplicando idiomas:', e); }
    }, 500);
}

async function registrarPushYServiceWorker() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const register = await navigator.serviceWorker.register('/sw.js');
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') return;
        const resVapid = await fetch('/api/push/vapid-public-key');
        if (!resVapid.ok) throw new Error('No se pudo obtener la llave VAPID');
        const { publicKey } = await resVapid.json();
        const suscripcion = await register.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        const s = await db.auth.getSession();
        if (!s?.data?.session) throw new Error('No hay sesión activa');
        const resSub = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.data.session.access_token },
            body: JSON.stringify({
                endpoint: suscripcion.endpoint,
                keys: { p256dh: btoa(String.fromCharCode(...new Uint8Array(suscripcion.getKey('p256dh')))), auth: btoa(String.fromCharCode(...new Uint8Array(suscripcion.getKey('auth')))) },
                device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
            })
        });
        const dataSub = await resSub.json();
        if (dataSub.success) console.log('[Push] Suscripción guardada en Supabase correctamente ✅');
    } catch (error) { console.error('[Push] Error en el registro:', error); }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.tipo === 'notificacion_click' && data.llamadaId) {
            if (data.accion === 'reject') {
                llamadaFetch(`/api/llamadas/${encodeURIComponent(data.llamadaId)}/terminar`,
                             { motivo: 'rechazada_desde_notificacion' })
                    .then(() => toast('📵 Llamada rechazada', 'warning'))
                    .catch(e => console.warn('[Llamadas] rechazo desde notificación:', e.code || e.message));
                return;
            }
            if (data.accion === 'accept') {
                if (typeof incoming === 'function' && typeof incomingId !== 'undefined' && !call.active) {
                    db.from('llamadas').select('*').eq('id', data.llamadaId).maybeSingle().then(({ data: llamada }) => {
                        if (llamada && llamada.estado === 'ringing') {
                            incoming(llamada);
                            setTimeout(() => { if (typeof acceptCall === 'function' && incomingId === llamada.id) acceptCall(); }, 500);
                        }
                    });
                }
            }
        }
    });
}

function decorarComposerWeb3() {
    const composer = $('composer');
    if (!composer || composer.dataset.web3decorated) return;
    envolverBotonConLabel($('attach'), '◆', 'Adjuntar');
    envolverBotonConLabel($('audio'), '🎙️', 'Audio');
    envolverBotonConLabel($('voiceBot'), '🔊', 'Voz');
    const sendBtn = composer.querySelector('button[type="submit"]');
    if (sendBtn && !sendBtn.classList.contains('composer-send')) { sendBtn.classList.add('composer-send'); sendBtn.innerHTML = '<span>Enviar</span><span style="font-size:.9rem;">➤</span>'; }
    const input = $('messageInput');
    if (!input.placeholder) input.placeholder = 'Escribe un mensaje…';
    composer.dataset.web3decorated = '1';
}

function envolverBotonConLabel(btn, icono, label) {
    if (!btn || btn.dataset.web3labeled) return;
    btn.classList.add('composer-btn');
    btn.innerHTML = '<span class="composer-btn-icon">' + icono + '</span><span class="composer-btn-label">' + label + '</span>';
    btn.dataset.web3labeled = '1';
    const observer = new MutationObserver(() => {
        const t = btn.textContent.trim();
        if (t === '⏹️' || t === '⏳') {
            const icon = t === '⏹️' ? '⏹️' : '⏳';
            const lbl = t === '⏹️' ? 'Grabando' : 'Procesando';
            btn.innerHTML = '<span class="composer-btn-icon">' + icon + '</span><span class="composer-btn-label">' + lbl + '</span>';
        } else if (t === '🎙️' || t === '🔊') {
            if (!btn.querySelector('.composer-btn-icon')) {
                btn.innerHTML = '<span class="composer-btn-icon">' + icono + '</span><span class="composer-btn-label">' + label + '</span>';
            }
        }
    });
    observer.observe(btn, { childList: true, subtree: true, characterData: true });
}

function decorarSidebarTabsWeb3() { const tabs = document.querySelectorAll('.sidebar-tab'); tabs.forEach(tab => tab.setAttribute('role', 'tab')); }

function decorarChatActions() {
    const search = $('searchChat');
    if (search && !search.dataset.web3labeled) {
        search.classList.remove('iconbtn');
        search.classList.add('action-labeled');
        search.setAttribute('title', 'Buscar en la conversación');
        search.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line></svg><span class="action-label">Buscar</span>`;
        search.dataset.web3labeled = '1';
    }
    const del = $('deleteChat');
    if (del && !del.dataset.web3labeled) {
        del.classList.remove('iconbtn');
        del.classList.add('action-labeled', 'danger');
        del.setAttribute('title', 'Eliminar chat');
        del.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg><span class="action-label">Eliminar chat</span>`;
        del.dataset.web3labeled = '1';
    }
}

window.cambiarPestana = cambiarPestana;
window.onNuevoClick = onNuevoClick;
window.buscarCanalesDebounce = buscarCanalesDebounce;
window.buscarGruposDebounce = buscarGruposDebounce;
window.cargarCanales = cargarCanales;
window.cargarGrupos = cargarGrupos;
window.renderCanalCard = renderCanalCard;
window.abrirCanalOGrupo = abrirCanalOGrupo;
window.abrirModalCrearCanal = abrirModalCrearCanal;
window.cerrarModalCrearCanal = cerrarModalCrearCanal;
window.abrirModalCrearGrupo = abrirModalCrearGrupo;
window.cerrarModalCrearGrupo = cerrarModalCrearGrupo;
window.crearCanal = crearCanal;
window.crearGrupo = crearGrupo;
window.generarSlug = generarSlug;
window.openConversation = openConversation;
window.NeonModal = NeonModal;
window.NeonUI = {
    version: '5.0.0',
    decorarComposer: decorarComposerWeb3,
    decorarSidebarTabs: decorarSidebarTabsWeb3,
    decorarSidebarTabsWeb3: decorarSidebarTabsWeb3,
    decorarChatActions: decorarChatActions
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase?.createClient) init();
    else toast('❌ No se pudo cargar Supabase', 'error');
});