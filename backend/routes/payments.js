// ================================================================
// ROUTES/PAYMENTS.JS
// RUTAS DE PAGOS - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const {
    supabase,
    supabaseAdmin
} = require('../config/supabase');

const {
    verificarToken
} = require('../middleware/auth');

const {
    limitadorPagos
} = require('../middleware/rateLimit');

const {
    validarPago,
    verificarErrores
} = require('../middleware/validation');

const logger = require('../utils/logger');
const axios = require('axios');

// ================================================================
// CONFIGURACIÓN NOWPAYMENTS
// ================================================================

const NOWPAYMENTS_API_URL =
    'https://api.nowpayments.io/v1/payment';

const NOWPAYMENTS_API_KEY =
    process.env.NOWPAYMENTS_API_KEY;

// ================================================================
// REDES DE PAGO PERMITIDAS (USDT / USDC)
// ================================================================

const REDES_PERMITIDAS = {
    // USDT
    'usdttrc20': { moneda: 'USDT', red: 'TRON',     minimo_usd: 1  },
    'usdtbsc':   { moneda: 'USDT', red: 'BSC',      minimo_usd: 1  },
    'usdtmatic': { moneda: 'USDT', red: 'Polygon',  minimo_usd: 1  },
    'usdtsol':   { moneda: 'USDT', red: 'Solana',   minimo_usd: 1  },
    'usdterc20': { moneda: 'USDT', red: 'Ethereum', minimo_usd: 20 },

    // USDC
    'usdcsol':   { moneda: 'USDC', red: 'Solana',   minimo_usd: 1  },
    'usdcmatic': { moneda: 'USDC', red: 'Polygon',  minimo_usd: 1  },
    'usdcbsc':   { moneda: 'USDC', red: 'BSC',      minimo_usd: 1  },
    'usdc':      { moneda: 'USDC', red: 'Ethereum', minimo_usd: 20 },
};

const MXN_A_USD_APROX = 0.055;

// ================================================================
// HELPERS
// ================================================================

function numeroValido(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= 0;
}

function enteroPositivo(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0;
}

function respuestaError(res, status, error) {
    return res.status(status).json({
        success: false,
        error
    });
}

function validarRedPago(payCurrency, montoMxn) {
    const red = REDES_PERMITIDAS[payCurrency];

    if (!red) {
        return { valido: false, error: 'Red de pago no soportada' };
    }

    const montoUsd = Number(montoMxn) * MXN_A_USD_APROX;

    if (montoUsd < red.minimo_usd) {
        const minimoMxn = Math.ceil(red.minimo_usd / MXN_A_USD_APROX);
        return {
            valido: false,
            error:
                `El monto es demasiado bajo para ${red.moneda} en ${red.red}. ` +
                `Mínimo: ${red.minimo_usd} USD (~$${minimoMxn} MXN)`
        };
    }

    return { valido: true, red };
}

// ================================================================
// CREAR ORDEN DE PAGO - TRANSMISIONES
// ================================================================

