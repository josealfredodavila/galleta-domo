// ================================================================
// MENSAJES · CHAT (v3.4 — Renderizado robusto garantizado)
// ================================================================
// FIXES v3.4:
// - abrirConversacionBot: doble verificación de DOM + reaseguro de anchor
// - append(): detecta si el contenedor está visible, si no, fuerza render
// - renderMessages(): unificado para chat normal y bot
// - Bot: fuerza renderizado SIEMPRE sin importar isUserAtBottom
// - Auto-mensajes: detecta autoenvío y renderiza como "sent"
// - Guard `if (!current) return` reforzado
// - Logs de diagnóstico para producción
// ================================================================

// ----------------------------------------------------------------
// GUARDAS DE DEPENDENCIAS
// ----------------------------------------------------------------
[
    'BOT_ID','BOT_UUID','user','current','db','toast','auth','msgChannel',
    'isUserAtBottom','unreadCount','scrollRetryTimer','SCROLL_THRESHOLD',
    'subirArchivoChat','getSignedUrlForMessage','preguntarAlBot',
    'cargarHistorialParaBot','limpiarMarkdown','loadConversations','$','esc'
].forEach(function(n) {
    if (typeof window[n] === 'undefined') {
        console.warn('[Chat] Dependencia global ausente:', n);
    }
});

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------
var MAX_TEXTO_LEN       = 1000;
var MAX_AUDIO_SEGUNDOS  = 5 * 60;
var MAX_VIDEO_SEGUNDOS  = 2 * 60;
var MAX_VIDEO_BYTES     = 50 * 1024 * 1024;
var MAX_FOTO_BYTES      = 10 * 1024 * 1024;
var MAX_RENDERED_LRU    = 500;
var SCROLL_RETRY_MS     = 100;
var SCROLL_RETRY_MAX    = 10;
var KEYBOARD_SCROLL_MS  = 300;
var KEYBOARD_INPUT_MS   = 50;
var MARKREAD_DEBOUNCE   = 500;
var RATE_LIMIT_ENVIO_MS = 500;

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----------------------------------------------------------------
// POLYFILL: Promise.allSettled
// ----------------------------------------------------------------
if (typeof Promise.allSettled !== 'function') {
    Promise.allSettled = function(promises) {
        return Promise.all((promises || []).map(function(p) {
            return Promise.resolve(p).then(
                function(value) { return { status: 'fulfilled', value: value }; },
                function(reason) { return { status: 'rejected', reason: reason }; }
            );
        }));
    };
}

// ----------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------
function _esUUID(v) {
    return typeof v === 'string' && UUID_RE.test(v);
}

function _urlSegura(u) {
    if (!u || typeof u !== 'string') return false;
    try {
        var url = new URL(u, location.origin);
        return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:';
    } catch (e) {
        return false;
    }
}

function _esMensajeMio(m) {
    if (!m || !m.remitente_id) return false;
    var myId = (typeof user !== 'undefined' && user && user.id) ? user.id : null;
    if (!myId) return false;
    return String(m.remitente_id) === String(myId);
}

function _esAutoEnvio(m) {
    if (!m || !m.remitente_id || !m.destinatario_id) return false;
    return String(m.remitente_id) === String(m.destinatario_id);
}

function _safeDomId(id) {
    if (!id) return '';
    return String(id).replace(/[^a-zA-Z0-9-]/g, '');
}

// ✅ Detectar chat del bot (por ID)
function _esConversacionBot() {
    if (!current) return false;
    return current.bot === true
        || current.id === BOT_ID
        || current.id === BOT_UUID;
}

// ✅ Detectar si el remitente es el bot
function _esMensajeDelBot(m) {
    if (!m || !m.remitente_id) return false;
    var rid = String(m.remitente_id);
    return rid === BOT_ID || rid === BOT_UUID;
}

// ----------------------------------------------------------------
// REGISTRO LRU
// ----------------------------------------------------------------
var _mensajesRenderizados = new Map();

function _resetearMensajesRenderizados() {
    _mensajesRenderizados.clear();
}

function _yaRenderizado(msgId) {
    if (!msgId) return false;
    return _mensajesRenderizados.has(msgId);
}

