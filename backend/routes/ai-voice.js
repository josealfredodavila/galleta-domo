/* ================================================================
   routes/ai-voice.js - VOZ CON MARQUINHOS (PRODUCCIÓN OPTIMIZADO)
   ================================================================
   
   ✅ MEJORAS APLICADAS:
   - Google Cloud TTS como primario (más confiable que LiveKit)
   - ElevenLabs como fallback secundario
   - Timeouts reducidos (respuestas más rápidas)
   - Reintentos con backoff exponencial
   - Logs detallados para debugging
   - Fallback a texto si TTS falla completamente
   
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
   CONFIGURACIÓN
================================================================ */
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/* ================================================================
   TIMEOUTS OPTIMIZADOS PARA PRODUCCIÓN
================================================================ */
const TIMEOUTS = {
    GROQ_WHISPER: 45000,      // 45s (Groq es muy rápido)
    NVIDIA_LLM: 30000,        // 30s (respuestas cortas)
    GOOGLE_TTS: 60000,        // 60s (síntesis de voz)
    ELEVEN_TTS: 60000,        // 60s (fallback)
    DOWNLOAD_AUDIO: 30000,    // 30s
    SUPABASE_UPLOAD: 30000    // 30s
};

/* ================================================================
   SYSTEM PROMPT OPTIMIZADO (RESPUESTAS CORTAS PARA TTS)
================================================================ */
const SYSTEM_PROMPT = `Eres "Marquinhos", asistente oficial de Sariel's.

⚡ REGLAS CRÍTICAS:
- MÁXIMO 50 PALABRAS por respuesta (para TTS rápido)
- Respuesta en UN PÁRRAFO solamente
- Sin markdown, sin listas, sin URLs
- Habla natural y conversacional
- Emojis ocasionales: ◈, ✦

🌐 CONTEXTO:
- Sariel's: plataforma Web3 descentralizada en Polygon
- Domos: galletas físicas = 1 Es.stok cada una
- 12 Es.stoks = 1 NFT Domo
- Ayuda con: compra Domos, uso de tokens, LIVE, canales`;

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
        console.error('❌ Error autenticando:', err.message);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   FUNCIÓN: REINTENTOS CON BACKOFF EXPONENCIAL
================================================================ */
async function llamadaConReintentos(fn, nombreOp, maxReintentos = 3) {
    for (let intento = 1; intento <= maxReintentos; intento++) {
        try {
            console.log(`  ▶️ ${nombreOp} (${intento}/${maxReintentos})`);
            return await fn();
        } catch (error) {
            console.warn(`  ⚠️ Error: ${error.message}`);
            if (intento === maxReintentos) throw error;
            const delay = Math.pow(2, intento - 1);
            console.log(`  ⏳ Reintentando en ${delay}s...`);
            await new Promise(r => setTimeout(r, delay * 1000));
        }
    }
}

/* ================================================================
   FUNCIÓN: GOOGLE CLOUD TEXT-TO-SPEECH
================================================================ */
async function generarAudioGoogle(texto) {
    if (!GOOGLE_TTS_API_KEY) {
        console.warn('  ⚠️ Google TTS no configurado');
        return null;
    }

    try {
        const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
            {
                input: { text: texto },
                voice: {
                    languageCode: 'es-ES',
                    name: 'es-ES-Neural2-A',
                    ssmlGender: 'MALE'
                },
                audioConfig: {
                    audioEncoding: 'MP3',
                    pitch: 0.0,
                    speakingRate: 1.0
                }
            },
            {
                timeout: TIMEOUTS.GOOGLE_TTS,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const audioContent = response.data?.audioContent;
        if (!audioContent) throw new Error('Sin contenido de audio');

        const audioBuffer = Buffer.from(audioContent, 'base64');
        console.log(`  ✅ Google TTS: ${(audioBuffer.length / 1024).toFixed(1)}KB`);
        return audioBuffer;

    } catch (error) {
        console.error(`  ❌ Google TTS falló: ${error.message}`);
        return null;
    }
}

/* ================================================================
   FUNCIÓN: ELEVENLABS TEXT-TO-SPEECH (FALLBACK)
================================================================ */
async function generarAudioElevenLabs(texto) {
    const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVEN_API_KEY) {
        console.warn('  ⚠️ ElevenLabs no configurado');
        return null;
    }

    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
            { text: texto },
            {
                headers: {
                    'xi-api-key': ELEVEN_API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: TIMEOUTS.ELEVEN_TTS
            }
        );

        const audioBuffer = Buffer.from(response.data);
        console.log(`  ✅ ElevenLabs TTS: ${(audioBuffer.length / 1024).toFixed(1)}KB`);
        return audioBuffer;

    } catch (error) {
        console.error(`  ❌ ElevenLabs falló: ${error.message}`);
        return null;
    }
}

