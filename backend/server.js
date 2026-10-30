// ================================================================
// server.js — Sariel's Ecosystem
// Backend principal — Producción Railway
// v3.5: Wallet (nonce + firma EOA), Media (moderación con AWS
//       Rekognition), Moderar-Texto (OpenAI Moderation API) y
//       Llamadas mixtas (/api/llamadas: LiveKit hoy, Telnyx después).
// v3.6: Música (Deezer API sin API Key) agregada.
// v3.7: CSP de Deezer ampliada a *.dzcdn.net, validación de
//       /api/music/buscar, timeout a Deezer y limpieza de connectSrc.
// v3.8: Eliminado el montaje de /api/mensajes (router sin uso; ver
//       auditoría: C-04). Las llamadas se gestionan solo en /api/llamadas.
// v3.9: Health check desacoplado de Supabase: /api/health es liveness
//       (siempre 200) y /api/health/detalle muestra el estado completo.
// v4.0: Noticias montado en /api/noticias y ruta amigable /noticias.
// v4.1: Montaje de noticias con diagnóstico: registra la ruta exacta
//       del archivo, el tipo de export y sus claves. Si el export no
//       es un router, monta un 503 con el motivo en vez de un 404.
// ================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');

// ================================================================
// APP
// ================================================================

const app = express();

app.disable('x-powered-by');

app.set('trust proxy', 1);

const PORT = process.env.PORT || 8080;

const isProduction = process.env.NODE_ENV === 'production';

// ================================================================
// CONFIGURACIÓN
// ================================================================

const DEFAULT_PUBLIC_APP_URL = 'https://galleta-domo-production.up.railway.app';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || '';

const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID || '';

const WEB3_CHAIN_ID = parseInt(process.env.POLYGON_CHAIN_ID, 10) || 80002;

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';

const DEEZER_TIMEOUT_MS = 8000;

// ================================================================
// VALIDACIÓN DE VARIABLES CRÍTICAS
// ================================================================

const missingEnvironment = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY]
]
    .filter(([, value]) => !value)
    .map(([name]) => name);

let PUBLIC_APP_HOSTNAME = '';
let PUBLIC_APP_ORIGIN = '';

try {
    const parsed = new URL(PUBLIC_APP_URL);
    PUBLIC_APP_HOSTNAME = parsed.hostname;
    PUBLIC_APP_ORIGIN = parsed.origin;
} catch (error) {
    console.error('❌ PUBLIC_APP_URL inválida:', error.message);
    missingEnvironment.push('PUBLIC_APP_URL (válida)');
}

if (missingEnvironment.length > 0) {
    for (const name of missingEnvironment) {
        console.error(`❌ Variable de entorno crítica faltante o inválida: ${name}`);
    }
    if (isProduction) {
        console.error('🔴 Abortando arranque en producción.');
        process.exit(1);
    }
}

if (!LIVEKIT_API_KEY) console.warn('⚠️ Falta LIVEKIT_API_KEY');
if (!LIVEKIT_API_SECRET) console.warn('⚠️ Falta LIVEKIT_API_SECRET');
if (!LIVEKIT_WS_URL && !LIVEKIT_URL) console.warn('⚠️ Falta LIVEKIT_WS_URL');

if (!WALLETCONNECT_PROJECT_ID) {
    console.warn('⚠️ Falta WALLETCONNECT_PROJECT_ID (WalletConnect no podrá conectarse)');
}

if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.warn('⚠️ Falta GOOGLE_MAPS_API_KEY (ubicación por ciudad deshabilitada)');
}

if (!TURNSTILE_SECRET_KEY) console.warn('⚠️ Falta TURNSTILE_SECRET_KEY');
if (!TURNSTILE_SITE_KEY) console.warn('⚠️ Falta TURNSTILE_SITE_KEY');

if (!process.env.VAPID_PUBLIC_KEY) console.warn('⚠️ Falta VAPID_PUBLIC_KEY (push notifications deshabilitadas)');
if (!process.env.VAPID_PRIVATE_KEY) console.warn('⚠️ Falta VAPID_PRIVATE_KEY (push notifications deshabilitadas)');

if (!process.env.AWS_ACCESS_KEY_ID) console.warn('⚠️ Falta AWS_ACCESS_KEY_ID (moderación de imagen/video deshabilitada)');
if (!process.env.AWS_SECRET_ACCESS_KEY) console.warn('⚠️ Falta AWS_SECRET_ACCESS_KEY (moderación de imagen/video deshabilitada)');
if (!process.env.AWS_REGION) console.warn('⚠️ Falta AWS_REGION (moderación usará us-east-1 por defecto)');

