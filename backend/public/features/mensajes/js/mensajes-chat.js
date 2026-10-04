// ================================================================
// MENSAJES · CHAT
// ================================================================
// Apertura, cierre, render de burbujas, envío, realtime, scroll,
// typing del bot, marcar leído, empty state.
// Se carga DESPUÉS de config, utils, auth, estados, conversaciones.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// COMPATIBLE CON: tabla mensajes_chat (con es_bot, bot_nombre, etc.).
// ================================================================

'use strict';

// ================================================================
// ESTADO INTERNO
// ================================================================
var _ultimoEnvio = 0;                  // anti-spam envíos
var _renderToken = 0;                  // anti-race en renderMessages
var _mensajesRenderizados = new Set(); // anti-duplicados en realtime
var MAX_RENDERED_SET = 500;

function _yaRenderizado(id) {
    if (!id) return false;
    return _mensajesRenderizados.has(id);
}

function _marcarRenderizado(id) {
    if (!id) return;
    if (_mensajesRenderizados.size >= MAX_RENDERED_SET) {
        // Eliminar el primero (Set mantiene orden de inserción)
        var first = _mensajesRenderizados.values().next().value;
        _mensajesRenderizados.delete(first);
    }
    _mensajesRenderizados.add(id);
}

function _resetearRenderizados() {
    _mensajesRenderizados.clear();
}

// ================================================================
// ABRIR CONVERSACIÓN
// ================================================================
async function openConversation(id) {
    if (!await auth()) return;

    var esBot = (id === BOT_ID || id === BOT_UUID);
    var idNormalizado = esBot ? BOT_UUID : id;

    if (!esBot && !esUUID(id)) {
        console.warn('[Mensajes/Chat] ID inválido:', id);
        return;
    }

    // Snapshot del chat ID al inicio
    var chatIdAlInicio = idNormalizado;

    var p = esBot ? await profile(BOT_ID) : await profile(idNormalizado);

    // Verificar que no cambió de chat mientras cargaba el perfil
    // (no hay current aún, pero por si acaso)

    current = { id: idNormalizado, profile: p, bot: esBot };

    // ---- Header ----
    var chatName = $('chatName');
    if (chatName) chatName.textContent = p.nombre || 'Usuario';

    var chatAvatar = $('chatAvatar');
    if (chatAvatar) {
        chatAvatar.innerHTML = esBot
            ? '✦'
            : (p.avatar_url && urlSegura(p.avatar_url)
                ? '<img src="' + esc(p.avatar_url) + '" alt="">'
                : esc((p.nombre || '◈').charAt(0).toUpperCase()));
        chatAvatar.className = 'avatar' + (esBot ? ' avatar-bot' : '');
    }

    var chatStatus = $('chatStatus');
    if (chatStatus) {
        chatStatus.textContent = esBot
            ? '✦ IA · Siempre disponible'
            : (p.online ? '◉ En línea' : '◈ Desconectado');
        chatStatus.className = 'status' + (p.online ? ' online' : '');
    }

    if (chatAvatar) {
        chatAvatar.onclick = function() {
            if (esBot) {
                toast('ℹ️ Marquinhos es un asistente IA', 'warning');
                return;
            }
            verFotoAmpliada(p.avatar_url, p.nombre, p.handle);
        };
    }

    // ---- UI ----
    var voiceBot = $('voiceBot');
    if (voiceBot) voiceBot.style.display = esBot ? 'inline-flex' : 'none';

    var chatActions = $('chatActions');
    if (chatActions) chatActions.style.display = 'flex';

    var composer = $('composer');
    if (composer) composer.style.display = 'flex';

    var emptyState = $('emptyState');
    if (emptyState) emptyState.style.display = 'none';

    var panel = $('panel');
    if (panel) panel.classList.add('chat-open');

    document.querySelectorAll('.conv').forEach(function(x) {
        var match = esBot ? (x.dataset.id === BOT_ID) : (x.dataset.id === idNormalizado);
        x.classList.toggle('active', match);
    });

    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();

    // ============================================================
    // CHAT DEL BOT
    // ============================================================
    if (esBot) {
        try {
            await db.from('mensajes_chat')
                .update({ leido: true })
                .eq('remitente_id', BOT_UUID)
                .eq('destinatario_id', user.id)
                .eq('leido', false);
        } catch (e) {
            console.warn('[Mensajes/Chat] No se pudo marcar leído del bot:', e);
        }

        var badge = $('botBadge');
        if (badge) {
            badge.textContent = 'IA';
            badge.style.color = 'var(--success)';
        }

        // Verificar que seguimos en el chat del bot
        if (!current || current.id !== chatIdAlInicio) return;

        await abrirConversacionBot();
        return;
    }

    // ============================================================
    // CHAT NORMAL
    // ============================================================
    try {
        var r = await db
            .from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + idNormalizado + '),and(remitente_id.eq.' + idNormalizado + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: true })
            .limit(100);

        // Verificar que seguimos en el mismo chat
        if (!current || current.id !== chatIdAlInicio) {
            if (window.DEBUG_CHAT) console.warn('[Mensajes/Chat] Chat cambió durante carga');
            return;
        }

        if (r.error) {
            console.error('[Mensajes/Chat] Error cargando mensajes:', r.error);
            toast('❌ Error al cargar mensajes', 'error');
            return;
        }

        await renderMessages(r.data || []);

        // Marcar leído (no bloqueante)
        markRead(idNormalizado).catch(function() {});

        subscribeMessages(idNormalizado);
    } catch (e) {
        console.error('[Mensajes/Chat] Error abriendo chat:', e);
        toast('❌ Error al abrir la conversación', 'error');
    }
}

