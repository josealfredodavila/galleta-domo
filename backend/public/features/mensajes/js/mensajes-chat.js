// ================================================================
// MENSAJES · CHAT (v3 — Correcciones completas + Reglas del chat)
// ================================================================
// - Anti-duplicados robusto (registro + DOM)
// - "Visto" SOLO cuando el receptor contesta (texto/audio/video/foto)
// - Autoenvío (remitente === destinatario) se marca VISTO al instante
// - Límites: texto 1000, audio 5min, video 2min/50MB, foto 10MB
// - Seguridad: URLs, UUIDs, escape HTML, filtro realtime servidor
// - Fixes: race conditions, unreadCount, scroll, LRU, removeChannel
// ================================================================

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------
var MAX_TEXTO_LEN       = 1000;
var MAX_AUDIO_SEGUNDOS  = 5 * 60;          // 5 min
var MAX_VIDEO_SEGUNDOS  = 2 * 60;          // 2 min
var MAX_VIDEO_BYTES     = 50 * 1024 * 1024; // 50 MB
var MAX_FOTO_BYTES      = 10 * 1024 * 1024; // 10 MB
var MAX_RENDERED_LRU    = 500;
var SCROLL_RETRY_MS     = 100;
var SCROLL_RETRY_MAX    = 10;
var KEYBOARD_SCROLL_MS  = 300;
var KEYBOARD_INPUT_MS   = 50;
var MARKREAD_DEBOUNCE   = 500;

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----------------------------------------------------------------
// UTILIDADES INTERNAS
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

function _esMensajeParaMi(m) {
    if (!m || !m.destinatario_id) return false;
    var myId = (typeof user !== 'undefined' && user && user.id) ? user.id : null;
    if (!myId) return false;
    return String(m.destinatario_id) === String(myId);
}

function _esAutoEnvio(m) {
    if (!m || !m.remitente_id || !m.destinatario_id) return false;
    return String(m.remitente_id) === String(m.destinatario_id);
}

// ----------------------------------------------------------------
// REGISTRO LRU DE IDs YA RENDERIZADOS (anti-duplicados)
// ----------------------------------------------------------------
var _mensajesRenderizados = new Map(); // Map para LRU (id → true)

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
        // refrescar orden LRU
        _mensajesRenderizados.delete(msgId);
    } else if (_mensajesRenderizados.size >= MAX_RENDERED_LRU) {
        // eliminar el más antiguo
        var first = _mensajesRenderizados.keys().next().value;
        _mensajesRenderizados.delete(first);
    }
    _mensajesRenderizados.set(msgId, true);
}

function _desmarcarRenderizado(msgId) {
    if (msgId) _mensajesRenderizados.delete(msgId);
}

// ----------------------------------------------------------------
// HELPERS DE UI BASE (evita duplicación entre abrirBot y render)
// ----------------------------------------------------------------
function _asegurarUIBase(box) {
    if (!box) return null;

    var anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        box.appendChild(anchor);
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
    var empty = box.querySelector('.empty');
    if (empty) empty.remove();
    _resetearMensajesRenderizados();
}

