/* ================================================================
   SERVER.JS - SARIEL'S ECOSYSTEM
   VERSIÓN FINAL - CON RUTAS DE FEATURES Y AUTENTICACIÓN
   ================================================================ */

const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

/* ================================================================
   CONFIGURACIÓN
   ================================================================ */

const app = express();
const PORT = Number(process.env.PORT) || 8080;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) console.error('❌ Falta SUPABASE_URL');
if (!SUPABASE_ANON_KEY) console.error('❌ Falta SUPABASE_ANON_KEY');
if (!SUPABASE_SERVICE_ROLE_KEY) console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY');

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : null;

/* ================================================================
   CLIENTE SUPABASE DEL USUARIO
   ================================================================ */

function clienteDelUsuario(req) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase no configurado');
    }
    const authorization = req.headers.authorization || '';
    if (authorization.startsWith('Bearer ')) {
        const token = authorization.slice(7).trim();
        if (token) {
            return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: { autoRefreshToken: false, persistSession: false },
                global: { headers: { Authorization: `Bearer ${token}` } }
            });
        }
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

/* ================================================================
   AUTENTICACIÓN
   ================================================================ */

async function obtenerUsuario(req) {
    const supabase = clienteDelUsuario(req);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
}

async function verificarAutenticacion(req, res, next) {
    try {
        const user = await obtenerUsuario(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }
        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Error de autenticación:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   ADMINISTRADOR
   ================================================================ */

async function verificarAdmin(req, res, next) {
    try {
        const user = await obtenerUsuario(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .maybeSingle();

        if (roleError || !roleData) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Error verificando admin:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

/* ================================================================
   MIDDLEWARES DE SEGURIDAD
   ================================================================ */

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

const isProduction = process.env.NODE_ENV === 'production';
const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (!isProduction) return callback(null, true);
        if (corsOrigins.length === 0) {
            console.warn('⚠️ CORS_ORIGINS no configurado en producción');
            return callback(new Error('Origen no permitido por CORS'));
        }
        if (corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true
}));

app.use(morgan('combined'));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas peticiones' }
});

// ✅ CORREGIDO: ahora usa /webhook/ en lugar de /webhooks/
app.use('/api/', (req, res, next) => {
    if (req.path.startsWith('/webhook/')) return next();
    return apiLimiter(req, res, next);
});

const webhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados webhooks' }
});

app.use(express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
        req.rawBody = Buffer.from(buf);
    }
}));

app.use(express.urlencoded({
    extended: true,
    limit: '2mb',
    verify: (req, res, buf) => {
        if (!req.rawBody) req.rawBody = Buffer.from(buf);
    }
}));

/* ================================================================
   ARCHIVOS ESTÁTICOS
   ================================================================ */

const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
    console.log('✅ Sirviendo archivos estáticos desde:', publicPath);
} else {
    console.warn('⚠️ No se encontró la carpeta public/:', publicPath);
}

/* ================================================================
   RUTAS DE FEATURES - REDIRECCIÓN LIMPIA
   ================================================================ */
app.use('/live', express.static(path.join(__dirname, 'public', 'features', 'live')));
app.use('/videos', express.static(path.join(__dirname, 'public', 'features', 'videos')));
app.use('/muro', express.static(path.join(__dirname, 'public', 'features', 'muro')));
app.use('/perfil', express.static(path.join(__dirname, 'public', 'features', 'perfil')));
app.use('/mensajes', express.static(path.join(__dirname, 'public', 'features', 'mensajes')));
app.use('/internet', express.static(path.join(__dirname, 'public', 'features', 'internet')));

/* ================================================================
   RUTAS DE AUTENTICACIÓN - MONTAJE
   ================================================================ */
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

/* ================================================================
   ✅ RUTAS DE PAGOS Y WEBHOOK - NUEVAS
   ================================================================ */
const paymentsRoutes = require('./routes/payments');
const webhooksRoutes = require('./routes/webhooks');

