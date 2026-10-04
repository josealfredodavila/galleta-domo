// ================================================================
// MENSAJES · ARCHIVOS
// ================================================================
// Subida de archivos (imagen, video, audio, docs), grabación de
// notas de voz y subida de blobs para mensajes-chat.js v3.
// Depende de: config, utils, auth, chat.
// ================================================================

// ================================================================
// CONSTANTES DE VALIDACIÓN (por si no están en config.js)
// ================================================================
var MAX_FOTO_BYTES_ARCH  = 10 * 1024 * 1024;   // 10 MB
var MAX_VIDEO_BYTES_ARCH = 50 * 1024 * 1024;   // 50 MB
var MAX_AUDIO_SEC_ARCH   = 5 * 60;             // 5 min
var MAX_VIDEO_SEC_ARCH   = 2 * 60;             // 2 min

// ================================================================
// HELPERS DE VALIDACIÓN
// ================================================================
function _esImagen(file) { return file && file.type && file.type.indexOf('image/') === 0; }
function _esVideo(file)  { return file && file.type && file.type.indexOf('video/') === 0; }
function _esAudio(file)  { return file && file.type && file.type.indexOf('audio/') === 0; }

function _detectarTipoArchivo(file) {
    if (_esImagen(file)) return 'imagen';
    if (_esVideo(file)) return 'video';
    if (_esAudio(file)) return 'audio';
    return 'archivo';
}

// ================================================================
// SUBIR ARCHIVO AL CHAT (función principal)
// ================================================================
async function uploadFile(file) {
    if (!current) return;
    if (!await auth()) return;

    if (current.bot) {
        toast('⚠️ Para Marquinhos usa el botón 🔊, o envía nota de voz con 🎙️', 'error');
        return;
    }

    // Validar tamaño
    var maxSize = (typeof MAX_FILE_SIZE !== 'undefined') ? MAX_FILE_SIZE : 50 * 1024 * 1024;
    if (file.size > maxSize) {
        toast('⚠️ El archivo supera 50 MB', 'error');
        return;
    }

    // Detectar tipo
    var type = _detectarTipoArchivo(file);

    // ✅ Validaciones específicas por tipo
    if (type === 'imagen' && file.size > MAX_FOTO_BYTES_ARCH) {
        toast('⚠️ La foto supera 10 MB', 'error');
        return;
    }
    if (type === 'video' && file.size > MAX_VIDEO_BYTES_ARCH) {
        toast('⚠️ El video supera 50 MB', 'error');
        return;
    }

    // Bucket
    var bucket = (type === 'audio') 
        ? (typeof CHAT_AUDIO_BUCKET !== 'undefined' ? CHAT_AUDIO_BUCKET : 'chat-audio')
        : (typeof CHAT_ATTACHMENTS_BUCKET !== 'undefined' ? CHAT_ATTACHMENTS_BUCKET : 'chat-attachments');

    // Nombre único
    var safe = (file.name || 'archivo.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
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

        // ✅ Marcar como renderizado ANTES de pintar (evita duplicados)
        if (typeof _marcarRenderizado === 'function' && r.data && r.data.id) {
            _marcarRenderizado(r.data.id);
        }

        await append(r.data, true);

        // ✅ Al contestar con archivo, marcar previos como leídos
        if (typeof marcarConversacionComoLeida === 'function' && current && !current.bot) {
            await marcarConversacionComoLeida(current.id, r.data.created_at);
        }

        loadConversations();
    } catch (e) {
        console.error('[Mensajes] Error en uploadFile:', e);
        toast('❌ Error: ' + e.message, 'error');
    }
}

// ================================================================
// ✅ NUEVA: SUBIR BLOB AL CHAT (para mensajes-chat.js v3)
// ================================================================
// Usada por sendAudio(), sendVideo() y sendFoto() de mensajes-chat.js v3.
// Recibe un Blob (no un File) y un tipo ('audio' | 'video' | 'imagen').
// Devuelve la referencia bucket://... para guardar en la BD.
// ================================================================
async function subirArchivoChat(blob, tipo) {
    if (!blob) throw new Error('Blob vacío');
    if (!user || !user.id) throw new Error('No autenticado');

    // Bucket según tipo
    var bucket;
    if (tipo === 'audio' || tipo === 'video') {
        bucket = (typeof CHAT_AUDIO_BUCKET !== 'undefined') ? CHAT_AUDIO_BUCKET : 'chat-audio';
    } else {
        bucket = (typeof CHAT_ATTACHMENTS_BUCKET !== 'undefined') ? CHAT_ATTACHMENTS_BUCKET : 'chat-attachments';
    }

    // Extensión según tipo
    var ext = 'bin';
    if (tipo === 'audio') ext = 'webm';
    else if (tipo === 'video') ext = 'mp4';
    else if (tipo === 'imagen') ext = 'jpg';

    // Nombre único
    var safe = 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    var path = user.id + '/mensajes/' + safe;

    // Subir a Supabase Storage
    var contentType = blob.type || 'application/octet-stream';
    var up = await db.storage.from(bucket).upload(path, blob, {
        contentType: contentType,
        cacheControl: '3600',
        upsert: false
    });

    if (up.error) {
        console.error('[Archivos] Error subiendo blob:', up.error);
        throw up.error;
    }

    // Devolver referencia bucket://...
    return 'bucket://' + bucket + '/' + path;
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

            // ✅ Validar duración del audio (máx 5 min)
            var duracionSeg = (Date.now() - recordingStartedAt) / 1000;
            if (duracionSeg > MAX_AUDIO_SEC_ARCH) {
                toast('⚠️ El audio supera 5 minutos', 'error');
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

        var audioBtn2 = $('audio');
        if (audioBtn2) {
            audioBtn2.classList.add('recording');
            audioBtn2.textContent = '■';
        }

        toast(esBot
            ? '🎙️ Habla con Marquinhos… presiona otra vez para enviar'
            : '🎙️ Grabando… presiona otra vez para detener');
    } catch (e) {
        console.error('[Mensajes] Error micrófono:', e);

        var audioBtn3 = $('audio');
        if (audioBtn3) {
            audioBtn3.classList.remove('recording');
            audioBtn3.textContent = '◉';
        }

        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}

// ================================================================
// ✅ NUEVA: OBTENER DURACIÓN DE UN BLOB DE AUDIO/VIDEO
// ================================================================
// Usada por mensajes-chat.js v3 para validar duración antes de subir.
// Devuelve una Promise<number> con la duración en segundos.
// ================================================================
function obtenerDuracionBlob(blob, tipo) {
    return new Promise(function(resolve, reject) {
        if (!blob) { reject(new Error('Blob vacío')); return; }

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
// EXPOSICIÓN GLOBAL A WINDOW
// ================================================================
window.uploadFile = uploadFile;
window.subirArchivoChat = subirArchivoChat;
window.recordAudioNota = recordAudioNota;
window.getSupportedAudioMime = getSupportedAudioMime;
window.extensionForMime = extensionForMime;
window.obtenerDuracionBlob = obtenerDuracionBlob;

console.log('[Mensajes] ✅ Archivos cargado (con subirArchivoChat + validaciones)');