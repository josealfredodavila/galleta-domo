// ================================================================
// ROUTES/PAY/WEBHOOKS.JS
// CSARIEL'S PAY - ROUTER DE WEBHOOKS CON LIBERACIÓN INSTANTÁNEA
// ================================================================
// Endpoints:
//   POST /api/pay/webhooks/stripe
//   POST /api/pay/webhooks/fintoc
//   POST /api/pay/webhooks/nowpayments
//
// NOVEDAD:
//   Cuando un webhook confirma un pago, además de acreditar el saldo
//   a pendiente_mxn (vía pay_confirmar_intencion), se llama
//   INMEDIATAMENTE a pay_liberar_saldo para mover el saldo a
//   disponible_mxn.
//
//   Resultado: el vendedor puede retirar en cuanto el webhook llega.
//   Sin esperar job, sin esperar admin.
//
// Reglas:
//   - El frontend NUNCA confirma pagos. Solo los webhooks lo hacen.
//   - La firma se verifica en el adapter correspondiente.
//   - La idempotencia la maneja pay_webhook_events (UNIQUE).
//   - Errores reintentables -> 500 (el proveedor reintenta).
//   - Errores permanentes -> 200 con noRetry (deja de reintentar).
//
// req.rawBody ya está disponible: server.js lo capturó con el
// verify de express.json().
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
 * Libera el saldo pendiente después de confirmar un pago.
 * Llama a la RPC pay_liberar_saldo con la cuenta y el monto.
 *
 * IMPORTANTE: si esta función falla, NO rompemos el webhook.
 * El pago ya está confirmado. La liberación es un paso secundario.
 */
async function liberarSaldoDeIntencion(resultado) {
    try {
        const { supabaseAdmin } = require('../../config/supabase');

        if (!supabaseAdmin) {
            logger.warning('[Pay Webhook] supabaseAdmin no disponible, no se puede liberar saldo');
            return { ok: false, motivo: 'supabase_no_configurado' };
        }

        // Extraer datos del resultado del Core
        // El Core debe devolver cuenta_receptora_id y monto_confirmado
        const cuentaId = resultado.cuenta_receptora_id;
        const montoConfirmado = resultado.monto_confirmado;

        if (!cuentaId || !montoConfirmado) {
            logger.warning(
                `[Pay Webhook] Core no devolvió cuenta_receptora_id o monto_confirmado. ` +
                `No se puede liberar saldo automáticamente. ` +
                `Intención: ${resultado.intencion_id || 'desconocida'}`
            );
            return { ok: false, motivo: 'datos_faltantes' };
        }

        const monto = Number(montoConfirmado);

        if (!Number.isFinite(monto) || monto <= 0) {
            logger.warning(`[Pay Webhook] Monto inválido para liberar: ${montoConfirmado}`);
            return { ok: false, motivo: 'monto_invalido' };
        }

        // Llamar a la RPC
        const { data, error } = await supabaseAdmin.rpc('pay_liberar_saldo', {
            p_cuenta_id: cuentaId,
            p_monto_mxn: monto
        });

        if (error) {
            logger.error(
                `[Pay Webhook] Error liberando saldo para cuenta ${cuentaId}: ${error.message}`
            );
            return { ok: false, motivo: 'rpc_error', error: error.message };
        }

        logger.info(
            `[Pay Webhook] Saldo liberado: cuenta=${cuentaId} monto=${monto} ` +
            `intencion=${resultado.intencion_id || 'desconocida'}`
        );

        return { ok: true, monto_liberado: monto, data: data };
    } catch (err) {
        logger.error(`[Pay Webhook] Excepción liberando saldo: ${err.message}`);
        return { ok: false, motivo: 'excepcion', error: err.message };
    }
}

// ================================================================
// HELPERS DE HTTP STATUS
// ================================================================

/**
 * Procesa un webhook de cualquier proveedor.
 * Delega al Core, decide el HTTP status, loggea todo.
 * Y si confirma pago, libera el saldo inmediatamente.
 */
async function manejarWebhook(proveedor, req, res) {
    const inicio = Date.now();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';

    const logTag = `[Pay Webhook/${proveedor}]`;

    try {
        // ---------- Delegar al Core ----------
        const resultado = await core.procesarWebhook(proveedor, req);

        const duracion = Date.now() - inicio;

        // ---------- Si confirmó intención, liberar saldo INMEDIATAMENTE ----------
        let liberacion = null;

        if (
            resultado.status === 'ok' &&
            resultado.accion === 'intencion_confirmada' &&
            resultado.intencion_id
        ) {
            liberacion = await liberarSaldoDeIntencion(resultado);

            if (liberacion.ok) {
                logger.info(
                    `${logTag} Saldo liberado automáticamente ` +
                    `(monto: ${liberacion.monto_liberado})`
                );
            } else {
                logger.warning(
                    `${logTag} No se pudo liberar el saldo automáticamente: ${liberacion.motivo}`
                );
            }
        }

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
                event_id: resultado.event_id,
                liberacion: liberacion ? liberacion.ok : null
            });
        }

        if (resultado.status === 'duplicado') {
            logger.info(
                `${logTag} DUPLICADO (${duracion}ms) event=${resultado.event_id}`
            );

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

        // Status inesperado
        logger.warning(`${logTag} Status inesperado: ${resultado.status}`);

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
                return res.status(500).json({
                    received: false,
                    status: 'error_reintentable',
                    proveedor: proveedor,
                    code: err.code
                });
            }

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