/* ================================================================
   routes/ai-chat.js - CHAT DE TEXTO CON MARQUINHOS
   VERSIÓN PRODUCCIÓN - ESTABLE
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const NVIDIA_API_KEY =
    process.env.NVIDIA_API_KEY;

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const NVIDIA_ENDPOINT =
    'https://integrate.api.nvidia.com/v1/chat/completions';

const NVIDIA_MODEL =
    'moonshotai/kimi-k3';

const NVIDIA_TIMEOUT_MS =
    45000;

/* ================================================================
   SUPABASE ADMIN
================================================================ */

const supabaseAdmin =
    SUPABASE_URL &&
    SUPABASE_SERVICE_ROLE_KEY
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

async function autenticar(
    req,
    res,
    next
) {

    try {

        const auth =
            req.headers.authorization || '';

        if (
            !auth.startsWith('Bearer ')
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'No autenticado'
            });
        }

        const token =
            auth
                .slice(7)
                .trim();

        if (!token) {

            return res.status(401).json({
                success: false,
                error:
                    'Token no proporcionado'
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
            data: {
                user
            },
            error
        } =
            await supabaseAdmin
                .auth
                .getUser(token);

        if (
            error ||
            !user
        ) {

            console.warn(
                '⚠️ Token inválido o sesión expirada'
            );

            return res.status(401).json({
                success: false,
                error:
                    'Sesión inválida o expirada. Inicia sesión nuevamente.'
            });
        }

        req.user =
            user;

        return next();

    } catch (error) {

        console.error(
            '❌ Error autenticando chat:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                'Error de autenticación'
        });
    }
}

/* ================================================================
   PERSONALIDAD DE MARQUINHOS
================================================================ */

const SYSTEM_PROMPT = `
Eres "Marquinhos", el asistente oficial del ecosistema Sariel's.

PERSONALIDAD:
- Amigable, cercano y natural.
- Hablas español mexicano neutro.
- Puedes usar ocasionalmente los símbolos ◈, ✦ y 🔴.
- Sé directo y útil.
- No inventes información.
- Si no conoces algo, dilo claramente.
- Responde de forma natural, como un asistente real.

CONOCIMIENTO DEL ECOSISTEMA:
- Sariel's es un ecosistema Web3 sobre Polygon.
- Los Domos son galletas físicas del ecosistema.
- Los Domos pueden relacionarse con recompensas y Es.stoks.
- Es.stoks son tokens del ecosistema.
- 12 Es.stoks corresponden al objetivo de 1 NFT Domo.
- Puedes orientar sobre Domos, Es.stoks, NFT, LIVE, canales,
  mensajes y funciones generales del ecosistema.

REGLAS:
- No afirmes que ejecutaste una operación si no tienes acceso real
  para ejecutarla.
- No inventes precios, saldos, transacciones o datos personales.
- Mantén las respuestas concisas pero suficientes.
- No devuelvas markdown excesivo.
`.trim();

/* ================================================================
   LIMPIAR HISTORIAL
================================================================ */

function limpiarHistorial(
    history
) {

    if (!Array.isArray(history)) {
        return [];
    }

    return history
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
        .slice(-8)
        .map(
            item => ({
                role:
                    item.role,

                content:
                    item.content
                        .trim()
                        .slice(0, 4000)
            })
        );
}

/* ================================================================
   EXTRAER RESPUESTA DE NVIDIA
================================================================ */

function extraerRespuesta(
    data
) {

    const respuesta =
        data
            ?.choices
            ?. [0]
            ?.message
            ?.content;

    if (
        typeof respuesta !== 'string'
    ) {
        return '';
    }

    return respuesta.trim();
}

/* ================================================================
   POST /chat
================================================================ */

router.post(
    '/chat',
    autenticar,
    async (
        req,
        res
    ) => {

        const inicio =
            Date.now();

        try {

            /* ========================================================
               VALIDAR NVIDIA
            ======================================================== */

            if (!NVIDIA_API_KEY) {

                console.error(
                    '❌ NVIDIA_API_KEY no está configurada'
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
            } =
                req.body || {};

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
                limpiarHistorial(
                    history
                );

            /* ========================================================
               PAYLOAD KIMI K3
            ======================================================== */

            const payload = {

                model:
                    NVIDIA_MODEL,

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
                            mensajeLimpio
                    }
                ],

                max_tokens:
                    500,

                temperature:
                    0.7,

                stream:
                    false
            };

            console.log(
                '🤖 Enviando solicitud a NVIDIA/Kimi K3...'
            );

            /* ========================================================
               NVIDIA
            ======================================================== */

            const nvidiaResponse =
                await axios.post(
                    NVIDIA_ENDPOINT,
                    payload,
                    {
                        headers: {
                            Authorization:
                                `Bearer ${NVIDIA_API_KEY}`,

                            Accept:
                                'application/json',

                            'Content-Type':
                                'application/json'
                        },

                        timeout:
                            NVIDIA_TIMEOUT_MS,

                        validateStatus:
                            () => true
                    }
                );

            const status =
                nvidiaResponse.status;

            const responseData =
                nvidiaResponse.data;

            /* ========================================================
               ERROR NVIDIA
            ======================================================== */

            if (
                status < 200 ||
                status >= 300
            ) {

                console.error(
                    '❌ NVIDIA respondió con error:',
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
                        responseData
                            .error
                            .message;
                }

                return res.status(502).json({
                    success: false,
                    error:
                        mensajeError
                });
            }

            /* ========================================================
               EXTRAER RESPUESTA
            ======================================================== */

            const respuestaTexto =
                extraerRespuesta(
                    responseData
                );

            if (!respuestaTexto) {

                console.error(
                    '❌ NVIDIA respondió sin contenido:',
                    JSON.stringify(
                        responseData
                    )
                );

                return res.status(502).json({
                    success: false,
                    error:
                        'Marquinhos recibió una respuesta vacía del servicio de IA.'
                });
            }

            const duracion =
                Date.now() -
                inicio;

            console.log(
                '✅ Marquinhos respondió:',
                {
                    ms:
                        duracion,

                    chars:
                        respuestaTexto.length
                }
            );

            /* ========================================================
               RESPUESTA ESTABLE PARA FRONTEND
            ======================================================== */

            return res.status(200).json({
                success: true,
                reply:
                    respuestaTexto
            });

        } catch (error) {

            const duracion =
                Date.now() -
                inicio;

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

            if (
                error.response?.data
            ) {

                console.error(
                    '❌ Detalle NVIDIA:',
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

module.exports =
    router;