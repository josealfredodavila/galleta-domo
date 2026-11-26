// ================================================================
// CSARIEL'S · VIDEOS · COLA DE SUBIDA (v1.2)
// ================================================================
// Subida de videos en segundo plano con reintentos.
// Flujo por cada item:
//   1. pendiente  → sube el archivo a /api/media/upload
//   2. subida     → registra la fila en la tabla videos (estado 'procesando')
//   3. registrado → pide el procesamiento a /api/video/queue
//   4. jobId      → se sigue hasta 'completado' o 'fallido'
//
// v1.2:
//  - No depende de las utilidades de videos-utils.js: tiene sus propias
//    funciones de sesión, red y lectura de JSON. Antes, si faltaba una
//    de esas utilidades, la subida fallaba sin mostrar nada.
//  - Si falta alguna clave de videos-config.js usa un valor por defecto.
//  - Si el navegador deja vacío el tipo del video (pasa en Android),
//    se deduce por la extensión antes de subirlo.
//  - Los errores se muestran en la tarjeta de subida (#colaEstado),
//    para que se vean sin abrir la consola.
//  - Cancelar (#colaCancelar) queda conectado aquí.
// Expuesto en window.VideosApp.cola y window.subirVideo.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA) {
        console.error('[Videos] videos-cola.js requiere window.VideosApp.');
        return;
    }
    if (VA.cola) return;

    var CONFIG = VA.CONFIG || {};
    var S = VA.state || (VA.state = {});

    S.colaCache = S.colaCache || [];
    S.jobsSeguidos = S.jobsSeguidos || {};
    if (S.progresoJob === undefined) S.progresoJob = null;
    if (!S.colaOcupada) S.colaOcupada = false;
    if (!S.mensajeError) S.mensajeError = '';

    /* Valores por defecto: se usan solo si videos-config.js no define la clave. */
    var C = {
        ENDPOINT_UPLOAD: CONFIG.ENDPOINT_UPLOAD || '/api/media/upload',
        ENDPOINT_COLA_VIDEO: CONFIG.ENDPOINT_COLA_VIDEO || '/api/video/queue',
        ENDPOINT_ESTADO_VIDEO: CONFIG.ENDPOINT_ESTADO_VIDEO || '/api/video/estado/',
        ENDPOINT_LIBERAR: CONFIG.ENDPOINT_LIBERAR || '/api/media/liberar',
        TABLA_VIDEOS: CONFIG.TABLA_VIDEOS || 'videos',
        TABLA_VIDEO_JOBS: CONFIG.TABLA_VIDEO_JOBS || 'video_jobs',
        COLA_DB: CONFIG.COLA_DB || 'csVideosCola',
        COLA_VERSION: CONFIG.COLA_VERSION || 1,
        COLA_STORE: CONFIG.COLA_STORE || 'cola',
        LIMITE_SUBIDA_MB: CONFIG.LIMITE_SUBIDA_MB || 100,
        MAX_INTENTOS: CONFIG.MAX_INTENTOS || 5,
        TIMEOUT_SUBIDA_MS: CONFIG.TIMEOUT_SUBIDA_MS || 600000,
        TIMEOUT_COLA_MS: CONFIG.TIMEOUT_COLA_MS || 30000,
        TIMEOUT_ESTADO_MS: CONFIG.TIMEOUT_ESTADO_MS || 10000,
        SONDEO_JOB_MS: CONFIG.SONDEO_JOB_MS || 4000,
        SONDEO_JOB_MAX: CONFIG.SONDEO_JOB_MAX || 150
    };

    /* ----------------------------------------------------------------
       Helpers propios (no dependen de videos-utils.js)
       ---------------------------------------------------------------- */

    function mostrarToast(msg, tipo, ms) {
        if (VA.utils && typeof VA.utils.showToast === 'function') {
            VA.utils.showToast(msg, tipo, ms);
        } else if (typeof window.csToast === 'function') {
            window.csToast(msg, tipo);
        } else {
            console.log('[Videos]', msg);
        }
    }

    function sbCliente() {
        try {
            if (typeof VA.cliente === 'function') {
                var c = VA.cliente();
                if (c) return c;
            }
        } catch (e) {}
        return window.supabaseClient || null;
    }

    async function obtenerSesion() {
        var sb = sbCliente();
        if (!sb) return null;
        try {
            var r = await sb.auth.getSession();
            return (r && r.data && r.data.session) || null;
        } catch (e) {
            return null;
        }
    }

    function fetchConTimeout(url, opts, ms) {
        var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        var temporizador = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
        var o = Object.assign({}, opts || {});
        if (ctrl) o.signal = ctrl.signal;
        return fetch(url, o).finally(function () {
            if (temporizador) clearTimeout(temporizador);
        });
    }

    async function leerJson(r) {
        try {
            var j = await r.json();
            return j && typeof j === 'object' ? j : {};
        } catch (e) {
            return {};
        }
    }

    function errorEtapa(etapa, r, j) {
        var detalle = (j && (j.error || j.mensaje)) || ('HTTP ' + (r ? r.status : 'sin respuesta'));
        return new Error(etapa + ': ' + detalle);
    }

    /* Tipo MIME del video: si el navegador no lo dio, se deduce por la extensión. */
    function mimeDe(file) {
        if (file && file.type) return file.type;
        var ext = String((file && file.name) || '').toLowerCase().split('.').pop();
        var mapa = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
        return mapa[ext] || 'video/mp4';
    }

    /* Archivo listo para subir, con tipo MIME válido. */
    function archivoParaSubir(it) {
        var f = it.file;
        if (f && f.type) return f;
        return new File([f], it.nombre || 'video.mp4', { type: mimeDe(f) });
    }

    function cerrarHojaPublicar() {
        if (VA.hojas && typeof VA.hojas.cerrarHoja === 'function') {
            VA.hojas.cerrarHoja('hojaPublicar');
        }
    }

    function valorInputSeguro(id) {
        try {
            var el = document.getElementById(id);
            return el && typeof el.value === 'string' ? el.value : '';
        } catch (e) {
            return '';
        }
    }

    function jsonSeguro(datos) {
        return datos && typeof datos === 'object' ? datos : {};
    }

    /* ----------------------------------------------------------------
       IndexedDB: almacén de la cola
       ---------------------------------------------------------------- */

    function colaAbrir() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(C.COLA_DB, C.COLA_VERSION);
            req.onupgradeneeded = function () {
                if (!req.result.objectStoreNames.contains(C.COLA_STORE)) {
                    req.result.createObjectStore(C.COLA_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function colaOperar(modo, operar) {
        return colaAbrir().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(C.COLA_STORE, modo);
                var store = tx.objectStore(C.COLA_STORE);
                var peticion = operar(store);
                tx.oncomplete = function () {
                    db.close();
                    resolve(peticion ? peticion.result : undefined);
                };
                tx.onerror = function () { db.close(); reject(tx.error); };
                tx.onabort = function () { db.close(); reject(tx.error); };
            });
        });
    }

    function colaGuardar(item) {
        return colaOperar('readwrite', function (s) { return s.put(item); });
    }

    function colaBorrar(id) {
        return colaOperar('readwrite', function (s) { return s.delete(id); });
    }

    function colaLeerTodos() {
        return colaOperar('readonly', function (s) { return s.getAll(); });
    }

    async function cargarColaEnMemoria() {
        try {
            S.colaCache = (await colaLeerTodos()) || [];
        } catch (e) {
            S.colaCache = [];
        }
    }

    function colaProgramar(ms) {
        clearTimeout(S.colaTimer);
        S.colaTimer = setTimeout(procesarCola, Math.max(1000, ms));
    }

    /* ----------------------------------------------------------------
       Barra de estado de la cola (tarjeta de subida)
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
        if (S.mensajeError) {
            mensaje = S.mensajeError;
        } else if (hayCola) {
            var enEspera = sinRed || S.colaCache.some(function (x) { return x.espera; });
            mensaje = enEspera
                ? 'Tu video se subirá cuando vuelva la conexión'
                : 'Subiendo tu video…';
        } else if (jobs) {
            mensaje = 'Procesando tu video' +
                (S.progresoJob !== null ? ' · ' + S.progresoJob + '%' : '…');
        }

        caja.hidden = !(hayCola || jobs || S.mensajeError);
        txt.textContent = mensaje;
        if (btn) btn.hidden = !hayCola;
    }

    /* ----------------------------------------------------------------
       Procesamiento de la cola
       ---------------------------------------------------------------- */

    async function procesarCola() {
        if (S.colaOcupada) return;
        if (navigator.onLine === false) {
            actualizarEstadoCola();
            return;
        }

        S.colaOcupada = true;
        try {
            await cargarColaEnMemoria();
            if (!S.colaCache.length) return;

            var session = await obtenerSesion();
            if (!session) {
                S.mensajeError = 'Inicia sesión para terminar de publicar tu video.';
                return;
            }

            var pendientes = S.colaCache.slice().sort(function (a, b) { return a.creado - b.creado; });

            for (var i = 0; i < pendientes.length; i++) {
                var it = pendientes[i];
                if (it.espera) continue;
                if (it.siguienteIntento && it.siguienteIntento > Date.now()) continue;

                await avanzarItem(it, session);
                if (navigator.onLine === false) break;
            }

            await cargarColaEnMemoria();

            var proximos = S.colaCache
                .filter(function (x) { return !x.espera && x.siguienteIntento > Date.now(); })
                .map(function (x) { return x.siguienteIntento; });
            if (proximos.length) colaProgramar(Math.min.apply(null, proximos) - Date.now());
        } catch (e) {
            console.error('[Videos] Error en la cola:', e);
            S.mensajeError = 'Error en la cola: ' + ((e && e.message) || e);
        } finally {
            S.colaOcupada = false;
            actualizarEstadoCola();
        }
    }

    /* Lleva un item por las etapas pendiente → subida → registrado → jobId.
       Cada etapa completada se guarda antes de seguir. */
    async function avanzarItem(it, session) {
        try {
            // Etapa 1: subir el archivo
            if (it.etapa === 'pendiente') {
                var fd = new FormData();
                fd.append('file', archivoParaSubir(it), it.nombre || 'video.mp4');
                fd.append('destino', 'videos');
                fd.append('tipo', 'video');

                var r = await fetchConTimeout(C.ENDPOINT_UPLOAD, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + session.access_token },
                    body: fd
                }, C.TIMEOUT_SUBIDA_MS);

                var j = jsonSeguro(await leerJson(r));

                if (j.error === 'cuota_excedida') {
                    var fc = new Error('cuota');
                    fc.fatal = true;
                    fc.cuota = {
                        plan: j.plan,
                        limite_mb: j.limite_mb,
                        usado_mb: j.usado_mb,
                        disponible_mb: j.disponible_mb
                    };
                    throw fc;
                }
                if (!r.ok || !j.ok || !j.url) {
                    throw errorEtapa('Subida', r, j);
                }

                it.url = j.url;
                it.path = j.path;
                it.etapa = 'subida';
                await colaGuardar(it);
            }

            // Etapa 2: registrar el video en la tabla videos
            if (it.etapa === 'subida') {
                var sb = sbCliente();
                if (!sb) throw new Error('Registro: no hay conexión con la base de datos');

                var ins = await sb.from(C.TABLA_VIDEOS).insert({
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
                    throw new Error('Registro: ' + String(ins.error.message || ''));
                }

                it.videoId = ins.data.id;
                it.etapa = 'registrado';
                await colaGuardar(it);
            }

            // Etapa 3: pedir el procesamiento del video
            if (it.etapa === 'registrado') {
                var q = await fetchConTimeout(C.ENDPOINT_COLA_VIDEO, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + session.access_token
                    },
                    body: JSON.stringify({
                        videoId: it.videoId,
                        videoUrl: it.url,
                        bucket: 'videos',
                        filePath: it.path,
                        audioUrl: it.sonidoUrl || null
                    })
                }, C.TIMEOUT_COLA_MS);

                var qj = jsonSeguro(await leerJson(q));
                if (!q.ok || !qj.success || !qj.jobId) {
                    throw errorEtapa('Procesamiento', q, qj);
                }

                it.jobId = qj.jobId;
            }

            // Listo: quitar de la cola y seguir el procesamiento
            await colaBorrar(it.id);
            S.mensajeError = '';
            seguirJob(it.jobId, it.videoId);
            return true;

        } catch (e) {
            // Error fatal: se descarta el item y se avisa al usuario.
            if (e.fatal) {
                await colaBorrar(it.id).catch(function () {});
                if (it.videoId) await marcarVideoConError(it.videoId);

                S.mensajeError = '';
                if (e.cuota && window.VideosPublicar && typeof window.VideosPublicar.mostrarAvisoCuota === 'function') {
                    window.VideosPublicar.mostrarAvisoCuota(e.cuota);
                } else {
                    S.mensajeError = 'No se pudo publicar tu video: se alcanzó el límite de tu espacio.';
                    mostrarToast('No se pudo publicar tu video', 'error', 4500);
                }
                return false;
            }

            // Error reintentable: espera creciente, o marca en espera al llegar al límite.
            it.intentos = (it.intentos || 0) + 1;
            if (it.intentos >= C.MAX_INTENTOS) {
                it.espera = true;
                it.siguienteIntento = 0;
                S.mensajeError = 'No pudimos subir tu video: ' + String(e.message || e) +
                    '. Se intentará de nuevo al volver la conexión.';
            } else {
                it.siguienteIntento = Date.now() + Math.min(120000, 3000 * Math.pow(2, it.intentos));
                S.mensajeError = 'Reintentando la subida (' + it.intentos + '/' + C.MAX_INTENTOS + '): ' +
                    String(e.message || e);
            }
            it.ultimoError = String(e.message || '');
            await colaGuardar(it).catch(function () {});
            console.error('[Videos] Error en la subida:', e);
            return false;
        }
    }

    async function marcarVideoConError(id) {
        try {
            var sb = sbCliente();
            if (sb && id) {
                await sb.from(C.TABLA_VIDEOS)
                    .update({ estado: 'error_procesamiento' })
                    .eq('id', id);
            }
        } catch (e) {}
    }

    function liberarArchivoSubido(url) {
        obtenerSesion().then(function (session) {
            if (!session || !url) return;
            fetch(C.ENDPOINT_LIBERAR, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.access_token
                },
                body: JSON.stringify({ url: url })
            }).catch(function () {});
        });
    }

    async function cancelarCola() {
        await cargarColaEnMemoria();

        var cancelables = S.colaCache.filter(function (x) {
            return x.etapa === 'pendiente' || x.etapa === 'subida';
        });
        if (!cancelables.length) return;

        var ok = window.csConfirm
            ? await window.csConfirm({
                titulo: 'Cancelar subida',
                mensaje: 'Se cancelará la publicación pendiente.',
                textoOk: 'Cancelar subida',
                peligroso: true
            })
            : confirm('¿Cancelar la subida?');
        if (!ok) return;

        for (var i = 0; i < cancelables.length; i++) {
            if (cancelables[i].url) liberarArchivoSubido(cancelables[i].url);
            await colaBorrar(cancelables[i].id).catch(function () {});
        }

        S.mensajeError = '';
        await cargarColaEnMemoria();
        actualizarEstadoCola();
    }

    /* ----------------------------------------------------------------
       Encolar una publicación nueva (lo llama el botón Publicar)
       ---------------------------------------------------------------- */

    async function subirVideo() {
        var input = document.getElementById('inputArchivoVideo');
        var file = input && input.files && input.files[0];
        if (!file) {
            mostrarToast('Primero elige un video de tu galería', 'warning');
            return;
        }

        var limiteBytes = C.LIMITE_SUBIDA_MB * 1024 * 1024;
        if (file.size > limiteBytes) {
            mostrarToast('El video supera ' + C.LIMITE_SUBIDA_MB + ' MB', 'warning');
            return;
        }

        var session = await obtenerSesion();
        if (!session) {
            mostrarToast('Inicia sesión para publicar', 'error');
            return;
        }

        var pub = (window.VideosPublicar && window.VideosPublicar.getState) ? window.VideosPublicar.getState() : {};

        var titulo = valorInputSeguro('inputTituloVideo').trim();
        var descripcion = valorInputSeguro('inputDescripcionVideo').trim();

        var item = {
            id: 'v' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            creado: Date.now(),
            usuarioId: session.user.id,
            file: file,
            nombre: file.name || ('video-' + Date.now() + '.mp4'),
            titulo: titulo,
            descripcion: descripcion,
            sonidoUrl: pub.sonidoUrl || null,
            sonidoNombre: pub.sonidoNombre || null,
            ubicacionNombre: pub.ubicacionNombre || null,
            latitud: pub.latitud || null,
            longitud: pub.longitud || null,
            etapa: 'pendiente',
            intentos: 0,
            siguienteIntento: 0,
            espera: false,
            url: null,
            path: null,
            videoId: null,
            jobId: null
        };

        try {
            await colaGuardar(item);
        } catch (e) {
            mostrarToast('No se pudo guardar el video en el dispositivo', 'error');
            return;
        }

        S.mensajeError = '';
        if (typeof window.csResetFormularioPublicacion === 'function') window.csResetFormularioPublicacion();
        cerrarHojaPublicar();
        mostrarToast('Tu video se está publicando', 'success', 2500);

        await cargarColaEnMemoria();
        actualizarEstadoCola();
        procesarCola();
    }

    /* ----------------------------------------------------------------
       Seguimiento del procesamiento en el servidor
       ---------------------------------------------------------------- */

    function seguirJob(jobId, videoId) {
        if (!jobId) return;

        if (S.jobsSeguidos[jobId]) {
            try { clearInterval(S.jobsSeguidos[jobId]); } catch (e) {}
            delete S.jobsSeguidos[jobId];
        }

        var intentos = 0;
        var temporizador = setInterval(async function () {
            intentos++;
            if (intentos > C.SONDEO_JOB_MAX) {
                detenerJob(jobId, temporizador, null);
                return;
            }
            try {
                var session = await obtenerSesion();
                if (!session) return;

                var r = await fetchConTimeout(C.ENDPOINT_ESTADO_VIDEO + encodeURIComponent(jobId), {
                    headers: { 'Authorization': 'Bearer ' + session.access_token }
                }, C.TIMEOUT_ESTADO_MS);

                if (!r || !r.ok) return;

                var d = jsonSeguro(await leerJson(r));
                if (d.success !== true) return;

                S.progresoJob = typeof d.progreso === 'number' ? d.progreso : null;
                actualizarEstadoCola();

                if (d.estado === 'completado') detenerJob(jobId, temporizador, true);
                else if (d.estado === 'fallido') detenerJob(jobId, temporizador, false);
            } catch (e) {
                // Un fallo de red puntual no rompe el seguimiento.
            }
        }, C.SONDEO_JOB_MS);

        S.jobsSeguidos[jobId] = temporizador;
        actualizarEstadoCola();
    }

    function detenerJob(jobId, temporizador, exito) {
        try { clearInterval(temporizador); } catch (e) {}
        delete S.jobsSeguidos[jobId];
        S.progresoJob = null;
        actualizarEstadoCola();

        if (exito === true) {
            mostrarToast('Video publicado', 'success', 2500);
            if (VA.feed && typeof VA.feed.cargarVideos === 'function') {
                try { VA.feed.cargarVideos(); } catch (e) {}
            }
        } else if (exito === false) {
            S.mensajeError = 'No se pudo procesar tu video.';
            actualizarEstadoCola();
            mostrarToast('No se pudo procesar tu video', 'error', 4000);
        }
    }

    async function reanudarJobsPendientes() {
        var session = await obtenerSesion();
        var sb = sbCliente();
        if (!session || !sb) return;
        try {
            var r = await sb.from(C.TABLA_VIDEO_JOBS)
                .select('job_id, video_id')
                .eq('usuario_id', session.user.id)
                .in('estado', ['pendiente', 'procesando']);
            (r.data || []).forEach(function (j) {
                if (j && j.job_id && !S.jobsSeguidos[j.job_id]) {
                    seguirJob(j.job_id, j.video_id);
                }
            });
        } catch (e) {}
    }

    async function marcarColaComoReintentable() {
        await cargarColaEnMemoria();

        var cambiados = [];
        S.colaCache.forEach(function (x) {
            if (x && x.espera) {
                x.espera = false;
                x.intentos = 0;
                x.siguienteIntento = 0;
                cambiados.push(x);
            }
        });

        for (var i = 0; i < cambiados.length; i++) {
            try { await colaGuardar(cambiados[i]); } catch (e) {}
        }

        await cargarColaEnMemoria();
        actualizarEstadoCola();

        if (S.colaCache.length > 0 && navigator.onLine !== false) {
            procesarCola();
        }
    }

    /* ----------------------------------------------------------------
       Exposición
       ---------------------------------------------------------------- */

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

    var btnCancelar = document.getElementById('colaCancelar');
    if (btnCancelar && !btnCancelar.dataset.conectado) {
        btnCancelar.dataset.conectado = '1';
        btnCancelar.addEventListener('click', function () { cancelarCola(); });
    }

    /* Contrato global: el formulario llama a subirVideo. */
    window.subirVideo = subirVideo;

    /* Al cargar la página, muestra el estado de una cola que quedó pendiente. */
    cargarColaEnMemoria().then(actualizarEstadoCola);
})();