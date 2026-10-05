/* ================================================================
   routes/ai-chat-pet.js - CHAT DE LA MASCOTA MARQUINHOS (v2)
   ================================================================
   Endpoint: POST /api/ai/chat-pet
   Modelo:   Groq (openai/gpt-oss-120b)

   Cambios sobre tu versión:
   1. RUTA CORREGIDA: antes era router.post('/chat-pet') montado en
      '/api/ai/chat-pet' → quedaba /api/ai/chat-pet/chat-pet (404).
      Ahora responde en /api/ai/chat-pet (y también en el viejo
      /api/ai/chat-pet/chat-pet por compatibilidad).
   2. max_tokens subido + reasoning_effort bajo: gpt-oss-120b es un
      modelo de razonamiento y gastaba los 400 tokens "pensando",
      dejando la respuesta vacía.
   3. Prompt: responde CUALQUIER tema como Gemini/ChatGPT/Claude,
      recuerda el contexto y usa fecha/hora actual.
   4. Memoria: usa historial del cliente y, si no hay, el de
      ai_voice_chats (se conserva entre dispositivos).
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

/* Incluye los tokens de razonamiento del modelo */
const MAX_TOKENS_RESPUESTA = 1800;
const MAX_CARACTERES_RESPUESTA = 1600;

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
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const token = auth.slice(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token no proporcionado' });
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
            return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
        }

        req.user = user;
        return next();
    } catch (error) {
        console.error('❌ Error autenticando chat-pet:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   PERSONALIDAD DE MARQUINHOS
================================================================ */

const SYSTEM_PROMPT = `
Eres Marquinhos, la mascota virtual y asistente personal del ecosistema Sariel's.

Eres un asistente conversacional GENERAL, tan capaz como Gemini, ChatGPT o Claude. Puedes hablar de CUALQUIER tema: ciencia, tecnología, programación, matemáticas, salud general, cocina, historia, negocios, finanzas, idiomas, redacción, traducción, consejos personales, entretenimiento, ideas, etc. No te limites al ecosistema Sariel's cuando la pregunta no es del ecosistema.

PERSONALIDAD:
Cercano, cálido, natural y confiable, como un amigo muy inteligente.
Hablas en el idioma del usuario; por defecto español mexicano neutro.
No suenas como robot ni como manual técnico.

MEMORIA Y CONTEXTO:
Usa todo el historial de la conversación. Recuerda lo que el usuario dijo antes (nombre, gustos, datos, temas) y refiérete a ello con naturalidad.
Si dice "eso", "y el otro", "explícamelo mejor", entiende a qué se refiere por el contexto.
Si el mensaje parece mal transcrito por voz, interpreta lo más probable en vez de pedir que lo repita.

CÓMO RESPONDER:
1. Tus respuestas se LEEN EN VOZ ALTA. Habla de forma natural, directa y sin rodeos.
2. Por defecto responde en 2 a 4 frases. Si la pregunta es simple, responde simple.
3. Si el usuario pide una explicación, una historia, comparar, enseñar o más detalle, extiéndete lo necesario (hasta unas 12 frases).
4. Si es un procedimiento paso a paso dentro de la app, da solo el siguiente paso y espera.
5. Si no sabes algo, dilo con honestidad. No inventes. No tienes internet en tiempo real.
6. En temas médicos, legales o financieros da información útil y menciona brevemente que conviene un profesional cuando de verdad importe.
7. Rechaza con amabilidad contenido dañino o ilegal y ofrece una alternativa.

FORMATO:
Texto plano conversacional. Sin Markdown, sin asteriscos, sin almohadillas, sin listas con guiones, sin bloques de código, sin tablas. Si hay pasos, dilos con "primero, segundo, tercero".
Sin emojis salvo que sean realmente necesarios.

CONOCIMIENTO DEL ECOSISTEMA SARIEL'S (úsalo solo cuando pregunten por la app):

Sariel's es un ecosistema Web3 construido sobre Polygon.

Muro P2P: mercado peer-to-peer donde los usuarios compran y venden Es.stoks entre sí. El vendedor pone el precio. El sistema cobra 3% de comisión. Se paga con cripto (USDT/USDC) mediante QR.

Perfil: foto, video, portada (imagen o video), estadísticas. Desde Configuración se conecta la wallet.

Wallet y Polygon: se conecta desde Configuración, Wallet y Polygon. Sirve para recibir y enviar USDT, USDC y otros tokens en Polygon. Es necesaria para comprar o vender Es.stoks en el Muro, pagar membresías, etc.

Live: transmisiones en vivo. Dos modos: Live Profesional (requiere Live Pass de pago) y Live en Grupos (gratis, aceptando términos). Se puede transmitir la cámara o compartir pantalla.

Canales: públicos, solo el creador publica; los usuarios los siguen. Tienen ubicación geográfica.

Grupos: privados, todos los miembros pueden publicar. Se puede transmitir en vivo gratis aceptando términos. Algunos grupos son de pago (USDT al mes).

Mensajes: chat uno a uno con texto, fotos, videos y notas de voz. Videollamadas con LiveKit.

Contactos: lista de personas con las que puedes chatear.

Internet (eSIMs): compra y administración de eSIMs Telnyx con datos móviles.

Videos: galería de videos de la comunidad.

Marketing: panel de anuncios pagados.

Domos: productos físicos del ecosistema. Cada Domo tiene un QR que se escanea para recibir Es.stoks.

Es.stoks: tokens internos del ecosistema. Se ganan participando, por ejemplo escaneando QRs de Domos. 12 Es.stoks equivalen al objetivo de 1 NFT Domo. Se pueden vender en el Muro P2P.

NFT Domo: activo digital en blockchain que se canjea al acumular 12 Es.stoks.

REGLAS DE SEGURIDAD:
No inventes precios, saldos, transacciones ni datos personales.
No afirmes que ejecutaste una operación si no tienes acceso real para hacerla.

OBJETIVO:
Ser el mejor asistente y compañero del usuario: conversar, ayudar, guiar y resolver dudas con calidad profesional.
`.trim();

function contextoDinamico(user_name, page) {
    const fecha = new Date().toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        dateStyle: 'full',
        timeStyle: 'short'
    });
    let t = `Fecha y hora actual (México): ${fecha}. `;
    if (user_name) t += `El usuario se llama ${user_name}. `;
    if (page) t += `Está navegando en ${page}.`;
    return t.trim();
}

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
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/^\s{0,3}[-*+]\s+/gm, '');
    t = t.replace(/^\s{0,3}>\s?/gm, '');
    t = t.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    t = t.replace(/^\s*\|.*\|\s*$/gm, '');
    t = t.replace(/\|/g, ' ');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\r?\n{3,}/g, '\n\n');
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
   POST /api/ai/chat-pet
   (también acepta /api/ai/chat-pet/chat-pet por compatibilidad)
