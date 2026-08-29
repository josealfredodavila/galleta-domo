/* ================================================================
   SERVER.JS - SARIEL'S BACKEND
   RAILWAY
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

/*
 * IMPORTANTE:
 * El Service Role NO debe tener fallback hacia ANON KEY.
 */
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
        throw new Error('Supabase no está configurado correctamente');
    }

    const authorization = req.headers.authorization || '';

    if (authorization.startsWith('Bearer ')) {
        const token = authorization.slice(7).trim();

        if (token) {
            return createClient(
                SUPABASE_URL,
                SUPABASE_ANON_KEY,
                {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    },
                    global: {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                }
            );
        }
    }

    return createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
}

/* ================================================================
   AUTENTICACIÓN
   ================================================================ */

async function obtenerUsuario(req) {
    const supabase = clienteDelUsuario(req);

    const {
        data: { user },
        error
    } = await supabase.auth.getUser();

    if (error || !user) {
        return null;
    }

    return user;
}

async function verificarAutenticacion(req, res, next) {
    try {
        const user = await obtenerUsuario(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Error de autenticación:', error);

        return res.status(500).json({
            success: false,
            error: 'Error de autenticación'
        });
    }
}

/* ================================================================
   ADMINISTRADOR
   ================================================================ */

const ADMIN_EMAIL = (
    process.env.ADMIN_EMAIL ||
    'csarielcontacto@gmail.com'
).trim().toLowerCase();

async function verificarAdmin(req, res, next) {
    try {
        const user = await obtenerUsuario(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        const email = (user.email || '').trim().toLowerCase();

        if (!email || email !== ADMIN_EMAIL) {
            return res.status(403).json({
                success: false,
                error: 'No autorizado: se requiere administrador'
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Error verificando admin:', error);

        return res.status(500).json({
            success: false,
            error: 'Error de autenticación'
        });
    }
}

/* ================================================================
   MIDDLEWARES DE SEGURIDAD
   ================================================================ */

app.disable('x-powered-by');

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(compression());

/*
 * CORS - Configuración segura para producción
 * 
 * Si CORS_ORIGINS no está definido en producción, NO se permiten
 * orígenes desconocidos. En desarrollo, se permite cualquier origen
 * para facilitar el testing local.
 */
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // Permitir requests sin Origin (health checks, server-to-server)
            if (!origin) {
                return callback(null, true);
            }

            // En desarrollo, permitir cualquier origen para facilitar pruebas
            if (!isProduction) {
                return callback(null, true);
            }

            // En producción, solo permitir orígenes explícitamente configurados
            if (corsOrigins.length === 0) {
                console.warn('⚠️ CORS_ORIGINS no configurado en producción. Rechazando origen:', origin);
                return callback(new Error('Origen no permitido por CORS'));
            }

            if (corsOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.warn('⚠️ Origen no permitido por CORS:', origin);
            return callback(new Error('Origen no permitido por CORS'));
        },
        credentials: true
    })
);

app.use(morgan('combined'));

/*
 * Rate limit general para API.
 * Se excluye el webhook que tiene su propio limitador.
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Demasiadas peticiones. Intenta nuevamente más tarde.'
    }
});

app.use('/api/', (req, res, next) => {
    // Excluir webhook del rate limit general
    if (req.path.startsWith('/webhooks/')) {
        return next();
    }
    return apiLimiter(req, res, next);
});

/*
 * Rate limit específico para webhook (más permisivo pero con límite)
 */
const webhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Demasiados webhooks. Intenta nuevamente más tarde.'
    }
});

/*
 * Capturamos el body original para poder verificar firmas HMAC.
 * Esto debe hacerse ANTES de cualquier otro middleware que consuma el body.
 */
app.use(
    express.json({
        limit: '2mb',
        verify: (req, res, buf) => {
            req.rawBody = Buffer.from(buf);
        }
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '2mb',
        verify: (req, res, buf) => {
            // También capturamos el raw body para urlencoded
            if (!req.rawBody) {
                req.rawBody = Buffer.from(buf);
            }
        }
    })
);

/* ================================================================
   ARCHIVOS ESTÁTICOS
   ================================================================ */

const publicPath = path.join(__dirname, 'public');

if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));

    console.log(
        '✅ Sirviendo archivos estáticos desde:',
        publicPath
    );
} else {
    console.warn(
        '⚠️ No se encontró la carpeta public/:',
        publicPath
    );
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

app.get(
    '/api/token',
    verificarAutenticacion,
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                return res.status(500).json({
                    success: false,
                    error: 'Supabase Admin no configurado'
                });
            }

            if (
                !process.env.LIVEKIT_API_KEY ||
                !process.env.LIVEKIT_API_SECRET
            ) {
                return res.status(500).json({
                    success: false,
                    error: 'LiveKit credentials not configured'
                });
            }

            const roomNameRaw =
                req.query.room || 'muro-live-general';

            const roomName = String(roomNameRaw).trim();

            if (
                !roomName ||
                roomName.length > 200
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Sala inválida'
                });
            }

            const participantName = req.user.id;

            const {
                data: stream,
                error: streamError
            } = await supabaseAdmin
                .from('transmisiones')
                .select('streamer_id, estado')
                .eq('room_name', roomName)
                .maybeSingle();

            if (streamError) {
                console.error(
                    'Error consultando transmisión:',
                    streamError
                );
            }

            const esStreamer =
                stream &&
                stream.streamer_id === req.user.id &&
                stream.estado === 'activa';

            const at = new AccessToken(
                process.env.LIVEKIT_API_KEY,
                process.env.LIVEKIT_API_SECRET,
                {
                    identity: participantName
                }
            );

            at.addGrant({
                roomJoin: true,
                room: roomName,

                /*
                 * Solo el streamer de esa sala puede publicar.
                 */
                canPublish: Boolean(esStreamer),

                /*
                 * Los espectadores pueden recibir audio/video.
                 */
                canSubscribe: true,

                /*
                 * No permitimos que un espectador publique.
                 */
                canPublishData: false
            });

            const token = await at.toJwt();

            return res.json({
                success: true,
                token,
                streamer: Boolean(esStreamer),
                room: roomName
            });

        } catch (error) {
            console.error(
                '❌ Error generando token LiveKit:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'No se pudo generar el token de transmisión'
            });
        }
    }
);

