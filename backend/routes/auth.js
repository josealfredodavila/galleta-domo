// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const { createClient } = require('@supabase/supabase-js');
const config = require('../../config/config');

// ========================================
// INICIALIZACIÓN DE SUPABASE
// ========================================
const supabase = createClient(
    process.env.SUPABASE_URL || config.supabase.url,
    process.env.SUPABASE_ANON_KEY || config.supabase.anonKey
);

// ========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ========================================
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        // Verificar token JWT local primero
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || config.jwt.secret);
        } catch (error) {
            // Si falla, verificar con Supabase
            const { data: { user }, error: supabaseError } = await supabase.auth.getUser(token);
            if (supabaseError || !user) {
                throw new Error('Token inválido');
            }
            // Buscar usuario por supabaseId
            const dbUser = await User.findOne({ supabaseId: user.id });
            if (!dbUser) {
                throw new Error('Usuario no encontrado');
            }
            req.user = {
                userId: dbUser._id,
                walletAddress: dbUser.walletAddress,
                supabaseId: user.id
            };
            return next();
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ 
            error: 'Autenticación requerida',
            message: error.message 
        });
    }
};

// ========================================
// RUTA: REGISTRO CON WALLET + SUPABASE
// POST /api/auth/register
// ========================================
router.post('/register', async (req, res) => {
    try {
        const { walletAddress, email, nombre, password } = req.body;

        // Validar wallet
        if (!walletAddress || !ethers.utils.isAddress(walletAddress)) {
            return res.status(400).json({ error: 'Dirección wallet inválida' });
        }

        // Buscar usuario existente
        let user = await User.findOne({ walletAddress });

        if (!user) {
            // Crear usuario en Supabase (si hay email y password)
            let supabaseUser = null;
            if (email && password) {
                try {
                    const { data, error } = await supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                walletAddress,
                                nombre: nombre || 'Usuario'
                            }
                        }
                    });
                    if (!error && data?.user) {
                        supabaseUser = data.user;
                    }
                } catch (supabaseError) {
                    console.warn('⚠️ Error en Supabase:', supabaseError.message);
                }
            }

            // Crear usuario en MongoDB
            user = new User({
                walletAddress,
                email: email || undefined,
                nombre: nombre || 'Usuario',
                supabaseId: supabaseUser?.id || null
            });
            await user.save();
        } else {
            // Actualizar email si se proporciona
            if (email && email !== user.email) {
                user.email = email;
                await user.save();
            }
            // Actualizar supabaseId si no tiene
            if (!user.supabaseId && email && password) {
                try {
                    const { data, error } = await supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                walletAddress: user.walletAddress,
                                nombre: user.nombre
                            }
                        }
                    });
                    if (!error && data?.user) {
                        user.supabaseId = data.user.id;
                        await user.save();
                    }
                } catch (supabaseError) {
                    console.warn('⚠️ Error vinculando Supabase:', supabaseError.message);
                }
            }
        }

        // Generar token JWT
        const token = jwt.sign(
            {
                userId: user._id,
                walletAddress: user.walletAddress,
                supabaseId: user.supabaseId
            },
            process.env.JWT_SECRET || config.jwt.secret,
            { expiresIn: config.jwt.expiresIn || '7d' }
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
                supabaseId: user.supabaseId,
                domosComprados: user.domosComprados,
                tokensAcumulados: user.tokensAcumulados,
                haCanjeado: user.haCanjeado
            }
        });

    } catch (error) {
        console.error('❌ Error en registro:', error);
        res.status(500).json({ 
            error: 'Error al registrar usuario',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: LOGIN CON WALLET
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
            // Crear usuario automáticamente
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

        // Verificar firma (si se proporciona)
        if (signature) {
            // Aquí se validaría la firma con la wallet
            // Por ahora solo simulamos
            console.log('🔐 Verificando firma...');
        }

        // Generar token JWT
        const token = jwt.sign(
            {
                userId: user._id,
                walletAddress: user.walletAddress,
                supabaseId: user.supabaseId
            },
            process.env.JWT_SECRET || config.jwt.secret,
            { expiresIn: config.jwt.expiresIn || '7d' }
        );

        // Actualizar actividad
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
                supabaseId: user.supabaseId,
                estado: user.estado,
                domosComprados: user.domosComprados,
                tokensAcumulados: user.tokensAcumulados,
                haCanjeado: user.haCanjeado
            }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ 
            error: 'Error al iniciar sesión',
            message: error.message 
        });
    }
});

