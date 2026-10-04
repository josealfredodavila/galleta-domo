// ================================================================
// MENSAJES · CONVERSACIONES
// ================================================================
// Lista de conversaciones, filtro, nueva conversación, búsqueda,
// creación y eliminación. Se carga DESPUÉS de config, utils, auth, estados.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// OPTIMIZACIÓN: sin N+1 queries. Todo batch.
// ================================================================

'use strict';

// ================================================================
// CARGAR LISTA DE CONVERSACIONES
// ================================================================
async function loadConversations() {
    var list = $('conversationList');
    if (!list) return;

    list.innerHTML = '';

    // ---- 1. BOT MARQUINHOS (siempre primero) ----
    var botActivo = current && (current.id === BOT_ID || current.id === BOT_UUID);
    var botEl = document.createElement('div');
    botEl.className = 'conv conv-bot' + (botActivo ? ' active' : '');
    botEl.dataset.id = BOT_ID;
    botEl.dataset.name = 'marquinhos';
    botEl.innerHTML =
        '<div class="avatar avatar-bot">✦</div>' +
        '<div class="convinfo">' +
            '<div class="convname">' + BOT_NOMBRE + '</div>' +
            '<div class="convmsg" id="botLastMsg">Tu asistente personal</div>' +
        '</div>' +
        '<div class="convtime" id="botBadge" style="color:var(--success);font-size:.55rem">IA</div>';
    botEl.onclick = function() { openConversation(BOT_ID); };
    list.appendChild(botEl);

    if (!user) {
        if (window.DEBUG_CHAT) console.warn('[Mensajes/Conv] Sin user, no se cargan contactos');
        return;
    }

    // ---- 2. ÚLTIMO MENSAJE DEL BOT (1 query) ----
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

        // Contar no leídos del bot (1 query)
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
        console.warn('[Mensajes/Conv] Error cargando badge bot:', e);
    }

    // ---- 3. CONTACTOS (1 query) ----
    var contactos = [];
    try {
        var rContactos = await db
            .from('contactos')
            .select('contacto_id,created_at,fecha,estado,es_favorito')
            .eq('usuario_id', user.id)
            .neq('estado', 'bloqueado')
            .order('created_at', { ascending: false });

        if (rContactos.error) {
            console.error('[Mensajes/Conv] Error cargando contactos:', rContactos.error);
            return;
        }

        contactos = rContactos.data || [];
    } catch (e) {
        console.error('[Mensajes/Conv] Error contactos:', e);
        return;
    }

    if (!contactos.length) {
        aplicarFiltroConversaciones();
        return;
    }

    // ---- 4. FILTRAR IDs (excluir bot) ----
    var contactosIds = contactos
        .map(function(c) { return c.contacto_id; })
        .filter(function(id) { return id && id !== BOT_UUID && id !== BOT_ID; });

    if (!contactosIds.length) {
        aplicarFiltroConversaciones();
        return;
    }

    // ---- 5. PERFILES BATCH (1 query) ----
    var perfilesMap = {};
    try {
        var rPerfiles = await db
            .from('perfiles_publicos')
            .select('id,nombre,handle,avatar_url,online,ultima_conexion,verificado')
            .in('id', contactosIds);

        (rPerfiles.data || []).forEach(function(p) {
            perfilesMap[p.id] = p;
        });
    } catch (e) {
        console.warn('[Mensajes/Conv] Error perfiles batch:', e);
    }

    // ---- 6. ÚLTIMOS MENSAJES BATCH (1 query) ----
    // Traemos los últimos 200 mensajes que involucren al usuario,
    // y en JS nos quedamos con el último por cada contacto.
    var ultimoPorContacto = {};
    try {
        var listaIdsOr = contactosIds.join(',');
        var rMensajes = await db
            .from('mensajes_chat')
            .select('remitente_id,destinatario_id,contenido,tipo,created_at,leido,nombre_archivo')
            .eq('eliminado', false)
            .or(
                'and(remitente_id.eq.' + user.id + ',destinatario_id.in.(' + listaIdsOr + ')),' +
                'and(destinatario_id.eq.' + user.id + ',remitente_id.in.(' + listaIdsOr + '))'
            )
            .order('created_at', { ascending: false })
            .limit(500);

        (rMensajes.data || []).forEach(function(m) {
            var otroId = m.remitente_id === user.id ? m.destinatario_id : m.remitente_id;
            if (!ultimoPorContacto[otroId]) {
                ultimoPorContacto[otroId] = m;
            }
        });
    } catch (e) {
        console.warn('[Mensajes/Conv] Error mensajes batch:', e);
    }

    // ---- 7. RENDERIZAR ----
    contactosIds.forEach(function(cid) {
        var p = perfilesMap[cid] || { id: cid, nombre: 'Usuario', avatar_url: null, online: false };
        var last = ultimoPorContacto[cid];

        var el = document.createElement('div');
        el.className = 'conv' + (current && current.id === cid ? ' active' : '');
        el.dataset.id = cid;
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

        el.onclick = (function(id) {
            return function() { openConversation(id); };
        })(cid);

        list.appendChild(el);
    });

    aplicarFiltroConversaciones();
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
// NUEVA CONVERSACIÓN (modal)
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

    // Sanear término
    var term = q.trim()
        .replace(/[%_,\\.()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!term) {
        box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">Escribe algo válido</div>';
        return;
    }

    try {
        var r = await db
            .from('perfiles_publicos')
            .select('id,nombre,handle,avatar_url')
            .or('nombre.ilike.%' + term + '%,handle.ilike.%' + term + '%')
            .neq('id', user.id)
            .neq('id', BOT_UUID)
            .limit(12);

        if (r.error) {
            console.error('[Mensajes/Conv] Error búsqueda:', r.error);
            toast('❌ Error al buscar usuarios', 'error');
            return;
        }

        if (!r.data || !r.data.length) {
            box.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted)">No se encontraron usuarios</div>';
            return;
        }

        box.innerHTML = '';

        r.data.forEach(function(p) {
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
        });
    } catch (e) {
        console.error('[Mensajes/Conv] Excepción búsqueda:', e);
        toast('❌ Error al buscar usuarios', 'error');
    }
}