/* ================================================================
   TOKENS
   ================================================================ */

app.get(
    '/api/tokens',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('usuarios')
                .select('tokens')
                .eq('id', req.user.id)
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                tokens: Number(data?.tokens || 0)
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo tokens:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'No se pudieron obtener los tokens'
            });
        }
    }
);

/*
 * TRANSFERENCIA ATÓMICA
 *
 * Requiere RPC:
 *
 * transfer_tokens(
 *   p_sender_id uuid,
 *   p_receiver_id uuid,
 *   p_cantidad numeric
 * )
 */
app.post(
    '/api/tokens/transferir',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const { destinoId, cantidad } = req.body;

            if (!destinoId) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta destinoId'
                });
            }

            const cantidadNumerica = Number(cantidad);

            if (
                !Number.isFinite(cantidadNumerica) ||
                cantidadNumerica <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'La cantidad debe ser mayor a 0'
                });
            }

            if (cantidadNumerica > 1000000000) {
                return res.status(400).json({
                    success: false,
                    error: 'Cantidad inválida'
                });
            }

            if (String(destinoId) === String(req.user.id)) {
                return res.status(400).json({
                    success: false,
                    error: 'No puedes transferir tokens a ti mismo'
                });
            }

            const { data, error } =
                await supabaseAdmin.rpc(
                    'transfer_tokens',
                    {
                        p_sender_id: req.user.id,
                        p_receiver_id: destinoId,
                        p_cantidad: cantidadNumerica
                    }
                );

            if (error) {
                console.error(
                    'Error RPC transfer_tokens:',
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: 'No se pudo completar la transferencia'
                });
            }

            return res.json({
                success: true,
                message: `${cantidadNumerica} tokens transferidos`,
                data
            });

        } catch (error) {
            console.error(
                '❌ Error transfiriendo tokens:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error al transferir tokens'
            });
        }
    }
);

/* ================================================================
   PAGOS - NOWPAYMENTS
   ================================================================ */

app.post(
    '/api/pagos/crear',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                transmisionId,
                monto,
                metodo
            } = req.body;

            const montoNumerico = Number(monto);

            if (
                !transmisionId ||
                !Number.isFinite(montoNumerico) ||
                montoNumerico <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos inválidos'
                });
            }

            if (montoNumerico > 1000000) {
                return res.status(400).json({
                    success: false,
                    error: 'Monto máximo excedido'
                });
            }

            /*
             * Verificar que la transmisión exista.
             */
            const {
                data: transmision,
                error: transmisionError
            } = await supabaseAdmin
                .from('transmisiones')
                .select('id, streamer_id, estado')
                .eq('id', transmisionId)
                .maybeSingle();

            if (transmisionError) {
                throw transmisionError;
            }

            if (!transmision) {
                return res.status(404).json({
                    success: false,
                    error: 'Transmisión no encontrada'
                });
            }

            if (transmision.streamer_id === req.user.id) {
                return res.status(400).json({
                    success: false,
                    error: 'El streamer no puede pagarse a sí mismo'
                });
            }

            const comisionSariels =
                Math.round(
                    montoNumerico * 0.02 * 100
                ) / 100;

            const montoStreamer =
                Math.round(
                    (montoNumerico - comisionSariels) * 100
                ) / 100;

            const metodoPago =
                metodo === 'crypto'
                    ? 'crypto'
                    : 'crypto';

            const {
                data: orden,
                error: ordenError
            } = await supabaseAdmin
                .from('pagos_transmision')
                .insert({
                    transmision_id: transmisionId,
                    espectador_id: req.user.id,
                    monto_pagado: montoNumerico,
                    comision_sariels: comisionSariels,
                    monto_streamer: montoStreamer,
                    metodo_pago: metodoPago,
                    tipo_pago: 'acceso',
                    estado: 'pendiente'
                })
                .select()
                .single();

            if (ordenError) {
                throw ordenError;
            }

            /*
             * Si no existe NOWPayments configurado,
             * devolvemos la orden pendiente.
             */
            if (!process.env.NOWPAYMENTS_API_KEY) {
                return res.json({
                    success: true,
                    data: orden,
                    warning:
                        'NOWPayments no está configurado'
                });
            }

            // Construir URL del IPN callback desde variable de entorno
            const ipnCallbackUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
            if (!ipnCallbackUrl) {
                console.warn('⚠️ NOWPAYMENTS_IPN_CALLBACK_URL no configurado. El webhook no recibirá notificaciones.');
            }

            try {
                const nowpaymentsPayload = {
                    price_amount: montoNumerico,
                    price_currency: 'usd',
                    pay_currency: 'usdt',
                    order_id: String(orden.id),
                    order_description: `Pago transmisión ${transmisionId}`
                };

                // Solo agregar ipn_callback_url si está configurado
                if (ipnCallbackUrl) {
                    nowpaymentsPayload.ipn_callback_url = ipnCallbackUrl;
                }

                const nowpayments =
                    await axios.post(
                        'https://api.nowpayments.io/v1/payment',
                        nowpaymentsPayload,
                        {
                            headers: {
                                'x-api-key':
                                    process.env.NOWPAYMENTS_API_KEY,
                                'Content-Type':
                                    'application/json'
                            },
                            timeout: 15000
                        }
                    );

                return res.json({
                    success: true,
                    data: {
                        ...orden,
                        payment_url:
                            nowpayments.data?.payment_url || null,
                        payment_id:
                            nowpayments.data?.payment_id || null
                    }
                });

            } catch (nowError) {
                console.error(
                    '❌ Error NOWPayments:',
                    nowError.response?.data ||
                    nowError.message
                );

                return res.status(502).json({
                    success: false,
                    error:
                        'No se pudo crear el pago con el proveedor',
                    orden: {
                        id: orden.id,
                        estado: orden.estado
                    }
                });
            }

        } catch (error) {
            console.error(
                '❌ Error creando pago:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error creando el pago'
            });
        }
    }
);

