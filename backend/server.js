// ================================================================
// server.js — Sariel's Ecosystem
// Backend principal — Producción Railway
// ================================================================

require('dotenv').config();

const express = require('express');
const {
    AccessToken,
    RoomServiceClient
} = require('livekit-server-sdk');

const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const {
    createClient
} = require('@supabase/supabase-js');

const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');

// ================================================================
// APP
// ================================================================

const app = express();

app.disable('x-powered-by');

const PORT = process.env.PORT || 8080;

// ================================================================
// SUPABASE
// ================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
    console.warn('⚠️ Falta SUPABASE_URL');
}

if (!SUPABASE_ANON_KEY) {
    console.warn('⚠️ Falta SUPABASE_ANON_KEY');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ Falta SUPABASE_SERVICE_ROLE_KEY');
}

// Cliente público
const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// Cliente administrativo
const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
);

// ================================================================
// LIVEKIT
// ================================================================

const LIVEKIT_API_KEY =
    process.env.LIVEKIT_API_KEY || '';

const LIVEKIT_API_SECRET =
    process.env.LIVEKIT_API_SECRET || '';

const LIVEKIT_URL =
    process.env.LIVEKIT_URL || '';

const LIVEKIT_WS_URL =
    process.env.LIVEKIT_WS_URL || '';

if (!LIVEKIT_API_KEY) {
    console.warn('⚠️ Falta LIVEKIT_API_KEY');
}

if (!LIVEKIT_API_SECRET) {
    console.warn('⚠️ Falta LIVEKIT_API_SECRET');
}

if (!LIVEKIT_URL) {
    console.warn('⚠️ Falta LIVEKIT_URL');
}

// ================================================================
// WEB3 / WALLETCONNECT
// ================================================================

/*
 * URL pública/canónica de la aplicación.
 *
 * IMPORTANTE:
 * No usamos automáticamente PUBLIC_URL porque podría contener
 * el dominio generado de Railway.
 *
 * La aplicación que utiliza el usuario es:
 * https://auction.up.railway.app
 */

const PUBLIC_APP_URL =
    'https://auction.up.railway.app';

/*
 * WalletConnect / Reown Project ID.
 *
 * Este valor NO es un secreto de servidor.
 * Es configuración pública utilizada por el cliente Web3.
 */

const WALLETCONNECT_PROJECT_ID =
    process.env.WALLETCONNECT_PROJECT_ID || '';

/*
 * Red utilizada actualmente por el flujo Web3.
 *
 * Polygon Amoy:
 * Chain ID: 80002
 */

const WEB3_CHAIN_ID = 80002;

if (!WALLETCONNECT_PROJECT_ID) {
    console.warn(
        '⚠️ Falta WALLETCONNECT_PROJECT_ID (WalletConnect no podrá conectarse)'
    );
}

// ================================================================
// TURNSTILE
// ================================================================

const TURNSTILE_SECRET_KEY =
    process.env.TURNSTILE_SECRET_KEY || '';

const TURNSTILE_SITE_KEY =
    process.env.TURNSTILE_SITE_KEY || '';

/*
 * NO MODIFICAR:
 * Este hostname corresponde a la configuración actual
 * de Turnstile existente en el proyecto.
 */

const TURNSTILE_EXPECTED_HOSTNAME =
    'galleta-domo-production.up.railway.app';

if (!TURNSTILE_SECRET_KEY) {
    console.warn('⚠️ Falta TURNSTILE_SECRET_KEY');
}

if (!TURNSTILE_SITE_KEY) {
    console.warn('⚠️ Falta TURNSTILE_SITE_KEY');
}

// ================================================================
// EDGE FUNCTIONS / CONFIGURACIÓN
// ================================================================

const EDGE_FUNCTIONS = {
    aceptarTerminos:
        process.env.EDGE_FUNCTION_ACEPTAR_TERMINOS ||
        'aceptar-terminos'
};

// ================================================================
// CONFIG WARNINGS
// ================================================================

if (!process.env.NODE_ENV) {
    console.warn(
        '⚠️ NODE_ENV no está definido'
    );
}

// ================================================================
// HELPERS SUPABASE
// ================================================================

function clienteDelUsuario(req) {
    const authHeader =
        req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token =
        authHeader.substring(7).trim();

    if (!token) {
        return null;
    }

    return createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        }
    );
}

// ================================================================
// AUTH MIDDLEWARE
// ================================================================

