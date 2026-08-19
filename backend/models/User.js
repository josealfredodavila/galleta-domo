// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // ===== IDENTIFICACIÓN =====
    walletAddress: {
        type: String,
        unique: true,
        required: true,
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

    // ===== PERFIL =====
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

    // ===== ESIM =====
    esim: {
        activo: { type: Boolean, default: false },
        tipo: { type: String, enum: ['wifi', 'datos'], default: 'wifi' },
        operador: { type: String, default: 'Csariel\'s' }
    },

    // ===== SEGURIDAD =====
    seguridad: {
        '2fa': { type: Boolean, default: false },
        verificado: { type: Boolean, default: false },
        bloqueado: { type: Boolean, default: false },
        intentosFallidos: { type: Number, default: 0 },
        ultimoIntento: Date
    },

    // ===== TOKENS Y NFT =====
    domosComprados: { type: Number, default: 0 },
    tokensAcumulados: { type: Number, default: 0 },
    haCanjeado: { type: Boolean, default: false },
    fechaCanje: Date,
    qrCodes: [{ type: String }],

    // ===== REDES SOCIALES =====
    contactos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    bloqueados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    amigos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    recomendados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // ===== ACTIVIDAD =====
    ultimaActividad: { type: Date, default: Date.now },
    ultimaConexion: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    actualizadoEn: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Índices para búsquedas rápidas
UserSchema.index({ nombre: 'text' });
UserSchema.index({ walletAddress: 1 });
UserSchema.index({ email: 1 });

// Método para actualizar última actividad
UserSchema.methods.actualizarActividad = function() {
    this.ultimaActividad = new Date();
    this.ultimaConexion = new Date();
    return this.save();
};

// Método para verificar si un usuario está bloqueado
UserSchema.methods.estaBloqueado = function(userId) {
    return this.bloqueados.includes(userId);
};

// Método para agregar contacto
UserSchema.methods.agregarContacto = function(userId) {
    if (!this.contactos.includes(userId) && this._id.toString() !== userId.toString()) {
        this.contactos.push(userId);
        return this.save();
    }
    return Promise.resolve(this);
};

module.exports = mongoose.model('User', UserSchema);