if (!process.env.OPENAI_API_KEY) console.warn('⚠️ Falta OPENAI_API_KEY (moderación de texto deshabilitada)');

if (!process.env.NODE_ENV) console.warn('⚠️ NODE_ENV no está definido');

if (process.env.TELNYX_CALLS_ENABLED !== 'true') {
    console.log('ℹ️ Llamadas a números externos (Telnyx) desactivadas');
}

// ================================================================
// SUPABASE
// ================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ================================================================
// AUTH MIDDLEWARE (local, no exportado)
// ================================================================

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';

        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const token = authHeader.substring(7).trim();

        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !data || !data.user) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        req.user = data.user;
        req.accessToken = token;

        next();
    } catch (error) {
        console.error('❌ Error authMiddleware:', error);
        return res.status(401).json({ error: 'No autenticado' });
    }
}

// ================================================================
// ADMIN MIDDLEWARE
// ================================================================

async function adminMiddleware(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const { data, error } = await supabaseAdmin
            .from('usuarios')
            .select('es_admin')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error) {
            console.error('❌ Error verificando es_admin:', error);
            return res.status(500).json({ error: 'Error verificando permisos' });
        }

        if (!data || data.es_admin !== true) {
            return res.status(403).json({ error: 'Acceso restringido' });
        }

        next();
    } catch (error) {
        console.error('❌ Error adminMiddleware:', error);
        return res.status(500).json({ error: 'Error verificando permisos' });
    }
}

// ================================================================
// SEGURIDAD / HEADERS
// ================================================================

app.use(
    helmet({
        crossOriginResourcePolicy: false,

        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],

                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    "https://cdn.jsdelivr.net",
                    "https://unpkg.com",
                    "https://esm.sh",
                    "https://challenges.cloudflare.com",
                    "https://js.stripe.com",
                    "https://www.youtube.com",
                    "https://s.ytimg.com"
                ],

                scriptSrcAttr: ["'unsafe-inline'"],

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

                // MÚSICA DEEZER: carátulas y previews (subdominios dzcdn.net)
                imgSrc: ["'self'", "data:", "blob:", "https:", "https://*.dzcdn.net"],
                mediaSrc: ["'self'", "data:", "blob:", "https:", "https://*.dzcdn.net"],

                connectSrc: [
                    "'self'",
                    "https://galleta-domo-production.up.railway.app",
                    "wss://galleta-domo-production.up.railway.app",
                    "https://zultnlogdoajehbswlih.supabase.co",
                    "wss://zultnlogdoajehbswlih.supabase.co",
                    "https://api.qrserver.com",
                    "https://challenges.cloudflare.com",
                    "https://api.nowpayments.io",
                    "https://api-sandbox.nowpayments.io",
                    "https://api.stripe.com",
                    "https://js.stripe.com",
                    "https://hooks.stripe.com",
                    "https://api.telnyx.com",
                    "https://rtc.telnyx.com",
                    "wss://rtc.telnyx.com",
                    "https://csariels-domo-57ujk04t.livekit.cloud",
                    "wss://csariels-domo-57ujk04t.livekit.cloud",
                    "https://esm.sh",
                    "https://cdn.jsdelivr.net",
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
                    "https://rpc-amoy.polygon.technology",
                    "https://polygon-rpc.com",
                    "https://polygon.llamarpc.com",
                    "https://polygon-bor-rpc.publicnode.com",
                    "https://1rpc.io",
                    "https://rpc.ankr.com",
                    "https://amoy.polygonscan.com",
                    "https://polygonscan.com",
                    "https://api.polygonscan.com",
                    "https://api-amoy.polygonscan.com",
                    "https://api.wallet.coinbase.com",
                    "https://mainnet.optimism.io",
                    "wss://www.walletlink.org",
                    "https://rnbwapp.com",
                    "https://api.rainbow.me",
                    "https://metamask.app.link",
                    "https://api.metamask.io",
                    "https://cloudflare-eth.com",
                    "https://eth.llamarpc.com"
                ],

                frameSrc: [
                    "'self'",
                    "https://challenges.cloudflare.com",
                    "https://www.youtube.com",
                    "https://player.vimeo.com",
                    "https://js.stripe.com",
                    "https://hooks.stripe.com",
                    "https://verify.walletconnect.com",
                    "https://verify.walletconnect.org"
                ],

                workerSrc: ["'self'", "blob:"],

                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'self'"]
            }
        }
    })
);

app.use(compression());

// ================================================================
// LOGGING
// ================================================================

app.use(morgan(isProduction ? 'combined' : 'dev'));

// ================================================================
// CORS
// ================================================================