async function authMiddleware(req, res, next) {
    try {
        const authHeader =
            req.headers.authorization || '';

        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No autenticado'
            });
        }

        const token =
            authHeader.substring(7).trim();

        if (!token) {
            return res.status(401).json({
                error: 'Token no proporcionado'
            });
        }

        const {
            data,
            error
        } = await supabaseAdmin.auth.getUser(token);

        if (error || !data || !data.user) {
            return res.status(401).json({
                error: 'Token inválido o expirado'
            });
        }

        req.user = data.user;
        req.accessToken = token;

        next();

    } catch (error) {
        console.error(
            '❌ Error authMiddleware:',
            error
        );

        return res.status(401).json({
            error: 'No autenticado'
        });
    }
}

// ================================================================
// ADMIN MIDDLEWARE
// ================================================================

async function adminMiddleware(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                error: 'No autenticado'
            });
        }

        const {
            data,
            error
        } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error) {
            console.error(
                '❌ Error verificando rol:',
                error
            );

            return res.status(500).json({
                error: 'Error verificando permisos'
            });
        }

        if (!data || data.rol !== 'admin') {
            return res.status(403).json({
                error: 'Acceso restringido'
            });
        }

        next();

    } catch (error) {
        console.error(
            '❌ Error adminMiddleware:',
            error
        );

        return res.status(500).json({
            error: 'Error verificando permisos'
        });
    }
}

// ================================================================
// SEGURIDAD / HEADERS
// ================================================================

app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
);

app.use(
    compression()
);

// ================================================================
// LOGGING
// ================================================================

const isProduction =
    process.env.NODE_ENV === 'production';

if (!isProduction) {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// ================================================================
// CORS
// ================================================================

const corsOrigins =
    (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);

/*
 * Dominios oficiales de producción.
 *
 * Se mantienen ambos:
 *
 * 1. auction.up.railway.app
 *    → dominio público/canónico de Sariel's
 *
 * 2. galleta-domo-production.up.railway.app
 *    → dominio generado por Railway
 *
 * No se eliminan porque algunos recursos existentes
 * pueden seguir utilizando el dominio de Railway.
 */

const DEFAULT_PRODUCTION_ORIGINS = [
    'https://auction.up.railway.app',
    'https://galleta-domo-production.up.railway.app'
];

const allowedCorsOrigins =
    Array.from(
        new Set([
            ...corsOrigins,
            ...DEFAULT_PRODUCTION_ORIGINS
        ])
    );

app.use(
    cors({
        origin: function (origin, callback) {

            /*
             * Permitir peticiones sin Origin:
             * curl, Postman, health checks, etc.
             */

            if (!origin) {
                return callback(null, true);
            }

            if (
                allowedCorsOrigins.includes(origin)
            ) {
                return callback(null, true);
            }

            console.warn(
                `⚠️ CORS bloqueado: ${origin}`
            );

            return callback(
                new Error(
                    'Origen no permitido por CORS'
                )
            );
        },

        credentials: true,

        methods: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS'
        ],

        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'apikey',
            'x-client-info',
            'x-requested-with'
        ]
    })
);

// ================================================================
// RATE LIMIT
// ================================================================

const apiLimiter =
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,

        standardHeaders: true,
        legacyHeaders: false,

        message: {
            error:
                'Demasiadas solicitudes. Intenta nuevamente más tarde.'
        }
    });

app.use(
    '/api/',
    apiLimiter
);

// ================================================================
// BODY PARSERS
// ================================================================

app.use(
    express.json({
        limit: '10mb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '10mb'
    })
);

// ================================================================
// WEB3 PUBLIC CONFIG
// ================================================================

/*
 * Endpoint público para que el frontend obtenga
 * la configuración Web3 sin hardcodear valores sensibles
 * ni depender de variables de entorno del navegador.
 *
 * NO devuelve:
 * - SUPABASE_SERVICE_ROLE_KEY
 * - claves privadas
 * - secretos
 * - API keys privadas
 *
 * Sí devuelve:
 * - URL pública de la aplicación
 * - WalletConnect Project ID
 * - Polygon Amoy Chain ID
 */

app.get(
    '/api/config/web3',
    (req, res) => {

        return res.status(200).json({
            success: true,

            publicUrl:
                PUBLIC_APP_URL,

            walletConnectProjectId:
                WALLETCONNECT_PROJECT_ID,

            polygonChainId:
                WEB3_CHAIN_ID
        });
    }
);

// ================================================================
// I18N
// ================================================================

async function obtenerIdiomaUsuario(req) {
    try {
        if (!req.user) {
            return 'es-MX';
        }

        const {
            data,
            error
        } = await supabaseAdmin
            .from('perfiles')
            .select('idioma')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error) {
            console.error(
                '❌ Error obteniendo idioma:',
                error
            );

            return 'es-MX';
        }

        return (
            data?.idioma ||
            'es-MX'
        );

    } catch (error) {
        console.error(
            '❌ Error obtenerIdiomaUsuario:',
            error
        );

        return 'es-MX';
    }
}