function _marcarRenderizado(msgId) {
    if (!msgId) return;
    if (_mensajesRenderizados.has(msgId)) {
        _mensajesRenderizados.delete(msgId);
    } else if (_mensajesRenderizados.size >= MAX_RENDERED_LRU) {
        var first = _mensajesRenderizados.keys().next().value;
        _mensajesRenderizados.delete(first);
    }
    _mensajesRenderizados.set(msgId, true);
}

function _desmarcarRenderizado(msgId) {
    if (msgId) _mensajesRenderizados.delete(msgId);
}

// ----------------------------------------------------------------
// HELPERS DE UI
// ----------------------------------------------------------------
function _asegurarUIBase(box) {
    if (!box) return null;

    // ✅ Limpiar cualquier anchor/botón duplicado
    var anchors = box.querySelectorAll('#scrollAnchor');
    if (anchors.length > 1) {
        for (var i = 0; i < anchors.length - 1; i++) anchors[i].remove();
    }
    var btns = box.querySelectorAll('#scrollDownBtn');
    if (btns.length > 1) {
        for (var j = 0; j < btns.length - 1; j++) btns[j].remove();
    }

    var anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        // ✅ IMPORTANTE: insertar el anchor como ÚLTIMO hijo, antes del botón
        var btnExistente = box.querySelector('#scrollDownBtn');
        if (btnExistente) {
            box.insertBefore(anchor, btnExistente);
        } else {
            box.appendChild(anchor);
        }
    }

    var btn = box.querySelector('#scrollDownBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'scroll-down-btn';
        btn.id = 'scrollDownBtn';
        btn.innerHTML = '↓<span class="badge-new" id="newMsgBadge" style="display:none;">1</span>';
        btn.onclick = function() {
            isUserAtBottom = true;
            scrollToBottom(true);
            actualizarFlecha();
        };
        box.appendChild(btn);
    }

    return anchor;
}

function _limpiarMensajes(box) {
    if (!box) return;
    box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
    // ✅ NO eliminar .empty, solo ocultarlo (mantiene la referencia para después)
    var empty = box.querySelector('.empty');
    if (empty) empty.style.display = 'none';
    _resetearMensajesRenderizados();
}

// ✅ NUEVO: Mostrar el empty state correctamente
function _mostrarEmptyState(texto, subtexto) {
    var box = $('messages');
    if (!box) return;
    var empty = box.querySelector('.empty');
    if (!empty) {
        // Crear uno nuevo si fue eliminado
        empty = document.createElement('div');
        empty.className = 'empty';
        empty.id = 'emptyState';
        empty.innerHTML = '<strong>◈</strong><p>' + (texto || 'Sin mensajes') + '</p><small>' + (subtexto || '') + '</small>';
        box.insertBefore(empty, box.firstChild);
    } else {
        empty.style.display = 'block';
        var p = empty.querySelector('p');
        var s = empty.querySelector('small');
        if (p) p.textContent = texto || 'Sin mensajes';
        if (s) s.textContent = subtexto || '';
    }
}

