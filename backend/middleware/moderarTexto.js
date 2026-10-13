// ================================================================
// MIDDLEWARE/MODERARTEXTO.JS — Sariel's Ecosystem
// Middleware de Express para moderar texto en cualquier endpoint
// ================================================================
// Uso:
//   const { moderarTextoMiddleware } = require('../middleware/moderarTexto');
//   router.post('/comentarios', verificarToken, moderarTextoMiddleware, handler);
//
// Cómo funciona:
//   - Extrae texto de req.body de los campos: mensaje, contenido,
//     texto, comentario, descripcion.
//   - Si hay texto, lo modera con OpenAI.
//   - Si está flagged → 422.
//   - Si el servicio falla → 503 (fail closed).
//   - Si pasa → next().
//
// IMPORTANTE:
//   - Este middleware NO reemplaza la moderación a nivel DB.
//   - Solo modera endpoints que pasan por el backend.
//   - Para modera lo que inserta el frontend directo, se necesita
//     un trigger en la DB (pendiente).
// ================================================================

'use strict';

const { moderarTexto } = require('../services/moderacion/moderarTexto');

// Campos donde buscamos texto a moderar
const CAMPOS_TEXTO = [
    'mensaje',
    'contenido',
    'texto',
    'comentario',
    'descripcion'
];

// ================================================================
// EXTRAER TEXTO DEL BODY
// ================================================================

function extraerTexto(body) {
    if (!body || typeof body !== 'object') return null;

    for (const campo of CAMPOS_TEXTO) {
        const valor = body[campo];

        if (typeof valor === 'string' && valor.trim().length > 0) {
            return valor;
        }
    }

    return null;
}

// ================================================================
// MIDDLEWARE
// ================================================================

async function moderarTextoMiddleware(req, res, next) {
    try {
        // 1) Extraer texto del body
        const texto = extraerTexto(req.body);

        // 2) Si no hay texto, no moderar (el endpoint lo manejará)
        if (!texto) {
            return next();
        }

        // 3) Moderar
        const resultado = await moderarTexto(texto);

        // 4) Interpretar resultado
        if (resultado.ok) {
            return next();
        }

        // 5) Rechazar según el motivo
        if (resultado.motivo === 'contenido_no_permitido') {
            return res.status(422).json({
                ok: false,
                error: 'Este mensaje no se puede enviar por incumplir las normas de la comunidad.'
            });
        }

        if (resultado.motivo === 'timeout' || resultado.motivo === 'servicio_no_disponible') {
            return res.status(503).json({
                ok: false,
                error: 'El servicio de moderación no está disponible. Intenta de nuevo.'
            });
        }

        if (resultado.motivo === 'texto_vacio') {
            return next();
        }

        // Fallback
        return res.status(422).json({
            ok: false,
            error: 'Este mensaje no se puede enviar por incumplir las normas de la comunidad.'
        });

    } catch (error) {
        console.error('❌ [moderarTextoMiddleware] Error:', error.message || error);
        return res.status(503).json({
            ok: false,
            error: 'El servicio de moderación no está disponible. Intenta de nuevo.'
        });
    }
}

// ================================================================
// EXPORT
// ================================================================

module.exports = { moderarTextoMiddleware };