const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedCorsOrigins = Array.from(
    new Set([...corsOrigins, PUBLIC_APP_ORIGIN].filter(Boolean))
);

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);

            if (allowedCorsOrigins.includes(origin)) return callback(null, true);

            console.warn(`⚠️ CORS bloqueado: ${origin}`);
            return callback(new Error('Origen no permitido por CORS'));
        },

        credentials: true,

        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'apikey',
            'x-client-info',
            'x-requested-with',
            'x-nowpayments-sig',
            'x-signature'
        ],

        exposedHeaders: ['Content-Length', 'X-Requested-With'],
        maxAge: 86400,
        preflightContinue: false,
        optionsSuccessStatus: 204
    })
);

// ================================================================
// WEBHOOK TELNYX
// ================================================================

app.use('/api/telnyx/webhook', require('./routes/telnyx-webhook'));

// ================================================================
// RATE LIMIT GENERAL
// ================================================================

const RUTAS_WEBHOOK_SIN_LIMITE = [
    '/api/webhook/',
    '/api/webhooks/',
    '/api/mercado/webhook-nowpayments'
];

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.'
    },
    skip: (req) =>
        RUTAS_WEBHOOK_SIN_LIMITE.some((ruta) => req.originalUrl.startsWith(ruta))
});

app.use('/api/', apiLimiter);

// ================================================================
// BODY PARSERS
// ================================================================

app.use(
    express.json({
        limit: '10mb',
        verify: (req, res, buf) => {
            req.rawBody = buf.toString('utf8');
        }
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '10mb'
    })
);

// ================================================================
// CONFIG PÚBLICA
// ================================================================

app.get('/api/config/web3', (req, res) => {
    return res.status(200).json({
        success: true,
        publicUrl: PUBLIC_APP_URL,
        walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
        polygonChainId: WEB3_CHAIN_ID
    });
});

app.get('/api/config/public', (req, res) => {
    return res.status(200).json({
        success: true,
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
        publicUrl: PUBLIC_APP_URL
    });
});

// ================================================================
// I18N
// ================================================================

const I18N_DEFAULT_LANG = 'es-MX';
const I18N_CACHE_TTL_MS = 10 * 60 * 1000;
const i18nCache = new Map();

app.get('/api/i18n', async (req, res) => {
    try {
        const codigo = String(req.query.idioma || I18N_DEFAULT_LANG).trim().slice(0, 16);

        const cached = i18nCache.get(codigo);

        if (cached && cached.expira > Date.now()) {
            return res.json({
                success: true,
                idioma: codigo,
                traducciones: cached.traducciones
            });
        }

        const { data: idioma, error: idiomaError } = await supabaseAdmin
            .from('idiomas_sistema')
            .select('id, codigo')
            .eq('codigo', codigo)
            .eq('activo', true)
            .maybeSingle();

        if (idiomaError) {
            console.error('❌ Error resolviendo idioma:', idiomaError);
            return res.status(500).json({ error: 'Error cargando traducciones' });
        }

        if (!idioma) {
            return res.status(404).json({ error: 'Idioma no disponible' });
        }

        const { data, error } = await supabaseAdmin
            .from('traducciones')
            .select('clave, valor')
            .eq('idioma_id', idioma.id);

        if (error) {
            console.error('❌ Error I18N:', error);
            return res.status(500).json({ error: 'Error cargando traducciones' });
        }

        const traducciones = {};

        for (const row of data || []) {
            traducciones[row.clave] = row.valor;
        }

        i18nCache.set(idioma.codigo, {
            traducciones,
            expira: Date.now() + I18N_CACHE_TTL_MS
        });

        return res.json({
            success: true,
            idioma: idioma.codigo,
            traducciones
        });
    } catch (error) {
        console.error('❌ Error /api/i18n:', error);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// ================================================================
// MARQUINHOS · EMBEDDINGS
// ================================================================

let _embedderMarquinhos = null;
let _embedderLoading = null;

async function obtenerEmbedder() {
    if (_embedderMarquinhos) return _embedderMarquinhos;
    if (_embedderLoading) return _embedderLoading;

    _embedderLoading = (async () => {
        try {
            console.log('🧠 [Embeddings] Cargando modelo all-MiniLM-L6-v2...');
            const { pipeline } = await import('@xenova/transformers');
            const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            console.log('✅ [Embeddings] Modelo listo (384 dims)');
            _embedderMarquinhos = pipe;
            return pipe;
        } catch (e) {
            console.error('❌ [Embeddings] Error cargando modelo:', e);
            _embedderLoading = null;
            throw e;
        }
    })();

    return _embedderLoading;
}

app.post('/api/ai/embeddings', authMiddleware, async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length < 2) {
            return res.status(400).json({ error: 'Texto requerido (min 2 caracteres)' });
        }

        const textoLimpio = text.trim().slice(0, 2000);

        const embedder = await obtenerEmbedder();
        const output = await embedder(textoLimpio, { pooling: 'mean', normalize: true });

        const embedding = Array.from(output.data);

        return res.json({
            success: true,
            embedding,
            dims: embedding.length
        });
    } catch (error) {
        console.error('❌ Error /api/ai/embeddings:', error);
        return res.status(500).json({
            error: 'Error generando embedding',
            message: error.message
        });
    }
});

