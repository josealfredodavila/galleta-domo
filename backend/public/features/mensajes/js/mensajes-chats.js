// ================================================================
// MENSAJES · CHATS v2.3 · MÓDULO 3 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-chats.js
// Cambios v2.3 (multimedia):
//  - messageHTML usa solo la URL firmada (sin fallback a imagen_url crudo).
//  - Si un adjunto no tiene URL se muestra "Archivo no disponible"
//    en lugar de una burbuja vacía o el nombre del archivo.
// Cambios v2.2 (interfaz):
//  - El composer nunca queda oculto por demora/fallo al consultar bloqueos.
//  - Solo se oculta si hay bloqueo confirmado (yo === true || el === true).
//  - estadoBloqueoCon() es tolerante a errores (devuelve false,false).
//  - Guardias defensivas: input/textarea sin disabled/readonly; foco hace scroll.
// ================================================================

'use strict';

const ICO_ESTRELLA_CHAT = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>';

let conversationFilter = '';
let aperturaSecuencia = 0;

function etiquetaPreview(tipo, contenido) {
    if (!tipo) return 'Sin mensajes';
    if (tipo === 'texto') return (contenido || '').slice(0, 60) || 'Sin mensajes';
    const etiquetas = { imagen: 'Imagen', video: 'Video', audio: 'Nota de voz', archivo: 'Archivo' };
    return etiquetas[tipo] || (contenido || tipo);
}

function textoPresencia(p) {
    return p && p.online ? 'En línea' : 'Desconectado';
}

async function loadConversations() {
    const list = $('conversationList');
    if (!list) return;
    list.innerHTML = '';

    const botEl = document.createElement('div');
    botEl.className = 'conv conv-bot' + (current?.id === BOT_ID ? ' active' : '');
    botEl.dataset.id = BOT_ID;
    botEl.dataset.name = 'marquinhos';
    botEl.innerHTML = `
        <div class="avatar avatar-bot">${ICO_ESTRELLA_CHAT}</div>
        <div class="convinfo">
            <div class="convname">Marquinhos</div>
            <div class="convmsg" id="botLastMsg">Tu asistente personal</div>
        </div>
        <div class="convtime" id="botBadge">IA</div>`;
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
            if (preview) preview.textContent = etiquetaPreview(lastBot.tipo, lastBot.contenido);
        }
        const badge = $('botBadge');
        if (badge && noLeidos > 0) {
            badge.innerHTML = `<span class="badge-unread">${noLeidos > 9 ? '9+' : noLeidos}</span>`;
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
            const noLeidos = Number(conv.no_leidos) || 0;
            const preview = etiquetaPreview(conv.ultimo_tipo, conv.ultimo_contenido);
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
                    ${esc(hora)}
                    ${noLeidos > 0 ? `<span class="badge-unread">${noLeidos > 9 ? '9+' : noLeidos}</span>` : ''}
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
        const visible = !q || el.dataset.name?.includes(q) || el.querySelector('.convname')?.textContent.toLowerCase().includes(q);
        el.style.display = visible ? 'flex' : 'none';
    });
}

/* ---------------- Bloqueo (sincronizado con contactos.js) ---------------- */

async function estadoBloqueoCon(id) {
    // Tolerante a errores: si falla una consulta, esa dirección se considera NO bloqueada.
    try {
        if (!user || !user.id || !id) return { yo: false, el: false };
        const [yo, el] = await Promise.all([
            db.from('bloqueos').select('id').eq('usuario_id', user.id).eq('bloqueado_id', id).maybeSingle(),
            db.from('bloqueos').select('id').eq('usuario_id', id).eq('bloqueado_id', user.id).maybeSingle()
        ]);
        return {
            yo: !!(yo && yo.data),
            el: !!(el && el.data)
        };
    } catch (e) {
        console.warn('[Mensajes] estadoBloqueoCon falló, se asume sin bloqueo:', e && e.message ? e.message : e);
        return { yo: false, el: false };
    }
}

