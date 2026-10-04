// ================================================================
// MENSAJES · BOT MARQUINHOS (IA)
// ================================================================
async function cargarHistorialParaBot() {
    try {
        var r = await db.from('mensajes_chat').select('remitente_id, contenido, tipo, created_at').eq('eliminado', false).or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')').order('created_at', { ascending: false }).limit(BOT_MAX_HISTORY);
        if (r.error || !Array.isArray(r.data)) return [];
        return r.data.reverse().map(function(m) { return { role: m.remitente_id === user.id ? 'user' : 'assistant', content: limpiarMarkdown(m.contenido || '').slice(0, 2000) }; }).filter(function(m) { return m.content && m.content.length > 0; });
    } catch (e) { console.warn('No se pudo cargar historial para el bot:', e); return []; }
}

async function preguntarAlBot(mensaje, historial) {
    var s = await session();
    if (!s) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 50000);
    try {
        var r = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + s.access_token },
            body: JSON.stringify({ message: mensaje.trim(), context: 'chat_sariels', history: Array.isArray(historial) ? historial : [] }),
            signal: controller.signal
        });
        var data = null;
        var contentType = r.headers.get('content-type') || '';
        if (contentType.indexOf('application/json') !== -1) {
            try { data = await r.json(); } catch (_) { data = null; }
        } else {
            var texto = await r.text().catch(function() { return ''; });
            if (r.status === 0 || !r.ok) {
                if (r.status === 502 || r.status === 504) throw new Error('El servidor está tardando o no disponible. Intenta de nuevo.');
                if (r.status === 500) throw new Error('El servidor tuvo un error interno. Revisa CORS o logs de Railway.');
                throw new Error('El servidor devolvió una respuesta inesperada. Código: ' + r.status);
            }
            throw new Error('El servidor no devolvió JSON válido.');
        }
        if (!r.ok) throw new Error((data && data.error) || ('Error del servidor (' + r.status + ')'));
        if (!data || data.success === false) throw new Error((data && data.error) || 'Marquinhos no pudo responder.');
        var respuesta = typeof data.reply === 'string' ? data.reply.trim() : '';
        if (!respuesta) throw new Error('Marquinhos respondió sin contenido.');
        respuesta = limpiarMarkdown(respuesta);
        return respuesta;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Marquinhos está tardando demasiado en responder. Intenta nuevamente.');
        if (error.name === 'TypeError' && /Failed to fetch|NetworkError/i.test(error.message || '')) throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        throw error;
    } finally { clearTimeout(timeout); }
}

async function grabarVozParaBot() {
    if (!current || !current.bot) return;
    if (!await auth()) return;
    if (enviandoVozBot) { toast('⏳ Procesando audio anterior. Espera un momento…', 'warning'); return; }
    var voiceBtn = $('voiceBot');
    if (voiceBotGrabando) { if (voiceBotRecorder && voiceBotRecorder.state !== 'inactive') voiceBotRecorder.stop(); return; }
    try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBotChunks = [];
        voiceBotRecorder = new MediaRecorder(stream);
        voiceBotRecorder.ondataavailable = function(e) { if (e.data && e.data.size) voiceBotChunks.push(e.data); };
        voiceBotRecorder.onstop = async function() {
            stream.getTracks().forEach(function(t) { t.stop(); });
            voiceBotGrabando = false;
            if (voiceBtn) { voiceBtn.classList.remove('recording'); voiceBtn.textContent = '🔊'; }
            var blob = new Blob(voiceBotChunks, { type: voiceBotRecorder.mimeType || 'audio/webm' });
            voiceBotChunks = [];
            if (!blob.size) { toast('⚠️ No se capturó audio', 'error'); return; }
            var file = new File([blob], 'voz-' + Date.now() + '.webm', { type: blob.type });
            await enviarVozAlBot(file);
        };
        voiceBotRecorder.start();
        voiceBotGrabando = true;
        if (voiceBtn) { voiceBtn.classList.add('recording'); voiceBtn.textContent = '⏹️'; }
        toast('🎙️ Habla ahora… presiona otra vez para enviar');
    } catch (e) { console.error('Error micrófono:', e); toast('❌ No se pudo acceder al micrófono', 'error'); }
}

