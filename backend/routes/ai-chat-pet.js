/* ================================================================
   routes/ai-chat-pet.js - CHAT DE LA MASCOTA MARQUINHOS
   ================================================================
   Endpoint: POST /api/ai/chat-pet
   Modelo:   Groq (openai/gpt-oss-120b)

   Este endpoint es SOLO para la mascota virtual (Marquinhos-pet).
   NO toca /api/ai/chat (que es el del chat de mensajes).

   DIFERENCIAS con ai-chat.js:
   - Conocimiento completo y actualizado del ecosistema Sariel's.
   - Respuestas más fluidas y naturales (2-6 frases).
   - Guarda historial en ai_voice_chats (reusada).
   - Carga últimos 20 mensajes del usuario automáticamente.
   - Maneja contexto: sabe en qué página está el usuario.
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

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 30000;

/* Límites de longitud (respuestas medias) */
const MAX_TOKENS_RESPUESTA = 400;
const MAX_CARACTERES_RESPUESTA = 900;

/* Historial máximo a cargar */
const HISTORIAL_MAX = 20;

/* ================================================================
   SUPABASE ADMIN
================================================================ */

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

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Sesión inválida o expirada'
            });
        }

        req.user = user;
        return next();
    } catch (error) {
        console.error('❌ Error autenticando chat-pet:', error);
        return res.status(500).json({
            success: false,
            error: 'Error de autenticación'
        });
    }
}

/* ================================================================
   PERSONALIDAD DE MARQUINHOS (MASCOTA VIRTUAL)
================================================================ */

const SYSTEM_PROMPT = `
Eres Marquinhos, la mascota virtual y asistente personal del ecosistema Sariel's.

PERSONALIDAD:

Eres profesional, cercano, cálido, natural y confiable.
Hablas español mexicano neutro.
No hablas como un robot.
No hablas como un manual técnico.
No eres frío ni distante.
Eres como un amigo inteligente que sabe mucho del ecosistema.

CÓMO RESPONDER:

1. Responde con naturalidad como si estuvieras conversando con alguien.

2. Sé claro y útil. Normalmente responde entre 2 y 4 frases.
Si la pregunta es simple, responde simple.
Si la pregunta es compleja o pide explicación, puedes usar hasta 6 frases.

3. No des vueltas. Ve directo al punto.
No repitas información que el usuario ya tiene.

4. Si el usuario está haciendo un procedimiento paso a paso, explícale solo el siguiente paso y espera a que lo complete antes de continuar.

5. Si no sabes algo, dilo honestamente. No inventes.

6. Si el usuario hace una pregunta general (matemáticas, consejos, cultura, historia, ciencia, etc.), respóndela con la misma calidad que un asistente profesional como ChatGPT o Gemini. No te limites al ecosistema cuando la pregunta no es del ecosistema.

FORMATO:

Escribe en texto plano conversacional.
No uses Markdown.
No uses asteriscos, almohadillas, guiones decorativos, ni bloques de código.
No uses listas con guiones.
Puedes usar signos normales de puntuación (¿? ¡! , . : ;).
No uses emojis salvo que sean realmente necesarios.

CONOCIMIENTO DEL ECOSISTEMA SARIEL'S:

Sariel's es un ecosistema Web3 construido sobre Polygon (criptomonedas).

Secciones principales:

Muro P2P:
Es un mercado peer-to-peer donde los usuarios compran y venden Es.stoks entre sí.
Hay compradores y vendedores.
Los precios los pone el vendedor.
El sistema cobra una comisión del 3%.
Se paga con cripto (USDT/USDC) mediante QR.

Perfil:
Cada usuario tiene su perfil con foto, video, estadísticas.
Desde la configuración del perfil se puede conectar la wallet (Wallet y Polygon).
Se puede subir foto de perfil y portada (imagen o video).

Wallet y Polygon:
Desde Configuración → Wallet y Polygon se conecta la wallet cripto del usuario.
Sirve para recibir y enviar USDT, USDC y otros tokens en Polygon.
Es necesaria para comprar/vender Es.stoks en el Muro P2P, pagar membresías, etc.

Live:
Transmisiones en vivo de video.
Hay DOS modos:
  1. Live Profesional: requiere un Live Pass de pago (membresía). Ideal para profesionales que quieren enseñar, dar clases, hacer shows, etc.
  2. Live en Grupos: es gratis, pero requiere aceptar términos y condiciones (firma de checkbox). Ahí el usuario puede transmitir lo que quiera.
Se puede transmitir la cámara del dispositivo o compartir pantalla.

Canales:
Públicos. Solo el creador puede publicar.
Los usuarios pueden seguir el canal y ver las publicaciones.
Tienen ubicación geográfica (estado, municipio, ciudad).

Grupos:
Privados. Todos los miembros pueden publicar.
Se puede transmitir en vivo gratis aceptando términos.
Algunos grupos son de pago (USDT/mes).

Mensajes:
Chat uno a uno entre usuarios.
Se pueden enviar texto, fotos, videos, notas de voz.
Videollamadas con LiveKit.
Marquinhos también responde por chat de texto en esta sección.

Contactos:
Lista de personas con las que puedes chatear.

Internet (eSIMs):
Compra y administración de eSIMs Telnyx.
Datos móviles en el ecosistema.

Videos:
Galería de videos de la comunidad.

Marketing:
Panel de anuncios pagados.

Domos:
Productos físicos del ecosistema.
Cada Domo puede acumular Es.stoks.
Los Domos son parte central de Sariel's.
Tienen un QR que se escanea para recibir Es.stoks.

Es.stoks:
Son los tokens internos del ecosistema Sariel's.
Se ganan participando en el ecosistema (escaneando QRs de Domos, por ejemplo).
12 Es.stoks equivalen al objetivo de 1 NFT Domo.
Se pueden vender en el Muro P2P.

NFT Domo:
Se canjea al acumular 12 Es.stoks.
Es un NFT (activo digital en blockchain).

REGLAS DE SEGURIDAD:

No inventes información.
No inventes precios ni saldos.
No inventes transacciones.
No inventes datos personales.
No afirmes que ejecutaste una operación si no tienes acceso real para hacerlo.
Si no sabes algo, dilo con honestidad.

OBJETIVO:

Ser el mejor asistente y compañero del usuario dentro de Sariel's.
Ayudar, guiar, conversar y resolver dudas con calidad profesional.
`.trim();