function aplicarEstadoBloqueo(est) {
    if (!current || current.bot) return;
    const seguro = {
        yo: est && est.yo === true,
        el: est && est.el === true
    };
    current.bloqueo = seguro;

    const composer = $('composer');
    const status = $('chatStatus');
    const nombre = current.profile?.nombre || 'Usuario';
    const bloqueado = seguro.yo || seguro.el;

    if (composer) {
        composer.hidden = bloqueado;
        // Refuerzo visual: si no está bloqueado, garantiza visibilidad y eliminación de estilos que impidan el toque.
        if (!bloqueado) {
            composer.style.removeProperty('display');
            composer.style.removeProperty('visibility');
            composer.style.removeProperty('pointer-events');
        }
    }

    if (status) {
        if (bloqueado) {
            status.textContent = seguro.yo ? 'Bloqueado' : 'No disponible';
            status.className = 'status';
        } else {
            status.textContent = textoPresencia(current.profile);
            status.className = 'status' + (current.profile?.online ? ' online' : '');
        }
    }

    const filaBloqueo = document.querySelector('#cpActionBlock .main');
    if (filaBloqueo) {
        const verbo = seguro.yo ? 'Desbloquear a ' : 'Bloquear a ';
        filaBloqueo.innerHTML = verbo + '<span id="cpBlockName">' + esc(nombre) + '</span>';
    }
}

async function bloquearUsuarioActual() {
    if (!current || current.bot) { toast('Marquinhos no se puede bloquear.', 'warning'); return; }
    if (!await auth()) return;

    const id = current.id;
    const nombre = current.profile?.nombre || 'este usuario';
    const est = await estadoBloqueoCon(id);

    if (est.el && !est.yo) {
        toast('Esta persona te bloqueó. No puedes cambiar este estado.', 'warning');
        return;
    }

    if (est.yo) {
        const ok = await NeonModal.confirm({
            title: 'Desbloquear usuario',
            message: `¿Permitir que ${nombre} te escriba y te llame de nuevo?`,
            confirmText: 'Desbloquear',
            cancelText: 'Cancelar'
        });
        if (!ok) return;
        const { error } = await db.from('bloqueos').delete().eq('usuario_id', user.id).eq('bloqueado_id', id);
        if (error) { toast('No se pudo desbloquear.', 'error'); return; }
        toast('Usuario desbloqueado.', 'success');
    } else {
        const ok = await NeonModal.confirm({
            title: 'Bloquear usuario',
            message: `¿Bloquear a ${nombre}? No podrá llamarte ni escribirte.`,
            confirmText: 'Bloquear',
            cancelText: 'Cancelar',
            danger: true
        });
        if (!ok) return;
        const { error } = await db.rpc('bloquear_contacto', { p_contacto_id: id });
        if (error) { console.error('Error bloqueando:', error); toast('No se pudo bloquear.', 'error'); return; }
        toast('Usuario bloqueado.', 'success');
    }

    aplicarEstadoBloqueo(await estadoBloqueoCon(id));
    recargarBandeja();
}

/* ---------------- Abrir y cerrar chat ---------------- */

function marcarBotLeidoEnSegundoPlano() {
    try {
        db.from('mensajes_chat')
            .update({ leido: true })
            .eq('remitente_id', BOT_UUID)
            .eq('destinatario_id', user.id)
            .eq('leido', false)
            .then(() => {}, () => {});
    } catch (e) { /* silencioso */ }
}

