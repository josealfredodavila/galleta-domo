const express = require('express');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const {
    obtenerNoticias,
    preguntarActualidad,
    CATEGORIAS_VALIDAS,
    REGIONES_VALIDAS,
} = require('../services/noticias-service');

const router = express.Router();

// ================================================================
// SUPABASE ADMIN (solo para validar tokens de sesión)
// ================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : null;

async function autenticar(req, res, next) {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Autenticación no configurada' });
        }

        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const token = auth.slice(7).trim();
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Error autenticando noticias:', error);
        return res.status(500).json({ error: 'Error de autenticación' });
    }
}

// ================================================================
// LÍMITE DE CONSULTAS POR USUARIO (solo preguntas, que cuestan dinero)
// ================================================================
const noticiasLimiter = rateLimit({
    windowMs: parseInt(process.env.NOTICIAS_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
    max: parseInt(process.env.NOTICIAS_RATE_LIMIT_MAX || '10', 10),
    keyGenerator: (req) => req.user?.id || req.ip,
    handler: (req, res) => {
        return res.status(429).json({ error: 'Límite de consultas alcanzado. Intenta más tarde.' });
    },
    standardHeaders: true,
    legacyHeaders: false,
});

function handleError(error, res) {
    const status = error.status || 500;
    const message = error.status && error.status < 500
        ? error.message
        : 'Error interno al consultar noticias';

    if (status >= 500) {
        console.error('❌ Noticias error:', error);
    }

    return res.status(status).json({ error: message });
}

router.get('/', autenticar, async (req, res) => {
    try {
        const categoria = String(req.query.categoria || 'general').trim().toLowerCase();
        const region = String(req.query.region || 'MX').trim().toUpperCase();

        if (!CATEGORIAS_VALIDAS.includes(categoria)) {
            return res.status(400).json({ error: 'Categoría no válida' });
        }

        if (!REGIONES_VALIDAS.includes(region)) {
            return res.status(400).json({ error: 'Región no válida' });
        }

        const resultado = await obtenerNoticias(categoria, region);
        return res.json({ success: true, ...resultado });
    } catch (error) {
        return handleError(error, res);
    }
});

router.post('/preguntar', autenticar, noticiasLimiter, async (req, res) => {
    try {
        const pregunta = String(req.body?.pregunta || '').trim();

        if (!pregunta) {
            return res.status(400).json({ error: 'Pregunta requerida' });
        }

        if (pregunta.length > 1000) {
            return res.status(400).json({ error: 'Pregunta demasiado larga (máx. 1000 caracteres)' });
        }

        const resultado = await preguntarActualidad(pregunta);
        return res.json({ success: true, ...resultado });
    } catch (error) {
        return handleError(error, res);
    }
});

module.exports = router;