app.use('/api/payments', paymentsRoutes);
app.use('/api/webhook', webhooksRoutes);

/* ================================================================
   RUTAS HTML - COMPLETAS (TODAS LAS RUTAS)
   ================================================================ */

// ===== RUTA PRINCIPAL =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== FEATURES - RUTAS DIRECTAS CON EXTENSIÓN =====
app.get('/features/muro/muro.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'muro', 'muro.html'));
});

app.get('/features/perfil/perfil.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'perfil', 'perfil.html'));
});

app.get('/features/mensajes/mensajes.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'mensajes', 'mensajes.html'));
});

app.get('/features/mensajes/contactos.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'mensajes', 'contactos.html'));
});

app.get('/features/live/live.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'live', 'live.html'));
});

app.get('/features/internet/internet.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'internet', 'internet.html'));
});

app.get('/features/videos/videos.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'videos', 'videos.html'));
});

// ===== RUTAS AMIGABLES (SIN EXTENSIÓN) =====
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

app.get('/videos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'videos', 'videos.html'));
});

// ===== OTRAS RUTAS =====
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qr-generator.html'));
});

app.get('/actualizar-contrasena', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'actualizar-contrasena.html'));
});

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

/* ================================================================
   SPA FALLBACK - PARA RUTAS NO ENCONTRADAS
   ================================================================ */

app.get('*', (req, res, next) => {
    // Excluir rutas de API y webhooks
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhook/')) {
        return next();
    }
    // Verificar si la ruta corresponde a un archivo con extensión
    if (path.extname(req.path) !== '') {
        return next();
    }
    // Servir index.html para rutas SPA
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        next();
    }
});

/* ================================================================
   HEALTH CHECK
   ================================================================ */

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ================================================================
// RUTAS API - LIVEKIT
// ================================================================

app.get('/api/token', verificarAutenticacion, async (req, res) => {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Supabase Admin no configurado' });
        }
        if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
            return res.status(500).json({ success: false, error: 'LiveKit no configurado' });
        }

        const roomName = String(req.query.room || '').trim();
        if (!roomName || roomName.length > 200) {
            return res.status(400).json({ success: false, error: 'Sala inválida' });
        }

        const { data: stream, error: streamError } = await supabaseAdmin
            .from('transmisiones')
            .select('streamer_id, estado')
            .eq('room_name', roomName)
            .eq('estado', 'activa')
            .maybeSingle();

        if (streamError) {
            console.error('Error consultando transmisión:', streamError);
            return res.status(500).json({ success: false, error: 'Error verificando transmisión' });
        }

        if (!stream) {
            return res.status(404).json({ success: false, error: 'Transmisión no encontrada o inactiva' });
        }

        const esStreamer = stream.streamer_id === req.user.id;

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            { identity: req.user.id }
        );

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: esStreamer,
            canSubscribe: true,
            canPublishData: false
        });

        const token = await at.toJwt();
        return res.json({ success: true, token, streamer: esStreamer, room: roomName });

    } catch (error) {
        console.error('❌ Error generando token LiveKit:', error);
        return res.status(500).json({ success: false, error: 'No se pudo generar el token' });
    }
});

// ================================================================
// RUTAS API - TOKENS
// ================================================================

app.get('/api/tokens', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('usuarios')
            .select('tokens, tokens_acumulados')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;
        return res.json({
            success: true,
            tokens: Number(data?.tokens || 0),
            tokens_acumulados: Number(data?.tokens_acumulados || 0)
        });

    } catch (error) {
        console.error('❌ Error obteniendo tokens:', error);
        return res.status(500).json({ success: false, error: 'No se pudieron obtener los tokens' });
    }
});