// ----------------------------------------------------------------
// ✅ abrirConversacionBot — REESCRITA ROBUSTA
// ----------------------------------------------------------------
async function abrirConversacionBot() {
    var box = $('messages');
    if (!box) {
        console.warn('[Chat] abrirConversacionBot: #messages no existe');
        return;
    }

    if (window.DEBUG_CHAT) {
        console.log('[Chat] abrirConversacionBot: iniciando');
    }

    // ✅ Paso 1: limpiar y asegurar UI base
    _limpiarMensajes(box);
    var anchor = _asegurarUIBase(box);
    if (!anchor) {
        console.error('[Chat] No se pudo crear anchor');
        return;
    }

    if (!_esUUID(user && user.id) || !_esUUID(BOT_UUID)) {
        console.error('[Chat] UUID inválido:', { user: user?.id, bot: BOT_UUID });
        return;
    }

    // ✅ Paso 2: cargar historial
    var historial = [];
    try {
        var r = await db.from('mensajes_chat')
            .select('*')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: true })
            .limit(200);
        if (!r.error) historial = r.data || [];
    } catch (e) {
        console.warn('[Chat] No se pudo cargar historial del bot:', e);
    }

    // ✅ Paso 3: verificar que seguimos en el mismo chat
    if (!current || !_esConversacionBot()) {
        console.warn('[Chat] Usuario cambió de chat durante la carga, abortando');
        return;
    }

    if (!document.body.contains(box)) {
        console.warn('[Chat] box ya no está en el DOM');
        return;
    }

    // ✅ Paso 4: reasegurar anchor (pudo haber cambiado)
    anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = _asegurarUIBase(box);
        if (!anchor) return;
    }

    // ✅ Paso 5: renderizar
    if (!historial.length) {
        anchor.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received">' +
                '<div class="bubble">' +
                    '<div class="bubble-bot-info">✦ MARQUINHOS</div>' +
                    '¡Hola! 👋 Soy Marquinhos, el asistente de Sariel\'s. Puedes:<br><br>' +
                    '◈ Escribirme un mensaje de texto<br>' +
                    '◈ Enviarme una nota de voz<br>' +
                    '◈ Hablarme con el botón 🔊 (te responderé con voz)<br><br>' +
                    '¿En qué te puedo ayudar hoy?' +
                '</div>' +
            '</div>');
        isUserAtBottom = true;
        scrollToBottom(true);
        if (window.DEBUG_CHAT) {
            console.log('[Chat] ✅ Bienvenida del bot renderizada');
        }
        return;
    }

    var results = await Promise.allSettled(
        historial.map(function(m) { return getSignedUrlForMessage(m); })
    );

    // ✅ Verificación final antes de insertar
    if (!current || !_esConversacionBot()) return;
    if (!document.body.contains(box)) return;

    anchor = box.querySelector('#scrollAnchor');
    if (!anchor) return;

    var insertados = 0;
    historial.forEach(function(m, i) {
        if (_yaRenderizado(m.id)) return;
        _marcarRenderizado(m.id);
        var url = results[i].status === 'fulfilled' ? results[i].value : null;
        var esMio = _esMensajeMio(m) || _esAutoEnvio(m);
        try {
            anchor.insertAdjacentHTML('beforebegin', messageHTML(m, esMio, url));
            insertados++;
        } catch (e) {
            console.warn('[Chat] Error insertando mensaje:', e);
        }
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);

    if (window.DEBUG_CHAT) {
        console.log('[Chat] ✅ Historial del bot renderizado:', insertados, 'mensajes');
    }
}

