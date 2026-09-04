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
            const {
                transmisionId,
                monto,
                metodo
            } = req.body;

            const userId = req.usuario.id;

            // ----------------------------------------------------
            // VALIDACIONES
            // ----------------------------------------------------

            if (!transmisionId) {
                return respuestaError(
                    res,
                    400,
                    'transmisionId es requerido'
                );
            }

            const montoNumerico = Number(monto);

            if (
                !Number.isFinite(montoNumerico) ||
                montoNumerico <= 0
            ) {
                return respuestaError(
                    res,
                    400,
                    'Monto inválido'
                );
            }

            const metodoPago = metodo || 'crypto';

            if (!['crypto'].includes(metodoPago)) {
                return respuestaError(
                    res,
                    400,
                    'Método de pago no soportado'
                );
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error(
                    'NOWPAYMENTS_API_KEY no está configurada'
                );

                return respuestaError(
                    res,
                    500,
                    'Servicio de pagos no configurado'
                );
            }

            if (!supabase) {
                logger.error(
                    'Cliente Supabase no configurado'
                );

                return respuestaError(
                    res,
                    500,
                    'Base de datos no configurada'
                );
            }

            // ----------------------------------------------------
            // COMISIÓN TRANSMISIONES
            // ----------------------------------------------------

            const comisionSariels =
                Number((montoNumerico * 0.02).toFixed(2));

            const montoStreamer =
                Number(
                    (montoNumerico - comisionSariels).toFixed(2)
                );

            // ----------------------------------------------------
            // CREAR ORDEN LOCAL
            // ----------------------------------------------------

            const {
                data: orden,
                error: ordenError
            } = await supabase
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

            if (ordenError) {
                throw ordenError;
            }

            // ----------------------------------------------------
            // CREAR PAYMENT EN NOWPAYMENTS
            // ----------------------------------------------------

            let nowPayment;

            try {

                const response = await axios.post(
                    NOWPAYMENTS_API_URL,
                    {
                        price_amount: montoNumerico,
                        price_currency: 'usd',
                        pay_currency: 'usdt',

                        order_id: String(orden.id),

                        order_description:
                            `Pago transmisión ${transmisionId}`
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
                            ? JSON.stringify(
                                paymentError.response.data
                            )
                            : paymentError.message
                    }`
                );

                return res.status(502).json({
                    success: false,
                    error:
                        'No fue posible crear el pago con NOWPayments',
                    orden: {
                        id: orden.id,
                        estado: orden.estado
                    }
                });
            }

            // ----------------------------------------------------
            // RESPUESTA
            // ----------------------------------------------------

            logger.info(
                `Orden de pago creada: ${orden.id}`
            );

            return res.status(201).json({
                success: true,

                data: {
                    id: orden.id,

                    estado: orden.estado,

                    monto: orden.monto_pagado,

                    moneda: 'USD',

                    metodo_pago:
                        orden.metodo_pago,

                    payment_id:
                        nowPayment.payment_id || null,

                    payment_url:
                        nowPayment.payment_url || null,

                    pay_address:
                        nowPayment.pay_address || null,

                    pay_amount:
                        nowPayment.pay_amount || null,

                    pay_currency:
                        nowPayment.pay_currency || null
                }
            });

        } catch (error) {

            logger.error(
                `Error creando pago: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error: 'Error interno creando el pago'
            });
        }
    }
);

// ================================================================
// CREAR PAGO - MURO / VENTA DE TOKENS
// ================================================================
//
// Flujo:
//
// 1. Usuario autenticado solicita comprar tokens.
// 2. Backend consulta muro_posts.
// 3. Backend verifica vendedor, inventario y precio.
// 4. Backend crea muro_ventas_tokens en pendiente.
// 5. Backend crea payment en NOWPayments.
// 6. Se guarda payment_id y estado.
// 7. NOWPayments posteriormente notificará al webhook.
// 8. El webhook llamará a la RPC atómica de liquidación.
//
// IMPORTANTE:
// - El precio NO se acepta desde el frontend.
// - La cantidad se valida contra la publicación.
// - Los tokens NO se modifican aquí.
// - La liquidación se realiza exclusivamente mediante RPC.
// ================================================================

