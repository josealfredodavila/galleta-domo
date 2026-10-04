// ================================================================
// MENSAJES · ARCHIVOS
// ================================================================
// Subida de archivos (imagen, video, audio, docs) y grabación
// de notas de voz.
// Depende de: config, utils, auth, chat.
// ================================================================

// ================================================================
// SUBIR ARCHIVO AL CHAT
// ================================================================
async function uploadFile(file) {
    if (!current) return;
    if (!await auth()) return;

    if (current.bot) {
        toast('⚠️ Para Marquinhos usa el botón 🔊, o envía nota de voz con 🎙️', 'error');
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        toast('⚠️ El archivo supera 50 MB', 'error');
        return;
    }

    // Detectar tipo
    var type = 'archivo';
    if (file.type.indexOf('image/') === 0) type = 'imagen';
    else if (file.type.indexOf('video/') === 0) type = 'video';
    else if (file.type.indexOf('audio/') === 0) type = 'audio';

    var bucket = (type === 'audio') ? CHAT_AUDIO_BUCKET : CHAT_ATTACHMENTS_BUCKET;
    var safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var random = Math.random().toString(36).slice(2, 8);
    var path = user.id + '/mensajes/' + Date.now() + '_' + random + '_' + safe;

    try {
        var up = await db.storage.from(bucket).upload(path, file, {
            contentType: file.type || 'application/octet-stream',
            cacheControl: '3600',
            upsert: false
        });

        if (up.error) {
            console.error('[Mensajes] Error subiendo archivo:', up.error);
            toast('❌ No se pudo subir el archivo', 'error');
            return;
        }

        var storageRef = 'bucket://' + bucket + '/' + path;

        var r = await db.from('mensajes_chat').insert({
            remitente_id: user.id,
            destinatario_id: current.id,
            contenido: file.name,
            nombre_archivo: file.name,
            imagen_url: storageRef,
            tipo: type,
            leido: false,
            editado: false,
            eliminado: false
        }).select('*').single();

        if (r.error) {
            console.error('[Mensajes] Error guardando archivo:', r.error);
            toast('❌ No se pudo guardar el archivo', 'error');
            return;
        }

        await append(r.data, true);
        loadConversations();
    } catch (e) {
        console.error('[Mensajes] Error en uploadFile:', e);
        toast('❌ Error: ' + e.message, 'error');
    }
}

// ================================================================
// GRABAR NOTA DE VOZ (chat normal o bot)
// ================================================================
function getSupportedAudioMime() {
    var candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4'
    ];
    for (var i = 0; i < candidates.length; i++) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) {
            return candidates[i];
        }
    }
    return '';
}

function extensionForMime(mime) {
    if (!mime) return 'webm';
    if (mime.indexOf('ogg') !== -1) return 'ogg';
    if (mime.indexOf('mp4') !== -1) return 'm4a';
    return 'webm';
}

async function recordAudioNota() {
    // Si ya está grabando → detener y enviar
    if (recorder && recorder.state === 'recording') {
        recorder.stop();
        return;
    }

    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }
    if (!await auth()) return;

    var esBot = current.bot;

    try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        var mimeType = getSupportedAudioMime();
        recorder = mimeType
            ? new MediaRecorder(stream, { mimeType: mimeType })
            : new MediaRecorder(stream);

        recordingMode = esBot ? 'bot' : 'normal';
        recordingStartedAt = Date.now();

        recorder.ondataavailable = function(e) {
            if (e.data && e.data.size) audioChunks.push(e.data);
        };

        recorder.onstop = async function() {
            stream.getTracks().forEach(function(t) { t.stop(); });

            var audioBtn = $('audio');
            if (audioBtn) {
                audioBtn.classList.remove('recording');
                audioBtn.textContent = '◉';
            }

            var blob = new Blob(audioChunks, {
                type: recorder.mimeType || mimeType || 'audio/webm'
            });
            audioChunks = [];

            var mode = recordingMode;
            recorder = null;
            recordingMode = null;

            if (!blob.size) {
                toast('⚠️ No se capturó audio', 'error');
                return;
            }

            var ext = extensionForMime(blob.type);
            var file = new File([blob], 'audio-' + Date.now() + '.' + ext, { type: blob.type });

            if (mode === 'bot') {
                await enviarVozAlBot(file);
            } else {
                await uploadFile(file);
            }
        };

        recorder.start();

        var audioBtn = $('audio');
        if (audioBtn) {
            audioBtn.classList.add('recording');
            audioBtn.textContent = '■';
        }

        toast(esBot
            ? '🎙️ Habla con Marquinhos… presiona otra vez para enviar'
            : '🎙️ Grabando… presiona otra vez para detener');
    } catch (e) {
        console.error('[Mensajes] Error micrófono:', e);

        var audioBtn2 = $('audio');
        if (audioBtn2) {
            audioBtn2.classList.remove('recording');
            audioBtn2.textContent = '◉';
        }

        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}

console.log('[Mensajes] ✅ Archivos cargado');