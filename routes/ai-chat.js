/* ================================================================
   routes/ai-chat.js - CHAT DE TEXTO CON MARQUINHOS
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

/* ================================================================
   CONFIGURACIÓN DE VARIABLES DE ENTORNO (RAILWAY)
   ================================================================ */
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

/* ================================================================
   MIDDLEWARE DE AUTENTICACIÓN
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
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    } catch (err) {
        console.error('❌ Error autenticando chat:', err.message);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   PERSONALIDAD DE MARQUINHOS
   ================================================================ */
const SYSTEM_PROMPT = `Eres "Marquinhos", el asistente oficial del ecosistema Sariel's.

TU PERSONALIDAD:
- Amigable, cercano, hablas español mexicano neutro.
- Usas emojis ocasionalmente (◈, ✦, 🔴).
- Eres conciso pero útil. Máximo 2-3 párrafos por respuesta.

CONOCIMIENTO:
- Sariel's es una cablera descentralizada Web3 en Polygon.
- Domos = galletas físicas que dan 1 Es.stok cada una.
- Es.stoks = tokens transferibles en Polygon.
- 12 Es.stoks = 1 NFT Domo.
- Puedes ayudar con: cómo comprar Domos, cómo usar Es.stoks, cómo iniciar un LIVE, cómo crear canales.`;

/* ================================================================
   RUTA POST /chat
   ================================================================ */
router.post('/chat', autenticar, async (req, res) => {
    try {
        if (!NVIDIA_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Falta configurar NVIDIA_API_KEY en Railway'
            });
        }

        const { message, context = 'chat_sariels', history = [] } = req.body || {};

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Mensaje vacío o inválido'
            });
        }

        console.log('💬 Mensaje recibido:', message);

        /* ============================================================
           CONSTRUIR HISTORIAL SEGURO
           ============================================================ */
        let historialSeguro = [];
        if (Array.isArray(history)) {
            historialSeguro = history
                .filter(item => item && typeof item === 'object' && typeof item.role === 'string' && typeof item.content === 'string')
                .slice(-6)
                .map(item => ({ role: item.role, content: item.content }));
        }

        const payload = {
            model: 'moonshotai/kimi-k3',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...historialSeguro,
                { role: 'user', content: message.trim() }
            ],
            max_tokens: 500,
            temperature: 0.7,
            stream: false,
            seed: 0
        };

        /* ============================================================
           LLAMADA A NVIDIA (KIMI K3)
           ============================================================ */
        const nvidiaResponse = await axios.post(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            payload,
            {
                headers: {
                    'Authorization': 'Bearer ' + NVIDIA_API_KEY,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        const respuestaTexto = nvidiaResponse.data?.choices?.[0]?.message?.content?.trim() ||
            'No pude generar una respuesta en este momento.';

        console.log('💬 Respuesta de Marquinhos:', respuestaTexto);

        /* ============================================================
           RESPUESTA FINAL
           ============================================================ */
        return res.json({
            success: true,
            reply: respuestaTexto
        });

    } catch (error) {
        console.error('❌ Error en /ai/chat:', error.message);
        
        // Log detallado del error de NVIDIA si existe
        if (error.response?.data) {
            console.error('Detalle del error de NVIDIA:', JSON.stringify(error.response.data, null, 2));
        }

        return res.status(500).json({
            success: false,
            error: 'Error procesando mensaje: ' + error.message
        });
    }
});

module.exports = router;