router.post(
    '/muro/create',
    verificarToken,
    limitadorPagos,
    async (req, res) => {

        try {

            const userId = req.usuario.id;

            const postId =
                Number(req.body?.postId);

            const cantidad =
                Number(req.body?.cantidad);

            // ----------------------------------------------------
            // VALIDACIONES BÁSICAS
            // ----------------------------------------------------

            if (!Number.isInteger(postId) || postId <= 0) {
                return respuestaError(
                    res,
                    400,
                    'postId inválido'
                );
            }

            if (!enteroPositivo(cantidad)) {
                return respuestaError(
                    res,
                    400,
                    'La cantidad debe ser un número entero mayor a 0'
                );
            }

            // Límite defensivo.
            if (cantidad > 1000000000) {
                return respuestaError(
                    res,
                    400,
                    'Cantidad inválida'
                );
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error(
                    'NOWPAYMENTS_API_KEY no está configurada'
                );

                return respuestaError(
                    res,
                    500,
                    'Servicio de pagos no configurado'
                );
            }

            if (!supabaseAdmin) {
                logger.error(
                    'supabaseAdmin no está configurado'
                );

                return respuestaError(
                    res,
                    500,
                    'Servicio interno no configurado'
                );
            }

            // ----------------------------------------------------
            // CONSULTAR PUBLICACIÓN REAL
            // ----------------------------------------------------
            //
            // El precio viene exclusivamente de la base de datos.
            // Nunca se utiliza precio enviado por el navegador.
            //

            const {
                data: post,
                error: postError
            } = await supabaseAdmin
                .from('muro_posts')
                .select(`
                    id,
                    usuario_id,
                    cantidad_venta,
                    precio_venta,
                    vendido
                `)
                .eq('id', postId)
                .maybeSingle();

            if (postError) {
                logger.error(
                    `Error consultando publicación Muro ${postId}: ${postError.message}`
                );

                return respuestaError(
                    res,
                    500,
                    'Error consultando la publicación'
                );
            }

            if (!post) {
                return respuestaError(
                    res,
                    404,
                    'Publicación no encontrada'
                );
            }

            // ----------------------------------------------------
            // NO COMPRAR A UNO MISMO
            // ----------------------------------------------------

            if (
                String(post.usuario_id) ===
                String(userId)
            ) {
                return respuestaError(
                    res,
                    400,
                    'No puedes comprar tus propios tokens'
                );
            }

            // ----------------------------------------------------
            // VALIDAR PUBLICACIÓN EN VENTA
            // ----------------------------------------------------

            const inventario =
                Number(post.cantidad_venta || 0);

            if (
                post.vendido === true ||
                inventario <= 0
            ) {
                return respuestaError(
                    res,
                    409,
                    'Esta publicación ya no tiene tokens disponibles'
                );
            }

            if (cantidad > inventario) {
                return respuestaError(
                    res,
                    409,
                    `Solo hay ${inventario} tokens disponibles`
                );
            }

            // ----------------------------------------------------
            // VALIDAR PRECIO REAL
            // ----------------------------------------------------

            const precioUnitarioMxn =
                Number(post.precio_venta);

            if (
                !Number.isFinite(precioUnitarioMxn) ||
                precioUnitarioMxn <= 0
            ) {
                logger.error(
                    `Precio inválido en muro_posts. post_id=${postId}`
                );

                return respuestaError(
                    res,
                    500,
                    'La publicación tiene un precio inválido'
                );
            }

            const precioTotalMxn =
                Number(
                    (precioUnitarioMxn * cantidad).toFixed(2)
                );

            if (
                !Number.isFinite(precioTotalMxn) ||
                precioTotalMxn <= 0
            ) {
                return respuestaError(
                    res,
                    400,
                    'Importe de compra inválido'
                );
            }

            // ----------------------------------------------------
            // COMISIÓN DEL MURO
            // ----------------------------------------------------
            //
            // El precio de la venta es el importe de la operación.
            // La comisión se conserva separada.
            //
            // La liquidación RPC utiliza este valor para registrar
            // la operación sin modificar directamente los balances.
            //

            const comisionPlataforma =
                Number(
                    (precioTotalMxn * 0.01).toFixed(2)
                );

            // ----------------------------------------------------
            // CREAR VENTA LOCAL
            // ----------------------------------------------------
            //
            // precio_usdt es NOT NULL.
            // Se inicializa temporalmente en 0 y se sustituye por
            // el pay_amount real devuelto por NOWPayments.
            //

            const {
                data: venta,
                error: ventaError
            } = await supabaseAdmin
                .from('muro_ventas_tokens')
                .insert({
                    post_id: post.id,
                    vendedor_id: post.usuario_id,
                    comprador_id: userId,
                    cantidad,
                    precio_mxn: precioTotalMxn,
                    precio_usdt: 0,
                    comision_plataforma: comisionPlataforma,
                    monto_recibido: null,
                    estado: 'pendiente',
                    fecha: new Date().toISOString(),
                    moneda_pago: 'USDT',
                    nowpayments_status: 'waiting'
                })
                .select()
                .single();

            if (ventaError) {

                logger.error(
                    `Error creando venta Muro: ${ventaError.message}`
                );

                return respuestaError(
                    res,
                    500,
                    'No fue posible crear la orden de compra'
                );
            }

            // ----------------------------------------------------
            // ORDER ID NOWPAYMENTS
            // ----------------------------------------------------
            //
            // El prefijo muro_ permite al webhook distinguir esta
            // operación de los pagos de transmisiones existentes.
            //

            const orderId =
                `muro_${venta.id}`;

            // ----------------------------------------------------
            // CREAR PAYMENT NOWPAYMENTS
            // ----------------------------------------------------

            let nowPayment;

            try {

                const response = await axios.post(
                    NOWPAYMENTS_API_URL,
                    {
                        price_amount: precioTotalMxn,

                        // El precio comercial de la publicación
                        // está expresado en MXN.
                        price_currency: 'mxn',

                        // NOWPayments calcula el importe USDT real.
                        pay_currency: 'usdt',

                        order_id: orderId,

                        order_description:
                            `Compra de ${cantidad} tokens en Muro #${post.id}`
                    },
                    {
                        headers: {
                            'x-api-key': NOWPAYMENTS_API_KEY,
                            'Content-Type': 'application/json'
                        },

                        timeout: 15000
                    }
                );

                nowPayment =
                    response.data;

            } catch (paymentError) {

                logger.error(
                    `Error creando payment Muro ${orderId}: ${
                        paymentError.response?.data
                            ? JSON.stringify(
                                paymentError.response.data
                            )
                            : paymentError.message
                    }`
                );

                // La venta permanece pendiente.
                // No se toca inventario ni tokens.

                await supabaseAdmin
                    .from('muro_ventas_tokens')
                    .update({
                        nowpayments_status: 'creation_failed'
                    })
                    .eq('id', venta.id);

                return res.status(502).json({
                    success: false,
                    error:
                        'No fue posible crear el pago con NOWPayments',
                    venta_id: venta.id
                });
            }

            // ----------------------------------------------------
            // VALIDAR RESPUESTA NOWPAYMENTS
            // ----------------------------------------------------

            const paymentId =
                nowPayment?.payment_id || null;

            if (!paymentId) {

                logger.error(
                    `NOWPayments no devolvió payment_id para ${orderId}`
                );

                await supabaseAdmin
                    .from('muro_ventas_tokens')
                    .update({
                        nowpayments_status: 'creation_failed'
                    })
                    .eq('id', venta.id);

                return res.status(502).json({
                    success: false,
                    error:
                        'NOWPayments no devolvió un identificador de pago',
                    venta_id: venta.id
                });
            }

            // ----------------------------------------------------
            // DATOS DE PAGO REAL
            // ----------------------------------------------------

            const payAmount =
                numeroValido(nowPayment.pay_amount)
                    ? Number(nowPayment.pay_amount)
                    : 0;

            const payCurrency =
                nowPayment.pay_currency ||
                'usdt';

            const paymentStatus =
                nowPayment.payment_status ||
                'waiting';

            // ----------------------------------------------------
            // ACTUALIZAR VENTA
            // ----------------------------------------------------

            const {
                data: ventaActualizada,
                error: updateVentaError
            } = await supabaseAdmin
                .from('muro_ventas_tokens')
                .update({
                    payment_id: String(paymentId),

                    precio_usdt:
                        payAmount,

                    moneda_pago:
                        String(payCurrency),

                    nowpayments_status:
                        String(paymentStatus),

                    estado:
                        paymentStatus === 'confirming'
                            ? 'confirmando'
                            : 'pagando'
                })
                .eq('id', venta.id)
                .select()
                .single();

            if (updateVentaError) {

                logger.error(
                    `Error guardando payment_id Muro ${venta.id}: ${updateVentaError.message}`
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'El pago fue creado pero no se pudo guardar la orden',
                    venta_id: venta.id,
                    payment_id: paymentId
                });
            }

            // ----------------------------------------------------
            // RESPUESTA AL FRONTEND
            // ----------------------------------------------------

            logger.info(
                `✅ Pago Muro creado: venta=${venta.id} payment=${paymentId} order=${orderId}`
            );

            return res.status(201).json({
                success: true,

                data: {
                    venta_id:
                        ventaActualizada.id,

                    post_id:
                        ventaActualizada.post_id,

                    cantidad:
                        ventaActualizada.cantidad,

                    precio_mxn:
                        ventaActualizada.precio_mxn,

                    precio_usdt:
                        ventaActualizada.precio_usdt,

                    estado:
                        ventaActualizada.estado,

                    nowpayments_status:
                        ventaActualizada.nowpayments_status,

                    payment_id:
                        paymentId,

                    payment_url:
                        nowPayment.payment_url || null,

                    pay_address:
                        nowPayment.pay_address || null,

                    pay_amount:
                        nowPayment.pay_amount || null,

                    pay_currency:
                        nowPayment.pay_currency || null,

                    order_id:
                        orderId
                }
            });

        } catch (error) {

            logger.error(
                `❌ Error creando pago Muro: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error: 'Error interno creando el pago del Muro'
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

            const {
                ordenId
            } = req.params;

            const userId =
                req.usuario.id;

            if (!ordenId) {
                return respuestaError(
                    res,
                    400,
                    'ordenId requerido'
                );
            }

            const {
                data,
                error
            } = await supabase
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .eq('espectador_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return respuestaError(
                        res,
                        404,
                        'Orden no encontrada'
                    );
                }

                throw error;
            }

            return res.json({
                success: true,
                data
            });

        } catch (error) {

            logger.error(
                `Error verificando pago: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error: 'Error verificando el pago'
            });
        }
    }
);

