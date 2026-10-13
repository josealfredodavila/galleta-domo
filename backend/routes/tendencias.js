// ================================================================
// ROUTES/TENDENCIAS.JS — Sariel's Ecosystem
// GET  /api/tendencias            → temas, publicaciones y tokens populares
// GET  /api/tendencias/temas      → solo temas (?dias=1..90)
// GET  /api/tendencias/tokens     → solo tokens en venta
// POST /api/tendencias/limpiar-cache → solo administradores
// v2: Redis OPCIONAL y con tiempo límite (nunca deja la respuesta colgada),
//     orden por popularidad, limpieza de caché solo para admin,
//     errores genéricos hacia el cliente.
// ================================================================

const express = require('express');
const IORedis = require('ioredis');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : null;

const CACHE_KEY = 'sariels:tendencias:global';
const CACHE_TTL_SECONDS = 5 * 60;
const REDIS_TIMEOUT_MS = 800;

// ================================================================
// REDIS OPCIONAL
// Si no hay REDIS_URL, la ruta funciona sin caché.
// enableOfflineQueue: false → si Redis no está conectado, el comando
// falla al instante en vez de quedarse esperando.
// ================================================================
let redis = null;

if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        enableReadyCheck: false,
        connectTimeout: 3000,
        family: 0,
        retryStrategy: (times) => (times > 5 ? null : Math.min(times * 1000, 5000))
    });

    redis.on('connect', () => console.log('📡 [tendencias] Conectado a Redis'));
    redis.on('error', (err) => console.error('❌ [tendencias] Error Redis:', err.message));
} else {
    console.warn('⚠️ [tendencias] REDIS_URL no configurada: caché deshabilitada');
}

function conTimeout(promesa, ms) {
    return Promise.race([
        promesa,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_redis')), ms))
    ]);
}

