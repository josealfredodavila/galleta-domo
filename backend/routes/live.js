// backend/routes/live.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const LiveStream = require('../models/LiveStream');
const Post = require('../models/Post');
const jwt = require('jsonwebtoken');
const { AccessToken } = require('livekit-server-sdk');
const config = require('../../config/config');

// ========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ========================================
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET || config.jwt.secret);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Autenticación requerida' });
    }
};

// ========================================
// RUTA: CREAR TRANSMISIÓN
// POST /api/live/create
// ========================================
router.post('/create', auth, async (req, res) => {
    try {
        const { titulo, descripcion, privacidad, cobroActivo } = req.body;
        const userId = req.user.userId;

        // Validar campos
        if (!titulo || titulo.trim().length === 0) {
            return res.status(400).json({ error: 'El título es requerido' });
        }

        // Verificar que el usuario no tenga una transmisión activa
        const streamActivo = await LiveStream.findOne({
            usuario: userId,
            estado: { $in: ['en_vivo', 'pausado'] }
        });

        if (streamActivo) {
            return res.status(400).json({
                error: 'Ya tienes una transmisión activa',
                streamId: streamActivo._id
            });
        }

        // Generar roomId único
        const roomId = `live_${userId}_${Date.now()}`;
        const roomName = `room_${roomId}`;

        // Crear transmisión en base de datos
        const newStream = new LiveStream({
            usuario: userId,
            titulo: titulo.trim(),
            descripcion: descripcion || '',
            roomId: roomId,
            livekitRoomName: roomName,
            privacidad: privacidad || 'publico',
            cobroPorAlgoritmo: {
                activo: cobroActivo || false,
                costePorEspectador: config.muroLive.cobroPorAlgoritmo.costePorEspectador || 0.05,
                costePorMinuto: config.muroLive.cobroPorAlgoritmo.costePorMinuto || 0.02,
                umbralVisualizaciones: config.muroLive.cobroPorAlgoritmo.umbralVisualizaciones || 100,
                comision: config.muroLive.cobroPorAlgoritmo.comision || 0.01
            }
        });

        await newStream.save();

        // Generar token de acceso para LiveKit
        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY || config.livekit.apiKey,
            process.env.LIVEKIT_API_SECRET || config.livekit.apiSecret,
            {
                identity: userId.toString(),
                name: req.user.walletAddress?.slice(0, 10) || 'Usuario'
            }
        );

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true
        });

        const tokenLiveKit = await at.toJwt();

        res.status(201).json({
            success: true,
            stream: {
                _id: newStream._id,
                roomId: newStream.roomId,
                livekitRoomName: newStream.livekitRoomName,
                titulo: newStream.titulo,
                descripcion: newStream.descripcion,
                privacidad: newStream.privacidad,
                cobroActivo: newStream.cobroPorAlgoritmo.activo,
                estado: newStream.estado,
                createdAt: newStream.createdAt
            },
            tokenLiveKit,
            wsUrl: process.env.LIVEKIT_WS_URL || config.livekit.wsUrl,
            message: 'Transmisión creada exitosamente'
        });

    } catch (error) {
        console.error('❌ Error creando transmisión:', error);
        res.status(500).json({ 
            error: 'Error al crear transmisión',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: INICIAR TRANSMISIÓN
// POST /api/live/start/:streamId
// ========================================
router.post('/start/:streamId', auth, async (req, res) => {
    try {
        const { streamId } = req.params;
        const userId = req.user.userId;

        const stream = await LiveStream.findOne({ _id: streamId, usuario: userId });
        if (!stream) {
            return res.status(404).json({ error: 'Transmisión no encontrada' });
        }

        if (stream.estado === 'en_vivo') {
            return res.status(400).json({ error: 'La transmisión ya está en vivo' });
        }

        if (stream.estado === 'terminado') {
            return res.status(400).json({ error: 'La transmisión ya ha terminado' });
        }

        // Iniciar transmisión
        await stream.iniciar();

        // Actualizar estado del usuario
        await User.findByIdAndUpdate(userId, {
            'live.activo': true,
            'live.streamId': stream._id
        });

        // Crear publicación en el muro (opcional)
        const post = new Post({
            autor: userId,
            tipo: 'video',
            contenido: `🔴 En vivo: ${stream.titulo}`,
            video: null, // El video se transmite en LiveKit
            visible: true
        });
        await post.save();

        stream.publicacionAsociada = post._id;
        await stream.save();

        // Notificar a contactos via Socket.IO
        const io = req.app.get('io');
        if (io) {
            const user = await User.findById(userId).select('nombre fotoPerfil');
            io.emit('live_started', {
                streamId: stream._id,
                usuario: {
                    _id: userId,
                    nombre: user.nombre,
                    fotoPerfil: user.fotoPerfil
                },
                titulo: stream.titulo,
                roomId: stream.roomId
            });
        }

        res.json({
            success: true,
            stream: {
                _id: stream._id,
                estado: stream.estado,
                inicioReal: stream.inicioReal,
                roomId: stream.roomId
            },
            message: 'Transmisión iniciada'
        });

    } catch (error) {
        console.error('❌ Error iniciando transmisión:', error);
        res.status(500).json({ 
            error: 'Error al iniciar transmisión',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: PAUSAR TRANSMISIÓN
// POST /api/live/pause/:streamId
// ========================================
router.post('/pause/:streamId', auth, async (req, res) => {
    try {
        const { streamId } = req.params;
        const userId = req.user.userId;

        const stream = await LiveStream.findOne({ _id: streamId, usuario: userId });
        if (!stream) {
            return res.status(404).json({ error: 'Transmisión no encontrada' });
        }

        if (stream.estado !== 'en_vivo') {
            return res.status(400).json({ error: 'La transmisión no está en vivo' });
        }

        await stream.pausar();

        res.json({
            success: true,
            stream: {
                _id: stream._id,
                estado: stream.estado
            },
            message: 'Transmisión pausada'
        });

    } catch (error) {
        console.error('❌ Error pausando transmisión:', error);
        res.status(500).json({ 
            error: 'Error al pausar transmisión',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: REANUDAR TRANSMISIÓN
// POST /api/live/resume/:streamId
// ========================================
router.post('/resume/:streamId', auth, async (req, res) => {
    try {
        const { streamId } = req.params;
        const userId = req.user.userId;

        const stream = await LiveStream.findOne({ _id: streamId, usuario: userId });
        if (!stream) {
            return res.status(404).json({ error: 'Transmisión no encontrada' });
        }

        if (stream.estado !== 'pausado') {
            return res.status(400).json({ error: 'La transmisión no está pausada' });
        }

        await stream.reanudar();

        res.json({
            success: true,
            stream: {
                _id: stream._id,
                estado: stream.estado
            },
            message: 'Transmisión reanudada'
        });

    } catch (error) {
        console.error('❌ Error reanudando transmisión:', error);
        res.status(500).json({ 
            error: 'Error al reanudar transmisión',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: FINALIZAR TRANSMISIÓN
// POST /api/live/stop/:streamId
// ========================================
router.post('/stop/:streamId', auth, async (req, res) => {
    try {
        const { streamId } = req.params;
        const userId = req.user.userId;

        const stream = await LiveStream.findOne({ _id: streamId, usuario: userId });
        if (!stream) {
            return res.status(404).json({ error: 'Transmisión no encontrada' });
        }

        if (stream.estado === 'terminado') {
            return res.status(400).json({ error: 'La transmisión ya ha terminado' });
        }

        // Calcular métricas finales
        await stream.finalizar();

        // Actualizar estado del usuario
        await User.findByIdAndUpdate(userId, {
            'live.activo': false,
            'live.streamId': null
        });

        // Calcular cobro por algoritmo si está activo
        let cobroResult = null;
        if (stream.cobroPorAlgoritmo.activo) {
            cobroResult = await LiveStream.calcularCobroAlgoritmo(stream._id);
        }

        // Notificar a contactos via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.emit('live_stopped', {
                streamId: stream._id,
                usuarioId: userId
            });
        }

        res.json({
            success: true,
            stream: {
                _id: stream._id,
                estado: stream.estado,
                duracion: stream.duracion,
                espectadores: stream.espectadores,
                ganancias: stream.ganancias
            },
            cobroAlgoritmo: cobroResult ? {
                totalCobrado: cobroResult.cobroPorAlgoritmo.totalCobrado,
                metricas: cobroResult.cobroPorAlgoritmo.metricas,
                neto: cobroResult.ganancias.neto
            } : null,
            message: 'Transmisión finalizada'
        });

    } catch (error) {
        console.error('❌ Error finalizando transmisión:', error);
        res.status(500).json({ 
            error: 'Error al finalizar transmisión',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: OBTENER TRANSMISIONES ACTIVAS
// GET /api/live/active
// ========================================
router.get('/active', async (req, res) => {
    try {
        const streams = await LiveStream.obtenerActivos();

        res.json({
            success: true,
            streams: streams.map(stream => ({
                _id: stream._id,
                titulo: stream.titulo,
                descripcion: stream.descripcion,
                usuario: stream.usuario,
                espectadores: stream.espectadores.actuales,
                estado: stream.estado,
                roomId: stream.roomId,
                inicioReal: stream.inicioReal
            }))
        });

    } catch (error) {
        console.error('❌ Error obteniendo streams activos:', error);
        res.status(500).json({ 
            error: 'Error al obtener transmisiones activas',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: OBTENER TRANSMISIONES DE UN USUARIO
// GET /api/live/user/:userId
// ========================================
router.get('/user/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;

        const streams = await LiveStream.obtenerPorUsuario(userId);

        res.json({
            success: true,
            streams: streams.map(stream => ({
                _id: stream._id,
                titulo: stream.titulo,
                descripcion: stream.descripcion,
                estado: stream.estado,
                espectadores: stream.espectadores.total,
                duracion: stream.duracion,
                createdAt: stream.createdAt
            }))
        });

    } catch (error) {
        console.error('❌ Error obteniendo streams del usuario:', error);
        res.status(500).json({ 
            error: 'Error al obtener transmisiones del usuario',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: OBTENER MÉTRICAS DE UNA TRANSMISIÓN
// GET /api/live/metrics/:streamId
// ========================================
router.get('/metrics/:streamId', auth, async (req, res) => {
    try {
        const { streamId } = req.params;

        const stream = await LiveStream.findById(streamId)
            .populate('usuario', 'nombre fotoPerfil walletAddress');

        if (!stream) {
            return res.status(404).json({ error: 'Transmisión no encontrada' });
        }

        res.json({
            success: true,
            metrics: {
                streamId: stream._id,
                titulo: stream.titulo,
                estado: stream.estado,
                usuario: stream.usuario,
                espectadores: stream.espectadores,
                duracion: stream.duracion,
                interacciones: stream.interacciones,
                cobroAlgoritmo: {
                    activo: stream.cobroPorAlgoritmo.activo,
                    totalCobrado: stream.cobroPorAlgoritmo.totalCobrado,
                    metricas: stream.cobroPorAlgoritmo.metricas
                },
                ganancias: stream.ganancias,
                createdAt: stream.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo métricas:', error);
        res.status(500).json({ 
            error: 'Error al obtener métricas',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: ACTUALIZAR MÉTRICAS (Webhook de LiveKit)
// POST /api/live/webhook
// ========================================
router.post('/webhook', async (req, res) => {
    try {
        const { event, room, participant } = req.body;

        // Procesar eventos de LiveKit
        if (event === 'participant_joined') {
            const stream = await LiveStream.findOne({ livekitRoomName: room });
            if (stream && stream.estado === 'en_vivo') {
                await stream.agregarEspectador();
            }
        } else if (event === 'participant_left') {
            const stream = await LiveStream.findOne({ livekitRoomName: room });
            if (stream) {
                await stream.eliminarEspectador();
            }
        } else if (event === 'room_finished') {
            const stream = await LiveStream.findOne({ livekitRoomName: room });
            if (stream && stream.estado !== 'terminado') {
                await stream.finalizar();
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error en webhook:', error);
        res.status(500).json({ 
            error: 'Error al procesar webhook',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: OBTENER TOKEN DE ACCESO PARA ESPECTADOR
// POST /api/live/join/:streamId
// ========================================
router.post('/join/:streamId', auth, async (req, res) => {
    try {
        const { streamId } = req.params;
        const userId = req.user.userId;

        const stream = await LiveStream.findById(streamId);
        if (!stream) {
            return res.status(404).json({ error: 'Transmisión no encontrada' });
        }

        if (stream.estado !== 'en_vivo' && stream.estado !== 'pausado') {
            return res.status(400).json({ error: 'La transmisión no está activa' });
        }

        // Verificar privacidad
        if (stream.privacidad === 'privado' && !stream.invitados.includes(userId)) {
            return res.status(403).json({ error: 'No tienes permiso para unirte' });
        }

        if (stream.privacidad === 'por_invitacion') {
            const isInvited = stream.invitados.includes(userId);
            const isHost = stream.usuario.toString() === userId;
            if (!isInvited && !isHost) {
                return res.status(403).json({ error: 'Necesitas una invitación' });
            }
        }

        // Generar token de acceso para LiveKit
        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY || config.livekit.apiKey,
            process.env.LIVEKIT_API_SECRET || config.livekit.apiSecret,
            {
                identity: userId.toString(),
                name: req.user.nombre || 'Espectador'
            }
        );

        at.addGrant({
            roomJoin: true,
            room: stream.livekitRoomName,
            canPublish: false,
            canSubscribe: true,
            canPublishData: true
        });

        const tokenLiveKit = await at.toJwt();

        // Registrar espectador
        await stream.agregarEspectador();

        res.json({
            success: true,
            tokenLiveKit,
            wsUrl: process.env.LIVEKIT_WS_URL || config.livekit.wsUrl,
            roomName: stream.livekitRoomName,
            stream: {
                _id: stream._id,
                titulo: stream.titulo,
                usuario: stream.usuario
            }
        });

    } catch (error) {
        console.error('❌ Error uniéndose a transmisión:', error);
        res.status(500).json({ 
            error: 'Error al unirse a la transmisión',
            message: error.message 
        });
    }
});

module.exports = router;