// ================================================================
// RUTAS DE AUTENTICACIÓN
// ================================================================

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { validarRegistro, validarLogin, verificarErrores } = require('../middleware/validation');
const { limitadorAuth } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

// Registro de usuario
router.post('/register', limitadorAuth, validarRegistro, verificarErrores, async (req, res) => {
    try {
        const { email, password, nombre } = req.body;

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { nombre: nombre || 'Explorador' }
            }
        });

        if (error) throw error;

        logger.info(`Usuario registrado: ${email}`);
        res.json({
            success: true,
            message: 'Usuario registrado correctamente',
            user: data.user
        });
    } catch (error) {
        logger.error(`Error en registro: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Login de usuario
router.post('/login', limitadorAuth, validarLogin, verificarErrores, async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        logger.info(`Usuario logueado: ${email}`);
        res.json({
            success: true,
            message: 'Login exitoso',
            session: data.session
        });
    } catch (error) {
        logger.error(`Error en login: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Cerrar sesión
router.post('/logout', async (req, res) => {
    try {
        const { data, error } = await supabase.auth.signOut();
        if (error) throw error;

        logger.info('Usuario cerró sesión');
        res.json({
            success: true,
            message: 'Sesión cerrada'
        });
    } catch (error) {
        logger.error(`Error en logout: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Recuperar contraseña
router.post('/recover-password', async (req, res) => {
    try {
        const { email } = req.body;

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.DOMINIO_FRONTEND}/actualizar-contraseña.html`
        });

        if (error) throw error;

        logger.info(`Recuperación de contraseña para: ${email}`);
        res.json({
            success: true,
            message: 'Correo de recuperación enviado'
        });
    } catch (error) {
        logger.error(`Error en recuperación: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;