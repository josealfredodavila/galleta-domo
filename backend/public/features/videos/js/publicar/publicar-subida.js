/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · SUBIDA (v1.2)
   ================================================================
   Sexto módulo de la división de videos-publicar.js.
   - Valida el tipo y el tamaño del archivo antes de subir.
   - La comprobación de legibilidad del video ya NO bloquea la subida:
     si el navegador no puede leer metadatos (HEVC, .mov, equipos lentos),
     se registra en consola y el servidor (worker) decide.
   - Deduce el tipo MIME por extensión cuando file.type viene vacío.
   - Sube a /api/media/upload con el token de sesión y tiempo límite.
   - Si el servidor responde cuota_excedida, muestra el aviso de cuota.
   - Expone subirMultimedia, usado por el contrato global de la entrada.
   Los proveedores R2 y S3 no están habilitados (Fase 3) y devuelven error.
   Dependencias en tiempo de uso:
     NS.borradores → mostrarAvisoCuota
   Expuesto en NS.subida.
   Requiere: publicar-base.js, publicar-ui.js.
   ================================================================ */

(function () {
    'use strict';

    var NS = window.VideosPublicarNS;
    if (!NS || !NS.C || !NS.u || !NS.state || !NS.ui) {
        console.error('[VideosPublicar] publicar-subida.js requiere base y ui.');
        return;
    }
    if (NS.subida) return;

    var C = NS.C;
    var U = NS.u;

    var TIMEOUT_LEGIBILIDAD_MS = 15000;
    var TIMEOUT_SUBIDA_MS = 900000;

    var EXT_MIME = {
        mp4: 'video/mp4',
        m4v: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime'
    };

    /* ----------------------------------------------------------------
       TIPO DEL ARCHIVO
       ---------------------------------------------------------------- */

    /* Usa file.type; si viene vacío (pasa en algunos Android), deduce por extensión. */
    function tipoEfectivo(archivo) {
        if (archivo.type) return archivo.type;
        var partes = String(archivo.name || '').toLowerCase().split('.');
        var ext = partes.length > 1 ? partes.pop() : '';
        return EXT_MIME[ext] || '';
    }

    /* ----------------------------------------------------------------
       VALIDACIÓN DEL ARCHIVO
       ---------------------------------------------------------------- */

    /* Intenta leer los metadatos del video en el navegador.
       Devuelve true si se pudo leer, false si no. No bloquea la subida:
       el servidor es quien valida el video definitivamente. */
    function validarIntegridadVideo(file) {
        return new Promise(function (resolve) {
            var url = U.crearObjectURL(file);
            var v = document.createElement('video');
            v.preload = 'metadata';
            v.muted = true;

            var temporizador = setTimeout(function () {
                U.revocarObjectURL(url);
                resolve(false);
            }, TIMEOUT_LEGIBILIDAD_MS);

            v.onloadedmetadata = function () {
                clearTimeout(temporizador);
                U.revocarObjectURL(url);
                resolve(true);
            };

            v.onerror = function () {
                clearTimeout(temporizador);
                U.revocarObjectURL(url);
                resolve(false);
            };

            v.src = url;
        });
    }

    /* Valida tipo y tamaño según el proveedor activo. Devuelve un mensaje de error o null. */
    function validarArchivo(archivo, tipo) {
        if (!archivo) return 'Archivo vacío';

        var mime = tipoEfectivo(archivo);

        if (tipo === 'video' && C.CONFIG.VIDEO_TYPES.indexOf(mime) === -1) {
            return 'Formato de video no soportado. Usa MP4, WebM o MOV.';
        }
        if (tipo === 'imagen' && C.CONFIG.IMAGE_TYPES.indexOf(mime) === -1) {
            return 'Formato de imagen no soportado';
        }

        var limiteMB = C.CONFIG.PROVIDER === 'supabase'
            ? C.CONFIG.MAX_VIDEO_MB
            : C.CONFIG.MAX_VIDEO_MB_R2;

        if (tipo === 'video' && archivo.size > limiteMB * 1024 * 1024) {
            return 'El archivo supera ' + limiteMB + ' MB';
        }

        return null;
    }

    /* ----------------------------------------------------------------
       AVISO DE CUOTA
       Vive en NS.borradores. Si aún no está cargado, usa el respaldo global.
       ---------------------------------------------------------------- */

    function mostrarAvisoCuota(cuota) {
        if (NS.borradores && typeof NS.borradores.mostrarAvisoCuota === 'function') {
            NS.borradores.mostrarAvisoCuota(cuota);
            return;
        }
        if (window.VideosPublicar && typeof window.VideosPublicar.mostrarAvisoCuota === 'function') {
            window.VideosPublicar.mostrarAvisoCuota(cuota);
        }
    }

    /* ----------------------------------------------------------------
       MENSAJES DE ERROR DEL SERVIDOR
       ---------------------------------------------------------------- */

    function mensajeErrorServidor(status, data) {
        if (status === 401 || status === 403) {
            return 'Tu sesión expiró. Vuelve a iniciar sesión.';
        }
        if (status === 413) {
            return 'El video es demasiado grande para el servidor.';
        }
        if (data && data.error) return data.error;
        return 'No se pudo subir el archivo (error ' + status + ').';
    }

    /* ----------------------------------------------------------------
       SUBIDA A SUPABASE (proveedor activo)
       ---------------------------------------------------------------- */

    async function subirMultimediaSupabase(archivo, tipo) {
        var session = await U.obtenerSesion();
        if (!session || !session.access_token) {
            return { ok: false, error: 'Tu sesión no está activa. Vuelve a iniciar sesión.' };
        }
        var token = session.access_token;

        if (tipo === 'video') {
            var legible = await validarIntegridadVideo(archivo);
            if (!legible) {
                U.warn('El navegador no pudo leer metadatos del video; se envía y el servidor lo valida.');
            }
        }

        var fd = new FormData();
        fd.append('file', archivo);
        fd.append('destino', C.CONFIG.BUCKET);
        fd.append('tipo', tipo);

        var controlador = typeof AbortController === 'function' ? new AbortController() : null;
        var temporizador = controlador
            ? setTimeout(function () { controlador.abort(); }, TIMEOUT_SUBIDA_MS)
            : null;

        var respuesta;
        var data = null;

        try {
            respuesta = await fetch('/api/media/upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: fd,
                signal: controlador ? controlador.signal : undefined
            });

            try {
                data = await respuesta.json();
            } catch (e) {
                data = {};
            }
        } catch (e) {
            U.warn('Error de red subiendo archivo:', e);
            var tiempoAgotado = e && e.name === 'AbortError';
            return {
                ok: false,
                error: tiempoAgotado
                    ? 'La subida tardó demasiado. Revisa tu conexión e intenta de nuevo.'
                    : 'No se pudo conectar con el servidor'
            };
        } finally {
            if (temporizador) clearTimeout(temporizador);
        }

        if (!respuesta.ok || !data || !data.ok) {
            /* Cuota excedida: muestra el aviso y devuelve el detalle para la cola. */
            if (data && data.error === 'cuota_excedida') {
                var cuota = {
                    plan: data.plan,
                    limite_mb: data.limite_mb,
                    usado_mb: data.usado_mb,
                    disponible_mb: data.disponible_mb
                };
                mostrarAvisoCuota(cuota);
                return {
                    ok: false,
                    error: data.mensaje || 'Alcanzaste el límite de tu espacio.',
                    cuotaExcedida: true,
                    status: respuesta.status,
                    cuota: cuota
                };
            }

            return {
                ok: false,
                error: mensajeErrorServidor(respuesta.status, data),
                status: respuesta.status
            };
        }

        return { ok: true, url: data.url, path: data.path, provider: 'supabase' };
    }

    /* Proveedores pendientes (Fase 3 del proyecto). */
    async function subirMultimediaR2() {
        return { ok: false, error: 'Proveedor R2 aún no habilitado (Fase 3 del proyecto)' };
    }

    async function subirMultimediaS3() {
        return { ok: false, error: 'Proveedor S3 aún no habilitado (Fase 3 del proyecto)' };
    }

    /* ----------------------------------------------------------------
       PUNTO DE ENTRADA PÚBLICO
       ---------------------------------------------------------------- */

    /* Sube un archivo según el proveedor activo.
       Devuelve { ok, url, path, provider } o { ok:false, error, ... }. */
    async function subirMultimedia(archivo, tipo) {
        var errorValidacion = validarArchivo(archivo, tipo);
        if (errorValidacion) return { ok: false, error: errorValidacion };

        try {
            if (C.CONFIG.PROVIDER === 'supabase') return await subirMultimediaSupabase(archivo, tipo);
            if (C.CONFIG.PROVIDER === 'r2') return await subirMultimediaR2();
            if (C.CONFIG.PROVIDER === 's3') return await subirMultimediaS3();
            return { ok: false, error: 'Provider desconocido' };
        } catch (e) {
            U.warn('Error subiendo:', e);
            return { ok: false, error: (e && e.message) || String(e) };
        }
    }

    /* ----------------------------------------------------------------
       EXPOSICIÓN
       ---------------------------------------------------------------- */

    NS.subida = {
        subirMultimedia: subirMultimedia,
        validarArchivo: validarArchivo,
        validarIntegridadVideo: validarIntegridadVideo,
        mostrarAvisoCuota: mostrarAvisoCuota,
        tipoEfectivo: tipoEfectivo
    };
})();