/* ================================================================
   WORKER.JS - SARIEL'S ECOSYSTEM
   ================================================================
   Procesa videos en background usando BullMQ + Redis + FFmpeg
   
   FUNCIONES:
   - Escucha la cola "video-processing"
   - Descarga el video original
   - Aplica delogo para difuminar marca de agua externa
   - Superpone la marca de Sariel's
   - Re-encodea a MP4 720p h264 + AAC
   - Sube a Supabase Storage
   - Actualiza la DB
   ================================================================ */

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
require('dotenv').config();

// ================================================================
// CONFIGURACIÓN DE FFMPEG
// ================================================================
ffmpeg.setFfmpegPath(ffmpegPath);
console.log('🎬 FFmpeg path:', ffmpegPath);

// ================================================================
// CONFIGURACIÓN DE SUPABASE
// ================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltan variables de Supabase');
    process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ================================================================
// CONFIGURACIÓN DE REDIS
// ================================================================
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log('📡 Conectando a Redis...');

// FIX: family: 0 es obligatorio para conectar a Redis dentro de la red
// privada de Railway, que resuelve por IPv6. Sin esto, ioredis intenta
// IPv4 por defecto, la conexión nunca se completa, y con
// maxRetriesPerRequest: null el Worker se queda colgado para siempre
// sin lanzar ningún error (nunca dispara 'connect' ni 'ready').
const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0,
    retryStrategy: (times) => Math.min(times * 1000, 30000)
});

redisConnection.on('connect', () => {
    console.log('✅ Conectado a Redis');
});

redisConnection.on('error', (err) => {
    console.error('❌ Error de Redis:', err.message);
});

// ================================================================
// CONSTANTES
// ================================================================
const COLA_NOMBRE = 'video-processing';
const TEMP_DIR = os.tmpdir();
const MAX_CONCURRENT = 1; // Solo 1 video a la vez (para no matar CPU)

