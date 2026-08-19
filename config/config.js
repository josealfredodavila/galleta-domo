require('dotenv').config();

module.exports = {
    // Configuración de Polygon
    polygon: {
        rpcUrl: process.env.POLYGON_RPC || 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
        chainId: 137,
        gasPrice: 50000000000, // 50 Gwei
        gasLimit: 3000000
    },
    
    // Contratos
    contract: {
        address: process.env.CONTRACT_ADDRESS || '0x...', // Actualizar después del deploy
        abi: require('../contracts/abi/GalletaTokenABI.json')
    },
    
    // Seguridad
    jwt: {
        secret: process.env.JWT_SECRET || 'tu_secreto_super_seguro_2026',
        expiresIn: '7d'
    },
    
    // Base de datos
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/galleta-domo'
    },
    
    // Configuración del negocio
    business: {
        precioDomo: 75, // MATIC
        tokensPorDomo: 1,
        tokensParaCanje: 12,
        nombreNegocio: 'Galleta Domo',
        dominio: process.env.DOMINIO || 'http://localhost:3000'
    },
    
    // Seguridad adicional
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutos
        max: 100 // límite de requests por IP
    }
};