// ================================================================
// CERRAR CONVERSACIÓN
// ================================================================
function cerrarConversacionUI() {
    var panel = $('panel');
    if (panel) panel.classList.remove('chat-open');

    var chatName = $('chatName');
    if (chatName) chatName.textContent = 'Selecciona una conversación';

    var chatStatus = $('chatStatus');
    if (chatStatus) chatStatus.textContent = '◈ En espera';

    var chatAvatar = $('chatAvatar');
    if (chatAvatar) {
        chatAvatar.innerHTML = '◈';
        chatAvatar.className = 'avatar';
        chatAvatar.onclick = null;
    }

    var chatActions = $('chatActions');
    if (chatActions) chatActions.style.display = 'none';

    var composer = $('composer');
    if (composer) composer.style.display = 'none';

    document.querySelectorAll('.conv').forEach(function(x) {
        x.classList.remove('active');
    });
}

async function cerrarConversacion() {
    // Cancelar realtime
    if (msgChannel && db) {
        try { await db.removeChannel(msgChannel); } catch (e) {}
        msgChannel = null;
    }

    // Cancelar grabación activa (si hay)
    if (typeof cancelarOperacionesBot === 'function') {
        try { cancelarOperacionesBot(); } catch (e) {}
    }

    current = null;

    cerrarConversacionUI();

    // Mostrar empty state
    mostrarEmptyState('Selecciona una conversación', 'Elige un chat de la lista para empezar a hablar');

    // Limpiar chat
    await limpiarEstadoConversacion();

    // Resetear contadores
    unreadCount = 0;
    isUserAtBottom = true;
    actualizarFlecha();
}

// ================================================================
// EMPTY STATE
// ================================================================
function mostrarEmptyState(texto, subtexto) {
    var box = $('messages');
    if (!box) return;

    // Eliminar cualquier empty existente
    box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });

    var anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        box.appendChild(anchor);
    }

    var empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<strong>◈</strong><p></p><small></small>';

    var p = empty.querySelector('p');
    if (p) p.textContent = texto || 'Sin mensajes';

    var s = empty.querySelector('small');
    if (s) s.textContent = subtexto || '';

    box.insertBefore(empty, box.firstChild);
}

