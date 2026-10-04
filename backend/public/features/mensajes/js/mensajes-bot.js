// ================================================================
// MENSAJES · BOT (Marquinhos) — v2.6
// ================================================================
// CORRECCIONES v2.6 (sobre v2.5):
// - ✅ Verificación del ecosistema a los 2s (detecta faltantes)
// - ✅ Logging detallado para diagnóstico
//
// HEREDADO v2.5:
// - Handshake: emite evento `marquinhos:listo` al cargar
// - Función `_botEstaListo()` para verificar estado
// - API unificada `window.enviarMensajeAlBot(texto)`
// - Listeners de eventos `marquinhos:chatAbierto` / `marquinhos:chatCerrado`
// - Namespace `window.Chat` completo
//
// HEREDADO v2.4:
// - NO define abrirConversacionBot (delegada a mensajes-chat.js)
// - Valida dependencias antes de usar db/user
// - Usa BOT_UUID como destinatario real del bot
// - Normaliza BOT_ID / BOT_UUID
// - Historial seguro y limitado
// - Compatible con /api/ai/chat
// - Valida correctamente la sesión y access_token
// - Maneja errores HTTP y respuestas no JSON
// - Evita que un error del bot rompa mensajes.html
// - Voz: subida, signed URL, reintentos 429 y renderizado
// - Limpia correctamente el estado de grabación
// - No elimina mensajes de voz de otros elementos
// - Escapa correctamente contenido dinámico
// - Exposición global compatible con código antiguo
// ================================================================

// ----------------------------------------------------------------
// NAMESPACE
// ----------------------------------------------------------------
window.Chat = window.Chat || {};

// ----------------------------------------------------------------
// ✅ v2.5: LISTENER — Chat del bot abierto
// ----------------------------------------------------------------
window.addEventListener('marquinhos:chatAbierto', function(e) {
    console.log('[Bot] marquinhos:chatAbierto recibido:', e && e.detail);
});

// ----------------------------------------------------------------
// ✅ v2.5: LISTENER — Chat del bot cerrado
// ----------------------------------------------------------------
window.addEventListener('marquinhos:chatCerrado', function(e) {
    console.log('[Bot] marquinhos:chatCerrado recibido:', e && e.detail);

    if (typeof voiceBotGrabando !== 'undefined' && voiceBotGrabando) {
        if (typeof voiceBotRecorder !== 'undefined' && voiceBotRecorder) {
            try {
                if (voiceBotRecorder.state !== 'inactive') {
                    voiceBotRecorder.stop();
                }
            } catch (err) {
                console.warn('[Bot] Error deteniendo grabación al cerrar chat:', err);
            }
        }
        try {
            voiceBotGrabando = false;
            voiceBotChunks = [];
        } catch (err) {}
    }

    var btn = document.getElementById('voiceBot');
    if (btn) {
        btn.classList.remove('recording');
        btn.textContent = '✦';
    }
});

// ----------------------------------------------------------------
// HELPERS DE DEPENDENCIAS
// ----------------------------------------------------------------
function _botTieneDB() {
    return (
        typeof db !== 'undefined' &&
        db &&
        typeof db.from === 'function'
    );
}

function _botTieneUsuario() {
    return (
        typeof user !== 'undefined' &&
        user &&
        user.id
    );
}

function _botTieneSesion() {
    return typeof session === 'function';
}

function _botLimpiarTexto(texto) {
    texto = typeof texto === 'string' ? texto : '';

    if (typeof limpiarMarkdown === 'function') {
        try {
            return limpiarMarkdown(texto);
        } catch (e) {
            console.warn('[Bot] Error en limpiarMarkdown:', e);
        }
    }

    return texto
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .trim();
}

