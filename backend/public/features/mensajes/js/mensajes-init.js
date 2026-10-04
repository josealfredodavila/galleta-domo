// ================================================================
// MENSAJES · INICIALIZACIÓN
// ================================================================
// Arranque del módulo, listeners globales, exposición a window.
// Depende de: TODOS los archivos anteriores.
// ================================================================

// ================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================
async function init() {
    console.log('◈ Mensajes inicializando...');

    // Esperar a que Supabase esté listo
    if (!db) {
        console.warn('[Mensajes] Supabase no está listo. Reintentando...');
        setTimeout(init, 500);
        return;
    }

    // ---- 1. Cargar sesión actual ----
    try {
        var s = await session();
        if (s && s.user) user = s.user;
    } catch (e) {
        console.warn('Error cargando sesión:', e);
    }

    // ---- 2. Cargar datos iniciales ----
    await cargarFotoHeader();
    await loadConversations();
    await cargarEstados();

    // ---- 3. Detectar cambios de sesión ----
    db.auth.onAuthStateChange(function(event, s) {
        user = (s && s.user) || null;
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            loadConversations();
            cargarFotoHeader();
            cargarEstados();
        }
    });

    // ---- 4. Setup de modales y botones ----
    setupProfileModal();
    setupClickFuera();
    setupBotonesCerrar();
    setupEstadoViewerBotones();
    setupSubirEstado();
    setupEscape();

    // ---- 5. Composer (formulario de envío) ----
    var composer = $('composer');
    if (composer) {
        composer.addEventListener('submit', function(e) {
            e.preventDefault();
            var input = $('messageInput');
            if (input) sendMessage(input.value);
        });
    }

    // ---- 6. Nueva conversación ----
    var newChatBtn = $('newChat');
    if (newChatBtn) newChatBtn.onclick = newConversation;

    var userSearch = $('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', function(e) {
            searchUsers(e.target.value);
        });
    }

    // ---- 7. Filtro de conversaciones ----
    var searchConversations = $('searchConversations');
    if (searchConversations) {
        searchConversations.addEventListener('input', function(e) {
            conversationFilter = e.target.value;
            aplicarFiltroConversaciones();
        });
    }

    // ---- 8. Botones de adjuntar / audio / bot ----
    var attachBtn = $('attach');
    if (attachBtn) {
        attachBtn.onclick = function() {
            if (current && current.bot) {
                toast('⚠️ Para Marquinhos usa el botón 🔊', 'error');
                return;
            }
            var fileInput = $('fileInput');
            if (fileInput) fileInput.click();
        };
    }

    var fileInput = $('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async function(e) {
            var files = e.target.files;
            for (var i = 0; i < files.length; i++) {
                await uploadFile(files[i]);
            }
            e.target.value = '';
        });
    }

    var audioBtn = $('audio');
    if (audioBtn) audioBtn.onclick = recordAudioNota;

    var voiceBotBtn = $('voiceBot');
    if (voiceBotBtn) voiceBotBtn.onclick = grabarVozParaBot;

    // ---- 9. Acciones de la conversación ----
    var deleteChatBtn = $('deleteChat');
    if (deleteChatBtn) deleteChatBtn.onclick = deleteConversation;

    var videoCallBtn = $('videoCall');
    if (videoCallBtn) videoCallBtn.onclick = startCall;

    var backBtn = $('backBtn');
    if (backBtn) backBtn.onclick = cerrarConversacion;

    // ---- 10. Controles de llamada ----
    var hangupBtn = $('hangup');
    if (hangupBtn) hangupBtn.onclick = hangup;

    var toggleMicBtn = $('toggleMic');
    if (toggleMicBtn) toggleMicBtn.onclick = toggleMic;

    var toggleCamBtn = $('toggleCam');
    if (toggleCamBtn) toggleCamBtn.onclick = toggleCam;

    var toggleScreenBtn = $('toggleScreen');
    if (toggleScreenBtn) toggleScreenBtn.onclick = toggleScreen;

    var acceptCallBtn = $('acceptCall');
    if (acceptCallBtn) acceptCallBtn.onclick = acceptCall;

    var rejectCallBtn = $('rejectCall');
    if (rejectCallBtn) rejectCallBtn.onclick = rejectCall;

    // ---- 11. Scroll del chat ----
    var messagesBox = $('messages');
    if (messagesBox) {
        messagesBox.addEventListener('scroll', detectarSiEstaAbajo);
    }

    var scrollDownBtn = $('scrollDownBtn');
    if (scrollDownBtn) {
        scrollDownBtn.onclick = function() {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
    }

    // ---- 12. Buscar en el chat ----
    var searchChatBtn = $('searchChat');
    if (searchChatBtn) {
        searchChatBtn.onclick = async function() {
            if (!current) {
                toast('⚠️ Selecciona una conversación', 'error');
                return;
            }
            if (current.bot) {
                toast('ℹ️ Marquinhos no tiene búsqueda local aún', 'warning');
                return;
            }

            var q = prompt('🔍 Buscar en la conversación:');
            if (!q || !q.trim()) return;

            try {
                var r = await db
                    .from('mensajes_chat')
                    .select('*')
                    .eq('eliminado', false)
                    .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + current.id + '),and(remitente_id.eq.' + current.id + ',destinatario_id.eq.' + user.id + ')')
                    .ilike('contenido', '%' + q.trim() + '%')
                    .order('created_at', { ascending: true });

                if (r.error) {
                    toast('❌ Error al buscar', 'error');
                    return;
                }
                await renderMessages(r.data || []);
            } catch (e) {
                console.error('Error buscando en chat:', e);
            }
        };
    }

    // ---- 13. Suscribirse a llamadas entrantes ----
    suscribirseALLamadasEntrantes();

    // ---- 14. Refresco periódico de estados ----
    setInterval(function() {
        limpiarVistosAntiguos();
        cargarEstados();
    }, 5 * 60 * 1000);

    // ---- 15. Idiomas ----
    setTimeout(async function() {
        try {
            if (typeof window.inicializarIdiomas === 'function') {
                await window.inicializarIdiomas();
                console.log('✅ Idiomas aplicados a mensajes');
            }
        } catch (e) {
            console.warn('⚠️ Error aplicando idiomas:', e);
        }
    }, 500);

    console.log('◈ Mensajes inicializado correctamente ✅');
}

