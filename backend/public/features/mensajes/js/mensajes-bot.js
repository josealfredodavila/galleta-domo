// ================================================================
// MENSAJES · BOT (Marquinhos)
// ================================================================
// Conversación con el asistente IA: texto, voz, historial.
// Depende de: config, utils, auth, chat, archivos.
// ================================================================

// ================================================================
// ABRIR CONVERSACIÓN CON MARQUINHOS
// ================================================================
async function abrirConversacionBot() {
    var box = $('messages');
    if (!box) return;

    // Asegurar botón de scroll down
    var btn = box.querySelector('#scrollDownBtn');
    var anchor = box.querySelector('#scrollAnchor');

    box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
    box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });

    if (!anchor) {
        var newAnchor = document.createElement('div');
        newAnchor.id = 'scrollAnchor';
        box.appendChild(newAnchor);
        anchor = newAnchor;
    }

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

    // Cargar historial
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
        console.warn('[Mensajes] No se pudo cargar el historial de Marquinhos:', e);
    }

    var anchorRef = box.querySelector('#scrollAnchor');

    // Sin historial → mensaje de bienvenida
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

    // Renderizar historial con URLs firmadas
    var signedUrls = await Promise.all(historial.map(function(m) {
        return getSignedUrlForMessage(m);
    }));

    historial.forEach(function(m, i) {
        anchorRef.insertAdjacentHTML('beforebegin',
            messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });

    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

// ================================================================
// CARGAR HISTORIAL PARA EL BOT (contexto de IA)
// ================================================================
async function cargarHistorialParaBot() {
    try {
        var r = await db
            .from('mensajes_chat')
            .select('remitente_id, contenido, tipo, created_at')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: false })
            .limit(BOT_MAX_HISTORY);

        if (r.error || !Array.isArray(r.data)) return [];

        return r.data.reverse()
            .map(function(m) {
                return {
                    role: m.remitente_id === user.id ? 'user' : 'assistant',
                    content: limpiarMarkdown(m.contenido || '').slice(0, 2000)
                };
            })
            .filter(function(m) { return m.content && m.content.length > 0; });
    } catch (e) {
        console.warn('[Mensajes] No se pudo cargar historial para el bot:', e);
        return [];
    }
}

// ================================================================
// PREGUNTAR AL BOT (texto)
// ================================================================
async function preguntarAlBot(mensaje, historial) {
    var s = await session();
    if (!s) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 50000);

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

        var data = null;
        var contentType = r.headers.get('content-type') || '';

        if (contentType.indexOf('application/json') !== -1) {
            try { data = await r.json(); } catch (e) { data = null; }
        } else {
            var texto = await r.text().catch(function() { return ''; });

            if (r.status === 502 || r.status === 504) {
                throw new Error('El servidor está tardando o no disponible. Intenta de nuevo.');
            }
            if (r.status === 500) {
                throw new Error('El servidor tuvo un error interno. Revisa CORS o logs de Railway.');
            }
            if (!r.ok) {
                throw new Error('El servidor devolvió una respuesta inesperada. Código: ' + r.status);
            }
            throw new Error('El servidor no devolvió JSON válido.');
        }

        if (!r.ok) {
            throw new Error((data && data.error) || ('Error del servidor (' + r.status + ')'));
        }
        if (!data || data.success === false) {
            throw new Error((data && data.error) || 'Marquinhos no pudo responder.');
        }

        var respuesta = typeof data.reply === 'string' ? data.reply.trim() : '';
        if (!respuesta) throw new Error('Marquinhos respondió sin contenido.');

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
    }
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

// ================================================================
// GRABAR VOZ PARA EL BOT (con respuesta en audio)
// ================================================================
async function grabarVozParaBot() {
    if (!current || !current.bot) return;
    if (!await auth()) return;

    if (enviandoVozBot) {
        toast('⏳ Procesando audio anterior. Espera un momento…', 'warning');
        return;
    }

    // Si ya está grabando → detener y enviar
    if (voiceBotGrabando) {
        if (voiceBotRecorder && voiceBotRecorder.state !== 'inactive') {
            voiceBotRecorder.stop();
        }
        return;
    }

    try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBotChunks = [];
        voiceBotRecorder = new MediaRecorder(stream);

        voiceBotRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size) voiceBotChunks.push(e.data);
        };

        voiceBotRecorder.onstop = async function() {
            stream.getTracks().forEach(function(t) { t.stop(); });
            voiceBotGrabando = false;

            var btn = $('voiceBot');
            if (btn) {
                btn.classList.remove('recording');
                btn.textContent = '✦';
            }

            var blob = new Blob(voiceBotChunks, {
                type: voiceBotRecorder.mimeType || 'audio/webm'
            });
            voiceBotChunks = [];

            if (!blob.size) {
                toast('⚠️ No se capturó audio', 'error');
                return;
            }

            var file = new File([blob], 'voz-' + Date.now() + '.webm', { type: blob.type });
            await enviarVozAlBot(file);
        };

        voiceBotRecorder.start();
        voiceBotGrabando = true;

        var btn2 = $('voiceBot');
        if (btn2) {
            btn2.classList.add('recording');
            btn2.textContent = '■';
        }

        toast('🎙️ Habla ahora… presiona otra vez para enviar');
    } catch (e) {
        console.error('[Mensajes] Error micrófono:', e);
        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}