async function leerCache() {
    if (!redis) return null;
    try {
        const raw = await conTimeout(redis.get(CACHE_KEY), REDIS_TIMEOUT_MS);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

async function guardarCache(data) {
    if (!redis) return;
    try {
        await conTimeout(
            redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(data)),
            REDIS_TIMEOUT_MS
        );
    } catch (e) {
        // Sin caché: la respuesta igual se entrega
    }
}

// ================================================================
// SOLO ADMINISTRADORES
// ================================================================
async function esAdministrador(req) {
    try {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ') || !supabaseAdmin) return false;

        const { data: sesion } = await supabaseAdmin.auth.getUser(auth.slice(7).trim());
        if (!sesion || !sesion.user) return false;

        const { data: perfil } = await supabaseAdmin
            .from('usuarios')
            .select('es_admin')
            .eq('id', sesion.user.id)
            .maybeSingle();

        return !!perfil && perfil.es_admin === true;
    } catch (e) {
        return false;
    }
}

// ================================================================
// MAPEOS (formato que consume el Muro)
// ================================================================
function mapearTemas(filas) {
    return (filas || []).map((t) => ({
        id: t.tema_id,
        nombre: t.tema_nombre,
        emoji: t.tema_emoji,
        slug: t.tema_slug,
        score: parseInt(t.score, 10) || 0,
        posts_count: parseInt(t.posts_count, 10) || 0
    }));
}

function mapearPublicaciones(filas) {
    return (filas || []).map((p) => ({
        id: p.id,
        contenido: p.contenido,
        tema_nombre: p.tema_nombre,
        tema_emoji: p.tema_emoji,
        total_likes: parseInt(p.total_likes, 10) || 0,
        total_comentarios: parseInt(p.total_comentarios, 10) || 0,
        score: parseInt(p.score, 10) || 0,
        created_at: p.created_at
    }));
}

function mapearTokens(filas) {
    return (filas || []).map((tk) => ({
        id: tk.id,
        contenido: tk.contenido,
        cantidad_venta: tk.cantidad_venta,
        precio_venta: parseFloat(tk.precio_venta) || 0,
        valor_total: parseFloat(tk.valor_total) || 0,
        tema_nombre: tk.tema_nombre,
        tema_emoji: tk.tema_emoji,
        vendedor_nombre: tk.vendedor_nombre,
        vendedor_handle: tk.vendedor_handle,
        vendedor_avatar: tk.vendedor_avatar,
        created_at: tk.created_at
    }));
}

// ================================================================
// GET /  → tendencias completas
// ================================================================
router.get('/', async (req, res) => {
    if (!supabaseAdmin) {
        return res.status(503).json({ success: false, error: 'servicio_no_disponible' });
    }

    try {
        const cacheado = await leerCache();
        if (cacheado) {
            return res.json({ success: true, data: cacheado, cached: true });
        }

        const [temas, publicaciones, tokens] = await Promise.all([
            supabaseAdmin.rpc('obtener_temas_tendencia', { dias: 7 }),
            supabaseAdmin
                .from('muro_tendencias')
                .select('id, contenido, tema_nombre, tema_emoji, tema_slug, total_likes, total_comentarios, score, created_at')
                .order('score', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(10),
            supabaseAdmin
                .from('muro_tokens_destacados')
                .select('id, contenido, cantidad_venta, precio_venta, valor_total, tema_nombre, tema_emoji, vendedor_nombre, vendedor_handle, vendedor_avatar, created_at')
                .order('valor_total', { ascending: false })
                .limit(10)
        ]);

        if (temas.error || publicaciones.error || tokens.error) {
            console.error('❌ [tendencias] consulta:', (temas.error || publicaciones.error || tokens.error).message);
            return res.status(500).json({ success: false, error: 'error_interno' });
        }

        const data = {
            top_temas: mapearTemas(temas.data),
            top_posts: mapearPublicaciones(publicaciones.data),
            tokens_destacados: mapearTokens(tokens.data),
            generado_en: new Date().toISOString()
        };

        await guardarCache(data);

        return res.json({ success: true, data, cached: false });
    } catch (error) {
        console.error('❌ [tendencias] Error:', error.message);
        return res.status(500).json({ success: false, error: 'error_interno' });
    }
});

// ================================================================
// GET /temas?dias=7
// ================================================================
router.get('/temas', async (req, res) => {
    if (!supabaseAdmin) {
        return res.status(503).json({ success: false, error: 'servicio_no_disponible' });
    }

    try {
        const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 7, 1), 90);
        const { data, error } = await supabaseAdmin.rpc('obtener_temas_tendencia', { dias });
        if (error) throw error;

        return res.json({ success: true, data: mapearTemas(data) });
    } catch (error) {
        console.error('❌ [tendencias/temas]:', error.message);
        return res.status(500).json({ success: false, error: 'error_interno' });
    }
});

// ================================================================
// GET /tokens
// ================================================================
router.get('/tokens', async (req, res) => {
    if (!supabaseAdmin) {
        return res.status(503).json({ success: false, error: 'servicio_no_disponible' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('muro_tokens_destacados')
            .select('id, contenido, cantidad_venta, precio_venta, valor_total, tema_nombre, tema_emoji, vendedor_nombre, vendedor_handle, vendedor_avatar, created_at')
            .order('valor_total', { ascending: false })
            .limit(20);

        if (error) throw error;

        return res.json({ success: true, data: mapearTokens(data) });
    } catch (error) {
        console.error('❌ [tendencias/tokens]:', error.message);
        return res.status(500).json({ success: false, error: 'error_interno' });
    }
});

// ================================================================
// POST /limpiar-cache — solo administradores
// ================================================================
router.post('/limpiar-cache', async (req, res) => {
    const admin = await esAdministrador(req);
    if (!admin) {
        return res.status(403).json({ success: false, error: 'acceso_restringido' });
    }

    try {
        if (redis) await conTimeout(redis.del(CACHE_KEY), REDIS_TIMEOUT_MS);
        return res.json({ success: true, message: 'Caché limpiada' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'error_interno' });
    }
});

module.exports = router;