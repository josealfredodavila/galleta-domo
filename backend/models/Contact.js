// backend/models/Contact.js
const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
    // ===== USUARIO PROPIETARIO =====
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // ===== CONTACTO =====
    contacto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // ===== INFORMACIÓN DE CONTACTO =====
    nombreContacto: {
        type: String,
        default: ''
    },
    telefonoContacto: {
        type: String,
        default: ''
    },
    nota: {
        type: String,
        maxlength: 200,
        default: ''
    },

    // ===== ESTADO DE RELACIÓN =====
    esRecomendado: {
        type: Boolean,
        default: false
    },
    esBloqueado: {
        type: Boolean,
        default: false
    },
    esAmigo: {
        type: Boolean,
        default: false
    },
    esFavorito: {
        type: Boolean,
        default: false
    },

    // ===== INTERACCIÓN =====
    ultimoMensaje: {
        type: Date,
        default: null
    },
    mensajesNoLeidos: {
        type: Number,
        default: 0
    },

    // ===== TIMESTAMPS =====
    createdAt: {
        type: Date,
        default: Date.now
    },
    actualizadoEn: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Índice compuesto para evitar duplicados
ContactSchema.index({ usuario: 1, contacto: 1 }, { unique: true });

// Índices adicionales
ContactSchema.index({ usuario: 1, esBloqueado: 1 });
ContactSchema.index({ usuario: 1, esAmigo: 1 });
ContactSchema.index({ usuario: 1, esFavorito: 1 });

// Método estático para obtener contactos de un usuario
ContactSchema.statics.obtenerContactos = function(usuarioId, filtros = {}) {
    const query = { usuario: usuarioId };
    
    if (filtros.soloAmigos) {
        query.esAmigo = true;
    }
    if (filtros.soloBloqueados) {
        query.esBloqueado = true;
    }
    if (filtros.soloFavoritos) {
        query.esFavorito = true;
    }
    
    return this.find(query)
        .populate('contacto', 'nombre fotoPerfil walletAddress estado')
        .sort({ ultimoMensaje: -1 });
};

// Método para marcar como bloqueado
ContactSchema.methods.bloquear = function() {
    this.esBloqueado = true;
    this.esAmigo = false;
    return this.save();
};

// Método para desbloquear
ContactSchema.methods.desbloquear = function() {
    this.esBloqueado = false;
    return this.save();
};

// Método para marcar como amigo
ContactSchema.methods.hacerAmigo = function() {
    this.esAmigo = true;
    this.esBloqueado = false;
    return this.save();
};

// Método para actualizar último mensaje
ContactSchema.methods.actualizarUltimoMensaje = function() {
    this.ultimoMensaje = new Date();
    return this.save();
};

// Método para incrementar mensajes no leídos
ContactSchema.methods.incrementarNoLeidos = function() {
    this.mensajesNoLeidos += 1;
    return this.save();
};

// Método para resetear mensajes no leídos
ContactSchema.methods.resetearNoLeidos = function() {
    this.mensajesNoLeidos = 0;
    return this.save();
};

module.exports = mongoose.model('Contact', ContactSchema);