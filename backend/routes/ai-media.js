/* ================================================================
   routes/ai-media.js · GENERACIÓN DE IMAGEN Y VIDEO (v4.0)
   ================================================================
   Imagen: OpenAI gpt-image-1 (mismo modelo que /editar-imagen en ai-chat.js).
   Video:  NVIDIA Cosmos3 Nano (sin cambios por ahora).

   Cambios v4.0 respecto a v3.1:
   - Imagen migrada a gpt-image-1. Se eliminan Nemotron y FLUX.
   - El prompt se envía directo al modelo (sin reescritura previa),
     para no introducir términos que disparen filtros.
   - Un rechazo de moderación de OpenAI devuelve "contenido_rechazado".
   - Estados de Supabase sin cambios: procesando, listo, error,
     aceptada, descartada.
   - /video conserva Cosmos y la reescritura con Nemotron, sin cambios.

   Variables de entorno:
     OPENAI_API_KEY, NVIDIA_API_KEY, MEDIA_LIMITE_DIA (opcional),
     R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGE_MODEL = 'gpt-image-1';

const NVIDIA_NEMOTRON_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_NEMOTRON_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
const NVIDIA_VIDEO_URL = 'https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos3-nano';

const MEDIA_LIMITE_DIA = Number(process.env.MEDIA_LIMITE_DIA) || 10;
const PREVIEW_EXPIRA_SEG = 600;
const TIMEOUT_NEMOTRON_MS = 30000;
const TIMEOUT_IMAGEN_MS = 120000;
const TIMEOUT_VIDEO_MS = 600000;
const PROCESANDO_MAX_MIN = 15;
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
            { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
        )
        : null;

/* ================================================================
   AUTENTICACIÓN
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

// Quita el razonamiento interno del modelo y deja solo el texto final.
function limpiarRazonamiento(texto) {
    if (typeof texto !== 'string') return '';
    return texto
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/i, '')
        .replace(/^\s*(prompt mejorado|respuesta|final)\s*:\s*/i, '')
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .trim();
}

/**
 * Expande el prompt de video con Nemotron. Si la salida no sirve,
 * usa el prompt original. Solo lo usa /video.
 */
