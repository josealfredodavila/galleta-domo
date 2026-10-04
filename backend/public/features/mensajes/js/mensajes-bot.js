// ================================================================
// MENSAJES · BOT (Marquinhos)
// ================================================================
// Historial para contexto, preguntar al bot, grabación de voz,
// envío de voz al bot y cancelación de operaciones.
// Se carga DESPUÉS de config, utils, auth, chat.
//
// IMPORTANTE: abrirConversacionBot() y enviarMensajeAlBot() NO se
// definen aquí (viven en mensajes-chat.js). Este archivo solo
// contiene los auxiliares.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// API BACKEND: /api/ai/chat y /api/ai/voice/chat
// ================================================================

'use strict';

// ================================================================
// ESTADO DEL BOT
// ================================================================
var _botAbortController = null;

// ================================================================
// CANCELAR OPERACIONES DEL BOT
// ================================================================
function cancelarOperacionesBot() {
    // Abortar fetch en curso
    if (_botAbortController && typeof _botAbortController.abort === 'function') {
        try { _botAbortController.abort(); } catch (e) {}
        _botAbortController = null;
    }

    // Detener grabación de voz del bot
    if (voiceBotRecorder && voiceBotRecorder.state !== 'inactive') {
        try { voiceBotRecorder.stop(); } catch (e) {}
    }

    // Reset flags
    voiceBotGrabando = false;
    enviandoVozBot = false;
}

// ================================================================
// CARGAR HISTORIAL PARA EL BOT
// ================================================================
async function cargarHistorialParaBot() {
    if (!user || !user.id) return [];

    try {
        var r = await db
            .from('mensajes_chat')
            .select('remitente_id, contenido, tipo, created_at')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: false })
            .limit(BOT_MAX_HISTORY);

        if (r.error || !Array.isArray(r.data)) return [];

        // Ordenar cronológicamente (del más viejo al más nuevo)
        return r.data
            .slice()
            .reverse()
            .map(function(m) {
                return {
                    role: m.remitente_id === user.id ? 'user' : 'assistant',
                    content: limpiarMarkdown(m.contenido || '').slice(0, 2000)
                };
            })
            .filter(function(m) {
                return m.content && m.content.length > 0;
            });
    } catch (e) {
        console.warn('[Mensajes/Bot] No se pudo cargar historial:', e);
        return [];
    }
}

// ================================================================
// PREGUNTAR AL BOT (texto)
// ================================================================
async function preguntarAlBot(mensaje, historial) {
    if (typeof mensaje !== 'string' || !mensaje.trim()) {
        throw new Error('Mensaje vacío');
    }

    var s = await session();
    if (!s) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
    if (!s.access_token) throw new Error('Sesión sin token válido.');

    // Cancelar cualquier fetch anterior
    if (_botAbortController) {
        try { _botAbortController.abort(); } catch (e) {}
    }
    _botAbortController = new AbortController();
    var controller = _botAbortController;

    var timeout = setTimeout(function() {
        try { controller.abort(); } catch (e) {}
    }, 50000);

    try {
        var r = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + s.access_token
            },
            body: JSON.stringify({
                message: mensaje.trim(),
                context: 'chat_sariels',
                history: Array.isArray(historial) ? historial : []
            }),
            signal: controller.signal
        });

        // Manejo de error HTTP primero
        if (!r.ok) {
            var textoErr = await r.text().catch(function() { return ''; });
            var dataErr = null;
            try { dataErr = JSON.parse(textoErr); } catch (e) {}

            if (r.status === 502 || r.status === 504) {
                throw new Error('El servidor está tardando o no disponible. Intenta de nuevo.');
            }
            if (r.status === 500) {
                throw new Error('El servidor tuvo un error interno. Revisa los logs.');
            }
            if (r.status === 429) {
                throw new Error('Demasiadas solicitudes. Espera un momento e intenta de nuevo.');
            }

            throw new Error((dataErr && dataErr.error) || ('Error del servidor (' + r.status + ')'));
        }

        // Parsear JSON
        var contentType = r.headers.get('content-type') || '';
        var data = null;

        if (contentType.indexOf('application/json') !== -1) {
            try { data = await r.json(); } catch (e) { data = null; }
        } else {
            throw new Error('El servidor no devolvió JSON válido.');
        }

        if (!data) {
            throw new Error('Respuesta vacía del servidor.');
        }
        if (data.success === false) {
            throw new Error(data.error || 'Marquinhos no pudo responder.');
        }

        var respuesta = typeof data.reply === 'string' ? data.reply.trim() : '';
        if (!respuesta) {
            throw new Error('Marquinhos respondió sin contenido.');
        }

        // Limpieza extra en frontend
        return limpiarMarkdown(respuesta);
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Marquinhos está tardando demasiado en responder. Intenta nuevamente.');
        }
        if (error.name === 'TypeError' && /Failed to fetch|NetworkError/i.test(error.message || '')) {
            throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        if (_botAbortController === controller) {
            _botAbortController = null;
        }
    }
}

