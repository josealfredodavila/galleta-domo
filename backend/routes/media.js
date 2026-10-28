// ================================================================
// ROUTES/MEDIA.JS — Sariel's Ecosystem
// Subida centralizada con moderación y deduplicación por SHA-256
// ================================================================
// Endpoints:
//   POST /api/media/upload
//     multipart/form-data: file, destino, tipo ('imagen' | 'video')
//     Si el mismo contenido ya existe en ese destino, devuelve la URL
//     existente (reutilizado: true) sin moderar ni subir de nuevo.
//
//   POST /api/media/liberar
//     JSON: { url }
//     Borra el archivo de Storage SOLO si ninguna fila de la base lo
//     referencia. Si sigue en uso, no hace nada y lo informa.
// ================================================================

'use strict';

const express = require('express');
const multer = require('multer');
const { createHash } = require('node:crypto');

const { verificarToken } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { moderarImagen } = require('../services/moderacion/moderarImagen');
const { moderarVideo } = require('../services/moderacion/moderarVideo');

const router = express.Router();

// ================================================================
// CONFIGURACIÓN
// ================================================================

const LIMITE_IMAGEN_MB = 5;
const LIMITE_VIDEO_MB = 100;
const LIMITE_AVATAR_MB = 5;
const LIMITE_CHAT_VIDEO_MB = 50;

const DESTINOS = {
    'muro-imagenes': { tipo: 'imagen', limiteMB: LIMITE_IMAGEN_MB },
    'muro-videos': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_VIDEO_MB
    },
    'grupos-publicaciones': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_VIDEO_MB
    },
    'videos': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_VIDEO_MB
    },
    'sariels-avatars': { tipo: 'imagen', limiteMB: LIMITE_AVATAR_MB },
    // Historias: imágenes hasta 10 MB y videos hasta 25 MB (mismos límites que muro-historias.js)
    'sariels-estados': {
        tipo: 'auto',
        limiteMBImagen: 10,
        limiteMBVideo: 25
    },
    'chat-attachments': {
        tipo: 'auto',
        limiteMBImagen: LIMITE_IMAGEN_MB,
        limiteMBVideo: LIMITE_CHAT_VIDEO_MB
    },
    'mercado': { tipo: 'imagen', limiteMB: 3 }
};

// Columnas de la base que guardan una URL pública de Storage.
// Si se añade una tabla nueva con URLs de archivos, agrégala aquí:
// si no está, el sistema podría borrar un archivo que sigue en uso.
const COLUMNAS_CON_URL = [
    ['publicaciones', 'media_url'],
    ['publicaciones_publicas', 'media_url'],
    ['muro_posts', 'imagen_url'],
    ['muro_videos', 'url_video'],
    ['muro_videos', 'miniatura_url'],
    ['muro_tendencias', 'imagen_url'],
    ['muro_tokens_destacados', 'imagen_url'],
    ['videos', 'url_video'],
    ['videos', 'url_miniatura'],
    ['grupos_video', 'avatar_url'],
    ['grupos_video', 'portada_url'],
    ['grupos_video_publicaciones', 'imagen_url'],
    ['grupos_video_publicaciones', 'video_url'],
    ['grupos_video_publicaciones', 'miniatura_url'],
    ['grupos_video_videos', 'url'],
    ['grupos_video_videos', 'miniatura'],
    ['estados', 'media_url'],
    ['estados', 'imagen_url'],
    ['historias', 'media_url'],
    ['mensajes_chat', 'imagen_url'],
    ['albumes', 'portada_url'],
    ['usuarios', 'avatar_url'],
    ['usuarios', 'portada_url'],
    ['usuarios', 'avatar_verificacion_url'],
    ['perfil_usuario', 'avatar_url'],
    ['perfil_usuario', 'portada_url'],
    ['perfiles', 'portada_url'],
    ['fotos_perfil', 'url'],
    ['mercado_productos', 'video_url'],
    ['mercado_pedido_items', 'foto_url'],
    ['mercado_tiendas', 'logo_url'],
    ['mercado_tiendas', 'portada_url'],
    ['mercado_repartidores', 'selfie_url'],
    ['escuelas', 'logo_url'],
    ['ecosystem_branding', 'logo_url'],
    ['anuncios', 'media_url'],
    ['marketing_ads', 'imagen_url'],
    ['marketing_ads', 'video_url'],
    ['nfts_usuario', 'imagen_url'],
    ['media_watermark_records', 'processed_media_url']
];