// ================================================================
// ABRIR CONVERSACIÓN CON EL BOT
// ================================================================
async function abrirConversacionBot() {
    var box = $('messages');
    if (!box) {
        console.warn('[Mensajes/Chat] abrirConversacionBot: #messages no existe');
        return;
    }

    var chatIdAlInicio = current && current.id;

    // ---- Limpiar ----
    box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
    box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });
    _resetearRenderizados();

    // ---- Asegurar UI base ----
    var anchor = asegurarAnchor(box);
    asegurarBotonScroll(box);

    if (!user || !user.id) {
        mostrarErrorEnChat(box, 'No hay sesión activa. Recarga la página.');
        return;
    }

    if (!esUUID(BOT_UUID)) {
        mostrarErrorEnChat(box, 'BOT_UUID inválido. Revisa mensajes-config.js.');
        return;
    }

    // ---- Cargar historial ----
    var historial = [];
    var errorHistorial = null;

    try {
        var r = await db
            .from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: true })
            .limit(200);

        if (r.error) {
            errorHistorial = r.error;
        } else {
            historial = r.data || [];
        }
    } catch (e) {
        errorHistorial = e;
    }

    // ---- Verificar que seguimos en el bot ----
    if (!current || current.id !== chatIdAlInicio) {
        if (window.DEBUG_CHAT) console.warn('[Mensajes/Chat] Chat cambió durante carga del bot');
        return;
    }

    if (!document.body.contains(box)) return;

    // Re-obtener anchor
    anchor = box.querySelector('#scrollAnchor');
    if (!anchor) anchor = asegurarAnchor(box);
    if (!anchor) return;

    if (errorHistorial) {
        mostrarErrorEnChat(box, 'Error al cargar historial: ' + (errorHistorial.message || 'desconocido'));
        return;
    }

    // ---- Sin historial: bienvenida ----
    if (!historial.length) {
        anchor.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received">' +
                '<div class="bubble">' +
                    '<div class="bubble-bot-info">✦ ' + BOT_NOMBRE.toUpperCase() + '</div>' +
                    '¡Hola! 👋 Soy ' + BOT_NOMBRE + ', el asistente de Sariel\'s. Puedes:' +
                    '<br><br>' +
                    '◈ Escribirme un mensaje de texto<br>' +
                    '◈ Enviarme una nota de voz<br>' +
                    '◈ Hablarme con el botón 🔊 (te responderé con voz)' +
                    '<br><br>' +
                    '¿En qué te puedo ayudar hoy?' +
                '</div>' +
            '</div>');
        isUserAtBottom = true;
        scrollToBottom(true);
        return;
    }

    // ---- Cargar URLs firmadas ----
    var results = await Promise.allSettled(
        historial.map(function(m) { return getSignedUrlForMessage(m); })
    );

    // Verificación final
    if (!current || current.id !== chatIdAlInicio) return;
    if (!document.body.contains(box)) return;

    anchor = box.querySelector('#scrollAnchor');
    if (!anchor) return;

    // ---- Renderizar ----
    var insertados = 0;
    historial.forEach(function(m, i) {
        if (_yaRenderizado(m.id)) return;
        _marcarRenderizado(m.id);

        var url = (results[i] && results[i].status === 'fulfilled') ? results[i].value : null;
        var esMio = esMensajeMio(m);

        try {
            anchor.insertAdjacentHTML('beforebegin', messageHTML(m, esMio, url));
            insertados++;
        } catch (e) {
            console.warn('[Mensajes/Chat] Error insertando mensaje:', e);
        }
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);

    if (window.DEBUG_CHAT) {
        console.log('[Mensajes/Chat] ✅ Historial del bot renderizado:', insertados);
    }
}

