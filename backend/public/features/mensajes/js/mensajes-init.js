// ================================================================
// MENSAJES · INICIALIZACIÓN (v3.2 — con fixes de race conditions)
// ================================================================
// Arranque del módulo, exposición global a window.
// Depende de: TODOS los archivos anteriores.
//
// FIXES v3.2:
// - Promesa compartida para evitar race conditions en init()
// - Eliminado bucle de reintento doble (solo arrancarMensajes reintenta)
// - Garantizada asignación de db antes de listeners
// - try/catch global + capturas individuales en cada paso
// ================================================================

// ---- Flag/Promesa compartida anti-doble-init ----
var __initPromise = null;

// ================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================
function init() {
    // Si ya hay una promesa en curso o completada, devolverla
    if (__initPromise) {
        console.log('[Mensajes] init() ya en curso o completado, se reutiliza');
        return __initPromise;
    }

    __initPromise = (async function() {
        console.log('◈ Mensajes inicializando...');

        try {
            // ---- Verificar Supabase SDK ----
            if (!window.supabase || !window.supabase.createClient) {
                // Rechazar para que arrancarMensajes reintente
                throw new Error('Supabase SDK no disponible');
            }

            // ---- Inicializar cliente Supabase ----
            var cliente = inicializarSupabase();
            if (!cliente) {
                throw new Error('No se pudo inicializar Supabase');
            }

            // ---- Garantizar db global no-null ----
            db = cliente;
            window.supabaseClient = db;

            // ---- Obtener sesión ----
            var s = await esperarSesion();
            user = (s && s.user) || null;

            if (!user) {
                console.warn('[Mensajes] No hay sesión activa todavía');
            } else {
                console.log('[Mensajes] ✅ Sesión activa:', user.id);
            }

            // ---- Cargar datos iniciales (con captura individual) ----
            await cargarFotoHeader().catch(function(e) {
                console.warn('[Init] cargarFotoHeader falló:', e);
            });

            await loadConversations().catch(function(e) {
                console.warn('[Init] loadConversations falló:', e);
            });

            await cargarEstados().catch(function(e) {
                console.warn('[Init] cargarEstados falló:', e);
            });

            // ---- Configurar botón "+" dinámico ----
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

            // ---- Listener de cambios de sesión ----
            db.auth.onAuthStateChange(function(event, s2) {
                var userAnterior = user;
                user = (s2 && s2.user) || null;

                if (event === 'SIGNED_IN' && !userAnterior) {
                    console.log('[Mensajes] Sesión detectada tras init');
                    loadConversations().catch(function() {});
                    cargarFotoHeader().catch(function() {});
                    cargarEstados().catch(function() {});
                }
                if (event === 'SIGNED_OUT' && userAnterior) {
                    console.log('[Mensajes] Sesión cerrada');
                    loadConversations().catch(function() {});
                    cargarFotoHeader().catch(function() {});
                    cargarEstados().catch(function() {});
                }
            });

            // ---- Modales y botones del perfil ----
            var headerAvatar = $('headerAvatar');
            if (headerAvatar) headerAvatar.onclick = abrirProfileModal;

            var avatarInput = $('avatarInput');
            if (avatarInput) avatarInput.addEventListener('change', subirFotoHeader);

            var btnCambiarFoto = $('btnCambiarFoto');
            if (btnCambiarFoto) {
                btnCambiarFoto.onclick = function() {
                    var ai = $('avatarInput');
                    if (ai) ai.click();
                };
            }

            var btnCerrarProfileModal = $('btnCerrarProfileModal');
            if (btnCerrarProfileModal) btnCerrarProfileModal.onclick = cerrarProfileModal;

            var profileModal = $('profileModal');
            if (profileModal) {
                profileModal.addEventListener('click', function(e) {
                    if (e.target.id === 'profileModal') cerrarProfileModal();
                });
            }

            // ---- Modales de estados ----
            var closeVistasModal = $('closeVistasModal');
            if (closeVistasModal) closeVistasModal.onclick = cerrarVistasModal;

            var vistasModal = $('vistasModal');
            if (vistasModal) {
                vistasModal.addEventListener('click', function(e) {
                    if (e.target.id === 'vistasModal') cerrarVistasModal();
                });
            }

            var pvClose = $('pvClose');
            if (pvClose) pvClose.onclick = cerrarPhotoViewer;

            var photoViewer = $('photoViewer');
            if (photoViewer) {
                photoViewer.addEventListener('click', function(e) {
                    if (e.target.id === 'photoViewer') cerrarPhotoViewer();
                });
            }

            var evClose = $('evClose');
            if (evClose) evClose.onclick = cerrarEstadoViewer;

            var evBack = $('evBack');
            if (evBack) evBack.onclick = cerrarEstadoViewer;

            var evMenu = $('evMenu');
            if (evMenu) {
                evMenu.onclick = function(e) {
                    e.stopPropagation();
                    toast('Opciones próximamente', 'warning');
                };
            }

            // Botón Responder del visor de estados
            var evReply = $('evReply');
            if (evReply) {
                evReply.onclick = function(e) {
                    e.stopPropagation();
                    var estado = (typeof _estadosViewerActuales !== 'undefined'
                        && _estadosViewerActuales[estadoActualIndex])
                        ? _estadosViewerActuales[estadoActualIndex]
                        : null;
                    if (!estado) return;

                    var uid = estado.usuario_id;
                    cerrarEstadoViewer();

                    if (typeof openConversation === 'function') {
                        openConversation(uid);
                    }
                    setTimeout(function() {
                        var input = $('messageInput');
                        if (input) input.focus();
                    }, 300);
                };
            }

            // Emojis rápidos del visor de estados
            var emojiBtns = document.querySelectorAll('.estado-viewer-emoji');
            emojiBtns.forEach(function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var emoji = btn.dataset.emoji;
                    var estado = (typeof _estadosViewerActuales !== 'undefined'
                        && _estadosViewerActuales[estadoActualIndex])
                        ? _estadosViewerActuales[estadoActualIndex]
                        : null;
                    if (!estado) return;

                    var uid = estado.usuario_id;
                    cerrarEstadoViewer();

                    if (typeof openConversation === 'function') {
                        openConversation(uid);
                    }
                    setTimeout(function() {
                        var input = $('messageInput');
                        if (input) {
                            input.value = emoji;
                            var form = $('composer');
                            if (form) {
                                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                            }
                        }
                    }, 350);
                };
            });

            // Zonas táctiles prev/next
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
                    var id = evVistas.dataset.estadoId;
                    if (id) abrirVistasModal(id);
                };
            }

            // Pausa con dedo/mouse en el visor
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

            // Atajos de teclado del visor
            document.addEventListener('keydown', function(e) {
                if (e.code === 'Space') {
                    var viewer = $('estadoViewer');
                    if (viewer && viewer.classList.contains('show')) {
                        e.preventDefault();
                        if (estadoPausado) desactivarPausaEstado();
                        else activarPausaEstado();
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

            // Modal subir estado
            var btnSubirEstado = $('btnSubirEstado');
            if (btnSubirEstado) btnSubirEstado.onclick = abrirModalEstado;

            var closeEstadoModal = $('closeEstadoModal');
            if (closeEstadoModal) closeEstadoModal.onclick = cerrarModalEstado;

            var btnSeleccionarEstado = $('btnSeleccionarEstado');
            if (btnSeleccionarEstado) btnSeleccionarEstado.onclick = seleccionarArchivoEstado;

            var estadoFileInput = $('estadoFileInput');
            if (estadoFileInput) estadoFileInput.addEventListener('change', previewEstado);

            var btnPublicarEstado = $('btnPublicarEstado');
            if (btnPublicarEstado) btnPublicarEstado.onclick = publicarEstado;

            var estadoUploadModal = $('estadoUploadModal');
            if (estadoUploadModal) {
                estadoUploadModal.addEventListener('click', function(e) {
                    if (e.target.id === 'estadoUploadModal') cerrarModalEstado();
                });
            }

            // Composer
            var composer = $('composer');
            if (composer) {
                composer.addEventListener('submit', function(e) {
                    e.preventDefault();
                    var input = $('messageInput');
                    if (input) sendMessage(input.value);
                });
            }

            // Nueva conversación (modal)
            var closeModal = $('closeModal');
            if (closeModal) {
                closeModal.onclick = function() {
                    var nm = $('newModal');
                    if (nm) nm.classList.remove('show');
                };
            }

            var newModal = $('newModal');
            if (newModal) {
                newModal.addEventListener('click', function(e) {
                    if (e.target.id === 'newModal') newModal.classList.remove('show');
                });
            }

            var userSearch = $('userSearch');
            if (userSearch) {
                userSearch.addEventListener('input', function(e) {
                    searchUsers(e.target.value);
                });
            }

            // Buscador de conversaciones
            var searchConversations = $('searchConversations');
            if (searchConversations) {
                searchConversations.addEventListener('input', function(e) {
                    conversationFilter = e.target.value;
                    aplicarFiltroConversaciones();
                });
            }

            // Botones de adjuntar
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

            var audio = $('audio');
            if (audio) audio.onclick = recordAudioNota;

            var voiceBot = $('voiceBot');
            if (voiceBot) voiceBot.onclick = grabarVozParaBot;

            // Acciones de conversación
            var deleteChat = $('deleteChat');
            if (deleteChat) deleteChat.onclick = deleteConversation;

            var videoCall = $('videoCall');
            if (videoCall) videoCall.onclick = startCall;

            var backBtn = $('backBtn');
            if (backBtn) backBtn.onclick = cerrarConversacion;

            // Controles de llamada
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

            // Scroll del chat
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

            // Buscar en el chat
            var searchChatBtn = $('searchChat');
            if (searchChatBtn) {
                searchChatBtn.onclick = async function() {
                    if (!current) {
                        toast('Selecciona una conversación', 'error');
                        return;
                    }
                    if (current.bot) {
                        toast('Marquinhos no tiene búsqueda local aún', 'warning');
                        return;
                    }

                    var q = prompt('Buscar en la conversación:');
                    if (!q || !q.trim()) return;

                    try {
                        var r = await db.from('mensajes_chat')
                            .select('*')
                            .eq('eliminado', false)
                            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + current.id + '),and(remitente_id.eq.' + current.id + ',destinatario_id.eq.' + user.id + ')')
                            .ilike('contenido', '%' + q.trim() + '%')
                            .order('created_at', { ascending: true });

                        if (r.error) {
                            toast('Error al buscar', 'error');
                            return;
                        }

                        await renderMessages(r.data || []);
                    } catch (e) {
                        console.error('[Mensajes] Error buscando en chat:', e);
                    }
                };
            }

            // Suscripción a llamadas entrantes
            db.channel('incoming-calls')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'llamadas'
                }, function(p) {
                    if (user && p.new.destinatario_id === user.id && p.new.estado === 'ringing') {
                        incoming(p.new);
                    }
                })
                .subscribe();

            // Refresco periódico de estados
            setInterval(function() {
                limpiarVistosAntiguos();
                cargarEstados().catch(function() {});
            }, 5 * 60 * 1000);

            // Idiomas
            setTimeout(async function() {
                try {
                    if (typeof window.inicializarIdiomas === 'function') {
                        await window.inicializarIdiomas();
                        console.log('[Mensajes] ✅ Idiomas aplicados');
                    }
                } catch (e) {
                    console.warn('[Mensajes] ⚠️ Error idiomas:', e);
                }
            }, 500);

            console.log('◈ Mensajes inicializado correctamente ✅');
            return true;

        } catch (e) {
            console.error('[Init] 💥 Error fatal en init():', e);
            // Resetear para permitir reintento desde arrancarMensajes
            __initPromise = null;
            throw e;
        }
    })();

    return __initPromise;
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
// ARRANQUE — único punto de reintento
// ================================================================
var __arranqueIntentos = 0;
var __arranqueMax = 40;  // 40 * 500ms = 20s máximo

function arrancarMensajes() {
    __arranqueIntentos++;

    // Esperar a que el SDK de Supabase esté disponible
    if (!window.supabase || !window.supabase.createClient) {
        if (__arranqueIntentos >= __arranqueMax) {
            console.error('[Mensajes] ❌ SDK de Supabase nunca cargó. Abortando.');
            return;
        }
        console.warn('[Mensajes] Esperando SDK de Supabase... intento', __arranqueIntentos);
        setTimeout(arrancarMensajes, 500);
        return;
    }

    // SDK listo → iniciar (la promesa interna protege de doble ejecución)
    init().catch(function(e) {
        console.error('[Mensajes] ❌ init() falló:', e);
        // Si falla, permitir un reintento único
        if (__arranqueIntentos < __arranqueMax) {
            __initPromise = null;
            setTimeout(arrancarMensajes, 1000);
        }
    });
}

// Lanzar arranque cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancarMensajes);
} else {
    arrancarMensajes();
}