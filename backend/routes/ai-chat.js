/* ================================================================
   routes/ai-chat.js - CHAT + IA (v2.7 - Fix NVIDIA)
   ================================================================ */

'use strict';

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    : null;

async function autenticar(req, res, next) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'No autenticado' });
    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(auth.slice(7).trim());
        if (error || !user) return res.status(401).json({ success: false, error: 'Sesión inválida' });
        req.user = user;
        next();
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

// Función auxiliar para limpiar la clave API
function getNvidiaKey() {
    let key = NVIDIA_API_KEY || '';
    // Si la clave tiene espacios o comillas extra, limpiarla
    key = key.trim().replace(/^["']|["']$/g, '');
    // Si por alguna razón en Railway se guardó "Bearer ", quitarlo
    if (key.startsWith('Bearer ')) key = key.slice(7).trim();
    return key;
}

// --- Chat ---
router.post('/chat', autenticar, async (req, res) => {
    try {
        const { message, history = [] } = req.body;
        const response = await axios.post(GROQ_ENDPOINT, {
            model: GROQ_MODEL,
            messages: [{ role: 'system', content: 'Eres Promi... (prompt de marketing)' }, ...history, { role: 'user', content: message }],
            max_tokens: 200,
            temperature: 0.6
        }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 30000 });
        
        let reply = response.data?.choices?.[0]?.message?.content?.trim() || "No pude procesar eso.";
        reply = reply.replace(/[*#_`]/g, '').replace(/\n+/g, ' ').trim().slice(0, 500);
        res.json({ success: true, reply });
    } catch (error) {
        console.error('❌ Chat error:', error.message);
        res.status(500).json({ success: false, error: 'Error en el chat' });
    }
});

// --- Generar Imagen (FLUX) ---
router.post('/generar-imagen', autenticar, async (req, res) => {
    try {
        const apiKey = getNvidiaKey();
        if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada o vacía');

        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Falta el prompt' });

        console.log('🎨 Generando imagen con FLUX...');
        
        // Ruta corregida y compatible
        const response = await axios.post(
            'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev',
            { prompt: prompt, height: 1024, width: 1024, samples: 1, steps: 50, cfg_scale: 5, mode: "base", seed: 0 },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 60000
            }
        );

        // La respuesta de FLUX 1.0 viene en data[0].b64_json
        const imageB64 = response.data?.data?.[0]?.b64_json || response.data?.artifacts?.[0]?.base64;
        
        if (!imageB64) {
            console.error('❌ Respuesta inesperada de NVIDIA:', JSON.stringify(response.data).slice(0, 300));
            throw new Error('NVIDIA no devolvió una imagen válida');
        }

        res.json({ success: true, image_base64: imageB64 });

    } catch (error) {
        console.error('❌ Error generando imagen:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: 'Error al generar la imagen' });
    }
});

// --- Generar Video (COSMOS) ---
router.post('/generar-video', autenticar, async (req, res) => {
    // Como la ruta de Cosmos 3 está en pruebas por parte de NVIDIA, respondemos con un error controlado
    // para que el frontend no se rompa y el usuario no vea un error 500
    console.warn('⚠️ Video Cosmos solicitado, pero el endpoint de NVIDIA no está operativo.');
    return res.status(503).json({ 
        success: false, 
        error: 'La generación de video con Cosmos 3 se encuentra en mantenimiento por parte de NVIDIA. Por favor, intenta con una imagen o espera a que el servicio se estabilice.' 
    });
});

module.exports = router;