// ========================================
// RUTA: LOGIN CON SUPABASE
// POST /api/auth/login-supabase
// ========================================
router.post('/login-supabase', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña requeridos' });
        }

        // Autenticar con Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas',
                message: error.message 
            });
        }

        // Buscar o crear usuario en MongoDB
        let user = await User.findOne({ supabaseId: data.user.id });
        
        if (!user) {
            // Buscar por email
            user = await User.findOne({ email: data.user.email });
            if (user) {
                user.supabaseId = data.user.id;
                await user.save();
            } else {
                // Crear nuevo usuario
                user = new User({
                    supabaseId: data.user.id,
                    email: data.user.email,
                    nombre: data.user.user_metadata?.nombre || 'Usuario',
                    walletAddress: data.user.user_metadata?.walletAddress || '0x0000000000000000000000000000000000000000'
                });
                await user.save();
            }
        }

        // Generar token JWT
        const token = jwt.sign(
            {
                userId: user._id,
                walletAddress: user.walletAddress,
                supabaseId: user.supabaseId
            },
            process.env.JWT_SECRET || config.jwt.secret,
            { expiresIn: config.jwt.expiresIn || '7d' }
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
                supabaseId: user.supabaseId,
                domosComprados: user.domosComprados,
                tokensAcumulados: user.tokensAcumulados,
                haCanjeado: user.haCanjeado
            }
        });

    } catch (error) {
        console.error('❌ Error en login Supabase:', error);
        res.status(500).json({ 
            error: 'Error al iniciar sesión con Supabase',
            message: error.message 
        });
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

        // Verificar sesión en Supabase si tiene supabaseId
        let supabaseSession = null;
        if (user.supabaseId) {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session) {
                supabaseSession = data.session;
            }
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
                supabaseId: user.supabaseId,
                domosComprados: user.domosComprados,
                tokensAcumulados: user.tokensAcumulados,
                haCanjeado: user.haCanjeado
            },
            supabaseSession: supabaseSession ? true : false
        });

    } catch (error) {
        console.error('❌ Error verificando token:', error);
        res.status(500).json({ error: 'Error al verificar token' });
    }
});

// ========================================
// RUTA: CERRAR SESIÓN
// POST /api/auth/logout
// ========================================
router.post('/logout', auth, async (req, res) => {
    try {
        // Cerrar sesión en Supabase
        if (req.user.supabaseId) {
            await supabase.auth.signOut();
        }

        // Actualizar estado en MongoDB
        await User.findByIdAndUpdate(req.user.userId, {
            estado: 'ausente',
            ultimaConexion: new Date()
        });

        res.json({
            success: true,
            message: 'Sesión cerrada exitosamente'
        });

    } catch (error) {
        console.error('❌ Error en logout:', error);
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
                walletAddress: req.user.walletAddress,
                supabaseId: req.user.supabaseId
            },
            process.env.JWT_SECRET || config.jwt.secret,
            { expiresIn: config.jwt.expiresIn || '7d' }
        );

        res.json({
            success: true,
            token
        });

    } catch (error) {
        console.error('❌ Error refrescando token:', error);
        res.status(500).json({ error: 'Error al refrescar token' });
    }
});

// ========================================
// RUTA: RECUPERAR CONTRASEÑA (Supabase)
// POST /api/auth/reset-password
// ========================================
router.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email requerido' });
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.DOMINIO || config.server.dominio}/reset-password`
        });

        if (error) {
            return res.status(400).json({ 
                error: 'Error al enviar correo de recuperación',
                message: error.message 
            });
        }

        res.json({
            success: true,
            message: 'Correo de recuperación enviado'
        });

    } catch (error) {
        console.error('❌ Error en reset-password:', error);
        res.status(500).json({ error: 'Error al enviar correo de recuperación' });
    }
});

// ========================================
// EXPORTAR RUTAS Y MIDDLEWARE AUTH
// ========================================
module.exports = router;
module.exports.auth = auth;