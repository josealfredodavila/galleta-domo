/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · SUBIDA (v1)
   ================================================================
   Sexto módulo de la división de videos-publicar.js.
   - Valida el tipo, el tamaño y la integridad del video antes de subir.
   - Sube el archivo a /api/media/upload con el token de sesión.
   - Si el servidor responde cuota_excedida, muestra el aviso de cuota.
   - Expone subirMultimedia, usado por el contrato global de la entrada.
   Los proveedores R2 y S3 no están habilitados (Fase 3) y devuelven error.
   Dependencias en tiempo de uso:
     NS.preview → mostrarAvisoCuota (desde publicar-ui o publicar-preview)
     NS.u.obtenerSesion, NS.u.crearObjectURL (base)
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

    /* Llama una función de otro módulo solo si ya existe. */
    function llamar(modulo, fn) {
        var args = Array.prototype.slice.call(arguments, 2);
        var m = NS[modulo];
        if (m && typeof m[fn] === 'function') return m[fn].apply(m, args);
        return undefined;
    }

    /* ----------------------------------------------------------------
       VALIDACIÓN DEL ARCHIVO
       ---------------------------------------------------------------- */

    /* Comprueba que el video se pueda abrir con un <video> antes de subirlo.
       Si el navegador no lo lee en 2 segundos, se considera dañado. */
    function validarIntegridadVideo(file) {
        return new Promise(function (resolve) {
            var url = U.crearObjectURL(file);
            var v = document.createElement('video');
            v.preload = 'metadata';
            v.muted = true;

            var timeout = setTimeout(function () {
                U.revocarObjectURL(url);
                resolve(false);
            }, 2000);

            v.onloadedmetadata = function () {
                clearTimeout(timeout);
                U.revocarObjectURL(url);
                resolve(true);
            };

            v.onerror = function () {
                clearTimeout(timeout);
                U.revocarObjectURL(url);
                resolve(false);
            };

            v.src = url;
        });
    }

    /* Valida tipo y tamaño según el proveedor activo. Devuelve un error o null. */
    function validarArchivo(archivo, tipo) {
        if (!archivo) return 'Archivo vacío';

        if (tipo === 'video' && C.CONFIG.VIDEO_TYPES.indexOf(archivo.type) === -1) {
            return 'Formato de video no soportado';
        }
        if (tipo === 'imagen' && C.CONFIG.IMAGE_TYPES.indexOf(archivo.type) === -1) {
            return 'Formato de imagen no soportado';
        }

        var limiteMB = C.CONFIG.PROVIDER === 'supabase'
            ? C.CONFIG.MAX_VIDEO_MB
            : C.CONFIG.MAX_VIDEO_MB_R2;

        if (tipo === 'video' && archivo.size > limiteMB * 1024 * 1024) {
            return 'Archivo supera ' + limiteMB + ' MB';
        }

        return null;
    }

    /* ----------------------------------------------------------------
       SUBIDA A SUPABASE (proveedor activo)
       ---------------------------------------------------------------- */

    async function subirMultimediaSupabase(archivo, tipo) {
        var session = await U.obtenerSesion();
        if (!session) return { ok: false, error: 'Sin sesión activa' };

        var token = session.access_token;
        if (!token) return { ok: false, error: 'Sin token de sesión' };

        if (tipo === 'video') {
            var esValido = await validarIntegridadVideo(archivo);
            if (!esValido) {
                return { ok: false, error: 'El archivo de video está corrupto o no es válido.' };
            }
        }

        var fd = new FormData();
        fd.append('file', archivo);
        fd.append('destino', C.CONFIG.BUCKET);
        fd.append('tipo', tipo);

        var respuesta;
        try {
            respuesta = await fetch('/api/media/upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: fd
            });
        } catch (e) {
            U.warn('Error de red subiendo archivo:', e);
            return { ok: false, error: 'No se pudo conectar con el servidor' };
        }

        var data = null;
        try {
            data = await respuesta.json();
        } catch (e) {
            data = {};
        }

        if (!respuesta.ok || !data.ok) {
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

            var mensaje = data && data.error ? data.error : 'No se pudo subir el archivo';
            return { ok: false, error: mensaje, status: respuesta.status };
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
       AVISO DE CUOTA (si el módulo de interfaz lo tiene, lo usa)
       ---------------------------------------------------------------- */

    function mostrarAvisoCuota(cuota) {
        if (NS.preview && typeof NS.preview.mostrarAvisoCuota === 'function') {
            NS.preview.mostrarAvisoCuota(cuota);
            return;
        }
        if (typeof window.VideosPublicar === 'object' && typeof window.VideosPublicar.mostrarAvisoCuota === 'function') {
            window.VideosPublicar.mostrarAvisoCuota(cuota);
        }
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
        mostrarAvisoCuota: mostrarAvisoCuota
    };
})();