================================================================ */

router.post(['/', '/chat-pet'], autenticar, async (req, res) => {
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

        // 1. Historial: el del cliente; si viene vacío, el de Supabase
        let historialCombinado = limpiarHistorial(history);
        if (historialCombinado.length === 0) {
            historialCombinado = await cargarHistorial(req.user.id);
        }

        // Evitar duplicar el mensaje actual si ya viene al final
        const ult = historialCombinado[historialCombinado.length - 1];
        if (ult && ult.role === 'user' && ult.content.trim() === mensajeLimpio) {
            historialCombinado = historialCombinado.slice(0, -1);
        }

        // 2. Mensajes
        const mensajes = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'system', content: contextoDinamico(user_name, page) },
            ...historialCombinado,
            { role: 'user', content: mensajeLimpio }
        ];

        // 3. Groq
        const groqResponse = await axios.post(
            GROQ_ENDPOINT,
            {
                model: GROQ_MODEL,
                messages: mensajes,
                max_tokens: MAX_TOKENS_RESPUESTA,
                temperature: 0.6,
                reasoning_effort: 'low',
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
            if (responseData?.error?.message) mensajeError = responseData.error.message;
            return res.status(502).json({ success: false, error: mensajeError });
        }

        const choice = responseData?.choices?.[0];
        const respuestaOriginal = choice?.message?.content || '';

        if (!respuestaOriginal) {
            console.error('❌ Groq sin contenido. finish_reason:', choice?.finish_reason);
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

        // 4. Guardar
        guardarMensaje(req.user.id, mensajeLimpio, respuestaTexto);

        console.log('✅ Marquinhos-pet respondió:', {
            ms: Date.now() - inicio,
            chars: respuestaTexto.length
        });

        return res.status(200).json({
            success: true,
            reply: respuestaTexto
        });

    } catch (error) {
        console.error('❌ Error en /api/ai/chat-pet:', {
            name: error.name,
            message: error.message,
            code: error.code,
            duration: Date.now() - inicio
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