/* ================================================================
   ESTADO DE PAGO
   ================================================================ */

app.get(
    '/api/pagos/estado/:ordenId',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const { data, error } =
                await supabaseAdmin
                    .from('pagos_transmision')
                    .select('*')
                    .eq('id', req.params.ordenId)
                    .eq(
                        'espectador_id',
                        req.user.id
                    )
                    .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return res.status(404).json({
                        success: false,
                        error: 'Orden no encontrada'
                    });
                }

                throw error;
            }

            return res.json({
                success: true,
                data
            });

        } catch (error) {
            console.error(
                '❌ Error verificando pago:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error verificando pago'
            });
        }
    }
);

/* ================================================================
   WEBHOOK NOWPAYMENTS
   ================================================================ */

/*
 * NOWPayments utiliza firma HMAC SHA-512 sobre el body RAW.
 * 
 * La firma se calcula sobre el body en su forma original (string),
 * NO sobre el objeto parseado. Por eso usamos req.rawBody.
 * 
 * Referencia: https://nowpayments.io/docs/ipn
 */

function verificarHMAC(rawBody, firmaRecibida, secret) {
    try {
        if (
            !rawBody ||
            !firmaRecibida ||
            !secret
        ) {
            return false;
        }

        // Asegurar que rawBody es un Buffer o string
        const bodyBuffer = Buffer.isBuffer(rawBody)
            ? rawBody
            : Buffer.from(String(rawBody), 'utf8');

        const firmaCalculada =
            crypto
                .createHmac('sha512', secret)
                .update(bodyBuffer)
                .digest('hex');

        const recibido = Buffer.from(
            String(firmaRecibida),
            'utf8'
        );

        const calculado = Buffer.from(
            firmaCalculada,
            'utf8'
        );

        if (
            recibido.length !==
            calculado.length
        ) {
            return false;
        }

        return crypto.timingSafeEqual(
            calculado,
            recibido
        );

    } catch (error) {
        console.error(
            'Error verificando HMAC:',
            error
        );

        return false;
    }
}

app.post(
    '/api/webhooks/nowpayments',
    webhookLimiter,
    async (req, res) => {
        try {
            const secret =
                process.env.NOWPAYMENTS_IPN_SECRET;

            if (!secret) {
                console.error(
                    '❌ NOWPAYMENTS_IPN_SECRET no configurado'
                );

                return res.status(500).json({
                    success: false,
                    error: 'Webhook no configurado'
                });
            }

            const firmaRecibida =
                req.headers['x-nowpayments-sig'] ||
                req.headers['x-nowpayments-signature'];

            if (!firmaRecibida) {
                console.warn('⚠️ Webhook NOWPayments sin firma');
                return res.status(401).json({
                    success: false,
                    error: 'Firma ausente'
                });
            }

            // Usar el body original capturado
            const rawBody = req.rawBody;

            if (!rawBody || rawBody.length === 0) {
                console.warn('⚠️ Webhook NOWPayments sin body');
                return res.status(400).json({
                    success: false,
                    error: 'Body vacío'
                });
            }

            const esValido =
                verificarHMAC(
                    rawBody,
                    firmaRecibida,
                    secret
                );

            if (!esValido) {
                console.warn(
                    '⚠️ Webhook NOWPayments con firma inválida'
                );

                return res.status(401).json({
                    success: false,
                    error: 'Firma inválida'
                });
            }

            // Parsear el body después de verificar la firma
            let payload;
            try {
                payload = JSON.parse(rawBody.toString('utf8'));
            } catch (parseError) {
                console.error('❌ Error parseando webhook:', parseError);
                return res.status(400).json({
                    success: false,
                    error: 'Body inválido'
                });
            }

            console.log(
                '📡 Webhook NOWPayments recibido:',
                JSON.stringify(payload, null, 2)
            );

            /*
             * NOWPayments puede enviar el payment_status en diferentes
             * lugares dependiendo de la versión del webhook.
             */
            const paymentStatus =
                String(
                    payload.payment_status ||
                    payload.data?.payment_status ||
                    payload.status ||
                    ''
                ).toLowerCase();

            // También puede venir como "status" en algunas versiones
            const status =
                String(
                    payload.status ||
                    payload.data?.status ||
                    ''
                ).toLowerCase();

            const finalStatus = paymentStatus || status;

            // Buscar order_id en diferentes ubicaciones
            const ordenId =
                payload.order_id ||
                payload.data?.order_id ||
                payload.orderId ||
                payload.data?.orderId;

            if (!ordenId) {
                console.warn(
                    '⚠️ Webhook sin order_id:',
                    payload
                );

                return res.status(400).json({
                    success: false,
                    error: 'Webhook sin order_id'
                });
            }

            /*
             * Solo procesamos estados finales:
             * - finished
             * - confirmed
             * - completed
             * - success
             */
            const estadosFinales = ['finished', 'confirmed', 'completed', 'success'];
            
            if (!estadosFinales.includes(finalStatus)) {
                console.log(`ℹ️ Estado no final: ${finalStatus}. Ignorando.`);
                return res.json({
                    success: true,
                    message: `Estado ${finalStatus} ignorado`
                });
            }

            // Buscar la orden en la base de datos
            const {
                data: orden,
                error: ordenError
            } = await supabaseAdmin
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .maybeSingle();

            if (ordenError) {
                console.error('❌ Error consultando orden:', ordenError);
                throw ordenError;
            }

            if (!orden) {
                console.error(
                    `❌ Orden no encontrada: ${ordenId}`
                );

                return res.status(404).json({
                    success: false,
                    error: 'Orden no encontrada'
                });
            }

            /*
             * IDEMPOTENCIA: Si ya está completado, responder éxito
             * pero sin procesar nuevamente.
             */
            if (
                orden.estado === 'completado' ||
                orden.estado === 'completed' ||
                orden.estado === 'finished'
            ) {
                console.log(`ℹ️ Pago ${ordenId} ya procesado anteriormente`);
                return res.json({
                    success: true,
                    message: 'Pago ya procesado'
                });
            }

            /*
             * Validación del monto recibido.
             * NOWPayments puede enviar el monto en diferentes campos.
             */
            const montoPagado =
                Number(
                    payload.price_amount ??
                    payload.data?.price_amount ??
                    payload.amount ??
                    payload.data?.amount ??
                    0
                );

            // También puede enviar en pay_amount si es diferente
            const montoRecibido =
                Number(
                    payload.pay_amount ??
                    payload.data?.pay_amount ??
                    montoPagado
                );

            // Usar el que tenga valor, priorizando pay_amount si existe
            const montoWebhook = montoRecibido > 0 ? montoRecibido : montoPagado;

            if (
                montoWebhook > 0 &&
                Math.abs(
                    montoWebhook -
                    Number(orden.monto_pagado)
                ) > 0.01
            ) {
                console.error(
                    '❌ Monto del webhook no coincide:',
                    {
                        esperado: orden.monto_pagado,
                        recibido: montoWebhook
                    }
                );

                return res.status(400).json({
                    success: false,
                    error: 'Monto del pago no coincide con lo esperado'
                });
            }

            /*
             * PROCESAR PAGO - Actualizar la orden y entregar beneficios
             * Usamos una transacción para asegurar consistencia.
             * 
             * Nota: Si se requiere entrega de tokens u otros beneficios,
             * aquí es donde debería ejecutarse la lógica correspondiente.
             */
            const {
                error: updateError
            } = await supabaseAdmin
                .from('pagos_transmision')
                .update({
                    estado: 'completado',
                    pagado_en: new Date().toISOString(),
                    // Guardar información del pago
                    metodo_pago: payload.pay_currency || 'usdt',
                    referencia_externa: payload.payment_id || null,
                    datos_webhook: payload
                })
                .eq('id', ordenId)
                .eq('estado', 'pendiente');

            if (updateError) {
                console.error('❌ Error actualizando pago:', updateError);
                throw updateError;
            }

            /*
             * TODO: Aquí se debería implementar la entrega de beneficios
             * (tokens, acceso a transmisión, etc.) basado en el tipo de pago.
             * Esto depende de la lógica específica de tu aplicación.
             */

            console.log(
                `✅ Pago completado exitosamente: ${ordenId}`
            );

            return res.json({
                success: true,
                message: 'Pago procesado correctamente'
            });

        } catch (error) {
            console.error(
                '❌ Error procesando webhook:',
                error
            );

            // En caso de error, devolver 500 pero NO exponer detalles internos
            return res.status(500).json({
                success: false,
                error: 'Error procesando webhook'
            });
        }
    }
);