/* ================================================================
   LIMPIAR HISTORIAL
================================================================ */

function limpiarHistorial(history) {
    if (!Array.isArray(history)) return [];

    return history
        .filter(item =>
            item &&
            typeof item === 'object' &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' &&
            item.content.trim()
        )
        .slice(-HISTORIAL_MAX)
        .map(item => ({
            role: item.role,
            content: item.content.trim().slice(0, 4000)
        }));
}

/* ================================================================
   LIMPIAR FORMATO (quita Markdown residual)
================================================================ */

function limpiarFormato(texto) {
    if (typeof texto !== 'string') return '';
    let t = texto.trim();

    t = t.replace(/```[\s\S]*?```/g, '');
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    t = t.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    t = t.replace(/\*\*(.*?)\*\*/g, '$1');
    t = t.replace(/\*(.*?)\*/g, '$1');
    t = t.replace(/___(.*?)___/g, '$1');
    t = t.replace(/__(.*?)__/g, '$1');
    t = t.replace(/_(.*?)_/g, '$1');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/^\s{0,3}[-*+]\s+/gm, '');
    t = t.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');
    t = t.replace(/^\s{0,3}>\s?/gm, '');
    t = t.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    t = t.replace(/^\s*\|.*\|\s*$/gm, '');
    t = t.replace(/\|/g, ' ');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\r?\n{2,}/g, '\n\n');
    t = t.replace(/[ \t]+/g, ' ');
    return t.trim();
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
    if (ultimoPunto > maximo * 0.6) {
        return recorte.slice(0, ultimoPunto + 1).trim();
    }
    const ultimoEspacio = recorte.lastIndexOf(' ');
    if (ultimoEspacio > maximo * 0.6) {
        return recorte.slice(0, ultimoEspacio).trim() + '...';
    }
    return recorte.trim() + '...';
}

/* ================================================================
   GUARDAR / CARGAR HISTORIAL EN ai_voice_chats
================================================================ */

async function guardarMensaje(usuarioId, transcripcion, respuesta) {
    try {
        await supabaseAdmin.from('ai_voice_chats').insert({
            usuario_id: usuarioId,
            transcripcion: transcripcion || '(texto)',
            respuesta: respuesta,
            audio_usuario_url: null,
            audio_bot_url: null
        });
    } catch (e) {
        console.warn('⚠️ No se pudo guardar en ai_voice_chats:', e.message);
    }
}

