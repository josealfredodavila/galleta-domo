// ================================================================
// RUTAS PRINCIPALES Y HEALTHCHECK (CORREGIDAS)
// ================================================================

// Ruta de salud directa para el Healthcheck de Railway
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
    console.log(`📦 Base de datos: Supabase (${process.env.SUPABASE_URL})`);
});

module.exports = app;