/* ================================================================
   SUSCRIPCIONES
   ================================================================ */

app.post(
    '/api/suscripciones/crear',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                streamerId,
                precioMensual
            } = req.body;

            const precio =
                Number(precioMensual);

            if (
                !streamerId ||
                !Number.isFinite(precio) ||
                precio <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos inválidos'
                });
            }

            if (
                String(streamerId) ===
                String(req.user.id)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'No puedes suscribirte a ti mismo'
                });
            }

            const {
                data: streamer
            } = await supabaseAdmin
                .from('usuarios')
                .select('id')
                .eq('id', streamerId)
                .maybeSingle();

            if (!streamer) {
                return res.status(404).json({
                    success: false,
                    error: 'Streamer no encontrado'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('suscripciones')
                .insert({
                    streamer_id: streamerId,
                    espectador_id: req.user.id,
                    precio_mensual: precio,
                    activo: true,
                    proximo_pago:
                        new Date(
                            Date.now() +
                            30 * 24 * 60 * 60 * 1000
                        ).toISOString()
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                data
            });

        } catch (error) {
            console.error(
                '❌ Error creando suscripción:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error creando suscripción'
            });
        }
    }
);

/* ================================================================
   PROMOCIONES
   ================================================================ */

app.post(
    '/api/promociones/activar',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                transmisionId,
                nivel,
                horas
            } = req.body;

            const nivelNumero =
                Number(nivel);

            const horasNumero =
                Number(horas);

            const precios = {
                1: 50,
                2: 150,
                3: 300
            };

            const prioridades = {
                1: 3,
                2: 2,
                3: 1
            };

            if (
                !transmisionId ||
                !precios[nivelNumero] ||
                !Number.isFinite(horasNumero) ||
                horasNumero <= 0 ||
                horasNumero > 168
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos inválidos'
                });
            }

            const {
                data: transmision,
                error: transmisionError
            } = await supabaseAdmin
                .from('transmisiones')
                .select(
                    'id, streamer_id, estado'
                )
                .eq('id', transmisionId)
                .maybeSingle();

            if (transmisionError) {
                throw transmisionError;
            }

            if (!transmision) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Transmisión no encontrada'
                });
            }

            if (
                transmision.streamer_id !==
                req.user.id
            ) {
                return res.status(403).json({
                    success: false,
                    error:
                        'Solo el streamer puede activar la promoción'
                });
            }

            const costo =
                precios[nivelNumero] *
                horasNumero;

            const {
                data,
                error
            } = await supabaseAdmin
                .from('promociones_streamer')
                .insert({
                    streamer_id: req.user.id,
                    transmision_id: transmisionId,
                    nivel_promocion:
                        nivelNumero,
                    costo_promocion: costo,
                    duracion_promocion:
                        horasNumero,
                    posicion_prioridad:
                        prioridades[nivelNumero],
                    activo: true
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                data
            });

        } catch (error) {
            console.error(
                '❌ Error activando promoción:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error activando promoción'
            });
        }
    }
);

/* ================================================================
   PERFIL
   ================================================================ */