// ----------------------------------------------------------------
// RENDERIZAR MENSAJES (chat normal)
// ----------------------------------------------------------------
async function renderMessages(rows) {
    var chatIdAlInicio = current && current.id;
    var box = $('messages');
    if (!box) return;

    _limpiarMensajes(box);
    var anchor = _asegurarUIBase(box);
    if (!anchor) return;

    if (!rows || !rows.length) {
        box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });
        _mostrarEmptyState('Sin mensajes', 'Envía el primer mensaje');
        return;
    }

    var results = await Promise.allSettled(
        rows.map(function(m) { return getSignedUrlForMessage(m); })
    );

    if (!current || current.id !== chatIdAlInicio) return;
    if (!document.body.contains(box)) return;

    anchor = box.querySelector('#scrollAnchor');
    if (!anchor) anchor = _asegurarUIBase(box);
    if (!anchor) return;

    rows.forEach(function(m, i) {
        if (_yaRenderizado(m.id)) return;
        _marcarRenderizado(m.id);
        var url = results[i].status === 'fulfilled' ? results[i].value : null;
        var esMio = _esMensajeMio(m) || _esAutoEnvio(m);
        anchor.insertAdjacentHTML('beforebegin', messageHTML(m, esMio, url));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ----------------------------------------------------------------
// HTML DE MENSAJE
// ----------------------------------------------------------------
function messageHTML(m, sent, signedUrl) {
    sent = Boolean(sent);

    var body = esc(limpiarMarkdown(m.contenido || ''));
    var urlToUse = signedUrl || m.imagen_url;
    var urlOk = _urlSegura(urlToUse);

    if (urlOk) {
        if (m.tipo === 'imagen') {
            body = '<img src="' + esc(urlToUse) + '" alt="' + esc(m.nombre_archivo || 'Imagen') + '" loading="lazy">';
        } else if (m.tipo === 'video') {
            body = '<video controls playsinline preload="metadata" src="' + esc(urlToUse) + '"></video>';
        } else if (m.tipo === 'audio') {
            body = '<audio controls preload="metadata" src="' + esc(urlToUse) + '"></audio>';
        } else {
            var displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido || '') || 'Archivo');
            body = '<span class="file-icon">📎</span> <a href="' + esc(urlToUse) + '" target="_blank" rel="noopener" style="color:var(--gold)">' + displayName + '</a>';
        }
    } else if (urlToUse && !urlOk) {
        var fallbackName = esc(m.nombre_archivo || 'Archivo');
        body = '<span class="file-icon">📎</span> ' + fallbackName;
    }

    var esBotRecibido = !sent && (_esMensajeDelBot(m) || m.es_bot || m.bot_message);
    var headerBot = esBotRecibido ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';

    var meta = '';
    if (m.created_at) {
        meta = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (sent) {
        meta += m.leido ? ' · ◆◆' : ' · ◈◈';
    }

    var esNoLeido = !sent && m.leido === false;
    var unreadDot = esNoLeido ? '<span class="unread-dot" title="No leído"></span>' : '';

    var msgIdRaw = m.id || ('temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    var msgIdSafe = _safeDomId(msgIdRaw);
    var idAttr = m.id ? ('id="msg-' + msgIdSafe + '" ') : '';

    var wrapClass = 'bubblewrap ' + (sent ? 'sent' : 'received') + (esNoLeido ? ' is-unread' : '');

    return '<div ' + idAttr + 'class="' + wrapClass + '" data-msg-id="' + esc(msgIdSafe) + '" data-remitente-id="' + esc(m.remitente_id || '') + '">' +
        '<div class="bubble">' + headerBot + body + '</div>' +
        '<div class="meta">' + unreadDot + meta + '</div>' +
    '</div>';
}

// ----------------------------------------------------------------
// VALIDACIONES
// ----------------------------------------------------------------
function validarTextoChat(texto) {
    if (typeof texto !== 'string') return { ok: false, motivo: 'Texto inválido' };
    if (texto.length > MAX_TEXTO_LEN) {
        return { ok: false, motivo: 'Máximo ' + MAX_TEXTO_LEN + ' letras' };
    }
    return { ok: true };
}

function validarAudioChat(duracionSegundos) {
    if (typeof duracionSegundos !== 'number' || duracionSegundos <= 0) {
        return { ok: false, motivo: 'Audio inválido' };
    }
    if (duracionSegundos > MAX_AUDIO_SEGUNDOS) {
        return { ok: true, recortarA: MAX_AUDIO_SEGUNDOS };
    }
    return { ok: true };
}

function validarVideoChat(duracionSegundos, pesoBytes) {
    if (typeof pesoBytes === 'number' && pesoBytes > MAX_VIDEO_BYTES) {
        return { ok: false, motivo: 'Video muy pesado' };
    }
    if (typeof duracionSegundos === 'number' && duracionSegundos > MAX_VIDEO_SEGUNDOS) {
        return { ok: false, motivo: 'Video supera 2 minutos' };
    }
    return { ok: true };
}

function validarFotoChat(pesoBytes) {
    if (typeof pesoBytes !== 'number') return { ok: false, motivo: 'Foto inválida' };
    if (pesoBytes > MAX_FOTO_BYTES) {
        return { ok: false, motivo: 'Foto muy pesada (máx 10MB)' };
    }
    return { ok: true };
}

// ----------------------------------------------------------------
// VISTO AL CONTESTAR
// ----------------------------------------------------------------
async function marcarConversacionComoLeida(remitenteId, antesDe) {
    if (!user || !remitenteId) return;
    if (remitenteId === BOT_ID || remitenteId === BOT_UUID) return;
    if (!_esUUID(remitenteId)) return;

    var timestamp = antesDe || new Date().toISOString();

    try {
        var r = await db.from('mensajes_chat')
            .update({ leido: true })
            .eq('remitente_id', remitenteId)
            .eq('destinatario_id', user.id)
            .eq('leido', false)
            .eq('eliminado', false)
            .lt('created_at', timestamp);

        if (r.error) {
            console.warn('[Chat] Error marcando leída:', r.error);
            return;
        }

        document.querySelectorAll('.bubblewrap.received.is-unread[data-remitente-id="' + remitenteId + '"]').forEach(function(el) {
            el.classList.remove('is-unread');
            var dot = el.querySelector('.unread-dot');
            if (dot) dot.remove();
        });
    } catch (e) {
        console.warn('[Chat] Error marcando leída:', e);
    }
}

async function markRead(id) {
    if (!id) return;
    await marcarConversacionComoLeida(id, new Date().toISOString());
}

// ----------------------------------------------------------------
// ENVIAR MENSAJE
// ----------------------------------------------------------------
var _ultimoEnvio = 0;

async function sendMessage(text) {
    if (!current || !text) return;

    var ahora = Date.now();
    if (ahora - _ultimoEnvio < RATE_LIMIT_ENVIO_MS) return;
    _ultimoEnvio = ahora;

    if (!await auth()) return;

    var textoLimpio = String(text).trim();
    if (!textoLimpio) return;

    var val = validarTextoChat(textoLimpio);
    if (!val.ok) {
        toast('⚠️ ' + val.motivo, 'error');
        return;
    }

    var inputEl = $('messageInput');
    if (inputEl) inputEl.value = '';

    try {
        if (current.bot) {
            await _enviarMensajeAlBot(textoLimpio);
        } else {
            await _enviarMensajeNormal(textoLimpio);
        }
    } catch (e) {
        console.error('[Chat] Error en sendMessage:', e);
        toast('❌ Error al enviar mensaje', 'error');
    }
}

async function _enviarMensajeAlBot(textoLimpio) {
    var chatId = current.id;
    var esChatBot = current.bot;
    var destinatarioId = esChatBot ? BOT_UUID : chatId;

    var userMsg = {
        contenido: textoLimpio,
        created_at: new Date().toISOString(),
        tipo: 'texto',
        remitente_id: user.id,
        destinatario_id: destinatarioId,
        leido: false,
        es_bot: false
    };

    try {
        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: destinatarioId,
            contenido: textoLimpio,
            tipo: 'texto',
            leido: false,
            editado: false,
            eliminado: false
        }).select('*').single();

        if (ins.error || !ins.data) {
            console.warn('[Chat] No se pudo guardar mensaje al bot:', ins.error);
            userMsg.id = 'tmp-' + Date.now();
        } else {
            userMsg = ins.data;
        }
    } catch (e) {
        console.warn('[Chat] Excepción guardando mensaje al bot:', e);
        userMsg.id = 'tmp-' + Date.now();
    }

    await append(userMsg, true);

    mostrarTypingBot();

    try {
        var historial = await cargarHistorialParaBot();
        var respuesta = await preguntarAlBot(textoLimpio, historial);

        var botMsg = {
            contenido: respuesta,
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: BOT_UUID,
            destinatario_id: user.id,
            leido: false,
            es_bot: true
        };

        try {
            var insBot = await db.from('mensajes_chat').insert({
                remitente_id: BOT_UUID,
                destinatario_id: user.id,
                contenido: respuesta,
                tipo: 'texto',
                leido: false,
                editado: false,
                eliminado: false
            }).select('*').single();
            if (!insBot.error && insBot.data) {
                botMsg = Object.assign({}, insBot.data, { es_bot: true });
            }
        } catch (e) {
            console.warn('[Chat] No se pudo guardar respuesta del bot:', e);
        }

        isUserAtBottom = true;
        await append(botMsg, false);
        scrollToBottom(true);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error Marquinhos:', e);
        var errorMsg = {
            contenido: '⚠️ ' + (e.message || 'Ups, tuve un problema.'),
            created_at: new Date().toISOString(),
            tipo: 'texto',
            remitente_id: BOT_UUID,
            destinatario_id: user.id,
            leido: false,
            es_bot: true
        };
        isUserAtBottom = true;
        await append(errorMsg, false);
        scrollToBottom(true);
    } finally {
        quitarTypingBot();
    }
}

