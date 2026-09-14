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

/* ================================================================
   SUPABASE ADMIN
   ================================================================ */

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
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
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        const token = auth.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token no proporcionado'
            });
        }

        const {
            data: { user },
            error
        } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }

        req.user = user;

        next();

    } catch (err) {
        console.error(
            '❌ Error autenticando voz:',
            err.message
        );

        return res.status(500).json({
            success: false,
            error: 'Error de autenticación'
        });
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

    const inputPath = path.join(
        os.tmpdir(),
        `voice_input_${timestamp}.webm`
    );

    const outputPath = path.join(
        os.tmpdir(),
        `voice_output_${timestamp}.mp3`
    );

    try {

        /* ============================================================
           VALIDAR OPENAI
           ============================================================ */

        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

        if (!OPENAI_API_KEY) {

            return res.status(500).json({
                success: false,
                error: 'OPENAI_API_KEY no configurada'
            });
        }

        /* ============================================================
           DATOS RECIBIDOS
           ============================================================ */

        const {
            audioUrl,
            history = []
        } = req.body || {};

        if (!audioUrl) {

            return res.status(400).json({
                success: false,
                error: 'audioUrl requerido'
            });
        }

        if (
            typeof audioUrl !== 'string' ||
            !audioUrl.startsWith('http')
        ) {

            return res.status(400).json({
                success: false,
                error: 'audioUrl inválido'
            });
        }

        /* ============================================================
           PASO 1
           DESCARGAR AUDIO DEL USUARIO
           ============================================================ */

        console.log('📥 Descargando audio del usuario...');

        const audioResponse = await axios.get(
            audioUrl,
            {
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 50 * 1024 * 1024,
                maxBodyLength: 50 * 1024 * 1024
            }
        );

        const inputBuffer = Buffer.from(
            audioResponse.data
        );

        if (!inputBuffer.length) {

            return res.status(400).json({
                success: false,
                error: 'El audio recibido está vacío'
            });
        }

        if (
            inputBuffer.length >
            50 * 1024 * 1024
        ) {

            return res.status(413).json({
                success: false,
                error: 'El audio supera el límite de 50 MB'
            });
        }

        fs.writeFileSync(
            inputPath,
            inputBuffer
        );

        /* ============================================================
           PASO 2
           TRANSCRIBIR CON WHISPER
           ============================================================ */

        console.log('🎤 Transcribiendo audio...');

        const formData = new FormData();

        formData.append(
            'file',
            fs.createReadStream(inputPath)
        );

        formData.append(
            'model',
            'whisper-1'
        );

        formData.append(
            'language',
            'es'
        );

        const whisperResponse = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization':
                        'Bearer ' + OPENAI_API_KEY
                },
                timeout: 120000
            }
        );

        const transcripcion =
            whisperResponse.data?.text?.trim() || '';

        console.log(
            '📝 Transcripción:',
            transcripcion
        );

        /* ============================================================
           AUDIO SIN TEXTO
           ============================================================ */

        if (!transcripcion) {

            const respuestaVacia =
                'No escuché nada. ¿Puedes repetir?';

            return res.json({
                success: true,
                transcripcion: '',
                reply: respuestaVacia,
                audio_url: null
            });
        }

        /* ============================================================
           PASO 3
           GENERAR RESPUESTA CON GPT
           ============================================================ */

        console.log(
            '🧠 Generando respuesta...'
        );

        let historialSeguro = [];

        if (Array.isArray(history)) {

            historialSeguro = history
                .filter(item =>
                    item &&
                    typeof item === 'object' &&
                    typeof item.role === 'string' &&
                    typeof item.content === 'string'
                )
                .slice(-6)
                .map(item => ({
                    role: item.role,
                    content: item.content
                }));
        }

        const messages = [
            {
                role: 'system',
                content: SYSTEM_PROMPT
            },
            ...historialSeguro,
            {
                role: 'user',
                content: transcripcion
            }
        ];

        const gptResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages,
                temperature: 0.7,
                max_tokens: 300
            },
            {
                headers: {
                    'Authorization':
                        'Bearer ' + OPENAI_API_KEY,
                    'Content-Type':
                        'application/json'
                },
                timeout: 120000
            }
        );

        const respuestaTexto =
            gptResponse.data?.choices?.[0]?.message?.content?.trim() ||
            'No pude generar una respuesta en este momento.';

        console.log(
            '💬 Respuesta:',
            respuestaTexto
        );

        /* ============================================================
           PASO 4
           CONVERTIR RESPUESTA A VOZ
           ============================================================ */

        console.log(
            '🔊 Convirtiendo respuesta a voz...'
        );

        const ttsResponse = await axios.post(
            'https://api.openai.com/v1/audio/speech',
            {
                model: 'tts-1',
                input: respuestaTexto,
                voice: 'nova',
                response_format: 'mp3',
                speed: 1.0
            },
            {
                headers: {
                    'Authorization':
                        'Bearer ' + OPENAI_API_KEY,
                    'Content-Type':
                        'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 120000
            }
        );

        fs.writeFileSync(
            outputPath,
            Buffer.from(ttsResponse.data)
        );

        /* ============================================================
           PASO 5
           SUBIR AUDIO DE MARQUINHOS
           
           Bucket:
           chat-audio

           Ruta:
           bot-responses/<usuario_id>/<timestamp>.mp3
           ============================================================ */

        console.log(
            '📤 Subiendo audio de respuesta...'
        );

        const storagePath =
            `bot-responses/${req.user.id}/${Date.now()}.mp3`;

        const audioBuffer =
            fs.readFileSync(outputPath);

        const {
            error: uploadError
        } = await supabaseAdmin.storage
            .from('chat-audio')
            .upload(
                storagePath,
                audioBuffer,
                {
                    contentType: 'audio/mpeg',
                    cacheControl: '3600',
                    upsert: false
                }
            );

        if (uploadError) {

            console.error(
                '❌ Error subiendo audio:',
                uploadError.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'No se pudo guardar el audio de Marquinhos'
            });
        }

        /* ============================================================
           PASO 6
           CREAR SIGNED URL
           
           chat-audio ES PRIVADO.
           NO usamos getPublicUrl().
           ============================================================ */

        console.log(
            '🔐 Generando URL firmada...'
        );

        const {
            data: signedData,
            error: signedError
        } = await supabaseAdmin.storage
            .from('chat-audio')
            .createSignedUrl(
                storagePath,
                3600
            );

        if (signedError || !signedData?.signedUrl) {

            console.error(
                '❌ Error creando signed URL:',
                signedError?.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'El audio fue generado pero no se pudo crear su URL segura'
            });
        }

        const audioRespuestaUrl =
            signedData.signedUrl;

        /* ============================================================
           PASO 7
           GUARDAR HISTORIAL EN ai_voice_chats
           
           No se utiliza mensajes_chat.
           ============================================================ */

        try {

            const {
                error: historialError
            } = await supabaseAdmin
                .from('ai_voice_chats')
                .insert({
                    usuario_id: req.user.id,
                    transcripcion: transcripcion,
                    respuesta: respuestaTexto,
                    audio_usuario_url: audioUrl,
                    audio_bot_url: `bucket://chat-audio/${storagePath}`
                });

            if (historialError) {

                console.warn(
                    '⚠️ No se pudo guardar historial de voz:',
                    historialError.message
                );
            }

        } catch (historialException) {

            console.warn(
                '⚠️ Excepción guardando historial:',
                historialException.message
            );
        }

        /* ============================================================
           LIMPIEZA
           ============================================================ */

        try {

            if (fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
            }

            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }

        } catch (cleanupError) {

            console.warn(
                '⚠️ Error limpiando temporales:',
                cleanupError.message
            );
        }

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

        console.error(
            '❌ Error en /ai/voice/chat:',
            error.message
        );

        /* ============================================================
           LIMPIEZA EN CASO DE ERROR
           ============================================================ */

        try {

            if (fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
            }

            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }

        } catch (cleanupError) {

            console.warn(
                '⚠️ Error durante limpieza:',
                cleanupError.message
            );
        }

        /* ============================================================
           RESPUESTA DE ERROR
           ============================================================ */

        return res.status(500).json({
            success: false,
            error:
                'Error procesando voz: ' +
                error.message
        });
    }
});

/* ================================================================
   EXPORTAR ROUTER
   ================================================================ */

module.exports = router;