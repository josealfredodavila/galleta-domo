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

const PORT =
    process.env.PORT || 8080;

// ================================================================
// SUPABASE
// ================================================================

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
    console.warn(
        '⚠️ Falta SUPABASE_URL'
    );
}

if (!SUPABASE_ANON_KEY) {
    console.warn(
        '⚠️ Falta SUPABASE_ANON_KEY'
    );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
        '⚠️ Falta SUPABASE_SERVICE_ROLE_KEY'
    );
}

// Cliente público
const supabase =
    createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

// Cliente administrativo
const supabaseAdmin =
    createClient(
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
    console.warn(
        '⚠️ Falta LIVEKIT_API_KEY'
    );
}

if (!LIVEKIT_API_SECRET) {
    console.warn(
        '⚠️ Falta LIVEKIT_API_SECRET'
    );
}

if (!LIVEKIT_URL) {
    console.warn(
        '⚠️ Falta LIVEKIT_URL'
    );
}

// ================================================================
// WEB3 / WALLETCONNECT
// ================================================================

const PUBLIC_APP_URL =
    process.env.PUBLIC_APP_URL ||
    'https://galleta-domo-production.up.railway.app';

const WALLETCONNECT_PROJECT_ID =
    process.env.WALLETCONNECT_PROJECT_ID || '';

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

const TURNSTILE_EXPECTED_HOSTNAME =
    'galleta-domo-production.up.railway.app';

if (!TURNSTILE_SECRET_KEY) {
    console.warn(
        '⚠️ Falta TURNSTILE_SECRET_KEY'
    );
}

if (!TURNSTILE_SITE_KEY) {
    console.warn(
        '⚠️ Falta TURNSTILE_SITE_KEY'
    );
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

    if (
        !authHeader.startsWith(
            'Bearer '
        )
    ) {
        return null;
    }

    const token =
        authHeader
            .substring(7)
            .trim();

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

async function authMiddleware(
    req,
    res,
    next
) {

    try {

        const authHeader =
            req.headers.authorization || '';

        if (
            !authHeader.startsWith(
                'Bearer '
            )
        ) {
            return res.status(401).json({
                error:
                    'No autenticado'
            });
        }

        const token =
            authHeader
                .substring(7)
                .trim();

        if (!token) {
            return res.status(401).json({
                error:
                    'Token no proporcionado'
            });
        }

        const {
            data,
            error
        } =
            await supabaseAdmin
                .auth
                .getUser(token);

        if (
            error ||
            !data ||
            !data.user
        ) {

            return res.status(401).json({
                error:
                    'Token inválido o expirado'
            });
        }

        req.user =
            data.user;

        req.accessToken =
            token;

        next();

    } catch (error) {

        console.error(
            '❌ Error authMiddleware:',
            error
        );

        return res.status(401).json({
            error:
                'No autenticado'
        });
    }
}

// ================================================================
// ADMIN MIDDLEWARE
// ================================================================

async function adminMiddleware(
    req,
    res,
    next
) {

    try {

        if (!req.user) {
            return res.status(401).json({
                error:
                    'No autenticado'
            });
        }

        const {
            data,
            error
        } =
            await supabaseAdmin
                .from('perfiles')
                .select('rol')
                .eq(
                    'id',
                    req.user.id
                )
                .maybeSingle();

        if (error) {

            console.error(
                '❌ Error verificando rol:',
                error
            );

            return res.status(500).json({
                error:
                    'Error verificando permisos'
            });
        }

        if (
            !data ||
            data.rol !== 'admin'
        ) {

            return res.status(403).json({
                error:
                    'Acceso restringido'
            });
        }

        next();

    } catch (error) {

        console.error(
            '❌ Error adminMiddleware:',
            error
        );

        return res.status(500).json({
            error:
                'Error verificando permisos'
        });
    }
}

// ================================================================
// SEGURIDAD / HEADERS
// ================================================================

app.use(
    helmet({
        crossOriginResourcePolicy:
            false,

        contentSecurityPolicy: {

            directives: {

                defaultSrc: [
                    "'self'"
                ],

                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",

                    "https://cdn.jsdelivr.net",
                    "https://unpkg.com",
                    "https://esm.sh",

                    "https://challenges.cloudflare.com",

                    "https://www.youtube.com",
                    "https://s.ytimg.com"
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com"
                ],

                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "data:"
                ],

                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https:"
                ],

                mediaSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https:"
                ],

                connectSrc: [

                    "'self'",

                    // Supabase
                    "https://zultnlogdoajehbswlih.supabase.co",
                    "wss://zultnlogdoajehbswlih.supabase.co",

                    // QR
                    "https://api.qrserver.com",

                    // Cloudflare
                    "https://challenges.cloudflare.com",

                    // NOWPayments
                    "https://api.nowpayments.io",
                    "https://api-sandbox.nowpayments.io",

                    // Telnyx
                    "https://api.telnyx.com",

                    // LiveKit
                    "https://csariels-domo-57ujk04t.livekit.cloud",
                    "wss://csariels-domo-57ujk04t.livekit.cloud",

                    // WalletConnect
                    "https://esm.sh",
                    "https://api.web3modal.com",
                    "https://api.web3modal.org",

                    "https://explorer-api.walletconnect.com",
                    "https://explorer-api.walletconnect.org",

                    "https://relay.walletconnect.com",
                    "wss://relay.walletconnect.com",

                    "wss://relay.walletconnect.org",

                    "https://pulse.walletconnect.com",
                    "https://pulse.walletconnect.org",

                    "https://verify.walletconnect.com",
                    "https://verify.walletconnect.org",

                    "https://rpc.walletconnect.com",
                    "wss://rpc.walletconnect.com",

                    "https://keys.walletconnect.com",

                    // Polygon
                    "https://rpc-amoy.polygon.technology",
                    "https://polygon-rpc.com",
                    "https://polygon.llamarpc.com",
                    "https://polygon-bor-rpc.publicnode.com",
                    "https://1rpc.io",
                    "https://rpc.ankr.com",

                    // Explorers
                    "https://amoy.polygonscan.com",
                    "https://polygonscan.com",
                    "https://api.polygonscan.com",
                    "https://api-amoy.polygonscan.com",

                    // Coinbase
                    "https://api.wallet.coinbase.com",
                    "https://mainnet.optimism.io",
                    "wss://www.walletlink.org",

                    // Rainbow
                    "https://rnbwapp.com",
                    "https://api.rainbow.me",

                    // MetaMask
                    "https://metamask.app.link",
                    "https://api.metamask.io",

                    // RPC fallback
                    "https://cloudflare-eth.com",
                    "https://eth.llamarpc.com"
                ],

                frameSrc: [
                    "'self'",
                    "https://challenges.cloudflare.com",
                    "https://www.youtube.com",
                    "https://player.vimeo.com",
                    "https://verify.walletconnect.com",
                    "https://verify.walletconnect.org"
                ],

                workerSrc: [
                    "'self'",
                    "blob:"
                ],

                objectSrc: [
                    "'none'"
                ],

                baseUri: [
                    "'self'"
                ],

                formAction: [
                    "'self'"
                ],

                frameAncestors: [
                    "'self'"
                ]
            }
        }
    })
);

