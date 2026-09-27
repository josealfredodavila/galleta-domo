/* ================================================================
   routes/ai-voice.js - VOZ CON MARQUINHOS
   PRODUCCIÓN - RESPUESTAS NATURALES Y CORTAS
   ================================================================

   FLUJO:
   Audio usuario
        ↓
   Groq Whisper
        ↓
   NVIDIA Kimi K3
        ↓
   Limpieza de respuesta
        ↓
   Google Cloud TTS
        ↓
   ElevenLabs como fallback
        ↓
   Supabase Storage
        ↓
   Respuesta al usuario

   OBJETIVO DE MARQUINHOS:
   - Profesional
   - Educado
   - Natural
   - Conversacional
   - Respuestas breves
   - Un paso a la vez
   - No hablar como ingeniero
   - No dar explicaciones enormes
   - Sin Markdown
   - Sin símbolos decorativos innecesarios
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
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ================================================================
   SUPABASE ADMIN
================================================================ */

const supabaseAdmin =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                }
            }
        )
        : null;

/* ================================================================
   TIMEOUTS
================================================================ */

const TIMEOUTS = {
    GROQ_WHISPER: 45000,
    NVIDIA_LLM: 30000,
    GOOGLE_TTS: 60000,
    ELEVEN_TTS: 60000,
    DOWNLOAD_AUDIO: 30000,
    SUPABASE_UPLOAD: 30000
};

/* ================================================================
   PERSONALIDAD DE MARQUINHOS PARA VOZ
================================================================ */

const SYSTEM_PROMPT = `
Eres Marquinhos, el asistente oficial del ecosistema Sariel's.

Tu manera de hablar debe sentirse como una conversación real con una persona.

PERSONALIDAD:

Eres profesional, educado, amable, paciente y natural.

Hablas español mexicano neutro.

No hables como un ingeniero sénior.

No hables como un manual técnico.

No des explicaciones enormes.

No intentes demostrar todo lo que sabes.

Responde solamente a lo que la persona acaba de preguntar.

CONVERSACIÓN:

La conversación debe avanzar poco a poco.

Si el usuario está realizando un procedimiento, explica solamente el siguiente paso necesario.

Espera a que el usuario responda antes de continuar con el siguiente paso cuando sea necesario.

No entregues una guía completa de muchos pasos si el usuario solamente está preguntando por el primer paso.

Si la pregunta es sencilla, responde de manera sencilla.

Si el usuario pide más detalles, entonces puedes ampliar la explicación.

LONGITUD:

Normalmente responde entre 1 y 3 frases.

No superes aproximadamente 50 palabras salvo que sea realmente necesario.

Una respuesta corta y útil es preferible a una explicación larga.

FORMATO PARA VOZ:

La respuesta debe ser un solo párrafo.

No utilices Markdown.

No utilices encabezados.

No utilices listas.

No utilices números para enumerar pasos.

No utilices asteriscos.

No utilices almohadillas.

No utilices guiones como decoración.

No utilices guiones bajos.

No utilices bloques de código.

No utilices símbolos decorativos.

No utilices emojis salvo que sean realmente necesarios.

La respuesta debe poder escucharse naturalmente mediante voz.

PRECISIÓN:

No inventes información.

No inventes precios.

No inventes saldos.

No inventes transacciones.

No inventes datos personales.

No inventes funciones de Sariel's.

No afirmes que realizaste una operación si no tienes acceso real para realizarla.

Si no conoces algo, dilo claramente.

CONTEXTO DE SARIEL'S:

Sariel's es un ecosistema Web3 relacionado con Polygon.

Los Domos son productos físicos del ecosistema.

Los Domos pueden relacionarse con recompensas y Es.stoks.

Es.stoks son tokens del ecosistema.

12 Es.stoks corresponden al objetivo de 1 NFT Domo.

Puedes orientar sobre Domos, Es.stoks, NFT, Polygon, LIVE, canales, mensajes y funciones generales.

IMPORTANTE:

No intentes resolver toda la conversación en una sola respuesta.

Primero responde lo que la persona necesita ahora.

Después continúa conforme avance la conversación.
`.trim();

/* ================================================================
   AUTENTICACIÓN
================================================================ */

