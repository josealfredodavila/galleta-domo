/* ================================================================
   SERVER.JS - SARIEL'S ECOSYSTEM
   VERSIÓN FINAL DE PRODUCCIÓN - CON RUTAS COMPLETAS
   Integración completa con Supabase, Telnyx, NOWPayments, LiveKit
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

app.use('/api/', (req, res, next) => {
    if (req.path.startsWith('/webhooks/')) return next();
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
   RUTAS HTML - COMPLETAS
   ================================================================ */

// ===== RUTA PRINCIPAL =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== FEATURES - RUTAS DIRECTAS =====
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

// ===== RUTAS AMIGABLES =====
app.get('/perfil', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'perfil', 'perfil.html'));
});

app.get('/muro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'features', 'muro', 'muro.html'));
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
    // Excluir rutas de API y archivos estáticos
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
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

/* ================================================================
   LIVEKIT
   ================================================================ */

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

/* ================================================================
   TOKENS - LECTURA
   ================================================================ */

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

/* ================================================================
   TRANSFERENCIA DE TOKENS - RPC SEGURA
   ================================================================ */

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

/* ================================================================
   PERFIL - RUTAS
   ================================================================ */

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

app.get('/api/perfil/:handle', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.rpc('obtener_perfil_publico', {
            p_handle: req.params.handle
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        return res.json({ success: true, perfil: data[0] });

    } catch (error) {
        console.error('❌ Error obteniendo perfil público:', error);
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

/* ================================================================
   ESTADO ONLINE
   ================================================================ */

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

/* ================================================================
   CONTACTOS
   ================================================================ */

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

/* ================================================================
   MENSAJES
   ================================================================ */

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

/* ================================================================
   MURO
   ================================================================ */

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

/* ================================================================
   LIVE
   ================================================================ */

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

/* ================================================================
   ESIM - TELNYX INTEGRATION
   ================================================================ */

async function llamarTelnyx(endpoint, method = 'GET', data = null) {
    if (!process.env.TELNYX_API_KEY) {
        throw new Error('TELNYX_API_KEY no configurada');
    }

    const url = `https://api.telnyx.com/v2/${endpoint}`;
    const config = {
        method,
        url,
        headers: {
            'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        timeout: 15000
    };

    if (data && (method === 'POST' || method === 'PATCH')) {
        config.data = data;
    }

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`❌ Error Telnyx (${endpoint}):`, error.response?.data || error.message);
        throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
    }
}

/**
 * Sincronizar SIM de Telnyx
 */
async function sincronizarSIMDesdeTelnyx(usuarioId) {
    try {
        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select('telnyx_sim_id, esim_iccid, esim_status, esim_data_used, esim_data_limit')
            .eq('id', usuarioId)
            .single();

        if (error) throw error;
        if (!usuario || !usuario.telnyx_sim_id) {
            if (usuario && usuario.esim_iccid) {
                // Intentar buscar SIM por ICCID
                try {
                    const sims = await llamarTelnyx(`sim_cards?filter[iccid]=${usuario.esim_iccid}`);
                    if (sims.data && sims.data.length > 0) {
                        const sim = sims.data[0];
                        await supabaseAdmin
                            .from('usuarios')
                            .update({
                                telnyx_sim_id: sim.id,
                                esim_iccid: sim.iccid,
                                esim_status: sim.status === 'active' ? 'enabled' : 
                                            sim.status === 'inactive' ? 'disabled' : 'standby',
                                esim_imsi: sim.imsi,
                                esim_msisdn: sim.msisdn,
                                esim_eid: sim.eid,
                                esim_type: sim.sim_type,
                                esim_last_sync_at: new Date().toISOString()
                            })
                            .eq('id', usuarioId);

                        return { success: true, sim };
                    }
                } catch (e) {
                    console.warn('⚠️ No se encontró SIM por ICCID:', e.message);
                }
            }
            return { success: false, error: 'No hay SIM asociada' };
        }

        // Obtener SIM de Telnyx
        const sim = await llamarTelnyx(`sim_cards/${usuario.telnyx_sim_id}`);

        if (sim.data) {
            const updates = {
                esim_iccid: sim.data.iccid,
                esim_status: sim.data.status === 'active' ? 'enabled' : 
                             sim.data.status === 'inactive' ? 'disabled' : 'standby',
                esim_imsi: sim.data.imsi,
                esim_msisdn: sim.data.msisdn,
                esim_eid: sim.data.eid,
                esim_type: sim.data.sim_type,
                esim_last_sync_at: new Date().toISOString(),
                telnyx_sim_id: sim.data.id
            };

            if (sim.data.data_limit) {
                updates.esim_data_limit = sim.data.data_limit * 1024 * 1024 * 1024;
            }

            await supabaseAdmin
                .from('usuarios')
                .update(updates)
                .eq('id', usuarioId);

            // Intentar obtener consumo
            try {
                const usage = await llamarTelnyx(`sim_cards/${usuario.telnyx_sim_id}/usage`);
                if (usage.data && usage.data.usage !== undefined) {
                    await supabaseAdmin
                        .from('usuarios')
                        .update({
                            esim_data_used: usage.data.usage * 1024 * 1024,
                            esim_data_unit: usage.data.unit || 'MB'
                        })
                        .eq('id', usuarioId);
                }
            } catch (usageError) {
                console.warn('⚠️ No se pudo obtener consumo:', usageError.message);
            }

            return { success: true, sim: sim.data };
        }

        return { success: false, error: 'SIM no encontrada' };

    } catch (error) {
        console.error('❌ Error sincronizando SIM:', error);
        await supabaseAdmin
            .from('usuarios')
            .update({
                esim_last_error: error.message,
                esim_last_sync_at: new Date().toISOString()
            })
            .eq('id', usuarioId);
        return { success: false, error: error.message };
    }
}

/**
 * GET /api/esim/status - Estado de eSIM
 */
app.get('/api/esim/status', verificarAutenticacion, async (req, res) => {
    try {
        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select(`
                telnyx_sim_id, esim_iccid, esim_status, esim_data_used, esim_data_limit,
                esim_apn, esim_activated_at, esim_expires_at, esim_operator, esim_network,
                esim_imsi, esim_msisdn, esim_eid, esim_type, esim_last_sync_at, esim_last_error
            `)
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        if (!usuario || !usuario.telnyx_sim_id) {
            return res.json({
                success: true,
                data: {
                    has_esim: false,
                    message: 'No tienes una eSIM activa'
                }
            });
        }

        // Sincronizar con Telnyx si ha pasado más de 5 minutos
        const lastSync = usuario.esim_last_sync_at ? new Date(usuario.esim_last_sync_at) : null;
        const now = new Date();
        const diffMinutes = lastSync ? (now - lastSync) / 60000 : 999;

        let telnyxError = false;
        let telnyxData = null;

        if (diffMinutes > 5 && process.env.TELNYX_API_KEY) {
            try {
                const syncResult = await sincronizarSIMDesdeTelnyx(req.user.id);
                if (syncResult.success) {
                    telnyxData = syncResult.sim;
                } else if (syncResult.error) {
                    telnyxError = true;
                }
            } catch (syncError) {
                telnyxError = true;
            }
        }

        // Re-obtener datos actualizados
        const { data: usuarioActualizado, error: refreshError } = await supabaseAdmin
            .from('usuarios')
            .select(`
                telnyx_sim_id, esim_iccid, esim_status, esim_data_used, esim_data_limit,
                esim_apn, esim_activated_at, esim_expires_at, esim_operator, esim_network,
                esim_imsi, esim_msisdn, esim_eid, esim_type, esim_last_sync_at, esim_last_error
            `)
            .eq('id', req.user.id)
            .single();

        if (refreshError) throw refreshError;
        const usuarioFinal = usuarioActualizado || usuario;

        return res.json({
            success: true,
            data: {
                has_esim: true,
                iccid: usuarioFinal.esim_iccid,
                sim_id: usuarioFinal.telnyx_sim_id,
                status: usuarioFinal.esim_status || 'unknown',
                data_used_bytes: usuarioFinal.esim_data_used || 0,
                data_limit_bytes: usuarioFinal.esim_data_limit || 0,
                apn: usuarioFinal.esim_apn || 'data00.telnyx',
                activated_at: usuarioFinal.esim_activated_at,
                expires_at: usuarioFinal.esim_expires_at,
                operator: usuarioFinal.esim_operator || 'Telnyx',
                network: usuarioFinal.esim_network || '4G/5G',
                imsi: usuarioFinal.esim_imsi,
                msisdn: usuarioFinal.esim_msisdn,
                eid: usuarioFinal.esim_eid,
                sim_type: usuarioFinal.esim_type,
                last_sync_at: usuarioFinal.esim_last_sync_at,
                last_error: usuarioFinal.esim_last_error,
                telnyx_error: telnyxError
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo estado eSIM:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener estado de eSIM'
        });
    }
});

/**
 * GET /api/esim/profile - Perfil completo de eSIM
 */
app.get('/api/esim/profile', verificarAutenticacion, async (req, res) => {
    try {
        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select(`
                telnyx_sim_id, esim_iccid, esim_status, esim_data_used, esim_data_limit,
                esim_apn, esim_activated_at, esim_expires_at, esim_operator, esim_network,
                esim_imsi, esim_msisdn, esim_eid, esim_type, esim_last_sync_at, esim_last_error
            `)
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        if (!usuario || !usuario.telnyx_sim_id) {
            return res.json({
                success: true,
                data: {
                    has_esim: false,
                    message: 'No tienes una eSIM activa'
                }
            });
        }

        // Sincronizar siempre en profile
        let telnyxError = false;
        let telnyxData = null;

        if (process.env.TELNYX_API_KEY) {
            try {
                const syncResult = await sincronizarSIMDesdeTelnyx(req.user.id);
                if (syncResult.success) {
                    telnyxData = syncResult.sim;
                } else {
                    telnyxError = true;
                }
            } catch (syncError) {
                telnyxError = true;
            }
        }

        // Re-obtener datos
        const { data: usuarioFinal, error: refreshError } = await supabaseAdmin
            .from('usuarios')
            .select(`
                telnyx_sim_id, esim_iccid, esim_status, esim_data_used, esim_data_limit,
                esim_apn, esim_activated_at, esim_expires_at, esim_operator, esim_network,
                esim_imsi, esim_msisdn, esim_eid, esim_type, esim_last_sync_at, esim_last_error
            `)
            .eq('id', req.user.id)
            .single();

        if (refreshError) throw refreshError;

        const data = usuarioFinal || usuario;
        const dataUsedGB = (data.esim_data_used || 0) / 1024 / 1024 / 1024;
        const dataLimitGB = (data.esim_data_limit || 0) / 1024 / 1024 / 1024;

        return res.json({
            success: true,
            data: {
                has_esim: true,
                iccid: data.esim_iccid,
                sim_id: data.telnyx_sim_id,
                status: data.esim_status || 'unknown',
                data_used_bytes: data.esim_data_used || 0,
                data_limit_bytes: data.esim_data_limit || 0,
                data_used_gb: dataUsedGB,
                data_limit_gb: dataLimitGB,
                data_remaining_gb: Math.max(dataLimitGB - dataUsedGB, 0),
                usage_percentage: dataLimitGB > 0 ? (dataUsedGB / dataLimitGB) * 100 : 0,
                apn: data.esim_apn || 'data00.telnyx',
                activated_at: data.esim_activated_at,
                expires_at: data.esim_expires_at,
                operator: data.esim_operator || 'Telnyx',
                network: data.esim_network || '4G/5G',
                imsi: data.esim_imsi,
                msisdn: data.esim_msisdn,
                eid: data.esim_eid,
                sim_type: data.esim_type,
                last_sync_at: data.esim_last_sync_at,
                last_error: data.esim_last_error,
                telnyx_error: telnyxError,
                telnyx_data: telnyxData
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo perfil eSIM:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener perfil de eSIM'
        });
    }
});

/**
 * GET /api/esim/usage - Consumo de datos
 */
app.get('/api/esim/usage', verificarAutenticacion, async (req, res) => {
    try {
        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select('telnyx_sim_id, esim_iccid, esim_data_used, esim_data_limit, esim_data_unit')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        if (!usuario || !usuario.telnyx_sim_id) {
            return res.json({
                success: true,
                data: {
                    has_esim: false,
                    message: 'No tienes una eSIM activa'
                }
            });
        }

        let telnyxUsage = null;
        let telnyxError = false;

        if (process.env.TELNYX_API_KEY) {
            try {
                // Intentar obtener consumo actualizado
                const usage = await llamarTelnyx(`sim_cards/${usuario.telnyx_sim_id}/usage`);
                if (usage.data && usage.data.usage !== undefined) {
                    const usageBytes = usage.data.usage * 1024 * 1024;
                    await supabaseAdmin
                        .from('usuarios')
                        .update({
                            esim_data_used: usageBytes,
                            esim_data_unit: usage.data.unit || 'MB',
                            esim_last_sync_at: new Date().toISOString()
                        })
                        .eq('id', req.user.id);
                    telnyxUsage = usage.data;
                }
            } catch (syncError) {
                telnyxError = true;
                console.warn('⚠️ Error obteniendo consumo Telnyx:', syncError.message);
            }
        }

        // Re-obtener datos actualizados
        const { data: usuarioFinal, error: refreshError } = await supabaseAdmin
            .from('usuarios')
            .select('esim_data_used, esim_data_limit, esim_data_unit')
            .eq('id', req.user.id)
            .single();

        if (refreshError) throw refreshError;

        const data = usuarioFinal || usuario;
        const dataUsedBytes = data.esim_data_used || 0;
        const dataLimitBytes = data.esim_data_limit || 0;
        const dataUsedGB = dataUsedBytes / 1024 / 1024 / 1024;
        const dataLimitGB = dataLimitBytes / 1024 / 1024 / 1024;

        return res.json({
            success: true,
            data: {
                has_esim: true,
                iccid: usuario.esim_iccid,
                data_used_bytes: dataUsedBytes,
                data_limit_bytes: dataLimitBytes,
                data_used_gb: dataUsedGB,
                data_limit_gb: dataLimitGB,
                data_remaining_gb: Math.max(dataLimitGB - dataUsedGB, 0),
                usage_percentage: dataLimitGB > 0 ? (dataUsedGB / dataLimitGB) * 100 : 0,
                data_unit: data.esim_data_unit || 'MB',
                telnyx_usage: telnyxUsage,
                telnyx_error: telnyxError
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo uso eSIM:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener uso de eSIM'
        });
    }
});

/**
 * POST /api/esim/sync - Sincronizar eSIM manualmente
 */
app.post('/api/esim/sync', verificarAutenticacion, async (req, res) => {
    try {
        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select('telnyx_sim_id, esim_iccid')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        if (!usuario || !usuario.telnyx_sim_id) {
            return res.status(400).json({
                success: false,
                error: 'No tienes una eSIM activa para sincronizar'
            });
        }

        if (!process.env.TELNYX_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Telnyx no configurado'
            });
        }

        const syncResult = await sincronizarSIMDesdeTelnyx(req.user.id);

        if (!syncResult.success) {
            return res.status(500).json({
                success: false,
                error: syncResult.error || 'Error sincronizando con Telnyx'
            });
        }

        // Obtener datos actualizados
        const { data: usuarioFinal, error: refreshError } = await supabaseAdmin
            .from('usuarios')
            .select(`
                telnyx_sim_id, esim_iccid, esim_status, esim_data_used, esim_data_limit,
                esim_apn, esim_activated_at, esim_expires_at, esim_operator, esim_network,
                esim_imsi, esim_msisdn, esim_eid, esim_type, esim_last_sync_at
            `)
            .eq('id', req.user.id)
            .single();

        if (refreshError) throw refreshError;

        const data = usuarioFinal;
        const dataUsedGB = (data.esim_data_used || 0) / 1024 / 1024 / 1024;
        const dataLimitGB = (data.esim_data_limit || 0) / 1024 / 1024 / 1024;

        return res.json({
            success: true,
            message: 'Datos sincronizados correctamente',
            data: {
                iccid: data.esim_iccid,
                status: data.esim_status || 'unknown',
                data_used_gb: dataUsedGB,
                data_limit_gb: dataLimitGB,
                data_remaining_gb: Math.max(dataLimitGB - dataUsedGB, 0),
                usage_percentage: dataLimitGB > 0 ? (dataUsedGB / dataLimitGB) * 100 : 0,
                sim_id: data.telnyx_sim_id,
                activated_at: data.esim_activated_at,
                expires_at: data.esim_expires_at,
                last_sync_at: data.esim_last_sync_at,
                telnyx_sim: syncResult.sim
            }
        });

    } catch (error) {
        console.error('❌ Error sincronizando eSIM:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al sincronizar eSIM'
        });
    }
});

/**
 * POST /api/esim/activar - Activar eSIM
 */
app.post('/api/esim/activar', verificarAutenticacion, async (req, res) => {
    try {
        const { iccid } = req.body;

        if (!iccid) {
            return res.status(400).json({ success: false, error: 'Se requiere ICCID' });
        }

        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select('telnyx_sim_id, esim_iccid, esim_status')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        if (!usuario || usuario.esim_iccid !== iccid) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        if (!process.env.TELNYX_API_KEY) {
            return res.status(500).json({ success: false, error: 'Telnyx no configurado' });
        }

        // Si no hay telnyx_sim_id, intentar obtenerlo
        let simId = usuario.telnyx_sim_id;
        if (!simId) {
            const syncResult = await sincronizarSIMDesdeTelnyx(req.user.id);
            if (syncResult.success && syncResult.sim) {
                simId = syncResult.sim.id;
            } else {
                return res.status(500).json({
                    success: false,
                    error: 'No se pudo identificar la SIM en Telnyx'
                });
            }
        }

        // Activar en Telnyx (operación asíncrona)
        const result = await llamarTelnyx(`sim_cards/${simId}/enable`, 'POST');

        // Actualizar estado a "pending" mientras Telnyx procesa
        await supabaseAdmin
            .from('usuarios')
            .update({
                esim_status: 'pending',
                esim_activated_at: new Date().toISOString(),
                esim_last_sync_at: new Date().toISOString()
            })
            .eq('id', req.user.id);

        // Intentar sincronizar para obtener estado actual
        setTimeout(async () => {
            try {
                await sincronizarSIMDesdeTelnyx(req.user.id);
            } catch (e) {
                console.warn('⚠️ Sincronización post-activación falló:', e.message);
            }
        }, 5000);

        return res.json({
            success: true,
            message: 'Activación de eSIM en proceso',
            data: {
                status: 'pending',
                sim_id: simId,
                telnyx_response: result
            }
        });

    } catch (error) {
        console.error('❌ Error activando eSIM:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al activar eSIM'
        });
    }
});

/**
 * POST /api/esim/desactivar - Desactivar eSIM
 */
app.post('/api/esim/desactivar', verificarAutenticacion, async (req, res) => {
    try {
        const { iccid } = req.body;

        if (!iccid) {
            return res.status(400).json({ success: false, error: 'Se requiere ICCID' });
        }

        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select('telnyx_sim_id, esim_iccid, esim_status')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        if (!usuario || usuario.esim_iccid !== iccid) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        if (!process.env.TELNYX_API_KEY) {
            return res.status(500).json({ success: false, error: 'Telnyx no configurado' });
        }

        let simId = usuario.telnyx_sim_id;
        if (!simId) {
            const syncResult = await sincronizarSIMDesdeTelnyx(req.user.id);
            if (syncResult.success && syncResult.sim) {
                simId = syncResult.sim.id;
            } else {
                return res.status(500).json({
                    success: false,
                    error: 'No se pudo identificar la SIM en Telnyx'
                });
            }
        }

        // Desactivar en Telnyx (operación asíncrona)
        const result = await llamarTelnyx(`sim_cards/${simId}/disable`, 'POST');

        await supabaseAdmin
            .from('usuarios')
            .update({
                esim_status: 'disabled',
                esim_last_sync_at: new Date().toISOString()
            })
            .eq('id', req.user.id);

        setTimeout(async () => {
            try {
                await sincronizarSIMDesdeTelnyx(req.user.id);
            } catch (e) {
                console.warn('⚠️ Sincronización post-desactivación falló:', e.message);
            }
        }, 5000);

        return res.json({
            success: true,
            message: 'Desactivación de eSIM en proceso',
            data: {
                status: 'disabled',
                sim_id: simId,
                telnyx_response: result
            }
        });

    } catch (error) {
        console.error('❌ Error desactivando eSIM:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al desactivar eSIM'
        });
    }
});

/**
 * POST /api/esim/standby - Poner eSIM en standby
 */
app.post('/api/esim/standby', verificarAutenticacion, async (req, res) => {
    try {
        const { iccid } = req.body;

        if (!iccid) {
            return res.status(400).json({ success: false, error: 'Se requiere ICCID' });
        }

        const { data: usuario, error } = await supabaseAdmin
            .from('usuarios')
            .select('telnyx_sim_id, esim_iccid')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;

        if (!usuario || usuario.esim_iccid !== iccid) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        if (!process.env.TELNYX_API_KEY) {
            return res.status(500).json({ success: false, error: 'Telnyx no configurado' });
        }

        let simId = usuario.telnyx_sim_id;
        if (!simId) {
            const syncResult = await sincronizarSIMDesdeTelnyx(req.user.id);
            if (syncResult.success && syncResult.sim) {
                simId = syncResult.sim.id;
            } else {
                return res.status(500).json({
                    success: false,
                    error: 'No se pudo identificar la SIM en Telnyx'
                });
            }
        }

        // Poner en standby
        const result = await llamarTelnyx(`sim_cards/${simId}/standby`, 'POST');

        await supabaseAdmin
            .from('usuarios')
            .update({
                esim_status: 'standby',
                esim_last_sync_at: new Date().toISOString()
            })
            .eq('id', req.user.id);

        return res.json({
            success: true,
            message: 'eSIM puesta en standby',
            data: {
                status: 'standby',
                sim_id: simId,
                telnyx_response: result
            }
        });

    } catch (error) {
        console.error('❌ Error poniendo eSIM en standby:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al poner eSIM en standby'
        });
    }
});