async function enviarVozAlBot(file) {
    if (enviandoVozBot) { toast('⏳ Ya hay un audio en proceso. Espera…', 'warning'); return; }
    enviandoVozBot = true;
    var voiceBtn = $('voiceBot');
    if (voiceBtn) { voiceBtn.classList.add('processing'); voiceBtn.textContent = '⏳'; voiceBtn.disabled = true; }
    var tempId = 'voice-user-' + Date.now();
    try {
        var s = await session();
        if (!s) { enviandoVozBot = false; if (voiceBtn) { voiceBtn.classList.remove('processing'); voiceBtn.textContent = '🔊'; voiceBtn.disabled = false; } return; }
        var path = user.id + '/bot-voice/' + Date.now() + '.webm';
        var upErr = await db.storage.from('chat-audio').upload(path, file, { contentType: file.type, upsert: false });
        if (upErr.error) { toast('❌ Error subiendo audio', 'error'); enviandoVozBot = false; if (voiceBtn) { voiceBtn.classList.remove('processing'); voiceBtn.textContent = '🔊'; voiceBtn.disabled = false; } return; }
        var signed = await db.storage.from('chat-audio').createSignedUrl(path, 3600);
        if (!signed.data || !signed.data.signedUrl) { toast('❌ Error firmando audio', 'error'); enviandoVozBot = false; if (voiceBtn) { voiceBtn.classList.remove('processing'); voiceBtn.textContent = '🔊'; voiceBtn.disabled = false; } return; }
        var box = $('messages');
        var anchorRef = box ? box.querySelector('#scrollAnchor') : null;
        var tempHTML = '<div class="bubblewrap sent" id="' + tempId + '"><div class="bubble"><div class="voice-label">🎙️ TU VOZ</div><div class="voice-loading">Enviando a Marquinhos…</div></div></div>';
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', tempHTML);
        else if (box) box.insertAdjacentHTML('beforeend', tempHTML);
        scrollToBottom(true);
        var intentos = 0, maxIntentos = 3, exito = false, data = {};
        while (intentos < maxIntentos && !exito) {
            var r = await fetch('/api/ai/voice/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token }, body: JSON.stringify({ audio_url: signed.data.signedUrl }) });
            data = await r.json().catch(function() { return {}; });
            if (r.status === 429) { intentos++; var waitTime = intentos * 2000; toast('⏳ Servidor ocupado. Reintentando en ' + (waitTime / 1000) + 's...', 'warning'); await new Promise(function(resolve) { setTimeout(resolve, waitTime); }); continue; }
            if (!r.ok || data.success === false) throw new Error(data.error || 'Error del servicio de voz');
            exito = true;
        }
        if (!exito) throw new Error('El servidor de IA está saturado. Intenta de nuevo en unos minutos.');
        var tempEl = document.getElementById(tempId); if (tempEl) tempEl.remove();
        try { await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: BOT_UUID, contenido: data.transcripcion || file.name, nombre_archivo: file.name, imagen_url: 'bucket://chat-audio/' + path, tipo: 'audio', leido: true, editado: false, eliminado: false }); } catch (e) { console.warn('No se pudo guardar la nota de voz:', e); }
        if (data.reply) { try { await db.from('mensajes_chat').insert({ remitente_id: BOT_UUID, destinatario_id: user.id, contenido: data.reply, tipo: 'texto', leido: true, editado: false, eliminado: false }); } catch (e) { console.warn('No se pudo guardar respuesta:', e); } }
        var botId = 'voice-bot-' + Date.now();
        var botBody = '<div class="bubble-bot-info">✦ MARQUINHOS</div>';
        if (data.transcripcion) botBody += '<div class="bot-transcripcion">🎙️ "' + esc(data.transcripcion) + '"</div>';
        botBody += '<div>' + esc(limpiarMarkdown(data.reply || 'Sin respuesta')) + '</div>';
        if (data.audio_url) botBody += '<audio class="bot-audio" controls src="' + esc(data.audio_url) + '"></audio>';
        var botHTML = '<div class="bubblewrap received" id="' + botId + '"><div class="bubble">' + botBody + '</div></div>';
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', botHTML);
        else if (box) box.insertAdjacentHTML('beforeend', botHTML);
        observarCargaMultimedia(box);
        scrollToBottom(true);
        if (data.audio_url) { var audio = document.querySelector('#' + botId + ' audio'); if (audio) audio.play().catch(function() {}); }
        loadConversations();
    } catch (e) {
        console.error('Error voz bot:', e);
        var tempEl2 = document.getElementById(tempId); if (tempEl2) tempEl2.remove();
        if (e.message.indexOf('429') !== -1 || e.message.indexOf('Too Many Requests') !== -1 || e.message.indexOf('saturado') !== -1) toast('⏳ El asistente está saturado. Por favor, espera unos segundos e intenta de nuevo.', 'warning');
        else toast('❌ ' + e.message, 'error');
    } finally {
        enviandoVozBot = false;
        if (voiceBtn) { voiceBtn.classList.remove('processing'); voiceBtn.textContent = '🔊'; voiceBtn.disabled = false; }
    }
}
console.log('[Mensajes] ✅ Bot cargado');