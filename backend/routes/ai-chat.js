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