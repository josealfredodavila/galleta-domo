// ================================================================
// MENSAJES · ARCHIVOS Y NOTAS DE VOZ
// ================================================================
async function uploadFile(file) {
    if (!current || !await auth()) return;
    if (current.bot) { toast('⚠️ Para Marquinhos usa el botón 🔊, o envía nota de voz con 🎙️', 'error'); return; }
    if (file.size > 50 * 1024 * 1024) { toast('⚠️ El archivo supera 50 MB', 'error'); return; }
    var type = file.type.startsWith('image/') ? 'imagen' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'archivo';
    var bucket = type === 'audio' ? 'chat-audio' : 'chat-attachments';
    var safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = user.id + '/mensajes/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safe;
    try {
        var up = await db.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/octet-stream', cacheControl: '3600', upsert: false });
        if (up.error) { console.error(up.error); toast('❌ No se pudo subir el archivo', 'error'); return; }
        var storageRef = 'bucket://' + bucket + '/' + path;
        var r = await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: current.id, contenido: file.name, nombre_archivo: file.name, imagen_url: storageRef, tipo: type, leido: false, editado: false, eliminado: false }).select('*').single();
        if (r.error) { console.error(r.error); toast('❌ No se pudo guardar el archivo', 'error'); return; }
        await append(r.data, true);
        loadConversations();
    } catch (e) { console.error('Error subiendo archivo:', e); toast('❌ Error al subir archivo', 'error'); }
}

function getSupportedAudioMime() {
    var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (var i = 0; i < candidates.length; i++) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i]; }
    return '';
}
function extensionForMime(mime) { if (mime.indexOf('ogg') !== -1) return 'ogg'; if (mime.indexOf('mp4') !== -1) return 'm4a'; return 'webm'; }

async function recordAudioNota() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
    if (!await auth()) return;
    var esBot = current.bot;
    try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        var mimeType = getSupportedAudioMime();
        recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
        recordingMode = esBot ? 'bot' : 'normal';
        recordingStartedAt = Date.now();
        recorder.ondataavailable = function(e) { if (e.data && e.data.size) audioChunks.push(e.data); };
        recorder.onstop = async function() {
            stream.getTracks().forEach(function(t) { t.stop(); });
            var audioBtn = $('audio'); if (audioBtn) { audioBtn.classList.remove('recording'); audioBtn.textContent = '🎙️'; }
            var blob = new Blob(audioChunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            audioChunks = [];
            var mode = recordingMode;
            recorder = null; recordingMode = null;
            if (!blob.size) { toast('⚠️ No se capturó audio', 'error'); return; }
            var ext = extensionForMime(blob.type);
            var file = new File([blob], 'audio-' + Date.now() + '.' + ext, { type: blob.type });
            if (mode === 'bot') { if (typeof enviarVozAlBot === 'function') await enviarVozAlBot(file); }
            else { await uploadFile(file); }
        };
        recorder.start();
        var audioBtn2 = $('audio'); if (audioBtn2) { audioBtn2.classList.add('recording'); audioBtn2.textContent = '⏹️'; }
        toast(esBot ? '🎙️ Habla con Marquinhos… presiona otra vez para enviar' : '🎙️ Grabando… presiona otra vez para detener');
    } catch (e) {
        console.error('Micrófono:', e);
        var btn = $('audio'); if (btn) { btn.classList.remove('recording'); btn.textContent = '🎙️'; }
        toast('❌ No se pudo acceder al micrófono', 'error');
    }
}
console.log('[Mensajes] ✅ Archivos cargado');