// ================================================================
// ENVIAR VOZ AL BOT Y RECIBIR RESPUESTA
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

    try {
        var s = await session();
        if (!s) {
            enviandoVozBot = false;
            if (btn) {
                btn.classList.remove('processing');
                btn.textContent = '✦';
                btn.disabled = false;
            }
            return;
        }

        // Subir audio
        var path = user.id + '/bot-voice/' + Date.now() + '.webm';
        var upErr = (await db.storage.from(CHAT_AUDIO_BUCKET).upload(path, file, {
            contentType: file.type,
            upsert: false
        })).error;

        if (upErr) {
            toast('❌ Error subiendo audio', 'error');
            enviandoVozBot = false;
            if (btn) {
                btn.classList.remove('processing');
                btn.textContent = '✦';
                btn.disabled = false;
            }
            return;
        }

        var signed = await db.storage.from(CHAT_AUDIO_BUCKET).createSignedUrl(path, 3600);
        if (!signed || !signed.data || !signed.data.signedUrl) {
            toast('❌ Error firmando audio', 'error');
            enviandoVozBot = false;
            if (btn) {
                btn.classList.remove('processing');
                btn.textContent = '✦';
                btn.disabled = false;
            }
            return;
        }

        // Burbuja temporal
        var tempId = 'voice-user-' + Date.now();
        var box = $('messages');
        var anchorRef = box.querySelector('#scrollAnchor');
        var tempHTML = '<div class="bubblewrap sent" id="' + tempId + '">' +
            '<div class="bubble">' +
                '<div class="voice-label">🎙️ TU VOZ</div>' +
                '<div class="voice-loading">Enviando a Marquinhos…</div>' +
            '</div>' +
        '</div>';

        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', tempHTML);
        else box.insertAdjacentHTML('beforeend', tempHTML);

        scrollToBottom(true);

        // Llamada a la API de voz (con reintentos)
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
                body: JSON.stringify({ audio_url: signed.data.signedUrl })
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

        if (!exito) throw new Error('El servidor de IA está saturado. Intenta de nuevo en unos minutos.');

        var tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();

        // Guardar mensajes en BD
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
                eliminado: false
            });
        } catch (e) {
            console.warn('[Mensajes] No se pudo guardar la nota de voz:', e);
        }

        try {
            if (data.reply) {
                await db.from('mensajes_chat').insert({
                    remitente_id: BOT_UUID,
                    destinatario_id: user.id,
                    contenido: data.reply,
                    tipo: 'texto',
                    leido: true,
                    editado: false,
                    eliminado: false
                });
            }
        } catch (e) {
            console.warn('[Mensajes] No se pudo guardar la respuesta del bot:', e);
        }

        // Burbuja de respuesta del bot
        var botId = 'voice-bot-' + Date.now();
        var botBody = '<div class="bubble-bot-info">✦ MARQUINHOS</div>';

        if (data.transcripcion) {
            botBody += '<div class="bot-transcripcion">🎙️ "' + esc(data.transcripcion) + '"</div>';
        }

        botBody += '<div>' + esc(limpiarMarkdown(data.reply || 'Sin respuesta')) + '</div>';

        if (data.audio_url) {
            botBody += '<audio class="bot-audio" controls src="' + esc(data.audio_url) + '"></audio>';
        }

        var botHTML = '<div class="bubblewrap received" id="' + botId + '">' +
            '<div class="bubble">' + botBody + '</div>' +
        '</div>';

        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', botHTML);
        else box.insertAdjacentHTML('beforeend', botHTML);

        observarCargaMultimedia(box);
        scrollToBottom(true);

        // Autoplay del audio del bot
        if (data.audio_url) {
            var audio = document.querySelector('#' + botId + ' audio');
            if (audio) {
                audio.play().catch(function() {});
            }
        }

        loadConversations();
    } catch (e) {
        console.error('[Mensajes] Error voz bot:', e);
        var tempEl2 = document.getElementById('voice-user-' + Date.now());
        // (por simplicidad omitimos remover el temp exacto, ya que el id cambió)
        document.querySelectorAll('[id^="voice-user-"]').forEach(function(el) { el.remove(); });

        if (e.message.indexOf('429') !== -1
            || e.message.indexOf('Too Many Requests') !== -1
            || e.message.indexOf('saturado') !== -1) {
            toast('⏳ El asistente está saturado. Por favor, espera unos segundos e intenta de nuevo.', 'warning');
        } else {
            toast('❌ ' + e.message, 'error');
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

console.log('[Mensajes] ✅ Bot cargado');