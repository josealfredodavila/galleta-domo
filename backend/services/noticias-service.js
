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
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const CACHE_TTL = parseInt(process.env.NOTICIAS_CACHE_TTL_SECONDS || '600', 10);
const CACHE_TTL_PREGUNTA = parseInt(process.env.NOTICIAS_PREGUNTA_CACHE_TTL_SECONDS || '1800', 10);
const CACHE_TTL_RESUMEN = 300; // los resúmenes sin IA se guardan poco tiempo
const COOLDOWN_CREDITOS = 6 * 3600; // pausa de 6 horas para proveedores sin saldo

// Modelos configurables
const PERPLEXITY_AGENT_MODEL = process.env.NOTICIAS_AGENT_MODEL || 'openai/gpt-5.6-sol';
const OPENAI_MODEL_RESPALDO = process.env.NOTICIAS_OPENAI_MODEL || 'gpt-4o-mini';
const GROQ_MODEL = process.env.NOTICIAS_GROQ_MODEL || 'llama-3.3-70b-versatile';

// Versiones de caché: súbelas cuando cambie la forma o la calidad de los datos guardados
const VERSION_CACHE_FEED = 'v4';
const VERSION_CACHE_PREGUNTA = 'v4';

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

// Textos de muro de pago o avisos que no son noticias
const PATRON_BLOQUEADO = /ONLY AVAILABLE IN PAID PLANS|solo disponible (en|para) (planes|suscriptores)|suscr[ií]bete para (leer|continuar)/i;

// Saludos y preguntas demasiado cortas: se responden sin consultar proveedores
const PATRON_SALUDO = /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|hi|hello|qu[eé] onda|qu[eé] tal)[\s!¡?.,]*$/i;
const RESPUESTA_SALUDO = '¡Hola! Pregúntame algo de la actualidad, por ejemplo: "¿Qué pasa hoy en México?"';

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

/*
 * Limpia textos con formato de markdown o con una fecha pegada al inicio
 * (ocurre en algunas respuestas de Perplexity).
 */