console.log('✅ Endpoint /api/ai/embeddings registrado');

// ================================================================
// MÚSICA DEEZER (buscador para Marquinhos y el Muro)
// ================================================================

app.get('/api/music/buscar', async (req, res) => {
    try {
        const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

        if (!query) {
            return res.status(400).json({ error: 'Falta el parámetro q (canción)' });
        }

        if (query.length > 100) {
            return res.status(400).json({ error: 'El parámetro q es demasiado largo (máx 100)' });
        }

        const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;

        const response = await axios.get(url, { timeout: DEEZER_TIMEOUT_MS });
        const data = response.data;

        const canciones = (Array.isArray(data?.data) ? data.data : [])
            .filter(c => c && c.preview && c.artist && c.album)
            .slice(0, 5)
            .map(c => ({
                id: c.id,
                titulo: c.title || '',
                artista: c.artist.name || '',
                caratula: c.album.cover_medium || '',
                audio_preview: c.preview,
                link_deezer: c.link || ''
            }));

        if (canciones.length === 0) {
            return res.json({ success: false, mensaje: 'No se encontraron canciones' });
        }

        return res.json({
            success: true,
            resultados: canciones
        });
    } catch (error) {
        console.error('❌ Error buscando música en Deezer:', error.message);
        return res.status(500).json({ error: 'Error al conectar con Deezer' });
    }
});

console.log('✅ Endpoint /api/music/buscar registrado (Deezer)');

// ================================================================
// TURNSTILE
// ================================================================

