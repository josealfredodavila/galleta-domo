// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const { LiveKitRoom } = require('@livekit/server-sdk');
const config = require('../config/config');

// ========================================
// INICIALIZACIÓN DE SUPABASE
// ========================================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ========================================
// INICIALIZACIÓN DE LIVEKIT
// ========================================
// La configuración de LiveKit se maneja en livekitServer.js

// ========================================
// INICIALIZACIÓN DE APP
// ========================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Guardar io para usar en rutas
app.set('io', io);

// ========================================
// MIDDLEWARES DE SEGURIDAD
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
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max
}));

// Rate limiting más estricto para autenticación
app.use('/api/auth/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20
}));

// ========================================
// CONEXIÓN A MONGODB
// ========================================
mongoose.connect(process.env.MONGODB_URI || config.mongodb.uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10
})
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(err => console.error('❌ Error MongoDB:', err));

// ========================================
// MODELOS
// ========================================
const User = require('./models/User');
const Post = require('./models/Post');
const Message = require('./models/Message');
const Contact = require('./models/Contact');
const LiveStream = require('./models/LiveStream');

// ========================================
// CONEXIÓN A POLYGON
// ========================================
const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC || config.polygon.rpcUrl);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

let contract;
try {
    const contractABI = require('../contracts/abi/GalletaTokenABI.json');
    contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS || config.contract.address,
        contractABI,
        wallet
    );
    console.log('✅ Conectado a Polygon');
} catch (error) {
    console.warn('⚠️ Contrato no disponible:', error.message);
}

// ========================================
// RUTAS
// ========================================
const authRoutes = require('./routes/auth');
const perfilRoutes = require('./routes/perfil');
const muroRoutes = require('./routes/muro');
const mensajesRoutes = require('./routes/mensajes');
const liveRoutes = require('./routes/live');
const paymentsRoutes = require('./routes/payments');

app.use('/api/auth', authRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/muro', muroRoutes);
app.use('/api/mensajes', mensajesRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/payments', paymentsRoutes);

// ========================================
// RUTA DE HEALTH CHECK
// ========================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            polygon: contract ? 'connected' : 'not configured',
            supabase: supabase ? 'connected' : 'not configured',
            livekit: process.env.LIVEKIT_API_KEY ? 'configured' : 'not configured'
        }
    });
});

// ========================================
// SOCKET.IO
// ========================================
require('./socket/socketHandler')(io);

// ========================================
// RUTA PRINCIPAL
// ========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================
// MANEJO DE ERRORES GLOBAL
// ========================================
app.use((err, req, res, next) => {
    console.error('❌ Error global:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Error interno del servidor',
        code: err.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
    });
});

// ========================================
// INICIAR SERVIDOR
// ========================================
const PORT = process.env.PORT || config.server.port || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO activo`);
    console.log(`📦 Servicios:`);
    console.log(`   - MongoDB: ${mongoose.connection.readyState === 1 ? '✅' : '❌'}`);
    console.log(`   - Polygon: ${contract ? '✅' : '❌'}`);
    console.log(`   - Supabase: ${supabase ? '✅' : '❌'}`);
    console.log(`   - LiveKit: ${process.env.LIVEKIT_API_KEY ? '✅' : '❌'}`);
});

module.exports = app;