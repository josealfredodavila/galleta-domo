/* ================================================================
   SERVER.JS - SARIEL'S BACKEND
   RAILWAY - VERSIÓN SEGURA CON SUPABASE RPC
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

if (!SUPABASE_URL) {
    console.error('❌ Falta SUPABASE_URL');
}
if (!SUPABASE_ANON_KEY) {
    console.error('❌ Falta SUPABASE_ANON_KEY');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY');
}

/* Service Role - SOLO BACKEND */
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
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

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'csarielcontacto@gmail.com').trim().toLowerCase();

async function verificarAdmin(req, res, next) {
    try {
        const user = await obtenerUsuario(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }
        const email = (user.email || '').trim().toLowerCase();
        if (!email || email !== ADMIN_EMAIL) {
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
            console.warn('⚠️ CORS_ORIGINS no configurado en producción. Rechazando:', origin);
            return callback(new Error('Origen no permitido por CORS'));
        }
        if (corsOrigins.includes(origin)) return callback(null, true);
        console.warn('⚠️ Origen no permitido por CORS:', origin);
        return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true
}));

app.use(morgan('combined'));

/* Rate limit general */
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

/* Rate limit específico para webhook */
const webhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados webhooks' }
});

/* Capturar body RAW para verificación de firma */
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

        const roomName = String(req.query.room || 'muro-live-general').trim();
        if (!roomName || roomName.length > 200) {
            return res.status(400).json({ success: false, error: 'Sala inválida' });
        }

        const { data: stream, error: streamError } = await supabaseAdmin
            .from('transmisiones')
            .select('streamer_id, estado')
            .eq('room_name', roomName)
            .maybeSingle();

        if (streamError) console.error('Error consultando transmisión:', streamError);

        const esStreamer = stream && stream.streamer_id === req.user.id && stream.estado === 'activa';

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            { identity: req.user.id }
        );

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: Boolean(esStreamer),
            canSubscribe: true,
            canPublishData: false
        });

        const token = await at.toJwt();
        return res.json({ success: true, token, streamer: Boolean(esStreamer), room: roomName });

    } catch (error) {
        console.error('❌ Error generando token LiveKit:', error);
        return res.status(500).json({ success: false, error: 'No se pudo generar el token' });
    }
});

/* ================================================================
   TOKENS
   ================================================================ */

app.get('/api/tokens', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('usuarios')
            .select('tokens')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;
        return res.json({ success: true, tokens: Number(data?.tokens || 0) });

    } catch (error) {
        console.error('❌ Error obteniendo tokens:', error);
        return res.status(500).json({ success: false, error: 'No se pudieron obtener los tokens' });
    }
});

/* Transferencia atómica - RPC transfer_tokens */
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

        const { data, error } = await supabaseAdmin.rpc('transfer_tokens', {
            p_sender_id: req.user.id,
            p_receiver_id: destinoId,
            p_cantidad: cantidadNumerica
        });

        if (error) {
            console.error('Error RPC transfer_tokens:', error);
            return res.status(500).json({ success: false, error: 'No se pudo completar la transferencia' });
        }

        return res.json({ success: true, message: `${cantidadNumerica} tokens transferidos`, data });

    } catch (error) {
        console.error('❌ Error transfiriendo tokens:', error);
        return res.status(500).json({ success: false, error: 'Error al transferir tokens' });
    }
});

/* ================================================================
   PAGOS - NOWPAYMENTS
   ================================================================ */

