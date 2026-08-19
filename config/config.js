// config/config.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Cargar ABI solo si existe
let contractABI = [];
try {
    const abiPath = path.join(__dirname, '../contracts/abi/GalletaTokenABI.json');
    if (fs.existsSync(abiPath)) {
        contractABI = require(abiPath);
    } else {
        console.warn('⚠️ Archivo ABI no encontrado. El contrato no estará disponible.');
    }
} catch (error) {
    console.warn('⚠️ Error cargando ABI:', error.message);
}

module.exports = {
    // ========================================
    // SERVIDOR
    // ========================================
    server: {
        port: process.env.PORT || 3001,
        env: process.env.NODE_ENV || 'development',
        dominio: process.env.DOMINIO || 'http://localhost:3001'
    },

    // ========================================
    // MONGODB
    // ========================================
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/galleta-domo',
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10
        }
    },

    // ========================================
    // SUPABASE
    // ========================================
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        bucket: process.env.SUPABASE_BUCKET || 'sariels-media'
    },

    // ========================================
    // POLYGON / BLOCKCHAIN
    // ========================================
    polygon: {
        rpcUrl: process.env.POLYGON_RPC || 'https://polygon-mainnet.g.alchemy.com/v2/demo',
        chainId: 137,
        gasPrice: 50000000000,
        gasLimit: 3000000
    },

    // ========================================
    // CONTRATO (AHORA OPCIONAL)
    // ========================================
    contract: {
        address: process.env.CONTRACT_ADDRESS || '0x...',
        abi: contractABI  // ← Ya no falla si no existe
    },

    // ========================================
    // JWT
    // ========================================
    jwt: {
        secret: process.env.JWT_SECRET || 'tu_secreto_super_seguro',
        expiresIn: '7d',
        refreshExpiresIn: '30d'
    },

    // ========================================
    // NOWPAYMENTS
    // ========================================
    nowpayments: {
        apiKey: process.env.NOWPAYMENTS_API_KEY,
        apiUrl: 'https://api.nowpayments.io/v1',
        webhookSecret: process.env.NOWPAYMENTS_WEBHOOK_SECRET,
        ipnUrl: process.env.NOWPAYMENTS_IPN_URL || '/api/payments/webhook'
    },

    // ========================================
    // LIVEKIT
    // ========================================
    livekit: {
        apiKey: process.env.LIVEKIT_API_KEY,
        apiSecret: process.env.LIVEKIT_API_SECRET,
        wsUrl: process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
        httpUrl: process.env.LIVEKIT_HTTP_URL || 'http://localhost:7880'
    },

    // ========================================
    // CLOUDFLARE
    // ========================================
    cloudflare: {
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
        zoneId: process.env.CLOUDFLARE_ZONE_ID,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID
    },

    // ========================================
    // NEGOCIO
    // ========================================
    business: {
        nombre: 'Sariel\'s',
        eslogan: 'Sabor al Paladar · WEB3',
        precioDomo: 75,
        tokensPorDomo: 1,
        tokensParaCanje: 12,
        comisionP2P: 0.01,
        dominio: process.env.DOMINIO || 'https://galleta-domo.vercel.app',
        email: process.env.BUSINESS_EMAIL || 'csarielscontacto@gmail.com'
    },

    // ========================================
    // SEGURIDAD
    // ========================================
    security: {
        rateLimit: {
            windowMs: 15 * 60 * 1000,
            max: 100
        },
        uploadLimit: 20 * 1024 * 1024,
        cors: {
            origin: '*',
            credentials: true
        }
    },

    // ========================================
    // MOTOR DE CAPTURA
    // ========================================
    capture: {
        maxFiles: 5,
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf'],
        quality: 80,
        resize: {
            maxWidth: 1920,
            maxHeight: 1080
        }
    },

    // ========================================
    // MURO LIVE
    // ========================================
    muroLive: {
        cobroPorAlgoritmo: {
            activo: true,
            costePorEspectador: 0.05,
            costePorMinuto: 0.02,
            umbralVisualizaciones: 100,
            comision: 0.01
        },
        maxDuration: 3600,
        maxSpectators: 1000
    },

    // ========================================
    // ALMACENAMIENTO
    // ========================================
    storage: {
        provider: process.env.STORAGE_PROVIDER || 'supabase',
        localPath: './public/uploads'
    }
};