app.post('/api/tokens/transferir', verificarAutenticacion, async (req, res) => {
    try {
        const { destinoId, cantidad } = req.body;

        if (!destinoId) {
            return res.status(400).json({ success: false, error: 'Falta destinoId' });
        }

        const cantidadNumerica = Number(cantidad);
        if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
            return res.status(400).json({ success: false, error: 'La cantidad debe ser mayor a 0' });
        }
        if (cantidadNumerica > 1000000000) {
            return res.status(400).json({ success: false, error: 'Cantidad inválida' });
        }
        if (String(destinoId) === String(req.user.id)) {
            return res.status(400).json({ success: false, error: 'No puedes transferirte a ti mismo' });
        }

        const idempotencyKey = `transfer_${req.user.id}_${destinoId}_${Date.now()}`;

        const { data, error } = await supabaseAdmin.rpc('transferir_tokens', {
            p_destino_id: destinoId,
            p_cantidad: cantidadNumerica,
            p_idempotency_key: idempotencyKey
        });

        if (error) {
            console.error('Error RPC transferir_tokens:', error);
            return res.status(500).json({ success: false, error: 'No se pudo completar la transferencia' });
        }

        return res.json({
            success: true,
            message: `${cantidadNumerica} Es.toks transferidos`,
            data
        });

    } catch (error) {
        console.error('❌ Error transfiriendo tokens:', error);
        return res.status(500).json({ success: false, error: 'Error al transferir tokens' });
    }
});

// ================================================================
// RUTAS API - PERFIL
// ================================================================

app.get('/api/perfil', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.rpc('obtener_mi_perfil');

        if (error) throw error;

        const perfil = data && data.length > 0 ? data[0] : null;

        if (perfil) {
            return res.json({ success: true, perfil });
        }

        return res.json({
            success: true,
            perfil: {
                id: req.user.id,
                nombre: 'Explorador',
                handle: 'explorador',
                bio: "Explorando el ecosistema Sariel's",
                avatar_url: null,
                tokens: 0,
                wallet_address: null
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo perfil:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener perfil' });
    }
});

app.put('/api/perfil', verificarAutenticacion, async (req, res) => {
    try {
        const { nombre, handle, bio, avatar_url } = req.body;
        const updates = {};

        if (nombre !== undefined) {
            const nombreLimpio = String(nombre).trim();
            if (!nombreLimpio) {
                return res.status(400).json({ success: false, error: 'El nombre no puede estar vacío' });
            }
            updates.nombre = nombreLimpio.slice(0, 100);
        }

        if (handle !== undefined) {
            const handleLimpio = String(handle).trim().toLowerCase();
            if (!handleLimpio) {
                return res.status(400).json({ success: false, error: 'El handle no puede estar vacío' });
            }
            if (!/^[a-z0-9_]+$/.test(handleLimpio)) {
                return res.status(400).json({
                    success: false,
                    error: 'El handle solo puede contener letras minúsculas, números y guión bajo'
                });
            }
            updates.handle = handleLimpio.slice(0, 50);
        }

        if (bio !== undefined) {
            updates.bio = String(bio).trim().slice(0, 1000);
        }

        if (avatar_url !== undefined) {
            updates.avatar_url = avatar_url ? String(avatar_url).trim().slice(0, 2000) : null;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No se proporcionaron campos' });
        }

        const { data, error } = await supabaseAdmin
            .from('usuarios')
            .update(updates)
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) throw error;

        return res.json({ success: true, perfil: data });

    } catch (error) {
        console.error('❌ Error guardando perfil:', error);
        return res.status(500).json({ success: false, error: 'Error al guardar perfil' });
    }
});

// ================================================================
// RUTAS API - ESTADO ONLINE
// ================================================================

app.post('/api/estado/online', verificarAutenticacion, async (req, res) => {
    try {
        const { online } = req.body;

        const { error } = await supabaseAdmin
            .from('usuarios')
            .update({
                online: online,
                ultima_conexion: new Date().toISOString(),
                ...(online ? {} : { offline_desde: new Date().toISOString() })
            })
            .eq('id', req.user.id);

        if (error) throw error;

        return res.json({ success: true, online });

    } catch (error) {
        console.error('❌ Error actualizando estado:', error);
        return res.status(500).json({ success: false, error: 'Error actualizando estado' });
    }
});

