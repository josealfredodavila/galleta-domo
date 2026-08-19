// server.js - Backend principal
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
  tipo: { type: String, enum: ['compra', 'canje', 'quemado', 'qr_generado'], required: true },
  cantidad: Number,
  txHash: { type: String, unique: true, sparse: true },
  qrId: String,
  detalles: mongoose.Schema.Types.Mixed,
  fecha: { type: Date, default: Date.now, index: true }
});

const QRLogSchema = new mongoose.Schema({
  qrId: { type: String, unique: true, required: true },
  walletAddress: { type: String, required: true, index: true },
  usado: { type: Boolean, default: false },
  fechaUso: Date,
  fechaCreacion: { type: Date, default: Date.now }
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
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// 2. Comprar domo
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
      
      await new QRLog({ qrId, walletAddress }).save();
      
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

// 3. Canjear NFT
app.post('/api/canjear-nft', auth, async (req, res) => {
  try {
    const { walletAddress } = req.user;
    
    const puedeCanjear = await contract.puedeCanjear(walletAddress);
    if (!puedeCanjear) {
      return res.status(400).json({ error: 'No puedes canjear aún' });
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
    res.status(500).json({ error: 'Error al canjear NFT' });
  }
});

// 4. Obtener estado
app.get('/api/estado/:wallet', auth, async (req, res) => {
  try {
    const { wallet } = req.params;
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
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// 5. Historial
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
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// 6. Health check
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
});

module.exports = app;