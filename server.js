// ================================================================
// SERVER.JS - BACKEND DE SARIEL'S (CON MONGODB ATLAS)
// ================================================================

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================================================
// MONGODB ATLAS - CONFIGURACIÓN MODULAR
// ================================================================
const databaseService = require('./services/databaseService');

// Inicializar base de datos
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    databaseService.initialize(MONGODB_URI);
    console.log('📦 DatabaseService inicializado');
} else {
    console.warn('⚠️ MONGODB_URI no configurada. Los logs de chat y actividad no estarán disponibles.');
}

// ================================================================
// RUTAS DE SALUD
// ================================================================

app.get('/api/health', (req, res) => {
    const dbState = databaseService.getState ? databaseService.getState() : { isReady: false };
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: {
            connected: dbState.isReady || false,
            state: dbState.connectionState || 'unknown'
        }
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        message: 'Backend de Sariel\'s funcionando',
        database: databaseService.isReadyState ? databaseService.isReadyState() : false
    });
});

// ================================================================
// RUTAS DE CHAT (MÓDULO LIVE)
// ================================================================

/**
 * Guardar mensaje de chat
 * POST /api/chat/message
 */
app.post('/api/chat/message', async (req, res) => {
    try {
        const { streamId, userId, userName, message, type = 'text' } = req.body;

        if (!streamId || !userId || !message) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos: streamId, userId, message'
            });
        }

        const result = await databaseService.saveChatMessage({
            streamId,
            userId,
            userName: userName || 'Anónimo',
            message,
            type
        });

        res.json({
            success: true,
            message: 'Mensaje guardado',
            data: result
        });

    } catch (error) {
        console.error('Error guardando mensaje:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Obtener mensajes de un stream
 * GET /api/chat/messages/:streamId?limit=50
 */
app.get('/api/chat/messages/:streamId', async (req, res) => {
    try {
        const { streamId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const before = req.query.before ? new Date(req.query.before) : null;

        const messages = await databaseService.getStreamMessages(streamId, limit, before);

        res.json({
            success: true,
            messages,
            count: messages.length
        });

    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Contar mensajes de un stream
 * GET /api/chat/count/:streamId
 */
app.get('/api/chat/count/:streamId', async (req, res) => {
    try {
        const { streamId } = req.params;
        const count = await databaseService.countStreamMessages(streamId);

        res.json({
            success: true,
            streamId,
            count
        });

    } catch (error) {
        console.error('Error contando mensajes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
// RUTAS DE ACTIVIDAD (MÓDULO LIVE)
// ================================================================

/**
 * Registrar actividad
 * POST /api/activity/log
 */
app.post('/api/activity/log', async (req, res) => {
    try {
        const { streamId, userId, userName, action, metadata } = req.body;

        if (!streamId || !userId || !action) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos: streamId, userId, action'
            });
        }

        const result = await databaseService.logActivity({
            streamId,
            userId,
            userName: userName || 'Anónimo',
            action,
            metadata: metadata || {}
        });

        res.json({
            success: true,
            message: 'Actividad registrada',
            data: result
        });

    } catch (error) {
        console.error('Error registrando actividad:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Obtener estadísticas de un stream
 * GET /api/activity/stats/:streamId
 */
app.get('/api/activity/stats/:streamId', async (req, res) => {
    try {
        const { streamId } = req.params;
        const stats = await databaseService.getStreamStats(streamId);

        res.json({
            success: true,
            streamId,
            stats
        });

    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Obtener actividad reciente de un usuario
 * GET /api/activity/user/:userId?limit=20
 */
app.get('/api/activity/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 20;

        const activities = await databaseService.getUserRecentActivity(userId, limit);

        res.json({
            success: true,
            activities,
            count: activities.length
        });

    } catch (error) {
        console.error('Error obteniendo actividad del usuario:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
// RUTA DE ESTADO DE BASE DE DATOS
// ================================================================

app.get('/api/db/status', (req, res) => {
    const state = databaseService.getState ? databaseService.getState() : null;
    res.json({
        success: true,
        database: state || {
            isReady: false,
            connectionState: 'unknown',
            lastError: 'Database service no inicializado'
        }
    });
});

// ================================================================
// RUTA DE LIMPIEZA DE DATOS (solo en producción o con token)
// ================================================================

app.post('/api/db/clean', async (req, res) => {
    try {
        const { daysToKeep = 30, token } = req.body;
        const CLEAN_TOKEN = process.env.CLEAN_TOKEN || 'sariels_clean_2025';

        if (token !== CLEAN_TOKEN) {
            return res.status(401).json({
                success: false,
                error: 'Token de limpieza inválido'
            });
        }

        const result = await databaseService.cleanOldData(daysToKeep);

        res.json({
            success: true,
            result
        });

    } catch (error) {
        console.error('Error limpiando datos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================================================================
// MANEJO DE RUTAS NO ENCONTRADAS
// ================================================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Ruta no encontrada',
        path: req.originalUrl
    });
});

// ================================================================
// MANEJO DE ERRORES GLOBAL
// ================================================================

app.use((err, req, res, next) => {
    console.error('❌ Error global:', err.message);
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: err.message
    });
});

// ================================================================
// INICIAR SERVIDOR
// ================================================================

app.listen(PORT, () => {
    console.log(`✅ API corriendo en puerto ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📊 DB Status: http://localhost:${PORT}/api/db/status`);

    if (MONGODB_URI) {
        console.log('📦 MongoDB Atlas: Conectando...');
    } else {
        console.warn('⚠️ MongoDB Atlas: No configurado (MONGODB_URI faltante)');
    }
});

// ================================================================
// GRACEFUL SHUTDOWN
// ================================================================

process.on('SIGINT', async () => {
    console.log('🛑 Recibida señal SIGINT. Cerrando conexiones...');
    try {
        await databaseService.disconnectDB?.();
    } catch (e) {
        console.error('Error cerrando base de datos:', e);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Recibida señal SIGTERM. Cerrando conexiones...');
    try {
        await databaseService.disconnectDB?.();
    } catch (e) {
        console.error('Error cerrando base de datos:', e);
    }
    process.exit(0);
});

// ================================================================
// EXPORTAR APP (para pruebas)
// ================================================================

module.exports = app;