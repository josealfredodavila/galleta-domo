/* ================================================================
   SERVICIO DE BASE DE DATOS - MANEJO DE FALLOS
   ================================================================ */

const { ChatLog, ActivityLog } = require('../models');
const { connectDB, getConnectionState, isConnected, disconnectDB } = require('../config/db');

class DatabaseService {
    constructor() {
        this.isReady = false;
        this.lastError = null;
        this.retryQueue = [];
    }

    async initialize(mongoUri) {
        try {
            const result = await connectDB(mongoUri);
            this.isReady = result.success;
            this.lastError = result.success ? null : result.error;
            
            if (this.isReady) {
                console.log('✅ DatabaseService inicializado');
                this.processRetryQueue();
            } else {
                console.warn('⚠️ DatabaseService en modo limitado:', result.error);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Error inicializando DatabaseService:', error.message);
            this.isReady = false;
            this.lastError = error.message;
            return { success: false, error: error.message };
        }
    }

    isReadyState() {
        return this.isReady && isConnected();
    }

    getState() {
        return {
            isReady: this.isReadyState(),
            connectionState: getConnectionState(),
            lastError: this.lastError,
            queueLength: this.retryQueue.length
        };
    }

    async execute(operation, fallback = null) {
        if (this.isReadyState()) {
            try {
                return await operation();
            } catch (error) {
                console.error('❌ Error ejecutando operación:', error.message);
                if (fallback !== null) {
                    return fallback;
                }
                return { success: false, error: error.message };
            }
        }

        if (fallback !== null) {
            console.warn('⚠️ Base de datos no disponible, usando fallback');
            return fallback;
        }

        console.warn('⚠️ Base de datos no disponible, encolando operación');
        this.retryQueue.push(operation);
        return { success: false, error: 'Base de datos no disponible', queued: true };
    }

    async processRetryQueue() {
        if (!this.isReadyState() || this.retryQueue.length === 0) return;

        console.log(`🔄 Procesando ${this.retryQueue.length} operaciones encoladas...`);
        
        const queue = [...this.retryQueue];
        this.retryQueue = [];

        for (const operation of queue) {
            try {
                await operation();
            } catch (error) {
                console.error('❌ Error ejecutando operación encolada:', error.message);
                this.retryQueue.push(operation);
            }
        }
    }

    // ===== MÉTODOS DE CHAT =====
    async saveChatMessage(data) {
        return this.execute(
            () => ChatLog.saveMessage(data),
            { success: false, error: 'Chat log no disponible' }
        );
    }

    async getStreamMessages(streamId, limit = 50, before = null) {
        return this.execute(
            () => ChatLog.getStreamMessages(streamId, limit, before),
            []
        );
    }

    async countStreamMessages(streamId) {
        return this.execute(
            () => ChatLog.countStreamMessages(streamId),
            0
        );
    }

    // ===== MÉTODOS DE ACTIVIDAD =====
    async logActivity(data) {
        return this.execute(
            () => ActivityLog.logAction(data),
            { success: false, error: 'Activity log no disponible' }
        );
    }

    async getStreamStats(streamId) {
        return this.execute(
            () => ActivityLog.getStreamStats(streamId),
            { totalViews: 0, totalInteractions: 0, uniqueUsers: 0, engagementRate: 0 }
        );
    }

    async getUserRecentActivity(userId, limit = 20) {
        return this.execute(
            () => ActivityLog.getUserRecentActivity(userId, limit),
            []
        );
    }

    // ===== LIMPIEZA =====
    async cleanOldData(daysToKeep = 30) {
        if (!this.isReadyState()) {
            return { success: false, error: 'Base de datos no disponible' };
        }

        try {
            const chatResult = await ChatLog.cleanOldMessages(daysToKeep);
            return { success: true, deleted: chatResult.deletedCount };
        } catch (error) {
            console.error('❌ Error limpiando datos:', error.message);
            return { success: false, error: error.message };
        }
    }

    async disconnectDB() {
        return disconnectDB();
    }
}

const databaseService = new DatabaseService();
module.exports = databaseService;