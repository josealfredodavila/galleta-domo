// ================================================================
// MENSAJES - SARIEL'S ECOSYSTEM
// VERSIÓN FINAL - AUDITORÍA QUIRÚRGICA COMPLETA
// ================================================================

// ================================================================
// CONFIGURACIÓN SUPABASE - CON VERIFICACIÓN Y REINTENTO
// ================================================================

var supabase = null;
var SUPABASE_READY = false;

function obtenerSupabase() {
    if (typeof window.supabase !== 'undefined' && window.supabase !== null) {
        supabase = window.supabase;
        SUPABASE_READY = true;
        return true;
    }
    return false;
}

// Intentar obtener Supabase inmediatamente
if (!obtenerSupabase()) {
    console.warn('⏳ Supabase no disponible en el momento, esperando...');

    var intentos = 0;
    var maxIntentos = 10;

    var intervalo = setInterval(function() {
        intentos++;
        if (obtenerSupabase()) {
            clearInterval(intervalo);
            console.log('✅ Supabase conectado correctamente (intento ' + intentos + ')');
            return;
        }

        if (intentos >= maxIntentos) {
            clearInterval(intervalo);
            console.error('❌ Supabase no disponible después de ' + maxIntentos + ' intentos');
            showToast('⚠️ Error de conexión con el servidor', 'error');
            var container = document.getElementById('conversacionesList');
            if (container) {
                container.innerHTML = `
                    <div style="padding:40px;text-align:center;color:#ef4444;font-size:0.9rem;">
                        <div style="font-size:2rem;margin-bottom:10px;">⚠️</div>
                        <p>Error de conexión con Supabase</p>
                        <p style="font-size:0.7rem;margin-top:8px;color:#667788;">Recarga la página o contacta a soporte</p>
                        <button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:#d4af37;border:none;border-radius:30px;color:#0b0e14;font-weight:600;cursor:pointer;">
                            🔄 Recargar
                        </button>
                    </div>
                `;
            }
        }
    }, 200);
}

// ================================================================
// ================================================================
// 📋 SISTEMA DE LOGGING ESTRUCTURADO
// ================================================================
// ================================================================

var Logger = {
    levels: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4
    },

    _level: 1,

    setLevel: function(level) {
        this._level = this.levels[level] || 1;
    },

    _log: function(level, message, data) {
        data = data || null;
        var levelName = Object.keys(this.levels).find(function(k) {
            return this.levels[k] === level;
        }.bind(this));

        if (level < this._level) return;

        var entry = {
            timestamp: new Date().toISOString(),
            level: levelName,
            message: message,
            data: data,
            module: 'mensajes'
        };

        var prefix = '[' + entry.timestamp + '] [' + levelName + ']';
        if (level >= this.levels.ERROR) {
            console.error(prefix, message, data || '');
        } else if (level >= this.levels.WARN) {
            console.warn(prefix, message, data || '');
        } else {
            console.log(prefix, message, data || '');
        }
    },

    debug: function(message, data) { this._log(this.levels.DEBUG, message, data); },
    info: function(message, data) { this._log(this.levels.INFO, message, data); },
    warn: function(message, data) { this._log(this.levels.WARN, message, data); },
    error: function(message, data) { this._log(this.levels.ERROR, message, data); },
    fatal: function(message, data) { this._log(this.levels.FATAL, message, data); }
};

// ================================================================
// ================================================================
// 🛡️ SEGURIDAD - ESCAPE HTML
// ================================================================
// ================================================================

function escapeHTML(texto) {
    if (!texto) return '';
    var div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// ================================================================
// 🛡️ SEGURIDAD - SANITIZACIÓN COMPLETA
// ================================================================
// ================================================================

function sanitizarContenido(texto) {
    if (!texto) return '';

    var div = document.createElement('div');
    div.textContent = texto;
    var sanitizado = div.innerHTML;

    var emojisSeguros = {
        ':feliz:': '😊',
        ':risa:': '😂',
        ':amo:': '❤️',
        ':fuego:': '🔥',
        ':estrella:': '⭐',
        ':genial:': '🤩',
        ':ok:': '👌',
        ':visto:': '👀',
        ':musica:': '🎵',
        ':pizza:': '🍕',
        ':cafe:': '☕',
        ':helado:': '🍦',
        ':rocket:': '🚀',
        ':sariel:': '◈'
    };

    for (var key in emojisSeguros) {
        if (emojisSeguros.hasOwnProperty(key)) {
            var pattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            sanitizado = sanitizado.replace(new RegExp(pattern, 'g'), emojisSeguros[key]);
        }
    }

    sanitizado = sanitizado.replace(/<a\s+href=["'](javascript:|data:)/gi, '<a href="#"');
    sanitizado = sanitizado.replace(/on\w+\s*=/gi, 'data-');

    sanitizado = sanitizado.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return sanitizado;
}

// ================================================================
// ================================================================
// 📋 TOAST NOTIFICACIONES
// ================================================================
// ================================================================

function showToast(msg, type, duration) {
    type = type || '';
    duration = duration || 3500;
    try {
        var t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.className = 'toast show';
        if (type === 'error') t.classList.add('error');
        else if (type === 'warning') t.classList.add('warning');
        else if (type === 'success') t.classList.add('success');
        else t.classList.remove('error', 'warning', 'success');
        clearTimeout(t._timeout);
        t._timeout = setTimeout(function() { t.classList.remove('show'); }, duration);
    } catch (e) {
        Logger.warn('Toast no disponible', e);
        alert(msg);
    }
}

// ================================================================
// ================================================================
// 🔐 SESSION MANAGER - PATRÓN SINGLETON
// ================================================================
// ================================================================

function SessionManager() {
    this._usuario = null;
    this._session = null;
    this._lastRefresh = null;
    this._refreshLock = false;
}

SessionManager.prototype = {
    constructor: SessionManager,

    get usuario() {
        return this._usuario;
    },

    get session() {
        return this._session;
    },

    get isAuthenticated() {
        return this._usuario !== null && this._session !== null;
    },

    getUsuario: function() {
        if (this._refreshLock) {
            return new Promise(function(resolve) {
                setTimeout(function() { resolve(this._usuario); }.bind(this), 100);
            }.bind(this));
        }

        if (this._usuario && this._session) {
            var expiryTime = new Date(this._session.expires_at);
            var timeUntilExpiry = expiryTime - Date.now();

            if (timeUntilExpiry < 300000) {
                return this._refreshSession();
            }
            return Promise.resolve(this._usuario);
        }

        return this._refreshSession();
    },

    getSession: function() {
        if (this._session) return Promise.resolve(this._session);
        return this.getUsuario().then(function() {
            return this._session;
        }.bind(this));
    },

    _refreshSession: function() {
        if (this._refreshLock) return Promise.resolve(this._usuario);

        this._refreshLock = true;
        return supabase.auth.getSession()
            .then(function(result) {
                var session = result.data.session;
                if (!session) {
                    this._usuario = null;
                    this._session = null;
                    return null;
                }
                this._session = session;
                this._usuario = session.user;
                this._lastRefresh = Date.now();
                return this._usuario;
            }.bind(this))
            .catch(function(error) {
                Logger.error('Error refrescando sesión', error);
                return null;
            })
            .finally(function() {
                this._refreshLock = false;
            }.bind(this));
    },

    verificarAutenticacion: function() {
        return this.getUsuario().then(function(usuario) {
            if (!usuario) {
                showToast('⚠️ Inicia sesión para usar mensajería', 'warning');
                return false;
            }
            return true;
        });
    },

    logout: function() {
        this._usuario = null;
        this._session = null;
        this._lastRefresh = null;
        return supabase.auth.signOut();
    }
};

var sessionManager = new SessionManager();

// ================================================================
// ================================================================
// 📡 API CALL - CON MANEJO DE CORS Y TIMEOUT
// ================================================================
// ================================================================

function llamadaAPI(endpoint, options, timeout) {
    options = options || {};
    timeout = timeout || 30000;

    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, timeout);

    return sessionManager.getSession()
        .then(function(session) {
            if (!session) throw new Error('No autenticado');

            return fetch(endpoint, {
                ...options,
                headers: {
                    'Authorization': 'Bearer ' + session.access_token,
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...options.headers
                },
                signal: controller.signal
            });
        })
        .then(function(response) {
            clearTimeout(timeoutId);

            if (response.status === 403 || response.status === 401) {
                showToast('⚠️ Sesión expirada, por favor inicia sesión nuevamente', 'error');
                return sessionManager.logout().then(function() {
                    window.location.href = '/login';
                    return null;
                });
            }

            if (!response.ok) {
                return response.json().catch(function() { return {}; }).then(function(errorData) {
                    throw new Error(errorData.error || 'Error ' + response.status + ': ' + response.statusText);
                });
            }

            return response.json();
        })
        .catch(function(error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                showToast('⏳ La operación tardó demasiado, intenta de nuevo', 'warning');
                Logger.warn('Timeout en API', { endpoint: endpoint, timeout: timeout });
                return null;
            }
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                showToast('❌ Error de conexión con el servidor', 'error');
                Logger.error('CORS/Network Error', { endpoint: endpoint, error: error.message });
                return null;
            }
            throw error;
        });
}

