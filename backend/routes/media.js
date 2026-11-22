// ================================================================
// ROUTES/MEDIA.JS — Sariel's Ecosystem
// Subida centralizada con moderación, deduplicación por SHA-256,
// cuota de almacenamiento por plan y marca de agua visual en el muro.
// ================================================================
// v2.4:
//   - Adjuntos del chat (chat-attachments) privados: se guardan en
//     Supabase Storage (bucket privado), sin R2, sin marca de agua y
//     sin deduplicación entre usuarios.
//   - GET /chat/:mensajeId/url firma el adjunto desde el backend solo
//     para remitente o destinatario (y si el mensaje no está oculto).
//   - POST /admin/adjuntos-r2 migra los adjuntos de chat que quedaron
//     en R2 a Supabase Storage. Solo administradores. dry_run por defecto.
//   - Marca de agua y deduplicación del muro sin cambios (v2.3).
// ================================================================

'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { createHash } = require('node:crypto');

const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    GetObjectCommand
} = require('@aws-sdk/client-s3');

const { verificarToken } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const { moderarImagen } = require('../services/moderacion/moderarImagen');
const { moderarVideo } = require('../services/moderacion/moderarVideo');

let sharp = null;
try {
    sharp = require('sharp');
} catch (e) {
    console.error('❌ [media] Falta la dependencia "sharp". Ejecuta: npm install sharp');
}

const router = express.Router();

// ================================================================
// R2 — CONFIGURACIÓN
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
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    });
    console.log('✅ [media] Cliente R2 configurado');
    console.log('🔍 [media] R2 bucket:', R2_BUCKET);
    console.log('🔍 [media] R2 public URL:', R2_PUBLIC_URL || '(vacío)');
} else {
    console.error('❌ [media] R2 no configurado. Revisa R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.');
    console.error('  R2_ACCOUNT_ID:', R2_ACCOUNT_ID ? 'definido' : 'FALTA');
    console.error('  R2_ACCESS_KEY_ID:', R2_ACCESS_KEY_ID ? 'definido' : 'FALTA');
    console.error('  R2_SECRET_ACCESS_KEY:', R2_SECRET_ACCESS_KEY ? 'definido' : 'FALTA');
    console.error('  R2_ENDPOINT:', R2_ENDPOINT || 'FALTA');
}

if (!R2_PUBLIC_URL) {
    console.error('❌ [media] R2_PUBLIC_URL no configurado. Las URLs públicas fallarán.');
}

// ================================================================
// CONFIGURACIÓN
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

// Destinos del muro (perfil y feed de publicaciones) que llevan marca de agua.
const DESTINOS_CON_MARCA = new Set(['muro-videos', 'muro-imagenes']);

// Adjuntos privados del chat: Supabase Storage, nunca R2 público.
const DESTINOS_PRIVADOS = new Set(['chat-attachments']);

const MARCA_RUTA = path.join(__dirname, '..', 'public', 'watermark.png');
const MARCA_ANCHO_RELATIVO = 0.12;
const MARCA_OPACIDAD = 0.6;
const MARCA_MARGEN_RELATIVO = 0.03;
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const FFMPEG_TIMEOUT_MS = 180000;

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
// HELPERS
// ================================================================