/* ================================================================
   ESIM - PLANES Y ÓRDENES
   ================================================================ */

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

/* ================================================================
   QR DOMO
   ================================================================ */

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

/* ================================================================
   PAGOS - NOWPAYMENTS
   ================================================================ */

app.post('/api/pagos/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { transmisionId, tipo, planId, ordenEsimId, idempotency_key } = req.body;

        if (!idempotency_key) {
            return res.status(400).json({ success: false, error: 'Se requiere idempotency_key' });
        }

        let precioOficialUSDT = 0;
        let precioOficialUSD = 0;
        let pagoData = {};

        if (tipo === 'esim') {
            let ordenEsimIdFinal = ordenEsimId;

            if (!ordenEsimIdFinal && planId) {
                const { data: ordenResult, error: ordenError } = await supabaseAdmin.rpc('crear_orden_esim', {
                    p_usuario_id: req.user.id,
                    p_plan_id: parseInt(planId),
                    p_idempotency_key: idempotency_key
                });

                if (ordenError) throw ordenError;
                if (!ordenResult.success) {
                    return res.status(400).json({ success: false, error: ordenResult.error });
                }
                ordenEsimIdFinal = ordenResult.orden.id;
                precioOficialUSDT = Number(ordenResult.orden.monto_usdt);
                precioOficialUSD = Number(ordenResult.orden.monto_usdt);
            } else if (ordenEsimIdFinal) {
                const { data: orden, error: ordenError } = await supabaseAdmin
                    .from('ordenes_esim')
                    .select('*')
                    .eq('id', ordenEsimIdFinal)
                    .eq('usuario_id', req.user.id)
                    .single();

                if (ordenError || !orden) {
                    return res.status(404).json({ success: false, error: 'Orden no encontrada' });
                }

                const { data: plan, error: planError } = await supabaseAdmin
                    .from('planes_esim')
                    .select('precio_usdt')
                    .eq('id', orden.plan_id)
                    .single();

                if (planError) throw planError;
                precioOficialUSDT = Number(plan.precio_usdt);
                precioOficialUSD = Number(plan.precio_usdt);
            } else {
                return res.status(400).json({ success: false, error: 'Se requiere planId u ordenEsimId' });
            }

            pagoData = {
                espectador_id: req.user.id,
                monto_pagado: precioOficialUSDT,
                monto_usd_esperado: precioOficialUSD,
                moneda_orden: 'USDT',
                moneda_pago_esperada: 'USDT',
                orden_esim_id: ordenEsimIdFinal,
                tipo_pago: 'esim',
                estado: 'pendiente',
                idempotency_key: idempotency_key
            };

        } else if (tipo === 'live' || tipo === 'acceso' || tipo === 'domo') {
            if (!transmisionId && tipo !== 'domo') {
                return res.status(400).json({ success: false, error: 'Se requiere transmisionId' });
            }

            let transmision = null;

            if (tipo !== 'domo') {
                const { data: t, error: tError } = await supabaseAdmin
                    .from('transmisiones')
                    .select('id, streamer_id, estado, precio_acceso')
                    .eq('id', transmisionId)
                    .single();

                if (tError || !t) {
                    return res.status(404).json({ success: false, error: 'Transmisión no encontrada' });
                }
                if (t.streamer_id === req.user.id) {
                    return res.status(400).json({ success: false, error: 'El streamer no puede pagarse a sí mismo' });
                }
                if (t.estado !== 'activa') {
                    return res.status(400).json({ success: false, error: 'Transmisión no activa' });
                }
                transmision = t;
                precioOficialUSDT = Number(t.precio_acceso || 4.50);
                precioOficialUSD = Number(t.precio_acceso || 4.50);
            } else {
                // Compra de domo
                precioOficialUSDT = 4.50;
                precioOficialUSD = 4.50;
            }

            const comisionSariels = Math.round(precioOficialUSDT * 0.02 * 100) / 100;
            const montoStreamer = Math.round((precioOficialUSDT - comisionSariels) * 100) / 100;

            pagoData = {
                espectador_id: req.user.id,
                monto_pagado: precioOficialUSDT,
                monto_usd_esperado: precioOficialUSD,
                moneda_orden: 'USDT',
                moneda_pago_esperada: 'USDT',
                transmision_id: tipo !== 'domo' ? transmisionId : null,
                tipo_pago: tipo === 'domo' ? 'domo' : 'acceso',
                estado: 'pendiente',
                idempotency_key: idempotency_key,
                comision_sariels: comisionSariels,
                monto_streamer: montoStreamer
            };

        } else {
            return res.status(400).json({ success: false, error: 'Tipo de pago no válido' });
        }

        // Verificar idempotencia
        const { data: pagoExistente } = await supabaseAdmin
            .from('pagos_transmision')
            .select('*')
            .eq('idempotency_key', idempotency_key)
            .maybeSingle();

        if (pagoExistente && pagoExistente.payment_id) {
            return res.json({
                success: true,
                data: pagoExistente,
                mensaje: 'Pago ya existe',
                ya_existente: true
            });
        }

        if (pagoExistente) {
            pagoData = pagoExistente;
        } else {
            const { data: pago, error: pagoError } = await supabaseAdmin
                .from('pagos_transmision')
                .insert(pagoData)
                .select()
                .single();

            if (pagoError) throw pagoError;
            pagoData = pago;
        }

        if (!process.env.NOWPAYMENTS_API_KEY) {
            return res.json({ success: true, data: pagoData, warning: 'NOWPayments no configurado' });
        }

        const ipnCallbackUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
        const nowpaymentsPayload = {
            price_amount: precioOficialUSD,
            price_currency: 'usd',
            pay_currency: 'usdt',
            order_id: String(pagoData.id),
            order_description: tipo === 'esim'
                ? `Compra eSIM ${ordenEsimId || 'N/A'}`
                : tipo === 'domo'
                ? 'Compra de Domo'
                : `Pago transmisión ${transmisionId || 'N/A'}`
        };

        if (ipnCallbackUrl) {
            nowpaymentsPayload.ipn_callback_url = ipnCallbackUrl;
        }

        const nowpayments = await axios.post(
            'https://api.nowpayments.io/v1/payment',
            nowpaymentsPayload,
            {
                headers: {
                    'x-api-key': process.env.NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        const paymentId = String(nowpayments.data?.payment_id || '');
        if (paymentId) {
            await supabaseAdmin
                .from('pagos_transmision')
                .update({
                    payment_id: paymentId,
                    payment_url: nowpayments.data?.payment_url || null,
                    price_amount_enviado: precioOficialUSD,
                    price_currency_enviado: 'usd',
                    pay_currency_enviado: 'usdt'
                })
                .eq('id', pagoData.id);

            pagoData.payment_id = paymentId;
            pagoData.payment_url = nowpayments.data?.payment_url || null;
        }

        return res.json({
            success: true,
            data: {
                ...pagoData,
                payment_url: nowpayments.data?.payment_url || null,
                payment_id: paymentId || null
            }
        });

    } catch (error) {
        console.error('❌ Error creando pago:', error);
        return res.status(500).json({
            success: false,
            error: 'Error creando el pago'
        });
    }
});

app.get('/api/pagos/estado/:ordenId', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('pagos_transmision')
            .select('*')
            .eq('id', req.params.ordenId)
            .eq('espectador_id', req.user.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Orden no encontrada' });
            }
            throw error;
        }

        return res.json({ success: true, data });

    } catch (error) {
        console.error('❌ Error verificando pago:', error);
        return res.status(500).json({ success: false, error: 'Error verificando pago' });
    }
});

