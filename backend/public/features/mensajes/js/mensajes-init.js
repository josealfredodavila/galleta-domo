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

    if (!window.supabase || !window.supabase.createClient) {
        console.warn('[Mensajes] Supabase no está listo. Reintentando...');
        setTimeout(init, 500);
        return;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 10 } }
    });
    window.supabaseClient = db;

    try {
        var s = await session();
        if (s && s.user) user = s.user;
    } catch (e) { console.warn('Error cargando sesión:', e); }

    // ---- Cargar datos iniciales ----
    await cargarFotoHeader();
    await loadConversations();
    await cargarEstados();

    // ================================================================
    // ✅ NUEVO: Configurar pestañas y botón "+" dinámico
    // ================================================================
    // Sobreescribir el botón "+" para que sea dinámico según la pestaña
    var fab = document.getElementById('newChat');
    if (fab) {
        fab.onclick = onNuevoClick;
    }

    // Cerrar modales de canal/grupo al hacer clic fuera
    var modalCanal = document.getElementById('modalCrearCanal');
    if (modalCanal) {
        modalCanal.addEventListener('click', function(e) {
            if (e.target.id === 'modalCrearCanal') cerrarModalCrearCanal();
        });
    }
    var modalGrupo = document.getElementById('modalCrearGrupo');
    if (modalGrupo) {
        modalGrupo.addEventListener('click', function(e) {
            if (e.target.id === 'modalCrearGrupo') cerrarModalCrearGrupo();
        });
    }

    // Cerrar modales de canal/grupo con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarModalCrearCanal();
            cerrarModalCrearGrupo();
        }
    });
    // ================================================================

    // ---- Detectar cambios de sesión ----
    db.auth.onAuthStateChange(function(event, s) {
        user = (s && s.user) || null;
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            loadConversations();
            cargarFotoHeader();
            cargarEstados();
        }
    });

    // ---- Setup de modales y botones del perfil ----
    var headerAvatar = $('headerAvatar'); if (headerAvatar) headerAvatar.onclick = abrirProfileModal;
    var avatarInput = $('avatarInput'); if (avatarInput) avatarInput.addEventListener('change', subirFotoHeader);
    var btnCambiarFoto = $('btnCambiarFoto'); if (btnCambiarFoto) btnCambiarFoto.onclick = function() { var ai = $('avatarInput'); if (ai) ai.click(); };
    var btnCerrarProfileModal = $('btnCerrarProfileModal'); if (btnCerrarProfileModal) btnCerrarProfileModal.onclick = cerrarProfileModal;
    var profileModal = $('profileModal'); if (profileModal) profileModal.addEventListener('click', function(e) { if (e.target.id === 'profileModal') cerrarProfileModal(); });

    // ---- Modales de estados ----
    var closeVistasModal = $('closeVistasModal'); if (closeVistasModal) closeVistasModal.onclick = cerrarVistasModal;
    var vistasModal = $('vistasModal'); if (vistasModal) vistasModal.addEventListener('click', function(e) { if (e.target.id === 'vistasModal') cerrarVistasModal(); });
    var pvClose = $('pvClose'); if (pvClose) pvClose.onclick = cerrarPhotoViewer;
    var photoViewer = $('photoViewer'); if (photoViewer) photoViewer.addEventListener('click', function(e) { if (e.target.id === 'photoViewer') cerrarPhotoViewer(); });
    var evClose = $('evClose'); if (evClose) evClose.onclick = cerrarEstadoViewer;
    var evPrev = $('evPrev'); if (evPrev) evPrev.onclick = function(e) { e.stopPropagation(); anteriorEstado(); };
    var evNext = $('evNext'); if (evNext) evNext.onclick = function(e) { e.stopPropagation(); siguienteEstado(); };
    var evVistas = $('evVistas'); if (evVistas) evVistas.onclick = function(e) { e.stopPropagation(); var id = evVistas.dataset.estadoId; if (id) abrirVistasModal(id); };

    var evBody = $('evBody');
    if (evBody) {
        evBody.addEventListener('mousedown', activarPausaEstado);
        evBody.addEventListener('mouseup', desactivarPausaEstado);
        evBody.addEventListener('mouseleave', desactivarPausaEstado);
        evBody.addEventListener('touchstart', function(e) { e.preventDefault(); activarPausaEstado(); }, { passive: false });
        evBody.addEventListener('touchend', function(e) { e.preventDefault(); desactivarPausaEstado(); }, { passive: false });
        evBody.addEventListener('touchcancel', desactivarPausaEstado);
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === ' ') {
            var viewer = $('estadoViewer');
            if (viewer && viewer.classList.contains('show')) {
                e.preventDefault();
                if (estadoPausado) desactivarPausaEstado(); else activarPausaEstado();
            }
        }
    });

    // ---- Modal subir estado ----
    var btnSubirEstado = $('btnSubirEstado'); if (btnSubirEstado) btnSubirEstado.onclick = abrirModalEstado;
    var closeEstadoModal = $('closeEstadoModal'); if (closeEstadoModal) closeEstadoModal.onclick = cerrarModalEstado;
    var btnSeleccionarEstado = $('btnSeleccionarEstado'); if (btnSeleccionarEstado) btnSeleccionarEstado.onclick = seleccionarArchivoEstado;
    var estadoFileInput = $('estadoFileInput'); if (estadoFileInput) estadoFileInput.addEventListener('change', previewEstado);
    var btnPublicarEstado = $('btnPublicarEstado'); if (btnPublicarEstado) btnPublicarEstado.onclick = publicarEstado;
    var estadoUploadModal = $('estadoUploadModal'); if (estadoUploadModal) estadoUploadModal.addEventListener('click', function(e) { if (e.target.id === 'estadoUploadModal') cerrarModalEstado(); });

    // ---- Escape global ----
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarProfileModal();
            cerrarPhotoViewer();
            cerrarEstadoViewer();
            cerrarModalEstado();
            cerrarVistasModal();
            var nm = $('newModal'); if (nm) nm.classList.remove('show');
        }
    });

    // ---- Composer ----
    var composer = $('composer');
    if (composer) {
        composer.addEventListener('submit', function(e) {
            e.preventDefault();
            var input = $('messageInput');
            if (input) sendMessage(input.value);
        });
    }

    // ---- Nueva conversación (modal) ----
    var closeModal = $('closeModal'); if (closeModal) closeModal.onclick = function() { var nm = $('newModal'); if (nm) nm.classList.remove('show'); };
    var newModal = $('newModal'); if (newModal) newModal.addEventListener('click', function(e) { if (e.target.id === 'newModal') newModal.classList.remove('show'); });
    var userSearch = $('userSearch'); if (userSearch) userSearch.addEventListener('input', function(e) { searchUsers(e.target.value); });

    // ---- Buscador de conversaciones (solo pestaña Chats) ----
    var searchConversations = $('searchConversations');
    if (searchConversations) {
        searchConversations.addEventListener('input', function(e) {
            conversationFilter = e.target.value;
            aplicarFiltroConversaciones();
        });
    }

    // ---- Botones de adjuntar archivos ----
    var attach = $('attach');
    if (attach) {
        attach.onclick = function() {
            if (current && current.bot) {
                toast('Para Marquinhos usa el botón ✦', 'error');
                return;
            }
            var fi = $('fileInput');
            if (fi) fi.click();
        };
    }

    var fileInput = $('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async function(e) {
            for (var i = 0; i < e.target.files.length; i++) {
                await uploadFile(e.target.files[i]);
            }
            e.target.value = '';
        });
    }

    var audio = $('audio'); if (audio) audio.onclick = recordAudioNota;
    var voiceBot = $('voiceBot'); if (voiceBot) voiceBot.onclick = grabarVozParaBot;

    // ---- Acciones de conversación ----
    var deleteChat = $('deleteChat'); if (deleteChat) deleteChat.onclick = deleteConversation;
    var videoCall = $('videoCall'); if (videoCall) videoCall.onclick = startCall;
    var backBtn = $('backBtn'); if (backBtn) backBtn.onclick = cerrarConversacion;

    // ---- Controles de llamada ----
    var hangupBtn = $('hangup'); if (hangupBtn) hangupBtn.onclick = hangup;
    var toggleMicBtn = $('toggleMic'); if (toggleMicBtn) toggleMicBtn.onclick = toggleMic;
    var toggleCamBtn = $('toggleCam'); if (toggleCamBtn) toggleCamBtn.onclick = toggleCam;
    var toggleScreenBtn = $('toggleScreen'); if (toggleScreenBtn) toggleScreenBtn.onclick = toggleScreen;
    var acceptCallBtn = $('acceptCall'); if (acceptCallBtn) acceptCallBtn.onclick = acceptCall;
    var rejectCallBtn = $('rejectCall'); if (rejectCallBtn) rejectCallBtn.onclick = rejectCall;

    // ---- Scroll del chat ----
    var messagesBox = $('messages');
    if (messagesBox) messagesBox.addEventListener('scroll', detectarSiEstaAbajo);

    var scrollDownBtn = $('scrollDownBtn');
    if (scrollDownBtn) {
        scrollDownBtn.onclick = function() {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
    }

    // ---- Buscar en el chat ----
    var searchChatBtn = $('searchChat');
    if (searchChatBtn) {
        searchChatBtn.onclick = async function() {
            if (!current) { toast('Selecciona una conversación', 'error'); return; }
            if (current.bot) { toast('Marquinhos no tiene búsqueda local aún', 'warning'); return; }
            var q = prompt('Buscar en la conversación:');
            if (!q || !q.trim()) return;
            try {
                var r = await db.from('mensajes_chat')
                    .select('*')
                    .eq('eliminado', false)
                    .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + current.id + '),and(remitente_id.eq.' + current.id + ',destinatario_id.eq.' + user.id + ')')
                    .ilike('contenido', '%' + q.trim() + '%')
                    .order('created_at', { ascending: true });
                if (r.error) { toast('Error al buscar', 'error'); return; }
                await renderMessages(r.data || []);
            } catch (e) { console.error('Error buscando en chat:', e); }
        };
    }

    // ---- Suscripción a llamadas entrantes ----
    db.channel('incoming-calls')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'llamadas' }, function(p) {
            if (user && p.new.destinatario_id === user.id && p.new.estado === 'ringing') {
                incoming(p.new);
            }
        })
        .subscribe();

    // ---- Refresco periódico de estados ----
    setInterval(function() {
        limpiarVistosAntiguos();
        cargarEstados();
    }, 5 * 60 * 1000);

    // ---- Idiomas ----
    setTimeout(async function() {
        try {
            if (typeof window.inicializarIdiomas === 'function') {
                await window.inicializarIdiomas();
                console.log('✅ Idiomas aplicados');
            }
        } catch (e) {
            console.warn('⚠️ Error idiomas:', e);
        }
    }, 500);

    console.log('◈ Mensajes inicializado correctamente ✅');
}

