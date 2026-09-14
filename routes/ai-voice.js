/* ================================================================
   routes/ai-voice.js - VOZ CON MARQUINHOS
   ================================================================ */
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Middleware auth
async function autenticar(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'No autenticado' });
        const token = auth.slice(7).trim();
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) return res.status(401).json({ success: false, error: 'Token inválido' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

const SYSTEM_PROMPT = `Eres "Marquinhos", el asistente oficial del ecosistema Sariel's. 

TU PERSONALIDAD:
- Amigable, cercano, hablas español mexicano neutro.
- Usas emojis ocasionalmente (◈, ✦, 🔴).
- Eres conciso pero útil. Máximo 2-3 párrafos por respuesta.

REGLAS PARA VOZ:
- Tus respuestas se convertirán a audio, así que NO uses formato markdown (**, ##, etc).
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

router.post('/chat', autenticar, async (req, res) => {
    const inputPath = path.join(os.tmpdir(), `voice_input_${Date.now()}.webm`);
    const outputPath = path.join(os.tmpdir(), `voice_output_${Date.now()}.mp3`);
    
    try {
        const { audioUrl, history = [] } = req.body;
        
        if (!audioUrl) {
            return res.status(400).json({ success: false, error: 'audioUrl requerido' });
        }
        
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ success: false, error: 'OPENAI_API_KEY no configurada' });
        }
        
        // ============================================================
        // PASO 1: Descargar el audio del usuario
        // ============================================================
        console.log('📥 Descargando audio del usuario...');
        const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(inputPath, Buffer.from(audioResponse.data));
        
        // ============================================================
        // PASO 2: Transcribir con Whisper
        // ============================================================
        console.log('🎤 Transcribiendo audio...');
        const formData = new FormData();
        formData.append('file', fs.createReadStream(inputPath));
        formData.append('model', 'whisper-1');
        formData.append('language', 'es');
        
        const whisperResponse = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': 'Bearer ' + OPENAI_API_KEY
                }
            }
        );
        
        const transcripcion = whisperResponse.data.text;
        console.log('📝 Transcripción:', transcripcion);
        
        if (!transcripcion || !transcripcion.trim()) {
            return res.json({
                success: true,
                reply: 'No escuché nada. ¿Puedes repetir?',
                audio_url: null
            });
        }
        
        // ============================================================
        // PASO 3: Generar respuesta con GPT
        // ============================================================
        console.log('🧠 Generando respuesta...');
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.slice(-6),
            { role: 'user', content: transcripcion }
        ];
        
        const gptResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: messages,
                temperature: 0.7,
                max_tokens: 300
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + OPENAI_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const respuestaTexto = gptResponse.data.choices[0].message.content;
        console.log('💬 Respuesta:', respuestaTexto);
        
        // ============================================================
        // PASO 4: Convertir respuesta a voz con TTS
        // ============================================================
        console.log('🔊 Convirtiendo a voz...');
        const ttsResponse = await axios.post(
            'https://api.openai.com/v1/audio/speech',
            {
                model: 'tts-1',
                input: respuestaTexto,
                voice: 'nova', // Opciones: alloy, echo, fable, onyx, nova, shimmer
                response_format: 'mp3',
                speed: 1.0
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + OPENAI_API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            }
        );
        
        fs.writeFileSync(outputPath, Buffer.from(ttsResponse.data));
        
        // ============================================================
        // PASO 5: Subir el audio de respuesta a Supabase
        // ============================================================
        console.log('📤 Subiendo audio de respuesta...');
        const audioBuffer = fs.readFileSync(outputPath);
        const storagePath = `bot-responses/${req.user.id}/${Date.now()}.mp3`;
        
        const { error: uploadError } = await supabaseAdmin.storage
            .from('chat-audio')
            .upload(storagePath, audioBuffer, {
                contentType: 'audio/mpeg',
                cacheControl: '3600',
                upsert: false
            });
        
        if (uploadError) {
            console.warn('⚠️ Error subiendo audio:', uploadError.message);
        }
        
        const { data: urlData } = supabaseAdmin.storage
            .from('chat-audio')
            .getPublicUrl(storagePath);
        
        const audioRespuestaUrl = urlData.publicUrl;
        
        // ============================================================
        // LIMPIEZA
        // ============================================================
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {}
        
        return res.json({
            success: true,
            transcripcion: transcripcion,
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