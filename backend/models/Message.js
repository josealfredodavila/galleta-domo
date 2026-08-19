// backend/models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    // ===== REMITENTE Y DESTINATARIO =====
    de: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    para: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // ===== CONTENIDO =====
    tipo: {
        type: String,
        enum: ['texto', 'foto', 'video', 'archivo', 'comprobante', 'audio'],
        default: 'texto'
    },
    contenido: {
        type: String,
        maxlength: 5000,
        default: ''
    },
    archivo: {
        type: String,
        default: null
    },

    // ===== ESTADO =====
    leido: {
        type: Boolean,
        default: false
    },
    fechaLeido: {
        type: Date,
        default: null
    },
    entregado: {
        type: Boolean,
        default: false
    },
    fechaEntrega: {
        type: Date,
        default: null
    },

    // ===== ELIMINACIÓN (Soft Delete) =====
    eliminadoParaDe: {
        type: Boolean,
        default: false
    },
    eliminadoParaPara: {
        type: Boolean,
        default: false
    },

    // ===== TIMESTAMPS =====
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Índices compuestos para búsquedas rápidas
MessageSchema.index({ de: 1, para: 1, createdAt: -1 });
MessageSchema.index({ para: 1, leido: 1 });
MessageSchema.index({ para: 1, createdAt: -1 });

// Método para marcar como leído
MessageSchema.methods.marcarComoLeido = function() {
    if (!this.leido) {
        this.leido = true;
        this.fechaLeido = new Date();
        return this.save();
    }
    return Promise.resolve(this);
};

// Método para marcar como entregado
MessageSchema.methods.marcarComoEntregado = function() {
    if (!this.entregado) {
        this.entregado = true;
        this.fechaEntrega = new Date();
        return this.save();
    }
    return Promise.resolve(this);
};

// Método para eliminar para un usuario
MessageSchema.methods.eliminarParaUsuario = function(usuarioId) {
    if (this.de.toString() === usuarioId.toString()) {
        this.eliminadoParaDe = true;
    } else if (this.para.toString() === usuarioId.toString()) {
        this.eliminadoParaPara = true;
    }
    return this.save();
};

// Método estático para obtener mensajes no leídos de un usuario
MessageSchema.statics.obtenerNoLeidos = function(usuarioId) {
    return this.countDocuments({
        para: usuarioId,
        leido: false,
        eliminadoParaPara: { $ne: true }
    });
};

// Método estático para obtener última conversación
MessageSchema.statics.ultimaConversacion = function(usuarioId, contactoId) {
    return this.findOne({
        $or: [
            { de: usuarioId, para: contactoId },
            { de: contactoId, para: usuarioId }
        ],
        eliminadoParaDe: { $ne: true },
        eliminadoParaPara: { $ne: true }
    })
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Message', MessageSchema);