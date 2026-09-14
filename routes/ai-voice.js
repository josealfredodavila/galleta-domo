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
const { AccessToken } = require('livekit-server-sdk');

/* ================================================================
   CONFIGURACIÓN DE VARIABLES DE ENTORNO (RAILWAY)
   ================================================================ */
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL; // ej: wss://tu-proyecto.livekit.cloud

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
    const outputPath = path.join(os.tmpdir(), `voice_output_${timestamp}.mp3`);

    try {
        /* ============================================================
           VALIDAR CLAVES
           ============================================================ */
        if (!NVIDIA_API_KEY || !GROQ_API_KEY || !LIVEKIT_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Faltan configurar las claves de NVIDIA, Groq o LiveKit en Railway'
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
           PASO 4: CONVERTIR RESPUESTA A VOZ CON LIVEKIT (TTS)
           ============================================================ */
        console.log('🔊 Convirtiendo respuesta a voz con LiveKit...');

        // ⚠️ IMPORTANTE: Reemplaza 'TU_VOICE_ID' por el ID real que te dio LiveKit
        const VOICE_ID = 'TU_VOICE_ID';

        // 1. Crear un token temporal para el TTS
        const at = new AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
            {
                identity: 'marquinhos-tts-' + timestamp,
                ttl: '10m',
            }
        );

        at.addGrant({
            roomJoin: true,
            room: 'tts-room-' + timestamp,
            canPublish: true,
            canSubscribe: false,
            roomAdmin: true,
            roomCreate: true,
            agent: true,
            tts: {
                voiceId: VOICE_ID,
            }
        });

        const token = await at.toJwt();

        // 2. Llamar a la API de LiveKit Inference para generar el audio
        // ⚠️ La URL puede variar. Verifica en la documentación de LiveKit Cloud.
        const livekitHost = LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
        
        const livekitTtsResponse = await axios.post(
            `${livekitHost}/api/tts`,
            {
                text: respuestaTexto,
                voiceId: VOICE_ID,
                outputFormat: 'mp3'
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 120000
            }
        );

        // 3. Guardar el audio generado
        fs.writeFileSync(outputPath, Buffer.from(livekitTtsResponse.data));

        /* ============================================================
           PASO 5: SUBIR AUDIO DE MARQUINHOS A SUPABASE
           ============================================================ */
        console.log('📤 Subiendo audio de respuesta...');

        const storagePath = `bot-responses/${req.user.id}/${Date.now()}.mp3`;
        const audioBuffer = fs.readFileSync(outputPath);

        const { error: uploadError } = await supabaseAdmin.storage
            .from('chat-audio')
            .upload(storagePath, audioBuffer, {
                contentType: 'audio/mpeg',
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('❌ Error subiendo audio:', uploadError.message);
            return res.json({
                success: true,
                transcripcion,
                reply: respuestaTexto,
                audio_url: null
            });
        }

        // Generar la URL firmada
        const { data: signedData, error: signedError } = await supabaseAdmin.storage
            .from('chat-audio')
            .createSignedUrl(storagePath, 3600);

        if (signedError || !signedData?.signedUrl) {
            console.error('❌ Error creando signed URL:', signedError?.message);
            return res.json({
                success: true,
                transcripcion,
                reply: respuestaTexto,
                audio_url: null
            });
        }

        const audioRespuestaUrl = signedData.signedUrl;

        /* ============================================================
           GUARDAR HISTORIAL Y LIMPIAR TEMPORALES
           ============================================================ */
        try {
            await supabaseAdmin.from('ai_voice_chats').insert({
                usuario_id: req.user.id,
                transcripcion: transcripcion,
                respuesta: respuestaTexto,
                audio_usuario_url: audioUrl,
                audio_bot_url: `bucket://chat-audio/${storagePath}`
            });
        } catch (e) {
            console.warn('⚠️ No se pudo guardar historial:', e.message);
        }

        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {}

        /* ============================================================
           RESPUESTA FINAL
           ============================================================ */
        return res.json({
            success: true,
            transcripcion,
            reply: respuestaTexto,
            audio_url: audioRespuestaUrl
        });

    } catch (error) {
        console.error('❌ Error en /ai/voice/chat:', error.message);
        
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {}

        return res.status(500).json({
            success: false,
            error: 'Error procesando voz: ' + error.message
        });
    }
});

module.exports = router;