// ================================================================
// MENSAJES · JS v2.0 (Parte 1 de 3)
// Configuración, utilidades, autenticación, avatar, perfil, estados
// ================================================================

'use strict';

// ================================================================
// CONFIGURACIÓN
// ================================================================
const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';
const BOT_ID = 'bot-marquinhos';
const BOT_UUID = '0a000000-0000-4000-8000-000000000001';
const ESTADOS_BUCKET = 'sariels-estados';
const BOT_MAX_HISTORY = 6;

// ✅ Exponer supabaseClient globalmente (por si acaso)
if (typeof window.supabase !== 'undefined' && !window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ================================================================
// ESTADO GLOBAL
// ================================================================
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
    room: null,
    id: null,
    active: false,
    audio: null,
    video: null,
    screen: null,
    initiator: false
};

// ================================================================
// HELPERS
// ================================================================
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

/* ================================================================
   LIMPIEZA DE MARKDOWN - Doble protección (frontend)
   ================================================================ */
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

// ================================================================
// SESIÓN Y AUTH
// ================================================================
async function session() {
    if (!db) return null;
    const r = await db.auth.getSession();
    if (r.error) throw r.error;
    return r.data.session;
}

async function auth() {
    const s = await session();
    if (!s) {
        toast('⚠️ Inicia sesión para usar Mensajes', 'error');
        return false;
    }
    user = s.user;
    return true;
}

function avatar(name, url, cls = 'avatar') {
    if (url) {
        return `<div class="${cls}"><img src="${esc(url)}" alt=""></div>`;
    }
    return `<div class="${cls}">${esc((name || '◈').charAt(0).toUpperCase())}</div>`;
}

async function profile(id) {
    if (id === BOT_ID) {
        return {
            id: BOT_ID,
            nombre: "Marquinhos",
            handle: 'marquinhos',
            avatar_url: null,
            online: true,
            bot: true
        };
    }
    const r = await db.from('perfiles_publicos')
        .select('id,nombre,handle,avatar_url,online,ultima_conexion')
        .eq('id', id)
        .maybeSingle();
    return r.data || { id, nombre: 'Usuario', avatar_url: null, online: false };
}

// ================================================================
// FOTO DEL HEADER
// ================================================================
async function cargarFotoHeader() {
    if (!user || !user.id) return;
    try {
        const { data, error } = await db
            .from('usuarios')
            .select('avatar_url, nombre, handle')
            .eq('id', user.id)
            .maybeSingle();
        if (error) {
            console.warn('No se pudo cargar perfil:', error.message);
            return;
        }
        currentUserProfile = data;
        const headerAvatar = $('headerAvatar');
        if (data?.avatar_url) {
            headerAvatar.innerHTML = `<img src="${esc(data.avatar_url)}" alt="Mi foto">`;
        } else {
            const inicial = (data?.nombre || data?.handle || '◈').charAt(0).toUpperCase();
            headerAvatar.innerHTML = esc(inicial);
        }
        $('profileModalAvatar').innerHTML = data?.avatar_url
            ? `<img src="${esc(data.avatar_url)}" alt="Mi foto">`
            : esc((data?.nombre || data?.handle || '◈').charAt(0).toUpperCase());
        $('profileModalName').textContent = data?.nombre || 'Mi Perfil';
        $('profileModalHandle').textContent = '@' + (data?.handle || 'usuario');
    } catch (e) {
        console.warn('Error cargando foto del header:', e);
    }
}

function abrirProfileModal() { $('profileModal').classList.add('show'); }
function cerrarProfileModal() { $('profileModal').classList.remove('show'); }

async function subirFotoHeader(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!await auth()) return;
    if (file.size > 5 * 1024 * 1024) {
        toast('❌ La imagen no puede superar los 5 MB', 'error');
        event.target.value = '';
        return;
    }
    if (!file.type.startsWith('image/')) {
        toast('❌ Solo se permiten imágenes', 'error');
        event.target.value = '';
        return;
    }

    const fileExt = file.name.split('.').pop().toLowerCase();
    const filePath = `${user.id}/avatar.${fileExt}`;

    try {
        toast('⏳ Subiendo foto...', '', 5000);
        const { error: uploadError } = await db.storage
            .from('sariels-avatars')
            .upload(filePath, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;

        const { data: urlData } = db.storage.from('sariels-avatars').getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl + '?t=' + Date.now();

        const { error: updateError } = await db
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', user.id);
        if (updateError) throw updateError;

        toast('✅ Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarFotoHeader();
    } catch (error) {
        console.error('Error al subir foto:', error);
        toast('❌ Error al subir foto: ' + error.message, 'error');
    }
}

function verFotoAmpliada(url, nombre, handle) {
    if (!url) {
        toast('ℹ️ Este usuario no tiene foto de perfil', 'warning');
        return;
    }
    $('pvImage').src = url;
    $('pvName').textContent = nombre || 'Usuario';
    $('pvHandle').textContent = handle ? '@' + handle : '';
    $('photoViewer').classList.add('show');
}

function cerrarPhotoViewer() { $('photoViewer').classList.remove('show'); }

// ================================================================
// ESTADOS
// ================================================================
function marcarEstadoVisto(estadoId) {
    estadoVistos[estadoId] = Date.now();
    localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos));
}

function estadoEsNuevo(estado) { return !estadoVistos[estado.id]; }

function limpiarVistosAntiguos() {
    const limite = Date.now() - (48 * 60 * 60 * 1000);
    Object.keys(estadoVistos).forEach(k => {
        if (estadoVistos[k] < limite) delete estadoVistos[k];
    });
    localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos));
}

async function registrarVistaEstado(estadoId) {
    if (!user) return;
    try {
        await db.from('estados_vistas').upsert({
            estado_id: estadoId,
            usuario_id: user.id
        }, { onConflict: 'estado_id,usuario_id', ignoreDuplicates: true });
    } catch (e) { }
}

