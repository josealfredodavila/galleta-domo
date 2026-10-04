// ================================================================
// MENSAJES · CONVERSACIONES (v2.1 — Fixes de producción)
// ================================================================
// Lista de conversaciones, filtro, apertura, cierre.
// Compatible con mensajes-chat.js v3.3 (visto solo al contestar).
// Depende de: config, utils, auth.
//
// FIXES v2.1:
// - deleteConversation: limpieza total de estado local con
//   limpiarEstadoConversacion() + reset de `current`
// - openConversation: normaliza ID del bot (BOT_ID ↔ BOT_UUID)
// - loadConversations: detecta bot activo por AMBOS IDs
// - Marca leído del bot al abrir conversación del bot
// ================================================================

// ================================================================
// HELPERS DE NORMALIZACIÓN DEL BOT
// ================================================================
function _esIdDelBotConv(id) {
    if (!id) return false;
    var s = String(id);
    return s === BOT_ID || s === BOT_UUID;
}

function _normalizarBotIdConv(id) {
    if (!id) return BOT_UUID;
    var s = String(id);
    if (s === BOT_ID || s === 'bot-marquinhos' || s === 'marquinhos') {
        return BOT_UUID;
    }
    return s;
}

// ================================================================
// CARGAR LISTA DE CONVERSACIONES
// ================================================================
async function loadConversations() {
    var list = $('conversationList');
    if (!list) return;
    list.innerHTML = '';

    // ---- Bot Marquinhos SIEMPRE primero ----
    // ✅ FIX: detectar bot activo por CUALQUIERA de sus dos IDs
    var botActivo = current && _esIdDelBotConv(current.id);

    var botEl = document.createElement('div');
    botEl.className = 'conv conv-bot' + (botActivo ? ' active' : '');
    botEl.dataset.id = BOT_ID;
    botEl.dataset.name = 'marquinhos';
    botEl.innerHTML =
        '<div class="avatar avatar-bot">✦</div>' +
        '<div class="convinfo">' +
            '<div class="convname">Marquinhos</div>' +
            '<div class="convmsg" id="botLastMsg">Tu asistente personal ✦</div>' +
        '</div>' +
        '<div class="convtime" id="botBadge" style="color:var(--success);font-size:.55rem">IA</div>';
    botEl.onclick = function() { openConversation(BOT_ID); };
    list.appendChild(botEl);

    // ---- Requiere sesión para el resto ----
    if (!user) return;

    // ---- Preview del último mensaje del bot ----
    try {
        var rBot = await db
            .from('mensajes_chat')
            .select('contenido,tipo,created_at')
            .eq('eliminado', false)
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + BOT_UUID + '),and(remitente_id.eq.' + BOT_UUID + ',destinatario_id.eq.' + user.id + ')')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (rBot.data) {
            var preview = $('botLastMsg');
            if (preview) {
                preview.textContent = rBot.data.tipo === 'texto'
                    ? (rBot.data.contenido || '').slice(0, 60)
                    : ('📎 ' + (rBot.data.contenido || rBot.data.tipo));
            }
        }

        // Badge de no leídos del bot
        var rCount = await db
            .from('mensajes_chat')
            .select('id', { count: 'exact', head: true })
            .eq('remitente_id', BOT_UUID)
            .eq('destinatario_id', user.id)
            .eq('leido', false)
            .eq('eliminado', false);

        var badge = $('botBadge');
        if (badge && rCount.count && rCount.count > 0) {
            var n = rCount.count > 9 ? '9+' : rCount.count;
            badge.innerHTML = '<span style="background:var(--danger);color:#fff;font-size:.6rem;font-weight:800;padding:2px 8px;border-radius:99px;min-width:20px;text-align:center;display:inline-block;animation:pulse-badge 1.5s infinite;">' + n + '</span>';
        }
    } catch (e) {
        console.warn('[Mensajes] Error cargando badge bot:', e);
    }

    // ---- Lista de contactos ----
    try {
        var rContactos = await db
            .from('contactos')
            .select('contacto_id,created_at,fecha,estado')
            .eq('usuario_id', user.id)
            .neq('estado', 'bloqueado')
            .order('created_at', { ascending: false });

        if (rContactos.error) {
            console.error('[Mensajes] Error cargando contactos:', rContactos.error);
            return;
        }

        if (!rContactos.data || !rContactos.data.length) return;

        for (var i = 0; i < rContactos.data.length; i++) {
            var c = rContactos.data[i];
            // ✅ FIX: excluir al bot por UUID
            if (c.contacto_id === BOT_UUID) continue;

            var p = await profile(c.contacto_id);

            var rLast = await db
                .from('mensajes_chat')
                .select('contenido,tipo,created_at,leido,remitente_id,nombre_archivo')
                .eq('eliminado', false)
                .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + c.contacto_id + '),and(remitente_id.eq.' + c.contacto_id + ',destinatario_id.eq.' + user.id + ')')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            var last = rLast.data;

            var el = document.createElement('div');
            el.className = 'conv' + (current && current.id === c.contacto_id ? ' active' : '');
            el.dataset.id = c.contacto_id;
            el.dataset.name = ((p.nombre || '') + ' ' + (p.handle || '')).toLowerCase();

            var preview = 'Sin mensajes';
            if (last) {
                if (last.tipo === 'texto') preview = (last.contenido || '').slice(0, 60);
                else if (last.tipo === 'imagen') preview = '📷 Foto';
                else if (last.tipo === 'video') preview = '🎬 Video';
                else if (last.tipo === 'audio') preview = '🎙️ Audio';
                else preview = '📎 ' + (last.nombre_archivo || 'Archivo');
            }

            var hora = last && last.created_at
                ? new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

            el.innerHTML = avatar(p.nombre, p.avatar_url) +
                '<div class="convinfo">' +
                    '<div class="convname">' + esc(p.nombre || 'Usuario') + '</div>' +
                    '<div class="convmsg">' + esc(preview) + '</div>' +
                '</div>' +
                '<div class="convtime">' + esc(hora) + '</div>';

            el.onclick = (function(cid) {
                return function() { openConversation(cid); };
            })(c.contacto_id);

            list.appendChild(el);
        }

        aplicarFiltroConversaciones();
    } catch (e) {
        console.error('[Mensajes] Error en loadConversations:', e);
    }
}