function _botEsc(texto) {
    texto = texto == null ? '' : String(texto);

    if (typeof esc === 'function') {
        try {
            return esc(texto);
        } catch (e) {
            console.warn('[Bot] Error en esc:', e);
        }
    }

    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function _botToast(mensaje, tipo) {
    if (typeof toast === 'function') {
        toast(mensaje, tipo);
    } else {
        console.warn('[Bot]', mensaje);
    }
}

function _botScroll() {
    if (typeof scrollToBottom === 'function') {
        try {
            scrollToBottom(true);
        } catch (e) {}
    }
}

// ----------------------------------------------------------------
// NORMALIZACIÓN DE ID DEL BOT
// ----------------------------------------------------------------
function _normalizarBotId(id) {
    var uuid = (typeof BOT_UUID !== 'undefined' && BOT_UUID) ? String(BOT_UUID) : '';
    var botId = (typeof BOT_ID !== 'undefined' && BOT_ID) ? String(BOT_ID) : 'bot-marquinhos';

    if (!id) return uuid || botId;

    var s = String(id);
    if (s === botId || s === 'bot-marquinhos' || s === 'marquinhos') {
        return uuid || botId;
    }
    return s;
}

function _esIdDelBot(id) {
    if (!id) return false;

    var s = String(id);
    var uuid = (typeof BOT_UUID !== 'undefined' && BOT_UUID) ? String(BOT_UUID) : '';
    var botId = (typeof BOT_ID !== 'undefined' && BOT_ID) ? String(BOT_ID) : 'bot-marquinhos';

    return (
        s === botId ||
        s === uuid ||
        s === 'bot-marquinhos' ||
        s === 'marquinhos'
    );
}

// ----------------------------------------------------------------
// CARGAR HISTORIAL PARA MARQUINHOS
// ----------------------------------------------------------------
async function cargarHistorialParaBot() {
    try {
        if (!_botTieneDB()) {
            console.warn('[Bot] db todavía no está disponible.');
            return [];
        }

        if (!_botTieneUsuario()) {
            console.warn('[Bot] usuario todavía no está disponible.');
            return [];
        }

        var botUuid = _normalizarBotId(
            typeof BOT_UUID !== 'undefined' ? BOT_UUID : null
        );

        if (!botUuid) {
            console.warn('[Bot] BOT_UUID no está definido.');
            return [];
        }

        var limite =
            typeof BOT_MAX_HISTORY === 'number' && BOT_MAX_HISTORY > 0
                ? Math.min(BOT_MAX_HISTORY, 50)
                : 20;

        var filtro =
            'and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + botUuid + '),' +
            'and(remitente_id.eq.' + botUuid + ',destinatario_id.eq.' + user.id + ')';

        var r = await db
            .from('mensajes_chat')
            .select('remitente_id, destinatario_id, contenido, tipo, created_at')
            .eq('eliminado', false)
            .or(filtro)
            .order('created_at', { ascending: false })
            .limit(limite);

        if (r.error) {
            console.warn('[Bot] Error cargando historial:', r.error);
            return [];
        }

        if (!Array.isArray(r.data)) return [];

        return r.data
            .slice()
            .reverse()
            .map(function(m) {
                var contenido = typeof m.contenido === 'string' ? m.contenido : '';
                contenido = _botLimpiarTexto(contenido).slice(0, 2000).trim();

                if (!contenido) return null;

                return {
                    role: String(m.remitente_id) === String(user.id) ? 'user' : 'assistant',
                    content: contenido
                };
            })
            .filter(function(m) { return !!m; });

    } catch (e) {
        console.warn('[Bot] No se pudo cargar historial para Marquinhos:', e);
        return [];
    }
}

