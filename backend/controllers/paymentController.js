// ================================================================
// CONTROLADOR DE PAGOS
// ================================================================

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const axios = require('axios');

class PaymentController {
    // Crear orden de pago
    static async createPayment(req, res) {
        try {
            const { transmisionId, monto, metodo } = req.body;
            const userId = req.usuario.id;

            const comisionSariels = monto * 0.02;
            const montoStreamer = monto - comisionSariels;

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

            logger.info(`Orden de pago creada: ${data[0].id}`);
            res.json({
                success: true,
                data: data[0]
            });
        } catch (error) {
            logger.error(`Error creando pago: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Verificar pago
    static async getPaymentStatus(req, res) {
        try {
            const { ordenId } = req.params;

            const { data, error } = await supabase
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
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
    }

    // Historial de pagos
    static async getPaymentHistory(req, res) {
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
    }
}

module.exports = PaymentController;