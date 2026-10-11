// ================================================================
// PERFIL · ESTADO (botones Activo/Inactivo + presencia opcional)
// ================================================================
// Depende de: perfil-config.js (getSession, cli, canalNotificaciones),
//             perfil-utils.js (perfilT, showToast)
// Opcional:   presencia-global.js (window.Presencia)
//
// CAMBIO v7:
//   - Los botones escriben en la base directamente (no dependen de presencia).
//   - Si el error ocurre, se registra en la consola con el motivo real.
//   - Si presencia-global.js está cargado, se sincroniza en vivo.
// ================================================================

var estadoOcultoRemoto = false;   // usuarios.ocultar_estado
var estadoEscritoOnline = null;   // último valor de online guardado en BD
var lastOfflineIso = null;
var estadoIniciado = false;
var relativoTimer = null;

function presenciaDisponible() {
    return !!(window.Presencia && typeof window.Presencia.iniciar === 'function');
}

// ================================================================
// ESCRITURA EN BD
// ================================================================
async function escribirEstadoDB(campos) {
    var session = await getSession();
    if (!session) throw new Error('No hay sesión activa');

    var res = await window.supabaseClient
        .from('usuarios')
        .update(campos)
        .eq('id', session.user.id);

    if (res.error) throw res.error;
    return session;
}

// ================================================================
// UI DEL ESTADO
// ================================================================
function actualizarUIEstado(visible) {
    var estadoBadge = document.getElementById('estadoBadge');
    var estadoTexto = document.getElementById('estadoTexto');

    var conectado = presenciaDisponible() && window.Presencia.estaConectado();
    var ocultoConectado = estadoOcultoRemoto && conectado;

    if (estadoBadge) {
        if (visible) {
            estadoBadge.innerHTML = '🟢';
            estadoBadge.style.color = 'var(--success)';
        } else if (ocultoConectado) {
            estadoBadge.innerHTML = '🔒';
            estadoBadge.style.color = 'var(--text-muted)';
        } else {
            estadoBadge.innerHTML = '⭕';
            estadoBadge.style.color = 'var(--text-muted)';
        }
    }

    if (estadoTexto) {
        estadoTexto.removeAttribute('data-clave');
        estadoTexto.setAttribute('data-no-traducir', '1');

        if (visible) {
            estadoTexto.textContent = perfilT('perfil_activo_ahora', 'Activo ahora');
            estadoTexto.style.color = 'var(--success)';
        } else if (ocultoConectado) {
            estadoTexto.textContent = perfilT('perfil_estado_oculto', 'Estado oculto');
            estadoTexto.style.color = 'var(--text-muted)';
        } else {
            var relativo = window.formatearTiempoRelativo
                ? window.formatearTiempoRelativo(lastOfflineIso)
                : '';
            estadoTexto.textContent = perfilT('perfil_inactivo', 'Inactivo') +
                (relativo ? ' · ' + relativo : '');
            estadoTexto.style.color = 'var(--text-muted)';
        }
    }
}

function iniciarRefrescoRelativo() {
    if (relativoTimer) return;
    // Solo repinta el texto "hace X min". No consulta la base.
    relativoTimer = setInterval(function () {
        if (!estadoEscritoOnline) actualizarUIEstado(false);
    }, 60000);
}

// ================================================================
// CAMBIAR ESTADO (botones Activo / Inactivo)
// ================================================================
// mostrar = true  -> Activo (visible para los demás)
// mostrar = false -> Inactivo / oculto
// ================================================================
async function cambiarEstado(mostrar) {
    try {
        var ahora = new Date().toISOString();

        await escribirEstadoDB({
            ocultar_estado: !mostrar,
            online: mostrar === true,
            ultima_conexion: ahora,
            offline_desde: mostrar ? null : ahora
        });

        estadoOcultoRemoto = !mostrar;
        estadoEscritoOnline = mostrar === true;
        if (!mostrar) lastOfflineIso = ahora;

        if (presenciaDisponible()) {
            await window.Presencia.setVisible(mostrar === true);
        }

        actualizarUIEstado(mostrar === true);

        showToast(
            mostrar
                ? '🟢 ' + perfilT('perfil_estado_mostrado', 'Tu estado es visible')
                : '🔒 ' + perfilT('perfil_estado_oculto', 'Tu estado está oculto'),
            mostrar ? 'success' : 'warning'
        );

        await notificarCambioEstado(mostrar === true);
    } catch (error) {
        console.error('[Estado] No se pudo cambiar el estado:', error && (error.message || error));
        showToast(perfilT('perfil_error_cambiar_estado', '❌ No se pudo cambiar el estado'), 'error');
    }
}

// Compatibilidad con el API anterior
async function actualizarEstadoEnLinea(online) {
    try {
        await cambiarEstadoSinAviso(online === true);
        return true;
    } catch (error) {
        console.error('[Estado] actualizarEstadoEnLinea:', error && (error.message || error));
        return false;
    }
}

