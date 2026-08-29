// ================================================================
// MIDDLEWARE/VALIDATION.JS
// VALIDACIÓN DE DATOS - SARIEL'S BACKEND
// ================================================================

const {
    body,
    validationResult
} = require('express-validator');

// ================================================================
// REGISTRO
// ================================================================

const validarRegistro = [

    body('email')
        .trim()
        .isEmail()
        .withMessage('El correo electrónico no es válido')
        .normalizeEmail(),

    body('password')
        .isString()
        .isLength({ min: 6, max: 128 })
        .withMessage('La contraseña debe tener entre 6 y 128 caracteres'),

    body('nombre')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('El nombre debe tener entre 2 y 50 caracteres')
];

// ================================================================
// LOGIN
// ================================================================

const validarLogin = [

    body('email')
        .trim()
        .isEmail()
        .withMessage('El correo electrónico no es válido')
        .normalizeEmail(),

    body('password')
        .isString()
        .notEmpty()
        .withMessage('La contraseña es obligatoria')
];

// ================================================================
// PAGOS
// ================================================================

const validarPago = [

    body('transmisionId')
        .notEmpty()
        .withMessage('transmisionId es obligatorio')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('transmisionId no es válido'),

    body('monto')
        .notEmpty()
        .withMessage('El monto es obligatorio')
        .isFloat({ min: 1, max: 1000000 })
        .withMessage('El monto debe estar entre 1 y 1,000,000'),

    body('metodo')
        .notEmpty()
        .withMessage('El método de pago es obligatorio')
        .isIn(['crypto', 'card', 'bank'])
        .withMessage('Método de pago no válido')
];

// ================================================================
// TRANSMISIÓN
// ================================================================

const validarTransmision = [

    body('titulo')
        .trim()
        .notEmpty()
        .withMessage('El título es obligatorio')
        .isLength({ min: 3, max: 100 })
        .withMessage('El título debe tener entre 3 y 100 caracteres'),

    body('descripcion')
        .optional()
        .trim()
        .isLength({ max: 5000 })
        .withMessage('La descripción es demasiado larga'),

    body('tipo')
        .notEmpty()
        .withMessage('El tipo de transmisión es obligatorio')
        .isIn(['gratis', 'pago', 'suscripcion'])
        .withMessage('Tipo de transmisión no válido')
];

// ================================================================
// CONTACTOS
// ================================================================

const validarContacto = [

    body('contactoId')
        .notEmpty()
        .withMessage('contactoId es obligatorio')
        .isUUID()
        .withMessage('contactoId no es un UUID válido')
];

// ================================================================
// ERRORES DE VALIDACIÓN
// ================================================================

function verificarErrores(req, res, next) {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        return res.status(400).json({
            success: false,
            error: errores.array()[0].msg
        });
    }

    next();
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    validarRegistro,
    validarLogin,
    validarPago,
    validarTransmision,
    validarContacto,
    verificarErrores
};