function limpiarTexto(valor, max = 400) {
    let texto = String(valor || '');

    texto = texto.replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?\s*\*?\s*/, '');
    texto = texto.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    texto = texto.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    texto = texto.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    texto = texto.replace(/^\s*[-*+]\s+/gm, '');
    texto = texto.replace(/[*_`>]+/g, '');
    texto = texto.replace(/\s+/g, ' ').trim();

    return texto.length > max ? `${texto.slice(0, max).trim()}…` : texto;
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
}

function esContenidoBloqueado(...textos) {
    return textos.some((t) => PATRON_BLOQUEADO.test(String(t || '')));
}

/*
 * Detecta si el proveedor respondió por falta de saldo o cuota.
 * Perplexity responde 403 "requires paid credits"; OpenAI responde 429 "insufficient_quota".
 */
function esFaltaDeCreditos(error) {
    const status = error.response?.status;
    const cuerpo = JSON.stringify(error.response?.data || '');
    return (status === 403 || status === 429) &&
        /credit|quota|paid|billing|insufficient/i.test(cuerpo);
}

// ================================================================
// REDIS: CACHÉ Y PAUSAS POR CRÉDITO
// ================================================================

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

async function estaEnEnfriamiento(proveedor) {
    if (!redisClient) return false;
    try {
        return (await redisClient.exists(`noticias:cooldown:${proveedor}`)) === 1;
    } catch (_) {
        return false;
    }
}

async function ponerEnEnfriamiento(proveedor) {
    if (!redisClient) return;
    try {
        await redisClient.setex(`noticias:cooldown:${proveedor}`, COOLDOWN_CREDITOS, '1');
    } catch (_) { /* sin Redis no se guarda la pausa */ }
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
        .filter((r) => !esContenidoBloqueado(r.title, r.description, r.content))
        .slice(0, 10)
        .map((r) => {
            const imagen = urlSegura(r.image_url);

            return {
                id: hashId(r.link),
                titulo: limpiarTexto(r.title || 'Sin título', 200),
                resumen: limpiarTexto(r.description || r.content || 'Sin resumen disponible', 400),
                publicadoEn: parseFechaNewsData(r.pubDate),
                imagen: imagen !== '#' ? imagen : null,
                fuentes: [{
                    titulo: r.source_name || r.source_id || hostOf(r.link),
                    url: urlSegura(r.link),
                }],
            };
        })
        .filter((item) => item.titulo && item.resumen);
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
        .filter((r) => !esContenidoBloqueado(r.title, r.snippet))
        .map((r) => ({
            id: hashId(r.url),
            titulo: limpiarTexto(r.title || 'Sin título', 200),
            resumen: limpiarTexto(r.snippet || 'Sin resumen disponible', 400),
            publicadoEn: r.date || null,
            imagen: null,
            fuentes: [{ titulo: limpiarTexto(r.title || 'Fuente', 120), url: urlSegura(r.url) }],
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

    const cacheKey = `noticias:feed:${VERSION_CACHE_FEED}:${cat}:${reg}`;
    const cached = await leerCache(cacheKey);
    if (cached) {
        return { ...cached, desdeCache: true };
    }

    const proveedores = [
        ['newsdata', () => consultarNewsData(cat, reg), NEWSDATA_API_KEY],
        ['perplexity-search', () => consultarPerplexitySearch(cat, reg), PERPLEXITY_API_KEY],
    ];

    for (const [nombre, consultar, clave] of proveedores) {
        if (!clave) continue;
        if (await estaEnEnfriamiento(nombre)) {
            console.info(`⏸️ [noticias] ${nombre} en pausa por créditos, se omite`);
            continue;
        }

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
            if (esFaltaDeCreditos(error)) {
                await ponerEnEnfriamiento(nombre);
                console.warn(`💤 [noticias] ${nombre} sin créditos, en pausa 6 h`);
            }
            registrarErrorProveedor(nombre, error);
        }
    }

    throw crearError(502, 'No hay noticias disponibles en este momento');
}

// ================================================================
// PREGUNTAS · PERPLEXITY AGENT (redacta, requiere créditos)
// ================================================================

async function consultarPerplexityAgent(pregunta) {
    const response = await axios.post(
        'https://api.perplexity.ai/v1/agent',
        {
            model: PERPLEXITY_AGENT_MODEL,
            input: pregunta,
            tools: [{ type: 'web_search' }],
            instructions:
                'Responde en español, de forma breve y clara, con información actualizada. ' +
                'Usa fuentes. No inventes URLs ni datos no verificados.',
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
    const respuesta = limpiarTexto(data.output_text || '', 4000);

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
                        titulo: limpiarTexto(result.title || 'Fuente', 120),
                        url: urlSegura(result.url),
                    });
                }
            }
        }
    }

    return { respuesta, fuentes };
}

// ================================================================
// PREGUNTAS · TAVILY (búsqueda compartida por los respaldos que redactan)
// ================================================================

async function buscarTavily(pregunta) {
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
        .filter((r) => !esContenidoBloqueado(r.title, r.content))
        .slice(0, 5);

    if (fuentesCrudas.length === 0) {
        throw crearError(502, 'Tavily no devolvió resultados');
    }

    return fuentesCrudas;
}

// Redacta una respuesta con un modelo compatible con OpenAI, usando solo las fuentes dadas
async function redactarConFuentes({ url, clave, modelo, pregunta, fuentesCrudas }) {
    const contexto = fuentesCrudas
        .map((f, i) => `[${i + 1}] ${f.title || 'Fuente'}\n${urlSegura(f.url)}\n${String(f.content || '').slice(0, 1200)}`)
        .join('\n\n');

    const completado = await axios.post(
        url,
        {
            model: modelo,
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
                Authorization: `Bearer ${clave}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );

    const respuesta = (completado.data?.choices?.[0]?.message?.content || '').trim();
    if (!respuesta) {
        throw crearError(502, 'El modelo devolvió una respuesta vacía');
    }

    return {
        respuesta,
        fuentes: fuentesCrudas.map((f) => ({
            id: hashId(f.url),
            titulo: limpiarTexto(f.title || 'Fuente', 120),
            url: urlSegura(f.url),
        })),
    };
}

// ================================================================
// PREGUNTAS · GROQ + TAVILY (respaldo gratuito, si hay GROQ_API_KEY)
// ================================================================

async function consultarGroqTavily(pregunta) {
    const fuentesCrudas = await buscarTavily(pregunta);
    return redactarConFuentes({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        clave: GROQ_API_KEY,
        modelo: GROQ_MODEL,
        pregunta,
        fuentesCrudas,
    });
}

// ================================================================
// PREGUNTAS · TAVILY + OPENAI (respaldo, requiere saldo en OpenAI)
// ================================================================

async function consultarTavilyOpenAI(pregunta) {
    const fuentesCrudas = await buscarTavily(pregunta);
    return redactarConFuentes({
        url: 'https://api.openai.com/v1/chat/completions',
        clave: OPENAI_API_KEY,
        modelo: OPENAI_MODEL_RESPALDO,
        pregunta,
        fuentesCrudas,
    });
}

