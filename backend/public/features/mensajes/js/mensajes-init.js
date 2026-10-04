// ================================================================
// MENSAJES · INICIALIZACIÓN
// ================================================================
// Arranque del módulo: listeners, verificación de módulos cargados,
// servicios globales, idiomas.
// Se carga AL FINAL, después de todos los archivos.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// ================================================================

'use strict';

// ================================================================
// PROMESA COMPARTIDA (evita doble init)
// ================================================================
var __initPromise = null;

// ================================================================
// VERIFICAR QUE LOS MÓDULOS CRÍTICOS ESTÉN CARGADOS
// ================================================================
function _modulosCriticosListos() {
    var obligatorias = [
        // auth
        'auth',
        'profile',
        'session',
        // conversaciones
        'loadConversations',
        'newConversation',
        'searchUsers',
        'createConversation',
        'deleteConversation',
        // chat
        'openConversation',
        'cerrarConversacion',
        'abrirConversacionBot',
        'renderMessages',
        'append',
        'sendMessage',
        'markRead',
        'scrollToBottom',
        'limpiarEstadoConversacion',
        'mostrarEmptyState',
        // bot
        'cargarHistorialParaBot',
        'preguntarAlBot',
        'grabarVozParaBot',
        'enviarVozAlBot',
        // archivos
        'uploadFile',
        'recordAudioNota',
        // estados
        'cargarEstados',
        'abrirEstadoUsuario',
        'publicarEstado',
        // canales
        'cambiarPestana',
        'cargarCanales',
        'cargarGrupos',
        // llamadas
        'startCall',
        'acceptCall',
        'rejectCall',
        'hangup'
    ];

    for (var i = 0; i < obligatorias.length; i++) {
        var nombre = obligatorias[i];
        var fn = window[nombre];
        if (typeof fn !== 'function') {
            if (window.DEBUG_CHAT) {
                console.warn('[Mensajes/Init] Falta función:', nombre);
            }
            return { listo: false, falta: nombre };
        }
    }

    return { listo: true, falta: null };
}