// ================================================================
// GRABAR VOZ PARA EL BOT
// ================================================================
async function grabarVozParaBot() {
    if (!current || !current.bot) return;
    if (!await auth()) return;

    if (enviandoVozBot) {
        toast('⏳ Procesando audio anterior. Espera un momento…', 'warning');
        return;
    }

    // Si ya está grabando → detener
    if (voiceBotGrabando) {
        var rec = voiceBotRecorder;
        if (rec && rec.state !== 'inactive') {
            try { rec.stop(); } catch (e) {}
        }
        return;
    }

    var stream = null;

    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBotChunks = [];

        // MIME type robusto
        var mimeType = '';
        try {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
                var candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
                for (var i = 0; i < candidatos.length; i++) {
                    if (MediaRecorder.isTypeSupported(candidatos[i])) {
                        mimeType = candidatos[i];
                        break;
                    }
                }
            }
        } catch (e) {}

        voiceBotRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType: mimeType })
            : new MediaRecorder(stream);

        // Capturar referencia local al recorder para evitar overwrite
        var recorderLocal = voiceBotRecorder;

        recorderLocal.ondataavailable = function(e) {
            if (e.data && e.data.size) voiceBotChunks.push(e.data);
        };

        recorderLocal.onerror = function(e) {
            console.error('[Mensajes/Bot] MediaRecorder error:', e);
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            voiceBotGrabando = false;
            var btnErr = $('voiceBot');
            if (btnErr) {
                btnErr.classList.remove('recording');
                btnErr.textContent = '🔊';
            }
        };

        recorderLocal.onstop = async function() {
            // Detener micrófono
            if (stream) {
                try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
            }
            voiceBotGrabando = false;

            var btn = $('voiceBot');
            if (btn) {
                btn.classList.remove('recording');
                btn.textContent = '🔊';
            }

            try {
                var blob = new Blob(voiceBotChunks, {
                    type: recorderLocal.mimeType || mimeType || 'audio/webm'
                });
                voiceBotChunks = [];

                if (!blob.size) {
                    toast('⚠️ No se capturó audio', 'error');
                    return;
                }

                // Extensión según mime
                var ext = 'webm';
                if ((recorderLocal.mimeType || '').indexOf('mp4') !== -1) ext = 'm4a';
                else if ((recorderLocal.mimeType || '').indexOf('ogg') !== -1) ext = 'ogg';

                var file = new File([blob], 'voz-' + Date.now() + '.' + ext, {
                    type: blob.type
                });

                await enviarVozAlBot(file);
            } catch (err) {
                console.error('[Mensajes/Bot] Error procesando audio:', err);
                toast('❌ Error procesando audio', 'error');
            }
        };

        recorderLocal.start();
        voiceBotGrabando = true;

        var btn2 = $('voiceBot');
        if (btn2) {
            btn2.classList.add('recording');
            btn2.textContent = '⏹️';
        }

        toast('🎙️ Habla ahora… presiona otra vez para enviar');
    } catch (e) {
        console.error('[Mensajes/Bot] Error micrófono:', e);
        if (stream) {
            try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (_) {}
        }
        voiceBotGrabando = false;
        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}

