// ================================================================
// ROUTES/WEBHOOKS.JS
// WEBHOOKS - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const { supabaseAdmin } = require('../config/supabase');
const { verificarHMAC } = require('../utils/encryption');
const { limitadorWebhook } = require('../middleware/rateLimit');
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
    return status === 'finished' || status === 'confirmed';
}

function esPagoCancelado(status) {
    return ['failed', 'refunded', 'expired', 'canceled'].includes(status);
}

function esPagoEnProceso(status) {
    return ['waiting', 'confirming', 'sending', 'partially_paid'].includes(status);
}

// ================================================================
// PROCESAR WEBHOOK DE MEMBRESÍA PRO
// ================================================================

async function procesarWebhookMembresia(payload) {
    try {
        const { order_id, payment_id, payment_status, price_amount, pay_address } = payload;

        logger.info('📩 Webhook membresía recibido:', { order_id, payment_status });

        if (!order_id) {
            logger.warn('⚠️ Webhook membresía: falta order_id');
            return { success: false, error: 'Falta order_id' };
        }

        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .select('id, usuario_id, estado')
            .eq('order_id', order_id)
            .single();

        if (pagoError || !pago) {
            logger.warn('❌ Pago de membresía no encontrado:', order_id);
            return { success: false, error: 'Pago no encontrado', order_id };
        }

        if (pago.estado === 'confirmado' || pago.estado === 'completado') {
            logger.info('ℹ️ Pago de membresía ya confirmado, ignorando:', order_id);
            return { success: true, message: 'Ya confirmado' };
        }

        await supabaseAdmin
            .from('pagos_membresia')
            .update({
                estado: payment_status || pago.estado,
                datos_webhook: payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', pago.id);

        if (esPagoFinalizado(payment_status)) {
            logger.info('✅ Pago de membresía confirmado:', order_id);

            const result = await supabaseAdmin.rpc('activar_membresia_pro', {
                p_usuario_id: pago.usuario_id,
                p_order_id: order_id,
                p_payment_id: payment_id || `webhook-${Date.now()}`,
                p_monto_mxn: price_amount || 20,
                p_pay_address: pay_address || null,
                p_privacy_version: '1.0'
            });

            if (result.error) {
                logger.error('❌ Error activando membresía:', result.error);
                return { success: false, error: result.error.message, order_id };
            }

            logger.info('✅ Membresía activada correctamente para:', pago.usuario_id);
            return { success: true, data: result.data, order_id };
        }

        if (esPagoCancelado(payment_status)) {
            logger.warn('⚠️ Pago de membresía cancelado:', order_id, '-', payment_status);
            await supabaseAdmin
                .from('pagos_membresia')
                .update({
                    estado: 'cancelado',
                    updated_at: new Date().toISOString()
                })
                .eq('id', pago.id);
            return { success: true, message: 'Pago cancelado', order_id };
        }

        logger.info('⏳ Pago de membresía en proceso:', order_id, '-', payment_status);
        return { success: true, message: 'Estado actualizado', order_id };

    } catch (error) {
        logger.error('❌ Error procesando webhook membresía:', error);
        return { success: false, error: error.message };
    }
}

// ================================================================
// PROCESAR WEBHOOK DE MURO (P2P)
// ================================================================
//
// Flujo:
// - waiting/confirming/sending/partially_paid → registrar_payment_muro()
// - failed/refunded/expired/canceled → cancelar_venta_muro()
// - finished/confirmed → registrar_payment_muro() + liquidar_venta_token_muro()
//
// No hacer UPDATE directo de muro_ventas_tokens.
// ================================================================

async function procesarWebhookMuro(payload) {
    try {
        const {
            order_id,
            payment_id,
            payment_status,
            pay_amount,
            pay_currency
        } = payload;

        const ventaId = Number(String(order_id).replace('muro_', ''));

        if (!Number.isInteger(ventaId) || ventaId <= 0) {
            logger.warn('❌ order_id de Muro inválido:', order_id);
            return { success: false, error: 'order_id de Muro inválido' };
        }

        // Solo lectura para saber en qué estado está (no modifica)
        const { data: venta, error: ventaError } = await supabaseAdmin
            .from('muro_ventas_tokens')
            .select('id, estado')
            .eq('id', ventaId)
            .single();

        if (ventaError || !venta) {
            logger.error('Venta Muro no encontrada:', ventaId);
            return { success: false, error: 'Venta Muro no encontrada' };
        }

        // Si ya está finalizada, no hacer nada
        if (
            venta.estado === 'pagado' ||
            venta.estado === 'completado' ||
            venta.estado === 'expirado' ||
            venta.estado === 'expirada' ||
            venta.estado === 'cancelado' ||
            venta.estado === 'cancelada' ||
            venta.estado === 'fallido'
        ) {
            logger.info(`Venta Muro ${ventaId} ya está en estado final (${venta.estado}). Ignorando.`);
            return { success: true, message: 'Venta ya procesada' };
        }

        const payAmountNum = (pay_amount !== null && pay_amount !== undefined &&
                              Number.isFinite(Number(pay_amount)))
            ? Number(pay_amount)
            : 0;

        const payCurrencyStr = String(pay_currency || 'usdt');

        // ----------------------------------------------------
        // Pago en proceso
        // ----------------------------------------------------
        if (esPagoEnProceso(payment_status)) {

            const { data: reg, error: regError } = await supabaseAdmin.rpc(
                'registrar_payment_muro',
                {
                    p_venta_id: ventaId,
                    p_payment_id: String(payment_id || ''),
                    p_pay_amount: payAmountNum,
                    p_pay_currency: payCurrencyStr,
                    p_payment_status: String(payment_status)
                }
            );

            if (regError) {
                logger.error(`Error registrar_payment_muro (proceso) venta ${ventaId}: ${regError.message}`);
                return { success: false, error: regError.message };
            }

            logger.info(`Venta Muro ${ventaId} en proceso: ${payment_status}`);
            return { success: true, message: `Estado recibido: ${payment_status}`, data: reg };
        }

        // ----------------------------------------------------
        // Pago cancelado / expirado / fallido
        // ----------------------------------------------------
        if (esPagoCancelado(payment_status)) {

            const { data: cancel, error: cancelError } = await supabaseAdmin.rpc(
                'cancelar_venta_muro',
                {
                    p_venta_id: ventaId,
                    p_estado: 'cancelado',
                    p_nowpayments_status: String(payment_status)
                }
            );

            if (cancelError) {
                logger.error(`Error cancelar_venta_muro venta ${ventaId}: ${cancelError.message}`);
                return { success: false, error: cancelError.message };
            }

            logger.warn(`Venta Muro ${ventaId} cancelada: ${payment_status}`);
            return { success: true, message: `Pago ${payment_status}`, data: cancel };
        }

        // ----------------------------------------------------
        // Pago finalizado
        // ----------------------------------------------------
        if (esPagoFinalizado(payment_status)) {

            // 1. Registrar payment (idempotente)
            const { error: regError } = await supabaseAdmin.rpc(
                'registrar_payment_muro',
                {
                    p_venta_id: ventaId,
                    p_payment_id: String(payment_id || ''),
                    p_pay_amount: payAmountNum,
                    p_pay_currency: payCurrencyStr,
                    p_payment_status: 'finished'
                }
            );

            if (regError) {
                logger.warn(`registrar_payment_muro (finished) falló venta ${ventaId}: ${regError.message}`);
                // Continuamos: liquidar_venta_token_muro puede reconciliar igual.
            }

            // 2. Liquidar (idempotente y atómico)
            const { data: liquidacion, error: liquidacionError } = await supabaseAdmin.rpc(
                'liquidar_venta_token_muro',
                { p_venta_id: ventaId }
            );

            if (liquidacionError) {
                logger.error(`Error liquidando venta Muro ${ventaId}: ${liquidacionError.message}`);
                return {
                    success: false,
                    error: 'Pago recibido pero la liquidación de tokens está pendiente'
                };
            }

            if (liquidacion && liquidacion.success === false && liquidacion.expired === true) {
                logger.warn(`Venta Muro ${ventaId} expiró durante la liquidación`);
                return { success: true, message: 'Orden expirada', data: liquidacion };
            }

            if (liquidacion && liquidacion.already_processed === true) {
                logger.info(`Venta Muro ${ventaId} ya había sido liquidada. Ignorando.`);
                return { success: true, message: 'Venta ya liquidada', data: liquidacion };
            }

            logger.info(`✅ Venta Muro ${ventaId} liquidada correctamente`);
            return { success: true, message: 'Pago procesado y tokens liquidados', data: liquidacion };
        }

        logger.warn(`Estado NOWPayments desconocido para venta ${ventaId}: ${payment_status}`);
        return { success: true, message: 'Webhook recibido con estado no procesado' };

    } catch (error) {
        logger.error('❌ Error procesando webhook Muro:', error.message);
        return { success: false, error: error.message };
    }
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

            const secret = process.env.NOWPAYMENTS_IPN_SECRET;

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
            const firmaRecibida = req.headers['x-nowpayments-sig'] || req.headers['x-signature'];

            if (!payload || typeof payload !== 'object') {
                logger.warn('NOWPayments webhook rechazado: payload inválido');
                return res.status(400).json({
                    success: false,
                    error: 'Payload inválido'
                });
            }

            if (!firmaRecibida) {
                logger.warn('NOWPayments webhook rechazado: falta firma');
                return res.status(401).json({
                    success: false,
                    error: 'Firma requerida'
                });
            }

            // ----------------------------------------------------
            // VERIFICAR HMAC
            // ----------------------------------------------------

            const firmaValida = verificarHMAC(payload, firmaRecibida, secret);

            if (!firmaValida) {
                logger.warn('NOWPayments webhook rechazado: firma inválida');
                return res.status(401).json({
                    success: false,
                    error: 'Firma inválida'
                });
            }

            // ----------------------------------------------------
            // EXTRAER INFORMACIÓN
            // ----------------------------------------------------

            const ordenId = payload.order_id || payload.data?.order_id;
            const paymentId = payload.payment_id || payload.data?.payment_id;
            const paymentStatus = payload.payment_status || payload.data?.payment_status;
            const payAmount = payload.pay_amount || payload.data?.pay_amount || null;
            const payCurrency = payload.pay_currency || payload.data?.pay_currency || null;
            const priceAmount = payload.price_amount || payload.data?.price_amount || null;
            const payAddress = payload.pay_address || payload.data?.pay_address || null;

            if (!ordenId) {
                logger.warn('NOWPayments webhook rechazado: falta order_id');
                return res.status(400).json({
                    success: false,
                    error: 'Falta order_id'
                });
            }

            logger.info(
                'NOWPayments IPN recibido | ' +
                'order_id=' + ordenId + ' | ' +
                'payment_id=' + (paymentId || 'N/A') + ' | ' +
                'status=' + (paymentStatus || 'N/A')
            );

            // ====================================================
            // MEMBRESÍA PRO - DETECCIÓN POR order_id
            // ====================================================

            if (typeof ordenId === 'string' && ordenId.startsWith('PRO-')) {
                const result = await procesarWebhookMembresia({
                    order_id: ordenId,
                    payment_id: paymentId,
                    payment_status: paymentStatus,
                    price_amount: priceAmount || payAmount || null,
                    pay_address: payAddress,
                    pay_currency: payCurrency
                });

                if (result.success) {
                    return res.status(200).json({
                        success: true,
                        message: result.message || 'Procesado correctamente'
                    });
                } else {
                    logger.error('❌ Error procesando membresía:', result.error);
                    return res.status(500).json({
                        success: false,
                        error: result.error || 'Error procesando membresía'
                    });
                }
            }

            // ====================================================
            // MURO - VENTA DE TOKENS (P2P)
            // ====================================================

            if (typeof ordenId === 'string' && ordenId.startsWith('muro_')) {
                const result = await procesarWebhookMuro({
                    order_id: ordenId,
                    payment_id: paymentId,
                    payment_status: paymentStatus,
                    pay_amount: payAmount,
                    pay_currency: payCurrency
                });

                if (result.success) {
                    return res.status(200).json({
                        success: true,
                        message: result.message || 'Procesado correctamente',
                        data: result.data || null
                    });
                } else {
                    logger.error('❌ Error procesando venta Muro:', result.error);
                    return res.status(500).json({
                        success: false,
                        error: result.error || 'Error procesando venta Muro'
                    });
                }
            }

            // ====================================================
            // MARKETING - PAGO DE CAMPAÑA
            // ====================================================

            if (typeof ordenId === 'string' && ordenId.startsWith('MKT-')) {
                const pagoId = ordenId.replace('MKT-', '');

                const { data: pago, error: pagoError } = await supabaseAdmin
                    .from('marketing_pagos')
                    .select('*')
                    .eq('id', pagoId)
                    .single();

                if (pagoError || !pago) {
                    logger.error('Pago Marketing no encontrado:', pagoId);
                    return res.status(404).json({
                        success: false,
                        error: 'Pago no encontrado'
                    });
                }

                if (pago.estado === 'pagado') {
                    logger.info('Pago Marketing', pagoId, 'ya procesado');
                    return res.status(200).json({
                        success: true,
                        message: 'Pago ya procesado'
                    });
                }

                const datosActualizacion = {
                    nowpayments_status: paymentStatus || null
                };

                if (paymentId) datosActualizacion.payment_id = String(paymentId);
                if (payCurrency) datosActualizacion.moneda_pago = String(payCurrency);
                if (payAmount !== null && Number.isFinite(Number(payAmount))) {
                    datosActualizacion.precio_usdt = Number(payAmount);
                }

                if (paymentStatus && esPagoEnProceso(paymentStatus)) {
                    datosActualizacion.estado = paymentStatus === 'confirming' || paymentStatus === 'sending'
                        ? 'confirmando'
                        : 'pagando';

                    const { error: updateError } = await supabaseAdmin
                        .from('marketing_pagos')
                        .update(datosActualizacion)
                        .eq('id', pagoId)
                        .neq('estado', 'pagado');

                    if (updateError) throw updateError;

                    logger.info('Pago Marketing', pagoId, 'actualizado:', paymentStatus);
                    return res.status(200).json({
                        success: true,
                        message: 'Estado recibido: ' + paymentStatus
                    });
                }

                if (paymentStatus && esPagoCancelado(paymentStatus)) {
                    datosActualizacion.estado = 'cancelado';

                    const { error: cancelError } = await supabaseAdmin
                        .from('marketing_pagos')
                        .update(datosActualizacion)
                        .eq('id', pagoId)
                        .neq('estado', 'pagado');

                    if (cancelError) throw cancelError;

                    logger.warn('Pago Marketing', pagoId, 'cancelado:', paymentStatus);
                    return res.status(200).json({
                        success: true,
                        message: 'Pago ' + paymentStatus
                    });
                }

                if (paymentStatus && esPagoFinalizado(paymentStatus)) {
                    const { error: updateError } = await supabaseAdmin
                        .from('marketing_pagos')
                        .update({
                            ...datosActualizacion,
                            estado: 'pagado'
                        })
                        .eq('id', pagoId)
                        .neq('estado', 'pagado');

                    if (updateError) throw updateError;

                    const { error: activarError } = await supabaseAdmin.rpc(
                        'activar_campana_marketing',
                        { p_campaign_id: pago.campaign_id }
                    );

                    if (activarError) {
                        logger.error(
                            'Error activando campaña', pago.campaign_id, ':', activarError.message
                        );
                        return res.status(500).json({
                            success: false,
                            error: 'Pago recibido pero la activación de la campaña está pendiente'
                        });
                    }

                    logger.info('✅ Campaña Marketing', pago.campaign_id, 'activada correctamente');
                    return res.status(200).json({
                        success: true,
                        message: 'Pago procesado y campaña activada'
                    });
                }

                logger.warn('Estado NOWPayments desconocido para pago Marketing', pagoId, ':', paymentStatus);
                return res.status(200).json({
                    success: true,
                    message: 'Webhook recibido con estado no procesado'
                });
            }

            // ====================================================
            // INTERNET - PAGO DE PAQUETE
            // ====================================================

            if (typeof ordenId === 'string' && ordenId.startsWith('NET-')) {
                const ordenIntId = ordenId.replace('NET-', '');

                const { data: ordenInt, error: ordenIntError } = await supabaseAdmin
                    .from('ordenes_internet')
                    .select('*')
                    .eq('id', ordenIntId)
                    .single();

                if (ordenIntError || !ordenInt) {
                    logger.error('Orden Internet no encontrada:', ordenIntId);
                    return res.status(404).json({
                        success: false,
                        error: 'Orden Internet no encontrada'
                    });
                }

                if (
                    ordenInt.estado === 'activa' ||
                    ordenInt.estado === 'activada' ||
                    ordenInt.estado === 'completado'
                ) {
                    logger.info('Orden Internet', ordenIntId, 'ya activada');
                    return res.status(200).json({
                        success: true,
                        message: 'Orden ya activada'
                    });
                }

                const datosAct = {
                    nowpayments_status: paymentStatus || null
                };

                if (paymentId) datosAct.payment_id = String(paymentId);
                if (payCurrency) datosAct.pay_currency = String(payCurrency);
                if (payAmount !== null && Number.isFinite(Number(payAmount))) {
                    datosAct.precio_usdt = Number(payAmount);
                }

                if (paymentStatus && esPagoEnProceso(paymentStatus)) {
                    datosAct.estado = paymentStatus === 'confirming' || paymentStatus === 'sending'
                        ? 'confirmando'
                        : 'pagando';

                    const { error: updateError } = await supabaseAdmin
                        .from('ordenes_internet')
                        .update(datosAct)
                        .eq('id', ordenIntId)
                        .neq('estado', 'activa');

                    if (updateError) throw updateError;

                    logger.info('Orden Internet', ordenIntId, 'actualizada:', paymentStatus);
                    return res.status(200).json({
                        success: true,
                        message: 'Estado recibido: ' + paymentStatus
                    });
                }

                if (paymentStatus && esPagoCancelado(paymentStatus)) {
                    datosAct.estado = 'cancelada';

                    const { error: cancelError } = await supabaseAdmin
                        .from('ordenes_internet')
                        .update(datosAct)
                        .eq('id', ordenIntId)
                        .neq('estado', 'activa');

                    if (cancelError) throw cancelError;

                    logger.warn('Orden Internet', ordenIntId, 'cancelada:', paymentStatus);
                    return res.status(200).json({
                        success: true,
                        message: 'Pago ' + paymentStatus
                    });
                }

                if (paymentStatus && esPagoFinalizado(paymentStatus)) {
                    const { error: updateError } = await supabaseAdmin
                        .from('ordenes_internet')
                        .update({
                            ...datosAct,
                            estado: 'pagada',
                            pagado_en: new Date().toISOString()
                        })
                        .eq('id', ordenIntId)
                        .neq('estado', 'activa');

                    if (updateError) throw updateError;

                    const { error: activarError } = await supabaseAdmin.rpc(
                        'activar_orden_internet',
                        { p_orden_id: ordenIntId }
                    );

                    if (activarError) {
                        logger.error(
                            'Error activando orden Internet', ordenIntId, ':', activarError.message
                        );
                        return res.status(500).json({
                            success: false,
                            error: 'Pago recibido pero la activación está pendiente de procesamiento'
                        });
                    }

                    logger.info('✅ Orden Internet', ordenIntId, 'activada correctamente');
                    return res.status(200).json({
                        success: true,
                        message: 'Pago procesado y servicio activado'
                    });
                }

                logger.warn('Estado NOWPayments desconocido para orden Internet', ordenIntId, ':', paymentStatus);
                return res.status(200).json({
                    success: true,
                    message: 'Webhook recibido con estado no procesado'
                });
            }

            // ====================================================
            // PAGOS DE TRANSMISIÓN
            // ====================================================

            const { data: orden, error: ordenError } = await supabaseAdmin
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .single();

            if (ordenError || !orden) {
                logger.warn('Orden de transmisión no encontrada:', ordenId);
                return res.status(404).json({
                    success: false,
                    error: 'Orden no encontrada'
                });
            }

            if (orden.estado === 'completado') {
                logger.info('Orden', ordenId, 'ya había sido procesada');
                return res.status(200).json({
                    success: true,
                    message: 'Pago ya procesado'
                });
            }

            if (paymentStatus && !['finished', 'confirmed'].includes(paymentStatus)) {
                logger.info('NOWPayments transmisión', ordenId, ':', paymentStatus);
                return res.status(200).json({
                    success: true,
                    message: 'Estado recibido: ' + paymentStatus
                });
            }

            const { data: ordenActualizada, error: updateError } = await supabaseAdmin
                .from('pagos_transmision')
                .update({
                    estado: 'completado',
                    pagado_en: new Date().toISOString()
                })
                .eq('id', ordenId)
                .neq('estado', 'completado')
                .select()
                .single();

            if (updateError) {
                logger.error('Error actualizando orden', ordenId, ':', updateError.message);
                throw updateError;
            }

            if (!ordenActualizada) {
                logger.info('Orden', ordenId, 'ya había sido procesada');
                return res.status(200).json({
                    success: true,
                    message: 'Pago ya procesado'
                });
            }

            logger.info('✅ Pago NOWPayments completado:', ordenId);
            return res.status(200).json({
                success: true,
                message: 'Pago procesado correctamente'
            });

        } catch (error) {
            logger.error('❌ Error webhook NOWPayments:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Error interno procesando webhook'
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

            logger.info('Webhook Supabase recibido:', payload?.table || 'desconocido');

            if (payload?.table === 'usuarios' && payload?.type === 'INSERT') {
                logger.info('Nuevo usuario registrado:', payload?.record?.email || 'sin email');
            }

            return res.status(200).json({ success: true });

        } catch (error) {
            logger.error('Error webhook Supabase:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Error interno del webhook'
            });
        }
    }
);

// ================================================================
// TEST
// ================================================================

router.get('/test', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Webhook endpoint funcionando',
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// EXPORT
// ================================================================

module.exports = router;