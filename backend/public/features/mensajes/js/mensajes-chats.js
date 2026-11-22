// ================================================================
// MENSAJES · CHATS v2.5 · MÓDULO 3 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-chats.js
//
// ACTUALIZACIÓN v2.5 · AJUSTES VISUALES DE NOTA DE VOZ
//  - Vista previa en una sola fila: deshacer, reproducir, texto y enviar.
//  - El texto "Nota de voz lista" y "Escucha antes de enviar" ya no se
//    parte en columnas angostas; se lee en una línea con elipsis.
//  - El botón X rojo de cancelar se reemplaza por una flecha de deshacer.
//  - Sin cambios en la lógica de grabación, ondas, reproductor ni envío.
//
// ACTUALIZACIÓN v2.4 · EXPERIENCIA DE NOTAS DE VOZ
//  - Ondas de audio animadas durante la grabación.
//  - Botón de deshacer para cancelar y descartar.
//  - Botón ✓ para detener y preparar la nota.
//  - Vista previa antes de enviar.
//  - Botón para reproducir y pausar la vista previa.
//  - Envío únicamente mediante confirmación expresa.
//  - Limpieza de micrófono y recursos temporales.
//  - Reproductor de audio con clase CSS propia y ancho adaptable.
//  - Compatibilidad con notas de voz para Marquinhos.
//  - Conserva Supabase, bucket chat-audio y flujo existente.
//
// Se conservan las funciones originales de conversaciones,
// mensajes, bloqueo, multimedia, realtime y menú contextual.
// ================================================================

'use strict';

const ICO_ESTRELLA_CHAT = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>';

let conversationFilter = '';
let aperturaSecuencia = 0;

// ================================================================
// NOTAS DE VOZ · ESTADO
// ================================================================

let vozStream = null;
let vozBlobPreparado = null;
let vozUrlPreview = null;
let vozMimeActual = '';
let vozDuracion = 0;
let vozIntervalo = null;
let vozAnimacion = null;
let vozAudioContext = null;
let vozAnalyzer = null;
let vozSource = null;
let vozMode = null;
let vozEstado = 'idle';
let vozCancelar = false;
let vozPreviewAudio = null;
let vozProcesando = false;

const VOZ_BARRAS = 36;
const VOZ_MAX_MB = 50;

let conversationFilterOriginal = '';

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

/* ---------------- Bloqueo ---------------- */

async function estadoBloqueoCon(id) {
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
        console.warn('[Mensajes] estadoBloqueoCon falló:', e);
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
    } catch (e) { }
}

