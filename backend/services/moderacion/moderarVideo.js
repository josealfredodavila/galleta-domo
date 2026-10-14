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
//   2. Obtiene la duración con el binario de ffmpeg (no requiere ffprobe).
//   3. Extrae 3 fotogramas (10%, 50%, 90%).
//   4. Modera cada fotograma con moderarImagen.
//   5. Si alguno tiene contenido prohibido, rechaza el video.
//   6. FAIL CLOSED: si no se puede extraer, leer o moderar un fotograma,
//      el video se rechaza. Nunca se aprueba por falta de revisión.
//   7. Limpia archivos temporales.
// ================================================================

'use strict';

const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

const { moderarImagen } = require('./moderarImagen');

// ================================================================
// CONFIGURACIÓN
// ================================================================

// Binario de ffmpeg: el que trae ffmpeg-static (o el del sistema si no existe)
const FFMPEG_BIN = ffmpegStatic || 'ffmpeg';

if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

const MAX_BYTES_VIDEO = Number(process.env.MODERACION_VIDEO_MAX_BYTES) || (100 * 1024 * 1024);

// Proporciones donde se toman los fotogramas
const PROPORCIONES = [0.10, 0.50, 0.90];

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

// Obtiene la duración leyendo la salida de "ffmpeg -i".
// ffmpeg termina con código distinto de 0 cuando no hay salida, pero
// la información de duración sale igual en stderr.
function obtenerDuracion(rutaArchivo) {
    return new Promise((resolve, reject) => {
        execFile(FFMPEG_BIN, ['-i', rutaArchivo], { timeout: 20000, maxBuffer: 1024 * 1024 },
            (err, stdout, stderr) => {
                const texto = String(stderr || '') + String(stdout || '');
                const coincidencia = texto.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
                if (!coincidencia) {
                    return reject(new Error('No se pudo leer la duración del video'));
                }
                const segundos =
                    Number(coincidencia[1]) * 3600 +
                    Number(coincidencia[2]) * 60 +
                    Number(coincidencia[3]);
                if (!isFinite(segundos) || segundos <= 0) {
                    return reject(new Error('Duración de video inválida'));
                }
                resolve(segundos);
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
 * Modera un video extrayendo 3 fotogramas (10%, 50%, 90%).
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
        return { ok: false, motivo: 'tamano_invalido', detalle: 'Archivo vacío' };
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

        // 4) Obtener duración (fail closed si no se puede leer)
        let duracion;
        try {
            duracion = await obtenerDuracion(rutaVideo);
        } catch (durErr) {
            console.error('❌ [ModerarVideo] Duración no disponible:', durErr.message);
            return { ok: false, motivo: 'servicio_no_disponible', detalle: 'duracion' };
        }

        // 5) Calcular timestamps
        const timestamps = PROPORCIONES.map((p) => duracion * p);

        // 6) Extraer y moderar cada fotograma
        let framesModerados = 0;

        for (let i = 0; i < timestamps.length; i++) {
            const rutaFrame = rutaVideo + `.frame${i}.jpg`;
            archivosTemporales.push(rutaFrame);

            // Fail closed: si no se puede extraer el fotograma, se rechaza
            try {
                await extraerFrame(rutaVideo, timestamps[i], rutaFrame);
            } catch (frameErr) {
                console.error(`❌ [ModerarVideo] No se pudo extraer fotograma ${i}:`, frameErr.message || frameErr);
                return { ok: false, motivo: 'servicio_no_disponible', frame: i, detalle: 'extraccion' };
            }

            let bufferFrame;
            try {
                bufferFrame = await fsp.readFile(rutaFrame);
            } catch (readErr) {
                console.error(`❌ [ModerarVideo] No se pudo leer fotograma ${i}:`, readErr.message);
                return { ok: false, motivo: 'servicio_no_disponible', frame: i, detalle: 'lectura' };
            }

            const resultadoFrame = await moderarImagen(bufferFrame);

            if (resultadoFrame.ok) {
                framesModerados++;
                continue;
            }

            // Contenido prohibido: rechazar el video
            if (resultadoFrame.motivo === 'contenido_no_permitido') {
                return {
                    ok: false,
                    motivo: 'contenido_no_permitido',
                    frame: i,
                    detalle: `Fotograma al ${Math.round(timestamps[i])} s`
                };
            }

            // Cualquier otro fallo (timeout, servicio, formato): fail closed
            return {
                ok: false,
                motivo: resultadoFrame.motivo || 'servicio_no_disponible',
                frame: i
            };
        }

        // Seguridad: deben haberse revisado todos los fotogramas
        if (framesModerados !== timestamps.length) {
            return { ok: false, motivo: 'servicio_no_disponible', detalle: 'revision_incompleta' };
        }

        return { ok: true };

    } catch (error) {
        console.error('❌ [ModerarVideo] Error inesperado:', error.message || error);
        // Fail closed con motivo técnico (responde 503, no 422)
        return { ok: false, motivo: 'servicio_no_disponible', detalle: 'error_interno' };

    } finally {
        await limpiarArchivos(archivosTemporales);
    }
}

// ================================================================
// EXPORT
// ================================================================

module.exports = { moderarVideo };