// ================================================================
// RUTAS API - MURO
// ================================================================

app.get('/api/muro', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        let page = parseInt(req.query.page, 10) || 1;
        let limit = parseInt(req.query.limit, 10) || 20;
        page = Math.max(1, page);
        limit = Math.min(100, Math.max(1, limit));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error } = await supabase
            .from('muro_posts')
            .select(`
                id, contenido, imagen_url, created_at, cantidad_venta, precio_venta,
                usuarios (id, nombre, handle, avatar_url),
                muro_likes (count),
                muro_comentarios (count)
            `)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;
        return res.json({ success: true, page, limit, posts: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo muro:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo publicaciones' });
    }
});

app.post('/api/muro', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const contenido = req.body.contenido !== undefined ? String(req.body.contenido).trim() : '';
        const imagenUrl = req.body.imagenUrl !== undefined ? String(req.body.imagenUrl).trim() : '';

        if (!contenido && !imagenUrl) {
            return res.status(400).json({ success: false, error: 'La publicación necesita texto o imagen' });
        }
        if (contenido.length > 5000) {
            return res.status(400).json({ success: false, error: 'El texto es demasiado largo' });
        }
        if (imagenUrl.length > 2000) {
            return res.status(400).json({ success: false, error: 'La URL de imagen es demasiado larga' });
        }

        const { data, error } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: req.user.id,
                contenido: contenido || null,
                imagen_url: imagenUrl || null
            })
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, post: data });

    } catch (error) {
        console.error('❌ Error creando publicación:', error);
        return res.status(500).json({ success: false, error: 'Error creando publicación' });
    }
});

app.delete('/api/muro/:postId', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { error } = await supabase
            .from('muro_posts')
            .delete()
            .eq('id', req.params.postId)
            .eq('usuario_id', req.user.id);

        if (error) throw error;
        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Error eliminando publicación:', error);
        return res.status(500).json({ success: false, error: 'Error eliminando publicación' });
    }
});

app.post('/api/muro/:postId/like', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { error } = await supabase
            .from('muro_likes')
            .insert({
                post_id: req.params.postId,
                usuario_id: req.user.id
            });

        if (error) {
            if (error.code === '23505') {
                return res.json({ success: true, message: 'Ya habías dado like' });
            }
            throw error;
        }
        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Error dando like:', error);
        return res.status(500).json({ success: false, error: 'Error dando like' });
    }
});

app.delete('/api/muro/:postId/like', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { error } = await supabase
            .from('muro_likes')
            .delete()
            .eq('post_id', req.params.postId)
            .eq('usuario_id', req.user.id);

        if (error) throw error;
        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Error quitando like:', error);
        return res.status(500).json({ success: false, error: 'Error quitando like' });
    }
});

app.get('/api/muro/:postId/comentarios', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('muro_comentarios')
            .select(`
                id, contenido, created_at,
                usuarios (id, nombre, handle, avatar_url)
            `)
            .eq('post_id', req.params.postId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return res.json({ success: true, comentarios: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo comentarios:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo comentarios' });
    }
});

app.post('/api/muro/:postId/comentarios', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const contenido = String(req.body.contenido || '').trim();
        if (!contenido) {
            return res.status(400).json({ success: false, error: 'Falta el contenido' });
        }
        if (contenido.length > 2000) {
            return res.status(400).json({ success: false, error: 'El comentario es demasiado largo' });
        }

        const { data, error } = await supabase
            .from('muro_comentarios')
            .insert({
                post_id: req.params.postId,
                usuario_id: req.user.id,
                contenido
            })
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, comentario: data });

    } catch (error) {
        console.error('❌ Error creando comentario:', error);
        return res.status(500).json({ success: false, error: 'Error creando comentario' });
    }
});

