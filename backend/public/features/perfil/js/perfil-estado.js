// ================================================================
// PERFIL · ESTADO (UI + escritura BD, delegando presencia al global)
// ================================================================
// Depende de:
//   perfil-config.js   (cli, getSession, canalNotificaciones)
//   perfil-utils.js    (perfilT, showToast)
//   presencia-global.js (window.Presencia)
//
// API pública (sin cambios):
//   window.cambiarEstado(mostrar)
//   window.actualizarEstadoEnLinea(online)
//   window.iniciarPresenciaEstado()
//   window.iniciarDetectorInactividad()
//   window.formatearTiempoRelativo(iso)
//
// CAMBIO v6:
//   - El canal Supabase Presence ya no se crea aquí.
//     Lo hace presencia-global.js (un único canal por pestaña).
//   - Este módulo solo reacciona a window.Presencia.
//   - Se elimina la duplicación de listeners y el track manual.
// ================================================================

var ESTADO_IDLE_MS = 10 * 60 * 1000;

var estadoOcultoRemoto = false;      // usuarios.ocultar_estado
var estadoEscritoOnline = null;      // último valor visible escrito en BD
var lastOfflineIso = null;
var estadoIniciado = false;
var relativoTimer = null;

// ================================================================
// FORMATEAR TIEMPO RELATIVO (delegado al módulo global)
// ================================================================
// Se mantiene window.formatearTiempoRelativo con la misma firma
// por compatibilidad (ya lo define presencia-global.js).
// ================================================================

// ================================================================
// UI DEL ESTADO
// ================================================================
function actualizarUIEstado(visible) {
    var estadoBadge = document.getElementById('estadoBadge');
    var estadoTexto = document.getElementById('estadoTexto');

    var ocultoConectado = estadoOcultoRemoto && window.Presencia && window.Presencia.esVisible() === false;

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
            var relativo = window.formatearTiempoRelativo(lastOfflineIso);
            estadoTexto.textContent = perfilT('perfil_inactivo', 'Inactivo') +
                (relativo ? ' · ' + relativo : '');
            estadoTexto.style.color = 'var(--text-muted)';
        }
    }
}

function iniciarRefrescoRelativo() {
    if (relativoTimer) return;
    // Solo repinta "hace X min" en pantalla cada minuto. Sin consultas.
    relativoTimer = setInterval(function () {
        var visible = window.Presencia && window.Presencia.esVisible();
        if (!visible) actualizarUIEstado(false);
    }, 60000);
}

// ================================================================
// ESCRITURA EN BD (solo en transiciones)
// ================================================================
async function sincronizarVisibilidadDB() {
    var visibleAhora = window.Presencia && window.Presencia.esVisible();
    var visible = visibleAhora && !estadoOcultoRemoto;

    // Primera vez sin valor previo: no escribas "desconectado"
    if (!visible && estadoEscritoOnline === null) {
        actualizarUIEstado(false);
        return true;
    }

    if (visible === estadoEscritoOnline) {
        actualizarUIEstado(visible);
        return true;
    }

    try {
        var session = await getSession();
        if (!session) return false;

        var ahora = new Date().toISOString();
        var res = await window.supabaseClient
            .from('usuarios')
            .update({
                online: visible,
                ultima_conexion: ahora,
                offline_desde: visible ? null : ahora
            })
            .eq('id', session.user.id);
        if (res.error) return false;

        estadoEscritoOnline = visible;
        if (!visible) lastOfflineIso = ahora;

        if (typeof perfilCache !== 'undefined' && perfilCache) {
            perfilCache.online = visible;
            perfilCache.ultima_conexion = ahora;
        }
        actualizarUIEstado(visible);
        return true;
    } catch (e) {
        return false;
    }
}

// ================================================================
// OCULTAR / MOSTRAR MI ESTADO
// ================================================================
async function aplicarOcultarEstado(ocultar) {
    try {
        var session = await getSession();
        if (!session) return false;

        var res = await window.supabaseClient
            .from('usuarios')
            .update({ ocultar_estado: ocultar === true })
            .eq('id', session.user.id);
        if (res.error) return false;

        estadoOcultoRemoto = ocultar === true;

        // Refresca el track con el nuevo `visible`
        if (window.Presencia && window.Presencia.setVisible) {
            await window.Presencia.setVisible(!estadoOcultoRemoto);
        }

        await sincronizarVisibilidadDB();
        return true;
    } catch (e) {
        return false;
    }
}

async function cambiarEstado(mostrar) {
    try {
        var session = await getSession();
        if (!session) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        var ok = await aplicarOcultarEstado(!mostrar);
        if (!ok) {
            showToast(perfilT('perfil_error_cambiar_estado', '❌ No se pudo cambiar el estado'), 'error');
            return;
        }

        showToast(
            mostrar
                ? '🟢 ' + perfilT('perfil_estado_mostrado', 'Tu estado es visible')
                : '🔒 ' + perfilT('perfil_estado_oculto', 'Tu estado está oculto'),
            mostrar ? 'success' : 'warning'
        );

        await notificarCambioEstado(mostrar);
    } catch (e) {}
}

// Compatibilidad con el API anterior
async function actualizarEstadoEnLinea(online) {
    return aplicarOcultarEstado(online !== true);
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
    } catch (e) {}
}

// ================================================================
// ESTADO INICIAL (una sola lectura)
// ================================================================
async function leerEstadoInicial() {
    try {
        var session = await getSession();
        if (!session) return null;

        var res = await window.supabaseClient
            .from('usuarios')
            .select('ocultar_estado, online, offline_desde, ultima_conexion')
            .eq('id', session.user.id)
            .maybeSingle();
        if (res.error || !res.data) return null;

        estadoOcultoRemoto = res.data.ocultar_estado === true;
        lastOfflineIso = res.data.offline_desde || res.data.ultima_conexion || null;
        return session;
    } catch (e) {
        return null;
    }
}

// ================================================================
// INICIO
// ================================================================
async function iniciarPresenciaEstado() {
    if (estadoIniciado) return;
    estadoIniciado = true;

    var session = await leerEstadoInicial();
    if (!session) return;

    actualizarUIEstado(false);
    iniciarRefrescoRelativo();

    // Delegar canal + track + idle a presencia-global.js
    if (!window.Presencia || !window.Presencia.iniciar) {
        console.warn('[Perfil] presencia-global.js no cargado');
        return;
    }

    await window.Presencia.setVisible(!estadoOcultoRemoto);

    await window.Presencia.iniciar(session.user.id, {
        track: true,
        onVisibilidadCambia: function (visible) {
            // Se llama cuando el idle timer local cambia el track
            sincronizarVisibilidadDB();
        }
    });

    // Repintar UI al recibir syncs
    window.addEventListener('sar:presence:sync', function () {
        var visible = window.Presencia.esVisible();
        actualizarUIEstado(visible && !estadoOcultoRemoto);
    });
}

// Compatibilidad con perfil-init.js
function iniciarDetectorInactividad() {
    iniciarPresenciaEstado();
}

// ================================================================
// NOTIFICACIONES REALTIME (de Supabase) — sin cambios
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