// ================================================================
// RENDERIZAR MENSAJES (chat normal)
// ================================================================
async function renderMessages(rows) {
    var box = $('messages');
    if (!box) return;

    var miToken = ++_renderToken;

    // Limpiar
    box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
    box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });
    _resetearRenderizados();

    var anchor = asegurarAnchor(box);

    if (!rows || !rows.length) {
        mostrarEmptyState('Sin mensajes', 'Envía el primer mensaje');
        return;
    }

    // Cargar URLs firmadas
    var results = await Promise.allSettled(
        rows.map(function(m) { return getSignedUrlForMessage(m); })
    );

    // Verificar token (anti-race)
    if (miToken !== _renderToken) return;
    if (!current) return;
    if (!document.body.contains(box)) return;

    anchor = box.querySelector('#scrollAnchor');
    if (!anchor) return;

    rows.forEach(function(m, i) {
        if (_yaRenderizado(m.id)) return;
        _marcarRenderizado(m.id);

        var url = (results[i] && results[i].status === 'fulfilled') ? results[i].value : null;
        var esMio = esMensajeMio(m);
        anchor.insertAdjacentHTML('beforebegin', messageHTML(m, esMio, url));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ================================================================
// HELPERS INTERNOS
// ================================================================
function asegurarAnchor(box) {
    if (!box) return null;
    var anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        box.appendChild(anchor);
    }
    return anchor;
}

function asegurarBotonScroll(box) {
    if (!box) return;
    var btn = box.querySelector('#scrollDownBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'scroll-down-btn';
        btn.id = 'scrollDownBtn';
        btn.innerHTML = icono('flechaAbajo', 18) + '<span class="badge-new" id="newMsgBadge" style="display:none;">1</span>';
        btn.onclick = function() {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
        box.appendChild(btn);
    }
}

function mostrarErrorEnChat(box, mensaje) {
    try {
        if (!box) return;
        var anchor = asegurarAnchor(box);
        if (!anchor) return;

        var esc_msg = esc(String(mensaje || ''));
        anchor.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received">' +
                '<div class="bubble" style="border:1px solid var(--danger);background:rgba(255,51,102,0.08);">' +
                    '<div class="bubble-bot-info">✦ ERROR</div>' +
                    '<div style="color:var(--danger);font-size:.8rem;">⚠️ ' + esc_msg + '</div>' +
                '</div>' +
            '</div>');

        scrollToBottom(true);
    } catch (e) {
        console.error('[Mensajes/Chat] Error renderizando error:', e, '| original:', mensaje);
    }
}

function esMensajeMio(m) {
    if (!m) return false;
    if (!user || !user.id) return false;
    if (m.remitente_id === user.id) return true;
    if (m.destinatario_id === m.remitente_id) return true; // auto-envío
    return false;
}

// ================================================================
// HTML DE MENSAJE
// ================================================================
function messageHTML(m, sent, signedUrl) {
    sent = Boolean(sent);

    var body = esc(limpiarMarkdown(m.contenido || ''));
    var urlToUse = signedUrl || m.imagen_url;
    var urlOk = urlToUse && urlSegura(urlToUse);

    if (urlOk) {
        if (m.tipo === 'imagen') {
            body = '<img src="' + esc(urlToUse) + '" alt="' + esc(m.nombre_archivo || 'Imagen') + '" loading="lazy">';
        } else if (m.tipo === 'video') {
            body = '<video controls playsinline preload="metadata" src="' + esc(urlToUse) + '"></video>';
        } else if (m.tipo === 'audio') {
            body = '<audio controls preload="metadata" src="' + esc(urlToUse) + '"></audio>';
        } else if (m.tipo === 'archivo') {
            var displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido || '') || 'Archivo');
            body = '<span class="file-icon">' + icono('doc', 16) + '</span> ' +
                   '<a href="' + esc(urlToUse) + '" target="_blank" rel="noopener" style="color:var(--gold)">' + displayName + '</a>';
        }
    } else if (urlToUse && !urlOk) {
        var fallbackName = esc(m.nombre_archivo || 'Archivo');
        body = '<span class="file-icon">' + icono('doc', 16) + '</span> ' + fallbackName;
    }

    // Header del bot (si es mensaje recibido del bot)
    var esBotRecibido = !sent && (m.es_bot === true || m.remitente_id === BOT_UUID || m.bot_message === true);
    var headerBot = esBotRecibido
        ? '<div class="bubble-bot-info">✦ ' + (m.bot_nombre || BOT_NOMBRE).toUpperCase() + '</div>'
        : '';

    // Meta (hora + leído)
    var meta = '';
    if (m.created_at) {
        meta = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (sent) {
        meta += m.leido ? ' · ◆◆' : ' · ◈◈';
    }

    // Punto de no leído
    var esNoLeido = !sent && m.leido === false;
    var unreadDot = esNoLeido ? '<span class="unread-dot" title="No leído"></span>' : '';

    // IDs
    var msgIdRaw = m.id || ('temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    var msgIdSafe = safeDomId(msgIdRaw);
    var idAttr = m.id ? ('id="msg-' + msgIdSafe + '" ') : '';

    var wrapClass = 'bubblewrap ' + (sent ? 'sent' : 'received') + (esNoLeido ? ' is-unread' : '');

    return '<div ' + idAttr + 'class="' + wrapClass + '" data-msg-id="' + esc(msgIdSafe) + '" data-remitente-id="' + esc(m.remitente_id || '') + '">' +
        '<div class="bubble">' + headerBot + body + '</div>' +
        '<div class="meta">' + unreadDot + meta + '</div>' +
    '</div>';
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================
async function sendMessage(text) {
    if (!current || !text || !text.trim()) return;

    // Anti-spam
    var ahora = Date.now();
    if (ahora - _ultimoEnvio < 500) return;
    _ultimoEnvio = ahora;

    if (!await auth()) return;

    var textoLimpio = String(text).trim();

    if (textoLimpio.length > MAX_TEXTO_LEN) {
        toast('⚠️ Máximo ' + MAX_TEXTO_LEN + ' caracteres', 'error');
        return;
    }

    // Snapshot chat ID
    var chatIdAlEnvio = current.id;
    var esBotAlEnvio = current.bot;

    try {
        if (esBotAlEnvio) {
            await enviarMensajeAlBot(textoLimpio, chatIdAlEnvio);
        } else {
            await enviarMensajeNormal(textoLimpio, chatIdAlEnvio);
        }

        // Limpiar input SOLO tras éxito
        var inputEl = $('messageInput');
        if (inputEl) inputEl.value = '';
    } catch (e) {
        console.error('[Mensajes/Chat] Error en sendMessage:', e);
        toast('❌ Error al enviar mensaje', 'error');
    }
}

async function enviarMensajeNormal(textoLimpio, chatIdCapturado) {
    try {
        var r = await db
            .from('mensajes_chat')
            .insert({
                remitente_id: user.id,
                destinatario_id: chatIdCapturado,
                contenido: textoLimpio,
                tipo: 'texto',
                leido: false,
                editado: false,
                eliminado: false,
                es_bot: false
            })
            .select('*')
            .single();

        if (r.error || !r.data || !r.data.id) {
            console.error('[Mensajes/Chat] Error insert:', r.error);
            toast('❌ Error al enviar mensaje', 'error');
            return;
        }

        // Solo renderizar si seguimos en el mismo chat
        if (!current || current.id !== chatIdCapturado) {
            loadConversations();
            return;
        }

        _marcarRenderizado(r.data.id);
        await append(r.data, true);

        // Marcar como leído del destinatario
        await marcarConversacionComoLeida(chatIdCapturado, r.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Mensajes/Chat] Excepción enviando:', e);
        toast('❌ Error al enviar mensaje', 'error');
    }
}

async function enviarMensajeAlBot(textoLimpio, chatIdCapturado) {
    // ---- 1. Cargar historial ANTES de insertar el nuevo mensaje ----
    var historial = [];
    try {
        historial = await cargarHistorialParaBot();
    } catch (e) {
        console.warn('[Mensajes/Chat] No se pudo cargar historial:', e);
    }

    // ---- 2. Insertar mensaje del usuario ----
    var userMsg = {
        contenido: textoLimpio,
        created_at: new Date().toISOString(),
        tipo: 'texto',
        remitente_id: user.id,
        destinatario_id: BOT_UUID,
        leido: true,
        es_bot: false
    };

    try {
        var ins = await db
            .from('mensajes_chat')
            .insert({
                remitente_id: user.id,
                destinatario_id: BOT_UUID,
                contenido: textoLimpio,
                tipo: 'texto',
                leido: true,
                editado: false,
                eliminado: false,
                es_bot: false
            })
            .select('*')
            .single();

        if (!ins.error && ins.data) {
            userMsg = ins.data;
        } else {
            userMsg.id = 'tmp-' + Date.now();
        }
    } catch (e) {
        console.warn('[Mensajes/Chat] Excepción insert user msg:', e);
        userMsg.id = 'tmp-' + Date.now();
    }

    // Renderizar mensaje del usuario
    if (current && current.id === chatIdCapturado) {
        _marcarRenderizado(userMsg.id);
        await append(userMsg, true);
    }

    // ---- 3. Mostrar typing ----
    mostrarTypingBot();

    // ---- 4. Preguntar al bot ----
    try {
        var respuesta = await preguntarAlBot(textoLimpio, historial);

        var botMsg = {
            contenido: respuesta,
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: BOT_UUID,
            destinatario_id: user.id,
            leido: true,
            es_bot: true,
            bot_nombre: BOT_NOMBRE
        };

        // Guardar en BD siempre (para persistencia)
        try {
            var insBot = await db
                .from('mensajes_chat')
                .insert({
                    remitente_id: BOT_UUID,
                    destinatario_id: user.id,
                    contenido: respuesta,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false,
                    es_bot: true,
                    bot_nombre: BOT_NOMBRE
                })
                .select('*')
                .single();

            if (!insBot.error && insBot.data) {
                botMsg = Object.assign({}, insBot.data, { es_bot: true, bot_nombre: BOT_NOMBRE });
            }
        } catch (e) {
            console.warn('[Mensajes/Chat] No se pudo guardar respuesta bot:', e);
        }

        // Renderizar solo si seguimos en el chat del bot
        if (current && current.id === chatIdCapturado) {
            _marcarRenderizado(botMsg.id);
            isUserAtBottom = true;
            await append(botMsg, false);
            scrollToBottom(true);
        }

        loadConversations();
    } catch (e) {
        console.error('[Mensajes/Chat] Error Marquinhos:', e);

        var errorMsg = {
            contenido: '⚠️ ' + (e.message || 'Ups, tuve un problema.'),
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: BOT_UUID,
            destinatario_id: user.id,
            leido: true,
            es_bot: true,
            bot_nombre: BOT_NOMBRE
        };

        if (current && current.id === chatIdCapturado) {
            _marcarRenderizado(errorMsg.id || ('tmp-err-' + Date.now()));
            isUserAtBottom = true;
            await append(errorMsg, false);
            scrollToBottom(true);
        }
    } finally {
        quitarTypingBot();
    }
}

// ================================================================
// TYPING INDICATOR DEL BOT
// ================================================================
function mostrarTypingBot() {
    var box = $('messages');
    if (!box) return;

    // Si ya existe, no duplicar
    if ($('typing-bot')) return;

    box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });

    var anchorRef = box.querySelector('#scrollAnchor');
    if (anchorRef) {
        anchorRef.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received" id="typing-bot">' +
                '<div class="bubble">' +
                    '<div class="bubble-bot-info">✦ ' + BOT_NOMBRE.toUpperCase() + '</div>' +
                    '<div class="typing-indicator"><span></span><span></span><span></span></div>' +
                '</div>' +
            '</div>');
    }
    scrollToBottom(true);
}

