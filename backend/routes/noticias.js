const axios = require('axios');
const crypto = require('crypto');
const Redis = require('ioredis');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const CACHE_TTL = parseInt(process.env.NOTICIAS_CACHE_TTL_SECONDS || '600', 10);
const CACHE_TTL_PREGUNTA = parseInt(process.env.NOTICIAS_PREGUNTA_CACHE_TTL_SECONDS || '1800', 10);

const PERPLEXITY_AGENT_MODEL = process.env.NOTICIAS_AGENT_MODEL || 'openai/gpt-5.6-sol';
const OPENAI_MODEL_RESPALDO = process.env.NOTICIAS_OPENAI_MODEL || 'gpt-4o-mini';

const CATEGORIAS_VALIDAS = ['general', 'mexico', 'tecnologia', 'conectividad', 'cripto', 'negocios'];
const REGIONES_VALIDAS = ['MX', 'US', 'ES', 'AR', 'CO', 'CL'];

// Parámetros de NewsData por categoría del frontend
const PARAMS_NEWSDATA = {
    general: { category: 'top' },
    mexico: {},
    tecnologia: { category: 'technology' },
    conectividad: { category: 'technology', q: 'internet OR telecomunicaciones OR 5G' },
    cripto: { q: 'criptomonedas OR bitcoin OR blockchain' },
    negocios: { category: 'business' },
};

// Consultas para Perplexity Search (respaldo del feed)
const QUERIES_PERPLEXITY = {
    general: 'últimas noticias relevantes hoy',
    mexico: 'noticias de México hoy',
    tecnologia: 'noticias de tecnología hoy',
    conectividad: 'noticias de conectividad e internet hoy',
    cripto: 'noticias de criptomonedas y blockchain hoy',
    negocios: 'noticias de negocios y economía hoy',
};

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

// ================================================================
// UTILIDADES
// ================================================================

function crearError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function hashId(texto) {
    return crypto.createHash('sha1').update(String(texto)).digest('hex').slice(0, 16);
}

function urlSegura(valor) {
    try {
        const url = new URL(String(valor || ''));
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
    } catch (_) {
        return '#';
    }
}

function hostOf(valor) {
    try {
        return new URL(valor).hostname.replace(/^www\./, '');
    } catch (_) {
        return 'Fuente';
    }
}

