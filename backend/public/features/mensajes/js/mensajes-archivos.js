// ================================================================
// MENSAJES · ARCHIVOS
// ================================================================
// Subida de archivos (imagen, video, audio, docs) al chat normal,
// y grabación de notas de voz (chat normal o bot).
// Se carga DESPUÉS de config, utils, auth, conversaciones, chat, bot.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// COMPATIBLE CON: buckets chat-audio, chat-attachments.
// ================================================================

'use strict';

// ================================================================
// DETECTAR MIME SOPORTADO PARA AUDIO
// ================================================================
function getSupportedAudioMime() {
    if (!window.MediaRecorder) return '';
    if (!MediaRecorder.isTypeSupported) return '';

    var candidatos = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4'
    ];

    for (var i = 0; i < candidatos.length; i++) {
        try {
            if (MediaRecorder.isTypeSupported(candidatos[i])) {
                return candidatos[i];
            }
        } catch (e) {}
    }
    return '';
}

function extensionForMime(mime) {
    if (!mime || typeof mime !== 'string') return 'webm';
    if (mime.indexOf('ogg') !== -1) return 'ogg';
    if (mime.indexOf('mp4') !== -1) return 'm4a';
    return 'webm';
}

// ================================================================
// DETECTAR TIPO DE ARCHIVO
// ================================================================
function detectarTipoArchivo(file) {
    if (!file || !file.type) return 'archivo';
    if (file.type.indexOf('image/') === 0) return 'imagen';
    if (file.type.indexOf('video/') === 0) return 'video';
    if (file.type.indexOf('audio/') === 0) return 'audio';
    return 'archivo';
}

// ================================================================
// SUBIR ARCHIVO AL CHAT NORMAL
// ================================================================
async function uploadFile(file) {
    if (!file) return;
    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }
    if (!await auth()) return;

    if (current.bot) {
        toast('⚠️ Para ' + BOT_NOMBRE + ' usa el botón 🔊 o envía nota de voz', 'error');
        return;
    }

    // Límite de tamaño
    if (file.size > MAX_FILE_SIZE) {
        toast('⚠️ El archivo supera ' + (MAX_FILE_SIZE / 1024 / 1024) + ' MB', 'error');
        return;
    }

    var tipo = detectarTipoArchivo(file);

    // Validaciones específicas por tipo
    if (tipo === 'imagen' && file.size > MAX_FOTO_BYTES) {
        toast('⚠️ La foto supera ' + (MAX_FOTO_BYTES / 1024 / 1024) + ' MB', 'error');
        return;
    }
    if (tipo === 'video' && file.size > MAX_VIDEO_BYTES) {
        toast('⚠️ El video supera ' + (MAX_VIDEO_BYTES / 1024 / 1024) + ' MB', 'error');
        return;
    }

    // Bucket según tipo
    var bucket = (tipo === 'audio') ? CHAT_AUDIO_BUCKET : CHAT_ATTACHMENTS_BUCKET;

    // Nombre único
    var nombreSafe = (file.name || 'archivo.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
    var random = Math.random().toString(36).slice(2, 8);
    var path = user.id + '/mensajes/' + Date.now() + '_' + random + '_' + nombreSafe;

    // Snapshot del chat actual
    var chatIdAlInicio = current.id;

    try {
        // ---- Subir a Storage ----
        var up = await db.storage.from(bucket).upload(path, file, {
            contentType: file.type || 'application/octet-stream',
            cacheControl: '3600',
            upsert: false
        });

        if (up.error) {
            console.error('[Mensajes/Archivos] Error subiendo:', up.error);
            toast('❌ No se pudo subir el archivo', 'error');
            return;
        }

        // ---- Verificar que seguimos en el mismo chat ----
        if (!current || current.id !== chatIdAlInicio) {
            toast('ℹ️ Cambiaste de chat. El archivo quedó guardado pero no se muestra aquí.', 'warning');
            return;
        }

        // ---- Insertar en BD ----
        var storageRef = 'bucket://' + bucket + '/' + path;

        var r = await db
            .from('mensajes_chat')
            .insert({
                remitente_id: user.id,
                destinatario_id: chatIdAlInicio,
                contenido: file.name,
                nombre_archivo: file.name,
                imagen_url: storageRef,
                tipo: tipo,
                leido: false,
                editado: false,
                eliminado: false,
                es_bot: false
            })
            .select('*')
            .single();

        if (r.error || !r.data) {
            console.error('[Mensajes/Archivos] Error guardando:', r.error);
            toast('❌ No se pudo guardar el archivo', 'error');
            return;
        }

        // Marcar renderizado para evitar duplicados en realtime
        _marcarRenderizado(r.data.id);

        await append(r.data, true);

        // Marcar conversación como leída
        await marcarConversacionComoLeida(chatIdAlInicio, r.data.created_at);

        loadConversations();
    } catch (e) {
        console.error('[Mensajes/Archivos] Excepción uploadFile:', e);
        toast('❌ Error al subir archivo: ' + (e.message || 'desconocido'), 'error');
    }
}

