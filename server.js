// server.js - SOLO API PARA RAILWAY
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// Solo rutas API
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Ruta de prueba
app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend de Sariel\'s funcionando' });
});

// NO SIRVAS ARCHIVOS ESTÁTICOS AQUÍ
// app.use(express.static('public')); ← ELIMINA ESTO

app.listen(PORT, () => {
    console.log(`✅ API corriendo en puerto ${PORT}`);
});