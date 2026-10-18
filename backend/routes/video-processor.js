/* ================================================================
   ROUTES/VIDEO-PROCESSOR.JS - SARIEL'S ECOSYSTEM
   ================================================================
   Endpoint que recibe el video recién subido y lo pone en cola
   para que el Worker lo procese (eliminar marca externa + poner
   marca de Sariel's).

   FLUJO:
   1. Usuario sube video a Supabase Storage (desde el frontend)
   2. Frontend llama a POST /api/video/queue
   3. Este endpoint agrega un job a la cola de Redis
   4. Worker procesa en background
   5. Frontend hace polling a GET /api/video/status/:jobId
   6. Cuando termina, el video procesado reemplaza al original

   FIX v3 (Auditoría Quirúrgica):
   - jobId estable + Índice único parcial en DB (evita duplicados reales).
   - Validación estricta de filePath y UUIDs.
   - videoUrl se toma de la DB, no del body.
   - Cierre limpio de Redis (SIGTERM/SIGINT).
   - Manejo de estado 'stalled' y protección anti "revivir cancelados".
   ================================================================ */

const express = require('express');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// ================================================================
// CONFIGURACIÓN DE SUPABASE ADMIN
// ================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : null;

if (!supabaseAdmin) {
    console.error('❌ [video-processor] Faltan credenciales de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
}

// ================================================================
// CONFIGURACIÓN DE REDIS Y COLA
// ================================================================
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const COLA_NOMBRE = 'video-processing';

const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0,
    retryStrategy: (times) => Math.min(times * 1000, 30000)
});

redisConnection.on('connect', () => {
    console.log('📡 [video-processor] Conectado a Redis');
});
redisConnection.on('error', (err) => {
    console.error('❌ [video-processor] Error de conexión a Redis:', err.message);
});

const videoQueue = new Queue(COLA_NOMBRE, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: {
            age: 24 * 3600,
            count: 100
        },
        removeOnFail: {
            age: 7 * 24 * 3600,
            count: 500 // ✅ FIX: Evitar crecimiento infinito de jobs fallidos
        }
    }
});

// ✅ FIX: Cierre limpio para evitar jobs huérfanos en producción
process.once('SIGTERM', async () => {
    console.log('🛑 [video-processor] Cerrando cola y Redis por SIGTERM...');
    await videoQueue.close();
    await redisConnection.quit();
});
process.once('SIGINT', async () => {
    console.log('🛑 [video-processor] Cerrando cola y Redis por SIGINT...');
    await videoQueue.close();
    await redisConnection.quit();
});

// ================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ================================================================
async function autenticar(req, res, next) {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Servidor no configurado correctamente' });
        }

        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const token = auth.slice(7).trim();
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('❌ Error autenticando:', err);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   POST /api/video/queue
   Agrega un video a la cola de procesamiento