// ================================================================
// ENGANCHE DE LISTENERS
// ================================================================
function _engancharListeners() {
    // ---- Header ----
    var headerAvatar = $('headerAvatar');
    if (headerAvatar) headerAvatar.onclick = abrirProfileModal;

    var avatarInput = $('avatarInput');
    if (avatarInput) {
        avatarInput.addEventListener('change', subirFotoHeader);
    }

    // ---- Modal de perfil ----
    var btnCambiarFoto = $('btnCambiarFoto');
    if (btnCambiarFoto) {
        btnCambiarFoto.onclick = function() {
            var ai = $('avatarInput');
            if (ai) ai.click();
        };
    }

    var btnCerrarProfileModal = $('btnCerrarProfileModal');
    if (btnCerrarProfileModal) {
        btnCerrarProfileModal.onclick = cerrarProfileModal;
    }

    var profileModal = $('profileModal');
    if (profileModal) {
        profileModal.addEventListener('click', function(e) {
            if (e.target.id === 'profileModal') cerrarProfileModal();
        });
    }

    // ---- Modal de vistas ----
    var closeVistasModal = $('closeVistasModal');
    if (closeVistasModal) closeVistasModal.onclick = cerrarVistasModal;

    var vistasModal = $('vistasModal');
    if (vistasModal) {
        vistasModal.addEventListener('click', function(e) {
            if (e.target.id === 'vistasModal') cerrarVistasModal();
        });
    }

    // ---- Visor de foto ----
    var pvClose = $('pvClose');
    if (pvClose) pvClose.onclick = cerrarPhotoViewer;

    var photoViewer = $('photoViewer');
    if (photoViewer) {
        photoViewer.addEventListener('click', function(e) {
            if (e.target.id === 'photoViewer') cerrarPhotoViewer();
        });
    }

    // ---- Visor de estados ----
    var evClose = $('evClose');
    if (evClose) evClose.onclick = cerrarEstadoViewer;

    var evBack = $('evBack');
    if (evBack) evBack.onclick = cerrarEstadoViewer;

    var evPrev = $('evPrev');
    if (evPrev) {
        evPrev.onclick = function(e) {
            e.stopPropagation();
            anteriorEstado();
        };
    }

    var evNext = $('evNext');
    if (evNext) {
        evNext.onclick = function(e) {
            e.stopPropagation();
            siguienteEstado();
        };
    }

    var evVistas = $('evVistas');
    if (evVistas) {
        evVistas.onclick = function(e) {
            e.stopPropagation();
            var estadoId = evVistas.dataset.estadoId;
            if (estadoId) abrirVistasModal(estadoId);
        };
    }

    // Pausa/reanudar con dedo o mouse
    var evBody = $('evBody');
    if (evBody) {
        evBody.addEventListener('mousedown', activarPausaEstado);
        evBody.addEventListener('mouseup', desactivarPausaEstado);
        evBody.addEventListener('mouseleave', desactivarPausaEstado);

        evBody.addEventListener('touchstart', function(e) {
            e.preventDefault();
            activarPausaEstado();
        }, { passive: false });

        evBody.addEventListener('touchend', function(e) {
            e.preventDefault();
            desactivarPausaEstado();
        }, { passive: false });

        evBody.addEventListener('touchcancel', desactivarPausaEstado);
    }

    // Espacio pausa
    document.addEventListener('keydown', function(e) {
        if (e.key === ' ' && $('estadoViewer') && $('estadoViewer').classList.contains('show')) {
            e.preventDefault();
            if (estadoPausado) desactivarPausaEstado();
            else activarPausaEstado();
        }
    });

    // ---- Modal de subir estado ----
    var btnSubirEstado = $('btnSubirEstado');
    if (btnSubirEstado) btnSubirEstado.onclick = abrirModalEstado;

    var closeEstadoModal = $('closeEstadoModal');
    if (closeEstadoModal) closeEstadoModal.onclick = cerrarModalEstado;

    var btnSeleccionarEstado = $('btnSeleccionarEstado');
    if (btnSeleccionarEstado) {
        btnSeleccionarEstado.onclick = seleccionarArchivoEstado;
    }

    var estadoFileInput = $('estadoFileInput');
    if (estadoFileInput) {
        estadoFileInput.addEventListener('change', previewEstado);
    }

    var btnPublicarEstado = $('btnPublicarEstado');
    if (btnPublicarEstado) btnPublicarEstado.onclick = publicarEstado;

    var estadoUploadModal = $('estadoUploadModal');
    if (estadoUploadModal) {
        estadoUploadModal.addEventListener('click', function(e) {
            if (e.target.id === 'estadoUploadModal') cerrarModalEstado();
        });
    }

    // ---- Chat composer ----
    var composer = $('composer');
    if (composer) {
        composer.addEventListener('submit', function(e) {
            e.preventDefault();
            var input = $('messageInput');
            if (input) sendMessage(input.value);
        });
    }

    // ---- Nueva conversación ----
    var newChat = $('newChat');
    if (newChat) newChat.onclick = onNuevoClick;

    var closeModal = $('closeModal');
    if (closeModal) {
        closeModal.onclick = function() {
            cerrarModalNuevaConversacion();
        };
    }

    var newModal = $('newModal');
    if (newModal) {
        newModal.addEventListener('click', function(e) {
            if (e.target.id === 'newModal') cerrarModalNuevaConversacion();
        });
    }

    var userSearch = $('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', function(e) {
            searchUsers(e.target.value);
        });
    }

    // ---- Buscador de conversaciones ----
    var searchConversations = $('searchConversations');
    if (searchConversations) {
        searchConversations.addEventListener('input', function(e) {
            conversationFilter = e.target.value;
            aplicarFiltroConversaciones();
        });
    }

    // ---- Adjuntos ----
    var attach = $('attach');
    if (attach) {
        attach.onclick = function() {
            if (current && current.bot) {
                toast('⚠️ Para ' + BOT_NOMBRE + ' usa el botón 🔊 o envía nota de voz', 'error');
                return;
            }
            var fi = $('fileInput');
            if (fi) fi.click();
        };
    }

    var fileInput = $('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async function(e) {
            var files = e.target.files;
            if (files && files.length) {
                for (var i = 0; i < files.length; i++) {
                    try {
                        await uploadFile(files[i]);
                    } catch (err) {
                        console.error('[Mensajes/Init] Error subiendo archivo:', err);
                    }
                }
            }
            e.target.value = '';
        });
    }

    // ---- Grabación de audio ----
    var audio = $('audio');
    if (audio) audio.onclick = recordAudioNota;

    // ---- Voz al bot ----
    var voiceBot = $('voiceBot');
    if (voiceBot) voiceBot.onclick = grabarVozParaBot;

    // ---- Acciones del chat ----
    var deleteChat = $('deleteChat');
    if (deleteChat) deleteChat.onclick = deleteConversation;

    var videoCall = $('videoCall');
    if (videoCall) videoCall.onclick = startCall;

    var backBtn = $('backBtn');
    if (backBtn) backBtn.onclick = cerrarConversacion;

    var searchChat = $('searchChat');
    if (searchChat) {
        searchChat.onclick = async function() {
            if (!current) {
                toast('⚠️ Selecciona una conversación', 'error');
                return;
            }
            if (current.bot) {
                toast('ℹ️ ' + BOT_NOMBRE + ' no tiene búsqueda local aún', 'warning');
                return;
            }

            var q = prompt('🔍 Buscar en la conversación:');
            if (!q || !q.trim()) return;

            try {
                var r = await db.from('mensajes_chat')
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
                console.error('[Mensajes/Init] Error buscando:', e);
                toast('❌ Error al buscar', 'error');
            }
        };
    }

    // ---- Llamadas ----
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

    // ---- Scroll del chat ----
    var messagesBox = $('messages');
    if (messagesBox) {
        messagesBox.addEventListener('scroll', detectarSiEstaAbajo, { passive: true });
    }

    var scrollDownBtn = $('scrollDownBtn');
    if (scrollDownBtn) {
        scrollDownBtn.onclick = function() {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
    }

    // ---- Tabs (chats/canales/grupos) ----
    document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
        btn.onclick = function() {
            var tab = btn.dataset.tab;
            if (tab) cambiarPestana(tab);
        };
    });

    // ---- Buscadores de canales y grupos ----
    var searchCanales = $('searchCanales');
    if (searchCanales) {
        searchCanales.addEventListener('input', buscarCanalesDebounce);
    }

    var searchGrupos = $('searchGrupos');
    if (searchGrupos) {
        searchGrupos.addEventListener('input', buscarGruposDebounce);
    }

    // ---- Filtros de canales y grupos ----
    var filtroEstadoCanal = $('filtroEstadoCanal');
    if (filtroEstadoCanal) {
        filtroEstadoCanal.addEventListener('change', cargarCanales);
    }

    var filtroCategoriaCanal = $('filtroCategoriaCanal');
    if (filtroCategoriaCanal) {
        filtroCategoriaCanal.addEventListener('change', cargarCanales);
    }

    var filtroEstadoGrupo = $('filtroEstadoGrupo');
    if (filtroEstadoGrupo) {
        filtroEstadoGrupo.addEventListener('change', cargarGrupos);
    }

    var filtroCategoriaGrupo = $('filtroCategoriaGrupo');
    if (filtroCategoriaGrupo) {
        filtroCategoriaGrupo.addEventListener('change', cargarGrupos);
    }

    // ---- Modales de crear canal/grupo ----
    var modalCanal = $('modalCrearCanal');
    if (modalCanal) {
        modalCanal.addEventListener('click', function(e) {
            if (e.target.id === 'modalCrearCanal') cerrarModalCrearCanal();
        });
    }

    var modalGrupo = $('modalCrearGrupo');
    if (modalGrupo) {
        modalGrupo.addEventListener('click', function(e) {
            if (e.target.id === 'modalCrearGrupo') cerrarModalCrearGrupo();
        });
    }

    // Botones de crear canal/grupo
    var btnCrearCanal = $('btnCrearCanal');
    if (btnCrearCanal) btnCrearCanal.onclick = crearCanal;

    var btnCrearGrupo = $('btnCrearGrupo');
    if (btnCrearGrupo) btnCrearGrupo.onclick = crearGrupo;

    // ---- Keyboard shortcuts ----
    var messageInput = $('messageInput');
    if (messageInput) {
        // Enter sin shift → enviar
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                var form = $('composer');
                if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    }

    if (window.DEBUG_CHAT) {
        console.log('[Mensajes/Init] ✅ Listeners enganchados');
    }
}

