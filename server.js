require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const config = require('./config/config');

const app = express();

// ============ MIDDLEWARES DE SEGURIDAD ============
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'https://tu-dominio.com'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max
});
app.use('/api/', limiter);

// ============ CONEXIÓN A MONGODB ============
mongoose.connect(config.mongodb.uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(err => console.error('❌ Error MongoDB:', err));

// ============ CONEXIÓN A POLYGON ============
const provider = new ethers.providers.JsonRpcProvider(config.polygon.rpcUrl);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Cargar ABI del contrato
const contractABI = require('./contracts/abi/GalletaTokenABI.json');
const contract = new ethers.Contract(
    config.contract.address,
    contractABI,
    wallet
);

// ============ MODELOS DE DATOS ============
const UserSchema = new mongoose.Schema({
    walletAddress: { 
        type: String, 
        unique: true, 
        required: true,
        index: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    domosComprados: { 
        type: Number, 
        default: 0 
    },
    tokensAcumulados: { 
        type: Number, 
        default: 0 
    },
    haCanjeado: { 
        type: Boolean, 
        default: false 
    },
    fechaCanje: Date,
    qrCodes: [{ 
        type: String 
    }],
    ultimaActividad: {
        type: Date,
        default: Date.now
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

const TransactionSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        index: true
    },
    tipo: {
        type: String,
        enum: ['compra', 'canje', 'quemado', 'qr_generado'],
        required: true
    },
    cantidad: Number,
    txHash: {
        type: String,
        unique: true,
        sparse: true
    },
    qrId: String,
    detalles: mongoose.Schema.Types.Mixed,
    fecha: { 
        type: Date, 
        default: Date.now,
        index: true
    }
});

const QRLogSchema = new mongoose.Schema({
    qrId: {
        type: String,
        unique: true,
        required: true
    },
    walletAddress: {
        type: String,
        required: true,
        index: true
    },
    usado: {
        type: Boolean,
        default: false
    },
    fechaUso: Date,
    fechaCreacion: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const QRLog = mongoose.model('QRLog', QRLogSchema);

// ============ MIDDLEWARE DE AUTENTICACIÓN ============
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            throw new Error('Token no proporcionado');
        }
        
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ 
            error: 'Autenticación requerida',
            message: error.message 
        });
    }
};

// ============ RUTAS API ============