async function _enviarMensajeNormal(textoLimpio) {
    var chatId = current.id;
    var esChatBot = current.bot;

    try {
        var r = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: chatId,
            contenido: textoLimpio,
            tipo: 'texto',
            leido: false,
            editado: false,
            eliminado: false
        }).select('*').single();

        if (r.error || !r.data || !r.data.id) {
            console.error('[Chat] Error al enviar mensaje:', r.error);
            toast('❌ Error al enviar mensaje', 'error');
            return;
        }

        await append(r.data, true);

        await marcarConversacionComoLeida(chatId, r.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error al enviar:', e);
        toast('❌ Error al enviar mensaje', 'error');
    }
}

// ----------------------------------------------------------------
// ENVIAR AUDIO/VIDEO/FOTO
// ----------------------------------------------------------------
async function sendAudio(blob, duracionSegundos) {
    if (!current || !blob) return;
    var chatId = current.bot ? BOT_UUID : current.id;
    if (!await auth()) return;

    var val = validarAudioChat(duracionSegundos);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    try {
        var url = await subirArchivoChat(blob, 'audio');

        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: chatId,
            tipo: 'audio',
            imagen_url: url,
            leido: false,
            editado: false,
            eliminado: false
        }).select('*').single();

        if (ins.error || !ins.data) {
            toast('❌ Error al enviar audio', 'error');
            return;
        }

        await append(ins.data, true);

        await marcarConversacionComoLeida(chatId, ins.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando audio:', e);
        toast('❌ Error al enviar audio', 'error');
    }
}

