
const axios = require('axios');
const crypto = require('crypto');
const Redis = require('ioredis');

// ================================================================
// CSARIEL'S · NOTICIAS
// Backend de noticias, búsqueda, respuestas con IA y multimedia
// ================================================================

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

function numeroSeguro(valor, defecto, minimo, maximo) {
    const numero = parseInt(valor, 10);

    if (!Number.isFinite(numero)) return defecto;

    return Math.max(minimo, Math.min(maximo, numero));
}

const CACHE_TTL = numeroSeguro(
    process.env.NOTICIAS_CACHE_TTL_SECONDS,
    600,
    30,
    86400
);

const CACHE_TTL_PREGUNTA = numeroSeguro(
    process.env.NOTICIAS_PREGUNTA_CACHE_TTL_SECONDS,
    1800,
    30,
    86400
);

const CACHE_TTL_RESUMEN = 300;
const COOLDOWN_CREDITOS = 6 * 3600;

const PERPLEXITY_AGENT_PRESET =
    process.env.NOTICIAS_AGENT_PRESET || 'fast-search';

const OPENAI_MODEL_RESPALDO =
    process.env.NOTICIAS_OPENAI_MODEL || 'gpt-4o-mini';

const GROQ_MODEL =
    process.env.NOTICIAS_GROQ_MODEL || 'llama-3.3-70b-versatile';

const VERSION_CACHE_FEED = 'v5';
const VERSION_CACHE_PREGUNTA = 'v5';

const MAX_PREGUNTA = 1000;
const MAX_NOTICIAS = 10;
const MAX_FUENTES = 5;
const MAX_TEXTO_FUENTE = 1200;

const CATEGORIAS_VALIDAS = [
    'general',
    'mexico',
    'tecnologia',
    'conectividad',
    'cripto',
    'negocios'
];

const REGIONES_VALIDAS = [
    'MX',
    'US',
    'ES',
    'AR',
    'CO',
    'CL'
];

const PARAMS_NEWSDATA = {
    general: {
        category: 'top'
    },
    mexico: {},
    tecnologia: {
        category: 'technology'
    },
    conectividad: {
        category: 'technology',
        q: 'internet OR telecomunicaciones OR 5G'
    },
    cripto: {
        q: 'criptomonedas OR bitcoin OR blockchain'
    },
    negocios: {
        category: 'business'
    }
};

const QUERIES_PERPLEXITY = {
    general: 'últimas noticias relevantes de actualidad',
    mexico: 'noticias actuales de México',
    tecnologia: 'noticias actuales de tecnología',
    conectividad: 'noticias actuales de internet, telecomunicaciones y 5G',
    cripto: 'noticias actuales de criptomonedas y blockchain',
    negocios: 'noticias actuales de negocios y economía'
};

const PATRON_BLOQUEADO =
    /ONLY AVAILABLE IN PAID PLANS|solo disponible (en|para) (planes|suscriptores)|suscr[ií]bete para (leer|continuar)/i;

const PATRON_SALUDO =
    /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|hi|hello|qu[eé] onda|qu[eé] tal)[\s!¡?.,]*$/i;

const RESPUESTA_SALUDO =
    '¡Hola! Pregúntame algo de la actualidad, por ejemplo: "¿Qué pasa hoy en México?"';

// ================================================================
// CLIENTE HTTP
// ================================================================

const http = axios.create({
    timeout: 30000,
    maxContentLength: 5 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
    headers: {
        'User-Agent': "Csariel's Noticias/1.0",
        Accept: 'application/json'
    }
});

// ================================================================
// REDIS
// ================================================================

let redisClient = null;