async function obtenerVistasEstado(estadoId) {
    try {
        const { count, error } = await db
            .from('estados_vistas')
            .select('id', { count: 'exact', head: true })
            .eq('estado_id', estadoId);
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
        const { data, error } = await db
            .from('estados')
            .select('id, usuario_id, imagen_url, caption, created_at, expires_at')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            if (error.code === '42P01') {
                console.warn('Tabla estados no existe aún');
                return;
            }
            throw error;
        }

        estadosCache = data || [];

        if (estadosCache.length === 0) {
            scroll.innerHTML = '<div style="color:var(--muted);font-size:.7rem;padding:8px 4px;text-align:center;width:100%;">Sin estados</div>';
            return;
        }

        const porUsuario = {};
        estadosCache.forEach(e => {
            if (!porUsuario[e.usuario_id]) porUsuario[e.usuario_id] = [];
            porUsuario[e.usuario_id].push(e);
        });

        const miEstado = porUsuario[user.id];
        if (miEstado && miEstado.length > 0) {
            const tieneNuevos = miEstado.some(e => estadoEsNuevo(e));
            const ultimoEstadoId = miEstado[miEstado.length - 1].id;
            const ultimoEstadoImg = miEstado[miEstado.length - 1].imagen_url;
            const totalVistas = await obtenerVistasEstado(ultimoEstadoId);
            const html = `
                <div class="estado-item" data-userid="${user.id}" style="position:relative;">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner">
                            <img src="${esc(ultimoEstadoImg)}" alt="">
                        </div>
                    </div>
                    ${totalVistas > 0 ? `<span class="estado-vistas-badge">${totalVistas}</span>` : ''}
                    <div class="estado-name">Tú</div>
                </div>
            `;
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
                        <div class="estado-inner">
                            ${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase())}
                        </div>
                    </div>
                    <div class="estado-name">${esc(p.nombre || 'Usuario')}</div>
                </div>
            `;
            scroll.insertAdjacentHTML('beforeend', html);
            scroll.querySelector(`[data-userid="${uid}"]`).onclick = () => abrirEstadoUsuario(uid);
        }
    } catch (e) {
        console.warn('Error cargando estados:', e);
    }
}

function abrirEstadoUsuario(uid) {
    const estados = estadosCache.filter(e => e.usuario_id === uid);
    if (estados.length === 0) {
        toast('ℹ️ Este usuario no tiene estados', 'warning');
        return;
    }
    estadoActualUserId = uid;
    estadoActualIndex = 0;
    estadoProgresoActual = 0;
    estadoPausado = false;
    mostrarEstadoActual();
    $('estadoViewer').classList.add('show');
}

async function mostrarEstadoActual() {
    const estados = estadosCache.filter(e => e.usuario_id === estadoActualUserId);
    if (estadoActualIndex >= estados.length) {
        cerrarEstadoViewer();
        return;
    }
    const estado = estados[estadoActualIndex];
    const esMiEstado = (estadoActualUserId === user.id);

    if (esMiEstado) {
        $('evAvatar').innerHTML = currentUserProfile?.avatar_url
            ? `<img src="${esc(currentUserProfile.avatar_url)}" alt="">`
            : esc((currentUserProfile?.nombre || '◈').charAt(0).toUpperCase());
        $('evName').textContent = 'Tú';
    } else {
        db.from('perfiles_publicos')
            .select('nombre, handle, avatar_url')
            .eq('id', estadoActualUserId)
            .maybeSingle()
            .then(r => {
                if (r.data) {
                    $('evAvatar').innerHTML = r.data.avatar_url
                        ? `<img src="${esc(r.data.avatar_url)}" alt="">`
                        : esc((r.data.nombre || '◈').charAt(0).toUpperCase());
                    $('evName').textContent = r.data.nombre || 'Usuario';
                }
            });
    }

    $('evImage').src = estado.imagen_url;
    $('evTime').textContent = haceTiempo(estado.created_at);

    if (estado.caption) {
        $('evCaption').textContent = estado.caption;
        $('evCaption').classList.remove('hidden');
    } else {
        $('evCaption').classList.add('hidden');
    }

    marcarEstadoVisto(estado.id);
    registrarVistaEstado(estado.id);

    $('evPrev').classList.toggle('hidden', estadoActualIndex === 0);
    $('evNext').classList.toggle('hidden', estadoActualIndex >= estados.length - 1);

    if (esMiEstado) {
        const total = await obtenerVistasEstado(estado.id);
        $('evVistasCount').textContent = total;
        $('evVistas').classList.remove('hidden');
        $('evVistas').dataset.estadoId = estado.id;
    } else {
        $('evVistas').classList.add('hidden');
    }

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
        if (estadoProgresoActual >= 100) {
            clearInterval(estadoTimer);
            estadoProgresoActual = 0;
            siguienteEstado();
        }
    }, 50);
}

function siguienteEstado() {
    const estados = estadosCache.filter(e => e.usuario_id === estadoActualUserId);
    if (estadoActualIndex < estados.length - 1) {
        estadoActualIndex++;
        estadoProgresoActual = 0;
        estadoPausado = false;
        mostrarEstadoActual();
    } else {
        cerrarEstadoViewer();
    }
}

function anteriorEstado() {
    if (estadoActualIndex > 0) {
        estadoActualIndex--;
        estadoProgresoActual = 0;
        estadoPausado = false;
        mostrarEstadoActual();
    }
}

function cerrarEstadoViewer() {
    $('estadoViewer').classList.remove('show');
    if (estadoTimer) clearInterval(estadoTimer);
    estadoTimer = null;
    estadoPausado = false;
    estadoProgresoActual = 0;
    estadoActualUserId = null;
    cargarEstados();
}

function activarPausaEstado() {
    if (!$('estadoViewer').classList.contains('show')) return;
    estadoPausado = true;
}

function desactivarPausaEstado() {
    if (!$('estadoViewer').classList.contains('show')) return;
    estadoPausado = false;
}

async function abrirVistasModal(estadoId) {
    if (!estadoId) return;
    $('vistasModal').classList.add('show');
    const list = $('vistasList');
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>';
    $('vistasModalCount').textContent = '';

    try {
        const { data: vistas, error } = await db
            .from('estados_vistas')
            .select('usuario_id, visto_at')
            .eq('estado_id', estadoId)
            .order('visto_at', { ascending: false });

        if (error) throw error;

        if (!vistas || vistas.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Nadie ha visto este estado aún</div>';
            return;
        }

        $('vistasModalCount').textContent = `(${vistas.length})`;

        const ids = vistas.map(v => v.usuario_id);
        const { data: perfiles } = await db
            .from('perfiles_publicos')
            .select('id, nombre, handle, avatar_url')
            .in('id', ids);

        const perfilMap = {};
        (perfiles || []).forEach(p => { perfilMap[p.id] = p; });

        list.innerHTML = '';
        vistas.forEach(v => {
            const p = perfilMap[v.usuario_id] || { nombre: 'Usuario', handle: '', avatar_url: null };
            const inicial = (p.nombre || '◈').charAt(0).toUpperCase();
            const avatarHTML = p.avatar_url
                ? `<img src="${esc(p.avatar_url)}" alt="">`
                : esc(inicial);

            list.insertAdjacentHTML('beforeend', `
                <div class="result" style="cursor:pointer;" data-handle="${esc(p.handle || '')}">
                    <div class="avatar">${avatarHTML}</div>
                    <div style="flex:1;min-width:0;">
                        <b>${esc(p.nombre || 'Usuario')}</b>
                        <div style="font-size:.68rem;color:var(--muted);">@${esc(p.handle || 'usuario')} · ${haceTiempo(v.visto_at)}</div>
                    </div>
                </div>
            `);
        });

        list.querySelectorAll('.result').forEach(el => {
            el.onclick = () => {
                const handle = el.dataset.handle;
                if (handle) {
                    window.location.href = `/perfil/${handle}`;
                }
            };
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
    if (file.size > 5 * 1024 * 1024) {
        toast('❌ La imagen no puede superar 5 MB', 'error');
        event.target.value = '';
        return;
    }
    if (!file.type.startsWith('image/')) {
        toast('❌ Solo se permiten imágenes', 'error');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        $('estadoPreviewImg').src = e.target.result;
        $('estadoPreviewWrap').style.display = 'block';
        $('btnPublicarEstado').disabled = false;
    };
    reader.readAsDataURL(file);
}

async function publicarEstado() {
    const fileInput = $('estadoFileInput');
    const file = fileInput.files[0];
    if (!file) {
        toast('⚠️ Selecciona una imagen', 'error');
        return;
    }
    if (!await auth()) return;

    const caption = $('estadoCaption').value.trim();
    const btn = $('btnPublicarEstado');
    btn.disabled = true;
    btn.textContent = '⏳ Publicando...';

    try {
        const fileExt = file.name.split('.').pop().toLowerCase();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await db.storage
            .from(ESTADOS_BUCKET)
            .upload(filePath, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;

        const { data: urlData } = db.storage.from(ESTADOS_BUCKET).getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;

        const { error: insertError } = await db.from('estados').insert({
            usuario_id: user.id,
            imagen_url: publicUrl,
            caption: caption || null
        });
        if (insertError) throw insertError;

        toast('✅ Estado publicado (24h)', 'success');
        cerrarModalEstado();
        await cargarEstados();
    } catch (e) {
        console.error('Error publicando estado:', e);
        if (e.message?.includes('Bucket') || e.message?.includes('not found')) {
            toast('❌ Bucket "sariels-estados" no existe. Créalo en Supabase.', 'error');
        } else if (e.code === '42P01') {
            toast('❌ Tabla "estados" no existe. Ejecuta el SQL.', 'error');
        } else {
            toast('❌ Error: ' + e.message, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Publicar estado';
    }
}
// ================================================================
// MENSAJES · JS v2.0 (Parte 2 de 3)
// Conversaciones, chat, Marquinhos (candados + términos), voz, archivos
// ================================================================

// ================================================================
// SCROLL
// ================================================================
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
        if (intentos >= 10) {
            clearInterval(scrollRetryTimer);
            scrollRetryTimer = null;
        }
    }, 100);

    if (force || isUserAtBottom) ocultarFlechaNuevos();
}

function actualizarFlecha() {
    const btn = $('scrollDownBtn');
    const badge = $('newMsgBadge');
    if (!btn) return;
    if (unreadCount > 0) {
        btn.classList.add('has-new');
        if (badge) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
        }
    } else {
        btn.classList.remove('has-new');
        if (badge) badge.style.display = 'none';
    }
}

function ocultarFlechaNuevos() {
    unreadCount = 0;
    actualizarFlecha();
}

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

// ================================================================
// SIGNED URLS
// ================================================================
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
            const { data, error } = await db.storage.from(bucket).createSignedUrl(filePath, 3600);
            if (error) return raw;
            return data.signedUrl;
        } catch (e) { return raw; }
    }

    if (raw.startsWith('bucket://')) {
        try {
            const withoutPrefix = raw.replace('bucket://', '');
            const slashIdx = withoutPrefix.indexOf('/');
            if (slashIdx === -1) return null;
            const bucket = withoutPrefix.slice(0, slashIdx);
            const filePath = withoutPrefix.slice(slashIdx + 1);
            const { data, error } = await db.storage.from(bucket).createSignedUrl(filePath, 3600);
            if (error) {
                console.warn('Error firmando:', error);
                return null;
            }
            return data.signedUrl;
        } catch (e) {
            console.warn('Error parseando ruta:', e);
            return null;
        }
    }

    return null;
}

// ================================================================
// CARGAR CONVERSACIONES
// ================================================================
let conversationFilter = '';

async function loadConversations() {
    const list = $('conversationList');
    list.innerHTML = '';

    // Botón del bot siempre primero
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
        <div class="convtime" id="botBadge" style="color:var(--success);font-size:.55rem">IA</div>
    `;
    botEl.onclick = () => openConversation(BOT_ID);
    list.appendChild(botEl);

    if (!await auth()) return;

    try {
        const { data: lastBot } = await db
            .from('mensajes_chat')
            .select('contenido,tipo,created_at')
            .eq('eliminado', false)
            .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (lastBot) {
            const preview = $('botLastMsg');
            if (preview) {
                preview.textContent = lastBot.tipo === 'texto'
                    ? (lastBot.contenido || '').slice(0, 60)
                    : ('📎 ' + (lastBot.contenido || lastBot.tipo));
            }
        }

        const { count: noLeidos } = await db
            .from('mensajes_chat')
            .select('id', { count: 'exact', head: true })
            .eq('remitente_id', BOT_UUID)
            .eq('destinatario_id', user.id)
            .eq('leido', false)
            .eq('eliminado', false);

        const badge = $('botBadge');
        if (badge && noLeidos && noLeidos > 0) {
            badge.innerHTML = `<span style="background:var(--danger);color:#fff;font-size:.6rem;font-weight:800;padding:2px 8px;border-radius:99px;min-width:20px;text-align:center;display:inline-block;animation:pulse-badge 1.5s infinite;">${noLeidos > 9 ? '9+' : noLeidos}</span>`;
        }
    } catch (e) {
        console.warn('Error cargando badge bot:', e);
    }

    try {
        const { data, error } = await db
            .from('contactos')
            .select('contacto_id,created_at,fecha,estado')
            .eq('usuario_id', user.id)
            .neq('estado', 'bloqueado')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Error cargando contactos:', error);
            return;
        }
        if (!data?.length) return;

        for (const c of data) {
            if (c.contacto_id === BOT_UUID) continue;
            const p = await profile(c.contacto_id);
            const { data: last } = await db
                .from('mensajes_chat')
                .select('contenido,tipo,created_at,leido,remitente_id')
                .eq('eliminado', false)
                .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${c.contacto_id}),and(remitente_id.eq.${c.contacto_id},destinatario_id.eq.${user.id})`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const el = document.createElement('div');
            el.className = 'conv' + (current?.id === c.contacto_id ? ' active' : '');
            el.dataset.id = c.contacto_id;
            el.dataset.name = (p.nombre || '').toLowerCase() + ' ' + (p.handle || '').toLowerCase();
            el.innerHTML = avatar(p.nombre, p.avatar_url) + `
                <div class="convinfo">
                    <div class="convname">${esc(p.nombre || 'Usuario')}</div>
                    <div class="convmsg">${esc(last?.contenido || 'Sin mensajes')}</div>
                </div>
                <div class="convtime">${last?.created_at ? new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
            `;
            el.onclick = () => openConversation(c.contacto_id);
            list.appendChild(el);
        }
        aplicarFiltroConversaciones();
    } catch (e) {
        console.error('Error en loadConversations:', e);
    }
}

function aplicarFiltroConversaciones() {
    const q = conversationFilter.trim().toLowerCase();
    document.querySelectorAll('.conv').forEach(el => {
        if (!q || el.dataset.name?.includes(q) || el.querySelector('.convname')?.textContent.toLowerCase().includes(q)) {
            el.style.display = 'flex';
        } else {
            el.style.display = 'none';
        }
    });
}

// ================================================================
// ABRIR CONVERSACIÓN
// ================================================================
async function openConversation(id) {
    if (!await auth()) return;
    const p = await profile(id);
    const esBot = (id === BOT_ID);
    current = { id, profile: p, bot: esBot };

    $('chatName').textContent = p.nombre || 'Usuario';
    $('chatAvatar').innerHTML = esBot
        ? '✦'
        : (p.avatar_url
            ? `<img src="${esc(p.avatar_url)}" alt="">`
            : esc((p.nombre || '◈').charAt(0).toUpperCase()));
    $('chatAvatar').className = 'avatar' + (esBot ? ' avatar-bot' : '');
    $('chatStatus').textContent = esBot
        ? '✦ IA · Siempre disponible'
        : (p.online ? '◉ En línea' : '◈ Desconectado');
    $('chatStatus').className = 'status' + (p.online ? ' online' : '');

    $('chatAvatar').onclick = () => {
        if (esBot) {
            toast('ℹ️ Marquinhos es un asistente IA', 'warning');
            return;
        }
        verFotoAmpliada(p.avatar_url, p.nombre, p.handle);
    };

    $('voiceBot').style.display = esBot ? 'inline-flex' : 'none';
    $('chatActions').style.display = 'flex';
    $('composer').style.display = 'flex';
    $('emptyState').style.display = 'none';
    $('panel').classList.add('chat-open');

    document.querySelectorAll('.conv').forEach(x => x.classList.toggle('active', x.dataset.id === id));

    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();

    if (esBot) {
        await db.from('mensajes_chat')
            .update({ leido: true })
            .eq('remitente_id', BOT_UUID)
            .eq('destinatario_id', user.id)
            .eq('leido', false);
        const badge = $('botBadge');
        if (badge) {
            badge.textContent = 'IA';
            badge.style.color = 'var(--success)';
        }
        await abrirConversacionBot();
        return;
    }

    const r = await db
        .from('mensajes_chat')
        .select('*')
        .eq('eliminado', false)
        .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${id}),and(remitente_id.eq.${id},destinatario_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(100);
    if (r.error) {
        console.error(r.error);
        toast('❌ Error al cargar mensajes', 'error');
        return;
    }
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

// ================================================================
// CONVERSACIÓN CON MARQUINHOS (BOT)
// ================================================================
async function abrirConversacionBot() {
    const box = $('messages');
    const btn = box.querySelector('#scrollDownBtn');
    const anchor = box.querySelector('#scrollAnchor');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());

    if (!anchor) {
        const newAnchor = document.createElement('div');
        newAnchor.id = 'scrollAnchor';
        box.appendChild(newAnchor);
    }
    if (!btn) {
        const newBtn = document.createElement('button');
        newBtn.className = 'scroll-down-btn';
        newBtn.id = 'scrollDownBtn';
        newBtn.innerHTML = '↓<span class="badge-new" id="newMsgBadge" style="display:none;">1</span>';
        box.appendChild(newBtn);
        newBtn.onclick = () => {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
    }

    let historial = [];
    try {
        const r = await db
            .from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`)
            .order('created_at', { ascending: true })
            .limit(200);
        if (!r.error) historial = r.data || [];
    } catch (e) {
        console.warn('No se pudo cargar el historial de Marquinhos:', e);
    }

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
            </div>
        `);
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

// ================================================================
// RENDER MENSAJES
// ================================================================
async function renderMessages(rows) {
    const box = $('messages');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    let anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        box.appendChild(anchor);
    }

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

function messageHTML(m, sent, signedUrl) {
    let body = esc(limpiarMarkdown(m.contenido || ''));
    const urlToUse = signedUrl || m.imagen_url;

    if (urlToUse) {
        if (m.tipo === 'imagen') {
            body = `<img src="${esc(urlToUse)}" alt="${esc(m.nombre_archivo || 'Imagen')}" loading="lazy">`;
        } else if (m.tipo === 'video') {
            body = `<video controls playsinline src="${esc(urlToUse)}"></video>`;
        } else if (m.tipo === 'audio') {
            body = `<audio controls preload="metadata" src="${esc(urlToUse)}"></audio>`;
        } else {
            const displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido) || 'Archivo');
            body = `📎 <a href="${esc(urlToUse)}" target="_blank" rel="noopener" style="color:var(--gold)">${displayName}</a>`;
        }
    }

    const esBotRecibido = !sent && (m.es_bot || m.bot_message);
    const headerBot = esBotRecibido ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';

    return `<div class="bubblewrap ${sent ? 'sent' : 'received'}">
        <div class="bubble">${headerBot}${body}</div>
        <div class="meta">${m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}${sent ? (m.leido ? ' · ◆◆' : ' · ◈◈') : ''}</div>
    </div>`;
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================
async function sendMessage(text) {
    if (!current || !text.trim()) return;
    if (!await auth()) return;

    const textoLimpio = text.trim();
    $('messageInput').value = '';

    if (current.bot) {
        if (!verificarTerminosMarquinhos()) return;

        let userMsg = {
            contenido: textoLimpio,
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: user.id,
            leido: true
        };
        try {
            const ins = await db.from('mensajes_chat').insert({
                remitente_id: user.id,
                destinatario_id: BOT_UUID,
                contenido: textoLimpio,
                tipo: 'texto',
                leido: true,
                editado: false,
                eliminado: false
            }).select('*').single();
            if (!ins.error) userMsg = ins.data;
        } catch (e) {
            console.warn('No se pudo guardar el mensaje del usuario:', e);
        }

        append(userMsg, true);
        mostrarTypingBot();

        try {
            const historial = await cargarHistorialParaBot();
            const respuesta = await preguntarAlBotConMemoria(textoLimpio, historial);
            quitarTypingBot();

            let botMsg = {
                contenido: respuesta,
                created_at: new Date().toISOString(),
                tipo: 'texto',
                remitente_id: BOT_UUID,
                leido: true,
                es_bot: true
            };
            try {
                const insBot = await db.from('mensajes_chat').insert({
                    remitente_id: BOT_UUID,
                    destinatario_id: user.id,
                    contenido: respuesta,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false
                }).select('*').single();
                if (!insBot.error) botMsg = { ...insBot.data, es_bot: true };
            } catch (e) {
                console.warn('No se pudo guardar la respuesta de Marquinhos:', e);
            }

            append(botMsg, false);
            loadConversations();
        } catch (e) {
            quitarTypingBot();
            console.error('Error Marquinhos:', e);
            const errorMsg = {
                contenido: '⚠️ ' + (e.message || 'Ups, tuve un problema.'),
                created_at: new Date().toISOString(),
                tipo: 'texto',
                remitente_id: BOT_UUID,
                leido: true,
                es_bot: true
            };
            append(errorMsg, false);
        }
        return;
    }

    const r = await db.from('mensajes_chat').insert({
        remitente_id: user.id,
        destinatario_id: current.id,
        contenido: textoLimpio,
        tipo: 'texto',
        leido: false,
        editado: false,
        eliminado: false
    }).select('*').single();

    if (r.error) {
        console.error(r.error);
        toast('❌ Error al enviar mensaje', 'error');
        return;
    }
    await append(r.data, true);
    loadConversations();
}

// ================================================================
// VERIFICACIÓN DE TÉRMINOS PARA MARQUINHOS
// ================================================================
function verificarTerminosMarquinhos() {
    try {
        const TERMINOS_KEY = 'marquinhos_terminos_aceptados_1.0';
        const aceptados = localStorage.getItem(TERMINOS_KEY);

        if (aceptados) return true;

        toast('⚠️ Debes aceptar los Términos de Marquinhos primero', 'warning');

        setTimeout(() => {
            window.open('/legal/terminos-marquinhos', '_blank');
        }, 1200);

        return false;
    } catch (e) {
        console.warn('Error verificando términos:', e);
        return true;
    }
}

// ================================================================
// HISTORIAL PARA MARQUINHOS
// ================================================================
async function cargarHistorialParaBot() {
    try {
        const r = await db
            .from('mensajes_chat')
            .select('remitente_id, contenido, tipo, created_at')
            .eq('eliminado', false)
            .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`)
            .order('created_at', { ascending: false })
            .limit(BOT_MAX_HISTORY);

        if (r.error || !Array.isArray(r.data)) return [];

        return r.data.reverse()
            .map(m => ({
                role: m.remitente_id === user.id ? 'user' : 'assistant',
                content: limpiarMarkdown(m.contenido || '').slice(0, 2000)
            }))
            .filter(m => m.content && m.content.length > 0);
    } catch (e) {
        console.warn('No se pudo cargar historial para el bot:', e);
        return [];
    }
}