// ================================================================
// EXPOSICIÓN GLOBAL A WINDOW
// ================================================================

// ---- Utils ----
window.toast = toast;
window.esc = esc;
window.haceTiempo = haceTiempo;

// ---- Auth ----
window.cargarFotoHeader = cargarFotoHeader;
window.abrirProfileModal = abrirProfileModal;
window.cerrarProfileModal = cerrarProfileModal;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarPhotoViewer = cerrarPhotoViewer;

// ---- Conversaciones ----
window.loadConversations = loadConversations;
window.newConversation = newConversation;
window.cerrarModalNuevaConversacion = cerrarModalNuevaConversacion;
window.deleteConversation = deleteConversation;
window.openConversation = openConversation;
window.cerrarConversacion = cerrarConversacion;

// ---- Chat ----
window.sendMessage = sendMessage;
window.markRead = markRead;

// ---- Archivos ----
window.uploadFile = uploadFile;
window.recordAudioNota = recordAudioNota;

// ---- Bot ----
window.grabarVozParaBot = grabarVozParaBot;
window.enviarVozAlBot = enviarVozAlBot;

// ---- Estados ----
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

// ---- Canales y Grupos (NUEVO) ----
window.cambiarPestana = cambiarPestana;
window.onNuevoClick = onNuevoClick;
window.buscarCanalesDebounce = buscarCanalesDebounce;
window.buscarGruposDebounce = buscarGruposDebounce;
window.cargarCanales = cargarCanales;
window.cargarGrupos = cargarGrupos;
window.abrirCanalOGrupo = abrirCanalOGrupo;
window.abrirModalCrearCanal = abrirModalCrearCanal;
window.cerrarModalCrearCanal = cerrarModalCrearCanal;
window.abrirModalCrearGrupo = abrirModalCrearGrupo;
window.cerrarModalCrearGrupo = cerrarModalCrearGrupo;
window.crearCanal = crearCanal;
window.crearGrupo = crearGrupo;

// ---- Llamadas ----
window.startCall = startCall;
window.acceptCall = acceptCall;
window.rejectCall = rejectCall;
window.hangup = hangup;
window.toggleMic = toggleMic;
window.toggleCam = toggleCam;
window.toggleScreen = toggleScreen;

// ---- Config ----
window.supabaseClient = db;

// ================================================================
// ARRANQUE (cuando el DOM esté listo)
// ================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (window.supabase && window.supabase.createClient) {
            init();
        } else {
            console.warn('[Mensajes] Esperando SDK de Supabase...');
            setTimeout(function() {
                if (window.supabase && window.supabase.createClient) init();
                else toast('No se pudo cargar Supabase', 'error');
            }, 1000);
        }
    });
} else {
    if (window.supabase && window.supabase.createClient) {
        init();
    } else {
        console.warn('[Mensajes] Esperando SDK de Supabase...');
        setTimeout(function() {
            if (window.supabase && window.supabase.createClient) init();
            else toast('No se pudo cargar Supabase', 'error');
        }, 1000);
    }
}