// ================================================================
// SERVICIOS GLOBALES
// ================================================================
function _arrancarServiciosGlobales() {
    // ---- Realtime: llamadas entrantes ----
    if (user && db) {
        db.channel('mensajes-incoming-calls')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'llamadas'
            }, function(p) {
                var n = p.new;
                if (!n) return;
                if (!user) return;
                if (n.destinatario_id !== user.id) return;
                if (n.estado !== 'ringing') return;
                if (typeof incoming === 'function') {
                    incoming(n);
                }
            })
            .subscribe();
    }

    // ---- Interval: limpieza de estados vistos + recarga ----
    setInterval(function() {
        try { limpiarVistosAntiguos(); } catch (e) {}
        try { cargarEstados(); } catch (e) {}
    }, 5 * 60 * 1000);

    // ---- Idiomas ----
    setTimeout(async function() {
        try {
            if (typeof window.inicializarIdiomas === 'function') {
                await window.inicializarIdiomas();
                if (window.DEBUG_CHAT) console.log('[Mensajes/Init] ✅ Idiomas aplicados');
            }
        } catch (e) {
            console.warn('[Mensajes/Init] ⚠️ Error idiomas:', e);
        }
    }, 500);
}

// ================================================================
// INIT PRINCIPAL
// ================================================================
function init() {
    if (__initPromise) {
        if (window.DEBUG_CHAT) console.log('[Mensajes/Init] init ya en curso');
        return __initPromise;
    }

    __initPromise = (async function() {
        console.log('◈ Mensajes inicializando...');

        try {
            // ---- 1. Verificar SDK de Supabase ----
            if (!window.supabase || !window.supabase.createClient) {
                throw new Error('Supabase SDK no disponible');
            }

            // ---- 2. Inicializar cliente si no existe ----
            if (!db) {
                if (window.supabaseClient) {
                    db = window.supabaseClient;
                } else {
                    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        },
                        realtime: {
                            params: { eventsPerSecond: 10 }
                        }
                    });
                    window.supabaseClient = db;
                }
            }

            // ---- 3. Cargar sesión ----
            try {
                var s = await session();
                user = (s && s.user) || null;
            } catch (e) {
                console.warn('[Mensajes/Init] Error cargando sesión:', e);
                user = null;
            }

            if (user) {
                console.log('[Mensajes/Init] ✅ Sesión activa:', user.id);
            } else {
                console.warn('[Mensajes/Init] ⚠️ No hay sesión activa');
            }

            // ---- 4. Cargar perfil + conversaciones + estados ----
            try {
                await cargarFotoHeader();
            } catch (e) {
                console.warn('[Mensajes/Init] cargarFotoHeader falló:', e);
            }

            try {
                await loadConversations();
            } catch (e) {
                console.warn('[Mensajes/Init] loadConversations falló:', e);
            }

            try {
                await cargarEstados();
            } catch (e) {
                console.warn('[Mensajes/Init] cargarEstados falló:', e);
            }

            // ---- 5. Enganchar listeners ----
            _engancharListeners();

            // ---- 6. Suscripción a cambios de auth ----
            db.auth.onAuthStateChange(function(event, s2) {
                var userAnterior = user;
                user = (s2 && s2.user) || null;

                if (event === 'SIGNED_IN' && !userAnterior) {
                    console.log('[Mensajes/Init] Sesión detectada tras init');
                    loadConversations().catch(function() {});
                    cargarFotoHeader().catch(function() {});
                    cargarEstados().catch(function() {});
                }

                if (event === 'SIGNED_OUT' && userAnterior) {
                    console.log('[Mensajes/Init] Sesión cerrada');
                    loadConversations().catch(function() {});
                    cargarFotoHeader().catch(function() {});
                    cargarEstados().catch(function() {});
                }
            });

            // ---- 7. Servicios globales ----
            _arrancarServiciosGlobales();

            console.log('◈ Mensajes inicializado correctamente ✅');
            return true;

        } catch (e) {
            console.error('[Mensajes/Init] 💥 Error fatal en init():', e);
            __initPromise = null;
            throw e;
        }
    })();

    return __initPromise;
}

