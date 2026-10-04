
// ================================================================
// MENSAJES · CONVERSACIONES (v2.2 — Renderizado garantizado)
// ================================================================
// Lista de conversaciones, filtro, apertura, cierre.
// Compatible con mensajes-chat.js v3.4
//
// FIXES v2.2:
// - loadConversations: consultas por lotes, sin consultas por contacto
// - Perfiles y últimos mensajes agrupados mediante mapas
// - openConversation: protección contra aperturas simultáneas
// - current se establece con placeholder antes de profile()
// - Verificación de token después de cada await
// - Logs de diagnóstico
// ================================================================

var _openConvToken = 0;

// ================================================================
// HELPERS DEL BOT
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

    if (!user) return;

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

        // --------------------------------------------------------
        // IDS ÚNICOS DE CONTACTOS, EXCLUYENDO AL BOT
        // --------------------------------------------------------
        var idsDeContactos = [];
        var idsVistos = Object.create(null);

        rContactos.data.forEach(function(c) {
            if (!c.contacto_id || c.contacto_id === BOT_UUID) return;

            var cid = String(c.contacto_id);
            if (idsVistos[cid]) return;

            idsVistos[cid] = true;
            idsDeContactos.push(cid);
        });

        if (!idsDeContactos.length) {
            aplicarFiltroConversaciones();
            return;
        }

        // --------------------------------------------------------
        // CONSULTAS EN LOTE
        // Una consulta de perfiles y dos consultas de mensajes.
        // --------------------------------------------------------
        var idsStr = idsDeContactos.join(',');

        var resultados = await Promise.all([
            db
                .from('perfiles_publicos')
                .select('id,nombre,handle,avatar_url')
                .in('id', idsDeContactos),

            db
                .from('mensajes_chat')
                .select('contenido,tipo,created_at,leido,remitente_id,destinatario_id,nombre_archivo')
                .eq('eliminado', false)
                .eq('remitente_id', user.id)
                .in('destinatario_id', idsDeContactos)
                .order('created_at', { ascending: false }),

            db
                .from('mensajes_chat')
                .select('contenido,tipo,created_at,leido,remitente_id,destinatario_id,nombre_archivo')
                .eq('eliminado', false)
                .eq('destinatario_id', user.id)
                .in('remitente_id', idsDeContactos)
                .order('created_at', { ascending: false })
        ]);

        var rPerfiles = resultados[0];
        var rEnviados = resultados[1];
        var rRecibidos = resultados[2];

        if (rPerfiles.error) {
            console.error('[Mensajes] Error cargando perfiles en lote:', rPerfiles.error);
        }

        if (rEnviados.error) {
            console.error('[Mensajes] Error cargando mensajes enviados:', rEnviados.error);
        }

        if (rRecibidos.error) {
            console.error('[Mensajes] Error cargando mensajes recibidos:', rRecibidos.error);
        }

        // --------------------------------------------------------
        // MAPA DE PERFILES POR ID
        // --------------------------------------------------------
        var perfilesPorId = Object.create(null);

        (rPerfiles.data || []).forEach(function(p) {
            perfilesPorId[String(p.id)] = p;
        });

        // --------------------------------------------------------
        // MAPA DEL ÚLTIMO MENSAJE POR CONTACTO
        // --------------------------------------------------------
        var ultimoMensajePorContacto = Object.create(null);

        function registrarUltimoMensaje(m) {
            var contactoId = String(
                m.remitente_id === user.id
                    ? m.destinatario_id
                    : m.remitente_id
            );

            var anterior = ultimoMensajePorContacto[contactoId];

            if (
                !anterior ||
                new Date(m.created_at).getTime() >
                new Date(anterior.created_at).getTime()
            ) {
                ultimoMensajePorContacto[contactoId] = m;
            }
        }

        (rEnviados.data || []).forEach(registrarUltimoMensaje);
        (rRecibidos.data || []).forEach(registrarUltimoMensaje);

        // --------------------------------------------------------
        // CONSTRUIR ELEMENTOS DOM DESDE LOS MAPAS
        // --------------------------------------------------------
        for (var i = 0; i < idsDeContactos.length; i++) {
            var contactoId = idsDeContactos[i];

            var p = perfilesPorId[contactoId] || {
                id: contactoId,
                nombre: 'Usuario',
                handle: '',
                avatar_url: null
            };

            var last = ultimoMensajePorContacto[contactoId];

            var el = document.createElement('div');
            el.className = 'conv' +
                (current && String(current.id) === contactoId ? ' active' : '');

            el.dataset.id = contactoId;
            el.dataset.name = (
                (p.nombre || '') + ' ' + (p.handle || '')
            ).toLowerCase();

            var preview = 'Sin mensajes';

            if (last) {
                if (last.tipo === 'texto') {
                    preview = (last.contenido || '').slice(0, 60);
                } else if (last.tipo === 'imagen') {
                    preview = '📷 Foto';
                } else if (last.tipo === 'video') {
                    preview = '🎬 Video';
                } else if (last.tipo === 'audio') {
                    preview = '🎙️ Audio';
                } else {
                    preview = '📎 ' + (last.nombre_archivo || 'Archivo');
                }
            }

            var hora = last && last.created_at
                ? new Date(last.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : '';

            el.innerHTML = avatar(p.nombre, p.avatar_url) +
                '<div class="convinfo">' +
                    '<div class="convname">' + esc(p.nombre || 'Usuario') + '</div>' +
                    '<div class="convmsg">' + esc(preview) + '</div>' +
                '</div>' +
                '<div class="convtime">' + esc(hora) + '</div>';

            el.onclick = (function(cid) {
                return function() {
                    openConversation(cid);
                };
            })(contactoId);

            list.appendChild(el);
        }

        aplicarFiltroConversaciones();

    } catch (e) {
        console.error('[Mensajes] Error en loadConversations:', e);
    }
}

