const express = require('express');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ================================================================
// NUEVA RUTA DE LIVEKIT PARA EL MURO LIVE
// ================================================================
app.get('/api/token', async (req, res) => {
    try {
        const roomName = req.query.room || 'muro-live-general';
        const participantName = req.query.name || `usuario_${Math.floor(Math.random() * 1000)}`;

        if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
            return res.status(500).json({ error: 'Las credenciales de LiveKit no están configuradas en el servidor.' });
        }

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            { identity: participantName }
        );

        at.addGrant({ 
            roomJoin: true, 
            room: roomName, 
            canPublish: true, 
            canSubscribe: true 
        });

        const token = await at.toJwt();
        res.json({ token });
    } catch (error) {
        console.error('❌ Error generando token de LiveKit:', error);
        res.status(500).json({ error: 'No se pudo generar el token de transmisión' });
    }
});

// ================================================================
// RUTAS PRINCIPALES Y HEALTHCHECK
// ================================================================
app.get('/', (req, res) => {
    res.status(200).json({ status: 'OK', message: "Sariel's API running successfully" });
});

app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Escuchar explícitamente en 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
    console.log(`📦 Base de datos: Supabase (${process.env.SUPABASE_URL || 'Configurada'})`);
});

module.exports = app;