async function autenticar(req, res, next) {
    try {
        const auth =
            req.headers.authorization || '';

        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        const token =
            auth.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token no proporcionado'
            });
        }

        if (!supabaseAdmin) {
            console.error(
                '❌ Supabase Admin no configurado'
            );

            return res.status(500).json({
                success: false,
                error:
                    'Supabase no está configurado correctamente'
            });
        }

        const {
            data: { user },
            error
        } =
            await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }

        req.user = user;

        return next();

    } catch (err) {

        console.error(
            '❌ Error autenticando:',
            err.message
        );

        return res.status(500).json({
            success: false,
            error: 'Error de autenticación'
        });
    }
}

/* ================================================================
   REINTENTOS CON BACKOFF
================================================================ */

async function llamadaConReintentos(
    fn,
    nombreOp,
    maxReintentos = 3
) {
    for (
        let intento = 1;
        intento <= maxReintentos;
        intento++
    ) {
        try {

            console.log(
                `  ▶️ ${nombreOp} (${intento}/${maxReintentos})`
            );

            return await fn();

        } catch (error) {

            console.warn(
                `  ⚠️ ${nombreOp}: ${error.message}`
            );

            if (
                intento === maxReintentos
            ) {
                throw error;
            }

            const delay =
                Math.pow(2, intento - 1);

            console.log(
                `  ⏳ Reintentando en ${delay}s...`
            );

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        delay * 1000
                    )
            );
        }
    }
}

/* ================================================================
   LIMPIAR RESPUESTA PARA VOZ
================================================================ */

function limpiarRespuestaMarquinhos(texto) {

    if (typeof texto !== 'string') {
        return '';
    }

    let respuesta =
        texto.trim();

    /* ------------------------------------------------------------
       QUITAR BLOQUES DE CÓDIGO
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /```[\s\S]*?```/g,
            ''
        );

    /* ------------------------------------------------------------
       QUITAR ENCABEZADOS MARKDOWN
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /^\s*#{1,6}\s*/gm,
            ''
        );

    /* ------------------------------------------------------------
       QUITAR NEGRITAS / CURSIVAS
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /\*\*\*(.*?)\*\*\*/g,
            '$1'
        );

    respuesta =
        respuesta.replace(
            /\*\*(.*?)\*\*/g,
            '$1'
        );

    respuesta =
        respuesta.replace(
            /\*(.*?)\*/g,
            '$1'
        );

    respuesta =
        respuesta.replace(
            /__(.*?)__/g,
            '$1'
        );

    respuesta =
        respuesta.replace(
            /_(.*?)_/g,
            '$1'
        );

    /* ------------------------------------------------------------
       QUITAR LISTAS
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /^\s*[-*+]\s+/gm,
            ''
        );

    /* ------------------------------------------------------------
       QUITAR CÓDIGO INLINE
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /`([^`]+)`/g,
            '$1'
        );

    /* ------------------------------------------------------------
       QUITAR SÍMBOLOS DECORATIVOS AISLADOS
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /^\s*[*#_~•◈✦🔴]+\s*/gm,
            ''
        );

    /* ------------------------------------------------------------
       EVITAR VARIOS PÁRRAFOS
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /\r?\n+/g,
            ' '
        );

    /* ------------------------------------------------------------
       LIMPIAR ESPACIOS
    ------------------------------------------------------------ */

    respuesta =
        respuesta.replace(
            /\s{2,}/g,
            ' '
        );

    return respuesta.trim();
}

/* ================================================================
   GOOGLE CLOUD TEXT-TO-SPEECH
================================================================ */