// ================================================================
// CREAR CONVERSACIÓN
// ================================================================
async function createConversation(id) {
    if (!id || !esUUID(id)) {
        toast('⚠️ Usuario inválido', 'error');
        return;
    }

    if (!await auth()) return;

    try {
        var r = await db
            .from('contactos')
            .select('id')
            .eq('usuario_id', user.id)
            .eq('contacto_id', id)
            .maybeSingle();

        if (r.error) {
            console.error('[Mensajes/Conv] Error comprobando contacto:', r.error);
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
                console.error('[Mensajes/Conv] Error insertando contacto:', ins.error);
                toast('❌ No se pudo crear la conversación', 'error');
                return;
            }
        }

        cerrarModalNuevaConversacion();
        await loadConversations();
        await openConversation(id);
    } catch (e) {
        console.error('[Mensajes/Conv] Excepción creando:', e);
        toast('❌ Error al crear la conversación', 'error');
    }
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
        ? BOT_NOMBRE
        : ((current.profile && current.profile.nombre) || 'este usuario');

    var confirmar = confirm('⚠️ ¿Estás seguro de que quieres eliminar TODA la conversación con ' + nombre + '?\n\nEsta acción no se puede deshacer.');
    if (!confirmar) return;

    try {
        var targetId = current.bot ? BOT_UUID : current.id;
        if (!esUUID(targetId)) {
            toast('⚠️ Conversación inválida', 'error');
            return;
        }

        var r = await db
            .from('mensajes_chat')
            .update({ eliminado: true })
            .or('and(remitente_id.eq.' + user.id + ',destinatario_id.eq.' + targetId + '),and(remitente_id.eq.' + targetId + ',destinatario_id.eq.' + user.id + ')')
            .eq('eliminado', false);

        if (r.error) throw r.error;

        toast('✅ Conversación eliminada correctamente', 'success');

        // Limpiar el chat actual
        if (typeof limpiarEstadoConversacion === 'function') {
            try { await limpiarEstadoConversacion(); } catch (e) {}
        }

        current = null;
        unreadCount = 0;
        isUserAtBottom = true;
        if (typeof actualizarFlecha === 'function') actualizarFlecha();

        // Mostrar empty state
        if (typeof mostrarEmptyState === 'function') {
            mostrarEmptyState('Conversación eliminada', 'Envía un mensaje para empezar de nuevo');
        }

        // Cerrar el chat visualmente
        if (typeof cerrarConversacionUI === 'function') {
            cerrarConversacionUI();
        }

        await loadConversations();
    } catch (e) {
        console.error('[Mensajes/Conv] Error eliminando:', e);
        toast('❌ No se pudo eliminar la conversación', 'error');
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.loadConversations = loadConversations;
window.aplicarFiltroConversaciones = aplicarFiltroConversaciones;
window.newConversation = newConversation;
window.cerrarModalNuevaConversacion = cerrarModalNuevaConversacion;
window.searchUsers = searchUsers;
window.createConversation = createConversation;
window.deleteConversation = deleteConversation;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Conv] ✅ Conversaciones cargado');
}