// ================================================================
// RUTAS API - LIVE
// ================================================================

app.get('/api/live/activos', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('transmisiones')
            .select(`
                id, room_name, titulo, viewers_count, fecha_inicio, streamer_id,
                usuarios!transmisiones_streamer_id_fkey (id, nombre, handle, avatar_url)
            `)
            .eq('estado', 'activa')
            .order('fecha_inicio', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, streams: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo lives:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo transmisiones' });
    }
});

app.post('/api/live/iniciar', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const titulo = String(req.body.titulo || "Live en Sariel's").trim().slice(0, 200);
        const categoria = String(req.body.categoria || 'Charla').trim().slice(0, 100);

        const { data: liveActivo, error: activoError } = await supabase
            .from('transmisiones')
            .select('id')
            .eq('streamer_id', req.user.id)
            .eq('estado', 'activa')
            .maybeSingle();

        if (activoError) throw activoError;
        if (liveActivo) {
            return res.status(409).json({
                success: false,
                error: 'Ya tienes una transmisión activa',
                streamId: liveActivo.id
            });
        }

        const roomName = `live-${req.user.id}-${Date.now()}`;

        const { data, error } = await supabase
            .from('transmisiones')
            .insert({
                streamer_id: req.user.id,
                room_name: roomName,
                titulo,
                categoria,
                estado: 'activa',
                fecha_inicio: new Date().toISOString(),
                viewers_count: 0
            })
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, stream: data });

    } catch (error) {
        console.error('❌ Error iniciando live:', error);
        return res.status(500).json({ success: false, error: 'Error iniciando transmisión' });
    }
});

app.post('/api/live/:streamId/finalizar', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('transmisiones')
            .update({
                estado: 'finalizada',
                fecha_fin: new Date().toISOString()
            })
            .eq('id', req.params.streamId)
            .eq('streamer_id', req.user.id)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ success: false, error: 'Transmisión no encontrada' });
        }
        return res.json({ success: true, stream: data });

    } catch (error) {
        console.error('❌ Error finalizando live:', error);
        return res.status(500).json({ success: false, error: 'Error finalizando transmisión' });
    }
});

// ================================================================
// RUTAS API - QR DOMO
// ================================================================

app.post('/api/qr/reclamar', verificarAutenticacion, async (req, res) => {
    try {
        const { codigo } = req.body;
        if (!codigo) {
            return res.status(400).json({ success: false, error: 'Se requiere código QR' });
        }

        const { data, error } = await supabaseAdmin.rpc('reclamar_qr_domo', {
            p_codigo: codigo
        });

        if (error) {
            console.error('Error RPC reclamar_qr_domo:', error);
            return res.status(500).json({ success: false, error: 'Error reclamando QR' });
        }

        if (!data.success) {
            return res.status(400).json({ success: false, error: data.error });
        }

        return res.json({
            success: true,
            message: 'QR reclamado exitosamente',
            data
        });

    } catch (error) {
        console.error('❌ Error reclamando QR:', error);
        return res.status(500).json({ success: false, error: 'Error reclamando QR' });
    }
});

// ================================================================
// RUTAS API - ESIM
// ================================================================

app.get('/api/esim/planes', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('planes_esim')
            .select('*')
            .eq('activo', true)
            .order('precio_mxn', { ascending: true });

        if (error) throw error;
        return res.json({ success: true, planes: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo planes:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo planes' });
    }
});

app.post('/api/esim/orden', verificarAutenticacion, async (req, res) => {
    try {
        const { planId, idempotency_key } = req.body;

        if (!planId) {
            return res.status(400).json({ success: false, error: 'Se requiere planId' });
        }

        const key = idempotency_key || `esim_${req.user.id}_${planId}_${Date.now()}`;

        const { data, error } = await supabaseAdmin.rpc('crear_orden_esim', {
            p_usuario_id: req.user.id,
            p_plan_id: parseInt(planId),
            p_idempotency_key: key
        });

        if (error) throw error;
        if (!data.success) {
            return res.status(400).json({ success: false, error: data.error });
        }

        return res.json({
            success: true,
            orden: data.orden,
            mensaje: data.mensaje
        });

    } catch (error) {
        console.error('❌ Error creando orden eSIM:', error);
        return res.status(500).json({ success: false, error: 'Error creando orden' });
    }
});

