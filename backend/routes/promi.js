/* ================================================================
   routes/promi.js · PROMI · AGENTE COMERCIAL (MVP v1.0)
   ================================================================
   Módulo independiente de Marquinhos (routes/ai-chat.js).
   Ruta: POST /api/promi/chat

   Capacidades MVP:
     chat, copywriting, campaign_strategy, image_generation,
     video_generation, campaign_analysis

   Reglas de seguridad:
   - Nunca publica, programa, gasta presupuesto ni envía mensajes.
   - Toda acción externa devuelve approval_required: true.
   - Un video nunca se publica sin aprobación explícita.
   - El modelo solo clasifica y redacta; la generación de imagen y
     video se delega a /api/ai/media/imagen y /api/ai/media/video.

   Variables de entorno:
     OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
     PROMI_BASE_URL (opcional; por defecto el mismo host)
================================================================ */

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = 30000;
const OPENAI_MAX_TOKENS = 1200;

const PROMI_BASE_URL = (process.env.PROMI_BASE_URL || '').replace(/\/$/, '');
const HISTORIAL_MAX = 8;
const MENSAJE_MAX = 2000;

const CAPACIDADES = [
    'chat',
    'copywriting',
    'campaign_strategy',
    'image_generation',
    'video_generation',
    'campaign_analysis'
];

const supabaseAdmin =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
        )
        : null;

/* ================================================================
   SYSTEM PROMPT DE PROMI (independiente de Marquinhos)
   Fuente: especificación "Promi · Agente autónomo multimodal"
   ================================================================ */

const SYSTEM_PROMPT = `
Eres Promi, agente comercial y estratega de marketing de Csariel's.

Tu trabajo es entregar trabajo de marketing utilizable: estrategias,
textos publicitarios, análisis de campañas y solicitudes de creativos.
No solo das consejos generales.

REGLAS DE COMPORTAMIENTO:
- Si falta un dato crítico (producto o servicio, objetivo, público,
  oferta o precio, presupuesto), haz como máximo 3 preguntas precisas
  antes de entregar un plan.
- Si falta un dato menor, trabaja con un supuesto razonable y decláralo.
- Nunca inventes precios, promociones, teléfonos, direcciones,
  testimonios, métricas ni afirmaciones legales.
- Nunca prometas aumentos de ventas ni resultados garantizados.
- Si te piden "aumentar presupuesto", no prometas nada: pide el
  presupuesto actual, el objetivo y las métricas, y propón una
  asignación.
- Nunca digas que publicaste, programaste, gastaste o enviaste algo.
  Eso lo hace el humano con aprobación explícita.
- Si la petición está fuera de alcance o es riesgosa, explica el límite
  y ofrece una alternativa segura.

FORMATO:
Responde SIEMPRE con un único objeto JSON válido, sin texto fuera del
JSON, sin Markdown, sin bloques de código.

El JSON debe tener exactamente la forma que pida el tipo de salida
indicado en la instrucción del sistema de cada turno.

Tipos de salida permitidos:
- "chat": { "type": "chat", "message": string, "next_action": string|null }
- "copywriting": { "type": "copywriting", "variants": [ { "id": string, "channel": string, "format": string, "length_chars": number, "text": string, "cta": string, "hashtags": [string], "assumptions": [string] } ] }
- "campaign_strategy": { "type": "campaign_strategy", "campaign": { "name": string, "business_objective": "awareness"|"leads"|"sales"|"retention", "target_audience": { "profile": string, "pain_points": [string], "motivations": [string] }, "offer": { "product_or_service": string, "value_proposition": string, "price_or_promotion": string|null, "cta": string }, "channels": [string], "creative_concept": string, "kpis": [string], "assumptions": [string], "status": "complete"|"incomplete", "missing": [string] } }
- "campaign_analysis": { "type": "campaign_analysis", "metrics_summary": object, "diagnosis": [string], "recommended_actions": [ { "action": string, "expected_impact": string, "approval_required": true } ], "data_gaps": [string] }
`.trim();

/* ================================================================
   AUTENTICACIÓN (mismo criterio que ai-media.js)
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
            return res.status(500).json({ success: false, error: 'Supabase no está configurado' });
        }
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
        }
        req.user = user;
        req.token = token;
        return next();
    } catch (error) {
        console.error('❌ Error autenticando Promi:', error.message);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   HELPERS
================================================================ */

function limpiarHistorial(history) {
    if (!Array.isArray(history)) return [];
    return history
        .filter(item =>
            item && typeof item === 'object' &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' && item.content.trim()
        )
        .slice(-HISTORIAL_MAX)
        .map(item => ({
            role: item.role,
            content: item.content.trim().slice(0, 2000)
        }));
}

// Extrae un objeto JSON de la respuesta del modelo. Devuelve null si no es válido.
function parsearJSON(texto) {
    if (typeof texto !== 'string') return null;
    try {
        const obj = JSON.parse(texto.trim());
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
    } catch (e) {
        return null;
    }
}