// ----------------------------------------------------------------
// PREGUNTAR A MARQUINHOS
// ----------------------------------------------------------------
async function preguntarAlBot(mensaje, historial) {
    if (typeof mensaje !== 'string' || !mensaje.trim()) {
        throw new Error('Escribe un mensaje para Marquinhos.');
    }

    if (!_botTieneDB()) {
        throw new Error('El sistema todavía está inicializando. Intenta nuevamente.');
    }

    if (!_botTieneUsuario()) {
        throw new Error('No hay un usuario autenticado.');
    }

    if (!_botTieneSesion()) {
        throw new Error('El sistema de sesión todavía no está disponible.');
    }

    var s;
    try {
        s = await session();
    } catch (e) {
        console.error('[Bot] Error obteniendo sesión:', e);
        throw new Error('No se pudo comprobar tu sesión.');
    }

    if (!s) {
        throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
    }

    if (!s.access_token) {
        throw new Error('La sesión no tiene un token válido. Recarga la página e intenta nuevamente.');
    }

    var texto = mensaje.trim();

    var historialSeguro =
        Array.isArray(historial)
            ? historial
                .filter(function(item) {
                    return (
                        item &&
                        typeof item.content === 'string' &&
                        (item.role === 'user' || item.role === 'assistant')
                    );
                })
                .slice(-20)
                .map(function(item) {
                    return {
                        role: item.role,
                        content: _botLimpiarTexto(item.content).slice(0, 2000)
                    };
                })
                .filter(function(item) { return item.content; })
            : [];

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = null;

    if (controller) {
        timeout = setTimeout(function() { controller.abort(); }, 50000);
    }

    try {
        var opciones = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + s.access_token
            },
            body: JSON.stringify({
                message: texto,
                context: 'chat_sariels',
                history: historialSeguro
            })
        };

        if (controller) opciones.signal = controller.signal;

        var r = await fetch('/api/ai/chat', opciones);

        var contentType = r.headers.get('content-type') || '';
        var textoRespuesta = '';

        try {
            textoRespuesta = await r.text();
        } catch (e) {
            textoRespuesta = '';
        }

        var data = null;
        if (textoRespuesta) {
            try {
                data = JSON.parse(textoRespuesta);
            } catch (e) {
                data = null;
            }
        }

        if (!r.ok) {
            var mensajeError = data && typeof data.error === 'string' ? data.error : '';

            if (!mensajeError) {
                if (r.status === 401) {
                    mensajeError = 'Tu sesión expiró. Inicia sesión nuevamente.';
                } else if (r.status === 403) {
                    mensajeError = 'No tienes autorización para usar Marquinhos.';
                } else if (r.status === 429) {
                    mensajeError = 'Marquinhos está recibiendo muchas solicitudes. Espera unos segundos.';
                } else if (r.status >= 500) {
                    mensajeError = 'El servidor de Marquinhos tuvo un problema. Intenta nuevamente.';
                } else {
                    mensajeError = 'Error del servidor (' + r.status + ').';
                }
            }

            throw new Error(mensajeError);
        }

        if (contentType.indexOf('application/json') === -1) {
            throw new Error('Marquinhos devolvió una respuesta inválida.');
        }

        if (!data) {
            throw new Error('No se pudo interpretar la respuesta de Marquinhos.');
        }

        if (data.success === false) {
            throw new Error(typeof data.error === 'string' ? data.error : 'Marquinhos no pudo responder.');
        }

        var respuesta = '';

        if (typeof data.reply === 'string') respuesta = data.reply;
        else if (typeof data.response === 'string') respuesta = data.response;
        else if (typeof data.message === 'string') respuesta = data.message;

        respuesta = _botLimpiarTexto(respuesta).trim();

        if (!respuesta) {
            throw new Error('Marquinhos respondió sin contenido.');
        }

        return respuesta;

    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw new Error('Marquinhos está tardando demasiado en responder. Intenta nuevamente.');
        }

        if (
            error &&
            error.name === 'TypeError' &&
            /Failed to fetch|NetworkError|Load failed/i.test(error.message || '')
        ) {
            throw new Error('No se pudo conectar con Marquinhos. Revisa tu conexión.');
        }

        throw error;

    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

