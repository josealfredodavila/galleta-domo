// ================================================================
// MENSAJES · CHAT
// ================================================================
// Abrir conversación, enviar mensajes, render de burbujas,
// realtime, scroll automático, typing del bot, marcar leído.
// Depende de: mensajes-config.js, mensajes-utils.js, mensajes-auth.js, mensajes-conversaciones.js
// ================================================================

// ================================================================
// ABRIR CONVERSACIÓN
// ================================================================
async function openConversation(id) {
    if (!(await auth())) return;

    var p = await profile(id);
    var esBot = (id === BOT_ID);
    current = { id: id, profile: p, bot: esBot };

    var chatName = $('chatName');
    var chatAvatar = $('chatAvatar');
    var chatStatus = $('chatStatus');
    var voiceBotBtn = $('voiceBot');
    var chatActions = $('chatActions');
    var composer = $('composer');
    var emptyState = $('emptyState');
    var panel = $('panel');

    if (chatName) chatName.textContent = p.nombre || 'Usuario';

    if (chatAvatar) {
        chatAvatar.innerHTML = esBot
            ? '✦'
            : (p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="">' : esc((p.nombre || '◈').charAt(0).toUpperCase()));
        chatAvatar.className = 'avatar' + (esBot ? ' avatar-bot' : '');
    }

    if (chatStatus) {
        chatStatus.textContent = esBot ? '✦ IA · Siempre disponible' : (p.online ? '◉ En línea' : '◈ Desconectado');
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

    if (voiceBotBtn) voiceBotBtn.style.display = esBot ? 'inline-flex' : 'none';
    if (chatActions) chatActions.style.display = 'flex';
    if (composer) composer.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (panel) panel.classList.add('chat-open');

    document.querySelectorAll('.conv').forEach(function(x) {
        x.classList.toggle('active', x.dataset.id === id);
    });

    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();

    // ---- SI ES EL BOT: cargar conversación del bot ----
    if (esBot) {
        try {
            await db
                .from('mensajes_chat')
                .update({ leido: true })
                .eq('remitente_id', BOT_UUID)
                .eq('destinatario_id', user.id)
                .eq('leido', false);

            var badge = $('botBadge');
            if (badge) {
                badge.textContent = 'IA';
                badge.style.color = 'var(--success)';
            }
        } catch (e) {
            console.warn('Error marcando leído bot:', e);
        }
        await abrirConversacionBot();
        return;
    }

    // ---- CHAT NORMAL: cargar mensajes ----
    try {
        var r = await db
            .from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + id + '),and(remitente_id.eq.' + id + ',destinatario_id.eq.' + user.id + ')')
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
    } catch (e) {
        console.error('Error abriendo chat:', e);
    }
}

// ================================================================
// CERRAR CONVERSACIÓN
// ================================================================
async function cerrarConversacion() {
    current = null;

    var panel = $('panel');
    var chatName = $('chatName');
    var chatStatus = $('chatStatus');
    var chatAvatar = $('chatAvatar');
    var chatActions = $('chatActions');
    var composer = $('composer');
    var emptyState = $('emptyState');
    var box = $('messages');

    if (panel) panel.classList.remove('chat-open');
    if (chatName) chatName.textContent = 'Selecciona una conversación';
    if (chatStatus) chatStatus.textContent = '◈ En espera';
    if (chatAvatar) {
        chatAvatar.innerHTML = '◈';
        chatAvatar.className = 'avatar';
        chatAvatar.onclick = null;
    }
    if (chatActions) chatActions.style.display = 'none';
    if (composer) composer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';

    if (box) {
        box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
    }
    document.querySelectorAll('.conv').forEach(function(x) { x.classList.remove('active'); });
}

// ================================================================
// ABRIR CONVERSACIÓN CON EL BOT (Marquinhos)
// ================================================================
async function abrirConversacionBot() {
    var box = $('messages');
    if (!box) return;

    var btn = box.querySelector('#scrollDownBtn');
    var anchor = box.querySelector('#scrollAnchor');

    box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });

    // Asegurar que exista el anchor
    if (!anchor) {
        var newAnchor = document.createElement('div');
        newAnchor.id = 'scrollAnchor';
        box.appendChild(newAnchor);
        anchor = newAnchor;
    }

    // Asegurar que exista el botón scroll-down
    if (!btn) {
        var newBtn = document.createElement('button');
        newBtn.className = 'scroll-down-btn';
        newBtn.id = 'scrollDownBtn';
        newBtn.innerHTML = '↓<span class="badge-new" id="newMsgBadge" style="display:none;">1</span>';
        box.appendChild(newBtn);
        newBtn.onclick = function() {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
    }

    var historial = [];
    try {
        var r = await db
            .from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: true })
            .limit(200);

        if (!r.error) historial = r.data || [];
    } catch (e) {
        console.warn('No se pudo cargar historial del bot:', e);
    }

    var anchorRef = box.querySelector('#scrollAnchor');

    if (!historial.length) {
        anchorRef.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received">' +
                '<div class="bubble">' +
                    '<div class="bubble-bot-info">✦ MARQUINHOS</div>' +
                    '¡Hola! 👋 Soy Marquinhos, el asistente de Sariel\'s. Puedes:<br><br>' +
                    '◈ Escribirme un mensaje de texto<br>' +
                    '◈ Enviarme una nota de voz con 🎙️<br>' +
                    '◈ Hablarme con el botón 🔊 (te responderé con voz)<br><br>' +
                    '¿En qué te puedo ayudar hoy?' +
                '</div>' +
            '</div>');
        isUserAtBottom = true;
        scrollToBottom(true);
        return;
    }

    var signedUrls = await Promise.all(historial.map(function(m) { return getSignedUrlForMessage(m); }));

    historial.forEach(function(m, i) {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ================================================================
// RENDERIZAR MENSAJES EN EL CHAT
// ================================================================
async function renderMessages(rows) {
    var box = $('messages');
    if (!box) return;

    box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });

    var anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        box.appendChild(anchor);
    }

    if (!rows.length) {
        anchor.insertAdjacentHTML('beforebegin',
            '<div class="empty"><strong>◈</strong><div>Sin mensajes</div><small>Envía el primer mensaje</small></div>');
        return;
    }

    var signedUrls = await Promise.all(rows.map(function(m) { return getSignedUrlForMessage(m); }));

    rows.forEach(function(m, i) {
        anchor.insertAdjacentHTML('beforebegin', messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ================================================================
// HTML DE UN MENSAJE
// ================================================================
function messageHTML(m, sent, signedUrl) {
    var body = esc(limpiarMarkdown(m.contenido || ''));
    var urlToUse = signedUrl || m.imagen_url;

    if (urlToUse) {
        if (m.tipo === 'imagen') {
            body = '<img src="' + esc(urlToUse) + '" alt="' + esc(m.nombre_archivo || 'Imagen') + '" loading="lazy">';
        } else if (m.tipo === 'video') {
            body = '<video controls playsinline src="' + esc(urlToUse) + '"></video>';
        } else if (m.tipo === 'audio') {
            body = '<audio controls preload="metadata" src="' + esc(urlToUse) + '"></audio>';
        } else {
            var displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido) || 'Archivo');
            body = '📎 <a href="' + esc(urlToUse) + '" target="_blank" rel="noopener" style="color:var(--gold)">' + displayName + '</a>';
        }
    }

    var esBotRecibido = !sent && (m.es_bot || m.bot_message);
    var headerBot = esBotRecibido ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';

    var meta = '';
    if (m.created_at) {
        meta = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (sent) {
        meta += m.leido ? ' · ◆◆' : ' · ◈◈';
    }

    return '<div class="bubblewrap ' + (sent ? 'sent' : 'received') + '">' +
        '<div class="bubble">' + headerBot + body + '</div>' +
        '<div class="meta">' + meta + '</div>' +
    '</div>';
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================
async function sendMessage(text) {
    if (!current || !text.trim()) return;
    if (!(await auth())) return;

    var textoLimpio = text.trim();
    var inputEl = $('messageInput');
    if (inputEl) inputEl.value = '';

    // ---- SI ES EL BOT: delegar a mensajes-bot.js ----
    if (current.bot) {
        if (typeof enviarMensajeAlBot === 'function') {
            await enviarMensajeAlBot(textoLimpio);
        }
        return;
    }

    // ---- CHAT NORMAL ----
    try {
        var r = await db
            .from('mensajes_chat')
            .insert({
                remitente_id: user.id,
                destinatario_id: current.id,
                contenido: textoLimpio,
                tipo: 'texto',
                leido: false,
                editado: false,
                eliminado: false
            })
            .select('*')
            .single();

        if (r.error) {
            console.error(r.error);
            toast('❌ Error al enviar mensaje', 'error');
            return;
        }

        await append(r.data, true);
        loadConversations();
    } catch (e) {
        console.error('Error al enviar:', e);
        toast('❌ Error al enviar mensaje', 'error');
    }
}

// ================================================================
// AÑADIR MENSAJE AL DOM
// ================================================================
async function append(m, sent) {
    var box = $('messages');
    if (!box) return;

    var empty = box.querySelector('.empty');
    if (empty) empty.remove();

    var signedUrl = await getSignedUrlForMessage(m);
    var anchorRef = box.querySelector('#scrollAnchor');

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

// ================================================================
// MARCAR MENSAJES COMO LEÍDOS
// ================================================================
async function markRead(id) {
    if (!user || id === BOT_ID) return;
    try {
        await db
            .from('mensajes_chat')
            .update({ leido: true })
            .eq('remitente_id', id)
            .eq('destinatario_id', user.id)
            .eq('leido', false)
            .eq('eliminado', false);
    } catch (e) {
        console.warn('Error marcando leído:', e);
    }
}

// ================================================================
// SUSCRIPCIÓN REALTIME A NUEVOS MENSAJES
// ================================================================
function subscribeMessages(id) {
    if (id === BOT_ID) return;

    if (msgChannel) {
        try { db.removeChannel(msgChannel); } catch (e) {}
    }

    msgChannel = db
        .channel('chat-' + id)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_chat'
        }, function(p) {
            var m = p.new;
            if (current && current.id === id && m.remitente_id === id && m.destinatario_id === user.id) {
                append(m, false);
                markRead(id);
            }
        })
        .subscribe();
}

// ================================================================
// SCROLL AUTOMÁTICO
// ================================================================
function scrollToBottom(force) {
    if (force === undefined) force = false;
    var box = $('messages');
    if (!box) return;
    if (!force && !isUserAtBottom) return;

    var doScroll = function() {
        var anchor = document.getElementById('scrollAnchor');
        if (anchor) anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
        else box.scrollTop = box.scrollHeight;
    };

    doScroll();
    requestAnimationFrame(doScroll);

    if (scrollRetryTimer) clearInterval(scrollRetryTimer);
    var intentos = 0;
    scrollRetryTimer = setInterval(function() {
        intentos++;
        if (force || isUserAtBottom) doScroll();
        if (intentos >= 10) {
            clearInterval(scrollRetryTimer);
            scrollRetryTimer = null;
        }
    }, 100);

    if (force || isUserAtBottom) {
        ocultarFlechaNuevos();
    }
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

function observarCargaMultimedia(box) {
    if (!box) return;
    box.querySelectorAll('img, audio, video').forEach(function(el) {
        if (el.dataset.scrollListener) return;
        el.dataset.scrollListener = '1';

        var onLoad = function() {
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
// TYPING INDICATOR DEL BOT
// ================================================================
function mostrarTypingBot() {
    var box = $('messages');
    if (!box) return;

    var empty = box.querySelector('.empty');
    if (empty) empty.remove();

    var anchorRef = box.querySelector('#scrollAnchor');
    if (anchorRef) {
        anchorRef.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received" id="typing-bot">' +
                '<div class="bubble">' +
                    '<div class="bubble-bot-info">✦ MARQUINHOS</div>' +
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