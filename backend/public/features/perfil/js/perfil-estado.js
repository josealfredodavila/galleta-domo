// ================================================================
// PERFIL · ESTADO (online/offline + inactividad)
// ================================================================
// Maneja el estado online, detector de inactividad y notificaciones
// a contactos cuando cambia el estado.
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

// ================================================================
// ACTUALIZAR ESTADO EN SUPABASE
// ================================================================
async function actualizarEstadoEnLinea(online) {
    try {
        const session = await getSession();
        if (!session) return false;
        const ahora = new Date().toISOString();
        const { error } = await window.supabaseClient
            .from('usuarios')
            .update({
                online: online === true,
                ultima_conexion: ahora,
                offline_desde: online ? null : ahora
            })
            .eq('id', session.user.id);
        if (error) return false;
        if (perfilCache) {
            perfilCache.online = online;
            perfilCache.ultima_conexion = ahora;
        }
        actualizarUIEstado(online);
        return true;
    } catch (error) {
        return false;
    }
}

// ================================================================
// ACTUALIZAR UI DEL ESTADO (badge + texto)
// ================================================================
function actualizarUIEstado(online) {
    const estadoBadge = document.getElementById('estadoBadge');
    const estadoTexto = document.getElementById('estadoTexto');
    if (estadoBadge) {
        estadoBadge.innerHTML = online ? '🟢' : '⭕';
        estadoBadge.style.color = online ? 'var(--success)' : 'var(--text-muted)';
    }
    if (estadoTexto) {
        estadoTexto.removeAttribute('data-clave');
        estadoTexto.setAttribute('data-no-traducir', '1');
        estadoTexto.textContent = online
            ? t('perfil_activo_ahora', 'Activo ahora')
            : t('perfil_inactivo', 'Inactivo');
        estadoTexto.style.color = online ? 'var(--success)' : 'var(--text-muted)';
    }
}

// ================================================================
// DETECTOR DE INACTIVIDAD
// ================================================================
function iniciarDetectorInactividad() {
    if (detectorInactividadIniciado) return;
    detectorInactividadIniciado = true;

    const resetInactividad = () => {
        tiempoInactividad = 0;
        if (perfilCache && !perfilCache.online) actualizarEstadoEnLinea(true);
    };

    ['mousemove', 'mousedown', 'click', 'scroll', 'keydown', 'touchstart', 'touchmove'].forEach(evento => {
        document.addEventListener(evento, resetInactividad, { passive: true });
    });

    setInterval(async () => {
        tiempoInactividad += 30000;
        if (tiempoInactividad >= maxInactividad && perfilCache && perfilCache.online) {
            await actualizarEstadoEnLinea(false);
            showToast('⭕ ' + t('perfil_inactivo', 'Inactivo'), 'warning');
        }
    }, 30000);
}

// ================================================================
// CAMBIAR ESTADO MANUALMENTE (botón Activo/Inactivo)
// ================================================================
async function cambiarEstado(online) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }
        const ok = await actualizarEstadoEnLinea(online);
        if (!ok) {
            showToast('❌ No se pudo cambiar el estado', 'error');
            return;
        }
        showToast(
            online ? '🟢 ' + t('perfil_activo_ahora', 'Activo ahora') : '⭕ ' + t('perfil_inactivo', 'Inactivo'),
            online ? 'success' : 'warning'
        );
        await notificarCambioEstado(online);
    } catch (error) {}
}

// ================================================================
// NOTIFICAR A CONTACTOS DEL CAMBIO DE ESTADO
// ================================================================
async function notificarCambioEstado(online) {
    try {
        const session = await getSession();
        if (!session) return;
        const { data: contactos, error } = await window.supabaseClient
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);
        if (error || !contactos || contactos.length === 0) return;
        const nombre = perfilCache?.nombre || 'Un usuario';
        const estado = online
            ? '🟢 ' + t('perfil_activo_ahora', 'activo')
            : '⭕ ' + t('perfil_desconectado', 'inactivo');
        const notifs = contactos.map(c => ({
            user_id: c.contacto_id,
            tipo: 'estado',
            mensaje: nombre + ' ' + estado,
            emisor_id: session.user.id,
            leida: false,
            fecha: new Date().toISOString()
        }));
        for (let i = 0; i < notifs.length; i += 50) {
            await window.supabaseClient.from('notificaciones').insert(notifs.slice(i, i + 50));
        }
    } catch (error) {}
}

// ================================================================
// NOTIFICACIONES REALTIME (de Supabase)
// ================================================================
function iniciarNotificacionesRealtime() {
    if (!cli() || !perfilCache?.id) return;
    if (canalNotificaciones) {
        try { window.supabaseClient.removeChannel(canalNotificaciones); } catch (e) {}
    }
    canalNotificaciones = window.supabaseClient
        .channel('notificaciones_' + perfilCache.id)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones',
            filter: 'user_id=eq.' + perfilCache.id
        }, (payload) => {
            const notificacion = payload.new;
            if (notificacion && notificacion.user_id === perfilCache?.id) {
                showToast('🔔 ' + notificacion.mensaje, 'warning', 4000);
                try {
                    const audio = new Audio('/sound/notification.mp3');
                    audio.play().catch(() => {});
                } catch (e) {}
            }
        })
        .subscribe();
    return canalNotificaciones;
}