function quitarTypingBot() {
    var el = $('typing-bot');
    if (el) el.remove();
}

// ================================================================
// AÑADIR MENSAJE AL DOM (append)
// ================================================================
async function append(m, sent) {
    if (!current) {
        if (window.DEBUG_CHAT) console.warn('[Mensajes/Chat] append sin current');
        return;
    }

    var box = $('messages');
    if (!box) return;

    // Anti-duplicado
    if (m.id) {
        var safeId = safeDomId(m.id);
        if (document.getElementById('msg-' + safeId)) return;
        if (_yaRenderizado(m.id) && !document.getElementById('msg-' + safeId)) {
            // Está marcado pero no en DOM → probablemente se limpió el chat
            // Permitir render
        }
    }

    if (m.id && !_yaRenderizado(m.id)) _marcarRenderizado(m.id);

    // Snapshot chat ID
    var chatIdAlInicio = current.id;

    // Obtener URL firmada
    var signedUrl = null;
    try {
        signedUrl = await getSignedUrlForMessage(m);
    } catch (e) {
        console.warn('[Mensajes/Chat] Signed URL falló:', m.id, e);
    }

    // Verificar chat
    if (!current || current.id !== chatIdAlInicio) return;
    if (!document.body.contains(box)) return;

    // Quitar empty
    box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });

    var anchorRef = box.querySelector('#scrollAnchor');
    if (!anchorRef) anchorRef = asegurarAnchor(box);
    if (!anchorRef) return;

    sent = Boolean(sent);

    // Insertar
    try {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, sent, signedUrl));
    } catch (e) {
        console.error('[Mensajes/Chat] Error insertando:', e);
        return;
    }

    observarCargaMultimedia(box);

    // Scroll
    if (!sent) {
        // Recibido
        if (isUserAtBottom) {
            ocultarFlechaNuevos();
            scrollToBottom(true);
        } else {
            unreadCount++;
            actualizarFlecha();
        }
    } else {
        // Enviado
        isUserAtBottom = true;
        scrollToBottom(true);
    }
}

