module.exports = {
    polygon: {
        rpcUrl: 'https://polygon-mainnet.infura.io/v3/YOUR_INFURA_KEY',
        chainId: 137,
        contractAddress: '0x...' // Desplegar después
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'tu_secreto_super_seguro'
    },
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/galleta-domo'
    }
};