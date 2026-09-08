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