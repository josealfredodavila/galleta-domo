// ================================================================
// MENSAJES · BOT MARQUINHOS v2.0 · MÓDULO 4 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-bot.js
// Depende de: mensajes-core.js, mensajes-scroll-media.js,
//             mensajes-chats.js (append, messageHTML, scrollToBottom,
//             recargarBandeja, observarCargaMultimedia)
// Cambios v2.0: sin emojis; el botón de voz cambia de estado con
//               clases en vez de cambiar el texto (usa SVG del HTML).
// ================================================================

'use strict';

let voiceBotRecorder = null;
let voiceBotChunks = [];
let voiceBotGrabando = false;
let enviandoVozBot = false;

function marcarBotonVoz(estado) {
    const btn = $('voiceBot');
    if (!btn) return;
    btn.classList.toggle('recording', estado === 'grabando');
    btn.classList.toggle('processing', estado === 'procesando');
    btn.disabled = estado === 'procesando';
}

async function abrirConversacionBot() {
    const box = $('messages');
    const btn = box.querySelector('#scrollDownBtn');
    const anchor = box.querySelector('#scrollAnchor');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    box.querySelectorAll('.empty').forEach(el => el.remove());
    if (!anchor) { const newAnchor = document.createElement('div'); newAnchor.id = 'scrollAnchor'; box.appendChild(newAnchor); }
    if (!btn) {
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'scroll-down-btn';
        newBtn.id = 'scrollDownBtn';
        newBtn.setAttribute('aria-label', 'Ir al final');
        newBtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg><span class="badge-new" id="newMsgBadge" hidden>1</span>';
        box.appendChild(newBtn);
        newBtn.onclick = () => { isUserAtBottom = true; scrollToBottom(true); actualizarFlecha(); };
    }

    let historial = [];
    try {
        const r = await db.from('mensajes_chat').select('*').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`).order('created_at', { ascending: true }).limit(200);
        if (!r.error) historial = r.data || [];
    } catch (e) { console.warn('No se pudo cargar el historial de Marquinhos:', e); }

    const anchorRef = box.querySelector('#scrollAnchor');
    if (!historial.length) {
        anchorRef.insertAdjacentHTML('beforebegin', `
            <div class="bubblewrap received">
                <div class="bubble">
                    <div class="bubble-bot-info">MARQUINHOS</div>
                    Hola, soy Marquinhos, el asistente de Csariel's. Puedes:<br><br>
                    Escribirme un mensaje de texto.<br>
                    Enviarme una nota de voz con el micrófono.<br>
                    Hablarme con el botón de voz y te responderé con voz.<br><br>
                    ¿En qué te puedo ayudar hoy?
                </div>
            </div>`);
        isUserAtBottom = true;
        scrollToBottom(true);
        return;
    }
    const signedUrls = await Promise.all(historial.map(m => getSignedUrlForMessage(m)));
    historial.forEach((m, i) => {
        anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });
    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

async function enviarMensajeBot(textoLimpio) {
    if (!(await verificarTerminosMarquinhos())) { $('messageInput').value = textoLimpio; return; }

    let userMsg = { contenido: textoLimpio, created_at: new Date().toISOString(), tipo: 'texto', remitente_id: user.id, leido: true };
    try {
        const ins = await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: BOT_UUID, contenido: textoLimpio, tipo: 'texto', leido: true, editado: false, eliminado: false }).select('*').single();
        if (ins.error) throw ins.error;
        userMsg = ins.data;
    } catch (e) {
        if (esErrorContenidoNoPermitido(e)) { toast('Contenido no permitido por las normas de la comunidad.', 'error'); $('messageInput').value = textoLimpio; return; }
        console.warn('No se pudo guardar el mensaje del usuario:', e);
    }
    append(userMsg, true);
    mostrarTypingBot();
    try {
        const historial = await cargarHistorialParaBot();
        const respuesta = await preguntarAlBotConMemoria(textoLimpio, historial);
        quitarTypingBot();
        let botMsg = { contenido: respuesta, created_at: new Date().toISOString(), tipo: 'texto', remitente_id: BOT_UUID, leido: true, es_bot: true };
        try {
            const insBot = await db.from('mensajes_chat').insert({ remitente_id: BOT_UUID, destinatario_id: user.id, contenido: respuesta, tipo: 'texto', leido: true, editado: false, eliminado: false }).select('*').single();
            if (!insBot.error) botMsg = { ...insBot.data, es_bot: true };
        } catch (e) { console.warn('No se pudo guardar la respuesta de Marquinhos:', e); }
        append(botMsg, false);
        recargarBandeja();
    } catch (e) {
        quitarTypingBot();
        console.error('Error Marquinhos:', e);
        append({ contenido: e.message || 'Tuve un problema. Intenta de nuevo.', created_at: new Date().toISOString(), tipo: 'texto', remitente_id: BOT_UUID, leido: true, es_bot: true }, false);
    }
}

async function verificarTerminosMarquinhos() {
    const TERMINOS_VERSION = '1.1';
    const TERMINOS_KEY = 'marquinhos_terminos_aceptados_' + TERMINOS_VERSION;
    try { if (localStorage.getItem(TERMINOS_KEY)) return true; } catch (e) {}
    try {
        const { data, error } = await db.rpc('verificar_aceptacion_terminos', { p_version: TERMINOS_VERSION });
        if (error) throw error;
        let aceptado = false;
        if (data === true || data === "true") aceptado = true;
        else if (data === false || data === null || data === undefined || data === "false" || data === "") aceptado = false;
        else if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                if (parsed === true || parsed === "true") aceptado = true;
                else if (parsed && typeof parsed === 'object') {
                    if (parsed.aceptado === true || parsed.aceptado === "true") aceptado = true;
                    else if (parsed.success === true && parsed.aceptado !== false) aceptado = true;
                }
            } catch (e) { aceptado = false; }
        } else if (typeof data === 'object') {
            if (data.aceptado === true || data.aceptado === "true") aceptado = true;
            else if (data.success === true && data.aceptado !== false) aceptado = true;
        }
        if (aceptado) {
            try { localStorage.setItem(TERMINOS_KEY, 'true'); } catch (e) {}
            return true;
        }
    } catch (e) { console.warn('Error verificando términos:', e); }
    toast('Debes aceptar los Términos de Marquinhos primero.', 'warning');
    const RUTA_TERMINOS_REAL = '/legal/terminos-marquinhos';
    setTimeout(() => { window.location.href = RUTA_TERMINOS_REAL; }, 1200);
    return false;
}

async function cargarHistorialParaBot() {
    try {
        const r = await db.from('mensajes_chat').select('remitente_id, contenido, tipo, created_at').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`).order('created_at', { ascending: false }).limit(BOT_MAX_HISTORY);
        if (r.error || !Array.isArray(r.data)) return [];
        return r.data.reverse().map(m => ({ role: m.remitente_id === user.id ? 'user' : 'assistant', content: limpiarMarkdown(m.contenido || '').slice(0, 2000) })).filter(m => m.content && m.content.length > 0);
    } catch (e) { console.warn('No se pudo cargar historial para el bot:', e); return []; }
}

