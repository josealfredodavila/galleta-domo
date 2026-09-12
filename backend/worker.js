/* ================================================================
   WORKER.JS - SARIEL'S ECOSYSTEM
   ================================================================
   Procesa videos en background usando BullMQ + Redis + FFmpeg
   
   FUNCIONES:
   - Escucha la cola "video-processing"
   - Descarga el video original
   - Aplica overlay de marca de agua "✦ WEB3" (PNG transparente)
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

// Ruta al logo PNG (debe existir en assets/sariels_web3.png)
const LOGO_PATH = path.join(__dirname, 'assets', 'sariels_web3.png');

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
        // PASO 0: Verificar que el logo existe
        // ============================================================
        if (!fs.existsSync(LOGO_PATH)) {
            throw new Error(`❌ El logo no existe en: ${LOGO_PATH}. Súbelo a la carpeta assets/`);
        }

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
        // PASO 3: Construir el filtro de FFmpeg (Overlay PNG "✦ WEB3")
        // ============================================================
        const targetHeight = Math.min(720, height);
        const scaleFactor = targetHeight / height;
        const targetWidth = Math.round(width * scaleFactor);

        // Asegurar dimensiones pares (requerido por h264)
        const finalWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        const finalHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

        // --- CONFIGURACIÓN DEL LOGO "✦ WEB3" ---
        // Ancho del logo: 20% del ancho del video (cámbialo si lo quieres más grande)
        const logoW = Math.floor(finalWidth * 0.20);

        // Altura del logo manteniendo proporción de la imagen (1200x250 = 0.2083)
        // Si tu PNG tiene otras dimensiones, ajusta este multiplicador.
        const logoH = Math.floor(logoW * 0.2083);

        // Márgenes desde la esquina inferior derecha
        const marginX = Math.floor(finalWidth * 0.03);
        const marginY = Math.floor(finalHeight * 0.03);

        const xBR = finalWidth - logoW - marginX;
        const yBR = finalHeight - logoH - marginY;

        console.log(`🎨 [JOB ${job.id}] Aplicando overlay "✦ WEB3"...`);
        console.log(`   - Escala: ${finalWidth}x${finalHeight}`);
        console.log(`   - Logo: ${logoW}x${logoH} en posición (${xBR}, ${yBR})`);

        // Filtro complejo: 2 entradas (video + logo PNG)
        // OJO: en complexFilter los filtros se separan con ";" no con ","
        const filterComplex = [
            // 1. Escalar el video original
            `[0:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease[scaled]`,
            // 2. Padded a las dimensiones exactas
            `[scaled]pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:color=black[pad]`,
            // 3. Escalar el logo
            `[1:v]scale=${logoW}:${logoH}[logo]`,
            // 4. Superponer el logo en la esquina inferior derecha
            `[pad][logo]overlay=${xBR}:${yBR}[out]`
        ].join(';');

        await job.updateProgress(25);

        // ============================================================
        // PASO 4: Procesar con FFmpeg
        // ============================================================
        console.log(`🎬 [JOB ${job.id}] Iniciando FFmpeg...`);

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .input(LOGO_PATH)                 // Segunda entrada: el PNG
                .complexFilter(filterComplex)     // Filtro complejo de 2 entradas
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
                    '-max_muxing_queue_size 1024',
                    '-map', '[out]',              // Mapear la salida del complexFilter
                    '-map', '0:a?'                // Mapear el audio original si existe
                ])
                .on('start', (cmd) => {
                    console.log(`▶️ [JOB ${job.id}] FFmpeg iniciado`);
                    console.log(`   CMD: ${cmd}`);
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
                .on('error', (err, stdout, stderr) => {
                    console.error(`❌ [JOB ${job.id}] FFmpeg error:`, err.message);
                    // ESTO ES CLAVE PARA DEPURAR:
                    console.error(`❌ [JOB ${job.id}] STDERR:`, stderr);
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
console.log('🖼️ Logo:', LOGO_PATH);
console.log('========================================');