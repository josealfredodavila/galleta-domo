const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');
const path = require('path');

// FIX: WebSocket para Node.js
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

function clienteDelUsuario(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        return createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
    }
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
            return res.status(500).json({ error: 'LiveKit credentials not configured' });
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
        res.status(500).json({ error: 'No se pudo generar el token de transmisión' });
    }
});

// ================================================================
// RUTAS PARA EL PERFIL (SEGURIDAD CON AUTH.UID)
// ================================================================
app.get('/api/perfil', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        if (data) {
            return res.json({ success: true, perfil: data });
        } else {
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
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

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
// RUTAS PARA EL MURO (SEGURIDAD CON AUTH.UID)
// ================================================================
app.get('/api/muro/posts', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('muro_posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, posts: data });
    } catch (error) {
        console.error('Error cargando muro:', error);
        return res.status(500).json({ success: false, error: 'Error al cargar muro' });
    }
});

app.post('/api/muro/posts', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { contenido } = req.body;
        const { data, error } = await supabase
            .from('muro_posts')
            .insert({ user_id: user.id, contenido });

        if (error) throw error;
        return res.json({ success: true, post: data });
    } catch (error) {
        console.error('Error creando post:', error);
        return res.status(500).json({ success: false, error: 'Error al crear post' });
    }
});

app.post('/api/muro/posts/:id/like', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const postId = req.params.id;
        const { error } = await supabase
            .from('muro_likes')
            .insert({ post_id: postId, user_id: user.id });

        if (error) throw error;
        return res.json({ success: true });
    } catch (error) {
        console.error('Error dando like:', error);
        return res.status(500).json({ success: false, error: 'Error al dar like' });
    }
});

// ================================================================
// RUTAS PARA MENSAJES (SEGURIDAD CON AUTH.UID)
// ================================================================
app.get('/api/mensajes/contactos', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { data, error } = await supabase
            .from('contactos')
            .select('*')
            .eq('user_id', user.id);

        if (error) throw error;
        return res.json({ success: true, contactos: data });
    } catch (error) {
        console.error('Error cargando contactos:', error);
        return res.status(500).json({ success: false, error: 'Error al cargar contactos' });
    }
});

app.get('/api/mensajes/:contactoId', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const contactoId = req.params.contactoId;
        const { data, error } = await supabase
            .from('mensajes_chat')
            .select('*')
            .or(`and(user_id.eq.${user.id},contacto_id.eq.${contactoId}),and(user_id.eq.${contactoId},contacto_id.eq.${user.id})`)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return res.json({ success: true, mensajes: data });
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        return res.status(500).json({ success: false, error: 'Error al cargar mensajes' });
    }
});

app.post('/api/mensajes/:contactoId', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const contactoId = req.params.contactoId;
        const { contenido } = req.body;
        const { data, error } = await supabase
            .from('mensajes_chat')
            .insert({ user_id: user.id, contacto_id: contactoId, contenido });

        if (error) throw error;
        return res.json({ success: true, mensaje: data });
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        return res.status(500).json({ success: false, error: 'Error al enviar mensaje' });
    }
});

// ================================================================
// RUTAS PARA LIVE (SEGURIDAD CON AUTH.UID)
// ================================================================
app.get('/api/live/streams', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('live_streams')
            .select('*')
            .eq('is_live', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, streams: data });
    } catch (error) {
        console.error('Error cargando streams:', error);
        return res.status(500).json({ success: false, error: 'Error al cargar streams' });
    }
});

app.post('/api/live/streams', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { titulo } = req.body;
        const { data, error } = await supabase
            .from('live_streams')
            .insert({ user_id: user.id, titulo, is_live: true });

        if (error) throw error;
        return res.json({ success: true, stream: data });
    } catch (error) {
        console.error('Error creando stream:', error);
        return res.status(500).json({ success: false, error: 'Error al crear stream' });
    }
});

// ================================================================
// RUTAS PARA eSIM / INTERNET (SEGURIDAD CON AUTH.UID)
// ================================================================
app.get('/api/esim/planes', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('planes_esim')
            .select('*');

        if (error) throw error;
        return res.json({ success: true, planes: data });
    } catch (error) {
        console.error('Error cargando planes:', error);
        return res.status(500).json({ success: false, error: 'Error al cargar planes' });
    }
});

app.get('/api/esim/suscripcion', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { data, error } = await supabase
            .from('suscripciones_esim')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error) throw error;
        return res.json({ success: true, suscripcion: data });
    } catch (error) {
        console.error('Error cargando suscripción:', error);
        return res.status(500).json({ success: false, error: 'Error al cargar suscripción' });
    }
});

// ================================================================
// RUTAS PRINCIPALES (HTML)
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