// ================================================================
// PERFIL · ESTADO (online/offline + inactividad)
// ================================================================
// Maneja el estado online, detector de inactividad y notificaciones
// a contactos cuando cambia el estado.
// Depende de: perfil-config.js, perfil-utils.js
//
// CAMBIO v2 (traducciones):
// - Todos los textos usan perfilT(clave, respaldo).
//
// CAMBIO v4 (Inactivo en cualquier navegador):
// - La elección "Inactivo" se guarda en usuarios.inactivo_manual (BD),
//   no en localStorage. Así aplica en celular, PC u otro navegador.
// - Cada 30 s se sincroniza el estado real desde la base de datos.
// - Si inactivo_manual es true, el sistema no vuelve a activarte solo.
// ================================================================

// ================================================================
// ESTADO MANUAL (desde la base de datos)
// ================================================================
var inactivoManualRemoto = false;

async function sincronizarEstadoDesdeServidor() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await window.supabaseClient
            .from('usuarios')
            .select('online, inactivo_manual')
            .eq('id', session.user.id)
            .maybeSingle();
        if (error || !data) return;

        inactivoManualRemoto = data.inactivo_manual === true;

        if (perfilCache) {
            perfilCache.inactivo_manual = inactivoManualRemoto;
        }

        // Si elegiste Inactivo y en otro lado quedó activo, lo corregimos
        if (inactivoManualRemoto && data.online === true) {
            await actualizarEstadoEnLinea(false);
            return;
        }

        actualizarUIEstado(data.online === true);
    } catch (error) {}
}

// ================================================================
// ACTUALIZAR ESTADO EN SUPABASE
// opciones.inactivoManual: true/false guarda la elección manual.
// Si no se pasa, no se toca la marca manual (cambio automático).
// ================================================================
async function actualizarEstadoEnLinea(online, opciones) {
    try {
        const session = await getSession();
        if (!session) return false;
        const ahora = new Date().toISOString();

        const payload = {
            online: online === true,
            ultima_conexion: ahora,
            offline_desde: online ? null : ahora
        };
        if (opciones && typeof opciones.inactivoManual === 'boolean') {
            payload.inactivo_manual = opciones.inactivoManual;
        }

        const { error } = await window.supabaseClient
            .from('usuarios')
            .update(payload)
            .eq('id', session.user.id);
        if (error) return false;

        if (perfilCache) {
            perfilCache.online = online;
            perfilCache.ultima_conexion = ahora;
            if (typeof payload.inactivo_manual === 'boolean') {
                perfilCache.inactivo_manual = payload.inactivo_manual;
            }
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
            ? perfilT('perfil_activo_ahora', 'Activo ahora')
            : perfilT('perfil_inactivo', 'Inactivo');
        estadoTexto.style.color = online ? 'var(--success)' : 'var(--text-muted)';
    }
}

// ================================================================
// DETECTOR DE INACTIVIDAD
// ================================================================
function iniciarDetectorInactividad() {
    if (detectorInactividadIniciado) return;
    detectorInactividadIniciado = true;

    // Al entrar, leemos el estado real (respeta el Inactivo puesto desde otro navegador)
    sincronizarEstadoDesdeServidor();

    const resetInactividad = () => {
        tiempoInactividad = 0;
        // Si elegiste Inactivo a mano (en cualquier dispositivo), no te activamos solo
        if (inactivoManualRemoto) return;
        if (perfilCache && !perfilCache.online) actualizarEstadoEnLinea(true);
    };

    ['mousemove', 'mousedown', 'click', 'scroll', 'keydown', 'touchstart', 'touchmove'].forEach(evento => {
        document.addEventListener(evento, resetInactividad, { passive: true });
    });

    setInterval(async () => {
        // Cada 30 s sincronizamos con la base de datos (otros navegadores)
        await sincronizarEstadoDesdeServidor();

        tiempoInactividad += 30000;
        if (
            tiempoInactividad >= maxInactividad &&
            perfilCache &&
            perfilCache.online &&
            !inactivoManualRemoto
        ) {
            await actualizarEstadoEnLinea(false);
            showToast('⭕ ' + perfilT('perfil_inactivo', 'Inactivo'), 'warning');
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
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const ok = await actualizarEstadoEnLinea(online, { inactivoManual: !online });
        if (!ok) {
            showToast(perfilT('perfil_error_cambiar_estado', '❌ No se pudo cambiar el estado'), 'error');
            return;
        }

        inactivoManualRemoto = !online;

        showToast(
            online
                ? '🟢 ' + perfilT('perfil_activo_ahora', 'Activo ahora')
                : '⭕ ' + perfilT('perfil_inactivo', 'Inactivo'),
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

        const nombre = perfilCache?.nombre || perfilT('perfil_usuario_generico', 'Un usuario');
        const estado = online
            ? '🟢 ' + perfilT('perfil_notif_activo', 'activo')
            : '⭕ ' + perfilT('perfil_notif_inactivo', 'inactivo');

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