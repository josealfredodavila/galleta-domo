
/* ================================================================
   WORKER.JS - CSARIEL'S ECOSYSTEM
   VERSIÓN v5.4 - FFmpeg FIX / R2 / SUPABASE / BULLMQ

   CORRECCIONES:
   - Eliminación total del filtro FFmpeg drawtext.
   - No requiere libfreetype.
   - Overlay gráfico WEB3 mediante PNG.
   - Logo al 50% de opacidad.
   - Audio original y música externa.
   - Música externa en bucle cuando sea necesario.
   - Conservación segura del original.
   - R2 + Supabase Storage legacy.
   - Limpieza garantizada de temporales.
   - Mapeo explícito de streams FFmpeg.
   ================================================================ */

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { createClient } = require('@supabase/supabase-js');
const {
    S3Client,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const { pipeline } = require('stream/promises');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

require('dotenv').config();

// ================================================================
// CONFIGURACIÓN FFMPEG
// ================================================================

if (!ffmpegPath) {
    console.error('❌ No se encontró ffmpeg-static.');
    process.exit(1);
}

ffmpeg.setFfmpegPath(ffmpegPath);

console.log('🎬 FFmpeg:', ffmpegPath);

// ================================================================
// VARIABLES DE ENTORNO
// ================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIS_URL = process.env.REDIS_URL;

const PORT = Number(process.env.PORT) || 3001;

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const R2_BUCKET = process.env.R2_BUCKET || 'csariels-media';

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '')
    .replace(/\/$/, '');

const R2_ENDPOINT = process.env.R2_ENDPOINT ||
    (R2_ACCOUNT_ID
        ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : '');

const faltantes = [];

if (!SUPABASE_URL) faltantes.push('SUPABASE_URL');
if (!SUPABASE_SERVICE_ROLE_KEY) faltantes.push('SUPABASE_SERVICE_ROLE_KEY');
if (!REDIS_URL) faltantes.push('REDIS_URL');

if (faltantes.length) {
    console.error('❌ Variables críticas faltantes:');

    faltantes.forEach(function (variable) {
        console.error(' - ' + variable);
    });

    process.exit(1);
}

const r2Configurado = Boolean(
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_ENDPOINT &&
    R2_PUBLIC_URL
);

if (!r2Configurado) {
    console.warn('⚠️ R2 no está completamente configurado.');
}

// ================================================================
// CLIENTE SUPABASE
// ================================================================

const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// ================================================================
// CLIENTE CLOUDFLARE R2
// ================================================================

const r2Client = r2Configurado
    ? new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    })
    : null;

// ================================================================
// REDIS
// ================================================================

console.log('📡 Conectando a Redis...');

const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0,

    retryStrategy: function (times) {
        if (times > 20) {
            console.error('❌ Redis no responde después de 20 intentos.');
            return null;
        }

        const delay = Math.min(times * 500, 10000);

        console.log('🔁 Redis reintentando en ' + delay + 'ms');

        return delay;
    }
});

redisConnection.on('connect', function () {
    console.log('✅ Redis conectado');
});

redisConnection.on('ready', function () {
    console.log('✅ Redis listo');
});

redisConnection.on('error', function (err) {
    console.error('❌ Redis:', err.message);
});

// ================================================================
// CONSTANTES
// ================================================================

const COLA_NOMBRE = 'video-processing';

const TEMP_DIR = os.tmpdir();

const MAX_CONCURRENT = 1;

const LOGO_PATH = path.join(
    __dirname,
    'public',
    'watermark.png'
);

// ================================================================
// UTILIDADES
// ================================================================

function obtenerRutasTemporales(jobId) {
    const identificador = String(jobId)
        .replace(/[^a-zA-Z0-9_-]/g, '_');

    const base = 'sariels_' +
        identificador + '_' +
        process.pid + '_' +
        Date.now();

    return {
        input: path.join(TEMP_DIR, base + '_input.mp4'),
        output: path.join(TEMP_DIR, base + '_output.mp4'),
        audio: path.join(TEMP_DIR, base + '_audio.mp3')
    };
}

function limpiarTemporales(rutas) {
    if (!rutas) return;

    Object.keys(rutas).forEach(function (key) {
        try {
            if (fs.existsSync(rutas[key])) {
                fs.unlinkSync(rutas[key]);
            }
        } catch (err) {
            console.warn(
                '⚠️ No se pudo limpiar temporal:',
                rutas[key],
                err.message
            );
        }
    });
}

