// ================================================================
// PRESENCIA GLOBAL · Csariel's (v2)
// ================================================================
// Un único canal "presencia-usuarios" por pestaña.
//
// API:
//   Presencia.iniciar(userId, { track, onConexionCambia })
//   Presencia.estaConectado()        -> tú estás anunciado ahora (no ausente)
//   Presencia.esVisible()            -> los demás te ven (conectado y no oculto)
//   Presencia.setVisible(bool)       -> true = mostrar, false = ocultar
//   Presencia.estaEnPresencia(id)    -> ese usuario está conectado y visible
//   Presencia.obtenerMapa()          -> { id: meta } (solo visibles)
//   Presencia.formatearTiempoRelativo(iso)
//
// Evento: window 'sar:presence:sync' (detail = mapa de visibles)
// ================================================================

(function () {
    'use strict';
    if (window.Presencia && window.Presencia.__sariel) return;

    var CANAL = 'presencia-usuarios';
    var IDLE_MS = 10 * 60 * 1000;   // 10 min sin actividad => ausente
    var THROTTLE_MS = 5000;

    var canal = null;
    var subscrito = false;
    var promesaInicio = null;
    var userId = null;
    var quiereTrackear = false;     // esta pestaña debe anunciarse
    var conectado = false;          // anunciado ahora mismo
    var visible = true;             // false = ocultar mi estado

    var idleTimer = null;
    var ultimaActividad = 0;
    var listenersOk = false;
    var callbacks = [];

    function esperar(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function obtenerCliente(timeoutMs) {
        var inicio = Date.now();
        while (Date.now() - inicio < timeoutMs) {
            if (window.supabaseClient) return window.supabaseClient;
            if (typeof window.getSupabaseClient === 'function') {
                try {
                    var c = await window.getSupabaseClient();
                    if (c) return c;
                } catch (e) {}
            }
            await esperar(150);
        }
        return null;
    }

    function emitirSync() {
        var mapa = {};
        if (canal && subscrito) {
            var estado = canal.presenceState();
            Object.keys(estado).forEach(function (clave) {
                var meta = (estado[clave] || [])[0];
                if (meta && meta.visible !== false) mapa[clave] = meta;
            });
        }
        window.presenciaUsuarios = mapa;
        try {
            window.dispatchEvent(new CustomEvent('sar:presence:sync', { detail: mapa }));
        } catch (e) {}
    }

    function notificar(conectadoAhora) {
        callbacks.forEach(function (cb) {
            try { cb(conectadoAhora); } catch (e) {}
        });
    }

    async function anunciar() {
        if (!canal || !subscrito || !quiereTrackear) return;
        try {
            await canal.track({
                user_id: userId,
                visible: visible,
                en: new Date().toISOString()
            });
        } catch (e) {}
    }

    async function retirar() {
        if (!canal || !subscrito) return;
        try { await canal.untrack(); } catch (e) {}
    }

    async function conectar() {
        if (conectado || !subscrito || !quiereTrackear) return;
        conectado = true;
        await anunciar();
        notificar(true);
    }

    async function desconectar() {
        if (!conectado) return;
        conectado = false;
        await retirar();
        notificar(false);
    }

    function programarIdle() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(desconectar, IDLE_MS);
    }

    function registrarActividad() {
        if (!quiereTrackear) return;
        var ahora = Date.now();
        if (ahora - ultimaActividad < THROTTLE_MS) return;
        ultimaActividad = ahora;
        programarIdle();
        conectar();
    }

    function registrarListeners() {
        if (listenersOk) return;
        listenersOk = true;

        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function (ev) {
            document.addEventListener(ev, registrarActividad, { passive: true });
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') registrarActividad();
        });

        window.addEventListener('pagehide', function () {
            conectado = false;
            retirar();
            notificar(false);
        });
    }

    function iniciar(uid, opciones) {
        opciones = opciones || {};
        userId = uid;
        quiereTrackear = opciones.track === true;

        if (opciones.onConexionCambia && callbacks.indexOf(opciones.onConexionCambia) === -1) {
            callbacks.push(opciones.onConexionCambia);
        }

        // Ya hay canal en esta pestaña: solo ajustamos el modo
        if (canal && subscrito) {
            if (quiereTrackear) {
                registrarListeners();
                programarIdle();
                conectar();
            }
            return Promise.resolve(true);
        }

        if (promesaInicio) return promesaInicio;

        promesaInicio = new Promise(async function (resolve) {
            var client = await obtenerCliente(10000);
            if (!client) {
                promesaInicio = null;
                resolve(false);
                return;
            }

            canal = client.channel(CANAL, { config: { presence: { key: uid } } });

            canal.on('presence', { event: 'sync' }, emitirSync);
            canal.on('presence', { event: 'join' }, emitirSync);
            canal.on('presence', { event: 'leave' }, emitirSync);

            canal.subscribe(async function (status) {
                if (status === 'SUBSCRIBED') {
                    subscrito = true;
                    emitirSync();
                    if (quiereTrackear) {
                        registrarListeners();
                        programarIdle();
                        conectado = false;
                        await conectar();
                    }
                    resolve(true);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    subscrito = false;
                    if (conectado) {
                        conectado = false;
                        notificar(false);
                    }
                    resolve(false);
                }
            });
        });

        return promesaInicio;
    }

    function estaConectado() {
        return conectado && subscrito;
    }

    // Los demás me ven: estoy conectado y no oculté mi estado
    function esVisible() {
        return conectado && subscrito && visible;
    }

    async function setVisible(v) {
        visible = v === true;
        if (conectado) await anunciar();
        emitirSync();
    }

    function estaEnPresencia(id) {
        var mapa = window.presenciaUsuarios || {};
        return Object.prototype.hasOwnProperty.call(mapa, id);
    }

    function obtenerMapa() {
        return window.presenciaUsuarios || {};
    }

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
        return 'hace ' + Math.floor(horas / 24) + ' d';
    }

    window.Presencia = {
        __sariel: true,
        iniciar: iniciar,
        estaConectado: estaConectado,
        esVisible: esVisible,
        setVisible: setVisible,
        estaEnPresencia: estaEnPresencia,
        obtenerMapa: obtenerMapa,
        formatearTiempoRelativo: formatearTiempoRelativo
    };

    window.formatearTiempoRelativo = formatearTiempoRelativo;
})();