// ================================================================
// PREGUNTAR AL BOT CON MEMORIA Y CANDADOS
// ================================================================
async function preguntarAlBotConMemoria(mensaje, historial) {
    const s = await session();
    if (!s) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');

    const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo
        ? window.Marquinhos.getUserInfo()
        : null;

    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 50000);

    try {
        const r = await fetch('/api/ai/chat-pet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + s.access_token
            },
            body: JSON.stringify({
                message: mensaje.trim(),
                history: Array.isArray(historial) ? historial : [],
                page: '/features/mensajes/mensajes.html',
                user_name: userInfo ? userInfo.nombre : null,
                memoria: ''
            }),
            signal: controller.signal
        });

        let data = null;
        const contentType = r.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            try { data = await r.json(); } catch (_) { data = null; }
        } else {
            const texto = await r.text().catch(() => '');
            if (!r.ok) {
                if (r.status === 502 || r.status === 504) {
                    throw new Error('El servidor está tardando o no disponible. Intenta de nuevo.');
                }
                if (r.status === 500) {
                    throw new Error('El servidor tuvo un error interno. Revisa CORS o logs de Railway.');
                }
                throw new Error('El servidor devolvió una respuesta inesperada. Código: ' + r.status);
            }
            throw new Error('El servidor no devolvió JSON válido.');
        }

        if (!r.ok) {
            throw new Error((data && data.error) || `Error del servidor (${r.status})`);
        }
        if (!data || data.success === false) {
            throw new Error((data && data.error) || 'Marquinhos no pudo responder.');
        }

        let respuesta = typeof data.reply === 'string' ? data.reply.trim() : '';
        if (!respuesta) throw new Error('Marquinhos respondió sin contenido.');

        respuesta = limpiarMarkdown(respuesta);
        return respuesta;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Marquinhos está tardando demasiado en responder. Intenta nuevamente.');
        }
        if (error.name === 'TypeError' && /Failed to fetch|NetworkError/i.test(error.message || '')) {
            throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

// ================================================================
// TYPING INDICATOR
// ================================================================
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
            </div>
        `);
    }
    scrollToBottom(true);
}

function quitarTypingBot() {
    const el = $('typing-bot');
    if (el) el.remove();
}

// ================================================================
// APPEND MENSAJE
// ================================================================
async function append(m, sent) {
    const box = $('messages');
    const empty = box.querySelector('.empty');
    if (empty) empty.remove();

    const signedUrl = await getSignedUrlForMessage(m);
    const anchorRef = box.querySelector('#scrollAnchor');
    if (anchorRef) {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, sent, signedUrl));
    } else {
        box.insertAdjacentHTML('beforeend', messageHTML(m, sent, signedUrl));
    }
    observarCargaMultimedia(box);

    if (!sent && !isUserAtBottom) {
        unreadCount++;
        actualizarFlecha();
        return;
    }
    isUserAtBottom = true;
    scrollToBottom(true);
}

async function markRead(id) {
    if (!user || id === BOT_ID) return;
    await db.from('mensajes_chat')
        .update({ leido: true })
        .eq('remitente_id', id)
        .eq('destinatario_id', user.id)
        .eq('leido', false)
        .eq('eliminado', false);
}

// ================================================================
// ELIMINAR CONVERSACIÓN
// ================================================================
async function deleteConversation() {
    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }
    if (!await auth()) return;

    const nombre = current.bot ? 'Marquinhos' : (current.profile.nombre || 'este usuario');
    const confirmar = confirm(`⚠️ ¿Estás seguro de que quieres eliminar TODA la conversación con ${nombre}?\n\nEsta acción no se puede deshacer.`);
    if (!confirmar) return;

    try {
        const targetId = current.bot ? BOT_UUID : current.id;
        const { error } = await db.from('mensajes_chat')
            .update({ eliminado: true })
            .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${targetId}),and(remitente_id.eq.${targetId},destinatario_id.eq.${user.id})`);
        if (error) throw error;

        toast('✅ Conversación eliminada correctamente', 'success');

        const box = $('messages');
        box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
        const anchor = box.querySelector('#scrollAnchor');
        if (anchor) {
            anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><strong>◈</strong><div>Conversación eliminada</div><small>Envía un mensaje para empezar de nuevo</small></div>');
        }
        unreadCount = 0;
        actualizarFlecha();
        await loadConversations();
    } catch (e) {
        console.error('Error eliminando conversación:', e);
        toast('❌ No se pudo eliminar la conversación', 'error');
    }
}