if (REDIS_URL) {
    try {
        redisClient = new Redis(REDIS_URL, {
            password: REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 5000,
            commandTimeout: 3000,
            retryStrategy: function (times) {
                if (times > 5) return null;
                return Math.min(times * 500, 3000);
            }
        });

        redisClient.on('error', function (err) {
            console.error(
                '❌ Redis noticias error:',
                err.message
            );
        });

        redisClient.on('ready', function () {
            console.log('✅ Redis noticias conectado');
        });

    } catch (error) {
        redisClient = null;

        console.error(
            '❌ No se pudo inicializar Redis noticias:',
            error.message
        );
    }
}

// ================================================================
// CONTROL DE CONSULTAS SIMULTÁNEAS
// ================================================================

// Evita repetir la misma consulta varias veces dentro
// de una misma instancia del servidor.

const consultasEnCurso = new Map();

function ejecutarUnaVez(clave, funcion) {
    if (consultasEnCurso.has(clave)) {
        return consultasEnCurso.get(clave);
    }

    const promesa = Promise.resolve()
        .then(funcion)
        .finally(function () {
            consultasEnCurso.delete(clave);
        });

    consultasEnCurso.set(clave, promesa);

    return promesa;
}

// ================================================================
// UTILIDADES GENERALES
// ================================================================

function crearError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function hashId(texto) {
    return crypto
        .createHash('sha256')
        .update(String(texto || ''))
        .digest('hex')
        .slice(0, 24);
}

function urlSegura(valor) {
    try {
        if (!valor || typeof valor !== 'string') {
            return '#';
        }

        const url = new URL(valor.trim());

        if (
            url.protocol !== 'http:' &&
            url.protocol !== 'https:'
        ) {
            return '#';
        }

        if (url.username || url.password) {
            return '#';
        }

        return url.href;

    } catch (_) {
        return '#';
    }
}

function hostOf(valor) {
    try {
        return new URL(valor)
            .hostname
            .replace(/^www\./, '');
    } catch (_) {
        return 'Fuente';
    }
}