// ----------------------------------------------------------------
// GRABAR VOZ PARA MARQUINHOS
// ----------------------------------------------------------------
async function grabarVozParaBot() {
    if (typeof current !== 'undefined' && current && current.bot === false) {
        return;
    }

    if (typeof auth === 'function') {
        var autenticado = await auth();
        if (!autenticado) return;
    }

    if (typeof enviandoVozBot !== 'undefined' && enviandoVozBot) {
        _botToast('⏳ Procesando audio anterior. Espera un momento…', 'warning');
        return;
    }

    if (typeof voiceBotGrabando !== 'undefined' && voiceBotGrabando) {
        if (
            typeof voiceBotRecorder !== 'undefined' &&
            voiceBotRecorder &&
            voiceBotRecorder.state !== 'inactive'
        ) {
            voiceBotRecorder.stop();
        }
        return;
    }

    if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
        _botToast('❌ Este navegador no permite acceder al micrófono.', 'error');
        return;
    }

    try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBotChunks = [];

        var mimeType = '';

        if (
            typeof MediaRecorder !== 'undefined' &&
            typeof MediaRecorder.isTypeSupported === 'function'
        ) {
            var tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

            for (var i = 0; i < tipos.length; i++) {
                if (MediaRecorder.isTypeSupported(tipos[i])) {
                    mimeType = tipos[i];
                    break;
                }
            }
        }

        voiceBotRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType: mimeType })
            : new MediaRecorder(stream);

        voiceBotRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size) {
                voiceBotChunks.push(e.data);
            }
        };

        voiceBotRecorder.onerror = function(e) {
            console.error('[Bot] MediaRecorder error:', e);
            stream.getTracks().forEach(function(track) { track.stop(); });
            voiceBotGrabando = false;

            var errorBtn = $('voiceBot');
            if (errorBtn) {
                errorBtn.classList.remove('recording');
                errorBtn.textContent = '✦';
            }
        };

        voiceBotRecorder.onstop = async function() {
            stream.getTracks().forEach(function(track) { track.stop(); });
            voiceBotGrabando = false;

            var btn = $('voiceBot');
            if (btn) {
                btn.classList.remove('recording');
                btn.textContent = '✦';
            }

            var tipoAudio = voiceBotRecorder.mimeType || mimeType || 'audio/webm';
            var blob = new Blob(voiceBotChunks, { type: tipoAudio });
            voiceBotChunks = [];

            if (!blob.size) {
                _botToast('⚠️ No se capturó audio.', 'error');
                return;
            }

            var extension = tipoAudio.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
            var file = new File(
                [blob],
                'voz-' + Date.now() + '.' + extension,
                { type: tipoAudio }
            );

            await enviarVozAlBot(file);
        };

        voiceBotRecorder.start();
        voiceBotGrabando = true;

        var btn2 = $('voiceBot');
        if (btn2) {
            btn2.classList.add('recording');
            btn2.textContent = '■';
        }

        _botToast('🎙️ Habla ahora… presiona otra vez para enviar');

    } catch (e) {
        console.error('[Bot] Error micrófono:', e);
        voiceBotGrabando = false;
        _botToast(
            e && e.name === 'NotAllowedError'
                ? '❌ Permiso de micrófono denegado.'
                : '❌ No se pudo acceder al micrófono.',
            'error'
        );
    }
}