// ================================================================
// SUSCRIPCIÓN A MENSAJES NUEVOS
// ================================================================
function subscribeMessages(id) {
    if (id === BOT_ID) return;
    if (msgChannel) db.removeChannel(msgChannel);

    msgChannel = db.channel('chat-' + id).on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_chat'
    }, p => {
        const m = p.new;
        if (current?.id === id && m.remitente_id === id && m.destinatario_id === user.id) {
            append(m, false);
            markRead(id);
        }
    }).subscribe();
}

// ================================================================
// GRABAR VOZ PARA EL BOT (con memoria)
// ================================================================
async function grabarVozParaBot() {
    if (!current?.bot) return;
    if (!await auth()) return;
    if (enviandoVozBot) {
        toast('⏳ Procesando audio anterior. Espera un momento…', 'warning');
        return;
    }

    if (voiceBotGrabando) {
        if (voiceBotRecorder && voiceBotRecorder.state !== 'inactive') {
            voiceBotRecorder.stop();
        }
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBotChunks = [];
        voiceBotRecorder = new MediaRecorder(stream);

        voiceBotRecorder.ondataavailable = e => {
            if (e.data && e.data.size) voiceBotChunks.push(e.data);
        };

        voiceBotRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            voiceBotGrabando = false;
            $('voiceBot').classList.remove('recording');
            $('voiceBot').textContent = '🔊';

            const blob = new Blob(voiceBotChunks, { type: voiceBotRecorder.mimeType || 'audio/webm' });
            voiceBotChunks = [];
            if (!blob.size) {
                toast('⚠️ No se capturó audio', 'error');
                return;
            }
            const file = new File([blob], `voz-${Date.now()}.webm`, { type: blob.type });
            await enviarVozAlBot(file);
        };

        voiceBotRecorder.start();
        voiceBotGrabando = true;
        $('voiceBot').classList.add('recording');
        $('voiceBot').textContent = '⏹️';
        toast('🎙️ Habla ahora… presiona otra vez para enviar');
    } catch (e) {
        console.error('Error micrófono:', e);
        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}