router.post(
    '/create',
    verificarToken,
    limitadorPagos,
    validarPago,
    verificarErrores,
    async (req, res) => {

        try {
            const { transmisionId, monto, metodo } = req.body;
            const userId = req.usuario.id;

            if (!transmisionId) {
                return respuestaError(res, 400, 'transmisionId es requerido');
            }

            const montoNumerico = Number(monto);
            if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
                return respuestaError(res, 400, 'Monto inválido');
            }

            const metodoPago = metodo || 'crypto';
            if (!['crypto'].includes(metodoPago)) {
                return respuestaError(res, 400, 'Método de pago no soportado');
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error('NOWPAYMENTS_API_KEY no está configurada');
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            if (!supabase) {
                logger.error('Cliente Supabase no configurado');
                return respuestaError(res, 500, 'Base de datos no configurada');
            }

            const comisionSariels = Number((montoNumerico * 0.02).toFixed(2));
            const montoStreamer = Number((montoNumerico - comisionSariels).toFixed(2));

            const { data: orden, error: ordenError } = await supabase
                .from('pagos_transmision')
                .insert({
                    transmision_id: transmisionId,
                    espectador_id: userId,
                    monto_pagado: montoNumerico,
                    comision_sariels: comisionSariels,
                    monto_streamer: montoStreamer,
                    metodo_pago: metodoPago,
                    tipo_pago: 'acceso',
                    estado: 'pendiente'
                })
                .select()
                .single();

            if (ordenError) throw ordenError;

            let nowPayment;
            try {
                const response = await axios.post(
                    NOWPAYMENTS_API_URL,
                    {
                        price_amount: montoNumerico,
                        price_currency: 'usd',
                        pay_currency: 'usdttrc20',
                        order_id: String(orden.id),
                        order_description: `Pago transmisión ${transmisionId}`
                    },
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );
                nowPayment = response.data;
            } catch (paymentError) {
                logger.error(
                    `Error creando payment NOWPayments: ${
                        paymentError.response?.data
                            ? JSON.stringify(paymentError.response.data)
                            : paymentError.message
                    }`
                );

                return res.status(502).json({
                    success: false,
                    error: 'No fue posible crear el pago con NOWPayments',
                    orden: { id: orden.id, estado: orden.estado }
                });
            }

            logger.info(`Orden de pago creada: ${orden.id}`);

            return res.status(201).json({
                success: true,
                data: {
                    id: orden.id,
                    estado: orden.estado,
                    monto: orden.monto_pagado,
                    moneda: 'USD',
                    metodo_pago: orden.metodo_pago,
                    payment_id: nowPayment.payment_id || null,
                    payment_url: nowPayment.payment_url || null,
                    pay_address: nowPayment.pay_address || null,
                    pay_amount: nowPayment.pay_amount || null,
                    pay_currency: nowPayment.pay_currency || null
                }
            });

        } catch (error) {
            logger.error(`Error creando pago: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error interno creando el pago'
            });
        }
    }
);

// ================================================================
// CREAR PAGO - MURO / VENTA DE TOKENS (P2P)
// ================================================================
//
// Flujo:
// 1. Validación de inputs (solo sanitización).
// 2. RPC crear_orden_muro() → reserva atómica + comisión 2% + expires_at.
// 3. NOWPayments.
// 4. Si falla → RPC cancelar_venta_muro() → libera reserva.
// 5. Si funciona → RPC registrar_payment_muro() → guarda payment_id.
// ================================================================

router.post(
    '/muro/create',
    verificarToken,
    limitadorPagos,
    async (req, res) => {

        try {
            const userId = req.usuario.id;
            const postId = Number(req.body?.postId);
            const cantidad = Number(req.body?.cantidad);
            const payCurrency =
                String(req.body?.payCurrency || 'usdttrc20').toLowerCase();

            if (!Number.isInteger(postId) || postId <= 0) {
                return respuestaError(res, 400, 'postId inválido');
            }

            if (!enteroPositivo(cantidad)) {
                return respuestaError(res, 400, 'La cantidad debe ser un número entero mayor a 0');
            }

            if (cantidad > 1000000000) {
                return respuestaError(res, 400, 'Cantidad inválida');
            }

            if (!REDES_PERMITIDAS[payCurrency]) {
                return respuestaError(res, 400, 'Red de pago no soportada');
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error('NOWPAYMENTS_API_KEY no está configurada');
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            if (!supabaseAdmin) {
                logger.error('supabaseAdmin no está configurado');
                return respuestaError(res, 500, 'Servicio interno no configurado');
            }

            // ----------------------------------------------------
            // 1. RESERVAR TOKENS + CREAR ORDEN VÍA RPC ATÓMICA
            // ----------------------------------------------------

            const { data: orden, error: ordenError } = await supabaseAdmin.rpc(
                'crear_orden_muro',
                {
                    p_post_id: postId,
                    p_comprador_id: userId,
                    p_cantidad: cantidad,
                    p_pay_currency: payCurrency
                }
            );

            if (ordenError) {
                logger.error(`Error RPC crear_orden_muro: ${ordenError.message}`);
                return respuestaError(res, 500, 'Error creando la orden P2P');
            }

            if (!orden || orden.success !== true) {
                const motivo = (orden && orden.error) ? String(orden.error) : 'error_desconocido';

                // Traducir errores de la RPC a mensajes amigables
                const mapaErrores = {
                    'post_no_encontrado':     { status: 404, msg: 'Publicación no encontrada' },
                    'no_puedes_comprar_tus_tokens': { status: 400, msg: 'No puedes comprar tus propios tokens' },
                    'sin_inventario':         { status: 409, msg: 'Esta publicación ya no tiene tokens disponibles' },
                    'inventario_insuficiente': {
                        status: 409,
                        msg: orden && orden.disponible
                            ? `Solo hay ${orden.disponible} tokens disponibles`
                            : 'Inventario insuficiente'
                    },
                    'cantidad_invalida':      { status: 400, msg: 'Cantidad inválida' },
                    'precio_invalido':        { status: 500, msg: 'La publicación tiene un precio inválido' },
                    'red_no_soportada':       { status: 400, msg: 'Red de pago no soportada' }
                };

                const info = mapaErrores[motivo] || {
                    status: 409,
                    msg: orden && orden.message ? String(orden.message) : 'No se pudo crear la orden'
                };

                return respuestaError(res, info.status, info.msg);
            }

            const ventaId = Number(orden.venta_id);
            if (!Number.isInteger(ventaId) || ventaId <= 0) {
                logger.error('RPC crear_orden_muro devolvió venta_id inválido');
                return respuestaError(res, 500, 'Respuesta inválida del servidor');
            }

            const precioTotalMxn = Number(orden.precio_mxn);
            const comisionPlataforma = Number(orden.comision_plataforma);

            // Validar red según el precio real (ya recalculado por la RPC)
            const validacionRed = validarRedPago(payCurrency, precioTotalMxn);
            if (!validacionRed.valido) {
                // La orden ya se creó y reservó. Cancelar y devolver el inventario.
                try {
                    await supabaseAdmin.rpc('cancelar_venta_muro', {
                        p_venta_id: ventaId,
                        p_estado: 'cancelado',
                        p_nowpayments_status: 'creation_failed'
                    });
                } catch (e) {
                    logger.error(`Error cancelando orden ${ventaId} por red inválida: ${e.message}`);
                }
                return respuestaError(res, 400, validacionRed.error);
            }

            // ----------------------------------------------------
            // 2. CREAR PAYMENT EN NOWPAYMENTS
            // ----------------------------------------------------

            const orderId = `muro_${ventaId}`;

            let nowPayment;
            try {
                const response = await axios.post(
                    NOWPAYMENTS_API_URL,
                    {
                        price_amount: precioTotalMxn,
                        price_currency: 'mxn',
                        pay_currency: payCurrency,
                        order_id: orderId,
                        order_description: `Compra de ${orden.cantidad} tokens en Muro #${orden.post_id}`
                    },
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );
                nowPayment = response.data;
            } catch (paymentError) {
                logger.error(
                    `Error creando payment Muro ${orderId}: ${
                        paymentError.response?.data
                            ? JSON.stringify(paymentError.response.data)
                            : paymentError.message
                    }`
                );

                // Liberar reserva vía RPC
                try {
                    await supabaseAdmin.rpc('cancelar_venta_muro', {
                        p_venta_id: ventaId,
                        p_estado: 'cancelado',
                        p_nowpayments_status: 'creation_failed'
                    });
                } catch (e) {
                    logger.error(`Error cancelando orden ${ventaId} tras fallo NOWPayments: ${e.message}`);
                }

                return res.status(502).json({
                    success: false,
                    error: 'No fue posible crear el pago con NOWPayments',
                    venta_id: ventaId
                });
            }

            const paymentId = nowPayment?.payment_id || null;

            if (!paymentId) {
                logger.error(`NOWPayments no devolvió payment_id para ${orderId}`);

                try {
                    await supabaseAdmin.rpc('cancelar_venta_muro', {
                        p_venta_id: ventaId,
                        p_estado: 'cancelado',
                        p_nowpayments_status: 'creation_failed'
                    });
                } catch (e) {
                    logger.error(`Error cancelando orden ${ventaId} sin payment_id: ${e.message}`);
                }

                return res.status(502).json({
                    success: false,
                    error: 'NOWPayments no devolvió un identificador de pago',
                    venta_id: ventaId
                });
            }

            // ----------------------------------------------------
            // 3. REGISTRAR EL PAYMENT_ID EN SUPABASE (RPC)
            // ----------------------------------------------------

            const payAmount = numeroValido(nowPayment.pay_amount)
                ? Number(nowPayment.pay_amount)
                : 0;

            const payCurrencyReal = nowPayment.pay_currency || payCurrency;
            const paymentStatus = nowPayment.payment_status || 'waiting';

            const { data: registroPago, error: registroPagoError } = await supabaseAdmin.rpc(
                'registrar_payment_muro',
                {
                    p_venta_id: ventaId,
                    p_payment_id: String(paymentId),
                    p_pay_amount: payAmount,
                    p_pay_currency: String(payCurrencyReal),
                    p_payment_status: String(paymentStatus)
                }
            );

            if (registroPagoError) {
                logger.error(`Error registrando payment Muro ${ventaId}: ${registroPagoError.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'El pago fue creado pero no se pudo guardar la orden',
                    venta_id: ventaId,
                    payment_id: paymentId
                });
            }

            if (!registroPago || registroPago.success !== true) {
                logger.warn(
                    `registrar_payment_muro devolvió success!=true para venta ${ventaId}: ` +
                    `${JSON.stringify(registroPago)}`
                );
                // No rompemos: el pago existe en NOWPayments, se reconciliará en el webhook.
            }

            logger.info(
                `✅ Pago Muro creado: venta=${ventaId} payment=${paymentId} ` +
                `order=${orderId} red=${payCurrency} comision=${comisionPlataforma} MXN`
            );

            return res.status(201).json({
                success: true,
                data: {
                    venta_id: ventaId,
                    post_id: orden.post_id,
                    cantidad: orden.cantidad,
                    precio_mxn: precioTotalMxn,
                    comision_plataforma: comisionPlataforma,
                    precio_usdt: payAmount,
                    estado: (registroPago && registroPago.estado) || 'pagando',
                    nowpayments_status: paymentStatus,
                    payment_id: paymentId,
                    payment_url: nowPayment.payment_url || null,
                    pay_address: nowPayment.pay_address || null,
                    pay_amount: nowPayment.pay_amount || null,
                    pay_currency: payCurrencyReal,
                    order_id: orderId,
                    expires_at: orden.expires_at || null
                }
            });

        } catch (error) {
            logger.error(`❌ Error creando pago Muro: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error interno creando el pago del Muro'
            });
        }
    }
);

