// ================================================================
// MENSAJES · CHATS v1.0 · MÓDULO 3 DE 8
// Ruta: backend/public/features/mensajes/js/mensajes-chats.js
// Depende de: mensajes-core.js, mensajes-scroll-media.js
// Usa en tiempo de ejecución (módulos 4 y 7):
//   - abrirConversacionBot()  → mensajes-bot.js
//   - enviarMensajeBot()      → mensajes-bot.js
//   - enviarVozAlBot()        → mensajes-bot.js
// Contenido: lista de conversaciones, abrir/cerrar chat, render,
//            enviar texto, adjuntos, notas de voz, editar, eliminar,
//            marcar leído, realtime, nueva conversación, bloqueo y
//            menú contextual de mensajes.
// NO cargar todavía en mensajes.html.
// ================================================================

'use strict';

let conversationFilter = '';

async function loadConversations() {
    const list = $('conversationList');
    if (!list) return;
    list.innerHTML = '';

    const botEl = document.createElement('div');
    botEl.className = 'conv conv-bot' + (current?.id === BOT_ID ? ' active' : '');
    botEl.dataset.id = BOT_ID;
    botEl.dataset.name = 'marquinhos';
    botEl.innerHTML = `
        <div class="avatar avatar-bot">✦</div>
        <div class="convinfo">
            <div class="convname">Marquinhos</div>
            <div class="convmsg" id="botLastMsg">Tu asistente personal ✦</div>
        </div>
        <div class="convtime" id="botBadge" style="color:var(--success);font-size:.55rem">IA</div>`;
    botEl.onclick = () => openConversation(BOT_ID);
    list.appendChild(botEl);

    if (!await auth()) return;

    try {
        const ahora = Date.now();
        if (ahora - botResumenCache.ts > BOT_RESUMEN_TTL_MS) {
            const { data: lastBot } = await db.from('mensajes_chat').select('contenido,tipo,created_at').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${BOT_UUID}),and(remitente_id.eq.${BOT_UUID},destinatario_id.eq.${user.id})`).order('created_at', { ascending: false }).limit(1).maybeSingle();
            const { count: noLeidos } = await db.from('mensajes_chat').select('id', { count: 'exact', head: true }).eq('remitente_id', BOT_UUID).eq('destinatario_id', user.id).eq('leido', false).eq('eliminado', false);
            botResumenCache = { ts: ahora, ultimo: lastBot, noLeidos: noLeidos || 0 };
        }
        const { ultimo: lastBot, noLeidos } = botResumenCache;
        if (lastBot) {
            const preview = $('botLastMsg');
            if (preview) preview.textContent = lastBot.tipo === 'texto' ? (lastBot.contenido || '').slice(0, 60) : ('📎 ' + (lastBot.contenido || lastBot.tipo));
        }
        const badge = $('botBadge');
        if (badge && noLeidos > 0) {
            badge.innerHTML = `<span style="background:var(--danger);color:#fff;font-size:.6rem;font-weight:800;padding:2px 8px;border-radius:99px;min-width:20px;text-align:center;display:inline-block;animation:pulse-badge 1.5s infinite;">${noLeidos > 9 ? '9+' : noLeidos}</span>`;
        }
    } catch (e) { console.warn('Error cargando badge bot:', e); }

    try {
        const { data: filas, error } = await db.rpc('listar_conversaciones', { p_limite: 50 });
        if (error) { console.error('Error listar_conversaciones:', error); return; }
        const conversaciones = Array.isArray(filas) ? filas : [];
        if (!conversaciones.length) { aplicarFiltroConversaciones(); return; }

        conversaciones.forEach(conv => {
            const otherId = conv.otro_id;
            if (!otherId) return;

            const nombre = conv.nombre || 'Usuario';
            const handle = conv.handle || 'usuario';
            const avatarUrl = conv.avatar_url || null;
            const ultimoTipo = conv.ultimo_tipo;
            const ultimoContenido = conv.ultimo_contenido;
            const noLeidos = Number(conv.no_leidos) || 0;

            let preview;
            if (!ultimoTipo) preview = 'Sin mensajes';
            else if (ultimoTipo === 'texto') preview = (ultimoContenido || '').slice(0, 60) || 'Sin mensajes';
            else preview = '📎 ' + (ultimoContenido || ultimoTipo);

            const hora = conv.ultimo_at ? new Date(conv.ultimo_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            const el = document.createElement('div');
            el.className = 'conv' + (current?.id === otherId ? ' active' : '');
            el.dataset.id = otherId;
            el.dataset.name = ((nombre || '').toLowerCase() + ' ' + (handle || '').toLowerCase()).trim();
            el.innerHTML = avatar(nombre, avatarUrl) + `
                <div class="convinfo">
                    <div class="convname">${esc(nombre)}</div>
                    <div class="convmsg">${esc(preview)}</div>
                </div>
                <div class="convtime">
                    ${hora}
                    ${noLeidos > 0 ? `<span style="display:inline-block;margin-left:6px;background:var(--danger);color:#fff;font-size:.6rem;font-weight:800;padding:2px 7px;border-radius:99px;min-width:18px;text-align:center;">${noLeidos > 9 ? '9+' : noLeidos}</span>` : ''}
                </div>`;
            el.onclick = () => openConversation(otherId);
            list.appendChild(el);
        });
        aplicarFiltroConversaciones();
    } catch (e) { console.error('Error en loadConversations:', e); }
}

const recargarBandeja = debounce(loadConversations, 300);

function aplicarFiltroConversaciones() {
    const q = conversationFilter.trim().toLowerCase();
    document.querySelectorAll('.conv').forEach(el => {
        if (!q || el.dataset.name?.includes(q) || el.querySelector('.convname')?.textContent.toLowerCase().includes(q)) el.style.display = 'flex';
        else el.style.display = 'none';
    });
}

async function openConversation(id) {
    if (!await auth()) return;
    const p = await profile(id);
    const esBot = (id === BOT_ID);
    current = { id, profile: p, bot: esBot };

    $('chatName').textContent = p.nombre || 'Usuario';
    $('chatAvatar').innerHTML = esBot ? '✦' : (p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || '◈').charAt(0).toUpperCase()));
    $('chatAvatar').className = 'avatar' + (esBot ? ' avatar-bot' : '');
    $('chatStatus').textContent = esBot ? '✦ IA · Siempre disponible' : (p.online ? '◉ En línea' : '◈ Desconectado');
    $('chatStatus').className = 'status' + (p.online ? ' online' : '');

    $('chatAvatar').onclick = () => {
        if (esBot) { toast('ℹ️ Marquinhos es un asistente IA', 'warning'); return; }
        verFotoAmpliada(p.avatar_url, p.nombre, p.handle);
    };

    $('voiceBot').style.display = esBot ? 'inline-flex' : 'none';
    $('chatActions').style.display = 'flex';

    const callBtn = $('videoCall');
    if (callBtn) {
        if (esBot) callBtn.style.display = 'none';
        else {
            callBtn.style.display = 'inline-flex';
            callBtn.title = 'Iniciar videollamada con ' + (p.nombre || 'usuario');
            callBtn.disabled = !window.__livekitReady;
        }
    }

    $('composer').style.display = 'flex';
    $('emptyState').style.display = 'none';
    $('panel').classList.add('chat-open');
    document.querySelectorAll('.conv').forEach(x => x.classList.toggle('active', x.dataset.id === id));

    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();

    if (esBot) {
        await db.from('mensajes_chat').update({ leido: true }).eq('remitente_id', BOT_UUID).eq('destinatario_id', user.id).eq('leido', false);
        botResumenCache.ts = 0;
        const badge = $('botBadge');
        if (badge) { badge.textContent = 'IA'; badge.style.color = 'var(--success)'; }
        await abrirConversacionBot();
        return;
    }

    const r = await db.from('mensajes_chat').select('*').eq('eliminado', false).or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${id}),and(remitente_id.eq.${id},destinatario_id.eq.${user.id})`).order('created_at', { ascending: true }).limit(100);
    if (r.error) { console.error(r.error); toast('❌ Error al cargar mensajes', 'error'); return; }
    await renderMessages(r.data || []);
    await markRead(id);
    subscribeMessages(id);
}