// ----------------------------------------------------------------
// ENVIAR VOZ A MARQUINHOS
// ----------------------------------------------------------------
async function enviarVozAlBot(file) {
    if (!file || !file.size) {
        _botToast('❌ El audio está vacío.', 'error');
        return;
    }

    if (typeof enviandoVozBot !== 'undefined' && enviandoVozBot) {
        _botToast('⏳ Ya hay un audio en proceso. Espera…', 'warning');
        return;
    }

    if (!_botTieneDB()) {
        _botToast('❌ El sistema todavía no está listo.', 'error');
        return;
    }

    if (!_botTieneUsuario()) {
        _botToast('❌ No hay una sesión de usuario activa.', 'error');
        return;
    }

    enviandoVozBot = true;

    var btn = $('voiceBot');
    if (btn) {
        btn.classList.add('processing');
        btn.textContent = '⏳';
        btn.disabled = true;
    }

    var tempId = null;

    try {
        var s = typeof session === 'function' ? await session() : null;

        if (!s || !s.access_token) {
            throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
        }

        var bucket =
            (typeof CHAT_AUDIO_BUCKET !== 'undefined' && CHAT_AUDIO_BUCKET)
                ? CHAT_AUDIO_BUCKET
                : 'chat-audio';

        var path = user.id + '/bot-voice/' + Date.now() + '.webm';

        var uploadResult = await db.storage.from(bucket).upload(
            path,
            file,
            {
                contentType: file.type || 'audio/webm',
                upsert: false
            }
        );

        if (uploadResult && uploadResult.error) {
            throw new Error('Error subiendo el audio: ' + uploadResult.error.message);
        }

        var signed = await db.storage.from(bucket).createSignedUrl(path, 3600);

        if (!signed || signed.error || !signed.data || !signed.data.signedUrl) {
            throw new Error('No se pudo generar el enlace temporal del audio.');
        }

        tempId = 'voice-user-' + Date.now();

        var box = $('messages');
        if (!box) {
            throw new Error('No se encontró el contenedor de mensajes.');
        }

        var tempHTML =
            '<div class="bubblewrap sent" id="' + _botEsc(tempId) + '">' +
                '<div class="bubble">' +
                    '<div class="voice-label">🎙️ TU VOZ</div>' +
                    '<div class="voice-loading">Enviando a Marquinhos…</div>' +
                '</div>' +
            '</div>';

        var anchorRef = box.querySelector('#scrollAnchor');

        if (anchorRef) {
            anchorRef.insertAdjacentHTML('beforebegin', tempHTML);
        } else {
            box.insertAdjacentHTML('beforeend', tempHTML);
        }

        _botScroll();

        var intentos = 0;
        var maxIntentos = 3;
        var data = null;

        while (intentos < maxIntentos) {
            var r = await fetch('/api/ai/voice/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + s.access_token
                },
                body: JSON.stringify({
                    audio_url: signed.data.signedUrl
                })
            });

            var texto = '';

            try {
                texto = await r.text();
            } catch (e) {
                texto = '';
            }

            data = null;
            if (texto) {
                try {
                    data = JSON.parse(texto);
                } catch (e) {
                    data = null;
                }
            }

            if (r.status === 429) {
                intentos++;

                if (intentos >= maxIntentos) break;

                var waitTime = intentos * 2000;

                _botToast(
                    '⏳ Servidor ocupado. Reintentando en ' + (waitTime / 1000) + 's…',
                    'warning'
                );

                await new Promise(function(resolve) { setTimeout(resolve, waitTime); });
                continue;
            }

            if (!r.ok) {
                throw new Error(
                    data && typeof data.error === 'string'
                        ? data.error
                        : 'Error del servicio de voz (' + r.status + ').'
                );
            }

            if (!data) {
                throw new Error('El servidor de voz devolvió una respuesta inválida.');
            }

            if (data.success === false) {
                throw new Error(data.error || 'Marquinhos no pudo procesar el audio.');
            }

            break;
        }

        if (!data || data.success === false) {
            throw new Error('El servidor de IA está saturado. Intenta nuevamente en unos minutos.');
        }

        var tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();

        // Guardar audio del usuario
        try {
            await db.from('mensajes_chat').insert({
                remitente_id: user.id,
                destinatario_id: _normalizarBotId(
                    typeof BOT_UUID !== 'undefined' ? BOT_UUID : null
                ),
                contenido:
                    typeof data.transcripcion === 'string' && data.transcripcion.trim()
                        ? data.transcripcion.trim()
                        : file.name,
                nombre_archivo: file.name,
                imagen_url: 'bucket://' + bucket + '/' + path,
                tipo: 'audio',
                leido: true,
                editado: false,
                eliminado: false
            });
        } catch (e) {
            console.warn('[Bot] No se pudo guardar nota de voz:', e);
        }

        // Guardar respuesta del bot
        if (typeof data.reply === 'string' && data.reply.trim()) {
            try {
                await db.from('mensajes_chat').insert({
                    remitente_id: _normalizarBotId(
                        typeof BOT_UUID !== 'undefined' ? BOT_UUID : null
                    ),
                    destinatario_id: user.id,
                    contenido: data.reply,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false
                });
            } catch (e) {
                console.warn('[Bot] No se pudo guardar respuesta:', e);
            }
        }

        // Renderizar respuesta
        var botId = 'voice-bot-' + Date.now();
        var respuestaBot =
            typeof data.reply === 'string' && data.reply.trim()
                ? _botLimpiarTexto(data.reply)
                : 'Sin respuesta';

        var botBody = '<div class="bubble-bot-info">✦ MARQUINHOS</div>';

        if (typeof data.transcripcion === 'string' && data.transcripcion.trim()) {
            botBody += '<div class="bot-transcripcion">🎙️ "' + _botEsc(data.transcripcion) + '"</div>';
        }

        botBody += '<div>' + _botEsc(respuestaBot) + '</div>';

        if (typeof data.audio_url === 'string' && data.audio_url) {
            botBody += '<audio class="bot-audio" controls src="' + _botEsc(data.audio_url) + '"></audio>';
        }

        var botHTML =
            '<div class="bubblewrap received" id="' + _botEsc(botId) + '">' +
                '<div class="bubble">' + botBody + '</div>' +
            '</div>';

        var box2 = $('messages');

        if (box2) {
            var anchorRef2 = box2.querySelector('#scrollAnchor');

            if (anchorRef2) {
                anchorRef2.insertAdjacentHTML('beforebegin', botHTML);
            } else {
                box2.insertAdjacentHTML('beforeend', botHTML);
            }

            if (typeof observarCargaMultimedia === 'function') {
                try { observarCargaMultimedia(box2); } catch (e) {}
            }

            _botScroll();

            if (typeof data.audio_url === 'string' && data.audio_url) {
                var audio = document.querySelector('#' + botId + ' audio');
                if (audio) audio.play().catch(function() {});
            }
        }

        if (typeof loadConversations === 'function') {
            try {
                await loadConversations();
            } catch (e) {
                console.warn('[Bot] No se pudo actualizar conversaciones:', e);
            }
        }

    } catch (e) {
        console.error('[Bot] Error voz Marquinhos:', e);

        if (tempId) {
            var temp = document.getElementById(tempId);
            if (temp) temp.remove();
        }

        var msg = e && e.message ? e.message : 'No se pudo procesar el audio.';

        if (
            msg.indexOf('429') !== -1 ||
            /Too Many Requests/i.test(msg) ||
            /saturado/i.test(msg)
        ) {
            _botToast(
                '⏳ Marquinhos está saturado. Espera unos segundos e intenta nuevamente.',
                'warning'
            );
        } else {
            _botToast('❌ ' + msg, 'error');
        }

    } finally {
        enviandoVozBot = false;

        var btn3 = $('voiceBot');
        if (btn3) {
            btn3.classList.remove('processing');
            btn3.textContent = '✦';
            btn3.disabled = false;
        }
    }
}

