// ================================================================
// ROUTES/PAYMENTS.JS
// RUTAS DE PAGOS - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const {
    supabase
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
// CREAR ORDEN DE PAGO
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
                return res.status(400).json({
                    success: false,
                    error: 'transmisionId es requerido'
                });
            }

            const montoNumerico = Number(monto);

            if (
                !Number.isFinite(montoNumerico) ||
                montoNumerico <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Monto inválido'
                });
            }

            const metodoPago = metodo || 'crypto';

            if (!['crypto'].includes(metodoPago)) {
                return res.status(400).json({
                    success: false,
                    error: 'Método de pago no soportado'
                });
            }

            if (!NOWPAYMENTS_API_KEY) {
                logger.error(
                    'NOWPAYMENTS_API_KEY no está configurada'
                );

                return res.status(500).json({
                    success: false,
                    error: 'Servicio de pagos no configurado'
                });
            }

            // ----------------------------------------------------
            // COMISIÓN
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

                // ------------------------------------------------
                // IMPORTANTE:
                // La orden local queda pendiente.
                // NO se marca como completada.
                // ------------------------------------------------

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
// ESTADO DE PAGO
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
                return res.status(400).json({
                    success: false,
                    error: 'ordenId requerido'
                });
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
                    return res.status(404).json({
                        success: false,
                        error: 'Orden no encontrada'
                    });
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
                error: 'Error obteniendo historial de pagos'
            });
        }
    }
);

// ================================================================
// EXPORTACIÓN
// ================================================================

module.exports = router;