function sha256Hex(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

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
// MARCA DE AGUA
// ================================================================

// Imagen: se reescala el logo al 12 % del ancho, se baja su opacidad
// y se compone en la esquina superior izquierda. Conserva el formato.
async function aplicarMarcaImagen(buffer, mime) {
    if (!sharp) throw new Error('sharp no está instalado');

    const normalizada = await sharp(buffer).rotate().toBuffer();
    const meta = await sharp(normalizada).metadata();
    const ancho = meta.width;

    const logoAncho = Math.max(40, Math.round(ancho * MARCA_ANCHO_RELATIVO));

    const logoRaw = await sharp(MARCA_RUTA)
        .resize({ width: logoAncho })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixeles = logoRaw.data;
    for (let i = 3; i < pixeles.length; i += 4) {
        pixeles[i] = Math.round(pixeles[i] * MARCA_OPACIDAD);
    }

    const logo = await sharp(pixeles, {
        raw: { width: logoRaw.info.width, height: logoRaw.info.height, channels: 4 }
    }).png().toBuffer();

    const margen = Math.round(ancho * MARCA_MARGEN_RELATIVO);

    let salida = sharp(normalizada).composite([{ input: logo, top: margen, left: margen }]);

    if (mime === 'image/png') {
        salida = salida.png();
    } else if (mime === 'image/webp') {
        salida = salida.webp({ quality: 90 });
    } else {
        salida = salida.jpeg({ quality: 90 });
    }

    const buffer2 = await salida.toBuffer();

    return {
        buffer: buffer2,
        mime: mime === 'image/png' || mime === 'image/webp' ? mime : 'image/jpeg'
    };
}

// Video: FFmpeg superpone el logo (12 % del ancho, opacidad 60 %) en la
// esquina superior izquierda. Video recodificado a H.264 y audio a AAC.
function aplicarMarcaVideo(buffer) {
    return new Promise(async function (resolve, reject) {
        let dir = null;

        try {
            dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'media-wm-'));

            const entrada = path.join(dir, 'entrada');
            const salida = path.join(dir, 'salida.mp4');

            await fs.promises.writeFile(entrada, buffer);

            const filtro =
                '[1:v]format=rgba,colorchannelmixer=aa=' + MARCA_OPACIDAD + '[lg];' +
                '[lg][0:v]scale2ref=w=\'main_w*' + MARCA_ANCHO_RELATIVO + '\':h=-1[logo][base];' +
                '[base][logo]overlay=x=\'main_w*' + MARCA_MARGEN_RELATIVO + '\':y=\'main_h*' + MARCA_MARGEN_RELATIVO + '\':shortest=1[vout]';

            const args = [
                '-y',
                '-i', entrada,
                '-loop', '1', '-i', MARCA_RUTA,
                '-filter_complex', filtro,
                '-map', '[vout]',
                '-map', '0:a?',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '26',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-shortest',
                salida
            ];

            const proceso = spawn(FFMPEG_BIN, args);

            let stderr = '';
            proceso.stderr.on('data', function (chunk) {
                stderr += chunk.toString();
                if (stderr.length > 8000) stderr = stderr.slice(-8000);
            });

            const temporizador = setTimeout(function () {
                proceso.kill('SIGKILL');
            }, FFMPEG_TIMEOUT_MS);

            proceso.on('error', async function (err) {
                clearTimeout(temporizador);
                await limpiarDirectorio(dir);
                reject(new Error('No se pudo ejecutar FFmpeg: ' + err.message));
            });

            proceso.on('close', async function (codigo) {
                clearTimeout(temporizador);

                try {
                    if (codigo !== 0) {
                        throw new Error('FFmpeg terminó con código ' + codigo + ': ' + stderr.slice(-400));
                    }

                    const resultado = await fs.promises.readFile(salida);
                    await limpiarDirectorio(dir);

                    resolve({ buffer: resultado, mime: 'video/mp4' });
                } catch (err) {
                    await limpiarDirectorio(dir);
                    reject(err);
                }
            });

        } catch (err) {
            if (dir) await limpiarDirectorio(dir);
            reject(err);
        }
    });
}

async function limpiarDirectorio(dir) {
    if (!dir) return;
    try {
        await fs.promises.rm(dir, { recursive: true, force: true });
    } catch (e) {}
}

async function aplicarMarcaSegunTipo(buffer, mime, tipo) {
    if (tipo === 'imagen') return aplicarMarcaImagen(buffer, mime);
    return aplicarMarcaVideo(buffer);
}