// ================================================================
// MARCAR COMO LEÍDO
// ================================================================
async function marcarConversacionComoLeida(remitenteId, antesDe) {
    if (!user || !remitenteId) return;
    if (remitenteId === BOT_ID || remitenteId === BOT_UUID) return;
    if (!esUUID(remitenteId)) return;

    var timestamp = antesDe || new Date().toISOString();

    try {
        var r = await db
            .from('mensajes_chat')
            .update({ leido: true })
            .eq('remitente_id', remitenteId)
            .eq('destinatario_id', user.id)
            .eq('leido', false)
            .eq('eliminado', false)
            .lt('created_at', timestamp);

        if (r.error) {
            console.warn('[Mensajes/Chat] Error marcando leído:', r.error);
            return;
        }

        document.querySelectorAll('.bubblewrap.received.is-unread[data-remitente-id="' + remitenteId + '"]').forEach(function(el) {
            el.classList.remove('is-unread');
            var dot = el.querySelector('.unread-dot');
            if (dot) dot.remove();
        });
    } catch (e) {
        console.warn('[Mensajes/Chat] Excepción marcando leído:', e);
    }
}

async function markRead(id) {
    if (!id) return;
    await marcarConversacionComoLeida(id, new Date().toISOString());
}

// ================================================================
// REALTIME
// ================================================================
function subscribeMessages(id) {
    if (id === BOT_ID || id === BOT_UUID) return;
    if (!esUUID(id) || !user || !esUUID(user.id)) return;

    if (msgChannel) {
        try { db.removeChannel(msgChannel); } catch (e) {}
        msgChannel = null;
    }

    msgChannel = db
        .channel('chat-' + id)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_chat'
        }, function(p) {
            var m = p.new;
            if (!current) return;
            if (current.id !== id) return;
            if (!m) return;

            var esMio = m.remitente_id === user.id;
            var esParaMi = m.destinatario_id === user.id;

            if (!esMio && !esParaMi) return;
            if (esMio && !esAutoEnvio(m)) return;

            var safeId = safeDomId(m.id);
            if (!_yaRenderizado(m.id) && !document.getElementById('msg-' + safeId)) {
                _marcarRenderizado(m.id);
                append(m, esMio).then(function() {
                    if (!esMio) markRead(id);
                });
            }
        })
        .subscribe();
}

