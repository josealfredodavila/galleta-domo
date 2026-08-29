/* ================================================================
   SERVER.JS - SARIEL'S BACKEND
   VERSIÓN FINAL - PRODUCCIÓN SEGURA
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
   PAGOS - NOWPAYMENTS - VERSIÓN SEGURA FINAL
   ================================================================ */

app.post('/api/pagos/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { transmisionId, tipo, planId } = req.body;

        // ============================================
        // 1. VALIDAR Y OBTENER PRECIO OFICIAL DEL SERVIDOR
        // ============================================

        let precioOficial = 0;
        let monedaOficial = 'usdt';
        let ordenData = {};
        let esimPlan = null;
        let transmisionData = null;

        if (tipo === 'esim' && planId) {
            // ✅ eSIM: Precio desde la base de datos
            const { data: plan, error: planError } = await supabaseAdmin
                .from('planes_esim')
                .select('*')
                .eq('id', planId)
                .eq('activo', true)
                .single();

            if (planError || !plan) {
                return res.status(404).json({ success: false, error: 'Plan no encontrado o inactivo' });
            }

            esimPlan = plan;
            precioOficial = Number(plan.precio_usdt);
            monedaOficial = 'usdt';

            // Crear orden eSIM
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

            // Crear registro en pagos_transmision
            const { data: pago, error: pagoError } = await supabaseAdmin
                .from('pagos_transmision')
                .insert({
                    transmision_id: null,
                    espectador_id: req.user.id,
                    monto_pagado: precioOficial,
                    comision_sariels: precioOficial * 0.02,
                    monto_streamer: precioOficial * 0.98,
                    metodo_pago: 'crypto',
                    tipo_pago: 'esim',
                    estado: 'pendiente',
                    orden_esim_id: ordenESIM.id,
                    moneda: monedaOficial
                })
                .select()
                .single();

            if (pagoError) throw pagoError;
            ordenData = { ...pago, orden_esim_id: ordenESIM.id, plan: esimPlan };

        } else if (transmisionId) {
            // ✅ Transmisión: Precio desde la base de datos
            const { data: transmision, error: transmisionError } = await supabaseAdmin
                .from('transmisiones')
                .select('id, streamer_id, estado, precio_acceso')
                .eq('id', transmisionId)
                .maybeSingle();

            if (transmisionError) throw transmisionError;
            if (!transmision) {
                return res.status(404).json({ success: false, error: 'Transmisión no encontrada' });
            }
            if (transmision.streamer_id === req.user.id) {
                return res.status(400).json({ success: false, error: 'El streamer no puede pagarse a sí mismo' });
            }
            if (transmision.estado !== 'activa') {
                return res.status(400).json({ success: false, error: 'La transmisión no está activa' });
            }

            transmisionData = transmision;
            precioOficial = Number(transmision.precio_acceso || 4.50);
            monedaOficial = 'usdt';

            const comisionSariels = Math.round(precioOficial * 0.02 * 100) / 100;
            const montoStreamer = Math.round((precioOficial - comisionSariels) * 100) / 100;

            const { data: orden, error: ordenError } = await supabaseAdmin
                .from('pagos_transmision')
                .insert({
                    transmision_id: transmisionId,
                    espectador_id: req.user.id,
                    monto_pagado: precioOficial,
                    comision_sariels: comisionSariels,
                    monto_streamer: montoStreamer,
                    metodo_pago: 'crypto',
                    tipo_pago: 'acceso',
                    estado: 'pendiente',
                    moneda: monedaOficial
                })
                .select()
                .single();

            if (ordenError) throw ordenError;
            ordenData = orden;

        } else {
            return res.status(400).json({
                success: false,
                error: 'Se requiere transmisionId o tipo=esim con planId'
            });
        }

        // ============================================
        // 2. CREAR PAGO EN NOWPAYMENTS CON PRECIO OFICIAL
        // ============================================

        if (!process.env.NOWPAYMENTS_API_KEY) {
            return res.json({ success: true, data: ordenData, warning: 'NOWPayments no configurado' });
        }

        const ipnCallbackUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
        if (!ipnCallbackUrl) {
            console.warn('⚠️ NOWPAYMENTS_IPN_CALLBACK_URL no configurado');
        }

        const nowpaymentsPayload = {
            price_amount: precioOficial,
            price_currency: 'usd',
            pay_currency: 'usdt',
            order_id: String(ordenData.id),
            order_description: tipo === 'esim' 
                ? `Compra eSIM ${esimPlan?.nombre || ''}` 
                : `Pago transmisión ${transmisionId || ''}`
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
        if (paymentId && ordenData.id) {
            // ✅ Guardar payment_id en la orden
            const { error: updateError } = await supabaseAdmin
                .from('pagos_transmision')
                .update({ 
                    payment_id: paymentId,
                    payment_url: nowpayments.data?.payment_url || null
                })
                .eq('id', ordenData.id);

            if (updateError) {
                console.error('❌ Error guardando payment_id:', updateError);
                // No devolver éxito si falla guardar payment_id
                return res.status(500).json({
                    success: false,
                    error: 'Error guardando información del pago'
                });
            }
        }

        return res.json({
            success: true,
            data: {
                ...ordenData,
                payment_url: nowpayments.data?.payment_url || null,
                payment_id: paymentId || null,
                precio_oficial: precioOficial,
                moneda: monedaOficial
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
   WEBHOOK NOWPAYMENTS - VERSIÓN FINAL SEGURA
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

        // Parsear body
        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch (parseError) {
            console.error('❌ Error parseando webhook:', parseError);
            return res.status(400).json({ success: false, error: 'Body inválido' });
        }

        // ============================================
        // 2. EXTRAER DATOS DEL WEBHOOK
        // ============================================

        const paymentId = String(payload.payment_id || payload.data?.payment_id || '');
        const ordenId = String(payload.order_id || payload.data?.order_id || '');
        const paymentStatus = String(
            payload.payment_status ||
            payload.data?.payment_status ||
            payload.status ||
            ''
        ).toLowerCase();

        // ============================================
        // 3. LOG SEGURO
        // ============================================

        console.log(`📡 Webhook: payment_id=${paymentId}, order_id=${ordenId}, status=${paymentStatus}`);

        // ============================================
        // 4. VALIDAR IDENTIFICADORES
        // ============================================

        if (!paymentId || !ordenId) {
            console.warn('⚠️ Webhook sin payment_id o order_id');
            return res.status(400).json({ success: false, error: 'Faltan identificadores' });
        }

        // ============================================
        // 5. VALIDAR ESTADO - MÁQUINA DE ESTADOS
        // ============================================

        const estadosFinales = ['finished', 'confirmed'];
        const estadosIntermedios = ['waiting', 'confirming', 'sending', 'partially_paid'];
        const estadosFallidos = ['failed', 'refunded', 'expired', 'cancelled'];

        if (estadosIntermedios.includes(paymentStatus)) {
            console.log(`ℹ️ Estado intermedio: ${paymentStatus}`);
            return res.json({ success: true, message: `Estado ${paymentStatus} - esperando confirmación` });
        }

        if (estadosFallidos.includes(paymentStatus)) {
            console.log(`⚠️ Estado fallido: ${paymentStatus}. No se acredita.`);
            await supabaseAdmin
                .from('pagos_transmision')
                .update({ 
                    estado: 'fallido',
                    datos_webhook: { payment_id: paymentId, status: paymentStatus, fecha: new Date().toISOString() }
                })
                .eq('id', ordenId)
                .eq('estado', 'pendiente');
            
            return res.json({ success: true, message: `Estado ${paymentStatus} - no acreditar` });
        }

        if (!estadosFinales.includes(paymentStatus)) {
            console.log(`ℹ️ Estado desconocido: ${paymentStatus}. Ignorando.`);
            return res.json({ success: true, message: `Estado ${paymentStatus} ignorado` });
        }

        // ============================================
        // 6. BUSCAR ORDEN EN SUPABASE
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
        // 7. VERIFICAR IDEMPOTENCIA - CON BLOQUEO
        // ============================================

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed') {
            console.log(`ℹ️ Pago ${ordenId} ya procesado anteriormente`);
            return res.json({ success: true, message: 'Pago ya procesado' });
        }

        // Validar payment_id
        if (orden.payment_id && orden.payment_id !== paymentId) {
            console.warn(`⚠️ payment_id no coincide. Esperado: ${orden.payment_id}, Recibido: ${paymentId}`);
            return res.status(400).json({ success: false, error: 'payment_id no coincide' });
        }

        // ============================================
        // 8. VALIDAR MONTO - CONTRA ORDEN
        // ============================================

        const montoRecibido = Number(payload.pay_amount || payload.data?.pay_amount || 0);
        const montoEsperado = Number(payload.price_amount || payload.data?.price_amount || 0);
        const monedaRecibida = String(payload.pay_currency || payload.data?.pay_currency || '').toLowerCase();
        const monedaEsperada = String(payload.price_currency || payload.data?.price_currency || '').toLowerCase();
        const monedaOrden = String(orden.moneda || 'usdt').toLowerCase();

        const montoWebhook = montoRecibido > 0 ? montoRecibido : montoEsperado;
        const montoOrden = Number(orden.monto_pagado);

        // ✅ Validación estricta de moneda
        // La moneda recibida debe coincidir con la moneda de la orden
        // NOWPayments puede devolver USDT como pay_currency incluso si pedimos USD
        const monedasValidas = ['usdt', 'usd', 'usdc'];
        
        if (!monedasValidas.includes(monedaRecibida) || !monedasValidas.includes(monedaOrden)) {
            console.error(`❌ Moneda no soportada. Orden: ${monedaOrden}, Webhook: ${monedaRecibida}`);
            return res.status(400).json({
                success: false,
                error: `Moneda no soportada`
            });
        }

        // Validar que la moneda coincida
        if (monedaRecibida !== monedaOrden) {
            // Solo permitir USD/USDT como equivalentes si la orden está en USD
            if (!(monedaOrden === 'usd' && monedaRecibida === 'usdt') &&
                !(monedaOrden === 'usdt' && monedaRecibida === 'usd')) {
                console.error(`❌ Moneda no coincide. Orden: ${monedaOrden}, Webhook: ${monedaRecibida}`);
                return res.status(400).json({
                    success: false,
                    error: `Moneda no coincide: orden ${monedaOrden} vs webhook ${monedaRecibida}`
                });
            }
        }

        // Validar monto con tolerancia
        if (Math.abs(montoWebhook - montoOrden) > 0.01) {
            console.error(`❌ Monto no coincide. Orden: ${montoOrden} ${monedaOrden}, Webhook: ${montoWebhook} ${monedaRecibida}`);
            return res.status(400).json({
                success: false,
                error: 'Monto del pago no coincide con lo esperado'
            });
        }

        // ============================================
        // 9. PROCESAR PAGO - RPC INTERNA
        // ============================================

        console.log(`✅ Procesando pago ${ordenId} - Estado: ${paymentStatus}`);

        let resultado;

        if (orden.tipo_pago === 'esim' && orden.orden_esim_id) {
            resultado = await supabaseAdmin.rpc('procesar_pago_esim_webhook', {
                p_orden_id: parseInt(ordenId),
                p_payment_id: paymentId,
                p_estado: 'completado'
            });
        } else {
            resultado = await supabaseAdmin.rpc('procesar_pago_transmision_webhook', {
                p_orden_id: parseInt(ordenId),
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

        if (!resultado.data || !resultado.data.success) {
            console.error('❌ RPC devolvió error:', resultado.data?.error || 'Error desconocido');
            return res.status(500).json({
                success: false,
                error: resultado.data?.error || 'Error procesando pago'
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
   MURO - TODAS LAS RUTAS EXISTENTES
   ================================================================ */

app.get('/api/muro', async (req, res) => {
    try {
        let page = parseInt(req.query.page, 10) || 1;
        let limit = parseInt(req.query.limit, 10) || 20;
        page = Math.max(1, page);
        limit = Math.min(100, Math.max(1, limit));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error } = await supabaseAdmin
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

        const { data, error } = await supabaseAdmin
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
        const { error } = await supabaseAdmin
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
        const { error } = await supabaseAdmin
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
        const { error } = await supabaseAdmin
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
        const { data, error } = await supabaseAdmin
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
        const contenido = String(req.body.contenido || '').trim();
        if (!contenido) {
            return res.status(400).json({ success: false, error: 'Falta el contenido' });
        }
        if (contenido.length > 2000) {
            return res.status(400).json({ success: false, error: 'El comentario es demasiado largo' });
        }

        const { data, error } = await supabaseAdmin
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
   CONTACTOS
   ================================================================ */

app.get('/api/contactos', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('contactos')
            .select(`
                id, created_at,
                usuarios!contactos_contacto_id_fkey (id, nombre, handle, avatar_url)
            `)
            .eq('usuario_id', req.user.id);

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
                contacto_id: contactoId
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.json({ success: true, message: 'El contacto ya existe' });
            }
            throw error;
        }
        return res.json({ success: true, contacto: data });

    } catch (error) {
        console.error('❌ Error agregando contacto:', error);
        return res.status(500).json({ success: false, error: 'Error agregando contacto' });
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
        const destinatarioId = req.body.destinatarioId;
        const contenido = String(req.body.contenido || '').trim();

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
   LIVE
   ================================================================ */

app.get('/api/live/activos', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
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
        const titulo = String(req.body.titulo || "Live en Sariel's").trim().slice(0, 200);
        const categoria = String(req.body.categoria || 'Charla').trim().slice(0, 100);

        const { data: liveActivo, error: activoError } = await supabaseAdmin
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

        const { data, error } = await supabaseAdmin
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
        const { data, error } = await supabaseAdmin
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
   INTERNET - ESIM
   ================================================================ */

app.get('/api/esim/planes', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
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
        const { planId } = req.body;
        if (!planId) {
            return res.status(400).json({ success: false, error: 'Se requiere planId' });
        }

        const { data: plan, error: planError } = await supabaseAdmin
            .from('planes_esim')
            .select('*')
            .eq('id', planId)
            .maybeSingle();

        if (planError) throw planError;
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan no encontrado' });
        }
        if (!plan.activo) {
            return res.status(400).json({ success: false, error: 'Este plan no está disponible actualmente' });
        }

        const { data: orden, error: ordenError } = await supabaseAdmin
            .from('ordenes_esim')
            .insert({
                usuario_id: req.user.id,
                plan_id: plan.id,
                cantidad_datos_gb: plan.datos_gb,
                monto_mxn: plan.precio_mxn,
                monto_usdt: plan.precio_usdt,
                estado_pago: 'pendiente'
            })
            .select()
            .single();

        if (ordenError) throw ordenError;

        return res.json({
            success: true,
            orden: {
                id: orden.id,
                plan: plan.nombre,
                datos_gb: plan.datos_gb,
                duracion_dias: plan.duracion_dias,
                monto_mxn: plan.precio_mxn,
                monto_usdt: plan.precio_usdt,
                estado: orden.estado_pago
            },
            mensaje: 'Orden creada. Pendiente de pago.'
        });

    } catch (error) {
        console.error('❌ Error creando orden eSIM:', error);
        return res.status(500).json({ success: false, error: 'Error creando orden' });
    }
});

app.get('/api/esim/mis-suscripciones', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
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
   RUTAS HTML
   ================================================================ */

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
   MANEJO DE ERRORES
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
    console.log(`🔐 Admin: ${ADMIN_EMAIL}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
});

module.exports = app;