async function sendVideo(blob, duracionSegundos, pesoBytes) {
    if (!current || !blob) return;
    var chatId = current.bot ? BOT_UUID : current.id;
    if (!await auth()) return;

    var val = validarVideoChat(duracionSegundos, pesoBytes || blob.size);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    try {
        var url = await subirArchivoChat(blob, 'video');

        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: chatId,
            tipo: 'video',
            imagen_url: url,
            leido: false,
            editado: false,
            eliminado: false
        }).select('*').single();

        if (ins.error || !ins.data) {
            toast('❌ Error al enviar video', 'error');
            return;
        }

        await append(ins.data, true);

        await marcarConversacionComoLeida(chatId, ins.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando video:', e);
        toast('❌ Error al enviar video', 'error');
    }
}

async function sendFoto(blob) {
    if (!current || !blob) return;
    var chatId = current.bot ? BOT_UUID : current.id;
    if (!await auth()) return;

    var val = validarFotoChat(blob.size);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    try {
        var url = await subirArchivoChat(blob, 'imagen');

        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: chatId,
            tipo: 'imagen',
            imagen_url: url,
            leido: false,
            editado: false,
            eliminado: false
        }).select('*').single();

        if (ins.error || !ins.data) {
            toast('❌ Error al enviar foto', 'error');
            return;
        }

        await append(ins.data, true);

        await marcarConversacionComoLeida(chatId, ins.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando foto:', e);
        toast('❌ Error al enviar foto', 'error');
    }
}

// ----------------------------------------------------------------
// TYPING INDICATOR
// ----------------------------------------------------------------
function mostrarTypingBot() {
    var box = $('messages');
    if (!box) return;
    var empty = box.querySelector('.empty');
    if (empty) empty.style.display = 'none';
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

// ----------------------------------------------------------------
// ✅ append() — REESCRITA ROBUSTA
// ----------------------------------------------------------------
async function append(m, sent) {
    if (!current) {
        console.warn('[Chat] append: sin conversación activa');
        return;
    }

    var box = $('messages');
    if (!box) {
        console.warn('[Chat] append: #messages no existe');
        return;
    }

    // Anti-duplicados
    if (m.id) {
        var safeId = _safeDomId(m.id);
        var existente = document.getElementById('msg-' + safeId);
        if (existente) return;
        if (_yaRenderizado(m.id)) return;
    }

    if (m.id) _marcarRenderizado(m.id);

    // Obtener URL firmada si aplica
    var signedUrl = null;
    if (m.imagen_url || m.tipo === 'imagen' || m.tipo === 'video' || m.tipo === 'audio') {
        try {
            signedUrl = await getSignedUrlForMessage(m);
        } catch (e) {
            console.warn('[Chat] Signed URL falló:', m.id, e);
            if (m.id) _desmarcarRenderizado(m.id);
            return;
        }
    }

    // ✅ Verificar que seguimos en el mismo chat
    if (!current) return;
    if (!document.body.contains(box)) return;

    var empty = box.querySelector('.empty');
    if (empty) empty.style.display = 'none';

    var anchorRef = box.querySelector('#scrollAnchor');
    if (!anchorRef) {
        anchorRef = _asegurarUIBase(box);
        if (!anchorRef) return;
    }

    sent = Boolean(sent);

    // ✅ Autoenvío → siempre como "sent"
    if (!sent && _esAutoEnvio(m)) {
        sent = true;
    }

    // ✅ Insertar
    try {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, sent, signedUrl));
    } catch (e) {
        console.error('[Chat] Error insertando mensaje:', e);
        return;
    }
    observarCargaMultimedia(box);

    // ✅ FIX CRÍTICO: En el chat del bot, SIEMPRE renderizar y scrollear
    var esChatBot = _esConversacionBot();

    if (!sent) {
        if (esChatBot || _esMensajeDelBot(m)) {
            isUserAtBottom = true;
            scrollToBottom(true);
            ocultarFlechaNuevos();
            return;
        }

        if (isUserAtBottom) {
            ocultarFlechaNuevos();
        } else {
            unreadCount++;
            actualizarFlecha();
            return;
        }
    }

    isUserAtBottom = true;
    scrollToBottom(true);
}

