// ================================================================
// ROUTES/PAY/WEBHOOKS.JS
// CSARIEL'S PAY - ROUTER DE WEBHOOKS
// ================================================================
// Endpoints:
//   POST /api/pay/webhooks/stripe
//   POST /api/pay/webhooks/fintoc
//   POST /api/pay/webhooks/nowpayments
//
// Reglas:
//   - El frontend NUNCA confirma pagos. Solo los webhooks lo hacen.
//   - La firma se verifica en el adapter correspondiente.
//   - La idempotencia la maneja pay_webhook_events (UNIQUE).
//   - Errores reintentables -> 500 (el proveedor reintenta).
//   - Errores permanentes -> 200 con noRetry (deja de reintentar).
//
// req.rawBody ya está disponible: server.js lo capturó con el
// verify de express.json(). No hace falta express.raw() aquí.
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const logger = require('../../utils/logger');
const core = require('../../services/pay/core');
const errors = require('../../services/pay/errors');

// ================================================================
// HELPERS INTERNOS
// ================================================================

/**
 * Procesa un webhook de cualquier proveedor.
 * Delega al Core, decide el HTTP status, loggea todo.
 */
async function manejarWebhook(proveedor, req, res) {
    const inicio = Date.now();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';

    // Identificador de log (útil para correlacionar)
    const logTag = `[Pay Webhook/${proveedor}]`;

    try {
        // ---------- Delegar al Core ----------
        const resultado = await core.procesarWebhook(proveedor, req);

        const duracion = Date.now() - inicio;

        // ---------- Decidir HTTP status ----------
        if (resultado.status === 'ok') {
            logger.info(
                `${logTag} OK (${duracion}ms) event=${resultado.event_id} ` +
                `accion=${resultado.accion || 'ninguna'} ip=${ip}`
            );

            return res.status(200).json({
                received: true,
                status: 'ok',
                proveedor: proveedor,
                event_id: resultado.event_id
            });
        }

        if (resultado.status === 'duplicado') {
            logger.info(
                `${logTag} DUPLICADO (${duracion}ms) event=${resultado.event_id}`
            );

            // 200 para que el proveedor deje de reintentar
            return res.status(200).json({
                received: true,
                status: 'duplicado',
                proveedor: proveedor,
                event_id: resultado.event_id
            });
        }

        if (resultado.status === 'ignorado') {
            logger.info(
                `${logTag} IGNORADO (${duracion}ms) event=${resultado.event_id} ` +
                `motivo=${resultado.motivo || 'no_relevante'}`
            );

            return res.status(200).json({
                received: true,
                status: 'ignorado',
                proveedor: proveedor,
                event_id: resultado.event_id,
                motivo: resultado.motivo || null
            });
        }

        // Status inesperado: tratar como error temporal
        logger.warning(
            `${logTag} Status inesperado: ${resultado.status}`
        );

        return res.status(500).json({
            received: false,
            status: 'error',
            proveedor: proveedor,
            error: 'Estado de procesamiento desconocido'
        });

    } catch (err) {
        const duracion = Date.now() - inicio;

        // ---------- Error de firma: 401 ----------
        if (err && err.code === 'FIRMA_INVALIDA') {
            logger.warning(
                `${logTag} FIRMA INVÁLIDA (${duracion}ms) ip=${ip} ua=${userAgent}`
            );

            return res.status(401).json({
                received: false,
                status: 'firma_invalida',
                proveedor: proveedor
            });
        }

        // ---------- Error de payload: 400 ----------
        if (err && (
            err.code === 'WEBHOOK_PAYLOAD_INVALIDO' ||
            err.code === 'PARAMETRO_REQUERIDO'
        )) {
            logger.warning(
                `${logTag} PAYLOAD INVÁLIDO (${duracion}ms) motivo=${err.message}`
            );

            return res.status(400).json({
                received: false,
                status: 'payload_invalido',
                proveedor: proveedor,
                error: err.message
            });
        }

        // ---------- Error tipado del Core ----------
        if (err instanceof errors.ErrorCsarielsPay) {
            const reintentable = err.reintentable === true;

            logger.error(
                `${logTag} ${reintentable ? 'REINTENTABLE' : 'PERMANENTE'} ` +
                `(${duracion}ms) code=${err.code} msg=${err.message}`
            );

            if (reintentable) {
                // 500 para que el proveedor reintente
                return res.status(500).json({
                    received: false,
                    status: 'error_reintentable',
                    proveedor: proveedor,
                    code: err.code
                });
            }

            // 200 con noRetry para que el proveedor deje de reintentar
            // (el error no se va a resolver con más intentos)
            return res.status(200).json({
                received: true,
                status: 'error_permanente',
                proveedor: proveedor,
                code: err.code,
                noRetry: true
            });
        }

        // ---------- Error desconocido: 500 para reintentar ----------
        logger.error(
            `${logTag} ERROR DESCONOCIDO (${duracion}ms) ` +
            `msg=${err && err.message ? err.message : 'sin mensaje'}`
        );

        // No exponer stack ni detalles internos
        return res.status(500).json({
            received: false,
            status: 'error',
            proveedor: proveedor
        });
    }
}

// ================================================================
// POST /api/pay/webhooks/stripe
// ================================================================

router.post('/stripe', async function (req, res) {
    return manejarWebhook('stripe', req, res);
});

// ================================================================
// POST /api/pay/webhooks/fintoc
// ================================================================

router.post('/fintoc', async function (req, res) {
    return manejarWebhook('fintoc', req, res);
});

// ================================================================
// POST /api/pay/webhooks/nowpayments
// ================================================================

router.post('/nowpayments', async function (req, res) {
    return manejarWebhook('nowpayments', req, res);
});

// ================================================================
// 404 DEL SUB-ROUTER
// ================================================================

router.use(function (req, res) {
    return res.status(404).json({
        received: false,
        error: 'Webhook no encontrado'
    });
});

// ================================================================
// EXPORTAR
// ================================================================

module.exports = router;