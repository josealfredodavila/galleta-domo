// ================================================================
// MENSAJES · CONVERSACIONES
// ================================================================
async function loadConversations() {
    var list = $('conversationList');
    if (!list) return;
    list.innerHTML = '';

    var botEl = document.createElement('div');
    botEl.className = 'conv conv-bot' + (current && current.id === BOT_ID ? ' active' : '');
    botEl.dataset.id = BOT_ID;
    botEl.dataset.name = 'marquinhos';
    botEl.innerHTML = '<div class="avatar avatar-bot">✦</div><div class="convinfo"><div class="convname">Marquinhos</div><div class="convmsg" id="botLastMsg">Tu asistente personal ✦</div></div><div class="convtime" id="botBadge" style="color:var(--success);font-size:.55rem">IA</div>';
    botEl.onclick = function() { openConversation(BOT_ID); };
    list.appendChild(botEl);

    if (!await auth()) return;

    try {
        var lastBotResult = await db.from('mensajes_chat').select('contenido,tipo,created_at').eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (lastBotResult.data) {
            var preview = $('botLastMsg');
            if (preview) preview.textContent = lastBotResult.data.tipo === 'texto' ? (lastBotResult.data.contenido || '').slice(0, 60) : ('📎 ' + (lastBotResult.data.contenido || lastBotResult.data.tipo));
        }
        var countResult = await db.from('mensajes_chat').select('id', { count: 'exact', head: true })
            .eq('remitente_id', BOT_UUID).eq('destinatario_id', user.id).eq('leido', false).eq('eliminado', false);
        var badge = $('botBadge');
        if (badge && countResult.count && countResult.count > 0) {
            badge.innerHTML = '<span style="background:var(--danger);color:#fff;font-size:.6rem;font-weight:800;padding:2px 8px;border-radius:99px;min-width:20px;text-align:center;display:inline-block;animation:pulse-badge 1.5s infinite;">' + (countResult.count > 9 ? '9+' : countResult.count) + '</span>';
        }
    } catch (e) { console.warn('Error cargando badge bot:', e); }

    try {
        var dataResult = await db.from('contactos').select('contacto_id,created_at,fecha,estado').eq('usuario_id', user.id).neq('estado', 'bloqueado').order('created_at', { ascending: false });
        if (dataResult.error) { console.error('Error cargando contactos:', dataResult.error); return; }
        if (!dataResult.data || !dataResult.data.length) return;

        for (var i = 0; i < dataResult.data.length; i++) {
            var c = dataResult.data[i];
            if (c.contacto_id === BOT_UUID) continue;
            var p = await profile(c.contacto_id);
            var lastResult = await db.from('mensajes_chat').select('contenido,tipo,created_at,leido,remitente_id').eq('eliminado', false)
                .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + c.contacto_id + '),and(remitente_id.eq.' + c.contacto_id + ',destinatario_id.eq.' + user.id + ')')
                .order('created_at', { ascending: false }).limit(1).maybeSingle();
            var last = lastResult.data;
            var el = document.createElement('div');
            el.className = 'conv' + (current && current.id === c.contacto_id ? ' active' : '');
            el.dataset.id = c.contacto_id;
            el.dataset.name = ((p.nombre || '') + ' ' + (p.handle || '')).toLowerCase();
            el.innerHTML = avatar(p.nombre, p.avatar_url) + '<div class="convinfo"><div class="convname">' + esc(p.nombre || 'Usuario') + '</div><div class="convmsg">' + esc(last && last.contenido || 'Sin mensajes') + '</div></div><div class="convtime">' + (last && last.created_at ? new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + '</div>';
            el.onclick = (function(id) { return function() { openConversation(id); }; })(c.contacto_id);
            list.appendChild(el);
        }
        aplicarFiltroConversaciones();
    } catch (e) { console.error('Error en loadConversations:', e); }
}