// ================================================================
// ================================================================
// 🚦 RATE LIMITER - CONTROL DE FRECUENCIA
// ================================================================
// ================================================================

var rateLimiter = {
    _lastSend: 0,
    _pendingMessages: 0,
    _MAX_MESSAGES_PER_SECOND: 3,
    _MAX_PENDING: 5,

    canSend: function() {
        var now = Date.now();
        var diff = now - this._lastSend;

        if (this._pendingMessages >= this._MAX_PENDING) {
            showToast('⏳ Demasiados mensajes pendientes, espera un momento', 'warning');
            return false;
        }

        if (diff < 1000 && this._pendingMessages > 0) {
            showToast('⏳ Por favor espera antes de enviar más mensajes', 'warning');
            return false;
        }

        if (diff < 300) {
            showToast('⏳ Demasiado rápido, espera un momento', 'warning');
            return false;
        }

        this._lastSend = now;
        this._pendingMessages++;
        setTimeout(function() { this._pendingMessages--; }.bind(this), 1000);
        return true;
    }
};

// ================================================================
// ================================================================
// 📁 VALIDACIÓN DE ARCHIVOS
// ================================================================
// ================================================================

var MAX_FILE_SIZE = 10 * 1024 * 1024;
var MAX_FILES = 5;
var TIPOS_PERMITIDOS = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'
];
var EXTENSIONES_PERMITIDAS = [
    'jpg', 'jpeg', 'png', 'gif', 'webp',
    'mp3', 'webm', 'ogg', 'wav'
];

function validarArchivo(file) {
    if (file.size > MAX_FILE_SIZE) {
        showToast('❌ Archivo demasiado grande (máx ' + (MAX_FILE_SIZE / 1024 / 1024) + 'MB)', 'error');
        return false;
    }

    if (TIPOS_PERMITIDOS.indexOf(file.type) === -1) {
        showToast('❌ Tipo de archivo no permitido', 'error');
        return false;
    }

    var ext = file.name.split('.').pop().toLowerCase();
    if (EXTENSIONES_PERMITIDAS.indexOf(ext) === -1) {
        showToast('❌ Extensión de archivo no permitida', 'error');
        return false;
    }

    if (file.size > 5 * 1024 * 1024) {
        if (!confirm('⚠️ El archivo ' + file.name + ' pesa ' + (file.size / 1024 / 1024).toFixed(1) + 'MB. ¿Continuar?')) {
            return false;
        }
    }

    return true;
}

// ================================================================
// ================================================================
// 📡 CANAL REALTIME CON RECONEXIÓN
// ================================================================
// ================================================================

var currentChannel = null;
var reconnectAttempts = 0;
var MAX_RECONNECT_ATTEMPTS = 5;
var RECONNECT_DELAY = 2000;

function crearCanalRealtime(contactoId, onMessage, onUpdate) {
    var channel = supabase
        .channel('chat-' + contactoId)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_chat',
            filter: 'remitente_id=eq.' + contactoId
        }, onMessage)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'mensajes_chat'
        }, onUpdate);

    reconnectAttempts = 0;

    channel.subscribe(function(status) {
        if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0;
            Logger.info('Canal Realtime conectado', { contactoId: contactoId });
            var statusEl = document.querySelector('.chat-status');
            if (statusEl) statusEl.classList.remove('desconectado');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                Logger.warn('Reconectando canal', { contactoId: contactoId, intento: reconnectAttempts });
                setTimeout(function() {
                    channel.subscribe();
                }, RECONNECT_DELAY * reconnectAttempts);
            } else {
                Logger.error('Error crítico: no se pudo reconectar', { contactoId: contactoId });
                showToast('❌ Perdiste conexión con el chat', 'error');
                var statusEl = document.querySelector('.chat-status');
                if (statusEl) statusEl.classList.add('desconectado');
            }
        }
    });

    return channel;
}

// ================================================================
// ================================================================
// 📦 CACHE DE MENSAJES
// ================================================================
// ================================================================

var messageCache = new Map();
var CACHE_TTL = 5 * 60 * 1000;