// ----------------------------------------------------------------
// ABRIR CONVERSACIÓN CON EL BOT
// ----------------------------------------------------------------
async function abrirConversacionBot() {
    var box = $('messages');
    if (!box) return;

    _limpiarMensajes(box);
    var anchor = _asegurarUIBase(box);

    // Validación de UUIDs antes de concatenar en PostgREST
    if (!_esUUID(user && user.id) || !_esUUID(BOT_UUID)) {
        console.error('[Chat] UUID inválido en abrirConversacionBot');
        return;
    }

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
        console.warn('No se pudo cargar historial del bot:', e);
    }

    if (!document.body.contains(box)) return; // abortar si ya no está

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
        return;
    }

    // Promise.allSettled: si una URL firmada falla, no rompe todo
    var results = await Promise.allSettled(
        historial.map(function(m) { return getSignedUrlForMessage(m); })
    );

    if (!document.body.contains(box)) return;

    historial.forEach(function(m, i) {
        if (_yaRenderizado(m.id)) return;
        _marcarRenderizado(m.id);
        var url = results[i].status === 'fulfilled' ? results[i].value : null;
        anchor.insertAdjacentHTML('beforebegin', messageHTML(m, _esMensajeMio(m), url));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ----------------------------------------------------------------
// RENDERIZAR MENSAJES
// ----------------------------------------------------------------
async function renderMessages(rows) {
    var box = $('messages');
    if (!box) return;

    _limpiarMensajes(box);
    var anchor = _asegurarUIBase(box); // ✅ ahora también asegura botón

    if (!rows.length) {
        anchor.insertAdjacentHTML('beforebegin',
            '<div class="empty"><strong>◈</strong><div>Sin mensajes</div><small>Envía el primer mensaje</small></div>');
        return;
    }

    var results = await Promise.allSettled(
        rows.map(function(m) { return getSignedUrlForMessage(m); })
    );

    if (!document.body.contains(box)) return;

    rows.forEach(function(m, i) {
        if (_yaRenderizado(m.id)) return;
        _marcarRenderizado(m.id);
        var url = results[i].status === 'fulfilled' ? results[i].value : null;
        anchor.insertAdjacentHTML('beforebegin', messageHTML(m, _esMensajeMio(m), url));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ----------------------------------------------------------------
// HTML DE UN MENSAJE
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
        // URL insegura: no renderizar el link, mostrar nombre
        var fallbackName = esc(m.nombre_archivo || 'Archivo');
        body = '<span class="file-icon">📎</span> ' + fallbackName;
    }

    var esBotRecibido = !sent && (m.es_bot || m.bot_message);
    var headerBot = esBotRecibido ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';

    // Meta: hora + estado
    var meta = '';
    if (m.created_at) {
        meta = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (sent) {
        meta += m.leido ? ' · ◆◆' : ' · ◈◈';
    }

    // ✅ Punto de "no leído" para mensajes recibidos que no están leídos
    var esNoLeido = !sent && m.leido === false;
    var unreadDot = esNoLeido ? '<span class="unread-dot" title="No leído"></span>' : '';

    // id seguro
    var msgId = m.id || ('temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    var idAttr = m.id ? ('id="msg-' + esc(m.id) + '" ') : '';

    var wrapClass = 'bubblewrap ' + (sent ? 'sent' : 'received') + (esNoLeido ? ' is-unread' : '');

    return '<div ' + idAttr + 'class="' + wrapClass + '" data-msg-id="' + esc(msgId) + '">' +
        '<div class="bubble">' + headerBot + body + '</div>' +
        '<div class="meta">' + unreadDot + meta + '</div>' +
    '</div>';
}

// ----------------------------------------------------------------
// VALIDACIONES DE LÍMITES (reglas del chat)
// ----------------------------------------------------------------
function validarTextoChat(texto) {
    if (typeof texto !== 'string') return { ok: false, motivo: 'Texto inválido' };
    if (texto.length > MAX_TEXTO_LEN) {
        return { ok: false, motivo: 'Máximo ' + MAX_TEXTO_LEN + ' letras we' };
    }
    return { ok: true };
}

function validarAudioChat(duracionSegundos) {
    if (typeof duracionSegundos !== 'number' || duracionSegundos <= 0) {
        return { ok: false, motivo: 'Audio inválido' };
    }
    if (duracionSegundos > MAX_AUDIO_SEGUNDOS) {
        // Se corta solo a 5:00 según regla
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
// "VISTO AL CONTESTAR" — Función central
// ----------------------------------------------------------------
// Marca como leídos TODOS los mensajes que el otro me envió,
// SOLO cuando yo contesto (texto/audio/video/foto).
// Filtra por timestamp para evitar race condition.
// ----------------------------------------------------------------
async function marcarConversacionComoLeida(remitenteId, antesDe) {
    if (!user || !remitenteId) return;
    if (remitenteId === BOT_ID) return;
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

        // Actualizar DOM localmente
        document.querySelectorAll('.bubblewrap.received.is-unread').forEach(function(el) {
            el.classList.remove('is-unread');
            var dot = el.querySelector('.unread-dot');
            if (dot) dot.remove();
        });
    } catch (e) {
        console.warn('[Chat] Error marcando leída:', e);
    }
}

// ----------------------------------------------------------------
// ENVIAR MENSAJE
// ----------------------------------------------------------------
var _sending = false;

async function sendMessage(text) {
    if (!current || !text) return;
    if (_sending) return; // rate limit básico
    if (!await auth()) return;

    var textoLimpio = String(text).trim();
    if (!textoLimpio) return;

    // Validar límite de texto
    var val = validarTextoChat(textoLimpio);
    if (!val.ok) {
        toast('⚠️ ' + val.motivo, 'error');
        return;
    }

    _sending = true;

    var inputEl = $('messageInput');
    if (inputEl) inputEl.value = '';

    try {
        if (current.bot) {
            await _enviarMensajeAlBot(textoLimpio);
        } else {
            await _enviarMensajeNormal(textoLimpio);
        }
    } finally {
        _sending = false;
    }
}

async function _enviarMensajeAlBot(textoLimpio) {
    // 1. Guardar mensaje del usuario
    var userMsg = {
        contenido: textoLimpio,
        created_at: new Date().toISOString(),
        tipo: 'texto',
        remitente_id: user.id,
        destinatario_id: BOT_UUID,
        leido: false, // ✅ ya no true; el bot no "lee"
        es_bot: false
    };

    try {
        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: BOT_UUID,
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

    if (userMsg.id) _marcarRenderizado(userMsg.id);
    await append(userMsg, true);

    // ✅ Al contestar al bot, marcamos como leídos los previos del bot
    await marcarConversacionComoLeida(BOT_UUID, userMsg.created_at);

    // 2. Typing + respuesta del bot
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

        if (botMsg.id) _marcarRenderizado(botMsg.id);
        await append(botMsg, false);
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
        await append(errorMsg, false);
    } finally {
        quitarTypingBot();
    }
}

async function _enviarMensajeNormal(textoLimpio) {
    try {
        var r = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: current.id,
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

        _marcarRenderizado(r.data.id);
        await append(r.data, true);

        // ✅ Al contestar, marcar los previos del otro como leídos
        await marcarConversacionComoLeida(current.id, r.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error al enviar:', e);
        toast('❌ Error al enviar mensaje', 'error');
    }
}

// ----------------------------------------------------------------
// ENVIAR AUDIO / VIDEO / FOTO (marca visto al contestar)
// ----------------------------------------------------------------
// Estas funciones deben llamarse desde tu capa de subida.
// Ejemplo: sendAudio(blob, duracionSegundos)
// ----------------------------------------------------------------
async function sendAudio(blob, duracionSegundos) {
    if (!current || !blob) return;
    if (!await auth()) return;

    var val = validarAudioChat(duracionSegundos);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    // Nota: si val.recortarA está definido, tu capa de grabación
    // debe cortar el blob a 5:00 antes de llegar aquí.
    try {
        // Subir blob y obtener URL pública (usa tu helper existente)
        var url = await subirArchivoChat(blob, 'audio');

        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: current.bot ? BOT_UUID : current.id,
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

        _marcarRenderizado(ins.data.id);
        await append(ins.data, true);

        // ✅ Al contestar con audio, marcar previos como leídos
        var remitente = current.bot ? BOT_UUID : current.id;
        await marcarConversacionComoLeida(remitente, ins.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando audio:', e);
        toast('❌ Error al enviar audio', 'error');
    }
}

async function sendVideo(blob, duracionSegundos, pesoBytes) {
    if (!current || !blob) return;
    if (!await auth()) return;

    var val = validarVideoChat(duracionSegundos, pesoBytes || blob.size);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    try {
        var url = await subirArchivoChat(blob, 'video');

        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: current.bot ? BOT_UUID : current.id,
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

        _marcarRenderizado(ins.data.id);
        await append(ins.data, true);

        var remitente = current.bot ? BOT_UUID : current.id;
        await marcarConversacionComoLeida(remitente, ins.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando video:', e);
        toast('❌ Error al enviar video', 'error');
    }
}

async function sendFoto(blob) {
    if (!current || !blob) return;
    if (!await auth()) return;

    var val = validarFotoChat(blob.size);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    try {
        var url = await subirArchivoChat(blob, 'imagen');

        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: current.bot ? BOT_UUID : current.id,
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

        _marcarRenderizado(ins.data.id);
        await append(ins.data, true);

        var remitente = current.bot ? BOT_UUID : current.id;
        await marcarConversacionComoLeida(remitente, ins.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando foto:', e);
        toast('❌ Error al enviar foto', 'error');
    }
}

// ----------------------------------------------------------------
// TYPING INDICATOR DEL BOT
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// AÑADIR MENSAJE AL DOM
// ----------------------------------------------------------------
async function append(m, sent) {
    var box = $('messages');
    if (!box) return;

    // Doble verificación: DOM + registro
    if (m.id) {
        var existente = document.getElementById('msg-' + m.id);
        if (existente) return;
        if (_yaRenderizado(m.id)) return;
    }

    // Marcar ANTES del await (evita doble append)
    if (m.id) _marcarRenderizado(m.id);

    // Signed URL con rollback si falla
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

    var empty = box.querySelector('.empty');
    if (empty) empty.remove();

    var anchorRef = box.querySelector('#scrollAnchor');
    sent = Boolean(sent);

    if (anchorRef) {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, sent, signedUrl));
    } else {
        box.insertAdjacentHTML('beforeend', messageHTML(m, sent, signedUrl));
    }
    observarCargaMultimedia(box);

    // Gestión de flecha "no leídos"
    if (!sent) {
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
// SUSCRIPCIÓN REALTIME (con filtro servidor + anti-duplicados)
// ----------------------------------------------------------------
var _unsubPromise = Promise.resolve();

function subscribeMessages(id) {
    if (id === BOT_ID) return;
    if (!_esUUID(id) || !_esUUID(user && user.id)) return;

    _unsubPromise = _unsubPromise.then(async function() {
        if (msgChannel) {
            try { await db.removeChannel(msgChannel); } catch (e) {}
            msgChannel = null;
        }

        msgChannel = db.channel('chat-' + id)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'mensajes_chat',
                filter: 'or(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + user.id + ')'
            }, function(p) {
                var m = p.new;

                if (!current || current.id !== id) return;

                // Si es mío → ignorar (ya renderizado)
                if (_esMensajeMio(m)) return;

                // Si es para mí y no está renderizado → pintar
                if (_esMensajeParaMi(m)) {
                    if (!_yaRenderizado(m.id) && !document.getElementById('msg-' + m.id)) {
                        // ✅ NO marcar como leído aquí (regla: solo al contestar)
                        append(m, false);
                    }
                }
            })
            .subscribe();
    });

    return _unsubPromise;
}

// ----------------------------------------------------------------
// SCROLL
// ----------------------------------------------------------------
var _scrollUserOverride = false;

function scrollToBottom(force) {
    if (force === undefined) force = false;
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
    requestAnimationFrame(doScroll);

    if (scrollRetryTimer) clearInterval(scrollRetryTimer);
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

// Detecta scroll manual para cancelar auto-scroll agresivo
function _instalarCancelScrollManual(box) {
    if (!box || box._cancelScrollInstalled) return;
    box._cancelScrollInstalled = true;
    box.addEventListener('wheel', function() {
        _scrollUserOverride = true;
        if (scrollRetryTimer) { clearInterval(scrollRetryTimer); scrollRetryTimer = null; }
    }, { passive: true });
    box.addEventListener('touchmove', function() {
        _scrollUserOverride = true;
        if (scrollRetryTimer) { clearInterval(scrollRetryTimer); scrollRetryTimer = null; }
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
// OBSERVAR CARGA DE MULTIMEDIA (auto-scroll al cargar)
// ----------------------------------------------------------------
var _mediaObservados = new WeakSet();

function observarCargaMultimedia(box) {
    if (!box) return;
    box.querySelectorAll('img, audio, video').forEach(function(el) {
        if (_mediaObservados.has(el)) return;
        _mediaObservados.add(el);
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

// ----------------------------------------------------------------
// AUTO-SCROLL AL ABRIR EL TECLADO (idempotente)
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

console.log('[Mensajes] ✅ Chat v3 cargado (visto al contestar + reglas + correcciones)');