================================================================ */
router.post('/queue', autenticar, async (req, res) => {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Admin no configurado' });
        }

        // ✅ FIX: videoUrl ya no se pide en el body, se toma de la DB
        const { videoId, filePath } = req.body;

        // Validaciones
        if (!videoId || !filePath) {
            return res.status(400).json({
                success: false,
                error: 'videoId y filePath son requeridos'
            });
        }

        // ✅ FIX: Validar que videoId sea un UUID válido
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(videoId)) {
            return res.status(400).json({ success: false, error: 'videoId inválido' });
        }

        // ✅ FIX SEGURIDAD: validar filePath estrictamente
        if (
            !filePath.startsWith(req.user.id + '/') ||
            filePath.includes('..') ||
            filePath.includes('//') ||
            filePath.includes('\\') ||
            filePath.length > 512
        ) {
            return res.status(400).json({
                success: false,
                error: 'filePath inválido o malicioso'
            });
        }

        // Verificar que el video pertenece al usuario
        const { data: video, error: videoError } = await supabaseAdmin
            .from('videos')
            .select('id, usuario_id, url_video, estado')
            .eq('id', videoId)
            .maybeSingle();

        // ✅ FIX: Distinguir error de DB de un 404 real
        if (videoError) {
            console.error('❌ Error buscando video:', videoError);
            return res.status(500).json({ success: false, error: 'Error consultando el video' });
        }
        
        if (!video) {
            return res.status(404).json({ success: false, error: 'Video no encontrado' });
        }

        if (video.usuario_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'No eres el dueño de este video' });
        }

        if (!video.url_video) {
            return res.status(400).json({ success: false, error: 'El video no tiene una URL válida registrada' });
        }

        // Verificar que no haya un job activo en DB
        const { data: existingJob } = await supabaseAdmin
            .from('video_jobs')
            .select('job_id, estado')
            .eq('video_id', videoId)
            .in('estado', ['pendiente', 'procesando'])
            .maybeSingle();

        if (existingJob) {
            return res.json({
                success: true,
                jobId: existingJob.job_id,
                message: 'Este video ya está en proceso',
                estado: existingJob.estado
            });
        }

        // jobId estable: Mismo video siempre genera el mismo jobId.
        const stableJobId = `video_${videoId}`;

        let job;
        try {
            job = await videoQueue.add('process-video', {
                videoId,
                videoUrl: video.url_video,
                userId: req.user.id,
                bucket: 'videos',
                filePath
            }, {
                jobId: stableJobId
            });
        } catch (bullError) {
            // Si BullMQ dice que ya existe, recuperamos el existente
            if (/already exists/i.test(bullError.message)) {
                job = await videoQueue.getJob(stableJobId);
                if (!job) throw bullError;
            } else {
                throw bullError;
            }
        }

        console.log(`📥 [QUEUE] Job creado: ${job.id} para video: ${videoId}`);

        // Guardar el job en la DB para hacer tracking
        const { error: insErr } = await supabaseAdmin
            .from('video_jobs')
            .insert({
                video_id: videoId,
                usuario_id: req.user.id,
                job_id: job.id,
                estado: 'pendiente'
            });

        // ✅ FIX: Manejo del Índice Único Parcial en la Base de Datos
        if (insErr) {
            if (insErr.code === '23505') {
                // Violación de UNIQUE: Otro request concurrente ganó la carrera
                const { data: fallbackJob } = await supabaseAdmin
                    .from('video_jobs')
                    .select('job_id, estado')
                    .eq('video_id', videoId)
                    .in('estado', ['pendiente', 'procesando'])
                    .maybeSingle();

                // Limpiamos el job que acabamos de crear en Redis (duplicado)
                try { await job.remove(); } catch (e) {}

                return res.json({
                    success: true,
                    jobId: fallbackJob?.job_id || job.id,
                    message: 'Este video ya está en proceso',
                    estado: fallbackJob?.estado || 'pendiente'
                });
            }

            console.error('❌ Error insertando en video_jobs:', insErr);
            try { await job.remove(); } catch (e) {} // Limpiamos Redis
            return res.status(500).json({ 
                success: false, 
                error: 'No se pudo registrar el job en la base de datos' 
            });
        }

        return res.json({
            success: true,
            jobId: job.id,
            message: 'Video en cola de procesamiento',
            estado: 'pendiente',
            progreso: 0 // ✅ FIX: Consistencia con el endpoint /status
        });

    } catch (error) {
        console.error('❌ Error agregando a la cola:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno'
        });
    }
});

