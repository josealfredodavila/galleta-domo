// ================================================================
// VALIDACIÓN DE DATOS
// ================================================================

const { body, validationResult } = require('express-validator');

// Validación de registro
const validarRegistro = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('nombre').optional().trim().isLength({ min: 2, max: 50 })
];

// Validación de login
const validarLogin = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
];

// Validación de pago
const validarPago = [
    body('transmisionId').isNumeric(),
    body('monto').isNumeric().isFloat({ min: 1 }),
    body('metodo').isIn(['crypto', 'card', 'bank'])
];

// Validación de transmisión
const validarTransmision = [
    body('titulo').notEmpty().trim().isLength({ min: 3, max: 100 }),
    body('descripcion').optional().trim(),
    body('tipo').isIn(['gratis', 'pago', 'suscripcion'])
];

// Validación de contacto
const validarContacto = [
    body('contactoId').isUUID()
];

// Middleware para verificar errores de validación
function verificarErrores(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: errors.array()[0].msg,
            success: false
        });
    }
    next();
}

module.exports = {
    validarRegistro,
    validarLogin,
    validarPago,
    validarTransmision,
    validarContacto,
    verificarErrores
};