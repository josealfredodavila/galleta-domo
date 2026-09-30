/* ================================================================
   ROUTES/TENDENCIAS.JS — SARIEL'S ECOSYSTEM
   ================================================================ */

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

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0,
    retryStrategy: (times) => Math.min(times * 1000, 30000),
    lazyConnect: false
});

redis.on('connect', () => {
    console.log('📡 [tendencias] Conectado a Redis');
});
redis.on('error', (err) => {
    console.error('❌ [tendencias] Error Redis:', err.message);
});

const CACHE_KEY = 'sariels:tendencias:global';
const CACHE_TTL_SECONDS = 5 * 60;

router.get('/', async (req, res) => {
    if (!supabaseAdmin) {
        return res.status(500).json({ success: false, error: 'Supabase admin no configurado' });
    }

    try {
        try {
            const cached = await redis.get(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                return res.json({ success: true, data: parsed, cached: true });
            }
        } catch (redisErr) {
            console.warn('⚠️ [tendencias] Redis no disponible:', redisErr.message);
        }

        const [topTemasResult, topPostsResult, tokensResult] = await Promise.all([
            supabaseAdmin.rpc('obtener_temas_tendencia', { dias: 7 }),
            supabaseAdmin.from('muro_tendencias')
                .select('id, contenido, tema_nombre, tema_emoji, tema_slug, total_likes, total_comentarios, score, created_at')
                .limit(10),
            supabaseAdmin.from('muro_tokens_destacados')
                .select('id, contenido, cantidad_venta, precio_venta, valor_total, tema_nombre, tema_emoji, vendedor_nombre, vendedor_handle, vendedor_avatar, created_at')
                .limit(10)
        ]);

        const data = {
            top_temas: (topTemasResult.data || []).map((t) => ({
                id: t.tema_id,
                nombre: t.tema_nombre,
                emoji: t.tema_emoji,
                slug: t.tema_slug,
                score: parseInt(t.score, 10) || 0,
                posts_count: parseInt(t.posts_count, 10) || 0
            })),
            top_posts: (topPostsResult.data || []).map((p) => ({
                id: p.id,
                contenido: p.contenido,
                tema_nombre: p.tema_nombre,
                tema_emoji: p.tema_emoji,
                total_likes: parseInt(p.total_likes, 10) || 0,
                total_comentarios: parseInt(p.total_comentarios, 10) || 0,
                score: parseInt(p.score, 10) || 0,
                created_at: p.created_at
            })),
            tokens_destacados: (tokensResult.data || []).map((tk) => ({
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
            })),
            generado_en: new Date().toISOString()
        };

        try {
            await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(data));
        } catch (redisErr) {
            console.warn('⚠️ [tendencias] No se pudo guardar en cache:', redisErr.message);
        }

        return res.json({ success: true, data, cached: false });

    } catch (error) {
        console.error('❌ [tendencias] Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Error interno' });
    }
});

router.get('/temas', async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ success: false, error: 'Admin no configurado' });

    try {
        const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 7, 1), 90);
        const { data, error } = await supabaseAdmin.rpc('obtener_temas_tendencia', { dias });
        if (error) throw error;

        return res.json({
            success: true,
            data: (data || []).map((t) => ({
                id: t.tema_id,
                nombre: t.tema_nombre,
                emoji: t.tema_emoji,
                slug: t.tema_slug,
                score: parseInt(t.score, 10) || 0,
                posts_count: parseInt(t.posts_count, 10) || 0
            }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Error interno' });
    }
});

router.get('/tokens', async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ success: false, error: 'Admin no configurado' });

    try {
        const { data, error } = await supabaseAdmin.from('muro_tokens_destacados').select('*').limit(20);
        if (error) throw error;
        return res.json({ success: true, data: data || [] });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Error interno' });
    }
});

router.post('/limpiar-cache', async (req, res) => {
    try {
        await redis.del(CACHE_KEY);
        return res.json({ success: true, message: 'Cache limpiada' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Error limpiando cache' });
    }
});

module.exports = router;