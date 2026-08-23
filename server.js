const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta public/
app.use(express.static('public'));

// ================================================================
// HEALTH CHECK
// ================================================================
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ================================================================
// LIVEKIT TOKEN
// ================================================================
app.get('/api/token', async (req, res) => {
    try {
        const roomName = req.query.room || 'muro-live-general';
        const participantName = req.query.name || `usuario_${Math.floor(Math.random() * 1000)}`;

        if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
            return res.status(500).json({ 
                error: 'LiveKit credentials not configured' 
            });
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
        console.error('❌ Error generando token:', error);
        res.status(500).json({ 
            error: 'No se pudo generar el token de transmisión' 
        });
    }
});

// ================================================================
// RUTAS PRINCIPALES (PÁGINAS HTML)
// ================================================================

// --- Página principal ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Funcionalidades principales ---
app.get('/muro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'muro', 'muro.html'));
});

app.get('/perfil', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'perfil', 'perfil.html'));
});

app.get('/mensajes', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'mensajes', 'mensajes.html'));
});

app.get('/contactos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'mensajes', 'contactos.html'));
});

app.get('/live', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'live', 'live.html'));
});

app.get('/internet', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'internet', 'internet.html'));
});

app.get('/admin-internet', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'internet', 'admin-internet.html'));
});

// --- Herramientas ---
app.get('/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qr-generator.html'));
});

app.get('/actualizar-contrasena', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'actualizar-contrasena.html'));
});

// ================================================================
// RUTAS LEGALES (TÉRMINOS Y CONDICIONES, PRIVACIDAD, COOKIES, ETC.)
// ================================================================

app.get('/terminos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terminos.html'));
});

app.get('/privacidad', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacidad.html'));
});

app.get('/cookies', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cookies.html'));
});

app.get('/live-terminos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'live-terminos.html'));
});

// ================================================================
// RUTAS DE REDIRECCIÓN (COMPATIBILIDAD CON ENLACES EXISTENTES)
// ================================================================

// Redirigir /features/muro/muro.html → /muro
app.get('/features/muro/muro.html', (req, res) => {
    res.redirect(301, '/muro');
});

app.get('/features/perfil/perfil.html', (req, res) => {
    res.redirect(301, '/perfil');
});

app.get('/features/mensajes/mensajes.html', (req, res) => {
    res.redirect(301, '/mensajes');
});

app.get('/features/mensajes/contactos.html', (req, res) => {
    res.redirect(301, '/contactos');
});

app.get('/features/live/live.html', (req, res) => {
    res.redirect(301, '/live');
});

app.get('/features/internet/internet.html', (req, res) => {
    res.redirect(301, '/internet');
});

app.get('/features/internet/admin-internet.html', (req, res) => {
    res.redirect(301, '/admin-internet');
});

app.get('/terminos.html', (req, res) => {
    res.redirect(301, '/terminos');
});

app.get('/privacidad.html', (req, res) => {
    res.redirect(301, '/privacidad');
});

app.get('/cookies.html', (req, res) => {
    res.redirect(301, '/cookies');
});

app.get('/live-terminos.html', (req, res) => {
    res.redirect(301, '/live-terminos');
});

// ================================================================
// MANEJO DE ERRORES 404 (PÁGINA NO ENCONTRADA)
// ================================================================
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ================================================================
// MANEJO DE ERRORES GENERAL
// ================================================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({ 
        error: err.message || 'Error interno del servidor' 
    });
});

// ================================================================
// APAGADO GRACIAL
// ================================================================
process.on('SIGINT', () => {
    console.log('🛑 Servidor detenido por SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Servidor detenido por SIGTERM');
    process.exit(0);
});

// ================================================================
// INICIAR SERVIDOR
// ================================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
    console.log(`📁 Sirviendo archivos desde: /public`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`========================================`);
    console.log(`📌 Rutas principales:`);
    console.log(`   🏠 / → Inicio`);
    console.log(`   📝 /muro → Muro`);
    console.log(`   👤 /perfil → Perfil`);
    console.log(`   💬 /mensajes → Mensajes`);
    console.log(`   👥 /contactos → Contactos`);
    console.log(`   📡 /live → Live`);
    console.log(`   🌐 /internet → Internet`);
    console.log(`   ⚙️ /admin-internet → Admin Internet`);
    console.log(`   📜 /terminos → Términos y Condiciones`);
    console.log(`   🔒 /privacidad → Política de Privacidad`);
    console.log(`   🍪 /cookies → Aviso de Cookies`);
    console.log(`   📡 /live-terminos → Términos de Live`);
    console.log(`========================================`);
});

module.exports = app;