// backend/routes/mensajes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ========================================
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Autenticación requerida' });
    }
};

// ========================================
// CONFIGURACIÓN DE MULTER PARA ARCHIVOS
// ========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads/mensajes';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `msg-${unique}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const tipos = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/quicktime',
            'application/pdf'
        ];
        if (tipos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no soportado'), false);
        }
    }
});

// ========================================
// RUTA: OBTENER CONVERSACIONES
// GET /api/mensajes/conversaciones
// ========================================
router.get('/conversaciones', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Obtener todos los contactos del usuario
        const user = await User.findById(userId).populate('contactos', '_id nombre fotoPerfil estado');

        if (!user || !user.contactos || user.contactos.length === 0) {
            return res.json({
                conversaciones: [],
                pagination: { total: 0, page: 1, limit: parseInt(limit), pages: 0 }
            });
        }

        const contactosIds = user.contactos.map(c => c._id);

        // Obtener últimos mensajes por contacto
        const conversaciones = [];

        for (const contacto of user.contactos) {
            // Último mensaje con este contacto
            const ultimoMensaje = await Message.findOne({
                $or: [
                    { de: userId, para: contacto._id },
                    { de: contacto._id, para: userId }
                ],
                eliminadoParaDe: { $ne: true },
                eliminadoParaPara: { $ne: true }
            })
            .sort({ createdAt: -1 })
            .limit(1);

            // Contar mensajes no leídos de este contacto
            const noLeidos = await Message.countDocuments({
                de: contacto._id,
                para: userId,
                leido: false,
                eliminadoParaPara: { $ne: true }
            });

            conversaciones.push({
                contacto: {
                    _id: contacto._id,
                    nombre: contacto.nombre,
                    fotoPerfil: contacto.fotoPerfil,
                    estado: contacto.estado
                },
                ultimoMensaje: ultimoMensaje || null,
                noLeidos: noLeidos || 0
            });
        }

        // Ordenar por fecha del último mensaje (más reciente primero)
        conversaciones.sort((a, b) => {
            const fechaA = a.ultimoMensaje?.createdAt || new Date(0);
            const fechaB = b.ultimoMensaje?.createdAt || new Date(0);
            return fechaB - fechaA;
        });

        // Paginación
        const total = conversaciones.length;
        const paginadas = conversaciones.slice(skip, skip + parseInt(limit));

        res.json({
            conversaciones: paginadas,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error obteniendo conversaciones:', error);
        res.status(500).json({ error: 'Error al obtener conversaciones' });
    }
});

// ========================================
// RUTA: OBTENER MENSAJES DE UNA CONVERSACIÓN
// GET /api/mensajes/:contactoId
// ========================================
router.get('/:contactoId', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contactoId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Verificar que el contacto existe y es contacto del usuario
        const user = await User.findById(userId);
        if (!user.contactos.includes(contactoId)) {
            // Si no es contacto, verificar que no esté bloqueado
            const contacto = await User.findById(contactoId);
            if (!contacto) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }
            // Permitir mensajes si no está bloqueado
        }

        const query = {
            $or: [
                { de: userId, para: contactoId },
                { de: contactoId, para: userId }
            ],
            $and: [
                { eliminadoParaDe: { $ne: true } },
                { eliminadoParaPara: { $ne: true } }
            ]
        };

        const [mensajes, total] = await Promise.all([
            Message.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Message.countDocuments(query)
        ]);

        // Marcar mensajes como leídos (los que son para el usuario)
        await Message.updateMany(
            {
                de: contactoId,
                para: userId,
                leido: false
            },
            {
                leido: true,
                fechaLeido: new Date()
            }
        );

        res.json({
            mensajes: mensajes.reverse(), // Devolver en orden cronológico
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error al obtener mensajes' });
    }
});

