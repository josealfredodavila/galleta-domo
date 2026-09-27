/* ================================================================
   routes/ai-chat.js - CHAT DE TEXTO CON MARQUINHOS
   PRODUCCIÓN - GROQ
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GROQ_ENDPOINT =
    'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODEL =
    process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const GROQ_TIMEOUT_MS = 30000;

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

        if (!supabaseAdmin) {
            console.error('❌ Supabase Admin no configurado');

            return res.status(500).json({
                success: false,
                error: 'Supabase no está configurado correctamente'
            });
        }

        const {
            data: { user },
            error
        } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            console.warn(
                '⚠️ Token inválido o sesión expirada'
            );

            return res.status(401).json({
                success: false,
                error:
                    'Sesión inválida o expirada. Inicia sesión nuevamente.'
            });
        }

        req.user = user;

        return next();

    } catch (error) {
        console.error(
            '❌ Error autenticando chat:',
            error
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

const SYSTEM_PROMPT = `
Eres Marquinhos, el asistente oficial del ecosistema Sariel's.

Tu forma de conversar es profesional, educada, cercana y natural.

IMPORTANTE:
No hables como un ingeniero sénior.
No conviertas una pregunta sencilla en una explicación técnica extensa.
No des una guía completa si el usuario solamente pidió el siguiente paso.
Conversa con la persona de manera progresiva.

ESTILO DE RESPUESTA:

1. Responde primero exactamente a la pregunta que acaba de hacer el usuario.

2. Mantén la respuesta breve y clara.
Normalmente utiliza entre 1 y 4 frases.

3. Si el usuario está realizando un procedimiento, explica solamente el paso que corresponde en ese momento.

4. Después espera la respuesta del usuario antes de continuar con el siguiente paso, cuando sea necesario.

5. Si una explicación realmente requiere varios pasos, puedes utilizar una lista numerada sencilla, pero solamente cuando sea necesario.

6. No repitas información que el usuario ya conoce.

7. No escribas respuestas largas solamente para demostrar conocimiento.

8. Si el usuario pregunta algo sencillo, responde de manera sencilla.

9. Si el usuario pide una explicación detallada, entonces puedes ampliar la explicación.

10. Utiliza español mexicano neutro, natural y profesional.

FORMATO:

No utilices Markdown.

No utilices:
*
**
#
###
-
_
No uses títulos decorativos.
No uses encabezados.
No uses listas con guiones.
No uses negritas.
No uses cursivas.
No uses bloques de código.

Escribe como una persona conversando normalmente en un chat.

No agregues símbolos decorativos al principio o al final de las respuestas.

Puedes utilizar signos normales de puntuación como:
¿ ? ¡ ! , . : ;

No utilices símbolos como * # _ ~ para decorar el mensaje.

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

Marquinhos debe resolver la conversación poco a poco.

No debe intentar resolver toda la vida del usuario en una sola respuesta.
`.trim();

/* ================================================================
   LIMPIAR HISTORIAL
================================================================ */

function limpiarHistorial(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .filter(item =>
            item &&
            typeof item === 'object' &&
            (
                item.role === 'user' ||
                item.role === 'assistant'
            ) &&
            typeof item.content === 'string' &&
            item.content.trim()
        )
        .slice(-8)
        .map(item => ({
            role: item.role,
            content: item.content
                .trim()
                .slice(0, 4000)
        }));
}

/* ================================================================
   LIMPIAR FORMATO DE MARQUINHOS
================================================================ */

