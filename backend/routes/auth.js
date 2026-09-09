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
 * @route   GET /api/auth/me
 * @desc    Obtener datos del usuario autenticado
 * @access  Private
 */
router.get('/me', verificarToken, AuthController.getMe);

/**
 * @route   PUT /api/auth/me
 * @desc    Actualizar perfil del usuario autenticado
 * @access  Private
 */
router.put('/me', verificarToken, AuthController.updateMe);

/**
 * @route   POST /api/auth/change-password
 * @desc    Cambiar contraseña
 * @access  Private
 */
router.post('/change-password', verificarToken, AuthController.changePassword);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refrescar token JWT
 * @access  Public
 */
router.post('/refresh-token', AuthController.refreshToken);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Solicitar recuperación de contraseña
 * @access  Public
 */
router.post('/forgot-password', AuthController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Restablecer contraseña con token
 * @access  Public
 */
router.post('/reset-password', AuthController.resetPassword);

module.exports = router;