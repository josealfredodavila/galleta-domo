/* ================================================================
   SERVER.JS - SARIEL'S BACKEND (VERSIÓN COMPLETA)
   RUTA RAILWAY: https://galleta-domo.up.railway.app
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

// FIX: WebSocket para Node.js
globalThis.WebSocket = require('ws');

// ================================================================
// CONFIGURACIÓN
// ================================================================
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// ================================================================
// SUPABASE
// ================================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente Admin (para lecturas públicas)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole || supabaseAnonKey);

// Cliente por request (con token del usuario)
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
// MIDDLEWARES DE SEGURIDAD Y RENDIMIENTO (NUEVO)
// ================================================================

// Helmet - Protege cabeceras HTTP
app.use(helmet({
    contentSecurityPolicy: false
}));

// Compresión - Mejora rendimiento
app.use(compression());

// CORS (mantenido)
app.use(cors());

// Morgan - Logs de peticiones
app.use(morgan('combined'));

// Rate Limiting - Protección contra DDoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 peticiones por IP
    message: {
        error: 'Demasiadas peticiones, intenta de nuevo más tarde',
        success: false
    }
});
app.use(limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ================================================================
// HEALTH CHECK
// ================================================================
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        railway: 'https://galleta-domo.up.railway.app'
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
// 🪙 SISTEMA DE TOKENS (NUEVO)
// ================================================================

// Obtener tokens del usuario
app.get('/api/tokens', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { data, error } = await supabase
            .from('usuarios')
            .select('tokens')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        res.json({ success: true, tokens: data?.tokens || 0 });
    } catch (error) {
        console.error('Error obteniendo tokens:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Transferir tokens
app.post('/api/tokens/transferir', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { destinoId, cantidad } = req.body;
        if (!destinoId || !cantidad || cantidad <= 0) {
            return res.status(400).json({ success: false, error: 'Datos inválidos' });
        }

        // Verificar tokens del usuario
        const { data: userData } = await supabase
            .from('usuarios')
            .select('tokens')
            .eq('id', user.id)
            .single();

        if (!userData || userData.tokens < cantidad) {
            return res.status(400).json({ success: false, error: 'Tokens insuficientes' });
        }

        // Restar al emisor
        await supabase.rpc('decrement_tokens', {
            p_user_id: user.id,
            p_cantidad: cantidad
        });

        // Sumar al receptor
        await supabase.rpc('increment_tokens', {
            p_user_id: destinoId,
            p_cantidad: cantidad
        });

        res.json({ success: true, message: `${cantidad} tokens transferidos` });
    } catch (error) {
        console.error('Error transfiriendo tokens:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// 💳 PAGOS CON CRYPTO (NOWPayments) (NUEVO)
// ================================================================

// Crear orden de pago
app.post('/api/pagos/crear', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { transmisionId, monto, metodo } = req.body;
        if (!transmisionId || !monto || monto <= 0) {
            return res.status(400).json({ success: false, error: 'Datos inválidos' });
        }

        const comisionSariels = monto * 0.02; // 2%
        const montoStreamer = monto - comisionSariels;

        // Guardar orden en Supabase
        const { data: orden, error } = await supabase
            .from('pagos_transmision')
            .insert({
                transmision_id: transmisionId,
                espectador_id: user.id,
                monto_pagado: monto,
                comision_sariels: comisionSariels,
                monto_streamer: montoStreamer,
                metodo_pago: metodo || 'crypto',
                tipo_pago: 'acceso',
                estado: 'pendiente'
            })
            .select()
            .single();

        if (error) throw error;

        // Si es crypto, generar pago en NOWPayments
        let paymentData = orden;
        if (metodo === 'crypto' || !metodo) {
            try {
                const nowpayments = await axios.post('https://api.nowpayments.io/v1/payment', {
                    price_amount: monto,
                    price_currency: 'usd',
                    pay_currency: 'usdt',
                    order_id: orden.id,
                    order_description: `Pago transmisión ${transmisionId}`
                }, {
                    headers: {
                        'x-api-key': process.env.NOWPAYMENTS_API_KEY
                    }
                });

                paymentData = { ...orden, payment_url: nowpayments.data.payment_url };
            } catch (nowError) {
                console.error('Error en NOWPayments:', nowError.message);
                // Continuamos sin payment_url
            }
        }

        res.json({ success: true, data: paymentData });
    } catch (error) {
        console.error('Error creando pago:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verificar estado de pago
app.get('/api/pagos/estado/:ordenId', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { data, error } = await supabase
            .from('pagos_transmision')
            .select('*')
            .eq('id', req.params.ordenId)
            .eq('espectador_id', user.id)
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error verificando pago:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// 📡 WEBHOOKS (NUEVO)
// ================================================================

// Función para verificar firma HMAC
function verificarHMAC(payload, firmaRecibida, secret) {
    try {
        const firmaCalculada = crypto
            .createHmac('sha512', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(firmaCalculada),
            Buffer.from(firmaRecibida)
        );
    } catch (error) {
        return false;
    }
}

// Webhook de NOWPayments
app.post('/api/webhooks/nowpayments', async (req, res) => {
    try {
        const payload = req.body;
        const firmaRecibida = req.headers['x-nowpayments-sig'];

        console.log('📡 Webhook NOWPayments recibido:', payload.event);

        // Verificar firma
        const esValido = verificarHMAC(payload, firmaRecibida, process.env.NOWPAYMENTS_WEBHOOK_SECRET);

        if (!esValido) {
            console.warn('⚠️ Webhook inválido - Firma no coincide');
            return res.status(401).json({ error: 'Firma inválida' });
        }

        if (payload.event === 'payment.finished') {
            const ordenId = payload.data.order_id;

            // Verificar que la orden existe
            const { data: orden, error: ordenError } = await supabaseAdmin
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .single();

            if (ordenError || !orden) {
                console.error(`Orden no encontrada: ${ordenId}`);
                return res.status(404).json({ error: 'Orden no encontrada' });
            }

            if (orden.estado === 'completado') {
                console.log(`Orden ya completada: ${ordenId}`);
                return res.json({ success: true, message: 'Ya procesado' });
            }

            // Actualizar estado
            await supabaseAdmin
                .from('pagos_transmision')
                .update({
                    estado: 'completado',
                    pagado_en: new Date().toISOString()
                })
                .eq('id', ordenId);

            console.log(`✅ Pago completado: ${ordenId}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error en webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

// ================================================================
// 📝 SUSCRIPCIONES (NUEVO)
// ================================================================

// Crear suscripción
app.post('/api/suscripciones/crear', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { streamerId, precioMensual } = req.body;
        if (!streamerId || !precioMensual) {
            return res.status(400).json({ success: false, error: 'Datos inválidos' });
        }

        const { data, error } = await supabase
            .from('suscripciones')
            .insert({
                streamer_id: streamerId,
                espectador_id: user.id,
                precio_mensual: precioMensual,
                activo: true,
                proximo_pago: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error creando suscripción:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// 🚀 PROMOCIONES (NUEVO)
// ================================================================

// Activar promoción
app.post('/api/promociones/activar', async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { transmisionId, nivel, horas } = req.body;
        if (!transmisionId || !nivel || !horas) {
            return res.status(400).json({ success: false, error: 'Datos inválidos' });
        }

        const precios = { 1: 50, 2: 150, 3: 300 };
        const prioridades = { 1: 3, 2: 2, 3: 1 };
        const costo = precios[nivel] * horas;

        const { data, error } = await supabase
            .from('promociones_streamer')
            .insert({
                streamer_id: user.id,
                transmision_id: transmisionId,
                nivel_promocion: nivel,
                costo_promocion: costo,
                duracion_promocion: horas,
                posicion_prioridad: prioridades[nivel],
                activo: true
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error activando promoción:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// PERFIL (MANTENIDO)
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
// MURO (MANTENIDO)
// ================================================================

app.get('/api/muro', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error } = await supabaseAdmin
        .from('muro_posts')
        .select(`
            id, contenido, imagen_url, created_at,
            usuarios ( id, nombre, handle, avatar_url ),
            muro_likes ( count ),
            muro_comentarios ( count )
        `)
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, posts: data });
});

app.post('/api/muro', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { contenido, imagenUrl } = req.body;
    if (!contenido && !imagenUrl) {
        return res.status(400).json({ success: false, error: 'La publicación necesita texto o imagen' });
    }

    const { data, error } = await supabase
        .from('muro_posts')
        .insert({ usuario_id: user.id, contenido, imagen_url: imagenUrl })
        .select()
        .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, post: data });
});

app.delete('/api/muro/:postId', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { error } = await supabase
        .from('muro_posts')
        .delete()
        .eq('id', req.params.postId)
        .eq('usuario_id', user.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
});

app.post('/api/muro/:postId/like', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { error } = await supabase
        .from('muro_likes')
        .insert({ post_id: req.params.postId, usuario_id: user.id });

    if (error) {
        if (error.code === '23505') {
            return res.json({ success: true, message: 'Ya habías dado like' });
        }
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true });
});

app.delete('/api/muro/:postId/like', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { error } = await supabase
        .from('muro_likes')
        .delete()
        .eq('post_id', req.params.postId)
        .eq('usuario_id', user.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
});

app.get('/api/muro/:postId/comentarios', async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from('muro_comentarios')
        .select('id, contenido, created_at, usuarios ( id, nombre, handle, avatar_url )')
        .eq('post_id', req.params.postId)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, comentarios: data });
});

app.post('/api/muro/:postId/comentarios', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { contenido } = req.body;
    if (!contenido) return res.status(400).json({ success: false, error: 'Falta el contenido' });

    const { data, error } = await supabase
        .from('muro_comentarios')
        .insert({ post_id: req.params.postId, usuario_id: user.id, contenido })
        .select()
        .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, comentario: data });
});

// ================================================================
// CONTACTOS Y MENSAJES (MANTENIDOS)
// ================================================================

app.get('/api/contactos', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { data, error } = await supabase
        .from('contactos')
        .select('id, created_at, usuarios!contactos_contacto_id_fkey ( id, nombre, handle, avatar_url )')
        .eq('usuario_id', user.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, contactos: data });
});

app.post('/api/contactos', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { contactoId } = req.body;
    if (!contactoId) return res.status(400).json({ success: false, error: 'Falta contactoId' });

    const { data, error } = await supabase
        .from('contactos')
        .insert({ usuario_id: user.id, contacto_id: contactoId })
        .select()
        .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, contacto: data });
});

app.delete('/api/contactos/:contactoId', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { error } = await supabase
        .from('contactos')
        .delete()
        .eq('usuario_id', user.id)
        .eq('contacto_id', req.params.contactoId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
});

app.get('/api/mensajes/:contactoId', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { data, error } = await supabase
        .from('mensajes_chat')
        .select('*')
        .or(`and(remitente_id.eq.${user.id},destinatario_id.eq.${req.params.contactoId}),and(remitente_id.eq.${req.params.contactoId},destinatario_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, mensajes: data });
});

app.post('/api/mensajes', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { destinatarioId, contenido } = req.body;
    if (!destinatarioId || !contenido) {
        return res.status(400).json({ success: false, error: 'Faltan campos' });
    }

    const { data, error } = await supabase
        .from('mensajes_chat')
        .insert({ remitente_id: user.id, destinatario_id: destinatarioId, contenido })
        .select()
        .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, mensaje: data });
});

app.put('/api/mensajes/:mensajeId/leido', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { error } = await supabase
        .from('mensajes_chat')
        .update({ leido: true })
        .eq('id', req.params.mensajeId)
        .eq('destinatario_id', user.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
});

// ================================================================
// LIVE (MANTENIDO)
// ================================================================

app.get('/api/live/activos', async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from('live_streams')
        .select('id, room_name, titulo, viewers_count, started_at, usuarios ( id, nombre, handle, avatar_url )')
        .eq('is_live', true)
        .order('started_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, streams: data });
});

app.post('/api/live/iniciar', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { titulo } = req.body;
    const roomName = `live-${user.id}-${Date.now()}`;

    const { data, error } = await supabase
        .from('live_streams')
        .insert({ host_id: user.id, room_name: roomName, titulo })
        .select()
        .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, stream: data });
});

app.post('/api/live/:streamId/finalizar', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { error } = await supabase
        .from('live_streams')
        .update({ is_live: false, ended_at: new Date().toISOString() })
        .eq('id', req.params.streamId)
        .eq('host_id', user.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
});

// ================================================================
// ESIM / INTERNET (MANTENIDO)
// ================================================================

app.get('/api/esim/planes', async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from('planes_esim')
        .select('*')
        .eq('activo', true)
        .order('precio_mxn', { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, planes: data });
});

app.get('/api/esim/mis-suscripciones', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { data, error } = await supabase
        .from('suscripciones_esim')
        .select('*, planes_esim ( nombre, datos_gb, duracion_dias )')
        .eq('usuario_id', user.id)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, suscripciones: data });
});

app.post('/api/esim/orden', async (req, res) => {
    const supabase = clienteDelUsuario(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

    const { planId } = req.body;
    if (!planId) return res.status(400).json({ success: false, error: 'Falta planId' });

    const { data: plan, error: planError } = await supabaseAdmin
        .from('planes_esim')
        .select('precio_mxn')
        .eq('id', planId)
        .single();

    if (planError || !plan) {
        return res.status(404).json({ success: false, error: 'Plan no encontrado' });
    }

    const { data, error } = await supabaseAdmin
        .from('ordenes_esim')
        .insert({
            usuario_id: user.id,
            plan_id: planId,
            monto_mxn: plan.precio_mxn,
            estado_pago: 'pendiente'
        })
        .select()
        .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, orden: data });
});

// ================================================================
// RUTAS PRINCIPALES (HTML) - MANTENIDAS
// ================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
// RUTAS LEGALES - MANTENIDAS
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
        success: false,
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
    console.log(`🚂 Railway: https://galleta-domo.up.railway.app`);
    console.log(`========================================`);
});

module.exports = app;