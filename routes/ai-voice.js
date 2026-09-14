/* ================================================================
   routes/ai-voice.js - VOZ CON MARQUINHOS (100% GRATIS)
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');

/* ================================================================
   CONFIGURACIÓN DE VARIABLES DE ENTORNO (RAILWAY)
   ================================================================ */
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY; // Tu clave nvapi-...
const GROQ_API_KEY = process.env.GROQ_API_KEY;     // Tu clave de Groq (gsk_...)
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
        console.error('❌ Error autenticando voz:', err.message);
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

REGLAS PARA VOZ:
- Tus respuestas se convertirán a audio, así que NO uses formato markdown (**, ##, etc.).
- NO uses listas con viñetas, mejor usa frases naturales.
- Escribe como si estuvieras hablando, no escribiendo.
- Evita URLs largas o código.
- Máximo 300 caracteres por respuesta para que el audio no sea eterno.

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
    const timestamp = Date.now();
    const inputPath = path.join(os.tmpdir(), `voice_input_${timestamp}.webm`);

    try {
        /* ============================================================
           VALIDAR CLAVES
           ============================================================ */
        if (!NVIDIA_API_KEY || !GROQ_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Faltan configurar las claves de NVIDIA o Groq en Railway'
            });
        }

        const { audioUrl, history = [] } = req.body || {};
        if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.startsWith('http')) {
            return res.status(400).json({ success: false, error: 'audioUrl inválido' });
        }

        /* ============================================================
           PASO 1: DESCARGAR AUDIO DEL USUARIO
           ============================================================ */
        console.log('📥 Descargando audio del usuario...');
        const audioResponse = await axios.get(audioUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 50 * 1024 * 1024
        });

        const inputBuffer = Buffer.from(audioResponse.data);
        if (!inputBuffer.length) {
            return res.status(400).json({ success: false, error: 'El audio recibido está vacío' });
        }
        fs.writeFileSync(inputPath, inputBuffer);

        /* ============================================================
           PASO 2: TRANSCRIBIR CON GROQ (WHISPER GRATIS)
           ============================================================ */
        console.log('🎤 Transcribiendo audio con Groq...');
        const formData = new FormData();
        formData.append('file', fs.createReadStream(inputPath));
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'es');

        const whisperResponse = await axios.post(
            'https://api.groq.com/openai/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': 'Bearer ' + GROQ_API_KEY
                },
                timeout: 120000
            }
        );

        const transcripcion = whisperResponse.data?.text?.trim() || '';
        console.log('📝 Transcripción:', transcripcion);

        if (!transcripcion) {
            return res.json({
                success: true,
                transcripcion: '',
                reply: 'No escuché nada. ¿Puedes repetir?',
                audio_url: null
            });
        }

        /* ============================================================
           PASO 3: GENERAR RESPUESTA CON NVIDIA (KIMI K3)
           ============================================================ */
        console.log('🧠 Generando respuesta con Kimi K3...');
        
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
                { role: 'user', content: transcripcion }
            ],
            max_tokens: 300,
            temperature: 0.7,
            stream: false,
            seed: 0
        };

        const nvidiaResponse = await axios.post(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            payload,
            {
                headers: {
                    'Authorization': 'Bearer ' + NVIDIA_API_KEY,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );

        const respuestaTexto = nvidiaResponse.data?.choices?.[0]?.message?.content?.trim() ||
            'No pude generar una respuesta en este momento.';
        console.log('💬 Respuesta:', respuestaTexto);

        /* ============================================================
           PASO 4: RESPUESTA (TTS PENDIENTE)
           ============================================================ */
        // TODO: Aquí irá la conversión a voz con Edge TTS.
        // Por ahora, devolvemos el texto para que no se rompa el flujo.
        
        return res.json({
            success: true,
            transcripcion,
            reply: respuestaTexto,
            audio_url: null // Cambiar cuando implementes TTS real
        });

    } catch (error) {
        console.error('❌ Error en /ai/voice/chat:', error.message);
        
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (e) {}

        return res.status(500).json({
            success: false,
            error: 'Error procesando voz: ' + error.message
        });
    }
});

module.exports = router;