app.get(
    '/api/perfil',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('usuarios')
                .select('*')
                .eq('id', req.user.id)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (data) {
                return res.json({
                    success: true,
                    perfil: data
                });
            }

            return res.json({
                success: true,
                perfil: {
                    id: req.user.id,
                    nombre: 'Explorador',
                    handle: 'explorador',
                    bio:
                        "Explorando el ecosistema Sariel's",
                    avatar_url: null,
                    tokens: 0
                }
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo perfil:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error al obtener perfil'
            });
        }
    }
);

app.put(
    '/api/perfil',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                nombre,
                handle,
                bio,
                avatar_url
            } = req.body;

            const updates = {};

            if (nombre !== undefined) {
                const nombreLimpio = String(nombre).trim();
                if (nombreLimpio.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'El nombre no puede estar vacío'
                    });
                }
                updates.nombre = nombreLimpio.slice(0, 100);
            }

            if (handle !== undefined) {
                const handleLimpio = String(handle).trim().toLowerCase();
                if (handleLimpio.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'El handle no puede estar vacío'
                    });
                }
                // Validar que el handle solo contenga caracteres permitidos
                if (!/^[a-z0-9_]+$/.test(handleLimpio)) {
                    return res.status(400).json({
                        success: false,
                        error: 'El handle solo puede contener letras minúsculas, números y guión bajo'
                    });
                }
                updates.handle = handleLimpio.slice(0, 50);
            }

            if (bio !== undefined) {
                updates.bio =
                    String(bio)
                        .trim()
                        .slice(0, 1000);
            }

            if (avatar_url !== undefined) {
                updates.avatar_url =
                    avatar_url
                        ? String(avatar_url)
                            .trim()
                            .slice(0, 2000)
                        : null;
            }

            if (
                Object.keys(updates).length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'No se proporcionaron campos'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('usuarios')
                .update(updates)
                .eq('id', req.user.id)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                perfil: data
            });

        } catch (error) {
            console.error(
                '❌ Error guardando perfil:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error al guardar perfil'
            });
        }
    }
);

/* ================================================================
   MURO
   ================================================================ */

app.get(
    '/api/muro',
    async (req, res) => {
        try {
            let page =
                parseInt(
                    req.query.page,
                    10
                ) || 1;

            let limit =
                parseInt(
                    req.query.limit,
                    10
                ) || 20;

            page = Math.max(1, page);
            limit = Math.min(
                100,
                Math.max(1, limit)
            );

            const from =
                (page - 1) * limit;

            const to =
                from + limit - 1;

            const {
                data,
                error
            } = await supabaseAdmin
                .from('muro_posts')
                .select(`
                    id,
                    contenido,
                    imagen_url,
                    created_at,
                    cantidad_venta,
                    precio_venta,
                    usuarios (
                        id,
                        nombre,
                        handle,
                        avatar_url
                    ),
                    muro_likes (
                        count
                    ),
                    muro_comentarios (
                        count
                    )
                `)
                .order(
                    'created_at',
                    {
                        ascending: false
                    }
                )
                .range(from, to);

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                page,
                limit,
                posts: data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo muro:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error obteniendo publicaciones'
            });
        }
    }
);

app.post(
    '/api/muro',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const contenido =
                req.body.contenido !== undefined
                    ? String(
                        req.body.contenido
                    ).trim()
                    : '';

            const imagenUrl =
                req.body.imagenUrl !== undefined
                    ? String(
                        req.body.imagenUrl
                    ).trim()
                    : '';

            if (!contenido && !imagenUrl) {
                return res.status(400).json({
                    success: false,
                    error:
                        'La publicación necesita texto o imagen'
                });
            }

            if (contenido.length > 5000) {
                return res.status(400).json({
                    success: false,
                    error:
                        'El texto es demasiado largo'
                });
            }

            if (imagenUrl.length > 2000) {
                return res.status(400).json({
                    success: false,
                    error:
                        'La URL de imagen es demasiado larga'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('muro_posts')
                .insert({
                    usuario_id: req.user.id,
                    contenido:
                        contenido || null,
                    imagen_url:
                        imagenUrl || null
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                post: data
            });

        } catch (error) {
            console.error(
                '❌ Error creando publicación:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error creando publicación'
            });
        }
    }
);

app.delete(
    '/api/muro/:postId',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                error
            } = await supabaseAdmin
                .from('muro_posts')
                .delete()
                .eq(
                    'id',
                    req.params.postId
                )
                .eq(
                    'usuario_id',
                    req.user.id
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true
            });

        } catch (error) {
            console.error(
                '❌ Error eliminando publicación:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error eliminando publicación'
            });
        }
    }
);

app.post(
    '/api/muro/:postId/like',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                error
            } = await supabaseAdmin
                .from('muro_likes')
                .insert({
                    post_id:
                        req.params.postId,
                    usuario_id:
                        req.user.id
                });

            if (error) {
                if (error.code === '23505') {
                    return res.json({
                        success: true,
                        message:
                            'Ya habías dado like'
                    });
                }

                throw error;
            }

            return res.json({
                success: true
            });

        } catch (error) {
            console.error(
                '❌ Error dando like:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error dando like'
            });
        }
    }
);

app.delete(
    '/api/muro/:postId/like',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                error
            } = await supabaseAdmin
                .from('muro_likes')
                .delete()
                .eq(
                    'post_id',
                    req.params.postId
                )
                .eq(
                    'usuario_id',
                    req.user.id
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true
            });

        } catch (error) {
            console.error(
                '❌ Error quitando like:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error quitando like'
            });
        }
    }
);

app.get(
    '/api/muro/:postId/comentarios',
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('muro_comentarios')
                .select(`
                    id,
                    contenido,
                    created_at,
                    usuarios (
                        id,
                        nombre,
                        handle,
                        avatar_url
                    )
                `)
                .eq(
                    'post_id',
                    req.params.postId
                )
                .order(
                    'created_at',
                    {
                        ascending: true
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                comentarios: data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo comentarios:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error obteniendo comentarios'
            });
        }
    }
);