async function enviarVozAlBot(file) {
    if (enviandoVozBot) {
        toast('⏳ Ya hay un audio en proceso. Espera…', 'warning');
        return;
    }
    enviandoVozBot = true;
    const $btn = $('voiceBot');
    $btn.classList.add('processing');
    $btn.textContent = '⏳';
    $btn.disabled = true;

    try {
        const s = await session();
        if (!s) {
            enviandoVozBot = false;
            $btn.classList.remove('processing');
            $btn.textContent = '🔊';
            $btn.disabled = false;
            return;
        }

        const path = `${user.id}/bot-voice/${Date.now()}.webm`;
        const { error: upErr } = await db.storage
            .from('chat-audio')
            .upload(path, file, { contentType: file.type, upsert: false });

        if (upErr) {
            toast('❌ Error subiendo audio', 'error');
            enviandoVozBot = false;
            $btn.classList.remove('processing');
            $btn.textContent = '🔊';
            $btn.disabled = false;
            return;
        }

        const { data: signed } = await db.storage.from('chat-audio').createSignedUrl(path, 3600);
        if (!signed?.signedUrl) {
            toast('❌ Error firmando audio', 'error');
            enviandoVozBot = false;
            $btn.classList.remove('processing');
            $btn.textContent = '🔊';
            $btn.disabled = false;
            return;
        }

        const tempId = 'voice-user-' + Date.now();
        const box = $('messages');
        const anchorRef = box.querySelector('#scrollAnchor');
        const tempHTML = `<div class="bubblewrap sent" id="${tempId}"><div class="bubble"><div class="voice-label">🎙️ TU VOZ</div><div class="voice-loading">Enviando a Marquinhos…</div></div></div>`;
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', tempHTML);
        else box.insertAdjacentHTML('beforeend', tempHTML);
        scrollToBottom(true);

        let intentos = 0;
        const maxIntentos = 3;
        let exito = false;
        let data = {};

        while (intentos < maxIntentos && !exito) {
            const r = await fetch('/api/ai/voice/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + s.access_token
                },
                body: JSON.stringify({ audio_url: signed.signedUrl })
            });
            data = await r.json().catch(() => ({}));

            if (r.status === 429) {
                intentos++;
                const waitTime = intentos * 2000;
                toast(`⏳ Servidor ocupado. Reintentando en ${waitTime / 1000}s...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            if (!r.ok || data.success === false) {
                throw new Error(data.error || 'Error del servicio de voz');
            }
            exito = true;
        }

        if (!exito) throw new Error('El servidor de IA está saturado. Intenta de nuevo en unos minutos.');

        document.getElementById(tempId)?.remove();

        try {
            await db.from('mensajes_chat').insert({
                remitente_id: user.id,
                destinatario_id: BOT_UUID,
                contenido: data.transcripcion || file.name,
                nombre_archivo: file.name,
                imagen_url: `bucket://chat-audio/${path}`,
                tipo: 'audio',
                leido: true,
                editado: false,
                eliminado: false
            });
        } catch (e) {
            console.warn('No se pudo guardar la nota de voz:', e);
        }

        try {
            if (data.reply) {
                await db.from('mensajes_chat').insert({
                    remitente_id: BOT_UUID,
                    destinatario_id: user.id,
                    contenido: data.reply,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false
                });
            }
        } catch (e) {
            console.warn('No se pudo guardar la respuesta de Marquinhos:', e);
        }

        const botId = 'voice-bot-' + Date.now();
        let botBody = `<div class="bubble-bot-info">✦ MARQUINHOS</div>`;
        if (data.transcripcion) {
            botBody += `<div class="bot-transcripcion">🎙️ "${esc(data.transcripcion)}"</div>`;
        }
        botBody += `<div>${esc(limpiarMarkdown(data.reply || 'Sin respuesta'))}</div>`;
        if (data.audio_url) {
            botBody += `<audio class="bot-audio" controls src="${esc(data.audio_url)}"></audio>`;
        }
        const botHTML = `<div class="bubblewrap received" id="${botId}"><div class="bubble">${botBody}</div></div>`;
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', botHTML);
        else box.insertAdjacentHTML('beforeend', botHTML);

        observarCargaMultimedia(box);
        scrollToBottom(true);
        if (data.audio_url) {
            const audio = document.querySelector(`#${botId} audio`);
            if (audio) audio.play().catch(() => {});
        }
        loadConversations();
    } catch (e) {
        console.error('Error voz bot:', e);
        if (e.message.includes('429') || e.message.includes('Too Many Requests') || e.message.includes('saturado')) {
            toast('⏳ El asistente está saturado. Por favor, espera unos segundos e intenta de nuevo.', 'warning');
        } else {
            toast('❌ ' + e.message, 'error');
        }
    } finally {
        enviandoVozBot = false;
        $btn.classList.remove('processing');
        $btn.textContent = '🔊';
        $btn.disabled = false;
    }
}

// ================================================================
// SUBIR ARCHIVO
// ================================================================
async function uploadFile(file) {
    if (!current || !await auth()) return;
    if (current.bot) {
        toast('⚠️ Para Marquinhos usa el botón 🔊, o envía nota de voz con 🎙️', 'error');
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        toast('⚠️ El archivo supera 50 MB', 'error');
        return;
    }

    const type = file.type.startsWith('image/') ? 'imagen'
        : file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio'
        : 'archivo';

    const bucket = type === 'audio' ? 'chat-audio' : 'chat-attachments';
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user.id}/mensajes/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;

    const up = await db.storage.from(bucket).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false
    });
    if (up.error) {
        console.error(up.error);
        toast('❌ No se pudo subir el archivo', 'error');
        return;
    }

    const storageRef = `bucket://${bucket}/${path}`;
    const r = await db.from('mensajes_chat').insert({
        remitente_id: user.id,
        destinatario_id: current.id,
        contenido: file.name,
        nombre_archivo: file.name,
        imagen_url: storageRef,
        tipo: type,
        leido: false,
        editado: false,
        eliminado: false
    }).select('*').single();

    if (r.error) {
        console.error(r.error);
        toast('❌ No se pudo guardar el archivo', 'error');
        return;
    }
    await append(r.data, true);
    loadConversations();
}

// ================================================================
// NUEVA CONVERSACIÓN
// ================================================================
function newConversation() {
    $('newModal').classList.add('show');
    $('userSearch').value = '';
    $('userResults').innerHTML = '';
    setTimeout(() => $('userSearch').focus(), 50);
}

async function searchUsers(q) {
    const box = $('userResults');
    if (!q || q.trim().length < 2) {
        box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">Escribe al menos 2 caracteres</div>';
        return;
    }
    if (!await auth()) return;

    const term = q.trim().replace(/[%_,\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const r = await db
        .from('perfiles_publicos')
        .select('id,nombre,handle,avatar_url')
        .or(`nombre.ilike.%${term}%,handle.ilike.%${term}%`)
        .neq('id', user.id)
        .neq('id', BOT_UUID)
        .limit(12);

    if (r.error) {
        console.error(r.error);
        toast('❌ Error al buscar usuarios', 'error');
        return;
    }

    box.innerHTML = r.data?.length
        ? ''
        : '<div style="padding:18px;text-align:center;color:var(--muted)">No se encontraron usuarios</div>';

    for (const p of r.data || []) {
        const el = document.createElement('div');
        el.className = 'result';
        el.innerHTML = avatar(p.nombre, p.avatar_url) + `
            <div style="flex:1">
                <b>${esc(p.nombre || 'Usuario')}</b>
                <div style="font-size:.68rem;color:var(--muted)">@${esc(p.handle || 'usuario')}</div>
            </div>
            <span style="color:var(--gold);font-size:.7rem">Iniciar ›</span>
        `;
        el.onclick = () => createConversation(p.id);
        box.appendChild(el);
    }
}

async function createConversation(id) {
    if (!await auth()) return;

    const r = await db.from('contactos').select('id').eq('usuario_id', user.id).eq('contacto_id', id).maybeSingle();
    if (r.error) {
        toast('❌ Error comprobando contacto', 'error');
        return;
    }
    if (!r.data) {
        const ins = await db.from('contactos').insert({
            usuario_id: user.id,
            contacto_id: id,
            estado: 'activo'
        });
        if (ins.error) {
            console.error(ins.error);
            toast('❌ No se pudo crear la conversación', 'error');
            return;
        }
    }
    $('newModal').classList.remove('show');
    await loadConversations();
    await openConversation(id);
}

// ================================================================
// RECORD AUDIO NOTA (chat normal)
// ================================================================
function getSupportedAudioMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (const type of candidates) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function extensionForMime(mime) {
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'm4a';
    return 'webm';
}

async function recordAudioNota() {
    if (recorder && recorder.state === 'recording') {
        recorder.stop();
        return;
    }
    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }
    if (!await auth()) return;

    const esBot = current.bot;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        const mimeType = getSupportedAudioMime();
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recordingMode = esBot ? 'bot' : 'normal';
        recordingStartedAt = Date.now();

        recorder.ondataavailable = e => {
            if (e.data && e.data.size) audioChunks.push(e.data);
        };

        recorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            $('audio').classList.remove('recording');
            $('audio').textContent = '🎙️';

            const blob = new Blob(audioChunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            audioChunks = [];
            const mode = recordingMode;
            recorder = null;
            recordingMode = null;

            if (!blob.size) {
                toast('⚠️ No se capturó audio', 'error');
                return;
            }
            const ext = extensionForMime(blob.type);
            const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
            if (mode === 'bot') {
                await enviarVozAlBot(file);
            } else {
                await uploadFile(file);
            }
        };

        recorder.start();
        $('audio').classList.add('recording');
        $('audio').textContent = '⏹️';
        toast(esBot ? '🎙️ Habla con Marquinhos… presiona otra vez para enviar' : '🎙️ Grabando… presiona otra vez para detener');
    } catch (e) {
        console.error('Micrófono:', e);
        $('audio').classList.remove('recording');
        $('audio').textContent = '🎙️';
        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}
// ================================================================
// MENSAJES · JS v2.0 (Parte 3 de 3) — FINAL
// Canales, grupos, llamadas, inicialización y listeners
// ================================================================

// ================================================================
// CANALES Y GRUPOS
// ================================================================
var _canalesTimer = null;
var _gruposTimer = null;
var _pestanaActual = 'chats';

function generarSlug(nombre) {
    var slug = (nombre || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!slug) slug = 'grupo';
    return slug + '-' + Date.now();
}

function cambiarPestana(pestana) {
    _pestanaActual = pestana;

    document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === pestana);
    });

    var tabChats = document.getElementById('tabChats');
    var tabCanales = document.getElementById('tabCanales');
    var tabGrupos = document.getElementById('tabGrupos');

    if (tabChats) tabChats.classList.toggle('hidden', pestana !== 'chats');
    if (tabCanales) tabCanales.classList.toggle('hidden', pestana !== 'canales');
    if (tabGrupos) tabGrupos.classList.toggle('hidden', pestana !== 'grupos');

    var fab = document.getElementById('newChat');
    if (fab) {
        if (pestana === 'chats') fab.title = 'Nueva conversación';
        else if (pestana === 'canales') fab.title = 'Nuevo canal';
        else if (pestana === 'grupos') fab.title = 'Nuevo grupo';
    }

    if (pestana === 'canales') cargarCanales();
    else if (pestana === 'grupos') cargarGrupos();
}