async function verificarTurnstile(token, remoteip) {
    if (!TURNSTILE_SECRET_KEY) {
        return { success: false, error: 'Turnstile no configurado' };
    }

    if (!token) {
        return { success: false, error: 'Token Turnstile requerido' };
    }

    if (!PUBLIC_APP_HOSTNAME) {
        console.error('❌ Turnstile: hostname de la aplicación no disponible');
        return { success: false, error: 'Hostname de aplicación no configurado' };
    }

    try {
        const params = new URLSearchParams();

        params.append('secret', TURNSTILE_SECRET_KEY);
        params.append('response', token);

        if (remoteip) params.append('remoteip', remoteip);

        const response = await axios.post(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            params.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const result = response.data || {};

        if (!result.success) return result;

        if (result.hostname !== PUBLIC_APP_HOSTNAME) {
            console.warn('⚠️ Turnstile hostname inesperado:', result.hostname);
            return { success: false, error: 'Hostname Turnstile no permitido' };
        }

        return result;
    } catch (error) {
        console.error('❌ Error Turnstile:', error.message);
        return { success: false, error: 'Error verificando Turnstile' };
    }
}

// ================================================================
// ESTÁTICOS
// ================================================================

const publicPath = path.join(__dirname, 'public');
const featuresPath = path.join(publicPath, 'features');

function cabecerasEstaticas(res, filePath) {
    if (/\.(html|js)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
}

app.use(
    express.static(publicPath, {
        index: false,
        maxAge: isProduction ? '1h' : 0,
        fallthrough: true,
        setHeaders: cabecerasEstaticas
    })
);

app.use(
    '/features',
    express.static(featuresPath, {
        index: false,
        maxAge: isProduction ? '1h' : 0,
        fallthrough: true,
        setHeaders: cabecerasEstaticas
    })
);

// ================================================================
// RUTAS HTML CRÍTICAS
// ================================================================

function enviarArchivoPublico(relativePath, req, res, next) {
    const filePath = path.join(publicPath, relativePath);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Archivo no encontrado: ${filePath}`);
        return next();
    }

    return res.sendFile(filePath);
}

app.get('/features/perfil/perfil.html', (req, res, next) => {
    enviarArchivoPublico('features/perfil/perfil.html', req, res, next);
});

app.get('/features/perfil/configuracion/sariels/wallet.html', (req, res, next) => {
    enviarArchivoPublico('features/perfil/configuracion/sariels/wallet.html', req, res, next);
});

app.get('/features/perfil/configuracion/index.html', (req, res, next) => {
    enviarArchivoPublico('features/perfil/configuracion/index.html', req, res, next);
});

app.get('/features/perfil/shared/js/wallet-connect.js', (req, res, next) => {
    enviarArchivoPublico('features/perfil/shared/js/wallet-connect.js', req, res, next);
});

app.get('/features/shared/config-layout.js', (req, res, next) => {
    enviarArchivoPublico('features/shared/config-layout.js', req, res, next);
});

app.get('/features/shared/config-icons.js', (req, res, next) => {
    enviarArchivoPublico('features/shared/config-icons.js', req, res, next);
});

app.get('/features/mensajes/js/mensajes.js', (req, res) => {
    const filePath = path.join(publicPath, 'features', 'mensajes', 'js', 'mensajes.js');

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('mensajes.js no encontrado');
    }

    return res.sendFile(filePath);
});

// ================================================================
// HELPERS PARA ROUTERS
// ================================================================

function normalizarRouter(modulo, nombre) {
    if (typeof modulo === 'function') return modulo;

    if (modulo && typeof modulo.router === 'function') {
        console.log(`ℹ️ ${nombre}: usando export .router`);
        return modulo.router;
    }

    if (modulo && typeof modulo.default === 'function') {
        console.log(`ℹ️ ${nombre}: usando export .default`);
        return modulo.default;
    }

    console.error(`❌ ${nombre} no exporta un Express Router válido`);
    return null;
}

function montarRouter(mountPath, requirePaths, nombre) {
    const lista = Array.isArray(requirePaths) ? requirePaths : [requirePaths];

    for (const requirePath of lista) {
        try {
            const modulo = require(requirePath);
            const router = normalizarRouter(modulo, nombre);

            if (typeof router !== 'function') {
                console.error(`❌ ${nombre}: router inválido. Ruta no montada: ${mountPath}`);
                return false;
            }

            app.use(mountPath, router);
            console.log(`✅ ${nombre} cargado en ${mountPath} (${requirePath})`);
            return true;
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND' && lista.indexOf(requirePath) < lista.length - 1) {
                continue;
            }
            console.error(`❌ Error cargando ${nombre}:`, error.message);
            return false;
        }
    }

    console.error(`❌ ${nombre}: ningún archivo encontrado (${lista.join(' | ')})`);
    return false;
}

// ================================================================
// NOTICIAS · MONTAJE CON DIAGNÓSTICO
// ================================================================
// Registra la ruta real del archivo, el tipo de export y sus claves.
// Si el export no es un router, monta un 503 con el motivo, para que
// la app muestre la causa y no un 404 genérico.

function registrarFallbackNoticias(motivo) {
    app.use('/api/noticias', (req, res) => {
        return res.status(503).json({
            error: `Servicio de noticias no cargado en el servidor (${motivo}). Revisa los logs de Railway.`
        });
    });

    console.warn(`⚠️ [noticias] fallback 503 montado en /api/noticias: ${motivo}`);
    return false;
}

function montarNoticias() {
    let rutaArchivo;

    try {
        rutaArchivo = require.resolve('./routes/noticias');
        console.log(`🔎 [noticias] archivo resuelto: ${rutaArchivo}`);
    } catch (error) {
        console.error('❌ [noticias] no se encontró backend/routes/noticias.js:', error.message);
        return registrarFallbackNoticias('archivo no encontrado');
    }

    let modulo;

    try {
        modulo = require(rutaArchivo);
    } catch (error) {
        console.error('❌ [noticias] el archivo existe pero falló al ejecutarse:');
        console.error(error.stack || error.message);
        return registrarFallbackNoticias('error al ejecutar routes/noticias.js');
    }

    const tipo = typeof modulo;
    const esArray = Array.isArray(modulo);
    const constructor = modulo && modulo.constructor ? modulo.constructor.name : 'n/a';
    const claves = modulo && (tipo === 'object' || tipo === 'function')
        ? Object.keys(modulo)
        : [];

    console.log(`🔎 [noticias] typeof export: ${tipo}`);
    console.log(`🔎 [noticias] es Array: ${esArray} | constructor: ${constructor}`);
    console.log(`🔎 [noticias] claves exportadas: ${claves.length ? claves.join(', ') : '(ninguna)'}`);

    let router = null;

    if (typeof modulo === 'function') {
        router = modulo;
    } else if (modulo && typeof modulo.router === 'function') {
        router = modulo.router;
        console.log('ℹ️ [noticias] usando export .router');
    } else if (modulo && typeof modulo.default === 'function') {
        router = modulo.default;
        console.log('ℹ️ [noticias] usando export .default');
    }

    if (!router) {
        console.error('❌ [noticias] el archivo no exporta un router. Debe terminar en: module.exports = router;');
        return registrarFallbackNoticias('export inválido: se esperaba un router y llegó ' + tipo);
    }

    app.use('/api/noticias', router);
    console.log(`✅ [noticias] router montado en /api/noticias desde ${rutaArchivo}`);
    return true;
}

// ================================================================
// ROUTERS
// ================================================================

// LiveKit
montarRouter('/api/livekit', './routes/livekit', 'routes/livekit');

// Llamadas mixtas (decide motor: LiveKit hoy, Telnyx en Fase 2)
montarRouter('/api/llamadas', './routes/llamadas', 'routes/llamadas');

montarRouter('/api/auth', './routes/auth', 'routes/auth');

montarRouter('/api/account', './routes/account', 'routes/account');

montarRouter('/api/payments', './routes/payments', 'routes/payments');

montarRouter('/api/payments/membresia', './routes/membresia', 'routes/membresia');

montarRouter(
    '/api/payments/live-pass',
    ['./routes/payments/livepass', './routes/payments/livePass'],
    'routes/payments/livepass'
);

montarRouter('/api/webhook', './routes/webhooks', 'routes/webhooks');

montarRouter('/api/pay', './routes/pay', 'routes/pay');

// /api/mensajes: eliminado. Sin uso en el frontend; las llamadas viven en /api/llamadas.

montarRouter('/api/tendencias', './routes/tendencias', 'routes/tendencias');

montarRouter('/api/video', './routes/video-processor', 'routes/video-processor');

montarRouter('/api/ai', './routes/ai-chat', 'routes/ai-chat');

montarRouter('/api/ai/voice', './routes/ai-voice', 'routes/ai-voice');

montarRouter('/api/ai/chat-pet', './routes/ai-chat-pet', 'routes/ai-chat-pet');

montarRouter('/api/ai/tts', './routes/ai-tts', 'routes/ai-tts');

montarRouter('/api/ai/chat-maiz', './routes/ai-chat-maiz', 'routes/ai-chat-maiz');

montarRouter('/api/ai/voice', './routes/ai-tts-maiz', 'routes/ai-tts-maiz');

montarRouter('/api/ai/tts-itlasuhua', './routes/ai-tts-itlasuhua', 'routes/ai-tts-itlasuhua');
montarRouter('/api/ai/chat-itlasuhua', './routes/ai-chat-itlasuhua', 'routes/ai-chat-itlasuhua');
montarRouter('/api/ai/voice-itlasuhua', './routes/ai-voice-itlasuhua', 'routes/ai-voice-itlasuhua');

montarRouter('/api/telnyx', './routes/telnyx', 'routes/telnyx');

montarRouter('/api/ai/plan', './routes/ia-plan', 'routes/ia-plan');
montarRouter('/api/webhooks/ia', './routes/webhooks/pagos-ia', 'routes/webhooks/pagos-ia');

montarRouter('/api/campanas', './routes/campanas', 'routes/campanas');

montarRouter('/api/marketing', './routes/marketing', 'routes/marketing');

montarRouter('/api/mercado', './routes/mercado', 'routes/mercado');

montarRouter('/api/mercado/pedidos', './routes/mercado-pedidos', 'routes/mercado-pedidos');

montarRouter('/api/live', './routes/live', 'routes/live');

// Noticias (feed y preguntas con NewsData, Perplexity, Tavily y OpenAI; caché Redis; sesión Supabase)
montarNoticias();

// Geo
montarRouter('/api/geo', './routes/geo', 'routes/geo');

// Media (moderación de imagen/video + subida centralizada + liberación)
montarRouter('/api/media', './routes/media', 'routes/media');

// Moderación de texto (OpenAI Moderation API)
montarRouter('/api/moderar-texto', './routes/moderar-texto', 'routes/moderar-texto');

// Wallet (nonce + firma EOA)
montarRouter('/api/wallet', './routes/wallet', 'routes/wallet');

// Web Push
montarRouter('/api/push', './routes/push', 'routes/push');

// Admin IA
try {
    app.use('/api/admin/ai', authMiddleware, adminMiddleware, require('./routes/admin/ai'));
    console.log('✅ routes/admin/ai cargado en /api/admin/ai');
} catch (error) {
    console.error('❌ Error cargando routes/admin/ai:', error);
}

// ================================================================
// HTML ROUTES
// ================================================================

app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.get('/index.html', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

// ================================================================
// FRIENDLY ROUTES
// ================================================================

const friendlyRoutes = {
    '/login': 'login.html',
    '/registro': 'registro.html',
    '/perfil': 'features/perfil/perfil.html',
    '/configuracion': 'features/perfil/configuracion/index.html',
    '/mensajes': 'features/mensajes/mensajes.html',
    '/mercado': 'features/mercado/index.html',
    '/muro': 'features/muro/index.html',
    '/videos': 'features/videos/index.html',
    '/live': 'features/live/live.html',
    '/noticias': 'features/noticias/noticias.html'
};

for (const [route, file] of Object.entries(friendlyRoutes)) {
    app.get(route, (req, res) => {
        const filePath = path.join(publicPath, file);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Página no encontrada');
        }

        return res.sendFile(filePath);
    });
}

// ================================================================
// CSARIEL PAY
// ================================================================

app.get('/pay', (req, res) => res.sendFile(path.join(publicPath, 'pay.html')));

app.get('/csariel-pay', (req, res) => res.sendFile(path.join(publicPath, 'pay.html')));

// ================================================================
// OTRAS PÁGINAS
// ================================================================

app.get('/terminos', (req, res) => res.sendFile(path.join(publicPath, 'terminos.html')));

app.get('/privacidad', (req, res) => res.sendFile(path.join(publicPath, 'privacidad.html')));

app.get('/eliminar-cuenta', (req, res) => res.sendFile(path.join(publicPath, 'eliminar-cuenta.html')));

app.get('/actualizar-contrasena', (req, res) =>
    res.sendFile(path.join(publicPath, 'actualizar-contrasena.html'))
);

// ================================================================
// TÉRMINOS DE LAS MASCOTAS IA
// ================================================================

app.get('/legal/terminos-marquinhos', (req, res) => {
    const filePath = path.join(publicPath, 'legal', 'terminos-marquinhos.html');

    if (!fs.existsSync(filePath)) {
        console.error('❌ Archivo no encontrado:', filePath);
        return res.status(404).send('Términos de Marquinhos no disponibles');
    }

    return res.sendFile(filePath);
});

app.get('/legal/terminos-itlasuhua', (req, res) => {
    const filePath = path.join(publicPath, 'legal', 'terminos-itlasuhua.html');

    if (!fs.existsSync(filePath)) {
        console.error('❌ Archivo no encontrado:', filePath);
        return res.status(404).send('Términos del Itlasuhua no disponibles');
    }

    return res.sendFile(filePath);
});

// ================================================================
// HEALTH CHECK
// ================================================================
// /health y /api/health son liveness: Railway solo necesita saber
// que el proceso responde. NO dependen de Supabase, así que una
// restricción de cuota no tumba los deploys.
// /api/health/detalle sí consulta Supabase, para diagnóstico manual.

function livenessCheck(req, res) {
    return res.status(200).json({
        status: 'ok',
        service: 'galleta-domo',
        timestamp: new Date().toISOString()
    });
}

async function healthCheckDetalle(req, res) {
    let supabaseStatus = 'unknown';

    try {
        const { error } = await supabaseAdmin.from('idiomas_sistema').select('codigo').limit(1);
        supabaseStatus = error ? 'error' : 'ok';
    } catch (error) {
        supabaseStatus = 'error';
    }

    const livekitConfigured = Boolean(
        LIVEKIT_API_KEY && LIVEKIT_API_SECRET && (LIVEKIT_URL || LIVEKIT_WS_URL)
    );

    const pushConfigured = Boolean(
        process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    );

    const moderacionImagenConfigured = Boolean(
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_REGION
    );

    const moderacionTextoConfigured = Boolean(process.env.OPENAI_API_KEY);

    return res.status(200).json({
        status: supabaseStatus === 'ok' ? 'ok' : 'degraded',
        service: 'galleta-domo',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        supabase: supabaseStatus,
        livekit: { configured: livekitConfigured },
        llamadas: {
            motor_livekit: livekitConfigured,
            telefonia_externa: process.env.TELNYX_CALLS_ENABLED === 'true'
        },
        push: { configured: pushConfigured },
        moderacion: { configured: moderacionImagenConfigured },
        moderacion_texto: { configured: moderacionTextoConfigured },
        web3: {
            walletconnect_configured: Boolean(WALLETCONNECT_PROJECT_ID),
            public_url: PUBLIC_APP_URL,
            polygon_chain_id: WEB3_CHAIN_ID,
            endpoint: '/api/config/web3'
        }
    });
}

app.get('/health', livenessCheck);

app.get('/api/health', livenessCheck);

app.get('/api/health/detalle', healthCheckDetalle);

// ================================================================
// API 404
// ================================================================

app.use('/api', (req, res) => {
    return res.status(404).json({
        error: 'Endpoint no encontrado',
        path: req.originalUrl
    });
});

// ================================================================
// SPA FALLBACK
// ================================================================

app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    if (req.path === '/api' || req.path.startsWith('/api/')) return next();

    if (path.extname(req.path)) return next();

    const indexPath = path.join(publicPath, 'index.html');

    if (!fs.existsSync(indexPath)) return next();

    return res.sendFile(indexPath);
});

// ================================================================
// 404 FINAL
// ================================================================

app.use((req, res) => {
    return res.status(404).json({
        error: 'Recurso no encontrado',
        path: req.originalUrl
    });
});

// ================================================================
// ERROR HANDLER
// ================================================================

app.use((err, req, res, next) => {
    console.error('❌ Error global:', err);

    if (res.headersSent) return next(err);

    return res.status(err.status || 500).json({
        error: isProduction ? 'Error interno del servidor' : err.message || 'Error interno del servidor'
    });
});

// ================================================================
// HANDLERS DE PROCESO
// ================================================================

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔴 Unhandled Rejection en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🔴 Uncaught Exception:', err);
    setTimeout(() => process.exit(1), 500);
});

// ================================================================
// START
// ================================================================

app.listen(PORT, () => {
    console.log('');
    console.log('================================================');
    console.log("🚀 Sariel's Ecosystem");
    console.log('================================================');
    console.log(`🌐 Puerto: ${PORT}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Supabase: ${SUPABASE_URL ? '✅ Configurado' : '❌ Falta configuración'}`);
    console.log(
        `🎥 LiveKit: ${LIVEKIT_API_KEY && LIVEKIT_API_SECRET ? '✅ Configurado' : '❌ No configurado'}`
    );
    console.log(
        `🔔 Push: ${
            process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
                ? '✅ Configurado'
                : '❌ No configurado'
        }`
    );
    console.log(
        `🗺️ Google Geocoding: ${process.env.GOOGLE_MAPS_API_KEY ? '✅ Configurado' : '❌ No configurado'}`
    );
    console.log(
        `🛡️ Moderación (AWS Rekognition): ${
            process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                ? '✅ Configurado'
                : '❌ No configurado'
        }`
    );
    console.log(
        `📝 Moderación de texto (OpenAI): ${
            process.env.OPENAI_API_KEY
                ? '✅ Configurado'
                : '❌ No configurado'
        }`
    );
    console.log(`🌐 Web3 URL canónica: ${PUBLIC_APP_URL}`);
    console.log(`🔗 CORS orígenes permitidos: ${allowedCorsOrigins.join(', ')}`);
    console.log(
        `🔗 WalletConnect: ${WALLETCONNECT_PROJECT_ID ? '✅ Configurado' : '❌ No configurado'}`
    );
    console.log(`⛓️ Polygon chainId: ${WEB3_CHAIN_ID}`);
    console.log(`🛡️ Hostname Turnstile esperado: ${PUBLIC_APP_HOSTNAME || '(no disponible)'}`);
    console.log('🎵 Música Deezer: ✅ Configurado (/api/music/buscar)');
    console.log('================================================');
    console.log('');
});

// ================================================================
// CRON — Limpieza de cuentas eliminadas hace más de 30 días
// ================================================================

async function ejecutarLimpiezaCuentas() {
    try {
        const DIAS_GRACIA = 30;
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - DIAS_GRACIA);

        const { data: cuentas, error } = await supabaseAdmin
            .from('usuarios')
            .select('id')
            .eq('activo', false)
            .not('deleted_at', 'is', null)
            .lt('deleted_at', fechaLimite.toISOString());

        if (error) {
            console.error('❌ Cron limpieza — error consultando:', error);
            return;
        }

        if (!cuentas || cuentas.length === 0) {
            console.log('🕒 Cron limpieza: sin cuentas para borrar.');
            return;
        }

        let eliminadas = 0;

        for (const cuenta of cuentas) {
            const { error: delError } = await supabaseAdmin
                .from('usuarios')
                .delete()
                .eq('id', cuenta.id);

            if (delError) {
                console.error(`❌ Cron — error borrando ${cuenta.id}:`, delError.message);
                continue;
            }

            await supabaseAdmin
                .from('solicitudes_eliminacion')
                .update({ estado: 'completada', procesado_en: new Date().toISOString() })
                .eq('usuario_id', cuenta.id);

            eliminadas++;
        }

        console.log(`🕒 Cron limpieza: ${eliminadas} cuentas borradas definitivamente.`);
    } catch (err) {
        console.error('❌ Cron limpieza — error fatal:', err);
    }
}

setTimeout(ejecutarLimpiezaCuentas, 5 * 60 * 1000);

setInterval(ejecutarLimpiezaCuentas, 24 * 60 * 60 * 1000);

// ================================================================
// CRON — Mantenimiento eSIMs Telnyx
// ================================================================

const { cicloMantenimientoEsims } = require('./services/telnyx/esim');

setTimeout(cicloMantenimientoEsims, 2 * 60 * 1000);
setInterval(cicloMantenimientoEsims, 10 * 60 * 1000);

// ================================================================
// EXPORT
// ================================================================

module.exports = app;
