// ================================================================
// PERFIL · ESTADO (Presence + "Ocultar mi estado")
// ================================================================
// Depende de: perfil-config.js (perfilCache, perfilT, cli, getSession,
//             showToast), perfil-utils.js
//
// CAMBIO v5:
// - Presencia en tiempo real con Supabase Presence. Sin consultas
//   periódicas: el estado llega por el canal, no leyendo la base.
// - La base de datos solo se escribe cuando cambia tu estado visible
//   (conectar, desconectar por inactividad, ocultar/mostrar).
// - "Ocultar mi estado": tu sesión sigue activa, pero los demás no ven
//   que estás conectado. Se guarda en usuarios.ocultar_estado.
// - "Hace X minutos" calculado desde offline_desde (sin consultas).
// - Los demás módulos pueden leer window.presenciaUsuarios y escuchar
//   el evento 'sar:presence:sync' para estado instantáneo.
// ================================================================

var ESTADO_IDLE_MS = 10 * 60 * 1000; // 10 min sin actividad => ausente

var presenceChannel = null;
var presenceIniciada = false;
var presenceSubscrita = false;
var presenceUserId = null;

var estaConectadoPresence = false;   // conectado y no ausente
var estadoOcultoRemoto = false;      // usuarios.ocultar_estado
var estadoEscritoOnline = null;      // último valor visible escrito en BD
var lastOfflineIso = null;           // desde cuándo estás sin conexión visible

var idleTimer = null;
var relativoTimer = null;
var ultimaActividadTs = 0;
var listenersIniciados = false;

window.presenciaUsuarios = {};

// ================================================================
// TIEMPO RELATIVO ("hace X minutos")
// ================================================================
// Las fechas de la base llegan sin zona horaria. Se tratan como UTC.
function formatearTiempoRelativo(fechaIso) {
    if (!fechaIso) return '';
    var texto = String(fechaIso);
    if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(texto)) texto += 'Z';

    var t = new Date(texto).getTime();
    if (isNaN(t)) return '';

    var minutos = Math.floor(Math.max(0, Date.now() - t) / 60000);
    if (minutos < 1) return perfilT('perfil_hace_momento', 'hace un momento');
    if (minutos < 60) return 'hace ' + minutos + ' min';

    var horas = Math.floor(minutos / 60);
    if (horas < 24) return 'hace ' + horas + ' h';

    var dias = Math.floor(horas / 24);
    return 'hace ' + dias + ' d';
}
window.formatearTiempoRelativo = formatearTiempoRelativo;

// ================================================================
// INTERFAZ DEL ESTADO (badge + texto)
// ================================================================
function actualizarUIEstado(visible) {
    var estadoBadge = document.getElementById('estadoBadge');
    var estadoTexto = document.getElementById('estadoTexto');

    var ocultoConectado = estadoOcultoRemoto && estaConectadoPresence;

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
            var relativo = formatearTiempoRelativo(lastOfflineIso);
            estadoTexto.textContent = perfilT('perfil_inactivo', 'Inactivo') +
                (relativo ? ' · ' + relativo : '');
            estadoTexto.style.color = 'var(--text-muted)';
        }
    }
}

function iniciarRefrescoRelativo() {
    if (relativoTimer) return;
    // Solo actualiza el texto "hace X min" en pantalla. No consulta la base.
    relativoTimer = setInterval(function () {
        var visibleAhora = estaConectadoPresence && !estadoOcultoRemoto;
        if (!visibleAhora) actualizarUIEstado(false);
    }, 60000);
}

// ================================================================
// ESCRIBIR EN BASE DE DATOS (solo cuando cambia lo visible)
// ================================================================
async function sincronizarVisibilidadDB() {
    var visible = estaConectadoPresence && !estadoOcultoRemoto;

    // Primera vez sin valor previo: no escribimos "desconectado" para no
    // borrar tu última conexión real
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
        var { error } = await window.supabaseClient
            .from('usuarios')
            .update({
                online: visible,
                ultima_conexion: ahora,
                offline_desde: visible ? null : ahora
            })
            .eq('id', session.user.id);
        if (error) return false;

        estadoEscritoOnline = visible;
        if (!visible) lastOfflineIso = ahora;
        if (perfilCache) {
            perfilCache.online = visible;
            perfilCache.ultima_conexion = ahora;
        }
        actualizarUIEstado(visible);
        return true;
    } catch (error) {
        return false;
    }
}

// ================================================================
// PRESENCIA EN TIEMPO REAL
// ================================================================
async function trackPresencia() {
    if (!presenceChannel || !presenceSubscrita) return;
    try {
        await presenceChannel.track({
            user_id: presenceUserId,
            visible: !estadoOcultoRemoto,
            en: new Date().toISOString()
        });
    } catch (e) {}
}

async function untrackPresencia() {
    if (!presenceChannel || !presenceSubscrita) return;
    try {
        await presenceChannel.untrack();
    } catch (e) {}
}

async function conectarPresenciaActiva() {
    estaConectadoPresence = true;
    await trackPresencia();
    await sincronizarVisibilidadDB();
}

