// server.js - Backend principal para Galleta Domo
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

const app = express();

// ============ MIDDLEWARES ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
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
const UserSchema = new mongoose.Schema({
  walletAddress: { type: String, unique: true, required: true, index: true },
  email: { type: String, lowercase: true, trim: true },
  domosComprados: { type: Number, default: 0 },
  tokensAcumulados: { type: Number, default: 0 },
  haCanjeado: { type: Boolean, default: false },
  fechaCanje: Date,
  qrCodes: [{ type: String }],
  ultimaActividad: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const TransactionSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, index: true },
  tipo: { type: String, enum: ['compra', 'canje', 'quemado', 'qr_generado', 'qr_escaneado'], required: true },
  cantidad: Number,
  txHash: { type: String, unique: true, sparse: true },
  qrId: String,
  detalles: mongoose.Schema.Types.Mixed,
  fecha: { type: Date, default: Date.now, index: true }
});

const QRLogSchema = new mongoose.Schema({
  qrId: { type: String, unique: true, required: true },
  walletAddress: { type: String, index: true }, // Ahora es opcional (se asigna al escanear)
  usado: { type: Boolean, default: false },
  fechaUso: Date,
  fechaCreacion: { type: Date, default: Date.now },
  // Nuevos campos para el flujo físico
  generadoPor: { type: String }, // admin que generó el QR
  domoId: { type: String }, // identificador del domo físico
  escaneadoPor: { type: String } // wallet que escaneó
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const QRLog = mongoose.model('QRLog', QRLogSchema);

// ============ CONEXIÓN A POLYGON ============
const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractABI = require('./contracts/abi/GalletaTokenABI.json');
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  contractABI,
  wallet
);

// ============ MIDDLEWARE DE AUTENTICACIÓN ============
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Token no proporcionado');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Autenticación requerida' });
  }
};

// ============ RUTAS API ============