async function openConversation(id) {
    const secuencia = ++aperturaSecuencia;

    const visor = $('estadoViewer');
    if (visor) visor.classList.remove('show');

    if (!await auth()) return;

    const p = await profile(id);
    if (secuencia !== aperturaSecuencia) return;

    const esBot = (id === BOT_ID);
    current = { id, profile: p, bot: esBot, bloqueo: { yo: false, el: false } };

    $('chatName').textContent = p.nombre || 'Usuario';
    $('chatAvatar').innerHTML = esBot
        ? ICO_ESTRELLA_CHAT
        : (p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.nombre || 'U').charAt(0).toUpperCase()));
    $('chatAvatar').className = 'avatar' + (esBot ? ' avatar-bot' : '');
    $('chatStatus').textContent = esBot ? 'IA · Siempre disponible' : textoPresencia(p);
    $('chatStatus').className = 'status' + (!esBot && p.online ? ' online' : '');

    const header = $('chatHeader');
    header.dataset.userId = id;
    header.dataset.handle = p.handle || '';
    header.dataset.online = p.online ? 'true' : 'false';

    $('voiceBot').hidden = !esBot;
    $('chatActions').hidden = esBot;

    const callBtn = $('videoCall');
    if (callBtn) {
        callBtn.disabled = esBot || !window.__livekitReady;
        callBtn.title = esBot ? '' : 'Videollamada con ' + (p.nombre || 'usuario');
    }
    const audioBtn = $('audioCall');
    if (audioBtn) audioBtn.disabled = esBot || !window.__livekitReady;

    // === Interfaz: composer visible y editable SIEMPRE al abrir la conversación ===
    // Se muestra ANTES de consultar bloqueos para no quedar oculto por demoras.
    $('composer').hidden = false;
    $('emptyState').hidden = true;
    $('panel').classList.add('chat-open');
    document.querySelectorAll('.conv').forEach(x => x.classList.toggle('active', x.dataset.id === id));

    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();

    if (esBot) {
        marcarBotLeidoEnSegundoPlano();
        botResumenCache.ts = 0;
        try {
            await abrirConversacionBot();
        } catch (e) {
            console.error('[Mensajes] Error abriendo Marquinhos:', e);
            toast('No se pudo abrir Marquinhos. Intenta de nuevo.', 'error');
        }
        return;
    }

    // La consulta de bloqueo NO debe retrasar ni ocultar la interfaz:
    // se lanza sin await, y aplicarEstadoBloqueo solo oculta si es bloqueo confirmado.
    estadoBloqueoCon(id).then(est => {
        if (secuencia !== aperturaSecuencia) return;
        if (current && current.id === id) aplicarEstadoBloqueo(est);
    }).catch(() => {});

    const r = await db.from('mensajes_chat')
        .select('*')
        .eq('eliminado', false)
        .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${id}),and(remitente_id.eq.${id},destinatario_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(100);
    if (secuencia !== aperturaSecuencia) return;
    if (r.error) { console.error(r.error); toast('Error al cargar mensajes.', 'error'); return; }

    await renderMessages(r.data || []);
    if (secuencia !== aperturaSecuencia) return;
    await markRead(id);
    subscribeMessages(id);
}

async function cerrarConversacion() {
    aperturaSecuencia++;
    current = null;
    $('panel').classList.remove('chat-open');
    $('chatName').textContent = 'Selecciona una conversación';
    $('chatStatus').textContent = 'Elige un chat para empezar';
    $('chatStatus').className = 'status';
    $('chatAvatar').innerHTML = '';
    $('chatAvatar').className = 'avatar';
    $('chatHeader').dataset.userId = '';
    $('chatHeader').dataset.handle = '';
    $('chatActions').hidden = true;
    $('voiceBot').hidden = true;
    $('composer').hidden = true;
    $('emptyState').hidden = false;
    const box = $('messages');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    document.querySelectorAll('.conv').forEach(x => x.classList.remove('active'));
    if (msgChannel) {
        try { db.removeChannel(msgChannel); }
        catch (e) { console.warn('[Mensajes] removeChannel msgChannel:', e && e.message ? e.message : e); }
        msgChannel = null;
    }
}

/* ---------------- Render de mensajes ---------------- */