async function desconectarPresenciaActiva() {
    estaConectadoPresence = false;
    await untrackPresencia();
    await sincronizarVisibilidadDB();
}

function emitirPresenciaGlobal() {
    if (!presenceChannel) return;
    var state = presenceChannel.presenceState();
    var mapa = {};
    Object.keys(state).forEach(function (clave) {
        var meta = state[clave] && state[clave][0];
        // Solo cuentan los usuarios que no ocultaron su estado
        if (meta && meta.visible !== false) mapa[clave] = meta;
    });
    window.presenciaUsuarios = mapa;
    window.dispatchEvent(new CustomEvent('sar:presence:sync', { detail: mapa }));
}

function iniciarPresencia(userId) {
    if (presenceIniciada || !cli()) return;
    presenceIniciada = true;
    presenceUserId = userId;

    presenceChannel = window.supabaseClient.channel('presencia-usuarios', {
        config: { presence: { key: userId } }
    });

    presenceChannel.on('presence', { event: 'sync' }, emitirPresenciaGlobal);

    presenceChannel.subscribe(async function (status) {
        if (status === 'SUBSCRIBED') {
            presenceSubscrita = true;
            await conectarPresenciaActiva();
            marcarActividad();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            presenceSubscrita = false;
            estaConectadoPresence = false;
            await sincronizarVisibilidadDB();
        }
    });
}

// ================================================================
// INACTIVIDAD (por eventos, sin consultas)
// ================================================================
function marcarActividad() {
    if (!presenceSubscrita) return;

    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
        desconectarPresenciaActiva();
    }, ESTADO_IDLE_MS);

    // Si estabas ausente y vuelves a interactuar, reconectamos
    if (!estaConectadoPresence) {
        conectarPresenciaActiva();
    }
}

function registrarListenersActividad() {
    if (listenersIniciados) return;
    listenersIniciados = true;

    var eventos = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'mousemove'];
    eventos.forEach(function (evento) {
        document.addEventListener(evento, function () {
            // mousemove llega muchas veces: limitamos a una vez cada 5 s
            var ahora = Date.now();
            if (ahora - ultimaActividadTs < 5000) return;
            ultimaActividadTs = ahora;
            marcarActividad();
        }, { passive: true });
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') marcarActividad();
    });

    window.addEventListener('pagehide', function () {
        estaConectadoPresence = false;
        untrackPresencia();
        sincronizarVisibilidadDB();
    });
}

// ================================================================
// ESTADO INICIAL (una sola lectura al abrir la página)
// ================================================================
async function leerEstadoInicial() {
    try {
        var session = await getSession();
        if (!session) return null;

        var { data, error } = await window.supabaseClient
            .from('usuarios')
            .select('ocultar_estado, online, offline_desde, ultima_conexion')
            .eq('id', session.user.id)
            .maybeSingle();
        if (error || !data) return null;

        estadoOcultoRemoto = data.ocultar_estado === true;
        lastOfflineIso = data.offline_desde || data.ultima_conexion || null;
        return session;
    } catch (error) {
        return null;
    }
}

// ================================================================
// INICIO DEL MÓDULO DE ESTADO
// ================================================================
async function iniciarPresenciaEstado() {
    var session = await leerEstadoInicial();
    if (!session) return;

    actualizarUIEstado(false);
    iniciarRefrescoRelativo();
    registrarListenersActividad();
    iniciarPresencia(session.user.id);
}

// Compatibilidad con perfil-init.js anterior
function iniciarDetectorInactividad() {
    iniciarPresenciaEstado();
}

// ================================================================
// OCULTAR / MOSTRAR MI ESTADO
// ================================================================
async function aplicarOcultarEstado(ocultar) {
    try {
        var session = await getSession();
        if (!session) return false;

        var { error } = await window.supabaseClient
            .from('usuarios')
            .update({ ocultar_estado: ocultar === true })
            .eq('id', session.user.id);
        if (error) return false;

        estadoOcultoRemoto = ocultar === true;
        await trackPresencia();
        await sincronizarVisibilidadDB();
        return true;
    } catch (error) {
        return false;
    }
}

// Botón "Mostrar estado" (online=true) / "Ocultar estado" (online=false)
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
    } catch (error) {}
}

// Compatibilidad: actualizarEstadoEnLinea(online) => mostrar/ocultar
async function actualizarEstadoEnLinea(online) {
    return aplicarOcultarEstado(online !== true);
}

// ================================================================
// NOTIFICAR A CONTACTOS DEL CAMBIO DE ESTADO
// ================================================================
async function notificarCambioEstado(visible) {
    try {
        var session = await getSession();
        if (!session) return;
        var { data: contactos, error } = await window.supabaseClient
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);
        if (error || !contactos || contactos.length === 0) return;

        var nombre = perfilCache?.nombre || perfilT('perfil_usuario_generico', 'Un usuario');
        var estado = visible
            ? '🟢 ' + perfilT('perfil_notif_activo', 'activo')
            : '🔒 ' + perfilT('perfil_notif_oculto', 'ocultó su estado');

        var notifs = contactos.map(function (c) {
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