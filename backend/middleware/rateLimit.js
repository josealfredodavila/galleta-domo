// ================================================================
// MIDDLEWARE/RATELIMIT.JS
// RATE LIMITING - PROTECCIÓN DEL BACKEND SARIEL'S
// ================================================================

const rateLimit = require('express-rate-limit');

// ================================================================
// CONFIGURACIÓN GENERAL
// ================================================================

const limitadorGeneral = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'Demasiadas peticiones. Intenta nuevamente más tarde.'
    }
});

// ================================================================
// AUTENTICACIÓN
// ================================================================

const limitadorAuth = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'Demasiados intentos de autenticación. Intenta nuevamente más tarde.'
    }
});

// ================================================================
// PAGOS
// ================================================================

const limitadorPagos = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'Se alcanzó el límite temporal de operaciones de pago.'
    }
});

// ================================================================
// WEBHOOKS
// ================================================================

const limitadorWebhook = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'Demasiadas notificaciones recibidas. Intenta nuevamente más tarde.'
    }
});

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    limitadorGeneral,
    limitadorAuth,
    limitadorPagos,
    limitadorWebhook
};