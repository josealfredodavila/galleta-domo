/* ================================================================
   routes/ai-chat.js - CHAT DE TEXTO + IA (v2.6)
   PRODUCCIÓN - GROQ + OpenAI + NVIDIA (FLUX / COSMOS)
   ================================================================ */

'use strict';

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const FormData = require('form-data');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY; // <-- NUEVA LLAVE
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 30000;

const MAX_TOKENS_RESPUESTA = 180;
const MAX_CARACTERES_RESPUESTA = 500;

/* ================================================================
   R2 (Cloudflare) y SUPABASE ADMIN
================================================================ */
const R2_BUCKET = process.env.R2_BUCKET || 'csariels-media';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
    : null;

/* ================================================================
   AUTENTICACIÓN
================================================================ */
async function autenticar(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'No autenticado' });
        const token = auth.slice(7).trim();
        if (!token) return res.status(401).json({ success: false, error: 'Token no proporcionado' });
        if (!supabaseAdmin) return res.status(500).json({ success: false, error: 'Supabase no configurado' });

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) return res.status(401).json({ success: false, error: 'Sesión inválida' });

        req.user = user;
        return next();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   PERSONALIDAD DE MARQUINHOS / PROMI
================================================================ */
const SYSTEM_PROMPT = `
Eres Promi, el asistente de marketing del ecosistema Sariel's.
Tu objetivo es ayudar a los usuarios a crear campañas publicitarias exitosas.
Eres profesional, creativo y directo. Das ideas de copy, eslóganes y estrategias.
No uses Markdown, escribe texto limpio y natural. Máximo 3 frases por respuesta.
Si el usuario te pide crear una imagen o video, dile que puedes generarle una vista previa y que, si le gusta, puede usarla directamente en su campaña de marketing.
`.trim();

/* ================================================================
   ENDPOINT: POST /chat
================================================================ */
router.post('/chat', autenticar, async (req, res) => {
    try {
        if (!GROQ_API_KEY) return res.status(500).json({ success: false, error: 'Servicio no configurado' });
        const { message, history = [] } = req.body || {};
        if (!message || typeof message !== 'string') return res.status(400).json({ success: false, error: 'Mensaje vacío' });

        const mensajeLimpio = message.trim().slice(0, 4000);
        const historialSeguro = Array.isArray(history) ? history.slice(-8) : [];

        const payload = {
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...historialSeguro,
                { role: 'user', content: mensajeLimpio }
            ],
            max_tokens: MAX_TOKENS_RESPUESTA,
            temperature: 0.6,
            stream: false
        };

        const groqResponse = await axios.post(GROQ_ENDPOINT, payload, {
            headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: GROQ_TIMEOUT_MS
        });

        let reply = groqResponse.data?.choices?.[0]?.message?.content?.trim() || "Lo siento, no pude procesar eso.";
        
        // Limpieza básica
        reply = reply.replace(/[*#_`]/g, '').replace(/\n+/g, ' ').trim().slice(0, MAX_CARACTERES_RESPUESTA);

        return res.status(200).json({ success: true, reply });
    } catch (error) {
        console.error('❌ Error en /chat:', error.message);
        return res.status(500).json({ success: false, error: 'Error procesando el mensaje' });
    }
});

/* ================================================================
   ENDPOINT: POST /generar-imagen (NVIDIA FLUX)
   Retorna Base64 para que el frontend no tenga enlace de descarga
================================================================ */
router.post('/generar-imagen', autenticar, async (req, res) => {
    try {
        if (!NVIDIA_API_KEY) return res.status(500).json({ success: false, error: 'NVIDIA API no configurada' });
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Falta el prompt' });

        console.log('🎨 Generando imagen con NVIDIA FLUX...');
        
        const response = await axios.post(
            'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein',
            { prompt: prompt, mode: "base" }, // Ajuste según docs de NVIDIA NIM
            {
                headers: {
                    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 60000 // 60 segundos
            }
        );

        // NVIDIA suele devolver la imagen en base64 en alguna de estas rutas
        const imageB64 = response.data?.artifacts?.[0]?.base64 || response.data?.image || response.data?.data?.[0]?.b64_json;
        
        if (!imageB64) {
            console.error('❌ Respuesta inesperada de NVIDIA:', JSON.stringify(response.data).slice(0, 500));
            throw new Error('NVIDIA no devolvió una imagen válida');
        }

        return res.json({ success: true, image_base64: imageB64 });

    } catch (error) {
        console.error('❌ Error generando imagen:', error.response?.data || error.message);
        return res.status(500).json({ success: false, error: 'Error al generar la imagen' });
    }
});

/* ================================================================
   ENDPOINT: POST /generar-video (NVIDIA COSMOS)
================================================================ */
router.post('/generar-video', autenticar, async (req, res) => {
    try {
        if (!NVIDIA_API_KEY) return res.status(500).json({ success: false, error: 'NVIDIA API no configurada' });
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Falta el prompt' });

        console.log('🎬 Generando video con NVIDIA COSMOS...');

        const response = await axios.post(
            'https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos3-nano',
            { prompt: prompt, format: "mp4" },
            {
                headers: {
                    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 120000 // 2 minutos para video
            }
        );

        const videoB64 = response.data?.artifacts?.[0]?.base64 || response.data?.video || response.data?.data?.[0]?.b64_json;

        if (!videoB64) {
            console.error('❌ Respuesta inesperada de NVIDIA:', JSON.stringify(response.data).slice(0, 500));
            throw new Error('NVIDIA no devolvió un video válido');
        }

        return res.json({ success: true, video_base64: videoB64 });

    } catch (error) {
        console.error('❌ Error generando video:', error.response?.data || error.message);
        return res.status(500).json({ success: false, error: 'Error al generar el video' });
    }
});

module.exports = router;