async function preguntarAlBotConMemoria(mensaje, historial) {
    const s = await session();
    if (!s) throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
    const userInfo = window.Marquinhos && window.Marquinhos.getUserInfo ? window.Marquinhos.getUserInfo() : null;
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 50000);
    try {
        const r = await fetch('/api/ai/chat-pet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + s.access_token },
            body: JSON.stringify({ message: mensaje.trim(), history: Array.isArray(historial) ? historial : [], page: '/features/mensajes/mensajes.html', user_name: userInfo ? userInfo.nombre : null, memoria: '' }),
            signal: controller.signal
        });
        let data = null;
        const contentType = r.headers.get('content-type') || '';
        if (contentType.includes('application/json')) { try { data = await r.json(); } catch (_) { data = null; } }
        else {
            if (!r.ok) {
                if (r.status === 502 || r.status === 504) throw new Error('El servidor está tardando o no disponible. Intenta de nuevo.');
                if (r.status === 500) throw new Error('El servidor tuvo un error interno. Intenta más tarde.');
                throw new Error('El servidor devolvió una respuesta inesperada. Código: ' + r.status);
            }
            throw new Error('El servidor no devolvió datos válidos.');
        }
        if (!r.ok) throw new Error((data && data.error) || `Error del servidor (${r.status})`);
        if (!data || data.success === false) throw new Error((data && data.error) || 'Marquinhos no pudo responder.');
        const respuesta = typeof data.reply === 'string' ? data.reply.trim() : '';
        if (!respuesta) throw new Error('Marquinhos respondió sin contenido.');
        return limpiarMarkdown(respuesta);
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Marquinhos está tardando demasiado en responder. Intenta nuevamente.');
        if (error.name === 'TypeError' && /Failed to fetch|NetworkError/i.test(error.message || '')) throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
        throw error;
    } finally { clearTimeout(timeout); }
}

function mostrarTypingBot() {
    const box = $('messages');
    box.querySelectorAll('.empty').forEach(el => el.remove());
    const anchorRef = box.querySelector('#scrollAnchor');
    if (anchorRef) {
        anchorRef.insertAdjacentHTML('beforebegin', `
            <div class="bubblewrap received" id="typing-bot">
                <div class="bubble">
                    <div class="bubble-bot-info">MARQUINHOS</div>
                    <div class="typing-indicator"><span></span><span></span><span></span></div>
                </div>
            </div>`);
    }
    scrollToBottom(true);
}

function quitarTypingBot() { const el = $('typing-bot'); if (el) el.remove(); }

