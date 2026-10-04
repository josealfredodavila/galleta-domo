// ================================================================
// MENSAJES · CHAT (v3.9 — Completo integrado con abrirConversacionBot blindada)
// ================================================================
// - Anti-duplicados robusto (registro + DOM)
// - "Visto" SOLO cuando el receptor contesta
// - Autoenvío se marca VISTO al instante
// - Límites: texto 1000, audio 5min, video 2min/50MB, foto 10MB
// - Seguridad: URLs, UUIDs, escape HTML, filtro realtime servidor
// - abrirConversacionBot con NIVEL 0-14 de protección
// - _renderizarErrorBot nunca lanza
// - Namespace unificado window.Chat.*
// ================================================================

// ----------------------------------------------------------------
// NAMESPACE
// ----------------------------------------------------------------
window.Chat = window.Chat || {};

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

function _safeDomId(id) {
    if (!id) return '';
    return String(id).replace(/[^a-zA-Z0-9-]/g, '');
}

function _esConversacionBot() {
    try {
        if (typeof current === 'undefined' || !current) return false;
        if (current.bot === true) return true;
        if (typeof BOT_ID !== 'undefined' && current.id === BOT_ID) return true;
        if (typeof BOT_UUID !== 'undefined' && current.id === BOT_UUID) return true;
        return false;
    } catch (e) {
        return false;
    }
}

function _esMensajeDelBot(m) {
    if (!m || !m.remitente_id) return false;
    var rid = String(m.remitente_id);
    if (typeof BOT_ID !== 'undefined' && rid === BOT_ID) return true;
    if (typeof BOT_UUID !== 'undefined' && rid === BOT_UUID) return true;
    return false;
}

// ----------------------------------------------------------------
// REGISTRO LRU
// ----------------------------------------------------------------
var _mensajesRenderizados = new Map();

