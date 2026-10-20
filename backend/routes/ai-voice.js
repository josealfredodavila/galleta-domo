/* ================================================================
   routes/ai-voice.js - VOZ CON MARQUINHOS (v2.0)
   ================================================================
   Endpoint: POST /api/ai/voice/chat
   Flujo: audio -> Whisper -> música (Deezer) o LLM -> TTS -> respuesta

   v2.0 — URL de audio validada contra Supabase Storage (anti-SSRF),
          silencio sin error 500, historial siempre guardado,
          detección de música compartida con chat-pet, voz es-US,
          respuesta enviada antes de subir audio a Storage.
================================================================ */

'use strict';

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
const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const NVIDIA_MODEL = 'moonshotai/kimi-k3';

// Si el modelo devuelve contenido vacío con estos tokens, subir a 300.
const MAX_TOKENS_RESPUESTA = 120;
const MAX_CARACTERES_RESPUESTA = 200;
const HISTORIAL_LLM_MAX = 6;

const BUCKET_AUDIO = 'chat-audio';
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

// Voz mexicana. Confirma que esté disponible en tu proyecto de Google Cloud.
const GOOGLE_VOICE = { languageCode: 'es-US', name: 'es-US-Neural2-B', ssmlGender: 'MALE' };

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
    : null;

const TIMEOUTS = {
    GROQ_WHISPER: 45000,
    NVIDIA_LLM: 30000,
    GOOGLE_TTS: 60000,
    ELEVEN_TTS: 60000,
    DOWNLOAD_AUDIO: 30000,
    DEEZER: 8000
};

/* ================================================================
   PERSONALIDAD DE MARQUINHOS PARA VOZ
================================================================ */

const SYSTEM_PROMPT = `
Eres Marquinhos, el asistente oficial del ecosistema Sariel's.

Tu manera de hablar debe sentirse como una conversación real con una persona.

REGLA MÁS IMPORTANTE (LÍMITE ABSOLUTO):
Nunca escribas más de 2 frases o 40 palabras.
Máximo 200 caracteres por respuesta.
Una respuesta corta y útil es siempre preferible a una explicación larga.

MÚSICA:
Si el mensaje incluye una nota de que se encontró una canción, confirma con alegría que la estás reproduciendo.
Si incluye una nota de que no se encontró, dilo con naturalidad y pide otro nombre. No inventes canciones ni artistas.

PERSONALIDAD:
Eres profesional, educado, amable, paciente y natural.
Hablas español mexicano neutro.
No hables como un ingeniero sénior.
No hables como un manual técnico.
No des explicaciones enormes.
Responde solamente a lo que la persona acaba de preguntar.

FORMATO PARA VOZ:
La respuesta debe ser un solo párrafo.
No utilices Markdown, ni listas, ni números, ni asteriscos, ni almohadillas.
No utilices guiones, ni bloques de código, ni tablas.
No utilices símbolos decorativos ni emojis.
La respuesta debe poder escucharse naturalmente mediante voz.

PRECISIÓN:
No inventes información.
No inventes precios ni saldos.
Si no conoces algo, dilo claramente.

CONTEXTO DE SARIEL'S:
Sariel's es un ecosistema Web3 relacionado con Polygon.
Los Domos son productos físicos.
12 Es.stoks corresponden al objetivo de 1 NFT Domo.
Puedes orientar sobre Domos, Es.stoks, NFT, Polygon, LIVE, canales, mensajes y funciones generales.

CRISIS:
Si el usuario menciona hacerse daño o quitarse la vida, responde con empatía, indica que llame al 911 si hay peligro inmediato y a la Línea de la Vida 800 911 2000, y pide que hable con alguien de confianza.
`.trim();

/* ================================================================
   AUTENTICACIÓN
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

        if (!supabaseAdmin) {
            console.error('❌ Supabase Admin no configurado');
            return res.status(500).json({ success: false, error: 'Supabase no está configurado correctamente' });
        }

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Token inválido' });
        }

        req.user = user;
        return next();
    } catch (err) {
        console.error('❌ Error autenticando:', err.message);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   VALIDACIÓN DE URL DE AUDIO (anti-SSRF)
================================================================ */

