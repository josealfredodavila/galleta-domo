/* ================================================================
   CONEXIÓN A MONGODB ATLAS
   ================================================================ */

const mongoose = require('mongoose');

const DB_OPTIONS = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true
};

let isConnected = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimeout = null;

async function connectDB(mongoUri) {
    if (!mongoUri) {
        console.error('❌ MongoDB URI no proporcionada');
        return { success: false, error: 'MongoDB URI no proporcionada' };
    }

    if (isConnected && mongoose.connection.readyState === 1) {
        console.log('✅ MongoDB ya está conectado');
        return { success: true, state: 'connected' };
    }

    try {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        console.log('🔄 Conectando a MongoDB Atlas...');
        
        const connection = await mongoose.connect(mongoUri, DB_OPTIONS);
        isConnected = true;
        connectionAttempts = 0;
        
        console.log(`✅ MongoDB Atlas conectado a: ${connection.connection.name}`);
        
        return { 
            success: true, 
            state: 'connected',
            dbName: connection.connection.name
        };

    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        isConnected = false;
        connectionAttempts++;
        
        if (connectionAttempts <= MAX_RECONNECT_ATTEMPTS) {
            console.log(`🔄 Intento de reconexión ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS} en 3 segundos...`);
            
            reconnectTimeout = setTimeout(() => {
                connectDB(mongoUri);
            }, 3000);
        } else {
            console.error('❌ Número máximo de intentos de reconexión alcanzado');
            console.log('⚠️ La aplicación continuará sin MongoDB.');
        }
        
        return { 
            success: false, 
            error: error.message,
            attempts: connectionAttempts
        };
    }
}

function getConnectionState() {
    const state = mongoose.connection.readyState;
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    return {
        readyState: state,
        state: states[state] || 'unknown',
        isConnected: state === 1,
        dbName: mongoose.connection.name || null
    };
}

async function disconnectDB() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    if (mongoose.connection.readyState === 1) {
        try {
            await mongoose.disconnect();
            isConnected = false;
            console.log('🔌 Conexión a MongoDB cerrada');
            return { success: true };
        } catch (error) {
            console.error('❌ Error al cerrar conexión:', error.message);
            return { success: false, error: error.message };
        }
    }
    return { success: true, message: 'Ya estaba desconectado' };
}

mongoose.connection.on('connected', () => {
    console.log(`✅ MongoDB conectado: ${mongoose.connection.name}`);
    isConnected = true;
    connectionAttempts = 0;
});

mongoose.connection.on('error', (error) => {
    console.error('❌ Error en MongoDB:', error.message);
    isConnected = false;
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB desconectado. Intentando reconectar...');
    isConnected = false;
    
    if (process.env.MONGODB_URI) {
        setTimeout(() => {
            connectDB(process.env.MONGODB_URI);
        }, 2000);
    }
});

module.exports = {
    connectDB,
    disconnectDB,
    getConnectionState,
    isConnected: () => isConnected && mongoose.connection.readyState === 1,
    mongoose
};