function _resetearMensajesRenderizados() { _mensajesRenderizados.clear(); }

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
// HELPERS UI
// ----------------------------------------------------------------
function _asegurarUIBase(box) {
    if (!box) return null;

    var anchors = box.querySelectorAll('#scrollAnchor');
    if (anchors.length > 1) {
        for (var i = 1; i < anchors.length; i++) anchors[i].remove();
    }
    var btns = box.querySelectorAll('#scrollDownBtn');
    if (btns.length > 1) {
        for (var j = 1; j < btns.length; j++) btns[j].remove();
    }

    var anchor = box.querySelector('#scrollAnchor');
    if (!anchor) {
        anchor = document.createElement('div');
        anchor.id = 'scrollAnchor';
        var btnExistente = box.querySelector('#scrollDownBtn');
        if (btnExistente) box.insertBefore(anchor, btnExistente);
        else box.appendChild(anchor);
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
    if (empty) empty.style.display = 'none';
    _resetearMensajesRenderizados();
}

function _mostrarEmptyState(texto, subtexto) {
    var box = document.getElementById('messages');
    if (!box) return;
    var empty = box.querySelector('.empty');
    if (!empty) {
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

// ================================================================
// ✅ v3.8: abrirConversacionBot ULTRA-blindada
// ================================================================
async function abrirConversacionBot() {
    try {
        console.log('[Chat v3.8] abrirConversacionBot: iniciando');

        var box = document.getElementById('messages');
        if (!box) {
            console.error('[Chat v3.8] ❌ #messages no existe en el DOM');
            return false;
        }

        if (typeof BOT_UUID === 'undefined' || !BOT_UUID) {
            console.error('[Chat v3.8] ❌ BOT_UUID no definido');
            _renderizarErrorBot(box, 'Configuración incompleta: BOT_UUID');
            return false;
        }

        if (typeof db === 'undefined' || !db) {
            console.error('[Chat v3.8] ❌ db no inicializado');
            _renderizarErrorBot(box, 'Sistema no inicializado. Recarga la página.');
            return false;
        }

        if (!user || !user.id) {
            console.error('[Chat v3.8] ❌ user no autenticado');
            _renderizarErrorBot(box, 'No hay sesión activa. Recarga la página.');
            return false;
        }

        console.log('[Chat v3.8] user.id =', user.id);
        console.log('[Chat v3.8] BOT_UUID =', BOT_UUID);

        try { _limpiarMensajes(box); } catch (e) {}

        var anchor = null;
        try {
            anchor = _asegurarUIBase(box);
        } catch (e) {
            console.error('[Chat v3.8] ❌ _asegurarUIBase falló:', e);
            _renderizarErrorBot(box, 'Error creando interfaz: ' + e.message);
            return false;
        }

        if (!anchor) {
            console.error('[Chat v3.8] ❌ anchor nulo');
            _renderizarErrorBot(box, 'Error de UI: anchor no creado');
            return false;
        }

        try {
            window.dispatchEvent(new CustomEvent('marquinhos:chatAbierto', {
                detail: { userId: user.id, botId: BOT_UUID }
            }));
        } catch (e) {}

        // Cargar historial
        console.log('[Chat v3.8] Consultando historial...');
        var historial = [];
        var errorHistorial = null;

        try {
            var r = await db.from('mensajes_chat')
                .select('*')
                .eq('eliminado', false)
                .or(
                    'and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),' +
                    'and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')'
                )
                .order('created_at', { ascending: true })
                .limit(200);

            if (r && r.error) {
                errorHistorial = r.error;
                console.error('[Chat v3.8] ❌ Error Supabase historial:', r.error);
            } else {
                historial = (r && r.data) ? r.data : [];
                console.log('[Chat v3.8] Historial:', historial.length, 'mensajes');
            }
        } catch (e) {
            errorHistorial = e;
            console.error('[Chat v3.8] ❌ Excepción cargando historial:', e);
        }

        if (typeof current === 'undefined' || !current) return false;
        var esBotChat = _esConversacionBot();
        if (!esBotChat) {
            console.warn('[Chat v3.8] Usuario cambió de chat, abortando');
            return false;
        }
        if (!document.body.contains(box)) return false;

        anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            try { anchor = _asegurarUIBase(box); } catch (e) {}
            if (!anchor) return false;
        }

        if (errorHistorial) {
            var msgHist = errorHistorial.message || 'desconocido';
            console.error('[Chat v3.8] Historial falló:', msgHist);
            _renderizarErrorBot(box, 'Error al cargar historial: ' + msgHist);
            return false;
        }

        // Sin historial → bienvenida
        if (!historial.length) {
            console.log('[Chat v3.8] Sin historial, mostrando bienvenida');
            try {
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
                console.log('[Chat v3.8] ✅ Bienvenida renderizada');
                return true;
            } catch (e) {
                console.error('[Chat v3.8] ❌ Error insertando bienvenida:', e);
                _renderizarErrorBot(box, 'Error al renderizar bienvenida');
                return false;
            }
        }

        // URLs firmadas
        console.log('[Chat v3.8] Cargando URLs firmadas para', historial.length, 'mensajes');
        var results = await Promise.allSettled(
            historial.map(function(m) {
                try {
                    if (typeof getSignedUrlForMessage === 'function') {
                        var p = getSignedUrlForMessage(m);
                        return Promise.resolve(p).catch(function() {
                            return m.imagen_url || null;
                        });
                    }
                    return Promise.resolve(m.imagen_url || null);
                } catch (e) {
                    return Promise.resolve(m.imagen_url || null);
                }
            })
        );

        if (typeof current === 'undefined' || !current) return false;
        if (!_esConversacionBot()) return false;
        if (!document.body.contains(box)) return false;

        anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            try { anchor = _asegurarUIBase(box); } catch (e) {}
            if (!anchor) return false;
        }

        // Renderizar mensajes
        console.log('[Chat v3.8] Renderizando', historial.length, 'mensajes');
        var insertados = 0;
        var errores = 0;

        for (var i = 0; i < historial.length; i++) {
            var m = historial[i];
            try {
                if (_yaRenderizado(m.id)) continue;
                _marcarRenderizado(m.id);

                var url = (results[i] && results[i].status === 'fulfilled')
                    ? results[i].value
                    : (m.imagen_url || null);

                var esMio = _esMensajeMio(m) || _esAutoEnvio(m);
                var html = messageHTML(m, esMio, url);

                anchor.insertAdjacentHTML('beforebegin', html);
                insertados++;
            } catch (e) {
                errores++;
                console.error('[Chat v3.8] Error renderizando mensaje', m.id, ':', e);
            }
        }

        try {
            isUserAtBottom = true;
            observarCargaMultimedia(box);
            scrollToBottom(true);
        } catch (e) {}

        console.log('[Chat v3.8] ✅ Renderizado: ' + insertados + ' ok, ' + errores + ' errores');

        if (insertados === 0 && errores > 0) {
            _renderizarErrorBot(box, 'No se pudo renderizar ningún mensaje.');
            return false;
        }

        return true;

    } catch (e) {
        console.error('[Chat v3.8] 💥 Excepción general NO capturada:', e);
        try {
            var boxFallback = document.getElementById('messages');
            if (boxFallback) {
                _renderizarErrorBot(boxFallback, 'Error inesperado: ' + (e && e.message ? e.message : 'desconocido'));
            }
        } catch (e2) {}
        return false;
    }
}

