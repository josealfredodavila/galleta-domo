// ================================================================
// RATE LIMITING - PROTECCIÓN CONTRA DDoS
// ================================================================

const rateLimit = require('express-rate-limit');

// Límite general para todas las rutas
const limitadorGeneral = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 peticiones por IP
    message: {
        error: 'Demasiadas peticiones, intenta de nuevo más tarde',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Límite más estricto para autenticación
const limitadorAuth = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // 10 intentos por IP
    message: {
        error: 'Demasiados intentos de inicio de sesión, intenta de nuevo más tarde',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Límite para pagos
const limitadorPagos = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, // 5 pagos por IP
    message: {
        error: 'Demasiados intentos de pago, intenta de nuevo más tarde',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Límite para webhooks (IPN)
const limitadorWebhook = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 100, // 100 webhooks por IP
    message: {
        error: 'Demasiadas notificaciones, intenta de nuevo más tarde',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    limitadorGeneral,
    limitadorAuth,
    limitadorPagos,
    limitadorWebhook
};