function aplicarFiltroConversaciones() {
    var q = conversationFilter.trim().toLowerCase();
    document.querySelectorAll('.conv').forEach(function(el) {
        if (!q || (el.dataset.name && el.dataset.name.indexOf(q) !== -1) || (el.querySelector('.convname') && el.querySelector('.convname').textContent.toLowerCase().indexOf(q) !== -1)) el.style.display = 'flex';
        else el.style.display = 'none';
    });
}

async function openConversation(id) {
    if (!await auth()) return;
    var p = await profile(id);
    var esBot = (id === BOT_ID);
    current = { id: id, profile: p, bot: esBot };
    var chatName = $('chatName'); if (chatName) chatName.textContent = p.nombre || 'Usuario';
    var chatAvatar = $('chatAvatar');
    if (chatAvatar) {
        chatAvatar.innerHTML = esBot ? '✦' : (p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="">' : esc((p.nombre || '◈').charAt(0).toUpperCase()));
        chatAvatar.className = 'avatar' + (esBot ? ' avatar-bot' : '');
        chatAvatar.onclick = function() { if (esBot) { toast('ℹ️ Marquinhos es un asistente IA', 'warning'); return; } verFotoAmpliada(p.avatar_url, p.nombre, p.handle); };
    }
    var chatStatus = $('chatStatus');
    if (chatStatus) { chatStatus.textContent = esBot ? '✦ IA · Siempre disponible' : (p.online ? '◉ En línea' : '◈ Desconectado'); chatStatus.className = 'status' + (p.online ? ' online' : ''); }
    var voiceBotBtn = $('voiceBot'); if (voiceBotBtn) voiceBotBtn.style.display = esBot ? 'inline-flex' : 'none';
    var chatActions = $('chatActions'); if (chatActions) chatActions.style.display = 'flex';
    var composer = $('composer'); if (composer) composer.style.display = 'flex';
    var emptyState = $('emptyState'); if (emptyState) emptyState.style.display = 'none';
    var panel = $('panel'); if (panel) panel.classList.add('chat-open');
    document.querySelectorAll('.conv').forEach(function(x) { x.classList.toggle('active', x.dataset.id === id); });
    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();
    if (esBot) {
        try { await db.from('mensajes_chat').update({ leido: true }).eq('remitente_id', BOT_UUID).eq('destinatario_id', user.id).eq('leido', false); } catch (e) {}
        var badge = $('botBadge'); if (badge) { badge.textContent = 'IA'; badge.style.color = 'var(--success)'; }
        await abrirConversacionBot();
        return;
    }
    try {
        var r = await db.from('mensajes_chat').select('*').eq('eliminado', false).or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + id + '),and(remitente_id.eq.' + id + ',destinatario_id.eq.' + user.id + ')').order('created_at', { ascending: true }).limit(100);
        if (r.error) { console.error(r.error); toast('❌ Error al cargar mensajes', 'error'); return; }
        await renderMessages(r.data || []);
        await markRead(id);
        subscribeMessages(id);
    } catch (e) { console.error('Error abriendo chat:', e); }
}

async function cerrarConversacion() {
    current = null;
    var panel = $('panel'); if (panel) panel.classList.remove('chat-open');
    var chatName = $('chatName'); if (chatName) chatName.textContent = 'Selecciona una conversación';
    var chatStatus = $('chatStatus'); if (chatStatus) chatStatus.textContent = '◈ En espera';
    var chatAvatar = $('chatAvatar'); if (chatAvatar) { chatAvatar.innerHTML = '◈'; chatAvatar.className = 'avatar'; chatAvatar.onclick = null; }
    var chatActions = $('chatActions'); if (chatActions) chatActions.style.display = 'none';
    var composer = $('composer'); if (composer) composer.style.display = 'none';
    var emptyState = $('emptyState'); if (emptyState) emptyState.style.display = 'block';
    var box = $('messages'); if (box) box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.conv').forEach(function(x) { x.classList.remove('active'); });
}

