// ================================================================
// RUTAS DE LIVEKIT
// ================================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { AccessToken } = require('livekit-server-sdk');

// Generar token para LiveKit
router.post('/token', verificarToken, async (req, res) => {
    try {
        const { roomName } = req.body;
        const userId = req.usuario.id;

        // Crear token de acceso
        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: userId,
                name: req.usuario.user_metadata?.nombre || 'Usuario'
            }
        );

        // Otorgar permisos para la sala
        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true
        });

        const token = at.toJwt();

        logger.info(`Token LiveKit generado para: ${userId}`);
        res.json({
            success: true,
            token,
            wsUrl: process.env.LIVEKIT_WS_URL
        });
    } catch (error) {
        logger.error(`Error generando token LiveKit: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener transmisiones activas
router.get('/streams', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transmisiones')
            .select('*, usuarios(nombre, avatar)')
            .eq('estado', 'en_vivo')
            .order('fecha_inicio', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            data
        });
    } catch (error) {
        logger.error(`Error obteniendo transmisiones: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Iniciar transmisión
router.post('/start', verificarToken, async (req, res) => {
    try {
        const { titulo, descripcion, tipo, precio } = req.body;
        const userId = req.usuario.id;

        const { data, error } = await supabase
            .from('transmisiones')
            .insert({
                streamer_id: userId,
                titulo: titulo || 'Live en Sariel\'s',
                descripcion: descripcion || '',
                tipo_transmision: tipo || 'gratis',
                precio: precio || 0,
                fecha_inicio: new Date().toISOString(),
                estado: 'en_vivo'
            })
            .select();

        if (error) throw error;

        logger.info(`Transmisión iniciada: ${data[0].id}`);
        res.json({
            success: true,
            data: data[0]
        });
    } catch (error) {
        logger.error(`Error iniciando transmisión: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Finalizar transmisión
router.post('/end/:transmisionId', verificarToken, async (req, res) => {
    try {
        const { transmisionId } = req.params;
        const userId = req.usuario.id;

        const { data, error } = await supabase
            .from('transmisiones')
            .update({
                estado: 'finalizada',
                finalizado_en: new Date().toISOString()
            })
            .eq('id', transmisionId)
            .eq('streamer_id', userId)
            .select();

        if (error) throw error;

        logger.info(`Transmisión finalizada: ${transmisionId}`);
        res.json({
            success: true,
            data: data[0]
        });
    } catch (error) {
        logger.error(`Error finalizando transmisión: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;