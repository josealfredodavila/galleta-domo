/* ================================================================
   routes/ai-tts-maiz.js - VOZ DEL CAPITÁN MAÍZ 🌽⚔️
   ================================================================
   Endpoint: POST /api/ai/voice/tts-maiz
   Recibe:   { text }
   Devuelve: { success, audio_url }

   Voz propia del Capitán Maíz. Separado de Marquinhos.
   ================================================================ */

'use strict';

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;

const ELEVEN_VOICE_ID =
    process.env.ELEVENLABS_VOICE_ID_CAPITAN_MAIZ ||
    'pNInz6obpgDQGcFmaJgB';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TTS_TIMEOUT_MS = 30000;
const MAX_TEXTO = 800;

const supabaseAdmin =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            }
        })
        : null;

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

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Sesión inválida'
            });
        }

        req.user = user;
        return next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Error de autenticación'
        });
    }
}

async function generarGoogle(texto, rate, pitch) {
    if (!GOOGLE_TTS_API_KEY) return null;

    try {
        const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
            {
                input: { text: texto },
                voice: {
                    languageCode: 'es-US',
                    name: 'es-US-Neural2-B',
                    ssmlGender: 'MALE'
                },
                audioConfig: {
                    audioEncoding: 'MP3',
                    pitch: typeof pitch === 'number' ? pitch - 1.0 : -1.0,
                    speakingRate: typeof rate === 'number' ? rate * 0.95 : 0.95
                }
            },
            {
                timeout: TTS_TIMEOUT_MS,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const audioContent = response.data?.audioContent;
        if (!audioContent) return null;

        return Buffer.from(audioContent, 'base64');
    } catch (error) {
        console.error('❌ Google TTS Capitán:', error.message);
        return null;
    }
}

async function generarEleven(texto) {
    if (!ELEVEN_API_KEY) return null;

    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
            {
                text: texto,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.6,
                    similarity_boost: 0.75,
                    style: 0.4,
                    use_speaker_boost: true
                }
            },
            {
                headers: {
                    'xi-api-key': ELEVEN_API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: TTS_TIMEOUT_MS
            }
        );

        return Buffer.from(response.data);
    } catch (error) {
        console.error('❌ ElevenLabs TTS Capitán:', error.message);
        return null;
    }
}

router.post('/tts-maiz', autenticar, async (req, res) => {
    try {
        const { text, rate = 1.0, pitch = 0.0 } = req.body || {};

        if (typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Texto vacío o inválido.'
            });
        }

        const textoLimpio = text.trim().slice(0, MAX_TEXTO);

        console.log('🌽 TTS Capitán Maíz solicitado:', {
            userId: req.user?.id,
            chars: textoLimpio.length
        });

        let audioBuffer = await generarGoogle(textoLimpio, rate, pitch);

        if (!audioBuffer) {
            audioBuffer = await generarEleven(textoLimpio);
        }

        if (!audioBuffer) {
            console.warn('⚠️ TTS Capitán no disponible');
            return res.status(200).json({
                success: false,
                error: 'TTS no disponible',
                fallback: true
            });
        }

        const storagePath = `capitan-maiz-tts/${req.user.id}/${Date.now()}.mp3`;

        const { error: uploadError } = await supabaseAdmin
            .storage
            .from('chat-audio')
            .upload(storagePath, audioBuffer, {
                contentType: 'audio/mpeg',
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('❌ Upload TTS Capitán:', uploadError.message);
            return res.status(500).json({
                success: false,
                error: 'No se pudo subir el audio'
            });
        }

        const { data: signedData, error: signedError } = await supabaseAdmin
            .storage
            .from('chat-audio')
            .createSignedUrl(storagePath, 3600);

        if (signedError || !signedData?.signedUrl) {
            return res.status(500).json({
                success: false,
                error: 'No se pudo firmar la URL del audio'
            });
        }

        console.log('✅ TTS Capitán generado:', {
            bytes: audioBuffer.length,
            voice: 'capitan-maiz'
        });

        return res.status(200).json({
            success: true,
            audio_url: signedData.signedUrl
        });

    } catch (error) {
        console.error('❌ Error en /api/ai/voice/tts-maiz:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Error generando audio'
        });
    }
});

module.exports = router;