// ================================================================
// FILTRO DEL BUSCADOR
// ================================================================
function aplicarFiltroConversaciones() {
    var q = (conversationFilter || '').trim().toLowerCase();
    var convs = document.querySelectorAll('.conv');

    convs.forEach(function(el) {
        var name = (el.dataset.name || '').toLowerCase();
        var convname = el.querySelector('.convname');
        var visible = !q
            || name.indexOf(q) !== -1
            || (convname && convname.textContent.toLowerCase().indexOf(q) !== -1);

        el.style.display = visible ? 'flex' : 'none';
    });
}

// ================================================================
// ABRIR CONVERSACIÓN
// ================================================================
async function openConversation(id) {
    if (!await auth()) return;

    // ✅ FIX: normalizar ID del bot para que `current.bot` siempre sea true
    var esBot = _esIdDelBotConv(id);
    var idNormalizado = esBot ? BOT_UUID : id;

    var p;
    if (esBot) {
        // Perfil ficticio del bot (no consultar BD de perfiles)
        p = {
            id: BOT_UUID,
            nombre: 'Marquinhos',
            handle: 'marquinhos',
            avatar_url: null,
            online: true,
            bot: true
        };
    } else {
        p = await profile(idNormalizado);
    }

    current = { id: idNormalizado, profile: p, bot: esBot };

    // ---- Header del chat ----
    var chatName = $('chatName');
    if (chatName) chatName.textContent = p.nombre || 'Usuario';

    var chatAvatar = $('chatAvatar');
    if (chatAvatar) {
        chatAvatar.innerHTML = esBot ? '✦' : (p.avatar_url
            ? '<img src="' + esc(p.avatar_url) + '" alt="">'
            : esc((p.nombre || '◈').charAt(0).toUpperCase()));
        chatAvatar.className = 'avatar' + (esBot ? ' avatar-bot' : '');
    }

    var chatStatus = $('chatStatus');
    if (chatStatus) {
        chatStatus.textContent = esBot
            ? '✦ IA · Siempre disponible'
            : (p.online ? '◉ En línea' : '◈ Desconectado');
        chatStatus.className = 'status' + (p.online ? ' online' : '');
    }

    // Click en avatar para ver foto ampliada
    if (chatAvatar) {
        chatAvatar.onclick = function() {
            if (esBot) {
                toast('ℹ️ Marquinhos es un asistente IA', 'warning');
                return;
            }
            verFotoAmpliada(p.avatar_url, p.nombre, p.handle);
        };
    }

    // ---- UI del chat ----
    var voiceBot = $('voiceBot');
    if (voiceBot) voiceBot.style.display = esBot ? 'inline-flex' : 'none';

    var chatActions = $('chatActions');
    if (chatActions) chatActions.style.display = 'flex';

    var composer = $('composer');
    if (composer) composer.style.display = 'flex';

    var emptyState = $('emptyState');
    if (emptyState) emptyState.style.display = 'none';

    var panel = $('panel');
    if (panel) panel.classList.add('chat-open');

    // Activar el item en la lista (por dataset.id que usa BOT_ID en el botón del bot)
    document.querySelectorAll('.conv').forEach(function(x) {
        var match = false;
        if (esBot) {
            match = _esIdDelBotConv(x.dataset.id);
        } else {
            match = x.dataset.id === idNormalizado;
        }
        x.classList.toggle('active', match);
    });

    isUserAtBottom = true;
    unreadCount = 0;
    actualizarFlecha();

    // ---- Si es el bot, abrir conversación del bot ----
    if (esBot) {
        try {
            await db.from('mensajes_chat')
                .update({ leido: true })
                .eq('remitente_id', BOT_UUID)
                .eq('destinatario_id', user.id)
                .eq('leido', false);
        } catch (e) {
            console.warn('[Mensajes] No se pudo marcar leído del bot:', e);
        }

        var badge = $('botBadge');
        if (badge) {
            badge.textContent = 'IA';
            badge.style.color = 'var(--success)';
        }

        await abrirConversacionBot();
        return;
    }

    // ---- Chat normal: cargar mensajes ----
    // ✅ Regla v3: "visto SOLO cuando contestas" → NO marcar leído al abrir.
    var r = await db
        .from('mensajes_chat')
        .select('*')
        .eq('eliminado', false)
        .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + idNormalizado + '),and(remitente_id.eq.' + idNormalizado + ',destinatario_id.eq.' + user.id + ')')
        .order('created_at', { ascending: true })
        .limit(100);

    if (r.error) {
        console.error(r.error);
        toast('❌ Error al cargar mensajes', 'error');
        return;
    }

    await renderMessages(r.data || []);
    subscribeMessages(idNormalizado);
}