// 1. Registrar/autenticar usuario
app.post('/api/auth/register', async (req, res) => {
    try {
        const { walletAddress, email } = req.body;
        
        // Validar dirección wallet
        if (!ethers.utils.isAddress(walletAddress)) {
            return res.status(400).json({ error: 'Dirección wallet inválida' });
        }
        
        let user = await User.findOne({ walletAddress });
        if (!user) {
            user = new User({ 
                walletAddress,
                email: email || undefined
            });
            await user.save();
        }
        
        // Generar token JWT
        const token = jwt.sign(
            { 
                walletAddress: user.walletAddress,
                userId: user._id
            },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
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

// 2. Comprar domo
app.post('/api/comprar-domo', auth, async (req, res) => {
    try {
        const { walletAddress } = req.user;
        const { cantidad = 1 } = req.body;
        
        // Validar cantidad
        if (cantidad < 1 || cantidad > 10) {
            return res.status(400).json({ error: 'Cantidad inválida (1-10 domos)' });
        }
        
        // Verificar en blockchain
        const estaPausado = await contract.paused();
        if (estaPausado) {
            return res.status(400).json({ error: 'Sistema en mantenimiento' });
        }
        
        // Calcular precio total
        const precioTotal = config.business.precioDomo * cantidad;
        
        // Enviar transacción a Polygon
        const tx = await contract.comprarDomo({
            value: ethers.utils.parseEther(precioTotal.toString()),
            gasLimit: 3000000,
            gasPrice: await provider.getGasPrice()
        });
        
        const receipt = await tx.wait();
        
        // Generar QR para cada domo
        const qrIds = [];
        for (let i = 0; i < cantidad; i++) {
            const qrId = `${Date.now()}-${walletAddress.slice(0, 8)}-${i}`;
            qrIds.push(qrId);
            
            // Guardar QR en DB
            await new QRLog({
                qrId,
                walletAddress
            }).save();
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
        
        // Registrar transacción
        await new Transaction({
            walletAddress,
            tipo: 'compra',
            cantidad,
            txHash: receipt.transactionHash,
            qrId: qrIds.join(','),
            detalles: {
                cantidadDomos: cantidad,
                precioTotal,
                blockNumber: receipt.blockNumber
            }
        }).save();
        
        // Generar código QR en imagen
        const qrImagePromises = qrIds.map(qrId => 
            QRCode.toDataURL(JSON.stringify({
                qrId,
                walletAddress,
                timestamp: Date.now()
            }))
        );
        
        const qrImages = await Promise.all(qrImagePromises);
        
        res.json({
            success: true,
            cantidad,
            qrIds,
            qrImages,
            txHash: receipt.transactionHash,
            message: `${cantidad} domo(s) comprado(s) exitosamente`
        });
        
    } catch (error) {
        console.error('Error comprando domo:', error);
        res.status(500).json({ 
            error: 'Error al procesar la compra',
            details: error.message 
        });
    }
});

// 3. Canjear NFT
app.post('/api/canjear-nft', auth, async (req, res) => {
    try {
        const { walletAddress } = req.user;
        
        // Verificar en blockchain
        const puedeCanjear = await contract.puedeCanjear(walletAddress);
        if (!puedeCanjear) {
            return res.status(400).json({ 
                error: 'No puedes canjear aún. Necesitas 12 tokens' 
            });
        }
        
        // Enviar transacción
        const tx = await contract.canjearNft({
            gasLimit: 500000,
            gasPrice: await provider.getGasPrice()
        });
        
        const receipt = await tx.wait();
        
        // Actualizar usuario
        const user = await User.findOne({ walletAddress });
        if (user) {
            user.haCanjeado = true;
            user.fechaCanje = new Date();
            user.tokensAcumulados -= config.business.tokensParaCanje;
            await user.save();
        }
        
        // Registrar transacción
        await new Transaction({
            walletAddress,
            tipo: 'canje',
            cantidad: config.business.tokensParaCanje,
            txHash: receipt.transactionHash,
            detalles: {
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            }
        }).save();
        
        res.json({
            success: true,
            txHash: receipt.transactionHash,
            message: 'NFT canjeado exitosamente'
        });
        
    } catch (error) {
        console.error('Error canjeando NFT:', error);
        res.status(500).json({ 
            error: 'Error al canjear NFT',
            details: error.message 
        });
    }
});

// 4. Obtener estado del usuario
app.get('/api/estado/:wallet', auth, async (req, res) => {
    try {
        const { wallet } = req.params;
        
        if (!ethers.utils.isAddress(wallet)) {
            return res.status(400).json({ error: 'Dirección wallet inválida' });
        }
        
        // Verificar en blockchain
        const [puedeCanjear, progreso] = await Promise.all([
            contract.puedeCanjear(wallet),
            contract.getProgresoCanje(wallet)
        ]);
        
        // Buscar en DB
        const user = await User.findOne({ walletAddress: wallet });
        
        res.json({
            walletAddress: wallet,
            domosComprados: user?.domosComprados || 0,
            tokensAcumulados: user?.tokensAcumulados || 0,
            haCanjeado: user?.haCanjeado || false,
            puedeCanjear,
            progresoCanje: progreso.toString(),
            fechaCanje: user?.fechaCanje || null,
            qrCodes: user?.qrCodes || []
        });
        
    } catch (error) {
        console.error('Error obteniendo estado:', error);
        res.status(500).json({ error: 'Error al obtener estado' });
    }
});

// 5. Historial de transacciones
app.get('/api/historial/:wallet', auth, async (req, res) => {
    try {
        const { wallet } = req.params;
        const { limit = 50, page = 1 } = req.query;
        
        const skip = (page - 1) * limit;
        
        const [transactions, total] = await Promise.all([
            Transaction.find({ walletAddress: wallet })
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Transaction.countDocuments({ walletAddress: wallet })
        ]);
        
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
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// 6. Verificar QR
app.post('/api/verificar-qr', auth, async (req, res) => {
    try {
        const { qrId } = req.body;
        const { walletAddress } = req.user;
        
        const qrLog = await QRLog.findOne({ qrId });
        if (!qrLog) {
            return res.status(404).json({ error: 'QR no encontrado' });
        }
        
        if (qrLog.usado) {
            return res.status(400).json({ error: 'QR ya fue utilizado' });
        }
        
        if (qrLog.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(403).json({ error: 'QR no pertenece a esta wallet' });
        }
        
        res.json({
            success: true,
            qrId,
            valido: true,
            message: 'QR válido'
        });
        
    } catch (error) {
        console.error('Error verificando QR:', error);
        res.status(500).json({ error: 'Error al verificar QR' });
    }
});

// 7. Dashboard Admin (estadísticas)
app.get('/api/admin/stats', auth, async (req, res) => {
    try {
        const [totalUsers, totalDomos, totalCanjes, stats, ultimosCanjes] = await Promise.all([
            User.countDocuments(),
            User.aggregate([{ $group: { _id: null, total: { $sum: '$domosComprados' } } }]),
            User.countDocuments({ haCanjeado: true }),
            Transaction.aggregate([
                { 
                    $group: {
                        _id: '$tipo',
                        total: { $sum: 1 },
                        cantidad: { $sum: '$cantidad' }
                    }
                }
            ]),
            Transaction.find({ tipo: 'canje' })
                .sort({ fecha: -1 })
                .limit(10)
        ]);
        
        res.json({
            totalUsuarios: totalUsers,
            totalDomosVendidos: totalDomos[0]?.total || 0,
            totalCanjes: totalCanjes,
            transaccionesPorTipo: stats,
            ultimosCanjes,
            fecha: new Date()
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 API disponible en http://localhost:${PORT}/api`);
});