// ----------------------------------------------------------------
// SUSCRIPCIÓN REALTIME
// ----------------------------------------------------------------
var _unsubPromise = Promise.resolve();

function subscribeMessages(id) {
    if (id === BOT_ID || id === BOT_UUID) return;
    if (!_esUUID(id) || !_esUUID(user && user.id)) return;

    _unsubPromise = _unsubPromise
        .then(async function() {
            if (msgChannel) {
                try { await db.removeChannel(msgChannel); } catch (e) {}
                msgChannel = null;
            }

            msgChannel = db.channel('chat-' + id)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'mensajes_chat'
                }, function(p) {
                    var m = p.new;
                    if (!current) return;

                    var chatActual = current.id;
                    var esBotChat = _esConversacionBot();
                    var esParaEsteChat = false;

                    if (esBotChat) {
                        esParaEsteChat = (String(m.remitente_id) === String(BOT_UUID))
                            || (String(m.destinatario_id) === String(BOT_UUID));
                    } else {
                        esParaEsteChat = (String(m.remitente_id) === String(chatActual))
                            || (String(m.destinatario_id) === String(chatActual));
                    }

                    if (!esParaEsteChat) return;

                    var safeId = _safeDomId(m.id);
                    if (!_yaRenderizado(m.id) && !document.getElementById('msg-' + safeId)) {
                        append(m, _esMensajeMio(m) || _esAutoEnvio(m));
                    }
                })
                .subscribe();
        })
        .catch(function(e) {
            console.warn('[Chat] Error en subscribeMessages:', e);
        });

    return _unsubPromise;
}

// ----------------------------------------------------------------
// SCROLL
// ----------------------------------------------------------------
var _scrollUserOverride = false;
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

    _scrollUserOverride = false;

    var doScroll = function() {
        if (_scrollUserOverride) return;
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
        if (_scrollUserOverride) {
            clearInterval(scrollRetryTimer);
            scrollRetryTimer = null;
            return;
        }
        intentos++;
        if (force || isUserAtBottom) doScroll();
        if (intentos >= SCROLL_RETRY_MAX) {
            clearInterval(scrollRetryTimer);
            scrollRetryTimer = null;
        }
    }, SCROLL_RETRY_MS);

    if (force || isUserAtBottom) ocultarFlechaNuevos();
}

function _instalarCancelScrollManual(box) {
    if (!box || box._cancelScrollInstalled) return;
    box._cancelScrollInstalled = true;
    box.addEventListener('wheel', function() {
        _scrollUserOverride = true;
        if (scrollRetryTimer) { clearInterval(scrollRetryTimer); scrollRetryTimer = null; }
        if (_scrollRafId !== null) {
            cancelAnimationFrame(_scrollRafId);
            _scrollRafId = null;
        }
    }, { passive: true });
    box.addEventListener('touchmove', function() {
        _scrollUserOverride = true;
        if (scrollRetryTimer) { clearInterval(scrollRetryTimer); scrollRetryTimer = null; }
        if (_scrollRafId !== null) {
            cancelAnimationFrame(_scrollRafId);
            _scrollRafId = null;
        }
    }, { passive: true });
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
    if (isUserAtBottom && !estabaAbajo) ocultarFlechaNuevos();
    _instalarCancelScrollManual(box);
}