// ================================================================
// _renderizarErrorBot
// ================================================================
function _renderizarErrorBot(box, mensaje) {
    try {
        if (!box) box = document.getElementById('messages');
        if (!box) return;

        var anchor = box.querySelector('#scrollAnchor');
        if (!anchor) {
            try { if (typeof _asegurarUIBase === 'function') anchor = _asegurarUIBase(box); } catch (e) {}
        }
        if (!anchor) return;

        var msgEscapado = String(mensaje)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        anchor.insertAdjacentHTML('beforebegin',
            '<div class="bubblewrap received" style="opacity:0.9;">' +
                '<div class="bubble" style="border:1px solid var(--danger);background:rgba(255,51,102,0.08);">' +
                    '<div class="bubble-bot-info">✦ MARQUINHOS</div>' +
                    '<div style="color:var(--danger);font-size:.8rem;">' +
                        '⚠️ ' + msgEscapado +
                    '</div>' +
                '</div>' +
            '</div>');
    } catch (e) {
        console.error('[Chat v3.8] _renderizarErrorBot TAMBIÉN falló:', e);
    }
}

// ================================================================
// HTML DE UN MENSAJE
// ================================================================
function messageHTML(m, sent, signedUrl) {
    sent = Boolean(sent);

    var body = (typeof esc === 'function' && typeof limpiarMarkdown === 'function')
        ? esc(limpiarMarkdown(m.contenido || ''))
        : String(m.contenido || '');

    var urlToUse = signedUrl || m.imagen_url;
    var urlOk = _urlSegura(urlToUse);

    if (urlOk) {
        if (m.tipo === 'imagen') {
            body = '<img src="' + esc(urlToUse) + '" alt="" loading="lazy">';
        } else if (m.tipo === 'video') {
            body = '<video controls playsinline preload="metadata" src="' + esc(urlToUse) + '"></video>';
        } else if (m.tipo === 'audio') {
            body = '<audio controls preload="metadata" src="' + esc(urlToUse) + '"></audio>';
        } else {
            var displayName = esc(m.nombre_archivo || body || 'Archivo');
            body = '<span class="file-icon">📎</span> <a href="' + esc(urlToUse) + '" target="_blank" rel="noopener" style="color:var(--gold)">' + displayName + '</a>';
        }
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

    return '<div ' + idAttr + 'class="' + wrapClass + '" data-msg-id="' + esc(msgIdSafe) + '">' +
        '<div class="bubble">' + headerBot + body + '</div>' +
        '<div class="meta">' + unreadDot + meta + '</div>' +
    '</div>';
}

// ================================================================
// VALIDACIONES
// ================================================================
function validarTextoChat(texto) {
    if (typeof texto !== 'string') return { ok: false, motivo: 'Texto inválido' };
    if (texto.length > MAX_TEXTO_LEN) return { ok: false, motivo: 'Máximo ' + MAX_TEXTO_LEN + ' letras' };
    return { ok: true };
}

function validarAudioChat(d) {
    if (typeof d !== 'number' || d <= 0) return { ok: false, motivo: 'Audio inválido' };
    if (d > MAX_AUDIO_SEGUNDOS) return { ok: true, recortarA: MAX_AUDIO_SEGUNDOS };
    return { ok: true };
}

function validarVideoChat(d, b) {
    if (typeof b === 'number' && b > MAX_VIDEO_BYTES) return { ok: false, motivo: 'Video muy pesado' };
    if (typeof d === 'number' && d > MAX_VIDEO_SEGUNDOS) return { ok: false, motivo: 'Video supera 2 minutos' };
    return { ok: true };
}

function validarFotoChat(b) {
    if (typeof b !== 'number') return { ok: false, motivo: 'Foto inválida' };
    if (b > MAX_FOTO_BYTES) return { ok: false, motivo: 'Foto muy pesada (máx 10MB)' };
    return { ok: true };
}

// ================================================================
// VISTO AL CONTESTAR
// ================================================================
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

        document.querySelectorAll('.bubblewrap.received.is-unread').forEach(function(el) {
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

// ================================================================
// ENVIAR MENSAJE
// ================================================================
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
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

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
    var userMsg = {
        contenido: textoLimpio,
        created_at: new Date().toISOString(),
        tipo: 'texto',
        remitente_id: user.id,
        destinatario_id: BOT_UUID,
        leido: false,
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

    mostrarTypingBot();

    try {
        var fnCargarHistorial = (window.Chat && window.Chat.cargarHistorialParaBot) || window.cargarHistorialParaBot;
        var fnPreguntar = (window.Chat && window.Chat.preguntarAlBot) || window.preguntarAlBot;

        if (typeof fnCargarHistorial !== 'function') throw new Error('El sistema del bot no está listo. Recarga la página.');
        if (typeof fnPreguntar !== 'function') throw new Error('El sistema del bot no está listo. Recarga la página.');

        var historial = await fnCargarHistorial();
        var respuesta = await fnPreguntar(textoLimpio, historial);

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
        isUserAtBottom = true;
        await append(botMsg, false);
        scrollToBottom(true);

        if (typeof loadConversations === 'function') loadConversations();

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
        try {
            await db.from('mensajes_chat').insert({
                remitente_id: BOT_UUID,
                destinatario_id: user.id,
                contenido: errorMsg.contenido,
                tipo: 'texto',
                leido: false,
                editado: false,
                eliminado: false
            });
        } catch (e2) {}
        isUserAtBottom = true;
        await append(errorMsg, false);
        scrollToBottom(true);
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
        await marcarConversacionComoLeida(current.id, r.data.created_at);
        if (typeof loadConversations === 'function') loadConversations();
    } catch (e) {
        console.error('[Chat] Error al enviar:', e);
        toast('❌ Error al enviar mensaje', 'error');
    }
}

// ================================================================
// AUDIO/VIDEO/FOTO
// ================================================================
async function sendAudio(blob, dur) {
    if (!current || !blob) return;
    if (!await auth()) return;
    var val = validarAudioChat(dur);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    try {
        var url = await subirArchivoChat(blob, 'audio');
        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: current.bot ? BOT_UUID : current.id,
            tipo: 'audio',
            imagen_url: url,
            leido: false, editado: false, eliminado: false
        }).select('*').single();
        if (ins.error || !ins.data) { toast('❌ Error al enviar audio', 'error'); return; }
        _marcarRenderizado(ins.data.id);
        await append(ins.data, true);
        var remitente = current.bot ? BOT_UUID : current.id;
        await marcarConversacionComoLeida(remitente, ins.data.created_at);
        if (typeof loadConversations === 'function') loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando audio:', e);
        toast('❌ Error al enviar audio', 'error');
    }
}

async function sendVideo(blob, dur, peso) {
    if (!current || !blob) return;
    if (!await auth()) return;
    var val = validarVideoChat(dur, peso || blob.size);
    if (!val.ok) { toast('⚠️ ' + val.motivo, 'error'); return; }

    try {
        var url = await subirArchivoChat(blob, 'video');
        var ins = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: current.bot ? BOT_UUID : current.id,
            tipo: 'video',
            imagen_url: url,
            leido: false, editado: false, eliminado: false
        }).select('*').single();
        if (ins.error || !ins.data) { toast('❌ Error al enviar video', 'error'); return; }
        _marcarRenderizado(ins.data.id);
        await append(ins.data, true);
        var remitente = current.bot ? BOT_UUID : current.id;
        await marcarConversacionComoLeida(remitente, ins.data.created_at);
        if (typeof loadConversations === 'function') loadConversations();
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
            leido: false, editado: false, eliminado: false
        }).select('*').single();
        if (ins.error || !ins.data) { toast('❌ Error al enviar foto', 'error'); return; }
        _marcarRenderizado(ins.data.id);
        await append(ins.data, true);
        var remitente = current.bot ? BOT_UUID : current.id;
        await marcarConversacionComoLeida(remitente, ins.data.created_at);
        if (typeof loadConversations === 'function') loadConversations();
    } catch (e) {
        console.error('[Chat] Error enviando foto:', e);
        toast('❌ Error al enviar foto', 'error');
    }
}

