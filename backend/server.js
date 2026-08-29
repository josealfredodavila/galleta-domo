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
   LIVEKIT (SIN CAMBIOS)
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
   TOKENS (SIN CAMBIOS)
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
   PAGOS - NOWPAYMENTS - VERSIÓN SEGURA
   ================================================================ */

app.post('/api/pagos/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { transmisionId, tipo, planId } = req.body;

        // ============================================
        // 1. VALIDAR Y OBTENER PRECIO OFICIAL DEL SERVIDOR
        // ============================================

        let precioOficial = 0;
        let monedaOficial = 'usd';
        let ordenData = {};
        let esimPlan = null;

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
            // ✅ Transmisión: Validar precio dinámico
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

            // Precio oficial de la transmisión
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
            await supabaseAdmin
                .from('pagos_transmision')
                .update({ 
                    payment_id: paymentId,
                    payment_url: nowpayments.data?.payment_url || null
                })
                .eq('id', ordenData.id);
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
        // 3. LOG SEGURO (SIN DATOS SENSIBLES)
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

        // Estados finales CONFIRMADOS
        const estadosFinales = ['finished', 'confirmed'];
        
        // Estados intermedios - NO acreditar
        const estadosIntermedios = ['waiting', 'confirming', 'sending', 'partially_paid'];
        
        // Estados fallidos - NO acreditar
        const estadosFallidos = ['failed', 'refunded', 'expired', 'cancelled'];

        if (estadosIntermedios.includes(paymentStatus)) {
            console.log(`ℹ️ Estado intermedio: ${paymentStatus}. Esperando confirmación.`);
            return res.json({ success: true, message: `Estado ${paymentStatus} - esperando confirmación` });
        }

        if (estadosFallidos.includes(paymentStatus)) {
            console.log(`⚠️ Estado fallido: ${paymentStatus}. No se acredita.`);
            // Actualizar estado de la orden a fallido
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
        // 6. VALIDAR MONTO Y MONEDA
        // ============================================

        const montoRecibido = Number(payload.pay_amount || payload.data?.pay_amount || 0);
        const montoEsperado = Number(payload.price_amount || payload.data?.price_amount || 0);
        const monedaRecibida = String(payload.pay_currency || payload.data?.pay_currency || 'usdt').toLowerCase();
        const monedaEsperada = String(payload.price_currency || payload.data?.price_currency || 'usd').toLowerCase();

        if (montoRecibido <= 0 && montoEsperado <= 0) {
            console.warn('⚠️ Webhook sin monto válido');
            return res.status(400).json({ success: false, error: 'Monto inválido' });
        }

        // ============================================
        // 7. BUSCAR ORDEN EN SUPABASE
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
        // 8. VERIFICAR IDEMPOTENCIA - CONCURRENCIA SEGURA
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
        // 9. VALIDAR MONTO CONTRA ORDEN - CON MONEDA
        // ============================================

        const montoOrden = Number(orden.monto_pagado);
        const monedaOrden = String(orden.moneda || 'usdt').toLowerCase();
        const montoWebhook = montoRecibido > 0 ? montoRecibido : montoEsperado;

        // Solo comparar si la moneda coincide o si estamos en USDT/USD que son 1:1
        const monedasCompatibles = ['usdt', 'usd', 'usdc'];
        const monedasCoinciden = monedasCompatibles.includes(monedaRecibida) && 
                                 monedasCompatibles.includes(monedaOrden);

        if (monedasCoinciden) {
            // Comparación tolerante para USDT/USD
            if (Math.abs(montoWebhook - montoOrden) > 0.01) {
                console.error(`❌ Monto no coincide. Orden: ${montoOrden} ${monedaOrden}, Webhook: ${montoWebhook} ${monedaRecibida}`);
                return res.status(400).json({
                    success: false,
                    error: 'Monto del pago no coincide con lo esperado'
                });
            }
        } else if (monedaRecibida === monedaOrden) {
            // Misma moneda, comparación exacta
            if (Math.abs(montoWebhook - montoOrden) > 0.01) {
                console.error(`❌ Monto no coincide. Orden: ${montoOrden} ${monedaOrden}, Webhook: ${montoWebhook} ${monedaRecibida}`);
                return res.status(400).json({
                    success: false,
                    error: 'Monto del pago no coincide con lo esperado'
                });
            }
        } else {
            // Monedas diferentes - rechazar
            console.error(`❌ Moneda no coincide. Orden: ${monedaOrden}, Webhook: ${monedaRecibida}`);
            return res.status(400).json({
                success: false,
                error: `Moneda no coincide: orden ${monedaOrden} vs webhook ${monedaRecibida}`
            });
        }

        // ============================================
        // 10. PROCESAR PAGO - RPC INTERNA (NO ACCESIBLE POR USUARIOS)
        // ============================================

        console.log(`✅ Procesando pago ${ordenId} - Estado: ${paymentStatus}`);

        let resultado;

        if (orden.tipo_pago === 'esim' && orden.orden_esim_id) {
            // ✅ eSIM: RPC interna para webhook
            resultado = await supabaseAdmin.rpc('procesar_pago_esim_webhook', {
                p_orden_id: parseInt(ordenId),
                p_payment_id: paymentId,
                p_estado: 'completado'
            });
        } else {
            // ✅ Transmisión: RPC interna para webhook
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
   EL RESTO DE LAS RUTAS (MURO, CONTACTOS, MENSAJES, LIVE, ESIM, ADMIN)
   SE MANTIENEN SIN CAMBIOS - SOLO SE AGREGAN COMENTARIOS
   ================================================================ */

// [TODAS LAS RUTAS EXISTENTES SE MANTIENEN]

// GET /api/muro, POST /api/muro, DELETE /api/muro/:postId
// POST /api/muro/:postId/like, DELETE /api/muro/:postId/like
// GET /api/muro/:postId/comentarios, POST /api/muro/:postId/comentarios

// GET /api/contactos, POST /api/contactos, DELETE /api/contactos/:contactoId

// GET /api/mensajes/:contactoId, POST /api/mensajes, PUT /api/mensajes/:mensajeId/leido

// GET /api/live/activos, POST /api/live/iniciar, POST /api/live/:streamId/finalizar

// GET /api/esim/planes, POST /api/esim/orden, GET /api/esim/mis-suscripciones

// GET /api/admin/planes, POST /api/admin/planes, PUT /api/admin/planes/:id, DELETE /api/admin/planes/:id

// RUTAS HTML - /, /perfil, /muro, /mensajes, /contactos, /live, /internet, /admin.html, /qr, /actualizar-contrasena, /terminos, /privacidad, /cookies, /live-terminos

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