async function cerrarConversacion() {
    current = null;
    $('panel').classList.remove('chat-open');
    $('chatName').textContent = 'Selecciona una conversación';
    $('chatStatus').textContent = '◈ En espera';
    $('chatAvatar').innerHTML = '◈';
    $('chatAvatar').className = 'avatar';
    $('chatAvatar').onclick = null;
    $('chatActions').style.display = 'none';
    $('composer').style.display = 'none';
    $('emptyState').style.display = 'block';
    const box = $('messages');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    document.querySelectorAll('.conv').forEach(x => x.classList.remove('active'));
    if (msgChannel) {
        try { db.removeChannel(msgChannel); }
        catch (e) { console.warn('[Mensajes] removeChannel msgChannel:', e && e.message ? e.message : e); }
        msgChannel = null;
    }
}

async function renderMessages(rows) {
    const box = $('messages');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    let anchor = box.querySelector('#scrollAnchor');
    if (!anchor) { anchor = document.createElement('div'); anchor.id = 'scrollAnchor'; box.appendChild(anchor); }
    if (!rows.length) {
        anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><strong>◈</strong><div>Sin mensajes</div><small>Envía el primer mensaje</small></div>');
        return;
    }
    const signedUrls = await Promise.all(rows.map(m => getSignedUrlForMessage(m)));
    rows.forEach((m, i) => {
        anchor.insertAdjacentHTML('beforebegin', messageHTML(m, m.remitente_id === user.id, signedUrls[i]));
    });
    isUserAtBottom = true;
    observarCargaMultimedia(box);
    scrollToBottom(true);
}

