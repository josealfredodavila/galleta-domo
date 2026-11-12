// ================================================================
// ROUTES/MEDIA.JS — Sariel's Ecosystem
// Subida centralizada con moderación, deduplicación por SHA-256
// y cuota de almacenamiento por plan.
// ================================================================
// v2.0: migración de Supabase Storage a Cloudflare R2.
//       - Se conserva intacta la lógica de cuota, deduplicación,
//         borradores y liberación de archivos huérfanos.
//       - Solo cambia el "almacén" (Supabase → R2).
//       - Las URLs públicas ahora apuntan a R2_PUBLIC_URL.
// ================================================================

'use strict';

const express = require('express');
const multer = require('multer');
const { createHash } = require('node:crypto');

// 🆕 R2: cliente S3-compatible
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const { verificarToken } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { moderarImagen } = require('../services/moderacion/moderarImagen');
const { moderarVideo } = require('../services/moderacion/moderarVideo');

const router = express.Router();

// ================================================================
// 🆕 R2 — CONFIGURACIÓN
// ================================================================

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'csariels-media';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

let r2Client = null;
if (R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT) {
    r2Client = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY
        }
    });
    console.log('✅ [media] Cliente R2 configurado');
} else {
    console.error('❌ [media] R2 no configurado. Revisa R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.');
}

if (!R2_PUBLIC_URL) {
    console.error('❌ [media] R2_PUBLIC_URL no configurado. Las URLs públicas fallarán.');
}

// ================================================================
// CONFIGURACIÓN (sin cambios)
// ================================================================

const LIMITE_IMAGEN_MB = 5;
const LIMITE_VIDEO_MB = 100;
const LIMITE_AVATAR_MB = 5;
const LIMITE_CHAT_VIDEO_MB = 50;

const DESTINOS = {
    'muro-imagenes': { tipo: 'imagen', limiteMB: LIMITE_IMAGEN_MB },
    'muro-videos': { tipo: 'auto', limiteMBImagen: LIMITE_IMAGEN_MB, limiteMBVideo: LIMITE_VIDEO_MB },
    'grupos-publicaciones': { tipo: 'auto', limiteMBImagen: LIMITE_IMAGEN_MB, limiteMBVideo: LIMITE_VIDEO_MB },
    'videos': { tipo: 'auto', limiteMBImagen: LIMITE_IMAGEN_MB, limiteMBVideo: LIMITE_VIDEO_MB },
    'sariels-avatars': { tipo: 'imagen', limiteMB: LIMITE_AVATAR_MB },
    'sariels-estados': { tipo: 'auto', limiteMBImagen: 10, limiteMBVideo: 25 },
    'chat-attachments': { tipo: 'auto', limiteMBImagen: LIMITE_IMAGEN_MB, limiteMBVideo: LIMITE_CHAT_VIDEO_MB },
    'mercado': { tipo: 'imagen', limiteMB: 3 }
};

// 🆕 R2: los "buckets" de Supabase ahora son "prefijos" dentro del único bucket R2.
// La clave del archivo en R2 será: <destino>/<usuarioId>/<timestamp>-<random>.<ext>
// Los nombres de destino se mantienen iguales para no romper el frontend.

const COLUMNAS_CON_URL = [
    ['publicaciones', 'media_url'], ['publicaciones_publicas', 'media_url'],
    ['muro_posts', 'imagen_url'], ['muro_videos', 'url_video'], ['muro_videos', 'miniatura_url'],
    ['muro_tendencias', 'imagen_url'], ['muro_tokens_destacados', 'imagen_url'],
    ['videos', 'url_video'], ['videos', 'url_miniatura'],
    ['grupos_video', 'avatar_url'], ['grupos_video', 'portada_url'],
    ['grupos_video_publicaciones', 'imagen_url'], ['grupos_video_publicaciones', 'video_url'], ['grupos_video_publicaciones', 'miniatura_url'],
    ['grupos_video_videos', 'url'], ['grupos_video_videos', 'miniatura'],
    ['estados', 'media_url'], ['estados', 'imagen_url'], ['historias', 'media_url'],
    ['mensajes_chat', 'imagen_url'], ['albumes', 'portada_url'],
    ['usuarios', 'avatar_url'], ['usuarios', 'portada_url'], ['usuarios', 'avatar_verificacion_url'],
    ['perfil_usuario', 'avatar_url'], ['perfil_usuario', 'portada_url'], ['perfiles', 'portada_url'],
    ['fotos_perfil', 'url'],
    ['mercado_productos', 'video_url'], ['mercado_pedido_items', 'foto_url'],
    ['mercado_tiendas', 'logo_url'], ['mercado_tiendas', 'portada_url'],
    ['mercado_repartidores', 'selfie_url'],
    ['escuelas', 'logo_url'], ['ecosystem_branding', 'logo_url'],
    ['anuncios', 'media_url'], ['marketing_ads', 'imagen_url'], ['marketing_ads', 'video_url'],
    ['nfts_usuario', 'imagen_url'], ['media_watermark_records', 'processed_media_url']
];

