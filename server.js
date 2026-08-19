// server.js - VERSIÓN DE PRUEBA (sin MongoDB)
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// Health check (para Railway)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'Servidor funcionando correctamente'
    });
});

// Ruta principal
app.get('/', (req, res) => {
    res.send('🚀 Servidor de Sariel\'s funcionando correctamente');
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});