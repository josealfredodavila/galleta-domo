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

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Guardar io para usar en rutas
app.set('io', io);

// ============ MIDDLEWARES ============
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (frontend)
app.use(express.static('public'));

// Rate limiting
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

// ============ CONEXIÓN A MONGODB ============
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/galleta-domo', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(err => console.error('❌ Error MongoDB:', err));

// ============ MODELOS ============
const User = require('./models/User');
const Post = require('./models/Post');
const Message = require('./models/Message');
const Contact = require('./models/Contact');

// ============ CONEXIÓN A POLYGON ============
const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractABI = require('../contracts/abi/GalletaTokenABI.json');
const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    contractABI,
    wallet
);

// ============ RUTAS ============
const authRoutes = require('./routes/auth');
const perfilRoutes = require('./routes/perfil');
const muroRoutes = require('./routes/muro');
const mensajesRoutes = require('./routes/mensajes');

app.use('/api/auth', authRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/muro', muroRoutes);
app.use('/api/mensajes', mensajesRoutes);

// ============ SOCKET.IO ============
require('./socket/socketHandler')(io);

// ============ RUTA PRINCIPAL ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ MANEJO DE ERRORES GLOBAL ============
app.use((err, req, res, next) => {
    console.error('Error global:', err);
    res.status(500).json({
        error: 'Error interno del servidor',
        message: err.message
    });
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO activo`);
});

module.exports = app;