/* ================================================================
   ROUTER DE INTENCIONES (reglas 1 a 10 de la especificación)
   Devuelve una capacidad válida. Ante duda, cae a "chat".
   ================================================================ */

const PALABRAS = {
    imagen: ['imagen', 'foto', 'flyer', 'creativo', 'banner', 'poster', 'arte'],
    video: ['video', 'reel', 'clip', 'tiktok', 'historia en video'],
    campana: ['campaña', 'campana', 'estrategia', 'plan de marketing', 'lanzamiento'],
    copy: ['anuncio', 'caption', 'texto', 'copy', 'publicación', 'publicacion', 'eslogan', 'headline'],
    analisis: ['métricas', 'metricas', 'resultados', 'rendimiento', 'analiza mi campaña', 'analiza mi campana', 'cpa', 'roas', 'alcance'],
    presupuesto: ['presupuesto', 'aumentar presupuesto', 'cuánto invertir', 'cuanto invertir']
};

function contiene(texto, lista) {
    return lista.some(p => texto.includes(p));
}

/**
 * Clasifica el mensaje en una capacidad.
 * Reglas (en orden de precedencia):
 *   10 fuera de alcance -> chat (límite)
 *   9  dato crítico faltante -> chat (preguntas)
 *   8  presupuesto -> chat (preguntas) o campaign_analysis
 *   5  campaña completa -> campaign_strategy
 *   4  video -> video_generation
 *   3  imagen -> image_generation
 *   6  texto publicitario -> copywriting
 *   (analisis) -> campaign_analysis
 *   default -> chat
 */
function clasificarIntencion(mensaje, historial) {
    const t = mensaje.toLowerCase();

    // Regla 8: presupuesto
    if (contiene(t, PALABRAS.presupuesto)) {
        return { capacidad: 'chat', motivo: 'presupuesto_preguntas' };
    }

    // Regla 4: video (tiene prioridad sobre imagen si se piden ambos, según especificación)
    if (contiene(t, PALABRAS.video)) {
        return { capacidad: 'video_generation', motivo: 'solicitud_video' };
    }

    // Regla 3: imagen
    if (contiene(t, PALABRAS.imagen)) {
        return { capacidad: 'image_generation', motivo: 'solicitud_imagen' };
    }

    // Regla 5: campaña completa
    if (contiene(t, PALABRAS.campana)) {
        return { capacidad: 'campaign_strategy', motivo: 'solicitud_campana' };
    }

    // Análisis de métricas
    if (contiene(t, PALABRAS.analisis)) {
        return { capacidad: 'campaign_analysis', motivo: 'solicitud_analisis' };
    }

    // Regla 6: texto publicitario
    if (contiene(t, PALABRAS.copy)) {
        return { capacidad: 'copywriting', motivo: 'solicitud_copy' };
    }

    return { capacidad: 'chat', motivo: 'conversacion' };
}

/* ================================================================
   VALIDACIÓN DEL CONTRATO JSON (sección 5.1)
   Ninguna respuesta sale del backend si no cumple el contrato.
   ================================================================ */

const ESQUEMAS = {
    chat: (o) => typeof o.message === 'string' && o.message.trim().length > 0,
    copywriting: (o) => Array.isArray(o.variants) && o.variants.length > 0 &&
        o.variants.every(v => v && typeof v.text === 'string' && typeof v.cta === 'string'),
    campaign_strategy: (o) => o.campaign && typeof o.campaign === 'object' &&
        typeof o.campaign.name === 'string' &&
        ['awareness', 'leads', 'sales', 'retention'].includes(o.campaign.business_objective) &&
        (o.campaign.status === 'complete' || o.campaign.status === 'incomplete'),
    campaign_analysis: (o) => typeof o.metrics_summary === 'object' && Array.isArray(o.diagnosis) &&
        Array.isArray(o.recommended_actions) &&
        o.recommended_actions.every(a => a.approval_required === true)
};

function validarContrato(tipo, obj) {
    if (!obj || obj.type !== tipo) return false;
    const esquema = ESQUEMAS[tipo];
    return esquema ? esquema(obj) : false;
}

/* ================================================================
   LLAMADA A OPENAI (solo para capacidades de texto)
   ================================================================ */

async function llamarOpenAI(mensajes) {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');

    const respuesta = await axios.post(OPENAI_CHAT_URL, {
        model: OPENAI_MODEL,
        messages: mensajes,
        max_tokens: OPENAI_MAX_TOKENS,
        temperature: 0.4,
        response_format: { type: 'json_object' }
    }, {
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: OPENAI_TIMEOUT_MS,
        validateStatus: () => true
    });

    if (respuesta.status < 200 || respuesta.status >= 300) {
        const error = new Error(`OpenAI respondió HTTP ${respuesta.status}`);
        error.status = respuesta.status;
        throw error;
    }

    return respuesta.data?.choices?.[0]?.message?.content || '';
}

/* ================================================================
   CAPACIDADES DE TEXTO
   ================================================================ */