function validarArchivo(ruta, nombre) {
    if (!fs.existsSync(ruta)) {
        throw new Error(nombre + ' no existe.');
    }

    const stat = fs.statSync(ruta);

    if (!stat.isFile() || stat.size <= 0) {
        throw new Error(nombre + ' está vacío o no es válido.');
    }

    return stat.size;
}

function urlPublicaR2(key) {
    return R2_PUBLIC_URL + '/' + key;
}

// ================================================================
// R2: DESCARGA
// ================================================================

async function descargarR2ADisco(key, destino) {
    if (!r2Client) {
        throw new Error('R2 no está configurado.');
    }

    const response = await r2Client.send(
        new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: key
        })
    );

    if (!response.Body) {
        throw new Error('R2 devolvió un archivo vacío.');
    }

    await pipeline(
        response.Body,
        fs.createWriteStream(destino)
    );

    return validarArchivo(destino, 'Video descargado de R2');
}

// ================================================================
// R2: SUBIDA
// ================================================================

async function subirBufferR2(key, buffer, contentType) {
    if (!r2Client) {
        throw new Error('R2 no está configurado.');
    }

    await r2Client.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000'
        })
    );

    return urlPublicaR2(key);
}

// ================================================================
// R2: BORRADO
// ================================================================

async function borrarR2(key) {
    if (!r2Client) {
        throw new Error('R2 no está configurado.');
    }

    await r2Client.send(
        new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key
        })
    );
}

// ================================================================
// REGISTRO DE HASH
// ================================================================

async function registrarArchivoHash(datos) {
    const { error } = await supabaseAdmin
        .from('archivos_hash')
        .upsert(
            {
                bucket: datos.bucket,
                sha256: datos.sha256,
                path: datos.path,
                public_url: datos.publicUrl,
                size: datos.size
            },
            {
                onConflict: 'bucket,sha256',
                ignoreDuplicates: true
            }
        );

    if (error) {
        console.warn(
            '⚠️ No se registró archivos_hash:',
            error.message
        );

        return false;
    }

    return true;
}

// ================================================================
// VERIFICAR USO DEL VIDEO ORIGINAL
// ================================================================

async function archivoOriginalEnUso(urlOriginal, videoIdActual) {
    const { count, error } = await supabaseAdmin
        .from('videos')
        .select('id', {
            count: 'exact',
            head: true
        })
        .eq('url_video', urlOriginal)
        .neq('id', videoIdActual);

    if (error) {
        throw new Error(
            'No se pudo verificar uso del original: ' +
            error.message
        );
    }

    return (count || 0) > 0;
}

// ================================================================
// DESCARGA DE VIDEO ORIGINAL
// ================================================================

async function descargarVideoOriginal(
    videoUrl,
    storage,
    keyOriginal,
    destino,
    jobId
) {
    if (storage === 'r2') {
        const bytes = await descargarR2ADisco(
            keyOriginal,
            destino
        );

        console.log(
            '✅ Video R2:',
            (bytes / 1048576).toFixed(2),
            'MB'
        );

        return;
    }

    if (!videoUrl) {
        throw new Error('No existe URL del video original.');
    }

    const response = await axios.get(videoUrl, {
        responseType: 'stream',
        timeout: 120000,
        maxContentLength: 200 * 1024 * 1024,
        maxBodyLength: 200 * 1024 * 1024,
        headers: {
            'User-Agent': 'Csariels-Video-Worker/5.4'
        }
    });

    await pipeline(
        response.data,
        fs.createWriteStream(destino)
    );

    const bytes = validarArchivo(
        destino,
        'Video original'
    );

    console.log(
        '✅ Video descargado:',
        (bytes / 1048576).toFixed(2),
        'MB'
    );
}

// ================================================================
// DESCARGA DE AUDIO EXTERNO
// ================================================================