// Columnas JSONB o arrays que guardan URLs dentro de un objeto.
// Se buscan con búsqueda de texto sobre la fila completa.
const TABLAS_CON_URL_EN_JSON = [
    'mercado_productos'
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ================================================================
// HELPERS
// ================================================================

function sha256Hex(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function generarNombreArchivo(usuarioId, extension) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `${usuarioId}/${timestamp}-${random}.${extension}`;
}

function extensionSegura(mime) {
    const mapa = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov'
    };
    return mapa[mime] || null;
}

// Extrae bucket y ruta de una URL pública de Supabase Storage.
function extraerBucketYRuta(url) {
    const marcador = '/storage/v1/object/public/';
    try {
        const parsed = new URL(url);
        const idx = parsed.pathname.indexOf(marcador);
        if (idx === -1) return null;

        const resto = decodeURIComponent(parsed.pathname.slice(idx + marcador.length));
        const separador = resto.indexOf('/');
        if (separador <= 0) return null;

        return {
            bucket: resto.slice(0, separador),
            path: resto.slice(separador + 1)
        };
    } catch (e) {
        return null;
    }
}

// Devuelve true si alguna tabla referencia la URL.
// Si una consulta falla, lanza error: en ese caso NO se borra nada.
async function estaReferenciada(url) {
    for (const [tabla, columna] of COLUMNAS_CON_URL) {
        const { count, error } = await supabaseAdmin
            .from(tabla)
            .select('*', { count: 'exact', head: true })
            .eq(columna, url);

        if (error) {
            throw new Error(`Verificación fallida en ${tabla}.${columna}: ${error.message}`);
        }
        if (count > 0) return true;
    }

    // Búsqueda dentro de columnas JSONB (por ejemplo, fotos de productos)
    for (const tabla of TABLAS_CON_URL_EN_JSON) {
        const { count, error } = await supabaseAdmin
            .from(tabla)
            .select('*', { count: 'exact', head: true })
            .like('fotos::text', `%${url}%`);

        if (error) {
            throw new Error(`Verificación fallida en ${tabla}.fotos: ${error.message}`);
        }
        if (count > 0) return true;
    }

    return false;
}

function logSubida(req, destino, resultado) {
    const usuario = (req.usuario && req.usuario.id) || 'desconocido';
    const fecha = new Date().toISOString();
    console.log(
        `[media] usuario=${usuario} fecha=${fecha} destino=${destino} resultado=${resultado}`
    );
}

// ================================================================
// POST /api/media/upload
// ================================================================