function getCachedMessages(contactoId) {
    var cached = messageCache.get(contactoId);
    if (!cached) return null;

    var now = Date.now();
    if (now - cached.timestamp > CACHE_TTL) {
        messageCache.delete(contactoId);
        return null;
    }
    return cached.data;
}

function setCachedMessages(contactoId, messages) {
    messageCache.set(contactoId, {
        data: messages,
        timestamp: Date.now()
    });
}

// ================================================================
// ================================================================
// 🔄 INDICADOR DE CARGA
// ================================================================
// ================================================================

function showLoading(message) {
    message = message || 'Cargando...';
    var overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: none; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(4px);';
        overlay.innerHTML = '<div style="background: #1a1a2e; padding: 30px 40px; border-radius: 12px; border: 1px solid rgba(212,175,55,0.3); text-align: center;"><div style="width: 40px; height: 40px; border: 3px solid rgba(212,175,55,0.1); border-top-color: #d4af37; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px;"></div><div class="loading-message" style="color: #d4af37; font-weight: 500;">' + message + '</div></div>';
        document.body.appendChild(overlay);

        if (!document.getElementById('loading-style')) {
            var style = document.createElement('style');
            style.id = 'loading-style';
            style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
    }

    var msgEl = overlay.querySelector('.loading-message');
    if (msgEl) msgEl.textContent = message;
    overlay.style.display = 'flex';
}