async function descargarAudioExterno(audioUrl, destino, jobId) {
    if (!audioUrl) return false;

    try {
        console.log(
            '🎵 [JOB ' + jobId + '] Descargando música...'
        );

        const response = await axios.get(audioUrl, {
            responseType: 'stream',
            timeout: 30000,
            maxContentLength: 20 * 1024 * 1024,
            maxBodyLength: 20 * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        await pipeline(
            response.data,
            fs.createWriteStream(destino)
        );

        validarArchivo(destino, 'Audio externo');

        console.log('✅ Música descargada');

        return true;

    } catch (error) {
        console.warn(
            '⚠️ Música no disponible. Se continuará sin música:',
            error.message
        );

        try {
            if (fs.existsSync(destino)) {
                fs.unlinkSync(destino);
            }
        } catch (cleanupError) {
            console.warn(cleanupError.message);
        }

        return false;
    }
}

// ================================================================
// METADATA FFPROBE
// ================================================================

function obtenerMetadata(ruta) {
    return new Promise(function (resolve, reject) {
        ffmpeg.ffprobe(ruta, function (err, metadata) {
            if (err) {
                reject(
                    new Error(
                        'Error leyendo metadata FFprobe: ' +
                        err.message
                    )
                );

                return;
            }

            resolve(metadata);
        });
    });
}

// ================================================================
// CONSTRUIR FILTRO DE VIDEO
// ================================================================

function construirFiltroVideo(
    width,
    height,
    tieneAudio,
    tieneAudioExterno,
    duration
) {
    const targetHeight = Math.min(720, height);

    const scaleFactor = targetHeight / height;

    const targetWidth = Math.round(width * scaleFactor);

    const finalWidth = targetWidth % 2 === 0
        ? targetWidth
        : targetWidth - 1;

    const finalHeight = targetHeight % 2 === 0
        ? targetHeight
        : targetHeight - 1;

    if (finalWidth < 2 || finalHeight < 2) {
        throw new Error('Dimensiones de video no válidas.');
    }

    const logoW = Math.max(
        2,
        Math.floor(finalWidth * 0.20 / 2) * 2
    );

    const logoH = Math.max(
        2,
        Math.floor(logoW * 0.2083 / 2) * 2
    );

    const marginX = Math.floor(finalWidth * 0.03);
    const marginY = Math.floor(finalHeight * 0.03);

    const xBR = finalWidth - logoW - marginX;
    const yBR = finalHeight - logoH - marginY;

    /*
       IMPORTANTE:

       El filtro utiliza exclusivamente:
       scale
       pad
       format
       colorchannelmixer
       overlay

       No se ejecuta drawtext.
       No se requiere libfreetype.
    */

    const filtros = [
        '[0:v]scale=' +
            finalWidth + ':' + finalHeight +
            ':force_original_aspect_ratio=decrease[scaled]',

        '[scaled]pad=' +
            finalWidth + ':' + finalHeight +
            ':(ow-iw)/2:(oh-ih)/2:color=black[base]',

        '[1:v]scale=' +
            logoW + ':' + logoH +
            ',format=rgba,' +
            'colorchannelmixer=aa=0.5[logo]',

        '[base][logo]overlay=' +
            xBR + ':' + yBR +
            ':shortest=1[vout]'
    ];

    if (tieneAudioExterno) {
        if (tieneAudio) {
            filtros.push(
                '[0:a]volume=0.4[orig]'
            );

            filtros.push(
                '[2:a]volume=1.0[music]'
            );

            filtros.push(
                '[orig][music]amix=' +
                'inputs=2:duration=first:dropout_transition=2[aout]'
            );
        } else {
            filtros.push(
                '[2:a]volume=1.0[aout]'
            );
        }
    }

    return {
        filterComplex: filtros.join(';'),
        width: finalWidth,
        height: finalHeight,
        logoWidth: logoW,
        logoHeight: logoH,
        logoX: xBR,
        logoY: yBR
    };
}

// ================================================================
// PROCESAMIENTO FFMPEG
// ================================================================

function ejecutarFFmpeg(
    inputPath,
    outputPath,
    audioPath,
    tieneAudio,
    tieneAudioExterno,
    filtro,
    job
) {
    return new Promise(function (resolve, reject) {
        let command = ffmpeg();

        // Entrada 0: video original.
        command = command.input(inputPath);

        // Entrada 1: logo gráfico.
        // Se mantiene durante toda la reproducción.
        command = command.input(LOGO_PATH);
        command = command.inputOptions(['-loop', '1']);

        // Entrada 2: música externa.
        if (tieneAudioExterno) {
            command = command.input(audioPath);
            command = command.inputOptions([
                '-stream_loop',
                '-1'
            ]);
        }

        // Filtro gráfico y mezcla de audio.
        command = command.complexFilter(
            filtro.filterComplex
        );

        const opciones = [
            '-map',
            '[vout]',

            '-c:v',
            'libx264',

            '-preset',
            'veryfast',

            '-crf',
            '26',

            '-pix_fmt',
            'yuv420p',

            '-profile:v',
            'baseline',

            '-level',
            '3.1',

            '-movflags',
            '+faststart',

            '-max_muxing_queue_size',
            '1024'
        ];

        if (tieneAudioExterno) {
            opciones.push('-map', '[aout]');

            opciones.push(
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-ac',
                '2'
            );

            if (!tieneAudio) {
                // El video determina el final del resultado.
                opciones.push('-shortest');
            }

        } else if (tieneAudio) {
            opciones.push(
                '-map',
                '0:a?',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-ac',
                '2'
            );

        } else {
            opciones.push('-an');
        }

        command = command.outputOptions(opciones);

        command = command.output(outputPath);

        command
            .on('start', function (commandLine) {
                console.log(
                    '▶️ [JOB ' + job.id + '] FFmpeg iniciado'
                );

                console.log(
                    '🎬 [JOB ' + job.id + '] Comando:',
                    commandLine
                );
            })

            .on('progress', function (progress) {
                if (progress.percent) {
                    const porcentaje = Math.max(
                        25,
                        Math.min(
                            80,
                            25 + Math.floor(
                                progress.percent * 0.55
                            )
                        )
                    );

                    job.updateProgress(porcentaje)
                        .catch(function () {});
                }
            })

            .on('end', function () {
                console.log(
                    '✅ [JOB ' + job.id + '] FFmpeg finalizado'
                );

                resolve();
            })

            .on('error', function (err, stdout, stderr) {
                console.error(
                    '❌ [JOB ' + job.id + '] FFmpeg:',
                    err.message
                );

                if (stderr) {
                    console.error(
                        '❌ FFmpeg STDERR:',
                        stderr
                    );
                }

                reject(err);
            })

            .run();
    });
}

// ================================================================
// SUBIR VIDEO PROCESADO
// ================================================================

async function subirVideoProcesado(
    outputPath,
    userId,
    videoId,
    bucket,
    usaR2
) {
    const outputBuffer = fs.readFileSync(outputPath);

    if (!outputBuffer.length) {
        throw new Error('El video procesado está vacío.');
    }

    const sha256 = createHash('sha256')
        .update(outputBuffer)
        .digest('hex');

    let processedUrl;

    let processedKey;

    if (usaR2) {
        processedKey =
            bucket + '/' +
            userId + '/' +
            videoId + '_processed.mp4';

        processedUrl = await subirBufferR2(
            processedKey,
            outputBuffer,
            'video/mp4'
        );

        const registrado = await registrarArchivoHash({
            bucket: bucket,
            sha256: sha256,
            path: processedKey,
            publicUrl: processedUrl,
            size: outputBuffer.length
        });

        if (!registrado) {
            console.warn(
                '⚠️ Video subido, pero no se confirmó su registro hash.'
            );
        }

    } else {
        processedKey =
            userId + '/' +
            videoId + '_processed.mp4';

        const { error } = await supabaseAdmin.storage
            .from(bucket)
            .upload(processedKey, outputBuffer, {
                contentType: 'video/mp4',
                cacheControl: '31536000',
                upsert: true
            });

        if (error) {
            throw new Error(
                'Error subiendo video a Supabase: ' +
                error.message
            );
        }

        const { data } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(processedKey);

        if (!data || !data.publicUrl) {
            throw new Error(
                'No se pudo obtener la URL pública del video.'
            );
        }

        processedUrl = data.publicUrl;
    }

    return {
        url: processedUrl,
        key: processedKey,
        size: outputBuffer.length,
        sha256: sha256
    };
}

// ================================================================
// ACTUALIZAR BASE DE DATOS
// ================================================================

async function actualizarVideoDB(videoId, processedUrl) {
    const { data, error } = await supabaseAdmin
        .from('videos')
        .update({
            url_video: processedUrl,
            estado: 'publicado',
            updated_at: new Date().toISOString()
        })
        .eq('id', videoId)
        .select('id');

    if (error) {
        throw new Error(
            'No se pudo actualizar la base de datos: ' +
            error.message
        );
    }

    if (!data || data.length === 0) {
        throw new Error(
            'La actualización no confirmó ningún registro de video.'
        );
    }

    return true;
}

// ================================================================
// BORRADO SEGURO DEL ORIGINAL
// ================================================================

async function borrarOriginalSeguro(
    usaR2,
    keyOriginal,
    bucket,
    videoUrl,
    videoId
) {
    if (!keyOriginal) return;

    try {
        if (usaR2) {
            // Sin URL original no se puede comprobar si está compartido.
            if (!videoUrl) {
                console.warn(
                    '⚠️ No se borra original: falta URL para comprobar referencias.'
                );

                return;
            }

            const enUso = await archivoOriginalEnUso(
                videoUrl,
                videoId
            );

            if (enUso) {
                console.log(
                    'ℹ️ Original compartido. Se conserva en R2.'
                );

                return;
            }

            await borrarR2(keyOriginal);

            const { error } = await supabaseAdmin
                .from('archivos_hash')
                .delete()
                .eq('bucket', bucket)
                .eq('path', keyOriginal);

            if (error) {
                console.warn(
                    '⚠️ No se pudo eliminar el registro hash:',
                    error.message
                );
            }

            console.log('✅ Original eliminado de R2.');

        } else {
            const { error } = await supabaseAdmin.storage
                .from(bucket)
                .remove([keyOriginal]);

            if (error) {
                throw new Error(error.message);
            }

            console.log('✅ Original eliminado de Supabase.');
        }

    } catch (error) {
        console.warn(
            '⚠️ No se pudo borrar el original:',
            error.message
        );
    }
}

// ================================================================
// FUNCIÓN PRINCIPAL
// ================================================================

async function procesarVideo(job) {
    const datos = job.data || {};

    const videoId = datos.videoId;
    const videoUrl = datos.videoUrl;
    const userId = datos.userId;

    const bucket = datos.bucket || 'videos';

    const filePath = datos.filePath;
    const audioUrl = datos.audioUrl;

    const storage = datos.storage;

    const r2Key = datos.r2Key;

    const usaR2 = storage === 'r2';

    const keyOriginal = r2Key || filePath;

    const rutas = obtenerRutasTemporales(job.id);

    let tieneAudio = false;
    let tieneAudioExterno = false;

    let procesado = false;

    console.log('');
    console.log('========================================');
    console.log('📹 JOB:', job.id);
    console.log('🎞️ VIDEO:', videoId);
    console.log('☁️ STORAGE:', usaR2 ? 'R2' : 'SUPABASE');
    console.log('🎵 AUDIO EXTERNO:', audioUrl ? 'SÍ' : 'NO');
    console.log('========================================');

    try {
        if (!videoId) {
            throw new Error('Falta videoId.');
        }

        if (!userId) {
            throw new Error('Falta userId.');
        }

        if (usaR2 && !r2Client) {
            throw new Error('El job requiere R2, pero R2 no está configurado.');
        }

        if (!usaR2 && !videoUrl) {
            throw new Error('Falta videoUrl para almacenamiento legacy.');
        }

        if (!keyOriginal && usaR2) {
            throw new Error('Falta la clave original de R2.');
        }

        if (!fs.existsSync(LOGO_PATH)) {
            throw new Error(
                'No existe el logo gráfico: ' + LOGO_PATH
            );
        }

        validarArchivo(LOGO_PATH, 'Logo WEB3');

        await job.updateProgress(5);

        // --------------------------------------------------------
        // PASO 1: DESCARGAR VIDEO
        // --------------------------------------------------------

        console.log('📥 Descargando video original...');

        await descargarVideoOriginal(
            videoUrl,
            storage,
            keyOriginal,
            rutas.input,
            job.id
        );

        await job.updateProgress(10);

        // --------------------------------------------------------
        // PASO 2: AUDIO EXTERNO
        // --------------------------------------------------------

        tieneAudioExterno = await descargarAudioExterno(
            audioUrl,
            rutas.audio,
            job.id
        );

        await job.updateProgress(15);

        // --------------------------------------------------------
        // PASO 3: METADATA
        // --------------------------------------------------------

        const metadata = await obtenerMetadata(rutas.input);

        if (!metadata || !metadata.streams) {
            throw new Error('FFprobe no devolvió streams válidos.');
        }

        const videoStream = metadata.streams.find(
            function (stream) {
                return stream.codec_type === 'video';
            }
        );

        const audioStream = metadata.streams.find(
            function (stream) {
                return stream.codec_type === 'audio';
            }
        );

        if (!videoStream) {
            throw new Error('El archivo no contiene video.');
        }

        const width = Number(videoStream.width);
        const height = Number(videoStream.height);

        const duration = Number(metadata.format.duration);

        if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 2 ||
            height < 2
        ) {
            throw new Error('Dimensiones de video inválidas.');
        }

        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error('Duración del video inválida.');
        }

        tieneAudio = Boolean(audioStream);

        console.log('📐 Dimensiones:', width + 'x' + height);
        console.log('⏱️ Duración:', duration);
        console.log('🔊 Audio original:', tieneAudio);
        console.log('🎵 Música externa:', tieneAudioExterno);

        await job.updateProgress(20);

        // --------------------------------------------------------
        // PASO 4: CONSTRUIR FILTROS
        // --------------------------------------------------------

        const filtro = construirFiltroVideo(
            width,
            height,
            tieneAudio,
            tieneAudioExterno,
            duration
        );

        console.log('🎨 Aplicando marca de agua gráfica.');
        console.log(
            '📐 Salida:',
            filtro.width + 'x' + filtro.height
        );

        console.log(
            '🖼️ Logo:',
            filtro.logoWidth + 'x' + filtro.logoHeight
        );

        console.log('🔒 Opacidad del logo: 50%');

        await job.updateProgress(25);

        // --------------------------------------------------------
        // PASO 5: PROCESAMIENTO FFMPEG
        // --------------------------------------------------------

        console.log('🎬 Iniciando FFmpeg...');

        await ejecutarFFmpeg(
            rutas.input,
            rutas.output,
            rutas.audio,
            tieneAudio,
            tieneAudioExterno,
            filtro,
            job
        );

        const outputSize = validarArchivo(
            rutas.output,
            'Video procesado'
        );

        console.log(
            '✅ Video procesado:',
            (outputSize / 1048576).toFixed(2),
            'MB'
        );

        await job.updateProgress(80);

        // --------------------------------------------------------
        // PASO 6: SUBIR RESULTADO
        // --------------------------------------------------------

        console.log('📤 Subiendo video procesado...');

        const resultado = await subirVideoProcesado(
            rutas.output,
            userId,
            videoId,
            bucket,
            usaR2
        );

        console.log('✅ Video subido:', resultado.url);

        await job.updateProgress(90);

        // --------------------------------------------------------
        // PASO 7: ACTUALIZAR BASE DE DATOS
        // --------------------------------------------------------

        console.log('💾 Actualizando registro de video...');

        await actualizarVideoDB(
            videoId,
            resultado.url
        );

        procesado = true;

        console.log('✅ Base de datos actualizada.');

        await job.updateProgress(95);

        // --------------------------------------------------------
        // PASO 8: BORRADO SEGURO
        // --------------------------------------------------------

        if (keyOriginal) {
            await borrarOriginalSeguro(
                usaR2,
                keyOriginal,
                bucket,
                videoUrl,
                videoId
            );
        }

        await job.updateProgress(100);

        console.log('');
        console.log('========================================');
        console.log('✅ JOB COMPLETADO:', job.id);
        console.log('========================================');

        return {
            success: true,
            processedUrl: resultado.url,
            videoId: videoId,
            tieneAudio: tieneAudio,
            tieneAudioExterno: tieneAudioExterno,
            size: resultado.size
        };

    } catch (error) {
        console.error('');
        console.error('❌ JOB FALLIDO:', job.id);
        console.error('❌ ERROR:', error.message);

        const maxIntentos = job.opts.attempts || 1;

        const esUltimoIntento =
            (job.attemptsMade + 1) >= maxIntentos;

        if (esUltimoIntento && !procesado) {
            try {
                const { error: dbError } = await supabaseAdmin
                    .from('videos')
                    .update({
                        estado: 'error_procesamiento',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', videoId);

                if (dbError) {
                    console.warn(
                        '⚠️ No se pudo marcar el video como error:',
                        dbError.message
                    );
                } else {
                    console.log(
                        '📝 Video marcado con error_procesamiento.'
                    );
                }

            } catch (dbError) {
                console.warn(
                    '⚠️ Error actualizando estado:',
                    dbError.message
                );
            }

        } else if (!esUltimoIntento) {
            console.log(
                '🔄 Se reintentará el procesamiento.'
            );
        }

        throw error;

    } finally {
        // Los temporales se eliminan tanto en éxito como en error.
        limpiarTemporales(rutas);
    }
}

// ================================================================
// WORKER BULLMQ
// ================================================================

const worker = new Worker(
    COLA_NOMBRE,
    procesarVideo,
    {
        connection: redisConnection,
        concurrency: MAX_CONCURRENT,

        limiter: {
            max: 3,
            duration: 60000
        }
    }
);

worker.on('completed', function (job, result) {
    console.log(
        '✅ Worker: Job ' + job.id + ' completado.'
    );

    console.log('URL:', result.processedUrl);

    console.log(
        'Audio original:',
        result.tieneAudio ? 'SÍ' : 'NO'
    );

    console.log(
        'Audio externo:',
        result.tieneAudioExterno ? 'SÍ' : 'NO'
    );
});

worker.on('failed', function (job, err) {
    console.error(
        '❌ Worker: Job ' + (job ? job.id : 'desconocido') +
        ' falló:',
        err.message
    );
});

worker.on('error', function (err) {
    console.error(
        '❌ Error general del Worker:',
        err.message
    );
});

worker.on('ready', function () {
    console.log('✅ Worker listo para procesar videos.');
});

// ================================================================
// HEALTH CHECK
// ================================================================

const http = require('http');

const healthServer = http.createServer(
    function (req, res) {
        if (
            req.url === '/health' ||
            req.url === '/'
        ) {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            });

            res.end(
                JSON.stringify({
                    status: 'ok',
                    service: 'worker-video',
                    version: '5.4',
                    redis: redisConnection.status,
                    r2: r2Configurado,
                    watermark: true,
                    ffmpegDrawtextRequired: false,
                    timestamp: new Date().toISOString()
                })
            );

            return;
        }

        res.writeHead(404);
        res.end('Not found');
    }
);

