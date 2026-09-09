// ================================================================
// ROUTES/STORAGE.JS - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const { verificarAutenticacion } = require('../middleware/auth');
const { generarUrlFirmada } = require('../controllers/storageController');

/**
 * @route   POST /api/storage/signed-url
 * @desc    Generar URL firmada para un archivo en Supabase Storage
 * @body    { bucket, filePath, expiresIn }
 * @access  Private
 */
router.post('/signed-url', verificarAutenticacion, generarUrlFirmada);

module.exports = router;