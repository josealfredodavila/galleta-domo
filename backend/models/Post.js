// backend/models/Post.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    // ===== AUTOR =====
    autor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // ===== CONTENIDO =====
    tipo: {
        type: String,
        enum: ['texto', 'foto', 'video', 'venta', 'token'],
        default: 'texto'
    },
    contenido: {
        type: String,
        required: true,
        maxlength: 5000
    },

    // ===== MEDIA =====
    imagen: {
        type: String,
        default: null
    },
    video: {
        type: String,
        default: null
    },

    // ===== VENTA DE TOKENS =====
    precioToken: {
        type: Number,
        default: 0
    },
    cantidadTokens: {
        type: Number,
        default: 0
    },

    // ===== REACCIONES =====
    reacciones: {
        meGusta: { type: Number, default: 0 },
        meDivierte: { type: Number, default: 0 },
        meEncanta: { type: Number, default: 0 },
        meEntristese: { type: Number, default: 0 },
        meEnoja: { type: Number, default: 0 }
    },
    usuariosReaccionaron: [{
        usuario: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reaccion: {
            type: String,
            enum: ['meGusta', 'meDivierte', 'meEncanta', 'meEntristese', 'meEnoja']
        }
    }],

    // ===== COMENTARIOS =====
    comentarios: [{
        usuario: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        contenido: {
            type: String,
            required: true,
            maxlength: 1000
        },
        fecha: {
            type: Date,
            default: Date.now
        },
        editado: {
            type: Boolean,
            default: false
        }
    }],
    totalComentarios: {
        type: Number,
        default: 0
    },

    // ===== ESTADO =====
    visible: {
        type: Boolean,
        default: true
    },
    destacado: {
        type: Boolean,
        default: false
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

// Índices para búsquedas rápidas
PostSchema.index({ autor: 1, createdAt: -1 });
PostSchema.index({ tipo: 1 });
PostSchema.index({ 'comentarios.usuario': 1 });

// Método para agregar reacción
PostSchema.methods.agregarReaccion = function(usuarioId, tipoReaccion) {
    // Verificar si ya reaccionó
    const existe = this.usuariosReaccionaron.find(
        u => u.usuario.toString() === usuarioId.toString()
    );

    if (existe) {
        // Quitar reacción anterior
        const reaccionAnterior = existe.reaccion;
        if (this.reacciones[reaccionAnterior]) {
            this.reacciones[reaccionAnterior]--;
        }
        this.usuariosReaccionaron = this.usuariosReaccionaron.filter(
            u => u.usuario.toString() !== usuarioId.toString()
        );
    }

    // Agregar nueva reacción
    if (tipoReaccion) {
        this.reacciones[tipoReaccion] = (this.reacciones[tipoReaccion] || 0) + 1;
        this.usuariosReaccionaron.push({
            usuario: usuarioId,
            reaccion: tipoReaccion
        });
    }

    return this.save();
};

// Método para agregar comentario
PostSchema.methods.agregarComentario = function(usuarioId, contenido) {
    this.comentarios.push({
        usuario: usuarioId,
        contenido: contenido,
        fecha: new Date()
    });
    this.totalComentarios = this.comentarios.length;
    return this.save();
};

// Método para obtener total de reacciones
PostSchema.methods.totalReacciones = function() {
    return Object.values(this.reacciones).reduce((a, b) => a + b, 0);
};

module.exports = mongoose.model('Post', PostSchema);