async function openConversation(id) {
    const secuencia = ++aperturaSecuencia;

    if (vozEstado !== 'idle') cancelarNotaVoz(true);

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
    if (vozEstado !== 'idle') cancelarNotaVoz(true);
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
        catch (e) { console.warn('[Mensajes] removeChannel:', e); }
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
        else if (m.tipo === 'audio') body = `<div class="chat-audio-player"><audio controls preload="metadata" playsinline src="${esc(urlToUse)}"></audio></div>`;
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
        catch (e) { console.warn('[Mensajes] removeChannel:', e); }
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

/* ---------------- Adjuntos ---------------- */

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

/* ---------------- Nueva conversación ---------------- */

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

/* ================================================================
   NOTAS DE VOZ · INTERFAZ
   ================================================================ */

function vozCrearInterfaz() {
    let panel = document.getElementById('vozRecorderPanel');
    if (panel) return panel;

    const composer = $('composer');
    if (!composer) return null;

    panel = document.createElement('div');
    panel.id = 'vozRecorderPanel';
    panel.className = 'voz-recorder-panel';
    panel.hidden = true;

    panel.innerHTML = `
        <div class="voz-recorder-main">
            <button type="button" class="voz-action voz-cancel" id="vozCancelBtn" aria-label="Deshacer y descartar nota de voz" title="Deshacer">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
            </button>
            <div class="voz-center">
                <div class="voz-status-row">
                    <span class="voz-live-dot" id="vozLiveDot"></span>
                    <span class="voz-status-text" id="vozStatusText">Grabando nota de voz</span>
                    <span class="voz-timer" id="vozTimer">00:00</span>
                </div>
                <div class="voz-waveform" id="vozWaveform" aria-label="Visualización de audio"></div>
            </div>
            <button type="button" class="voz-action voz-accept" id="vozAcceptBtn" aria-label="Aceptar grabación" title="Detener y preparar">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>
            </button>
        </div>
        <div class="voz-preview-controls" id="vozPreviewControls" hidden>
            <button type="button" class="voz-preview-play" id="vozPreviewPlay" aria-label="Reproducir vista previa">
                <svg viewBox="0 0 24 24" class="voz-play-icon"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <div class="voz-preview-info">
                <div class="voz-preview-title">Nota de voz lista</div>
                <div class="voz-preview-subtitle" id="vozPreviewDuration">Escucha antes de enviar</div>
            </div>
            <button type="button" class="voz-send-btn" id="vozSendBtn">Enviar</button>
        </div>
        <div class="voz-recording-hint" id="vozHint">Tu audio no se enviará hasta que confirmes.</div>
    `;

    const input = $('messageInput');
    if (input && input.parentNode) {
        input.parentNode.insertBefore(panel, input);
    } else {
        composer.insertBefore(panel, composer.firstChild);
    }

    const waveform = panel.querySelector('#vozWaveform');
    for (let i = 0; i < VOZ_BARRAS; i++) {
        const bar = document.createElement('span');
        bar.className = 'voz-bar';
        bar.style.setProperty('--voz-index', i);
        bar.style.height = (5 + Math.round(Math.random() * 9)) + 'px';
        waveform.appendChild(bar);
    }

    panel.querySelector('#vozCancelBtn').addEventListener('click', () => cancelarNotaVoz(false));
    panel.querySelector('#vozAcceptBtn').addEventListener('click', () => detenerYPrepararNotaVoz());
    panel.querySelector('#vozSendBtn').addEventListener('click', () => enviarNotaVozPreparada());
    panel.querySelector('#vozPreviewPlay').addEventListener('click', () => alternarPreviewNotaVoz());

    return panel;
}

function vozMostrarPanel() {
    const panel = vozCrearInterfaz();
    if (!panel) return null;
    panel.hidden = false;
    panel.classList.add('voz-visible');
    return panel;
}

function vozOcultarPanel() {
    const panel = document.getElementById('vozRecorderPanel');
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('voz-visible', 'voz-preview-ready');
}

function vozActualizarTiempo() {
    const timer = document.getElementById('vozTimer');
    if (!timer) return;
    const segundos = Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000));
    timer.textContent = vozFormatoTiempo(segundos);
}

function vozFormatoTiempo(segundos) {
    const min = Math.floor(segundos / 60);
    const sec = segundos % 60;
    return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function vozActualizarOndas(data) {
    const panel = document.getElementById('vozRecorderPanel');
    if (!panel) return;
    const barras = panel.querySelectorAll('.voz-bar');
    if (!barras.length) return;

    for (let i = 0; i < barras.length; i++) {
        let valor = 0;
        if (data && data.length) {
            const indice = Math.floor(i * data.length / barras.length);
            valor = data[indice] / 255;
        } else {
            valor = Math.random() * 0.35;
        }
        const altura = Math.max(4, Math.round(4 + valor * 31));
        barras[i].style.height = altura + 'px';
        barras[i].classList.toggle('voz-bar-active', valor > 0.13);
    }
}

function vozDetenerAnimacion() {
    if (vozAnimacion) {
        cancelAnimationFrame(vozAnimacion);
        vozAnimacion = null;
    }
    if (vozIntervalo) {
        clearInterval(vozIntervalo);
        vozIntervalo = null;
    }
    if (vozAudioContext) {
        try { vozAudioContext.close(); } catch (e) { }
        vozAudioContext = null;
        vozAnalyzer = null;
        vozSource = null;
    }
}

function vozIniciarAnimacion(stream) {
    vozDetenerAnimacion();

    const panel = vozMostrarPanel();
    if (!panel) return;

    const barras = panel.querySelectorAll('.voz-bar');
    barras.forEach(bar => {
        bar.style.height = '5px';
        bar.classList.remove('voz-bar-active');
    });

    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            vozAudioContext = new AudioContextClass();
            vozAnalyzer = vozAudioContext.createAnalyser();
            vozAnalyzer.fftSize = 128;
            vozAnalyzer.smoothingTimeConstant = 0.72;
            vozSource = vozAudioContext.createMediaStreamSource(stream);
            vozSource.connect(vozAnalyzer);
            const data = new Uint8Array(vozAnalyzer.frequencyBinCount);

            const dibujar = () => {
                if (vozEstado !== 'recording' || !vozAnalyzer) return;
                vozAnalyzer.getByteFrequencyData(data);
                vozActualizarOndas(data);
                vozAnimacion = requestAnimationFrame(dibujar);
            };
            dibujar();
        }
    } catch (e) {
        console.warn('[Mensajes] Analizador de audio no disponible:', e);
    }

    if (!vozAnimacion) {
        vozIntervalo = setInterval(() => {
            if (vozEstado !== 'recording') return;
            vozActualizarOndas(null);
        }, 90);
    }
}