function urlAudioPermitida(urlAudio) {
    if (!SUPABASE_URL || typeof urlAudio !== 'string') return false;

    try {
        const url = new URL(urlAudio);
        const base = new URL(SUPABASE_URL);
        const prefijo = `/storage/v1/object/`;

        return url.protocol === 'https:' &&
            url.hostname === base.hostname &&
            url.pathname.startsWith(prefijo);
    } catch (e) {
        return false;
    }
}

/* ================================================================
   REINTENTOS CON BACKOFF
================================================================ */

async function llamadaConReintentos(fn, nombreOp, maxReintentos = 3) {
    for (let intento = 1; intento <= maxReintentos; intento++) {
        try {
            console.log(`  ▶️ ${nombreOp} (${intento}/${maxReintentos})`);
            return await fn();
        } catch (error) {
            console.warn(`  ⚠️ ${nombreOp}: ${error.message}`);
            if (intento === maxReintentos) throw error;
            const delay = Math.pow(2, intento - 1);
            console.log(`  ⏳ Reintentando en ${delay}s...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
    }
}

/* ================================================================
   LIMPIAR RESPUESTA PARA VOZ
================================================================ */

function limpiarRespuestaMarquinhos(texto) {
    if (typeof texto !== 'string') return '';

    let respuesta = texto.trim();

    respuesta = respuesta.replace(/```[\s\S]*?```/g, '');
    respuesta = respuesta.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    respuesta = respuesta.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    respuesta = respuesta.replace(/\*\*(.*?)\*\*/g, '$1');
    respuesta = respuesta.replace(/\*(.*?)\*/g, '$1');
    respuesta = respuesta.replace(/___(.*?)___/g, '$1');
    respuesta = respuesta.replace(/__(.*?)__/g, '$1');
    respuesta = respuesta.replace(/_(.*?)_/g, '$1');
    respuesta = respuesta.replace(/`([^`]+)`/g, '$1');
    respuesta = respuesta.replace(/^\s{0,3}[-*+]\s+/gm, '');
    respuesta = respuesta.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');
    respuesta = respuesta.replace(/^\s{0,3}>\s?/gm, '');
    respuesta = respuesta.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    respuesta = respuesta.replace(/^\s*\|.*\|\s*$/gm, '');
    respuesta = respuesta.replace(/\|/g, ' ');
    respuesta = respuesta.replace(/[→»➤•◈✦]/g, ' ');
    respuesta = respuesta.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
    respuesta = respuesta.replace(/[\u{2600}-\u{27BF}]/gu, '');
    respuesta = respuesta.replace(/\r?\n+/g, ' ');
    respuesta = respuesta.replace(/\s{2,}/g, ' ');

    return respuesta.trim();
}

/* ================================================================
   RECORTAR RESPUESTA
================================================================ */

function recortarRespuesta(texto, maximo) {
    if (typeof texto !== 'string') return '';
    if (texto.length <= maximo) return texto;

    const recorte = texto.slice(0, maximo);
    const ultimoPunto = Math.max(
        recorte.lastIndexOf('.'),
        recorte.lastIndexOf('?'),
        recorte.lastIndexOf('!')
    );
    if (ultimoPunto > maximo * 0.6) {
        return recorte.slice(0, ultimoPunto + 1).trim();
    }

    const ultimoEspacio = recorte.lastIndexOf(' ');
    if (ultimoEspacio > 0) {
        return recorte.slice(0, ultimoEspacio).trim() + '...';
    }
    return recorte.trim() + '...';
}

/* ================================================================
   TEXT TO SPEECH
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
                voice: GOOGLE_VOICE,
                audioConfig: { audioEncoding: 'MP3', pitch: 0.0, speakingRate: 1.0 }
            },
            {
                timeout: TIMEOUTS.GOOGLE_TTS,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const audioContent = response.data && response.data.audioContent;
        if (!audioContent) throw new Error('Sin contenido de audio');

        const audioBuffer = Buffer.from(audioContent, 'base64');
        console.log(`  ✅ Google TTS: ${(audioBuffer.length / 1024).toFixed(1)}KB`);
        return audioBuffer;
    } catch (error) {
        console.error(`  ❌ Google TTS falló: ${error.message}`);
        return null;
    }
}

async function generarAudioElevenLabs(texto) {
    if (!ELEVEN_API_KEY) {
        console.warn('  ⚠️ ElevenLabs no configurado');
        return null;
    }

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

        const audioBuffer = Buffer.from(response.data);
        console.log(`  ✅ ElevenLabs TTS: ${(audioBuffer.length / 1024).toFixed(1)}KB`);
        return audioBuffer;
    } catch (error) {
        console.error(`  ❌ ElevenLabs falló: ${error.message}`);
        return null;
    }
}

/* ================================================================
   MÚSICA (misma lógica que chat-pet v5.5)
================================================================ */

const PATRONES_DISPARO = [
    'pon m[uú]sica', 'ponme m[uú]sica', 'ponme una canci[oó]n',
    'pon una canci[oó]n', 'pon la canci[oó]n', 'ponme una rolita',
    'ponme algo de', 'quiero escuchar', 'reproduce', 'reproducir'
];

const RE_DISPARO = new RegExp(`\\b(?:${PATRONES_DISPARO.join('|')})\\b`, 'i');
const RE_DISPARO_GLOBAL = new RegExp(`\\b(?:${PATRONES_DISPARO.join('|')})\\b`, 'gi');
const RE_RELLENO = /\b(?:marquinhos|oye|porfa|por favor|ya|ponte|me puedes|puedes|podr[ií]as)\b,?/gi;

function detectarMusica(mensaje) {
    const original = String(mensaje || '').trim();

    if (/[?¿]/.test(original)) return null;

    const normalizado = original
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    if (/^(como|que|cuando|donde|por|quien|cual)\b/.test(normalizado)) return null;

    const sinRelleno = original
        .replace(RE_RELLENO, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[,.:;\s]+/, '')
        .trim();

    const primerasPalabras = sinRelleno.split(' ').slice(0, 4).join(' ');
    if (!RE_DISPARO.test(primerasPalabras)) return null;

    let limpio = sinRelleno
        .replace(RE_DISPARO_GLOBAL, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[,.:;\s]+/, '')
        .trim();

    limpio = limpio.replace(/^(?:de|la)\s+/i, '').trim();

    if (limpio.length < 2) return null;
    return limpio;
}

async function buscarMusicaDeezer(query) {
    if (!query || !query.trim()) return null;

    try {
        const url = `https://api.deezer.com/search?q=${encodeURIComponent(query.trim())}`;
        const resp = await axios.get(url, { timeout: TIMEOUTS.DEEZER });
        const data = resp.data;

        if (!data || !Array.isArray(data.data) || data.data.length === 0) return null;

        const track = data.data[0];
        if (!track || !track.preview) return null;

        return {
            titulo: track.title || '',
            artista: track.artist?.name || '',
            caratula: track.album?.cover_medium || '',
            audio_preview: track.preview
        };
    } catch (e) {
        console.warn(`  ⚠️ Deezer falló: ${e.message}`);
        return null;
    }
}

/* ================================================================
   HISTORIAL SEGURO PARA EL LLM
================================================================ */

function limpiarHistorialLLM(history) {
    if (!Array.isArray(history)) return [];

    return history
        .filter(item =>
            item && typeof item === 'object' &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' && item.content.trim()
        )
        .slice(-HISTORIAL_LLM_MAX)
        .map(item => ({
            role: item.role,
            content: item.content.trim().slice(0, 3000)
        }));
}

/* ================================================================
   GUARDADO DE HISTORIAL (siempre, con o sin audio)
================================================================ */

async function guardarHistorialVoz({ usuarioId, transcripcion, respuesta, audioUsuarioUrl, audioBotUrl }) {
    if (!supabaseAdmin) return;
    try {
        const { error } = await supabaseAdmin.from('ai_voice_chats').insert({
            usuario_id: usuarioId,
            transcripcion,
            respuesta,
            audio_usuario_url: audioUsuarioUrl || null,
            audio_bot_url: audioBotUrl || null,
            origen: 'voice_chat'
        });
        if (error) console.warn(`  ⚠️ Historial no guardado: ${error.message}`);
        else console.log('  ✅ Historial guardado en Supabase');
    } catch (e) {
        console.warn(`  ⚠️ Historial no guardado: ${e.message}`);
    }
}

/* ================================================================
   SUBIDA DE AUDIO A STORAGE (en segundo plano)
================================================================ */

async function subirAudioRespuesta(usuarioId, audioBuffer) {
    if (!supabaseAdmin || !audioBuffer) return { url: null, path: null };

    try {
        const storagePath = `bot-responses/${usuarioId}/${Date.now()}.mp3`;
        const { error: uploadError } = await supabaseAdmin
            .storage
            .from(BUCKET_AUDIO)
            .upload(storagePath, audioBuffer, {
                contentType: 'audio/mpeg',
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error(`  ❌ Error subiendo audio: ${uploadError.message}`);
            return { url: null, path: null };
        }

        const { data: signedData, error: signedError } = await supabaseAdmin
            .storage
            .from(BUCKET_AUDIO)
            .createSignedUrl(storagePath, 3600);

        if (signedError || !signedData?.signedUrl) return { url: null, path: storagePath };

        return { url: signedData.signedUrl, path: storagePath };
    } catch (e) {
        console.error(`  ❌ Error en subida: ${e.message}`);
        return { url: null, path: null };
    }
}

/* ================================================================
   RUTA PRINCIPAL
   POST /chat
================================================================ */

router.post('/chat', autenticar, async (req, res) => {
    const timestamp = Date.now();
    const inputPath = path.join(os.tmpdir(), `voice_input_${timestamp}.webm`);

    const limpiarTemporales = () => {
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (e) {}
    };

    try {
        if (!NVIDIA_API_KEY || !GROQ_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Servidor no configurado (faltan NVIDIA_API_KEY o GROQ_API_KEY)'
            });
        }

        const { audio_url, audioUrl, history = [] } = req.body || {};
        const urlAudio = audio_url || audioUrl;

        if (!urlAudioPermitida(urlAudio)) {
            return res.status(400).json({
                success: false,
                error: 'audioUrl inválido o no permitido'
            });
        }

        console.log(`\n🎙️ Marquinhos Voice Chat · ID ${timestamp}`);

        /* PASO 1: DESCARGAR AUDIO */
        console.log('\n📥 PASO 1: Descargando audio del usuario');
        await llamadaConReintentos(async () => {
            const audioResponse = await axios.get(urlAudio, {
                responseType: 'arraybuffer',
                timeout: TIMEOUTS.DOWNLOAD_AUDIO,
                maxContentLength: MAX_AUDIO_BYTES
            });
            const inputBuffer = Buffer.from(audioResponse.data);
            if (!inputBuffer.length) throw new Error('Buffer vacío');
            fs.writeFileSync(inputPath, inputBuffer);
            console.log(`  ✅ Descargado: ${(inputBuffer.length / 1024).toFixed(1)}KB`);
        }, 'Descargar audio', 2);

        /* PASO 2: TRANSCRIBIR (silencio no es error) */
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
                        Authorization: 'Bearer ' + GROQ_API_KEY
                    },
                    timeout: TIMEOUTS.GROQ_WHISPER
                }
            );

            transcripcion = (whisperResponse.data?.text || '').trim();
            if (transcripcion) {
                console.log(`  ✅ "${transcripcion.substring(0, 100)}${transcripcion.length > 100 ? '...' : ''}"`);
            } else {
                console.log('  ℹ️ Transcripción vacía (silencio)');
            }
        }, 'Groq Whisper', 2);

        limpiarTemporales();

        if (!transcripcion) {
            return res.json({
                success: true,
                transcripcion: '',
                reply: 'No escuché nada. ¿Puedes repetir?',
                audio_url: null,
                tieneAudio: false,
                musica: null
            });
        }

        /* PASO 3: MÚSICA (si aplica) */
        const queryMusica = detectarMusica(transcripcion);
        let musicaReproduciendo = null;
        let notaMusica = null;

        if (queryMusica) {
            console.log(`\n🎵 Intención de música: "${queryMusica}"`);
            musicaReproduciendo = await buscarMusicaDeezer(queryMusica);
            notaMusica = musicaReproduciendo
                ? `[MÚSICA REPRODUCIENDO] Se encontró ${musicaReproduciendo.titulo} de ${musicaReproduciendo.artista}. Confirma con alegría.`
                : `[MÚSICA NO ENCONTRADA] No se encontró «${queryMusica}». Dilo con naturalidad y pide otro nombre.`;
        }

        /* PASO 4: GENERAR RESPUESTA */
        console.log('\n🧠 PASO 4: Generando respuesta de Marquinhos');
        let respuestaTexto = '';
        await llamadaConReintentos(async () => {
            const mensajes = [{ role: 'system', content: SYSTEM_PROMPT }];
            if (notaMusica) mensajes.push({ role: 'system', content: notaMusica });
            mensajes.push(...limpiarHistorialLLM(history));
            mensajes.push({ role: 'user', content: transcripcion });

            const nvidiaResponse = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                {
                    model: NVIDIA_MODEL,
                    messages: mensajes,
                    max_tokens: MAX_TOKENS_RESPUESTA,
                    temperature: 0.5,
                    stream: false
                },
                {
                    headers: {
                        Authorization: 'Bearer ' + NVIDIA_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: TIMEOUTS.NVIDIA_LLM
                }
            );

            const contenido = nvidiaResponse.data?.choices?.[0]?.message?.content?.trim() || '';
            if (!contenido) throw new Error('NVIDIA no devolvió contenido');

            respuestaTexto = limpiarRespuestaMarquinhos(contenido);
            if (!respuestaTexto) throw new Error('La respuesta quedó vacía después de limpiarla');
        }, 'NVIDIA Kimi K3', 2);

        respuestaTexto = recortarRespuesta(respuestaTexto, MAX_CARACTERES_RESPUESTA);

        /* PASO 5: TEXT TO SPEECH */
        console.log('\n🔊 PASO 5: Generando audio');
        let audioBuffer = await generarAudioGoogle(respuestaTexto);
        if (!audioBuffer) audioBuffer = await generarAudioElevenLabs(respuestaTexto);
        if (!audioBuffer) console.warn('  ⚠️ TTS fallido, se responde sin audio');

        const duracion = Date.now() - timestamp;

        /* RESPUESTA AL CLIENTE (antes de subir el audio) */
        res.json({
            success: true,
            transcripcion,
            reply: respuestaTexto,
            audio_url: null,
            duracion_ms: duracion,
            tieneAudio: Boolean(audioBuffer),
            musica: musicaReproduciendo
        });

        /* TAREAS EN SEGUNDO PLANO: subir audio y guardar historial.
           Errores capturados para no tumbar el proceso. */
        (async () => {
            let audioBotUrl = null;
            if (audioBuffer) {
                const subida = await subirAudioRespuesta(req.user.id, audioBuffer);
                audioBotUrl = subida.path ? `bucket://${BUCKET_AUDIO}/${subida.path}` : null;
            }
            await guardarHistorialVoz({
                usuarioId: req.user.id,
                transcripcion,
                respuesta: respuestaTexto,
                audioUsuarioUrl: urlAudio,
                audioBotUrl
            });
            console.log(`\n✅ Procesamiento completado en ${Date.now() - timestamp}ms`);
        })().catch(e => console.error('❌ Tarea en segundo plano falló:', e.message));

    } catch (error) {
        console.error(`\n❌ ERROR CRÍTICO: ${error.message}`);
        console.error('   Detalles:', {
            name: error.name,
            code: error.code,
            status: error.response ? error.response.status : null
        });

        limpiarTemporales();

        if (res.headersSent) return;

        return res.status(500).json({
            success: false,
            error: 'Error procesando voz',
            detalles: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;