router.post(
    '/upload',
    verificarToken,
    upload.single('file'),
    async (req, res) => {
        const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);
        const destino = (req.body && req.body.destino) || '';
        const tipo = (req.body && req.body.tipo) || '';

        if (!usuarioId) {
            logSubida(req, destino, 'no_auth');
            return res.status(401).json({ ok: false, error: 'No autenticado' });
        }

        if (!DESTINOS[destino]) {
            logSubida(req, destino, 'destino_invalido');
            return res.status(400).json({ ok: false, error: 'Destino no permitido' });
        }

        if (!req.file || !req.file.buffer) {
            logSubida(req, destino, 'sin_archivo');
            return res.status(400).json({ ok: false, error: 'Archivo requerido' });
        }

        if (tipo !== 'imagen' && tipo !== 'video') {
            logSubida(req, destino, 'tipo_invalido');
            return res.status(400).json({ ok: false, error: 'Tipo inválido' });
        }

        const reglas = DESTINOS[destino];
        if (reglas.tipo === 'imagen' && tipo !== 'imagen') {
            logSubida(req, destino, 'tipo_no_permitido_en_destino');
            return res.status(400).json({ ok: false, error: 'Este destino solo acepta imágenes' });
        }

        const tamanioMB = req.file.size / 1024 / 1024;
        let limiteMB = reglas.limiteMB;
        if (reglas.tipo === 'auto') {
            limiteMB = tipo === 'video' ? reglas.limiteMBVideo : reglas.limiteMBImagen;
        }

        if (tamanioMB > limiteMB) {
            logSubida(req, destino, 'tamano_excedido');
            return res.status(413).json({
                ok: false,
                error: `El archivo supera el límite de ${limiteMB} MB`
            });
        }

        // ------------------------------------------------------------
        // DEDUPLICACIÓN: si este contenido ya está en el destino, se
        // reutiliza. Solo entran a archivos_hash archivos ya moderados,
        // así que no hace falta moderar de nuevo.
        // ------------------------------------------------------------
        const hash = sha256Hex(req.file.buffer);

        const { data: existente, error: errBusqueda } = await supabaseAdmin
            .from('archivos_hash')
            .select('public_url, path')
            .eq('bucket', destino)
            .eq('sha256', hash)
            .maybeSingle();

        if (errBusqueda) {
            console.error('❌ [media] Error buscando hash:', errBusqueda.message);
            logSubida(req, destino, 'error_busqueda_hash');
            return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
        }

        if (existente) {
            logSubida(req, destino, 'reutilizado');
            return res.status(200).json({
                ok: true,
                url: existente.public_url,
                path: existente.path,
                reutilizado: true
            });
        }

        // Moderación
        let resultadoModeracion;
        try {
            if (tipo === 'imagen') {
                resultadoModeracion = await moderarImagen(req.file.buffer);
            } else {
                resultadoModeracion = await moderarVideo(req.file.buffer, req.file.mimetype);
            }
        } catch (modErr) {
            console.error('❌ [media] Error en moderación:', modErr.message || modErr);
            logSubida(req, destino, 'error_moderacion');
            return res.status(503).json({
                ok: false,
                error: 'No pudimos revisar el contenido. Intenta de nuevo.'
            });
        }

        if (!resultadoModeracion || !resultadoModeracion.ok) {
            const motivo = resultadoModeracion && resultadoModeracion.motivo;

            if (motivo === 'contenido_no_permitido') {
                logSubida(req, destino, 'rechazado_contenido');
                return res.status(422).json({ ok: false, error: 'Contenido no permitido' });
            }
            if (motivo === 'timeout' || motivo === 'servicio_no_disponible') {
                logSubida(req, destino, 'servicio_no_disponible');
                return res.status(503).json({
                    ok: false,
                    error: 'No pudimos revisar el contenido. Intenta de nuevo.'
                });
            }
            if (motivo === 'tipo_invalido') {
                logSubida(req, destino, 'tipo_archivo_invalido');
                return res.status(400).json({ ok: false, error: 'Tipo de archivo inválido' });
            }
            if (motivo === 'tamano_invalido') {
                logSubida(req, destino, 'tamano_invalido');
                return res.status(413).json({ ok: false, error: 'Archivo demasiado grande' });
            }

            logSubida(req, destino, 'rechazado_otro');
            return res.status(422).json({ ok: false, error: 'Contenido no permitido' });
        }

        const extension = extensionSegura(req.file.mimetype);
        if (!extension) {
            logSubida(req, destino, 'extension_no_soportada');
            return res.status(400).json({ ok: false, error: 'Formato no soportado' });
        }

        const nombreArchivo = generarNombreArchivo(usuarioId, extension);

        let subida;
        try {
            subida = await supabaseAdmin.storage
                .from(destino)
                .upload(nombreArchivo, req.file.buffer, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: req.file.mimetype
                });
        } catch (upErr) {
            console.error('❌ [media] Error subiendo:', upErr.message || upErr);
            logSubida(req, destino, 'error_subida');
            return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
        }

        if (subida.error) {
            console.error('❌ [media] Error Supabase:', subida.error.message || subida.error);
            logSubida(req, destino, 'error_supabase');
            return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
        }

        const { data: urlData } = supabaseAdmin.storage
            .from(destino)
            .getPublicUrl(nombreArchivo);

        const url = urlData && urlData.publicUrl;

        if (!url) {
            logSubida(req, destino, 'sin_url_publica');
            return res.status(500).json({ ok: false, error: 'Error generando URL' });
        }

        // Registrar el hash para futuras subidas idénticas
        const { error: errInsert } = await supabaseAdmin
            .from('archivos_hash')
            .insert({
                bucket: destino,
                sha256: hash,
                path: nombreArchivo,
                public_url: url,
                size: req.file.size
            });

        if (errInsert) {
            if (errInsert.code === '23505') {
                // Otra subida idéntica llegó a la vez: se descarta esta copia
                // y se devuelve la que ganó.
                await supabaseAdmin.storage.from(destino).remove([nombreArchivo]);

                const { data: ganador } = await supabaseAdmin
                    .from('archivos_hash')
                    .select('public_url, path')
                    .eq('bucket', destino)
                    .eq('sha256', hash)
                    .maybeSingle();

                if (ganador) {
                    logSubida(req, destino, 'reutilizado_carrera');
                    return res.status(200).json({
                        ok: true,
                        url: ganador.public_url,
                        path: ganador.path,
                        reutilizado: true
                    });
                }
            }
            // Si no se pudo registrar por otro motivo, el archivo sí se subió:
            // se devuelve igual, solo sin deduplicación futura.
            console.error('⚠️ [media] No se registró el hash:', errInsert.message);
        }

        logSubida(req, destino, 'ok');

        return res.status(200).json({
            ok: true,
            url,
            path: nombreArchivo,
            reutilizado: false
        });
    }
);