async function grabarVozParaBot() {
    if (!current?.bot) return;
    if (!await auth()) return;
    if (enviandoVozBot) { toast('Procesando el audio anterior. Espera un momento.', 'warning'); return; }
    if (voiceBotGrabando) {
        if (voiceBotRecorder && voiceBotRecorder.state !== 'inactive') voiceBotRecorder.stop();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceBotChunks = [];
        voiceBotRecorder = new MediaRecorder(stream);
        voiceBotRecorder.ondataavailable = e => { if (e.data && e.data.size) voiceBotChunks.push(e.data); };
        voiceBotRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            voiceBotGrabando = false;
            marcarBotonVoz('');
            const blob = new Blob(voiceBotChunks, { type: voiceBotRecorder.mimeType || 'audio/webm' });
            voiceBotChunks = [];
            if (!blob.size) { toast('No se capturó audio.', 'error'); return; }
            const file = new File([blob], `voz-${Date.now()}.webm`, { type: blob.type });
            await enviarVozAlBot(file);
        };
        voiceBotRecorder.start();
        voiceBotGrabando = true;
        marcarBotonVoz('grabando');
        toast('Habla ahora. Presiona otra vez para enviar.');
    } catch (e) {
        console.error('Error micrófono:', e);
        toast('No se pudo acceder al micrófono.', 'error');
    }
}

async function enviarVozAlBot(file) {
    if (enviandoVozBot) { toast('Ya hay un audio en proceso. Espera.', 'warning'); return; }
    enviandoVozBot = true;
    marcarBotonVoz('procesando');
    try {
        const s = await session();
        if (!s) throw new Error('Inicia sesión nuevamente.');
        const path = `${user.id}/bot-voice/${Date.now()}.webm`;
        const { error: upErr } = await db.storage.from('chat-audio').upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error('No se pudo subir el audio.');
        const { data: signed } = await db.storage.from('chat-audio').createSignedUrl(path, 3600);
        if (!signed?.signedUrl) throw new Error('No se pudo preparar el audio.');

        const tempId = 'voice-user-' + Date.now();
        const box = $('messages');
        const anchorRef = box.querySelector('#scrollAnchor');
        const tempHTML = `<div class="bubblewrap sent" id="${tempId}"><div class="bubble"><div class="voice-label">Tu voz</div><div class="voice-loading">Enviando a Marquinhos…</div></div></div>`;
        if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', tempHTML); else box.insertAdjacentHTML('beforeend', tempHTML);
        scrollToBottom(true);

        let intentos = 0;
        const maxIntentos = 3;
        let exito = false;
        let data = {};
        while (intentos < maxIntentos && !exito) {
            const r = await fetch('/api/ai/voice/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token }, body: JSON.stringify({ audio_url: signed.signedUrl }) });
            data = await r.json().catch(() => ({}));
            if (r.status === 429) {
                intentos++;
                const waitTime = intentos * 2000;
                toast(`Servidor ocupado. Reintentando en ${waitTime / 1000} s.`, 'warning');
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            if (!r.ok || data.success === false) throw new Error(data.error || 'Error del servicio de voz.');
            exito = true;
        }
        if (!exito) throw new Error('El asistente está saturado. Intenta de nuevo en unos minutos.');
        document.getElementById(tempId)?.remove();

        try {
            await db.from('mensajes_chat').insert({ remitente_id: user.id, destinatario_id: BOT_UUID, contenido: data.transcripcion || file.name, nombre_archivo: file.name, imagen_url: `bucket://chat-audio/${path}`, tipo: 'audio', leido: true, editado: false, eliminado: false });
        } catch (e) { console.warn('No se pudo guardar la nota de voz:', e); }
        try {
            if (data.reply) await db.from('mensajes_chat').insert({ remitente_id: BOT_UUID, destinatario_id: user.id, contenido: data.reply, tipo: 'texto', leido: true, editado: false, eliminado: false });
        } catch (e) { console.warn('No se pudo guardar la respuesta de Marquinhos:', e); }

        const botId = 'voice-bot-' + Date.now();
        let botBody = '<div class="bubble-bot-info">MARQUINHOS</div>';
        if (data.transcripcion) botBody += `<div class="bot-transcripcion">Escuché: "${esc(data.transcripcion)}"</div>`;
        botBody += `<div>${esc(limpiarMarkdown(data.reply || 'Sin respuesta'))}</div>`;
        if (data.audio_url) botBody += `<audio class="bot-audio" controls src="${esc(data.audio_url)}"></audio>`;
        const botHTML = `<div class="bubblewrap received" id="${botId}"><div class="bubble">${botBody}</div></div>`;
        const anchorFinal = box.querySelector('#scrollAnchor');
        if (anchorFinal) anchorFinal.insertAdjacentHTML('beforebegin', botHTML); else box.insertAdjacentHTML('beforeend', botHTML);
        observarCargaMultimedia(box);
        scrollToBottom(true);
        if (data.audio_url) {
            const audio = document.querySelector(`#${botId} audio`);
            if (audio) audio.play().catch(() => {});
        }
        recargarBandeja();
    } catch (e) {
        console.error('Error voz bot:', e);
        if (String(e.message || '').includes('saturado')) toast('El asistente está saturado. Espera unos segundos e intenta de nuevo.', 'warning');
        else toast(e.message || 'No se pudo enviar la nota de voz.', 'error');
    } finally {
        enviandoVozBot = false;
        marcarBotonVoz('');
    }
}