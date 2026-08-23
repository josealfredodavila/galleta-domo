const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');
const path = require('path');

// FIX: Node.js 22 ya tiene WebSocket nativo, pero si aún hay problema, esto lo cubre
globalThis.WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(cors());
app.use(express.json());

// ================================================================
// SERVICIO DE SUPABASE (SEGURIDAD POR REQUEST)
// ================================================================
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Función para crear cliente Supabase con el token del usuario
function clienteDelUsuario(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        return createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
    }
    // Si no hay token, se crea sin auth (para rutas públicas)
    return createClient(supabaseUrl, supabaseAnonKey);
}

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
// RUTAS PARA EL PERFIL (SEGURIDAD CON AUTH.UID)
// ================================================================
app.get('/api/perfil', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        if (data) {
            return res.json({ success: true, perfil: data });
        } else {
            // Si el usuario no tiene perfil, se devuelve uno por defecto
            return res.json({ success: true, perfil: { 
                id: user.id,
                nombre: 'Explorador', 
                handle: 'explorador', 
                bio: 'Explorando el ecosistema Sariel\'s', 
                avatar_url: null,
                tokens_acumulados: 0
            }});
        }
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener perfil' });
    }
});

app.put('/api/perfil', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const { nombre, handle, bio, avatar_url } = req.body;

        const { data, error } = await supabase
            .from('usuarios')
            .upsert({ 
                id: user.id, 
                nombre, 
                handle, 
                bio, 
                avatar_url,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;

        return res.json({ success: true, perfil: data });
    } catch (error) {
        console.error('Error guardando perfil:', error);
        return res.status(500).json({ success: false, error: 'Error al guardar perfil' });
    }
});

// ================================================================
// RUTAS PRINCIPALES
// ================================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

app.get('/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qr-generator.html'));
});

app.get('/actualizar-contrasena', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'actualizar-contrasena.html'));
});

// ================================================================
// RUTAS LEGALES
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
// MANEJO DE ERRORES
// ================================================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({ 
        error: err.message || 'Error interno del servidor' 
    });
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
});

module.exports = app;