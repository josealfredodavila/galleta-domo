// ================================================================
// SERVICES/MODERACION/MODERARTEXTO.JS
// Sariel's Ecosystem — Moderación de texto con OpenAI Moderation API
// ================================================================
// Uso:
//   const { moderarTexto } = require('../../services/moderacion/moderarTexto');
//   const resultado = await moderarTexto('Hola mundo');
//   if (!resultado.ok) { /* rechazar */ }
//
// Contrato:
//   Entrada:  string con el texto a moderar
//   Salida:   { ok: true, flagged: false }
//           | { ok: false, motivo: 'contenido_no_permitido', categorias: [...] }
//           | { ok: false, motivo: 'timeout' }
//           | { ok: false, motivo: 'servicio_no_disponible' }
//           | { ok: false, motivo: 'texto_vacio' }
//
// Reglas:
//   - Usa la API de OpenAI con el modelo omni-moderation-latest.
//   - Lee la clave desde process.env.OPENAI_API_KEY (nunca hardcodeada).
//   - Fail closed: si OpenAI falla o tarda > 10s, rechaza.
//   - Texto vacío o muy corto se considera "limpio" (no gasta API call).
// ================================================================

'use strict';

const axios = require('axios');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/moderations';
const OPENAI_MODEL = 'omni-moderation-latest';

const TIMEOUT_MS = Number(process.env.MODERACION_TEXTO_TIMEOUT_MS) || 10000;

const MIN_LENGTH = Number(process.env.MODERACION_TEXTO_MIN_LENGTH) || 3;
const MAX_LENGTH = Number(process.env.MODERACION_TEXTO_MAX_LENGTH) || 8000;

// ================================================================
// MODERAR TEXTO
// ================================================================

/**
 * Modera un texto con OpenAI Moderation API.
 * @param {string} texto — texto a moderar
 * @returns {Promise<{ok: boolean, flagged?: boolean, motivo?: string, categorias?: array}>}
 */
async function moderarTexto(texto) {
    // 1) Validar entrada
    if (typeof texto !== 'string') {
        return { ok: false, motivo: 'texto_vacio' };
    }

    const textoLimpio = texto.trim();

    if (textoLimpio.length < MIN_LENGTH) {
        // Texto demasiado corto → no vale la pena gastar API
        return { ok: true, flagged: false };
    }

    if (textoLimpio.length > MAX_LENGTH) {
        // Texto demasiado largo → truncar
        textoLimpio = textoLimpio.slice(0, MAX_LENGTH);
    }

    // 2) Validar API key
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('❌ [ModerarTexto] Falta OPENAI_API_KEY');
        return { ok: false, motivo: 'servicio_no_disponible' };
    }

    // 3) Llamar a OpenAI
    let respuesta;
    try {
        respuesta = await axios.post(
            OPENAI_API_URL,
            {
                model: OPENAI_MODEL,
                input: textoLimpio
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: TIMEOUT_MS
            }
        );
    } catch (error) {
        // Timeout
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            console.warn('⚠️ [ModerarTexto] Timeout llamando a OpenAI');
            return { ok: false, motivo: 'timeout' };
        }

        // Rate limit
        if (error.response && error.response.status === 429) {
            console.warn('⚠️ [ModerarTexto] Rate limit de OpenAI alcanzado');
            return { ok: false, motivo: 'servicio_no_disponible' };
        }

        // Otros errores
        console.error('❌ [ModerarTexto] Error de OpenAI:', error.message || error);
        return { ok: false, motivo: 'servicio_no_disponible' };
    }

    // 4) Interpretar respuesta
    const resultado = respuesta.data
        && Array.isArray(respuesta.data.results)
        && respuesta.data.results[0];

    if (!resultado) {
        console.warn('⚠️ [ModerarTexto] Respuesta inesperada de OpenAI');
        return { ok: false, motivo: 'servicio_no_disponible' };
    }

    const flagged = resultado.flagged === true;

    // 5) Si fue flagged, extraer categorías activadas
    if (flagged) {
        const categorias = [];

        if (resultado.categories) {
            Object.keys(resultado.categories).forEach((cat) => {
                if (resultado.categories[cat] === true) {
                    categorias.push(cat);
                }
            });
        }

        return {
            ok: false,
            motivo: 'contenido_no_permitido',
            categorias
        };
    }

    // 6) Todo bien
    return { ok: true, flagged: false };
}

// ================================================================
// EXPORT
// ================================================================

module.exports = { moderarTexto };