// ================================================================
// FUNCIÓN PRINCIPAL: PROCESAR VIDEO
// ================================================================
async function procesarVideo(job) {
    const { videoId, videoUrl, userId, bucket, filePath } = job.data;

    console.log(`\n📹 [JOB ${job.id}] Procesando video: ${videoId}`);

    const inputPath = path.join(TEMP_DIR, `sariels_input_${job.id}.mp4`);
    const outputPath = path.join(TEMP_DIR, `sariels_output_${job.id}.mp4`);

    try {
        // ============================================================
        // PASO 1: Descargar el video original
        // ============================================================
        await job.updateProgress(5);
        console.log(`📥 [JOB ${job.id}] Descargando video...`);

        const response = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 200 * 1024 * 1024 // 200 MB
        });

        fs.writeFileSync(inputPath, Buffer.from(response.data));
        console.log(`✅ [JOB ${job.id}] Video descargado (${(response.data.length / 1024 / 1024).toFixed(2)} MB)`);

        await job.updateProgress(15);

        // ============================================================
        // PASO 2: Obtener metadata del video
        // ============================================================
        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
            throw new Error('No se encontró stream de video');
        }

        const width = videoStream.width;
        const height = videoStream.height;
        const duration = metadata.format.duration;

        console.log(`📐 [JOB ${job.id}] Dimensiones: ${width}x${height}, Duración: ${duration}s`);

        await job.updateProgress(20);

        // ============================================================
        // PASO 3: Construir el filtro de FFmpeg
        // ============================================================
        // Estrategia:
        // - Redimensionar a 720p máximo
        // - Aplicar delogo en esquina inferior derecha (tapa TikTok)
        // - Aplicar delogo en esquina superior derecha (tapa Reels)
        // - Superponer marca de Sariel's

        const targetHeight = Math.min(720, height);
        const scaleFactor = targetHeight / height;
        const targetWidth = Math.round(width * scaleFactor);
        // Asegurar dimensiones pares (requerido por h264)
        const finalWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        const finalHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

        // Dimensiones de la zona de marca de agua
        const logoW = Math.floor(finalWidth * 0.40);
        const logoH = Math.floor(finalHeight * 0.14);
        const marginX = Math.floor(finalWidth * 0.02);
        const marginY = Math.floor(finalHeight * 0.025);

        const xBR = finalWidth - logoW - marginX;
        const yBR = finalHeight - logoH - marginY;
        const xTR = finalWidth - logoW - marginX;
        const yTR = marginY;

        const fontSize = Math.floor(finalHeight * 0.045);
        const fontSizeSmall = Math.floor(finalHeight * 0.030);

        console.log(`🎨 [JOB ${job.id}] Aplicando filtros...`);
        console.log(`   - Escala: ${finalWidth}x${finalHeight}`);
        console.log(`   - Delogo: ${logoW}x${logoH}`);

        // Filtro completo en una sola cadena
        const videoFilters = [
            // 1. Escalar a 720p
            `scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease`,
            `pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,

            // NOTA: se removieron los filtros "delogo" — es un filtro GPL que
            // probablemente no está compilado en el binario de ffmpeg-static.
            // No hace falta: los "drawbox" de abajo ya tapan por completo esa
            // misma zona con un color sólido casi opaco.

            // 4. Superponer caja de Sariel's en esquina inferior derecha
            `drawbox=x=${xBR}:y=${yBR}:w=${logoW}:h=${logoH}:color=0x0F2D1A@0.85:t=fill`,
            `drawbox=x=${xBR}:y=${yBR}:w=${logoW}:h=${logoH}:color=0xD4AF37@0.9:t=2`,

            // 5. Texto "Sariel's" en la caja
            `drawtext=text='Sariel\\'s':fontcolor=0xD4AF37:fontsize=${fontSize}:x=${xBR + 15}:y=${yBR + Math.floor(logoH * 0.22)}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,

            // 6. Texto "✦ WEB3" debajo
            `drawtext=text='✦ WEB3':fontcolor=0xD4AF37:fontsize=${fontSizeSmall}:x=${xBR + 15}:y=${yBR + Math.floor(logoH * 0.62)}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,

            // 7. Marca superior derecha (por si acaso)
            `drawbox=x=${xTR}:y=${yTR}:w=${logoW}:h=${logoH}:color=0x0F2D1A@0.7:t=fill`,
            `drawtext=text='Sariel\\'s':fontcolor=0xD4AF37:fontsize=${fontSizeSmall}:x=${xTR + 12}:y=${yTR + Math.floor(logoH * 0.35)}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`
        ].join(',');

        await job.updateProgress(25);

        // ============================================================
        // PASO 4: Procesar con FFmpeg
        // ============================================================
        console.log(`🎬 [JOB ${job.id}] Iniciando FFmpeg...`);

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .videoFilters(videoFilters)
                .outputOptions([
                    '-c:v libx264',
                    '-preset veryfast',
                    '-crf 26',
                    '-pix_fmt yuv420p',
                    '-profile:v baseline',
                    '-level 3.1',
                    '-c:a aac',
                    '-b:a 128k',
                    '-movflags +faststart',
                    '-max_muxing_queue_size 1024'
                ])
                .on('start', (cmd) => {
                    console.log(`▶️ [JOB ${job.id}] FFmpeg iniciado`);
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        const pct = 25 + Math.floor(progress.percent * 0.55);
                        job.updateProgress(pct).catch(() => {});
                    }
                })
                .on('end', () => {
                    console.log(`✅ [JOB ${job.id}] FFmpeg terminó`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error(`❌ [JOB ${job.id}] FFmpeg error:`, err.message);
                    reject(err);
                })
                .save(outputPath);
        });

        await job.updateProgress(80);

        // ============================================================
        // PASO 5: Subir video procesado a Supabase
        // ============================================================
        console.log(`📤 [JOB ${job.id}] Subiendo video procesado...`);

        const outputBuffer = fs.readFileSync(outputPath);
        const processedPath = `${userId}/${videoId}_processed_${Date.now()}.mp4`;

        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(processedPath, outputBuffer, {
                contentType: 'video/mp4',
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            throw new Error(`Error subiendo video procesado: ${uploadError.message}`);
        }

        const { data: urlData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(processedPath);

        const processedUrl = urlData.publicUrl;

        console.log(`✅ [JOB ${job.id}] Video subido: ${processedUrl}`);

        await job.updateProgress(95);

        // ============================================================
        // PASO 6: Actualizar la base de datos
        // ============================================================
        console.log(`💾 [JOB ${job.id}] Actualizando base de datos...`);

        const { error: dbError } = await supabaseAdmin
            .from('videos')
            .update({
                url_video: processedUrl,
                estado: 'publicado',
                updated_at: new Date().toISOString()
            })
            .eq('id', videoId);

        if (dbError) {
            console.warn(`⚠️ [JOB ${job.id}] No se pudo actualizar DB:`, dbError.message);
        } else {
            console.log(`✅ [JOB ${job.id}] DB actualizada`);
        }

        // ============================================================
        // PASO 7: Borrar el video original
        // ============================================================
        if (filePath) {
            console.log(`🗑️ [JOB ${job.id}] Borrando video original...`);
            const { error: removeError } = await supabaseAdmin.storage
                .from(bucket)
                .remove([filePath]);

            if (removeError) {
                console.warn(`⚠️ [JOB ${job.id}] No se pudo borrar original:`, removeError.message);
            } else {
                console.log(`✅ [JOB ${job.id}] Original borrado`);
            }
        }

        await job.updateProgress(100);

        // ============================================================
        // LIMPIAR ARCHIVOS TEMPORALES
        // ============================================================
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupError) {
            console.warn(`⚠️ [JOB ${job.id}] No se pudo limpiar temp:`, cleanupError.message);
        }

        console.log(`✅ [JOB ${job.id}] COMPLETADO\n`);

        return {
            success: true,
            processedUrl,
            videoId
        };

    } catch (error) {
        console.error(`❌ [JOB ${job.id}] Error:`, error.message);

        // Limpiar archivos temporales
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupError) {
            console.warn(`⚠️ No se pudo limpiar temp:`, cleanupError.message);
        }

        // Marcar el video con error
        try {
            await supabaseAdmin
                .from('videos')
                .update({
                    estado: 'error_procesamiento',
                    updated_at: new Date().toISOString()
                })
                .eq('id', videoId);
        } catch (dbErr) {
            console.warn(`⚠️ No se pudo marcar error en DB:`, dbErr.message);
        }

        throw error;
    }
}