function limpiarTexto(valor, max) {
    const limite = max || 400;

    let texto = String(valor || '');

    texto = texto
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ');

    texto = texto.replace(
        /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?\s*\*?\s*/,
        ''
    );

    texto = texto.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

    texto = texto.replace(
        /\[([^\]]+)\]\([^)]*\)/g,
        '$1'
    );

    texto = texto.replace(
        /^\s{0,3}#{1,6}\s*/gm,
        ''
    );

    texto = texto.replace(
        /^\s*[-*+]\s+/gm,
        ''
    );

    texto = texto.replace(/[*_`>]+/g, '');

    texto = texto.replace(/\s+/g, ' ').trim();

    if (texto.length > limite) {
        texto = texto.slice(0, limite).trim() + '…';
    }

    return texto;
}

function parseFechaNewsData(valor, zona) {
    if (!valor) return null;

    const texto = String(valor).trim();

    // Si ya contiene zona horaria o Z, no se modifica.
    const tieneZona =
        /Z$|[+-]\d{2}:\d{2}$/.test(texto);

    const normalizada = texto.includes('T')
        ? texto
        : texto.replace(' ', 'T');

    const fecha = new Date(
        tieneZona
            ? normalizada
            : normalizada + 'Z'
    );

    if (Number.isNaN(fecha.getTime())) {
        return null;
    }

    return fecha.toISOString();
}

function resumirCuerpo(data) {
    let texto;

    try {
        texto = typeof data === 'string'
            ? data
            : JSON.stringify(data);
    } catch (_) {
        texto = String(data);
    }

    if (!texto) return '';

    return texto.length > 800
        ? texto.slice(0, 800) + '…'
        : texto;
}

function registrarErrorProveedor(proveedor, error) {
    const status = error.response
        ? error.response.status
        : null;

    if (error.code === 'ECONNABORTED') {
        console.error(
            '❌ [noticias] ' + proveedor +
            ': tiempo de espera agotado'
        );

        return;
    }

    if (!status) {
        console.error(
            '❌ [noticias] ' + proveedor +
            ': sin respuesta (' + error.message + ')'
        );

        return;
    }

    console.error(
        '❌ [noticias] ' + proveedor +
        ' falló — HTTP ' + status +
        ' — cuerpo: ' +
        resumirCuerpo(error.response.data)
    );
}

function esContenidoBloqueado() {
    const textos = Array.from(arguments);

    return textos.some(function (texto) {
        return PATRON_BLOQUEADO.test(
            String(texto || '')
        );
    });
}

function esFaltaDeCreditos(error) {
    const status = error.response
        ? error.response.status
        : null;

    const cuerpo = resumirCuerpo(
        error.response
            ? error.response.data
            : ''
    );

    return (
        (status === 403 || status === 429) &&
        /credit|quota|paid|billing|insufficient|limit exceeded/i.test(cuerpo)
    );
}

function normalizarFuentes(fuentes) {
    const resultado = [];
    const vistas = new Set();

    for (const fuente of fuentes || []) {
        if (!fuente) continue;

        const url = urlSegura(fuente.url);

        if (url === '#' || vistas.has(url)) {
            continue;
        }

        vistas.add(url);

        resultado.push({
            id: hashId(url),
            titulo: limpiarTexto(
                fuente.titulo || fuente.title || 'Fuente',
                120
            ),
            url: url
        });

        if (resultado.length >= MAX_FUENTES) {
            break;
        }
    }

    return resultado;
}

function normalizarVideo(valor) {
    const url = urlSegura(valor);

    if (url === '#') return null;

    return url;
}

function obtenerImagenNoticia(registro) {
    if (!registro) return null;

    const imagen = urlSegura(
        registro.image_url ||
        registro.imagen ||
        registro.image ||
        registro.thumbnail ||
        registro.thumbnail_url
    );

    return imagen === '#' ? null : imagen;
}

function obtenerVideoNoticia(registro) {
    if (!registro) return null;

    return normalizarVideo(
        registro.video_url ||
        registro.video ||
        registro.url_video
    );
}

// ================================================================
// REDIS: CACHÉ
// ================================================================

async function leerCache(clave) {
    if (!redisClient) return null;

    try {
        const cached = await redisClient.get(clave);

        if (!cached) return null;

        const resultado = JSON.parse(cached);

        return resultado || null;

    } catch (error) {
        console.warn(
            '⚠️ Redis noticias get falló:',
            error.message
        );

        return null;
    }
}

async function escribirCache(clave, valor, ttl) {
    if (!redisClient) return;

    try {
        const expiracion = numeroSeguro(
            ttl,
            CACHE_TTL,
            1,
            86400
        );

        await redisClient.setex(
            clave,
            expiracion,
            JSON.stringify(valor)
        );

    } catch (error) {
        console.warn(
            '⚠️ Redis noticias setex falló:',
            error.message
        );
    }
}

async function estaEnEnfriamiento(proveedor) {
    if (!redisClient) return false;

    try {
        const existe = await redisClient.exists(
            'noticias:cooldown:' + proveedor
        );

        return existe === 1;

    } catch (_) {
        return false;
    }
}

async function ponerEnEnfriamiento(proveedor) {
    if (!redisClient) return;

    try {
        await redisClient.setex(
            'noticias:cooldown:' + proveedor,
            COOLDOWN_CREDITOS,
            '1'
        );

    } catch (_) {
        // La caída de Redis no debe detener el servicio.
    }
}

// ================================================================
// FEED · NEWSDATA
// ================================================================

async function consultarNewsData(categoria, region) {
    if (!NEWSDATA_API_KEY) {
        throw crearError(
            503,
            'NewsData no configurado'
        );
    }

    const extra = PARAMS_NEWSDATA[categoria] || {};

    const params = Object.assign(
        {
            apikey: NEWSDATA_API_KEY,
            language: 'es',
            country: region.toLowerCase()
        },
        extra
    );

    const response = await http.get(
        'https://newsdata.io/api/1/latest',
        {
            params: params,
            timeout: 15000
        }
    );

    if (
        !response.data ||
        response.data.status !== 'success'
    ) {
        throw crearError(
            502,
            'NewsData devolvió un estado no exitoso'
        );
    }

    const resultados = Array.isArray(
        response.data.results
    )
        ? response.data.results
        : [];

    const noticias = [];

    for (const registro of resultados) {
        if (!registro) continue;

        const url = urlSegura(registro.link);

        if (url === '#') continue;

        if (
            esContenidoBloqueado(
                registro.title,
                registro.description,
                registro.content
            )
        ) {
            continue;
        }

        const titulo = limpiarTexto(
            registro.title || 'Sin título',
            200
        );

        const resumen = limpiarTexto(
            registro.description ||
            registro.content ||
            'Sin resumen disponible',
            400
        );

        const imagen = obtenerImagenNoticia(registro);
        const video = obtenerVideoNoticia(registro);

        noticias.push({
            id: hashId(url),
            titulo: titulo,
            resumen: resumen,
            publicadoEn: parseFechaNewsData(
                registro.pubDate
            ),

            // Multimedia real proporcionada por NewsData.
            imagen: imagen,
            video: video,

            fuentes: [
                {
                    titulo: limpiarTexto(
                        registro.source_name ||
                        registro.source_id ||
                        hostOf(url),
                        120
                    ),
                    url: url
                }
            ]
        });

        if (noticias.length >= MAX_NOTICIAS) {
            break;
        }
    }

    return noticias.filter(function (item) {
        return item.titulo && item.resumen;
    });
}

// ================================================================
// FEED · PERPLEXITY SEARCH
// ================================================================

async function consultarPerplexitySearch(
    categoria,
    region
) {
    if (!PERPLEXITY_API_KEY) {
        throw crearError(
            503,
            'Perplexity no configurado'
        );
    }

    const response = await http.post(
        'https://api.perplexity.ai/search',
        {
            query:
                QUERIES_PERPLEXITY[categoria] ||
                QUERIES_PERPLEXITY.general,

            max_results: 5,
            country: region,
            search_type: 'fast'
        },
        {
            headers: {
                Authorization:
                    'Bearer ' + PERPLEXITY_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const resultados = Array.isArray(
        response.data && response.data.results
    )
        ? response.data.results
        : [];

    const noticias = [];

    for (const registro of resultados) {
        if (!registro) continue;

        const url = urlSegura(registro.url);

        if (url === '#') continue;

        if (
            esContenidoBloqueado(
                registro.title,
                registro.snippet
            )
        ) {
            continue;
        }

        noticias.push({
            id: hashId(url),

            titulo: limpiarTexto(
                registro.title || 'Sin título',
                200
            ),

            resumen: limpiarTexto(
                registro.snippet ||
                registro.description ||
                'Sin resumen disponible',
                400
            ),

            publicadoEn: registro.date || null,

            imagen: null,
            video: null,

            fuentes: [
                {
                    titulo: limpiarTexto(
                        registro.title || hostOf(url),
                        120
                    ),
                    url: url
                }
            ]
        });
    }

    return noticias.slice(0, MAX_NOTICIAS);
}

// ================================================================
// FEED · ORQUESTACIÓN
// ================================================================

async function obtenerNoticias(
    categoria,
    region
) {
    const cat = String(
        categoria || 'general'
    ).trim().toLowerCase();

    const reg = String(
        region || 'MX'
    ).trim().toUpperCase();

    if (!CATEGORIAS_VALIDAS.includes(cat)) {
        throw crearError(
            400,
            'Categoría inválida'
        );
    }

    if (!REGIONES_VALIDAS.includes(reg)) {
        throw crearError(
            400,
            'Región inválida'
        );
    }

    const cacheKey =
        'noticias:feed:' +
        VERSION_CACHE_FEED +
        ':' + cat +
        ':' + reg;

    const cached = await leerCache(cacheKey);

    if (cached) {
        return Object.assign({}, cached, {
            desdeCache: true
        });
    }

    return ejecutarUnaVez(
        cacheKey,
        async function () {
            const cacheInterna = await leerCache(
                cacheKey
            );

            if (cacheInterna) {
                return Object.assign(
                    {},
                    cacheInterna,
                    { desdeCache: true }
                );
            }

            const proveedores = [
                {
                    nombre: 'newsdata',
                    consultar: function () {
                        return consultarNewsData(
                            cat,
                            reg
                        );
                    },
                    clave: NEWSDATA_API_KEY
                },
                {
                    nombre: 'perplexity-search',
                    consultar: function () {
                        return consultarPerplexitySearch(
                            cat,
                            reg
                        );
                    },
                    clave: PERPLEXITY_API_KEY
                }
            ];

            for (const proveedor of proveedores) {
                if (!proveedor.clave) continue;

                if (
                    await estaEnEnfriamiento(
                        proveedor.nombre
                    )
                ) {
                    continue;
                }

                try {
                    const items = await proveedor.consultar();

                    if (
                        !Array.isArray(items) ||
                        items.length === 0
                    ) {
                        continue;
                    }

                    const resultado = {
                        consultadoEn:
                            new Date().toISOString(),

                        proveedor: proveedor.nombre,

                        items: items.slice(
                            0,
                            MAX_NOTICIAS
                        )
                    };

                    await escribirCache(
                        cacheKey,
                        resultado,
                        CACHE_TTL
                    );

                    return Object.assign(
                        {},
                        resultado,
                        { desdeCache: false }
                    );

                } catch (error) {
                    if (esFaltaDeCreditos(error)) {
                        await ponerEnEnfriamiento(
                            proveedor.nombre
                        );
                    }

                    registrarErrorProveedor(
                        proveedor.nombre,
                        error
                    );
                }
            }

            throw crearError(
                502,
                'No hay noticias disponibles en este momento'
            );
        }
    );
}

// ================================================================
// PREGUNTAS · PERPLEXITY AGENT
// ================================================================

function extraerTextoAgent(data) {
    if (!data) return '';

    if (
        typeof data.output_text === 'string' &&
        data.output_text.trim()
    ) {
        return data.output_text.trim();
    }

    const partes = [];

    const output = Array.isArray(data.output)
        ? data.output
        : [];

    for (const elemento of output) {
        if (!elemento) continue;

        if (typeof elemento.text === 'string') {
            partes.push(elemento.text);
        }

        if (Array.isArray(elemento.content)) {
            for (const contenido of elemento.content) {
                if (
                    contenido &&
                    typeof contenido.text === 'string'
                ) {
                    partes.push(contenido.text);
                }
            }
        }
    }

    return partes.join('\n\n').trim();
}

function extraerFuentesAgent(data) {
    const fuentes = [];

    if (!data) return fuentes;

    const output = Array.isArray(data.output)
        ? data.output
        : [];

    for (const elemento of output) {
        if (!elemento) continue;

        const resultados = Array.isArray(
            elemento.results
        )
            ? elemento.results
            : [];

        for (const resultado of resultados) {
            if (!resultado) continue;

            const url = urlSegura(resultado.url);

            if (url === '#') continue;

            fuentes.push({
                titulo: resultado.title || 'Fuente',
                url: url
            });
        }

        const citas = Array.isArray(elemento.citations)
            ? elemento.citations
            : [];

        for (const cita of citas) {
            const url = urlSegura(
                typeof cita === 'string'
                    ? cita
                    : cita.url
            );

            if (url === '#') continue;

            fuentes.push({
                titulo:
                    cita.title ||
                    hostOf(url),
                url: url
            });
        }
    }

    return normalizarFuentes(fuentes);
}

async function consultarPerplexityAgent(pregunta) {
    if (!PERPLEXITY_API_KEY) {
        throw crearError(
            503,
            'Perplexity no configurado'
        );
    }

    const response = await http.post(
        'https://api.perplexity.ai/v1/agent',
        {
            preset: PERPLEXITY_AGENT_PRESET,
            input:
                'Responde en español, de forma breve, clara ' +
                'y actualizada. Usa información verificable. ' +
                'Incluye fechas cuando sean relevantes. ' +
                'No inventes datos ni fuentes.\n\n' +
                'Pregunta del usuario: ' + pregunta
        },
        {
            headers: {
                Authorization:
                    'Bearer ' + PERPLEXITY_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 45000
        }
    );

    const data = response.data || {};

    const respuesta = limpiarTexto(
        extraerTextoAgent(data),
        4000
    );

    if (!respuesta) {
        throw crearError(
            502,
            'Perplexity Agent devolvió una respuesta vacía'
        );
    }

    return {
        respuesta: respuesta,
        fuentes: extraerFuentesAgent(data)
    };
}

// ================================================================
// PREGUNTAS · TAVILY
// ================================================================

async function buscarTavily(pregunta) {
    if (!TAVILY_API_KEY) {
        throw crearError(
            503,
            'Tavily no configurado'
        );
    }

    const busqueda = await http.post(
        'https://api.tavily.com/search',
        {
            query: pregunta,
            search_depth: 'basic',
            max_results: MAX_FUENTES,
            include_answer: false,
            topic: 'general'
        },
        {
            headers: {
                Authorization:
                    'Bearer ' + TAVILY_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 20000
        }
    );

    const resultados = Array.isArray(
        busqueda.data && busqueda.data.results
    )
        ? busqueda.data.results
        : [];

    const fuentesCrudas = resultados
        .filter(function (registro) {
            return registro &&
                urlSegura(registro.url) !== '#';
        })
        .filter(function (registro) {
            return !esContenidoBloqueado(
                registro.title,
                registro.content
            );
        })
        .slice(0, MAX_FUENTES);

    if (fuentesCrudas.length === 0) {
        throw crearError(
            502,
            'Tavily no devolvió resultados'
        );
    }

    return fuentesCrudas;
}

// ================================================================
// REDACCIÓN CON FUENTES
// ================================================================

async function redactarConFuentes(configuracion) {
    const url = configuracion.url;
    const clave = configuracion.clave;
    const modelo = configuracion.modelo;
    const pregunta = configuracion.pregunta;
    const fuentesCrudas = configuracion.fuentesCrudas;

    const contexto = fuentesCrudas
        .map(function (fuente, indice) {
            return (
                '[' + (indice + 1) + '] ' +
                limpiarTexto(
                    fuente.title || 'Fuente',
                    180
                ) +
                '\n' +
                urlSegura(fuente.url) +
                '\n' +
                String(
                    fuente.content || ''
                ).slice(0, MAX_TEXTO_FUENTE)
            );
        })
        .join('\n\n');

    const completado = await http.post(
        url,
        {
            model: modelo,
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content:
                        'Eres el asistente de actualidad de Csariel’s. ' +
                        'Responde en español, de forma breve, clara y útil. ' +
                        'Utiliza exclusivamente la información de las fuentes ' +
                        'proporcionadas. Cita las fuentes con [1], [2], etc. ' +
                        'Distingue hechos confirmados de información preliminar. ' +
                        'Si las fuentes no bastan, dilo claramente. ' +
                        'No inventes datos, fechas ni direcciones web.'
                },
                {
                    role: 'user',
                    content:
                        'Pregunta: ' + pregunta +
                        '\n\nFuentes verificables:\n' +
                        contexto
                }
            ]
        },
        {
            headers: {
                Authorization: 'Bearer ' + clave,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const respuestaCruda =
        completado.data &&
        completado.data.choices &&
        completado.data.choices[0] &&
        completado.data.choices[0].message
            ? completado.data.choices[0].message.content
            : '';

    const respuesta = limpiarTexto(
        respuestaCruda,
        4000
    );

    if (!respuesta) {
        throw crearError(
            502,
            'El modelo devolvió una respuesta vacía'
        );
    }

    return {
        respuesta: respuesta,

        fuentes: normalizarFuentes(
            fuentesCrudas.map(function (fuente) {
                return {
                    titulo:
                        fuente.title || 'Fuente',
                    url: fuente.url
                };
            })
        )
    };
}

// ================================================================
// PREGUNTAS · GROQ + TAVILY
// ================================================================

async function consultarGroqTavily(pregunta) {
    if (!GROQ_API_KEY || !TAVILY_API_KEY) {
        throw crearError(
            503,
            'Groq o Tavily no configurado'
        );
    }

    const fuentesCrudas = await buscarTavily(
        pregunta
    );

    return redactarConFuentes({
        url:
            'https://api.groq.com/openai/v1/chat/completions',

        clave: GROQ_API_KEY,
        modelo: GROQ_MODEL,
        pregunta: pregunta,
        fuentesCrudas: fuentesCrudas
    });
}

// ================================================================
// PREGUNTAS · TAVILY + OPENAI
// ================================================================

async function consultarTavilyOpenAI(pregunta) {
    if (!OPENAI_API_KEY || !TAVILY_API_KEY) {
        throw crearError(
            503,
            'OpenAI o Tavily no configurado'
        );
    }

    const fuentesCrudas = await buscarTavily(
        pregunta
    );

    return redactarConFuentes({
        url:
            'https://api.openai.com/v1/chat/completions',

        clave: OPENAI_API_KEY,
        modelo: OPENAI_MODEL_RESPALDO,
        pregunta: pregunta,
        fuentesCrudas: fuentesCrudas
    });
}

// ================================================================
// RESPALDO · PERPLEXITY SEARCH SIN IA
// ================================================================

async function consultarResumenSinIA(pregunta) {
    if (!PERPLEXITY_API_KEY) {
        throw crearError(
            503,
            'Perplexity no configurado'
        );
    }

    const response = await http.post(
        'https://api.perplexity.ai/search',
        {
            query: pregunta,
            max_results: MAX_FUENTES,
            country: 'MX',
            search_type: 'fast'
        },
        {
            headers: {
                Authorization:
                    'Bearer ' + PERPLEXITY_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const resultados = Array.isArray(
        response.data && response.data.results
    )
        ? response.data.results
        : [];

    const validos = resultados
        .filter(function (registro) {
            return registro &&
                urlSegura(registro.url) !== '#';
        })
        .filter(function (registro) {
            return !esContenidoBloqueado(
                registro.title,
                registro.snippet
            );
        });

    if (validos.length === 0) {
        throw crearError(
            502,
            'Perplexity Search no devolvió resultados'
        );
    }

    const fragmentos = validos
        .slice(0, 3)
        .map(function (registro) {
            return limpiarTexto(
                registro.snippet ||
                registro.description ||
                '',
                300
            );
        })
        .filter(Boolean);

    const respuesta = fragmentos.length
        ? (
            'Esto reportan las fuentes encontradas ' +
            '(resumen automático, sin redacción de IA):\n\n' +
            fragmentos
                .map(function (fragmento) {
                    return '• ' + fragmento;
                })
                .join('\n\n')
        )
        : (
            'Encontré fuentes relacionadas con tu pregunta, ' +
            'pero no hay un resumen disponible.'
        );

    return {
        respuesta: respuesta,

        fuentes: normalizarFuentes(
            validos.map(function (registro) {
                return {
                    titulo:
                        registro.title || 'Fuente',
                    url: registro.url
                };
            })
        ),

        ttl: CACHE_TTL_RESUMEN
    };
}

// ================================================================
// PREGUNTAS · ORQUESTACIÓN
// ================================================================

async function preguntarActualidad(pregunta) {
    const preguntaLimpia = String(
        pregunta || ''
    ).trim().slice(0, MAX_PREGUNTA);

    if (!preguntaLimpia) {
        throw crearError(
            400,
            'Pregunta requerida'
        );
    }

    if (
        PATRON_SALUDO.test(preguntaLimpia) ||
        preguntaLimpia.length < 6
    ) {
        return {
            consultadoEn: new Date().toISOString(),
            proveedor: 'local',
            respuesta: RESPUESTA_SALUDO,
            fuentes: [],
            desdeCache: false
        };
    }

    const cacheKey =
        'noticias:pregunta:' +
        VERSION_CACHE_PREGUNTA +
        ':' +
        hashId(
            preguntaLimpia.toLowerCase()
        );

    const cached = await leerCache(cacheKey);

    if (cached) {
        return Object.assign(
            {},
            cached,
            { desdeCache: true }
        );
    }

    return ejecutarUnaVez(
        cacheKey,
        async function () {
            const cacheInterna = await leerCache(
                cacheKey
            );

            if (cacheInterna) {
                return Object.assign(
                    {},
                    cacheInterna,
                    { desdeCache: true }
                );
            }

            const proveedores = [
                {
                    nombre: 'perplexity-agent',
                    proveedorReal: 'perplexity-agent',
                    clave: PERPLEXITY_API_KEY,
                    consultar: function () {
                        return consultarPerplexityAgent(
                            preguntaLimpia
                        );
                    }
                },
                {
                    nombre: 'groq+tavily',
                    proveedorReal: 'groq+tavily',
                    clave:
                        GROQ_API_KEY &&
                        TAVILY_API_KEY,
                    consultar: function () {
                        return consultarGroqTavily(
                            preguntaLimpia
                        );
                    }
                },
                {
                    nombre: 'tavily+openai',
                    proveedorReal: 'tavily+openai',
                    clave:
                        TAVILY_API_KEY &&
                        OPENAI_API_KEY,
                    consultar: function () {
                        return consultarTavilyOpenAI(
                            preguntaLimpia
                        );
                    }
                },
                {
                    nombre: 'resumen-sin-ia',
                    proveedorReal: 'perplexity-search',
                    clave: PERPLEXITY_API_KEY,
                    consultar: function () {
                        return consultarResumenSinIA(
                            preguntaLimpia
                        );
                    }
                }
            ];

            for (const proveedor of proveedores) {
                if (!proveedor.clave) continue;

                if (
                    await estaEnEnfriamiento(
                        proveedor.proveedorReal
                    )
                ) {
                    continue;
                }

                try {
                    const resultadoProveedor =
                        await proveedor.consultar();

                    if (
                        !resultadoProveedor ||
                        !resultadoProveedor.respuesta
                    ) {
                        continue;
                    }

                    const resultado = {
                        consultadoEn:
                            new Date().toISOString(),

                        proveedor: proveedor.nombre,

                        respuesta: limpiarTexto(
                            resultadoProveedor.respuesta,
                            4000
                        ),

                        fuentes: normalizarFuentes(
                            resultadoProveedor.fuentes || []
                        )
                    };

                    await escribirCache(
                        cacheKey,
                        resultado,
                        resultadoProveedor.ttl ||
                        CACHE_TTL_PREGUNTA
                    );

                    return Object.assign(
                        {},
                        resultado,
                        { desdeCache: false }
                    );

                } catch (error) {
                    if (esFaltaDeCreditos(error)) {
                        await ponerEnEnfriamiento(
                            proveedor.proveedorReal
                        );
                    }

                    registrarErrorProveedor(
                        proveedor.nombre,
                        error
                    );
                }
            }

            throw crearError(
                502,
                'No se pudo consultar en este momento. Intenta más tarde.'
            );
        }
    );
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    obtenerNoticias,
    preguntarActualidad,
    CATEGORIAS_VALIDAS,
    REGIONES_VALIDAS
};