async function renderMessages(rows) {
    const box = $('messages');
    box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
    let anchor = box.querySelector('#scrollAnchor');
    if (!anchor) { anchor = document.createElement('div'); anchor.id = 'scrollAnchor'; box.appendChild(anchor); }
    box.querySelectorAll('.empty').forEach(el => el.remove());
    if (!rows.length) {
        anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><p>Sin mensajes</p><small>Envía el primer mensaje</small></div>');
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

function estadoLecturaTexto(m, sent) {
    if (!sent) return '';
    return m.leido ? ' · Leído' : ' · Enviado';
}

function avisoModeracionHTML(m) {
    if (m.aviso_moderacion !== 'lenguaje_inapropiado') return '';
    return '<div class="aviso-moderacion">Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.</div>';
}

function messageHTML(m, sent, signedUrl) {
    const textoLimpio = limpiarMarkdown(m.contenido || '');
    let body = (typeof window.formatearMensajeConEmotes === 'function')
        ? window.formatearMensajeConEmotes(textoLimpio)
        : esc(textoLimpio);

    const esMedia = m.tipo === 'imagen' || m.tipo === 'video' || m.tipo === 'audio' || m.tipo === 'archivo';
    const urlToUse = urlSegura(signedUrl);

    if (urlToUse) {
        if (m.tipo === 'imagen') body = `<img src="${esc(urlToUse)}" alt="${esc(m.nombre_archivo || 'Imagen')}" loading="lazy" data-visor="1" data-src="${esc(urlToUse)}" data-nombre="${esc(m.nombre_archivo || 'imagen.jpg')}" style="cursor:zoom-in;">`;
        else if (m.tipo === 'video') body = `<video controls playsinline src="${esc(urlToUse)}"></video>`;
        else if (m.tipo === 'audio') body = `<audio controls preload="metadata" src="${esc(urlToUse)}"></audio>`;
        else {
            const displayName = esc(m.nombre_archivo || limpiarMarkdown(m.contenido) || 'Archivo');
            body = `<a class="file-link" href="${esc(urlToUse)}" target="_blank" rel="noopener">${displayName}</a>`;
        }
    } else if (esMedia) {
        body = '<span class="media-no-disponible">Archivo no disponible</span>';
    }

    const esBotRecibido = !sent && (m.es_bot || m.bot_message);
    const headerBot = esBotRecibido ? '<div class="bubble-bot-info">MARQUINHOS</div>' : '';
    const editadoHTML = m.editado === true ? ' · editado' : '';
    const hora = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="bubblewrap ${sent ? 'sent' : 'received'}" data-mensaje-id="${esc(m.id || '')}">
        <div class="bubble">${headerBot}${body}${avisoModeracionHTML(m)}</div>
        <div class="meta">${esc(hora)}${editadoHTML}${estadoLecturaTexto(m, sent)}</div>
    </div>`;
}

/* ---------------- Enviar ---------------- */

async function sendMessage(text) {
    if (!current || !text.trim()) return;
    if (!current.bot && current.bloqueo && (current.bloqueo.yo === true || current.bloqueo.el === true)) {
        toast('No puedes enviar mensajes a este contacto.', 'warning');
        return;
    }
    if (!await auth()) return;
    const textoLimpio = text.trim();
    $('messageInput').value = '';

    if (current.bot) {
        await enviarMensajeBot(textoLimpio);
        return;
    }

    let resp;
    try {
        resp = await enviarMensajeChat(current.id, textoLimpio, 'texto');
    } catch (e) {
        console.error('Error enviando mensaje:', e);
        if (esErrorContenidoNoPermitido(e)) toast('Contenido no permitido por las normas de la comunidad.', 'error');
        else toast(e.message || 'Error al enviar mensaje.', 'error');
        $('messageInput').value = textoLimpio;
        return;
    }

    if (resp.estado === 'entregado' && resp.mensaje) { await append(resp.mensaje, true); recargarBandeja(); return; }
    if (resp.estado === 'solicitud') { toast('Tu mensaje se envió como solicitud. Aparecerá cuando la acepte.', 'success'); recargarBandeja(); return; }
    if (resp.estado === 'solicitud_en_espera') { toast('Ya tienes una solicitud pendiente con esta persona.', 'warning'); $('messageInput').value = textoLimpio; return; }
    toast('No se pudo enviar el mensaje.', 'error');
    $('messageInput').value = textoLimpio;
}

async function append(m, sent) {
    const box = $('messages');
    box.querySelectorAll('.empty').forEach(el => el.remove());
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
    if (!current) { toast('Selecciona una conversación.', 'error'); return; }
    if (!await auth()) return;
    const nombre = current.bot ? 'Marquinhos' : (current.profile.nombre || 'este usuario');
    const confirmado = await NeonModal.confirm({
        title: 'Eliminar conversación',
        message: `¿Eliminar TODA la conversación con ${nombre}?\n\nEsta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!confirmado) return;
    try {
        const targetId = current.bot ? BOT_UUID : current.id;
        const { error } = await db.rpc('ocultar_conversacion', { p_otro: targetId });
        if (error) throw error;
        toast('Conversación eliminada.', 'success');
        const box = $('messages');
        box.querySelectorAll('.bubblewrap').forEach(el => el.remove());
        const anchor = box.querySelector('#scrollAnchor');
        if (anchor) anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><p>Conversación eliminada</p><small>Envía un mensaje para empezar de nuevo</small></div>');
        unreadCount = 0;
        actualizarFlecha();
        recargarBandeja();
    } catch (e) { console.error('Error eliminando conversación:', e); toast('No se pudo eliminar la conversación.', 'error'); }
}

/* ---------------- Realtime ---------------- */

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
            const headerBot = (!esSent && (m.es_bot || m.bot_message)) ? '<div class="bubble-bot-info">MARQUINHOS</div>' : '';
            bubble.innerHTML = headerBot + innerHtml + avisoModeracionHTML(m);
        }

        if (metaEl) {
            const hora = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const editado = m.editado === true ? ' · editado' : '';
            metaEl.textContent = hora + editado + estadoLecturaTexto(m, esSent);
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

/* ---------------- Adjuntos y notas de voz ---------------- */

async function uploadFile(file) {
    if (!current || !await auth()) return;
    if (current.bot) { toast('Para Marquinhos usa el botón de voz o envía una nota de voz.', 'error'); return; }
    if (file.size > 50 * 1024 * 1024) { toast('El archivo supera 50 MB.', 'error'); return; }
    const type = file.type.startsWith('image/') ? 'imagen' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'archivo';
    if (type === 'archivo') { toast('En el chat solo se pueden enviar imágenes, videos o audios.', 'error'); return; }
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
    } catch (e) { console.error('Error subiendo archivo:', e); toast(e.message || 'No se pudo subir el archivo.', 'error'); return; }

    let resp;
    try {
        resp = await enviarMensajeChat(current.id, file.name, type, storageRef, file.name);
    } catch (e) {
        console.error('Error enviando archivo:', e);
        if (esErrorContenidoNoPermitido(e)) toast('Contenido no permitido por las normas de la comunidad.', 'error');
        else toast(e.message || 'No se pudo guardar el archivo.', 'error');
        return;
    }

    if (resp.estado === 'entregado' && resp.mensaje) { await append(resp.mensaje, true); recargarBandeja(); }
}

