
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const {
    obtenerNoticias,
    preguntarActualidad,
    CATEGORIAS_VALIDAS,
    REGIONES_VALIDAS
} = require('../services/noticias-service');

const router = express.Router();

// ================================================================
// CONFIGURACIÓN
// ================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

// ================================================================
// VALIDACIÓN DE CONFIGURACIÓN
// ================================================================

function numeroSeguro(valor, defecto, minimo, maximo) {
    const numero = Number.parseInt(valor, 10);

    if (!Number.isFinite(numero)) {
        return defecto;
    }

    return Math.max(
        minimo,
        Math.min(maximo, numero)
    );
}

const RATE_LIMIT_WINDOW_MS = numeroSeguro(
    process.env.NOTICIAS_RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
    60000,
    86400000
);

const RATE_LIMIT_MAX = numeroSeguro(
    process.env.NOTICIAS_RATE_LIMIT_MAX,
    10,
    1,
    1000
);

// ================================================================
// SUPABASE ADMIN
// Solo se utiliza en backend para validar sesiones.
// Nunca enviar SERVICE_ROLE_KEY al frontend.
// ================================================================

let supabaseAdmin = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
        supabaseAdmin = createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                }
            }
        );
    } catch (error) {
        console.error(
            '❌ No se pudo inicializar Supabase noticias:',
            error.message
        );
    }
} else {
    console.error(
        '⚠️ Noticias: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'
    );
}

// ================================================================
// CABECERAS DE SEGURIDAD Y CACHÉ
// ================================================================

router.use(function (req, res, next) {
    res.set({
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff'
    });

    next();
});

// ================================================================
// AUTENTICACIÓN SUPABASE
// ================================================================

async function autenticar(req, res, next) {
    try {
        if (!supabaseAdmin) {
            return res.status(503).json({
                success: false,
                error: 'Servicio de autenticación no disponible'
            });
        }

        const authorization = req.get('authorization') || '';

        if (!/^Bearer\s+/i.test(authorization)) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        const token = authorization
            .replace(/^Bearer\s+/i, '')
            .trim();

        if (!token || token.length > 8192) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }

        const resultado = await supabaseAdmin.auth.getUser(token);

        if (
            resultado.error ||
            !resultado.data ||
            !resultado.data.user ||
            !resultado.data.user.id
        ) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido o expirado'
            });
        }

        // Solo se conserva la información necesaria del usuario.
        req.user = {
            id: resultado.data.user.id
        };

        return next();

    } catch (error) {
        console.error(
            '❌ Error autenticando noticias:',
            error.message
        );

        return res.status(503).json({
            success: false,
            error: 'No se pudo validar la sesión'
        });
    }
}

// ================================================================
// LIMITADOR DE PREGUNTAS
// Se ejecuta después de autenticar al usuario.
// Cada usuario tiene su propio límite.
// ================================================================

const noticiasLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX,

    // La autenticación ocurre antes del limitador.
    // Por eso siempre debe existir req.user.id.
    keyGenerator: function (req) {
        return 'noticias:user:' + req.user.id;
    },

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'Límite de consultas alcanzado. Intenta más tarde.'
    },

    handler: function (req, res) {
        return res.status(429).json({
            success: false,
            error: 'Límite de consultas alcanzado. Intenta más tarde.',
            retryAfter: res.getHeader('Retry-After') || null
        });
    },

    // No contar solicitudes que fallaron antes de responder.
    skipFailedRequests: true,

    // No confiar en encabezados de IP enviados por el cliente.
    // La clave principal es el ID autenticado de Supabase.
    validate: {
        keyGeneratorIpFallback: false
    }
});

// ================================================================
// MANEJO CENTRALIZADO DE ERRORES
// ================================================================

function handleError(error, res) {
    let status = Number(error && error.status);

    if (
        !Number.isInteger(status) ||
        status < 400 ||
        status > 599
    ) {
        status = 500;
    }

    const mensaje = status < 500
        ? error.message
        : 'Error interno al consultar noticias';

    if (status >= 500) {
        console.error(
            '❌ Noticias error:',
            error.message
        );
    }

    return res.status(status).json({
        success: false,
        error: mensaje
    });
}

// ================================================================
// VALIDACIÓN DE PARÁMETROS
// ================================================================

function obtenerParametro(valor, defecto) {
    if (typeof valor !== 'string') {
        return defecto;
    }

    return valor.trim();
}

// ================================================================
// GET /api/noticias?categoria=general&region=MX
// ================================================================

router.get(
    '/',
    autenticar,
    async function (req, res) {
        try {
            const categoria = obtenerParametro(
                req.query.categoria,
                'general'
            ).toLowerCase();

            const region = obtenerParametro(
                req.query.region,
                'MX'
            ).toUpperCase();

            if (!CATEGORIAS_VALIDAS.includes(categoria)) {
                return res.status(400).json({
                    success: false,
                    error: 'Categoría no válida'
                });
            }

            if (!REGIONES_VALIDAS.includes(region)) {
                return res.status(400).json({
                    success: false,
                    error: 'Región no válida'
                });
            }

            const resultado = await obtenerNoticias(
                categoria,
                region
            );

            return res.status(200).json(
                Object.assign(
                    {
                        success: true
                    },
                    resultado
                )
            );

        } catch (error) {
            return handleError(error, res);
        }
    }
);

// ================================================================
// POST /api/noticias/preguntar
// Body: { "pregunta": "¿Qué pasa hoy en México?" }
// ================================================================

router.post(
    '/preguntar',
    autenticar,
    noticiasLimiter,
    async function (req, res) {
        try {
            if (
                !req.body ||
                typeof req.body !== 'object' ||
                Array.isArray(req.body)
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Solicitud inválida'
                });
            }

            if (
                typeof req.body.pregunta !== 'string'
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'Pregunta requerida'
                });
            }

            const pregunta = req.body.pregunta.trim();

            if (!pregunta) {
                return res.status(400).json({
                    success: false,
                    error: 'Pregunta requerida'
                });
            }

            if (pregunta.length > 1000) {
                return res.status(400).json({
                    success: false,
                    error: 'Pregunta demasiado larga (máx. 1000 caracteres)'
                });
            }

            const resultado = await preguntarActualidad(
                pregunta
            );

            return res.status(200).json(
                Object.assign(
                    {
                        success: true
                    },
                    resultado
                )
            );

        } catch (error) {
            return handleError(error, res);
        }
    }
);

// ================================================================
// EXPORTACIÓN
// ================================================================

module.exports = router;