app.post(
    '/api/muro/:postId/comentarios',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const contenido =
                String(
                    req.body.contenido || ''
                )
                    .trim();

            if (!contenido) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el contenido'
                });
            }

            if (contenido.length > 2000) {
                return res.status(400).json({
                    success: false,
                    error:
                        'El comentario es demasiado largo'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('muro_comentarios')
                .insert({
                    post_id:
                        req.params.postId,
                    usuario_id:
                        req.user.id,
                    contenido
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                comentario: data
            });

        } catch (error) {
            console.error(
                '❌ Error creando comentario:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error creando comentario'
            });
        }
    }
);

/* ================================================================
   CONTACTOS
   ================================================================ */

app.get(
    '/api/contactos',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('contactos')
                .select(`
                    id,
                    created_at,
                    usuarios!contactos_contacto_id_fkey (
                        id,
                        nombre,
                        handle,
                        avatar_url
                    )
                `)
                .eq(
                    'usuario_id',
                    req.user.id
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                contactos: data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo contactos:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error obteniendo contactos'
            });
        }
    }
);

app.post(
    '/api/contactos',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                contactoId
            } = req.body;

            if (!contactoId) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta contactoId'
                });
            }

            if (
                String(contactoId) ===
                String(req.user.id)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'No puedes agregarte a ti mismo'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('contactos')
                .insert({
                    usuario_id:
                        req.user.id,
                    contacto_id:
                        contactoId
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return res.json({
                        success: true,
                        message:
                            'El contacto ya existe'
                    });
                }

                throw error;
            }

            return res.json({
                success: true,
                contacto: data
            });

        } catch (error) {
            console.error(
                '❌ Error agregando contacto:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error agregando contacto'
            });
        }
    }
);

app.delete(
    '/api/contactos/:contactoId',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                error
            } = await supabaseAdmin
                .from('contactos')
                .delete()
                .eq(
                    'usuario_id',
                    req.user.id
                )
                .eq(
                    'contacto_id',
                    req.params.contactoId
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true
            });

        } catch (error) {
            console.error(
                '❌ Error eliminando contacto:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error eliminando contacto'
            });
        }
    }
);

/* ================================================================
   MENSAJES
   ================================================================ */

app.get(
    '/api/mensajes/:contactoId',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const contactoId =
                req.params.contactoId;

            const {
                data,
                error
            } = await supabaseAdmin
                .from('mensajes_chat')
                .select('*')
                .or(
                    `and(remitente_id.eq.${req.user.id},destinatario_id.eq.${contactoId}),and(remitente_id.eq.${contactoId},destinatario_id.eq.${req.user.id})`
                )
                .order(
                    'created_at',
                    {
                        ascending: true
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                mensajes: data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo mensajes:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error obteniendo mensajes'
            });
        }
    }
);

app.post(
    '/api/mensajes',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const destinatarioId =
                req.body.destinatarioId;

            const contenido =
                String(
                    req.body.contenido || ''
                ).trim();

            if (
                !destinatarioId ||
                !contenido
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos'
                });
            }

            if (
                String(destinatarioId) ===
                String(req.user.id)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'No puedes enviarte un mensaje a ti mismo'
                });
            }

            if (contenido.length > 5000) {
                return res.status(400).json({
                    success: false,
                    error:
                        'El mensaje es demasiado largo'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('mensajes_chat')
                .insert({
                    remitente_id:
                        req.user.id,
                    destinatario_id:
                        destinatarioId,
                    contenido
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                mensaje: data
            });

        } catch (error) {
            console.error(
                '❌ Error enviando mensaje:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error enviando mensaje'
            });
        }
    }
);

app.put(
    '/api/mensajes/:mensajeId/leido',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                error
            } = await supabaseAdmin
                .from('mensajes_chat')
                .update({
                    leido: true
                })
                .eq(
                    'id',
                    req.params.mensajeId
                )
                .eq(
                    'destinatario_id',
                    req.user.id
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true
            });

        } catch (error) {
            console.error(
                '❌ Error marcando mensaje:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error marcando mensaje'
            });
        }
    }
);

/* ================================================================
   LIVE
   ================================================================ */

app.get(
    '/api/live/activos',
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('transmisiones')
                .select(`
                    id,
                    room_name,
                    titulo,
                    viewers_count,
                    fecha_inicio,
                    streamer_id,
                    usuarios!transmisiones_streamer_id_fkey (
                        id,
                        nombre,
                        handle,
                        avatar_url
                    )
                `)
                .eq(
                    'estado',
                    'activa'
                )
                .order(
                    'fecha_inicio',
                    {
                        ascending: false
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                streams: data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo lives:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error obteniendo transmisiones'
            });
        }
    }
);

app.post(
    '/api/live/iniciar',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const titulo =
                String(
                    req.body.titulo ||
                    "Live en Sariel's"
                )
                    .trim()
                    .slice(0, 200);

            const categoria =
                String(
                    req.body.categoria ||
                    'Charla'
                )
                    .trim()
                    .slice(0, 100);

            /*
             * Evitar múltiples lives activos
             * del mismo streamer.
             */
            const {
                data: liveActivo,
                error: activoError
            } = await supabaseAdmin
                .from('transmisiones')
                .select('id')
                .eq(
                    'streamer_id',
                    req.user.id
                )
                .eq(
                    'estado',
                    'activa'
                )
                .maybeSingle();

            if (activoError) {
                throw activoError;
            }

            if (liveActivo) {
                return res.status(409).json({
                    success: false,
                    error:
                        'Ya tienes una transmisión activa',
                    streamId:
                        liveActivo.id
                });
            }

            const roomName =
                `live-${req.user.id}-${Date.now()}`;

            const {
                data,
                error
            } = await supabaseAdmin
                .from('transmisiones')
                .insert({
                    streamer_id:
                        req.user.id,
                    room_name:
                        roomName,
                    titulo,
                    categoria,
                    estado:
                        'activa',
                    fecha_inicio:
                        new Date().toISOString(),
                    viewers_count:
                        0
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                stream: data
            });

        } catch (error) {
            console.error(
                '❌ Error iniciando live:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error iniciando transmisión'
            });
        }
    }
);