// ================================================================
// TYPING INDICATOR
// ================================================================
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

// ================================================================
// APPEND
// ================================================================
async function append(m, sent) {
    if (!current) return;
    var box = $('messages');
    if (!box) return;

    if (m.id) {
        var safeId = _safeDomId(m.id);
        if (document.getElementById('msg-' + safeId)) return;
        if (_yaRenderizado(m.id)) return;
    }

    if (m.id) _marcarRenderizado(m.id);

    var signedUrl = null;
    if (m.imagen_url || m.tipo === 'imagen' || m.tipo === 'video' || m.tipo === 'audio') {
        try {
            if (typeof getSignedUrlForMessage === 'function') {
                signedUrl = await getSignedUrlForMessage(m);
            }
        } catch (e) {
            console.warn('[Chat] Signed URL falló:', m.id, e);
        }
    }

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
    if (!sent && _esAutoEnvio(m)) sent = true;

    try {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, sent, signedUrl));
    } catch (e) {
        console.error('[Chat] Error insertando mensaje:', e);
        return;
    }
    observarCargaMultimedia(box);

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

// ================================================================
// RENDERIZAR MENSAJES (chat normal)
// ================================================================
async function renderMessages(rows) {
    var box = $('messages');
    if (!box) return;

    _limpiarMensajes(box);
    var anchor = _asegurarUIBase(box);

    if (!rows || !rows.length) {
        anchor.insertAdjacentHTML('beforebegin',
            '<div class="empty" id="emptyState"><strong>◈</strong><div>Sin mensajes</div><small>Envía el primer mensaje</small></div>');
        return;
    }

    var results = await Promise.allSettled(
        rows.map(function(m) {
            try {
                if (typeof getSignedUrlForMessage === 'function') {
                    return getSignedUrlForMessage(m);
                }
                return Promise.resolve(m.imagen_url || null);
            } catch (e) {
                return Promise.resolve(m.imagen_url || null);
            }
        })
    );

    if (!current) return;
    if (!document.body.contains(box)) return;

    anchor = box.querySelector('#scrollAnchor');
    if (!anchor) anchor = _asegurarUIBase(box);
    if (!anchor) return;

    rows.forEach(function(m, i) {
        if (_yaRenderizado(m.id)) return;
        _marcarRenderizado(m.id);
        var url = (results[i] && results[i].status === 'fulfilled') ? results[i].value : (m.imagen_url || null);
        var esMio = _esMensajeMio(m) || _esAutoEnvio(m);
        try {
            anchor.insertAdjacentHTML('beforebegin', messageHTML(m, esMio, url));
        } catch (e) {}
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ================================================================
// SUSCRIPCIÓN REALTIME
// ================================================================
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
                    table: 'mensajes_chat',
                    filter: 'or(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + user.id + ')'
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
                    if (_esMensajeMio(m) && !_esAutoEnvio(m)) return;

                    var safeId = _safeDomId(m.id);
                    if (!_yaRenderizado(m.id) && !document.getElementById('msg-' + safeId)) {
                        append(m, _esAutoEnvio(m));
                    }
                })
                .subscribe();
        })
        .catch(function(e) {
            console.warn('[Chat] Error en subscribeMessages:', e);
        });

    return _unsubPromise;
}