// NewsData entrega fechas como "2026-10-30 12:00:00" en UTC
function parseFechaNewsData(valor) {
    if (!valor) return null;
    const fecha = new Date(String(valor).replace(' ', 'T') + 'Z');
    return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function resumirCuerpo(data) {
    let texto;
    try {
        texto = typeof data === 'string' ? data : JSON.stringify(data);
    } catch (_) {
        texto = String(data);
    }
    return texto && texto.length > 800 ? `${texto.slice(0, 800)}…` : texto;
}

/*
 * Registra el error real de un proveedor externo: código HTTP y cuerpo
 * de la respuesta. No imprime error.config, para no exponer claves.
 */
function registrarErrorProveedor(proveedor, error) {
    const status = error.response?.status;

    if (error.code === 'ECONNABORTED') {
        console.error(`❌ [noticias] ${proveedor}: tiempo de espera agotado`);
        return;
    }

    if (!status) {
        console.error(`❌ [noticias] ${proveedor}: sin respuesta (${error.message})`);
        return;
    }

    console.error(
        `❌ [noticias] ${proveedor} falló — HTTP ${status} — cuerpo: ${resumirCuerpo(error.response.data)}`
    );

    if (status === 403) {
        console.error(
            `ℹ️ [noticias] 403 en ${proveedor}: revisa saldo/créditos y permisos de la clave ` +
            `en el panel del proveedor (Billing y API Keys / Permissions).`
        );
    }

    if (status === 401) {
        console.error(`ℹ️ [noticias] 401 en ${proveedor}: la clave no es válida o no está bien copiada.`);
    }

    if (status === 429) {
        console.error(`ℹ️ [noticias] 429 en ${proveedor}: límite de peticiones o cuota diaria alcanzada.`);
    }
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

// ================================================================
// FEED · NEWSDATA (principal)
// ================================================================

async function consultarNewsData(categoria, region) {
    if (!NEWSDATA_API_KEY) {
        throw crearError(503, 'NewsData no configurado');
    }

    const extra = PARAMS_NEWSDATA[categoria] || {};

    const params = {
        apikey: NEWSDATA_API_KEY,
        language: 'es',
        country: region.toLowerCase(),
        ...extra,
    };

    const response = await axios.get('https://newsdata.io/api/1/latest', {
        params,
        timeout: 15000,
    });

    if (response.data?.status !== 'success') {
        throw crearError(502, 'NewsData devolvió un estado no exitoso');
    }

    const resultados = Array.isArray(response.data.results) ? response.data.results : [];

    return resultados
        .filter((r) => r && urlSegura(r.link) !== '#')
        .slice(0, 10)
        .map((r) => ({
            id: hashId(r.link),
            titulo: r.title || 'Sin título',
            resumen: String(r.description || r.content || 'Sin resumen disponible').slice(0, 400),
            publicadoEn: parseFechaNewsData(r.pubDate),
            fuentes: [{
                titulo: r.source_name || r.source_id || hostOf(r.link),
                url: urlSegura(r.link),
            }],
        }));
}

// ================================================================
// FEED · PERPLEXITY SEARCH (respaldo)
// ================================================================

async function consultarPerplexitySearch(categoria, region) {
    if (!PERPLEXITY_API_KEY) {
        throw crearError(503, 'Perplexity no configurado');
    }

    const response = await axios.post(
        'https://api.perplexity.ai/search',
        {
            query: QUERIES_PERPLEXITY[categoria] || QUERIES_PERPLEXITY.general,
            max_results: 5,
            country: region,
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

    return (response.data?.results || [])
        .filter((r) => r && urlSegura(r.url) !== '#')
        .map((r) => ({
            id: hashId(r.url),
            titulo: r.title || 'Sin título',
            resumen: r.snippet || 'Sin resumen disponible',
            publicadoEn: r.date || null,
            fuentes: [{ titulo: r.title || 'Fuente', url: urlSegura(r.url) }],
        }));
}

// ================================================================
// FEED · ORQUESTACIÓN
// ================================================================

async function obtenerNoticias(categoria = 'general', region = 'MX') {
    const cat = String(categoria || 'general').trim().toLowerCase();
    const reg = String(region || 'MX').trim().toUpperCase();

    if (!CATEGORIAS_VALIDAS.includes(cat)) {
        throw crearError(400, 'Categoría inválida');
    }

    if (!REGIONES_VALIDAS.includes(reg)) {
        throw crearError(400, 'Región inválida');
    }

    const cacheKey = `noticias:v2:${cat}:${reg}`;
    const cached = await leerCache(cacheKey);
    if (cached) {
        return { ...cached, desdeCache: true };
    }

    const proveedores = [
        ['newsdata', () => consultarNewsData(cat, reg)],
        ['perplexity-search', () => consultarPerplexitySearch(cat, reg)],
    ];

    for (const [nombre, consultar] of proveedores) {
        try {
            const items = await consultar();

            if (items.length === 0) {
                console.warn(`⚠️ [noticias] ${nombre} sin resultados para ${cat}/${reg}`);
                continue;
            }

            const resultado = {
                consultadoEn: new Date().toISOString(),
                proveedor: nombre,
                items,
            };

            await escribirCache(cacheKey, resultado, CACHE_TTL);
            return { ...resultado, desdeCache: false };
        } catch (error) {
            registrarErrorProveedor(nombre, error);
        }
    }

    throw crearError(502, 'No hay noticias disponibles en este momento');
}

// ================================================================
// PREGUNTAS · PERPLEXITY AGENT (principal)
// ================================================================

async function consultarPerplexityAgent(pregunta) {
    if (!PERPLEXITY_API_KEY) {
        throw crearError(503, 'Perplexity no configurado');
    }

    const response = await axios.post(
        'https://api.perplexity.ai/v1/agent',
        {
            model: PERPLEXITY_AGENT_MODEL,
            input: pregunta,
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
    const respuesta = (data.output_text || '').trim();

    if (!respuesta) {
        throw crearError(502, 'Perplexity Agent devolvió una respuesta vacía');
    }

    const fuentes = [];
    for (const item of data.output || []) {
        if (item?.type === 'search_results') {
            for (const result of item.results || []) {
                if (urlSegura(result?.url) !== '#') {
                    fuentes.push({
                        id: hashId(result.url),
                        titulo: result.title || 'Fuente',
                        url: urlSegura(result.url),
                    });
                }
            }
        }
    }

    return { respuesta, fuentes };
}

// ================================================================
// PREGUNTAS · TAVILY + OPENAI gpt-4o-mini (respaldo 1)
// ================================================================

async function consultarTavilyOpenAI(pregunta) {
    if (!TAVILY_API_KEY || !OPENAI_API_KEY) {
        throw crearError(503, 'Tavily u OpenAI no configurados');
    }

    const busqueda = await axios.post(
        'https://api.tavily.com/search',
        {
            query: pregunta,
            search_depth: 'basic',
            max_results: 5,
            include_answer: false,
        },
        {
            headers: {
                Authorization: `Bearer ${TAVILY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        }
    );

    const fuentesCrudas = (busqueda.data?.results || [])
        .filter((r) => r && urlSegura(r.url) !== '#')
        .slice(0, 5);

    if (fuentesCrudas.length === 0) {
        throw crearError(502, 'Tavily no devolvió resultados');
    }

    const contexto = fuentesCrudas
        .map((f, i) => `[${i + 1}] ${f.title || 'Fuente'}\n${urlSegura(f.url)}\n${String(f.content || '').slice(0, 1200)}`)
        .join('\n\n');

    const completado = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: OPENAI_MODEL_RESPALDO,
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content:
                        'Eres un asistente de noticias. Responde en español, de forma breve y clara, ' +
                        'usando SOLO la información de las fuentes numeradas. Cita las fuentes como [1], [2]. ' +
                        'Si las fuentes no bastan para responder, dilo. No inventes datos ni URLs.',
                },
                {
                    role: 'user',
                    content: `Pregunta: ${pregunta}\n\nFuentes:\n${contexto}`,
                },
            ],
        },
        {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );

    const respuesta = (completado.data?.choices?.[0]?.message?.content || '').trim();

    if (!respuesta) {
        throw crearError(502, 'OpenAI devolvió una respuesta vacía');
    }

    return {
        respuesta,
        fuentes: fuentesCrudas.map((f) => ({
            id: hashId(f.url),
            titulo: f.title || 'Fuente',
            url: urlSegura(f.url),
        })),
    };
}

// ================================================================
// PREGUNTAS · PERPLEXITY SEARCH (respaldo 2, solo fuentes)
// ================================================================

async function consultarPerplexitySearchPregunta(pregunta) {
    if (!PERPLEXITY_API_KEY) {
        throw crearError(503, 'Perplexity no configurado');
    }

    const response = await axios.post(
        'https://api.perplexity.ai/search',
        {
            query: pregunta,
            max_results: 5,
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

    const resultados = (response.data?.results || []).filter((r) => r && urlSegura(r.url) !== '#');

    if (resultados.length === 0) {
        throw crearError(502, 'Perplexity Search no devolvió resultados');
    }

    const lineas = resultados.map((r, i) => `[${i + 1}] ${r.title || 'Fuente'}: ${r.snippet || ''}`.trim());

    return {
        respuesta: `Encontré estas fuentes relacionadas con tu pregunta:\n\n${lineas.join('\n')}`,
        fuentes: resultados.map((r) => ({
            id: hashId(r.url),
            titulo: r.title || 'Fuente',
            url: urlSegura(r.url),
        })),
    };
}

// ================================================================
// PREGUNTAS · ORQUESTACIÓN
// ================================================================

async function preguntarActualidad(pregunta) {
    const preguntaLimpia = String(pregunta || '').trim().slice(0, 1000);

    if (!preguntaLimpia) {
        throw crearError(400, 'Pregunta requerida');
    }

    const cacheKey = `noticias:pregunta:v2:${hashId(preguntaLimpia.toLowerCase())}`;
    const cached = await leerCache(cacheKey);
    if (cached) {
        return { ...cached, desdeCache: true };
    }

    const proveedores = [
        ['perplexity-agent', consultarPerplexityAgent],
        ['tavily+openai', consultarTavilyOpenAI],
        ['perplexity-search', consultarPerplexitySearchPregunta],
    ];

    for (const [nombre, consultar] of proveedores) {
        try {
            const { respuesta, fuentes } = await consultar(preguntaLimpia);

            const resultado = {
                consultadoEn: new Date().toISOString(),
                proveedor: nombre,
                respuesta,
                fuentes: fuentes.filter((f) => urlSegura(f.url) !== '#'),
            };

            console.info(`✅ [noticias] pregunta respondida por ${nombre}`);

            await escribirCache(cacheKey, resultado, CACHE_TTL_PREGUNTA);
            return { ...resultado, desdeCache: false };
        } catch (error) {
            registrarErrorProveedor(nombre, error);
            console.warn(`⚠️ [noticias] pasando al siguiente proveedor tras fallar ${nombre}`);
        }
    }

    throw crearError(502, 'No se pudo consultar en este momento. Intenta más tarde.');
}

module.exports = {
    obtenerNoticias,
    preguntarActualidad,
    CATEGORIAS_VALIDAS,
    REGIONES_VALIDAS,
};