/* ================================================================
   WEBHOOK NOWPAYMENTS
   ================================================================ */

function verificarHMAC(rawBody, firmaRecibida, secret) {
    try {
        if (!rawBody || !firmaRecibida || !secret) return false;

        const bodyBuffer = Buffer.isBuffer(rawBody)
            ? rawBody
            : Buffer.from(String(rawBody), 'utf8');

        const firmaCalculada = crypto
            .createHmac('sha512', secret)
            .update(bodyBuffer)
            .digest('hex');

        const recibido = Buffer.from(String(firmaRecibida), 'utf8');
        const calculado = Buffer.from(firmaCalculada, 'utf8');

        if (recibido.length !== calculado.length) return false;

        return crypto.timingSafeEqual(calculado, recibido);

    } catch (error) {
        console.error('❌ Error verificando HMAC:', error);
        return false;
    }
}

async function verificarPagoNOWPayments(paymentId) {
    try {
        const apiKey = process.env.NOWPAYMENTS_API_KEY;
        if (!apiKey) return null;

        const response = await axios.get(
            `https://api.nowpayments.io/v1/payment/${paymentId}`,
            {
                headers: { 'x-api-key': apiKey },
                timeout: 10000
            }
        );

        return response.data;
    } catch (error) {
        console.error('❌ Error verificando pago con NOWPayments:', error.message);
        return null;
    }
}