// ================================================================
// ARRANQUE CON REINTENTOS
// ================================================================
var __arranqueIntentos = 0;
var __arranqueMax = 40;

function arrancarMensajes() {
    __arranqueIntentos++;

    // Esperar SDK de Supabase
    if (!window.supabase || !window.supabase.createClient) {
        if (__arranqueIntentos >= __arranqueMax) {
            console.error('[Mensajes/Init] ❌ SDK de Supabase nunca cargó. Abortando.');
            return;
        }
        if (window.DEBUG_CHAT) {
            console.warn('[Mensajes/Init] Esperando SDK... intento', __arranqueIntentos);
        }
        setTimeout(arrancarMensajes, 500);
        return;
    }

    // Verificar módulos críticos
    var check = _modulosCriticosListos();
    if (!check.listo) {
        if (__arranqueIntentos >= __arranqueMax) {
            console.error('[Mensajes/Init] ❌ Módulo crítico nunca cargó:', check.falta);
            return;
        }
        if (window.DEBUG_CHAT) {
            console.warn('[Mensajes/Init] Esperando módulo:', check.falta);
        }
        setTimeout(arrancarMensajes, 300);
        return;
    }

    // Arrancar
    init().catch(function(e) {
        console.error('[Mensajes/Init] ❌ init() falló:', e);
        if (__arranqueIntentos < __arranqueMax) {
            __initPromise = null;
            setTimeout(arrancarMensajes, 1000);
        }
    });
}

// ================================================================
// DISPARADOR
// ================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancarMensajes);
} else {
    arrancarMensajes();
}

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Init] ✅ Init cargado');
}