// ================================================================
// CERRAR CONVERSACIÓN (volver a la lista)
// ================================================================
async function cerrarConversacion() {
    current = null;

    var panel = $('panel');
    if (panel) panel.classList.remove('chat-open');

    var chatName = $('chatName');
    if (chatName) chatName.textContent = 'Selecciona una conversación';

    var chatStatus = $('chatStatus');
    if (chatStatus) chatStatus.textContent = '◈ En espera';

    var chatAvatar = $('chatAvatar');
    if (chatAvatar) {
        chatAvatar.innerHTML = '◈';
        chatAvatar.className = 'avatar';
        chatAvatar.onclick = null;
    }

    var chatActions = $('chatActions');
    if (chatActions) chatActions.style.display = 'none';

    var composer = $('composer');
    if (composer) composer.style.display = 'none';

    var emptyState = $('emptyState');
    if (emptyState) emptyState.style.display = 'block';

    // Limpiar DOM del chat
    if (typeof limpiarEstadoConversacion === 'function') {
        try {
            await limpiarEstadoConversacion();
        } catch (e) {
            console.warn('[Mensajes] Error limpiando estado:', e);
        }
    } else {
        var box = $('messages');
        if (box) {
            box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
        }
    }

    document.querySelectorAll('.conv').forEach(function(x) {
        x.classList.remove('active');
    });
}

// ================================================================
// NUEVA CONVERSACIÓN (modal de búsqueda de usuarios)
// ================================================================
function newConversation() {
    var m = $('newModal');
    if (m) m.classList.add('show');

    var input = $('userSearch');
    if (input) {
        input.value = '';
        setTimeout(function() { input.focus(); }, 50);
    }

    var results = $('userResults');
    if (results) results.innerHTML = '';
}

function cerrarModalNuevaConversacion() {
    var m = $('newModal');
    if (m) m.classList.remove('show');
}

// ================================================================
// BUSCAR USUARIOS PARA NUEVA CONVERSACIÓN
// ================================================================
async function searchUsers(q) {
    var box = $('userResults');
    if (!box) return;

    if (!q || q.trim().length < 2) {
        box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">Escribe al menos 2 caracteres</div>';
        return;
    }

    if (!await auth()) return;

    var term = q.trim().replace(/[%_,\\]/g, ' ').replace(/\s+/g, ' ').trim();

    var r = await db
        .from('perfiles_publicos')
        .select('id,nombre,handle,avatar_url')
        .or('nombre.ilike.%' + term + '%,handle.ilike.%' + term + '%')
        .neq('id', user.id)
        .neq('id', BOT_UUID)
        .limit(12);

    if (r.error) {
        console.error(r.error);
        toast('❌ Error al buscar usuarios', 'error');
        return;
    }

    if (!r.data || !r.data.length) {
        box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">No se encontraron usuarios</div>';
        return;
    }

    box.innerHTML = '';

    for (var i = 0; i < r.data.length; i++) {
        var p = r.data[i];
        var el = document.createElement('div');
        el.className = 'result';
        el.innerHTML = avatar(p.nombre, p.avatar_url) +
            '<div style="flex:1">' +
                '<b>' + esc(p.nombre || 'Usuario') + '</b>' +
                '<div style="font-size:.68rem;color:var(--muted)">@' + esc(p.handle || 'usuario') + '</div>' +
            '</div>' +
            '<span style="color:var(--gold);font-size:.7rem">Iniciar ›</span>';

        el.onclick = (function(pid) {
            return function() { createConversation(pid); };
        })(p.id);

        box.appendChild(el);
    }
}

