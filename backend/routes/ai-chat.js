/* ================================================================
   routes/ai-chat.js - CHAT DE TEXTO CON MARQUINHOS + ESTUDIO IA (v2.5)
   PRODUCCIÓN - GROQ + OpenAI (Edición de Imagen / TTS)
   ================================================================
   Endpoint: POST /api/ai/chat
   Modelo:   Groq (openai/gpt-oss-120b por defecto)

   v2.5: agrega endpoints de Estudio IA:
     - POST /editar-imagen (OpenAI GPT Image 1)
     - POST /tts (OpenAI Text to Speech)
================================================================ */

'use strict';

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const FormData = require('form-data');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 30000;

const MAX_TOKENS_RESPUESTA = 180;
const MAX_CARACTERES_RESPUESTA = 500;

/* ================================================================
   R2 (Cloudflare)
================================================================ */

const R2_BUCKET = process.env.R2_BUCKET || 'csariels-media';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

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
            console.warn('⚠️ Token inválido o sesión expirada');
            return res.status(401).json({ success: false, error: 'Sesión inválida o expirada. Inicia sesión nuevamente.' });
        }

        req.user = user;
        return next();

    } catch (error) {
        console.error('❌ Error autenticando chat:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   PERSONALIDAD DE MARQUINHOS
================================================================ */

const SYSTEM_PROMPT = `
Eres Marquinhos, el asistente oficial del ecosistema Sariel's.

Tu forma de conversar es profesional, educada, cercana y natural.

REGLA MÁS IMPORTANTE (LÍMITE ABSOLUTO):
Nunca escribas más de 3 frases o 60 palabras por respuesta.
Si necesitas explicar algo largo, divídelo en pasos y espera
la respuesta del usuario antes de continuar con el siguiente paso.
Una respuesta corta y útil es siempre preferible a una explicación larga.

ESTILO DE RESPUESTA:

1. Responde primero exactamente a la pregunta que acaba de hacer el usuario.

2. Mantén la respuesta breve y clara.
Normalmente utiliza entre 1 y 3 frases.

3. Si el usuario está realizando un procedimiento, explica solamente el paso que corresponde en ese momento.

4. Después espera la respuesta del usuario antes de continuar con el siguiente paso, cuando sea necesario.

5. Si una explicación realmente requiere varios pasos, divídela en el tiempo, no en una sola respuesta.

6. No repitas información que el usuario ya conoce.

7. No escribas respuestas largas solamente para demostrar conocimiento.

8. Si el usuario pregunta algo sencillo, responde de manera sencilla.

9. Si el usuario pide una explicación detallada, entonces puedes ampliar la explicación, pero nunca más de 6 frases.

10. Utiliza español mexicano neutro, natural y profesional.

FORMATO OBLIGATORIO:

No utilices Markdown.
No utilices ningún tipo de símbolo decorativo.

NO uses:
*
**
#
###
-
_
>
|
---
===

No uses títulos.
No uses encabezados.
No uses listas con guiones.
No uses listas numeradas.
No uses negritas.
No uses cursivas.
No uses bloques de código.
No uses citas.
No uses separadores.
No uses tablas.

Escribe como una persona conversando normalmente en un chat.

Puedes utilizar signos normales de puntuación como:
¿ ? ¡ ! , . : ;

No utilices emojis salvo que sean realmente necesarios.

PERSONALIDAD:

Sé amable, paciente y profesional.
No seas excesivamente formal.
No seas frío.
No seas condescendiente.
No trates al usuario como si no entendiera nada.

Si el usuario está teniendo un problema, ayúdalo con calma y empieza por el siguiente paso más útil.

Si el usuario solamente necesita una respuesta, no conviertas la respuesta en un tutorial.

CONOCIMIENTO DEL ECOSISTEMA:

Sariel's es un ecosistema Web3 relacionado con Polygon.

Los Domos son productos físicos del ecosistema.

Los Domos pueden relacionarse con recompensas y Es.stoks.

Es.stoks son tokens del ecosistema.

12 Es.stoks corresponden al objetivo de 1 NFT Domo.

Puedes orientar sobre Domos, Es.stoks, NFT, Polygon, LIVE, canales, mensajes y funciones generales del ecosistema.

REGLAS DE SEGURIDAD Y PRECISIÓN:

No inventes información.
No inventes precios.
No inventes saldos.
No inventes transacciones.
No inventes datos personales.
No inventes funciones que no conozcas.
No afirmes que ejecutaste una operación si realmente no tienes acceso para ejecutarla.
Si no conoces una información, dilo claramente.
Si una función depende de la aplicación, explica solamente lo que sabes.

OBJETIVO:

La conversación debe sentirse como hablar con un asistente humano profesional.

Marquinhos debe resolver la conversación poco a poco, un paso a la vez.

No debe intentar resolver toda la vida del usuario en una sola respuesta.
`.trim();

/* ================================================================
   HELPERS DE MARQUINHOS
================================================================ */

function limpiarHistorial(history) {
    if (!Array.isArray(history)) return [];
    return history
        .filter(item =>
            item && typeof item === 'object' &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' && item.content.trim()
        )
        .slice(-8)
        .map(item => ({
            role: item.role,
            content: item.content.trim().slice(0, 4000)
        }));
}

function limpiarFormatoMarquinhos(texto) {
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
    respuesta = respuesta.replace(/[ \t]{2,}/g, ' ');
    respuesta = respuesta.replace(/\r?\n{2,}/g, ' ');
    respuesta = respuesta.replace(/\r?\n+/g, ' ');
    respuesta = respuesta.replace(/\s{2,}/g, ' ');
    return respuesta.trim();
}

function recortarRespuesta(texto, maximo) {
    if (typeof texto !== 'string') return '';
    if (texto.length <= maximo) return texto;
    const recorte = texto.slice(0, maximo);
    const ultimoEspacio = recorte.lastIndexOf(' ');
    const corte = ultimoEspacio > maximo * 0.6 ? recorte.slice(0, ultimoEspacio) : recorte;
    return corte.trim() + '…';
}

function extraerRespuesta(data) {
    const respuesta = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
    return typeof respuesta === 'string' ? respuesta.trim() : '';
}

/* ================================================================
   POST /chat (Marquinhos)
================================================================ */

router.post(
    '/chat',
    autenticar,
    async (req, res) => {
        const inicio = Date.now();
        try {
            if (!GROQ_API_KEY) {
                console.error('❌ GROQ_API_KEY no está configurada');
                return res.status(500).json({ success: false, error: 'Marquinhos no está configurado en el servidor.' });
            }

            const { message, context = 'chat_sariels', history = [] } = req.body || {};

            if (typeof message !== 'string' || !message.trim()) {
                return res.status(400).json({ success: false, error: 'Mensaje vacío o inválido.' });
            }

            const mensajeLimpio = message.trim().slice(0, 4000);

            console.log('💬 Marquinhos recibió mensaje:', {
                userId: req.user && req.user.id ? req.user.id : null,
                context, chars: mensajeLimpio.length,
                historyItems: Array.isArray(history) ? history.length : 0
            });

            const historialSeguro = limpiarHistorial(history);

            const payload = {
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...historialSeguro,
                    { role: 'user', content: mensajeLimpio }
                ],
                max_tokens: MAX_TOKENS_RESPUESTA,
                temperature: 0.5,
                stream: false
            };

            console.log(`⚡ Enviando solicitud a GROQ (${GROQ_MODEL})...`);

            const groqResponse = await axios.post(GROQ_ENDPOINT, payload, {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: GROQ_TIMEOUT_MS,
                validateStatus: () => true
            });

            const status = groqResponse.status;
            const responseData = groqResponse.data;

            if (status < 200 || status >= 300) {
                console.error('❌ GROQ respondió con error:', { status, model: GROQ_MODEL, data: responseData });
                let mensajeError = 'El servicio de Marquinhos no respondió correctamente.';
                if (responseData && responseData.error && responseData.error.message) {
                    mensajeError = responseData.error.message;
                }
                return res.status(502).json({ success: false, error: mensajeError });
            }

            const respuestaOriginal = extraerRespuesta(responseData);
            if (!respuestaOriginal) {
                console.error('❌ GROQ respondió sin contenido:', JSON.stringify(responseData));
                return res.status(502).json({ success: false, error: 'Marquinhos recibió una respuesta vacía del servicio de IA.' });
            }

            let respuestaTexto = limpiarFormatoMarquinhos(respuestaOriginal);
            if (!respuestaTexto) {
                return res.status(502).json({ success: false, error: 'Marquinhos generó una respuesta vacía.' });
            }
            respuestaTexto = recortarRespuesta(respuestaTexto, MAX_CARACTERES_RESPUESTA);

            if (supabaseAdmin && req.user) {
                const origenChat = (req.body && req.body.modo === 'texto') ? 'texto' : 'voice_chat';
                supabaseAdmin.from('ai_voice_chats').insert({
                    usuario_id: req.user.id,
                    transcripcion: mensajeLimpio,
                    respuesta: respuestaTexto,
                    origen: origenChat
                }).then(({ error }) => {
                    if (error) console.warn('⚠️ No se guardó chat:', error.message);
                });
            }

            const duracion = Date.now() - inicio;
            console.log('✅ Marquinhos respondió:', { ms: duracion, chars: respuestaTexto.length });

            return res.status(200).json({ success: true, reply: respuestaTexto });

        } catch (error) {
            const duracion = Date.now() - inicio;
            console.error('❌ Error en /api/ai/chat:', {
                name: error.name, message: error.message, code: error.code,
                status: error.response ? error.response.status : null, duration: duracion
            });
            if (error.response && error.response.data) {
                console.error('❌ Detalle GROQ:', JSON.stringify(error.response.data, null, 2));
            }
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                return res.status(504).json({ success: false, error: 'Marquinhos tardó demasiado en responder. Intenta nuevamente.' });
            }
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
                return res.status(502).json({ success: false, error: 'No fue posible conectar con el servicio de Marquinhos.' });
            }
            return res.status(500).json({
                success: false,
                error: 'Error procesando el mensaje de Marquinhos.',
                detalles: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

/* ================================================================
   POST /editar-imagen (OpenAI GPT Image 1)
   Requiere: OPENAI_API_KEY, R2 configurado
================================================================ */

router.post('/editar-imagen', autenticar, async (req, res) => {
    const inicio = Date.now();
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ success: false, error: 'OpenAI no configurado en el servidor.' });
        }
        if (!R2_PUBLIC_URL) {
            return res.status(500).json({ success: false, error: 'R2 no configurado en el servidor.' });
        }

        const { imagen_url, prompt } = req.body || {};

        if (!imagen_url || typeof imagen_url !== 'string') {
            return res.status(400).json({ success: false, error: 'Falta imagen_url.' });
        }
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El prompt debe tener al menos 3 caracteres.' });
        }
        if (prompt.length > 1000) {
            return res.status(400).json({ success: false, error: 'El prompt no puede exceder 1000 caracteres.' });
        }

        // Verificar cuota (3 gratis / 50 Pro al mes)
        let total = 0;
        let esPro = false;
        try {
            const { data: countData } = await supabaseAdmin.rpc('contar_ediciones_ia_mes', { p_usuario_id: req.user.id });
            total = Number(countData) || 0;

            const { data: memData } = await supabaseAdmin.rpc('obtener_membresia_usuario', { p_usuario_id: req.user.id });
            const m = Array.isArray(memData) ? memData[0] : memData;
            esPro = Boolean(m && m.activa && m.vence_at && new Date(m.vence_at) > new Date());
        } catch (e) {
            console.error('⚠️ Error consultando cuota IA:', e.message);
            // Si falla la cuota, seguimos pero con límite gratuito conservador
            total = 0;
            esPro = false;
        }

        const limite = esPro ? 50 : 3;
        if (total >= limite) {
            return res.status(429).json({
                success: false,
                error: 'limite_ia_alcanzado',
                mensaje: `Llegaste a tu límite de ${limite} ediciones IA este mes.`,
                limite, usadas: total, disponibles: 0
            });
        }

        // Descargar imagen original
        let bufferOriginal;
        try {
            const imgResp = await axios.get(imagen_url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: 20 * 1024 * 1024
            });
            bufferOriginal = Buffer.from(imgResp.data);
        } catch (e) {
            console.error('❌ No se pudo descargar la imagen original:', e.message);
            return res.status(400).json({ success: false, error: 'No se pudo descargar la imagen original.' });
        }

        // Preparar FormData
        const formData = new FormData();
        formData.append('model', 'gpt-image-1');
        formData.append('image', bufferOriginal, { filename: 'original.png', contentType: 'image/png' });
        formData.append('prompt', prompt.trim());
        formData.append('n', '1');
        formData.append('size', '1024x1024');

        // Llamar a OpenAI
        let respuestaOpenAI;
        try {
            respuestaOpenAI = await axios.post(
                'https://api.openai.com/v1/images/edits',
                formData,
                {
                    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, ...formData.getHeaders() },
                    timeout: 60000,
                    maxContentLength: 50 * 1024 * 1024
                }
            );
        } catch (e) {
            const detalle = e.response && e.response.data ? JSON.stringify(e.response.data) : e.message;
            console.error('❌ Error OpenAI editar-imagen:', detalle);
            return res.status(502).json({ success: false, error: 'OpenAI no pudo procesar la imagen. Intenta con otro prompt.' });
        }

        const primer = respuestaOpenAI.data && respuestaOpenAI.data.data && respuestaOpenAI.data.data[0];
        if (!primer || !primer.b64_json) {
            return res.status(502).json({ success: false, error: 'OpenAI no devolvió una imagen válida.' });
        }

        const bufferResultado = Buffer.from(primer.b64_json, 'base64');
        const nombreArchivo = `ia/imagenes/${req.user.id}/${Date.now()}.png`;

        // Subir a R2
        try {
            await s3.send(new PutObjectCommand({
                Bucket: R2_BUCKET,
                Key: nombreArchivo,
                Body: bufferResultado,
                ContentType: 'image/png',
                CacheControl: 'public, max-age=3600'
            }));
        } catch (e) {
            console.error('❌ Error subiendo a R2:', e.message);
            return res.status(500).json({ success: false, error: 'No se pudo guardar el resultado.' });
        }

        const urlFinal = `${R2_PUBLIC_URL}/${nombreArchivo}`;

        // Registrar en ai_jobs
        try {
            await supabaseAdmin.from('ai_jobs').insert({
                usuario_id: req.user.id,
                tipo: 'editar_imagen',
                prompt: prompt.trim(),
                url_origen: imagen_url,
                url_resultado: urlFinal
            });
        } catch (e) {
            console.warn('⚠️ No se registró job de IA:', e.message);
        }

        const duracion = Date.now() - inicio;
        console.log('✅ Imagen editada:', { ms: duracion, url: urlFinal });

        return res.json({
            success: true,
            url: urlFinal,
            cuota_restante: Math.max(0, limite - total - 1)
        });

    } catch (error) {
        console.error('❌ Error /editar-imagen:', error.message);
        return res.status(500).json({ success: false, error: 'Error al editar la imagen.' });
    }
});