async function generarAudioGoogle(texto) {

    if (!GOOGLE_TTS_API_KEY) {

        console.warn(
            '  ⚠️ Google TTS no configurado'
        );

        return null;
    }

    try {

        const response =
            await axios.post(
                `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
                {
                    input: {
                        text: texto
                    },

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
                    timeout:
                        TIMEOUTS.GOOGLE_TTS,

                    headers: {
                        'Content-Type':
                            'application/json'
                    }
                }
            );

        const audioContent =
            response.data?.audioContent;

        if (!audioContent) {
            throw new Error(
                'Sin contenido de audio'
            );
        }

        const audioBuffer =
            Buffer.from(
                audioContent,
                'base64'
            );

        console.log(
            `  ✅ Google TTS: ${(audioBuffer.length / 1024).toFixed(1)}KB`
        );

        return audioBuffer;

    } catch (error) {

        console.error(
            `  ❌ Google TTS falló: ${error.message}`
        );

        return null;
    }
}

/* ================================================================
   ELEVENLABS TEXT-TO-SPEECH
================================================================ */

async function generarAudioElevenLabs(texto) {

    const ELEVEN_API_KEY =
        process.env.ELEVENLABS_API_KEY;

    if (!ELEVEN_API_KEY) {

        console.warn(
            '  ⚠️ ElevenLabs no configurado'
        );

        return null;
    }

    try {

        const response =
            await axios.post(
                'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',

                {
                    text: texto
                },

                {
                    headers: {
                        'xi-api-key':
                            ELEVEN_API_KEY,

                        'Content-Type':
                            'application/json'
                    },

                    responseType:
                        'arraybuffer',

                    timeout:
                        TIMEOUTS.ELEVEN_TTS
                }
            );

        const audioBuffer =
            Buffer.from(response.data);

        console.log(
            `  ✅ ElevenLabs TTS: ${(audioBuffer.length / 1024).toFixed(1)}KB`
        );

        return audioBuffer;

    } catch (error) {

        console.error(
            `  ❌ ElevenLabs falló: ${error.message}`
        );

        return null;
    }
}

/* ================================================================
   RUTA PRINCIPAL
   POST /chat
================================================================ */

router.post(
    '/chat',
    autenticar,
    async (req, res) => {

        const timestamp =
            Date.now();

        const inputPath =
            path.join(
                os.tmpdir(),
                `voice_input_${timestamp}.webm`
            );

        const outputPath =
            path.join(
                os.tmpdir(),
                `voice_output_${timestamp}.mp3`
            );

        const limpiarTemporales = () => {

            try {

                if (
                    fs.existsSync(inputPath)
                ) {
                    fs.unlinkSync(inputPath);
                }

                if (
                    fs.existsSync(outputPath)
                ) {
                    fs.unlinkSync(outputPath);
                }

            } catch (e) {
                /* silencioso */
            }
        };

        try {

            /* ====================================================
               VALIDAR CONFIGURACIÓN
            ==================================================== */

            if (
                !NVIDIA_API_KEY ||
                !GROQ_API_KEY
            ) {

                return res.status(500).json({
                    success: false,
                    error:
                        'Servidor no configurado (faltan NVIDIA_API_KEY o GROQ_API_KEY)'
                });
            }

            const {
                audio_url,
                audioUrl,
                history = []
            } =
                req.body || {};

            const urlAudio =
                audio_url ||
                audioUrl;

            if (
                !urlAudio ||
                typeof urlAudio !== 'string' ||
                !urlAudio.startsWith('http')
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'audioUrl inválido o no proporcionado'
                });
            }

            console.log(
                `\n🎙️ [${'='.repeat(30)}] Marquinhos Voice Chat\n`
            );

            console.log(
                `📝 ID Solicitud: ${timestamp}`
            );

            /* ====================================================
               PASO 1
               DESCARGAR AUDIO
            ==================================================== */

            console.log(
                '\n📥 PASO 1: Descargando audio del usuario'
            );

            await llamadaConReintentos(
                async () => {

                    const audioResponse =
                        await axios.get(
                            urlAudio,
                            {
                                responseType:
                                    'arraybuffer',

                                timeout:
                                    TIMEOUTS.DOWNLOAD_AUDIO,

                                maxContentLength:
                                    50 * 1024 * 1024
                            }
                        );

                    const inputBuffer =
                        Buffer.from(
                            audioResponse.data
                        );

                    if (
                        !inputBuffer.length
                    ) {
                        throw new Error(
                            'Buffer vacío'
                        );
                    }

                    fs.writeFileSync(
                        inputPath,
                        inputBuffer
                    );

                    console.log(
                        `  ✅ Descargado: ${(inputBuffer.length / 1024).toFixed(1)}KB`
                    );

                },
                'Descargar audio',
                2
            );

            /* ====================================================
               PASO 2
               TRANSCRIBIR
            ==================================================== */

            console.log(
                '\n🎤 PASO 2: Transcribiendo con Groq Whisper'
            );

            let transcripcion = '';

            await llamadaConReintentos(
                async () => {

                    const formData =
                        new FormData();

                    formData.append(
                        'file',
                        fs.createReadStream(
                            inputPath
                        )
                    );

                    formData.append(
                        'model',
                        'whisper-large-v3'
                    );

                    formData.append(
                        'language',
                        'es'
                    );

                    const whisperResponse =
                        await axios.post(
                            'https://api.groq.com/openai/v1/audio/transcriptions',

                            formData,

                            {
                                headers: {
                                    ...formData.getHeaders(),

                                    'Authorization':
                                        'Bearer ' +
                                        GROQ_API_KEY
                                },

                                timeout:
                                    TIMEOUTS.GROQ_WHISPER
                            }
                        );

                    transcripcion =
                        whisperResponse
                            .data
                            ?.text
                            ?.trim() || '';

                    if (
                        !transcripcion
                    ) {
                        throw new Error(
                            'Transcripción vacía'
                        );
                    }

                    console.log(
                        `  ✅ "${transcripcion.substring(0, 100)}${transcripcion.length > 100 ? '...' : ''}"`
                    );

                },
                'Groq Whisper',
                2
            );

            if (!transcripcion) {

                limpiarTemporales();

                return res.json({
                    success: true,
                    transcripcion: '',
                    reply:
                        'No escuché nada. ¿Puedes repetir?',
                    audio_url: null
                });
            }

            /* ====================================================
               PASO 3
               GENERAR RESPUESTA
            ==================================================== */

            console.log(
                '\n🧠 PASO 3: Generando respuesta de Marquinhos'
            );

            let respuestaTexto = '';

            await llamadaConReintentos(
                async () => {

                    let historialSeguro = [];

                    if (
                        Array.isArray(history)
                    ) {

                        historialSeguro =
                            history
                                .filter(
                                    item =>
                                        item &&
                                        typeof item === 'object' &&
                                        (
                                            item.role === 'user' ||
                                            item.role === 'assistant'
                                        ) &&
                                        typeof item.content === 'string' &&
                                        item.content.trim()
                                )
                                .slice(-6)
                                .map(
                                    item => ({
                                        role:
                                            item.role,

                                        content:
                                            item.content
                                                .trim()
                                                .slice(0, 3000)
                                    })
                                );
                    }

                    const payload = {

                        model:
                            'moonshotai/kimi-k3',

                        messages: [

                            {
                                role:
                                    'system',

                                content:
                                    SYSTEM_PROMPT
                            },

                            ...historialSeguro,

                            {
                                role:
                                    'user',

                                content:
                                    transcripcion
                            }

                        ],

                        /*
                         * Respuestas cortas.
                         */
                        max_tokens:
                            180,

                        /*
                         * Menor temperatura para
                         * respuestas más consistentes.
                         */
                        temperature:
                            0.5,

                        stream:
                            false
                    };

                    const nvidiaResponse =
                        await axios.post(
                            'https://integrate.api.nvidia.com/v1/chat/completions',

                            payload,

                            {
                                headers: {
                                    'Authorization':
                                        'Bearer ' +
                                        NVIDIA_API_KEY,

                                    'Content-Type':
                                        'application/json'
                                },

                                timeout:
                                    TIMEOUTS.NVIDIA_LLM
                            }
                        );

                    const respuestaGenerada =
                        nvidiaResponse
                            .data
                            ?.choices?.[0]
                            ?.message
                            ?.content
                            ?.trim() || '';

                    if (
                        !respuestaGenerada
                    ) {
                        throw new Error(
                            'NVIDIA no devolvió contenido'
                        );
                    }

                    /*
                     * Limpiamos la respuesta antes
                     * de enviarla al TTS.
                     */
                    respuestaTexto =
                        limpiarRespuestaMarquinhos(
                            respuestaGenerada
                        );

                    if (
                        !respuestaTexto
                    ) {
                        throw new Error(
                            'La respuesta quedó vacía después de limpiarla'
                        );
                    }

                    console.log(
                        `  ✅ "${respuestaTexto.substring(0, 120)}${respuestaTexto.length > 120 ? '...' : ''}"`
                    );

                },
                'NVIDIA Kimi K3',
                2
            );

            /* ====================================================
               PASO 4
               TEXT TO SPEECH
            ==================================================== */

            console.log(
                '\n🔊 PASO 4: Generando audio'
            );

            let audioBuffer = null;

            /* ----------------------------------------------------
               GOOGLE PRIMARIO
            ---------------------------------------------------- */

            console.log(
                '  → Intentando Google Cloud TTS...'
            );

            audioBuffer =
                await generarAudioGoogle(
                    respuestaTexto
                );

            /* ----------------------------------------------------
               ELEVENLABS FALLBACK
            ---------------------------------------------------- */

            if (!audioBuffer) {

                console.log(
                    '  → Intentando ElevenLabs TTS...'
                );

                audioBuffer =
                    await generarAudioElevenLabs(
                        respuestaTexto
                    );
            }

            /* ----------------------------------------------------
               SIN AUDIO
            ---------------------------------------------------- */

            if (!audioBuffer) {

                console.warn(
                    '  ⚠️ TTS completamente fallido - continuando sin audio'
                );

            } else {

                fs.writeFileSync(
                    outputPath,
                    audioBuffer
                );
            }

            /* ====================================================
               PASO 5
               SUBIR AUDIO A SUPABASE
            ==================================================== */

            let audioRespuestaUrl = null;

            if (audioBuffer) {

                console.log(
                    '\n📤 PASO 5: Subiendo a Supabase Storage'
                );

                try {

                    const storagePath =
                        `bot-responses/${req.user.id}/${Date.now()}.mp3`;

                    const {
                        error: uploadError
                    } =
                        await supabaseAdmin
                            .storage
                            .from('chat-audio')
                            .upload(
                                storagePath,
                                audioBuffer,
                                {
                                    contentType:
                                        'audio/mpeg',

                                    cacheControl:
                                        '3600',

                                    upsert:
                                        false
                                }
                            );

                    if (!uploadError) {

                        const {
                            data: signedData,
                            error: signedError
                        } =
                            await supabaseAdmin
                                .storage
                                .from('chat-audio')
                                .createSignedUrl(
                                    storagePath,
                                    3600
                                );

                        if (
                            !signedError &&
                            signedData?.signedUrl
                        ) {

                            audioRespuestaUrl =
                                signedData.signedUrl;

                            console.log(
                                '  ✅ URL firmada creada'
                            );
                        }

                    } else {

                        console.error(
                            `  ❌ Error subiendo: ${uploadError.message}`
                        );
                    }

                    /* --------------------------------------------
                       GUARDAR HISTORIAL
                    -------------------------------------------- */

                    try {

                        await supabaseAdmin
                            .from('ai_voice_chats')
                            .insert({

                                usuario_id:
                                    req.user.id,

                                transcripcion:
                                    transcripcion,

                                respuesta:
                                    respuestaTexto,

                                audio_usuario_url:
                                    urlAudio,

                                audio_bot_url:
                                    audioRespuestaUrl
                                        ? `bucket://chat-audio/${storagePath}`
                                        : null
                            });

                        console.log(
                            '  ✅ Historial guardado en Supabase'
                        );

                    } catch (e) {

                        console.warn(
                            `  ⚠️ Historial no guardado: ${e.message}`
                        );
                    }

                } catch (uploadCatch) {

                    console.error(
                        `  ⚠️ Error en subida: ${uploadCatch.message}`
                    );
                }
            }

            /* ====================================================
               LIMPIEZA
            ==================================================== */

            limpiarTemporales();

            const duracion =
                Date.now() - timestamp;

            console.log(
                `\n✅ Procesamiento completado en ${duracion}ms`
            );

            console.log(
                `${'='.repeat(40)}\n`
            );

            /* ====================================================
               RESPUESTA FINAL
            ==================================================== */

            return res.json({

                success:
                    true,

                transcripcion:
                    transcripcion,

                reply:
                    respuestaTexto,

                audio_url:
                    audioRespuestaUrl,

                duracion_ms:
                    duracion,

                tieneAudio:
                    Boolean(audioBuffer)
            });

        } catch (error) {

            console.error(
                `\n❌ ERROR CRÍTICO: ${error.message}\n`
            );

            limpiarTemporales();

            return res.status(500).json({

                success:
                    false,

                error:
                    'Error procesando voz',

                detalles:
                    process.env.NODE_ENV === 'development'
                        ? error.message
                        : undefined
            });
        }
    }
);

module.exports = router;