function vozLiberarMicrofono() {
    if (vozStream) {
        vozStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) { }
        });
        vozStream = null;
    }
    const audioBtn = $('audio');
    if (audioBtn) audioBtn.classList.remove('recording');
}

function vozLimpiarPreview() {
    if (vozPreviewAudio) {
        try {
            vozPreviewAudio.pause();
            vozPreviewAudio.src = '';
        } catch (e) { }
        vozPreviewAudio = null;
    }
    if (vozUrlPreview) {
        try { URL.revokeObjectURL(vozUrlPreview); } catch (e) { }
        vozUrlPreview = null;
    }
    vozBlobPreparado = null;
    vozDuracion = 0;
}

function vozRestablecerInterfaz() {
    vozDetenerAnimacion();
    vozLiberarMicrofono();

    const panel = document.getElementById('vozRecorderPanel');
    if (panel) {
        panel.classList.remove('voz-preview-ready');
        panel.querySelector('#vozPreviewControls').hidden = true;
        panel.querySelector('#vozWaveform').hidden = false;
        panel.querySelector('#vozHint').textContent = 'Tu audio no se enviará hasta que confirmes.';
        panel.querySelector('#vozStatusText').textContent = 'Grabando nota de voz';
        panel.querySelector('#vozLiveDot').hidden = false;
        panel.querySelector('#vozAcceptBtn').hidden = false;
        panel.querySelector('#vozCancelBtn').hidden = false;
    }

    vozEstado = 'idle';
    vozMode = null;
    vozProcesando = false;
    vozCancelar = false;

    const audioBtn = $('audio');
    if (audioBtn) {
        audioBtn.classList.remove('recording');
        audioBtn.disabled = false;
    }
}

function vozReiniciarPanel() {
    const panel = vozCrearInterfaz();
    if (!panel) return;
    panel.querySelector('#vozPreviewControls').hidden = true;
    panel.querySelector('#vozWaveform').hidden = false;
    panel.querySelector('#vozAcceptBtn').hidden = false;
    panel.querySelector('#vozCancelBtn').hidden = false;
    panel.querySelector('#vozLiveDot').hidden = false;
    panel.querySelector('#vozStatusText').textContent = 'Grabando nota de voz';
    panel.querySelector('#vozHint').textContent = 'Tu audio no se enviará hasta que confirmes.';
    panel.querySelector('#vozTimer').textContent = '00:00';
    panel.querySelector('#vozPreviewDuration').textContent = 'Escucha antes de enviar';
    panel.querySelector('#vozPreviewPlay').innerHTML = '<svg viewBox="0 0 24 24" class="voz-play-icon"><path d="M8 5v14l11-7z"/></svg>';
    panel.querySelectorAll('.voz-bar').forEach(bar => {
        bar.style.height = '5px';
        bar.classList.remove('voz-bar-active');
    });
}

function getSupportedAudioMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (const type of candidates) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function extensionForMime(mime) {
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'm4a';
    return 'webm';
}

/* ---------------- Iniciar grabación ---------------- */

