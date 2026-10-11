// ================================================================
// PRESENCIA GLOBAL · Sariel's Ecosystem
// ================================================================
// Un único canal Supabase Presence por pestaña.
//
// API pública:
//   window.Presencia.iniciar(userId, { track: true|false })
//   window.Presencia.estaEnPresencia(userId) -> boolean
//   window.Presencia.obtenerMapa() -> { userId: meta }
//   window.Presencia.esVisible() -> boolean
//   window.Presencia.formatearTiempoRelativo(iso) -> string
//
// Eventos:
//   window 'sar:presence:sync'  → detail: mapa { userId: meta }
//
// Contrato con el resto del sistema:
//   - Mapa SOLO contiene usuarios con visible !== false.
//   - Si un usuario oculta su estado, desaparece del mapa.
//   - Si nadie está trackeando en la pestaña, el canal igual
//     observa y emite el evento (para perfil-publico, etc.).
// ================================================================

(function () {
    'use strict';

    if (window.Presencia && window.Presencia.__sariel_presencia) return;

    var CANAL_NOMBRE = 'presencia-usuarios';

    var canal = null;
    var subscrito = false;
    var userId = null;
    var trackeando = false;
    var visible = true;               // estado de visibilidad lógica
    var iniciando = false;
    var promesaInicio = null;

    // Timer local de inactividad (NO es polling de BD)
    var IDLE_MS = 10 * 60 * 1000;
    var idleTimer = null;
    var ultimaActividadTs = 0;
    var listenersActividad = false;

    var CALLBACKS_VISIBILIDAD = [];

    // ============================================================
    // Utilidades
    // ============================================================
    function getSupabase() {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            try {
                window.supabaseClient = window.supabase.createClient(
                    'https://zultnlogdoajehbswlih.supabase.co',
                    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
                );
                return window.supabaseClient;
            } catch (e) { return null; }
        }
        return null;
    }

    function emitirSync() {
        var mapa = {};
        if (canal && typeof canal.presenceState === 'function') {
            var state = canal.presenceState();
            Object.keys(state).forEach(function (clave) {
                var lista = state[clave] || [];
                var meta = lista[0];
                // Solo cuentan usuarios que NO ocultaron su estado
                if (meta && meta.visible !== false) mapa[clave] = meta;
            });
        }
        window.presenciaUsuarios = mapa;
        try {
            window.dispatchEvent(new CustomEvent('sar:presence:sync', { detail: mapa }));
        } catch (e) {}
    }

    // ============================================================
    // Tiempo relativo (expuesto globalmente)
    // ============================================================
    function formatearTiempoRelativo(fechaIso) {
        if (!fechaIso) return '';
        var texto = String(fechaIso);
        if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(texto)) texto += 'Z';
        var t = new Date(texto).getTime();
        if (isNaN(t)) return '';
        var minutos = Math.floor(Math.max(0, Date.now() - t) / 60000);
        if (minutos < 1) {
            return (typeof window.perfilT === 'function')
                ? window.perfilT('perfil_hace_momento', 'hace un momento')
                : 'hace un momento';
        }
        if (minutos < 60) return 'hace ' + minutos + ' min';
        var horas = Math.floor(minutos / 60);
        if (horas < 24) return 'hace ' + horas + ' h';
        var dias = Math.floor(horas / 24);
        return 'hace ' + dias + ' d';
    }

    // ============================================================
    // Track / Untrack
    // ============================================================
    async function trackear() {
        if (!canal || !subscrito || !trackeando || !userId) return;
        try {
            await canal.track({
                user_id: userId,
                visible: visible,
                en: new Date().toISOString()
            });
        } catch (e) {
            console.warn('[Presencia] Error al trackear:', e);
        }
    }

    async function destrackear() {
        if (!canal || !subscrito) return;
        try { await canal.untrack(); } catch (e) {}
    }

    // ============================================================
    // Inactividad (por eventos locales, NO consultas)
    // ============================================================
    function programarIdle() {
        if (!trackeando) return;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(function () {
            // Deja de trackear (los demás te ven desconectado),
            // pero NO escribimos en BD: eso lo decide el módulo que
            // llamó a iniciar() con onVisibilidadCambia.
            destrackear().then(function () {
                notificarVisibilidad(false);
            });
        }, IDLE_MS);
    }

    function registrarActividad() {
        if (!trackeando) return;
        var ahora = Date.now();
        if (ahora - ultimaActividadTs < 5000) return;
        ultimaActividadTs = ahora;

        var estabaInactivo = !canal || !subscrito;
        programarIdle();

        // Si estábamos "ausentes", volvemos a trackear
        if (estabaInactivo === false) {
            trackear().then(function () {
                notificarVisibilidad(true);
            });
        }
    }

    function iniciarListenersActividad() {
        if (listenersActividad || !trackeando) return;
        listenersActividad = true;

        var eventos = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'mousemove'];
        eventos.forEach(function (ev) {
            document.addEventListener(ev, registrarActividad, { passive: true });
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') registrarActividad();
        });

        window.addEventListener('pagehide', function () {
            destrackear();
            notificarVisibilidad(false);
        });
    }

    function notificarVisibilidad(v) {
        CALLBACKS_VISIBILIDAD.forEach(function (cb) {
            try { cb(v); } catch (e) {}
        });
    }

    // ============================================================
    // Iniciar canal
    // ============================================================
    function iniciar(uid, opciones) {
        opciones = opciones || {};
        var quiereTrackear = opciones.track === true;
        var onVisibilidadCambia = opciones.onVisibilidadCambia || null;

        if (onVisibilidadCambia) CALLBACKS_VISIBILIDAD.push(onVisibilidadCambia);

        // Si ya está iniciado y solo se pide trackear sin canal:
        if (canal && subscrito) {
            if (quiereTrackear && !trackeando) {
                trackeando = true;
                userId = uid;
                trackear();
                iniciarListenersActividad();
                programarIdle();
            }
            return promesaInicio || Promise.resolve(true);
        }

        if (iniciando) return promesaInicio;

        iniciando = true;
        promesaInicio = new Promise(function (resolve) {
            var client = getSupabase();
            if (!client) {
                iniciando = false;
                resolve(false);
                return;
            }

            userId = uid;
            trackeando = quiereTrackear;

            canal = client.channel(CANAL_NOMBRE, {
                config: { presence: { key: uid } }
            });

            canal.on('presence', { event: 'sync' }, emitirSync);
            canal.on('presence', { event: 'join' }, emitirSync);
            canal.on('presence', { event: 'leave' }, emitirSync);

            canal.subscribe(function (status) {
                if (status === 'SUBSCRIBED') {
                    subscrito = true;
                    iniciando = false;

                    if (trackeando) {
                        trackear();
                        iniciarListenersActividad();
                        programarIdle();
                    }

                    // Primer sync inmediato (aunque aún no haya nadie)
                    emitirSync();
                    resolve(true);
                } else if (
                    status === 'CHANNEL_ERROR' ||
                    status === 'TIMED_OUT' ||
                    status === 'CLOSED'
                ) {
                    subscrito = false;
                    iniciando = false;
                    resolve(false);
                }
            });
        });

        return promesaInicio;
    }

    // ============================================================
    // API pública
    // ============================================================
    function estaEnPresencia(id) {
        var mapa = window.presenciaUsuarios || {};
        return Object.prototype.hasOwnProperty.call(mapa, id);
    }

    function obtenerMapa() {
        return window.presenciaUsuarios || {};
    }

    function esVisible() {
        return visible === true;
    }

    // Permite al módulo dueño actualizar `visible` y forzar re-track
    async function setVisible(v) {
        visible = v === true;
        if (trackeando) {
            await destrackear();
            await trackear();
        }
        emitirSync();
    }

    window.Presencia = {
        __sariel_presencia: true,
        iniciar: iniciar,
        estaEnPresencia: estaEnPresencia,
        obtenerMapa: obtenerMapa,
        esVisible: esVisible,
        setVisible: setVisible,
        formatearTiempoRelativo: formatearTiempoRelativo
    };

    // Compatibilidad: exponer formateador global como antes
    window.formatearTiempoRelativo = formatearTiempoRelativo;
})();