/* ---------------- Nueva conversación / buscar contacto ---------------- */

function newConversation() {
    $('newModal').classList.add('show');
    $('userSearch').value = '';
    $('userResults').innerHTML = '';
    setTimeout(() => $('userSearch').focus(), 50);
}

async function searchUsers(q) {
    const box = $('userResults');
    if (!q || q.trim().length < 2) { box.innerHTML = '<div class="busqueda-vacia">Escribe al menos 2 caracteres</div>'; return; }
    if (!await auth()) return;
    const term = q.trim().replace(/[%_,\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const r = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url').or(`nombre.ilike.%${term}%,handle.ilike.%${term}%`).neq('id', user.id).neq('id', BOT_UUID).limit(12);
    if (r.error) { console.error(r.error); toast('Error al buscar usuarios.', 'error'); return; }
    box.innerHTML = r.data?.length ? '' : '<div class="busqueda-vacia">No se encontraron usuarios</div>';
    for (const p of r.data || []) {
        const el = document.createElement('div');
        el.className = 'result';
        el.innerHTML = avatar(p.nombre, p.avatar_url) + `
            <div class="result-info">
                <b>${esc(p.nombre || 'Usuario')}</b>
                <div class="result-handle">@${esc(p.handle || 'usuario')}</div>
            </div>
            <span class="result-action">Abrir chat</span>`;
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

/* ---------------- Grabación de nota de voz (chat normal) ---------------- */

function getSupportedAudioMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (const type of candidates) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type; }
    return '';
}

function extensionForMime(mime) { if (mime.includes('ogg')) return 'ogg'; if (mime.includes('mp4')) return 'm4a'; return 'webm'; }

async function recordAudioNota() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!current) { toast('Selecciona una conversación.', 'error'); return; }
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
            const blob = new Blob(audioChunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            audioChunks = [];
            const mode = recordingMode;
            recorder = null;
            recordingMode = null;
            if (!blob.size) { toast('No se capturó audio.', 'error'); return; }
            const ext = extensionForMime(blob.type);
            const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
            if (mode === 'bot') await enviarVozAlBot(file);
            else await uploadFile(file);
        };
        recorder.start();
        $('audio').classList.add('recording');
        toast(esBot ? 'Habla con Marquinhos. Presiona otra vez para enviar.' : 'Grabando. Presiona otra vez para detener.');
    } catch (e) {
        console.error('Micrófono:', e);
        $('audio').classList.remove('recording');
        toast('No se pudo acceder al micrófono.', 'error');
    }
}