function hideLoading() {
    var overlay = document.querySelector('.loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ================================================================
// ================================================================
// ✏️ FORMATEAR TEXTO CON SANITIZACIÓN
// ================================================================
// ================================================================

function formatearTexto(texto) {
    return sanitizarContenido(texto || '');
}

// ================================================================
// ================================================================
// 🔍 BUSCAR CONTACTOS
// ================================================================
// ================================================================

function buscarContactos(query) {
    if (!query || query.length < 2) {
        document.getElementById('resultadosBusqueda').innerHTML = '';
        return;
    }

    sessionManager.getSession()
        .then(function(session) {
            if (!session) return;

            return supabase
                .from('usuarios')
                .select('id, nombre, handle, avatar_url')
                .or('nombre.ilike.%' + query + '%,handle.ilike.%' + query + '%')
                .neq('id', session.user.id)
                .limit(10);
        })
        .then(function(result) {
            if (!result) return;
            if (result.error) throw result.error;

            var container = document.getElementById('resultadosBusqueda');
            if (!container) return;

            var data = result.data || [];
            if (data.length === 0) {
                container.innerHTML = '<div style="padding:12px;text-align:center;color:#667788;font-size:0.75rem;">No se encontraron usuarios</div>';
                return;
            }

            return sessionManager.getSession().then(function(session) {
                return supabase
                    .from('contactos')
                    .select('contacto_id')
                    .eq('usuario_id', session.user.id)
                    .then(function(contactosResult) {
                        var idsExistentes = (contactosResult.data || []).map(function(c) { return c.contacto_id; });
                        return { data: data, idsExistentes: idsExistentes };
                    });
            });
        })
        .then(function(result) {
            if (!result) return;
            var data = result.data;
            var idsExistentes = result.idsExistentes;

            var container = document.getElementById('resultadosBusqueda');
            var html = '';
            for (var i = 0; i < data.length; i++) {
                var usuario = data[i];
                var yaEsContacto = idsExistentes.indexOf(usuario.id) !== -1;
                var nombreSanitizado = escapeHTML(usuario.nombre || 'Usuario');
                var handleSanitizado = escapeHTML(usuario.handle || 'usuario');
                var avatarHtml = usuario.avatar_url ?
                    '<img src="' + usuario.avatar_url + '" style="width:100%;height:100%;object-fit:cover;">' :
                    (usuario.nombre ? nombreSanitizado[0].toUpperCase() : '◈');

                html += '<div class="resultado-item" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid rgba(212,175,55,0.05);transition:all 0.2s;">';
                html += '<div class="avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#1a2a1a,#d4af37);display:flex;align-items:center;justify-content:center;color:white;font-size:0.8rem;overflow:hidden;">' + avatarHtml + '</div>';
                html += '<div style="flex:1;"><div style="font-weight:600;font-size:0.8rem;">' + nombreSanitizado + '</div>';
                html += '<div style="font-size:0.6rem;color:#667788;">@' + handleSanitizado + '</div></div>';
                if (yaEsContacto) {
                    html += '<span style="font-size:0.55rem;color:#4ade80;background:rgba(0,214,143,0.1);padding:2px 10px;border-radius:12px;">✓ Contacto</span>';
                } else {
                    html += '<button onclick="agregarContacto(\'' + usuario.id + '\')" style="background:linear-gradient(135deg,#d4af37,#c49a2a);color:#0b0e14;border:none;padding:4px 12px;border-radius:12px;font-size:0.6rem;font-weight:600;cursor:pointer;">+ Agregar</button>';
                }
                html += '</div>';
            }
            container.innerHTML = html;
        })
        .catch(function(error) {
            Logger.error('Error buscando contactos', error);
        });
}

// ================================================================
// ================================================================
// ➕ AGREGAR CONTACTO
// ================================================================
// ================================================================

function agregarContacto(contactoId) {
    sessionManager.getSession()
        .then(function(session) {
            if (!session) {
                showToast('⚠️ Inicia sesión para agregar contactos', 'error');
                return;
            }

            return supabase
                .from('contactos')
                .select('id')
                .eq('usuario_id', session.user.id)
                .eq('contacto_id', contactoId)
                .maybeSingle()
                .then(function(existeResult) {
                    if (existeResult.data) {
                        showToast('⚠️ Este usuario ya es tu contacto', 'warning');
                        return;
                    }
                    return supabase
                        .from('contactos')
                        .insert({
                            usuario_id: session.user.id,
                            contacto_id: contactoId,
                            estado: 'activo'
                        });
                });
        })
        .then(function(result) {
            if (!result) return;
            if (result.error) throw result.error;

            showToast('✅ Contacto agregado correctamente', 'success');
            document.getElementById('searchInputModal').value = '';
            document.getElementById('resultadosBusqueda').innerHTML = '';
            cerrarModalNuevoContacto();
            return cargarConversaciones();
        })
        .catch(function(error) {
            Logger.error('Error agregando contacto', error);
            showToast('❌ Error al agregar contacto', 'error');
        });
}

// ================================================================
// ================================================================
// 📋 CARGAR CONVERSACIONES
// ================================================================
// ================================================================

function cargarConversaciones() {
    return sessionManager.verificarAutenticacion()
        .then(function(autenticado) {
            if (!autenticado) return;

            return llamadaAPI('/api/mensajes/conversaciones');
        })
        .then(function(result) {
            if (!result) return;

            var conversaciones = result.conversaciones || [];

            var convList = document.getElementById('conversacionesList');
            if (!convList) return;

            if (conversaciones.length === 0) {
                convList.innerHTML = '<div style="padding:40px;text-align:center;color:#667788;font-size:0.8rem;"><div style="font-size:2rem;margin-bottom:10px;">◈</div><p>Sin contactos agregados</p><p style="font-size:0.6rem;">Busca y agrega contactos arriba</p></div>';
                return;
            }

            var usuario = sessionManager.usuario;
            var html = '';
            for (var i = 0; i < conversaciones.length; i++) {
                var conv = conversaciones[i];
                var avatar = conv.avatar_url ?
                    '<img src="' + conv.avatar_url + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />' :
                    (conv.nombre ? conv.nombre[0].toUpperCase() : '✦');

                var isActive = conv.id === (window._conversacionActualId || null);
                var nombreSanitizado = escapeHTML(conv.nombre);
                var ultimoMensajeSanitizado = escapeHTML(conv.ultimoMensaje);

                html += '<div class="conv-item' + (isActive ? ' active' : '') + '" data-id="' + conv.id + '" onclick="abrirConversacion(\'' + conv.id + '\')">';
                html += '<div class="conv-avatar">' + avatar + '</div>';
                html += '<div class="conv-info"><div class="conv-nombre">' + nombreSanitizado + '</div>';
                html += '<div class="conv-msg">' + (ultimoMensajeSanitizado.length > 40 ? ultimoMensajeSanitizado.substring(0, 40) + '...' : ultimoMensajeSanitizado) + '</div></div>';
                html += '<div class="conv-meta">';
                if (conv.noLeidos > 0) html += '<span class="conv-badge">' + conv.noLeidos + '</span>';
                if (conv.fecha) html += '<span class="conv-hora">' + new Date(conv.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>';
                html += '</div></div>';
            }
            convList.innerHTML = html;
        })
        .catch(function(error) {
            Logger.error('Error cargando conversaciones', error);
            showToast('❌ Error al cargar conversaciones', 'error');
        });
}

// ================================================================
// ================================================================
// 💬 ABRIR CONVERSACIÓN
// ================================================================
// ================================================================

var conversacionActual = null;

function abrirConversacion(contactoId) {
    sessionManager.getSession()
        .then(function(session) {
            if (!session) {
                showToast('⚠️ Inicia sesión para abrir conversaciones', 'error');
                return;
            }

            return supabase
                .from('usuarios')
                .select('id, nombre, handle, avatar_url')
                .eq('id', contactoId)
                .single()
                .then(function(contactoResult) {
                    if (contactoResult.error) throw contactoResult.error;
                    return { session: session, contacto: contactoResult.data };
                });
        })
        .then(function(result) {
            if (!result) return;
            var session = result.session;
            var contacto = result.contacto;

            conversacionActual = contacto;
            window._conversacionActualId = contactoId;

            var chatNombre = document.getElementById('chatNombre');
            if (chatNombre) chatNombre.textContent = contacto.nombre || 'Usuario';

            var chatAvatar = document.querySelector('.chat-avatar');
            if (chatAvatar) chatAvatar.textContent = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';

            return supabase
                .from('usuarios')
                .select('online, ultima_conexion')
                .eq('id', contactoId)
                .single()
                .then(function(estadoResult) {
                    var chatEstado = document.getElementById('chatEstado');
                    if (!chatEstado) return;
                    var estadoContacto = estadoResult.data || {};
                    if (estadoContacto.online) {
                        chatEstado.textContent = '🟢 En línea';
                        chatEstado.className = 'chat-estado online';
                    } else if (estadoContacto.ultima_conexion) {
                        var diff = Math.floor((Date.now() - new Date(estadoContacto.ultima_conexion)) / 60000);
                        if (diff < 5) {
                            chatEstado.textContent = '🟡 Última vez hace unos minutos';
                        } else if (diff < 60) {
                            chatEstado.textContent = '🟡 Última vez hace ' + diff + ' min';
                        } else if (diff < 1440) {
                            chatEstado.textContent = '🟡 Última vez hace ' + Math.floor(diff / 60) + ' h';
                        } else {
                            chatEstado.textContent = '🟡 Última vez hace ' + Math.floor(diff / 1440) + ' d';
                        }
                        chatEstado.className = 'chat-estado';
                    } else {
                        chatEstado.textContent = '⚪ Desconectado';
                        chatEstado.className = 'chat-estado';
                    }
                    return { session: session, contactoId: contactoId };
                });
        })
        .then(function(result) {
            if (!result) return;
            var session = result.session;
            var contactoId = result.contactoId;

            return marcarMensajesLeidos(contactoId)
                .then(function() {
                    return cargarMensajes(contactoId);
                })
                .then(function() {
                    if (currentChannel) {
                        try { supabase.removeChannel(currentChannel); } catch (e) {}
                        currentChannel = null;
                    }

                    currentChannel = crearCanalRealtime(
                        contactoId,
                        function(payload) {
                            if (payload.new.destinatario_id === session.user.id) {
                                agregarMensajeRealtime(payload.new);
                                marcarMensajesLeidos(contactoId);
                            }
                        },
                        function() { cargarConversaciones(); }
                    );

                    return cargarConversaciones();
                });
        })
        .catch(function(error) {
            Logger.error('Error abriendo conversación', error);
        });
}

// ================================================================
// ================================================================
// 📖 CARGAR MENSAJES CON CACHE
// ================================================================
// ================================================================

function cargarMensajes(contactoId) {
    return sessionManager.getSession()
        .then(function(session) {
            if (!session) return;

            var container = document.getElementById('chatMessages');
            if (!container) return;

            // Verificar cache
            var cached = getCachedMessages(contactoId);
            if (cached) {
                var html = '';
                for (var i = 0; i < cached.length; i++) {
                    html += crearMensajeHTML(cached[i]);
                }
                container.innerHTML = html;
                container.scrollTop = container.scrollHeight;
                return;
            }

            return llamadaAPI('/api/mensajes/mensajes/' + contactoId + '?userId=' + session.user.id)
                .then(function(result) {
                    if (!result) return;
                    var mensajes = result.mensajes || [];

                    if (mensajes.length > 0) {
                        setCachedMessages(contactoId, mensajes);
                        var html = '';
                        for (var i = 0; i < mensajes.length; i++) {
                            html += crearMensajeHTML(mensajes[i]);
                        }
                        container.innerHTML = html;
                        container.scrollTop = container.scrollHeight;
                    } else {
                        container.innerHTML = '<div class="empty-chat"><span class="icon">◈</span><h3>Inicia la conversación</h3><p>Envía un mensaje para comenzar</p></div>';
                    }
                });
        })
        .catch(function(error) {
            Logger.error('Error cargando mensajes', error);
            showToast('❌ Error al cargar mensajes', 'error');
        });
}

// ================================================================
// ================================================================
// ✏️ CREAR MENSAJE HTML CON SANITIZACIÓN
// ================================================================
// ================================================================

function crearMensajeHTML(msg) {
    var usuario = sessionManager.usuario;
    var esEnviado = msg.remitente_id === (usuario ? usuario.id : null);
    var fecha = new Date(msg.created_at);
    var hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var contenidoFormateado = formatearTexto(msg.contenido || '');

    if (msg.tipo === 'imagen' && msg.imagen_url) {
        return crearMensajeImagen(msg, esEnviado, hora);
    }

    if (msg.tipo === 'voz' && msg.imagen_url) {
        return crearMensajeAudio(msg, esEnviado, hora);
    }

    if (esEnviado) {
        return '<div class="msg-wrapper enviado">' +
            '<div class="burbuja">' + contenidoFormateado + '</div>' +
            '<div class="meta">' + hora + (msg.editado ? ' ✎' : '') +
            '<span class="leido ' + (msg.leido ? 'leido' : 'no-leido') + '">' + (msg.leido ? '◆◆' : '◆◇') + '</span>' +
            '<button onclick="eliminarMensaje(\'' + msg.id + '\')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.5rem;">✕</button>' +
            '<button onclick="editarMensaje(\'' + msg.id + '\')" style="background:none;border:none;color:#d4af37;cursor:pointer;font-size:0.5rem;">✎</button>' +
            '</div></div>';
    }

    return '<div class="msg-wrapper recibido">' +
        '<div class="fila"><div class="avatar">◈</div><div class="burbuja">' + contenidoFormateado + '</div></div>' +
        '<div class="meta">' + hora + (msg.editado ? ' ✎' : '') +
        '<button onclick="reportarMensaje(\'' + msg.id + '\')" style="background:none;border:none;color:#fbbf24;cursor:pointer;font-size:0.5rem;">⚠️</button>' +
        '</div></div>';
}

function crearMensajeImagen(msg, esEnviado, hora) {
    var imagenUrl = msg.imagen_url;
    if (esEnviado) {
        return '<div class="msg-wrapper enviado">' +
            '<div class="burbuja" style="padding:4px;background:transparent;border-radius:12px;">' +
            '<img src="' + imagenUrl + '" style="max-width:200px;border-radius:12px;border:2px solid #d4af37;" />' +
            '</div>' +
            '<div class="meta">' + hora + (msg.editado ? ' ✎' : '') +
            '<span class="leido ' + (msg.leido ? 'leido' : 'no-leido') + '">' + (msg.leido ? '◆◆' : '◆◇') + '</span></div></div>';
    }
    return '<div class="msg-wrapper recibido">' +
        '<div class="fila"><div class="avatar">◈</div>' +
        '<div class="burbuja" style="padding:4px;background:transparent;border-radius:12px;border:1px solid rgba(212,175,55,0.15);">' +
        '<img src="' + imagenUrl + '" style="max-width:200px;border-radius:12px;" />' +
        '</div></div>' +
        '<div class="meta">' + hora + (msg.editado ? ' ✎' : '') + '</div></div>';
}

function crearMensajeAudio(msg, esEnviado, hora) {
    var audioUrl = msg.imagen_url;
    if (esEnviado) {
        return '<div class="msg-wrapper enviado">' +
            '<div class="burbuja" style="display:flex;align-items:center;gap:8px;">' +
            '<span>🎵</span><audio controls style="max-width:150px;height:30px;"><source src="' + audioUrl + '" type="audio/mpeg"></audio>' +
            '</div>' +
            '<div class="meta">' + hora +
            '<span class="leido ' + (msg.leido ? 'leido' : 'no-leido') + '">' + (msg.leido ? '◆◆' : '◆◇') + '</span></div></div>';
    }
    return '<div class="msg-wrapper recibido">' +
        '<div class="fila"><div class="avatar">◈</div>' +
        '<div class="burbuja" style="display:flex;align-items:center;gap:8px;">' +
        '<span>🎵</span><audio controls style="max-width:150px;height:30px;"><source src="' + audioUrl + '" type="audio/mpeg"></audio>' +
        '</div></div>' +
        '<div class="meta">' + hora + '</div></div>';
}

// ================================================================
// ================================================================
// 📨 AGREGAR MENSAJE EN TIEMPO REAL
// ================================================================
// ================================================================

function agregarMensajeRealtime(msg) {
    var container = document.getElementById('chatMessages');
    if (!container) return;

    var empty = container.querySelector('.empty-chat');
    if (empty) empty.remove();

    if (msg.remitente_id !== (conversacionActual ? conversacionActual.id : null) &&
        msg.destinatario_id !== (conversacionActual ? conversacionActual.id : null)) return;

    container.innerHTML += crearMensajeHTML(msg);
    container.scrollTop = container.scrollHeight;
    cargarConversaciones();
}

// ================================================================
// ================================================================
// 📤 ENVIAR MENSAJE CON RATE LIMITING
// ================================================================
// ================================================================

var archivosSeleccionados = [];

function enviarMensaje() {
    var chatInput = document.getElementById('chatInput');
    var contenido = chatInput.value.trim();
    if (!contenido && archivosSeleccionados.length === 0) {
        if (!conversacionActual) showToast('⚠️ Selecciona una conversación', 'warning');
        return;
    }

    if (!rateLimiter.canSend()) return;

    sessionManager.getSession()
        .then(function(session) {
            if (!session) {
                showToast('⚠️ Inicia sesión para enviar mensajes', 'error');
                return;
            }
            if (!conversacionActual) {
                showToast('⚠️ Selecciona una conversación', 'error');
                return;
            }

            if (archivosSeleccionados.length > 0) {
                var promises = [];
                for (var i = 0; i < archivosSeleccionados.length; i++) {
                    var file = archivosSeleccionados[i];
                    if (!validarArchivo(file)) return;
                    promises.push(subirArchivo(file, session));
                }
                return Promise.all(promises).then(function() {
                    archivosSeleccionados = [];
                    document.getElementById('filePreview').innerHTML = '';
                    chatInput.value = '';
                });
            }

            if (contenido.length > 10000) {
                showToast('⚠️ El mensaje es demasiado largo (máx 10,000 caracteres)', 'warning');
                return;
            }

            showLoading('Enviando mensaje...');

            return llamadaAPI('/api/mensajes/mensajes', {
                method: 'POST',
                body: JSON.stringify({
                    destinatario_id: conversacionActual.id,
                    contenido: contenido,
                    tipo: 'texto'
                })
            }).then(function(result) {
                hideLoading();
                if (!result) return;
                chatInput.value = '';
                var counter = document.getElementById('charCounter');
                if (counter) counter.textContent = '0/10000';
                return cargarMensajes(conversacionActual.id).then(function() {
                    return cargarConversaciones();
                });
            });
        })
        .catch(function(error) {
            hideLoading();
            Logger.error('Error enviando mensaje', error);
            showToast('❌ Error al enviar mensaje', 'error');
        });
}

// ================================================================
// ================================================================
// 🖼️ SUBIR ARCHIVO CON VALIDACIÓN
// ================================================================
// ================================================================

function subirArchivo(file, session) {
    if (!validarArchivo(file)) return Promise.reject('Archivo inválido');

    var fileExt = file.name.split('.').pop().toLowerCase();
    var tipo = file.type.startsWith('image/') ? 'imagen' : 'voz';
    var filePath = 'mensajes/' + session.user.id + '/' + Date.now() + '.' + fileExt;

    showLoading('Subiendo archivo...');

    return supabase.storage
        .from('mensajes')
        .upload(filePath, file, { upsert: true })
        .then(function(uploadResult) {
            if (uploadResult.error) throw uploadResult.error;
            return supabase.storage.from('mensajes').getPublicUrl(filePath);
        })
        .then(function(urlResult) {
            var publicUrl = urlResult.data.publicUrl;
            return llamadaAPI('/api/mensajes/mensajes', {
                method: 'POST',
                body: JSON.stringify({
                    destinatario_id: conversacionActual.id,
                    contenido: file.name,
                    tipo: tipo,
                    imagen_url: publicUrl
                })
            });
        })
        .then(function(result) {
            hideLoading();
            if (!result) return;
            showToast('✅ Archivo enviado', 'success');
            return cargarMensajes(conversacionActual.id).then(function() {
                return cargarConversaciones();
            });
        })
        .catch(function(error) {
            hideLoading();
            Logger.error('Error subiendo archivo', error);
            showToast('❌ Error al subir archivo', 'error');
            throw error;
        });
}

// ================================================================
// ================================================================
// 📎 SELECCIONAR ARCHIVO
// ================================================================
// ================================================================

function seleccionarArchivo() {
    var input = document.getElementById('fileInput');
    if (input) input.click();
}

function handleFileSelect(event) {
    var files = event.target.files;
    if (!files || files.length === 0) return;

    if (files.length > MAX_FILES) {
        showToast('⚠️ Máximo ' + MAX_FILES + ' archivos', 'warning');
        event.target.value = '';
        return;
    }

    var preview = document.getElementById('filePreview');
    preview.innerHTML = '';

    archivosSeleccionados = [];

    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (!validarArchivo(file)) {
            event.target.value = '';
            archivosSeleccionados = [];
            preview.innerHTML = '';
            return;
        }

        archivosSeleccionados.push(file);
        var isImage = file.type.startsWith('image/');
        var isAudio = file.type.startsWith('audio/');
        var icon = isImage ? '🖼️' : (isAudio ? '🎵' : '📎');
        var size = (file.size / 1024).toFixed(1);

        var el = document.createElement('div');
        el.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:rgba(212,175,55,0.1);padding:4px 12px;border-radius:12px;font-size:0.65rem;color:#8899aa;';
        el.innerHTML = icon + ' ' + escapeHTML(file.name) + ' (' + size + 'KB) <span onclick="this.parentElement.remove();archivosSeleccionados=[];" style="cursor:pointer;color:#ef4444;">✕</span>';
        preview.appendChild(el);
    }

    event.target.value = '';
    showToast('📎 ' + files.length + ' archivo(s) seleccionado(s)', 'success');
}

// ================================================================
// ================================================================
// 🎙️ GRABACIÓN DE VOZ
// ================================================================
// ================================================================

var grabacionActiva = false;
var mediaRecorder = null;
var audioChunks = [];

function toggleGrabacionVoz() {
    var btn = document.getElementById('btnGrabarVoz');

    if (!grabacionActiva) {
        iniciarGrabacionVoz(btn);
    } else {
        detenerGrabacionVoz(btn);
    }
}

function iniciarGrabacionVoz(btn) {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = function(event) {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = function() {
                var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                var file = new File([audioBlob], 'voz_' + Date.now() + '.webm', { type: 'audio/webm' });

                sessionManager.getSession().then(function(session) {
                    if (session && conversacionActual) {
                        archivosSeleccionados = [file];
                        enviarMensaje();
                    }
                });

                stream.getTracks().forEach(function(track) { track.stop(); });
            };

            mediaRecorder.start();
            grabacionActiva = true;
            btn.textContent = '⏹️';
            btn.style.color = '#ef4444';
            showToast('🎙️ Grabando...', '', 2000);
        })
        .catch(function(error) {
            Logger.error('Error iniciando grabación', error);
            showToast('❌ Error al acceder al micrófono', 'error');
        });
}

function detenerGrabacionVoz(btn) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        grabacionActiva = false;
        btn.textContent = '🎙️';
        btn.style.color = '';
        showToast('✅ Grabación finalizada', 'success');
    }
}