// ================================================================
// PREGUNTAS · RESUMEN SIN IA (último respaldo, no requiere créditos de IA)
// Arma un resumen con los fragmentos de Perplexity Search, filtrados a México.
// ================================================================

async function consultarResumenSinIA(pregunta) {
    const response = await axios.post(
        'https://api.perplexity.ai/search',
        {
            query: pregunta,
            max_results: 5,
            country: 'MX',
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

    const resultados = (response.data?.results || [])
        .filter((r) => r && urlSegura(r.url) !== '#')
        .filter((r) => !esContenidoBloqueado(r.title, r.snippet));

    if (resultados.length === 0) {
        throw crearError(502, 'Perplexity Search no devolvió resultados');
    }

    const fragmentos = resultados
        .slice(0, 3)
        .map((r) => limpiarTexto(r.snippet, 300))
        .filter(Boolean);

    const respuesta = fragmentos.length
        ? `Esto reportan las fuentes encontradas (resumen automático, sin redacción de IA):\n\n${fragmentos.map((f) => `• ${f}`).join('\n\n')}`
        : 'Encontré fuentes relacionadas con tu pregunta, pero sin un resumen disponible.';

    return {
        respuesta,
        fuentes: resultados.map((r) => ({
            id: hashId(r.url),
            titulo: limpiarTexto(r.title || 'Fuente', 120),
            url: urlSegura(r.url),
        })),
        ttl: CACHE_TTL_RESUMEN,
    };
}

// ================================================================
// PREGUNTAS · ORQUESTACIÓN
// Orden: Perplexity Agent → Groq+Tavily → Tavily+OpenAI → resumen sin IA.
// Los proveedores sin clave se omiten, y los que están sin saldo se pausan 6 h.
// ================================================================

async function preguntarActualidad(pregunta) {
    const preguntaLimpia = String(pregunta || '').trim().slice(0, 1000);

    if (!preguntaLimpia) {
        throw crearError(400, 'Pregunta requerida');
    }

    // Saludos y preguntas muy cortas: respuesta local, sin gastar búsquedas ni caché
    if (PATRON_SALUDO.test(preguntaLimpia) || preguntaLimpia.length < 6) {
        return {
            consultadoEn: new Date().toISOString(),
            proveedor: 'local',
            respuesta: RESPUESTA_SALUDO,
            fuentes: [],
            desdeCache: false,
        };
    }

    const cacheKey = `noticias:pregunta:${VERSION_CACHE_PREGUNTA}:${hashId(preguntaLimpia.toLowerCase())}`;
    const cached = await leerCache(cacheKey);
    if (cached) {
        return { ...cached, desdeCache: true };
    }

    const proveedores = [
        ['perplexity-agent', () => consultarPerplexityAgent(preguntaLimpia), PERPLEXITY_API_KEY],
        ['groq+tavily', () => consultarGroqTavily(preguntaLimpia), GROQ_API_KEY && TAVILY_API_KEY],
        ['tavily+openai', () => consultarTavilyOpenAI(preguntaLimpia), TAVILY_API_KEY && OPENAI_API_KEY],
        ['resumen-sin-ia', () => consultarResumenSinIA(preguntaLimpia), PERPLEXITY_API_KEY],
    ];

    for (const [nombre, consultar, clave] of proveedores) {
        if (!clave) continue;

        // El resumen sin IA usa Perplexity Search: si Perplexity está en pausa, este también
        const proveedorReal = nombre === 'resumen-sin-ia' ? 'perplexity-search' : nombre;
        if (await estaEnEnfriamiento(proveedorReal)) {
            console.info(`⏸️ [noticias] ${proveedorReal} en pausa por créditos, se omite`);
            continue;
        }

        try {
            const { respuesta, fuentes, ttl } = await consultar();

            const resultado = {
                consultadoEn: new Date().toISOString(),
                proveedor: nombre,
                respuesta,
                fuentes: fuentes.filter((f) => urlSegura(f.url) !== '#'),
            };

            console.info(`✅ [noticias] pregunta respondida por ${nombre}`);

            await escribirCache(cacheKey, resultado, ttl || CACHE_TTL_PREGUNTA);
            return { ...resultado, desdeCache: false };
        } catch (error) {
            if (esFaltaDeCreditos(error)) {
                await ponerEnEnfriamiento(proveedorReal);
                console.warn(`💤 [noticias] ${proveedorReal} sin créditos, en pausa 6 h`);
            }
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