async function recordAudioNota() {
    if (vozEstado === 'recording') {
        detenerYPrepararNotaVoz();
        return;
    }

    if (vozEstado === 'ready') {
        toast('Ya tienes una nota preparada. Envíala o cancélala.', 'warning');
        return;
    }

    if (vozProcesando) return;

    if (!current) {
        toast('Selecciona una conversación.', 'error');
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        toast('Tu navegador no permite grabar notas de voz.', 'error');
        return;
    }

    if (!await auth()) return;

    const esBot = current.bot;

    try {
        vozReiniciarPanel();

        vozStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        if (!current || current.bot !== esBot) {
            vozLiberarMicrofono();
            return;
        }

        audioChunks = [];
        vozCancelar = false;
        vozMode = esBot ? 'bot' : 'normal';
        vozEstado = 'recording';
        recordingStartedAt = Date.now();

        const mimeType = getSupportedAudioMime();
        vozMimeActual = mimeType || 'audio/webm';

        recorder = mimeType
            ? new MediaRecorder(vozStream, { mimeType: mimeType })
            : new MediaRecorder(vozStream);

        recorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };

        recorder.onerror = function(e) {
            console.error('[Mensajes] Error grabando:', e);
            cancelarNotaVoz(false);
            toast('Ocurrió un error durante la grabación.', 'error');
        };

        recorder.onstop = function() {
            vozProcesarGrabacion();
        };

        recorder.start(250);

        vozMostrarPanel();
        vozIniciarAnimacion(vozStream);

        const audioBtn = $('audio');
        if (audioBtn) audioBtn.classList.add('recording');

        vozIntervalo = setInterval(vozActualizarTiempo, 250);

    } catch (e) {
        console.error('Micrófono:', e);
        vozRestablecerInterfaz();
        vozOcultarPanel();
        toast('No se pudo acceder al micrófono. Revisa los permisos.', 'error');
    }
}

/* ---------------- Detener y preparar ---------------- */

function detenerYPrepararNotaVoz() {
    if (vozEstado !== 'recording' || !recorder) return;

    vozEstado = 'processing';
    vozDetenerAnimacion();

    const panel = document.getElementById('vozRecorderPanel');
    if (panel) {
        panel.querySelector('#vozStatusText').textContent = 'Preparando nota de voz...';
        panel.querySelector('#vozLiveDot').hidden = true;
        panel.querySelector('#vozAcceptBtn').disabled = true;
    }

    try {
        if (recorder.state !== 'inactive') recorder.stop();
        else vozProcesarGrabacion();
    } catch (e) {
        console.error('[Mensajes] No se pudo detener la grabación:', e);
        cancelarNotaVoz(false);
        toast('No se pudo preparar la nota de voz.', 'error');
    }
}

function vozProcesarGrabacion() {
    vozLiberarMicrofono();
    vozDetenerAnimacion();

    const mime = recorder && recorder.mimeType
        ? recorder.mimeType
        : (vozMimeActual || 'audio/webm');

    const blob = new Blob(audioChunks || [], { type: mime });
    audioChunks = [];
    recorder = null;

    if (vozCancelar) {
        vozRestablecerInterfaz();
        vozOcultarPanel();
        vozLimpiarPreview();
        return;
    }

    if (!blob.size) {
        vozRestablecerInterfaz();
        vozOcultarPanel();
        toast('No se capturó audio.', 'error');
        return;
    }

    if (blob.size > VOZ_MAX_MB * 1024 * 1024) {
        vozRestablecerInterfaz();
        vozOcultarPanel();
        toast('La nota supera el límite de 50 MB.', 'error');
        return;
    }

    vozBlobPreparado = blob;
    vozUrlPreview = URL.createObjectURL(blob);
    vozEstado = 'ready';

    vozMostrarPreview();
}

/* ---------------- Vista previa ---------------- */

function vozMostrarPreview() {
    const panel = vozMostrarPanel();
    if (!panel) return;

    panel.classList.add('voz-preview-ready');

    panel.querySelector('#vozWaveform').hidden = true;
    panel.querySelector('#vozAcceptBtn').hidden = true;
    panel.querySelector('#vozLiveDot').hidden = true;

    panel.querySelector('#vozStatusText').textContent = 'Nota de voz preparada';
    panel.querySelector('#vozHint').textContent = 'Escucha tu nota. Puedes enviarla o descartarla.';
    panel.querySelector('#vozPreviewControls').hidden = false;

    vozPreviewAudio = new Audio(vozUrlPreview);
    vozPreviewAudio.preload = 'metadata';

    vozPreviewAudio.addEventListener('loadedmetadata', function() {
        if (isFinite(vozPreviewAudio.duration)) {
            vozDuracion = vozPreviewAudio.duration;
            panel.querySelector('#vozPreviewDuration').textContent =
                'Duración · ' + vozFormatoTiempo(Math.floor(vozDuracion));
        }
    });

    vozPreviewAudio.addEventListener('ended', function() {
        panel.querySelector('#vozPreviewPlay').innerHTML =
            '<svg viewBox="0 0 24 24" class="voz-play-icon"><path d="M8 5v14l11-7z"/></svg>';
    });

    panel.querySelector('#vozPreviewPlay').innerHTML =
        '<svg viewBox="0 0 24 24" class="voz-play-icon"><path d="M8 5v14l11-7z"/></svg>';

    panel.querySelector('#vozCancelBtn').disabled = false;
    panel.querySelector('#vozCancelBtn').hidden = false;

    const send = panel.querySelector('#vozSendBtn');
    send.disabled = false;
    send.textContent = 'Enviar';

    const audioBtn = $('audio');
    if (audioBtn) audioBtn.classList.remove('recording');
}