// ================================================================
// ================================================================
// 🗑️ ELIMINAR MENSAJE CON VERIFICACIÓN DE PROPIEDAD
// ================================================================
// ================================================================

function eliminarMensaje(mensajeId) {
    if (!confirm('¿Eliminar este mensaje?')) return;

    sessionManager.getSession()
        .then(function(session) {
            if (!session) throw new Error('No autenticado');

            return supabase
                .from('mensajes_chat')
                .select('remitente_id, destinatario_id, contenido, created_at')
                .eq('id', mensajeId)
                .single()
                .then(function(mensajeResult) {
                    if (mensajeResult.error) throw new Error('Mensaje no encontrado');
                    var mensaje = mensajeResult.data;
                    if (mensaje.remitente_id !== session.user.id) {
                        showToast('⚠️ Solo el remitente puede eliminar este mensaje', 'error');
                        return;
                    }

                    showLoading('Eliminando mensaje...');

                    return supabase
                        .from('mensajes_chat')
                        .update({
                            eliminado: true,
                            eliminado_por: session.user.id,
                            eliminado_en: new Date().toISOString()
                        })
                        .eq('id', mensajeId)
                        .eq('remitente_id', session.user.id); // ✅ PUNTO Y COMA AGREGADO AQUÍ
                });
        })
        .then(function(result) {
            if (!result) return;
            if (result.error) throw result.error;

            hideLoading();
            showToast('🗑️ Mensaje eliminado');
            if (conversacionActual) {
                messageCache.delete(conversacionActual.id);
                return cargarMensajes(conversacionActual.id).then(function() {
                    return cargarConversaciones();
                });
            }
            return cargarConversaciones();
        })
        .catch(function(error) {
            hideLoading();
            Logger.error('Error eliminando mensaje', error);
            showToast('❌ Error al eliminar mensaje', 'error');
        });
}