async function cargarHistorial(usuarioId) {
    try {
        const { data, error } = await supabaseAdmin
            .from('ai_voice_chats')
            .select('transcripcion, respuesta, created_at')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: false })
            .limit(HISTORIAL_MAX);

        if (error || !Array.isArray(data)) return [];

        const historial = [];
        data.reverse().forEach(row => {
            if (row.transcripcion && row.transcripcion !== '(texto)') {
                historial.push({ role: 'user', content: row.transcripcion });
            }
            if (row.respuesta) {
                historial.push({ role: 'assistant', content: row.respuesta });
            }
        });

        return historial.slice(-HISTORIAL_MAX);
    } catch (e) {
        return [];
    }
}

/* ================================================================
   POST /chat-pet
================================================================ */

router.post('/chat-pet', autenticar, async (req, res) => {
    const inicio = Date.now();

    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Marquinhos no está configurado en el servidor.'
            });
        }

        const { message, history = [], page = null, user_name = null } = req.body || {};

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Mensaje vacío o inválido.'
            });
        }

        const mensajeLimpio = message.trim().slice(0, 4000);

        console.log('💬 Marquinhos-pet recibió:', {
            userId: req.user?.id,
            page,
            user_name,
            chars: mensajeLimpio.length
        });

        // 1. Historial del cliente + historial de Supabase
        const historialCliente = limpiarHistorial(history);
        let historialDB = [];
        try {
            historialDB = await cargarHistorial(req.user.id);
        } catch (e) {}

        // Combinar sin duplicar (los últimos del cliente ganan)
        let historialCombinado = historialDB;
        if (historialCliente.length > 0) {
            historialCombinado = historialCliente.slice(-HISTORIAL_MAX);
        }

        // 2. Construir mensajes
        const mensajes = [
            { role: 'system', content: SYSTEM_PROMPT }
        ];

        // Añadir contexto de página y nombre si existen
        if (page || user_name) {
            let contextoExtra = '';
            if (user_name) {
                contextoExtra += `El usuario se llama ${user_name}. `;
            }
            if (page) {
                contextoExtra += `Está navegando en ${page}.`;
            }
            if (contextoExtra) {
                mensajes.push({
                    role: 'system',
                    content: contextoExtra.trim()
                });
            }
        }

        mensajes.push(...historialCombinado);
        mensajes.push({ role: 'user', content: mensajeLimpio });

        // 3. Llamar a Groq
        console.log(`⚡ Enviando a Groq (${GROQ_MODEL})...`);

        const groqResponse = await axios.post(
            GROQ_ENDPOINT,
            {
                model: GROQ_MODEL,
                messages: mensajes,
                max_tokens: MAX_TOKENS_RESPUESTA,
                temperature: 0.6,
                stream: false
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: GROQ_TIMEOUT_MS,
                validateStatus: () => true
            }
        );

        const status = groqResponse.status;
        const responseData = groqResponse.data;

        if (status < 200 || status >= 300) {
            console.error('❌ Groq error:', { status, data: responseData });
            let mensajeError = 'El servicio de IA no respondió correctamente.';
            if (responseData?.error?.message) {
                mensajeError = responseData.error.message;
            }
            return res.status(502).json({
                success: false,
                error: mensajeError
            });
        }

        const respuestaOriginal = responseData?.choices?.[0]?.message?.content || '';

        if (!respuestaOriginal) {
            console.error('❌ Groq sin contenido');
            return res.status(502).json({
                success: false,
                error: 'Marquinhos recibió una respuesta vacía.'
            });
        }

        let respuestaTexto = limpiarFormato(respuestaOriginal);

        if (!respuestaTexto) {
            return res.status(502).json({
                success: false,
                error: 'Marquinhos generó una respuesta vacía.'
            });
        }

        respuestaTexto = recortarRespuesta(respuestaTexto, MAX_CARACTERES_RESPUESTA);

        // 4. Guardar en Supabase
        guardarMensaje(req.user.id, mensajeLimpio, respuestaTexto);

        const duracion = Date.now() - inicio;
        console.log('✅ Marquinhos-pet respondió:', {
            ms: duracion,
            chars: respuestaTexto.length
        });

        return res.status(200).json({
            success: true,
            reply: respuestaTexto
        });

    } catch (error) {
        const duracion = Date.now() - inicio;
        console.error('❌ Error en /api/ai/chat-pet:', {
            name: error.name,
            message: error.message,
            code: error.code,
            duration: duracion
        });

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return res.status(504).json({
                success: false,
                error: 'Marquinhos tardó demasiado en responder.'
            });
        }

        if (['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED'].includes(error.code)) {
            return res.status(502).json({
                success: false,
                error: 'No fue posible conectar con Marquinhos.'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Error procesando el mensaje.'
        });
    }
});

module.exports = router;