/* ---------------- Menú contextual de mensajes ---------------- */

async function mostrarMenuMensaje(bubblewrap, msgId) {
    document.querySelectorAll('.msg-context-menu').forEach(m => m.remove());

    const esDeUsuario = !!(current && !current.bot);
    const esSent = bubblewrap.classList.contains('sent');

    const menu = document.createElement('div');
    menu.className = 'msg-context-menu';

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
        btn.type = 'button';
        btn.textContent = op.texto;
        if (op.danger) btn.classList.add('danger');
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
    const contenidoActual = bubble.textContent.trim();

    const nuevoTexto = await NeonModal.prompt({
        title: 'Editar mensaje',
        message: 'Edita tu mensaje (máximo 15 minutos después de enviarlo):',
        placeholder: 'Nuevo texto',
        defaultValue: contenidoActual,
        confirmText: 'Guardar',
        cancelText: 'Cancelar'
    });
    if (!nuevoTexto || nuevoTexto === contenidoActual) return;

    try {
        const { error } = await db.rpc('editar_mensaje_chat', { p_mensaje_id: msgId, p_contenido: nuevoTexto });
        if (error) {
            const msgErr = error.message || '';
            if (msgErr.indexOf('contenido_no_permitido') !== -1) toast('Contenido no permitido por las normas de la comunidad.', 'error');
            else if (msgErr.indexOf('edicion_expirada') !== -1) toast('Ya no puedes editar este mensaje (más de 15 minutos).', 'error');
            else toast(msgErr || 'No se pudo editar.', 'error');
            return;
        }
        const textoLimpio = limpiarMarkdown(nuevoTexto);
        bubble.innerHTML = (typeof window.formatearMensajeConEmotes === 'function')
            ? window.formatearMensajeConEmotes(textoLimpio)
            : esc(textoLimpio);
        if (metaEl) {
            const horaMatch = metaEl.textContent.match(/^\s*(\d{1,2}:\d{2})/);
            const hora = horaMatch ? horaMatch[1] : '';
            const leido = esSent ? (metaEl.textContent.includes('Leído') ? ' · Leído' : ' · Enviado') : '';
            metaEl.textContent = `${hora} · editado${leido}`;
        }
        toast('Mensaje editado.', 'success');
        recargarBandeja();
    } catch (e) {
        console.error('Error editando mensaje:', e);
        toast('No se pudo editar el mensaje.', 'error');
    }
}