/* ================================================================
   RUTA PRINCIPAL: POST /chat
================================================================ */
router.post('/chat', autenticar, async (req, res) => {
    const timestamp = Date.now();
    const inputPath = path.join(os.tmpdir(), `voice_input_${timestamp}.webm`);
    const outputPath = path.join(os.tmpdir(), `voice_output_${timestamp}.mp3`);

    const limpiarTemporales = () => {
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) { /* silencioso */ }
    };

    try {
        /* ========================================
           VALIDAR CONFIGURACIÓN
        ======================================== */
        if (!NVIDIA_API_KEY || !GROQ_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Servidor no configurado (faltan NVIDIA_API_KEY o GROQ_API_KEY)'
            });
        }

        const { audio_url, audioUrl, history = [] } = req.body || {};
        const urlAudio = audio_url || audioUrl;

        if (!urlAudio || typeof urlAudio !== 'string' || !urlAudio.startsWith('http')) {
            return res.status(400).json({
                success: false,
                error: 'audioUrl inválido o no proporcionado'
            });
        }

        console.log(`\n🎙️ [${'=' .repeat(30)}] Marquinhos Voice Chat\n`);
        console.log(`📝 ID Solicitud: ${timestamp}`);

        /* ========================================
           PASO 1: DESCARGAR AUDIO
        ======================================== */
        console.log('\n📥 PASO 1: Descargando audio del usuario');
        
        await llamadaConReintentos(async () => {
            const audioResponse = await axios.get(urlAudio, {
                responseType: 'arraybuffer',
                timeout: TIMEOUTS.DOWNLOAD_AUDIO,
                maxContentLength: 50 * 1024 * 1024
            });

            const inputBuffer = Buffer.from(audioResponse.data);
            if (!inputBuffer.length) throw new Error('Buffer vacío');
            
            fs.writeFileSync(inputPath, inputBuffer);
            console.log(`  ✅ Descargado: ${(inputBuffer.length / 1024).toFixed(1)}KB`);
        }, 'Descargar audio', 2);

        /* ========================================
           PASO 2: TRANSCRIBIR
        ======================================== */
        console.log('\n🎤 PASO 2: Transcribiendo con Groq Whisper');
        
        let transcripcion = '';

        await llamadaConReintentos(async () => {
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
                    timeout: TIMEOUTS.GROQ_WHISPER
                }
            );

            transcripcion = whisperResponse.data?.text?.trim() || '';
            if (!transcripcion) throw new Error('Transcripción vacía');

            console.log(`  ✅ "${transcripcion.substring(0, 100)}${transcripcion.length > 100 ? '...' : ''}"`);
        }, 'Groq Whisper', 2);

        if (!transcripcion) {
            limpiarTemporales();
            return res.json({
                success: true,
                transcripcion: '',
                reply: 'No escuché nada. ¿Puedes repetir?',
                audio_url: null
            });
        }

        /* ========================================
           PASO 3: GENERAR RESPUESTA
        ======================================== */
        console.log('\n🧠 PASO 3: Generando respuesta (Kimi K3)');
        
        let respuestaTexto = '';

        await llamadaConReintentos(async () => {
            let historialSeguro = [];
            if (Array.isArray(history)) {
                historialSeguro = history
                    .filter(item => item && typeof item === 'object' && item.role && item.content)
                    .slice(-4)
                    .map(item => ({ role: item.role, content: item.content }));
            }

            const payload = {
                model: 'moonshotai/kimi-k3',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...historialSeguro,
                    { role: 'user', content: transcripcion }
                ],
                max_tokens: 150,  // Respuestas CORTAS
                temperature: 0.7,
                stream: false
            };

            const nvidiaResponse = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                payload,
                {
                    headers: {
                        'Authorization': 'Bearer ' + NVIDIA_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: TIMEOUTS.NVIDIA_LLM
                }
            );

            respuestaTexto = nvidiaResponse.data?.choices?.[0]?.message?.content?.trim() ||
                'Lo siento, no pude procesar tu pregunta en este momento.';

            console.log(`  ✅ "${respuestaTexto.substring(0, 100)}${respuestaTexto.length > 100 ? '...' : ''}"`);
        }, 'NVIDIA Kimi K3', 2);

        /* ========================================
           PASO 4: CONVERTIR A VOZ (CON FALLBACK)
        ======================================== */
        console.log('\n🔊 PASO 4: Generando audio (TTS)');
        
        let audioBuffer = null;

        // Intenta Google TTS primero
        console.log('  → Intentando Google Cloud TTS...');
        audioBuffer = await generarAudioGoogle(respuestaTexto);

        // Si falla, intenta ElevenLabs
        if (!audioBuffer) {
            console.log('  → Intentando ElevenLabs TTS...');
            audioBuffer = await generarAudioElevenLabs(respuestaTexto);
        }

        // Si ambos fallan
        if (!audioBuffer) {
            console.warn('  ⚠️ TTS completamente fallido - continuando sin audio');
        } else {
            fs.writeFileSync(outputPath, audioBuffer);
        }

        /* ========================================
           PASO 5: SUBIR A SUPABASE
        ======================================== */
        let audioRespuestaUrl = null;

        if (audioBuffer) {
            console.log('\n📤 PASO 5: Subiendo a Supabase Storage');

            try {
                const storagePath = `bot-responses/${req.user.id}/${Date.now()}.mp3`;

                const { error: uploadError } = await supabaseAdmin.storage
                    .from('chat-audio')
                    .upload(storagePath, audioBuffer, {
                        contentType: 'audio/mpeg',
                        cacheControl: '3600',
                        upsert: false
                    });

                if (!uploadError) {
                    const { data: signedData, error: signedError } = await supabaseAdmin.storage
                        .from('chat-audio')
                        .createSignedUrl(storagePath, 3600);

                    if (!signedError && signedData?.signedUrl) {
                        audioRespuestaUrl = signedData.signedUrl;
                        console.log(`  ✅ URL firmada (1 hora): ${signedData.signedUrl.substring(0, 50)}...`);
                    }
                } else {
                    console.error(`  ❌ Error subiendo: ${uploadError.message}`);
                }

                // Guardar historial
                try {
                    await supabaseAdmin.from('ai_voice_chats').insert({
                        usuario_id: req.user.id,
                        transcripcion: transcripcion,
                        respuesta: respuestaTexto,
                        audio_usuario_url: urlAudio,
                        audio_bot_url: audioRespuestaUrl ? `bucket://chat-audio/${storagePath}` : null
                    });
                    console.log('  ✅ Historial guardado en Supabase');
                } catch (e) {
                    console.warn(`  ⚠️ Historial no guardado: ${e.message}`);
                }

            } catch (uploadCatch) {
                console.error(`  ⚠️ Error en subida: ${uploadCatch.message}`);
            }
        }

        /* ========================================
           LIMPIEZA Y RESPUESTA FINAL
        ======================================== */
        limpiarTemporales();

        const duracion = Date.now() - timestamp;
        console.log(`\n✅ Procesamiento completado en ${duracion}ms`);
        console.log(`${'='.repeat(40)}\n`);

        return res.json({
            success: true,
            transcripcion,
            reply: respuestaTexto,
            audio_url: audioRespuestaUrl,
            duracion_ms: duracion,
            tieneAudio: Boolean(audioBuffer)
        });

    } catch (error) {
        console.error(`\n❌ ERROR CRÍTICO: ${error.message}\n`);
        limpiarTemporales();

        return res.status(500).json({
            success: false,
            error: 'Error procesando voz',
            detalles: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
