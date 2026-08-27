// ================================================================
// RUTAS DE WEBHOOKS
// ================================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarHMAC } = require('../utils/encryption');
const { limitadorWebhook } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

// Webhook de NOWPayments
router.post('/nowpayments', limitadorWebhook, async (req, res) => {
    try {
        const payload = req.body;
        const firmaRecibida = req.headers['x-nowpayments-sig'];

        logger.info(`Webhook NOWPayments recibido: ${payload.event}`);

        // Verificar firma HMAC
        const esValido = verificarHMAC(payload, firmaRecibida, process.env.NOWPAYMENTS_WEBHOOK_SECRET);

        if (!esValido) {
            logger.warning('Webhook inválido de NOWPayments - Firma no coincide');
            return res.status(401).json({ error: 'Firma inválida' });
        }

        // Procesar según evento
        if (payload.event === 'payment.finished') {
            const ordenId = payload.data.order_id;
            const monto = payload.data.price_amount;

            // Verificar que la orden existe
            const { data: orden, error: ordenError } = await supabase
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .single();

            if (ordenError) {
                logger.error(`Orden no encontrada: ${ordenId}`);
                return res.status(404).json({ error: 'Orden no encontrada' });
            }

            // Verificar que no esté ya completada
            if (orden.estado === 'completado') {
                logger.info(`Orden ya completada: ${ordenId}`);
                return res.json({ success: true, message: 'Ya procesado' });
            }

            // Actualizar estado del pago
            const { error: updateError } = await supabase
                .from('pagos_transmision')
                .update({ 
                    estado: 'completado',
                    pagado_en: new Date().toISOString()
                })
                .eq('id', ordenId);

            if (updateError) throw updateError;

            // Sumar tokens al streamer (si es compra de tokens)
            if (orden.tipo_pago === 'tokens') {
                await supabase.rpc('increment_tokens', {
                    p_user_id: orden.streamer_id,
                    p_cantidad: Math.floor(orden.monto_pagado / 6.20)
                });
            }

            logger.info(`Pago completado exitosamente: ${ordenId}`);
        }

        res.json({ success: true });
    } catch (error) {
        logger.error(`Error en webhook NOWPayments: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Webhook de Supabase (para pruebas)
router.post('/supabase', limitadorWebhook, async (req, res) => {
    try {
        const payload = req.body;
        logger.info(`Webhook Supabase recibido: ${payload.table}`);
        
        // Procesar según tabla
        if (payload.table === 'usuarios' && payload.type === 'INSERT') {
            logger.info(`Nuevo usuario registrado: ${payload.record.email}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        logger.error(`Error en webhook Supabase: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Webhook de prueba (para verificar que el servidor responde)
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Webhook endpoint funcionando',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;