// ================================================================
// ================================================================
// ✏️ EDITAR MENSAJE
// ================================================================
// ================================================================

function editarMensaje(mensajeId) {
    var nuevoContenido = prompt('Edita tu mensaje:');
    if (nuevoContenido === null) return;
    if (!nuevoContenido.trim()) {
        showToast('⚠️ No puedes dejar vacío', 'error');
        return;
    }
    if (nuevoContenido.length > 10000) {
        showToast('⚠️ El mensaje es demasiado largo (máx 10,000 caracteres)', 'warning');
        return;
    }

    sessionManager.getSession()
        .then(function(session) {
            if (!session) {
                showToast('⚠️ Inicia sesión', 'error');
                return;
            }

            showLoading('Editando mensaje...');

            return llamadaAPI('/api/mensajes/mensajes/' + mensajeId, {
                method: 'PUT',
                body: JSON.stringify({ contenido: nuevoContenido })
            });
        })
        .then(function(result) {
            hideLoading();
            if (!result) return;

            showToast('✅ Mensaje editado');
            if (conversacionActual) {
                messageCache.delete(conversacionActual.id);
                return cargarMensajes(conversacionActual.id);
            }
        })
        .catch(function(error) {
            hideLoading();
            Logger.error('Error editando mensaje', error);
            showToast('❌ Error al editar mensaje', 'error');
        });
}