function messageHTML(m, sent, signedUrl) {
    const textoLimpio = limpiarMarkdown(m.contenido || '');
    let body = (typeof window.formatearMensajeConEmotes === 'function')
        ? window.formatearMensajeConEmotes(textoLimpio)
        : esc(textoLimpio);
    const urlToUse = urlSegura(signedUrl || m.imagen_url);
    if (urlToUse) {
        if (m.tipo === 'imagen') body = `<img src="${esc(urlToUse)}" alt="${esc(m.nombre_archivo || 'Imagen')}" loading="lazy" data-visor="1" data-src="${esc(urlToUse)}" data-nombre="${esc(m.nombre_archivo || 'imagen.jpg')}" style="cursor:zoom-in;">`;
        else if (m.tipo === 'video') body = `<video controls playsinline src="${esc(urlToUse)}"></video>`;
        else if (m.tipo === 'audio') body = `<audio controls preload="metadata" src="${esc(urlToUse)}"></audio>`;
        else { const displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido) || 'Archivo'); body = `📎 <a href="${esc(urlToUse)}" target="_blank" rel="noopener" style="color:var(--gold)">${displayName}</a>`; }
    }
    const esBotRecibido = !sent && (m.es_bot || m.bot_message);
    const headerBot = esBotRecibido ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';
    const avisoHTML = m.aviso_moderacion === 'lenguaje_inapropiado' ? '<div style="margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(247,212,74,.12);border:1px solid rgba(247,212,74,.4);color:#f7d44a;font-size:.68rem;">⚠️ Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.</div>' : '';
    const editadoHTML = m.editado === true ? ' · editado' : '';
    return `<div class="bubblewrap ${sent ? 'sent' : 'received'}" data-mensaje-id="${esc(m.id || '')}">
        <div class="bubble">${headerBot}${body}${avisoHTML}</div>
        <div class="meta">${m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}${editadoHTML}${sent ? (m.leido ? ' · ◆◆' : ' · ◈◈') : ''}</div>
    </div>`;
}

async function sendMessage(text) {
    if (!current || !text.trim()) return;
    if (!await auth()) return;
    const textoLimpio = text.trim();
    $('messageInput').value = '';

    if (current.bot) {
        // La lógica completa de Marquinhos vive en mensajes-bot.js
        await enviarMensajeBot(textoLimpio);
        return;
    }

    let resp;
    try {
        resp = await enviarMensajeChat(current.id, textoLimpio, 'texto');
    } catch (e) {
        console.error('Error enviando mensaje:', e);
        if (esErrorContenidoNoPermitido(e)) toast('❌ Contenido no permitido por las normas de la comunidad', 'error');
        else toast('❌ ' + (e.message || 'Error al enviar mensaje'), 'error');
        $('messageInput').value = textoLimpio;
        return;
    }

    if (resp.estado === 'entregado' && resp.mensaje) { await append(resp.mensaje, true); recargarBandeja(); return; }
    if (resp.estado === 'solicitud') { toast('📥 Tu mensaje se envió como solicitud. Aparecerá cuando la acepte.', 'success'); recargarBandeja(); return; }
    if (resp.estado === 'solicitud_en_espera') { toast('⏳ Ya tienes una solicitud pendiente con esta persona.', 'warning'); $('messageInput').value = textoLimpio; return; }
    toast('⚠️ No se pudo enviar el mensaje.', 'error');
    $('messageInput').value = textoLimpio;
}

