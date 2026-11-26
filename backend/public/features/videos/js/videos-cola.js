// ================================================================
// CSARIEL'S · VIDEOS · COLA DE SUBIDA (v1.2 - RAÍZ)
// ================================================================
// Subida de videos en segundo plano con reintentos.
// Utiliza la configuración y utilidades globales de window.VideosApp.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils) {
        console.error('[Videos] videos-cola.js requiere videos-config.js.');
        return;
    }
    if (VA.cola) return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;

    /* ----------------------------------------------------------------
       Helpers defensivos
       ---------------------------------------------------------------- */
    function valorInputSeguro(id) {
        try {
            var el = document.getElementById(id);
            return el && typeof el.value === 'string' ? el.value : '';
        } catch (e) { return ''; }
    }

    function jsonSeguro(datos) {
        return datos && typeof datos === 'object' ? datos : {};
    }

    /* ----------------------------------------------------------------
       IndexedDB: almacén de la cola
       ---------------------------------------------------------------- */
    function colaAbrir() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(CONFIG.COLA_DB, CONFIG.COLA_VERSION);
            req.onupgradeneeded = function () {
                if (!req.result.objectStoreNames.contains(CONFIG.COLA_STORE)) {
                    req.result.createObjectStore(CONFIG.COLA_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function colaOperar(modo, operar) {
        return colaAbrir().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(CONFIG.COLA_STORE, modo);
                var store = tx.objectStore(CONFIG.COLA_STORE);
                var peticion = operar(store);
                tx.oncomplete = function () { db.close(); resolve(peticion ? peticion.result : undefined); };
                tx.onerror = function () { db.close(); reject(tx.error); };
                tx.onabort = function () { db.close(); reject(tx.error); };
            });
        });
    }

    function colaGuardar(item) { return colaOperar('readwrite', function (s) { return s.put(item); }); }
    function colaBorrar(id) { return colaOperar('readwrite', function (s) { return s.delete(id); }); }
    function colaLeerTodos() { return colaOperar('readonly', function (s) { return s.getAll(); }); }

    async function cargarColaEnMemoria() {
        try { S.colaCache = (await colaLeerTodos()) || []; } catch (e) { S.colaCache = []; }
    }

    function colaProgramar(ms) {
        clearTimeout(S.colaTimer);
        S.colaTimer = setTimeout(procesarCola, Math.max(1000, ms));
    }

    /* ----------------------------------------------------------------
       Barra de estado de la cola
       ---------------------------------------------------------------- */
    function actualizarEstadoCola() {
        var caja = document.getElementById('colaEstado');
        var txt = document.getElementById('colaTexto');
        var btn = document.getElementById('colaCancelar');
        if (!caja || !txt) return;

        var hayCola = S.colaCache.length > 0;
        var jobs = Object.keys(S.jobsSeguidos).length;
        var sinRed = navigator.onLine === false;

        var mensaje = '';
        if (hayCola) {
            var enEspera = sinRed || S.colaCache.some(function (x) { return x.espera; });
            mensaje = enEspera ? 'Tu video se subirá cuando vuelva la conexión' : 'Subiendo tu video…';
        } else if (jobs) {
            mensaje = 'Procesando tu video' + (S.progresoJob !== null ? ' · ' + S.progresoJob + '%' : '…');
        }

        caja.hidden = !(hayCola || jobs);
        txt.textContent = mensaje;
        if (btn) btn.hidden = !hayCola;
    }

    /* ----------------------------------------------------------------
       Procesamiento de la cola
       ---------------------------------------------------------------- */
    async function procesarCola() {
        var sb = VA.cliente();
        if (S.colaOcupada || !sb) return;
        if (navigator.onLine === false) { actualizarEstadoCola(); return; }

        S.colaOcupada = true;
        try {
            await cargarColaEnMemoria();
            if (!S.colaCache.length) return;

            var session = await U.getSession();
            if (!session) return;

            var pendientes = S.colaCache.slice().sort(function (a, b) { return a.creado - b.creado; });

            for (var i = 0; i < pendientes.length; i++) {
                var it = pendientes[i];
                if (it.espera) continue;
                if (it.siguienteIntento && it.siguienteIntento > Date.now()) continue;

                await avanzarItem(it, session);
                if (navigator.onLine === false) break;
            }

            await cargarColaEnMemoria();

            var proximos = S.colaCache.filter(function (x) { return !x.espera && x.siguienteIntento > Date.now(); }).map(function (x) { return x.siguienteIntento; });
            if (proximos.length) colaProgramar(Math.min.apply(null, proximos) - Date.now());
        } finally {
            S.colaOcupada = false;
            actualizarEstadoCola();
        }
    }

    async function avanzarItem(it, session) {
        try {
            if (it.etapa === 'pendiente') {
                var fd = new FormData();
                fd.append('file', it.file, it.nombre);
                fd.append('destino', 'videos');
                fd.append('tipo', 'video');

                var r = await U.fetchConTimeout(CONFIG.ENDPOINT_UPLOAD, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + session.access_token },
                    body: fd
                }, CONFIG.TIMEOUT_SUBIDA_MS);

                var j = jsonSeguro(await U.leerJSONSeguro(r));
                if (!r || !r.ok || !j.ok || !j.url) throw U.errorDeRespuesta('Subida', r || {}, j);

                it.url = j.url; it.path = j.path; it.etapa = 'subida';
                await colaGuardar(it);
            }

            if (it.etapa === 'subida') {
                var sb = VA.cliente();
                var ins = await sb.from(CONFIG.TABLA_VIDEOS).insert({
                    usuario_id: it.usuarioId,
                    titulo: it.titulo || '',
                    descripcion: it.descripcion || null,
                    url_video: it.url,
                    estado: 'procesando',
                    duracion: 0,
                    es_borrador: false,
                    sonido_id: null,
                    sonido_nombre: it.sonidoNombre || null,
                    sonido_url: it.sonidoUrl || null,
                    ubicacion_nombre: it.ubicacionNombre || null,
                    latitud: it.latitud || null,
                    longitud: it.longitud || null
                }).select().single();

                if (ins.error) {
                    var msg = String(ins.error.message || '');
                    if (msg.indexOf('cuota_excedida') !== -1) {
                        var fc = new Error('cuota'); fc.fatal = true; fc.cuota = { error: 'cuota_excedida' }; throw fc;
                    }
                    throw new Error('Registro: ' + msg);
                }

                it.videoId = ins.data.id; it.etapa = 'registrado';
                await colaGuardar(it);
            }

            if (it.etapa === 'registrado') {
                var q = await U.fetchConTimeout(CONFIG.ENDPOINT_COLA_VIDEO, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
                    body: JSON.stringify({ videoId: it.videoId, videoUrl: it.url, bucket: 'videos', filePath: it.path, audioUrl: it.sonidoUrl || null })
                }, CONFIG.TIMEOUT_COLA_MS);

                var qj = jsonSeguro(await U.leerJSONSeguro(q));
                if (!q || !q.ok || !qj.success || !qj.jobId) throw U.errorDeRespuesta('Procesamiento', q || {}, qj);
                it.jobId = qj.jobId;
            }

            await colaBorrar(it.id);
            seguirJob(it.jobId, it.videoId);
            return true;

        } catch (e) {
            if (e.fatal) {
                await colaBorrar(it.id).catch(function () {});
                if (it.videoId) await marcarVideoConError(it.videoId);
                if (e.cuota && window.VideosPublicar && typeof window.VideosPublicar.mostrarAvisoCuota === 'function') {
                    window.VideosPublicar.mostrarAvisoCuota(e.cuota);
                } else { U.showToast('No se pudo publicar tu video', 'error', 4500); }
                return false;
            }

            it.intentos = (it.intentos || 0) + 1;
            if (it.intentos >= CONFIG.MAX_INTENTOS) {
                it.espera = true; it.siguienteIntento = 0;
            } else {
                it.siguienteIntento = Date.now() + Math.min(120000, 3000 * Math.pow(2, it.intentos));
            }
            it.ultimoError = String(e.message || '');
            await colaGuardar(it).catch(function () {});
            return false;
        }
    }

    async function marcarVideoConError(id) {
        try { var sb = VA.cliente(); if (sb && id) await sb.from(CONFIG.TABLA_VIDEOS).update({ estado: 'error_procesamiento' }).eq('id', id); } catch (e) {}
    }

    function liberarArchivoSubido(url) {
        U.getSession().then(function (session) {
            if (!session || !url) return;
            fetch(CONFIG.ENDPOINT_LIBERAR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
                body: JSON.stringify({ url: url })
            }).catch(function () {});
        });
    }

    async function cancelarCola() {
        await cargarColaEnMemoria();
        var cancelables = S.colaCache.filter(function (x) { return x.etapa === 'pendiente' || x.etapa === 'subida'; });
        if (!cancelables.length) return;

        var ok = window.csConfirm ? await window.csConfirm({ titulo: 'Cancelar subida', mensaje: 'Se cancelará la publicación pendiente.', textoOk: 'Cancelar subida', peligroso: true }) : confirm('¿Cancelar la subida?');
        if (!ok) return;

        for (var i = 0; i < cancelables.length; i++) {
            if (cancelables[i].url) liberarArchivoSubido(cancelables[i].url);
            await colaBorrar(cancelables[i].id).catch(function () {});
        }
        await cargarColaEnMemoria();
        actualizarEstadoCola();
    }

    /* ----------------------------------------------------------------
       Encolar una publicación nueva (lo llama el botón Publicar)
       ---------------------------------------------------------------- */
    async function subirVideo() {
        // ✅ LEEMOS DEL ESTADO GLOBAL, NO DEL DOM OCULTO
        var file = S.archivoVideo;
        if (!file) { U.showToast('Selecciona un video', 'warning'); return; }
        if (file.size > CONFIG.LIMITE_SUBIDA_MB * 1024 * 1024) { U.showToast('El video supera ' + CONFIG.LIMITE_SUBIDA_MB + ' MB', 'warning'); return; }

        var session = await U.getSession();
        if (!session) { U.showToast('Inicia sesión para publicar', 'error'); return; }

        var pub = VA.state;

        var titulo = valorInputSeguro('inputTituloVideo').trim();
        var descripcion = valorInputSeguro('inputDescripcionVideo').trim();

        var item = {
            id: 'v' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            creado: Date.now(),
            usuarioId: session.user.id,
            file: file,
            nombre: file.name || ('video-' + Date.now() + '.mp4'),
            titulo: titulo, descripcion: descripcion,
            sonidoUrl: pub.sonidoUrl || null, sonidoNombre: pub.sonidoNombre || null,
            ubicacionNombre: pub.ubicacionNombre || null, latitud: pub.latitud || null, longitud: pub.longitud || null,
            etapa: 'pendiente', intentos: 0, siguienteIntento: 0, espera: false,
            url: null, path: null, videoId: null, jobId: null
        };

        try { await colaGuardar(item); } catch (e) { U.showToast('No se pudo guardar el video en el dispositivo', 'error'); return; }

        if (typeof window.csResetFormularioPublicacion === 'function') window.csResetFormularioPublicacion();
        if (VA.hojas) VA.hojas.cerrarHoja('hojaPublicar');
        U.showToast('Tu video se está publicando', 'success', 2500);

        await cargarColaEnMemoria();
        actualizarEstadoCola();
        procesarCola();
    }

    /* ----------------------------------------------------------------
       Seguimiento del procesamiento en el servidor
       ---------------------------------------------------------------- */
    function seguirJob(jobId, videoId) {
        if (!jobId) return;
        if (S.jobsSeguidos[jobId]) { try { clearInterval(S.jobsSeguidos[jobId]); } catch (e) {} delete S.jobsSeguidos[jobId]; }

        var intentos = 0;
        var temporizador = setInterval(async function () {
            intentos++;
            if (intentos > CONFIG.SONDEO_JOB_MAX) { detenerJob(jobId, temporizador, null); return; }
            try {
                var session = await U.getSession();
                if (!session) return;

                var r = await U.fetchConTimeout(CONFIG.ENDPOINT_ESTADO_VIDEO + encodeURIComponent(jobId), {
                    headers: { 'Authorization': 'Bearer ' + session.access_token }
                }, CONFIG.TIMEOUT_ESTADO_MS);

                if (!r || !r.ok) return;
                var d = jsonSeguro(await U.leerJSONSeguro(r));
                if (!d || d.success !== true) return;

                S.progresoJob = typeof d.progreso === 'number' ? d.progreso : null;
                actualizarEstadoCola();

                if (d.estado === 'completado') detenerJob(jobId, temporizador, true);
                else if (d.estado === 'fallido') detenerJob(jobId, temporizador, false);
            } catch (e) {}
        }, CONFIG.SONDEO_JOB_MS);

        S.jobsSeguidos[jobId] = temporizador;
        actualizarEstadoCola();
    }

    function detenerJob(jobId, temporizador, exito) {
        try { clearInterval(temporizador); } catch (e) {}
        delete S.jobsSeguidos[jobId];
        S.progresoJob = null;
        actualizarEstadoCola();

        if (exito === true) {
            U.showToast('Video publicado', 'success', 2500);
            if (VA.feed && typeof VA.feed.cargarVideos === 'function') { try { VA.feed.cargarVideos(); } catch (e) {} }
        } else if (exito === false) {
            U.showToast('No se pudo procesar tu video', 'error', 4000);
        }
    }

    async function reanudarJobsPendientes() {
        var sb = VA.cliente();
        if (!S.sessionUser || !sb) return;
        try {
            var r = await sb.from(CONFIG.TABLA_VIDEO_JOBS).select('job_id, video_id').eq('usuario_id', S.sessionUser.id).in('estado', ['pendiente', 'procesando']);
            (r.data || []).forEach(function (j) {
                if (j && j.job_id && !S.jobsSeguidos[j.job_id]) seguirJob(j.job_id, j.video_id);
            });
        } catch (e) {}
    }

    async function marcarColaComoReintentable() {
        try { await cargarColaEnMemoria(); } catch (e) { S.colaCache = S.colaCache || []; }
        var cambiados = [];
        S.colaCache.forEach(function (x) {
            if (!x) return;
            if (x.espera) { x.espera = false; x.intentos = 0; x.siguienteIntento = 0; cambiados.push(x); }
        });
        for (var i = 0; i < cambiados.length; i++) { try { await colaGuardar(cambiados[i]); } catch (e) {} }
        await cargarColaEnMemoria();
        actualizarEstadoCola();
        if (S.colaCache.length > 0 && navigator.onLine !== false) procesarCola();
    }

    VA.cola = {
        cargarColaEnMemoria: cargarColaEnMemoria,
        procesarCola: procesarCola,
        actualizarEstadoCola: actualizarEstadoCola,
        cancelarCola: cancelarCola,
        subirVideo: subirVideo,
        seguirJob: seguirJob,
        reanudarJobsPendientes: reanudarJobsPendientes,
        marcarColaComoReintentable: marcarColaComoReintentable
    };

    window.subirVideo = subirVideo;
})();