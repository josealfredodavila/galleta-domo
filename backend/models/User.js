// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // ========================================
    // IDENTIFICACIÓN
    // ========================================
    walletAddress: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    supabaseId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    nombre: {
        type: String,
        default: 'Usuario'
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        sparse: true
    },
    telefono: {
        type: String,
        sparse: true
    },

    // ========================================
    // PERFIL
    // ========================================
    fotoPerfil: {
        type: String,
        default: '/default-avatar.png'
    },
    estado: {
        type: String,
        enum: ['conectado', 'ausente', 'ocupado'],
        default: 'conectado'
    },
    biografia: {
        type: String,
        maxlength: 500,
        default: ''
    },

    // ========================================
    // ESIM (Gestión por API/Servicios externos)
    // ========================================
    esim: {
        activo: { type: Boolean, default: false },
        tipo: { type: String, enum: ['wifi', 'datos'], default: 'wifi' },
        operador: { type: String, default: 'Csariel\'s' },
        ultimaValidacion: { type: Date, default: null }
    },

    // ========================================
    // SEGURIDAD
    // ========================================
    seguridad: {
        '2fa': { type: Boolean, default: false },
        verificado: { type: Boolean, default: false },
        bloqueado: { type: Boolean, default: false },
        intentosFallidos: { type: Number, default: 0 },
        ultimoIntento: Date,
        verifiedAt: Date
    },

    // ========================================
    // TOKENS Y NFT
    // ========================================
    domosComprados: { type: Number, default: 0 },
    tokensAcumulados: { type: Number, default: 0 },
    tokensTotales: { type: Number, default: 0 }, // Histórico
    haCanjeado: { type: Boolean, default: false },
    fechaCanje: Date,
    qrCodes: [{ type: String }],
    nftId: { type: String, default: null },

    // ========================================
    // REDES SOCIALES
    // ========================================
    contactos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bloqueados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    amigos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    recomendados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // ========================================
    // MURO LIVE
    // ========================================
    live: {
        activo: { type: Boolean, default: false },
        streamId: { type: String, default: null },
        espectadores: { type: Number, default: 0 },
        ganancias: { type: Number, default: 0 } // En MATIC
    },

    // ========================================
    // PAGOS (NowPayments)
    // ========================================
    payments: {
        customerId: { type: String, default: null },
        historialPagos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }]
    },

    // ========================================
    // ACTIVIDAD
    // ========================================
    ultimaActividad: { type: Date, default: Date.now },
    ultimaConexion: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    actualizadoEn: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// ========================================
// ÍNDICES
// ========================================
UserSchema.index({ nombre: 'text' });
UserSchema.index({ walletAddress: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ supabaseId: 1 });

// ========================================
// MÉTODOS DE INSTANCIA
// ========================================

// Actualizar última actividad
UserSchema.methods.actualizarActividad = function() {
    this.ultimaActividad = new Date();
    this.ultimaConexion = new Date();
    return this.save();
};

// Verificar si un usuario está bloqueado
UserSchema.methods.estaBloqueado = function(userId) {
    return this.bloqueados.includes(userId);
};

// Agregar contacto
UserSchema.methods.agregarContacto = function(userId) {
    if (!this.contactos.includes(userId) && this._id.toString() !== userId.toString()) {
        this.contactos.push(userId);
        return this.save();
    }
    return Promise.resolve(this);
};

// Eliminar contacto
UserSchema.methods.eliminarContacto = function(userId) {
    this.contactos = this.contactos.filter(id => id.toString() !== userId.toString());
    return this.save();
};

// Agregar token
UserSchema.methods.agregarToken = function(cantidad = 1) {
    this.tokensAcumulados += cantidad;
    this.tokensTotales += cantidad;
    this.domosComprados += 1;
    return this.save();
};

// Consumir tokens para canje
UserSchema.methods.consumirTokens = function() {
    if (this.tokensAcumulados < 12) {
        throw new Error('No tienes suficientes tokens');
    }
    this.tokensAcumulados -= 12;
    this.haCanjeado = true;
    this.fechaCanje = new Date();
    return this.save();
};

// Verificar si puede canjear
UserSchema.methods.puedeCanjear = function() {
    return this.tokensAcumulados >= 12 && !this.haCanjeado;
};

// Obtener progreso de canje
UserSchema.methods.progresoCanje = function() {
    return Math.min((this.tokensAcumulados / 12) * 100, 100);
};

// ========================================
// MÉTODOS ESTÁTICOS
// ========================================

// Buscar por wallet o email
UserSchema.statics.buscarPorIdentificador = function(identificador) {
    return this.findOne({
        $or: [
            { walletAddress: { $regex: identificador, $options: 'i' } },
            { email: { $regex: identificador, $options: 'i' } },
            { supabaseId: identificador }
        ]
    });
};

// Obtener usuarios activos (conectados)
UserSchema.statics.obtenerActivos = function() {
    return this.find({ estado: 'conectado' })
        .select('_id nombre fotoPerfil walletAddress')
        .sort({ ultimaActividad: -1 });
};

// Obtener top usuarios por tokens
UserSchema.statics.topUsuarios = function(limit = 10) {
    return this.find({ tokensAcumulados: { $gt: 0 } })
        .sort({ tokensAcumulados: -1 })
        .limit(limit)
        .select('_id nombre fotoPerfil tokensAcumulados');
};

module.exports = mongoose.model('User', UserSchema);