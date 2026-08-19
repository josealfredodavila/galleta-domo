const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Web3 = require('web3');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de Polygon
const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractABI = require('./contracts/GalletaTokenABI.json');
const contractAddress = process.env.CONTRACT_ADDRESS;
const contract = new ethers.Contract(contractAddress, contractABI, wallet);

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Modelos
const UserSchema = new mongoose.Schema({
    walletAddress: { type: String, unique: true, required: true },
    email: String,
    domosComprados: { type: Number, default: 0 },
    tokensAcumulados: { type: Number, default: 0 },
    haCanjeado: { type: Boolean, default: false },
    fechaCanje: Date,
    qrCodes: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

const TransactionSchema = new mongoose.Schema({
    walletAddress: String,
    tipo: String, // 'compra', 'canje', 'quemado'
    cantidad: Number,
    txHash: String,
    fecha: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Middleware de autenticación
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Autenticación requerida' });
    }
};

// Rutas

// 1. Registrar usuario
app.post('/api/register', async (req, res) => {
    try {
        const { walletAddress, email } = req.body;
        
        let user = await User.findOne({ walletAddress });
        if (!user) {
            user = new User({ walletAddress, email });
            await user.save();
        }
        
        const token = jwt.sign({ walletAddress }, process.env.JWT_SECRET);
        res.json({ user, token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Comprar domo (genera QR)
app.post('/api/comprar-domo', auth, async (req, res) => {
    try {
        const { walletAddress } = req.user;
        
        // Verificar en blockchain
        const puedeComprar = await contract.sistemaActivo();
        if (!puedeComprar) {
            return res.status(400).json({ error: 'Sistema desactivado' });
        }
        
        // Generar QR único
        const qrId = ethers.utils.id(`${walletAddress}-${Date.now()}`);
        
        // Enviar transacción a Polygon
        const tx = await contract.comprarDomo({
            value: ethers.utils.parseEther('75')
        });
        await tx.wait();
        
        // Actualizar base de datos
        const user = await User.findOne({ walletAddress });
        user.domosComprados += 1;
        user.tokensAcumulados += 1;
        user.qrCodes.push(qrId);
        await user.save();
        
        // Registrar transacción
        await new Transaction({
            walletAddress,
            tipo: 'compra',
            cantidad: 1,
            txHash: tx.hash
        }).save();
        
        res.json({
            success: true,
            qrId,
            txHash: tx.hash,
            message: 'Domo comprado exitosamente'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Canjear NFT (quemar 12 tokens)
app.post('/api/canjear-nft', auth, async (req, res) => {
    try {
        const { walletAddress } = req.user;
        
        // Verificar en blockchain
        const puedeCanjear = await contract.puedeCanjear(walletAddress);
        if (!puedeCanjear) {
            return res.status(400).json({ error: 'No puedes canjear aún' });
        }
        
        // Enviar transacción de canje
        const tx = await contract.canjearNft();
        await tx.wait();
        
        // Actualizar base de datos
        const user = await User.findOne({ walletAddress });
        user.haCanjeado = true;
        user.fechaCanje = new Date();
        user.tokensAcumulados -= 12;
        await user.save();
        
        // Registrar transacción
        await new Transaction({
            walletAddress,
            tipo: 'canje',
            cantidad: 12,
            txHash: tx.hash
        }).save();
        
        res.json({
            success: true,
            txHash: tx.hash,
            message: 'NFT canjeado exitosamente'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Verificar estado del usuario
app.get('/api/estado/:wallet', auth, async (req, res) => {
    try {
        const { wallet } = req.params;
        
        const user = await User.findOne({ walletAddress: wallet });
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const puedeCanjear = await contract.puedeCanjear(wallet);
        
        res.json({
            walletAddress: user.walletAddress,
            domosComprados: user.domosComprados,
            tokensAcumulados: user.tokensAcumulados,
            haCanjeado: user.haCanjeado,
            puedeCanjear,
            qrCodes: user.qrCodes,
            fechaCanje: user.fechaCanje
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Historial de transacciones
app.get('/api/historial/:wallet', auth, async (req, res) => {
    try {
        const { wallet } = req.params;
        const transactions = await Transaction.find({ walletAddress: wallet })
            .sort({ fecha: -1 });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Dashboard admin
app.get('/api/admin/stats', auth, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalDomos = await User.aggregate([
            { $group: { _id: null, total: { $sum: '$domosComprados' } } }
        ]);
        const totalCanjes = await User.countDocuments({ haCanjeado: true });
        
        res.json({
            totalUsers,
            totalDomos: totalDomos[0]?.total || 0,
            totalCanjes,
            fecha: new Date()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3001, () => {
    console.log('Servidor corriendo en puerto 3001');
});