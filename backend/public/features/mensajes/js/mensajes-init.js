// ================================================================
// MENSAJES · INICIALIZACIÓN (CORREGIDO)
// ================================================================
// Arranque del módulo, listeners globales, exposición a window.
// Depende de: TODOS los archivos anteriores.
// ================================================================

// Flag para evitar doble init
var __mensajesIniciado = false;

// ================================================================
// ESPERAR SESIÓN (con fallback a onAuthStateChange)
// ================================================================
async function esperarSesion() {
    try {
        // 1) Intento rápido desde localStorage
        var s = await session();
        if (s && s.user) return s;

        // 2) Fallback: esperar el primer onAuthStateChange
        return await new Promise(function(resolve) {
            var resuelto = false;
            var timeout = setTimeout(function() {
                if (!resuelto) { resuelto = true; resolve(null); }
            }, 2000);

            var sub = db.auth.onAuthStateChange(function(event, sess) {
                if (resuelto) return;
                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    resuelto = true;
                    clearTimeout(timeout);
                    try { sub.data.subscription.unsubscribe(); } catch (e) {}
                    resolve(sess);
                }
            });
        });
    } catch (e) {
        console.warn('[Mensajes] Error esperando sesión:', e);
        return null;
    }
}

// ================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================
async function init() {
    if (__mensajesIniciado) {
        console.log('[Mensajes] Ya inicializado, se omite');
        return;
    }
    __mensajesIniciado = true;

    console.log('◈ Mensajes inicializando...');

    if (!window.supabase || !window.supabase.createClient) {
        console.warn('[Mensajes] Supabase no está listo. Reintentando...');
        __mensajesIniciado = false;
        setTimeout(init, 500);
        return;
    }

    // ---- Crear cliente ----
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'sariels-auth' // ⚠️ MISMA CLAVE QUE EL RESTO DE LA APP
        },
        realtime: { params: { eventsPerSecond: 10 } }
    });
    window.supabaseClient = db;

    // ---- Obtener sesión (con fallback robusto) ----
    var s = await esperarSesion();
    user = (s && s.user) || null;

    if (!user) {
        console.warn('[Mensajes] No hay sesión activa todavía');
    } else {
        console.log('[Mensajes] Sesión OK:', user.id);
    }

    // ---- Cargar datos iniciales (aunque user sea null, no rompe) ----
    await cargarFotoHeader();
    await loadConversations();
    await cargarEstados();

    // ================================================================
    // Configurar pestañas y botón "+" dinámico
    // ================================================================
    var fab = document.getElementById('newChat');
    if (fab) fab.onclick = onNuevoClick;

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

    // ================================================================
    // Detectar cambios de sesión
    // ================================================================
    db.auth.onAuthStateChange(function(event, s2) {
        var userAnterior = user;
        user = (s2 && s2.user) || null;

        if (event === 'SIGNED_IN' && !userAnterior) {
            console.log('[Mensajes] Sesión detectada tras init');
            loadConversations();
            cargarFotoHeader();
            cargarEstados();
        }
        if (event === 'SIGNED_OUT' && userAnterior) {
            console.log('[Mensajes] Sesión cerrada');
            loadConversations();
            cargarFotoHeader();
            cargarEstados();
        }
    });

    // ================================================================
    // Modales y botones del perfil
    // ================================================================
    var headerAvatar = $('headerAvatar'); if (headerAvatar) headerAvatar.onclick = abrirProfileModal;
    var avatarInput = $('avatarInput'); if (avatarInput) avatarInput.addEventListener('change', subirFotoHeader);
    var btnCambiarFoto = $('btnCambiarFoto'); if (btnCambiarFoto) btnCambiarFoto.onclick = function() { var ai = $('avatarInput'); if (ai) ai.click(); };
    var btnCerrarProfileModal = $('btnCerrarProfileModal'); if (btnCerrarProfileModal) btnCerrarProfileModal.onclick = cerrarProfileModal;
    var profileModal = $('profileModal'); if (profileModal) profileModal.addEventListener('click', function(e) { if (e.target.id === 'profileModal') cerrarProfileModal(); });

    // ================================================================
    // Modales de estados
    // ================================================================
    var closeVistasModal = $('closeVistasModal'); if (closeVistasModal) closeVistasModal.onclick = cerrarVistasModal;
    var vistasModal = $('vistasModal'); if (vistasModal) vistasModal.addEventListener('click', function(e) { if (e.target.id === 'vistasModal') cerrarVistasModal(); });
    var pvClose = $('pvClose'); if (pvClose) pvClose.onclick = cerrarPhotoViewer;
    var photoViewer = $('photoViewer'); if (photoViewer) photoViewer.addEventListener('click', function(e) { if (e.target.id === 'photoViewer') cerrarPhotoViewer(); });

    // Botón ✕ antiguo (por si acaso)
    var evClose = $('evClose'); if (evClose) evClose.onclick = cerrarEstadoViewer;

    // Botón ← nuevo (WhatsApp)
    var evBack = $('evBack'); if (evBack) evBack.onclick = cerrarEstadoViewer;

    // Botón ⋮ nuevo (WhatsApp)
    var evMenu = $('evMenu');
    if (evMenu) {
        evMenu.onclick = function(e) {
            e.stopPropagation();
            toast('ℹ️ Opciones próximamente', 'warning');
        };
    }

    // Botón Responder
    var evReply = $('evReply');
    if (evReply) {
        evReply.onclick = function(e) {
            e.stopPropagation();
            var estado = (typeof _estadosViewerActuales !== 'undefined' && _estadosViewerActuales[estadoActualIndex]) ? _estadosViewerActuales[estadoActualIndex] : null;
            if (!estado) return;
            var uid = estado.usuario_id;
            cerrarEstadoViewer();
            if (typeof abrirChat === 'function') {
                abrirChat(uid);
            } else if (typeof openConversation === 'function') {
                openConversation(uid);
            }
            setTimeout(function() {
                var input = $('messageInput');
                if (input) input.focus();
            }, 300);
        };
    }

    // Emojis rápidos
    var emojiBtns = document.querySelectorAll('.estado-viewer-emoji');
    emojiBtns.forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            var emoji = btn.dataset.emoji;
            var estado = (typeof _estadosViewerActuales !== 'undefined' && _estadosViewerActuales[estadoActualIndex]) ? _estadosViewerActuales[estadoActualIndex] : null;
            if (!estado) return;
            var uid = estado.usuario_id;
            cerrarEstadoViewer();
            if (typeof abrirChat === 'function') {
                abrirChat(uid);
            } else if (typeof openConversation === 'function') {
                openConversation(uid);
            }
            setTimeout(function() {
                var input = $('messageInput');
                if (input) {
                    input.value = emoji;
                    var form = $('composer');
                    if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            }, 350);
        };
    });

    // Zonas táctiles prev/next
    var evPrev = $('evPrev');
    if (evPrev) evPrev.onclick = function(e) { e.stopPropagation(); anteriorEstado(); };
    var evNext = $('evNext');
    if (evNext) evNext.onclick = function(e) { e.stopPropagation(); siguienteEstado(); };

    // Botón vistas (oculto pero por si acaso)
    var evVistas = $('evVistas');
    if (evVistas) evVistas.onclick = function(e) { e.stopPropagation(); var id = evVistas.dataset.estadoId; if (id) abrirVistasModal(id); };

    // Pausa al mantener pulsado (contenedor del visor)
    var viewerEstado = $('estadoViewer');
    if (viewerEstado) {
        viewerEstado.addEventListener('touchstart', function(e) {
            if (e.target.closest('.estado-viewer-header, .estado-viewer-footer, .estado-viewer-nav')) return;
            activarPausaEstado();
        }, { passive: true });
        viewerEstado.addEventListener('touchend', desactivarPausaEstado);
        viewerEstado.addEventListener('touchcancel', desactivarPausaEstado);
        viewerEstado.addEventListener('mousedown', function(e) {
            if (e.target.closest('.estado-viewer-header, .estado-viewer-footer, .estado-viewer-nav')) return;
            activarPausaEstado();
        });
        viewerEstado.addEventListener('mouseup', desactivarPausaEstado);
        viewerEstado.addEventListener('mouseleave', desactivarPausaEstado);
    }

    // Espacio pausa (desktop)
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space') {
            var viewer = $('estadoViewer');
            if (viewer && viewer.classList.contains('show')) {
                e.preventDefault();
                if (estadoPausado) desactivarPausaEstado(); else activarPausaEstado();
            }
        }
        if (e.code === 'ArrowRight') {
            var v2 = $('estadoViewer');
            if (v2 && v2.classList.contains('show')) siguienteEstado();
        }
        if (e.code === 'ArrowLeft') {
            var v3 = $('estadoViewer');
            if (v3 && v3.classList.contains('show')) anteriorEstado();
        }
    });
    document.addEventListener('keyup', function(e) {
        if (e.code === 'Space') desactivarPausaEstado();
    });

    // ================================================================
    // Modal subir estado
    // ================================================================
    var btnSubirEstado = $('btnSubirEstado'); if (btnSubirEstado) btnSubirEstado.onclick = abrirModalEstado;
    var closeEstadoModal = $('closeEstadoModal'); if (closeEstadoModal) closeEstadoModal.onclick = cerrarModalEstado;
    var btnSeleccionarEstado = $('btnSeleccionarEstado'); if (btnSeleccionarEstado) btnSeleccionarEstado.onclick = seleccionarArchivoEstado;
    var estadoFileInput = $('estadoFileInput'); if (estadoFileInput) estadoFileInput.addEventListener('change', previewEstado);
    var btnPublicarEstado = $('btnPublicarEstado'); if (btnPublicarEstado) btnPublicarEstado.onclick = publicarEstado;
    var estadoUploadModal = $('estadoUploadModal'); if (estadoUploadModal) estadoUploadModal.addEventListener('click', function(e) { if (e.target.id === 'estadoUploadModal') cerrarModalEstado(); });

    // ================================================================
    // Escape global
    // ================================================================
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarProfileModal();
            cerrarPhotoViewer();
            cerrarEstadoViewer();
            cerrarModalEstado();
            cerrarVistasModal();
            cerrarModalCrearCanal();
            cerrarModalCrearGrupo();
            var nm = $('newModal'); if (nm) nm.classList.remove('show');
        }
    });

    // ================================================================
    // Composer
    // ================================================================
    var composer = $('composer');
    if (composer) {
        composer.addEventListener('submit', function(e) {
            e.preventDefault();
            var input = $('messageInput');
            if (input) sendMessage(input.value);
        });
    }

    // ================================================================
    // Nueva conversación (modal)
    // ================================================================
    var closeModal = $('closeModal'); if (closeModal) closeModal.onclick = function() { var nm = $('newModal'); if (nm) nm.classList.remove('show'); };
    var newModal = $('newModal'); if (newModal) newModal.addEventListener('click', function(e) { if (e.target.id === 'newModal') newModal.classList.remove('show'); });
    var userSearch = $('userSearch'); if (userSearch) userSearch.addEventListener('input', function(e) { searchUsers(e.target.value); });

    // ================================================================
    // Buscador de conversaciones
    // ================================================================
    var searchConversations = $('searchConversations');
    if (searchConversations) {
        searchConversations.addEventListener('input', function(e) {
            conversationFilter = e.target.value;
            aplicarFiltroConversaciones();
        });
    }

    // ================================================================
    // Botones de adjuntar archivos
    // ================================================================
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

    // ================================================================
    // Acciones de conversación
    // ================================================================
    var deleteChat = $('deleteChat'); if (deleteChat) deleteChat.onclick = deleteConversation;
    var videoCall = $('videoCall'); if (videoCall) videoCall.onclick = startCall;
    var backBtn = $('backBtn'); if (backBtn) backBtn.onclick = cerrarConversacion;

    // ================================================================
    // Controles de llamada
    // ================================================================
    var hangupBtn = $('hangup'); if (hangupBtn) hangupBtn.onclick = hangup;
    var toggleMicBtn = $('toggleMic'); if (toggleMicBtn) toggleMicBtn.onclick = toggleMic;
    var toggleCamBtn = $('toggleCam'); if (toggleCamBtn) toggleCamBtn.onclick = toggleCam;
    var toggleScreenBtn = $('toggleScreen'); if (toggleScreenBtn) toggleScreenBtn.onclick = toggleScreen;
    var acceptCallBtn = $('acceptCall'); if (acceptCallBtn) acceptCallBtn.onclick = acceptCall;
    var rejectCallBtn = $('rejectCall'); if (rejectCallBtn) rejectCallBtn.onclick = rejectCall;

    // ================================================================
    // Scroll del chat
    // ================================================================
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

    // ================================================================
    // Buscar en el chat
    // ================================================================
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

    // ================================================================
    // Suscripción a llamadas entrantes
    // ================================================================
    db.channel('incoming-calls')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'llamadas' }, function(p) {
            if (user && p.new.destinatario_id === user.id && p.new.estado === 'ringing') {
                incoming(p.new);
            }
        })
        .subscribe();

    // ================================================================
    // Refresco periódico de estados
    // ================================================================
    setInterval(function() {
        limpiarVistosAntiguos();
        cargarEstados();
    }, 5 * 60 * 1000);

    // ================================================================
    // Idiomas
    // ================================================================
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
window.toast = toast;
window.esc = esc;
window.haceTiempo = haceTiempo;