// ================================================================
// RUTAS I18N
// ================================================================

app.get(
    '/api/i18n',
    async (req, res) => {

        try {

            const idioma =
                req.query.idioma ||
                'es-MX';

            const {
                data,
                error
            } = await supabaseAdmin
                .from('traducciones')
                .select(
                    'clave, valor'
                )
                .eq(
                    'idioma',
                    idioma
                );

            if (error) {
                console.error(
                    '❌ Error I18N:',
                    error
                );

                return res.status(500).json({
                    error:
                        'Error cargando traducciones'
                });
            }

            const traducciones = {};

            for (const row of data || []) {
                traducciones[row.clave] =
                    row.valor;
            }

            return res.json({
                success: true,
                idioma,
                traducciones
            });

        } catch (error) {

            console.error(
                '❌ Error /api/i18n:',
                error
            );

            return res.status(500).json({
                error:
                    'Error interno'
            });
        }
    }
);

// ================================================================
// LIVEKIT TOKEN
// ================================================================

app.post(
    '/api/livekit/token',
    authMiddleware,
    async (req, res) => {

        try {

            const {
                roomName,
                participantName,
                identity
            } = req.body;

            if (!roomName) {
                return res.status(400).json({
                    error:
                        'roomName es requerido'
                });
            }

            const participantIdentity =
                identity ||
                req.user.id;

            const displayName =
                participantName ||
                req.user.email ||
                participantIdentity;

            const token =
                new AccessToken(
                    LIVEKIT_API_KEY,
                    LIVEKIT_API_SECRET,
                    {
                        identity:
                            participantIdentity,
                        name:
                            displayName,
                        ttl:
                            '3h'
                    }
                );

            token.addGrant({
                roomJoin: true,
                room:
                    roomName,
                canPublish: true,
                canSubscribe: true
            });

            const jwt =
                await token.toJwt();

            return res.json({
                success: true,
                token: jwt,
                url:
                    LIVEKIT_WS_URL ||
                    LIVEKIT_URL
            });

        } catch (error) {

            console.error(
                '❌ Error generando LiveKit token:',
                error
            );

            return res.status(500).json({
                error:
                    'No se pudo generar el token'
            });
        }
    }
);

// ================================================================
// TURNSTILE
// ================================================================

async function verificarTurnstile(
    token,
    remoteip
) {

    if (!TURNSTILE_SECRET_KEY) {
        return {
            success: false,
            error:
                'Turnstile no configurado'
        };
    }

    if (!token) {
        return {
            success: false,
            error:
                'Token Turnstile requerido'
        };
    }

    try {

        const params =
            new URLSearchParams();

        params.append(
            'secret',
            TURNSTILE_SECRET_KEY
        );

        params.append(
            'response',
            token
        );

        if (remoteip) {
            params.append(
                'remoteip',
                remoteip
            );
        }

        const response =
            await axios.post(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                params.toString(),
                {
                    headers: {
                        'Content-Type':
                            'application/x-www-form-urlencoded'
                    }
                }
            );

        const result =
            response.data || {};

        /*
         * Verificación adicional del hostname.
         *
         * Se mantiene el hostname existente.
         */

        if (
            result.success &&
            Array.isArray(
                result.hostname
                    ? [result.hostname]
                    : []
            )
        ) {

            if (
                result.hostname &&
                result.hostname !==
                    TURNSTILE_EXPECTED_HOSTNAME &&
                result.hostname !==
                    'auction.up.railway.app'
            ) {

                console.warn(
                    '⚠️ Turnstile hostname inesperado:',
                    result.hostname
                );

                return {
                    success: false,
                    error:
                        'Hostname Turnstile no permitido'
                };
            }
        }

        return result;

    } catch (error) {

        console.error(
            '❌ Error Turnstile:',
            error.message
        );

        return {
            success: false,
            error:
                'Error verificando Turnstile'
        };
    }
}

// ================================================================
// DELETE ACCOUNT
// ================================================================