/* ================================================================
   GET /api/video/status/:jobId
================================================================ */
router.get('/status/:jobId', autenticar, async (req, res) => {
    try {
        const { jobId } = req.params;

        const { data: dbJob, error: dbError } = await supabaseAdmin
            .from('video_jobs')
            // ✅ FIX: Seleccionar columnas explícitas en lugar de '*'
            .select('job_id, video_id, estado, progreso, error, created_at, updated_at')
            .eq('job_id', jobId)
            .eq('usuario_id', req.user.id)
            .maybeSingle();

        if (dbError) {
            console.error('❌ Error en DB status:', dbError);
            return res.status(500).json({ success: false, error: 'Error consultando la base de datos' });
        }

        if (!dbJob) {
            return res.status(404).json({ success: false, error: 'Job no encontrado' });
        }

        // ✅ FIX: Evitar que un job cancelado "reviva"
        if (dbJob.estado === 'cancelado') {
            return res.json({ success: true, jobId, estado: 'cancelado', progreso: 0 });
        }

        const job = await videoQueue.getJob(jobId);

        if (!job) {
            return res.json({
                success: true,
                jobId,
                videoId: dbJob.video_id,
                estado: dbJob.estado,
                progreso: dbJob.estado === 'completado' ? 100 : (dbJob.progreso || 0)
            });
        }

        const state = await job.getState();
        
        // ✅ FIX: Normalizar el progreso (BullMQ permite números u objetos)
        const rawProgress = job.progress;
        const progress = typeof rawProgress === 'number' 
            ? rawProgress 
            : (rawProgress && typeof rawProgress === 'object' ? (rawProgress.percent || 0) : 0);

        const failedReason = job.failedReason;
        const returnValue = job.returnvalue;

        let estado = 'pendiente';
        if (state === 'completed') estado = 'completado';
        else if (state === 'failed') estado = 'fallido';
        else if (state === 'active') estado = 'procesando';
        else if (state === 'waiting') estado = 'pendiente';
        else if (state === 'delayed') estado = 'pendiente';
        else if (state === 'stalled') estado = 'fallido'; // ✅ FIX: Soporte para worker muerto

        if (dbJob.estado !== estado) {
            const { error: upError } = await supabaseAdmin
                .from('video_jobs')
                .update({
                    estado,
                    progreso: progress,
                    error: failedReason || null,
                    updated_at: new Date().toISOString()
                })
                .eq('job_id', jobId);
                
            if (upError) console.error('⚠️ No se pudo actualizar el estado en DB:', upError);
        }

        const response = {
            success: true,
            jobId,
            videoId: dbJob.video_id,
            estado,
            progreso: progress
        };

        if (estado === 'completado' && returnValue && returnValue.processedUrl) {
            response.processedUrl = returnValue.processedUrl;
        }

        if (estado === 'fallido' && failedReason) {
            response.error = failedReason;
        }

        return res.json(response);

    } catch (error) {
        console.error('❌ Error consultando status:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno'
        });
    }
});

/* ================================================================
   GET /api/video/jobs
================================================================ */
router.get('/jobs', autenticar, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const limit = 50;
        const offset = page * limit;

        const { data: jobs, error } = await supabaseAdmin
            .from('video_jobs')
            .select('job_id, video_id, estado, progreso, error, created_at, updated_at')
            .eq('usuario_id', req.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1); // ✅ FIX: Paginación real

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.json({
            success: true,
            jobs: jobs || []
        });

    } catch (error) {
        console.error('❌ Error listando jobs:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno'
        });
    }
});

/* ================================================================
   DELETE /api/video/jobs/:jobId
================================================================ */
router.delete('/jobs/:jobId', autenticar, async (req, res) => {
    try {
        const { jobId } = req.params;

        const { data: dbJob } = await supabaseAdmin
            .from('video_jobs')
            .select('job_id, estado')
            .eq('job_id', jobId)
            .eq('usuario_id', req.user.id)
            .maybeSingle();

        if (!dbJob) {
            return res.status(404).json({ success: false, error: 'Job no encontrado' });
        }

        if (dbJob.estado === 'procesando' || dbJob.estado === 'completado') {
            return res.status(400).json({
                success: false,
                error: 'No se puede cancelar un job que ya está procesando o completado'
            });
        }

        const job = await videoQueue.getJob(jobId);
        if (job) {
            // ✅ FIX: Verificar el estado real en Redis antes de borrar (evitar race conditions)
            const state = await job.getState();
            if (state === 'active') {
                return res.status(409).json({ 
                    success: false, 
                    error: 'El worker ya tomó este job, no se puede cancelar a tiempo' 
                });
            }

            try {
                await job.remove();
            } catch (removeErr) {
                // Si el job ya no existe en Redis o está bloqueado, lo ignoramos
                if (!/locked|not exist/i.test(removeErr.message)) {
                    throw removeErr;
                }
            }
        }

        await supabaseAdmin
            .from('video_jobs')
            .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
            .eq('job_id', jobId);

        return res.json({ success: true, message: 'Job cancelado correctamente' });

    } catch (error) {
        console.error('❌ Error cancelando job:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno'
        });
    }
});

// ✅ FIX: Exportar la cola para métricas o cierre desde app.js si es necesario
module.exports = router;