// ================================================================
// ================================================================
// 🗑️ ELIMINAR CONVERSACIÓN CON CASCADA
// ================================================================
// ================================================================

function eliminarConversacion(contactoId) {
    if (!contactoId) {
        showToast('⚠️ No hay conversación seleccionada', 'error');
        return;
    }

    if (!confirm('¿Eliminar toda la conversación con este contacto?')) return;

    sessionManager.getSession()
        .then(function(session) {
            if (!session) {
                showToast('⚠️ Inicia sesión', 'error');
                return;
            }

            return supabase
                .from('contactos')
                .select('id')
                .eq('usuario_id', session.user.id)
                .eq('contacto_id', contactoId)
                .single()
                .then(function(contactoResult) {
                    if (contactoResult.error || !contactoResult.data) {
                        showToast('❌ Contacto no encontrado', 'error');
                        return;
                    }

                    showLoading('Eliminando conversación...');

                    return supabase
                        .from('mensajes_chat')
                        .select('id')
                        .or('and(remitente_id.eq.' + session.user.id + ',destinatario_id.eq.' + contactoId + '),and(remitente_id.eq.' + contactoId + ',destinatario_id.eq.' + session.user.id + ')')
                        .then(function(mensajesResult) {
                            if (mensajesResult.error) throw mensajesResult.error;
                            var mensajes = mensajesResult.data || [];

                            if (mensajes.length > 0) {
                                var ids = mensajes.map(function(m) { return m.id; });
                                return supabase
                                    .from('mensajes_chat')
                                    .update({
                                        eliminado: true,
                                        eliminado_por: session.user.id,
                                        eliminado_en: new Date().toISOString()
                                    })
                                    .in('id', ids);
                            }
                            return { error: null };
                        })
                        .then(function(resultadoActualizacion) {
                            // ✅ RETURN AGREGADO AQUÍ para que continúe la cadena
                            return supabase
                                .from('contactos')
                                .delete()
                                .eq('usuario_id', session.user.id)
                                .eq('contacto_id', contactoId);
                        });
                });
        })
        .then(function(result) {
            if (!result) return;
            if (result.error) throw result.error;

            hideLoading();
            messageCache.delete(contactoId);

            if (conversacionActual && conversacionActual.id === contactoId) {
                conversacionActual = null;
                window._conversacionActualId = null;
                document.getElementById('chatNombre').textContent = 'Selecciona una conversación';
                document.getElementById('chatMessages').innerHTML = '<div class="empty-chat"><span class="icon">◈</span><h3>Conversación eliminada</h3></div>';
            }

            showToast('🗑️ Conversación eliminada');
            return cargarConversaciones();
        })
        .catch(function(error) {
            hideLoading();
            Logger.error('Error eliminando conversación', error);
            showToast('❌ Error al eliminar conversación', 'error');
        });
}

// ================================================================
// ================================================================
// 👁️ MARCAR MENSAJES COMO LEÍDOS
// ================================================================
// ================================================================

function marcarMensajesLeidos(contactoId) {
    return sessionManager.getSession()
        .then(function(session) {
            if (!session) return;

            return supabase
                .from('mensajes_chat')
                .update({ leido: true })
                .eq('remitente_id', contactoId)
                .eq('destinatario_id', session.user.id)
                .eq('leido', false)
                .is('eliminado', false);
        })
        .catch(function(error) {
            Logger.warn('Error marcando mensajes como leídos', error);
        });
}

// ================================================================
// ================================================================
// ⚠️ REPORTAR MENSAJE
// ================================================================
// ================================================================

function reportarMensaje(mensajeId) {
    var motivo = prompt('¿Por qué reportas este mensaje? (spam, ofensa, acoso, ilegal)');
    if (!motivo) return;

    sessionManager.getSession()
        .then(function(session) {
            if (!session) {
                showToast('⚠️ Inicia sesión para reportar', 'error');
                return;
            }

            return llamadaAPI('/api/mensajes/reportar/' + mensajeId, {
                method: 'POST',
                body: JSON.stringify({ motivo: motivo })
            });
        })
        .then(function(result) {
            if (!result) return;
            showToast('⚠️ Reporte enviado. Gracias por ayudar.', 'warning');
        })
        .catch(function(error) {
            Logger.error('Error reportando mensaje', error);
            showToast('❌ Error al reportar', 'error');
        });
}

// ================================================================
// ================================================================
// 🚫 BLOQUEAR USUARIO
// ================================================================
// ================================================================

