// ================================================================
// MENSAJES · INIT v1.0 · MÓDULO 8 DE 8
// Ruta: backend/public/features/mensajes/js/mensajes-init.js
// Depende de: TODOS los módulos anteriores (core, scroll-media,
//             chats, bot, estados, canales, llamadas) y de
//             teclado-emojis.js (window.inicializarTecladoEmojis)
//             e idiomas.js (window.inicializarIdiomas).
// Contenido: variables de grabación y llamada entrante que no estaban
//            en core, foto del header, enlace de botones de la UI,
//            init() principal, auth listener, canal de llamadas
//            entrantes, push y service worker, parámetros de URL
//            (?usuario= y ?accion=llamada), decoración visual,
//            exposición global y arranque en DOMContentLoaded.
// NO cargar todavía en mensajes.html.
// ================================================================

'use strict';

// Variables que usan mensajes-chats.js y mensajes-llamadas.js.
// No se declararon en mensajes-core.js, por eso van aquí.
let recorder = null;
let audioChunks = [];
let recordingMode = null;
let recordingStartedAt = 0;
let incomingId = null;

// ================================================================
// FOTO DEL HEADER
// ================================================================
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

// ================================================================
// ENLACE DE BOTONES DE LA UI (las de llamada van en el módulo 7)
// ================================================================
function enlazarBotonesUI() {
    const bind = (id, fn, ev = 'onclick') => { const el = $(id); if (el) el[ev] = fn; };
    const bindChange = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', fn); };
    const bindClickFondo = (modalId, cerrar) => {
        const el = $(modalId);
        if (el) el.addEventListener('click', e => { if (e.target.id === modalId) cerrar(); });
    };

    // Perfil y foto
    bind('headerAvatar', abrirProfileModal);
    bindChange('avatarInput', subirFotoHeader);
    bind('btnCambiarFoto', () => $('avatarInput')?.click());
    bind('btnCerrarProfileModal', cerrarProfileModal);
    bindClickFondo('profileModal', cerrarProfileModal);

    // Vistas
    bind('closeVistasModal', cerrarVistasModal);
    bindClickFondo('vistasModal', cerrarVistasModal);

    // Visor de foto
    bind('pvClose', cerrarPhotoViewer);
    bindClickFondo('photoViewer', cerrarPhotoViewer);

    // Visor de historias
    bind('evClose', cerrarEstadoViewer);
    bind('evPrev', (e) => { if (e) e.stopPropagation(); anteriorEstado(); });
    bind('evNext', (e) => { if (e) e.stopPropagation(); siguienteEstado(); });
    bind('evVistas', (e) => { if (e) e.stopPropagation(); const el = $('evVistas'); const estadoId = el?.dataset.estadoId; if (estadoId) abrirPanelEstado(estadoId, 'vistas'); });

    const evBody = $('evBody');
    if (evBody) {
        evBody.addEventListener('mousedown', activarPausaEstado);
        evBody.addEventListener('mouseup', desactivarPausaEstado);
        evBody.addEventListener('mouseleave', desactivarPausaEstado);
        evBody.addEventListener('touchstart', (e) => { e.preventDefault(); activarPausaEstado(); }, { passive: false });
        evBody.addEventListener('touchend', (e) => { e.preventDefault(); desactivarPausaEstado(); }, { passive: false });
        evBody.addEventListener('touchcancel', desactivarPausaEstado);
    }

    // Subir estado
    bind('btnSubirEstado', abrirModalEstado);
    bind('closeEstadoModal', cerrarModalEstado);
    bind('btnSeleccionarEstado', seleccionarArchivoEstado);
    bindChange('estadoFileInput', previewEstado);
    bind('btnPublicarEstado', publicarEstado);
    bindClickFondo('estadoUploadModal', cerrarModalEstado);

    // Chat
    const composerEl = $('composer');
    if (composerEl) composerEl.addEventListener('submit', e => { e.preventDefault(); sendMessage($('messageInput').value); });

    bind('attach', () => {
        if (current?.bot) { toast('⚠️ Para Marquinhos usa el botón 🔊', 'error'); return; }
        $('fileInput')?.click();
    });

    const fileInputEl = $('fileInput');
    if (fileInputEl) fileInputEl.addEventListener('change', async e => {
        for (const f of e.target.files) await uploadFile(f);
        e.target.value = '';
    });

    bind('audio', recordAudioNota);
    bind('voiceBot', grabarVozParaBot);
    bind('deleteChat', deleteConversation);
    bind('backBtn', cerrarConversacion);
    bind('blockUser', bloquearUsuarioActual);
    bind('searchChat', buscarEnConversacion);

    // Nueva conversación y búsqueda de usuarios
    bind('newChat', onNuevoClick);
    bind('closeModal', () => $('newModal')?.classList.remove('show'));
    bindClickFondo('newModal', () => $('newModal')?.classList.remove('show'));

    const userSearchEl = $('userSearch');
    if (userSearchEl) userSearchEl.addEventListener('input', e => searchUsers(e.target.value));

    const searchConvEl = $('searchConversations');
    if (searchConvEl) searchConvEl.addEventListener('input', e => { conversationFilter = e.target.value; aplicarFiltroConversaciones(); });

    // Scroll del chat
    const messagesEl = $('messages');
    if (messagesEl) {
        messagesEl.addEventListener('scroll', detectarSiEstaAbajo);
        messagesEl.addEventListener('click', e => {
            const img = e.target.closest && e.target.closest('img[data-visor]');
            if (img) abrirVisorImagen(img.dataset.src, img.dataset.nombre);
        });
    }
    bind('scrollDownBtn', () => { isUserAtBottom = true; scrollToBottom(true); actualizarFlecha(); });

    // Configuración de llamadas y bloqueados
    bind('btnConfigLlamadas', abrirModalConfigLlamadas);
    bind('closeModalConfig', cerrarModalConfigLlamadas);
    bindClickFondo('modalConfigLlamadas', cerrarModalConfigLlamadas);
    bind('btnVerBloqueados', abrirListaBloqueados);
    bind('closeModalBloqueados', () => { const m = $('modalBloqueados'); if (m) m.classList.remove('show'); });
    bindClickFondo('modalBloqueados', () => { const m = $('modalBloqueados'); if (m) m.classList.remove('show'); });

    // Canales y grupos
    bind('closeModalCanal', cerrarModalCrearCanal);
    bindClickFondo('modalCrearCanal', cerrarModalCrearCanal);
    bind('closeModalGrupo', cerrarModalCrearGrupo);
    bindClickFondo('modalCrearGrupo', cerrarModalCrearGrupo);

    // Teclado de emojis
    if (typeof window.inicializarTecladoEmojis === 'function') {
        window.inicializarTecladoEmojis('messageInput', 'emojiBtn');
    }

    // Llamadas (botones de la pantalla de llamada y videollamada)
    enlazarBotonesLlamada();

    // Teclas globales
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

// Búsqueda dentro de la conversación (antes inline en init)
async function buscarEnConversacion() {
    if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
    if (current.bot) { toast('ℹ️ Marquinhos no tiene búsqueda local aún', 'warning'); return; }
    const q = await NeonModal.prompt({ title: 'Buscar en la conversación', message: 'Escribe el texto que quieres encontrar:', icon: '🔍', placeholder: 'Texto a buscar…', confirmText: 'Buscar', cancelText: 'Cancelar' });
    if (!q || !q.trim()) return;
    const r = await db.from('mensajes_chat').select('*').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${current.id}),and(remitente_id.eq.${current.id},destinatario_id.eq.${user.id})`).ilike('contenido', '%' + q.trim() + '%').order('created_at', { ascending: true });
    if (r.error) { toast('❌ Error al buscar', 'error'); return; }
    await renderMessages(r.data || []);
}

// ================================================================
// INIT PRINCIPAL
// ================================================================
async function init() {
    try { db = await window.supabaseReady; } catch (e) { db = null; }
    if (!db) db = window.supabaseClient;
    if (!db) { toast('❌ No se pudo conectar a Supabase. Revisa tu conexión.', 'error'); console.error('[Mensajes] No hay cliente Supabase disponible.'); return; }

    try {
        const s = await session();
        if (s?.user) user = s.user;
    } catch (e) { console.warn('Error cargando sesión:', e); }

    const callBtn = $('videoCall');
    if (!window.__livekitReady && window.LivekitClient) window.__livekitReady = true;
    if (callBtn) callBtn.disabled = !window.__livekitReady;

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
    });
    window.addEventListener('livekit:error', () => {
        window.__livekitReady = false;
        const b = $('videoCall'); if (b) b.disabled = true;
        toast('⚠️ Las llamadas no están disponibles en este dispositivo.', 'warning');
    });

    enlazarBotonesUI();

    // Llamadas entrantes en tiempo real
    if (user && user.id) {
        db.channel('incoming-calls').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'llamadas', filter: `destinatario_id=eq.${user.id}` }, p => {
            if (user && p.new.estado === 'ringing') incoming(p.new);
        }).subscribe();
    }

    // Refresco periódico de historias (solo si la pestaña está visible)
    setInterval(() => { if (document.hidden) return; cargarEstados(); }, 10 * 60 * 1000);

    registrarPushYServiceWorker().catch(err => console.warn('[Push] No se pudo registrar:', err));

    // Abrir conversación desde la URL: ?usuario=<id>&accion=llamada
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
                            const ok = await NeonModal.confirm({ title: 'Iniciar videollamada', message: '¿Quieres llamar a este usuario ahora?', icon: '📹', confirmText: 'Llamar', cancelText: 'Cancelar' });
                            if (ok) { try { await startCall('video'); } catch (e) { console.error('[Llamadas] Error en inicio automático:', e); } }
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

    decorarComposerWeb3();
    decorarSidebarTabsWeb3();
    decorarChatActions();
    configurarLongPressMensajes();

    setTimeout(async () => {
        try { if (typeof window.inicializarIdiomas === 'function') await window.inicializarIdiomas(); }
        catch (e) { console.warn('⚠️ Error aplicando idiomas:', e); }
    }, 500);
}

// ================================================================
// PUSH Y SERVICE WORKER
// ================================================================
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

// Acciones que llegan desde las notificaciones push (aceptar / rechazar llamada)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.tipo !== 'notificacion_click' || !data.llamadaId) return;

        if (data.accion === 'reject') {
            llamadaFetch(`/api/llamadas/${encodeURIComponent(data.llamadaId)}/terminar`, { motivo: 'rechazada_desde_notificacion' })
                .then(() => toast('📵 Llamada rechazada', 'warning'))
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

// ================================================================
// DECORACIÓN VISUAL (solo presentación, no cambia la lógica)
// ================================================================
function decorarComposerWeb3() {
    const composer = $('composer');
    if (!composer || composer.dataset.web3decorated) return;
    envolverBotonConLabel($('attach'), '◆', 'Adjuntar');
    envolverBotonConLabel($('audio'), '🎙️', 'Audio');
    envolverBotonConLabel($('voiceBot'), '🔊', 'Voz');
    const sendBtn = composer.querySelector('button[type="submit"]');
    if (sendBtn && !sendBtn.classList.contains('composer-send')) {
        sendBtn.classList.add('composer-send');
        sendBtn.innerHTML = '<span>Enviar</span><span style="font-size:.9rem;">➤</span>';
    }
    const input = $('messageInput');
    if (input && !input.placeholder) input.placeholder = 'Escribe un mensaje…';
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

function decorarSidebarTabsWeb3() {
    document.querySelectorAll('.sidebar-tab').forEach(tab => tab.setAttribute('role', 'tab'));
}

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

// ================================================================
// EXPOSICIÓN GLOBAL (para los onclick del HTML y para otros módulos)
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
window.openConversation = openConversation;
window.NeonModal = NeonModal;

// Historias
window.cargarEstados = cargarEstados;
window.abrirEstadoUsuario = abrirEstadoUsuario;
window.cerrarEstadoViewer = cerrarEstadoViewer;
window.eliminarHistoriaMensajes = eliminarHistoriaMensajes;
window.comentarHistoriaMensajes = comentarHistoriaMensajes;
window.saltarGrupoMensajes = saltarGrupoMensajes;
window.abrirPanelEstado = abrirPanelEstado;
window.abrirVistasModal = abrirVistasModal;

// Llamadas (ya expuestas en el módulo 7, se repiten aquí solo como referencia de contrato)
window.startCall = startCall;
window.acceptCall = acceptCall;
window.endCall = finalizarLlamadaLocal;
window.cancelCall = finalizarLlamadaLocal;

Object.defineProperty(window, 'current', {
    get: function () { return current; },
    configurable: true
});

window.NeonUI = {
    version: '5.9.4',
    decorarComposer: decorarComposerWeb3,
    decorarSidebarTabs: decorarSidebarTabsWeb3,
    decorarSidebarTabsWeb3: decorarSidebarTabsWeb3,
    decorarChatActions: decorarChatActions
};

// ================================================================
// ARRANQUE
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase?.createClient) init();
    else toast('❌ No se pudo cargar Supabase', 'error');
});