// ================================================================
// SERVER.JS - BACKEND DE SARIEL'S CON SQLITE
// ================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================================================
// SERVIDOR DE ARCHIVOS ESTÁTICOS (FRONTEND)
// ================================================================
app.use(express.static(path.join(__dirname, 'public')));

// ================================================================
// BASE DE DATOS SQLITE
// ================================================================
const dbService = require('./services/dbService');

// ================================================================
// RUTAS DE SALUD
// ================================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: 'SQLite',
        version: '1.0.0'
    });
});

// ================================================================
// RUTAS DE CHAT (LIVE)
// ================================================================

app.post('/api/chat/message', (req, res) => {
    const { streamId, userId, userName, message, type, metadata } = req.body;

    if (!streamId || !userId || !message) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    dbService.saveChatMessage({
        streamId,
        userId,
        userName: userName || 'Anónimo',
        message,
        type: type || 'text',
        metadata: metadata || {}
    }, (id) => {
        if (id) {
            res.json({ success: true, messageId: id });
        } else {
            res.status(500).json({ error: 'Error guardando mensaje' });
        }
    });
});

app.get('/api/chat/messages/:streamId', (req, res) => {
    const { streamId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    dbService.getStreamMessages(streamId, limit, (messages) => {
        res.json({ success: true, messages });
    });
});

// ================================================================
// RUTAS DE USUARIOS
// ================================================================

app.post('/api/user', (req, res) => {
    const { wallet } = req.body;

    if (!wallet) {
        return res.status(400).json({ error: 'Wallet requerida' });
    }

    dbService.getOrCreateUser(wallet, (user) => {
        if (user) {
            res.json({ success: true, user });
        } else {
            res.status(500).json({ error: 'Error obteniendo usuario' });
        }
    });
});

app.post('/api/user/tokens', (req, res) => {
    const { wallet, tokens } = req.body;

    if (!wallet || tokens === undefined) {
        return res.status(400).json({ error: 'Wallet y tokens requeridos' });
    }

    dbService.updateUserTokens(wallet, tokens, (success) => {
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Error actualizando tokens' });
        }
    });
});

app.post('/api/user/canjear', (req, res) => {
    const { wallet } = req.body;

    if (!wallet) {
        return res.status(400).json({ error: 'Wallet requerida' });
    }

    dbService.canjearNft(wallet, (success, message) => {
        if (success) {
            res.json({ success: true, message });
        } else {
            res.status(400).json({ success: false, error: message });
        }
    });
});

// ================================================================
// RUTA PRINCIPAL
// ================================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================================================================
// MANEJO DE ERRORES GLOBAL
// ================================================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
});

// ================================================================
// GRACEFUL SHUTDOWN
// ================================================================
process.on('SIGINT', () => {
    console.log('🛑 Cerrando servidor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Cerrando servidor...');
    process.exit(0);
});

// ================================================================
// INICIAR SERVIDOR
// ================================================================
app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`📦 Base de datos: SQLite`);
});

module.exports = app;