app.post('/api/webhooks/nowpayments', webhookLimiter, async (req, res) => {
    try {
        const secret = process.env.NOWPAYMENTS_IPN_SECRET;
        if (!secret) {
            console.error('❌ NOWPAYMENTS_IPN_SECRET no configurado');
            return res.status(500).json({ success: false, error: 'Webhook no configurado' });
        }

        const firmaRecibida = req.headers['x-nowpayments-sig'] ||
                              req.headers['x-nowpayments-signature'];

        if (!firmaRecibida) {
            console.warn('⚠️ Webhook NOWPayments sin firma');
            return res.status(401).json({ success: false, error: 'Firma ausente' });
        }

        const rawBody = req.rawBody;
        if (!rawBody || rawBody.length === 0) {
            console.warn('⚠️ Webhook NOWPayments sin body');
            return res.status(400).json({ success: false, error: 'Body vacío' });
        }

        const esValido = verificarHMAC(rawBody, firmaRecibida, secret);

        if (!esValido) {
            console.warn('⚠️ Webhook NOWPayments con firma inválida');
            return res.status(401).json({ success: false, error: 'Firma inválida' });
        }

        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch (parseError) {
            console.error('❌ Error parseando webhook:', parseError);
            return res.status(400).json({ success: false, error: 'Body inválido' });
        }

        const paymentId = String(payload.payment_id || payload.data?.payment_id || '');
        const ordenId = String(payload.order_id || payload.data?.order_id || '');
        const paymentStatus = String(
            payload.payment_status ||
            payload.data?.payment_status ||
            payload.status ||
            ''
        ).toLowerCase();

        console.log(`📡 Webhook: payment_id=${paymentId}, order_id=${ordenId}, status=${paymentStatus}`);

        if (!paymentId || !ordenId) {
            console.warn('⚠️ Webhook sin payment_id o order_id');
            return res.status(400).json({ success: false, error: 'Faltan identificadores' });
        }

        // Verificar con NOWPayments server-to-server
        const paymentInfo = await verificarPagoNOWPayments(paymentId);
        if (!paymentInfo) {
            console.error('❌ No se pudo verificar el pago con NOWPayments');
            return res.status(502).json({ success: false, error: 'Error verificando pago con proveedor' });
        }

        const statusFromAPI = String(paymentInfo.payment_status || '').toLowerCase();

        const estadosFinales = ['finished', 'confirmed'];
        const estadosFallidos = ['failed', 'refunded', 'expired', 'cancelled'];

        if (estadosFallidos.includes(statusFromAPI)) {
            console.log(`⚠️ Estado fallido: ${statusFromAPI}. No se acredita.`);
            await supabaseAdmin
                .from('pagos_transmision')
                .update({
                    estado: 'fallido',
                    datos_webhook: {
                        payment_id: paymentId,
                        status: statusFromAPI,
                        fecha: new Date().toISOString()
                    }
                })
                .eq('id', ordenId);
            return res.json({ success: true, message: 'Pago fallido - no acreditado' });
        }

        if (!estadosFinales.includes(statusFromAPI)) {
            console.log(`ℹ️ Estado no final: ${statusFromAPI}. Esperando.`);
            return res.json({
                success: true,
                message: `Estado ${statusFromAPI} - esperando confirmación`
            });
        }

        const { data: orden, error: ordenError } = await supabaseAdmin
            .from('pagos_transmision')
            .select('*')
            .eq('id', ordenId)
            .maybeSingle();

        if (ordenError) throw ordenError;
        if (!orden) {
            console.error(`❌ Orden no encontrada: ${ordenId}`);
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed') {
            console.log(`ℹ️ Pago ${ordenId} ya procesado anteriormente`);
            return res.json({ success: true, message: 'Pago ya procesado', idempotent: true });
        }

        if (orden.payment_id && orden.payment_id !== paymentId) {
            console.warn(`⚠️ payment_id no coincide. Esperado: ${orden.payment_id}, Recibido: ${paymentId}`);
            return res.status(400).json({ success: false, error: 'payment_id no coincide' });
        }

        // Validar montos
        const priceAmount = Number(paymentInfo.price_amount || 0);
        const priceCurrency = String(paymentInfo.price_currency || '').toLowerCase();
        const payAmount = Number(paymentInfo.pay_amount || 0);
        const payCurrency = String(paymentInfo.pay_currency || '').toLowerCase();

        const expectedPriceAmount = Number(orden.price_amount_enviado || orden.monto_usd_esperado || orden.monto_pagado);
        const expectedPriceCurrency = String(orden.price_currency_enviado || 'usd').toLowerCase();
        const expectedPayCurrency = String(orden.pay_currency_enviado || 'usdt').toLowerCase();

        if (priceCurrency !== expectedPriceCurrency) {
            console.error(`❌ price_currency no coincide. Esperado: ${expectedPriceCurrency}, API: ${priceCurrency}`);
            return res.status(400).json({ success: false, error: 'price_currency no coincide' });
        }

        if (payCurrency !== expectedPayCurrency) {
            console.error(`❌ pay_currency no coincide. Esperado: ${expectedPayCurrency}, API: ${payCurrency}`);
            return res.status(400).json({ success: false, error: 'pay_currency no coincide' });
        }

        const toleranciaPrice = expectedPriceAmount * 0.01;
        if (Math.abs(priceAmount - expectedPriceAmount) > toleranciaPrice) {
            console.error(`❌ price_amount no coincide. Esperado: ${expectedPriceAmount}, API: ${priceAmount}`);
            return res.status(400).json({ success: false, error: 'price_amount no coincide' });
        }

        const montoOrden = Number(orden.monto_pagado);
        const toleranciaPay = montoOrden * 0.01;
        if (Math.abs(payAmount - montoOrden) > toleranciaPay) {
            console.error(`❌ pay_amount fuera de tolerancia. Esperado: ${montoOrden}, API: ${payAmount}`);
            return res.status(400).json({ success: false, error: 'pay_amount fuera de tolerancia' });
        }

        // Procesar pago - RPC
        const { data: resultado, error: rpcError } = await supabaseAdmin.rpc('procesar_pago_webhook', {
            p_orden_id: parseInt(ordenId),
            p_payment_id: paymentId,
            p_estado: 'completado',
            p_pay_amount: payAmount
        });

        if (rpcError) {
            console.error('❌ Error en RPC procesar_pago_webhook:', rpcError);
            return res.status(500).json({
                success: false,
                error: 'Error procesando pago'
            });
        }

        if (!resultado || !resultado.success) {
            console.error('❌ RPC devolvió error:', resultado?.error || 'Error desconocido');
            return res.status(500).json({
                success: false,
                error: resultado?.error || 'Error procesando pago'
            });
        }

        console.log(`✅ Pago ${ordenId} procesado exitosamente`);

        return res.json({
            success: true,
            message: 'Pago procesado correctamente',
            data: resultado
        });

    } catch (error) {
        console.error('❌ Error procesando webhook:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno al procesar webhook'
        });
    }
});

/* ================================================================
   ADMIN - PLANES ESIM
   ================================================================ */

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
    console.log('========================================');
});

module.exports = app;