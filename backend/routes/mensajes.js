// ================================================================
// ROUTES/MENSAJES.JS - SARIEL'S BACKEND (PRODUCCIÓN)
// RUTAS DE MENSAJERÍA
// ================================================================

const express = require('express');
const router = express.Router();

const { verificarToken } = require('../middleware/auth');
const mensajesController = require('../controllers/mensajesController');

// Extraemos los métodos del controlador unificado de producción
const {
    getConversaciones,
    getMensajes,
    enviarMensaje,
    editarMensaje,
    eliminarMensaje,
    marcarLeidos,
    reportarMensaje
} = mensajesController;

// ================================================================
// CONVERSACIONES
// ================================================================

/**
 * @route   GET /api/mensajes/conversaciones
 * @desc    Obtener todas las conversaciones del usuario autenticado
 * @access  Private (requiere token)
 */
router.get(
    '/conversaciones',
    verificarToken,
    getConversaciones
);

// ================================================================
// MENSAJES (RUTAS ESTÁTICAS PRIMERO)
// ================================================================

/**
 * @route   PATCH /api/mensajes/mensajes/leer
 * @desc    Marcar mensajes de una conversación como leídos
 * @body    { conversation_id }
 * @access  Private (requiere token)
 */
router.patch(
    '/mensajes/leer',
    verificarToken,
    marcarLeidos
);

/**
 * @route   POST /api/mensajes/mensajes
 * @desc    Enviar un nuevo mensaje o iniciar chat
 * @body    { conversation_id, destinatario_id, contenido, tipo, media_url, nombre_archivo, tamano_bytes, mime_type }
 * @access  Private (requiere token)
 */
router.post(
    '/mensajes',
    verificarToken,
    enviarMensaje
);

// ================================================================
// MENSAJES (RUTAS DINÁMICAS POR ID)
// ================================================================

/**
 * @route   GET /api/mensajes/mensajes/:id
 * @desc    Obtener mensajes de una conversación específica (id = conversation_id)
 * @param   {string} id - ID de la conversación
 * @access  Private (requiere token)
 */
router.get(
    '/mensajes/:id',
    verificarToken,
    getMensajes
);

/**
 * @route   PUT /api/mensajes/mensajes/:id
 * @desc    Editar un mensaje existente
 * @param   {string} id - ID del mensaje a editar
 * @body    { contenido }
 * @access  Private (requiere token, solo el dueño)
 */
router.put(
    '/mensajes/:id',
    verificarToken,
    editarMensaje
);

/**
 * @route   DELETE /api/mensajes/mensajes/:id
 * @desc    Eliminar un mensaje (soft delete)
 * @param   {string} id - ID del mensaje a eliminar
 * @access  Private (requiere token, solo el dueño)
 */
router.delete(
    '/mensajes/:id',
    verificarToken,
    eliminarMensaje
);

// ================================================================
// REPORTES
// ================================================================

/**
 * @route   POST /api/mensajes/reportar/:id
 * @desc    Reportar un mensaje
 * @param   {string} id - ID del mensaje a reportar
 * @body    { motivo }
 * @access  Private (requiere token)
 */
router.post(
    '/reportar/:id',
    verificarToken,
    reportarMensaje
);

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = router;