app.use(
    compression()
);

// ================================================================
// LOGGING
// ================================================================

const isProduction =
    process.env.NODE_ENV ===
    'production';

if (!isProduction) {

    app.use(
        morgan('dev')
    );

} else {

    app.use(
        morgan('combined')
    );
}

// ================================================================
// CORS
// ================================================================

const corsOrigins =
    (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(
            origin =>
                origin.trim()
        )
        .filter(Boolean);

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

        origin:
            function (
                origin,
                callback
            ) {

                if (!origin) {
                    return callback(
                        null,
                        true
                    );
                }

                if (
                    allowedCorsOrigins
                        .includes(origin)
                ) {

                    return callback(
                        null,
                        true
                    );
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

        credentials:
            true,

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
            'x-requested-with',
            'x-nowpayments-sig',
            'x-signature'
        ]
    })
);

// ================================================================
// RATE LIMIT
// ================================================================

const apiLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        max:
            300,

        standardHeaders:
            true,

        legacyHeaders:
            false,

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

        limit:
            '10mb',

        verify:
            (
                req,
                res,
                buf
            ) => {

                req.rawBody =
                    buf.toString(
                        'utf8'
                    );
            }
    })
);

app.use(
    express.urlencoded({

        extended:
            true,

        limit:
            '10mb'
    })
);

// ================================================================
// WEB3 PUBLIC CONFIG
// ================================================================

