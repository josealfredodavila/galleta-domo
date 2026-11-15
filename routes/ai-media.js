/* ================================================================
   routes/ai-media.js · GENERACIÓN DE IMAGEN Y VIDEO (v1.0)
   ================================================================
   Modelo: NVIDIA Cosmos3 Nano (cosmos3-nano)
   Endpoint: POST https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos3-nano

   Flujo:
   1. El usuario pide una imagen o un video desde Promi.
   2. El backend genera el archivo y lo guarda en R2 en una ruta PRIVADA.
   3. La vista previa usa un enlace firmado que caduca en 10 minutos.
   4. Solo al "Aceptar" el contenido queda como aceptado para campañas.
   5. No existe ningún endpoint de descarga para el usuario.

   Montaje en el servidor principal:
     app.use('/api/ai/media', require('./routes/ai-media'));

   Dependencias nuevas:
     npm install @aws-sdk/s3-request-presigner

   Variables de entorno:
     NVIDIA_API_KEY        (obligatoria)
     NVIDIA_COSMOS_URL     (opcional, por defecto el endpoint oficial)
     MEDIA_LIMITE_DIA      (opcional, por defecto 10)
     R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
================================================================ */

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_COSMOS_URL =
    process.env.NVIDIA_COSMOS_URL ||
    'https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos3-nano';

const MEDIA_LIMITE_DIA = Number(process.env.MEDIA_LIMITE_DIA) || 10;
const PREVIEW_EXPIRA_SEG = 600;           // la vista previa caduca en 10 minutos
const TIMEOUT_IMAGEN_MS = 120000;         // 2 minutos
const TIMEOUT_VIDEO_MS = 600000;          // 10 minutos, el video tarda más
const PROMPT_MIN = 3;
const PROMPT_MAX = 1000;

const R2_BUCKET = process.env.R2_BUCKET || 'csariels-media';

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

const supabaseAdmin =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                }
            }
        )
        : null;

/* ================================================================
   AUTENTICACIÓN (igual que en ai-chat.js)
================================================================ */

async function autenticar(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const token = auth.slice(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token no proporcionado' });
        }
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Supabase no está configurado' });
        }

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
        }

        req.user = user;
        return next();
    } catch (error) {
        console.error('❌ Error autenticando media IA:', error.message);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   HELPERS
================================================================ */

function validarPrompt(prompt) {
    if (typeof prompt !== 'string') return 'Falta el prompt.';
    const limpio = prompt.trim();
    if (limpio.length < PROMPT_MIN) return `El prompt debe tener al menos ${PROMPT_MIN} caracteres.`;
    if (limpio.length > PROMPT_MAX) return `El prompt no puede exceder ${PROMPT_MAX} caracteres.`;
    return null;
}

/*
 * Llama a Cosmos3 Nano. Devuelve el JSON de respuesta.
 * Lanza errores con:
 *   .rechazado = true  → el contenido fue denegado por seguridad (HTTP 422)
 *   .status            → código HTTP recibido
 * No reintenta automáticamente: un timeout no significa que se haya
 * detenido la generación, así que reenviar podría cobrar dos veces.
 */
async function llamarCosmos(payload, timeoutMs) {
    if (!NVIDIA_API_KEY) {
        const error = new Error('NVIDIA_API_KEY no está configurada');
        error.status = 500;
        throw error;
    }

    const respuesta = await axios.post(NVIDIA_COSMOS_URL, payload, {
        headers: {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        timeout: timeoutMs,
        validateStatus: () => true
    });

    if (respuesta.status === 422) {
        const error = new Error('contenido_rechazado');
        error.rechazado = true;
        error.status = 422;
        throw error;
    }

    if (respuesta.status < 200 || respuesta.status >= 300) {
        const error = new Error(`NVIDIA respondió HTTP ${respuesta.status}`);
        error.status = respuesta.status;
        console.error('❌ Cosmos3 error:', respuesta.status, JSON.stringify(respuesta.data).slice(0, 300));
        throw error;
    }

    return respuesta.data || {};
}

async function subirPrivado(key, buffer, contentType) {
    await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'private, no-store'
    }));
}

async function urlVistaPrevia(key) {
    return getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
        { expiresIn: PREVIEW_EXPIRA_SEG }
    );
}

async function contarHoy(usuarioId) {
    const inicioDia = new Date();
    inicioDia.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabaseAdmin
        .from('ai_media_borradores')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId)
        .gte('created_at', inicioDia.toISOString());

    if (error) throw error;
    return count || 0;
}