async function mejorarPromptVideo(promptUsuario) {
    if (!NVIDIA_API_KEY) return promptUsuario;

    const instruccion = 'Eres director de cine publicitario. Reescribe el pedido del usuario como UNA frase descriptiva para generar un video corto (menciona movimiento, iluminación, estilo y encuadre). Responde solo con la frase, sin explicaciones.';

    try {
        const respuesta = await axios.post(NVIDIA_NEMOTRON_URL, {
            model: NVIDIA_NEMOTRON_MODEL,
            messages: [
                { role: 'system', content: instruccion },
                { role: 'user', content: promptUsuario }
            ],
            max_tokens: 1024,
            temperature: 0.5
        }, {
            headers: {
                Authorization: `Bearer ${NVIDIA_API_KEY}`,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: TIMEOUT_NEMOTRON_MS
        });

        const bruto = respuesta.data?.choices?.[0]?.message?.content;
        const mejorado = limpiarRazonamiento(bruto);

        if (mejorado.length < 10 || mejorado.length > 800) {
            console.warn('⚠️ Nemotron devolvió una salida no utilizable; se usa el prompt original.');
            return promptUsuario;
        }
        return mejorado;
    } catch (error) {
        console.error('⚠️ Nemotron no disponible; se usa el prompt original:', error.message);
        return promptUsuario;
    }
}

/**
 * Genera la imagen con OpenAI gpt-image-1.
 * Devuelve el PNG en base64 (b64_json).
 */
async function generarImagenOpenAI(prompt) {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');

    const respuesta = await axios.post(OPENAI_IMAGE_URL, {
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: '1024x1024'
    }, {
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: TIMEOUT_IMAGEN_MS,
        validateStatus: () => true
    });

    if (respuesta.status === 400 || respuesta.status === 403) {
        const codigo = respuesta.data?.error?.code;
        const tipo = respuesta.data?.error?.type;
        if (codigo === 'moderation_blocked' || tipo === 'image_generation_user_error' || codigo === 'content_policy_violation') {
            const error = new Error('contenido_rechazado');
            error.rechazado = true;
            throw error;
        }
    }

    if (respuesta.status < 200 || respuesta.status >= 300) {
        const error = new Error(`OpenAI Imagen respondió HTTP ${respuesta.status}`);
        error.status = respuesta.status;
        console.error('❌ OpenAI Imagen:', respuesta.status, JSON.stringify(respuesta.data).slice(0, 300));
        throw error;
    }

    const base64 = respuesta.data?.data?.[0]?.b64_json;
    if (!base64) throw new Error('La respuesta de imagen no contenía datos');
    return base64;
}

/**
 * Cosmos3 Nano, video. Devuelve el MP4 en base64.
 * Sin cambios respecto a v3.1.
 */
async function generarVideoCosmos(prompt) {
    const respuesta = await axios.post(NVIDIA_VIDEO_URL, {
        model_mode: 'text2video',
        prompt,
        resolution: '480_16_9',
        num_frames: 25,
        num_inference_steps: 35,
        fps: 24
    }, {
        headers: {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        timeout: TIMEOUT_VIDEO_MS,
        validateStatus: () => true
    });

    if (respuesta.status === 422) {
        const error = new Error('contenido_rechazado');
        error.rechazado = true;
        throw error;
    }
    if (respuesta.status < 200 || respuesta.status >= 300) {
        const error = new Error(`NVIDIA Video respondió HTTP ${respuesta.status}`);
        error.status = respuesta.status;
        console.error('❌ NVIDIA Video:', respuesta.status, JSON.stringify(respuesta.data).slice(0, 300));
        throw error;
    }

    if (!respuesta.data?.b64_video) throw new Error('La respuesta de video no contenía datos');
    return respuesta.data.b64_video;
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

async function marcarError(filaId, mensaje) {
    await supabaseAdmin
        .from('ai_media_borradores')
        .update({ estado: 'error', error_mensaje: mensaje, updated_at: new Date().toISOString() })
        .eq('id', filaId);
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
   POST /imagen (OpenAI gpt-image-1)
================================================================ */

router.post('/imagen', autenticar, async (req, res) => {
    let filaId = null;
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

        const promptOriginal = prompt.trim();

        // Se registra primero para que el límite diario cuente el intento
        const { data: fila, error: errInsert } = await supabaseAdmin
            .from('ai_media_borradores')
            .insert({ usuario_id: req.user.id, tipo: 'imagen', prompt: promptOriginal, estado: 'procesando' })
            .select('id')
            .single();
        if (errInsert) throw errInsert;
        filaId = fila.id;

        let base64;
        try {
            base64 = await generarImagenOpenAI(promptOriginal);
        } catch (error) {
            await marcarError(filaId, error.rechazado ? 'contenido_rechazado' : 'No se pudo generar la imagen.');
            return respuestaError(res, error, 'No se pudo generar la imagen. Intenta de nuevo.');
        }

        const key = `ia/borradores/${req.user.id}/${filaId}.png`;
        await subirPrivado(key, Buffer.from(base64, 'base64'), 'image/png');

        await supabaseAdmin
            .from('ai_media_borradores')
            .update({ storage_key: key, estado: 'listo', updated_at: new Date().toISOString() })
            .eq('id', filaId);

        return res.json({
            success: true,
            id: filaId,
            tipo: 'imagen',
            estado: 'listo',
            preview_url: await urlVistaPrevia(key),
            vista_previa_seg: PREVIEW_EXPIRA_SEG
        });
    } catch (error) {
        console.error('❌ Error /imagen:', error.message);
        if (filaId) await marcarError(filaId, 'Error interno al guardar la imagen.').catch(() => {});
        return res.status(500).json({ success: false, error: 'Error al generar la imagen.' });
    }
});

/* ================================================================
   POST /video (Cosmos3 Nano, sin cambios)
================================================================ */

async function procesarVideo(filaId, usuarioId, promptOriginal) {
    try {
        const promptMejorado = await mejorarPromptVideo(promptOriginal);
        const base64 = await generarVideoCosmos(promptMejorado);

        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length === 0) throw new Error('El video recibido está vacío');

        const key = `ia/borradores/${usuarioId}/${filaId}.mp4`;
        await subirPrivado(key, buffer, 'video/mp4');

        await supabaseAdmin
            .from('ai_media_borradores')
            .update({ storage_key: key, estado: 'listo', updated_at: new Date().toISOString() })
            .eq('id', filaId);
    } catch (error) {
        console.error('❌ Error procesando video:', filaId, error.message);
        await marcarError(
            filaId,
            error.rechazado ? 'contenido_rechazado' : 'No se pudo generar el video. Intenta de nuevo.'
        ).catch((e) => console.error('❌ No se pudo marcar el error del video:', e.message));
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

        const promptOriginal = prompt.trim();

        const { data: fila, error } = await supabaseAdmin
            .from('ai_media_borradores')
            .insert({ usuario_id: req.user.id, tipo: 'video', prompt: promptOriginal, estado: 'procesando' })
            .select('id')
            .single();
        if (error) throw error;

        res.status(202).json({ success: true, id: fila.id, tipo: 'video', estado: 'procesando' });

        procesarVideo(fila.id, req.user.id, promptOriginal).catch((e) =>
            console.error('❌ Fallo inesperado en procesarVideo:', e.message)
        );
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
================================================================ */

router.get('/:id', autenticar, async (req, res) => {
    try {
        let fila = await obtenerDelUsuario(req.params.id, req.user.id);
        if (!fila) return res.status(404).json({ success: false, error: 'No encontrado.' });

        // Un borrador que lleva demasiado tiempo en "procesando" se cierra como error
        const minutos = (Date.now() - new Date(fila.created_at).getTime()) / 60000;
        if (fila.estado === 'procesando' && minutos > PROCESANDO_MAX_MIN) {
            await marcarError(fila.id, 'La generación tardó demasiado. Intenta de nuevo.');
            fila = { ...fila, estado: 'error', error_mensaje: 'La generación tardó demasiado. Intenta de nuevo.' };
        }

        const respuesta = { success: true, id: fila.id, tipo: fila.tipo, estado: fila.estado };

        if (fila.estado === 'error') respuesta.error = fila.error_mensaje;

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