/* ================================================================
   SERVIDOR PRINCIPAL - SARIEL'S BACKEND
   RUTA RAILWAY: https://galleta-domo.up.railway.app
   ================================================================ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { limitadorGeneral } = require('./middleware/rateLimit');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// ================================================================
// MIDDLEWARES
// ================================================================

// Seguridad
app.use(helmet({
    contentSecurityPolicy: false
}));

// Compresión
app.use(compression());

// CORS
app.use(cors({
    origin: process.env.DOMINIO_FRONTEND || '*',
    credentials: true
}));

// Logs
app.use(morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));

// Rate limiting
app.use(limitadorGeneral);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ================================================================
// RUTAS
// ================================================================

// Ruta de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        railway: 'https://galleta-domo.up.railway.app'
    });
});

// Rutas de autenticación
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Rutas de pagos
const paymentRoutes = require('./routes/payments');
app.use('/api/payments', paymentRoutes);

// Rutas de LiveKit
const livekitRoutes = require('./routes/livekit');
app.use('/api/livekit', livekitRoutes);

// Webhooks
const webhookRoutes = require('./routes/webhooks');
app.use('/api/webhooks', webhookRoutes);

// ================================================================
// MANEJO DE ERRORES
// ================================================================

app.use((err, req, res, next) => {
    logger.error(`Error no manejado: ${err.message}`);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
});

// ================================================================
// INICIAR SERVIDOR
// ================================================================

app.listen(PORT, () => {
    logger.info(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    logger.info(`🌐 Ambiente: ${process.env.NODE_ENV}`);
    logger.info(`📡 Supabase URL: ${process.env.SUPABASE_URL}`);
    logger.info(`🚂 Railway: https://galleta-domo.up.railway.app`);
});