// ================================================================
// EXPOSICIÓN GLOBAL A WINDOW
// ================================================================

// Utils
window.toast = toast;
window.esc = esc;
window.haceTiempo = haceTiempo;

// Auth
window.cargarFotoHeader = cargarFotoHeader;
window.abrirProfileModal = abrirProfileModal;
window.cerrarProfileModal = cerrarProfileModal;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarPhotoViewer = cerrarPhotoViewer;

// Conversaciones
window.loadConversations = loadConversations;
window.newConversation = newConversation;
window.cerrarModalNuevaConversacion = cerrarModalNuevaConversacion;
window.deleteConversation = deleteConversation;
window.openConversation = openConversation;
window.cerrarConversacion = cerrarConversacion;

// Chat
window.sendMessage = sendMessage;
window.markRead = markRead;
window.toggleComentarios = toggleComentarios;

// Archivos
window.uploadFile = uploadFile;
window.recordAudioNota = recordAudioNota;

// Bot
window.grabarVozParaBot = grabarVozParaBot;
window.enviarVozAlBot = enviarVozAlBot;

// Estados
window.cargarEstados = cargarEstados;
window.abrirEstadoUsuario = abrirEstadoUsuario;
window.cerrarEstadoViewer = cerrarEstadoViewer;
window.abrirVistasModal = abrirVistasModal;
window.cerrarVistasModal = cerrarVistasModal;
window.abrirModalEstado = abrirModalEstado;
window.cerrarModalEstado = cerrarModalEstado;
window.seleccionarArchivoEstado = seleccionarArchivoEstado;
window.previewEstado = previewEstado;
window.publicarEstado = publicarEstado;
window.anteriorEstado = anteriorEstado;
window.siguienteEstado = siguienteEstado;

// Llamadas
window.startCall = startCall;
window.acceptCall = acceptCall;
window.rejectCall = rejectCall;
window.hangup = hangup;
window.toggleMic = toggleMic;
window.toggleCam = toggleCam;
window.toggleScreen = toggleScreen;

// Config
window.supabase = db;
window.supabaseClient = db;

// ================================================================
// ARRANQUE (cuando el DOM esté listo)
// ================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (window.supabase && window.supabase.createClient) {
            init();
        } else {
            toast('❌ No se pudo cargar Supabase', 'error');
        }
    });
} else {
    if (window.supabase && window.supabase.createClient) {
        init();
    } else {
        toast('❌ No se pudo cargar Supabase', 'error');
    }
}