// ================================================================
// PERFIL · AMIGOS
// ================================================================
// Carga amigos y muestra quién está en línea.
// Depende de: perfil-config.js, perfil-utils.js, perfil-estado.js
//
// CAMBIO v3 (Presence):
// - Quién está en línea se decide por el canal de presencia
//   (window.presenciaUsuarios), no por consultas periódicas.
// - La lista de contactos se lee una vez y se reutiliza.
// - Al tocar un amigo se abre su perfil público.
//
// CAMBIO v2 (traducciones):
// - Todos los textos usan perfilT(clave, respaldo).
// ================================================================

var contactosAmigosCache = [];
var presenciaAmigosListener = false;

function estaEnPresencia(userId) {
    var mapa = window.presenciaUsuarios || {};
    return Object.prototype.hasOwnProperty.call(mapa, userId);
}

// ================================================================
// ESCUCHA DE PRESENCIA (sin consultas a la base)
// ================================================================
function iniciarEscuchaAmigos() {
    if (!presenciaAmigosListener) {
        presenciaAmigosListener = true;
        window.addEventListener('sar:presence:sync', function () {
            renderizarAmigos();
        });
    }
    // Carga inicial de la lista de contactos (una sola vez)
    cargarAmigosEnLinea();
}

// ================================================================
// RENDERIZAR CON LO QUE HAY EN MEMORIA + PRESENCIA
// ================================================================
function renderizarAmigos() {
    var enLinea = contactosAmigosCache.filter(function (u) {
        return estaEnPresencia(u.id);
    });
    actualizarUIAmigos(contactosAmigosCache, enLinea);
}

// ================================================================
// CARGAR CONTACTOS (una lectura; luego se reutiliza)
// ================================================================
async function cargarAmigosEnLinea() {
    try {
        const session = await getSession();
        if (!session) return null;

        const { data: contactos, error: contactosError } = await window.supabaseClient
            .from('contactos')
            .select('contacto_id, es_favorito, estado')
            .eq('usuario_id', session.user.id);

        if (contactosError || !contactos || contactos.length === 0) {
            idsAmigos = new Set();
            contactosAmigosCache = [];
            renderizarAmigos();
            return { enLinea: [], todosContactos: [] };
        }

        const idsContactos = contactos.map(c => c?.contacto_id).filter(Boolean);
        idsAmigos = new Set(idsContactos);

        let perfiles = [];
        try {
            const { data, error } = await window.supabaseClient
                .from('perfiles_publicos')
                .select('id, nombre, handle, avatar_url, ultima_conexion')
                .in('id', idsContactos);
            if (error) throw error;
            perfiles = data || [];
        } catch (e) {
            console.warn('[Perfil] Error cargando perfiles públicos:', e);
            perfiles = [];
        }

        contactosAmigosCache = perfiles;
        renderizarAmigos();

        return {
            todosContactos: perfiles,
            enLinea: perfiles.filter(u => estaEnPresencia(u.id))
        };
    } catch (error) {
        contactosAmigosCache = [];
        renderizarAmigos();
        return null;
    }
}

// ================================================================
// ACTUALIZAR LISTA DE AMIGOS EN EL DOM
// ================================================================
function actualizarUIAmigos(todosAmigos = [], enLinea = []) {
    const container = document.getElementById('amigosContainer');
    const contador = document.getElementById('amigosEnLineaContador');

    if (contador) {
        contador.textContent = enLinea.length;
        contador.style.color = enLinea.length > 0 ? 'var(--success)' : 'var(--text-muted)';
    }

    if (!container) return;

    if (!todosAmigos || todosAmigos.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">'
            + '<span style="font-size:2rem;">👥</span>'
            + '<p style="margin-top:8px;">' + escaparHTML(perfilT('perfil_amigos_vacio', 'Aún no tienes amigos agregados')) + '</p>'
            + '<p style="font-size:0.6rem;">' + escaparHTML(perfilT('perfil_amigos_explorar', 'Explora el muro para conectar con otros')) + '</p>'
            + '</div>';
        aplicarI18NPerfil(container);
        return;
    }

    const enLineaIds = new Set(enLinea.map(a => a.id));
    const ordenados = [
        ...todosAmigos.filter(a => enLineaIds.has(a.id)),
        ...todosAmigos.filter(a => !enLineaIds.has(a.id))
    ];

    const activoAhoraT = perfilT('perfil_activo_ahora', 'Activo ahora');
    const desconectadoT = perfilT('perfil_desconectado', 'Desconectado');
    const enLineaT = perfilT('perfil_en_linea', 'EN LÍNEA');

    container.innerHTML = ordenados.map(amigo => {
        const estaEnLinea = enLineaIds.has(amigo.id);
        const estadoTxt = estaEnLinea
            ? '🟢 ' + activoAhoraT
            : '⭕ ' + desconectadoT;
        const relativo = !estaEnLinea && amigo.ultima_conexion && window.formatearTiempoRelativo
            ? window.formatearTiempoRelativo(amigo.ultima_conexion)
            : '';
        const handleRaw = String(amigo.handle || '');
        const nombreSafe = escaparHTML(amigo.nombre || amigo.handle || '');
        const avatarSafe = amigo.avatar_url ? escaparHTML(amigo.avatar_url) : '';

        return '<div class="amigo-item ' + (estaEnLinea ? 'online' : '') + '" data-handle="' + escaparHTML(handleRaw) + '" style="cursor:pointer;">'
            + '<div class="avatar-mini">' + (avatarSafe ? '<img src="' + avatarSafe + '">' : '◈') + '</div>'
            + '<div class="info">'
            + '<div class="nombre" style="color:' + (estaEnLinea ? 'var(--text-primary)' : 'var(--text-muted)') + '">' + nombreSafe + '</div>'
            + '<div class="estado" style="color:' + (estaEnLinea ? 'var(--success)' : 'var(--text-muted)') + '">'
            + estadoTxt + (relativo ? ' · ' + relativo : '')
            + '</div>'
            + '</div>'
            + (estaEnLinea ? '<div class="badge-online">' + escaparHTML(enLineaT) + '</div>' : '')
            + '</div>';
    }).join('');

    container.querySelectorAll('.amigo-item[data-handle]').forEach(el => {
        el.addEventListener('click', function () {
            const handle = el.getAttribute('data-handle') || '';
            if (!handle) return;
            window.location.href = '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(handle);
        });
    });
}

// ================================================================
// ACTUALIZAR LISTA DE AMIGOS (alias)
// ================================================================
async function actualizarListaAmigos() {
    await cargarAmigosEnLinea();
}

// ================================================================
// AGREGAR AMIGO (envía solicitud)
// ================================================================
async function agregarAmigo(amigoId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }
        const { error } = await window.supabaseClient
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: amigoId,
                estado: 'pendiente'
            });
        if (error) {
            if (error.code === '23505') {
                showToast(perfilT('perfil_ya_enviada', '⚠️ Ya enviaste solicitud'), 'warning');
            } else {
                showToast(perfilT('perfil_error_generico', '❌ Error: ') + error.message, 'error');
            }
            return;
        }
        showToast(perfilT('perfil_solicitud_enviada', '🤝 Solicitud enviada'), 'success');
    } catch (error) {
        showToast(perfilT('perfil_error_enviar', '❌ No se pudo enviar'), 'error');
    }
}