app.post(
    '/api/account/delete',
    authMiddleware,
    async (req, res) => {

        try {

            const {
                turnstileToken
            } = req.body;

            const turnstile =
                await verificarTurnstile(
                    turnstileToken,
                    req.ip
                );

            if (!turnstile.success) {

                return res.status(400).json({
                    error:
                        'Verificación de seguridad fallida'
                });
            }

            const userId =
                req.user.id;

            /*
             * Aquí se conserva la lógica existente
             * de eliminación de cuenta.
             */

            const {
                error
            } = await supabaseAdmin.auth.admin.deleteUser(
                userId
            );

            if (error) {

                console.error(
                    '❌ Error eliminando usuario:',
                    error
                );

                return res.status(500).json({
                    error:
                        'No se pudo eliminar la cuenta'
                });
            }

            return res.json({
                success: true,
                message:
                    'Cuenta eliminada correctamente'
            });

        } catch (error) {

            console.error(
                '❌ Error /api/account/delete:',
                error
            );

            return res.status(500).json({
                error:
                    'Error interno eliminando cuenta'
            });
        }
    }
);

// ================================================================
// STATIC FILES
// ================================================================

const publicPath =
    path.join(
        __dirname,
        'public'
    );

app.use(
    express.static(
        publicPath,
        {
            index: false,
            maxAge:
                isProduction
                    ? '1h'
                    : 0
        }
    )
);

// ================================================================
// FEATURES STATIC
// ================================================================

const featuresPath =
    path.join(
        publicPath,
        'features'
    );

app.use(
    '/features',
    express.static(
        featuresPath,
        {
            index: false,
            maxAge:
                isProduction
                    ? '1h'
                    : 0
        }
    )
);

// ================================================================
// MENSAJES.JS EXPLÍCITO
// ================================================================

app.get(
    '/features/mensajes/js/mensajes.js',
    (req, res) => {

        const filePath =
            path.join(
                publicPath,
                'features',
                'mensajes',
                'js',
                'mensajes.js'
            );

        if (
            !fs.existsSync(filePath)
        ) {

            return res.status(404).send(
                'mensajes.js no encontrado'
            );
        }

        return res.sendFile(
            filePath
        );
    }
);

// ================================================================
// ROUTERS
// ================================================================

try {

    const authRoutes =
        require('./routes/auth');

    app.use(
        '/api/auth',
        authRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/auth:',
        error
    );
}

// ================================================================

try {

    const paymentRoutes =
        require('./routes/payments');

    app.use(
        '/api/payments',
        paymentRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/payments:',
        error
    );
}

// ================================================================

try {

    const webhookRoutes =
        require('./routes/webhook');

    app.use(
        '/api/webhook',
        webhookRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/webhook:',
        error
    );
}

// ================================================================

try {

    const membresiaRoutes =
        require('./routes/payments/membresia');

    app.use(
        '/api/payments/membresia',
        membresiaRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/payments/membresia:',
        error
    );
}

// ================================================================

try {

    const payRoutes =
        require('./routes/pay');

    app.use(
        '/api/pay',
        payRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/pay:',
        error
    );
}

// ================================================================

try {

    const mensajesRoutes =
        require('./routes/mensajes');

    app.use(
        '/api/mensajes',
        mensajesRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/mensajes:',
        error
    );
}

// ================================================================

try {

    const marketingRoutes =
        require('./routes/marketing');

    app.use(
        '/api/marketing',
        marketingRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/marketing:',
        error
    );
}

// ================================================================

try {

    const videoRoutes =
        require('./routes/video');

    app.use(
        '/api/video',
        videoRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/video:',
        error
    );
}

// ================================================================

try {

    const aiRoutes =
        require('./routes/ai');

    app.use(
        '/api/ai',
        aiRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/ai:',
        error
    );
}

// ================================================================

try {

    const aiVoiceRoutes =
        require('./routes/ai-voice');

    app.use(
        '/api/ai/voice',
        aiVoiceRoutes
    );

} catch (error) {

    console.error(
        '❌ Error cargando routes/ai-voice:',
        error
    );
}

// ================================================================
// HTML ROUTES
// ================================================================

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            path.join(
                publicPath,
                'index.html'
            )
        );
    }
);

// ================================================================

app.get(
    '/index.html',
    (req, res) => {

        res.sendFile(
            path.join(
                publicPath,
                'index.html'
            )
        );
    }
);

// ================================================================
// FRIENDLY ROUTES
// ================================================================

const friendlyRoutes = {

    '/login':
        'login.html',

    '/registro':
        'registro.html',

    '/perfil':
        'features/perfil/perfil.html',

    '/configuracion':
        'features/perfil/configuracion.html',

    '/mensajes':
        'features/mensajes/mensajes.html',

    '/mercado':
        'features/mercado/index.html',

    '/muro':
        'features/muro/index.html',

    '/videos':
        'features/videos/index.html',

    '/live':
        'features/live/index.html'
};

for (
    const [
        route,
        file
    ] of Object.entries(
        friendlyRoutes
    )
) {

    app.get(
        route,
        (req, res) => {

            res.sendFile(
                path.join(
                    publicPath,
                    file
                )
            );
        }
    );
}