const TABLAS_CON_URL_EN_JSON = ['mercado_productos'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ================================================================
// HELPERS (sin cambios, salvo extraerBucketYRuta que se adapta a R2)
// ================================================================

function sha256Hex(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

// 🆕 R2: el nombre de archivo incluye el "destino" como prefijo
// (antes Supabase usaba un bucket por destino; R2 usa un solo bucket
// con prefijos por destino).
function generarNombreArchivo(destino, usuarioId, extension) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `${destino}/${usuarioId}/${timestamp}-${random}.${extension}`;
}

function extensionSegura(mime) {
    const mapa = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
        'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
    };
    return mapa[mime] || null;
}

// 🆕 R2: reemplaza la función anterior extraerBucketYRuta (Supabase).
// Ahora extrae el destino y el path desde la URL pública de R2.
// Formato: <R2_PUBLIC_URL>/<destino>/<usuarioId>/<archivo>
function extraerDestinoYRutaR2(url) {
    if (!R2_PUBLIC_URL || typeof url !== 'string') return null;
    if (!url.startsWith(R2_PUBLIC_URL + '/')) return null;

    const resto = url.slice(R2_PUBLIC_URL.length + 1);
    const partes = resto.split('/');
    if (partes.length < 2) return null;

    const destino = partes[0];
    if (!DESTINOS[destino]) return null;

    return { destino, path: resto };
}

// 🆕 R2: URL pública del archivo (reemplaza getPublicUrl de Supabase)
function construirUrlPublicaR2(path) {
    if (!R2_PUBLIC_URL) return null;
    return `${R2_PUBLIC_URL}/${path}`;
}

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

async function consultarCuotaUsuario(usuarioId) {
    const { data, error } = await supabaseAdmin.rpc('consultar_cuota_almacenamiento', {
        p_usuario_id: usuarioId
    });
    if (error || !data) {
        return { ok: false, error: error ? error.message : 'sin_datos' };
    }
    return {
        ok: true,
        plan: data.plan,
        limiteBytes: Number(data.limite_bytes),
        usadoBytes: Number(data.usado_bytes),
        disponibleBytes: Number(data.disponible_bytes)
    };
}

function formatearMB(bytes) {
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function logSubida(req, destino, resultado) {
    const usuario = (req.usuario && req.usuario.id) || 'desconocido';
    const fecha = new Date().toISOString();
    console.log(`[media] usuario=${usuario} fecha=${fecha} destino=${destino} resultado=${resultado}`);
}

// ================================================================
// 🆕 R2: SUBIR / BORRAR / EXISTE
// ================================================================

async function subirAR2(path, buffer, contentType) {
    if (!r2Client) throw new Error('R2 no configurado');
    const cmd = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: path,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=3600'
    });
    await r2Client.send(cmd);
    return path;
}

async function borrarDeR2(path) {
    if (!r2Client) throw new Error('R2 no configurado');
    const cmd = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: path });
    await r2Client.send(cmd);
}