function onNuevoClick() {
    if (_pestanaActual === 'chats') newConversation();
    else if (_pestanaActual === 'canales') abrirModalCrearCanal();
    else if (_pestanaActual === 'grupos') abrirModalCrearGrupo();
}

function buscarCanalesDebounce() {
    if (_canalesTimer) clearTimeout(_canalesTimer);
    _canalesTimer = setTimeout(cargarCanales, 300);
}

function buscarGruposDebounce() {
    if (_gruposTimer) clearTimeout(_gruposTimer);
    _gruposTimer = setTimeout(cargarGrupos, 300);
}

async function cargarCanales() {
    var lista = document.getElementById('canalesLista');
    if (!lista) return;
    if (!await auth()) return;

    lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">✦</div><div class="empty-text">Cargando canales...</div></div>';

    try {
        var result = await db
            .from('grupos_video')
            .select('*')
            .eq('visibilidad', 'publico')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (result.error) {
            console.error('[Mensajes/Canales] Error Supabase:', result.error);
            throw result.error;
        }

        var canales = result.data || [];

        var searchInput = document.getElementById('searchCanales');
        var buscar = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';

        var filtroEstado = document.getElementById('filtroEstadoCanal');
        var estadoSeleccionado = filtroEstado ? filtroEstado.value : '';

        if (buscar) {
            canales = canales.filter(function(c) {
                return (c.nombre || '').toLowerCase().indexOf(buscar) !== -1 ||
                       (c.descripcion || '').toLowerCase().indexOf(buscar) !== -1;
            });
        }

        if (estadoSeleccionado) {
            canales = canales.filter(function(c) {
                return c.estado_region === estadoSeleccionado;
            });
        }

        if (canales.length === 0) {
            lista.innerHTML =
                '<div class="empty-state-small">' +
                    '<div class="empty-icon">✦</div>' +
                    '<div class="empty-text">Aún no hay canales públicos</div>' +
                    '<button class="empty-btn" onclick="abrirModalCrearCanal()">Crear el primero</button>' +
                '</div>';
            return;
        }

        lista.innerHTML = canales.map(function(c) {
            return renderCanalCard(c, 'canal');
        }).join('');

        actualizarFiltros('canal', canales);
    } catch (e) {
        console.error('[Mensajes/Canales] Error:', e);
        lista.innerHTML =
            '<div class="empty-state-small">' +
                '<div class="empty-icon">!</div>' +
                '<div class="empty-text">No se pudieron cargar los canales</div>' +
                '<div style="font-size:.6rem;color:#ff3366;margin-top:8px;padding:8px;background:rgba(255,51,102,.1);border-radius:8px;max-width:100%;word-break:break-all;">' +
                    esc(e.message || 'Error desconocido') +
                '</div>' +
            '</div>';
    }
}

async function cargarGrupos() {
    var lista = document.getElementById('gruposLista');
    if (!lista) return;
    if (!await auth()) return;

    lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">◆</div><div class="empty-text">Cargando grupos...</div></div>';

    try {
        var result = await db
            .from('grupos_video')
            .select('*')
            .eq('visibilidad', 'privado')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (result.error) {
            console.error('[Mensajes/Grupos] Error Supabase:', result.error);
            throw result.error;
        }

        var grupos = result.data || [];

        var searchInput = document.getElementById('searchGrupos');
        var buscar = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';

        var filtroEstado = document.getElementById('filtroEstadoGrupo');
        var estadoSeleccionado = filtroEstado ? filtroEstado.value : '';

        if (buscar) {
            grupos = grupos.filter(function(g) {
                return (g.nombre || '').toLowerCase().indexOf(buscar) !== -1 ||
                       (g.descripcion || '').toLowerCase().indexOf(buscar) !== -1;
            });
        }

        if (estadoSeleccionado) {
            grupos = grupos.filter(function(g) {
                return g.estado_region === estadoSeleccionado;
            });
        }

        if (grupos.length === 0) {
            lista.innerHTML =
                '<div class="empty-state-small">' +
                    '<div class="empty-icon">◆</div>' +
                    '<div class="empty-text">Aún no hay grupos privados</div>' +
                    '<button class="empty-btn" onclick="abrirModalCrearGrupo()">Crear el primero</button>' +
                '</div>';
            return;
        }

        lista.innerHTML = grupos.map(function(g) {
            return renderCanalCard(g, 'grupo');
        }).join('');

        actualizarFiltros('grupo', grupos);
    } catch (e) {
        console.error('[Mensajes/Grupos] Error:', e);
        lista.innerHTML =
            '<div class="empty-state-small">' +
                '<div class="empty-icon">!</div>' +
                '<div class="empty-text">No se pudieron cargar los grupos</div>' +
                '<div style="font-size:.6rem;color:#ff3366;margin-top:8px;padding:8px;background:rgba(255,51,102,.1);border-radius:8px;max-width:100%;word-break:break-all;">' +
                    esc(e.message || 'Error desconocido') +
                '</div>' +
            '</div>';
    }
}

function renderCanalCard(item, tipo) {
    var esCanal = tipo === 'canal';
    var inicial = (item.nombre || '◈').charAt(0).toUpperCase();
    var avatarHTML = (item.avatar_url)
        ? '<img src="' + esc(item.avatar_url) + '" alt="">'
        : esc(inicial);

    var claseAvatar = esCanal ? 'canal-avatar' : 'canal-avatar privado';
    var claseCard = esCanal ? 'canal-card publico' : 'canal-card privado';
    var badgeVisibilidad = esCanal
        ? '<span class="canal-badge publico">✦ Público</span>'
        : '<span class="canal-badge privado">◆ Privado</span>';

    var badgeMarketplace = item.marketplace_activo
        ? '<span class="canal-badge marketplace">▸ Marketplace</span>'
        : '';

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
            '<div class="canal-meta">' +
                badgeVisibilidad +
                badgeMarketplace +
                '<span>' + esc(ubicacionTexto) + '</span>' +
            '</div>' +
        '</div>' +
    '</div>';
}

function actualizarFiltros(tipo, items) {
    var selectEstadoId = tipo === 'canal' ? 'filtroEstadoCanal' : 'filtroEstadoGrupo';
    var select = document.getElementById(selectEstadoId);
    if (!select) return;

    var estados = {};
    items.forEach(function(i) {
        if (i.estado_region) estados[i.estado_region] = true;
    });

    var valorActual = select.value;
    select.innerHTML = '<option value="">Todos los estados</option>';

    Object.keys(estados).sort().forEach(function(e) {
        var opt = document.createElement('option');
        opt.value = e;
        opt.textContent = e;
        select.appendChild(opt);
    });

    if (valorActual && estados[valorActual]) {
        select.value = valorActual;
    }
}

