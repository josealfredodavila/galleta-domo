// ================================================================
// PERFIL · AMIGOS
// ================================================================
// Carga amigos en línea, escucha realtime y muestra solicitudes.
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

// ================================================================
// ESCUCHA REALTIME DE AMIGOS
// ================================================================
function iniciarEscuchaAmigos() {
    if (!cli()) return;
    if (canalAmigos) {
        try { window.supabaseClient.removeChannel(canalAmigos); } catch (e) {}
    }
    canalAmigos = window.supabaseClient
        .channel('amigos_online')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'usuarios'
        }, (payload) => {
            const usuario = payload.new;
            if (usuario && usuario.id !== perfilCache?.id && idsAmigos.has(usuario.id)) {
                clearTimeout(temporizadorAmigos);
                temporizadorAmigos = setTimeout(actualizarListaAmigos, 2000);
            }
        })
        .subscribe();
    return canalAmigos;
}

// ================================================================
// CARGAR AMIGOS EN LÍNEA
// ================================================================
async function cargarAmigosEnLinea() {
    try {
        const session = await getSession();
        if (!session) return null;

        // 1. Obtener mis contactos
        const { data: contactos, error: contactosError } = await window.supabaseClient
            .from('contactos')
            .select('contacto_id, es_favorito, estado')
            .eq('usuario_id', session.user.id);

        if (contactosError) {
            actualizarUIAmigos([], []);
            return null;
        }
        if (!contactos || contactos.length === 0) {
            idsAmigos = new Set();
            actualizarUIAmigos([], []);
            return { enLinea: [], todosContactos: [] };
        }

        const idsContactos = contactos.map(c => c?.contacto_id).filter(Boolean);
        idsAmigos = new Set(idsContactos);

        if (idsContactos.length === 0) {
            actualizarUIAmigos([], []);
            return { enLinea: [], todosContactos: [] };
        }

        // 2. Leer perfiles públicos SOLO de mis contactos
        let todosContactos = [];
        try {
            const { data, error } = await window.supabaseClient
                .from('perfiles_publicos')
                .select('id, nombre, handle, avatar_url, online, ultima_conexion')
                .in('id', idsContactos);
            if (error) throw error;
            todosContactos = data || [];
        } catch (e) {
            console.warn('[Perfil] Error cargando perfiles públicos:', e);
            todosContactos = [];
        }

        const enLinea = todosContactos.filter(u => u.online === true);
        actualizarUIAmigos(todosContactos, enLinea);
        return { enLinea, todosContactos };
    } catch (error) {
        actualizarUIAmigos([], []);
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
            + '<p style="margin-top:8px;">Aún no tienes amigos agregados</p>'
            + '<p style="font-size:0.6rem;">Explora el muro para conectar con otros</p>'
            + '</div>';
        aplicarI18NPerfil(container);
        return;
    }

    const enLineaIds = new Set(enLinea.map(a => a.id));
    const ordenados = [
        ...todosAmigos.filter(a => enLineaIds.has(a.id)),
        ...todosAmigos.filter(a => !enLineaIds.has(a.id))
    ];

    const activoAhoraT = t('perfil_activo_ahora', 'Activo ahora');
    const desconectadoT = t('perfil_desconectado', 'Desconectado');
    const enLineaT = t('perfil_en_linea', 'EN LÍNEA');

    container.innerHTML = ordenados.map(amigo => {
        const estaEnLinea = enLineaIds.has(amigo.id);
        const estadoTxt = estaEnLinea
            ? '🟢 ' + activoAhoraT
            : '⭕ ' + desconectadoT;
        const handleRaw = String(amigo.handle || amigo.id || '');
        const nombreSafe = escaparHTML(amigo.nombre || amigo.handle || '');
        const avatarSafe = amigo.avatar_url ? escaparHTML(amigo.avatar_url) : '';
        return '<div class="amigo-item ' + (estaEnLinea ? 'online' : '') + '" data-handle="' + escaparHTML(handleRaw) + '" style="cursor:pointer;">'
            + '<div class="avatar-mini">' + (avatarSafe ? '<img src="' + avatarSafe + '">' : '◈') + '</div>'
            + '<div class="info">'
            + '<div class="nombre" style="color:' + (estaEnLinea ? 'var(--text-primary)' : 'var(--text-muted)') + '">' + nombreSafe + '</div>'
            + '<div class="estado" style="color:' + (estaEnLinea ? 'var(--success)' : 'var(--text-muted)') + '">'
            + estadoTxt + (!estaEnLinea && amigo.ultima_conexion ? ' · ' + haceTiempo(amigo.ultima_conexion) : '')
            + '</div>'
            + '</div>'
            + (estaEnLinea ? '<div class="badge-online">' + enLineaT + '</div>' : '')
            + '</div>';
    }).join('');

    container.querySelectorAll('.amigo-item[data-handle]').forEach(el => {
        el.addEventListener('click', function () {
            const handle = el.getAttribute('data-handle') || '';
            window.location.href = '/perfil/' + encodeURIComponent(handle);
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
            showToast('⚠️ Inicia sesión', 'error');
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
                showToast('⚠️ Ya enviaste solicitud', 'warning');
            } else {
                showToast('❌ Error: ' + error.message, 'error');
            }
            return;
        }
        showToast('🤝 Solicitud enviada', 'success');
    } catch (error) {
        showToast('❌ No se pudo enviar', 'error');
    }
}