async function append(m, sent) {
    const box = $('messages');
    const empty = box.querySelector('.empty');
    if (empty) empty.remove();
    const signedUrl = await getSignedUrlForMessage(m);
    const anchorRef = box.querySelector('#scrollAnchor');
    if (anchorRef) anchorRef.insertAdjacentHTML('beforebegin', messageHTML(m, sent, signedUrl));
    else box.insertAdjacentHTML('beforeend', messageHTML(m, sent, signedUrl));
    observarCargaMultimedia(box);
    if (!sent && !isUserAtBottom) { unreadCount++; actualizarFlecha(); return; }
    isUserAtBottom = true;
    scrollToBottom(true);
}

async function markRead(id, force = false) {
    if (!user || id === BOT_ID) return;
    const ahora = Date.now();
    const ultimo = markReadTimestamps.get(id) || 0;
    if (!force && ahora - ultimo < MARK_READ_DEBOUNCE_MS) return;
    markReadTimestamps.set(id, ahora);
    await db.from('mensajes_chat').update({ leido: true }).eq('remitente_id', id).eq('destinatario_id', user.id).eq('leido', false).eq('eliminado', false);
}

async function deleteConversation() {
    if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
    if (!await auth()) return;
    const nombre = current.bot ? 'Marquinhos' : (current.profile.nombre || 'este usuario');
    const confirmado = await NeonModal.confirm({ title: 'Eliminar conversación', message: `¿Eliminar TODA la conversación con ${nombre}?\n\nEsta acción no se puede deshacer.`, icon: '🗑', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
    if (!confirmado) return;
    try {
        const targetId = current.bot ? BOT_UUID : current.id;
        const { error } = await db.rpc('ocultar_conversacion', { p_otro: targetId });
        if (error) throw error;
        toast('✅ Conversación eliminada correctamente', 'success');
        const box = $('messages');
        box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
        const anchor = box.querySelector('#scrollAnchor');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><strong>◈</strong><div>Conversación eliminada</div><small>Envía un mensaje para empezar de nuevo</small></div>');
        unreadCount = 0;
        actualizarFlecha();
        recargarBandeja();
    } catch (e) { console.error('Error eliminando conversación:', e); toast('❌ No se pudo eliminar la conversación', 'error'); }
}

function subscribeMessages(id) {
    if (id === BOT_ID) return;
    if (msgChannel) {
        try { db.removeChannel(msgChannel); }
        catch (e) { console.warn('[Mensajes] removeChannel msgChannel (pre-subscribe):', e && e.message ? e.message : e); }
        msgChannel = null;
    }
    if (!user || !user.id) return;

    const manejarUpdate = (m) => {
        if (!current || !user) return;
        const el = document.querySelector(`.bubblewrap[data-mensaje-id="${m.id}"]`);
        if (!el) { recargarBandeja(); return; }

        if (m.eliminado === true) { el.remove(); recargarBandeja(); return; }

        const bubble = el.querySelector('.bubble');
        const metaEl = el.querySelector('.meta');
        const esSent = el.classList.contains('sent');

        if (bubble && m.tipo === 'texto') {
            const textoLimpio = limpiarMarkdown(m.contenido || '');
            const innerHtml = (typeof window.formatearMensajeConEmotes === 'function')
                ? window.formatearMensajeConEmotes(textoLimpio)
                : esc(textoLimpio);
            const headerBot = (!esSent && (m.es_bot || m.bot_message)) ? '<div class="bubble-bot-info">✦ MARQUINHOS</div>' : '';
            const avisoHTML = m.aviso_moderacion === 'lenguaje_inapropiado' ? '<div style="margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(247,212,74,.12);border:1px solid rgba(247,212,74,.4);color:#f7d44a;font-size:.68rem;">⚠️ Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.</div>' : '';
            bubble.innerHTML = headerBot + innerHtml + avisoHTML;
        }

        if (metaEl) {
            const hora = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const editado = m.editado === true ? ' · editado' : '';
            const leido = esSent ? (m.leido ? ' · ◆◆' : ' · ◈◈') : '';
            metaEl.textContent = hora + editado + leido;
        }

        recargarBandeja();
    };

    msgChannel = db.channel('chat-' + id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: 'remitente_id=eq.' + id }, p => {
            const m = p.new;
            if (m.destinatario_id === user.id) { append(m, false); markRead(id, true); }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes_chat', filter: 'remitente_id=eq.' + user.id }, p => { manejarUpdate(p.new); })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes_chat', filter: 'destinatario_id=eq.' + user.id }, p => { manejarUpdate(p.new); })
        .subscribe();
}

async function uploadFile(file) {
    if (!current || !await auth()) return;
    if (current.bot) { toast('⚠️ Para Marquinhos usa el botón 🔊, o envía nota de voz con 🎙️', 'error'); return; }
    if (file.size > 50 * 1024 * 1024) { toast('⚠️ El archivo supera 50 MB', 'error'); return; }
    const type = file.type.startsWith('image/') ? 'imagen' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'archivo';
    if (type === 'archivo') { toast('⚠️ En el chat solo se pueden enviar imágenes, videos o audios', 'error'); return; }
    let storageRef;
    try {
        if (type === 'audio') {
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `${user.id}/mensajes/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
            const up = await db.storage.from('chat-audio').upload(path, file, { contentType: file.type || 'application/octet-stream', cacheControl: '3600', upsert: false });
            if (up.error) throw up.error;
            storageRef = `bucket://chat-audio/${path}`;
        } else {
            const d = await subirViaBackend(file, 'chat-attachments', type);
            storageRef = `bucket://chat-attachments/${d.path}`;
        }
    } catch (e) { console.error('Error subiendo archivo:', e); toast('❌ ' + (e.message || 'No se pudo subir el archivo'), 'error'); return; }

    let resp;
    try {
        resp = await enviarMensajeChat(current.id, file.name, type, storageRef, file.name);
    } catch (e) {
        console.error('Error enviando archivo:', e);
        if (esErrorContenidoNoPermitido(e)) toast('❌ Contenido no permitido por las normas de la comunidad', 'error');
        else toast('❌ ' + (e.message || 'No se pudo guardar el archivo'), 'error');
        return;
    }

    if (resp.estado === 'entregado' && resp.mensaje) { await append(resp.mensaje, true); recargarBandeja(); }
}

function newConversation() {
    $('newModal').classList.add('show');
    $('userSearch').value = '';
    $('userResults').innerHTML = '';
    setTimeout(() => $('userSearch').focus(), 50);
}

async function searchUsers(q) {
    const box = $('userResults');
    if (!q || q.trim().length < 2) { box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">Escribe al menos 2 caracteres</div>'; return; }
    if (!await auth()) return;
    const term = q.trim().replace(/[%_,\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const r = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url').or(`nombre.ilike.%${term}%,handle.ilike.%${term}%`).neq('id', user.id).neq('id', BOT_UUID).limit(12);
    if (r.error) { console.error(r.error); toast('❌ Error al buscar usuarios', 'error'); return; }
    box.innerHTML = r.data?.length ? '' : '<div style="padding:18px;text-align:center;color:var(--muted)">No se encontraron usuarios</div>';
    for (const p of r.data || []) {
        const el = document.createElement('div');
        el.className = 'result';
        el.innerHTML = avatar(p.nombre, p.avatar_url) + `
            <div style="flex:1">
                <b>${esc(p.nombre || 'Usuario')}</b>
                <div style="font-size:.68rem;color:var(--muted)">@${esc(p.handle || 'usuario')}</div>
            </div>
            <span style="color:var(--gold);font-size:.7rem">Iniciar ›</span>`;
        el.onclick = () => createConversation(p.id);
        box.appendChild(el);
    }
}

async function createConversation(id) {
    if (!await auth()) return;
    $('newModal').classList.remove('show');
    await loadConversations();
    await openConversation(id);
}

function getSupportedAudioMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (const type of candidates) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type; }
    return '';
}

function extensionForMime(mime) { if (mime.includes('ogg')) return 'ogg'; if (mime.includes('mp4')) return 'm4a'; return 'webm'; }

async function recordAudioNota() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
    if (!await auth()) return;
    const esBot = current.bot;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        const mimeType = getSupportedAudioMime();
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recordingMode = esBot ? 'bot' : 'normal';
        recordingStartedAt = Date.now();
        recorder.ondataavailable = e => { if (e.data && e.data.size) audioChunks.push(e.data); };
        recorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            $('audio').classList.remove('recording');
            $('audio').textContent = '🎙️';
            const blob = new Blob(audioChunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            audioChunks = [];
            const mode = recordingMode;
            recorder = null;
            recordingMode = null;
            if (!blob.size) { toast('⚠️ No se capturó audio', 'error'); return; }
            const ext = extensionForMime(blob.type);
            const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
            if (mode === 'bot') await enviarVozAlBot(file);
            else await uploadFile(file);
        };
        recorder.start();
        $('audio').classList.add('recording');
        $('audio').textContent = '⏹️';
        toast(esBot ? '🎙️ Habla con Marquinhos… presiona otra vez para enviar' : '🎙️ Grabando… presiona otra vez para detener');
    } catch (e) { console.error('Micrófono:', e); $('audio').classList.remove('recording'); $('audio').textContent = '🎙️'; toast('❌ No se pudo acceder al micrófono', 'error'); }
}

