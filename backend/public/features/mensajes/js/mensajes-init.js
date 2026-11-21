// ================================================================
// MENSAJES · INIT v2.1 · MÓDULO 8 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-init.js
// Depende de: core, scroll-media, chats, bot, estados, canales,
//             llamadas, llamadas-ui y teclado-emojis.js
// Cambios v2.1: sin cambios funcionales; se quitan los icon vacíos
//               en los NeonModal de inicio de llamada.
// ================================================================

'use strict';

let recorder = null;
let audioChunks = [];
let recordingMode = null;
let recordingStartedAt = 0;
let incomingId = null;

/* ---------------- Foto y perfil del header ---------------- */

async function cargarFotoHeader() {
    if (!user || !user.id) return;
    try {
        const { data, error } = await db.from('usuarios').select('avatar_url, nombre, handle').eq('id', user.id).maybeSingle();
        if (error) { console.warn('No se pudo cargar perfil:', error.message); return; }
        currentUserProfile = data;

        const inicial = esc(((data?.nombre || data?.handle || 'U') + '').charAt(0).toUpperCase());
        const headerAvatar = $('headerAvatar');
        if (headerAvatar) {
            headerAvatar.innerHTML = data?.avatar_url ? `<img src="${esc(data.avatar_url)}" alt="Mi foto">` : inicial;
        }

        const pmAvatar = $('profileModalAvatar');
        if (pmAvatar) pmAvatar.innerHTML = data?.avatar_url ? `<img src="${esc(data.avatar_url)}" alt="Mi foto">` : inicial;
        const pmName = $('profileModalName');
        if (pmName) pmName.textContent = data?.nombre || 'Mi perfil';
        const pmHandle = $('profileModalHandle');
        if (pmHandle) pmHandle.textContent = '@' + (data?.handle || 'usuario');
    } catch (e) { console.warn('Error cargando foto del header:', e); }
}

async function subirFotoHeader(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!await auth()) return;
    if (file.size > 5 * 1024 * 1024) { toast('La imagen no puede superar los 5 MB.', 'error'); event.target.value = ''; return; }
    if (!file.type.startsWith('image/')) { toast('Solo se permiten imágenes.', 'error'); event.target.value = ''; return; }
    try {
        toast('Revisando y subiendo la foto…', '');
        const d = await subirViaBackend(file, 'sariels-avatars', 'imagen');
        const { error: updateError } = await db.from('usuarios').update({ avatar_url: d.url + '?t=' + Date.now() }).eq('id', user.id);
        if (updateError) throw updateError;
        toast('Foto actualizada correctamente.', 'success');
        event.target.value = '';
        await cargarFotoHeader();
    } catch (error) {
        console.error('Error al subir foto:', error);
        toast(error.message || 'No se pudo subir la foto.', 'error');
        event.target.value = '';
    }
}

/* ---------------- Enlace de botones de la UI ---------------- */