// ================================================================
// R2: SUBIR / BORRAR / EXISTE / LEER
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

    try {
        const result = await r2Client.send(cmd);
        console.log('✅ [R2] Subida exitosa. ETag:', result.ETag);
        return path;
    } catch (err) {
        console.error('❌ [R2] Error al subir:');
        console.error('  name:', err.name);
        console.error('  message:', err.message);
        console.error('  httpStatusCode:', err.$metadata && err.$metadata.httpStatusCode);
        console.error('  requestId:', err.$metadata && err.$metadata.requestId);
        throw err;
    }
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
        if (e.name === 'NotFound' || (e.$metadata && e.$metadata.httpStatusCode === 404)) return false;
        throw e;
    }
}

async function leerDeR2(path) {
    if (!r2Client) throw new Error('R2 no configurado');
    const obj = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: path }));
    const bytes = await obj.Body.transformToByteArray();
    return { buffer: Buffer.from(bytes), contentType: obj.ContentType || 'application/octet-stream' };
}

// ================================================================
// ADJUNTOS PRIVADOS DEL CHAT (Supabase Storage, bucket privado)
// ================================================================

async function subirAdjuntoPrivado(req, res, usuarioId, destino, file) {
    const extension = extensionSegura(file.mimetype);
    if (!extension) {
        logSubida(req, destino, 'extension_no_soportada');
        return res.status(400).json({ ok: false, error: 'Formato no soportado' });
    }

    const cuota = await consultarCuotaUsuario(usuarioId);
    if (!cuota.ok) {
        logSubida(req, destino, 'error_cuota');
        return res.status(503).json({ ok: false, error: 'No pudimos verificar tu espacio. Intenta de nuevo.' });
    }
    if (file.size > cuota.disponibleBytes) {
        logSubida(req, destino, 'cuota_excedida');
        return res.status(413).json({
            ok: false,
            error: 'cuota_excedida',
            mensaje: cuota.disponibleBytes > 0
                ? `Te quedan ${formatearMB(cuota.disponibleBytes)} MB en tu plan.`
                : 'Llegaste al límite de tu plan. Libera espacio para subir más.',
            plan: cuota.plan
        });
    }

    const ruta = `${usuarioId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

    const { error } = await supabaseAdmin.storage.from(destino).upload(ruta, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
    });

    if (error) {
        console.error('❌ [media] Error subiendo adjunto privado:', error.message);
        logSubida(req, destino, 'error_subida_privada');
        return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
    }

    logSubida(req, destino, 'ok_privado');
    return res.status(200).json({ ok: true, path: ruta, privado: true });
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
            return res.status(413).json({ ok: false, error: `El archivo supera el límite de ${limiteMB} MB` });
        }

        // 1) Moderación sobre el archivo original, antes de cualquier cambio.
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

        // 1.5) Adjuntos del chat: privados en Supabase Storage.
        //      Sin R2, sin marca de agua y sin deduplicación entre usuarios.
        if (DESTINOS_PRIVADOS.has(destino)) {
            return await subirAdjuntoPrivado(req, res, usuarioId, destino, req.file);
        }

        // 2) Marca de agua (solo destinos del muro).
        let archivoFinal = { buffer: req.file.buffer, mime: req.file.mimetype };

        if (DESTINOS_CON_MARCA.has(destino)) {
            try {
                archivoFinal = await aplicarMarcaSegunTipo(req.file.buffer, req.file.mimetype, tipo);
            } catch (wmErr) {
                console.error('❌ [media] Error aplicando marca de agua:', wmErr.message || wmErr);
                logSubida(req, destino, 'error_marca_agua');
                return res.status(503).json({ ok: false, error: 'No pudimos procesar el archivo. Intenta de nuevo.' });
            }
        }

        const extension = extensionSegura(archivoFinal.mime);
        if (!extension) {
            logSubida(req, destino, 'extension_no_soportada');
            return res.status(400).json({ ok: false, error: 'Formato no soportado' });
        }

        // 3) Deduplicación sobre el archivo final (ya marcado).
        const hash = sha256Hex(archivoFinal.buffer);
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

        let reutilizable = null;
        if (existente) {
            let vigente = false;
            try {
                vigente = await existeEnR2(existente.path);
            } catch (errHead) {
                console.error('⚠️ [media] No se pudo verificar el archivo existente:', errHead.message);
                vigente = false;
            }

            if (vigente) {
                reutilizable = existente;
            } else {
                const { error: errLimpieza } = await supabaseAdmin
                    .from('archivos_hash')
                    .delete()
                    .eq('bucket', destino)
                    .eq('sha256', hash);
                if (errLimpieza) {
                    console.error('⚠️ [media] No se borró el hash obsoleto:', errLimpieza.message);
                } else {
                    console.log('🧹 [media] Hash obsoleto eliminado:', existente.path);
                }
            }
        }

        if (reutilizable) {
            logSubida(req, destino, 'reutilizado');
            return res.status(200).json({
                ok: true, url: reutilizable.public_url, path: reutilizable.path, reutilizado: true
            });
        }

        // 4) Cuota sobre el tamaño final.
        const cuota = await consultarCuotaUsuario(usuarioId);
        if (!cuota.ok) {
            console.error('❌ [media] Error consultando cuota:', cuota.error);
            logSubida(req, destino, 'error_cuota');
            return res.status(503).json({ ok: false, error: 'No pudimos verificar tu espacio. Intenta de nuevo.' });
        }
        if (archivoFinal.buffer.length > cuota.disponibleBytes) {
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

        // 5) Subida a R2.
        const nombreArchivo = generarNombreArchivo(destino, usuarioId, extension);

        try {
            await subirAR2(nombreArchivo, archivoFinal.buffer, archivoFinal.mime);
        } catch (upErr) {
            console.error('❌ [media] Error subiendo a R2:', upErr.message || upErr);
            logSubida(req, destino, 'error_subida');
            return res.status(500).json({ ok: false, error: 'Error al guardar el archivo' });
        }

        const url = construirUrlPublicaR2(nombreArchivo);
        if (!url) {
            logSubida(req, destino, 'sin_url_publica');
            return res.status(500).json({ ok: false, error: 'Error generando URL' });
        }

        // 6) Registro del hash.
        const { error: errInsert } = await supabaseAdmin
            .from('archivos_hash')
            .insert({
                bucket: destino,
                sha256: hash,
                path: nombreArchivo,
                public_url: url,
                size: archivoFinal.buffer.length
            });

        if (errInsert) {
            if (errInsert.code === '23505') {
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
// GET /api/media/cuota
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
// GET /api/media/chat/:mensajeId/url
// Firma un adjunto de chat solo para remitente o destinatario, y solo
// si el mensaje no está eliminado ni oculto para esa persona.
// ================================================================

router.get('/chat/:mensajeId/url', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);
    const mensajeId = req.params.mensajeId;

    if (!usuarioId) return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (!/^[0-9a-f-]{36}$/i.test(mensajeId)) {
        return res.status(400).json({ ok: false, error: 'ID inválido' });
    }

    const { data: m, error } = await supabaseAdmin
        .from('mensajes_chat')
        .select('id, imagen_url, remitente_id, destinatario_id, eliminado')
        .eq('id', mensajeId)
        .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: 'Error consultando el mensaje' });
    if (!m || m.eliminado) return res.status(404).json({ ok: false, error: 'No disponible' });
    if (m.remitente_id !== usuarioId && m.destinatario_id !== usuarioId) {
        return res.status(404).json({ ok: false, error: 'No disponible' });
    }

    const { data: oculto } = await supabaseAdmin
        .from('mensajes_ocultos')
        .select('mensaje_id')
        .eq('mensaje_id', mensajeId)
        .eq('usuario_id', usuarioId)
        .maybeSingle();
    if (oculto) return res.status(404).json({ ok: false, error: 'No disponible' });

    const coincidencia = /^bucket:\/\/(chat-attachments|chat-audio)\/(.+)$/.exec(m.imagen_url || '');
    if (!coincidencia) return res.status(404).json({ ok: false, error: 'No disponible' });

    const bucket = coincidencia[1];
    const ruta = coincidencia[2];
    if (ruta.includes('..')) return res.status(400).json({ ok: false, error: 'Ruta inválida' });

    const { data, error: errFirma } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(ruta, 3600);

    if (errFirma || !data || !data.signedUrl) {
        return res.status(404).json({ ok: false, error: 'Archivo no encontrado' });
    }

    return res.status(200).json({ ok: true, url: data.signedUrl });
});

// ================================================================
// POST /api/media/admin/adjuntos-r2
// Migra adjuntos de chat que quedaron en R2 (prefijo duplicado) a
// Supabase Storage privado. Solo administradores.
// Body: { dry_run: true|false }  (dry_run por defecto: true)
// Orden por archivo: copiar -> verificar -> actualizar fila -> borrar R2.
// ================================================================

const PREFIJO_ROTO = 'bucket://chat-attachments/chat-attachments/';

async function leerBufferDeStorage(bucket, ruta) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(ruta);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
}

router.post('/admin/adjuntos-r2', verificarToken, async (req, res) => {
    const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);
    if (!usuarioId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const { data: admin } = await supabaseAdmin
        .from('usuarios')
        .select('es_admin')
        .eq('id', usuarioId)
        .maybeSingle();
    if (!admin || admin.es_admin !== true) {
        return res.status(403).json({ ok: false, error: 'Solo administradores' });
    }

    const dryRun = !(req.body && req.body.dry_run === false);

    const { data: filas, error } = await supabaseAdmin
        .from('mensajes_chat')
        .select('id, imagen_url')
        .like('imagen_url', PREFIJO_ROTO + '%')
        .limit(200);

    if (error) return res.status(500).json({ ok: false, error: 'Error consultando mensajes' });

    const resultados = [];

    for (const f of (filas || [])) {
        const ruta = f.imagen_url.slice(PREFIJO_ROTO.length);   // <uid>/...
        const keyR2 = 'chat-attachments/' + ruta;
        const nuevaRef = 'bucket://chat-attachments/' + ruta;

        if (dryRun) {
            let existeR2 = false;
            try { existeR2 = await existeEnR2(keyR2); } catch (e) { existeR2 = false; }
            resultados.push({ id: f.id, keyR2, nuevaRef, existeEnR2: existeR2, accion: 'simulacion' });
            continue;
        }

        try {
            // 1) Copiar de R2 a Supabase (si ya existe ahí, se reutiliza).
            const yaEnSupabase = await leerBufferDeStorage('chat-attachments', ruta);
            if (!yaEnSupabase) {
                const { buffer, contentType } = await leerDeR2(keyR2);
                const { error: errUp } = await supabaseAdmin.storage
                    .from('chat-attachments')
                    .upload(ruta, buffer, { contentType, cacheControl: '3600', upsert: false });
                if (errUp && !/already exists|duplicate/i.test(errUp.message || '')) throw errUp;
            }

            // 2) Verificar que quedó en Supabase.
            const verificado = await leerBufferDeStorage('chat-attachments', ruta);
            if (!verificado) throw new Error('No se verificó la copia en Supabase');

            // 3) Actualizar la fila del mensaje.
            const { error: errFila } = await supabaseAdmin
                .from('mensajes_chat')
                .update({ imagen_url: nuevaRef })
                .eq('id', f.id);
            if (errFila) throw errFila;

            // 4) Limpiar R2 y el registro de hash de ese archivo.
            try { await borrarDeR2(keyR2); } catch (e) {
                console.warn('⚠️ [media/admin] No se borró de R2:', keyR2, e.message);
            }
            await supabaseAdmin
                .from('archivos_hash')
                .delete()
                .eq('bucket', 'chat-attachments')
                .eq('path', keyR2);

            resultados.push({ id: f.id, nuevaRef, accion: 'migrado' });
            console.log(`[media/admin] migrado mensaje=${f.id} -> ${nuevaRef}`);

        } catch (e) {
            console.error('❌ [media/admin] Error migrando', f.id, e.message);
            resultados.push({ id: f.id, accion: 'error', detalle: e.message });
        }
    }

    return res.status(200).json({
        ok: true,
        dry_run: dryRun,
        total: (filas || []).length,
        resultados
    });
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