async function cambiarEstadoSinAviso(mostrar) {
    var ahora = new Date().toISOString();
    await escribirEstadoDB({
        ocultar_estado: !mostrar,
        online: mostrar,
        ultima_conexion: ahora,
        offline_desde: mostrar ? null : ahora
    });
    estadoOcultoRemoto = !mostrar;
    estadoEscritoOnline = mostrar;
    if (!mostrar) lastOfflineIso = ahora;
    actualizarUIEstado(mostrar);
}

// ================================================================
// SINCRONIZACIÓN CON PRESENCIA (solo si presencia-global.js está cargado)
// ================================================================
async function sincronizarVisibilidadDB() {
    if (!presenciaDisponible()) return;

    var visible = window.Presencia.estaConectado() && !estadoOcultoRemoto;
    if (visible === estadoEscritoOnline) {
        actualizarUIEstado(visible);
        return;
    }

    try {
        var ahora = new Date().toISOString();
        await escribirEstadoDB({
            online: visible,
            ultima_conexion: ahora,
            offline_desde: visible ? null : ahora
        });
        estadoEscritoOnline = visible;
        if (!visible) lastOfflineIso = ahora;
        actualizarUIEstado(visible);
    } catch (error) {
        console.error('[Estado] Sincronización con presencia falló:', error && (error.message || error));
    }
}

// ================================================================
// NOTIFICAR A CONTACTOS
// ================================================================
async function notificarCambioEstado(visible) {
    try {
        var session = await getSession();
        if (!session) return;

        var res = await window.supabaseClient
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);
        if (res.error || !res.data || res.data.length === 0) return;

        var nombre = (typeof perfilCache !== 'undefined' && perfilCache && perfilCache.nombre)
            ? perfilCache.nombre
            : perfilT('perfil_usuario_generico', 'Un usuario');

        var estado = visible
            ? '🟢 ' + perfilT('perfil_notif_activo', 'activo')
            : '🔒 ' + perfilT('perfil_notif_oculto', 'ocultó su estado');

        var notifs = res.data.map(function (c) {
            return {
                user_id: c.contacto_id,
                tipo: 'estado',
                mensaje: nombre + ' ' + estado,
                emisor_id: session.user.id,
                leida: false,
                fecha: new Date().toISOString()
            };
        });

        for (var i = 0; i < notifs.length; i += 50) {
            await window.supabaseClient
                .from('notificaciones')
                .insert(notifs.slice(i, i + 50));
        }
    } catch (e) {
        console.warn('[Estado] No se pudieron notificar los contactos:', e);
    }
}

// ================================================================
// INICIO
// ================================================================
async function iniciarPresenciaEstado() {
    if (estadoIniciado) return;
    estadoIniciado = true;

    try {
        var session = await getSession();
        if (!session) return;

        var res = await window.supabaseClient
            .from('usuarios')
            .select('ocultar_estado, online, offline_desde, ultima_conexion')
            .eq('id', session.user.id)
            .maybeSingle();
        if (res.error || !res.data) {
            console.error('[Estado] No se pudo leer el estado inicial:', res.error && res.error.message);
            return;
        }

        estadoOcultoRemoto = res.data.ocultar_estado === true;
        estadoEscritoOnline = res.data.online === true;
        lastOfflineIso = res.data.offline_desde || res.data.ultima_conexion || null;

        actualizarUIEstado(estadoEscritoOnline && !estadoOcultoRemoto);
        iniciarRefrescoRelativo();

        if (!presenciaDisponible()) return;

        await window.Presencia.setVisible(!estadoOcultoRemoto);
        await window.Presencia.iniciar(session.user.id, {
            track: true,
            onConexionCambia: sincronizarVisibilidadDB
        });

        window.addEventListener('sar:presence:sync', function () {
            actualizarUIEstado(window.Presencia.esVisible() && !estadoOcultoRemoto);
        });
    } catch (e) {
        console.error('[Estado] Error al iniciar:', e && (e.message || e));
    }
}

// Compatibilidad con perfil-init.js
function iniciarDetectorInactividad() {
    iniciarPresenciaEstado();
}

// ================================================================
// NOTIFICACIONES REALTIME (sin cambios)
// ================================================================
function iniciarNotificacionesRealtime() {
    if (!cli() || !perfilCache || !perfilCache.id) return;
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
        }, function (payload) {
            var notificacion = payload.new;
            if (notificacion && notificacion.user_id === perfilCache.id) {
                showToast('🔔 ' + notificacion.mensaje, 'warning', 4000);
                try {
                    var audio = new Audio('/sound/notification.mp3');
                    audio.play().catch(function () {});
                } catch (e) {}
            }
        })
        .subscribe();
    return canalNotificaciones;
}