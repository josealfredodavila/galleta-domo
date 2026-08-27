// ================================================================
// CONTROLADOR DE LIVE
// ================================================================

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { AccessToken } = require('livekit-server-sdk');

class LiveController {
    // Generar token LiveKit
    static async generateToken(req, res) {
        try {
            const { roomName } = req.body;
            const userId = req.usuario.id;

            const at = new AccessToken(
                process.env.LIVEKIT_API_KEY,
                process.env.LIVEKIT_API_SECRET,
                {
                    identity: userId,
                    name: req.usuario.user_metadata?.nombre || 'Usuario'
                }
            );

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
    }

    // Obtener transmisiones activas
    static async getActiveStreams(req, res) {
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
    }

    // Iniciar transmisión
    static async startStream(req, res) {
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
    }

    // Finalizar transmisión
    static async endStream(req, res) {
        try {
            const { transmisionId } = req.params;
            const userId = req.usuario.id;

            // Calcular duración
            const { data: streamData } = await supabase
                .from('transmisiones')
                .select('iniciado_en')
                .eq('id', transmisionId)
                .single();

            const duracion = streamData ? Math.floor((Date.now() - new Date(streamData.iniciado_en).getTime()) / 1000) : 0;

            const { data, error } = await supabase
                .from('transmisiones')
                .update({
                    estado: 'finalizada',
                    finalizado_en: new Date().toISOString(),
                    duracion: duracion
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
    }
}

module.exports = LiveController;