app.post('/api/pagos/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { transmisionId, monto, metodo, tipo, planId } = req.body;
        const montoNumerico = Number(monto);

        if (!montoNumerico || !Number.isFinite(montoNumerico) || montoNumerico <= 0) {
            return res.status(400).json({ success: false, error: 'Monto inválido' });
        }
        if (montoNumerico > 1000000) {
            return res.status(400).json({ success: false, error: 'Monto máximo excedido' });
        }

        let ordenData = {
            espectador_id: req.user.id,
            monto_pagado: montoNumerico,
            metodo_pago: metodo === 'crypto' ? 'crypto' : 'crypto',
            tipo_pago: tipo || 'acceso',
            estado: 'pendiente'
        };

        // Si es compra de eSIM
        if (tipo === 'esim' && planId) {
            const { data: plan, error: planError } = await supabaseAdmin
                .from('planes_esim')
                .select('*')
                .eq('id', planId)
                .single();

            if (planError || !plan) {
                return res.status(404).json({ success: false, error: 'Plan no encontrado' });
            }

            ordenData = {
                ...ordenData,
                plan_id: planId,
                cantidad_datos_gb: plan.datos_gb,
                monto_mxn: plan.precio_mxn,
                monto_usdt: plan.precio_usdt,
                tipo_pago: 'esim'
            };

            // Crear orden en ordenes_esim
            const { data: ordenESIM, error: ordenError } = await supabaseAdmin
                .from('ordenes_esim')
                .insert({
                    usuario_id: req.user.id,
                    plan_id: planId,
                    cantidad_datos_gb: plan.datos_gb,
                    monto_mxn: plan.precio_mxn,
                    monto_usdt: plan.precio_usdt,
                    estado_pago: 'pendiente'
                })
                .select()
                .single();

            if (ordenError) throw ordenError;

            // Crear registro en pagos_transmision vinculado
            const { data: pago, error: pagoError } = await supabaseAdmin
                .from('pagos_transmision')
                .insert({
                    transmision_id: null,
                    espectador_id: req.user.id,
                    monto_pagado: montoNumerico,
                    comision_sariels: montoNumerico * 0.02,
                    monto_streamer: montoNumerico * 0.98,
                    metodo_pago: 'crypto',
                    tipo_pago: 'esim',
                    estado: 'pendiente',
                    orden_esim_id: ordenESIM.id
                })
                .select()
                .single();

            if (pagoError) throw pagoError;

            ordenData = { ...ordenData, id: pago.id, orden_esim_id: ordenESIM.id };

        } else {
            // Pago de transmisión
            if (!transmisionId) {
                return res.status(400).json({ success: false, error: 'Falta transmisionId' });
            }

            const { data: transmision, error: transmisionError } = await supabaseAdmin
                .from('transmisiones')
                .select('id, streamer_id, estado')
                .eq('id', transmisionId)
                .maybeSingle();

            if (transmisionError) throw transmisionError;
            if (!transmision) {
                return res.status(404).json({ success: false, error: 'Transmisión no encontrada' });
            }
            if (transmision.streamer_id === req.user.id) {
                return res.status(400).json({ success: false, error: 'El streamer no puede pagarse a sí mismo' });
            }

            const comisionSariels = Math.round(montoNumerico * 0.02 * 100) / 100;
            const montoStreamer = Math.round((montoNumerico - comisionSariels) * 100) / 100;

            const { data: orden, error: ordenError } = await supabaseAdmin
                .from('pagos_transmision')
                .insert({
                    transmision_id: transmisionId,
                    espectador_id: req.user.id,
                    monto_pagado: montoNumerico,
                    comision_sariels: comisionSariels,
                    monto_streamer: montoStreamer,
                    metodo_pago: 'crypto',
                    tipo_pago: 'acceso',
                    estado: 'pendiente'
                })
                .select()
                .single();

            if (ordenError) throw ordenError;
            ordenData = { ...ordenData, id: orden.id };
        }

        if (!process.env.NOWPAYMENTS_API_KEY) {
            return res.json({ success: true, data: ordenData, warning: 'NOWPayments no configurado' });
        }

        // Crear pago en NOWPayments
        const ipnCallbackUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
        if (!ipnCallbackUrl) {
            console.warn('⚠️ NOWPAYMENTS_IPN_CALLBACK_URL no configurado');
        }

        const nowpaymentsPayload = {
            price_amount: montoNumerico,
            price_currency: 'usd',
            pay_currency: 'usdt',
            order_id: String(ordenData.id),
            order_description: tipo === 'esim' ? 'Compra eSIM' : `Pago transmisión ${transmisionId}`
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

        // Guardar payment_id en Supabase
        const paymentId = nowpayments.data?.payment_id;
        if (paymentId && ordenData.id) {
            await supabaseAdmin
                .from('pagos_transmision')
                .update({ payment_id: String(paymentId) })
                .eq('id', ordenData.id);
        }

        return res.json({
            success: true,
            data: {
                ...ordenData,
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

/* ================================================================
   ESTADO DE PAGO
   ================================================================ */

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
   WEBHOOK NOWPAYMENTS - VERSIÓN SEGURA
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

app.post('/api/webhooks/nowpayments', webhookLimiter, async (req, res) => {
    try {
        // ============================================
        // 1. VERIFICAR FIRMA IPN
        // ============================================

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

        // 🔥 SOLO usar rawBody, SIN fallback
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

        // Parsear body después de verificar firma
        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch (parseError) {
            console.error('❌ Error parseando webhook:', parseError);
            return res.status(400).json({ success: false, error: 'Body inválido' });
        }

        console.log('📡 Webhook NOWPayments recibido:', JSON.stringify(payload, null, 2));

        // ============================================
        // 2. VALIDAR DATOS DEL WEBHOOK
        // ============================================

        const paymentId = String(payload.payment_id || payload.data?.payment_id || '');
        const ordenId = String(payload.order_id || payload.data?.order_id || '');

        if (!paymentId || !ordenId) {
            console.warn('⚠️ Webhook sin payment_id o order_id');
            return res.status(400).json({ success: false, error: 'Faltan identificadores' });
        }

        // ============================================
        // 3. VALIDAR ESTADO DEL PAGO
        // ============================================

        const paymentStatus = String(
            payload.payment_status ||
            payload.data?.payment_status ||
            payload.status ||
            ''
        ).toLowerCase();

        const estadosValidosFinales = ['finished', 'confirmed'];
        const estadosValidosIntermedios = ['waiting', 'confirming', 'sending', 'partially_paid'];

        if (estadosValidosIntermedios.includes(paymentStatus)) {
            console.log(`ℹ️ Estado intermedio: ${paymentStatus}. Esperando confirmación.`);
            return res.json({ success: true, message: `Estado ${paymentStatus} - esperando confirmación` });
        }

        if (!estadosValidosFinales.includes(paymentStatus)) {
            console.log(`ℹ️ Estado no final: ${paymentStatus}. Ignorando.`);
            return res.json({ success: true, message: `Estado ${paymentStatus} ignorado` });
        }

        // ============================================
        // 4. VALIDAR MONTO
        // ============================================

        const montoRecibido = Number(payload.pay_amount || payload.data?.pay_amount || 0);
        const montoEsperado = Number(payload.price_amount || payload.data?.price_amount || 0);

        if (montoRecibido <= 0 && montoEsperado <= 0) {
            console.warn('⚠️ Webhook sin monto válido');
            return res.status(400).json({ success: false, error: 'Monto inválido' });
        }

        // ============================================
        // 5. BUSCAR ORDEN EN SUPABASE
        // ============================================

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

        // ============================================
        // 6. VERIFICAR IDEMPOTENCIA
        // ============================================

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed') {
            console.log(`ℹ️ Pago ${ordenId} ya procesado anteriormente`);
            return res.json({ success: true, message: 'Pago ya procesado' });
        }

        // Verificar payment_id único
        if (orden.payment_id && orden.payment_id !== paymentId) {
            console.warn(`⚠️ payment_id no coincide. Esperado: ${orden.payment_id}, Recibido: ${paymentId}`);
            return res.status(400).json({ success: false, error: 'payment_id no coincide' });
        }

        // ============================================
        // 7. VALIDAR MONTO CONTRA ORDEN
        // ============================================

        const montoOrden = Number(orden.monto_pagado);
        const montoUsar = montoRecibido > 0 ? montoRecibido : montoEsperado;

        if (Math.abs(montoUsar - montoOrden) > 0.01) {
            console.error(`❌ Monto no coincide. Orden: ${montoOrden}, Webhook: ${montoUsar}`);
            return res.status(400).json({
                success: false,
                error: 'Monto del pago no coincide con lo esperado'
            });
        }

        // ============================================
        // 8. PROCESAR PAGO - USANDO RPC TRANSACCIONAL
        // ============================================

        console.log(`✅ Procesando pago ${ordenId} - Estado final: ${paymentStatus}`);

        let resultado;

        if (orden.tipo_pago === 'esim' && orden.orden_esim_id) {
            // ✅ eSIM: Usar RPC para activar eSIM
            resultado = await supabaseAdmin.rpc('procesar_pago_esim', {
                p_orden_id: ordenId,
                p_payment_id: paymentId,
                p_estado: 'completado'
            });
        } else {
            // ✅ Transmisión: Usar RPC para acreditar acceso
            resultado = await supabaseAdmin.rpc('procesar_pago_transmision', {
                p_orden_id: ordenId,
                p_payment_id: paymentId,
                p_estado: 'completado'
            });
        }

        if (resultado.error) {
            console.error('❌ Error en RPC de procesamiento:', resultado.error);
            return res.status(500).json({
                success: false,
                error: 'Error procesando pago'
            });
        }

        console.log(`✅ Pago ${ordenId} procesado exitosamente`);

        return res.json({
            success: true,
            message: 'Pago procesado correctamente',
            data: resultado.data
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
   SUSCRIPCIONES
   ================================================================ */

app.post('/api/suscripciones/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { streamerId, precioMensual } = req.body;
        const precio = Number(precioMensual);

        if (!streamerId || !Number.isFinite(precio) || precio <= 0) {
            return res.status(400).json({ success: false, error: 'Datos inválidos' });
        }

        if (String(streamerId) === String(req.user.id)) {
            return res.status(400).json({ success: false, error: 'No puedes suscribirte a ti mismo' });
        }

        const { data: streamer } = await supabaseAdmin
            .from('usuarios')
            .select('id')
            .eq('id', streamerId)
            .maybeSingle();

        if (!streamer) {
            return res.status(404).json({ success: false, error: 'Streamer no encontrado' });
        }

        const { data, error } = await supabaseAdmin
            .from('suscripciones')
            .insert({
                streamer_id: streamerId,
                espectador_id: req.user.id,
                precio_mensual: precio,
                activo: true,
                proximo_pago: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        return res.json({ success: true, data });

    } catch (error) {
        console.error('❌ Error creando suscripción:', error);
        return res.status(500).json({ success: false, error: 'Error creando suscripción' });
    }
});

/* ================================================================
   PROMOCIONES
   ================================================================ */

app.post('/api/promociones/activar', verificarAutenticacion, async (req, res) => {
    try {
        const { transmisionId, nivel, horas } = req.body;
        const nivelNumero = Number(nivel);
        const horasNumero = Number(horas);

        const precios = { 1: 50, 2: 150, 3: 300 };
        const prioridades = { 1: 3, 2: 2, 3: 1 };

        if (!transmisionId || !precios[nivelNumero] || !Number.isFinite(horasNumero) || horasNumero <= 0 || horasNumero > 168) {
            return res.status(400).json({ success: false, error: 'Datos inválidos' });
        }

        const { data: transmision, error: transmisionError } = await supabaseAdmin
            .from('transmisiones')
            .select('id, streamer_id, estado')
            .eq('id', transmisionId)
            .maybeSingle();

        if (transmisionError) throw transmisionError;
        if (!transmision) {
            return res.status(404).json({ success: false, error: 'Transmisión no encontrada' });
        }
        if (transmision.streamer_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Solo el streamer puede activar la promoción' });
        }

        const costo = precios[nivelNumero] * horasNumero;

        const { data, error } = await supabaseAdmin
            .from('promociones_streamer')
            .insert({
                streamer_id: req.user.id,
                transmision_id: transmisionId,
                nivel_promocion: nivelNumero,
                costo_promocion: costo,
                duracion_promocion: horasNumero,
                posicion_prioridad: prioridades[nivelNumero],
                activo: true
            })
            .select()
            .single();

        if (error) throw error;

        return res.json({ success: true, data });

    } catch (error) {
        console.error('❌ Error activando promoción:', error);
        return res.status(500).json({ success: false, error: 'Error activando promoción' });
    }
});

/* ================================================================
   PERFIL
   ================================================================ */

app.get('/api/perfil', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('usuarios')
            .select('*')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            return res.json({ success: true, perfil: data });
        }

        return res.json({
            success: true,
            perfil: {
                id: req.user.id,
                nombre: 'Explorador',
                handle: 'explorador',
                bio: "Explorando el ecosistema Sariel's",
                avatar_url: null,
                tokens: 0
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

/* ================================================================
   MURO (TODAS LAS RUTAS EXISTENTES)
   ================================================================ */

// [TODAS LAS RUTAS DE MURO SE MANTIENEN SIN CAMBIOS]
// GET /api/muro
// POST /api/muro
// DELETE /api/muro/:postId
// POST /api/muro/:postId/like
// DELETE /api/muro/:postId/like
// GET /api/muro/:postId/comentarios
// POST /api/muro/:postId/comentarios

// ================================================================
// CONTACTOS (TODAS LAS RUTAS EXISTENTES)
// ================================================================

// GET /api/contactos
// POST /api/contactos
// DELETE /api/contactos/:contactoId

// ================================================================
// MENSAJES (TODAS LAS RUTAS EXISTENTES)
// ================================================================

// GET /api/mensajes/:contactoId
// POST /api/mensajes
// PUT /api/mensajes/:mensajeId/leido

// ================================================================
// LIVE (TODAS LAS RUTAS EXISTENTES)
// ================================================================

// GET /api/live/activos
// POST /api/live/iniciar
// POST /api/live/:streamId/finalizar

// ================================================================
// INTERNET - ESIM (TODAS LAS RUTAS EXISTENTES)
// ================================================================

// GET /api/esim/planes
// POST /api/esim/orden
// GET /api/esim/mis-suscripciones

// ================================================================
// ADMIN - PLANES ESIM (TODAS LAS RUTAS EXISTENTES)
// ================================================================

// GET /api/admin/planes
// POST /api/admin/planes
// PUT /api/admin/planes/:id
// DELETE /api/admin/planes/:id

// ================================================================
// RUTAS HTML (TODAS EXISTENTES)
// ================================================================

// [TODAS LAS RUTAS HTML SE MANTIENEN]

// ================================================================
// MANEJO DE ERRORES
// ================================================================

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
    console.log(`🔐 Admin: ${ADMIN_EMAIL}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
});

module.exports = app;