function bloquearUsuario(usuarioId) {
    if (!usuarioId) {
        showToast('⚠️ No hay usuario seleccionado', 'error');
        return;
    }

    if (!confirm('¿Bloquear a este usuario? No podrán enviarte mensajes.')) return;

    sessionManager.getSession()
        .then(function(session) {
            if (!session) {
                showToast('⚠️ Inicia sesión', 'error');
                return;
            }

            return llamadaAPI('/api/mensajes/bloquear/' + usuarioId, {
                method: 'POST'
            });
        })
        .then(function(result) {
            if (!result) return;

            showToast('🚫 Usuario bloqueado');

            if (conversacionActual && conversacionActual.id === usuarioId) {
                conversacionActual = null;
                window._conversacionActualId = null;
                document.getElementById('chatNombre').textContent = 'Selecciona una conversación';
                document.getElementById('chatMessages').innerHTML = '<div class="empty-chat"><span class="icon">◈</span><h3>Usuario bloqueado</h3></div>';
            }

            return cargarConversaciones();
        })
        .catch(function(error) {
            Logger.error('Error bloqueando usuario', error);
            showToast('❌ Error al bloquear usuario', 'error');
        });
}

// ================================================================
// ================================================================
// 🔍 BUSCAR EN CONVERSACIÓN
// ================================================================
// ================================================================

function buscarEnConversacion(query) {
    if (!query || !query.trim()) {
        showToast('⚠️ Escribe algo para buscar', 'warning');
        return;
    }

    if (!conversacionActual) {
        showToast('⚠️ Selecciona una conversación', 'error');
        return;
    }

    sessionManager.getSession()
        .then(function(session) {
            if (!session) return;

            showLoading('Buscando...');

            return supabase
                .from('mensajes_chat')
                .select('*')
                .or('and(remitente_id.eq.' + session.user.id + ',destinatario_id.eq.' + conversacionActual.id + '),and(remitente_id.eq.' + conversacionActual.id + ',destinatario_id.eq.' + session.user.id + ')')
                .eq('eliminado', false)
                .ilike('contenido', '%' + query.trim() + '%')
                .order('created_at', { ascending: true });
        })
        .then(function(result) {
            hideLoading();
            if (!result) return;
            if (result.error) throw result.error;

            var container = document.getElementById('chatMessages');
            var data = result.data || [];

            if (data.length === 0) {
                container.innerHTML = '<div class="empty-chat"><span class="icon">◈</span><h3>No se encontraron resultados</h3><p>No hay mensajes que coincidan con "' + escapeHTML(query) + '"</p><button onclick="cargarMensajes(\'' + conversacionActual.id + '\')" style="margin-top:12px;padding:8px 20px;background:linear-gradient(135deg,#d4af37,#c49a2a);border:none;border-radius:30px;color:#0b0e14;font-weight:600;cursor:pointer;">Volver</button></div>';
                return;
            }

            var html = '';
            for (var i = 0; i < data.length; i++) {
                html += crearMensajeHTML(data[i]);
            }
            container.innerHTML = html;
            container.scrollTop = container.scrollHeight;
            showToast('🔍 Encontrados ' + data.length + ' mensajes', 'success');
        })
        .catch(function(error) {
            hideLoading();
            Logger.error('Error buscando', error);
            showToast('❌ Error al buscar', 'error');
        });
}

// ================================================================
// ================================================================
// ✎ NUEVA CONVERSACIÓN (ABRIR MODAL)
// ================================================================
// ================================================================

function nuevaConversacion() {
    document.getElementById('modalNuevoContacto').classList.add('show');
    document.getElementById('searchInputModal').value = '';
    document.getElementById('resultadosBusqueda').innerHTML = '<div style="padding:20px;text-align:center;color:#667788;font-size:0.75rem;">Escribe al menos 2 caracteres para buscar</div>';
    setTimeout(function() {
        document.getElementById('searchInputModal').focus();
    }, 200);
}

function cerrarModalNuevoContacto() {
    document.getElementById('modalNuevoContacto').classList.remove('show');
}

// ================================================================
// ================================================================
// 🧹 LIMPIEZA DE RECURSOS
// ================================================================
// ================================================================

function limpiarRecursosMensajes() {
    if (currentChannel) {
        try { supabase.removeChannel(currentChannel); } catch (e) {}
        currentChannel = null;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch (e) {}
    }
    if (audioChunks.length > 0) {
        audioChunks = [];
    }
    archivosSeleccionados = [];
    grabacionActiva = false;
    hideLoading();
}

window.addEventListener('beforeunload', limpiarRecursosMensajes);

// ================================================================
// ================================================================
// 🔄 INICIALIZACIÓN
// ================================================================
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    Logger.info('Sistema de mensajes inicializado');

    // CONTADOR DE CARACTERES
    var input = document.getElementById('chatInput');
    if (input) {
        var counter = document.createElement('div');
        counter.id = 'charCounter';
        counter.style.cssText = 'font-size:0.6rem;color:#8899aa;text-align:right;padding:4px;';
        counter.textContent = '0/10000';
        input.parentNode.appendChild(counter);

        input.addEventListener('input', function() {
            var max = 10000;
            var len = this.value.length;
            counter.textContent = len + '/' + max;
            counter.style.color = len > max * 0.9 ? '#ef4444' : '#8899aa';

            if (len > max) {
                this.value = this.value.substring(0, max);
                showToast('⚠️ Límite de 10,000 caracteres', 'warning');
            }
        });
    }

    cargarConversaciones();

    var chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                enviarMensaje();
            }
        });
    }

    var btnEnviar = document.getElementById('btnEnviar');
    if (btnEnviar) {
        btnEnviar.addEventListener('click', enviarMensaje);
    }

    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            buscarContactos(e.target.value);
        });
    }

    var searchInputModal = document.getElementById('searchInputModal');
    if (searchInputModal) {
        searchInputModal.addEventListener('input', function(e) {
            buscarContactos(e.target.value);
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarModalNuevoContacto();
        }
    });
});

// ================================================================
// ================================================================
// 🎯 EXPOSICIÓN GLOBAL
// ================================================================
// ================================================================

window.cargarConversaciones = cargarConversaciones;
window.abrirConversacion = abrirConversacion;
window.enviarMensaje = enviarMensaje;
window.eliminarMensaje = eliminarMensaje;
window.editarMensaje = editarMensaje;
window.eliminarConversacion = eliminarConversacion;
window.bloquearUsuario = bloquearUsuario;
window.reportarMensaje = reportarMensaje;
window.buscarEnConversacion = buscarEnConversacion;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.agregarContacto = agregarContacto;
window.buscarContactos = buscarContactos;
window.seleccionarArchivo = seleccionarArchivo;
window.handleFileSelect = handleFileSelect;
window.toggleGrabacionVoz = toggleGrabacionVoz;
window.showToast = showToast;
window.limpiarRecursosMensajes = limpiarRecursosMensajes;