// ================================================================
// ✅ v2.5: API UNIFICADA — enviar mensaje al bot desde cualquier lugar
// ================================================================
async function enviarMensajeAlBot(texto) {
    if (!texto || typeof texto !== 'string' || !texto.trim()) {
        throw new Error('El mensaje está vacío.');
    }

    if (typeof current === 'undefined' || !current) {
        throw new Error('No hay una conversación activa. Abre el chat de Marquinhos primero.');
    }

    if (!current.bot && !_esIdDelBot(current.id)) {
        throw new Error('La conversación activa no es con Marquinhos. Ábrela primero.');
    }

    if (typeof sendMessage === 'function') {
        await sendMessage(texto.trim());
        return true;
    }

    throw new Error('sendMessage no está disponible. El sistema todavía se está inicializando.');
}

// ================================================================
// ✅ v2.5: VERIFICAR ESTADO DEL BOT
// ================================================================
function _botEstaListo() {
    return (
        typeof cargarHistorialParaBot === 'function' &&
        typeof preguntarAlBot === 'function' &&
        typeof enviarVozAlBot === 'function' &&
        typeof db !== 'undefined' &&
        db !== null
    );
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.cargarHistorialParaBot = cargarHistorialParaBot;
window.preguntarAlBot = preguntarAlBot;
window.grabarVozParaBot = grabarVozParaBot;
window.enviarVozAlBot = enviarVozAlBot;
window.enviarMensajeAlBot = enviarMensajeAlBot;
window._esIdDelBot = _esIdDelBot;
window._normalizarBotId = _normalizarBotId;
window._botEstaListo = _botEstaListo;

// ----------------------------------------------------------------
// NAMESPACE Chat
// ----------------------------------------------------------------
window.Chat = window.Chat || {};

window.Chat.cargarHistorialParaBot = cargarHistorialParaBot;
window.Chat.preguntarAlBot = preguntarAlBot;
window.Chat.grabarVozParaBot = grabarVozParaBot;
window.Chat.enviarVozAlBot = enviarVozAlBot;
window.Chat.enviarMensajeAlBot = enviarMensajeAlBot;
window.Chat._botEstaListo = _botEstaListo;

// ================================================================
// ✅ v2.5: EVENTO DE LISTO
// ================================================================
try {
    window.dispatchEvent(new CustomEvent('marquinhos:listo', {
        detail: {
            version: '2.6',
            funciones: [
                'cargarHistorialParaBot',
                'preguntarAlBot',
                'grabarVozParaBot',
                'enviarVozAlBot',
                'enviarMensajeAlBot'
            ],
            timestamp: Date.now()
        }
    }));
} catch (e) {
    console.warn('[Bot] No se pudo emitir evento marquinhos:listo:', e);
}

// ================================================================
// ✅ v2.6: VERIFICAR QUE EL ECOSISTEMA ESTÉ COMPLETO
// ================================================================
setTimeout(function() {
    var faltantes = [];

    if (typeof window.abrirConversacionBot !== 'function') faltantes.push('abrirConversacionBot');
    if (typeof window.sendMessage !== 'function') faltantes.push('sendMessage');
    if (typeof window.renderMessages !== 'function') faltantes.push('renderMessages');
    if (typeof window.loadConversations !== 'function') faltantes.push('loadConversations');
    if (typeof window.openConversation !== 'function') faltantes.push('openConversation');

    if (faltantes.length > 0) {
        console.error('[Bot] ❌ Funciones del ecosistema no disponibles:', faltantes);
        console.error('[Bot] Verifica el orden de carga en mensajes.html');
    } else {
        console.log('[Bot] ✅ Ecosistema completo verificado');
    }
}, 2000);

// ================================================================
// DIAGNÓSTICO
// ================================================================
console.log('[Mensajes] ✅ Marquinhos Bot v2.6 cargado');
console.log('[Mensajes] abrirConversacionBot: delegada a mensajes-chat.js');
console.log('[Mensajes] API unificada disponible:');
console.log('  • window.cargarHistorialParaBot');
console.log('  • window.preguntarAlBot');
console.log('  • window.grabarVozParaBot');
console.log('  • window.enviarVozAlBot');
console.log('  • window.enviarMensajeAlBot');
console.log('  • window.Chat._botEstaListo()');