function esAutoEnvio(m) {
    if (!m) return false;
    return String(m.remitente_id) === String(m.destinatario_id);
}

// ================================================================
// SCROLL
// ================================================================
var _scrollRafId = null;

function scrollToBottom(force) {
    if (force === undefined) force = false;

    if (_scrollRafId !== null) {
        cancelAnimationFrame(_scrollRafId);
        _scrollRafId = null;
    }
    if (scrollRetryTimer) {
        clearInterval(scrollRetryTimer);
        scrollRetryTimer = null;
    }

    var box = $('messages');
    if (!box) return;
    if (!force && !isUserAtBottom) return;

    var doScroll = function() {
        var anchor = document.getElementById('scrollAnchor');
        if (anchor) anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
        else box.scrollTop = box.scrollHeight;
    };

    doScroll();
    _scrollRafId = requestAnimationFrame(function() {
        _scrollRafId = null;
        doScroll();
    });

    var intentos = 0;
    scrollRetryTimer = setInterval(function() {
        intentos++;
        if (force || isUserAtBottom) doScroll();
        if (intentos >= SCROLL_RETRY_MAX) {
            clearInterval(scrollRetryTimer);
            scrollRetryTimer = null;
        }
    }, SCROLL_RETRY_MS);

    if (force || isUserAtBottom) ocultarFlechaNuevos();
}