// ================================================================
// FILTRO
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
    var miToken = ++_openConvToken;

    if (!await auth()) return;
    if (miToken !== _openConvToken) return;

    console.log('[Conv] Abriendo conversación:', id);

    var esBot = _esIdDelBotConv(id);
    var idNormalizado = esBot ? BOT_UUID : id;

    // ------------------------------------------------------------
    // PLACEHOLDER INMEDIATO: evita conservar current anterior
    // mientras se obtiene el perfil.
    // ------------------------------------------------------------
    current = {
        id: idNormalizado,
        profile: {
            id: idNormalizado,
            nombre: esBot ? 'Marquinhos' : 'Cargando…',
            handle: '',
            avatar_url: null,
            online: false,
            bot: esBot
        },
        bot: esBot
    };

    var p;

    if (esBot) {
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
        if (miToken !== _openConvToken) return;
    }

    current = {
        id: idNormalizado,
        profile: p,
        bot: esBot
    };

    console.log('[Conv] current seteado:', current);

    // Header
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

    if (chatAvatar) {
        chatAvatar.onclick = function() {
            if (esBot) {
                toast('ℹ️ Marquinhos es un asistente IA', 'warning');
                return;
            }

            verFotoAmpliada(p.avatar_url, p.nombre, p.handle);
        };
    }

    // UI
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

    // ============================================================
    // BOT: delegar TODO el renderizado a abrirConversacionBot()
    // (definida en mensajes-chat.js v3.4)
    // ============================================================
    if (esBot) {
        try {
            await db.from('mensajes_chat')
                .update({ leido: true })
                .eq('remitente_id', BOT_UUID)
                .eq('destinatario_id', user.id)
                .eq('leido', false);

            if (miToken !== _openConvToken) return;

        } catch (e) {
            if (miToken !== _openConvToken) return;
            console.warn('[Conv] No se pudo marcar leído del bot:', e);
        }

        if (miToken !== _openConvToken) return;

        var badge = $('botBadge');
        if (badge) {
            badge.textContent = 'IA';
            badge.style.color = 'var(--success)';
        }

        // Llamar a la versión autoritativa (v3.4)
        try {
            await abrirConversacionBot();

            if (miToken !== _openConvToken) return;

            console.log('[Conv] ✅ Chat del bot abierto y renderizado');

        } catch (e) {
            if (miToken !== _openConvToken) return;

            console.error('[Conv] ❌ Error renderizando chat del bot:', e);
            toast('❌ No se pudo cargar el chat de Marquinhos', 'error');
        }

        return;
    }

    // ============================================================
    // CHAT NORMAL
    // ============================================================
    var r = await db
        .from('mensajes_chat')
        .select('*')
        .eq('eliminado', false)
        .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + idNormalizado + '),and(remitente_id.eq.' + idNormalizado + ',destinatario_id.eq.' + user.id + ')')
        .order('created_at', { ascending: true })
        .limit(100);

    if (miToken !== _openConvToken) return;

    if (r.error) {
        console.error(r.error);
        toast('❌ Error al cargar mensajes', 'error');
        return;
    }

    await renderMessages(r.data || []);
    if (miToken !== _openConvToken) return;

    subscribeMessages(idNormalizado);
}