function limpiarFormatoMarquinhos(texto) {
    if (typeof texto !== 'string') {
        return '';
    }

    let respuesta = texto.trim();

    /* ------------------------------------------------------------
       QUITAR BLOQUES DE CÓDIGO
    ------------------------------------------------------------ */

    respuesta = respuesta.replace(/```[\s\S]*?```/g, '');

    /* ------------------------------------------------------------
       QUITAR MARKDOWN DE ENCABEZADOS
    ------------------------------------------------------------ */

    respuesta = respuesta.replace(
        /^\s{0,3}#{1,6}\s*/gm,
        ''
    );

    /* ------------------------------------------------------------
       QUITAR NEGRITAS / CURSIVAS MARKDOWN
    ------------------------------------------------------------ */

    respuesta = respuesta.replace(
        /\*\*\*(.*?)\*\*\*/g,
        '$1'
    );

    respuesta = respuesta.replace(
        /\*\*(.*?)\*\*/g,
        '$1'
    );

    respuesta = respuesta.replace(
        /\*(.*?)\*/g,
        '$1'
    );

    respuesta = respuesta.replace(
        /__(.*?)__/g,
        '$1'
    );

    respuesta = respuesta.replace(
        /_(.*?)_/g,
        '$1'
    );

    /* ------------------------------------------------------------
       QUITAR LISTAS CON GUIONES O ASTERISCOS
    ------------------------------------------------------------ */

    respuesta = respuesta.replace(
        /^\s*[-*+]\s+/gm,
        ''
    );

    /* ------------------------------------------------------------
       QUITAR TILDES DE CÓDIGO
    ------------------------------------------------------------ */

    respuesta = respuesta.replace(
        /`([^`]+)`/g,
        '$1'
    );

    /* ------------------------------------------------------------
       QUITAR SÍMBOLOS DECORATIVOS AISLADOS
    ------------------------------------------------------------ */

    respuesta = respuesta.replace(
        /^\s*[*#_~]+\s*/gm,
        ''
    );

    respuesta = respuesta.replace(
        /\s+[*#_~]{2,}\s+/g,
        ' '
    );

    /* ------------------------------------------------------------
       LIMPIAR ESPACIOS
    ------------------------------------------------------------ */

    respuesta = respuesta.replace(
        /[ \t]{2,}/g,
        ' '
    );

    respuesta = respuesta.replace(
        /\n{3,}/g,
        '\n\n'
    );

    return respuesta.trim();
}

/* ================================================================
   EXTRAER RESPUESTA
================================================================ */

function extraerRespuesta(data) {
    const respuesta =
        data?.choices?.[0]?.message?.content;

    return typeof respuesta === 'string'
        ? respuesta.trim()
        : '';
}

/* ================================================================
   POST /chat
================================================================ */

router.post(
    '/chat',
    autenticar,
    async (req, res) => {

        const inicio = Date.now();

        try {

            /* ========================================================
               VALIDAR GROQ
            ======================================================== */

            if (!GROQ_API_KEY) {

                console.error(
                    '❌ GROQ_API_KEY no está configurada'
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'Marquinhos no está configurado en el servidor.'
                });
            }

            /* ========================================================
               VALIDAR BODY
            ======================================================== */

            const {
                message,
                context = 'chat_sariels',
                history = []
            } = req.body || {};

            if (
                typeof message !== 'string' ||
                !message.trim()
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'Mensaje vacío o inválido.'
                });
            }

            const mensajeLimpio =
                message
                    .trim()
                    .slice(0, 4000);

            console.log(
                '💬 Marquinhos recibió mensaje:',
                {
                    userId:
                        req.user?.id || null,
                    context,
                    chars:
                        mensajeLimpio.length
                }
            );

            /* ========================================================
               HISTORIAL
            ======================================================== */

            const historialSeguro =
                limpiarHistorial(history);

            /* ========================================================
               PAYLOAD GROQ
            ======================================================== */

            const payload = {

                model: GROQ_MODEL,

                messages: [

                    {
                        role: 'system',
                        content: SYSTEM_PROMPT
                    },

                    ...historialSeguro,

                    {
                        role: 'user',
                        content: mensajeLimpio
                    }

                ],

                /*
                 * Respuestas cortas.
                 * El prompt también controla la longitud.
                 */
                max_tokens: 280,

                /*
                 * Un poco menos de creatividad
                 * para mantener respuestas consistentes.
                 */
                temperature: 0.5,

                stream: false
            };

            console.log(
                `⚡ Enviando solicitud a GROQ (${GROQ_MODEL})...`
            );

            /* ========================================================
               GROQ
            ======================================================== */

            const groqResponse =
                await axios.post(
                    GROQ_ENDPOINT,
                    payload,
                    {
                        headers: {
                            Authorization:
                                `Bearer ${GROQ_API_KEY}`,

                            Accept:
                                'application/json',

                            'Content-Type':
                                'application/json'
                        },

                        timeout:
                            GROQ_TIMEOUT_MS,

                        validateStatus:
                            () => true
                    }
                );

            const status =
                groqResponse.status;

            const responseData =
                groqResponse.data;

            /* ========================================================
               ERROR GROQ
            ======================================================== */

            if (
                status < 200 ||
                status >= 300
            ) {

                console.error(
                    '❌ GROQ respondió con error:',
                    {
                        status,
                        data:
                            responseData
                    }
                );

                let mensajeError =
                    'El servicio de Marquinhos no respondió correctamente.';

                if (
                    responseData?.error?.message
                ) {
                    mensajeError =
                        responseData.error.message;
                }

                return res.status(502).json({
                    success: false,
                    error: mensajeError
                });
            }

            /* ========================================================
               EXTRAER RESPUESTA
            ======================================================== */

            const respuestaOriginal =
                extraerRespuesta(responseData);

            if (!respuestaOriginal) {

                console.error(
                    '❌ GROQ respondió sin contenido:',
                    JSON.stringify(responseData)
                );

                return res.status(502).json({
                    success: false,
                    error:
                        'Marquinhos recibió una respuesta vacía del servicio de IA.'
                });
            }

            /* ========================================================
               LIMPIAR FORMATO
            ======================================================== */

            const respuestaTexto =
                limpiarFormatoMarquinhos(
                    respuestaOriginal
                );

            if (!respuestaTexto) {

                return res.status(502).json({
                    success: false,
                    error:
                        'Marquinhos generó una respuesta vacía.'
                });
            }

            const duracion =
                Date.now() - inicio;

            console.log(
                '✅ Marquinhos respondió:',
                {
                    ms: duracion,
                    chars:
                        respuestaTexto.length
                }
            );

            /* ========================================================
               RESPUESTA FINAL
            ======================================================== */

            return res.status(200).json({

                success: true,

                reply:
                    respuestaTexto

            });

        } catch (error) {

            const duracion =
                Date.now() - inicio;

            console.error(
                '❌ Error en /api/ai/chat:',
                {
                    message:
                        error.message,

                    code:
                        error.code,

                    duration:
                        duracion
                }
            );

            if (error.response?.data) {

                console.error(
                    '❌ Detalle GROQ:',
                    JSON.stringify(
                        error.response.data,
                        null,
                        2
                    )
                );
            }

            /* ========================================================
               TIMEOUT
            ======================================================== */

            if (
                error.code ===
                    'ECONNABORTED' ||
                error.code ===
                    'ETIMEDOUT'
            ) {

                return res.status(504).json({
                    success: false,
                    error:
                        'Marquinhos tardó demasiado en responder. Intenta nuevamente.'
                });
            }

            /* ========================================================
               ERROR DE CONEXIÓN
            ======================================================== */

            if (
                error.code ===
                    'ENOTFOUND' ||
                error.code ===
                    'ECONNRESET' ||
                error.code ===
                    'ECONNREFUSED'
            ) {

                return res.status(502).json({
                    success: false,
                    error:
                        'No fue posible conectar con el servicio de Marquinhos.'
                });
            }

            /* ========================================================
               ERROR GENERAL
            ======================================================== */

            return res.status(500).json({
                success: false,
                error:
                    'Error procesando el mensaje de Marquinhos.'
            });
        }
    }
);

module.exports = router;