/* ================================================================
   routes/ai-chat.js - CHAT DE TEXTO CON MARQUINHOS
   PRODUCCIÓN - GROQ
   ================================================================
   Endpoint: POST /api/ai/chat
   Modelo:   Groq (openai/gpt-oss-120b por defecto)

   RESPONSABILIDADES:
   - Recibir el mensaje del usuario y opcionalmente el historial.
   - Construir el payload para Groq.
   - Limpiar el Markdown de la respuesta antes de devolverla.
   - Aplicar límite duro de longitud para evitar "biblias".
   - Loggear errores con suficiente detalle para diagnosticar.

   GARANTÍAS:
   - NO cambia la firma del endpoint.
   - NO cambia los códigos HTTP de respuesta.
   - Marcaquesinos responde en texto plano, sin Markdown.
================================================================ */

'use strict';

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

/*
 * Modelo por defecto.
 *
 * Verificado en producción el 28-sep-2026:
 *   openai/gpt-oss-120b responde correctamente en Groq.
 *
 * NOTA IMPORTANTE:
 *   NO cambiar el default a 'llama-3.3-70b-versatile'.
 *   Ese modelo fue retirado por Groq el 16-ago-2026 y devolvería
 *   'model does not exist'. gpt-oss-120b es el reemplazo recomendado
 *   y hoy funciona.
 */
const GROQ_MODEL =
    process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const GROQ_TIMEOUT_MS = 30000;

/*
 * Límites de longitud de la respuesta.
 * - max_tokens: límite de tokens en la llamada a Groq.
 * - MAX_CARACTERES_RESPUESTA: recorte duro en el backend para
 *   evitar respuestas tipo "biblia" aunque el modelo se pase.
 */
const MAX_TOKENS_RESPUESTA = 180;
const MAX_CARACTERES_RESPUESTA = 500;

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
   ================================================================
   Quita todo el Markdown residual que el modelo pueda generar
   aunque el prompt diga que no lo use.
   ================================================================ */

