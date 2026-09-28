// ================================================================
// ROUTES/PAY/WEBHOOKS.JS
// CSARIEL'S PAY - ROUTER DE WEBHOOKS CON LIBERACIÓN INSTANTÁNEA
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
// verify de express.json().
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const logger = require('../../utils/logger');
const core = require('../../services/pay/core');
const errors = require('../../services/pay/errors');

// ================================================================
// VALIDACIÓN AL ARRANQUE
// ================================================================
// Cargamos supabaseAdmin una sola vez, al arrancar el módulo.
// Si no está disponible, lo loggeamos con fuerza.

let supabaseAdmin = null;
try {
    const moduloSupabase = require('../../config/supabase');
    supabaseAdmin = moduloSupabase.supabaseAdmin || null;

    if (!supabaseAdmin) {
        logger.error(
            '[Pay Webhook] ⚠️ config/supabase no exporta supabaseAdmin. ' +
            'La liberación automática de saldo NO funcionará.'
        );
    }
} catch (err) {
    logger.error(
        `[Pay Webhook] ⚠️ No se pudo cargar config/supabase: ${err.message}. ` +
        'La liberación automática de saldo NO funcionará.'
    );
}

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
        if (!supabaseAdmin) {
            logger.warn(
                '[Pay Webhook] supabaseAdmin no disponible, no se puede liberar saldo'
            );
            return { ok: false, motivo: 'supabase_no_configurado' };
        }

        const cuentaId = resultado.cuenta_receptora_id;
        const montoConfirmado = resultado.monto_confirmado;

        if (!cuentaId || !montoConfirmado) {
            logger.warn(
                `[Pay Webhook] Core no devolvió cuenta_receptora_id o monto_confirmado. ` +
                `No se puede liberar saldo automáticamente. ` +
                `Intención: ${resultado.intencion_id || 'desconocida'}`
            );
            return { ok: false, motivo: 'datos_faltantes' };
        }

        const monto = Number(montoConfirmado);

        if (!Number.isFinite(monto) || monto <= 0) {
            logger.warn(`[Pay Webhook] Monto inválido para liberar: ${montoConfirmado}`);
            return { ok: false, motivo: 'monto_invalido' };
        }

        const { data, error } = await supabaseAdmin.rpc('pay_liberar_saldo', {
            p_cuenta_id: cuentaId,
            p_monto_mxn: monto
        });

        if (error) {
            // Si la RPC no existe, mensaje claro
            if (
                error.code === '42883' ||
                (error.message && error.message.includes('does not exist'))
            ) {
                logger.error(
                    '[Pay Webhook] ❌ La función RPC "pay_liberar_saldo" NO existe en Supabase. ' +
                    'Créala en SQL Editor para que la liberación automática funcione.'
                );
                return { ok: false, motivo: 'rpc_no_existe', error: error.message };
            }

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

async function manejarWebhook(proveedor, req, res) {
    const inicio = Date.now();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';

    const logTag = `[Pay Webhook/${proveedor}]`;

    try {
        // ---------- Delegar al Core ----------
        const resultado = await core.procesarWebhook(proveedor, req);

        const duracion = Date.now() - inicio;

        // Validación defensiva del resultado
        if (!resultado || typeof resultado !== 'object') {
            logger.error(`${logTag} core.procesarWebhook devolvió un valor inválido`);

            return res.status(500).json({
                received: false,
                status: 'error',
                proveedor: proveedor,
                error: 'Respuesta inválida del Core'
            });
        }

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
                logger.warn(
                    `${logTag} No se pudo liberar el saldo automáticamente: ${liberacion.motivo}`
                );
            }
        }

        // ---------- Decidir HTTP status ----------
        if (resultado.status === 'ok') {
            if (!resultado.event_id) {
                logger.warn(`${logTag} status=ok pero sin event_id (posible bug en Core)`);
            }

            logger.info(
                `${logTag} OK (${duracion}ms) event=${resultado.event_id || 'N/A'} ` +
                `accion=${resultado.accion || 'ninguna'} ip=${ip}`
            );

            return res.status(200).json({
                received: true,
                status: 'ok',
                proveedor: proveedor,
                event_id: resultado.event_id || null,
                liberacion: liberacion ? liberacion.ok : null
            });
        }

        if (resultado.status === 'duplicado') {
            logger.info(
                `${logTag} DUPLICADO (${duracion}ms) event=${resultado.event_id || 'N/A'}`
            );

            return res.status(200).json({
                received: true,
                status: 'duplicado',
                proveedor: proveedor,
                event_id: resultado.event_id || null
            });
        }

        if (resultado.status === 'ignorado') {
            logger.info(
                `${logTag} IGNORADO (${duracion}ms) event=${resultado.event_id || 'N/A'} ` +
                `motivo=${resultado.motivo || 'no_relevante'}`
            );

            return res.status(200).json({
                received: true,
                status: 'ignorado',
                proveedor: proveedor,
                event_id: resultado.event_id || null,
                motivo: resultado.motivo || null
            });
        }

        // Status inesperado
        logger.warn(`${logTag} Status inesperado: ${resultado.status}`);

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
            logger.warn(
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
            logger.warn(
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
        const ErrorClase = errors && errors.ErrorCsarielsPay;

        if (typeof ErrorClase === 'function' && err instanceof ErrorClase) {
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
// ENDPOINTS
// ================================================================

router.post('/stripe', async function (req, res) {
    return manejarWebhook('stripe', req, res);
});

router.post('/fintoc', async function (req, res) {
    return manejarWebhook('fintoc', req, res);
});

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