// ================================================================
// SCROLL
// ================================================================
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

function ocultarFlechaNuevos() { unreadCount = 0; actualizarFlecha(); }

function detectarSiEstaAbajo() {
    var box = $('messages');
    if (!box) return;
    var distanciaAlFondo = box.scrollHeight - box.scrollTop - box.clientHeight;
    var estabaAbajo = isUserAtBottom;
    isUserAtBottom = distanciaAlFondo < SCROLL_THRESHOLD;
    if (isUserAtBottom && !estabaAbajo) ocultarFlechaNuevos();
    _instalarCancelScrollManual(box);
}

// ================================================================
// OBSERVAR MULTIMEDIA
// ================================================================
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

// ================================================================
// TECLADO
// ================================================================
var _tecladoConfigurado = false;

function configurarAutoScrollTeclado() {
    if (_tecladoConfigurado) return;
    _tecladoConfigurado = true;

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            setTimeout(function() { if (isUserAtBottom) scrollToBottom(true); }, KEYBOARD_SCROLL_MS);
        });
    }

    var input = $('messageInput');
    if (input) {
        input.addEventListener('focus', function() { setTimeout(function() { scrollToBottom(true); }, KEYBOARD_SCROLL_MS); });
        input.addEventListener('input', function() {
            if (isUserAtBottom) setTimeout(function() { scrollToBottom(true); }, KEYBOARD_INPUT_MS);
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

// ================================================================
// LIMPIAR ESTADO
// ================================================================
async function limpiarEstadoConversacion() {
    _resetearMensajesRenderizados();
    var box = $('messages');
    if (box) {
        box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
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

// ================================================================
// HANDSHAKE
// ================================================================
function _botListo() {
    var fnCargarHistorial = (window.Chat && window.Chat.cargarHistorialParaBot) || window.cargarHistorialParaBot;
    var fnPreguntar = (window.Chat && window.Chat.preguntarAlBot) || window.preguntarAlBot;
    return typeof fnCargarHistorial === 'function' && typeof fnPreguntar === 'function';
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.Chat = window.Chat || {};

window.Chat.sendMessage = sendMessage;
window.Chat.sendAudio = sendAudio;
window.Chat.sendVideo = sendVideo;
window.Chat.sendFoto = sendFoto;
window.Chat.append = append;
window.Chat.renderMessages = renderMessages;
window.Chat.messageHTML = messageHTML;
window.Chat.abrirConversacionBot = abrirConversacionBot;
window.Chat.subscribeMessages = subscribeMessages;
window.Chat.scrollToBottom = scrollToBottom;
window.Chat.actualizarFlecha = actualizarFlecha;
window.Chat.ocultarFlechaNuevos = ocultarFlechaNuevos;
window.Chat.detectarSiEstaAbajo = detectarSiEstaAbajo;
window.Chat.observarCargaMultimedia = observarCargaMultimedia;
window.Chat.markRead = markRead;
window.Chat.marcarConversacionComoLeida = marcarConversacionComoLeida;
window.Chat.mostrarTypingBot = mostrarTypingBot;
window.Chat.quitarTypingBot = quitarTypingBot;
window.Chat.validarTextoChat = validarTextoChat;
window.Chat.validarAudioChat = validarAudioChat;
window.Chat.validarVideoChat = validarVideoChat;
window.Chat.validarFotoChat = validarFotoChat;
window.Chat._marcarRenderizado = _marcarRenderizado;
window.Chat._yaRenderizado = _yaRenderizado;
window.Chat._safeDomId = _safeDomId;
window.Chat._esMensajeDelBot = _esMensajeDelBot;
window.Chat._esConversacionBot = _esConversacionBot;
window.Chat.limpiarEstadoConversacion = limpiarEstadoConversacion;
window.Chat._botListo = _botListo;
window.Chat._mostrarEmptyState = _mostrarEmptyState;

window.sendMessage = sendMessage;
window.append = append;
window.abrirConversacionBot = abrirConversacionBot;
window.scrollToBottom = scrollToBottom;
window.markRead = markRead;
window.renderMessages = renderMessages;
window.subscribeMessages = subscribeMessages;
window.actualizarFlecha = actualizarFlecha;
window.ocultarFlechaNuevos = ocultarFlechaNuevos;
window.detectarSiEstaAbajo = detetarSiEstaAbajo;
window.observarCargaMultimedia = observarCargaMultimedia;
window.mostrarTypingBot = mostrarTypingBot;
window.quitarTypingBot = quitarTypingBot;
window.marcarConversacionComoLeida = marcarConversacionComoLeida;
window.limpiarEstadoConversacion = limpiarEstadoConversacion;
window._mostrarEmptyState = _mostrarEmptyState;
window._esUUID = _esUUID;
window._urlSegura = _urlSegura;
window._esMensajeMio = _esMensajeMio;
window._esAutoEnvio = _esAutoEnvio;
window._esConversacionBot = _esConversacionBot;
window._esMensajeDelBot = _esMensajeDelBot;
window._safeDomId = _safeDomId;
window._marcarRenderizado = _marcarRenderizado;
window._yaRenderizado = _yaRenderizado;
window._botListo = _botListo;
window.sendAudio = sendAudio;
window.sendVideo = sendVideo;
window.sendFoto = sendFoto;

console.log('[Mensajes] ✅ Chat v3.9 cargado (COMPLETO con abrirConversacionBot blindada)');