// ================================================================
// CERRAR CONVERSACIÓN
// ================================================================
async function cerrarConversacion() {
    // Invalidar cualquier apertura que siga pendiente.
    _openConvToken++;

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

    // Mostrar empty state
    if (typeof _mostrarEmptyState === 'function') {
        _mostrarEmptyState(
            'Selecciona una conversación',
            'Elige un chat, canal o grupo para empezar'
        );
    } else {
        var emptyState = $('emptyState');
        if (emptyState) emptyState.style.display = 'block';
    }

    // Limpiar mensajes
    if (typeof limpiarEstadoConversacion === 'function') {
        try {
            await limpiarEstadoConversacion();
        } catch (e) {}
    } else {
        var box = $('messages');
        if (box) {
            box.querySelectorAll('.bubblewrap').forEach(function(el) {
                el.remove();
            });
        }
    }

    document.querySelectorAll('.conv').forEach(function(x) {
        x.classList.remove('active');
    });
}

// ================================================================
// NUEVA CONVERSACIÓN
// ================================================================
function newConversation() {
    var m = $('newModal');
    if (m) m.classList.add('show');

    var input = $('userSearch');
    if (input) {
        input.value = '';
        setTimeout(function() {
            input.focus();
        }, 50);
    }

    var results = $('userResults');
    if (results) results.innerHTML = '';
}

function cerrarModalNuevaConversacion() {
    var m = $('newModal');
    if (m) m.classList.remove('show');
}

// ================================================================
// BUSCAR USUARIOS
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
            return function() {
                createConversation(pid);
            };
        })(p.id);

        box.appendChild(el);
    }
}

// ================================================================
// CREAR CONVERSACIÓN
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
            .insert({
                usuario_id: user.id,
                contacto_id: id,
                estado: 'activo'
            });

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
// ELIMINAR CONVERSACIÓN
// ================================================================
async function deleteConversation() {
    if (!current) {
        toast('⚠️ Selecciona una conversación', 'error');
        return;
    }

    if (!await auth()) return;

    var nombre = current.bot
        ? 'Marquinhos'
        : (current.profile.nombre || 'este usuario');

    var confirmar = confirm(
        '⚠️ ¿Estás seguro de que quieres eliminar TODA la conversación con ' +
        nombre +
        '?\n\nEsta acción no se puede deshacer.'
    );

    if (!confirmar) return;

    try {
        var targetId = current.bot
            ? BOT_UUID
            : _normalizarBotIdConv(current.id);

        var r = await db
            .from('mensajes_chat')
            .update({ eliminado: true })
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + targetId + '),and(remitente_id.eq.' + targetId + ',destinatario_id.eq.' + user.id + ')');

        if (r.error) throw r.error;

        toast('✅ Conversación eliminada correctamente', 'success');

        if (typeof limpiarEstadoConversacion === 'function') {
            try {
                await limpiarEstadoConversacion();
            } catch (e) {}
        }

        current = null;
        unreadCount = 0;
        isUserAtBottom = true;
        actualizarFlecha();

        // Mostrar empty state
        if (typeof _mostrarEmptyState === 'function') {
            _mostrarEmptyState(
                'Conversación eliminada',
                'Envía un mensaje para empezar de nuevo'
            );
        }

        await loadConversations();

    } catch (e) {
        console.error('[Mensajes] Error eliminando conversación:', e);
        toast('❌ No se pudo eliminar la conversación', 'error');
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
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

console.log('[Mensajes] ✅ Conversaciones v2.2 cargado (renderizado garantizado)');
