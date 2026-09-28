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
//
// Los webhooks van al final. NO usan express.raw(), sino que
// aprovechan req.rawBody capturado por express.json({ verify })
// en server.js.
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const logger = require('../../utils/logger');

// ================================================================
// CARGA DE SUB-ROUTERS (con protección)
// ================================================================
// Envolvemos cada require en try/catch para que si UNO falla,
// los demás sigan funcionando y solo se reporte ese error.

const routersCargados = {
    intenciones: false,
    cuentas: false,
    retiros: false,
    stripeConnect: false,
    webhooks: false
};

let intencionesRouter = null;
let cuentasRouter = null;
let retirosRouter = null;
let stripeConnectRouter = null;
let webhooksRouter = null;

try {
    intencionesRouter = require('./intenciones');
    routersCargados.intenciones = true;
} catch (err) {
    logger.error(`[Pay Index] ❌ No se pudo cargar ./intenciones: ${err.message}`);
}

try {
    cuentasRouter = require('./cuentas');
    routersCargados.cuentas = true;
} catch (err) {
    logger.error(`[Pay Index] ❌ No se pudo cargar ./cuentas: ${err.message}`);
}

try {
    retirosRouter = require('./retiros');
    routersCargados.retiros = true;
} catch (err) {
    logger.error(`[Pay Index] ❌ No se pudo cargar ./retiros: ${err.message}`);
}

try {
    stripeConnectRouter = require('./stripe-connect');
    routersCargados.stripeConnect = true;
} catch (err) {
    logger.error(`[Pay Index] ❌ No se pudo cargar ./stripe-connect: ${err.message}`);
}

try {
    webhooksRouter = require('./webhooks');
    routersCargados.webhooks = true;
} catch (err) {
    logger.error(`[Pay Index] ❌ No se pudo cargar ./webhooks: ${err.message}`);
}

// ================================================================
// SERVICIOS AUXILIARES (con protección)
// ================================================================

let paisesService = null;
try {
    paisesService = require('../../services/pay/geo/paises');
} catch (err) {
    logger.error(
        `[Pay Index] ❌ No se pudo cargar services/pay/geo/paises: ${err.message}`
    );
}

let errorsService = null;
try {
    errorsService = require('../../services/pay/errors');
} catch (err) {
    logger.error(
        `[Pay Index] ❌ No se pudo cargar services/pay/errors: ${err.message}`
    );
}

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
            servicio: "Csariel's Pay",
            version: '1.0.0',
            proveedores: {
                stripe: Boolean(process.env.STRIPE_SECRET_KEY),
                fintoc: Boolean(process.env.FINTOC_SECRET_KEY),
                nowpayments: Boolean(process.env.NOWPAYMENTS_API_KEY)
            },
            routers_cargados: routersCargados,
            servicios_auxiliares: {
                paises: Boolean(paisesService),
                errors: Boolean(errorsService)
            },
            timestamp: new Date().toISOString()
        }
    });
});

// ================================================================
// MONTAJE DE SUB-ROUTERS
// ================================================================

if (intencionesRouter) {
    router.use('/intenciones', intencionesRouter);
    // Alias para comodidad: /api/pay/mis-intenciones → /api/pay/intenciones/mias
    // NOTA: el alias real está definido dentro de intenciones.js para
    // evitar duplicación de lógica.
}

if (cuentasRouter) {
    router.use('/cuentas', cuentasRouter);
}

if (retirosRouter) {
    router.use('/retiros', retirosRouter);
}

if (stripeConnectRouter) {
    router.use('/stripe-connect', stripeConnectRouter);
}

// ================================================================
// RUTAS AMIGABLES
// ================================================================

// GET /api/pay/metodos-disponibles?pais=MX
router.get('/metodos-disponibles', async function (req, res) {
    try {
        if (!paisesService) {
            return res.status(503).json({
                success: false,
                error: 'Servicio de países no disponible'
            });
        }

        const codigoPais =
            paisesService.normalizarCodigoPais(req.query.pais) ||
            paisesService.PAIS_POR_DEFECTO;

        if (!paisesService.esPaisSoportado(codigoPais)) {
            return res.status(400).json({
                success: false,
                error: `El país ${codigoPais} no está disponible en Csariel's Pay`
            });
        }

        const metodos = paisesService.metodosDisponiblesConProveedor(codigoPais);
        const config = paisesService.obtenerPais(codigoPais);

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
});

// ================================================================
// WEBHOOKS (al final, con sus propios middlewares)
// ================================================================

if (webhooksRouter) {
    router.use('/webhooks', webhooksRouter);
}

// ================================================================
// 404 DEL MÓDULO PAY
// ================================================================

router.use(function (req, res) {
    return res.status(404).json({
        success: false,
        error: "Endpoint de Csariel's Pay no encontrado"
    });
});

// ================================================================
// ERROR HANDLER DEL MÓDULO PAY
// ================================================================

router.use(function (err, req, res, next) {
    logger.error(`[Pay] Error global: ${err && err.message ? err.message : err}`);

    if (errorsService && typeof errorsService.responderError === 'function') {
        try {
            return errorsService.responderError(res, err);
        } catch (errFormat) {
            logger.error(`[Pay] responderError falló: ${errFormat.message}`);
        }
    }

    if (res.headersSent) {
        return next(err);
    }

    return res.status(500).json({
        success: false,
        error: "Error interno de Csariel's Pay"
    });
});

module.exports = router;