function enlazarBotonesUI() {
    const bind = (id, fn, ev = 'onclick') => { const el = $(id); if (el) el[ev] = fn; };
    const bindChange = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', fn); };
    const bindClickFondo = (modalId, cerrar) => {
        const el = $(modalId);
        if (el) el.addEventListener('click', e => { if (e.target.id === modalId) cerrar(); });
    };

    bind('headerAvatar', abrirProfileModal);
    bindChange('avatarInput', subirFotoHeader);
    bind('btnCambiarFoto', () => $('avatarInput')?.click());
    bind('btnCerrarProfileModal', cerrarProfileModal);
    bindClickFondo('profileModal', cerrarProfileModal);

    bind('closeVistasModal', cerrarVistasModal);
    bindClickFondo('vistasModal', cerrarVistasModal);

    bind('pvClose', cerrarPhotoViewer);
    bindClickFondo('photoViewer', cerrarPhotoViewer);

    bind('evClose', cerrarEstadoViewer);
    bind('evPrev', (e) => { if (e) e.stopPropagation(); anteriorEstado(); });
    bind('evNext', (e) => { if (e) e.stopPropagation(); siguienteEstado(); });
    bind('evVistas', (e) => {
        if (e) e.stopPropagation();
        const el = $('evVistas');
        const estadoId = el?.dataset.estadoId;
        if (estadoId) abrirPanelEstado(estadoId, 'vistas');
    });

    const evBody = $('evBody');
    if (evBody) {
        evBody.addEventListener('mousedown', activarPausaEstado);
        evBody.addEventListener('mouseup', desactivarPausaEstado);
        evBody.addEventListener('mouseleave', desactivarPausaEstado);
        evBody.addEventListener('touchstart', (e) => { e.preventDefault(); activarPausaEstado(); }, { passive: false });
        evBody.addEventListener('touchend', (e) => { e.preventDefault(); desactivarPausaEstado(); }, { passive: false });
        evBody.addEventListener('touchcancel', desactivarPausaEstado);
    }

    bind('btnSubirEstado', abrirModalEstado);
    bind('closeEstadoModal', cerrarModalEstado);
    bind('btnSeleccionarEstado', seleccionarArchivoEstado);
    bindChange('estadoFileInput', previewEstado);
    bind('btnPublicarEstado', publicarEstado);
    bindClickFondo('estadoUploadModal', cerrarModalEstado);

    const composerEl = $('composer');
    if (composerEl) composerEl.addEventListener('submit', e => { e.preventDefault(); sendMessage($('messageInput').value); });

    bind('attach', () => {
        if (current?.bot) { toast('Para Marquinhos usa el botón de voz.', 'error'); return; }
        $('fileInput')?.click();
    });

    const fileInputEl = $('fileInput');
    if (fileInputEl) fileInputEl.addEventListener('change', async e => {
        for (const f of e.target.files) await uploadFile(f);
        e.target.value = '';
    });

    bind('audio', recordAudioNota);
    bind('voiceBot', grabarVozParaBot);
    bind('backBtn', cerrarConversacion);

    bind('searchChat', buscarEnConversacion);

    bind('newChat', onNuevoClick);
    bind('closeModal', () => $('newModal')?.classList.remove('show'));
    bindClickFondo('newModal', () => $('newModal')?.classList.remove('show'));

    const userSearchEl = $('userSearch');
    if (userSearchEl) userSearchEl.addEventListener('input', e => searchUsers(e.target.value));

    const searchConvEl = $('searchConversations');
    if (searchConvEl) searchConvEl.addEventListener('input', e => { conversationFilter = e.target.value; aplicarFiltroConversaciones(); });

    const messagesEl = $('messages');
    if (messagesEl) {
        messagesEl.addEventListener('scroll', detectarSiEstaAbajo);
        messagesEl.addEventListener('click', e => {
            const img = e.target.closest && e.target.closest('img[data-visor]');
            if (img) abrirVisorImagen(img.dataset.src, img.dataset.nombre);
        });
    }
    bind('scrollDownBtn', () => { isUserAtBottom = true; scrollToBottom(true); actualizarFlecha(); });

    bind('btnConfigLlamadas', abrirModalConfigLlamadas);
    bind('closeModalConfig', cerrarModalConfigLlamadas);
    bindClickFondo('modalConfigLlamadas', cerrarModalConfigLlamadas);
    bind('btnVerBloqueados', abrirListaBloqueados);
    bind('closeModalBloqueados', () => { const m = $('modalBloqueados'); if (m) m.classList.remove('show'); });
    bindClickFondo('modalBloqueados', () => { const m = $('modalBloqueados'); if (m) m.classList.remove('show'); });

    bind('closeModalCanal', cerrarModalCrearCanal);
    bindClickFondo('modalCrearCanal', cerrarModalCrearCanal);
    bind('closeModalGrupo', cerrarModalCrearGrupo);
    bindClickFondo('modalCrearGrupo', cerrarModalCrearGrupo);

    if (typeof window.inicializarTecladoEmojis === 'function') {
        window.inicializarTecladoEmojis('messageInput', 'emojiBtn');
    }

    enlazarBotonesLlamada();

    document.addEventListener('keydown', e => {
        if (e.key === ' ' && $('estadoViewer')?.classList.contains('show')) {
            e.preventDefault();
            if (estadoPausado) desactivarPausaEstado(); else activarPausaEstado();
        }
        if (e.key === 'Escape') {
            cerrarProfileModal();
            cerrarPhotoViewer();
            cerrarEstadoViewer();
            cerrarModalEstado();
            cerrarVistasModal();
            cerrarModalCrearCanal();
            cerrarModalCrearGrupo();
            const nm = $('newModal'); if (nm) nm.classList.remove('show');
            const mc = $('modalConfigLlamadas'); if (mc) mc.classList.remove('show');
            const mb = $('modalBloqueados'); if (mb) mb.classList.remove('show');
        }
    });
}

/* ---------------- Búsqueda dentro de la conversación ---------------- */

