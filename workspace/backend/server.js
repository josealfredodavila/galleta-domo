/* ================================================================
   SERVER.JS - SARIEL'S BACKEND
   VERSIÓN FINAL DE PRODUCCIÓN
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
const { v4: uuidv4 } = require('uuid');
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

/* Service Role - SOLO para webhooks y admin */
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
   ADMINISTRADOR - CON FUNCIÓN SEGURA
   ================================================================ */

async function verificarAdmin(req, res, next) {
    try {
        const user = await obtenerUsuario(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        // Usar RPC segura para verificar rol (sin RLS recursivo)
        const { data, error } = await supabaseAdmin.rpc('private.is_admin', {
            p_user_id: user.id
        });

        if (error || !data) {
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

        const roomName = String(req.query.room || '').trim();
        if (!roomName || roomName.length > 200) {
            return res.status(400).json({ success: false, error: 'Sala inválida' });
        }

        // Verificar que la room existe y está activa
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
   TOKENS - SOLO LECTURA
   ================================================================ */

app.get('/api/tokens', verificarAutenticacion, async (req, res) => {
    try {
        const supabase = clienteDelUsuario(req);
        const { data, error } = await supabase
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

/* ================================================================
   TRANSFERENCIA DE Es.toks - CON LEDGER
   ================================================================ */

app.post('/api/tokens/transferir', verificarAutenticacion, async (req, res) => {
    try {
        const { destinoId, cantidad, idempotency_key } = req.body;
        
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

        const key = idempotency_key || `transfer_${req.user.id}_${destinoId}_${Date.now()}`;

        const { data, error } = await supabaseAdmin.rpc('private.transferir_es_toks', {
            p_sender_id: req.user.id,
            p_receiver_id: destinoId,
            p_cantidad: cantidadNumerica,
            p_idempotency_key: key
        });

        if (error) {
            console.error('Error RPC transferir_es_toks:', error);
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
   eSIM - CREAR ORDEN (SOLO UNA VEZ)
   ================================================================ */

app.post('/api/esim/orden', verificarAutenticacion, async (req, res) => {
    try {
        const { planId, idempotency_key } = req.body;
        
        if (!planId) {
            return res.status(400).json({ success: false, error: 'Se requiere planId' });
        }

        const key = idempotency_key || `esim_${req.user.id}_${planId}_${Date.now()}`;

        // Usar RPC para crear orden con idempotencia
        const { data, error } = await supabaseAdmin.rpc('private.crear_orden_esim', {
            p_usuario_id: req.user.id,
            p_plan_id: parseInt(planId),
            p_idempotency_key: key
        });

        if (error) {
            console.error('Error RPC crear_orden_esim:', error);
            return res.status(500).json({ success: false, error: 'Error creando orden' });
        }

        if (!data.success) {
            return res.status(400).json({ success: false, error: data.error });
        }

        return res.json({
            success: true,
            orden: data.orden,
            mensaje: data.mensaje || 'Orden creada. Procede al pago.'
        });

    } catch (error) {
        console.error('❌ Error creando orden eSIM:', error);
        return res.status(500).json({ success: false, error: 'Error creando orden' });
    }
});

/* ================================================================
   PAGOS - CREAR PAGO (CON IDEMPOTENCIA)
   ================================================================ */

app.post('/api/pagos/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { transmisionId, tipo, planId, ordenEsimId, idempotency_key } = req.body;

        if (!idempotency_key) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere idempotency_key'
            });
        }

        let precioOficialUSDT = 0;
        let precioOficialUSD = 0;
        let ordenData = {};
        let ordenEsimId = null;

        // ============================================
        // 1. DETERMINAR PRECIO OFICIAL
        // ============================================

        if (tipo === 'esim') {
            // ✅ Usar orden existente o crear nueva
            if (ordenEsimId) {
                // Verificar que la orden pertenece al usuario
                const { data: orden, error: ordenError } = await supabaseAdmin
                    .from('ordenes_esim')
                    .select('*')
                    .eq('id', ordenEsimId)
                    .eq('usuario_id', req.user.id)
                    .single();

                if (ordenError || !orden) {
                    return res.status(404).json({ success: false, error: 'Orden no encontrada' });
                }

                ordenEsimId = orden.id;
                
                // Obtener precio del plan
                const { data: plan, error: planError } = await supabaseAdmin
                    .from('planes_esim')
                    .select('precio_usdt')
                    .eq('id', orden.plan_id)
                    .single();

                if (planError) throw planError;
                precioOficialUSDT = Number(plan.precio_usdt);
                precioOficialUSD = Number(plan.precio_usdt);

            } else if (planId) {
                // Crear nueva orden eSIM (idempotente)
                const { data: ordenResult, error: ordenError } = await supabaseAdmin.rpc(
                    'private.crear_orden_esim',
                    {
                        p_usuario_id: req.user.id,
                        p_plan_id: parseInt(planId),
                        p_idempotency_key: idempotency_key
                    }
                );

                if (ordenError) throw ordenError;
                if (!ordenResult.success) {
                    return res.status(400).json({ success: false, error: ordenResult.error });
                }

                ordenEsimId = ordenResult.orden.id;
                precioOficialUSDT = Number(ordenResult.orden.monto_usdt);
                precioOficialUSD = Number(ordenResult.orden.monto_usdt);
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Se requiere ordenEsimId o planId'
                });
            }

        } else if (tipo === 'live' || tipo === 'acceso') {
            // ✅ Transmisión
            if (!transmisionId) {
                return res.status(400).json({ success: false, error: 'Se requiere transmisionId' });
            }

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

            precioOficialUSDT = Number(transmision.precio_acceso || 4.50);
            precioOficialUSD = Number(transmision.precio_acceso || 4.50);

        } else {
            return res.status(400).json({
                success: false,
                error: 'Tipo de pago no válido. Use: esim, live, acceso'
            });
        }

        // ============================================
        // 2. CREAR ORDEN DE PAGO
        // ============================================

        const comisionSariels = Math.round(precioOficialUSDT * 0.02 * 100) / 100;
        const montoStreamer = Math.round((precioOficialUSDT - comisionSariels) * 100) / 100;

        const pagoData = {
            espectador_id: req.user.id,
            monto_pagado: precioOficialUSDT,
            monto_usd_esperado: precioOficialUSD,
            comision_sariels: comisionSariels,
            monto_streamer: montoStreamer,
            metodo_pago: 'crypto',
            tipo_pago: tipo === 'esim' ? 'esim' : 'acceso',
            estado: 'pendiente',
            moneda_orden: 'USDT',
            moneda_pago_esperada: 'USDT',
            idempotency_key: idempotency_key
        };

        if (tipo === 'esim' && ordenEsimId) {
            pagoData.orden_esim_id = ordenEsimId;
            pagoData.transmision_id = null;
        } else if (transmisionId) {
            pagoData.transmision_id = transmisionId;
            pagoData.orden_esim_id = null;
        }

        // Verificar idempotencia - buscar pago existente con misma key
        const { data: pagoExistente, error: pagoExistenteError } = await supabaseAdmin
            .from('pagos_transmision')
            .select('*')
            .eq('idempotency_key', idempotency_key)
            .eq('espectador_id', req.user.id)
            .maybeSingle();

        if (pagoExistenteError) throw pagoExistenteError;

        if (pagoExistente) {
            // Reutilizar pago existente
            ordenData = pagoExistente;
            
            // Si ya tiene payment_id, devolver sin crear nuevo NOWPayments
            if (pagoExistente.payment_id) {
                return res.json({
                    success: true,
                    data: {
                        ...pagoExistente,
                        payment_url: pagoExistente.payment_url || null,
                        payment_id: pagoExistente.payment_id || null,
                        ya_existente: true
                    }
                });
            }
        } else {
            // Crear nuevo pago
            const { data: pago, error: pagoError } = await supabaseAdmin
                .from('pagos_transmision')
                .insert(pagoData)
                .select()
                .single();

            if (pagoError) throw pagoError;
            ordenData = pago;
        }

        // ============================================
        // 3. CREAR PAGO EN NOWPAYMENTS
        // ============================================

        if (!process.env.NOWPAYMENTS_API_KEY) {
            return res.json({ success: true, data: ordenData, warning: 'NOWPayments no configurado' });
        }

        const ipnCallbackUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
        if (!ipnCallbackUrl) {
            console.warn('⚠️ NOWPAYMENTS_IPN_CALLBACK_URL no configurado');
        }

        const nowpaymentsPayload = {
            price_amount: precioOficialUSD,
            price_currency: 'usd',
            pay_currency: 'usdt',
            order_id: String(ordenData.id),
            order_description: tipo === 'esim' 
                ? `Compra eSIM - Orden ${ordenEsimId || 'N/A'}` 
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
        if (paymentId && ordenData.id) {
            const { error: updateError } = await supabaseAdmin
                .from('pagos_transmision')
                .update({ 
                    payment_id: paymentId,
                    payment_url: nowpayments.data?.payment_url || null,
                    price_amount_enviado: precioOficialUSD,
                    price_currency_enviado: 'usd',
                    pay_currency_enviado: 'usdt'
                })
                .eq('id', ordenData.id);

            if (updateError) {
                console.error('❌ Error guardando payment_id:', updateError);
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
                precio_usd: precioOficialUSD,
                precio_usdt_esperado: precioOficialUSDT
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
   WEBHOOK NOWPAYMENTS - VERSIÓN FINAL
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
                headers: {
                    'x-api-key': apiKey
                },
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
        // 2. EXTRAER DATOS
        // ============================================

        const paymentId = String(payload.payment_id || payload.data?.payment_id || '');
        const ordenId = String(payload.order_id || payload.data?.order_id || '');
        const paymentStatus = String(
            payload.payment_status ||
            payload.data?.payment_status ||
            payload.status ||
            ''
        ).toLowerCase();

        console.log(`📡 Webhook: payment_id=${paymentId}, order_id=${ordenId}, status=${paymentStatus}`);

        // ============================================
        // 3. VALIDAR IDENTIFICADORES
        // ============================================

        if (!paymentId || !ordenId) {
            console.warn('⚠️ Webhook sin payment_id o order_id');
            return res.status(400).json({ success: false, error: 'Faltan identificadores' });
        }

        // ============================================
        // 4. VALIDAR ESTADO
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
        // 5. VERIFICAR CON NOWPAYMENTS (server-to-server)
        // ============================================

        const paymentInfo = await verificarPagoNOWPayments(paymentId);
        if (!paymentInfo) {
            console.error('❌ No se pudo verificar el pago con NOWPayments');
            return res.status(502).json({ success: false, error: 'Error verificando pago con proveedor' });
        }

        // Validar que el estado coincide
        const statusFromAPI = String(paymentInfo.payment_status || '').toLowerCase();
        if (statusFromAPI !== paymentStatus) {
            console.warn(`⚠️ Estado no coincide. Webhook: ${paymentStatus}, API: ${statusFromAPI}`);
            // Usar el estado de la API como fuente de verdad
            if (!estadosFinales.includes(statusFromAPI)) {
                console.log(`ℹ️ Estado API no final: ${statusFromAPI}. Esperando.`);
                return res.json({ success: true, message: `Estado API: ${statusFromAPI} - esperando confirmación` });
            }
        }

        // ============================================
        // 6. BUSCAR ORDEN
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
        // 7. IDEMPOTENCIA
        // ============================================

        if (orden.estado === 'completado' || orden.estado === 'finished' || orden.estado === 'confirmed') {
            console.log(`ℹ️ Pago ${ordenId} ya procesado anteriormente`);
            return res.json({ success: true, message: 'Pago ya procesado' });
        }

        if (orden.payment_id && orden.payment_id !== paymentId) {
            console.warn(`⚠️ payment_id no coincide. Esperado: ${orden.payment_id}, Recibido: ${paymentId}`);
            return res.status(400).json({ success: false, error: 'payment_id no coincide' });
        }

        // ============================================
        // 8. VALIDAR DATOS CONTRA API
        // ============================================

        const priceAmount = Number(paymentInfo.price_amount || 0);
        const priceCurrency = String(paymentInfo.price_currency || '').toLowerCase();
        const payAmount = Number(paymentInfo.pay_amount || 0);
        const payCurrency = String(paymentInfo.pay_currency || '').toLowerCase();

        const expectedPriceAmount = Number(orden.price_amount_enviado || orden.monto_usd_esperado || orden.monto_pagado);
        const expectedPriceCurrency = String(orden.price_currency_enviado || 'usd').toLowerCase();
        const expectedPayCurrency = String(orden.pay_currency_enviado || 'usdt').toLowerCase();

        // Validar price_currency
        if (priceCurrency !== expectedPriceCurrency) {
            console.error(`❌ price_currency no coincide. Esperado: ${expectedPriceCurrency}, API: ${priceCurrency}`);
            return res.status(400).json({ success: false, error: 'price_currency no coincide' });
        }

        // Validar pay_currency
        if (payCurrency !== expectedPayCurrency) {
            console.error(`❌ pay_currency no coincide. Esperado: ${expectedPayCurrency}, API: ${payCurrency}`);
            return res.status(400).json({ success: false, error: 'pay_currency no coincide' });
        }

        // Validar price_amount (tolerancia 1% para redondeos)
        const toleranciaPrice = expectedPriceAmount * 0.01;
        if (Math.abs(priceAmount - expectedPriceAmount) > toleranciaPrice) {
            console.error(`❌ price_amount no coincide. Esperado: ${expectedPriceAmount}, API: ${priceAmount}`);
            return res.status(400).json({ success: false, error: 'price_amount no coincide' });
        }

        // Validar pay_amount (tolerancia 1% para crypto)
        const montoOrden = Number(orden.monto_pagado);
        const toleranciaPay = montoOrden * 0.01;
        if (Math.abs(payAmount - montoOrden) > toleranciaPay) {
            console.error(`❌ pay_amount fuera de tolerancia. Esperado: ${montoOrden}, API: ${payAmount}`);
            return res.status(400).json({ success: false, error: 'pay_amount fuera de tolerancia' });
        }

        // ============================================
        // 9. PROCESAR PAGO
        // ============================================

        console.log(`✅ Procesando pago ${ordenId} - Estado: ${paymentStatus}`);

        let resultado;

        if (orden.tipo_pago === 'esim' && orden.orden_esim_id) {
            resultado = await supabaseAdmin.rpc('private.procesar_pago_esim_webhook', {
                p_orden_id: parseInt(ordenId),
                p_payment_id: paymentId,
                p_estado: 'completado',
                p_pay_amount: payAmount
            });
        } else {
            resultado = await supabaseAdmin.rpc('private.procesar_pago_transmision_webhook', {
                p_orden_id: parseInt(ordenId),
                p_payment_id: paymentId,
                p_estado: 'completado',
                p_pay_amount: payAmount
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
   MURO - TODAS LAS RUTAS
   ================================================================ */

// [TODAS LAS RUTAS DE MURO SE MANTIENEN - Usando clienteDelUsuario]

/* ================================================================
   CONTACTOS - TODAS LAS RUTAS
   ================================================================ */

// [TODAS LAS RUTAS DE CONTACTOS SE MANTIENEN]

/* ================================================================
   MENSAJES - TODAS LAS RUTAS
   ================================================================ */

// [TODAS LAS RUTAS DE MENSAJES SE MANTIENEN]

/* ================================================================
   LIVE - TODAS LAS RUTAS
   ================================================================ */

// [TODAS LAS RUTAS DE LIVE SE MANTIENEN]

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

// [TODAS LAS RUTAS HTML SE MANTIENEN]

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
    console.log(`🔐 Admin configurado con user_roles`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
});

module.exports = app;