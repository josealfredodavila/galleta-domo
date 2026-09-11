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

// ================================================================
// CONFIGURACIÓN DE REDIS Y COLA
// ================================================================
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const COLA_NOMBRE = 'video-processing';

const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 1000, 30000)
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
            age: 24 * 3600, // Borrar jobs completados después de 24 horas
            count: 100
        },
        removeOnFail: {
            age: 7 * 24 * 3600 // Borrar jobs fallidos después de 7 días
        }
    }
});

// ================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ================================================================
async function autenticar(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const token = auth.slice(7).trim();
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Token inválido' });
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
   
   Body: {
       videoId: "uuid-del-video-en-supabase",
       videoUrl: "https://...url-del-video-recien-subido.mp4",
       bucket: "videos",
       filePath: "userId/timestamp.mp4"
   }
   
   Response: {
       success: true,
       jobId: "1",
       message: "Video en cola de procesamiento"
   }
================================================================ */
router.post('/queue', autenticar, async (req, res) => {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Admin no configurado' });
        }

        const { videoId, videoUrl, bucket = 'videos', filePath } = req.body;

        // Validaciones
        if (!videoId || !videoUrl) {
            return res.status(400).json({
                success: false,
                error: 'videoId y videoUrl son requeridos'
            });
        }

        if (!filePath) {
            return res.status(400).json({
                success: false,
                error: 'filePath es requerido'
            });
        }

        // Verificar que el video pertenece al usuario
        const { data: video, error: videoError } = await supabaseAdmin
            .from('videos')
            .select('id, usuario_id, url_video, estado')
            .eq('id', videoId)
            .maybeSingle();

        if (videoError || !video) {
            return res.status(404).json({ success: false, error: 'Video no encontrado' });
        }

        if (video.usuario_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'No eres el dueño de este video' });
        }

        // Verificar que no haya un job activo para este video
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

        // Agregar el job a la cola
        const job = await videoQueue.add('process-video', {
            videoId,
            videoUrl,
            userId: req.user.id,
            bucket,
            filePath
        }, {
            jobId: `video_${videoId}_${Date.now()}`
        });

        console.log(`📥 [QUEUE] Job creado: ${job.id} para video: ${videoId}`);

        // Guardar el job en la DB para hacer tracking
        await supabaseAdmin
            .from('video_jobs')
            .insert({
                video_id: videoId,
                usuario_id: req.user.id,
                job_id: job.id,
                estado: 'pendiente',
                created_at: new Date().toISOString()
            });

        return res.json({
            success: true,
            jobId: job.id,
            message: 'Video en cola de procesamiento',
            estado: 'pendiente'
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
   Consulta el estado de un job
   
   Response: {
       success: true,
       jobId: "1",
       estado: "pendiente|procesando|completado|fallido",
       progreso: 45,
       processedUrl: "https://...", (si completado)
       error: "..." (si falló)
   }
================================================================ */
router.get('/status/:jobId', autenticar, async (req, res) => {
    try {
        const { jobId } = req.params;

        // Buscar en la DB primero
        const { data: dbJob, error: dbError } = await supabaseAdmin
            .from('video_jobs')
            .select('*')
            .eq('job_id', jobId)
            .eq('usuario_id', req.user.id)
            .maybeSingle();

        if (dbError || !dbJob) {
            return res.status(404).json({ success: false, error: 'Job no encontrado' });
        }

        // Consultar BullMQ
        const job = await videoQueue.getJob(jobId);

        if (!job) {
            // Si ya no está en Redis pero sí en DB, devolver el estado de la DB
            return res.json({
                success: true,
                jobId,
                estado: dbJob.estado,
                progreso: dbJob.estado === 'completado' ? 100 : 0
            });
        }

        const state = await job.getState();
        const progress = job.progress || 0;
        const failedReason = job.failedReason;
        const returnValue = job.returnvalue;

        // Mapear estados de BullMQ a estados legibles
        let estado = 'pendiente';
        if (state === 'completed') estado = 'completado';
        else if (state === 'failed') estado = 'fallido';
        else if (state === 'active') estado = 'procesando';
        else if (state === 'waiting') estado = 'pendiente';
        else if (state === 'delayed') estado = 'pendiente';

        // Actualizar la DB si cambió el estado
        if (dbJob.estado !== estado) {
            await supabaseAdmin
                .from('video_jobs')
                .update({
                    estado,
                    progreso: progress,
                    error: failedReason || null,
                    updated_at: new Date().toISOString()
                })
                .eq('job_id', jobId);
        }

        const response = {
            success: true,
            jobId,
            estado,
            progreso: progress
        };

        if (estado === 'completado' && returnValue) {
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
   Lista los jobs del usuario autenticado
================================================================ */
router.get('/jobs', autenticar, async (req, res) => {
    try {
        const { data: jobs, error } = await supabaseAdmin
            .from('video_jobs')
            .select('job_id, video_id, estado, progreso, error, created_at, updated_at')
            .eq('usuario_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

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
   Cancela un job (si no ha empezado)
================================================================ */
router.delete('/jobs/:jobId', autenticar, async (req, res) => {
    try {
        const { jobId } = req.params;

        const { data: dbJob } = await supabaseAdmin
            .from('video_jobs')
            .select('*')
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
            await job.remove();
        }

        await supabaseAdmin
            .from('video_jobs')
            .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
            .eq('job_id', jobId);

        return res.json({ success: true, message: 'Job cancelado' });

    } catch (error) {
        console.error('❌ Error cancelando job:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno'
        });
    }
});

module.exports = router;