function abrirCanalOGrupo(id, tipo) {
    if (!id) return;
    window.location.href = '/features/grupos/grupos.html?grupo=' + encodeURIComponent(id);
}

function abrirModalCrearCanal() {
    var modal = document.getElementById('modalCrearCanal');
    if (modal) modal.classList.add('show');
    setTimeout(function() {
        var input = document.getElementById('canalNombre');
        if (input) input.focus();
    }, 100);
}

function cerrarModalCrearCanal() {
    var modal = document.getElementById('modalCrearCanal');
    if (modal) modal.classList.remove('show');
}

function abrirModalCrearGrupo() {
    var modal = document.getElementById('modalCrearGrupo');
    if (modal) modal.classList.add('show');
    setTimeout(function() {
        var input = document.getElementById('grupoNombre');
        if (input) input.focus();
    }, 100);
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
    if (nombre.length > 80) { toast('⚠️ El nombre es muy largo', 'error'); return; }

    var btn = document.getElementById('btnCrearCanal');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }

    try {
        var slug = generarSlug(nombre);

        var result = await db.from('grupos_video').insert({
            creador_id: user.id,
            categoria_id: null,
            nombre: nombre,
            slug: slug,
            descripcion: descripcion || null,
            ciudad: ciudad || null,
            estado_region: estado || null,
            municipio: municipio,
            pais: pais,
            visibilidad: 'publico',
            modo_ingreso: 'abierto',
            precio_usdt: 0,
            marketplace_activo: false,
            activo: true,
            firma_ligera: 'Yo me hago cargo de lo que digo aquí'
        }).select().single();

        if (result.error) {
            console.error('[Mensajes/Canales] Error INSERT:', result.error);
            throw result.error;
        }

        toast('✅ Canal creado correctamente', 'success');
        cerrarModalCrearCanal();

        ['canalNombre', 'canalDescripcion', 'canalEstado', 'canalMunicipio', 'canalCiudad'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        await cargarCanales();
    } catch (e) {
        console.error('[Mensajes/Canales] Error creando:', e);
        toast('❌ Error: ' + (e.message || 'desconocido'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✦ Crear Canal'; }
    }
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
    if (nombre.length > 80) { toast('⚠️ El nombre es muy largo', 'error'); return; }

    var btn = document.getElementById('btnCrearGrupo');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }

    try {
        var slug = generarSlug(nombre);

        var result = await db.from('grupos_video').insert({
            creador_id: user.id,
            categoria_id: null,
            nombre: nombre,
            slug: slug,
            descripcion: descripcion || null,
            ciudad: ciudad || null,
            estado_region: estado || null,
            municipio: municipio,
            pais: pais,
            visibilidad: 'privado',
            modo_ingreso: 'invitacion',
            precio_usdt: 0,
            marketplace_activo: false,
            activo: true,
            firma_ligera: 'Yo me hago cargo de lo que digo aquí'
        }).select().single();

        if (result.error) {
            console.error('[Mensajes/Grupos] Error INSERT:', result.error);
            throw result.error;
        }

        toast('✅ Grupo creado correctamente', 'success');
        cerrarModalCrearGrupo();

        ['grupoNombre', 'grupoDescripcion', 'grupoEstado', 'grupoMunicipio', 'grupoCiudad'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        await cargarGrupos();
    } catch (e) {
        console.error('[Mensajes/Grupos] Error creando:', e);
        toast('❌ Error: ' + (e.message || 'desconocido'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '◆ Crear Grupo'; }
    }
}

// ================================================================
// LLAMADAS (LiveKit)
// ================================================================
async function token(roomName, participantName) {
    const s = await session();
    if (!s) throw Error('No autenticado');
    const r = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + s.access_token
        },
        body: JSON.stringify({ roomName, participantName })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'No se pudo obtener token LiveKit');
    return d;
}

async function startCall() {
    if (current?.bot) {
        toast('⚠️ Marquinhos no acepta llamadas', 'warning');
        return;
    }
    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }
    if (call.active) {
        $('callOverlay').classList.add('show');
        return;
    }

    try {
        const s = await session();
        if (!s) {
            toast('⚠️ Inicia sesión para llamar', 'error');
            return;
        }
        const id = crypto.randomUUID();
        const roomName = 'call_' + id;

        const ins = await db.from('llamadas').insert({
            id,
            creador_id: user.id,
            destinatario_id: current.id,
            tipo: 'video',
            estado: 'ringing',
            room_name: roomName,
            conversation_id: current.id
        });
        if (ins.error) throw ins.error;

        const pi = await db.from('llamadas_participantes').insert({
            llamada_id: id,
            usuario_id: user.id,
            rol: 'creador',
            estado: 'conectado',
            entro_at: new Date().toISOString()
        });
        if (pi.error) throw pi.error;

        call.id = id;
        call.initiator = true;

        await connectCall(roomName, user.id);
        subscribeCall(id);
        $('callOverlay').classList.add('show');
        $('callInfo').textContent = '📞 Llamando a ' + (current.profile.nombre || 'usuario') + '…';
    } catch (e) {
        console.error(e);
        toast('❌ ' + e.message, 'error');
        cleanupCall();
    }
}

async function connectCall(roomName, name) {
    if (!window.LivekitClient) {
        throw Error('LiveKit no está cargado');
    }
    const td = await token(roomName, name);
    const room = new LivekitClient.Room();

    room.on(LivekitClient.RoomEvent.TrackSubscribed, track => {
        if (track.kind === 'video') track.attach($('remoteVideo'));
        if (track.kind === 'audio') track.attach();
    });

    room.on(LivekitClient.RoomEvent.Disconnected, () => {
        if (call.active) cleanupCall();
    });

    await room.connect(td.url, td.token);

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });

    const at = stream.getAudioTracks()[0];
    const vt = stream.getVideoTracks()[0];

    if (at) {
        await room.localParticipant.publishTrack(at, { name: 'microphone', source: LivekitClient.TrackSource.Microphone });
        call.audio = at;
    }
    if (vt) {
        await room.localParticipant.publishTrack(vt, { name: 'camera', source: LivekitClient.TrackSource.Camera });
        call.video = vt;
        $('localVideo').srcObject = new MediaStream([vt]);
    }
    call.room = room;
    call.active = true;
}

function subscribeCall(id) {
    if (callChannel) db.removeChannel(callChannel);
    callChannel = db.channel('call-' + id).on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'llamadas',
        filter: 'id=eq.' + id
    }, p => {
        if (['ended', 'rejected', 'missed'].includes(p.new.estado)) {
            toast('📞 La llamada terminó', '');
            cleanupCall();
        }
    }).subscribe();
}

async function incoming(data) {
    if (call.active) {
        await db.from('llamadas').update({
            estado: 'rejected',
            finalizada_at: new Date().toISOString()
        }).eq('id', data.id);
        return;
    }
    if (data.creador_id === user.id) return;

    incomingId = data.id;
    const p = await profile(data.creador_id);
    $('incomingName').textContent = p.nombre || 'Usuario';
    $('incomingAvatar').innerHTML = p.avatar_url
        ? `<img src="${esc(p.avatar_url)}" alt="">`
        : esc((p.nombre || '◈').charAt(0).toUpperCase());
    $('incomingOverlay').classList.add('show');
}

async function acceptCall() {
    if (!incomingId) return;
    try {
        const r = await db.from('llamadas').select('room_name,creador_id').eq('id', incomingId).single();
        if (r.error) throw r.error;

        await db.from('llamadas').update({
            estado: 'active',
            contestada_at: new Date().toISOString()
        }).eq('id', incomingId);

        await db.from('llamadas_participantes').insert({
            llamada_id: incomingId,
            usuario_id: user.id,
            rol: 'invitado',
            estado: 'conectado',
            entro_at: new Date().toISOString()
        });

        call.id = incomingId;
        call.initiator = false;
        $('incomingOverlay').classList.remove('show');

        await connectCall(r.data.room_name, user.id);
        subscribeCall(incomingId);
    } catch (e) {
        console.error(e);
        toast('❌ ' + e.message, 'error');
        cleanupCall();
    }
}

async function rejectCall() {
    if (incomingId) {
        await db.from('llamadas').update({
            estado: 'rejected',
            finalizada_at: new Date().toISOString()
        }).eq('id', incomingId);
    }
    incomingId = null;
    $('incomingOverlay').classList.remove('show');
}

async function cleanupCall() {
    try {
        if (call.room) call.room.disconnect();
        if (call.audio) call.audio.stop();
        if (call.video) call.video.stop();
        if (call.screen) call.screen.stop();
        $('localVideo').srcObject = null;
        $('remoteVideo').srcObject = null;
        if (callChannel) db.removeChannel(callChannel);
    } catch (e) {}

    Object.assign(call, {
        room: null, id: null, active: false, audio: null, video: null, screen: null
    });
    $('callOverlay').classList.remove('show');
    $('toggleMic').textContent = '🎤';
    $('toggleCam').textContent = '📷';
    $('toggleScreen').textContent = '🖥️';
}

async function hangup() {
    if (call.id) {
        await db.from('llamadas').update({
            estado: 'ended',
            finalizada_at: new Date().toISOString()
        }).eq('id', call.id);
    }
    await cleanupCall();
}