async function deleteConversation() {
    if (!current) { toast('⚠️ Selecciona una conversación', 'error'); return; }
    if (!await auth()) return;
    var nombre = current.bot ? 'Marquinhos' : (current.profile.nombre || 'este usuario');
    if (!confirm('⚠️ ¿Estás seguro de que quieres eliminar TODA la conversación con ' + nombre + '?\n\nEsta acción no se puede deshacer.')) return;
    try {
        var targetId = current.bot ? BOT_UUID : current.id;
        var errorResult = await db.from('mensajes_chat').update({ eliminado: true }).or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + targetId + '),and(remitente_id.eq.' + targetId + ',destinatario_id.eq.' + user.id + ')');
        if (errorResult.error) throw errorResult.error;
        toast('✅ Conversación eliminada correctamente', 'success');
        var box = $('messages');
        if (box) {
            box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
            var anchor = box.querySelector('#scrollAnchor');
            if (anchor) anchor.insertAdjacentHTML('beforebegin', '<div class="empty"><strong>◈</strong><div>Conversación eliminada</div><small>Envía un mensaje para empezar de nuevo</small></div>');
        }
        unreadCount = 0;
        actualizarFlecha();
        await loadConversations();
    } catch (e) { console.error('Error eliminando conversación:', e); toast('❌ No se pudo eliminar la conversación', 'error'); }
}

function newConversation() {
    var modal = $('newModal'); if (modal) modal.classList.add('show');
    var searchEl = $('userSearch'); if (searchEl) searchEl.value = '';
    var resultsEl = $('userResults'); if (resultsEl) resultsEl.innerHTML = '';
    setTimeout(function() { if (searchEl) searchEl.focus(); }, 50);
}

async function searchUsers(q) {
    var box = $('userResults');
    if (!box) return;
    if (!q || q.trim().length < 2) { box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">Escribe al menos 2 caracteres</div>'; return; }
    if (!await auth()) return;
    var term = q.trim().replace(/[%_,\\]/g, ' ').replace(/\s+/g, ' ').trim();
    try {
        var r = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url').or('nombre.ilike.%' + term + '%,handle.ilike.%' + term + '%').neq('id', user.id).neq('id', BOT_UUID).limit(12);
        if (r.error) { console.error(r.error); toast('❌ Error al buscar usuarios', 'error'); return; }
        box.innerHTML = '';
        if (!r.data || r.data.length === 0) { box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">No se encontraron usuarios</div>'; return; }
        for (var i = 0; i < r.data.length; i++) {
            var p = r.data[i];
            var el = document.createElement('div');
            el.className = 'result';
            el.innerHTML = avatar(p.nombre, p.avatar_url) + '<div style="flex:1"><b>' + esc(p.nombre || 'Usuario') + '</b><div style="font-size:.68rem;color:var(--muted)">@' + esc(p.handle || 'usuario') + '</div></div><span style="color:var(--gold);font-size:.7rem">Iniciar ›</span>';
            el.onclick = (function(id) { return function() { createConversation(id); }; })(p.id);
            box.appendChild(el);
        }
    } catch (e) { console.error('Error buscando usuarios:', e); }
}

async function createConversation(id) {
    if (!await auth()) return;
    try {
        var r = await db.from('contactos').select('id').eq('usuario_id', user.id).eq('contacto_id', id).maybeSingle();
        if (r.error) { toast('❌ Error comprobando contacto', 'error'); return; }
        if (!r.data) {
            var ins = await db.from('contactos').insert({ usuario_id: user.id, contacto_id: id, estado: 'activo' });
            if (ins.error) { console.error(ins.error); toast('❌ No se pudo crear la conversación', 'error'); return; }
        }
        var modal = $('newModal'); if (modal) modal.classList.remove('show');
        await loadConversations();
        await openConversation(id);
    } catch (e) { console.error('Error al crear conversación:', e); toast('❌ Error inesperado', 'error'); }
}
console.log('[Mensajes] ✅ Conversaciones cargado');