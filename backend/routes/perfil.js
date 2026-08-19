// backend/routes/perfil.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
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
// CONFIGURACIÓN DE MULTER PARA FOTOS
// ========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads/perfil';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `perfil-${unique}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const tipos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (tipos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no soportado'), false);
        }
    }
});

// ========================================
// RUTA: OBTENER PERFIL
// GET /api/perfil
// ========================================
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('-__v')
            .populate('contactos', 'nombre fotoPerfil estado walletAddress')
            .populate('amigos', 'nombre fotoPerfil estado');
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// ========================================
// RUTA: ACTUALIZAR PERFIL
// PUT /api/perfil
// ========================================
router.put('/', auth, async (req, res) => {
    try {
        const { nombre, email, telefono } = req.body;
        
        const updateData = {};
        if (nombre) updateData.nombre = nombre;
        if (email) updateData.email = email;
        if (telefono) updateData.telefono = telefono;
        
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            updateData,
            { new: true }
        ).select('-__v');
        
        res.json(user);
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// ========================================
// RUTA: SUBIR FOTO DE PERFIL
// POST /api/perfil/foto
// ========================================
router.post('/foto', auth, upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se recibió ninguna imagen' });
        }
        
        const fotoUrl = `/uploads/perfil/${req.file.filename}`;
        
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { fotoPerfil: fotoUrl },
            { new: true }
        );
        
        res.json({ fotoUrl: user.fotoPerfil });
    } catch (error) {
        console.error('Error subiendo foto:', error);
        res.status(500).json({ error: 'Error al subir foto' });
    }
});

// ========================================
// RUTA: CONFIGURAR 2FA
// POST /api/perfil/2fa
// ========================================
router.post('/2fa', auth, async (req, res) => {
    try {
        const { activar } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { 'seguridad.2fa': activar },
            { new: true }
        );
        res.json({ success: true, '2fa': user.seguridad['2fa'] });
    } catch (error) {
        console.error('Error configurando 2FA:', error);
        res.status(500).json({ error: 'Error al configurar 2FA' });
    }
});

// ========================================
// RUTA: ACTUALIZAR ESIM
// PUT /api/perfil/esim
// ========================================
router.put('/esim', auth, async (req, res) => {
    try {
        const { tipo, activo } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { 
                'esim.activo': activo,
                'esim.tipo': tipo || 'wifi'
            },
            { new: true }
        );
        res.json({ 
            success: true, 
            esim: user.esim 
        });
    } catch (error) {
        console.error('Error actualizando Esim:', error);
        res.status(500).json({ error: 'Error al actualizar Esim' });
    }
});

// ========================================
// RUTA: BUSCAR USUARIO POR WALLET
// GET /api/perfil/buscar?wallet=0x...
// ========================================
router.get('/buscar', auth, async (req, res) => {
    try {
        const { wallet } = req.query;
        
        if (!wallet) {
            return res.status(400).json({ error: 'Wallet requerida' });
        }
        
        const user = await User.findOne({ 
            walletAddress: { $regex: wallet, $options: 'i' }
        }).select('_id nombre fotoPerfil walletAddress');
        
        if (!user) {
            return res.json({ encontrado: false });
        }
        
        res.json({
            encontrado: true,
            usuarioId: user._id,
            nombre: user.nombre,
            fotoPerfil: user.fotoPerfil,
            walletAddress: user.walletAddress
        });
    } catch (error) {
        console.error('Error buscando usuario:', error);
        res.status(500).json({ error: 'Error al buscar usuario' });
    }
});

// ========================================
// RUTA: AGREGAR CONTACTO
// POST /api/perfil/contacto
// ========================================
router.post('/contacto', auth, async (req, res) => {
    try {
        const { contactoId } = req.body;
        const userId = req.user.userId;
        
        if (userId === contactoId) {
            return res.status(400).json({ error: 'No puedes agregarte a ti mismo' });
        }
        
        const user = await User.findById(userId);
        const contacto = await User.findById(contactoId);
        
        if (!contacto) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        if (user.contactos.includes(contactoId)) {
            return res.status(400).json({ error: 'Ya es tu contacto' });
        }
        
        user.contactos.push(contactoId);
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Contacto agregado',
            contacto: {
                _id: contacto._id,
                nombre: contacto.nombre,
                fotoPerfil: contacto.fotoPerfil
            }
        });
    } catch (error) {
        console.error('Error agregando contacto:', error);
        res.status(500).json({ error: 'Error al agregar contacto' });
    }
});

// ========================================
// RUTA: BLOQUEAR USUARIO
// POST /api/perfil/bloquear
// ========================================
router.post('/bloquear', auth, async (req, res) => {
    try {
        const { usuarioId } = req.body;
        const userId = req.user.userId;
        
        if (userId === usuarioId) {
            return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });
        }
        
        const user = await User.findById(userId);
        
        if (!user.bloqueados.includes(usuarioId)) {
            user.bloqueados.push(usuarioId);
            // Quitar de contactos si estaba
            user.contactos = user.contactos.filter(id => id.toString() !== usuarioId);
            await user.save();
        }
        
        res.json({ 
            success: true, 
            message: 'Usuario bloqueado' 
        });
    } catch (error) {
        console.error('Error bloqueando usuario:', error);
        res.status(500).json({ error: 'Error al bloquear usuario' });
    }
});

// ========================================
// RUTA: DESBLOQUEAR USUARIO
// POST /api/perfil/desbloquear
// ========================================
router.post('/desbloquear', auth, async (req, res) => {
    try {
        const { usuarioId } = req.body;
        const user = await User.findById(req.user.userId);
        
        user.bloqueados = user.bloqueados.filter(id => id.toString() !== usuarioId);
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Usuario desbloqueado' 
        });
    } catch (error) {
        console.error('Error desbloqueando usuario:', error);
        res.status(500).json({ error: 'Error al desbloquear usuario' });
    }
});

// ========================================
// RUTA: OBTENER RECOMENDADOS
// GET /api/perfil/recomendados
// ========================================
router.get('/recomendados', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        
        // Buscar contactos de contactos (recomendados)
        const contactos = user.contactos;
        const recomendados = await User.find({
            _id: { $nin: [...contactos, req.user.userId, ...user.bloqueados] },
            'seguridad.bloqueado': { $ne: true }
        })
        .limit(10)
        .select('_id nombre fotoPerfil walletAddress');
        
        res.json(recomendados);
    } catch (error) {
        console.error('Error obteniendo recomendados:', error);
        res.status(500).json({ error: 'Error al obtener recomendados' });
    }
});

// ========================================
// RUTA: ELIMINAR CONTACTO
// DELETE /api/perfil/contacto/:id
// ========================================
router.delete('/contacto/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(req.user.userId);
        
        user.contactos = user.contactos.filter(c => c.toString() !== id);
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Contacto eliminado' 
        });
    } catch (error) {
        console.error('Error eliminando contacto:', error);
        res.status(500).json({ error: 'Error al eliminar contacto' });
    }
});

// ========================================
// RUTA: OBTENER PERFIL DE OTRO USUARIO
// GET /api/perfil/:id
// ========================================
router.get('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id)
            .select('_id nombre fotoPerfil walletAddress estado esim tokensAcumulados haCanjeado createdAt')
            .populate('contactos', 'nombre fotoPerfil estado');
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Error obteniendo perfil de usuario:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

module.exports = router;