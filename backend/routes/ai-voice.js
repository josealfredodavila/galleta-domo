/* ================================================================
   routes/ai-voice.js - VOZ CON MARQUINHOS
   PRODUCCIÓN - RESPUESTAS NATURALES Y CORTAS + MÚSICA DEEZER
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const NVIDIA_MODEL = 'moonshotai/kimi-k3';
const MAX_TOKENS_RESPUESTA = 120;
const MAX_CARACTERES_RESPUESTA = 200;

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
    SUPABASE_UPLOAD: 30000,
    DEEZER: 10000 // NUEVO: Timeout para Deezer
};

/* ================================================================
   PERSONALIDAD DE MARQUINHOS PARA VOZ (CON CONOCIMIENTO DE MÚSICA)
================================================================ */

const SYSTEM_PROMPT = `
Eres Marquinhos, el asistente oficial del ecosistema Sariel's.

Tu manera de hablar debe sentirse como una conversación real con una persona.

REGLA MÁS IMPORTANTE (LÍMITE ABSOLUTO):
Nunca escribas más de 2 frases o 40 palabras.
Máximo 200 caracteres por respuesta.
Una respuesta corta y útil es siempre preferible a una explicación larga.

NUEVA HABILIDAD: MÚSICA
Si el usuario te pide que pongas música, que busques una canción o un artista, responde con alegría y confirma que la estás buscando. 
Ejemplo: "¡Claro! Buscando a Bad Bunny para ti..." o "¡Buena elección! Déjame buscar esa canción."
No digas que no puedes hacerlo.

PERSONALIDAD:
Eres profesional, educado, amable, paciente y natural.
Hablas español mexicano neutro.
No hables como un ingeniero sénior.
No hables como un manual técnico.
No des explicaciones enormes.
Responde solamente a lo que la persona acaba de preguntar.

LONGITUD:
Normalmente responde entre 1 y 2 frases.
No superes aproximadamente 40 palabras salvo que sea realmente necesario.

FORMATO PARA VOZ:
La respuesta debe ser un solo párrafo.
No utilices Markdown, ni listas, ni números, ni asteriscos, ni almohadillas.
No utilices guiones, ni bloques de código, ni tablas.
No utilices símbolos decorativos.
No utilices emojis salvo que sean realmente necesarios.
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
    respuesta = respuesta.replace(/^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/gm, '');
    respuesta = respuesta.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    respuesta = respuesta.replace(/^\s*\|.*\|\s*$/gm, '');
    respuesta = respuesta.replace(/\|/g, ' ');
    respuesta = respuesta.replace(/^\s*[*#_~•◈✦🔴🟡🟢🟣🔵🟠➤→»]+\s*/gm, '');
    respuesta = respuesta.replace(/\s+[*#_~]{2,}\s+/g, ' ');
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
    const ultimoPunto = recorte.lastIndexOf('.');
    const ultimoEspacio = recorte.lastIndexOf(' ');

    let corte;

    if (ultimoPunto > maximo * 0.6 && ultimoPunto >= ultimoEspacio) {
        corte = recorte.slice(0, ultimoPunto + 1);
    } else if (ultimoEspacio > maximo * 0.6) {
        corte = recorte.slice(0, ultimoEspacio) + '.';
    } else {
        corte = recorte + '.';
    }

    return corte.trim();
}

/* ================================================================
   GOOGLE CLOUD TEXT-TO-SPEECH
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

/* ================================================================
   ELEVENLABS TEXT-TO-SPEECH
================================================================ */

async function generarAudioElevenLabs(texto) {
    const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
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
   NUEVO: BUSCAR MÚSICA EN DEEZER
================================================================ */
async function buscarMusicaDeezer(query) {
    try {
        const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
        const response = await axios.get(url, { timeout: TIMEOUTS.DEEZER });
        
        if (response.data && response.data.data && response.data.data.length > 0) {
            const track = response.data.data[0];
            return {
                titulo: track.title,
                artista: track.artist.name,
                audio_preview: track.preview,
                caratula: track.album.cover_medium
            };
        }
        return null;
    } catch (error) {
        console.error(`  ❌ Deezer falló: ${error.message}`);
        return null;
    }
}

/* ================================================================
   RUTA PRINCIPAL
   POST /chat
================================================================ */

router.post('/chat', autenticar, async (req, res) => {
    const timestamp = Date.now();
    const inputPath = path.join(os.tmpdir(), `voice_input_${timestamp}.webm`);
    const outputPath = path.join(os.tmpdir(), `voice_output_${timestamp}.mp3`);

    const limpiarTemporales = () => {
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {}
    };

    try {
        if (!NVIDIA_API_KEY || !GROQ_API_KEY) {
            return res.status(500).json({ success: false, error: 'Servidor no configurado (faltan NVIDIA_API_KEY o GROQ_API_KEY)' });
        }

        const { audio_url, audioUrl, history = [] } = req.body || {};
        const urlAudio = audio_url || audioUrl;

        if (!urlAudio || typeof urlAudio !== 'string' || !urlAudio.startsWith('http')) {
            return res.status(400).json({ success: false, error: 'audioUrl inválido o no proporcionado' });
        }

        console.log(`\n🎙️ [${'='.repeat(30)}] Marquinhos Voice Chat\n`);
        console.log(`📝 ID Solicitud: ${timestamp}`);

        /* PASO 1: DESCARGAR AUDIO */
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

        /* PASO 2: TRANSCRIBIR */
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

            transcripcion = (whisperResponse.data && whisperResponse.data.text && whisperResponse.data.text.trim()) || '';
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

        /* NUEVO: DETECTAR SI EL USUARIO PIDIÓ MÚSICA */
        let musicaReproduciendo = null;
        const textLower = transcripcion.toLowerCase();
        if (textLower.includes('pon música') || textLower.includes('reproduce') || textLower.includes('busca la canción')) {
            // Extraer la canción (limpiando las palabras clave)
            const query = transcripcion.replace(/pon música de/gi, '').replace(/pon música/gi, '').replace(/reproduce/gi, '').replace(/busca la canción/gi, '').trim();
            
            if (query) {
                console.log(`\n🎵 Detectada intención de música: "${query}"`);
                musicaReproduciendo = await buscarMusicaDeezer(query);
            }
        }

        /* PASO 3: GENERAR RESPUESTA */
        console.log('\n🧠 PASO 3: Generando respuesta de Marquinhos');
        let respuestaTexto = '';
        await llamadaConReintentos(async () => {
            let historialSeguro = [];
            if (Array.isArray(history)) {
                historialSeguro = history
                    .filter(item =>
                        item && typeof item === 'object' &&
                        (item.role === 'user' || item.role === 'assistant') &&
                        typeof item.content === 'string' && item.content.trim()
                    )
                    .slice(-6)
                    .map(item => ({
                        role: item.role,
                        content: item.content.trim().slice(0, 3000)
                    }));
            }

            // Si hay música, le decimos a la IA que responda acorde
            let userMessage = transcripcion;
            if (musicaReproduciendo) {
                userMessage += ` (Nota para Marquinhos: El usuario pidió música. Responde confirmando que estás reproduciendo ${musicaReproduciendo.titulo} de ${musicaReproduciendo.artista})`;
            }

            const payload = {
                model: NVIDIA_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...historialSeguro,
                    { role: 'user', content: userMessage }
                ],
                max_tokens: MAX_TOKENS_RESPUESTA,
                temperature: 0.5,
                stream: false
            };

            const nvidiaResponse = await axios.post(
                'https://integrate.api.nvidia.com/v1/chat/completions',
                payload,
                {
                    headers: {
                        Authorization: 'Bearer ' + NVIDIA_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: TIMEOUTS.NVIDIA_LLM
                }
            );

            const respuestaGenerada = (nvidiaResponse.data && nvidiaResponse.data.choices && nvidiaResponse.data.choices[0] && nvidiaResponse.data.choices[0].message && nvidiaResponse.data.choices[0].message.content && nvidiaResponse.data.choices[0].message.content.trim()) || '';
            if (!respuestaGenerada) throw new Error('NVIDIA no devolvió contenido');

            respuestaTexto = limpiarRespuestaMarquinhos(respuestaGenerada);
            if (!respuestaTexto) throw new Error('La respuesta quedó vacía después de limpiarla');
            console.log(`  ✅ "${respuestaTexto.substring(0, 120)}${respuestaTexto.length > 120 ? '...' : ''}"`);
        }, 'NVIDIA Kimi K3', 2);

        respuestaTexto = recortarRespuesta(respuestaTexto, MAX_CARACTERES_RESPUESTA);

        /* PASO 4: TEXT TO SPEECH */
        console.log('\n🔊 PASO 4: Generando audio');
        let audioBuffer = null;
        console.log('  → Intentando Google Cloud TTS...');
        audioBuffer = await generarAudioGoogle(respuestaTexto);

        if (!audioBuffer) {
            console.log('  → Intentando ElevenLabs TTS...');
            audioBuffer = await generarAudioElevenLabs(respuestaTexto);
        }

        if (!audioBuffer) {
            console.warn('  ⚠️ TTS completamente fallido - continuando sin audio');
        } else {
            fs.writeFileSync(outputPath, audioBuffer);
        }

        /* PASO 5: SUBIR AUDIO A SUPABASE */
        let audioRespuestaUrl = null;
        if (audioBuffer) {
            console.log('\n📤 PASO 5: Subiendo a Supabase Storage');
            try {
                const storagePath = `bot-responses/${req.user.id}/${Date.now()}.mp3`;
                const { error: uploadError } = await supabaseAdmin
                    .storage
                    .from('chat-audio')
                    .upload(storagePath, audioBuffer, {
                        contentType: 'audio/mpeg',
                        cacheControl: '3600',
                        upsert: false
                    });

                if (!uploadError) {
                    const { data: signedData, error: signedError } = await supabaseAdmin
                        .storage
                        .from('chat-audio')
                        .createSignedUrl(storagePath, 3600);

                    if (!signedError && signedData && signedData.signedUrl) {
                        audioRespuestaUrl = signedData.signedUrl;
                        console.log('  ✅ URL firmada creada');
                    }
                } else {
                    console.error(`  ❌ Error subiendo: ${uploadError.message}`);
                }

                try {
                    await supabaseAdmin
                        .from('ai_voice_chats')
                        .insert({
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

        limpiarTemporales();
        const duracion = Date.now() - timestamp;
        console.log(`\n✅ Procesamiento completado en ${duracion}ms`);
        console.log(`${'='.repeat(40)}\n`);

        /* RESPUESTA FINAL (Incluye datos de música si aplica) */
        return res.json({
            success: true,
            transcripcion: transcripcion,
            reply: respuestaTexto,
            audio_url: audioRespuestaUrl,
            duracion_ms: duracion,
            tieneAudio: Boolean(audioBuffer),
            musica: musicaReproduciendo // NUEVO: Enviamos la canción al frontend
        });

    } catch (error) {
        console.error(`\n❌ ERROR CRÍTICO: ${error.message}\n`);
        console.error('   Detalles:', {
            name: error.name,
            code: error.code,
            status: error.response ? error.response.status : null
        });

        limpiarTemporales();
        return res.status(500).json({
            success: false,
            error: 'Error procesando voz',
            detalles: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;