window.cargarFotoHeader = cargarFotoHeader;
window.abrirProfileModal = abrirProfileModal;
window.cerrarProfileModal = cerrarProfileModal;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarPhotoViewer = cerrarPhotoViewer;

window.loadConversations = loadConversations;
window.newConversation = newConversation;
window.cerrarModalNuevaConversacion = cerrarModalNuevaConversacion;
window.deleteConversation = deleteConversation;
window.openConversation = openConversation;
window.cerrarConversacion = cerrarConversacion;

window.sendMessage = sendMessage;
window.markRead = markRead;

window.uploadFile = uploadFile;
window.recordAudioNota = recordAudioNota;

window.grabarVozParaBot = grabarVozParaBot;
window.enviarVozAlBot = enviarVozAlBot;

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

window.startCall = startCall;
window.acceptCall = acceptCall;
window.rejectCall = rejectCall;
window.hangup = hangup;
window.toggleMic = toggleMic;
window.toggleCam = toggleCam;
window.toggleScreen = toggleScreen;

window.supabaseClient = db;

// ================================================================
// ARRANQUE
// ================================================================
function arrancarMensajes() {
    if (!window.supabase || !window.supabase.createClient) {
        console.warn('[Mensajes] Esperando SDK de Supabase...');
        setTimeout(arrancarMensajes, 300);
        return;
    }
    init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancarMensajes);
} else {
    arrancarMensajes();
}