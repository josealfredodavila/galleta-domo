// ================================================================
// ROUTES/PAY/INDEX.JS
// CSARIEL'S PAY - ROUTER RAÍZ
// ================================================================
// Se monta en server.js como:
//   app.use('/api/pay', require('./routes/pay'));
//
// Agrupa los sub-routers:
//   /intenciones     -> intenciones.js
//   /cuentas         -> cuentas.js
//   /retiros         -> retiros.js
//   /stripe-connect  -> stripe-connect.js (onboarding Connect)
//   /webhooks        -> webhooks.js
//
// Rutas resultantes:
//   POST   /api/pay/intenciones
//   GET    /api/pay/intenciones/:publicToken  (pública)
//   GET    /api/pay/mis-intenciones
//   POST   /api/pay/intenciones/:id/cancelar
//   GET    /api/pay/cuentas/mi-cuenta
//   GET    /api/pay/cuentas/mi-cuenta/saldos
//   GET    /api/pay/cuentas/mi-cuenta/movimientos
//   GET    /api/pay/cuentas/mi-cuenta/resumen
//   GET    /api/pay/metodos-disponibles
//   POST   /api/pay/retiros
//   GET    /api/pay/retiros
//   GET    /api/pay/retiros/:id
//   GET    /api/pay/stripe-connect/estado
//   POST   /api/pay/stripe-connect/onboarding
//   POST   /api/pay/webhooks/stripe
//   POST   /api/pay/webhooks/fintoc
//   POST   /api/pay/webhooks/nowpayments
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const logger = require('../../utils/logger');

// ================================================================
// SUB-ROUTERS
// ================================================================

const intencionesRouter = require('./intenciones');
const cuentasRouter = require('./cuentas');
const retirosRouter = require('./retiros');
const stripeConnectRouter = require('./stripe-connect');
const webhooksRouter = require('./webhooks');

// ================================================================
// HEALTH CHECK DEL MÓDULO PAY
// ================================================================
// Verifica que el módulo de Pay cargó correctamente.
// Es público (sin auth) porque es solo diagnóstico.
// ================================================================

router.get('/health', function (req, res) {
    return res.status(200).json({
        success: true,
        data: {
            servicio: 'Csariel\'s Pay',
            version: '1.0.0',
            proveedores: {
                stripe: Boolean(process.env.STRIPE_SECRET_KEY),
                fintoc: Boolean(process.env.FINTOC_SECRET_KEY),
                nowpayments: Boolean(process.env.NOWPAYMENTS_API_KEY)
            },
            timestamp: new Date().toISOString()
        }
    });
});

// ================================================================
// MONTAJE DE SUB-ROUTERS
// ================================================================
// El orden importa: los webhooks van al final porque
// usan express.raw() y no deben ser interceptados por
// el express.json() global.
// ================================================================

router.use('/intenciones', intencionesRouter);
router.use('/cuentas', cuentasRouter);
router.use('/retiros', retirosRouter);
router.use('/stripe-connect', stripeConnectRouter);

// Rutas amigables (sin necesidad de /cuentas/... para lo más común)
const { verificarToken } = require('../../middleware/auth');

// GET /api/pay/metodos-disponibles?pais=MX
router.get(
    '/metodos-disponibles',
    async function (req, res) {
        try {
            const paises = require('../../services/pay/geo/paises');
            const codigoPais = paises.normalizarCodigoPais(req.query.pais)
                || paises.PAIS_POR_DEFECTO;

            if (!paises.esPaisSoportado(codigoPais)) {
                return res.status(400).json({
                    success: false,
                    error: `El país ${codigoPais} no está disponible en Csariel's Pay`
                });
            }

            const metodos = paises.metodosDisponiblesConProveedor(codigoPais);
            const config = paises.obtenerPais(codigoPais);

            return res.status(200).json({
                success: true,
                data: {
                    pais: codigoPais,
                    moneda_local: config.moneda_local,
                    metodos: metodos
                }
            });
        } catch (err) {
            logger.error(`[Pay] Error en /metodos-disponibles: ${err.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error interno'
            });
        }
    }
);

// GET /api/pay/mis-intenciones -> alias de /intenciones (ver intenciones.js)
// Se resuelve con un middleware que redirige internamente.
router.use('/mis-intenciones', function (req, res, next) {
    req.url = '/' + req.url.replace(/^\//, '');
    intencionesRouter(req, res, next);
});

// ================================================================
// WEBHOOKS (al final, con sus propios middlewares)
// ================================================================

router.use('/webhooks', webhooksRouter);

// ================================================================
// 404 DEL MÓDULO PAY
// ================================================================

router.use(function (req, res) {
    return res.status(404).json({
        success: false,
        error: 'Endpoint de Csariel\'s Pay no encontrado'
    });
});

// ================================================================
// ERROR HANDLER DEL MÓDULO PAY
// ================================================================
// Captura errores tipados del Core y responde con el formato
// estándar del proyecto.
// ================================================================

router.use(function (err, req, res, next) {
    // Si el error es del Core de Pay, dejar que su helper lo formatee
    try {
        const { responderError } = require('../../services/pay/errors');
        return responderError(res, err);
    } catch (errCarga) {
        logger.error(`[Pay] Error handler no disponible: ${errCarga.message}`);

        if (res.headersSent) {
            return next(err);
        }

        return res.status(500).json({
            success: false,
            error: 'Error interno de Csariel\'s Pay'
        });
    }
});

module.exports = router;