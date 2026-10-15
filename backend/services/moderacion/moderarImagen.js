// ================================================================
// SERVICES/MODERACION/MODERARIMAGEN.JS
// Sariel's Ecosystem — Moderación de imágenes con OpenAI
// ================================================================
// Usa el endpoint de moderación de OpenAI (omni-moderation-latest),
// que acepta imágenes en base64. Reemplaza a AWS Rekognition.
//
// Uso:
//   const { moderarImagen } = require('../../services/moderacion/moderarImagen');
//   const resultado = await moderarImagen(buffer);
//   if (!resultado.ok) { /* rechazar */ }
//
// Contrato:
//   Entrada:  Buffer con bytes de imagen (JPEG, PNG o WebP)
//   Salida:   { ok: true }
//           | { ok: false, motivo: 'tipo_invalido' | 'tamano_invalido'
//                              | 'contenido_no_permitido' | 'timeout'
//                              | 'servicio_no_disponible',
//               detalle?: string, categorias?: array }
//
// Reglas:
//   - Detecta el tipo real por magic bytes (no confía en mimetype).
//   - Acepta JPEG, PNG y WebP.
//   - Tamaño máximo configurable vía MODERACION_MAX_BYTES (default 5 MB).
//   - Umbral configurable vía OPENAI_UMBRAL (default 0.8, escala 0 a 1).
//   - Fail closed: si OpenAI falla, responde con error y la subida se rechaza.
//   - Variables requeridas: OPENAI_API_KEY.
// ================================================================

'use strict';

// ================================================================
// CONFIGURACIÓN (leída desde process.env, nunca hardcodeada)
// ================================================================

const OPENAI_URL = 'https://api.openai.com/v1/moderations';
const MODELO = 'omni-moderation-latest';

const UMBRAL = Number(process.env.OPENAI_UMBRAL) || 0.8;

const MAX_BYTES = Number(process.env.MODERACION_MAX_BYTES) || (5 * 1024 * 1024);

const TIMEOUT_MS = Number(process.env.MODERACION_TIMEOUT_MS) || 10000;

// Categorías que BLOQUEAN la subida si su puntuación supera el umbral
const CATEGORIAS_BLOQUEADAS = new Set([
    'sexual',
    'sexual/minors',
    'violence',
    'violence/graphic',
    'hate',
    'hate/threatening',
    'harassment/threatening',
    'self-harm/intent',
    'self-harm/instructions',
    'illicit/violent'
]);

// Aviso al arrancar si falta la clave (no bloquea el arranque)
if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ [ModerarImagen] Falta OPENAI_API_KEY. Toda subida será rechazada.');
}

// ================================================================
// DETECCIÓN DE TIPO POR MAGIC BYTES
// ================================================================

function detectarTipo(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A &&
        buffer[6] === 0x1A && buffer[7] === 0x0A
    ) {
        return 'image/png';
    }

    // WebP: "RIFF" .... "WEBP"
    if (
        buffer[0] === 0x52 && buffer[1] === 0x49 &&
        buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 &&
        buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
        return 'image/webp';
    }

    return null;
}

// ================================================================
// LLAMADA A OPENAI CON TIMEOUT
// ================================================================

async function llamarOpenAI(buffer, mimeType) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

    try {
        const imagenBase64 = buffer.toString('base64');

        const respuesta = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MODELO,
                input: [
                    {
                        type: 'image_url',
                        image_url: { url: `data:${mimeType};base64,${imagenBase64}` }
                    }
                ]
            }),
            signal: controlador.signal
        });

        const datos = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            const codigo = (datos.error && datos.error.code) || (datos.error && datos.error.type) || 'desconocido';
            const mensaje = (datos.error && datos.error.message) || '';
            const error = new Error(`HTTP ${respuesta.status} ${codigo} ${mensaje}`);
            error.status = respuesta.status;
            error.codigo = codigo;
            throw error;
        }

        return datos;
    } finally {
        clearTimeout(temporizador);
    }
}

// ================================================================
// MODERAR IMAGEN
// ================================================================

/**
 * Modera un buffer de imagen con OpenAI.
 * @param {Buffer} buffer — bytes de la imagen
 * @returns {Promise<{ok: boolean, motivo?: string, detalle?: string, categorias?: array}>}
 */
async function moderarImagen(buffer) {
    // 1) Validar tipo real
    const tipo = detectarTipo(buffer);
    if (!tipo) {
        return { ok: false, motivo: 'tipo_invalido', detalle: 'Solo JPEG, PNG o WebP' };
    }

    // 2) Validar tamaño
    if (buffer.length > MAX_BYTES) {
        return {
            ok: false,
            motivo: 'tamano_invalido',
            detalle: `Supera ${Math.floor(MAX_BYTES / 1024 / 1024)} MB`
        };
    }

    // 3) Llamar a OpenAI
    let datos;
    try {
        datos = await llamarOpenAI(buffer, tipo);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ [ModerarImagen] Tiempo de espera agotado con OpenAI');
            return { ok: false, motivo: 'timeout' };
        }

        // Clave inválida, sin saldo, límite de uso o servicio caído: fail closed
        console.error(`❌ [ModerarImagen] Error de OpenAI: ${error.message}`);
        return { ok: false, motivo: 'servicio_no_disponible', detalle: error.codigo || 'error' };
    }

    // 4) Analizar resultado
    const resultado = Array.isArray(datos.results) ? datos.results[0] : null;

    if (!resultado || !resultado.category_scores) {
        console.error('❌ [ModerarImagen] Respuesta de OpenAI sin resultados');
        return { ok: false, motivo: 'servicio_no_disponible', detalle: 'respuesta_vacia' };
    }

    const puntuaciones = resultado.category_scores;

    const bloqueadas = Object.keys(puntuaciones).filter((categoria) => {
        return CATEGORIAS_BLOQUEADAS.has(categoria) && Number(puntuaciones[categoria]) >= UMBRAL;
    });

    // 5) Decisión
    if (bloqueadas.length > 0) {
        return {
            ok: false,
            motivo: 'contenido_no_permitido',
            categorias: bloqueadas.map((c) => ({
                categoria: c,
                puntuacion: Number(puntuaciones[c]).toFixed(2)
            }))
        };
    }

    return { ok: true };
}

// ================================================================
// EXPORT
// ================================================================

module.exports = { moderarImagen };
