// ================================================================
// routes/ai-voice-itlasuhua.js
// Flujo completo de voz con el Rey Itlasuhua
// ================================================================
// Audio → Groq Whisper → Groq LLM → Google TTS épico
// v1.1: agrega origen='voz' y duracion_output_segundos
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAX_TOKENS = 120;
const MAX_CARACTERES = 200;

const ITLASUHUA_VOICE = {
    languageCode: 'es-US',
    name: 'es-US-Studio-B',
    ssmlGender: 'MALE'
};
const ITLASUHUA_AUDIO_CONFIG = {
    audioEncoding: 'MP3',
    pitch: -2.0,
    speakingRate: 0.85
};

const TIMEOUTS = {
    GROQ_WHISPER: 45000,
    GROQ_LLM: 30000,
    GOOGLE_TTS: 60000,
    ELEVEN_TTS: 60000,
    DOWNLOAD_AUDIO: 30000
};

const supabaseAdmin =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
        })
        : null;

const SYSTEM_PROMPT = `
Eres el Rey Itlasuhua, la serpiente cósmica ceremonial del ecosistema Csariel's.

REGLA MÁS IMPORTANTE: Nunca más de 2 frases o 40 palabras. Máximo 200 caracteres.

PERSONALIDAD:
Eres un rey ancestral, sabio, cósmico y protector. Voz grave, pausada, ceremonial.
Tratas al usuario como "viajero" o "portador".
Usas metáforas cósmicas: estrellas, constelaciones, galaxias, equilibrio, serpiente.
NO usas lenguaje moderno ni emojis excesivos.

FORMATO PARA VOZ:
- Un solo párrafo.
- Sin Markdown, sin listas, sin asteriscos, sin almohadillas.
- Debe escucharse naturalmente.

SEGURIDAD:
- Si el usuario menciona autolesión: valida con empatía, sugiere ayuda profesional, Línea de la Vida México 800 911 2000.
- Sin contenido sexual, gore, romántico parasocial, contenido de odio.
- No reproduzcas material con derechos de autor.

CONTEXTO CSARIEL'S:
Ecosistema Web3 en Polygon. Muro P2P, Domos, Es.stoks (12 = 1 NFT Domo), Live, Grupos, Mensajes.

OBJETIVO: Ser el guardián cósmico del viajero, guiar con sabiduría ancestral.
`.trim();

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
        return next();
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