// ================================================================
// CREAR EL WORKER DE BULLMQ
// ================================================================
const worker = new Worker(COLA_NOMBRE, procesarVideo, {
    connection: redisConnection,
    concurrency: MAX_CONCURRENT,
    limiter: {
        max: 1,
        duration: 60000 // Máximo 1 video por minuto
    }
});

worker.on('completed', (job, result) => {
    console.log(`✅ Worker: Job ${job.id} completado`);
    console.log(`   URL: ${result.processedUrl}`);
});

worker.on('failed', (job, err) => {
    console.error(`❌ Worker: Job ${job?.id} falló:`, err.message);
});

worker.on('error', (err) => {
    console.error('❌ Worker error general:', err.message);
});

worker.on('ready', () => {
    console.log('✅ Worker listo, esperando trabajos...');
});

// ================================================================
// HEALTH CHECK SIMPLE (para que Railway no lo mate)
// ================================================================
const http = require('http');
const PORT = process.env.PORT || 3001;

const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'worker-video',
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

healthServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 Health check en http://0.0.0.0:${PORT}/health`);
});

// ================================================================
// MANEJO DE ERRORES GLOBALES
// ================================================================
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection:', reason);
});

process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM recibido, cerrando worker...');
    await worker.close();
    await redisConnection.quit();
    healthServer.close(() => {
        process.exit(0);
    });
});

console.log('========================================');
console.log('🎬 WORKER DE VIDEOS - SARIEL\'S');
console.log('========================================');
console.log('📡 Cola:', COLA_NOMBRE);
console.log('🔢 Concurrencia:', MAX_CONCURRENT);
console.log('📁 Temp dir:', TEMP_DIR);
console.log('========================================');