/* ================================================================
   POST /tts (OpenAI Text-to-Speech)
================================================================ */

router.post('/tts', autenticar, async (req, res) => {
    const inicio = Date.now();
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ success: false, error: 'OpenAI no configurado en el servidor.' });
        }
        if (!R2_PUBLIC_URL) {
            return res.status(500).json({ success: false, error: 'R2 no configurado en el servidor.' });
        }

        const { texto, voz = 'alloy' } = req.body || {};
        const vocesValidas = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

        if (!texto || typeof texto !== 'string' || !texto.trim()) {
            return res.status(400).json({ success: false, error: 'Falta el texto.' });
        }
        if (texto.length > 4000) {
            return res.status(400).json({ success: false, error: 'El texto no puede exceder 4000 caracteres.' });
        }
        if (!vocesValidas.includes(voz)) {
            return res.status(400).json({ success: false, error: 'Voz no válida.' });
        }

        let respuestaAudio;
        try {
            respuestaAudio = await axios.post(
                'https://api.openai.com/v1/audio/speech',
                {
                    model: 'tts-1',
                    input: texto.trim(),
                    voice: voz,
                    response_format: 'mp3'
                },
                {
                    headers: {
                        Authorization: `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    maxContentLength: 20 * 1024 * 1024
                }
            );
        } catch (e) {
            const detalle = e.response && e.response.data
                ? Buffer.from(e.response.data).toString('utf8').slice(0, 200)
                : e.message;
            console.error('❌ Error OpenAI TTS:', detalle);
            return res.status(502).json({ success: false, error: 'OpenAI no pudo generar la voz.' });
        }

        const bufferAudio = Buffer.from(respuestaAudio.data);
        const nombreArchivo = `ia/voces/${req.user.id}/${Date.now()}.mp3`;

        try {
            await s3.send(new PutObjectCommand({
                Bucket: R2_BUCKET,
                Key: nombreArchivo,
                Body: bufferAudio,
                ContentType: 'audio/mpeg',
                CacheControl: 'public, max-age=3600'
            }));
        } catch (e) {
            console.error('❌ Error subiendo audio a R2:', e.message);
            return res.status(500).json({ success: false, error: 'No se pudo guardar el audio.' });
        }

        const urlFinal = `${R2_PUBLIC_URL}/${nombreArchivo}`;
        const duracion = Date.now() - inicio;

        console.log('✅ Voz generada:', { ms: duracion, url: urlFinal });

        return res.json({ success: true, url: urlFinal });

    } catch (error) {
        console.error('❌ Error /tts:', error.message);
        return res.status(500).json({ success: false, error: 'Error al generar la voz.' });
    }
});

module.exports = router;