app.get('/api/esim/mis-suscripciones', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
            .from('ordenes_esim')
            .select(`
                *,
                planes_esim (nombre, datos_gb, duracion_dias)
            `)
            .eq('usuario_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, suscripciones: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo suscripciones eSIM:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo suscripciones' });
    }
});

// ================================================================
// RUTAS API - CONTACTOS
// ================================================================

app.get('/api/contactos', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.rpc('obtener_contactos_con_estado', {
            p_usuario_id: req.user.id
        });

        if (error) throw error;
        return res.json({ success: true, contactos: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo contactos:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo contactos' });
    }
});

app.post('/api/contactos', verificarAutenticacion, async (req, res) => {
    try {
        const { contactoId } = req.body;

        if (!contactoId) {
            return res.status(400).json({ success: false, error: 'Falta contactoId' });
        }
        if (String(contactoId) === String(req.user.id)) {
            return res.status(400).json({ success: false, error: 'No puedes agregarte a ti mismo' });
        }

        const { data, error } = await supabaseAdmin
            .from('contactos')
            .insert({
                usuario_id: req.user.id,
                contacto_id: contactoId,
                estado: 'pendiente'
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.json({ success: true, message: 'La solicitud ya existe' });
            }
            throw error;
        }

        return res.json({ success: true, contacto: data });

    } catch (error) {
        console.error('❌ Error agregando contacto:', error);
        return res.status(500).json({ success: false, error: 'Error agregando contacto' });
    }
});

app.put('/api/contactos/:contactoId/aceptar', verificarAutenticacion, async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('contactos')
            .update({ estado: 'aceptado' })
            .eq('contacto_id', req.user.id)
            .eq('usuario_id', req.params.contactoId)
            .eq('estado', 'pendiente');

        if (error) throw error;
        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Error aceptando contacto:', error);
        return res.status(500).json({ success: false, error: 'Error aceptando contacto' });
    }
});

app.delete('/api/contactos/:contactoId', verificarAutenticacion, async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('contactos')
            .delete()
            .eq('usuario_id', req.user.id)
            .eq('contacto_id', req.params.contactoId);

        if (error) throw error;
        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Error eliminando contacto:', error);
        return res.status(500).json({ success: false, error: 'Error eliminando contacto' });
    }
});

// ================================================================
// RUTAS API - MENSAJES
// ================================================================