healthServer.listen(
    PORT,
    '0.0.0.0',
    function () {
        console.log(
            '🏥 Health check en puerto ' + PORT
        );
    }
);

// ================================================================
// CIERRE CONTROLADO
// ================================================================

let cerrando = false;

async function cerrarWorker(signal) {
    if (cerrando) return;

    cerrando = true;

    console.log(
        '🛑 ' + signal + ' recibido. Cerrando servicios...'
    );

    try {
        await worker.close();
    } catch (error) {
        console.error(
            '⚠️ Error cerrando Worker:',
            error.message
        );
    }

    try {
        await redisConnection.quit();
    } catch (error) {
        console.error(
            '⚠️ Error cerrando Redis:',
            error.message
        );
    }

    healthServer.close(function () {
        console.log('✅ Servicios cerrados.');
        process.exit(0);
    });
}

process.on('SIGTERM', function () {
    cerrarWorker('SIGTERM');
});

process.on('SIGINT', function () {
    cerrarWorker('SIGINT');
});

// ================================================================
// ERRORES GLOBALES
// ================================================================

process.on('uncaughtException', function (err) {
    console.error(
        '❌ UNCAUGHT EXCEPTION:',
        err
    );

    console.error(
        '🔴 Railway reiniciará el contenedor.'
    );

    process.exit(1);
});

process.on('unhandledRejection', function (reason) {
    console.error(
        '❌ UNHANDLED REJECTION:',
        reason
    );
});

// ================================================================
// INICIO
// ================================================================

console.log('');
console.log('========================================');
console.log("🎬 WORKER CSARIEL'S v5.4");
console.log('========================================');

console.log('📡 Cola:', COLA_NOMBRE);
console.log('🔢 Concurrencia:', MAX_CONCURRENT);
console.log('📁 Temporales:', TEMP_DIR);
console.log('🖼️ Logo:', LOGO_PATH);
console.log('☁️ R2:', r2Configurado ? 'CONFIGURADO' : 'NO CONFIGURADO');
console.log('🎵 Audio original: 40%');
console.log('🎵 Música externa: 100%');
console.log('🖼️ Marca de agua: PNG al 50%');
console.log('🎯 Limiter: 3 trabajos/minuto');
console.log('🔒 Dependencia drawtext: NO');
console.log('========================================');
console.log('🚀 WORKER LISTO');
console.log('========================================');