// ================================================================
// POST /api/media/liberar
// Borra el archivo de Storage solo si ninguna fila lo referencia.
// ================================================================

router.post('/liberar', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);
    const url = req.body && req.body.url;

    if (!usuarioId) {
        return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    if (typeof url !== 'string' || url.length === 0 || url.length > 2000) {
        return res.status(400).json({ ok: false, error: 'URL inválida' });
    }

    const ubicacion = extraerBucketYRuta(url);

    if (!ubicacion || !DESTINOS[ubicacion.bucket]) {
        return res.status(400).json({ ok: false, error: 'Archivo no reconocido' });
    }

    let referenciada;
    try {
        referenciada = await estaReferenciada(url);
    } catch (err) {
        // Fallo seguro: si no podemos verificar, no borramos.
        console.error('❌ [media/liberar] Verificación fallida:', err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo verificar el archivo' });
    }

    if (referenciada) {
        return res.status(200).json({ ok: true, eliminado: false, motivo: 'en_uso' });
    }

    const { error: errStorage } = await supabaseAdmin.storage
        .from(ubicacion.bucket)
        .remove([ubicacion.path]);

    if (errStorage) {
        console.error('❌ [media/liberar] Error borrando de Storage:', errStorage.message);
        return res.status(500).json({ ok: false, error: 'No se pudo borrar el archivo' });
    }

    // Quitar el hash para que no se vuelva a reutilizar un archivo borrado
    await supabaseAdmin
        .from('archivos_hash')
        .delete()
        .eq('bucket', ubicacion.bucket)
        .eq('public_url', url);

    console.log(`[media/liberar] usuario=${usuarioId} bucket=${ubicacion.bucket} eliminado=true`);

    return res.status(200).json({ ok: true, eliminado: true });
});

// ================================================================
// MANEJO DE ERRORES DE MULTER
// ================================================================

router.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ ok: false, error: 'Archivo demasiado grande' });
    }
    if (err) {
        console.error('❌ [media] Error en multer:', err.message || err);
        return res.status(500).json({ ok: false, error: 'Error procesando archivo' });
    }
    return next();
});

module.exports = router;