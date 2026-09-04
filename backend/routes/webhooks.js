// ================================================================
// ROUTES/WEBHOOKS.JS
// WEBHOOKS - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const {
    supabaseAdmin
} = require('../config/supabase');

const {
    verificarHMAC
} = require('../utils/encryption');

const {
    limitadorWebhook
} = require('../middleware/rateLimit');

const logger = require('../utils/logger');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

if (!IPN_SECRET) {
    console.warn(
        '⚠️ NOWPAYMENTS_IPN_SECRET no configurado. ' +
        'El webhook NOWPayments estará inhabilitado hasta que se defina.'
    );
}

// ================================================================
// FUNCIONES AUXILIARES
// ================================================================

function esPagoFinalizado(status) {
    return status === 'finished';
}

function esPagoCancelado(status) {
    return [
        'failed',
        'refunded',
        'expired'
    ].includes(status);
}

function esPagoEnProceso(status) {
    return [
        'waiting',
        'confirming',
        'sending',
        'partially_paid',
        'confirmed'
    ].includes(status);
}

// ================================================================
// NOWPAYMENTS IPN
// ================================================================

router.post(
    '/nowpayments',
    limitadorWebhook,
    async (req, res) => {

        try {

            // ----------------------------------------------------
            // VALIDAR CONFIGURACIÓN
            // ----------------------------------------------------

            const secret =
                process.env.NOWPAYMENTS_IPN_SECRET;

            if (!secret) {

                logger.error(
                    'NOWPayments IPN recibido pero ' +
                    'NOWPAYMENTS_IPN_SECRET no está configurado'
                );

                return res.status(500).json({
                    success: false,
                    error: 'Webhook NOWPayments no configurado'
                });
            }

            if (!supabaseAdmin) {

                logger.error(
                    'NOWPayments IPN recibido pero ' +
                    'supabaseAdmin no está disponible'
                );

                return res.status(500).json({
                    success: false,
                    error: 'Servicio interno no configurado'
                });
            }

            // ----------------------------------------------------
            // PAYLOAD
            // ----------------------------------------------------

            const payload = req.body;

            const firmaRecibida =
                req.headers['x-nowpayments-sig'];

            if (
                !payload ||
                typeof payload !== 'object'
            ) {

                logger.warn(
                    'NOWPayments webhook rechazado: payload inválido'
                );

                return res.status(400).json({
                    success: false,
                    error: 'Payload inválido'
                });
            }

            if (!firmaRecibida) {

                logger.warn(
                    'NOWPayments webhook rechazado: falta firma'
                );

                return res.status(401).json({
                    success: false,
                    error: 'Firma requerida'
                });
            }

            // ----------------------------------------------------
            // VERIFICAR HMAC
            // ----------------------------------------------------

            const firmaValida =
                verificarHMAC(
                    payload,
                    firmaRecibida,
                    secret
                );

            if (!firmaValida) {

                logger.warn(
                    'NOWPayments webhook rechazado: firma inválida'
                );

                return res.status(401).json({
                    success: false,
                    error: 'Firma inválida'
                });
            }

            // ----------------------------------------------------
            // EXTRAER INFORMACIÓN
            // ----------------------------------------------------

            const ordenId =
                payload.order_id ||
                payload.data?.order_id;

            const paymentId =
                payload.payment_id ||
                payload.data?.payment_id;

            const paymentStatus =
                payload.payment_status ||
                payload.data?.payment_status;

            const payAmount =
                payload.pay_amount ||
                payload.data?.pay_amount ||
                null;

            const payCurrency =
                payload.pay_currency ||
                payload.data?.pay_currency ||
                null;

            if (!ordenId) {

                logger.warn(
                    'NOWPayments webhook rechazado: falta order_id'
                );

                return res.status(400).json({
                    success: false,
                    error: 'Falta order_id'
                });
            }

            logger.info(
                `NOWPayments IPN recibido | ` +
                `order_id=${ordenId} | ` +
                `payment_id=${paymentId || 'N/A'} | ` +
                `status=${paymentStatus || 'N/A'}`
            );

            // ====================================================
            // MURO - VENTA DE TOKENS
            // ====================================================

            if (
                typeof ordenId === 'string' &&
                ordenId.startsWith('muro_')
            ) {

                const ventaId =
                    Number(
                        ordenId.replace('muro_', '')
                    );

                if (
                    !Number.isInteger(ventaId) ||
                    ventaId <= 0
                ) {

                    logger.warn(
                        `Order ID Muro inválido: ${ordenId}`
                    );

                    return res.status(400).json({
                        success: false,
                        error: 'order_id de Muro inválido'
                    });
                }

                // ------------------------------------------------
                // BUSCAR VENTA
                // ------------------------------------------------

                const {
                    data: venta,
                    error: ventaError
                } = await supabaseAdmin
                    .from('muro_ventas_tokens')
                    .select('*')
                    .eq('id', ventaId)
                    .single();

                if (ventaError || !venta) {

                    logger.error(
                        `Venta Muro no encontrada: ${ventaId}`
                    );

                    return res.status(404).json({
                        success: false,
                        error: 'Venta Muro no encontrada'
                    });
                }

                // ------------------------------------------------
                // IDEMPOTENCIA
                // ------------------------------------------------

                if (
                    venta.estado === 'pagado' ||
                    venta.estado === 'completado'
                ) {

                    logger.info(
                        `Venta Muro ${ventaId} ya liquidada`
                    );

                    return res.status(200).json({
                        success: true,
                        message: 'Venta ya procesada'
                    });
                }

                // ------------------------------------------------
                // ACTUALIZAR DATOS DE NOWPAYMENTS
                // ------------------------------------------------

                const datosActualizacion = {
                    nowpayments_status:
                        paymentStatus || null
                };

                if (paymentId) {
                    datosActualizacion.payment_id =
                        String(paymentId);
                }

                if (payCurrency) {
                    datosActualizacion.moneda_pago =
                        String(payCurrency);
                }

                if (
                    payAmount !== null &&
                    Number.isFinite(Number(payAmount))
                ) {
                    datosActualizacion.precio_usdt =
                        Number(payAmount);
                }

                // ------------------------------------------------
                // ESTADO EN PROCESO
                // ------------------------------------------------

                if (
                    paymentStatus &&
                    esPagoEnProceso(paymentStatus)
                ) {

                    datosActualizacion.estado =
                        paymentStatus === 'confirming' ||
                        paymentStatus === 'sending'
                            ? 'confirmando'
                            : 'pagando';

                    const {
                        error: updateError
                    } = await supabaseAdmin
                        .from('muro_ventas_tokens')
                        .update(datosActualizacion)
                        .eq('id', ventaId)
                        .neq('estado', 'pagado');

                    if (updateError) {
                        throw updateError;
                    }

                    logger.info(
                        `Venta Muro ${ventaId} actualizada: ` +
                        `${paymentStatus}`
                    );

                    return res.status(200).json({
                        success: true,
                        message:
                            `Estado recibido: ${paymentStatus}`
                    });
                }

                // ------------------------------------------------
                // PAGO CANCELADO / FALLIDO
                // ------------------------------------------------

                if (
                    paymentStatus &&
                    esPagoCancelado(paymentStatus)
                ) {

                    datosActualizacion.estado =
                        'cancelado';

                    const {
                        error: cancelError
                    } = await supabaseAdmin
                        .from('muro_ventas_tokens')
                        .update(datosActualizacion)
                        .eq('id', ventaId)
                        .neq('estado', 'pagado');

                    if (cancelError) {
                        throw cancelError;
                    }

                    logger.warn(
                        `Venta Muro ${ventaId} ` +
                        `cancelada: ${paymentStatus}`
                    );

                    return res.status(200).json({
                        success: true,
                        message:
                            `Pago ${paymentStatus}`
                    });
                }

                // ------------------------------------------------
                // PAGO FINALIZADO
                // ------------------------------------------------

                if (
                    paymentStatus &&
                    esPagoFinalizado(paymentStatus)
                ) {

                    // --------------------------------------------
                    // Primero guardamos payment_id y estado
                    // --------------------------------------------

                    const {
                        error: updateError
                    } = await supabaseAdmin
                        .from('muro_ventas_tokens')
                        .update({
                            ...datosActualizacion,
                            estado: 'confirmando'
                        })
                        .eq('id', ventaId)
                        .neq('estado', 'pagado');

                    if (updateError) {
                        throw updateError;
                    }

                    // --------------------------------------------
                    // LIQUIDACIÓN ATÓMICA
                    // --------------------------------------------
                    //
                    // IMPORTANTE:
                    //
                    // Node.js NO modifica directamente:
                    //
                    // - saldo de tokens
                    // - inventario
                    // - cantidad disponible
                    //
                    // Todo eso lo realiza la RPC.
                    // --------------------------------------------

                    const {
                        data: resultado,
                        error: rpcError
                    } = await supabaseAdmin.rpc(
                        'liquidar_venta_token_muro',
                        {
                            p_venta_id: ventaId
                        }
                    );

                    if (rpcError) {

                        logger.error(
                            `Error liquidando venta Muro ` +
                            `${ventaId}: ${rpcError.message}`
                        );

                        return res.status(500).json({
                            success: false,
                            error:
                                'Pago recibido pero la liquidación ' +
                                'de tokens está pendiente'
                        });
                    }

                    logger.info(
                        `✅ Venta Muro ${ventaId} liquidada correctamente`
                    );

                    return res.status(200).json({
                        success: true,
                        message:
                            'Pago procesado y tokens liquidados',
                        data: resultado
                    });
                }

                // ------------------------------------------------
                // ESTADO DESCONOCIDO
                // ------------------------------------------------

                logger.warn(
                    `Estado NOWPayments desconocido ` +
                    `para venta ${ventaId}: ${paymentStatus}`
                );

                return res.status(200).json({
                    success: true,
                    message:
                        'Webhook recibido con estado no procesado'
                });
            }

            // ====================================================
            // PAGOS DE TRANSMISIÓN
            // ====================================================

            const {
                data: orden,
                error: ordenError
            } = await supabaseAdmin
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .single();

            if (ordenError || !orden) {

                logger.warn(
                    `Orden de transmisión no encontrada: ${ordenId}`
                );

                return res.status(404).json({
                    success: false,
                    error: 'Orden no encontrada'
                });
            }

            // ----------------------------------------------------
            // IDEMPOTENCIA
            // ----------------------------------------------------

            if (orden.estado === 'completado') {

                logger.info(
                    `Orden ${ordenId} ya había sido procesada`
                );

                return res.status(200).json({
                    success: true,
                    message: 'Pago ya procesado'
                });
            }

            // ----------------------------------------------------
            // ESTADOS NO FINALES
            // ----------------------------------------------------

            if (
                paymentStatus &&
                ![
                    'finished',
                    'confirmed'
                ].includes(paymentStatus)
            ) {

                logger.info(
                    `NOWPayments transmisión ${ordenId}: ` +
                    `${paymentStatus}`
                );

                return res.status(200).json({
                    success: true,
                    message:
                        `Estado recibido: ${paymentStatus}`
                });
            }

            // ----------------------------------------------------
            // ACTUALIZAR TRANSMISIÓN
            // ----------------------------------------------------

            const {
                data: ordenActualizada,
                error: updateError
            } = await supabaseAdmin
                .from('pagos_transmision')
                .update({
                    estado: 'completado',
                    pagado_en:
                        new Date().toISOString()
                })
                .eq('id', ordenId)
                .neq('estado', 'completado')
                .select()
                .single();

            if (updateError) {

                logger.error(
                    `Error actualizando orden ${ordenId}: ` +
                    updateError.message
                );

                throw updateError;
            }

            if (!ordenActualizada) {

                logger.info(
                    `Orden ${ordenId} ya había sido procesada`
                );

                return res.status(200).json({
                    success: true,
                    message: 'Pago ya procesado'
                });
            }

            logger.info(
                `✅ Pago NOWPayments completado: ${ordenId}` +
                `${paymentId
                    ? ` | payment_id: ${paymentId}`
                    : ''
                }`
            );

            return res.status(200).json({
                success: true,
                message: 'Pago procesado correctamente'
            });

        } catch (error) {

            logger.error(
                `❌ Error webhook NOWPayments: ` +
                `${error.message}`
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error interno procesando webhook'
            });
        }
    }
);

// ================================================================
// WEBHOOK SUPABASE
// ================================================================

router.post(
    '/supabase',
    limitadorWebhook,
    async (req, res) => {

        try {

            const payload = req.body;

            logger.info(
                `Webhook Supabase recibido: ` +
                `${payload?.table || 'desconocido'}`
            );

            if (
                payload?.table === 'usuarios' &&
                payload?.type === 'INSERT'
            ) {

                logger.info(
                    `Nuevo usuario registrado: ` +
                    `${payload.record?.email || 'sin email'}`
                );
            }

            return res.status(200).json({
                success: true
            });

        } catch (error) {

            logger.error(
                `Error webhook Supabase: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error interno del webhook'
            });
        }
    }
);

// ================================================================
// TEST
// ================================================================

router.get(
    '/test',
    (req, res) => {

        return res.status(200).json({
            success: true,
            message:
                'Webhook endpoint funcionando',
            timestamp:
                new Date().toISOString()
        });
    }
);

// ================================================================
// EXPORT
// ================================================================

module.exports = router;