// ================================================================
// ESTADO REAL NOWPAYMENTS - MURO
// ================================================================
//
// Este endpoint consulta directamente a NOWPayments.
//
// El frontend NO decide si un pago está completado.
//
// El backend:
// 1. Busca la venta.
// 2. Verifica que pertenezca al comprador.
// 3. Obtiene payment_id.
// 4. Consulta NOWPayments.
// 5. Actualiza el estado local.
// 6. Si el pago está finalizado, delega la liquidación al webhook/RPC.
//
// ================================================================

router.get(
    '/muro/status/:ventaId',
    verificarToken,
    async (req, res) => {

        try {

            const ventaId =
                Number(req.params.ventaId);

            const userId =
                req.usuario.id;

            if (
                !Number.isInteger(ventaId) ||
                ventaId <= 0
            ) {
                return respuestaError(
                    res,
                    400,
                    'ventaId inválido'
                );
            }

            if (!supabaseAdmin) {
                return respuestaError(
                    res,
                    500,
                    'Servicio interno no configurado'
                );
            }

            if (!NOWPAYMENTS_API_KEY) {
                return respuestaError(
                    res,
                    500,
                    'Servicio de pagos no configurado'
                );
            }

            // ----------------------------------------------------
            // BUSCAR VENTA PROPIA
            // ----------------------------------------------------

            const {
                data: venta,
                error: ventaError
            } = await supabaseAdmin
                .from('muro_ventas_tokens')
                .select('*')
                .eq('id', ventaId)
                .eq('comprador_id', userId)
                .maybeSingle();

            if (ventaError) {
                throw ventaError;
            }

            if (!venta) {
                return respuestaError(
                    res,
                    404,
                    'Venta no encontrada'
                );
            }

            // ----------------------------------------------------
            // YA LIQUIDADA
            // ----------------------------------------------------

            if (
                venta.estado === 'pagado' ||
                venta.estado === 'completado'
            ) {
                return res.json({
                    success: true,
                    data: venta,
                    final: true,
                    paid: true
                });
            }

            // ----------------------------------------------------
            // SIN PAYMENT ID
            // ----------------------------------------------------

            if (!venta.payment_id) {
                return res.json({
                    success: true,
                    data: venta,
                    final: false,
                    paid: false,
                    message:
                        'El pago todavía no tiene payment_id'
                });
            }

            // ----------------------------------------------------
            // CONSULTAR NOWPAYMENTS
            // ----------------------------------------------------

            let payment;

            try {

                const response = await axios.get(
                    `${NOWPAYMENTS_API_URL}/${encodeURIComponent(
                        venta.payment_id
                    )}`,
                    {
                        headers: {
                            'x-api-key':
                                NOWPAYMENTS_API_KEY,
                            'Content-Type':
                                'application/json'
                        },

                        timeout: 15000
                    }
                );

                payment =
                    response.data;

            } catch (paymentError) {

                logger.error(
                    `Error consultando NOWPayments payment ${venta.payment_id}: ${
                        paymentError.response?.data
                            ? JSON.stringify(
                                paymentError.response.data
                            )
                            : paymentError.message
                    }`
                );

                return res.status(502).json({
                    success: false,
                    error:
                        'No fue posible consultar el estado del pago'
                });
            }

            const estadoNow =
                String(
                    payment?.payment_status ||
                    'unknown'
                ).toLowerCase();

            const payAmount =
                numeroValido(payment?.pay_amount)
                    ? Number(payment.pay_amount)
                    : null;

            // ----------------------------------------------------
            // ESTADOS
            // ----------------------------------------------------

            const estadosFinales = [
                'finished'
            ];

            const estadosFallidos = [
                'failed',
                'refunded',
                'expired'
            ];

            const estaPagado =
                estadosFinales.includes(
                    estadoNow
                );

            const estaFallido =
                estadosFallidos.includes(
                    estadoNow
                );

            // ----------------------------------------------------
            // MAPEAR ESTADO LOCAL
            // ----------------------------------------------------

            let estadoLocal =
                venta.estado;

            if (estaPagado) {
                estadoLocal = 'pagado';
            } else if (estaFallido) {
                estadoLocal = 'cancelado';
            } else if (
                estadoNow === 'confirming' ||
                estadoNow === 'sending'
            ) {
                estadoLocal = 'confirmando';
            } else {
                estadoLocal = 'pagando';
            }

            // ----------------------------------------------------
            // ACTUALIZAR ESTADO LOCAL
            // ----------------------------------------------------

            const updates = {
                nowpayments_status:
                    estadoNow,
                estado:
                    estadoLocal
            };

            if (
                payAmount !== null &&
                payAmount > 0
            ) {
                updates.precio_usdt =
                    payAmount;
            }

            if (estaPagado) {
                updates.pagado_en =
                    venta.pagado_en ||
                    new Date().toISOString();

                if (
                    payAmount !== null &&
                    payAmount > 0
                ) {
                    updates.monto_recibido =
                        payAmount;
                }
            }

            const {
                data: ventaActualizada,
                error: updateError
            } = await supabaseAdmin
                .from('muro_ventas_tokens')
                .update(updates)
                .eq('id', venta.id)
                .eq('comprador_id', userId)
                .select()
                .single();

            if (updateError) {
                throw updateError;
            }

            // ----------------------------------------------------
            // SI FINALIZÓ
            // ----------------------------------------------------
            //
            // Intentamos liquidar inmediatamente.
            //
            // La RPC es idempotente, bloquea la venta y evita
            // doble acreditación.
            //

            if (estaPagado) {

                const {
                    data: liquidacion,
                    error: liquidacionError
                } = await supabaseAdmin.rpc(
                    'liquidar_venta_token_muro',
                    {
                        p_venta_id:
                            venta.id
                    }
                );

                if (liquidacionError) {

                    logger.error(
                        `Error liquidando venta Muro ${venta.id}: ${liquidacionError.message}`
                    );

                    // No fingimos que la operación terminó.
                    // El webhook podrá reintentar la liquidación.
                    return res.json({
                        success: true,
                        data: ventaActualizada,
                        final: true,
                        paid: true,
                        liquidated: false,
                        message:
                            'Pago confirmado. La liquidación está pendiente de procesamiento.'
                    });
                }

                // Volver a consultar para entregar estado real.
                const {
                    data: ventaFinal,
                    error: ventaFinalError
                } = await supabaseAdmin
                    .from('muro_ventas_tokens')
                    .select('*')
                    .eq('id', venta.id)
                    .single();

                if (ventaFinalError) {
                    throw ventaFinalError;
                }

                return res.json({
                    success: true,
                    data: ventaFinal,
                    final: true,
                    paid: true,
                    liquidated:
                        Boolean(
                            liquidacion?.success
                        ),
                    liquidation:
                        liquidacion || null
                });
            }

            // ----------------------------------------------------
            // RESPUESTA ESTADO NO FINAL
            // ----------------------------------------------------

            return res.json({
                success: true,

                data:
                    ventaActualizada,

                final:
                    estaFallido,

                paid:
                    false,

                failed:
                    estaFallido,

                nowpayments:
                    payment
            });

        } catch (error) {

            logger.error(
                `❌ Error verificando estado pago Muro: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error verificando el estado del pago'
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

            const userId =
                req.usuario.id;

            const {
                data,
                error
            } = await supabase
                .from('pagos_transmision')
                .select('*')
                .eq('espectador_id', userId)
                .order(
                    'created_at',
                    {
                        ascending: false
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                data: data || []
            });

        } catch (error) {

            logger.error(
                `Error obteniendo historial: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error obteniendo historial de pagos'
            });
        }
    }
);

// ================================================================
// EXPORTACIÓN
// ================================================================

module.exports = router;