// 1. Registrar usuario
app.post('/api/auth/register', async (req, res) => {
  try {
    const { walletAddress, email } = req.body;
    if (!ethers.utils.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Dirección wallet inválida' });
    }
    
    let user = await User.findOne({ walletAddress });
    if (!user) {
      user = new User({ walletAddress, email: email || undefined });
      await user.save();
    }
    
    const token = jwt.sign(
      { walletAddress: user.walletAddress, userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        walletAddress: user.walletAddress,
        domosComprados: user.domosComprados,
        tokensAcumulados: user.tokensAcumulados,
        haCanjeado: user.haCanjeado
      }
    });
  } catch (error) {
    console.error('Error registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// 2. GENERAR QR PARA DOMO FÍSICO (NUEVO - Para imprimir dentro del domo)
app.post('/api/generar-qr-domo', auth, async (req, res) => {
  try {
    const { walletAddress } = req.user; // El admin que genera el QR
    const { cantidad = 1, domoId } = req.body; // domoId es opcional
    
    if (cantidad < 1 || cantidad > 50) {
      return res.status(400).json({ error: 'Cantidad inválida (1-50 domos)' });
    }
    
    const qrIds = [];
    const qrImages = [];
    
    for (let i = 0; i < cantidad; i++) {
      // QR ID único sin información de wallet
      const qrId = `DOMO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${i}`;
      qrIds.push(qrId);
      
      // Guardar QR en DB (sin wallet asignada aún)
      await new QRLog({ 
        qrId, 
        generadoPor: walletAddress,
        domoId: domoId || `DOMO-${i+1}`,
        usado: false
      }).save();
      
      // Generar imagen QR solo con el ID (sin wallet)
      const qrImage = await QRCode.toDataURL(JSON.stringify({
        qrId: qrId,
        // NO incluimos walletAddress aquí por seguridad
        // El sistema asignará la wallet cuando alguien escanee
        timestamp: Date.now()
      }));
      qrImages.push(qrImage);
    }
    
    // Registrar transacción
    await new Transaction({
      walletAddress,
      tipo: 'qr_generado',
      cantidad,
      qrId: qrIds.join(','),
      detalles: { 
        cantidadGenerada: cantidad,
        domoId: domoId || 'multiple',
        fechaGeneracion: new Date()
      }
    }).save();
    
    res.json({
      success: true,
      cantidad,
      qrIds,
      qrImages,
      message: `${cantidad} QR(s) generado(s) exitosamente para imprimir dentro de los domos`
    });
    
  } catch (error) {
    console.error('Error generando QR:', error);
    res.status(500).json({ error: 'Error al generar QR' });
  }
});

// 3. ESCANEAR QR Y RECIBIR TOKEN (NUEVO - Para clientes)
app.post('/api/escaneo-qr', async (req, res) => {
  try {
    const { qrId, walletAddress } = req.body;
    
    if (!qrId) {
      return res.status(400).json({ error: 'QR ID es requerido' });
    }
    
    if (!ethers.utils.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Dirección wallet inválida' });
    }
    
    // Buscar el QR en la base de datos
    const qrLog = await QRLog.findOne({ qrId });
    if (!qrLog) {
      return res.status(404).json({ error: 'QR no válido o no encontrado' });
    }
    
    // Verificar si el QR ya fue usado
    if (qrLog.usado) {
      return res.status(400).json({ error: 'Este QR ya fue utilizado' });
    }
    
    // Verificar si el QR ya tiene una wallet asignada
    if (qrLog.walletAddress && qrLog.walletAddress !== walletAddress) {
      return res.status(403).json({ error: 'Este QR no pertenece a tu wallet' });
    }
    
    // Verificar en blockchain que el sistema no esté pausado
    const estaPausado = await contract.paused();
    if (estaPausado) {
      return res.status(400).json({ error: 'Sistema en mantenimiento' });
    }
    
    // ============ ASIGNAR TOKEN AL CLIENTE ============
    
    // 1. Registrar el usuario si no existe
    let user = await User.findOne({ walletAddress });
    if (!user) {
      user = new User({ walletAddress });
      await user.save();
    }
    
    // 2. Enviar transacción a Polygon para dar el token
    const tx = await contract.transferToken(walletAddress, 1); // Asumiendo que tienes esta función
    const receipt = await tx.wait();
    
    // 3. Actualizar QR como usado
    qrLog.usado = true;
    qrLog.fechaUso = new Date();
    qrLog.walletAddress = walletAddress;
    qrLog.escaneadoPor = walletAddress;
    await qrLog.save();
    
    // 4. Actualizar usuario
    user.domosComprados += 1;
    user.tokensAcumulados += 1;
    user.qrCodes = user.qrCodes || [];
    user.qrCodes.push(qrId);
    user.ultimaActividad = new Date();
    await user.save();
    
    // 5. Registrar transacción
    await new Transaction({
      walletAddress,
      tipo: 'qr_escaneado',
      cantidad: 1,
      txHash: receipt.transactionHash,
      qrId: qrId,
      detalles: {
        domoId: qrLog.domoId,
        fechaEscaneo: new Date(),
        generadoPor: qrLog.generadoPor
      }
    }).save();
    
    res.json({
      success: true,
      message: '✅ QR escaneado exitosamente. Has recibido 1 token.',
      tokenRecibido: 1,
      totalTokens: user.tokensAcumulados,
      txHash: receipt.transactionHash
    });
    
  } catch (error) {
    console.error('Error escaneando QR:', error);
    res.status(500).json({ error: 'Error al procesar el escaneo' });
  }
});

// 4. Comprar domo (VERSIÓN ORIGINAL - Para compras digitales)
app.post('/api/comprar-domo', auth, async (req, res) => {
  try {
    const { walletAddress } = req.user;
    const { cantidad = 1 } = req.body;
    
    if (cantidad < 1 || cantidad > 10) {
      return res.status(400).json({ error: 'Cantidad inválida (1-10 domos)' });
    }
    
    // Verificar en blockchain
    const estaPausado = await contract.paused();
    if (estaPausado) {
      return res.status(400).json({ error: 'Sistema en mantenimiento' });
    }
    
    const precioTotal = 75 * cantidad;
    
    // Enviar transacción
    const tx = await contract.comprarDomo({
      value: ethers.utils.parseEther(precioTotal.toString())
    });
    const receipt = await tx.wait();
    
    // Generar QR
    const qrIds = [];
    const qrImages = [];
    for (let i = 0; i < cantidad; i++) {
      const qrId = `${Date.now()}-${walletAddress.slice(0, 8)}-${i}`;
      qrIds.push(qrId);
      
      await new QRLog({ qrId, walletAddress, usado: false }).save();
      
      const qrImage = await QRCode.toDataURL(JSON.stringify({
        qrId,
        walletAddress,
        timestamp: Date.now()
      }));
      qrImages.push(qrImage);
    }
    
    // Actualizar usuario
    const user = await User.findOne({ walletAddress });
    if (user) {
      user.domosComprados += cantidad;
      user.tokensAcumulados += cantidad;
      user.qrCodes = user.qrCodes.concat(qrIds);
      user.ultimaActividad = new Date();
      await user.save();
    }
    
    await new Transaction({
      walletAddress,
      tipo: 'compra',
      cantidad,
      txHash: receipt.transactionHash,
      qrId: qrIds.join(','),
      detalles: { cantidadDomos: cantidad, precioTotal }
    }).save();
    
    res.json({
      success: true,
      cantidad,
      qrIds,
      qrImages,
      txHash: receipt.transactionHash,
      message: `${cantidad} domo(s) comprado(s) exitosamente`
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar la compra' });
  }
});

// 5. Canjear NFT
app.post('/api/canjear-nft', auth, async (req, res) => {
  try {
    const { walletAddress } = req.user;
    
    const puedeCanjear = await contract.puedeCanjear(walletAddress);
    if (!puedeCanjear) {
      return res.status(400).json({ error: 'No puedes canjear aún. Necesitas 12 tokens' });
    }
    
    const tx = await contract.canjearNft();
    const receipt = await tx.wait();
    
    const user = await User.findOne({ walletAddress });
    if (user) {
      user.haCanjeado = true;
      user.fechaCanje = new Date();
      user.tokensAcumulados -= 12;
      await user.save();
    }
    
    await new Transaction({
      walletAddress,
      tipo: 'canje',
      cantidad: 12,
      txHash: receipt.transactionHash
    }).save();
    
    res.json({
      success: true,
      txHash: receipt.transactionHash,
      message: 'NFT canjeado exitosamente'
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al canjear NFT' });
  }
});

// 6. Obtener estado del usuario
app.get('/api/estado/:wallet', auth, async (req, res) => {
  try {
    const { wallet } = req.params;
    
    if (!ethers.utils.isAddress(wallet)) {
      return res.status(400).json({ error: 'Dirección wallet inválida' });
    }
    
    const user = await User.findOne({ walletAddress: wallet });
    
    const tokens = user?.tokensAcumulados || 0;
    const puedeCanjear = tokens >= 12 && !user?.haCanjeado;
    
    res.json({
      walletAddress: wallet,
      domosComprados: user?.domosComprados || 0,
      tokensAcumulados: tokens,
      haCanjeado: user?.haCanjeado || false,
      puedeCanjear,
      progresoCanje: Math.min((tokens / 12) * 100, 100),
      fechaCanje: user?.fechaCanje || null,
      qrCodes: user?.qrCodes || []
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// 7. Historial de transacciones
app.get('/api/historial/:wallet', auth, async (req, res) => {
  try {
    const { wallet } = req.params;
    const { limit = 20, page = 1 } = req.query;
    
    const transactions = await Transaction.find({ walletAddress: wallet })
      .sort({ fecha: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments({ walletAddress: wallet });
    
    res.json({
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// 8. Verificar QR (para saber si es válido antes de escanear)
app.post('/api/verificar-qr', async (req, res) => {
  try {
    const { qrId } = req.body;
    
    if (!qrId) {
      return res.status(400).json({ error: 'QR ID es requerido' });
    }
    
    const qrLog = await QRLog.findOne({ qrId });
    
    if (!qrLog) {
      return res.json({ 
        valido: false, 
        message: 'QR no válido' 
      });
    }
    
    if (qrLog.usado) {
      return res.json({ 
        valido: false, 
        message: 'Este QR ya fue utilizado' 
      });
    }
    
    res.json({
      valido: true,
      message: 'QR válido, puedes escanearlo para recibir tu token'
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al verificar QR' });
  }
});

// 9. Obtener todos los QR generados (para administración)
app.get('/api/admin/qrs', auth, async (req, res) => {
  try {
    const { limit = 50, page = 1, estado } = req.query;
    
    const query = {};
    if (estado === 'usados') query.usado = true;
    if (estado === 'disponibles') query.usado = false;
    
    const qrs = await QRLog.find(query)
      .sort({ fechaCreacion: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await QRLog.countDocuments(query);
    
    res.json({
      qrs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener QRs' });
  }
});

// 10. Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============ RUTA PRINCIPAL ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`🍪 Galleta Domo - Sistema de tokens y QRs físicos`);
});

module.exports = app;