// ================================================================
// CREAR CONVERSACIÓN CON UN USUARIO
// ================================================================
async function createConversation(id) {
    if (!await auth()) return;

    var r = await db
        .from('contactos')
        .select('id')
        .eq('usuario_id', user.id)
        .eq('contacto_id', id)
        .maybeSingle();

    if (r.error) {
        toast('❌ Error comprobando contacto', 'error');
        return;
    }

    if (!r.data) {
        var ins = await db
            .from('contactos')
            .insert({ usuario_id: user.id, contacto_id: id, estado: 'activo' });

        if (ins.error) {
            console.error(ins.error);
            toast('❌ No se pudo crear la conversación', 'error');
            return;
        }
    }

    cerrarModalNuevaConversacion();
    await loadConversations();
    await openConversation(id);
}

// ================================================================
// ✅ ELIMINAR CONVERSACIÓN (con limpieza TOTAL de estado local)
// ================================================================
async function deleteConversation() {
    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }

    if (!await auth()) return;

    var nombre = current.bot ? 'Marquinhos' : (current.profile.nombre || 'este usuario');
    var confirmar = confirm('⚠️ ¿Estás seguro de que quieres eliminar TODA la conversación con ' + nombre + '?\n\nEsta acción no se puede deshacer.');
    if (!confirmar) return;

    try {
        // ✅ Normalizar ID del bot por si acaso
        var targetId = current.bot ? BOT_UUID : _normalizarBotIdConv(current.id);

        var r = await db
            .from('mensajes_chat')
            .update({ eliminado: true })
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + targetId + '),and(remitente_id.eq.' + targetId + ',destinatario_id.eq.' + user.id + ')');

        if (r.error) throw r.error;

        toast('✅ Conversación eliminada correctamente', 'success');

        // ✅ FIX CRÍTICO: limpieza total del estado local
        if (typeof limpiarEstadoConversacion === 'function') {
            try {
                await limpiarEstadoConversacion();
            } catch (e) {
                console.warn('[Mensajes] Error en limpiarEstadoConversacion:', e);
            }
        } else {
            // Fallback: limpieza manual
            var box = $('messages');
            if (box) {
                box.querySelectorAll('.bubblewrap').forEach(function(el) { el.remove(); });
                box.querySelectorAll('.empty').forEach(function(el) { el.remove(); });
                var anchor = box.querySelector('#scrollAnchor');
                if (anchor) {
                    anchor.insertAdjacentHTML('beforebegin',
                        '<div class="empty" id="emptyState">' +
                            '<strong>◈</strong>' +
                            '<div>Conversación eliminada</div>' +
                            '<small>Envía un mensaje para empezar de nuevo</small>' +
                        '</div>');
                }
            }
        }

        // ✅ FIX: resetear `current` para que `append()` deje de operar en esta sesión
        current = null;

        // ✅ Resetear contadores UI
        unreadCount = 0;
        isUserAtBottom = true;
        actualizarFlecha();

        // ✅ Refrescar lista de conversaciones (sin el chat eliminado)
        await loadConversations();
    } catch (e) {
        console.error('[Mensajes] Error eliminando conversación:', e);
        toast('❌ No se pudo eliminar la conversación', 'error');
    }
}

// ================================================================
// ✅ EXPOSICIÓN GLOBAL A WINDOW
// ================================================================
window.loadConversations = loadConversations;
window.aplicarFiltroConversaciones = aplicarFiltroConversaciones;
window.openConversation = openConversation;
window.cerrarConversacion = cerrarConversacion;
window.newConversation = newConversation;
window.cerrarModalNuevaConversacion = cerrarModalNuevaConversacion;
window.searchUsers = searchUsers;
window.createConversation = createConversation;
window.deleteConversation = deleteConversation;
window._esIdDelBotConv = _esIdDelBotConv;
window._normalizarBotIdConv = _normalizarBotIdConv;

console.log('[Mensajes] ✅ Conversaciones v2.1 cargado (con fixes de producción)');