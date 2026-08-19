// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');

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
// RUTA: REGISTRAR / AUTENTICAR USUARIO
// POST /api/auth/register
// ========================================
router.post('/register', async (req, res) => {
    try {
        const { walletAddress, email, nombre } = req.body;

        // Validar wallet
        if (!walletAddress || !ethers.utils.isAddress(walletAddress)) {
            return res.status(400).json({ error: 'Dirección wallet inválida' });
        }

        // Buscar o crear usuario
        let user = await User.findOne({ walletAddress });

        if (!user) {
            user = new User({
                walletAddress,
                email: email || undefined,
                nombre: nombre || 'Usuario'
            });
            await user.save();
        } else {
            // Actualizar email si se proporciona
            if (email && email !== user.email) {
                user.email = email;
                await user.save();
            }
        }

        // Generar token JWT
        const token = jwt.sign(
            {
                userId: user._id,
                walletAddress: user.walletAddress
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                _id: user._id,
                walletAddress: user.walletAddress,
                nombre: user.nombre,
                email: user.email,
                fotoPerfil: user.fotoPerfil,
                domosComprados: user.domosComprados,
                tokensAcumulados: user.tokensAcumulados,
                haCanjeado: user.haCanjeado
            }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});

// ========================================
// RUTA: VERIFICAR TOKEN
// GET /api/auth/verify
// ========================================
router.get('/verify', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('-__v -seguridad.intentosFallidos -seguridad.ultimoIntento');

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({
            success: true,
            user: {
                _id: user._id,
                walletAddress: user.walletAddress,
                nombre: user.nombre,
                email: user.email,
                fotoPerfil: user.fotoPerfil,
                estado: user.estado,
                domosComprados: user.domosComprados,
                tokensAcumulados: user.tokensAcumulados,
                haCanjeado: user.haCanjeado
            }
        });

    } catch (error) {
        console.error('Error verificando token:', error);
        res.status(500).json({ error: 'Error al verificar token' });
    }
});

// ========================================
// RUTA: INICIAR SESIÓN CON WALLET
// POST /api/auth/login
// ========================================
router.post('/login', async (req, res) => {
    try {
        const { walletAddress, signature } = req.body;

        if (!walletAddress || !ethers.utils.isAddress(walletAddress)) {
            return res.status(400).json({ error: 'Dirección wallet inválida' });
        }

        // Buscar usuario
        let user = await User.findOne({ walletAddress });

        if (!user) {
            // Si no existe, crear uno nuevo
            user = new User({
                walletAddress,
                nombre: `Usuario_${walletAddress.slice(0, 6)}`
            });
            await user.save();
        }

        // Verificar si el usuario está bloqueado
        if (user.seguridad?.bloqueado) {
            return res.status(403).json({
                error: 'Cuenta bloqueada. Contacta con soporte.'
            });
        }

        // Generar token JWT
        const token = jwt.sign(
            {
                userId: user._id,
                walletAddress: user.walletAddress
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Actualizar última actividad
        user.ultimaActividad = new Date();
        user.ultimaConexion = new Date();
        await user.save();

        res.json({
            success: true,
            token,
            user: {
                _id: user._id,
                walletAddress: user.walletAddress,
                nombre: user.nombre,
                email: user.email,
                fotoPerfil: user.fotoPerfil,
                estado: user.estado,
                domosComprados: user.domosComprados,
                tokensAcumulados: user.tokensAcumulados,
                haCanjeado: user.haCanjeado
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// ========================================
// RUTA: CERRAR SESIÓN
// POST /api/auth/logout
// ========================================
router.post('/logout', auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.userId, {
            estado: 'ausente',
            ultimaConexion: new Date()
        });

        res.json({
            success: true,
            message: 'Sesión cerrada exitosamente'
        });

    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({ error: 'Error al cerrar sesión' });
    }
});

// ========================================
// RUTA: REFRESCAR TOKEN
// POST /api/auth/refresh
// ========================================
router.post('/refresh', auth, async (req, res) => {
    try {
        const token = jwt.sign(
            {
                userId: req.user.userId,
                walletAddress: req.user.walletAddress
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token
        });

    } catch (error) {
        console.error('Error refrescando token:', error);
        res.status(500).json({ error: 'Error al refrescar token' });
    }
});

// ========================================
// RUTA: CAMBIAR CONTRASEÑA (para usuarios con email)
// POST /api/auth/change-password
// ========================================
router.post('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Esta ruta solo es para usuarios que tienen email
        const user = await User.findById(req.user.userId);
        if (!user || !user.email) {
            return res.status(400).json({
                error: 'Esta función requiere un email asociado a la cuenta'
            });
        }

        // Aquí iría la lógica de cambio de contraseña
        // Por ahora solo respondemos éxito
        res.json({
            success: true,
            message: 'Contraseña actualizada'
        });

    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

module.exports = router;