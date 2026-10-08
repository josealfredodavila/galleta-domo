// ================================================================
// routes/payments.js - PAGOS DE LA APP (transmisiones LIVE)
// ================================================================
// Endpoint: POST /api/payments/create
// Método:   NOWPayments (crypto USDT TRC20)
// 
// Este archivo maneja los pagos de acceso a transmisiones en vivo.
// NO TOCA: los pagos de IA, membresías, Csariel's Pay ni Live Pass.
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');

const supabaseAdmin = require('../lib/supabase-admin');
const logger = require('../utils/logger');

const { verificarToken } = require('../middleware/auth');
const { limitadorPagos } = require('../middleware/rateLimit');

// Middleware opcional de verificación de errores (si existe)
let verificarErrores = (req, res, next) => next();
try {
    const middleware = require('../middleware/validation');
    if (middleware && typeof middleware.verificarErrores === 'function') {
        verificarErrores = middleware.verificarErrores;
    }
} catch (e) {
    // Si no existe, seguimos sin él
}

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1/payment';

/* ================================================================
   UTILIDADES
================================================================ */

function respuestaError(res, status, mensaje) {
    return res.status(status).json({
        success: false,
        error: mensaje
    });
}

/* ================================================================
   POST /api/payments/create
   ----------------------------------------------------------------
   Crea una orden de pago para acceder a una transmisión en vivo.
================================================================ */

router.post(
    '/create',
    verificarToken,
    limitadorPagos,
    verificarErrores,
    async (req, res) => {

        try {
            const { transmisionId } = req.body;
            const userId = req.usuario.id;

            if (!transmisionId) {
                return respuestaError(res, 400, 'transmisionId es requerido');
            }

            const metodoPago = req.body.metodo || 'crypto';
            if (metodoPago !== 'crypto') {
                return respuestaError(res, 400, 'Método de pago no soportado');
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error('NOWPAYMENTS_API_KEY no está configurada');
                return respuestaError(res, 500, 'Servicio de pagos no configurado');
            }

            // El monto NUNCA viene del cliente: se toma del precio de la transmisión en la base
            const { data: transmision, error: transError } = await supabaseAdmin
                .from('transmisiones')
                .select('id, streamer_id, precio_acceso')
                .eq('id', Number(transmisionId))
                .maybeSingle();

            if (transError) throw transError;

            if (!transmision) {
                return respuestaError(res, 404, 'Transmisión no encontrada');
            }

            if (transmision.streamer_id === userId) {
                return respuestaError(res, 400, 'No puedes pagar tu propia transmisión');
            }

            const montoNumerico = Number(transmision.precio_acceso);
            if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
                return respuestaError(res, 400, 'Esta transmisión no tiene acceso de pago');
            }

            const comisionSariels = Number((montoNumerico * 0.02).toFixed(2));
            const montoStreamer = Number((montoNumerico - comisionSariels).toFixed(2));

            const { data: orden, error: ordenError } = await supabaseAdmin
                .from('pagos_transmision')
                .insert({
                    transmision_id: transmision.id,
                    espectador_id: userId,
                    streamer_id: transmision.streamer_id,
                    monto_pagado: montoNumerico,
                    comision_sariels: comisionSariels,
                    monto_streamer: montoStreamer,
                    metodo_pago: metodoPago,
                    tipo_pago: 'acceso',
                    estado: 'pendiente',
                    monto_usd_esperado: montoNumerico,
                    moneda_orden: 'USD',
                    price_amount_enviado: montoNumerico,
                    price_currency_enviado: 'usd',
                    pay_currency_enviado: 'usdttrc20'
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
                        order_description: `Pago transmisión ${transmision.id}`
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

/* ================================================================
   GET /api/payments/health
   ----------------------------------------------------------------
   Health check para verificar que el router está montado.
================================================================ */

router.get('/health', (req, res) => {
    res.json({
        success: true,
        modulo: 'payments',
        nowpayments_configurado: Boolean(NOWPAYMENTS_API_KEY)
    });
});

/* ================================================================
   EXPORT
================================================================ */

module.exports = router;