// ================================================================
// CREAR PAGO - CAMPAÑA DE MARKETING
// ================================================================

router.post(
    '/marketing/create',
    verificarToken,
    limitadorPagos,
    async (req, res) => {

        try {
            const userId = req.usuario.id;
            const campaignId = req.body?.campaignId;
            const payCurrency =
                String(req.body?.payCurrency || 'usdttrc20').toLowerCase();

            if (!campaignId) {
                return respuestaError(res, 400, 'campaignId es requerido');
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error('NOWPAYMENTS_API_KEY no está configurada');
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            if (!supabaseAdmin) {
                logger.error('supabaseAdmin no está configurado');
                return respuestaError(res, 500, 'Servicio interno no configurado');
            }

            const { data: campaign, error: campaignError } = await supabaseAdmin
                .from('marketing_campaigns')
                .select('id, anunciante_id, presupuesto, moneda, estado, nombre')
                .eq('id', campaignId)
                .eq('anunciante_id', userId)
                .maybeSingle();

            if (campaignError) throw campaignError;

            if (!campaign) {
                return respuestaError(res, 404, 'Campaña no encontrada');
            }

            if (campaign.estado !== 'pendiente_pago') {
                return respuestaError(res, 409, 'La campaña no está pendiente de pago');
            }

            const validacionRed = validarRedPago(payCurrency, campaign.presupuesto);
            if (!validacionRed.valido) {
                return respuestaError(res, 400, validacionRed.error);
            }

            const { data: pago, error: pagoError } = await supabaseAdmin
                .from('marketing_pagos')
                .insert({
                    campaign_id: campaign.id,
                    anunciante_id: userId,
                    monto_mxn: campaign.presupuesto,
                    estado: 'pendiente',
                    pay_currency: payCurrency
                })
                .select()
                .single();

            if (pagoError) throw pagoError;

            const orderId = `MKT-${pago.id}`;

            let nowPayment;
            try {
                const response = await axios.post(
                    NOWPAYMENTS_API_URL,
                    {
                        price_amount: Number(campaign.presupuesto),
                        price_currency: 'mxn',
                        pay_currency: payCurrency,
                        order_id: orderId,
                        order_description: `Campaña de marketing: ${campaign.nombre}`
                    },
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );
                nowPayment = response.data;
            } catch (paymentError) {
                logger.error(
                    `Error creando payment Marketing ${orderId}: ${
                        paymentError.response?.data
                            ? JSON.stringify(paymentError.response.data)
                            : paymentError.message
                    }`
                );

                await supabaseAdmin
                    .from('marketing_pagos')
                    .update({
                        nowpayments_status: 'creation_failed',
                        estado: 'cancelado'
                    })
                    .eq('id', pago.id);

                return res.status(502).json({
                    success: false,
                    error: 'No fue posible crear el pago con NOWPayments',
                    pago_id: pago.id
                });
            }

            const paymentId = nowPayment?.payment_id || null;

            if (!paymentId) {
                logger.error(`NOWPayments no devolvió payment_id para ${orderId}`);

                await supabaseAdmin
                    .from('marketing_pagos')
                    .update({
                        nowpayments_status: 'creation_failed',
                        estado: 'cancelado'
                    })
                    .eq('id', pago.id);

                return res.status(502).json({
                    success: false,
                    error: 'NOWPayments no devolvió un identificador de pago',
                    pago_id: pago.id
                });
            }

            const { data: pagoActualizado, error: updatePagoError } = await supabaseAdmin
                .from('marketing_pagos')
                .update({
                    payment_id: String(paymentId),
                    precio_usdt: numeroValido(nowPayment.pay_amount)
                        ? Number(nowPayment.pay_amount)
                        : null,
                    moneda_pago: nowPayment.pay_currency || payCurrency,
                    nowpayments_status: nowPayment.payment_status || 'waiting'
                })
                .eq('id', pago.id)
                .select()
                .single();

            if (updatePagoError) {
                logger.error(`Error guardando payment_id Marketing ${pago.id}: ${updatePagoError.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'El pago fue creado pero no se pudo guardar la orden',
                    pago_id: pago.id,
                    payment_id: paymentId
                });
            }

            logger.info(`✅ Pago Marketing creado: pago=${pago.id} payment=${paymentId} order=${orderId} red=${payCurrency}`);

            return res.status(201).json({
                success: true,
                data: {
                    pago_id: pagoActualizado.id,
                    campaign_id: campaign.id,
                    estado: pagoActualizado.estado,
                    monto_mxn: pagoActualizado.monto_mxn,
                    pay_currency: payCurrency,
                    nowpayments_status: pagoActualizado.nowpayments_status,
                    payment_id: paymentId,
                    payment_url: nowPayment.payment_url || null,
                    pay_address: nowPayment.pay_address || null,
                    pay_amount: nowPayment.pay_amount || null,
                    pay_currency_real: nowPayment.pay_currency || null,
                    order_id: orderId
                }
            });

        } catch (error) {
            logger.error(`❌ Error creando pago de marketing: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error interno creando el pago de la campaña'
            });
        }
    }
);

// ================================================================
// CREAR PAGO - PAQUETE DE INTERNET
// ================================================================

router.post(
    '/internet/create',
    verificarToken,
    limitadorPagos,
    async (req, res) => {

        try {
            const userId = req.usuario.id;
            const ordenId = req.body?.ordenId;
            const payCurrency =
                String(req.body?.payCurrency || 'usdttrc20').toLowerCase();

            if (!ordenId) {
                return respuestaError(res, 400, 'ordenId es requerido');
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error('NOWPAYMENTS_API_KEY no está configurada');
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            if (!supabaseAdmin) {
                logger.error('supabaseAdmin no está configurado');
                return respuestaError(res, 500, 'Servicio interno no configurado');
            }

            const { data: orden, error: ordenError } = await supabaseAdmin
                .from('ordenes_internet')
                .select('id, usuario_id, plan_nombre, monto_mxn, estado')
                .eq('id', ordenId)
                .eq('usuario_id', userId)
                .maybeSingle();

            if (ordenError) throw ordenError;

            if (!orden) {
                return respuestaError(res, 404, 'Orden no encontrada');
            }

            if (orden.estado !== 'pendiente') {
                return respuestaError(res, 409, 'La orden no está pendiente de pago');
            }

            const validacionRed = validarRedPago(payCurrency, orden.monto_mxn);
            if (!validacionRed.valido) {
                return respuestaError(res, 400, validacionRed.error);
            }

            const orderId = `NET-${orden.id}`;

            let nowPayment;
            try {
                const response = await axios.post(
                    NOWPAYMENTS_API_URL,
                    {
                        price_amount: Number(orden.monto_mxn),
                        price_currency: 'mxn',
                        pay_currency: payCurrency,
                        order_id: orderId,
                        order_description: `Paquete Internet: ${orden.plan_nombre}`
                    },
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );
                nowPayment = response.data;
            } catch (paymentError) {
                logger.error(
                    `Error creando payment Internet ${orderId}: ${
                        paymentError.response?.data
                            ? JSON.stringify(paymentError.response.data)
                            : paymentError.message
                    }`
                );

                await supabaseAdmin
                    .from('ordenes_internet')
                    .update({
                        nowpayments_status: 'creation_failed',
                        estado: 'cancelada'
                    })
                    .eq('id', orden.id);

                return res.status(502).json({
                    success: false,
                    error: 'No fue posible crear el pago con NOWPayments'
                });
            }

            const paymentId = nowPayment?.payment_id || null;

            if (!paymentId) {
                logger.error(`NOWPayments no devolvió payment_id para ${orderId}`);

                await supabaseAdmin
                    .from('ordenes_internet')
                    .update({
                        nowpayments_status: 'creation_failed',
                        estado: 'cancelada'
                    })
                    .eq('id', orden.id);

                return res.status(502).json({
                    success: false,
                    error: 'NOWPayments no devolvió un identificador de pago'
                });
            }

            const { data: ordenActualizada, error: updateError } = await supabaseAdmin
                .from('ordenes_internet')
                .update({
                    payment_id: String(paymentId),
                    precio_usdt: numeroValido(nowPayment.pay_amount)
                        ? Number(nowPayment.pay_amount)
                        : null,
                    pay_currency: payCurrency,
                    nowpayments_status: nowPayment.payment_status || 'waiting',
                    estado: 'pagando'
                })
                .eq('id', orden.id)
                .select()
                .single();

            if (updateError) {
                logger.error(`Error guardando payment_id Internet ${orden.id}: ${updateError.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'El pago fue creado pero no se pudo guardar la orden',
                    orden_id: orden.id,
                    payment_id: paymentId
                });
            }

            logger.info(`✅ Pago Internet creado: orden=${orden.id} payment=${paymentId} order=${orderId} red=${payCurrency}`);

            return res.status(201).json({
                success: true,
                data: {
                    orden_id: ordenActualizada.id,
                    estado: ordenActualizada.estado,
                    monto_mxn: ordenActualizada.monto_mxn,
                    pay_currency: payCurrency,
                    nowpayments_status: ordenActualizada.nowpayments_status,
                    payment_id: paymentId,
                    payment_url: nowPayment.payment_url || null,
                    pay_address: nowPayment.pay_address || null,
                    pay_amount: nowPayment.pay_amount || null,
                    pay_currency_real: nowPayment.pay_currency || null,
                    order_id: orderId
                }
            });

        } catch (error) {
            logger.error(`❌ Error creando pago Internet: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error interno creando el pago de Internet'
            });
        }
    }
);

// ================================================================
// ESTADO DE PAGO - TRANSMISIONES
// ================================================================

router.get(
    '/status/:ordenId',
    verificarToken,
    async (req, res) => {

        try {
            const { ordenId } = req.params;
            const userId = req.usuario.id;

            if (!ordenId) {
                return respuestaError(res, 400, 'ordenId requerido');
            }

            const { data, error } = await supabase
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .eq('espectador_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return respuestaError(res, 404, 'Orden no encontrada');
                }
                throw error;
            }

            return res.json({ success: true, data });

        } catch (error) {
            logger.error(`Error verificando pago: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error verificando el pago'
            });
        }
    }
);

// ================================================================
// ESTADO REAL NOWPAYMENTS - MURO (P2P)
// ================================================================
//
// Flujo:
// 1. SELECT de la venta (solo lectura).
// 2. Si estado final (pagado / expirado / cancelado) → devolver rápido.
// 3. Consultar NOWPayments.
// 4. waiting/confirming/sending/partially_paid → registrar_payment_muro()
// 5. failed/refunded/expired/canceled → cancelar_venta_muro()
// 6. finished/confirmed → registrar_payment_muro() → liquidar_venta_token_muro()
// ================================================================

router.get(
    '/muro/status/:ventaId',
    verificarToken,
    async (req, res) => {

        try {
            const ventaId = Number(req.params.ventaId);
            const userId = req.usuario.id;

            if (!Number.isInteger(ventaId) || ventaId <= 0) {
                return respuestaError(res, 400, 'ventaId inválido');
            }

            if (!supabaseAdmin) {
                return respuestaError(res, 500, 'Servicio interno no configurado');
            }

            if (!NOWPAYMENTS_API_KEY) {
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            const { data: venta, error: ventaError } = await supabaseAdmin
                .from('muro_ventas_tokens')
                .select('*')
                .eq('id', ventaId)
                .eq('comprador_id', userId)
                .maybeSingle();

            if (ventaError) throw ventaError;

            if (!venta) {
                return respuestaError(res, 404, 'Venta no encontrada');
            }

            // ----------------------------------------------------
            // Estado final: no consultar NOWPayments
            // ----------------------------------------------------
            if (venta.estado === 'pagado' || venta.estado === 'completado') {
                return res.json({
                    success: true,
                    data: venta,
                    final: true,
                    paid: true,
                    liquidated: true
                });
            }

            if (venta.estado === 'expirado' || venta.estado === 'expirada') {
                return res.json({
                    success: true,
                    data: venta,
                    final: true,
                    paid: false,
                    expired: true
                });
            }

            if (venta.estado === 'cancelado' || venta.estado === 'cancelada' || venta.estado === 'fallido') {
                return res.json({
                    success: true,
                    data: venta,
                    final: true,
                    paid: false,
                    cancelled: true
                });
            }

            if (!venta.payment_id) {
                return res.json({
                    success: true,
                    data: venta,
                    final: false,
                    paid: false,
                    message: 'El pago todavía no tiene payment_id'
                });
            }

            // ----------------------------------------------------
            // Consultar NOWPayments
            // ----------------------------------------------------
            let payment;
            try {
                const response = await axios.get(
                    `${NOWPAYMENTS_API_URL}/${encodeURIComponent(venta.payment_id)}`,
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );
                payment = response.data;
            } catch (paymentError) {
                logger.error(
                    `Error consultando NOWPayments payment ${venta.payment_id}: ${
                        paymentError.response?.data
                            ? JSON.stringify(paymentError.response.data)
                            : paymentError.message
                    }`
                );
                return res.status(502).json({
                    success: false,
                    error: 'No fue posible consultar el estado del pago'
                });
            }

            const estadoNow = String(payment?.payment_status || 'unknown').toLowerCase();
            const payAmount = numeroValido(payment?.pay_amount) ? Number(payment.pay_amount) : null;
            const payCurrency = payment?.pay_currency || venta.moneda_pago || 'usdt';

            const ESTADOS_FINALIZADOS = ['finished', 'confirmed'];
            const ESTADOS_CANCELADOS = ['failed', 'refunded', 'expired', 'canceled'];

            // ----------------------------------------------------
            // Pago finalizado → registrar + liquidar
            // ----------------------------------------------------
            if (ESTADOS_FINALIZADOS.includes(estadoNow)) {

                const { error: regError } = await supabaseAdmin.rpc(
                    'registrar_payment_muro',
                    {
                        p_venta_id: ventaId,
                        p_payment_id: String(venta.payment_id),
                        p_pay_amount: payAmount !== null ? payAmount : 0,
                        p_pay_currency: String(payCurrency),
                        p_payment_status: 'finished'
                    }
                );

                if (regError) {
                    logger.warn(`registrar_payment_muro falló para venta ${ventaId}: ${regError.message}`);
                }

                const { data: liquidacion, error: liquidacionError } = await supabaseAdmin.rpc(
                    'liquidar_venta_token_muro',
                    { p_venta_id: ventaId }
                );

                if (liquidacionError) {
                    logger.error(`Error liquidando venta Muro ${ventaId}: ${liquidacionError.message}`);
                    return res.json({
                        success: true,
                        data: venta,
                        final: true,
                        paid: true,
                        liquidated: false,
                        message: 'Pago confirmado. La liquidación está pendiente de procesamiento.'
                    });
                }

                // Si la liquidación devolvió expired=true, significa que se venció durante el proceso
                if (liquidacion && liquidacion.success === false && liquidacion.expired === true) {
                    return res.json({
                        success: true,
                        data: venta,
                        final: true,
                        paid: false,
                        expired: true,
                        message: 'La orden expiró durante el procesamiento del pago'
                    });
                }

                // Recargar venta final
                const { data: ventaFinal } = await supabaseAdmin
                    .from('muro_ventas_tokens')
                    .select('*')
                    .eq('id', ventaId)
                    .single();

                return res.json({
                    success: true,
                    data: ventaFinal || venta,
                    final: true,
                    paid: true,
                    liquidated: liquidacion ? liquidacion.success !== false : true,
                    already_processed: liquidacion ? Boolean(liquidacion.already_processed) : false,
                    liquidation: liquidacion || null
                });
            }

            // ----------------------------------------------------
            // Pago cancelado / expirado
            // ----------------------------------------------------
            if (ESTADOS_CANCELADOS.includes(estadoNow)) {

                const { error: cancelError } = await supabaseAdmin.rpc(
                    'cancelar_venta_muro',
                    {
                        p_venta_id: ventaId,
                        p_estado: 'cancelado',
                        p_nowpayments_status: estadoNow
                    }
                );

                if (cancelError) {
                    logger.warn(`cancelar_venta_muro falló para venta ${ventaId}: ${cancelError.message}`);
                }

                const { data: ventaFinal } = await supabaseAdmin
                    .from('muro_ventas_tokens')
                    .select('*')
                    .eq('id', ventaId)
                    .single();

                return res.json({
                    success: true,
                    data: ventaFinal || venta,
                    final: true,
                    paid: false,
                    failed: true,
                    nowpayments_status: estadoNow
                });
            }

            // ----------------------------------------------------
            // Pago en proceso → solo registrar estado
            // ----------------------------------------------------
            const { error: regError } = await supabaseAdmin.rpc(
                'registrar_payment_muro',
                {
                    p_venta_id: ventaId,
                    p_payment_id: String(venta.payment_id),
                    p_pay_amount: payAmount !== null ? payAmount : 0,
                    p_pay_currency: String(payCurrency),
                    p_payment_status: estadoNow
                }
            );

            if (regError) {
                logger.warn(`registrar_payment_muro (proceso) falló para venta ${ventaId}: ${regError.message}`);
            }

            const { data: ventaActualizada } = await supabaseAdmin
                .from('muro_ventas_tokens')
                .select('*')
                .eq('id', ventaId)
                .single();

            return res.json({
                success: true,
                data: ventaActualizada || venta,
                final: false,
                paid: false,
                nowpayments_status: estadoNow,
                nowpayments: payment
            });

        } catch (error) {
            logger.error(`❌ Error verificando estado pago Muro: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error verificando el estado del pago'
            });
        }
    }
);