app.post(
    '/api/live/:streamId/finalizar',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('transmisiones')
                .update({
                    estado:
                        'finalizada',
                    fecha_fin:
                        new Date().toISOString()
                })
                .eq(
                    'id',
                    req.params.streamId
                )
                .eq(
                    'streamer_id',
                    req.user.id
                )
                .select()
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Transmisión no encontrada'
                });
            }

            return res.json({
                success: true,
                stream: data
            });

        } catch (error) {
            console.error(
                '❌ Error finalizando live:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error finalizando transmisión'
            });
        }
    }
);

/* ================================================================
   INTERNET - ESIM
   ================================================================ */

app.get(
    '/api/esim/planes',
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('planes_esim')
                .select('*')
                .eq(
                    'activo',
                    true
                )
                .order(
                    'precio_mxn',
                    {
                        ascending: true
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                planes: data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo planes:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error obteniendo planes'
            });
        }
    }
);

app.post(
    '/api/esim/orden',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                planId
            } = req.body;

            if (!planId) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Se requiere planId'
                });
            }

            const {
                data: plan,
                error: planError
            } = await supabaseAdmin
                .from('planes_esim')
                .select('*')
                .eq(
                    'id',
                    planId
                )
                .maybeSingle();

            if (planError) {
                throw planError;
            }

            if (!plan) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Plan no encontrado'
                });
            }

            if (!plan.activo) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Este plan no está disponible actualmente'
                });
            }

            const {
                data: orden,
                error: ordenError
            } = await supabaseAdmin
                .from('ordenes_esim')
                .insert({
                    usuario_id:
                        req.user.id,
                    plan_id:
                        plan.id,
                    cantidad_datos_gb:
                        plan.datos_gb,
                    monto_mxn:
                        plan.precio_mxn,
                    monto_usdt:
                        plan.precio_usdt,
                    estado_pago:
                        'pendiente'
                })
                .select()
                .single();

            if (ordenError) {
                throw ordenError;
            }

            return res.json({
                success: true,
                orden: {
                    id: orden.id,
                    plan: plan.nombre,
                    datos_gb:
                        plan.datos_gb,
                    duracion_dias:
                        plan.duracion_dias,
                    monto_mxn:
                        plan.precio_mxn,
                    monto_usdt:
                        plan.precio_usdt,
                    estado:
                        orden.estado_pago
                },
                mensaje:
                    'Orden creada. Pendiente de pago.'
            });

        } catch (error) {
            console.error(
                '❌ Error creando orden eSIM:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error creando orden'
            });
        }
    }
);

/* ================================================================
   ADMIN - PLANES ESIM
   ================================================================ */

app.get(
    '/api/admin/planes',
    verificarAdmin,
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('planes_esim')
                .select('*')
                .order(
                    'id',
                    {
                        ascending: true
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                planes: data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo planes admin:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error obteniendo planes'
            });
        }
    }
);

app.post(
    '/api/admin/planes',
    verificarAdmin,
    async (req, res) => {
        try {
            const {
                nombre,
                datos_gb,
                duracion_dias,
                precio_mxn,
                precio_usdt,
                activo
            } = req.body;

            const nombreLimpio =
                String(nombre || '').trim();

            const datos =
                Number(datos_gb);

            const duracion =
                Number(duracion_dias);

            const mxn =
                Number(precio_mxn);

            const usdt =
                Number(precio_usdt);

            if (!nombreLimpio) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Nombre es requerido'
                });
            }

            if (
                !Number.isFinite(datos) ||
                datos <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Datos en GB debe ser mayor a 0'
                });
            }

            if (
                !Number.isFinite(duracion) ||
                duracion <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Duración debe ser mayor a 0'
                });
            }

            if (
                !Number.isFinite(mxn) ||
                mxn < 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Precio MXN inválido'
                });
            }

            if (
                !Number.isFinite(usdt) ||
                usdt < 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Precio USDT inválido'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('planes_esim')
                .insert({
                    nombre:
                        nombreLimpio.slice(0, 150),
                    datos_gb:
                        Math.round(datos),
                    duracion_dias:
                        Math.round(duracion),
                    precio_mxn:
                        mxn,
                    precio_usdt:
                        usdt,
                    activo:
                        activo !== undefined
                            ? Boolean(activo)
                            : true
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                plan: data
            });

        } catch (error) {
            console.error(
                '❌ Error creando plan:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error creando plan'
            });
        }
    }
);

app.put(
    '/api/admin/planes/:id',
    verificarAdmin,
    async (req, res) => {
        try {
            const planId =
                Number(req.params.id);

            if (
                !Number.isInteger(planId) ||
                planId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'ID de plan inválido'
                });
            }

            const {
                nombre,
                datos_gb,
                duracion_dias,
                precio_mxn,
                precio_usdt,
                activo
            } = req.body;

            const {
                data: existente,
                error: existError
            } = await supabaseAdmin
                .from('planes_esim')
                .select('id')
                .eq(
                    'id',
                    planId
                )
                .maybeSingle();

            if (existError) {
                throw existError;
            }

            if (!existente) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Plan no encontrado'
                });
            }

            const updates = {};

            if (nombre !== undefined) {
                const nombreLimpio =
                    String(nombre).trim();

                if (!nombreLimpio) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Nombre inválido'
                    });
                }

                updates.nombre =
                    nombreLimpio.slice(0, 150);
            }

            if (datos_gb !== undefined) {
                const value =
                    Number(datos_gb);

                if (
                    !Number.isFinite(value) ||
                    value <= 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Datos GB inválidos'
                    });
                }

                updates.datos_gb =
                    Math.round(value);
            }

            if (
                duracion_dias !==
                undefined
            ) {
                const value =
                    Number(duracion_dias);

                if (
                    !Number.isFinite(value) ||
                    value <= 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Duración inválida'
                    });
                }

                updates.duracion_dias =
                    Math.round(value);
            }

            if (
                precio_mxn !==
                undefined
            ) {
                const value =
                    Number(precio_mxn);

                if (
                    !Number.isFinite(value) ||
                    value < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Precio MXN inválido'
                    });
                }

                updates.precio_mxn =
                    value;
            }

            if (
                precio_usdt !==
                undefined
            ) {
                const value =
                    Number(precio_usdt);

                if (
                    !Number.isFinite(value) ||
                    value < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Precio USDT inválido'
                    });
                }

                updates.precio_usdt =
                    value;
            }

            if (
                activo !==
                undefined
            ) {
                updates.activo =
                    Boolean(activo);
            }

            if (
                Object.keys(updates).length ===
                0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'No se proporcionaron campos para actualizar'
                });
            }

            const {
                data,
                error
            } = await supabaseAdmin
                .from('planes_esim')
                .update(updates)
                .eq(
                    'id',
                    planId
                )
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                plan: data
            });

        } catch (error) {
            console.error(
                '❌ Error actualizando plan:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error actualizando plan'
            });
        }
    }
);