app.get('/api/mensajes/:contactoId', verificarAutenticacion, async (req, res) => {
    try {
        const contactoId = req.params.contactoId;

        const { data, error } = await supabaseAdmin
            .from('mensajes_chat')
            .select('*')
            .or(`and(remitente_id.eq.${req.user.id},destinatario_id.eq.${contactoId}),and(remitente_id.eq.${contactoId},destinatario_id.eq.${req.user.id})`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return res.json({ success: true, mensajes: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo mensajes:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo mensajes' });
    }
});

app.post('/api/mensajes', verificarAutenticacion, async (req, res) => {
    try {
        const { destinatarioId, contenido } = req.body;

        if (!destinatarioId || !contenido) {
            return res.status(400).json({ success: false, error: 'Faltan campos' });
        }
        if (String(destinatarioId) === String(req.user.id)) {
            return res.status(400).json({ success: false, error: 'No puedes enviarte un mensaje a ti mismo' });
        }
        if (contenido.length > 5000) {
            return res.status(400).json({ success: false, error: 'El mensaje es demasiado largo' });
        }

        const { data, error } = await supabaseAdmin
            .from('mensajes_chat')
            .insert({
                remitente_id: req.user.id,
                destinatario_id: destinatarioId,
                contenido
            })
            .select()
            .single();

        if (error) throw error;

        return res.json({ success: true, mensaje: data });

    } catch (error) {
        console.error('❌ Error enviando mensaje:', error);
        return res.status(500).json({ success: false, error: 'Error enviando mensaje' });
    }
});

app.put('/api/mensajes/:mensajeId/leido', verificarAutenticacion, async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('mensajes_chat')
            .update({ leido: true })
            .eq('id', req.params.mensajeId)
            .eq('destinatario_id', req.user.id);

        if (error) throw error;
        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Error marcando mensaje:', error);
        return res.status(500).json({ success: false, error: 'Error marcando mensaje' });
    }
});

// ================================================================
// RUTAS API - ADMIN
// ================================================================

app.get('/api/admin/planes', verificarAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('planes_esim')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        return res.json({ success: true, planes: data || [] });

    } catch (error) {
        console.error('❌ Error obteniendo planes admin:', error);
        return res.status(500).json({ success: false, error: 'Error obteniendo planes' });
    }
});

app.post('/api/admin/planes', verificarAdmin, async (req, res) => {
    try {
        const { nombre, datos_gb, duracion_dias, precio_mxn, precio_usdt, activo } = req.body;
        const nombreLimpio = String(nombre || '').trim();
        const datos = Number(datos_gb);
        const duracion = Number(duracion_dias);
        const mxn = Number(precio_mxn);
        const usdt = Number(precio_usdt);

        if (!nombreLimpio) return res.status(400).json({ success: false, error: 'Nombre es requerido' });
        if (!Number.isFinite(datos) || datos <= 0) return res.status(400).json({ success: false, error: 'Datos en GB debe ser mayor a 0' });
        if (!Number.isFinite(duracion) || duracion <= 0) return res.status(400).json({ success: false, error: 'Duración debe ser mayor a 0' });
        if (!Number.isFinite(mxn) || mxn < 0) return res.status(400).json({ success: false, error: 'Precio MXN inválido' });
        if (!Number.isFinite(usdt) || usdt < 0) return res.status(400).json({ success: false, error: 'Precio USDT inválido' });

        const { data, error } = await supabaseAdmin
            .from('planes_esim')
            .insert({
                nombre: nombreLimpio.slice(0, 150),
                datos_gb: Math.round(datos),
                duracion_dias: Math.round(duracion),
                precio_mxn: mxn,
                precio_usdt: usdt,
                activo: activo !== undefined ? Boolean(activo) : true
            })
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, plan: data });

    } catch (error) {
        console.error('❌ Error creando plan:', error);
        return res.status(500).json({ success: false, error: 'Error creando plan' });
    }
});