async function buscarEnConversacion() {
    if (!current) { toast('Selecciona una conversación.', 'error'); return; }
    if (current.bot) { toast('Marquinhos todavía no tiene búsqueda en el chat.', 'warning'); return; }
    const q = await NeonModal.prompt({
        title: 'Buscar en la conversación',
        message: 'Escribe el texto que quieres encontrar:',
        placeholder: 'Texto a buscar',
        confirmText: 'Buscar',
        cancelText: 'Cancelar'
    });
    if (!q || !q.trim()) return;
    const r = await db.from('mensajes_chat')
        .select('*')
        .eq('eliminado', false)
        .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${current.id}),and(remitente_id.eq.${current.id},destinatario_id.eq.${user.id})`)
        .ilike('contenido', '%' + q.trim() + '%')
        .order('created_at', { ascending: true });
    if (r.error) { toast('Error al buscar.', 'error'); return; }
    if (!r.data || !r.data.length) {
        toast('No se encontraron mensajes con ese texto.', 'warning');
        return;
    }
    await renderMessages(r.data);
}

/* ---------------- Init principal ---------------- */

async function init() {
    try { db = await window.supabaseReady; } catch (e) { db = null; }
    if (!db) db = window.supabaseClient;
    if (!db) {
        toast('No se pudo conectar a Supabase. Revisa tu conexión.', 'error');
        console.error('[Mensajes] No hay cliente Supabase disponible.');
        return;
    }

    try {
        const s = await session();
        if (s?.user) user = s.user;
    } catch (e) { console.warn('Error cargando sesión:', e); }

    const callBtn = $('videoCall');
    if (!window.__livekitReady && window.LivekitClient) window.__livekitReady = true;
    if (callBtn) callBtn.disabled = !window.__livekitReady;
    const audioBtn = $('audioCall');
    if (audioBtn) audioBtn.disabled = !window.__livekitReady;

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

    window.addEventListener('livekit:ready', () => {
        window.__livekitReady = true;
        const b = $('videoCall'); if (b) b.disabled = false;
        const a = $('audioCall'); if (a) a.disabled = false;
    });
    window.addEventListener('livekit:error', () => {
        window.__livekitReady = false;
        const b = $('videoCall'); if (b) b.disabled = true;
        const a = $('audioCall'); if (a) a.disabled = true;
        toast('Las llamadas no están disponibles en este dispositivo.', 'warning');
    });

    enlazarBotonesUI();

    if (user && user.id) {
        db.channel('incoming-calls').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'llamadas', filter: `destinatario_id=eq.${user.id}` }, p => {
            if (user && p.new.estado === 'ringing') incoming(p.new);
        }).subscribe();
    }

    setInterval(() => { if (document.hidden) return; cargarEstados(); }, 10 * 60 * 1000);

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
                                confirmText: 'Llamar',
                                cancelText: 'Cancelar'
                            });
                            if (ok) {
                                try { await startCall('video'); }
                                catch (e) { console.error('[Llamadas] Error en inicio automático:', e); }
                            }
                        }, 1000);
                    }
                } catch (e) { console.error('[Mensajes] Error al abrir conversación desde URL:', e); }
            }, 800);
        }

        if (usuarioParam || accionParam) {
            urlObj.searchParams.delete('usuario');
            urlObj.searchParams.delete('accion');
            try { window.history.replaceState({}, '', urlObj.pathname + urlObj.search + urlObj.hash); }
            catch (e) { console.warn('No se pudo limpiar la URL:', e); }
        }
    }

    configurarLongPressMensajes();

    setTimeout(async () => {
        try { if (typeof window.inicializarIdiomas === 'function') await window.inicializarIdiomas(); }
        catch (e) { console.warn('Error aplicando idiomas:', e); }
    }, 500);
}

/* ---------------- Push y service worker ---------------- */

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
                keys: {
                    p256dh: btoa(String.fromCharCode(...new Uint8Array(suscripcion.getKey('p256dh')))),
                    auth: btoa(String.fromCharCode(...new Uint8Array(suscripcion.getKey('auth'))))
                },
                device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
            })
        });
        const dataSub = await resSub.json();
        if (dataSub.success) console.log('[Push] Suscripción guardada correctamente.');
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
        if (data.tipo !== 'notificacion_click' || !data.llamadaId) return;

        if (data.accion === 'reject') {
            llamadaFetch(`/api/llamadas/${encodeURIComponent(data.llamadaId)}/terminar`, { motivo: 'rechazada_desde_notificacion' })
                .then(() => toast('Llamada rechazada.', 'warning'))
                .catch(e => console.warn('[Llamadas] rechazo desde notificación:', e.code || e.message));
            return;
        }

        if (data.accion === 'accept' && !call.active) {
            db.from('llamadas').select('*').eq('id', data.llamadaId).maybeSingle().then(({ data: llamada }) => {
                if (llamada && llamada.estado === 'ringing') {
                    incoming(llamada);
                    setTimeout(() => { if (incomingId === llamada.id) acceptCall(); }, 500);
                }
            });
        }
    });
}

/* ---------------- Exposición global ---------------- */

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

window.cargarEstados = cargarEstados;
window.abrirEstadoUsuario = abrirEstadoUsuario;
window.cerrarEstadoViewer = cerrarEstadoViewer;
window.eliminarHistoriaMensajes = eliminarHistoriaMensajes;
window.comentarHistoriaMensajes = comentarHistoriaMensajes;
window.saltarGrupoMensajes = saltarGrupoMensajes;
window.abrirPanelEstado = abrirPanelEstado;
window.abrirVistasModal = abrirVistasModal;

window.startCall = startCall;
window.acceptCall = acceptCall;
window.endCall = finalizarLlamadaLocal;
window.cancelCall = finalizarLlamadaLocal;

Object.defineProperty(window, 'current', {
    get: function () { return current; },
    configurable: true
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase?.createClient) init();
    else toast('No se pudo cargar Supabase.', 'error');
});