app.delete(
    '/api/admin/planes/:id',
    verificarAdmin,
    async (req, res) => {
        try {
            const planId =
                Number(req.params.id);

            if (
                !Number.isInteger(planId) ||
                planId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'ID de plan inválido'
                });
            }

            const {
                data: planExistente,
                error: existError
            } = await supabaseAdmin
                .from('planes_esim')
                .select('id')
                .eq(
                    'id',
                    planId
                )
                .maybeSingle();

            if (existError) {
                throw existError;
            }

            if (!planExistente) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Plan no encontrado'
                });
            }

            const {
                count,
                error: countError
            } = await supabaseAdmin
                .from('ordenes_esim')
                .select(
                    'id',
                    {
                        count: 'exact',
                        head: true
                    }
                )
                .eq(
                    'plan_id',
                    planId
                );

            if (countError) {
                throw countError;
            }

            if (count > 0) {
                const {
                    data,
                    error
                } = await supabaseAdmin
                    .from('planes_esim')
                    .update({
                        activo: false
                    })
                    .eq(
                        'id',
                        planId
                    )
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return res.json({
                    success: true,
                    plan: data,
                    mensaje:
                        `El plan tiene ${count} órdenes asociadas. Se ha desactivado en lugar de eliminarlo.`
                });
            }

            const {
                error
            } = await supabaseAdmin
                .from('planes_esim')
                .delete()
                .eq(
                    'id',
                    planId
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                mensaje:
                    'Plan eliminado correctamente'
            });

        } catch (error) {
            console.error(
                '❌ Error eliminando plan:',
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Error eliminando plan'
            });
        }
    }
);

/* ================================================================
   ESIM - MIS SUSCRIPCIONES
   ================================================================ */

app.get(
    '/api/esim/mis-suscripciones',
    verificarAutenticacion,
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabaseAdmin
                .from('ordenes_esim')
                .select(`
                    *,
                    planes_esim (
                        nombre,
                        datos_gb,
                        duracion_dias
                    )
                `)
                .eq(
                    'usuario_id',
                    req.user.id
                )
                .order(
                    'created_at',
                    {
                        ascending: false
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                suscripciones:
                    data || []
            });

        } catch (error) {
            console.error(
                '❌ Error obteniendo suscripciones eSIM:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Error obteniendo suscripciones'
            });
        }
    }
);

/* ================================================================
   RUTAS HTML
   ================================================================ */

app.get('/', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'index.html'
        )
    );
});

app.get('/perfil', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'features',
            'perfil',
            'perfil.html'
        )
    );
});

app.get('/muro', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'features',
            'muro',
            'muro.html'
        )
    );
});

app.get('/mensajes', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'features',
            'mensajes',
            'mensajes.html'
        )
    );
});

app.get('/contactos', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'features',
            'mensajes',
            'contactos.html'
        )
    );
});

app.get('/live', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'features',
            'live',
            'live.html'
        )
    );
});

app.get('/internet', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'features',
            'internet',
            'internet.html'
        )
    );
});

app.get('/admin.html', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'admin.html'
        )
    );
});

app.get('/qr', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'qr-generator.html'
        )
    );
});

app.get(
    '/actualizar-contrasena',
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                'public',
                'actualizar-contrasena.html'
            )
        );
    }
);

/* ================================================================
   RUTAS LEGALES
   ================================================================ */

app.get('/terminos', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'terminos.html'
        )
    );
});

app.get('/privacidad', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'privacidad.html'
        )
    );
});

app.get('/cookies', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'cookies.html'
        )
    );
});

app.get('/live-terminos', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'live-terminos.html'
        )
    );
});

/* ================================================================
   404 API
   ================================================================ */

app.use('/api', (req, res) => {
    return res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado'
    });
});

/* ================================================================
   MANEJO GLOBAL DE ERRORES
   ================================================================ */

app.use(
    (err, req, res, next) => {
        console.error(
            '❌ Error interno:',
            err
        );

        if (res.headersSent) {
            return next(err);
        }

        return res.status(500).json({
            success: false,
            error:
                process.env.NODE_ENV ===
                'production'
                    ? 'Error interno del servidor'
                    : err.message
        });
    }
);

/* ================================================================
   INICIAR SERVIDOR
   ================================================================ */

app.listen(
    PORT,
    '0.0.0.0',
    () => {
        console.log(
            '========================================'
        );

        console.log(
            `✅ Servidor corriendo en puerto ${PORT}`
        );

        console.log(
            `📁 Archivos: ${publicPath}`
        );

        console.log(
            `🌐 Local: http://localhost:${PORT}`
        );

        console.log(
            `🔐 Admin: ${ADMIN_EMAIL}`
        );

        console.log(
            `🌍 Entorno: ${process.env.NODE_ENV || 'development'}`
        );

        console.log(
            '========================================'
        );
    }
);

module.exports = app;