app.get(
    '/api/config/web3',
    (req, res) => {

        return res.status(200).json({

            success:
                true,

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

async function obtenerIdiomaUsuario(
    req
) {

    try {

        if (!req.user) {
            return 'es-MX';
        }

        const {
            data,
            error
        } =
            await supabaseAdmin
                .from('perfiles')
                .select('idioma')
                .eq(
                    'id',
                    req.user.id
                )
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
    async (
        req,
        res
    ) => {

        try {

            const idioma =
                req.query.idioma ||
                'es-MX';

            const {
                data,
                error
            } =
                await supabaseAdmin
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

            for (
                const row
                of data || []
            ) {

                traducciones[
                    row.clave
                ] =
                    row.valor;
            }

            return res.json({

                success:
                    true,

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
    async (
        req,
        res
    ) => {

        try {

            const {
                roomName,
                participantName,
                identity
            } =
                req.body;

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

                roomJoin:
                    true,

                room:
                    roomName,

                canPublish:
                    true,

                canSubscribe:
                    true
            });

            const jwt =
                await token.toJwt();

            return res.json({

                success:
                    true,

                token:
                    jwt,

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
            success:
                false,

            error:
                'Turnstile no configurado'
        };
    }

    if (!token) {

        return {
            success:
                false,

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

        if (
            result.success &&
            result.hostname
        ) {

            if (

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

                    success:
                        false,

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

            success:
                false,

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
    async (
        req,
        res
    ) => {

        try {

            const {
                turnstileToken
            } =
                req.body;

            const turnstile =
                await verificarTurnstile(
                    turnstileToken,
                    req.ip
                );

            if (
                !turnstile.success
            ) {

                return res.status(400).json({
                    error:
                        'Verificación de seguridad fallida'
                });
            }

            const userId =
                req.user.id;

            const {
                error
            } =
                await supabaseAdmin
                    .auth
                    .admin
                    .deleteUser(
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

                success:
                    true,

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

            index:
                false,

            maxAge:
                isProduction
                    ? '1h'
                    : 0,

            fallthrough:
                true
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

            index:
                false,

            maxAge:
                isProduction
                    ? '1h'
                    : 0,

            fallthrough:
                true
        }
    )
);

// ================================================================
// RUTAS HTML CRÍTICAS
// ================================================================

function enviarArchivoPublico(
    relativePath,
    req,
    res,
    next
) {

    const filePath =
        path.join(
            publicPath,
            relativePath
        );

    if (
        !fs.existsSync(
            filePath
        )
    ) {

        console.error(
            `❌ Archivo no encontrado: ${filePath}`
        );

        return next();
    }

    return res.sendFile(
        filePath
    );
}

// Perfil
app.get(
    '/features/perfil/perfil.html',
    (req, res, next) => {

        enviarArchivoPublico(
            'features/perfil/perfil.html',
            req,
            res,
            next
        );
    }
);

// Wallet
app.get(
    '/features/perfil/configuracion/sariels/wallet.html',
    (req, res, next) => {

        enviarArchivoPublico(
            'features/perfil/configuracion/sariels/wallet.html',
            req,
            res,
            next
        );
    }
);

// Configuración
app.get(
    '/features/perfil/configuracion/index.html',
    (req, res, next) => {

        enviarArchivoPublico(
            'features/perfil/configuracion/index.html',
            req,
            res,
            next
        );
    }
);

// Wallet Connect JS
app.get(
    '/features/perfil/shared/js/wallet-connect.js',
    (req, res, next) => {

        enviarArchivoPublico(
            'features/perfil/shared/js/wallet-connect.js',
            req,
            res,
            next
        );
    }
);

// Config layout
app.get(
    '/features/shared/config-layout.js',
    (req, res, next) => {

        enviarArchivoPublico(
            'features/shared/config-layout.js',
            req,
            res,
            next
        );
    }
);

// Config icons
app.get(
    '/features/shared/config-icons.js',
    (req, res, next) => {

        enviarArchivoPublico(
            'features/shared/config-icons.js',
            req,
            res,
            next
        );
    }
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
            !fs.existsSync(
                filePath
            )
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
// HELPERS PARA ROUTERS
// ================================================================

function normalizarRouter(
    modulo,
    nombre
) {

    if (
        typeof modulo ===
        'function'
    ) {

        return modulo;
    }

    if (
        modulo &&
        typeof modulo.router ===
        'function'
    ) {

        console.log(
            `ℹ️ ${nombre}: usando export .router`
        );

        return modulo.router;
    }

    if (
        modulo &&
        typeof modulo.default ===
        'function'
    ) {

        console.log(
            `ℹ️ ${nombre}: usando export .default`
        );

        return modulo.default;
    }

    console.error(
        `❌ ${nombre} no exporta un Express Router válido`
    );

    return null;
}

function montarRouter(
    mountPath,
    requirePath,
    nombre
) {

    try {

        const modulo =
            require(
                requirePath
            );

        const router =
            normalizarRouter(
                modulo,
                nombre
            );

        if (
            typeof router !==
            'function'
        ) {

            console.error(
                `❌ ${nombre}: router inválido. Ruta no montada: ${mountPath}`
            );

            return false;
        }

        app.use(
            mountPath,
            router
        );

        console.log(
            `✅ ${nombre} cargado en ${mountPath}`
        );

        return true;

    } catch (error) {

        console.error(
            `❌ Error cargando ${nombre}:`,
            error
        );

        return false;
    }
}

// ================================================================
// ROUTERS
// ================================================================

montarRouter(
    '/api/auth',
    './routes/auth',
    'routes/auth'
);

montarRouter(
    '/api/payments',
    './routes/payments',
    'routes/payments'
);

montarRouter(
    '/api/webhook',
    './routes/webhooks',
    'routes/webhooks'
);

// ================================================================
// NOTA:
//
// NO se carga:
//     ./routes/payments/membresia
//
// El handler de membresía se encuentra en:
//     ./routes/membresia-webhook-handler.js
//
// Ese archivo exporta funciones y no un Express Router.
// La integración del webhook se realiza mediante
// routes/webhooks.js.
// ================================================================

montarRouter(
    '/api/pay',
    './routes/pay',
    'routes/pay'
);

montarRouter(
    '/api/mensajes',
    './routes/mensajes',
    'routes/mensajes'
);

montarRouter(
    '/api/marketing',
    './routes/marketing',
    'routes/marketing'
);

// ================================================================
// VIDEO PROCESSOR
// ================================================================

montarRouter(
    '/api/video',
    './routes/video-processor',
    'routes/video-processor'
);

// ================================================================
// AI CHAT
// ================================================================

montarRouter(
    '/api/ai',
    './routes/ai-chat',
    'routes/ai-chat'
);

// ================================================================
// AI VOICE
// ================================================================

montarRouter(
    '/api/ai/voice',
    './routes/ai-voice',
    'routes/ai-voice'
);

// ================================================================
// HTML ROUTES
// ================================================================

app.get(
    '/',
    (req, res) => {

        return res.sendFile(
            path.join(
                publicPath,
                'index.html'
            )
        );
    }
);

app.get(
    '/index.html',
    (req, res) => {

        return res.sendFile(
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
    ]
    of Object.entries(
        friendlyRoutes
    )
) {

    app.get(
        route,
        (req, res) => {

            const filePath =
                path.join(
                    publicPath,
                    file
                );

            if (
                !fs.existsSync(
                    filePath
                )
            ) {

                return res.status(
                    404
                ).send(
                    'Página no encontrada'
                );
            }

            return res.sendFile(
                filePath
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

        return res.sendFile(
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

        return res.sendFile(
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

        return res.sendFile(
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

        return res.sendFile(
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

        return res.sendFile(
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

async function healthCheck(
    req,
    res
) {

    let supabaseStatus =
        'unknown';

    try {

        const {
            error
        } =
            await supabaseAdmin
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

        status:
            'ok',

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

app.get(
    '/health',
    healthCheck
);

app.get(
    '/api/health',
    healthCheck
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
//
// IMPORTANTE:
//
// NO utilizamos:
//     app.get('*', ...)
//
// porque dependiendo de la versión de Express/path-to-regexp
// puede producir errores de enrutamiento.
//
// Este middleware únicamente sirve index.html para rutas
// sin extensión que no hayan sido atendidas anteriormente.
//
// Los archivos .html, .js, .css, imágenes, etc. NO se convierten
// en index.html.
// ================================================================

app.use(
    (req, res, next) => {

        // Solo GET/HEAD
        if (
            req.method !== 'GET' &&
            req.method !== 'HEAD'
        ) {
            return next();
        }

        // No tocar API
        if (
            req.path === '/api' ||
            req.path.startsWith('/api/')
        ) {
            return next();
        }

        // No tocar archivos
        if (
            path.extname(
                req.path
            )
        ) {
            return next();
        }

        const indexPath =
            path.join(
                publicPath,
                'index.html'
            );

        if (
            !fs.existsSync(
                indexPath
            )
        ) {
            return next();
        }

        return res.sendFile(
            indexPath
        );
    }
);

// ================================================================
// 404 FINAL
// ================================================================

app.use(
    (req, res) => {

        return res.status(404).json({

            error:
                'Recurso no encontrado',

            path:
                req.originalUrl
        });
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