function actualizarFlecha() {
    var btn = $('scrollDownBtn');
    var badge = $('newMsgBadge');
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
    var box = $('messages');
    if (!box) return;

    var distanciaAlFondo = box.scrollHeight - box.scrollTop - box.clientHeight;
    var estabaAbajo = isUserAtBottom;
    isUserAtBottom = distanciaAlFondo < SCROLL_THRESHOLD;

    if (isUserAtBottom && !estabaAbajo) {
        ocultarFlechaNuevos();
    }
}

// ================================================================
// OBSERVAR MULTIMEDIA
// ================================================================
function observarCargaMultimedia(box) {
    if (!box) return;

    box.querySelectorAll('img, audio, video').forEach(function(el) {
        if (el.dataset.scrollListener) return;
        el.dataset.scrollListener = '1';

        var disparado = false;
        var onLoad = function() {
            if (disparado) return;
            disparado = true;

            if (isUserAtBottom) {
                var anchor = document.getElementById('scrollAnchor');
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
// LIMPIAR ESTADO DE CONVERSACIÓN
// ================================================================
async function limpiarEstadoConversacion() {
    _resetearRenderizados();

    var box = $('messages');
    if (box) {
        box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
        box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });
    }

    unreadCount = 0;
    isUserAtBottom = true;
    actualizarFlecha();

    // Cancelar timers
    if (scrollRetryTimer) {
        clearInterval(scrollRetryTimer);
        scrollRetryTimer = null;
    }
    if (_scrollRafId !== null) {
        cancelAnimationFrame(_scrollRafId);
        _scrollRafId = null;
    }

    // Cancelar realtime
    if (msgChannel && db) {
        try { await db.removeChannel(msgChannel); } catch (e) {}
        msgChannel = null;
    }

    // Cancelar operaciones del bot
    if (typeof cancelarOperacionesBot === 'function') {
        try { cancelarOperacionesBot(); } catch (e) {}
    }

    _ultimoEnvio = 0;
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.openConversation = openConversation;
window.cerrarConversacion = cerrarConversacion;
window.cerrarConversacionUI = cerrarConversacionUI;
window.abrirConversacionBot = abrirConversacionBot;
window.renderMessages = renderMessages;
window.messageHTML = messageHTML;
window.append = append;
window.sendMessage = sendMessage;
window.markRead = markRead;
window.marcarConversacionComoLeida = marcarConversacionComoLeida;
window.subscribeMessages = subscribeMessages;
window.scrollToBottom = scrollToBottom;
window.actualizarFlecha = actualizarFlecha;
window.ocultarFlechaNuevos = ocultarFlechaNuevos;
window.detectarSiEstaAbajo = detectarSiEstaAbajo;
window.observarCargaMultimedia = observarCargaMultimedia;
window.mostrarTypingBot = mostrarTypingBot;
window.quitarTypingBot = quitarTypingBot;
window.limpiarEstadoConversacion = limpiarEstadoConversacion;
window.mostrarEmptyState = mostrarEmptyState;
window._marcarRenderizado = _marcarRenderizado;
window._yaRenderizado = _yaRenderizado;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Chat] ✅ Chat cargado');
}