// ================================================================
// GRABAR NOTA DE VOZ (chat normal o bot)
// ================================================================
async function recordAudioNota() {
    // Si ya está grabando → detener
    if (recorder && recorder.state === 'recording') {
        try { recorder.stop(); } catch (e) {}
        return;
    }

    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }

    if (!await auth()) return;

    var esBot = !!current.bot;
    var stream = null;

    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        var mimeType = getSupportedAudioMime();
        recorder = mimeType
            ? new MediaRecorder(stream, { mimeType: mimeType })
            : new MediaRecorder(stream);

        var recorderLocal = recorder;

        recordingMode = esBot ? 'bot' : 'normal';
        recordingStartedAt = Date.now();

        recorderLocal.ondataavailable = function(e) {
            if (e.data && e.data.size) audioChunks.push(e.data);
        };

        recorderLocal.onerror = function(e) {
            console.error('[Mensajes/Archivos] MediaRecorder error:', e);
            if (stream) {
                try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (_) {}
            }
            recorder = null;
            recordingMode = null;
            var btnErr = $('audio');
            if (btnErr) {
                btnErr.classList.remove('recording');
                btnErr.textContent = '🎙️';
            }
        };

        recorderLocal.onstop = async function() {
            // Detener micrófono
            if (stream) {
                try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (_) {}
            }

            var audioBtn = $('audio');
            if (audioBtn) {
                audioBtn.classList.remove('recording');
                audioBtn.textContent = '🎙️';
            }

            var blob = new Blob(audioChunks, {
                type: recorderLocal.mimeType || mimeType || 'audio/webm'
            });
            audioChunks = [];

            var mode = recordingMode;
            recorder = null;
            recordingMode = null;

            if (!blob.size) {
                toast('⚠️ No se capturó audio', 'error');
                return;
            }

            // Validar duración
            var duracionSeg = (Date.now() - recordingStartedAt) / 1000;
            if (duracionSeg > MAX_AUDIO_SEGUNDOS) {
                toast('⚠️ El audio supera ' + (MAX_AUDIO_SEGUNDOS / 60) + ' minutos', 'error');
                return;
            }

            var ext = extensionForMime(blob.type);
            var file = new File(
                [blob],
                'audio-' + Date.now() + '.' + ext,
                { type: blob.type }
            );

            try {
                if (mode === 'bot') {
                    if (typeof enviarVozAlBot === 'function') {
                        await enviarVozAlBot(file);
                    } else {
                        console.warn('[Mensajes/Archivos] enviarVozAlBot no disponible');
                    }
                } else {
                    await uploadFile(file);
                }
            } catch (err) {
                console.error('[Mensajes/Archivos] Error procesando audio:', err);
                toast('❌ Error procesando audio', 'error');
            }
        };

        recorderLocal.start();

        var audioBtn2 = $('audio');
        if (audioBtn2) {
            audioBtn2.classList.add('recording');
            audioBtn2.textContent = '⏹️';
        }

        toast(esBot
            ? '🎙️ Habla con ' + BOT_NOMBRE + '… presiona otra vez para enviar'
            : '🎙️ Grabando… presiona otra vez para detener');
    } catch (e) {
        console.error('[Mensajes/Archivos] Error micrófono:', e);
        if (stream) {
            try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (_) {}
        }

        var audioBtn3 = $('audio');
        if (audioBtn3) {
            audioBtn3.classList.remove('recording');
            audioBtn3.textContent = '🎙️';
        }

        recorder = null;
        recordingMode = null;
        audioChunks = [];

        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}

// ================================================================
// OBTENER DURACIÓN DE UN BLOB (por si se necesita en el futuro)
// ================================================================
function obtenerDuracionBlob(blob, tipo) {
    return new Promise(function(resolve, reject) {
        if (!blob) {
            reject(new Error('Blob vacío'));
            return;
        }

        var url = URL.createObjectURL(blob);
        var el = document.createElement(tipo === 'video' ? 'video' : 'audio');
        el.preload = 'metadata';

        var timeout = setTimeout(function() {
            URL.revokeObjectURL(url);
            reject(new Error('Timeout obteniendo duración'));
        }, 5000);

        el.onloadedmetadata = function() {
            clearTimeout(timeout);
            var duracion = el.duration || 0;
            URL.revokeObjectURL(url);
            resolve(duracion);
        };

        el.onerror = function() {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('Error cargando metadata'));
        };

        el.src = url;
    });
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.uploadFile = uploadFile;
window.recordAudioNota = recordAudioNota;
window.getSupportedAudioMime = getSupportedAudioMime;
window.extensionForMime = extensionForMime;
window.detectarTipoArchivo = detectarTipoArchivo;
window.obtenerDuracionBlob = obtenerDuracionBlob;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Archivos] ✅ Archivos cargado');
}