async function bloquearUsuarioActual() {
    if (!current || current.bot) { toast('⚠️ No se puede bloquear a Marquinhos', 'warning'); return; }
    const confirmado = await NeonModal.confirm({
        title: 'Bloquear usuario',
        message: `¿Bloquear a ${current.profile.nombre || 'este usuario'}? No podrá llamarte ni tú a él.`,
        icon: '⛔',
        confirmText: 'Bloquear',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!confirmado) return;
    try {
        await db.rpc('bloquear_contacto', { p_contacto_id: current.id });
        toast('⛔ Usuario bloqueado', 'success');
        await cerrarConversacion();
        recargarBandeja();
    } catch (e) {
        console.error('Error bloqueando:', e);
        toast('❌ No se pudo bloquear al usuario', 'error');
    }
}

async function mostrarMenuMensaje(bubblewrap, msgId) {
    document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());

    const esDeUsuario = !!(current && !current.bot);
    const esSent = bubblewrap.classList.contains('sent');

    const menu = document.createElement('div');
    menu.className = 'msg-context-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:var(--panel,#0d1117);border:1px solid rgba(0,229,255,.3);border-radius:12px;padding:8px 0;box-shadow:0 8px 30px rgba(0,0,0,.5);min-width:160px;';

    const rect = bubblewrap.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    let y = rect.bottom + 8;
    if (x + 80 > window.innerWidth) x = window.innerWidth - 170;
    if (y + 150 > window.innerHeight) y = rect.top - 150;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const opciones = [];
    if (esDeUsuario && esSent) opciones.push({ texto: 'Editar', accion: () => editarMensaje(msgId, bubblewrap) });
    opciones.push({ texto: 'Eliminar para mí', accion: () => eliminarMensajeParaMi(msgId, bubblewrap) });
    if (esDeUsuario && esSent) opciones.push({ texto: 'Eliminar para todos', accion: () => eliminarMensajeParaTodos(msgId, bubblewrap), danger: true });

    opciones.forEach(op => {
        const btn = document.createElement('button');
        btn.textContent = op.texto;
        btn.style.cssText = `display:block;width:100%;padding:8px 16px;background:none;border:none;text-align:left;color:${op.danger ? '#ff5c7a' : 'var(--text-primary,#e6f1ff)'};font-size:.8rem;cursor:pointer;`;
        btn.onmouseenter = () => btn.style.background = 'rgba(0,229,255,.08)';
        btn.onmouseleave = () => btn.style.background = 'none';
        btn.onclick = () => { menu.remove(); op.accion(); };
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    setTimeout(() => {
        const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 10);
}

async function editarMensaje(msgId, bubblewrap) {
    if (!await auth()) return;
    const bubble = bubblewrap.querySelector('.bubble');
    const metaEl = bubblewrap.querySelector('.meta');
    const esSent = bubblewrap.classList.contains('sent');
    let contenidoActual = bubble.textContent.trim();

    const nuevoTexto = await NeonModal.prompt({
        title: 'Editar mensaje',
        message: 'Edita tu mensaje (máx. 15 minutos):',
        icon: '✎',
        placeholder: 'Nuevo texto…',
        defaultValue: contenidoActual,
        confirmText: 'Guardar',
        cancelText: 'Cancelar'
    });
    if (!nuevoTexto || nuevoTexto === contenidoActual) return;

    try {
        const { error } = await db.rpc('editar_mensaje_chat', { p_mensaje_id: msgId, p_contenido: nuevoTexto });
        if (error) {
            const msgErr = error.message || '';
            if (msgErr.indexOf('contenido_no_permitido') !== -1) toast('❌ Contenido no permitido por las normas de la comunidad', 'error');
            else if (msgErr.indexOf('edicion_expirada') !== -1) toast('Ya no puedes editar este mensaje (más de 15 minutos)', 'error');
            else toast('❌ ' + (msgErr || 'No se pudo editar'), 'error');
            return;
        }
        const textoLimpio = limpiarMarkdown(nuevoTexto);
        const innerHtml = (typeof window.formatearMensajeConEmotes === 'function')
            ? window.formatearMensajeConEmotes(textoLimpio)
            : esc(textoLimpio);
        bubble.innerHTML = innerHtml;
        if (metaEl) {
            const horaMatch = metaEl.textContent.match(/^\s*(\d{1,2}:\d{2})/);
            const hora = horaMatch ? horaMatch[1] : '';
            const leidoEstado = esSent ? (metaEl.textContent.includes('◆◆') ? ' · ◆◆' : ' · ◈◈') : '';
            metaEl.textContent = `${hora} · editado${leidoEstado}`;
        }
        toast('✎ Mensaje editado', 'success');
        recargarBandeja();
    } catch (e) {
        console.error('Error editando mensaje:', e);
        toast('❌ No se pudo editar el mensaje', 'error');
    }
}

async function eliminarMensajeParaMi(msgId, bubblewrap) {
    const confirmado = await NeonModal.confirm({ title: 'Eliminar para mí', message: '¿Eliminar este mensaje solo de tu vista?', icon: '🗑', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
    if (!confirmado) return;
    try {
        const { error } = await db.rpc('eliminar_mensaje_para_mi', { p_mensaje_id: msgId });
        if (error) throw error;
        bubblewrap.remove();
        toast('✅ Mensaje eliminado para ti', 'success');
        recargarBandeja();
    } catch (e) { console.error('Error eliminando para mí:', e); toast('❌ No se pudo eliminar', 'error'); }
}

async function eliminarMensajeParaTodos(msgId, bubblewrap) {
    const confirmado = await NeonModal.confirm({ title: 'Eliminar para todos', message: '¿Eliminar este mensaje para todos? Esta acción no se puede deshacer.', icon: '🗑', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
    if (!confirmado) return;
    try {
        const { error } = await db.rpc('eliminar_mensaje_para_todos', { p_mensaje_id: msgId });
        if (error) throw error;
        bubblewrap.remove();
        toast('✅ Mensaje eliminado para todos', 'success');
        recargarBandeja();
    } catch (e) { console.error('Error eliminando para todos:', e); toast('❌ No se pudo eliminar', 'error'); }
}

function configurarLongPressMensajes() {
    const box = $('messages');
    if (!box || box.dataset.longPressListener) return;
    box.dataset.longPressListener = '1';
    let pressTimer = null;
    let startX = 0, startY = 0;

    const esMensajeValido = (bubblewrap) => {
        if (!bubblewrap) return false;
        if (bubblewrap.querySelector('img, video, audio')) return false;
        if (!bubblewrap.dataset.mensajeId) return false;
        if (!current || current.bot) return false;
        return true;
    };

    box.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const bubblewrap = e.target.closest('.bubblewrap');
        if (!esMensajeValido(bubblewrap)) return;
        startX = e.clientX; startY = e.clientY;
        pressTimer = setTimeout(() => {
            pressTimer = null;
            const msgId = bubblewrap.dataset.mensajeId;
            if (msgId) mostrarMenuMensaje(bubblewrap, msgId);
        }, 500);
    });

    box.addEventListener('pointerup', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
    box.addEventListener('pointercancel', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
    box.addEventListener('pointermove', e => {
        if (!pressTimer) return;
        if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) { clearTimeout(pressTimer); pressTimer = null; }
    });
    box.addEventListener('contextmenu', e => {
        if (e.pointerType === 'touch') return;
        const bubblewrap = e.target.closest('.bubblewrap');
        if (!esMensajeValido(bubblewrap)) return;
        e.preventDefault();
        const msgId = bubblewrap.dataset.mensajeId;
        if (msgId) mostrarMenuMensaje(bubblewrap, msgId);
    });
}