// ----------------------------------------------------------------
// OBSERVAR MULTIMEDIA
// ----------------------------------------------------------------
var _mediaObservados = new WeakSet();

function observarCargaMultimedia(box) {
    if (!box) return;
    box.querySelectorAll('img, audio, video').forEach(function(el) {
        if (_mediaObservados.has(el)) return;
        _mediaObservados.add(el);
        var _disparado = false;
        var onLoad = function() {
            if (_disparado) return;
            _disparado = true;
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

// ----------------------------------------------------------------
// TECLADO
// ----------------------------------------------------------------
var _tecladoConfigurado = false;

function configurarAutoScrollTeclado() {
    if (_tecladoConfigurado) return;
    _tecladoConfigurado = true;

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            setTimeout(function() {
                if (isUserAtBottom) scrollToBottom(true);
            }, KEYBOARD_SCROLL_MS);
        });
    }

    var input = $('messageInput');
    if (input) {
        input.addEventListener('focus', function() {
            setTimeout(function() { scrollToBottom(true); }, KEYBOARD_SCROLL_MS);
        });
        input.addEventListener('input', function() {
            if (isUserAtBottom) {
                setTimeout(function() { scrollToBottom(true); }, KEYBOARD_INPUT_MS);
            }
        });
    }

    var box = $('messages');
    if (box) _instalarCancelScrollManual(box);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configurarAutoScrollTeclado);
} else {
    configurarAutoScrollTeclado();
}

// ----------------------------------------------------------------
// LIMPIAR ESTADO
// ----------------------------------------------------------------
async function limpiarEstadoConversacion() {
    _resetearMensajesRenderizados();

    var box = $('messages');
    if (box) {
        box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
        // Ocultar empty, no eliminar
        var empty = box.querySelector('.empty');
        if (empty) empty.style.display = 'none';
    }

    unreadCount = 0;
    isUserAtBottom = true;
    actualizarFlecha();

    if (msgChannel) {
        try { await db.removeChannel(msgChannel); } catch (e) {}
        msgChannel = null;
    }
}

// ----------------------------------------------------------------
// EXPOSICIÓN GLOBAL
// ----------------------------------------------------------------
window.Chat = {
    sendMessage: sendMessage,
    sendAudio: sendAudio,
    sendVideo: sendVideo,
    sendFoto: sendFoto,
    append: append,
    renderMessages: renderMessages,
    messageHTML: messageHTML,
    abrirConversacionBot: abrirConversacionBot,
    subscribeMessages: subscribeMessages,
    scrollToBottom: scrollToBottom,
    actualizarFlecha: actualizarFlecha,
    ocultarFlechaNuevos: ocultarFlechaNuevos,
    detectarSiEstaAbajo: detectarSiEstaAbajo,
    observarCargaMultimedia: observarCargaMultimedia,
    markRead: markRead,
    marcarConversacionComoLeida: marcarConversacionComoLeida,
    mostrarTypingBot: mostrarTypingBot,
    quitarTypingBot: quitarTypingBot,
    validarTextoChat: validarTextoChat,
    validarAudioChat: validarAudioChat,
    validarVideoChat: validarVideoChat,
    validarFotoChat: validarFotoChat,
    _marcarRenderizado: _marcarRenderizado,
    _yaRenderizado: _yaRenderizado,
    _safeDomId: _safeDomId,
    _esMensajeDelBot: _esMensajeDelBot,
    _esConversacionBot: _esConversacionBot,
    limpiarEstadoConversacion: limpiarEstadoConversacion
};

window.sendMessage = sendMessage;
window.append = append;
window.abrirConversacionBot = abrirConversacionBot;
window.scrollToBottom = scrollToBottom;
window.markRead = markRead;

if (window.DEBUG_CHAT) {
    console.log('[Mensajes] ✅ Chat v3.4 cargado (renderizado robusto garantizado)');
}