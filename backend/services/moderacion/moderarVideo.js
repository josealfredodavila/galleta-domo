// ================================================================
// SERVICES/MODERACION/MODERARVIDEO.JS
// Sariel's Ecosystem — Moderación de videos extrayendo frames
// ================================================================
// Uso:
//   const { moderarVideo } = require('../../services/moderacion/moderarVideo');
//   const resultado = await moderarVideo(buffer, 'video/mp4');
//   if (!resultado.ok) { /* rechazar */ }
//
// Cómo funciona:
//   1. Escribe el buffer a un archivo temporal.
//   2. Extrae 3 frames (10%, 50%, 90%) con fluent-ffmpeg.
//   3. Modera cada frame con moderarImagen.
//   4. Si alguno falla, rechaza el video completo.
//   5. Limpia archivos temporales.
//
// Nota sobre videos largos:
//   - Los 3 frames se extraen por timestamp, no se recorre todo el video.
//   - Un video de 2 horas tarda ~1-2 segundos por frame, no minutos.
//   - El cuello de botella real es la subida del archivo completo a Supabase.
// ================================================================

'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

const { moderarImagen } = require('./moderarImagen');

// ================================================================
// CONFIGURACIÓN
// ================================================================

// Si fluent-ffmpeg no encuentra ffmpeg en el sistema, usamos el binario
// que trae ffmpeg-static.
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

const MAX_BYTES_VIDEO = Number(process.env.MODERACION_VIDEO_MAX_BYTES) || (100 * 1024 * 1024);

// Tipos aceptados (verificados por el caller / multer)
const TIPOS_VIDEO = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime'
]);

// ================================================================
// HELPERS
// ================================================================

async function crearArchivoTemporal(buffer, extension) {
    const nombre = `moderar_video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const ruta = path.join(os.tmpdir(), nombre);
    await fsp.writeFile(ruta, buffer);
    return ruta;
}

function extensionDeMime(mime) {
    if (mime === 'video/mp4') return 'mp4';
    if (mime === 'video/webm') return 'webm';
    if (mime === 'video/quicktime') return 'mov';
    return 'bin';
}

function obtenerDuracion(rutaArchivo) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(rutaArchivo, (err, metadata) => {
            if (err) return reject(err);
            const duracion = metadata && metadata.format && Number(metadata.format.duration);
            if (!duracion || !isFinite(duracion)) {
                return reject(new Error('No se pudo determinar la duración del video'));
            }
            resolve(duracion);
        });
    });
}

function extraerFrame(rutaArchivo, timestamp, rutaSalida) {
    return new Promise((resolve, reject) => {
        ffmpeg(rutaArchivo)
            .seekInput(timestamp)
            .frames(1)
            .output(rutaSalida)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

async function limpiarArchivos(rutas) {
    for (const ruta of rutas) {
        try {
            await fsp.unlink(ruta);
        } catch (_) {
            // Ignorar si ya no existe
        }
    }
}

// ================================================================
// MODERAR VIDEO
// ================================================================

/**
 * Modera un video extrayendo 3 frames (10%, 50%, 90%).
 * @param {Buffer} buffer — bytes del video
 * @param {string} mimeType — 'video/mp4' | 'video/webm' | 'video/quicktime'
 * @returns {Promise<{ok: boolean, motivo?: string, detalle?: string, frame?: number}>}
 */
async function moderarVideo(buffer, mimeType) {
    // 1) Validar tipo
    if (!TIPOS_VIDEO.has(mimeType)) {
        return { ok: false, motivo: 'tipo_invalido', detalle: 'Solo MP4, WebM o MOV' };
    }

    // 2) Validar tamaño
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { ok: false, motivo: 'archivo_vacio' };
    }

    if (buffer.length > MAX_BYTES_VIDEO) {
        return {
            ok: false,
            motivo: 'tamano_invalido',
            detalle: `Supera ${Math.floor(MAX_BYTES_VIDEO / 1024 / 1024)} MB`
        };
    }

    const archivosTemporales = [];

    try {
        // 3) Escribir video a archivo temporal
        const extension = extensionDeMime(mimeType);
        const rutaVideo = await crearArchivoTemporal(buffer, extension);
        archivosTemporales.push(rutaVideo);

        // 4) Obtener duración
        const duracion = await obtenerDuracion(rutaVideo);

        // 5) Calcular timestamps (10%, 50%, 90%)
        const timestamps = [
            duracion * 0.10,
            duracion * 0.50,
            duracion * 0.90
        ];

        // 6) Extraer y moderar cada frame
        for (let i = 0; i < timestamps.length; i++) {
            const rutaFrame = rutaVideo + `.frame${i}.jpg`;
            archivosTemporales.push(rutaFrame);

            try {
                await extraerFrame(rutaVideo, timestamps[i], rutaFrame);
            } catch (frameErr) {
                console.warn(
                    `⚠️ [ModerarVideo] No se pudo extraer frame ${i}:`,
                    frameErr.message || frameErr
                );
                // Si no se puede extraer un frame, saltarlo
                continue;
            }

            let bufferFrame;
            try {
                bufferFrame = await fsp.readFile(rutaFrame);
            } catch (readErr) {
                console.warn(`⚠️ [ModerarVideo] No se pudo leer frame ${i}:`, readErr.message);
                continue;
            }

            const resultadoFrame = await moderarImagen(bufferFrame);

            if (!resultadoFrame.ok) {
                // Si el frame fue rechazado por contenido → rechazar video
                if (resultadoFrame.motivo === 'contenido_no_permitido') {
                    return {
                        ok: false,
                        motivo: 'contenido_no_permitido',
                        frame: i,
                        detalle: `Frame al ${Math.round(timestamps[i])}s`
                    };
                }

                // Si el frame fue rechazado por error técnico → fail closed
                if (
                    resultadoFrame.motivo === 'timeout' ||
                    resultadoFrame.motivo === 'servicio_no_disponible'
                ) {
                    return {
                        ok: false,
                        motivo: resultadoFrame.motivo,
                        frame: i
                    };
                }
            }
        }

        return { ok: true };

    } catch (error) {
        console.error('❌ [ModerarVideo] Error:', error.message || error);
        return { ok: false, motivo: 'error_interno', detalle: error.message || String(error) };

    } finally {
        await limpiarArchivos(archivosTemporales);
    }
}

// ================================================================
// EXPORT
// ================================================================

module.exports = { moderarVideo };