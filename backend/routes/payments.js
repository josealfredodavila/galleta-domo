// ================================================================
// RUTAS DE PAGOS
// ================================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const { limitadorPagos } = require('../middleware/rateLimit');
const { validarPago, verificarErrores } = require('../middleware/validation');
const logger = require('../utils/logger');
const axios = require('axios');

// Crear orden de pago
router.post('/create', verificarToken, limitadorPagos, validarPago, verificarErrores, async (req, res) => {
    try {
        const { transmisionId, monto, metodo } = req.body;
        const userId = req.usuario.id;

        // Calcular comisiones
        const comisionSariels = monto * 0.02; // 2%
        const montoStreamer = monto - comisionSariels;

        // Guardar en Supabase
        const { data, error } = await supabase
            .from('pagos_transmision')
            .insert({
                transmision_id: transmisionId,
                espectador_id: userId,
                monto_pagado: monto,
                comision_sariels: comisionSariels,
                monto_streamer: montoStreamer,
                metodo_pago: metodo,
                tipo_pago: 'acceso',
                estado: 'pendiente'
            })
            .select();

        if (error) throw error;

        // Si es pago con crypto, generar orden en NOWPayments
        let paymentData = data[0];
        if (metodo === 'crypto') {
            try {
                const nowpayments = await axios.post('https://api.nowpayments.io/v1/payment', {
                    price_amount: monto,
                    price_currency: 'usd',
                    pay_currency: 'usdt',
                    order_id: data[0].id,
                    order_description: `Pago transmisión ${transmisionId}`
                }, {
                    headers: {
                        'x-api-key': process.env.NOWPAYMENTS_API_KEY
                    }
                });

                paymentData = { ...data[0], payment_url: nowpayments.data.payment_url };
            } catch (nowError) {
                logger.error(`Error en NOWPayments: ${nowError.message}`);
                // Continuamos con la orden sin payment_url
            }
        }

        logger.info(`Orden de pago creada: ${data[0].id}`);
        res.json({
            success: true,
            data: paymentData
        });
    } catch (error) {
        logger.error(`Error creando pago: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Verificar estado de pago
router.get('/status/:ordenId', verificarToken, async (req, res) => {
    try {
        const { ordenId } = req.params;
        const userId = req.usuario.id;

        const { data, error } = await supabase
            .from('pagos_transmision')
            .select('*')
            .eq('id', ordenId)
            .eq('espectador_id', userId)
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data
        });
    } catch (error) {
        logger.error(`Error verificando pago: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Historial de pagos del usuario
router.get('/history', verificarToken, async (req, res) => {
    try {
        const userId = req.usuario.id;

        const { data, error } = await supabase
            .from('pagos_transmision')
            .select('*')
            .eq('espectador_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            data
        });
    } catch (error) {
        logger.error(`Error obteniendo historial: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;