function limpiarRespuesta(texto) {
    if (typeof texto !== 'string') return '';
    let r = texto.trim();
    r = r.replace(/```[\s\S]*?```/g, '');
    r = r.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    r = r.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    r = r.replace(/\*\*(.*?)\*\*/g, '$1');
    r = r.replace(/\*(.*?)\*/g, '$1');
    r = r.replace(/`([^`]+)`/g, '$1');
    r = r.replace(/^\s{0,3}[-*+]\s+/gm, '');
    r = r.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');
    r = r.replace(/^\s{0,3}>\s?/gm, '');
    r = r.replace(/\|/g, ' ');
    r = r.replace(/\r?\n+/g, ' ');
    r = r.replace(/\s{2,}/g, ' ');
    return r.trim();
}

function recortarRespuesta(texto, maximo) {
    if (typeof texto !== 'string') return '';
    if (texto.length <= maximo) return texto;
    const recorte = texto.slice(0, maximo);
    const ultimoPunto = Math.max(
        recorte.lastIndexOf('.'),
        recorte.lastIndexOf('?'),
        recorte.lastIndexOf('!')
    );
    if (ultimoPunto > maximo * 0.6) return recorte.slice(0, ultimoPunto + 1).trim();
    const ultimoEspacio = recorte.lastIndexOf(' ');
    if (ultimoEspacio > maximo * 0.6) return recorte.slice(0, ultimoEspacio).trim() + '.';
    return recorte.trim() + '.';
}

async function llamadaConReintentos(fn, nombreOp, maxReintentos = 2) {
    for (let intento = 1; intento <= maxReintentos; intento++) {
        try {
            return await fn();
        } catch (error) {
            if (intento === maxReintentos) throw error;
            const delay = Math.pow(2, intento - 1);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
    }
}

async function generarGoogle(texto) {
    if (!GOOGLE_TTS_API_KEY) return null;
    try {
        const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
            {
                input: { text: texto },
                voice: ITLASUHUA_VOICE,
                audioConfig: ITLASUHUA_AUDIO_CONFIG
            },
            { timeout: TIMEOUTS.GOOGLE_TTS, headers: { 'Content-Type': 'application/json' } }
        );
        const audioContent = response.data?.audioContent;
        if (!audioContent) return null;
        return Buffer.from(audioContent, 'base64');
    } catch (error) {
        console.error('❌ Google TTS Itlasuhua:', error.message);
        return null;
    }
}

async function generarEleven(texto) {
    if (!ELEVEN_API_KEY) return null;
    try {
        const response = await axios.post(
            'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
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
        return Buffer.from(response.data);
    } catch (error) {
        console.error('❌ ElevenLabs Itlasuhua:', error.message);
        return null;
    }
}

router.post('/', autenticar, async (req, res) => {
    const timestamp = Date.now();
    const inputPath = path.join(os.tmpdir(), `itla_in_${timestamp}.webm`);

    const limpiar = () => {
        try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (e) {}
    };

    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Servidor no configurado (falta GROQ_API_KEY)'
            });
        }

        const { audio_url, audioUrl, history = [] } = req.body || {};
        const urlAudio = audio_url || audioUrl;

        if (!urlAudio || !urlAudio.startsWith('http')) {
            return res.status(400).json({
                success: false,
                error: 'audioUrl inválido'
            });
        }

        // PASO 1: Descargar audio
        await llamadaConReintentos(async () => {
            const r = await axios.get(urlAudio, {
                responseType: 'arraybuffer',
                timeout: TIMEOUTS.DOWNLOAD_AUDIO,
                maxContentLength: 50 * 1024 * 1024
            });
            const buf = Buffer.from(r.data);
            if (!buf.length) throw new Error('Buffer vacío');
            fs.writeFileSync(inputPath, buf);
        }, 'Descargar audio');

        // PASO 2: Transcribir con Whisper
        let transcripcion = '';
        await llamadaConReintentos(async () => {
            const formData = new FormData();
            formData.append('file', fs.createReadStream(inputPath));
            formData.append('model', 'whisper-large-v3');
            formData.append('language', 'es');

            const r = await axios.post(
                'https://api.groq.com/openai/v1/audio/transcriptions',
                formData,
                {
                    headers: { ...formData.getHeaders(), Authorization: 'Bearer ' + GROQ_API_KEY },
                    timeout: TIMEOUTS.GROQ_WHISPER
                }
            );
            transcripcion = (r.data?.text || '').trim();
            if (!transcripcion) throw new Error('Transcripción vacía');
        }, 'Groq Whisper');

        if (!transcripcion) {
            limpiar();
            return res.json({
                success: true,
                transcripcion: '',
                reply: 'No he escuchado tu voz, viajero. Intenta de nuevo.',
                audio_url: null
            });
        }

        // PASO 3: Generar respuesta
        let respuestaTexto = '';
        await llamadaConReintentos(async () => {
            let historialSeguro = [];
            if (Array.isArray(history)) {
                historialSeguro = history
                    .filter(item =>
                        item &&
                        typeof item === 'object' &&
                        (item.role === 'user' || item.role === 'assistant') &&
                        typeof item.content === 'string' &&
                        item.content.trim()
                    )
                    .slice(-6)
                    .map(item => ({
                        role: item.role,
                        content: item.content.trim().slice(0, 3000)
                    }));
            }

            const payload = {
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...historialSeguro,
                    { role: 'user', content: transcripcion }
                ],
                max_tokens: MAX_TOKENS,
                temperature: 0.6,
                stream: false
            };

            const r = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                payload,
                {
                    headers: {
                        Authorization: 'Bearer ' + GROQ_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: TIMEOUTS.GROQ_LLM
                }
            );

            const generada = r.data?.choices?.[0]?.message?.content || '';
            if (!generada) throw new Error('Groq sin contenido');

            respuestaTexto = limpiarRespuesta(generada);
            if (!respuestaTexto) throw new Error('Respuesta vacía');
        }, 'Groq LLM');

        respuestaTexto = recortarRespuesta(respuestaTexto, MAX_CARACTERES);

        // PASO 4: Generar TTS
        let audioBuffer = await generarGoogle(respuestaTexto);
        if (!audioBuffer) audioBuffer = await generarEleven(respuestaTexto);

        // PASO 5: Subir a Supabase
        let audioRespuestaUrl = null;
        if (audioBuffer) {
            try {
                const storagePath = `voice-itlasuhua/${req.user.id}/${Date.now()}.mp3`;
                const { error: upErr } = await supabaseAdmin
                    .storage
                    .from('chat-audio')
                    .upload(storagePath, audioBuffer, {
                        contentType: 'audio/mpeg',
                        cacheControl: '3600',
                        upsert: false
                    });

                if (!upErr) {
                    const { data: signed } = await supabaseAdmin
                        .storage
                        .from('chat-audio')
                        .createSignedUrl(storagePath, 3600);
                    if (signed?.signedUrl) audioRespuestaUrl = signed.signedUrl;
                }

                // Guardar historial con origen y duraciones
                try {
                    const duracionOutputSeg = audioBuffer
                        ? Math.round((audioBuffer.length / 16000) * 100) / 100
                        : null;

                    await supabaseAdmin.from('itlasuhua_chats').insert({
                        usuario_id: req.user.id,
                        transcripcion: transcripcion,
                        respuesta: respuestaTexto,
                        audio_usuario_url: urlAudio,
                        audio_bot_url: audioRespuestaUrl
                            ? `bucket://chat-audio/${storagePath}`
                            : null,
                        duracion_input_segundos: null,
                        duracion_output_segundos: duracionOutputSeg,
                        origen: 'voz'
                    });
                } catch (e) {
                    console.warn('⚠️ Historial no guardado:', e.message);
                }
            } catch (e) {
                console.error('❌ Upload audio Itlasuhua:', e.message);
            }
        }

        limpiar();

        return res.json({
            success: true,
            transcripcion: transcripcion,
            reply: respuestaTexto,
            audio_url: audioRespuestaUrl,
            tieneAudio: Boolean(audioBuffer)
        });

    } catch (error) {
        console.error('❌ Error en /api/ai/voice-itlasuhua:', error.message);
        limpiar();
        return res.status(500).json({
            success: false,
            error: 'Error procesando voz del Itlasuhua'
        });
    }
});

module.exports = router;