// ========================================
// RUTA: ENVIAR MENSAJE
// POST /api/mensajes
// ========================================
router.post('/', auth, upload.single('archivo'), async (req, res) => {
    try {
        const userId = req.user.userId;
        const { para, contenido } = req.body;
        const archivo = req.file;

        if (!para) {
            return res.status(400).json({ error: 'Destinatario requerido' });
        }

        // Verificar que el destinatario existe
        const destinatario = await User.findById(para);
        if (!destinatario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Verificar que el usuario no está bloqueado
        const usuario = await User.findById(userId);
        if (usuario.bloqueados && usuario.bloqueados.includes(para)) {
            return res.status(403).json({ error: 'Usuario bloqueado' });
        }

        // Verificar que el destinatario no nos tiene bloqueados
        if (destinatario.bloqueados && destinatario.bloqueados.includes(userId)) {
            return res.status(403).json({ error: 'Has sido bloqueado por este usuario' });
        }

        // Crear mensaje
        const mensajeData = {
            de: userId,
            para: para,
            contenido: contenido || '',
            tipo: contenido ? 'texto' : 'archivo'
        };

        // Si hay archivo
        if (archivo) {
            const url = `/uploads/mensajes/${archivo.filename}`;
            mensajeData.archivo = url;

            // Detectar tipo de archivo para etiqueta
            if (archivo.mimetype.startsWith('image/')) {
                mensajeData.tipo = 'foto';
            } else if (archivo.mimetype.startsWith('video/')) {
                mensajeData.tipo = 'video';
            } else if (archivo.mimetype === 'application/pdf') {
                mensajeData.tipo = 'comprobante';
            } else {
                mensajeData.tipo = 'archivo';
            }
        }

        // Si es comprobante (puede ser enviado desde el frontend)
        if (req.body.tipo === 'comprobante') {
            mensajeData.tipo = 'comprobante';
        }

        const nuevoMensaje = new Message(mensajeData);
        await nuevoMensaje.save();

        // Si el destinatario no es contacto, lo agregamos automáticamente
        if (!usuario.contactos.includes(para)) {
            usuario.contactos.push(para);
            await usuario.save();
        }

        // Poblar para respuesta
        await nuevoMensaje.populate('de', 'nombre fotoPerfil');

        // Emitir evento de socket
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${para}`).emit('new_message', {
                mensaje: nuevoMensaje,
                de: userId
            });
        }

        res.status(201).json({
            success: true,
            mensaje: nuevoMensaje,
            message: 'Mensaje enviado'
        });

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({ error: 'Error al enviar mensaje' });
    }
});

// ========================================
// RUTA: MARCAR MENSAJES COMO LEÍDOS
// PUT /api/mensajes/leer/:contactoId
// ========================================
router.put('/leer/:contactoId', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { contactoId } = req.params;

        const result = await Message.updateMany(
            {
                de: contactoId,
                para: userId,
                leido: false
            },
            {
                leido: true,
                fechaLeido: new Date()
            }
        );

        res.json({
            success: true,
            actualizados: result.modifiedCount,
            message: 'Mensajes marcados como leídos'
        });

    } catch (error) {
        console.error('Error marcando mensajes como leídos:', error);
        res.status(500).json({ error: 'Error al marcar mensajes' });
    }
});

// ========================================
// RUTA: ELIMINAR MENSAJE (PARA UN USUARIO)
// DELETE /api/mensajes/:mensajeId
// ========================================
router.delete('/:mensajeId', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { mensajeId } = req.params;

        const mensaje = await Message.findById(mensajeId);
        if (!mensaje) {
            return res.status(404).json({ error: 'Mensaje no encontrado' });
        }

        // Verificar que el usuario es parte de la conversación
        if (mensaje.de.toString() !== userId && mensaje.para.toString() !== userId) {
            return res.status(403).json({ error: 'No tienes permiso' });
        }

        // Marcar como eliminado para este usuario
        if (mensaje.de.toString() === userId) {
            mensaje.eliminadoParaDe = true;
        } else {
            mensaje.eliminadoParaPara = true;
        }

        await mensaje.save();

        res.json({
            success: true,
            message: 'Mensaje eliminado'
        });

    } catch (error) {
        console.error('Error eliminando mensaje:', error);
        res.status(500).json({ error: 'Error al eliminar mensaje' });
    }
});

// ========================================
// RUTA: BUSCAR USUARIOS PARA CHAT
// GET /api/mensajes/buscar?q=...
// ========================================
router.get('/buscar', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ usuarios: [] });
        }

        // Buscar por nombre o wallet
        const usuarios = await User.find({
            _id: { $ne: userId },
            $or: [
                { nombre: { $regex: q, $options: 'i' } },
                { walletAddress: { $regex: q, $options: 'i' } }
            ],
            'seguridad.bloqueado': { $ne: true }
        })
        .select('_id nombre fotoPerfil walletAddress estado')
        .limit(10);

        // Excluir bloqueados
        const user = await User.findById(userId);
        const bloqueados = user.bloqueados || [];

        const filtrados = usuarios.filter(u => !bloqueados.includes(u._id.toString()));

        res.json({ usuarios: filtrados });

    } catch (error) {
        console.error('Error buscando usuarios:', error);
        res.status(500).json({ error: 'Error al buscar usuarios' });
    }
});

// ========================================
// RUTA: OBTENER CONTACTOS RECOMENDADOS
// GET /api/mensajes/recomendados
// ========================================
router.get('/recomendados', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).populate('contactos');

        // Contactos de contactos (recomendados)
        const contactosIds = user.contactos.map(c => c._id);
        const bloqueados = user.bloqueados || [];

        const recomendados = await User.find({
            _id: { $nin: [...contactosIds, userId, ...bloqueados] },
            'seguridad.bloqueado': { $ne: true }
        })
        .select('_id nombre fotoPerfil walletAddress estado')
        .limit(10);

        res.json({ recomendados });

    } catch (error) {
        console.error('Error obteniendo recomendados:', error);
        res.status(500).json({ error: 'Error al obtener recomendados' });
    }
});

module.exports = router;