function alternarPreviewNotaVoz() {
    if (!vozPreviewAudio || vozEstado !== 'ready') return;

    const panel = document.getElementById('vozRecorderPanel');
    const btn = panel.querySelector('#vozPreviewPlay');

    if (vozPreviewAudio.paused) {
        if (vozPreviewAudio.ended) vozPreviewAudio.currentTime = 0;

        vozPreviewAudio.play().then(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" class="voz-play-icon"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>';
        }).catch(e => {
            console.warn('[Mensajes] No se pudo reproducir preview:', e);
            toast('No se pudo reproducir la vista previa.', 'error');
        });
    } else {
        vozPreviewAudio.pause();
        btn.innerHTML = '<svg viewBox="0 0 24 24" class="voz-play-icon"><path d="M8 5v14l11-7z"/></svg>';
    }
}

/* ---------------- Cancelar y descartar ---------------- */

function cancelarNotaVoz(silencioso) {
    if (vozEstado === 'idle' && !vozBlobPreparado && !recorder) return;

    vozCancelar = true;
    vozEstado = 'cancelled';

    vozDetenerAnimacion();
    vozLiberarMicrofono();

    if (recorder) {
        try {
            recorder.onstop = function() {
                audioChunks = [];
                recorder = null;
            };
            if (recorder.state !== 'inactive') recorder.stop();
            else recorder = null;
        } catch (e) {
            recorder = null;
        }
    }

    audioChunks = [];
    vozLimpiarPreview();
    vozRestablecerInterfaz();
    vozOcultarPanel();

    if (!silencioso) toast('Nota de voz descartada.', 'success');
}

/* ---------------- Enviar nota confirmada ---------------- */

async function enviarNotaVozPreparada() {
    if (vozEstado !== 'ready' || !vozBlobPreparado || vozProcesando) return;

    if (!current) {
        cancelarNotaVoz(true);
        toast('La conversación ya no está disponible.', 'warning');
        return;
    }

    if (!current.bot && current.bloqueo && (current.bloqueo.yo === true || current.bloqueo.el === true)) {
        toast('No puedes enviar mensajes a este contacto.', 'warning');
        return;
    }

    if (!await auth()) return;

    vozProcesando = true;

    const panel = document.getElementById('vozRecorderPanel');
    const sendBtn = panel ? panel.querySelector('#vozSendBtn') : null;

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';
    }

    const blob = vozBlobPreparado;
    const mode = vozMode;
    const ext = extensionForMime(blob.type);
    const file = new File([blob], `audio-${Date.now()}.${ext}`, {
        type: blob.type || 'audio/webm'
    });

    try {
        if (mode === 'bot') {
            vozLimpiarPreview();
            vozRestablecerInterfaz();
            vozOcultarPanel();
            await enviarVozAlBot(file);
            return;
        }

        if (file.size > VOZ_MAX_MB * 1024 * 1024) {
            throw new Error('La nota supera el límite de 50 MB.');
        }

        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${user.id}/mensajes/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;

        const up = await db.storage.from('chat-audio').upload(path, file, {
            contentType: file.type || 'application/octet-stream',
            cacheControl: '3600',
            upsert: false
        });

        if (up.error) throw up.error;

        const storageRef = `bucket://chat-audio/${path}`;

        const resp = await enviarMensajeChat(
            current.id,
            file.name,
            'audio',
            storageRef,
            file.name
        );

        if (resp.estado === 'entregado' && resp.mensaje) {
            vozLimpiarPreview();
            vozRestablecerInterfaz();
            vozOcultarPanel();
            await append(resp.mensaje, true);
            recargarBandeja();
            toast('Nota de voz enviada.', 'success');
            return;
        }

        if (resp.estado === 'solicitud') {
            vozLimpiarPreview();
            vozRestablecerInterfaz();
            vozOcultarPanel();
            toast('Tu nota se envió como solicitud.', 'success');
            recargarBandeja();
            return;
        }

        if (resp.estado === 'solicitud_en_espera') {
            throw new Error('Ya tienes una solicitud pendiente con esta persona.');
        }

        throw new Error('No se pudo enviar la nota de voz.');

    } catch (e) {
        console.error('[Mensajes] Error enviando nota:', e);

        if (esErrorContenidoNoPermitido(e)) {
            toast('Contenido no permitido por las normas de la comunidad.', 'error');
        } else {
            toast(e.message || 'No se pudo enviar la nota de voz.', 'error');
        }

        vozProcesando = false;

        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Reintentar';
        }
    }
}