async function toggleMic() {
    if (!call.audio) return;
    call.audio.enabled = !call.audio.enabled;
    $('toggleMic').textContent = call.audio.enabled ? '🎤' : '🔇';
}

async function toggleCam() {
    if (!call.video) return;
    call.video.enabled = !call.video.enabled;
    $('toggleCam').textContent = call.video.enabled ? '📷' : '📷❌';
}

async function toggleScreen() {
    if (!call.room) return;
    try {
        if (call.screen) {
            await call.room.localParticipant.unpublishTrack(call.screen);
            call.screen.stop();
            call.screen = null;
            $('toggleScreen').textContent = '🖥️';
            return;
        }
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const t = s.getVideoTracks()[0];
        await call.room.localParticipant.publishTrack(t, {
            name: 'screen',
            source: LivekitClient.TrackSource.ScreenShare
        });
        call.screen = t;
        $('toggleScreen').textContent = '🖥️⏹️';
        t.onended = () => toggleScreen();
    } catch (e) {
        if (e.name !== 'NotAllowedError') {
            toast('❌ No se pudo compartir pantalla', 'error');
        }
    }
}

// ================================================================
// INIT — INICIALIZACIÓN PRINCIPAL
// ================================================================
async function init() {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        },
        realtime: { params: { eventsPerSecond: 10 } }
    });
    window.supabaseClient = db;

    try {
        const s = await session();
        if (s?.user) user = s.user;
    } catch (e) {
        console.warn('Error cargando sesión:', e);
    }

    await cargarFotoHeader();
    await loadConversations();
    await cargarEstados();

    db.auth.onAuthStateChange((event, s) => {
        user = s?.user || null;
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            loadConversations();
            cargarFotoHeader();
            cargarEstados();
        }
    });

    // Header
    $('headerAvatar').onclick = abrirProfileModal;
    $('avatarInput').addEventListener('change', subirFotoHeader);

    // Profile modal
    $('btnCambiarFoto').onclick = () => $('avatarInput').click();
    $('btnCerrarProfileModal').onclick = cerrarProfileModal;
    $('profileModal').addEventListener('click', e => {
        if (e.target.id === 'profileModal') cerrarProfileModal();
    });

    // Vistas modal
    $('closeVistasModal').onclick = cerrarVistasModal;
    $('vistasModal').addEventListener('click', e => {
        if (e.target.id === 'vistasModal') cerrarVistasModal();
    });

    // Photo viewer
    $('pvClose').onclick = cerrarPhotoViewer;
    $('photoViewer').addEventListener('click', e => {
        if (e.target.id === 'photoViewer') cerrarPhotoViewer();
    });

    // Estado viewer
    $('evClose').onclick = cerrarEstadoViewer;
    $('evPrev').onclick = (e) => { e.stopPropagation(); anteriorEstado(); };
    $('evNext').onclick = (e) => { e.stopPropagation(); siguienteEstado(); };
    $('evVistas').onclick = (e) => {
        e.stopPropagation();
        const estadoId = $('evVistas').dataset.estadoId;
        if (estadoId) abrirVistasModal(estadoId);
    };

    // Pausa en estado viewer
    const evBody = $('evBody');
    evBody.addEventListener('mousedown', activarPausaEstado);
    evBody.addEventListener('mouseup', desactivarPausaEstado);
    evBody.addEventListener('mouseleave', desactivarPausaEstado);
    evBody.addEventListener('touchstart', (e) => { e.preventDefault(); activarPausaEstado(); }, { passive: false });
    evBody.addEventListener('touchend', (e) => { e.preventDefault(); desactivarPausaEstado(); }, { passive: false });
    evBody.addEventListener('touchcancel', desactivarPausaEstado);

    // Keyboard pausa
    document.addEventListener('keydown', e => {
        if (e.key === ' ' && $('estadoViewer').classList.contains('show')) {
            e.preventDefault();
            if (estadoPausado) desactivarPausaEstado();
            else activarPausaEstado();
        }
    });

    // Subir estado
    $('btnSubirEstado').onclick = abrirModalEstado;
    $('closeEstadoModal').onclick = cerrarModalEstado;
    $('btnSeleccionarEstado').onclick = seleccionarArchivoEstado;
    $('estadoFileInput').addEventListener('change', previewEstado);
    $('btnPublicarEstado').onclick = publicarEstado;
    $('estadoUploadModal').addEventListener('click', e => {
        if (e.target.id === 'estadoUploadModal') cerrarModalEstado();
    });

    // Escape cierra modales
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cerrarProfileModal();
            cerrarPhotoViewer();
            cerrarEstadoViewer();
            cerrarModalEstado();
            cerrarVistasModal();
            cerrarModalCrearCanal();
            cerrarModalCrearGrupo();
            $('newModal').classList.remove('show');
        }
    });

    // Composer
    $('composer').addEventListener('submit', e => {
        e.preventDefault();
        sendMessage($('messageInput').value);
    });

    // Nueva conversación
    $('newChat').onclick = onNuevoClick;
    $('closeModal').onclick = () => $('newModal').classList.remove('show');
    $('newModal').addEventListener('click', e => {
        if (e.target.id === 'newModal') $('newModal').classList.remove('show');
    });

    // Búsqueda usuarios
    $('userSearch').addEventListener('input', e => searchUsers(e.target.value));

    // Búsqueda conversaciones
    $('searchConversations').addEventListener('input', e => {
        conversationFilter = e.target.value;
        aplicarFiltroConversaciones();
    });

    // Attach
    $('attach').onclick = () => {
        if (current?.bot) {
            toast('⚠️ Para Marquinhos usa el botón 🔊', 'error');
            return;
        }
        $('fileInput').click();
    };

    $('fileInput').addEventListener('change', async e => {
        for (const f of e.target.files) {
            await uploadFile(f);
        }
        e.target.value = '';
    });

    // Audio y voz
    $('audio').onclick = recordAudioNota;
    $('voiceBot').onclick = grabarVozParaBot;

    // Chat actions
    $('deleteChat').onclick = deleteConversation;
    $('videoCall').onclick = startCall;
    $('backBtn').onclick = cerrarConversacion;

    // Controles llamada
    $('hangup').onclick = hangup;
    $('toggleMic').onclick = toggleMic;
    $('toggleCam').onclick = toggleCam;
    $('toggleScreen').onclick = toggleScreen;
    $('acceptCall').onclick = acceptCall;
    $('rejectCall').onclick = rejectCall;

    // Scroll detect
    $('messages').addEventListener('scroll', detectarSiEstaAbajo);

    $('scrollDownBtn').onclick = () => {
        isUserAtBottom = true;
        scrollToBottom(true);
        actualizarFlecha();
    };

    // Buscar en la conversación
    $('searchChat').onclick = async () => {
        if (!current) {
            toast('⚠️ Selecciona una conversación', 'error');
            return;
        }
        if (current.bot) {
            toast('ℹ️ Marquinhos no tiene búsqueda local aún', 'warning');
            return;
        }
        const q = prompt('🔍 Buscar en la conversación:');
        if (!q?.trim()) return;

        const r = await db.from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${current.id}),and(remitente_id.eq.${current.id},destinatario_id.eq.${user.id})`)
            .ilike('contenido', '%' + q.trim() + '%')
            .order('created_at', { ascending: true });

        if (r.error) {
            toast('❌ Error al buscar', 'error');
            return;
        }
        await renderMessages(r.data || []);
    };

    // Modales crear canal/grupo
    $('closeModalCanal')?.addEventListener('click', cerrarModalCrearCanal);
    $('modalCrearCanal')?.addEventListener('click', e => {
        if (e.target.id === 'modalCrearCanal') cerrarModalCrearCanal();
    });

    $('closeModalGrupo')?.addEventListener('click', cerrarModalCrearGrupo);
    $('modalCrearGrupo')?.addEventListener('click', e => {
        if (e.target.id === 'modalCrearGrupo') cerrarModalCrearGrupo();
    });

    // Suscripción a llamadas entrantes
    db.channel('incoming-calls').on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'llamadas'
    }, p => {
        if (user && p.new.destinatario_id === user.id && p.new.estado === 'ringing') {
            incoming(p.new);
        }
    }).subscribe();

    // Limpieza periódica de estados vistos
    setInterval(() => {
        limpiarVistosAntiguos();
        cargarEstados();
    }, 5 * 60 * 1000);

    // Idiomas
    setTimeout(async () => {
        try {
            if (typeof window.inicializarIdiomas === 'function') {
                await window.inicializarIdiomas();
                console.log('✅ Idiomas aplicados a mensajes');
            }
        } catch (e) {
            console.warn('⚠️ Error aplicando idiomas:', e);
        }
    }, 500);
}

// ================================================================
// EXPOSICIÓN GLOBAL (para los onclick del HTML)
// ================================================================
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

// ================================================================
// ARRANQUE
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase?.createClient) {
        init();
    } else {
        toast('❌ No se pudo cargar Supabase', 'error');
    }
});