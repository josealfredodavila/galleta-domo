/* ================================================================
   WORKER.JS - SARIEL'S ECOSYSTEM
   VERSIÓN v4 - Mezcla de audio de fondo (Phonk, Trap, etc.)
   ================================================================
   - Recibe audioUrl del job.
   - Descarga audio en try/catch independiente (si falla → sin música).
   - Si el video no tiene audio y sí hay música → solo música.
   - Si el video tiene audio y sí hay música → original 40% + música 100%.
   - Sin audio de fondo → comportamiento original (solo marca de agua).
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
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIS_URL = process.env.REDIS_URL;
const PORT = process.env.PORT || 3001;

const faltantes = [];
if (!SUPABASE_URL) faltantes.push('SUPABASE_URL');
if (!SUPABASE_SERVICE_ROLE_KEY) faltantes.push('SUPABASE_SERVICE_ROLE_KEY');
if (!REDIS_URL) faltantes.push('REDIS_URL');

if (faltantes.length > 0) {
    console.error('❌ Faltan variables de entorno críticas:');
    faltantes.forEach(v => console.error(`   - ${v}`));
    console.error('');
    console.error('👉 En Railway, agrega estas variables al servicio del worker.');
    process.exit(1);
}

// ================================================================
// CONFIGURACIÓN DE SUPABASE
// ================================================================
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ================================================================
// CONFIGURACIÓN DE REDIS
// ================================================================
console.log('📡 Conectando a Redis...');

const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0,
    retryStrategy: (times) => {
        if (times > 20) {
            console.error('❌ Redis no responde tras 20 intentos. Abortando.');
            return null;
        }
        const delay = Math.min(times * 500, 10000);
        console.log(`🔁 Reintentando Redis en ${delay}ms (intento ${times})`);
        return delay;
    }
});

redisConnection.on('connect', () => { console.log('✅ Conectado a Redis'); });
redisConnection.on('ready', () => { console.log('✅ Redis listo para operar'); });
redisConnection.on('error', (err) => { console.error('❌ Error de Redis:', err.message); });

// ================================================================
// CONSTANTES
// ================================================================
const COLA_NOMBRE = 'video-processing';
const TEMP_DIR = os.tmpdir();
const MAX_CONCURRENT = 1;
const LOGO_PATH = path.join(__dirname, 'assets', 'sariels_web3.png');

// ================================================================
// FUNCIÓN PRINCIPAL: PROCESAR VIDEO (CON AUDIO DE FONDO)
// ================================================================
async function procesarVideo(job) {
    const { videoId, videoUrl, userId, bucket, filePath, audioUrl } = job.data;

    console.log(`\n📹 [JOB ${job.id}] Procesando video: ${videoId}`);
    console.log(`   Attempt: ${job.attemptsMade + 1}/${job.opts.attempts}`);
    console.log(`   Audio externo: ${audioUrl ? 'SÍ' : 'NO'}`);

    const inputPath = path.join(TEMP_DIR, `sariels_input_${job.id}.mp4`);
    const outputPath = path.join(TEMP_DIR, `sariels_output_${job.id}.mp4`);
    const audioPath = path.join(TEMP_DIR, `sariels_audio_${job.id}.mp3`);
    let tieneAudioExterno = false;

    try {
        if (!fs.existsSync(LOGO_PATH)) {
            throw new Error(`❌ El logo no existe en: ${LOGO_PATH}`);
        }

        // PASO 1: Descargar video
        await job.updateProgress(5);
        console.log(`📥 [JOB ${job.id}] Descargando video...`);

        const response = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 200 * 1024 * 1024
        });

        fs.writeFileSync(inputPath, Buffer.from(response.data));
        console.log(`✅ [JOB ${job.id}] Video descargado (${(response.data.length / 1024 / 1024).toFixed(2)} MB)`);

        await job.updateProgress(10);

        // PASO 1.5: Descargar audio de fondo (si viene)
        if (audioUrl) {
            try {
                console.log(`🎵 [JOB ${job.id}] Descargando audio de fondo...`);
                const audioResp = await axios.get(audioUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    maxContentLength: 20 * 1024 * 1024,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                fs.writeFileSync(audioPath, Buffer.from(audioResp.data));
                tieneAudioExterno = true;
                console.log(`✅ [JOB ${job.id}] Audio descargado (${(audioResp.data.length / 1024).toFixed(0)} KB)`);
            } catch (audioErr) {
                console.warn(`⚠️ [JOB ${job.id}] No se pudo descargar audio (continuando sin él):`, audioErr.message);
                tieneAudioExterno = false;
            }
        }

        await job.updateProgress(15);

        // PASO 2: Metadata
        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

        if (!videoStream) {
            throw new Error('No se encontró stream de video');
        }

        const width = videoStream.width;
        const height = videoStream.height;
        const duration = metadata.format.duration;
        const tieneAudio = !!audioStream;

        console.log(`📐 [JOB ${job.id}] Dimensiones: ${width}x${height}`);
        console.log(`⏱️ [JOB ${job.id}] Duración: ${duration}s`);
        console.log(`🔊 [JOB ${job.id}] Audio original: ${tieneAudio ? 'SÍ (' + audioStream.codec_name + ')' : 'NO'}`);
        console.log(`🎵 [JOB ${job.id}] Audio de fondo: ${tieneAudioExterno ? 'SÍ' : 'NO'}`);

        await job.updateProgress(20);

        // PASO 3: Filtro de video (marca de agua)
        const targetHeight = Math.min(720, height);
        const scaleFactor = targetHeight / height;
        const targetWidth = Math.round(width * scaleFactor);

        const finalWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        const finalHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

        const logoW = Math.floor(finalWidth * 0.20);
        const logoH = Math.floor(logoW * 0.2083);

        const marginX = Math.floor(finalWidth * 0.03);
        const marginY = Math.floor(finalHeight * 0.03);

        const xBR = finalWidth - logoW - marginX;
        const yBR = finalHeight - logoH - marginY;

        console.log(`🎨 [JOB ${job.id}] Aplicando overlay "✦ WEB3"...`);
        console.log(`   - Escala: ${finalWidth}x${finalHeight}`);
        console.log(`   - Logo: ${logoW}x${logoH} en posición (${xBR}, ${yBR})`);

        // Construir filter_complex según si hay audio externo
        let filterComplex;
        let outputMaps = null;

        if (tieneAudioExterno) {
            filterComplex = [
                `[0:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease[scaled]`,
                `[scaled]pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:color=black[pad]`,
                `[1:v]scale=${logoW}:${logoH}[logo]`,
                `[pad][logo]overlay=${xBR}:${yBR}[vout]`,
                tieneAudio
                    ? `[0:a]volume=0.4[orig];[2:a]volume=1.0[music];[orig][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`
                    : `[2:a]volume=1.0[aout]`
            ].join(';');
            outputMaps = ['-map', '[vout]', '-map', '[aout]'];
        } else {
            filterComplex = [
                `[0:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease[scaled]`,
                `[scaled]pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:color=black[pad]`,
                `[1:v]scale=${logoW}:${logoH}[logo]`,
                `[pad][logo]overlay=${xBR}:${yBR}[out]`
            ].join(';');
        }

        await job.updateProgress(25);

        // PASO 4: FFmpeg
        console.log(`🎬 [JOB ${job.id}] Iniciando FFmpeg...`);

        await new Promise((resolve, reject) => {
            const command = ffmpeg()
                .input(inputPath)
                .input(LOGO_PATH);

            if (tieneAudioExterno) {
                command.input(audioPath);
            }

            if (tieneAudioExterno) {
                command.complexFilter(filterComplex);
            } else {
                command.complexFilter(filterComplex, 'out');
            }

            command.outputOptions([
                '-c:v libx264',
                '-preset veryfast',
                '-crf 26',
                '-pix_fmt yuv420p',
                '-profile:v baseline',
                '-level 3.1',
                '-movflags +faststart',
                '-max_muxing_queue_size 1024'
            ]);

            if (tieneAudioExterno) {
                command.outputOptions(outputMaps);
                command.outputOptions([
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-ac', '2'
                ]);
                console.log(`🎵 [JOB ${job.id}] Audio: original (40%) + fondo (100%) mezclados`);
            } else if (tieneAudio) {
                command.outputOptions([
                    '-map', '0:a?',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-ac', '2'
                ]);
                console.log(`🔊 [JOB ${job.id}] Audio: original AAC 128k`);
            } else {
                command.outputOptions(['-an']);
                console.log(`🔇 [JOB ${job.id}] Sin audio`);
            }

            command
                .output(outputPath)
                .on('start', () => {
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
                .on('error', (err, stdout, stderr) => {
                    console.error(`❌ [JOB ${job.id}] FFmpeg error:`, err.message);
                    console.error(`❌ [JOB ${job.id}] STDERR:`, stderr);
                    reject(err);
                })
                .run();
        });

        await job.updateProgress(80);

        // PASO 5: Subir video procesado
        console.log(`📤 [JOB ${job.id}] Subiendo video procesado...`);

        const outputBuffer = fs.readFileSync(outputPath);
        const processedPath = `${userId}/${videoId}_processed.mp4`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(processedPath, outputBuffer, {
                contentType: 'video/mp4',
                cacheControl: '31536000',
                upsert: true
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

        // PASO 6: Actualizar DB
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

        // PASO 7: Borrar original
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

        // Cleanup
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        } catch (cleanupError) {
            console.warn(`⚠️ [JOB ${job.id}] No se pudo limpiar temp:`, cleanupError.message);
        }

        console.log(`✅ [JOB ${job.id}] COMPLETADO\n`);

        return {
            success: true,
            processedUrl,
            videoId,
            tieneAudio,
            tieneAudioExterno
        };

    } catch (error) {
        console.error(`❌ [JOB ${job.id}] Error:`, error.message);

        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        } catch (cleanupError) {
            console.warn(`⚠️ No se pudo limpiar temp:`, cleanupError.message);
        }

        const esUltimoIntento = (job.attemptsMade + 1) >= (job.opts.attempts || 1);
        if (esUltimoIntento) {
            try {
                await supabaseAdmin
                    .from('videos')
                    .update({
                        estado: 'error_procesamiento',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', videoId);
                console.log(`📝 [JOB ${job.id}] Marcado como error en DB (último intento)`);
            } catch (dbErr) {
                console.warn(`⚠️ No se pudo marcar error en DB:`, dbErr.message);
            }
        } else {
            console.log(`🔄 [JOB ${job.id}] Se reintentará (${job.attemptsMade + 1}/${job.opts.attempts})`);
        }

        throw error;
    }
}

// ================================================================
// WORKER BULLMQ
// ================================================================
const worker = new Worker(COLA_NOMBRE, procesarVideo, {
    connection: redisConnection,
    concurrency: MAX_CONCURRENT,
    limiter: {
        max: 3,
        duration: 60000
    }
});

worker.on('completed', (job, result) => {
    console.log(`✅ Worker: Job ${job.id} completado`);
    console.log(`   URL: ${result.processedUrl}`);
    console.log(`   Audio original: ${result.tieneAudio ? 'sí' : 'no'}`);
    console.log(`   Audio externo: ${result.tieneAudioExterno ? 'sí' : 'no'}`);
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
// HEALTH CHECK
// ================================================================
const http = require('http');

const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'worker-video',
            redis: redisConnection.status,
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
    console.error('🔴 Cerrando worker para que Railway reinicie el contenedor...');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection en:', promise);
    console.error('   Razón:', reason);
});

process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM recibido, cerrando worker...');
    try {
        await worker.close();
        await redisConnection.quit();
    } catch (err) {
        console.error('⚠️ Error cerrando:', err.message);
    }
    healthServer.close(() => {
        process.exit(0);
    });
});

console.log('========================================');
console.log("🎬 WORKER DE VIDEOS - SARIEL'S v4");
console.log('========================================');
console.log('📡 Cola:', COLA_NOMBRE);
console.log('🔢 Concurrencia:', MAX_CONCURRENT);
console.log('📁 Temp dir:', TEMP_DIR);
console.log('🖼️ Logo:', LOGO_PATH);
console.log('🎵 Audio: mezcla original 40% + fondo 100%');
console.log('🎯 Limiter: 3 jobs/minuto');
console.log('🛡️ upsert:true (evita duplicados en reintentos)');
console.log('========================================');