// ================================================================
// CSARIEL PAY FRIENDLY ROUTES
// ================================================================

app.get(
    '/pay',
    (req, res) => {

        res.sendFile(
            path.join(
                publicPath,
                'pay.html'
            )
        );
    }
);

app.get(
    '/csariel-pay',
    (req, res) => {

        res.sendFile(
            path.join(
                publicPath,
                'pay.html'
            )
        );
    }
);

// ================================================================
// OTHER PAGES
// ================================================================

app.get(
    '/terminos',
    (req, res) => {

        res.sendFile(
            path.join(
                publicPath,
                'terminos.html'
            )
        );
    }
);

app.get(
    '/privacidad',
    (req, res) => {

        res.sendFile(
            path.join(
                publicPath,
                'privacidad.html'
            )
        );
    }
);

app.get(
    '/eliminar-cuenta',
    (req, res) => {

        res.sendFile(
            path.join(
                publicPath,
                'eliminar-cuenta.html'
            )
        );
    }
);

// ================================================================
// HEALTH CHECK
// ================================================================

app.get(
    '/health',
    async (req, res) => {

        let supabaseStatus =
            'unknown';

        try {

            const {
                error
            } = await supabaseAdmin
                .from('idiomas_sistema')
                .select('codigo')
                .limit(1);

            supabaseStatus =
                error
                    ? 'error'
                    : 'ok';

        } catch (error) {

            supabaseStatus =
                'error';
        }

        return res.status(200).json({

            status: 'ok',

            service:
                'galleta-domo',

            environment:
                process.env.NODE_ENV ||
                'development',

            timestamp:
                new Date().toISOString(),

            supabase:
                supabaseStatus,

            livekit: {
                configured:
                    Boolean(
                        LIVEKIT_API_KEY &&
                        LIVEKIT_API_SECRET &&
                        (
                            LIVEKIT_URL ||
                            LIVEKIT_WS_URL
                        )
                    )
            },

            web3: {

                walletconnect_configured:
                    Boolean(
                        WALLETCONNECT_PROJECT_ID
                    ),

                public_url:
                    PUBLIC_APP_URL,

                polygon_chain_id:
                    WEB3_CHAIN_ID,

                endpoint:
                    '/api/config/web3'
            }
        });
    }
);

// ================================================================
// API 404
// ================================================================

app.use(
    '/api',
    (req, res) => {

        return res.status(404).json({
            error:
                'Endpoint no encontrado',
            path:
                req.originalUrl
        });
    }
);

// ================================================================
// SPA FALLBACK
// ================================================================

app.get(
    '*',
    (req, res, next) => {

        /*
         * No convertir rutas de archivos inexistentes
         * en index.html.
         */

        if (
            path.extname(
                req.path
            )
        ) {

            return next();
        }

        return res.sendFile(
            path.join(
                publicPath,
                'index.html'
            )
        );
    }
);

// ================================================================
// ERROR HANDLER
// ================================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            '❌ Error global:',
            err
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        return res.status(
            err.status ||
            500
        ).json({

            error:
                isProduction
                    ? 'Error interno del servidor'
                    : (
                        err.message ||
                        'Error interno del servidor'
                    )
        });
    }
);

// ================================================================
// START
// ================================================================

app.listen(
    PORT,
    () => {

        console.log('');
        console.log(
            '================================================'
        );
        console.log(
            "🚀 Sariel's Ecosystem"
        );
        console.log(
            '================================================'
        );

        console.log(
            `🌐 Puerto: ${PORT}`
        );

        console.log(
            `🌍 Entorno: ${
                process.env.NODE_ENV ||
                'development'
            }`
        );

        console.log(
            `🔗 Supabase: ${
                SUPABASE_URL
                    ? '✅ Configurado'
                    : '❌ Falta configuración'
            }`
        );

        console.log(
            `🎥 LiveKit: ${
                LIVEKIT_API_KEY &&
                LIVEKIT_API_SECRET
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        /*
         * Diagnóstico Web3
         */

        console.log(
            `🌐 Web3 URL canónica: ${
                PUBLIC_APP_URL
            }`
        );

        console.log(
            `🔗 WalletConnect: ${
                WALLETCONNECT_PROJECT_ID
                    ? '✅ Configurado'
                    : '❌ No configurado'
            }`
        );

        console.log(
            `⛓️ Polygon: Amoy (${
                WEB3_CHAIN_ID
            })`
        );

        console.log(
            '================================================'
        );

        console.log('');
    }
);

// ================================================================
// EXPORT
// ================================================================

module.exports = app;