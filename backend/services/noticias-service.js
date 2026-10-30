const axios = require('axios');
const crypto = require('crypto');
const Redis = require('ioredis');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const CACHE_TTL = parseInt(process.env.NOTICIAS_CACHE_TTL_SECONDS || '600', 10);
const CACHE_TTL_PREGUNTA = parseInt(process.env.NOTICIAS_PREGUNTA_CACHE_TTL_SECONDS || '1800', 10);
const AGENT_MODEL = process.env.NOTICIAS_AGENT_MODEL || 'openai/gpt-5.6-sol';

const CATEGORIAS_VALIDAS = ['general', 'mexico', 'tecnologia', 'conectividad', 'cripto', 'negocios'];
const REGIONES_VALIDAS = ['MX', 'US', 'ES', 'AR', 'CO', 'CL'];

let redisClient = null;
if (REDIS_URL) {
    redisClient = new Redis(REDIS_URL, {
        password: REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
    });

    redisClient.on('error', (err) => {
        console.error('❌ Redis noticias error:', err.message);
    });
}

function buildCacheKey(categoria, region) {
    return `noticias:${categoria}:${region}`;
}

function buildPreguntaCacheKey(pregunta) {
    const hash = crypto
        .createHash('sha256')
        .update(pregunta.toLowerCase())
        .digest('hex');
    return `noticias:pregunta:${hash}`;
}

async function leerCache(clave) {
    if (!redisClient) return null;
    try {
        const cached = await redisClient.get(clave);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        console.warn('⚠️ Redis noticias get falló:', error.message);
        return null;
    }
}

async function escribirCache(clave, valor, ttl) {
    if (!redisClient) return;
    try {
        await redisClient.setex(clave, ttl, JSON.stringify(valor));
    } catch (error) {
        console.warn('⚠️ Redis noticias setex falló:', error.message);
    }
}

async function obtenerNoticias(categoria = 'general', region = 'MX') {
    const cat = String(categoria || 'general').trim().toLowerCase();
    const reg = String(region || 'MX').trim().toUpperCase();

    if (!CATEGORIAS_VALIDAS.includes(cat)) {
        const err = new Error('Categoría inválida');
        err.status = 400;
        throw err;
    }

    if (!REGIONES_VALIDAS.includes(reg)) {
        const err = new Error('Región inválida');
        err.status = 400;
        throw err;
    }

    const cacheKey = buildCacheKey(cat, reg);
    const cached = await leerCache(cacheKey);
    if (cached) {
        return { ...cached, desdeCache: true };
    }

    if (!PERPLEXITY_API_KEY) {
        const err = new Error('Integración de noticias no configurada');
        err.status = 503;
        throw err;
    }

    const queries = {
        general: 'últimas noticias relevantes hoy',
        mexico: 'noticias de México hoy',
        tecnologia: 'noticias de tecnología hoy',
        conectividad: 'noticias de conectividad e internet hoy',
        cripto: 'noticias de criptomonedas y blockchain hoy',
        negocios: 'noticias de negocios y economía hoy',
    };

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/search',
            {
                query: queries[cat] || queries.general,
                max_results: 5,
                country: reg,
                search_type: 'fast',
            },
            {
                headers: {
                    Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        const items = (response.data?.results || []).map((r) => ({
            id: Buffer.from(String(r.url || `${r.title || 'noticia'}-${Date.now()}`)).toString('base64').slice(0, 16),
            titulo: r.title || 'Sin título',
            resumen: r.snippet || 'Sin resumen disponible',
            publicadoEn: r.date || null,
            fuentes: [{ titulo: r.title || 'Fuente', url: r.url || '#' }].filter((fuente) => fuente.url && fuente.url !== '#'),
        }));

        const resultado = {
            consultadoEn: new Date().toISOString(),
            items,
        };

        await escribirCache(cacheKey, resultado, CACHE_TTL);

        return { ...resultado, desdeCache: false };
    } catch (error) {
        console.error('❌ Error Search API noticias:', error.message);

        if (error.response?.status === 429) {
            const err = new Error('Límite de consultas alcanzado');
            err.status = 429;
            throw err;
        }

        if (error.code === 'ECONNABORTED') {
            const err = new Error('Tiempo de espera agotado');
            err.status = 504;
            throw err;
        }

        const err = new Error('Error al contactar el proveedor de noticias');
        err.status = 502;
        throw err;
    }
}

async function preguntarActualidad(pregunta) {
    const preguntaLimpia = String(pregunta || '').trim().slice(0, 1000);

    if (!preguntaLimpia) {
        const err = new Error('Pregunta requerida');
        err.status = 400;
        throw err;
    }

    const cacheKey = buildPreguntaCacheKey(preguntaLimpia);
    const cached = await leerCache(cacheKey);
    if (cached) {
        return { ...cached, desdeCache: true };
    }

    if (!PERPLEXITY_API_KEY) {
        const err = new Error('Integración no configurada');
        err.status = 503;
        throw err;
    }

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/v1/agent',
            {
                model: AGENT_MODEL,
                input: preguntaLimpia,
                tools: [{ type: 'web_search' }],
                instructions: 'Responde con información actualizada. Usa fuentes. No inventes URLs ni datos no verificados.',
            },
            {
                headers: {
                    Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 45000,
            }
        );

        const data = response.data || {};
        const respuesta = data.output_text || 'No se pudo generar una respuesta.';
        const fuentes = [];

        for (const item of data.output || []) {
            if (item?.type === 'search_results') {
                for (const result of item.results || []) {
                    if (result?.url) {
                        fuentes.push({
                            id: result.id || result.url,
                            titulo: result.title || 'Fuente',
                            url: result.url,
                        });
                    }
                }
            }
        }

        const resultado = {
            consultadoEn: new Date().toISOString(),
            respuesta,
            fuentes: fuentes.filter((f) => {
                try {
                    const url = new URL(f.url);
                    return url.protocol === 'http:' || url.protocol === 'https:';
                } catch {
                    return false;
                }
            }),
        };

        await escribirCache(cacheKey, resultado, CACHE_TTL_PREGUNTA);

        return { ...resultado, desdeCache: false };
    } catch (error) {
        console.error('❌ Error Agent API noticias:', error.message);

        if (error.response?.status === 429) {
            const err = new Error('Límite de consultas alcanzado');
            err.status = 429;
            throw err;
        }

        if (error.code === 'ECONNABORTED') {
            const err = new Error('Tiempo de espera agotado');
            err.status = 504;
            throw err;
        }

        const err = new Error('Error al consultar el proveedor');
        err.status = 502;
        throw err;
    }
}

module.exports = {
    obtenerNoticias,
    preguntarActualidad,
    CATEGORIAS_VALIDAS,
    REGIONES_VALIDAS,
};
