// ================================================================
// ROUTES/AUTH.JS - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/authController');
const { verificarToken } = require('../middleware/auth');

/**
 * @route   POST /api/auth/register
 * @desc    Registrar un nuevo usuario
 * @body    { email, password, nombre }
 * @access  Public
 */
router.post('/register', AuthController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesión
 * @body    { email, password }
 * @access  Public
 */
router.post('/login', AuthController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión
 * @access  Public
 */
router.post('/logout', AuthController.logout);

/**