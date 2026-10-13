// ================================================================
// ROUTES/MODERAR-TEXTO.JS — Sariel's Ecosystem
// Endpoint para que el frontend modere texto ANTES de insertarlo
// ================================================================
// Endpoint:
//   POST /api/moderar-texto
//     body: { texto: string }
//     headers: { Authorization: Bearer <token> }
//
// Respuestas:
//   200 { ok: true }                             → texto limpio
//   422 { ok: false, error: "..." }              → texto bloqueado
//   400 { ok: false, error: "..." }              → falta texto
//   401 { ok: false, error: "..." }              → sin auth
//   503 { ok: false, error: "..." }              → servicio no disponible
//
// Uso en frontend:
//   const r = await fetch('/api/moderar-texto', {
//     method: 'POST',
//     headers: {
//       'Authorization': 'Bearer ' + token,
//       'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({ texto: contenido })
//   });
//   const data = await r.json();
//   if (!data.ok) {
//     showToast(data.error);
//     return;
//   }
//   // Si pasa, insertar normalmente
// ================================================================

'use strict';

const express = require('express');

const { verificarToken } = require('../middleware/auth');
const { moderarTexto } = require('../services/moderacion/moderarTexto');

const router = express.Router();

// ================================================================
// POST /api/moderar-texto
// ================================================================

router.post('/', verificarToken, async (req, res) => {
    try {
        // 1) Validar autenticación
        const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);

        if (!usuarioId) {
            return res.status(401).json({
                ok: false,
                error: 'No autenticado'
            });
        }

        // 2) Validar body
        const texto = req.body && req.body.texto;

        if (!texto || typeof texto !== 'string') {
            return res.status(400).json({
                ok: false,
                error: 'Falta el campo "texto"'
            });
        }

        // 3) Moderar
        const resultado = await moderarTexto(texto);

        // 4) Interpretar resultado
        if (resultado.ok) {
            return res.status(200).json({
                ok: true,
                flagged: false
            });
        }

        // 5) Manejar cada motivo
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
            return res.status(400).json({
                ok: false,
                error: 'El texto está vacío'
            });
        }

        // Fallback
        return res.status(422).json({
            ok: false,
            error: 'Este mensaje no se puede enviar por incumplir las normas de la comunidad.'
        });

    } catch (error) {
        console.error('❌ [moderar-texto] Error:', error.message || error);
        return res.status(503).json({
            ok: false,
            error: 'El servicio de moderación no está disponible. Intenta de nuevo.'
        });
    }
});

// ================================================================
// EXPORT
// ================================================================

module.exports = router;