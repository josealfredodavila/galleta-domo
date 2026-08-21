/* ================================================================
   MODELO DE ACTIVIDAD EN TIEMPO REAL - MÓDULO LIVE
   ================================================================ */

const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    streamId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    userName: {
        type: String,
        default: 'Anónimo'
    },
    action: {
        type: String,
        enum: [
            'join',          // Usuario se une
            'leave',         // Usuario sale
            'reaction',      // Reacción a mensaje
            'gift',          // Envío de regalo
            'share',         // Compartir stream
            'view',          // Vista del stream
            'interact'       // Interacción general
        ],
        required: true,
        index: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Índices
ActivityLogSchema.index({ streamId: 1, timestamp: -1 });
ActivityLogSchema.index({ userId: 1, action: 1 });

// Métodos estáticos
ActivityLogSchema.statics = {
    // Registrar una acción
    async logAction(data) {
        try {
            const log = new this(data);
            return await log.save();
        } catch (error) {
            console.error('Error registrando actividad:', error.message);
            return null;
        }
    },

    // Obtener estadísticas de un stream
    async getStreamStats(streamId) {
        const [totalViews, totalInteractions, uniqueUsers] = await Promise.all([
            this.countDocuments({ streamId, action: 'view' }),
            this.countDocuments({ streamId, action: 'interact' }),
            this.distinct('userId', { streamId })
        ]);

        return {
            totalViews,
            totalInteractions,
            uniqueUsers: uniqueUsers.length,
            engagementRate: totalViews > 0 ? (totalInteractions / totalViews * 100).toFixed(2) : 0
        };
    },

    // Obtener actividad reciente de un usuario
    async getUserRecentActivity(userId, limit = 20) {
        return this.find({ userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    }
};

const ActivityLog = mongoose.model('ActivityLog', ActivityLogSchema);

module.exports = ActivityLog;