app.put('/api/admin/planes/:id', verificarAdmin, async (req, res) => {
    try {
        const planId = Number(req.params.id);
        if (!Number.isInteger(planId) || planId <= 0) {
            return res.status(400).json({ success: false, error: 'ID de plan inválido' });
        }

        const { nombre, datos_gb, duracion_dias, precio_mxn, precio_usdt, activo } = req.body;

        const { data: existente, error: existError } = await supabaseAdmin
            .from('planes_esim')
            .select('id')
            .eq('id', planId)
            .maybeSingle();

        if (existError) throw existError;
        if (!existente) {
            return res.status(404).json({ success: false, error: 'Plan no encontrado' });
        }

        const updates = {};
        if (nombre !== undefined) {
            const nombreLimpio = String(nombre).trim();
            if (!nombreLimpio) return res.status(400).json({ success: false, error: 'Nombre inválido' });
            updates.nombre = nombreLimpio.slice(0, 150);
        }
        if (datos_gb !== undefined) {
            const value = Number(datos_gb);
            if (!Number.isFinite(value) || value <= 0) {
                return res.status(400).json({ success: false, error: 'Datos GB inválidos' });
            }
            updates.datos_gb = Math.round(value);
        }
        if (duracion_dias !== undefined) {
            const value = Number(duracion_dias);
            if (!Number.isFinite(value) || value <= 0) {
                return res.status(400).json({ success: false, error: 'Duración inválida' });
            }
            updates.duracion_dias = Math.round(value);
        }
        if (precio_mxn !== undefined) {
            const value = Number(precio_mxn);
            if (!Number.isFinite(value) || value < 0) {
                return res.status(400).json({ success: false, error: 'Precio MXN inválido' });
            }
            updates.precio_mxn = value;
        }
        if (precio_usdt !== undefined) {
            const value = Number(precio_usdt);
            if (!Number.isFinite(value) || value < 0) {
                return res.status(400).json({ success: false, error: 'Precio USDT inválido' });
            }
            updates.precio_usdt = value;
        }
        if (activo !== undefined) {
            updates.activo = Boolean(activo);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No se proporcionaron campos' });
        }

        const { data, error } = await supabaseAdmin
            .from('planes_esim')
            .update(updates)
            .eq('id', planId)
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, plan: data });

    } catch (error) {
        console.error('❌ Error actualizando plan:', error);
        return res.status(500).json({ success: false, error: 'Error actualizando plan' });
    }
});

app.delete('/api/admin/planes/:id', verificarAdmin, async (req, res) => {
    try {
        const planId = Number(req.params.id);
        if (!Number.isInteger(planId) || planId <= 0) {
            return res.status(400).json({ success: false, error: 'ID de plan inválido' });
        }

        const { data: planExistente, error: existError } = await supabaseAdmin
            .from('planes_esim')
            .select('id')
            .eq('id', planId)
            .maybeSingle();

        if (existError) throw existError;
        if (!planExistente) {
            return res.status(404).json({ success: false, error: 'Plan no encontrado' });
        }

        const { count, error: countError } = await supabaseAdmin
            .from('ordenes_esim')
            .select('id', { count: 'exact', head: true })
            .eq('plan_id', planId);

        if (countError) throw countError;

        if (count > 0) {
            const { data, error } = await supabaseAdmin
                .from('planes_esim')
                .update({ activo: false })
                .eq('id', planId)
                .select()
                .single();

            if (error) throw error;
            return res.json({
                success: true,
                plan: data,
                mensaje: `El plan tiene ${count} órdenes asociadas. Se ha desactivado en lugar de eliminarlo.`
            });
        }

        const { error } = await supabaseAdmin
            .from('planes_esim')
            .delete()
            .eq('id', planId);

        if (error) throw error;
        return res.json({ success: true, mensaje: 'Plan eliminado correctamente' });

    } catch (error) {
        console.error('❌ Error eliminando plan:', error);
        return res.status(500).json({ success: false, error: 'Error eliminando plan' });
    }
});

/* ================================================================
   MANEJO DE ERRORES - API
   ================================================================ */

app.use('/api', (req, res) => {
    return res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
});

app.use((err, req, res, next) => {
    console.error('❌ Error interno:', err);

    if (res.headersSent) return next(err);

    return res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Error interno del servidor'
            : err.message
    });
});

/* ================================================================
   INICIAR SERVIDOR
   ================================================================ */

app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`📁 Archivos: ${publicPath}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📱 Telnyx: ${process.env.TELNYX_API_KEY ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`💳 NOWPayments: ${process.env.NOWPAYMENTS_API_KEY ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`🔐 Auth router: ✅ Montado en /api/auth`);
    console.log(`💳 Payments router: ✅ Montado en /api/payments`);
    console.log(`📡 Webhook router: ✅ Montado en /api/webhook`);
    console.log(`📂 Rutas de features: ✅ /muro, /perfil, /live, /videos, /mensajes, /internet`);
    console.log('========================================');
});

module.exports = app;