/* ---------------- Compatibilidad ---------------- */

async function iniciarNotaVoz() {
    return recordAudioNota();
}

/* ---------------- Menú contextual ---------------- */

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
        const close = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        };
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
    const confirmado = await NeonModal.confirm({
        title: 'Eliminar para mí',
        message: '¿Eliminar este mensaje solo de tu vista?',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!confirmado) return;
    try {
        const { error } = await db.rpc('eliminar_mensaje_para_mi', { p_mensaje_id: msgId });
        if (error) throw error;
        bubblewrap.remove();
        toast('Mensaje eliminado para ti.', 'success');
        recargarBandeja();
    } catch (e) {
        console.error('Error eliminando para mí:', e);
        toast('No se pudo eliminar.', 'error');
    }
}

async function eliminarMensajeParaTodos(msgId, bubblewrap) {
    const confirmado = await NeonModal.confirm({
        title: 'Eliminar para todos',
        message: '¿Eliminar este mensaje para todos? Esta acción no se puede deshacer.',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!confirmado) return;
    try {
        const { error } = await db.rpc('eliminar_mensaje_para_todos', { p_mensaje_id: msgId });
        if (error) throw error;
        bubblewrap.remove();
        toast('Mensaje eliminado para todos.', 'success');
        recargarBandeja();
    } catch (e) {
        console.error('Error eliminando para todos:', e);
        toast('No se pudo eliminar.', 'error');
    }
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
        startX = e.clientX;
        startY = e.clientY;
        pressTimer = setTimeout(() => {
            pressTimer = null;
            const msgId = bubblewrap.dataset.mensajeId;
            if (msgId) mostrarMenuMensaje(bubblewrap, msgId);
        }, 500);
    });

    box.addEventListener('pointerup', () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    });
    box.addEventListener('pointercancel', () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    });
    box.addEventListener('pointermove', e => {
        if (!pressTimer) return;
        if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
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

/* ---------------- Información del chat ---------------- */

function abrirInfoChat() {
    if (!current) {
        toast('Primero abre una conversación.', 'warning');
        return;
    }
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
    $('cpBtnCall').addEventListener('click', () => {
        cerrarInfoChat();
        if (typeof window.startCall === 'function') window.startCall('audio');
    });
    $('cpBtnVideo').addEventListener('click', () => {
        cerrarInfoChat();
        if (typeof window.startCall === 'function') window.startCall('video');
    });
    $('cpActionSearch').addEventListener('click', () => {
        cerrarInfoChat();
        const b = $('searchChat');
        if (b) b.click();
    });
    $('cpBtnMute').addEventListener('click', () => toast('Silenciar llegará en una próxima versión.', 'warning'));
    $('cpActionMarkRead').addEventListener('click', () => toast('Marcado como no leído.', 'success'));
    $('cpActionNickname').addEventListener('click', () => toast('Apodos llegará en una próxima versión.', 'warning'));
    $('cpActionBlock').addEventListener('click', () => bloquearUsuarioActual());
    $('cpActionDelete').addEventListener('click', async () => {
        cerrarInfoChat();
        await deleteConversation();
    });
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

// ================================================================
// CSS AUTÓNOMO · NOTAS DE VOZ Y REPRODUCTOR
// Se inyecta desde este módulo para no depender de editar otro
// archivo. Las reglas son específicas y no alteran otros módulos.
// ================================================================

(function instalarEstilosNotaVoz() {
    if (document.getElementById('cs-voz-styles')) return;

    const style = document.createElement('style');
    style.id = 'cs-voz-styles';

    style.textContent = `
        #vozRecorderPanel {
            width: 100%;
            box-sizing: border-box;
            background: #080d12;
            color: #f3f5f6;
            border-top: 1px solid rgba(255,255,255,.09);
            padding: 10px 12px 8px;
            margin: 0;
            font-family: inherit;
        }

        #vozRecorderPanel[hidden] {
            display: none !important;
        }

        #vozRecorderPanel .voz-recorder-main {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            min-height: 54px;
        }

        #vozRecorderPanel .voz-action {
            width: 38px;
            height: 38px;
            min-width: 38px;
            border: 0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            padding: 0;
            background: transparent;
            color: #fff;
            transition: background .18s ease, opacity .18s ease;
        }

        #vozRecorderPanel .voz-action:active {
            transform: scale(.94);
        }

        #vozRecorderPanel .voz-action svg {
            width: 23px;
            height: 23px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        #vozRecorderPanel .voz-cancel {
            color: #ff626b;
            background: rgba(255,98,107,.09);
        }

        #vozRecorderPanel .voz-accept {
            color: #0b0d0f;
            background: #d4af37;
        }

        #vozRecorderPanel .voz-accept:disabled,
        #vozRecorderPanel .voz-action:disabled {
            opacity: .4;
            cursor: wait;
        }

        #vozRecorderPanel .voz-center {
            flex: 1;
            min-width: 0;
        }

        #vozRecorderPanel .voz-status-row {
            display: flex;
            align-items: center;
            gap: 7px;
            min-width: 0;
            margin-bottom: 7px;
        }

        #vozRecorderPanel .voz-live-dot {
            width: 7px;
            height: 7px;
            flex: 0 0 7px;
            border-radius: 50%;
            background: #ff4c58;
            box-shadow: 0 0 9px rgba(255,76,88,.7);
            animation: csVozPulse 1s infinite;
        }

        #vozRecorderPanel .voz-status-text {
            font-size: 12px;
            font-weight: 600;
            color: #e9ecef;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        #vozRecorderPanel .voz-timer {
            margin-left: auto;
            font-size: 12px;
            font-variant-numeric: tabular-nums;
            color: #d4af37;
        }

        #vozRecorderPanel .voz-waveform {
            display: flex;
            width: 100%;
            height: 36px;
            align-items: center;
            justify-content: space-between;
            gap: 2px;
            overflow: hidden;
        }

        #vozRecorderPanel .voz-bar {
            display: block;
            flex: 1 1 0;
            min-width: 2px;
            max-width: 5px;
            height: 5px;
            background: #d4af37;
            opacity: .65;
            transition: height 65ms linear, opacity 65ms linear;
        }

        #vozRecorderPanel .voz-bar:nth-child(3n) {
            background: #00d9c5;
        }

        #vozRecorderPanel .voz-bar:nth-child(4n) {
            background: #5a9cff;
        }

        #vozRecorderPanel .voz-bar:nth-child(5n) {
            background: #c47aff;
        }

        #vozRecorderPanel .voz-bar-active {
            opacity: 1;
        }

        #vozRecorderPanel .voz-recording-hint {
            margin: 4px 0 0 50px;
            font-size: 10px;
            color: #7f8b96;
            line-height: 1.4;
        }

        #vozRecorderPanel .voz-preview-controls {
            display: flex;
            align-items: center;
            gap: 11px;
            min-height: 48px;
            width: 100%;
        }

        #vozRecorderPanel .voz-preview-controls[hidden] {
            display: none !important;
        }

        #vozRecorderPanel .voz-preview-play {
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            border: 1px solid rgba(212,175,55,.5);
            border-radius: 50%;
            color: #d4af37;
            background: rgba(212,175,55,.08);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        #vozRecorderPanel .voz-preview-play svg {
            width: 22px;
            height: 22px;
            fill: currentColor;
        }

        #vozRecorderPanel .voz-preview-info {
            flex: 1;
            min-width: 0;
        }

        #vozRecorderPanel .voz-preview-title {
            font-size: 12px;
            font-weight: 600;
            color: #f2f3f4;
        }

        #vozRecorderPanel .voz-preview-subtitle {
            margin-top: 3px;
            font-size: 11px;
            color: #98a2ac;
        }

        #vozRecorderPanel .voz-send-btn {
            border: 0;
            padding: 9px 17px;
            min-height: 36px;
            background: #d4af37;
            color: #10140e;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            border-radius: 3px;
        }

        #vozRecorderPanel .voz-send-btn:disabled {
            opacity: .55;
            cursor: wait;
        }

        #vozRecorderPanel.voz-preview-ready .voz-recorder-main {
            min-height: 42px;
        }

        #vozRecorderPanel.voz-preview-ready .voz-center {
            display: none;
        }

        #vozRecorderPanel.voz-preview-ready .voz-recorder-main {
            gap: 8px;
        }

        #vozRecorderPanel.voz-preview-ready .voz-cancel {
            margin-right: 2px;
        }

        @keyframes csVozPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: .4; transform: scale(.78); }
        }

        .chat-audio-player {
            display: block;
            width: min(100%, 340px);
            min-width: min(260px, 100%);
            max-width: 100%;
            box-sizing: border-box;
            padding: 3px 0;
        }

        .chat-audio-player audio {
            display: block;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: 42px;
            min-height: 42px;
            border-radius: 4px;
            object-fit: contain;
        }

        .bubble:has(.chat-audio-player) {
            width: min(360px, 78vw);
            min-width: min(280px, 72vw);
            max-width: min(420px, 82vw);
            box-sizing: border-box;
        }

        .bubblewrap .chat-audio-player audio::-webkit-media-controls-panel {
            background-color: #e5e7eb;
        }

        @media (max-width: 480px) {
            #vozRecorderPanel {
                padding: 9px 8px 7px;
            }

            #vozRecorderPanel .voz-recorder-main {
                gap: 7px;
            }

            #vozRecorderPanel .voz-action {
                width: 35px;
                height: 35px;
                min-width: 35px;
            }

            #vozRecorderPanel .voz-waveform {
                gap: 1px;
            }

            .chat-audio-player {
                width: min(100%, 320px);
                min-width: min(245px, 100%);
            }

            .bubble:has(.chat-audio-player) {
                width: min(340px, 82vw);
                min-width: min(260px, 76vw);
                max-width: 86vw;
            }
        }

        /* ============================================================
           AJUSTES VISUALES v2.5 · VISTA PREVIA Y BOTÓN DESHACER
           ============================================================ */

        #vozRecorderPanel {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px 10px;
            background: transparent;
            border-top: 0;
            padding: 6px 4px 4px;
        }

        #vozRecorderPanel:not(.voz-preview-ready) .voz-recorder-main {
            flex: 1 1 100%;
        }

        #vozRecorderPanel .voz-cancel {
            width: 34px;
            height: 34px;
            min-width: 34px;
            color: #c9d1d9;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.08);
        }

        #vozRecorderPanel .voz-cancel:hover {
            color: #ffffff;
            background: rgba(255,255,255,.12);
        }

        #vozRecorderPanel .voz-cancel svg {
            width: 19px;
            height: 19px;
            stroke-width: 1.8;
        }

        #vozRecorderPanel.voz-preview-ready .voz-recorder-main {
            display: contents;
        }

        #vozRecorderPanel.voz-preview-ready .voz-center,
        #vozRecorderPanel.voz-preview-ready .voz-accept {
            display: none !important;
        }

        #vozRecorderPanel .voz-preview-controls {
            flex: 1 1 0;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 44px;
        }

        #vozRecorderPanel .voz-preview-play {
            flex: 0 0 36px;
            width: 36px;
            height: 36px;
        }

        #vozRecorderPanel .voz-preview-info {
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
        }

        #vozRecorderPanel .voz-preview-title,
        #vozRecorderPanel .voz-preview-subtitle {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        #vozRecorderPanel .voz-preview-title {
            font-size: 13px;
            line-height: 1.25;
        }

        #vozRecorderPanel .voz-preview-subtitle {
            margin-top: 2px;
            font-size: 11px;
        }

        #vozRecorderPanel .voz-send-btn {
            flex: 0 0 auto;
            min-width: 92px;
            white-space: nowrap;
            text-align: center;
            padding: 9px 16px;
        }

        #vozRecorderPanel .voz-recording-hint {
            flex: 1 1 100%;
            margin: 0 0 0 44px;
        }

        #vozRecorderPanel.voz-preview-ready .voz-recording-hint {
            margin: 0 0 0 44px;
        }

        @media (max-width: 480px) {
            #vozRecorderPanel .voz-preview-title {
                font-size: 12px;
            }

            #vozRecorderPanel .voz-send-btn {
                min-width: 84px;
                padding: 8px 12px;
            }

            #vozRecorderPanel .voz-recording-hint {
                margin-left: 42px;
            }
        }
    `;

    document.head.appendChild(style);
})();

// Inicializa el panel sin modificar el HTML original.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        vozCrearInterfaz();
    }, { once: true });
} else {
    vozCrearInterfaz();
}