/* ================================================================
   MODELO DE LOGS DE CHAT - MÓDULO LIVE
   ================================================================ */

const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
    streamId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true, default: 'Anónimo' },
    userAvatar: { type: String, default: '' },
    message: { type: String, required: true, maxlength: 500 },
    type: { type: String, enum: ['text', 'emoji', 'gift', 'system'], default: 'text' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

ChatMessageSchema.index({ streamId: 1, timestamp: -1 });
ChatMessageSchema.index({ userId: 1, timestamp: -1 });

ChatMessageSchema.statics = {
    async getStreamMessages(streamId, limit = 50, before = null) {
        const query = { streamId };
        if (before) {
            query.timestamp = { $lt: before };
        }
        return this.find(query)
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    },

    async countStreamMessages(streamId) {
        return this.countDocuments({ streamId });
    },

    async saveMessage(data) {
        try {
            const message = new this(data);
            return await message.save();
        } catch (error) {
            console.error('Error guardando mensaje:', error.message);
            return null;
        }
    },

    async cleanOldMessages(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const result = await this.deleteMany({
            timestamp: { $lt: cutoffDate }
        });
        
        console.log(`🧹 Eliminados ${result.deletedCount} mensajes antiguos`);
        return result;
    }
};

const ChatLog = mongoose.model('ChatLog', ChatMessageSchema);
module.exports = ChatLog;