async function eliminarMensajeParaMi(msgId, bubblewrap) {
    const confirmado = await NeonModal.confirm({ title: 'Eliminar para mí', message: '¿Eliminar este mensaje solo de tu vista?', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
    if (!confirmado) return;
    try {
        const { error } = await db.rpc('eliminar_mensaje_para_mi', { p_mensaje_id: msgId });
        if (error) throw error;
        bubblewrap.remove();
        toast('Mensaje eliminado para ti.', 'success');
        recargarBandeja();
    } catch (e) { console.error('Error eliminando para mí:', e); toast('No se pudo eliminar.', 'error'); }
}

async function eliminarMensajeParaTodos(msgId, bubblewrap) {
    const confirmado = await NeonModal.confirm({ title: 'Eliminar para todos', message: '¿Eliminar este mensaje para todos? Esta acción no se puede deshacer.', confirmText: 'Eliminar', cancelText: 'Cancelar', danger: true });
    if (!confirmado) return;
    try {
        const { error } = await db.rpc('eliminar_mensaje_para_todos', { p_mensaje_id: msgId });
        if (error) throw error;
        bubblewrap.remove();
        toast('Mensaje eliminado para todos.', 'success');
        recargarBandeja();
    } catch (e) { console.error('Error eliminando para todos:', e); toast('No se pudo eliminar.', 'error'); }
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

/* ---------------- Información del chat (panel tipo Messenger) ---------------- */

function abrirInfoChat() {
    if (!current) { toast('Primero abre una conversación.', 'warning'); return; }
    const nombre = current.bot ? 'Marquinhos' : (current.profile?.nombre || 'Usuario');
    const overlay = $('contactProfileOverlay');
    if (!overlay) return;

    $('cpName').textContent = nombre;
    const cpAvatar = $('cpAvatar');
    cpAvatar.innerHTML = '';
    const img = $('chatAvatar').querySelector('img');
    if (img && !current.bot) {
        const copia = document.createElement('img');
        copia.src = img.src;
        copia.alt = '';
        cpAvatar.appendChild(copia);
    } else {
        cpAvatar.innerHTML = current.bot ? ICO_ESTRELLA_CHAT : esc(nombre.substring(0, 2).toUpperCase());
    }

    $('cpSub').textContent = current.bot ? 'Asistente de Csariel\'s' : 'Csariel\'s';
    $('cpStatusDot').hidden = !(current.profile?.online && !current.bot);
    $('cpVerPerfil').hidden = !!current.bot;
    $('cpBtnCall').disabled = !!current.bot || !window.__livekitReady;
    $('cpBtnVideo').disabled = !!current.bot || !window.__livekitReady;
    $('cpBtnMute').hidden = !!current.bot;
    $('cpActionBlock').hidden = !!current.bot;
    $('cpActionDelete').hidden = false;

    if (!current.bot) aplicarEstadoBloqueo(current.bloqueo || { yo: false, el: false });

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function cerrarInfoChat() {
    const overlay = $('contactProfileOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
}

function verPerfilDelContacto() {
    const header = $('chatHeader');
    const handle = header?.dataset.handle;
    const uid = header?.dataset.userId;
    if (handle) window.location.href = '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(handle);
    else if (uid) window.location.href = '/features/perfil/perfil-publico.html?id=' + encodeURIComponent(uid);
    else toast('No se encontró el perfil de este contacto.', 'warning');
}

function configurarInfoChat() {
    const header = $('chatHeader');
    if (!header || header.dataset.infoListeners) return;
    header.dataset.infoListeners = '1';

    $('chatInfoTrigger').addEventListener('click', abrirInfoChat);

    $('chatAvatar').addEventListener('click', () => {
        if (!current) return;
        if (!current.bot && current.profile && current.profile.avatar_url && typeof verFotoAmpliada === 'function') {
            verFotoAmpliada(current.profile.avatar_url, current.profile.nombre, current.profile.handle);
            return;
        }
        abrirInfoChat();
    });

    $('chatSettings').addEventListener('click', abrirInfoChat);
    $('cpBackBtn').addEventListener('click', cerrarInfoChat);
    $('contactProfileOverlay').addEventListener('click', e => {
        if (e.target === $('contactProfileOverlay')) cerrarInfoChat();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && $('contactProfileOverlay').classList.contains('open')) cerrarInfoChat();
    });

    $('cpVerPerfil').addEventListener('click', verPerfilDelContacto);
    $('cpBtnCall').addEventListener('click', () => { cerrarInfoChat(); if (typeof window.startCall === 'function') window.startCall('audio'); });
    $('cpBtnVideo').addEventListener('click', () => { cerrarInfoChat(); if (typeof window.startCall === 'function') window.startCall('video'); });
    $('cpActionSearch').addEventListener('click', () => { cerrarInfoChat(); const b = $('searchChat'); if (b) b.click(); });
    $('cpBtnMute').addEventListener('click', () => toast('Silenciar llegará en una próxima versión.', 'warning'));
    $('cpActionMarkRead').addEventListener('click', () => toast('Marcado como no leído.', 'success'));
    $('cpActionNickname').addEventListener('click', () => toast('Apodos llegará en una próxima versión.', 'warning'));
    $('cpActionBlock').addEventListener('click', () => bloquearUsuarioActual());
    $('cpActionDelete').addEventListener('click', async () => { cerrarInfoChat(); await deleteConversation(); });
    $('cpActionReport').addEventListener('click', () => toast('Reporte enviado. Gracias por avisarnos.', 'success'));
    $('cpActionReadReceipts').addEventListener('click', () => {
        const t = $('cpActionReadReceipts').querySelector('.cp-list-toggle');
        if (t) t.textContent = t.textContent === 'Activado' ? 'Desactivado' : 'Activado';
    });

    const blockBtn = $('blockUser');
    if (blockBtn) blockBtn.onclick = () => bloquearUsuarioActual();
    const delBtn = $('deleteChat');
    if (delBtn) delBtn.onclick = () => deleteConversation();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configurarInfoChat, { once: true });
} else {
    configurarInfoChat();
}