// ================================================================
// ESTADO REAL NOWPAYMENTS - MARKETING
// ================================================================

router.get(
    '/marketing/status/:pagoId',
    verificarToken,
    async (req, res) => {

        try {
            const pagoId = req.params.pagoId;
            const userId = req.usuario.id;

            if (!pagoId) {
                return respuestaError(res, 400, 'pagoId inválido');
            }

            if (!supabaseAdmin) {
                return respuestaError(res, 500, 'Servicio interno no configurado');
            }

            if (!NOWPAYMENTS_API_KEY) {
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            const { data: pago, error: pagoError } = await supabaseAdmin
                .from('marketing_pagos')
                .select('*')
                .eq('id', pagoId)
                .eq('anunciante_id', userId)
                .maybeSingle();

            if (pagoError) throw pagoError;

            if (!pago) {
                return respuestaError(res, 404, 'Pago no encontrado');
            }

            if (pago.estado === 'pagado') {
                return res.json({ success: true, data: pago, final: true, paid: true });
            }

            if (!pago.payment_id) {
                return res.json({
                    success: true,
                    data: pago,
                    final: false,
                    paid: false,
                    message: 'El pago todavía no tiene payment_id'
                });
            }

            let payment;
            try {
                const response = await axios.get(
                    `${NOWPAYMENTS_API_URL}/${encodeURIComponent(pago.payment_id)}`,
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );
                payment = response.data;
            } catch (paymentError) {
                logger.error(
                    `Error consultando NOWPayments payment ${pago.payment_id}: ${
                        paymentError.response?.data
                            ? JSON.stringify(paymentError.response.data)
                            : paymentError.message
                    }`
                );
                return res.status(502).json({
                    success: false,
                    error: 'No fue posible consultar el estado del pago'
                });
            }

            const estadoNow = String(payment?.payment_status || 'unknown').toLowerCase();
            const estaPagado = estadoNow === 'finished';
            const estaFallido = ['failed', 'refunded', 'expired'].includes(estadoNow);

            let estadoLocal = pago.estado;
            if (estaPagado) estadoLocal = 'pagado';
            else if (estaFallido) estadoLocal = 'cancelado';
            else if (estadoNow === 'confirming' || estadoNow === 'sending') estadoLocal = 'confirmando';
            else estadoLocal = 'pagando';

            const updates = {
                nowpayments_status: estadoNow,
                estado: estadoLocal
            };

            const { data: pagoActualizado, error: updateError } = await supabaseAdmin
                .from('marketing_pagos')
                .update(updates)
                .eq('id', pago.id)
                .eq('anunciante_id', userId)
                .select()
                .single();

            if (updateError) throw updateError;

            if (estaPagado) {
                const { error: activarError } = await supabaseAdmin.rpc('activar_campana_marketing', {
                    p_campaign_id: pago.campaign_id
                });

                if (activarError) {
                    logger.error(`Error activando campaña ${pago.campaign_id}: ${activarError.message}`);
                    return res.json({
                        success: true,
                        data: pagoActualizado,
                        final: true,
                        paid: true,
                        activated: false,
                        message: 'Pago confirmado. La activación está pendiente de procesamiento.'
                    });
                }

                return res.json({
                    success: true,
                    data: pagoActualizado,
                    final: true,
                    paid: true,
                    activated: true
                });
            }

            return res.json({
                success: true,
                data: pagoActualizado,
                final: estaFallido,
                paid: false,
                failed: estaFallido,
                nowpayments: payment
            });

        } catch (error) {
            logger.error(`❌ Error verificando estado pago Marketing: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error verificando el estado del pago'
            });
        }
    }
);

// ================================================================
// ESTADO REAL NOWPAYMENTS - INTERNET
// ================================================================

router.get(
    '/internet/status/:ordenId',
    verificarToken,
    async (req, res) => {

        try {
            const ordenId = req.params.ordenId;
            const userId = req.usuario.id;

            if (!ordenId) {
                return respuestaError(res, 400, 'ordenId inválido');
            }

            if (!supabaseAdmin) {
                return respuestaError(res, 500, 'Servicio interno no configurado');
            }

            if (!NOWPAYMENTS_API_KEY) {
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            const { data: orden, error: ordenError } = await supabaseAdmin
                .from('ordenes_internet')
                .select('*')
                .eq('id', ordenId)
                .eq('usuario_id', userId)
                .maybeSingle();

            if (ordenError) throw ordenError;

            if (!orden) {
                return respuestaError(res, 404, 'Orden no encontrada');
            }

            if (orden.estado === 'activa' || orden.estado === 'activada' || orden.estado === 'completado') {
                return res.json({ success: true, data: orden, final: true, paid: true, activated: true });
            }

            if (!orden.payment_id) {
                return res.json({
                    success: true,
                    data: orden,
                    final: false,
                    paid: false,
                    message: 'La orden todavía no tiene payment_id'
                });
            }

            let payment;
            try {
                const response = await axios.get(
                    `${NOWPAYMENTS_API_URL}/${encodeURIComponent(orden.payment_id)}`,
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );
                payment = response.data;
            } catch (paymentError) {
                logger.error(
                    `Error consultando NOWPayments payment ${orden.payment_id}: ${
                        paymentError.response?.data
                            ? JSON.stringify(paymentError.response.data)
                            : paymentError.message
                    }`
                );
                return res.status(502).json({
                    success: false,
                    error: 'No fue posible consultar el estado del pago'
                });
            }

            const estadoNow = String(payment?.payment_status || 'unknown').toLowerCase();
            const estaPagado = estadoNow === 'finished';
            const estaFallido = ['failed', 'refunded', 'expired'].includes(estadoNow);

            let estadoLocal = orden.estado;
            if (estaPagado) estadoLocal = 'pagada';
            else if (estaFallido) estadoLocal = 'cancelada';
            else if (estadoNow === 'confirming' || estadoNow === 'sending') estadoLocal = 'confirmando';
            else estadoLocal = 'pagando';

            const updates = {
                nowpayments_status: estadoNow,
                estado: estadoLocal
            };

            if (estaPagado) {
                updates.pagado_en = orden.pagado_en || new Date().toISOString();
            }

            const { data: ordenActualizada, error: updateError } = await supabaseAdmin
                .from('ordenes_internet')
                .update(updates)
                .eq('id', orden.id)
                .eq('usuario_id', userId)
                .select()
                .single();

            if (updateError) throw updateError;

            if (estaPagado) {
                const { error: activarError } = await supabaseAdmin.rpc('activar_orden_internet', {
                    p_orden_id: orden.id
                });

                if (activarError) {
                    logger.error(`Error activando orden Internet ${orden.id}: ${activarError.message}`);
                    return res.json({
                        success: true,
                        data: ordenActualizada,
                        final: true,
                        paid: true,
                        activated: false,
                        message: 'Pago confirmado. La activación está pendiente de procesamiento.'
                    });
                }

                const { data: ordenFinal } = await supabaseAdmin
                    .from('ordenes_internet')
                    .select('*')
                    .eq('id', orden.id)
                    .single();

                return res.json({
                    success: true,
                    data: ordenFinal || ordenActualizada,
                    final: true,
                    paid: true,
                    activated: true
                });
            }

            return res.json({
                success: true,
                data: ordenActualizada,
                final: estaFallido,
                paid: false,
                failed: estaFallido,
                nowpayments: payment
            });

        } catch (error) {
            logger.error(`❌ Error verificando estado pago Internet: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error verificando el estado del pago'
            });
        }
    }
);

// ================================================================
// HISTORIAL DE PAGOS
// ================================================================

router.get(
    '/history',
    verificarToken,
    async (req, res) => {

        try {
            const userId = req.usuario.id;

            const { data, error } = await supabase
                .from('pagos_transmision')
                .select('*')
                .eq('espectador_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return res.json({
                success: true,
                data: data || []
            });

        } catch (error) {
            logger.error(`Error obteniendo historial: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error obteniendo historial de pagos'
            });
        }
    }
);

// ================================================================
// EXPORTACIÓN
// ================================================================

module.exports = router;