async function existeEnR2(path) {
    if (!r2Client) return false;
    try {
        await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: path }));
        return true;
    } catch (e) {
        if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
        throw e;
    }
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

        // ---- validaciones (igual que antes) ----
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
            return res.status(413).json({ ok: false, error: `El archivo supera el límite de ${limiteMB} MB` });
        }

        // ---- deduplicación (misma lógica, misma tabla archivos_hash) ----
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
                ok: true, url: existente.public_url, path: existente.path, reutilizado: true
            });
        }

        // ---- cuota (misma lógica, misma RPC) ----
        const cuota = await consultarCuotaUsuario(usuarioId);
        if (!cuota.ok) {
            console.error('❌ [media] Error consultando cuota:', cuota.error);
            logSubida(req, destino, 'error_cuota');
            return res.status(503).json({ ok: false, error: 'No pudimos verificar tu espacio. Intenta de nuevo.' });
        }
        if (req.file.size > cuota.disponibleBytes) {
            logSubida(req, destino, 'cuota_excedida');
            return res.status(413).json({
                ok: false,
                error: 'cuota_excedida',
                mensaje: cuota.disponibleBytes > 0
                    ? `Te quedan ${formatearMB(cuota.disponibleBytes)} MB en tu plan ${cuota.plan === 'pro' ? 'Pro' : 'gratuito'}.`
                    : `Llegaste al límite de tu plan ${cuota.plan === 'pro' ? 'Pro' : 'gratuito'}. Libera espacio o renueva Pro para subir más.`,
                plan: cuota.plan,
                limite_mb: formatearMB(cuota.limiteBytes),
                usado_mb: formatearMB(cuota.usadoBytes),
                disponible_mb: formatearMB(cuota.disponibleBytes)
            });
        }

        // ---- moderación (igual que antes) ----
        let resultadoModeracion;
        try {
            if (tipo === 'imagen') resultadoModeracion = await moderarImagen(req.file.buffer);
            else resultadoModeracion = await moderarVideo(req.file.buffer, req.file.mimetype);
        } catch (modErr) {
            console.error('❌ [media] Error en moderación:', modErr.message || modErr);
            logSubida(req, destino, 'error_moderacion');
            return res.status(503).json({ ok: false, error: 'No pudimos revisar el contenido. Intenta de nuevo.' });
        }
        if (!resultadoModeracion || !resultadoModeracion.ok) {
            const motivo = resultadoModeracion && resultadoModeracion.motivo;
            if (motivo === 'contenido_no_permitido') {
                logSubida(req, destino, 'rechazado_contenido');
                return res.status(422).json({ ok: false, error: 'Contenido no permitido' });
            }
            if (motivo === 'timeout' || motivo === 'servicio_no_disponible') {
                logSubida(req, destino, 'servicio_no_disponible');
                return res.status(503).json({ ok: false, error: 'No pudimos revisar el contenido. Intenta de nuevo.' });
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

        // 🆕 R2: path incluye destino como prefijo
        const nombreArchivo = generarNombreArchivo(destino, usuarioId, extension);

        // 🆕 R2: subir al bucket único
        try {
            await subirAR2(nombreArchivo, req.file.buffer, req.file.mimetype);
        } catch (upErr) {
            console.error('❌ [media] Error subiendo a R2:', upErr.message || upErr);
            logSubida(req, destino, 'error_subida');
            return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
        }

        // 🆕 R2: URL pública
        const url = construirUrlPublicaR2(nombreArchivo);
        if (!url) {
            logSubida(req, destino, 'sin_url_publica');
            return res.status(500).json({ ok: false, error: 'Error generando URL' });
        }

        // ---- registrar hash (misma tabla) ----
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
                // otra subida idéntica llegó a la vez
                await borrarDeR2(nombreArchivo);

                const { data: ganador } = await supabaseAdmin
                    .from('archivos_hash')
                    .select('public_url, path')
                    .eq('bucket', destino)
                    .eq('sha256', hash)
                    .maybeSingle();

                if (ganador) {
                    logSubida(req, destino, 'reutilizado_carrera');
                    return res.status(200).json({
                        ok: true, url: ganador.public_url, path: ganador.path, reutilizado: true
                    });
                }
            }
            console.error('⚠️ [media] No se registró el hash:', errInsert.message);
        }

        logSubida(req, destino, 'ok');
        return res.status(200).json({ ok: true, url, path: nombreArchivo, reutilizado: false });
    }
);

// ================================================================
// POST /api/media/liberar
// ================================================================

router.post('/liberar', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);
    const url = req.body && req.body.url;

    if (!usuarioId) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (typeof url !== 'string' || url.length === 0 || url.length > 2000) {
        return res.status(400).json({ ok: false, error: 'URL inválida' });
    }

    // 🆕 R2: extraer destino + path desde URL pública de R2
    const ubicacion = extraerDestinoYRutaR2(url);
    if (!ubicacion) {
        return res.status(400).json({ ok: false, error: 'Archivo no reconocido' });
    }

    let referenciada;
    try {
        referenciada = await estaReferenciada(url);
    } catch (err) {
        console.error('❌ [media/liberar] Verificación fallida:', err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo verificar el archivo' });
    }

    if (referenciada) {
        return res.status(200).json({ ok: true, eliminado: false, motivo: 'en_uso' });
    }

    try {
        await borrarDeR2(ubicacion.path);
    } catch (errStorage) {
        console.error('❌ [media/liberar] Error borrando de R2:', errStorage.message);
        return res.status(500).json({ ok: false, error: 'No se pudo borrar el archivo' });
    }

    await supabaseAdmin
        .from('archivos_hash')
        .delete()
        .eq('bucket', ubicacion.destino)
        .eq('public_url', url);

    console.log(`[media/liberar] usuario=${usuarioId} destino=${ubicacion.destino} eliminado=true`);
    return res.status(200).json({ ok: true, eliminado: true });
});

// ================================================================
// GET /api/media/cuota (sin cambios)
// ================================================================

router.get('/cuota', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);
    if (!usuarioId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const cuota = await consultarCuotaUsuario(usuarioId);
    if (!cuota.ok) return res.status(503).json({ ok: false, error: 'No pudimos verificar tu espacio' });

    return res.status(200).json({
        ok: true,
        plan: cuota.plan,
        limite_mb: formatearMB(cuota.limiteBytes),
        usado_mb: formatearMB(cuota.usadoBytes),
        disponible_mb: formatearMB(cuota.disponibleBytes)
    });
});

// ================================================================
// MANEJO DE ERRORES DE MULTER (sin cambios)
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