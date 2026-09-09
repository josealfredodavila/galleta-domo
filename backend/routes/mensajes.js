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
    obtenerConversaciones,
    obtenerMensajes,
    enviarMensaje,
    crearConversacion,
    salirConversacion,
    buscarUsuarios,
    subirArchivo,
    editarMensaje,
    eliminarMensaje,
    marcarLeidos,
    reportarMensaje,
    bloquearUsuario,
    desbloquearUsuario,
    buscarEnConversacion,
    crearLlamada,
    verificarLlamada,
    actualizarLlamada
} = mensajesController;

// ================================================================
// CONVERSACIONES
// ================================================================

/**
 * @route   GET /api/mensajes/conversaciones
 * @desc    Obtener todas las conversaciones del usuario autenticado
 * @access  Private
 */
router.get('/conversaciones', verificarToken, obtenerConversaciones);

/**
 * @route   POST /api/mensajes/conversaciones
 * @desc    Crear una nueva conversación
 * @body    { participanteId } (ID del otro usuario)
 * @access  Private
 */
router.post('/conversaciones', verificarToken, crearConversacion);

/**
 * @route   DELETE /api/mensajes/conversaciones/:id
 * @desc    Salir de una conversación
 * @access  Private
 */
router.delete('/conversaciones/:id', verificarToken, salirConversacion);

// ================================================================
// MENSAJES
// ================================================================

/**
 * @route   GET /api/mensajes/:conversacionId
 * @desc    Obtener mensajes de una conversación
 * @query   { limit, before } (opcional)
 * @access  Private
 */
router.get('/:conversacionId', verificarToken, obtenerMensajes);

/**
 * @route   POST /api/mensajes/:conversacionId
 * @desc    Enviar un mensaje (texto o archivo)
 * @body    { contenido, tipo, media_url, nombre_archivo, tamano_bytes, mime_type }
 * @access  Private
 */
router.post('/:conversacionId', verificarToken, enviarMensaje);

/**
 * @route   PUT /api/mensajes/:id
 * @desc    Editar un mensaje
 * @body    { contenido }
 * @access  Private
 */
router.put('/:id', verificarToken, editarMensaje);

/**
 * @route   DELETE /api/mensajes/:id
 * @desc    Eliminar un mensaje (soft delete)
 * @access  Private
 */
router.delete('/:id', verificarToken, eliminarMensaje);

/**
 * @route   PUT /api/mensajes/:conversacionId/leer
 * @desc    Marcar mensajes como leídos
 * @access  Private
 */
router.put('/:conversacionId/leer', verificarToken, marcarLeidos);

/**
 * @route   POST /api/mensajes/:id/reportar
 * @desc    Reportar un mensaje
 * @body    { motivo }
 * @access  Private
 */
router.post('/:id/reportar', verificarToken, reportarMensaje);

/**
 * @route   GET /api/mensajes/:conversacionId/buscar
 * @desc    Buscar mensajes en una conversación
 * @query   { q } (término de búsqueda)
 * @access  Private
 */
router.get('/:conversacionId/buscar', verificarToken, buscarEnConversacion);

// ================================================================
// USUARIOS
// ================================================================

/**
 * @route   GET /api/mensajes/usuarios/buscar
 * @desc    Buscar usuarios por nombre o email
 * @query   { q } (término de búsqueda, mínimo 2 caracteres)
 * @access  Private
 */
router.get('/usuarios/buscar', verificarToken, buscarUsuarios);

/**
 * @route   POST /api/mensajes/usuarios/bloquear
 * @desc    Bloquear a un usuario
 * @body    { usuarioId }
 * @access  Private
 */
router.post('/usuarios/bloquear', verificarToken, bloquearUsuario);

/**
 * @route   DELETE /api/mensajes/usuarios/bloquear/:id
 * @desc    Desbloquear a un usuario
 * @access  Private
 */
router.delete('/usuarios/bloquear/:id', verificarToken, desbloquearUsuario);

// ================================================================
// ARCHIVOS
// ================================================================

/**
 * @route   POST /api/mensajes/archivos
 * @desc    Subir un archivo (usado para mensajes)
 * @body    FormData con el archivo
 * @access  Private
 */
router.post('/archivos', verificarToken, subirArchivo);

// ================================================================
// LLAMADAS (VIDEO/VOZ)
// ================================================================

/**
 * @route   POST /api/mensajes/llamadas
 * @desc    Crear una nueva llamada
 * @body    { destinatarioId, tipo, conversationId }
 * @access  Private
 */
router.post('/llamadas', verificarToken, crearLlamada);

/**
 * @route   GET /api/mensajes/llamadas/:id
 * @desc    Verificar estado de una llamada
 * @access  Private
 */
router.get('/llamadas/:id', verificarToken, verificarLlamada);

/**
 * @route   PUT /api/mensajes/llamadas/:id
 * @desc    Actualizar estado de una llamada (aceptar/rechazar/finalizar)
 * @body    { estado }
 * @access  Private
 */
router.put('/llamadas/:id', verificarToken, actualizarLlamada);

module.exports = router;