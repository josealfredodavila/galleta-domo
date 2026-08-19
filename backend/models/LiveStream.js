// backend/models/LiveStream.js
const mongoose = require('mongoose');

const LiveStreamSchema = new mongoose.Schema({
    // ========================================
    // INFORMACIÓN BÁSICA
    // ========================================
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    titulo: {
        type: String,
        required: true,
        maxlength: 100
    },
    descripcion: {
        type: String,
        maxlength: 500,
        default: ''
    },

    // ========================================
    // ESTADO Y METADATOS DE LIVEKIT
    // ========================================
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    livekitRoomName: {
        type: String,
        unique: true
    },
    estado: {
        type: String,
        enum: ['programado', 'en_vivo', 'pausado', 'terminado', 'cancelado'],
        default: 'programado'
    },
    inicioProgramado: {
        type: Date,
        default: Date.now
    },
    inicioReal: {
        type: Date,
        default: null
    },
    finReal: {
        type: Date,
        default: null
    },

    // ========================================
    // MÉTRICAS Y AUDIENCIA
    // ========================================
    espectadores: {
        actuales: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        maximo: { type: Number, default: 0 },
        pico: { type: Number, default: 0 }
    },
    duracion: {
        type: Number, // en segundos
        default: 0
    },
    tiempoTransmitido: {
        type: Number, // en segundos
        default: 0
    },
    interacciones: {
        mensajes: { type: Number, default: 0 },
        reacciones: { type: Number, default: 0 },
        compartidos: { type: Number, default: 0 }
    },

    // ========================================
    // COBRO POR ALGORITMO
    // ========================================
    cobroPorAlgoritmo: {
        activo: { type: Boolean, default: false },
        costePorEspectador: { type: Number, default: 0.05 },
        costePorMinuto: { type: Number, default: 0.02 },
        umbralVisualizaciones: { type: Number, default: 100 },
        comision: { type: Number, default: 0.01 },
        totalCobrado: { type: Number, default: 0 },
        metricas: {
            visualizaciones: { type: Number, default: 0 },
            alcance: { type: Number, default: 0 },
            engagement: { type: Number, default: 0 }
        }
    },

    // ========================================
    // GANANCIAS
    // ========================================
    ganancias: {
        total: { type: Number, default: 0 },
        porEspectador: { type: Number, default: 0 },
        porMinuto: { type: Number, default: 0 },
        comisiones: { type: Number, default: 0 },
        neto: { type: Number, default: 0 }
    },

    // ========================================
    // SEGURIDAD
    // ========================================
    privacidad: {
        type: String,
        enum: ['publico', 'privado', 'por_invitacion'],
        default: 'publico'
    },
    invitados: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    bloqueados: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],

    // ========================================
    // CONTENIDO RELACIONADO
    // ========================================
    publicacionAsociada: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        default: null
    },
    tags: [{
        type: String,
        maxlength: 30
    }],

    // ========================================
    // TIMESTAMPS
    // ========================================
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

// ========================================
// ÍNDICES
// ========================================
LiveStreamSchema.index({ usuario: 1, estado: 1 });
LiveStreamSchema.index({ estado: 1, inicioProgramado: -1 });
LiveStreamSchema.index({ roomId: 1 });
LiveStreamSchema.index({ livekitRoomName: 1 });
LiveStreamSchema.index({ tags: 1 });
LiveStreamSchema.index({ 'cobroPorAlgoritmo.activo': 1 });

// ========================================
// MÉTODOS DE INSTANCIA
// ========================================

// Iniciar transmisión
LiveStreamSchema.methods.iniciar = function() {
    if (this.estado === 'en_vivo') {
        throw new Error('La transmisión ya está en vivo');
    }
    this.estado = 'en_vivo';
    this.inicioReal = new Date();
    return this.save();
};

// Pausar transmisión
LiveStreamSchema.methods.pausar = function() {
    if (this.estado !== 'en_vivo') {
        throw new Error('La transmisión no está en vivo');
    }
    this.estado = 'pausado';
    return this.save();
};

// Reanudar transmisión
LiveStreamSchema.methods.reanudar = function() {
    if (this.estado !== 'pausado') {
        throw new Error('La transmisión no está pausada');
    }
    this.estado = 'en_vivo';
    return this.save();
};

// Finalizar transmisión
LiveStreamSchema.methods.finalizar = function() {
    if (this.estado === 'terminado') {
        throw new Error('La transmisión ya ha terminado');
    }
    this.estado = 'terminado';
    this.finReal = new Date();
    this.duracion = Math.floor((this.finReal - (this.inicioReal || this.finReal)) / 1000);
    this.tiempoTransmitido = this.duracion;
    return this.save();
};

// Agregar espectador
LiveStreamSchema.methods.agregarEspectador = function() {
    this.espectadores.actuales += 1;
    this.espectadores.total += 1;
    if (this.espectadores.actuales > this.espectadores.maximo) {
        this.espectadores.maximo = this.espectadores.actuales;
    }
    if (this.espectadores.total > this.espectadores.pico) {
        this.espectadores.pico = this.espectadores.total;
    }
    return this.save();
};

// Eliminar espectador
LiveStreamSchema.methods.eliminarEspectador = function() {
    if (this.espectadores.actuales > 0) {
        this.espectadores.actuales -= 1;
    }
    return this.save();
};

// ========================================
// MÉTODOS ESTÁTICOS
// ========================================

// Obtener streams activos
LiveStreamSchema.statics.obtenerActivos = function() {
    return this.find({
        estado: { $in: ['en_vivo', 'pausado'] }
    })
    .populate('usuario', 'nombre fotoPerfil walletAddress')
    .sort({ espectadores: -1 });
};

// Obtener streams por usuario
LiveStreamSchema.statics.obtenerPorUsuario = function(usuarioId) {
    return this.find({ usuario: usuarioId })
        .sort({ createdAt: -1 });
};

// Obtener streams populares (por métricas)
LiveStreamSchema.statics.obtenerPopulares = function(limit = 10) {
    return this.find({
        estado: 'terminado',
        'espectadores.total': { $gt: 0 }
    })
    .sort({ 'espectadores.total': -1 })
    .limit(limit)
    .populate('usuario', 'nombre fotoPerfil walletAddress');
};

// Calcular cobro por algoritmo
LiveStreamSchema.statics.calcularCobroAlgoritmo = function(streamId) {
    return this.findById(streamId)
        .then(stream => {
            if (!stream) throw new Error('Stream no encontrado');
            if (!stream.cobroPorAlgoritmo.activo) {
                return { cobro: 0, mensaje: 'Cobro por algoritmo desactivado' };
            }

            const metrics = stream.cobroPorAlgoritmo.metricas;
            const config = stream.cobroPorAlgoritmo;

            // Calcular basado en métricas
            const cobroVisualizaciones = metrics.visualizaciones * config.costePorEspectador;
            const cobroAlcance = metrics.alcance * config.costePorMinuto;
            const totalCobro = cobroVisualizaciones + cobroAlcance;

            // Aplicar comisión
            const comision = totalCobro * config.comision;
            const neto = totalCobro - comision;

            // Actualizar stream
            stream.cobroPorAlgoritmo.totalCobrado = totalCobro;
            stream.ganancias.total = totalCobro;
            stream.ganancias.comisiones = comision;
            stream.ganancias.neto = neto;

            return stream.save();
        });
};

module.exports = mongoose.model('LiveStream', LiveStreamSchema);