async function obtenerDelUsuario(id, usuarioId) {
    const { data, error } = await supabaseAdmin
        .from('ai_media_borradores')
        .select('*')
        .eq('id', id)
        .eq('usuario_id', usuarioId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

function respuestaError(res, error, mensajeGenerico) {
    if (error.rechazado) {
        return res.status(422).json({
            success: false,
            error: 'contenido_rechazado',
            mensaje: 'El contenido fue rechazado por las políticas de seguridad. Cambia la descripción e intenta de nuevo.'
        });
    }
    return res.status(502).json({ success: false, error: mensajeGenerico });
}

/* ================================================================
   POST /imagen
   Genera una imagen (text2image) y la deja como borrador privado.
================================================================ */

router.post('/imagen', autenticar, async (req, res) => {
    try {
        const { prompt } = req.body || {};
        const errorPrompt = validarPrompt(prompt);
        if (errorPrompt) return res.status(400).json({ success: false, error: errorPrompt });

        const usadosHoy = await contarHoy(req.user.id);
        if (usadosHoy >= MEDIA_LIMITE_DIA) {
            return res.status(429).json({
                success: false,
                error: 'limite_diario',
                mensaje: `Llegaste al límite de ${MEDIA_LIMITE_DIA} generaciones por día.`
            });
        }

        const promptLimpio = prompt.trim();

        let data;
        try {
            data = await llamarCosmos({
                model_mode: 'text2image',
                prompt: promptLimpio,
                resolution: '720_1_1'
            }, TIMEOUT_IMAGEN_MS);
        } catch (error) {
            return respuestaError(res, error, 'No se pudo generar la imagen. Intenta de nuevo.');
        }

        if (!data.b64_image) {
            return res.status(502).json({ success: false, error: 'La respuesta no contenía una imagen.' });
        }

        const { data: fila, error: errInsert } = await supabaseAdmin
            .from('ai_media_borradores')
            .insert({
                usuario_id: req.user.id,
                tipo: 'imagen',
                prompt: promptLimpio,
                estado: 'procesando'
            })
            .select('id')
            .single();

        if (errInsert) throw errInsert;

        const key = `ia/borradores/${req.user.id}/${fila.id}.jpg`;
        await subirPrivado(key, Buffer.from(data.b64_image, 'base64'), 'image/jpeg');

        await supabaseAdmin
            .from('ai_media_borradores')
            .update({ storage_key: key, estado: 'listo', updated_at: new Date().toISOString() })
            .eq('id', fila.id);

        return res.json({
            success: true,
            id: fila.id,
            tipo: 'imagen',
            estado: 'listo',
            preview_url: await urlVistaPrevia(key),
            vista_previa_seg: PREVIEW_EXPIRA_SEG
        });
    } catch (error) {
        console.error('❌ Error /imagen:', error.message);
        return res.status(500).json({ success: false, error: 'Error al generar la imagen.' });
    }
});

/* ================================================================
   POST /video
   Inicia la generación del video (text2video). El video tarda,
   así que se procesa en segundo plano y el frontend consulta
   GET /:id hasta que esté listo.
================================================================ */

async function procesarVideo(filaId, usuarioId, promptLimpio) {
    try {
        const data = await llamarCosmos({
            model_mode: 'text2video',
            prompt: promptLimpio,
            resolution: '480_16_9',
            num_frames: 25,
            num_inference_steps: 35,
            fps: 24
        }, TIMEOUT_VIDEO_MS);

        if (!data.b64_video) throw new Error('La respuesta no contenía un video');

        const buffer = Buffer.from(data.b64_video, 'base64');
        if (buffer.length === 0) throw new Error('El video recibido está vacío');

        const key = `ia/borradores/${usuarioId}/${filaId}.mp4`;
        await subirPrivado(key, buffer, 'video/mp4');

        await supabaseAdmin
            .from('ai_media_borradores')
            .update({ storage_key: key, estado: 'listo', updated_at: new Date().toISOString() })
            .eq('id', filaId);
    } catch (error) {
        const mensaje = error.rechazado
            ? 'contenido_rechazado'
            : 'No se pudo generar el video. Intenta de nuevo.';

        console.error('❌ Error procesando video:', filaId, error.message);

        await supabaseAdmin
            .from('ai_media_borradores')
            .update({ estado: 'error', error_mensaje: mensaje, updated_at: new Date().toISOString() })
            .eq('id', filaId);
    }
}

router.post('/video', autenticar, async (req, res) => {
    try {
        const { prompt } = req.body || {};
        const errorPrompt = validarPrompt(prompt);
        if (errorPrompt) return res.status(400).json({ success: false, error: errorPrompt });

        if (!NVIDIA_API_KEY) {
            return res.status(500).json({ success: false, error: 'Generación de video no configurada.' });
        }

        const usadosHoy = await contarHoy(req.user.id);
        if (usadosHoy >= MEDIA_LIMITE_DIA) {
            return res.status(429).json({
                success: false,
                error: 'limite_diario',
                mensaje: `Llegaste al límite de ${MEDIA_LIMITE_DIA} generaciones por día.`
            });
        }

        const promptLimpio = prompt.trim();

        const { data: fila, error } = await supabaseAdmin
            .from('ai_media_borradores')
            .insert({
                usuario_id: req.user.id,
                tipo: 'video',
                prompt: promptLimpio,
                estado: 'procesando'
            })
            .select('id, estado')
            .single();

        if (error) throw error;

        // Respuesta inmediata; el trabajo sigue en segundo plano
        res.status(202).json({ success: true, id: fila.id, tipo: 'video', estado: 'procesando' });

        procesarVideo(fila.id, req.user.id, promptLimpio);
        return undefined;
    } catch (error) {
        console.error('❌ Error /video:', error.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Error al iniciar el video.' });
        }
        return undefined;
    }
});

/* ================================================================
   GET /:id
   Consulta el estado de un borrador. Si está listo, devuelve
   una vista previa firmada que caduca.
================================================================ */

router.get('/:id', autenticar, async (req, res) => {
    try {
        const fila = await obtenerDelUsuario(req.params.id, req.user.id);
        if (!fila) return res.status(404).json({ success: false, error: 'No encontrado.' });

        const respuesta = {
            success: true,
            id: fila.id,
            tipo: fila.tipo,
            estado: fila.estado
        };

        if (fila.estado === 'error') {
            respuesta.error = fila.error_mensaje;
        }

        if (fila.estado === 'listo' && fila.storage_key) {
            respuesta.preview_url = await urlVistaPrevia(fila.storage_key);
            respuesta.vista_previa_seg = PREVIEW_EXPIRA_SEG;
        }

        return res.json(respuesta);
    } catch (error) {
        console.error('❌ Error GET media:', error.message);
        return res.status(500).json({ success: false, error: 'Error consultando el contenido.' });
    }
});

/* ================================================================
   POST /:id/aceptar
   El usuario aprueba el contenido para su campaña.
   Solo se puede aceptar algo que ya esté listo.
================================================================ */

router.post('/:id/aceptar', autenticar, async (req, res) => {
    try {
        const fila = await obtenerDelUsuario(req.params.id, req.user.id);
        if (!fila) return res.status(404).json({ success: false, error: 'No encontrado.' });

        if (fila.estado !== 'listo') {
            return res.status(409).json({
                success: false,
                error: 'estado_invalido',
                mensaje: 'Solo puedes aceptar contenido que ya esté listo.'
            });
        }

        const { error } = await supabaseAdmin
            .from('ai_media_borradores')
            .update({ estado: 'aceptada', updated_at: new Date().toISOString() })
            .eq('id', fila.id)
            .eq('usuario_id', req.user.id)
            .eq('estado', 'listo');

        if (error) throw error;

        return res.json({ success: true, id: fila.id, estado: 'aceptada' });
    } catch (error) {
        console.error('❌ Error aceptar media:', error.message);
        return res.status(500).json({ success: false, error: 'No se pudo aceptar el contenido.' });
    }
});

/* ================================================================
   POST /:id/descartar
   Borra el archivo de R2 y marca el borrador como descartado.
================================================================ */

router.post('/:id/descartar', autenticar, async (req, res) => {
    try {
        const fila = await obtenerDelUsuario(req.params.id, req.user.id);
        if (!fila) return res.status(404).json({ success: false, error: 'No encontrado.' });

        if (fila.estado === 'aceptada') {
            return res.status(409).json({
                success: false,
                error: 'estado_invalido',
                mensaje: 'El contenido aceptado no se puede descartar.'
            });
        }

        if (fila.storage_key) {
            try {
                await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: fila.storage_key }));
            } catch (e) {
                console.warn('⚠️ No se pudo borrar de R2:', e.message);
            }
        }

        await supabaseAdmin
            .from('ai_media_borradores')
            .update({ estado: 'descartada', storage_key: null, updated_at: new Date().toISOString() })
            .eq('id', fila.id);

        return res.json({ success: true, id: fila.id, estado: 'descartada' });
    } catch (error) {
        console.error('❌ Error descartar media:', error.message);
        return res.status(500).json({ success: false, error: 'No se pudo descartar el contenido.' });
    }
});

module.exports = router;
