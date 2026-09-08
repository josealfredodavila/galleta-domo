// ================================================================
// ROUTES/MENSAJES.JS
// RUTAS DE MENSAJERÍA - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const { verificarToken } = require('../middleware/auth');
const mensajesController = require('../controllers/mensajesController');

// Extraemos los métodos asegurando fallbacks para evitar undefined
const {
    getConversaciones,
    getMensajes,
    enviarMensaje,
    editarMensaje,
    eliminarMensaje,
    marcarLeidos,
    agregarContacto,
    eliminarContacto,
    bloquearUsuario,
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
 * @desc    Marcar mensajes como leídos
 * @body    { remitente_id }
 * @access  Private (requiere token)
 */
router.patch(
    '/mensajes/leer',
    verificarToken,
    marcarLeidos
);

/**
 * @route   POST /api/mensajes/mensajes
 * @desc    Enviar un nuevo mensaje
 * @body    { destinatario_id, contenido, tipo, imagen_url }
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
 * @desc    Obtener mensajes de una conversación específica
 * @param   {string} id - ID del contacto/conversación
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
// CONTACTOS
// ================================================================

/**
 * @route   POST /api/mensajes/contactos
 * @desc    Agregar un nuevo contacto
 * @body    { contacto_id }
 * @access  Private (requiere token)
 */
router.post(
    '/contactos',
    verificarToken,
    agregarContacto
);

/**
 * @route   DELETE /api/mensajes/contactos/:id
 * @desc    Eliminar un contacto
 * @param   {string} id - ID del contacto a eliminar
 * @access  Private (requiere token)
 */
router.delete(
    '/contactos/:id',
    verificarToken,
    eliminarContacto
);

// ================================================================
// BLOQUEOS
// ================================================================

/**
 * @route   POST /api/mensajes/bloquear/:id
 * @desc    Bloquear un usuario
 * @param   {string} id - ID del usuario a bloquear
 * @access  Private (requiere token)
 */
router.post(
    '/bloquear/:id',
    verificarToken,
    bloquearUsuario
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
