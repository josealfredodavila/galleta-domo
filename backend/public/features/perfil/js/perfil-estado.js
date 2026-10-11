// ================================================================
// PERFIL · ESTADO (UI + escritura BD, presencia delegada)
// ================================================================
// Depende de: perfil-config.js, perfil-utils.js, presencia-global.js
//
// API pública (sin cambios): cambiarEstado, actualizarEstadoEnLinea,
// iniciarPresenciaEstado, iniciarDetectorInactividad, notificaciones.
// ================================================================

var estadoOcultoRemoto = false;   // usuarios.ocultar_estado
var estadoEscritoOnline = null;   // último valor visible escrito en BD
var lastOfflineIso = null;
var estadoIniciado = false;
var relativoTimer = null;

// ================================================================
// UI DEL ESTADO
// ================================================================
function actualizarUIEstado(visibleReal) {
    var estadoBadge = document.getElementById('estadoBadge');
    var estadoTexto = document.getElementById('estadoTexto');

    var conectado = window.Presencia && window.Presencia.estaConectado();
    var ocultoConectado = estadoOcultoRemoto && conectado;

    if (estadoBadge) {
        if (visibleReal) {
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

        if (visibleReal) {
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

function calcularVisibleReal() {
    var conectado = window.Presencia && window.Presencia.estaConectado();
    return conectado === true && !estadoOcultoRemoto;
}

function iniciarRefrescoRelativo() {
    if (relativoTimer) return;
    // Solo repinta el texto "hace X min". No consulta la base.
    relativoTimer = setInterval(function () {
        if (!calcularVisibleReal()) actualizarUIEstado(false);
    }, 60000);
}

// ================================================================
// ESCRITURA EN BD (solo en transiciones)
// ================================================================
async function sincronizarVisibilidadDB() {
    var visible = calcularVisibleReal();

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

        if (window.Presencia) {
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
            .select('ocultar_estado, offline_desde, ultima_conexion')
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

    if (!window.Presencia) {
        console.warn('[Perfil] presencia-global.js no cargado');
        return;
    }

    actualizarUIEstado(false);
    iniciarRefrescoRelativo();

    // Aplica la preferencia de ocultar antes de anunciarte
    await window.Presencia.setVisible(!estadoOcultoRemoto);

    // Cuando tu conexión cambie (conectar / ausente), se escribe en BD
    await window.Presencia.iniciar(session.user.id, {
        track: true,
        onConexionCambia: function () {
            sincronizarVisibilidadDB();
        }
    });

    // Repinta la UI con cada sincronización de presencia
    window.addEventListener('sar:presence:sync', function () {
        actualizarUIEstado(calcularVisibleReal());
    });
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