// ================================================================
// ENVIAR VOZ AL BOT
// ================================================================
async function enviarVozAlBot(file) {
    if (enviandoVozBot) {
        toast('⏳ Ya hay un audio en proceso. Espera…', 'warning');
        return;
    }

    enviandoVozBot = true;

    var btn = $('voiceBot');
    if (btn) {
        btn.classList.add('processing');
        btn.textContent = '⏳';
        btn.disabled = true;
    }

    var boxLocal = $('messages');
    var chatIdCapturado = current ? current.id : null;
    var tempId = 'voice-user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    try {
        var s = await session();
        if (!s) {
            toast('⚠️ Sesión no disponible', 'error');
            return;
        }

        // ---- Subir audio a Storage ----
        var path = user.id + '/bot-voice/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.webm';

        var upRes = await db.storage.from(CHAT_AUDIO_BUCKET).upload(path, file, {
            contentType: file.type || 'audio/webm',
            upsert: false,
            cacheControl: '3600'
        });

        if (upRes.error) {
            console.error('[Mensajes/Bot] Error subiendo audio:', upRes.error);
            toast('❌ Error subiendo audio', 'error');
            return;
        }

        // ---- URL firmada ----
        var signedRes = await db.storage.from(CHAT_AUDIO_BUCKET).createSignedUrl(path, 3600);
        if (!signedRes || !signedRes.data || !signedRes.data.signedUrl) {
            toast('❌ Error firmando audio', 'error');
            return;
        }

        var signedUrl = signedRes.data.signedUrl;

        // ---- Verificar que seguimos en el chat del bot ----
        if (!current || current.id !== chatIdCapturado || !current.bot) {
            toast('ℹ️ Cambiaste de chat. El audio se enviará cuando vuelvas.', 'warning');
            return;
        }

        // ---- Insertar burbuja temporal ----
        var tempHTML =
            '<div class="bubblewrap sent" id="' + tempId + '">' +
                '<div class="bubble">' +
                    '<div class="voice-label">🎙️ TU VOZ</div>' +
                    '<div class="voice-loading">Enviando a ' + BOT_NOMBRE + '…</div>' +
                '</div>' +
            '</div>';

        var anchorRef = boxLocal ? boxLocal.querySelector('#scrollAnchor') : null;
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', tempHTML);
        else if (boxLocal) boxLocal.insertAdjacentHTML('beforeend', tempHTML);

        scrollToBottom(true);

        // ---- Llamar a la API con reintentos para 429 ----
        var intentos = 0;
        var maxIntentos = 3;
        var exito = false;
        var data = {};

        while (intentos < maxIntentos && !exito) {
            var r = await fetch('/api/ai/voice/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + s.access_token
                },
                body: JSON.stringify({
                    audio_url: signedUrl,
                    audioUrl: signedUrl
                })
            });

            data = await r.json().catch(function() { return {}; });

            if (r.status === 429) {
                intentos++;
                var waitTime = intentos * 2000;
                toast('⏳ Servidor ocupado. Reintentando en ' + (waitTime / 1000) + 's...', 'warning');
                await new Promise(function(resolve) { setTimeout(resolve, waitTime); });
                continue;
            }

            if (!r.ok || data.success === false) {
                throw new Error(data.error || 'Error del servicio de voz');
            }
            exito = true;
        }

        if (!exito) {
            throw new Error('El servidor de IA está saturado. Intenta de nuevo en unos minutos.');
        }

        // ---- Eliminar burbuja temporal ----
        var tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();

        // ---- Verificar contexto otra vez ----
        if (!current || current.id !== chatIdCapturado || !current.bot) {
            toast('ℹ️ Cambiaste de chat. La respuesta se guardará en el historial.', 'warning');
        }

        // ---- Guardar nota de voz del usuario en BD ----
        try {
            await db.from('mensajes_chat').insert({
                remitente_id: user.id,
                destinatario_id: BOT_UUID,
                contenido: data.transcripcion || file.name,
                nombre_archivo: file.name,
                imagen_url: 'bucket://' + CHAT_AUDIO_BUCKET + '/' + path,
                tipo: 'audio',
                leido: true,
                editado: false,
                eliminado: false,
                es_bot: false
            });
        } catch (e) {
            console.warn('[Mensajes/Bot] No se pudo guardar nota de voz:', e);
        }

        // ---- Guardar respuesta del bot en BD ----
        if (data.reply) {
            try {
                await db.from('mensajes_chat').insert({
                    remitente_id: BOT_UUID,
                    destinatario_id: user.id,
                    contenido: data.reply,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false,
                    es_bot: true,
                    bot_nombre: BOT_NOMBRE
                });
            } catch (e) {
                console.warn('[Mensajes/Bot] No se pudo guardar respuesta del bot:', e);
            }
        }

        // ---- Verificar contexto antes de renderizar ----
        if (!current || current.id !== chatIdCapturado || !current.bot) {
            loadConversations();
            return;
        }

        // ---- Renderizar burbuja del bot ----
        var botId = 'voice-bot-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        var botBody = '<div class="bubble-bot-info">✦ ' + BOT_NOMBRE.toUpperCase() + '</div>';

        if (data.transcripcion) {
            botBody += '<div class="bot-transcripcion">🎙️ "' + esc(data.transcripcion) + '"</div>';
        }

        botBody += '<div>' + esc(limpiarMarkdown(data.reply || 'Sin respuesta')) + '</div>';

        if (data.audio_url && urlSegura(data.audio_url)) {
            botBody += '<audio class="bot-audio" controls preload="metadata" src="' + esc(data.audio_url) + '"></audio>';
        }

        var botHTML =
            '<div class="bubblewrap received" id="' + botId + '">' +
                '<div class="bubble">' + botBody + '</div>' +
            '</div>';

        isUserAtBottom = true;

        var anchorRef2 = boxLocal ? boxLocal.querySelector('#scrollAnchor') : null;
        if (anchorRef2) anchorRef2.insertAdjacentHTML('beforebegin', botHTML);
        else if (boxLocal) boxLocal.insertAdjacentHTML('beforeend', botHTML);

        observarCargaMultimedia(boxLocal);
        scrollToBottom(true);

        // Autoplay del audio del bot
        if (data.audio_url && urlSegura(data.audio_url)) {
            var audio = document.querySelector('#' + botId + ' audio');
            if (audio && document.body.contains(audio)) {
                audio.play().catch(function(err) {
                    if (window.DEBUG_CHAT) console.warn('[Mensajes/Bot] Autoplay bloqueado:', err);
                });
            }
        }

        loadConversations();
    } catch (e) {
        console.error('[Mensajes/Bot] Error enviando voz:', e);

        var tempEl2 = document.getElementById(tempId);
        if (tempEl2) tempEl2.remove();

        if (e.message.indexOf('429') !== -1 ||
            e.message.indexOf('Too Many Requests') !== -1 ||
            e.message.indexOf('saturado') !== -1) {
            toast('⏳ El asistente está saturado. Espera unos segundos e intenta de nuevo.', 'warning');
        } else {
            toast('❌ ' + (e.message || 'Error desconocido'), 'error');
        }
    } finally {
        enviandoVozBot = false;
        var btn3 = $('voiceBot');
        if (btn3) {
            btn3.classList.remove('processing');
            btn3.textContent = '🔊';
            btn3.disabled = false;
        }
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.cargarHistorialParaBot = cargarHistorialParaBot;
window.preguntarAlBot = preguntarAlBot;
window.grabarVozParaBot = grabarVozParaBot;
window.enviarVozAlBot = enviarVozAlBot;
window.cancelarOperacionesBot = cancelarOperacionesBot;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Bot] ✅ Bot cargado');
}