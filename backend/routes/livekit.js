// ================================================================
// RUTAS DE LIVEKIT — Sariel's Ecosystem v2
// ================================================================
// Endpoints:
//   POST /api/livekit/token          → Token JWT para unirse a un room
//   GET  /api/livekit/streams        → Listar transmisiones activas
//   POST /api/livekit/start          → Iniciar transmisión
//   POST /api/livekit/end/:id        → Finalizar transmisión
//
// CAMBIOS v2:
// - Devuelve "url" además de "wsUrl" (compatibilidad con mensajes.js)
// - Acepta "participantName" del frontend con fallback
// - Valida variables de entorno antes de generar tokens
// - Valida roomName en el body
// - Devuelve "identity" para debugging
// - Token con TTL explícito de 2 horas
// ================================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { AccessToken } = require('livekit-server-sdk');

// ================================================================
// POST /api/livekit/token
// ================================================================
router.post('/token', verificarToken, async (req, res) => {
    try {
        const { roomName, participantName } = req.body;
        const userId = req.usuario.id;

        // Validaciones básicas
        if (!roomName || typeof roomName !== 'string' || !roomName.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Falta roomName o es inválido'
            });
        }

        // Validar variables de entorno (evita errores confusos)
        if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
            logger.error('Faltan LIVEKIT_API_KEY o LIVEKIT_API_SECRET');
            return res.status(500).json({
                success: false,
                error: 'LiveKit no está configurado en el servidor'
            });
        }

        if (!process.env.LIVEKIT_WS_URL) {
            logger.error('Falta LIVEKIT_WS_URL en el entorno');
            return res.status(500).json({
                success: false,
                error: 'LiveKit URL no configurada'
            });
        }

        // Nombre del participante: preferir el del frontend
        const nombreFinal =
            participantName ||
            req.usuario.user_metadata?.nombre ||
            req.usuario.email?.split('@')[0] ||
            'Usuario';

        // Crear token de acceso
        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: userId,
                name: nombreFinal,
                ttl: '2h'
            }
        );

        // Permisos para el room
        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true
        });

        // ⚠️ CRÍTICO: LiveKit SDK v2 requiere await en toJwt()
        const token = await at.toJwt();

        logger.info(`[LiveKit] Token generado para ${userId} en room ${roomName}`);

        // Devolvemos "url" (lo que usa el frontend) y "wsUrl" (compatibilidad)
        res.json({
            success: true,
            token,
            url: process.env.LIVEKIT_WS_URL,
            wsUrl: process.env.LIVEKIT_WS_URL,
            identity: userId
        });
    } catch (error) {
        logger.error(`[LiveKit] Error generando token: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
// GET /api/livekit/streams — Listar transmisiones activas
// ================================================================
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
        logger.error(`[LiveKit] Error obteniendo transmisiones: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
// POST /api/livekit/start — Iniciar transmisión
// ================================================================
router.post('/start', verificarToken, async (req, res) => {
    try {
        const { titulo, descripcion, tipo, precio } = req.body;
        const userId = req.usuario.id;

        const { data, error } = await supabase
            .from('transmisiones')
            .insert({
                streamer_id: userId,
                titulo: titulo || "Live en Sariel's",
                descripcion: descripcion || '',
                tipo_transmision: tipo || 'gratis',
                precio: precio || 0,
                fecha_inicio: new Date().toISOString(),
                estado: 'en_vivo'
            })
            .select();

        if (error) throw error;

        logger.info(`[LiveKit] Transmisión iniciada: ${data[0].id}`);
        res.json({
            success: true,
            data: data[0]
        });
    } catch (error) {
        logger.error(`[LiveKit] Error iniciando transmisión: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
// POST /api/livekit/end/:transmisionId — Finalizar transmisión
// ================================================================
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

        logger.info(`[LiveKit] Transmisión finalizada: ${transmisionId}`);
        res.json({
            success: true,
            data: data[0]
        });
    } catch (error) {
        logger.error(`[Error finalizando transmisión: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;