async function ejecutarTexto(capacidad, mensaje, historial) {
    const instruccion = {
        chat: 'Tipo de salida: "chat". Responde en el campo "message". Si falta un dato crítico, haz máximo 3 preguntas en el mensaje.',
        copywriting: 'Tipo de salida: "copywriting". Entrega entre 1 y 3 variantes de texto publicitario en "variants". Cada variante incluye id, channel, format, length_chars, text, cta, hashtags y assumptions.',
        campaign_strategy: 'Tipo de salida: "campaign_strategy". Entrega el objeto "campaign". Si falta un dato crítico, pon status "incomplete" y lista lo que falta en "missing"; no inventes precios ni promociones.',
        campaign_analysis: 'Tipo de salida: "campaign_analysis". Analiza solo las métricas que el usuario entregue. Si faltan datos, listalos en data_gaps. Cada acción recomendada debe tener approval_required true.'
    }[capacidad];

    const mensajes = [
        { role: 'system', content: SYSTEM_PROMPT + '\n\n' + instruccion },
        ...limpiarHistorial(historial),
        { role: 'user', content: mensaje }
    ];

    const crudo = await llamarOpenAI(mensajes);
    const obj = parsearJSON(crudo);

    if (!validarContrato(capacidad, obj)) {
        return { ok: false, error: 'contrato_invalido' };
    }
    return { ok: true, data: obj };
}

/* ================================================================
   CAPACIDADES DE MEDIA (delegadas a /api/ai/media)
   ================================================================ */

async function ejecutarMedia(tipo, prompt, token) {
    const base = PROMI_BASE_URL;
    if (!base) {
        return { ok: false, error: 'PROMI_BASE_URL no configurada' };
    }

    const ruta = tipo === 'imagen' ? '/api/ai/media/imagen' : '/api/ai/media/video';

    try {
        const respuesta = await axios.post(`${base}${ruta}`, { prompt }, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            timeout: tipo === 'imagen' ? 120000 : 30000,
            validateStatus: () => true
        });

        const d = respuesta.data || {};

        if (respuesta.status === 422 || d.error === 'contenido_rechazado') {
            return { ok: false, error: 'contenido_rechazado', mensaje: d.mensaje || 'El contenido fue rechazado por las políticas de seguridad.' };
        }
        if (respuesta.status === 429) {
            return { ok: false, error: 'limite_diario', mensaje: d.mensaje || 'Llegaste al límite diario.' };
        }
        if (!d.success) {
            return { ok: false, error: 'media_error', mensaje: d.error || 'No se pudo generar el contenido.' };
        }

        return { ok: true, data: d };
    } catch (error) {
        console.error('❌ Promi media:', error.message);
        return { ok: false, error: 'media_error', mensaje: 'No se pudo conectar con el generador de contenido.' };
    }
}

/* ================================================================
   POST /api/promi/chat
================================================================ */

router.post('/chat', autenticar, async (req, res) => {
    try {
        const { message, history = [] } = req.body || {};

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ success: false, error: 'Mensaje vacío o inválido.' });
        }

        const mensaje = message.trim().slice(0, MENSAJE_MAX);
        const { capacidad, motivo } = clasificarIntencion(mensaje, history);

        // Capacidades de media: se delegan a los endpoints existentes.
        if (capacidad === 'image_generation' || capacidad === 'video_generation') {
            const tipo = capacidad === 'image_generation' ? 'imagen' : 'video';
            const token = req.token;
            const r = await ejecutarMedia(tipo, mensaje, token);

            if (!r.ok) {
                return res.status(r.error === 'contenido_rechazado' ? 422 : 502).json({
                    success: false,
                    type: capacidad,
                    error: r.error,
                    mensaje: r.mensaje
                });
            }

            const d = r.data;
            return res.json({
                success: true,
                type: capacidad,
                contrato: {
                    type: capacidad,
                    asset_id: d.id,
                    url: d.preview_url || null,
                    status: d.estado === 'listo' ? 'generated' : 'pending_review',
                    prompt_used: mensaje,
                    approval_required: true,
                    assumptions: []
                },
                preview_url_seg: d.vista_previa_seg || null
            });
        }

        // Capacidades de texto
        if (capacidad !== 'chat' || motivo === 'conversacion') {
            const r = await ejecutarTexto(capacidad, mensaje, history);
            if (!r.ok) {
                return res.status(502).json({
                    success: false,
                    type: capacidad,
                    error: r.error,
                    mensaje: 'La respuesta de Promi no cumplió el formato esperado. Intenta de nuevo.'
                });
            }
            return res.json({ success: true, type: capacidad, contrato: r.data });
        }

        // Regla 8 / 9: preguntas (chat)
        const r = await ejecutarTexto('chat', mensaje, history);
        if (!r.ok) {
            return res.status(502).json({
                success: false,
                type: 'chat',
                error: r.error,
                mensaje: 'La respuesta de Promi no cumplió el formato esperado. Intenta de nuevo.'
            });
        }
        return res.json({ success: true, type: 'chat', contrato: r.data });

    } catch (error) {
        console.error('❌ Error /api/promi/chat:', error.message);
        return res.status(500).json({ success: false, error: 'Error procesando el mensaje de Promi.' });
    }
});

module.exports = router;