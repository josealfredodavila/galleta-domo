// server.js - VERSIÓN COMPLETA PARA RAILWAY
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// ========================================
// SOCKET.IO
// ========================================
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

app.set('io', io);

// ========================================
// MIDDLEWARES
// ========================================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos
app.use(express.static('public'));

// Rate limiting
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

// ========================================
// CONEXIÓN A MONGODB
// ========================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/galleta-domo', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000
})
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(err => console.error('❌ Error MongoDB:', err.message));

// ========================================
// RUTAS
// ========================================
const authRoutes = require('./backend/routes/auth');
const perfilRoutes = require('./backend/routes/perfil');
const muroRoutes = require('./backend/routes/muro');
const mensajesRoutes = require('./backend/routes/mensajes');
const liveRoutes = require('./backend/routes/live');
const paymentsRoutes = require('./backend/routes/payments');

app.use('/api/auth', authRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/muro', muroRoutes);
app.use('/api/mensajes', mensajesRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/payments', paymentsRoutes);

// ========================================
// SOCKET.IO HANDLER
// ========================================
require('./backend/socket/socketHandler')(io);

// ========================================
// HEALTH CHECK
// ========================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        services: {
            mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            socketio: 'active'
        }
    });
});

// ========================================
// RUTA PRINCIPAL
// ========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================
// INICIAR SERVIDOR
// ========================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📡 Socket.IO activo`);
    console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Conectado' : '❌ Desconectado'}`);
});

module.exports = app;