// ================================================================
// MIDDLEWARE/RATELIMIT.JS — Csariel's
// Requiere app.set('trust proxy', 1) en server.js (Railway usa proxy),
// si no, req.ip es siempre la IP del proxy y todos comparten el límite.
// Pagos: se cuenta por usuario autenticado (req.usuario), no por IP.
// Webhooks: sin límite. NOWPayments reintenta, y un 429 podría perder IPNs.
// ================================================================

const rateLimit = require('express-rate-limit');

const base = { standardHeaders: true, legacyHeaders: false };

// Clave por usuario si hay sesión; si no, por IP. Usar después de verificarToken.
const clavePorUsuario = (req) => (req.usuario?.id ? `u:${req.usuario.id}` : `ip:${req.ip}`);

const limitadorGeneral = rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Demasiadas peticiones. Intenta nuevamente más tarde.' }
});

const limitadorAuth = rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Demasiados intentos de autenticación. Intenta nuevamente más tarde.' }
});

const limitadorPagos = rateLimit({
    ...base,
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyGenerator: clavePorUsuario,
    message: { success: false, error: 'Se alcanzó el límite temporal de operaciones de pago.' }
});

module.exports = {
    limitadorGeneral,
    limitadorAuth,
    limitadorPagos
};