function limpiarFormatoMarquinhos(texto) {
    if (typeof texto !== 'string') {
        return '';
    }

    let respuesta = texto.trim();

    /* Bloques de código */
    respuesta = respuesta.replace(/```[\s\S]*?```/g, '');

    /* Encabezados */
    respuesta = respuesta.replace(/^\s{0,3}#{1,6}\s*/gm, '');

    /* Negritas / cursivas */
    respuesta = respuesta.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    respuesta = respuesta.replace(/\*\*(.*?)\*\*/g, '$1');
    respuesta = respuesta.replace(/\*(.*?)\*/g, '$1');
    respuesta = respuesta.replace(/___(.*?)___/g, '$1');
    respuesta = respuesta.replace(/__(.*?)__/g, '$1');
    respuesta = respuesta.replace(/_(.*?)_/g, '$1');

    /* Código inline */
    respuesta = respuesta.replace(/`([^`]+)`/g, '$1');

    /* Listas con guion, asterisco o signo más */
    respuesta = respuesta.replace(/^\s{0,3}[-*+]\s+/gm, '');

    /* Listas numeradas: 1. 2. 3. o 1) 2) 3) */
    respuesta = respuesta.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');

    /* Citas */
    respuesta = respuesta.replace(/^\s{0,3}>\s?/gm, '');

    /* Separadores horizontales: ---, ***, ___ */
    respuesta = respuesta.replace(/^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/gm, '');
    respuesta = respuesta.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');

    /* Tablas: líneas delimitadas por | */
    respuesta = respuesta.replace(/^\s*\|.*\|\s*$/gm, '');
    respuesta = respuesta.replace(/\|/g, ' ');

    /* Símbolos decorativos sueltos al inicio de línea */
    respuesta = respuesta.replace(
        /^\s*[*#_~•◈✦🔴🟡🟢🟣🔵🟠➤→»]+\s*/gm,
        ''
    );

    /* Símbolos dobles sueltos entre espacios */
    respuesta = respuesta.replace(/\s+[*#_~]{2,}\s+/g, ' ');

    /* Colapsar espacios y saltos */
    respuesta = respuesta.replace(/[ \t]{2,}/g, ' ');
    respuesta = respuesta.replace(/\r?\n{2,}/g, ' ');
    respuesta = respuesta.replace(/\r?\n+/g, ' ');
    respuesta = respuesta.replace(/\s{2,}/g, ' ');

    return respuesta.trim();
}

/* ================================================================
   RECORTAR RESPUESTA
   ================================================================
   Si el modelo se excede del límite duro de caracteres,
   cortamos en el último espacio y agregamos "…".
   ================================================================ */

function recortarRespuesta(texto, maximo) {
    if (typeof texto !== 'string') {
        return '';
    }

    if (texto.length <= maximo) {
        return texto;
    }

    const recorte = texto.slice(0, maximo);
    const ultimoEspacio = recorte.lastIndexOf(' ');

    const corte = ultimoEspacio > maximo * 0.6
        ? recorte.slice(0, ultimoEspacio)
        : recorte;

    return corte.trim() + '…';
}

/* ================================================================
   EXTRAER RESPUESTA DE GROQ
================================================================ */

function extraerRespuesta(data) {
    const respuesta =
        data && data.choices && data.choices[0] &&
        data.choices[0].message
            ? data.choices[0].message.content
            : '';

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

            /* Validar GROQ_API_KEY */
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

            /* Validar body */
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
                        req.user && req.user.id
                            ? req.user.id
                            : null,
                    context,
                    chars:
                        mensajeLimpio.length,
                    historyItems:
                        Array.isArray(history)
                            ? history.length
                            : 0
                }
            );

            /* Preparar historial */
            const historialSeguro =
                limpiarHistorial(history);

            /* Payload Groq */
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

                max_tokens: MAX_TOKENS_RESPUESTA,
                temperature: 0.5,
                stream: false
            };

            console.log(
                `⚡ Enviando solicitud a GROQ (${GROQ_MODEL})...`
            );

            /* Llamada a Groq */
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
                        timeout: GROQ_TIMEOUT_MS,
                        validateStatus: () => true
                    }
                );

            const status = groqResponse.status;
            const responseData = groqResponse.data;

            /* Error de Groq */
            if (status < 200 || status >= 300) {

                console.error(
                    '❌ GROQ respondió con error:',
                    {
                        status,
                        model: GROQ_MODEL,
                        data: responseData
                    }
                );

                let mensajeError =
                    'El servicio de Marquinhos no respondió correctamente.';

                if (
                    responseData &&
                    responseData.error &&
                    responseData.error.message
                ) {
                    mensajeError =
                        responseData.error.message;
                }

                return res.status(502).json({
                    success: false,
                    error: mensajeError
                });
            }

            /* Extraer respuesta */
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

            /* Limpiar Markdown */
            let respuestaTexto =
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

            /* Límite duro de caracteres */
            respuestaTexto = recortarRespuesta(
                respuestaTexto,
                MAX_CARACTERES_RESPUESTA
            );

            const duracion = Date.now() - inicio;

            console.log(
                '✅ Marquinhos respondió:',
                {
                    ms: duracion,
                    chars: respuestaTexto.length
                }
            );

            return res.status(200).json({
                success: true,
                reply: respuestaTexto
            });

        } catch (error) {

            const duracion = Date.now() - inicio;

            console.error(
                '❌ Error en /api/ai/chat:',
                {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    status:
                        error.response
                            ? error.response.status
                            : null,
                    duration: duracion
                }
            );

            if (
                error.response &&
                error.response.data
            ) {
                console.error(
                    '❌ Detalle GROQ:',
                    JSON.stringify(
                        error.response.data,
                        null,
                        2
                    )
                );
            }

            /* Timeout */
            if (
                error.code === 'ECONNABORTED' ||
                error.code === 'ETIMEDOUT'
            ) {
                return res.status(504).json({
                    success: false,
                    error:
                        'Marquinhos tardó demasiado en responder. Intenta nuevamente.'
                });
            }

            /* Errores de conexión */
            if (
                error.code === 'ENOTFOUND' ||
                error.code === 'ECONNRESET' ||
                error.code === 'ECONNREFUSED'
            ) {
                return res.status(502).json({
                    success: false,
                    error:
                        'No fue posible conectar con el servicio de Marquinhos.'
                });
            }

            /* Error general */
            return res.status(500).json({
                success: false,
                error:
                    'Error procesando el mensaje de Marquinhos.',
                detalles:
                    process.env.NODE_ENV === 'development'
                        ? error.message
                        : undefined
            });
        }
    }
);

module.exports = router;