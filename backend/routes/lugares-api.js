// ================================================================
// CSARIEL'S TURISMO · BUSCADOR TURÍSTICO
// backend/routes/lugares-api.js
// Versión 5.5
// ================================================================
// RUTAS (montar en server.js como /api/turismo):
//   GET /buscar
//   GET /salud
//
// La ubicación del usuario y la geocodificación inversa NO viven aquí:
// se resuelven en routes/geo.js (POST /api/geo/ubicacion).
// Este módulo solo recibe coordenadas ya validadas.
//
// VARIABLES DE ENTORNO:
//   GOOGLE_MAPS_API_KEY        (obligatoria para buscar)
//   TURISMO_CURSOR_SECRET      (recomendada; si falta, se usa un
//                               secreto temporal y se avisa en log)
//   TURISMO_CACHE_ENABLED      ('true' para activar caché en memoria)
//
// NOTA: este módulo NUNCA lanza un error al cargarse. Si falta una
// variable, la ruta responde con un error claro y el servidor sigue.
// ================================================================

'use strict';

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// ================================================================
// CONFIGURACIÓN
// ================================================================

const CONFIG = Object.freeze({
    PLACES_ENDPOINT: 'https://places.googleapis.com/v1/places:searchText',

    DEFAULT_LANGUAGE: 'es',
    DEFAULT_REGION: 'mx',

    MIN_QUERY_LENGTH: 2,
    MAX_QUERY_LENGTH: 180,

    MAX_RADIUS_METERS: 50000,
    DEFAULT_RADIUS_METERS: 15000,

    MAX_PAGE_SIZE: 40,
    DEFAULT_PAGE_SIZE: 20,
    GOOGLE_PAGE_SIZE: 20,
    MAX_PAGES_PER_SEARCH: 2,

    CURSOR_TTL_MS: 10 * 60 * 1000,

    MAX_UPSTREAM_CONCURRENCY: 10,
    MAX_QUEUE_SIZE: 100,
    MAX_QUEUE_WAIT_MS: 5000,

    REQUEST_TIMEOUT_MS: 8000,
    MAX_RETRIES: 2,
    RETRY_BASE_DELAY_MS: 300,
    RETRY_MAX_DELAY_MS: 2000,

    CIRCUIT_FAILURE_THRESHOLD: 8,
    CIRCUIT_OPEN_MS: 30000,
    CIRCUIT_HALF_OPEN_MAX: 3,

    RESPONSE_CACHE_ENABLED: process.env.TURISMO_CACHE_ENABLED === 'true',
    RESPONSE_CACHE_MAX: 1000,
    RESPONSE_CACHE_TTL_MS: 5 * 60 * 1000,

    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_ANONYMOUS_MAX: 30,
    RATE_LIMIT_AUTHENTICATED_MAX: 120,
    RATE_LIMIT_MAX_CLIENTS: 10000,

    SCORING: Object.freeze({
        EXACT_NAME_MATCH: 45,
        WORD_MATCH: 8,
        ADDRESS_MATCH: 8,
        RATING_WEIGHT: 12,
        REVIEW_WEIGHT: 0.004,
        MAX_REVIEW_BOOST: 25,
        HIGH_VALUE_TYPE: 14,
        OPERATIONAL_BONUS: 8,
        CLOSED_PENALTY: 25,
        DISTANCE_1KM: 30,
        DISTANCE_3KM: 24,
        DISTANCE_5KM: 18,
        DISTANCE_10KM: 12,
        DISTANCE_25KM: 6
    })
});

// ================================================================
// SECRETO DE CURSORES (sin throw)
// ================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CURSOR_SECRET_ENV = process.env.TURISMO_CURSOR_SECRET || '';
const CURSOR_SECRET_CONFIGURADO = Boolean(CURSOR_SECRET_ENV);

// Si no hay secreto, se genera uno aleatorio al arrancar. Los cursores
// dejan de ser válidos al reiniciar, pero el servidor NO se cae.
const EFFECTIVE_CURSOR_SECRET = CURSOR_SECRET_ENV ||
    crypto.randomBytes(32).toString('hex');

if (!CURSOR_SECRET_CONFIGURADO) {
    console.warn(
        '⚠️ [Turismo] TURISMO_CURSOR_SECRET no configurada. ' +
        'Se usa un secreto temporal; la paginación se reinicia al redeploy.' +
        (IS_PRODUCTION ? ' Configúrala en Railway.' : '')
    );
}

// ================================================================
// UTILIDADES
// ================================================================

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function toInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function toFloat(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidCoordinate(lat, lng) {
    return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180;
}

function getClientIp(req) {
    return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hashString(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function safeJson(res, status, payload) {
    return res.status(status).json(payload);
}

// ================================================================
// GEOGRAFÍA (distancia, sin llamadas externas)
// ================================================================

function haversineMeters(lat1, lng1, lat2, lng2) {
    const EARTH_RADIUS = 6371000;
    const toRad = (d) => d * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return Math.round(EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ================================================================
// TIPOS PERMITIDOS
// ================================================================

const ALLOWED_PLACE_TYPES = new Set([
    'restaurant', 'cafe', 'bakery', 'bar',
    'hotel', 'lodging', 'resort',
    'museum', 'art_gallery', 'church', 'historical_landmark',
    'park', 'natural_feature', 'national_park', 'hiking_area',
    'tourist_attraction', 'amusement_park', 'aquarium', 'zoo',
    'movie_theater', 'bowling_alley',
    'shopping_mall', 'store',
    'campground', 'food', 'point_of_interest', 'establishment'
]);

function sanitizeIncludedType(raw) {
    const type = normalizeText(raw || '');
    if (!type || !ALLOWED_PLACE_TYPES.has(type)) return null;
    return type;
}

// ================================================================
// PRECIO
// ================================================================

const PRICE_LEVEL_MAP = Object.freeze({
    '1': 'PRICE_LEVEL_INEXPENSIVE',
    '2': 'PRICE_LEVEL_MODERATE',
    '3': 'PRICE_LEVEL_EXPENSIVE',
    '4': 'PRICE_LEVEL_VERY_EXPENSIVE',
    'barato': 'PRICE_LEVEL_INEXPENSIVE',
    'moderado': 'PRICE_LEVEL_MODERATE',
    'caro': 'PRICE_LEVEL_EXPENSIVE',
    'muy_caro': 'PRICE_LEVEL_VERY_EXPENSIVE'
});

const PRICE_LEVELS_VALIDOS = new Set(Object.values(PRICE_LEVEL_MAP));

function normalizePriceLevels(raw) {
    return String(raw || '')
        .split(',')
        .map(normalizeText)
        .map(v => PRICE_LEVEL_MAP[v] || v.toUpperCase())
        .filter(v => PRICE_LEVELS_VALIDOS.has(v))
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 4);
}

// ================================================================
// MÉTRICAS
// ================================================================

const metrics = {
    startedAt: new Date().toISOString(),
    searches: 0,
    successfulSearches: 0,
    failedSearches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    singleFlightHits: 0,
    upstreamRequests: 0,
    upstreamErrors: 0,
    upstreamTimeouts: 0,
    upstreamRetries: 0,
    rateLimited: 0,
    circuitOpenRejections: 0,
    concurrencyRejections: 0,
    resultsReturned: 0,
    lastError: null
};

// ================================================================
// CACHÉ LRU + TTL (en memoria, acotada)
// ================================================================

class LruTtlCache {
    constructor(maxSize, defaultTtlMs) {
        this.maxSize = maxSize;
        this.defaultTtlMs = defaultTtlMs;
        this.map = new Map();
    }

    get(key) {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }

    set(key, value, ttlMs) {
        if (this.maxSize <= 0) return;
        this.map.delete(key);
        this.map.set(key, { value, expiresAt: Date.now() + (ttlMs || this.defaultTtlMs) });
        while (this.map.size > this.maxSize) {
            this.map.delete(this.map.keys().next().value);
        }
    }

    get size() {
        return this.map.size;
    }
}

const responseCache = new LruTtlCache(
    CONFIG.RESPONSE_CACHE_MAX,
    CONFIG.RESPONSE_CACHE_TTL_MS
);

const singleFlight = new Map();

// ================================================================
// RATE LIMIT (ventana deslizante, por usuario o IP)
// ================================================================

const rateLimitStore = new Map();

function rateLimiter(req, res, next) {
    const now = Date.now();
    const autenticado = Boolean(req.user && req.user.id);
    const clientId = autenticado ? 'user:' + req.user.id : 'ip:' + getClientIp(req);
    const limit = autenticado
        ? CONFIG.RATE_LIMIT_AUTHENTICATED_MAX
        : CONFIG.RATE_LIMIT_ANONYMOUS_MAX;
    const windowMs = CONFIG.RATE_LIMIT_WINDOW_MS;

    let entry = rateLimitStore.get(clientId);
    if (!entry) entry = { hits: [] };

    entry.hits = entry.hits.filter(t => now - t < windowMs);

    if (entry.hits.length >= limit) {
        metrics.rateLimited++;
        const retryAfter = Math.max(1, Math.ceil((windowMs - (now - entry.hits[0])) / 1000));
        res.setHeader('Retry-After', retryAfter);
        return safeJson(res, 429, {
            error: 'TOO_MANY_REQUESTS',
            message: 'Has alcanzado el límite temporal de búsquedas.',
            retryAfterSeconds: retryAfter
        });
    }

    entry.hits.push(now);
    rateLimitStore.set(clientId, entry);

    if (rateLimitStore.size > CONFIG.RATE_LIMIT_MAX_CLIENTS) {
        for (const [key, value] of rateLimitStore) {
            if (!value.hits.length || now - value.hits[value.hits.length - 1] > windowMs) {
                rateLimitStore.delete(key);
            }
            if (rateLimitStore.size <= CONFIG.RATE_LIMIT_MAX_CLIENTS * 0.8) break;
        }
    }

    res.setHeader('RateLimit-Limit', limit);
    res.setHeader('RateLimit-Remaining', Math.max(0, limit - entry.hits.length));
    return next();
}

// ================================================================
// SEMÁFORO
// ================================================================

class Semaphore {
    constructor(max, maxQueue) {
        this.max = max;
        this.maxQueue = maxQueue;
        this.active = 0;
        this.queue = [];
    }

    acquire(waitMs) {
        if (this.active < this.max) {
            this.active++;
            return Promise.resolve();
        }

        if (this.queue.length >= this.maxQueue || waitMs <= 0) {
            const error = new Error('CONCURRENCY_LIMIT');
            error.code = 'CONCURRENCY_LIMIT';
            return Promise.reject(error);
        }

        return new Promise((resolve, reject) => {
            const entry = { resolve: null };
            entry.timer = setTimeout(() => {
                const index = this.queue.indexOf(entry);
                if (index !== -1) this.queue.splice(index, 1);
                const error = new Error('CONCURRENCY_TIMEOUT');
                error.code = 'CONCURRENCY_TIMEOUT';
                reject(error);
            }, waitMs);

            entry.resolve = () => {
                clearTimeout(entry.timer);
                this.active++;
                resolve();
            };

            this.queue.push(entry);
        });
    }

    release() {
        if (this.active > 0) this.active--;
        const next = this.queue.shift();
        if (next) next.resolve();
    }
}

const upstreamSemaphore = new Semaphore(
    CONFIG.MAX_UPSTREAM_CONCURRENCY,
    CONFIG.MAX_QUEUE_SIZE
);

// ================================================================
// CIRCUIT BREAKER
// ================================================================

const circuit = {
    state: 'CLOSED',
    failures: 0,
    openedAt: 0,
    halfOpenAttempts: 0
};

function circuitAllowsRequest() {
    if (circuit.state === 'CLOSED') return true;

    if (circuit.state === 'OPEN') {
        if (Date.now() - circuit.openedAt < CONFIG.CIRCUIT_OPEN_MS) return false;
        circuit.state = 'HALF_OPEN';
        circuit.halfOpenAttempts = 0;
    }

    return circuit.halfOpenAttempts < CONFIG.CIRCUIT_HALF_OPEN_MAX;
}

function circuitRegisterAttempt() {
    if (circuit.state === 'HALF_OPEN') circuit.halfOpenAttempts++;
}

function circuitRegisterSuccess() {
    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.halfOpenAttempts = 0;
    circuit.openedAt = 0;
}

function circuitRegisterFailure() {
    circuit.failures++;
    if (circuit.state === 'HALF_OPEN' || circuit.failures >= CONFIG.CIRCUIT_FAILURE_THRESHOLD) {
        circuit.state = 'OPEN';
        circuit.openedAt = Date.now();
        circuit.halfOpenAttempts = 0;
    }
}

// ================================================================
// INTENCIONES TURÍSTICAS
// ================================================================

const INTENTS = Object.freeze({
    nature: {
        keywords: ['cascada', 'cascadas', 'montana', 'montanas', 'bosque', 'laguna', 'lago',
            'playa', 'parque', 'senderismo', 'naturaleza', 'cueva', 'gruta', 'volcan', 'rio', 'mirador'],
        includedTypes: ['park', 'natural_feature', 'hiking_area']
    },
    food: {
        keywords: ['comer', 'comida', 'restaurante', 'restaurantes', 'desayuno', 'comida tipica',
            'antojitos', 'tacos', 'cafe', 'cafeteria', 'postres', 'bar', 'cantina', 'cenar', 'gastronomia'],
        includedTypes: ['restaurant', 'cafe', 'bakery']
    },
    lodging: {
        keywords: ['hotel', 'hoteles', 'hospedaje', 'hostal', 'hostales', 'resort',
            'alojamiento', 'donde dormir'],
        includedTypes: ['hotel', 'lodging', 'resort']
    },
    culture: {
        keywords: ['museo', 'museos', 'cultura', 'historia', 'iglesia', 'templo',
            'zona arqueologica', 'piramide', 'monumento', 'galeria', 'arte', 'arquitectura'],
        includedTypes: ['museum', 'art_gallery', 'church', 'historical_landmark']
    },
    entertainment: {
        keywords: ['diversion', 'entretenimiento', 'parque de diversiones', 'cine', 'zoo',
            'acuario', 'boliche', 'actividades', 'familia', 'ninos'],
        includedTypes: ['amusement_park', 'aquarium', 'zoo', 'movie_theater']
    },
    shopping: {
        keywords: ['compras', 'tiendas', 'mercado', 'mercados', 'souvenirs', 'artesanias',
            'centro comercial'],
        includedTypes: ['shopping_mall', 'store']
    },
    adventure: {
        keywords: ['aventura', 'camping', 'rappel', 'cicloturismo', 'excursion', 'tour',
            'tours', 'rafting', 'escalada'],
        includedTypes: ['campground', 'hiking_area', 'tourist_attraction']
    }
});

function detectIntent(normalizedQuery) {
    for (const [intent, definition] of Object.entries(INTENTS)) {
        if (definition.keywords.some(k => normalizedQuery.includes(k))) {
            return { intent, includedTypes: definition.includedTypes };
        }
    }
    return { intent: 'general', includedTypes: [] };
}

// ================================================================
// CATEGORÍAS
// ================================================================

const TYPE_LABELS = Object.freeze({
    tourist_attraction: 'Atracción turística',
    museum: 'Museo',
    park: 'Parque',
    natural_feature: 'Sitio natural',
    restaurant: 'Restaurante',
    cafe: 'Cafetería',
    bakery: 'Panadería',
    lodging: 'Hospedaje',
    hotel: 'Hotel',
    resort: 'Resort',
    campground: 'Campamento',
    hiking_area: 'Senderismo',
    national_park: 'Parque nacional',
    art_gallery: 'Galería de arte',
    church: 'Iglesia',
    amusement_park: 'Parque de diversiones',
    aquarium: 'Acuario',
    zoo: 'Zoológico',
    shopping_mall: 'Centro comercial',
    store: 'Tienda',
    food: 'Comida',
    movie_theater: 'Cine',
    bowling_alley: 'Boliche',
    historical_landmark: 'Monumento histórico',
    point_of_interest: 'Punto de interés',
    establishment: 'Establecimiento'
});

const HIGH_VALUE_TYPES = new Set([
    'tourist_attraction', 'museum', 'park', 'natural_feature',
    'amusement_park', 'aquarium', 'zoo', 'art_gallery', 'church',
    'historical_landmark', 'national_park', 'hiking_area'
]);

function translateType(type) {
    return TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

function getPrimaryCategory(types) {
    const list = types || [];
    const priority = [
        'tourist_attraction', 'museum', 'historical_landmark', 'natural_feature',
        'national_park', 'hiking_area', 'amusement_park', 'aquarium', 'zoo', 'park',
        'hotel', 'lodging', 'restaurant', 'cafe', 'bakery', 'art_gallery', 'church',
        'shopping_mall', 'movie_theater', 'store'
    ];
    for (const type of priority) {
        if (list.includes(type)) return translateType(type);
    }
    return list.length ? translateType(list[0]) : 'Lugar';
}

// ================================================================
// RANKING
// ================================================================

function calculateTourismScore(place, normalizedQuery, origin) {
    const w = CONFIG.SCORING;
    let score = 0;

    const name = normalizeText(place.displayName && place.displayName.text);
    const address = normalizeText(place.formattedAddress);
    const rating = place.rating || 0;
    const reviews = place.userRatingCount || 0;
    const types = place.types || [];

    if (name && normalizedQuery) {
        if (name === normalizedQuery) {
            score += w.EXACT_NAME_MATCH * 1.5;
        } else if (name.includes(normalizedQuery)) {
            score += w.EXACT_NAME_MATCH;
        } else {
            const words = normalizedQuery.split(' ').filter(x => x.length > 2);
            score += words.filter(x => name.includes(x)).length * w.WORD_MATCH;
        }
    }

    if (address && normalizedQuery && address.includes(normalizedQuery)) {
        score += w.ADDRESS_MATCH;
    }

    if (rating > 0) score += rating * w.RATING_WEIGHT;
    score += Math.min(reviews * w.REVIEW_WEIGHT, w.MAX_REVIEW_BOOST);

    if (types.some(t => HIGH_VALUE_TYPES.has(t))) score += w.HIGH_VALUE_TYPE;

    if (place.businessStatus === 'OPERATIONAL') {
        score += w.OPERATIONAL_BONUS;
    } else if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
        score -= w.CLOSED_PENALTY;
    }

    if (origin && place.location) {
        const d = haversineMeters(origin.lat, origin.lng, place.location.latitude, place.location.longitude);
        if (d <= 1000) score += w.DISTANCE_1KM;
        else if (d <= 3000) score += w.DISTANCE_3KM;
        else if (d <= 5000) score += w.DISTANCE_5KM;
        else if (d <= 10000) score += w.DISTANCE_10KM;
        else if (d <= 25000) score += w.DISTANCE_25KM;
    }

    return Math.round(score);
}

// ================================================================
// TRANSFORMACIÓN
// ================================================================

function transformPlace(place, normalizedQuery, origin) {
    const location = place.location || null;
    const types = place.types || [];
    const placeId = place.id || null;

    const photos = (place.photos || []).slice(0, 5).map(photo => ({
        name: photo.name || null,
        width: photo.widthPx || null,
        height: photo.heightPx || null,
        authorAttributions: photo.authorAttributions || []
    }));

    return {
        placeId,
        name: (place.displayName && place.displayName.text) || 'Lugar sin nombre',
        address: place.formattedAddress || '',
        location: location ? { lat: location.latitude, lng: location.longitude } : null,
        category: getPrimaryCategory(types),
        types,
        typeLabels: types.map(translateType),
        rating: place.rating || null,
        reviewCount: place.userRatingCount || 0,
        priceLevel: place.priceLevel || null,
        openNow: place.currentOpeningHours ? (place.currentOpeningHours.openNow ?? null) : null,
        businessStatus: place.businessStatus || 'UNKNOWN',
        photos,
        distanceMeters: origin && location
            ? haversineMeters(origin.lat, origin.lng, location.latitude, location.longitude)
            : null,
        mapUrl: placeId
            ? 'https://www.google.com/maps/search/?api=1&query_place_id=' + encodeURIComponent(placeId)
            : null,
        score: calculateTourismScore(place, normalizedQuery, origin)
    };
}

// ================================================================
// CONSTRUCCIÓN DE CONSULTA
// ================================================================

function buildQuery(req) {
    const rawQuery = String(req.query.q || '').trim();
    const normalizedQuery = normalizeText(rawQuery);
    const intent = detectIntent(normalizedQuery);

    const sanitizedType = sanitizeIncludedType(req.query.tipo);
    const includedTypes = sanitizedType ? [sanitizedType] : intent.includedTypes;

    const hasLatLng = req.query.lat !== undefined || req.query.lng !== undefined;
    const lat = hasLatLng ? toFloat(req.query.lat, NaN) : NaN;
    const lng = hasLatLng ? toFloat(req.query.lng, NaN) : NaN;
    const invalidCoordinates = hasLatLng && !isValidCoordinate(lat, lng);
    const hasLocation = hasLatLng && !invalidCoordinates;

    const sortRaw = normalizeText(req.query.orden || 'relevancia');
    const allowedSorts = ['relevancia', 'distancia', 'rating', 'populares'];

    return {
        rawQuery,
        normalizedQuery,
        includedTypes,
        intent: intent.intent,
        lat: hasLocation ? lat : null,
        lng: hasLocation ? lng : null,
        hasLocation,
        invalidCoordinates,
        radius: toInt(req.query.radio, CONFIG.DEFAULT_RADIUS_METERS, 100, CONFIG.MAX_RADIUS_METERS),
        pageSize: toInt(req.query.max, CONFIG.DEFAULT_PAGE_SIZE, 1, CONFIG.MAX_PAGE_SIZE),
        minRating: clampNumber(toFloat(req.query.rating, 0), 0, 5),
        priceLevels: normalizePriceLevels(req.query.precio),
        openNow: String(req.query.abierto || '').toLowerCase() === 'true',
        sort: allowedSorts.includes(sortRaw) ? sortRaw : 'relevancia',
        cursor: req.query.cursor || null
    };
}

// ================================================================
// CURSOR FIRMADO
// ================================================================

function buildQueryFingerprint(query) {
    return hashString([
        query.normalizedQuery,
        query.includedTypes.join(','),
        query.lat == null ? '' : query.lat,
        query.lng == null ? '' : query.lng,
        query.radius,
        query.pageSize,
        query.minRating,
        query.priceLevels.join(','),
        query.openNow,
        query.sort
    ].join('|'));
}

function signCursor(payload) {
    return crypto.createHmac('sha256', EFFECTIVE_CURSOR_SECRET)
        .update(payload)
        .digest('base64url');
}

function encodeCursor(nextPageToken, query) {
    if (!nextPageToken) return null;
    const payload = Buffer.from(JSON.stringify({
        token: nextPageToken,
        expiresAt: Date.now() + CONFIG.CURSOR_TTL_MS,
        fingerprint: buildQueryFingerprint(query)
    })).toString('base64url');
    return payload + '.' + signCursor(payload);
}

function decodeCursor(cursor, query) {
    if (!cursor) return null;
    try {
        const parts = String(cursor).split('.');
        if (parts.length !== 2) return null;

        const expected = Buffer.from(signCursor(parts[0]));
        const supplied = Buffer.from(parts[1]);
        if (supplied.length !== expected.length) return null;
        if (!crypto.timingSafeEqual(supplied, expected)) return null;

        const decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (!decoded.token || decoded.expiresAt < Date.now()) return null;
        if (decoded.fingerprint !== buildQueryFingerprint(query)) return null;
        return decoded.token;
    } catch (e) {
        return null;
    }
}

// ================================================================
// GOOGLE PLACES
// ================================================================

const PLACES_FIELD_MASK = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.currentOpeningHours.openNow',
    'places.businessStatus',
    'places.photos'
].join(',');

function buildPlacesPayload(query, pageToken) {
    const payload = {
        textQuery: query.rawQuery,
        languageCode: CONFIG.DEFAULT_LANGUAGE,
        regionCode: CONFIG.DEFAULT_REGION,
        maxResultCount: CONFIG.GOOGLE_PAGE_SIZE
    };
    if (query.includedTypes.length) payload.includedType = query.includedTypes[0];
    if (query.hasLocation) {
        payload.locationBias = {
            circle: {
                center: { latitude: query.lat, longitude: query.lng },
                radius: query.radius
            }
        };
    }
    if (pageToken) payload.pageToken = pageToken;
    return payload;
}

function isRetryableError(error) {
    if (error.name === 'AbortError') return true;
    if (error.retryable === true) return true;
    return ['UNAVAILABLE', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'UPSTREAM_TIMEOUT']
        .includes(error.code);
}

function getRetryDelay(attempt) {
    const exponential = CONFIG.RETRY_BASE_DELAY_MS * (2 ** attempt);
    const jitter = Math.random() * exponential * 0.25;
    return Math.min(CONFIG.RETRY_MAX_DELAY_MS, exponential + jitter);
}

async function callGooglePlaces(query, pageToken) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        const error = new Error('MISSING_GOOGLE_MAPS_API_KEY');
        error.code = 'MISSING_GOOGLE_MAPS_API_KEY';
        throw error;
    }

    if (!circuitAllowsRequest()) {
        metrics.circuitOpenRejections++;
        const error = new Error('CIRCUIT_OPEN');
        error.code = 'CIRCUIT_OPEN';
        throw error;
    }

    await upstreamSemaphore.acquire(CONFIG.MAX_QUEUE_WAIT_MS);
    circuitRegisterAttempt();

    let lastError = null;
    try {
        for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

            try {
                metrics.upstreamRequests++;

                const response = await fetch(CONFIG.PLACES_ENDPOINT, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask': PLACES_FIELD_MASK
                    },
                    body: JSON.stringify(buildPlacesPayload(query, pageToken))
                });

                if (!response.ok) {
                    const error = new Error('GOOGLE_HTTP_' + response.status);
                    error.code = 'GOOGLE_HTTP_' + response.status;
                    error.retryable = response.status === 429 || response.status >= 500;
                    if (response.status === 401 || response.status === 403) {
                        error.code = 'PERMISSION_DENIED';
                        error.retryable = false;
                    }
                    if (response.status === 400) {
                        error.code = 'INVALID_ARGUMENT';
                        error.retryable = false;
                    }
                    throw error;
                }

                const data = await response.json();
                if (data.error) {
                    const error = new Error(data.error.message || 'GOOGLE_API_ERROR');
                    error.code = data.error.status || 'GOOGLE_API_ERROR';
                    error.retryable = ['UNAVAILABLE', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED', 'INTERNAL']
                        .includes(error.code);
                    throw error;
                }

                circuitRegisterSuccess();
                return data;
            } catch (error) {
                lastError = error;
                metrics.upstreamErrors++;
                if (error.name === 'AbortError') {
                    metrics.upstreamTimeouts++;
                    error.code = 'UPSTREAM_TIMEOUT';
                    error.retryable = true;
                }
                if (!isRetryableError(error) || attempt >= CONFIG.MAX_RETRIES) break;
                metrics.upstreamRetries++;
                await sleep(getRetryDelay(attempt));
            } finally {
                clearTimeout(timeout);
            }
        }

        circuitRegisterFailure();
        throw lastError || new Error('UPSTREAM_REQUEST_FAILED');
    } finally {
        upstreamSemaphore.release();
    }
}

// ================================================================
// FILTRADO, ORDEN, DEDUPLICACIÓN
// ================================================================

function applyFilters(places, query) {
    let out = places;
    if (query.minRating > 0) out = out.filter(p => (p.rating || 0) >= query.minRating);
    if (query.priceLevels.length) {
        out = out.filter(p => !p.priceLevel || query.priceLevels.includes(p.priceLevel));
    }
    if (query.openNow) out = out.filter(p => p.openNow === true);
    return out;
}

function sortPlaces(places, sort) {
    const sorted = [...places];
    if (sort === 'distancia') {
        sorted.sort((a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
            (b.distanceMeters ?? Number.MAX_SAFE_INTEGER));
    } else if (sort === 'rating') {
        sorted.sort((a, b) => ((b.rating || 0) - (a.rating || 0)) || (b.reviewCount - a.reviewCount));
    } else if (sort === 'populares') {
        sorted.sort((a, b) => b.reviewCount - a.reviewCount);
    } else {
        sorted.sort((a, b) => (b.score - a.score) || String(a.placeId).localeCompare(String(b.placeId)));
    }
    return sorted;
}

function deduplicatePlaces(places) {
    const seen = new Set();
    const unique = [];
    for (const place of places) {
        const key = place.id || (normalizeText(place.displayName && place.displayName.text) +
            '|' + normalizeText(place.formattedAddress));
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(place);
    }
    return unique;
}

// ================================================================
// EJECUCIÓN DE BÚSQUEDA
// ================================================================

function buildCacheKey(query) {
    return hashString(buildQueryFingerprint(query) + '|' + (query.cursor || ''));
}

async function executeSearch(query) {
    const cacheKey = buildCacheKey(query);

    if (CONFIG.RESPONSE_CACHE_ENABLED) {
        const cached = responseCache.get(cacheKey);
        if (cached) {
            metrics.cacheHits++;
            return { ...cached, meta: { ...cached.meta, cache: 'HIT' } };
        }
    }
    metrics.cacheMisses++;

    if (singleFlight.has(cacheKey)) {
        metrics.singleFlightHits++;
        return singleFlight.get(cacheKey);
    }

    const execution = (async () => {
        let pageToken = decodeCursor(query.cursor, query);
        if (query.cursor && !pageToken) {
            const error = new Error('INVALID_CURSOR');
            error.code = 'INVALID_CURSOR';
            throw error;
        }

        let raw = [];
        let lastNextPageToken = null;
        let pagesFetched = 0;

        while (raw.length < query.pageSize && pagesFetched < CONFIG.MAX_PAGES_PER_SEARCH) {
            const data = await callGooglePlaces(query, pageToken);
            const batch = data.places || [];
            raw.push(...batch);
            lastNextPageToken = data.nextPageToken || null;
            pageToken = lastNextPageToken;
            pagesFetched++;
            if (!lastNextPageToken || !batch.length) break;
        }

        raw = deduplicatePlaces(raw);

        const origin = query.hasLocation ? { lat: query.lat, lng: query.lng } : null;

        let places = raw.map(p => transformPlace(p, query.normalizedQuery, origin));
        places = applyFilters(places, query);
        places = sortPlaces(places, query.sort).slice(0, query.pageSize);

        const nextCursor = encodeCursor(lastNextPageToken, query);

        const response = {
            results: places,
            meta: {
                total: places.length,
                query: query.rawQuery,
                detectedIntent: query.intent,
                appliedTypes: query.includedTypes,
                sort: query.sort,
                provider: 'Google Places API (New)',
                version: '5.5',
                timestamp: new Date().toISOString(),
                locationApplied: query.hasLocation,
                radiusMeters: query.hasLocation ? query.radius : null,
                filters: {
                    minRating: query.minRating || null,
                    priceLevels: query.priceLevels.length ? query.priceLevels : null,
                    openNow: query.openNow
                },
                pagination: {
                    hasNextPage: Boolean(nextCursor),
                    nextCursor
                },
                pagesFetched,
                cache: CONFIG.RESPONSE_CACHE_ENABLED ? 'MISS' : 'DISABLED'
            }
        };

        metrics.resultsReturned += places.length;
        if (CONFIG.RESPONSE_CACHE_ENABLED) responseCache.set(cacheKey, response);
        return response;
    })();

    singleFlight.set(cacheKey, execution);
    try {
        return await execution;
    } finally {
        singleFlight.delete(cacheKey);
    }
}

// ================================================================
// ERRORES
// ================================================================

function handleSearchError(error, res) {
    const code = error.code || error.name || 'UNKNOWN';

    if (code === 'CONCURRENCY_LIMIT' || code === 'CONCURRENCY_TIMEOUT') {
        metrics.concurrencyRejections++;
        return safeJson(res, 503, {
            error: 'SERVICE_BUSY',
            message: 'Muchas búsquedas en este momento. Intenta en unos segundos.'
        });
    }
    if (code === 'CIRCUIT_OPEN') {
        return safeJson(res, 503, {
            error: 'UPSTREAM_PROTECTED',
            message: 'El servicio está protegiendo el sistema temporalmente.'
        });
    }
    if (code === 'UPSTREAM_TIMEOUT') {
        return safeJson(res, 504, {
            error: 'UPSTREAM_TIMEOUT',
            message: 'La búsqueda tardó demasiado. Intenta nuevamente.'
        });
    }
    if (code === 'RESOURCE_EXHAUSTED' || code === 'GOOGLE_HTTP_429') {
        return safeJson(res, 429, {
            error: 'PROVIDER_QUOTA',
            message: 'El proveedor alcanzó temporalmente su límite.'
        });
    }
    if (code === 'PERMISSION_DENIED' || code === 'GOOGLE_HTTP_401' || code === 'GOOGLE_HTTP_403') {
        return safeJson(res, 502, {
            error: 'PROVIDER_UNAUTHORIZED',
            message: 'Revisa la configuración de Google Maps Platform.'
        });
    }
    if (code === 'INVALID_ARGUMENT' || code === 'GOOGLE_HTTP_400') {
        return safeJson(res, 400, {
            error: 'INVALID_QUERY',
            message: 'No fue posible interpretar la búsqueda.'
        });
    }
    if (code === 'INVALID_CURSOR') {
        return safeJson(res, 400, {
            error: 'INVALID_CURSOR',
            message: 'El cursor expiró o no corresponde a esta búsqueda. Inicia nuevamente.'
        });
    }
    if (code === 'MISSING_GOOGLE_MAPS_API_KEY') {
        return safeJson(res, 503, {
            error: 'MAP_PROVIDER_NOT_CONFIGURED',
            message: 'El buscador turístico no está configurado en el servidor.'
        });
    }

    console.error('[Turismo]', code, error.message);
    return safeJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: 'No fue posible completar la búsqueda turística.'
    });
}

// ================================================================
// GET /salud
// ================================================================

router.get('/salud', (req, res) => {
    return res.json({
        status: 'ok',
        service: "Csariel's Turismo",
        version: '5.5',
        googleKeyConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        cursorSecretConfigured: CURSOR_SECRET_CONFIGURADO,
        circuit: { state: circuit.state, failures: circuit.failures },
        concurrency: {
            active: upstreamSemaphore.active,
            max: upstreamSemaphore.max,
            queued: upstreamSemaphore.queue.length
        },
        cache: { enabled: CONFIG.RESPONSE_CACHE_ENABLED, entries: responseCache.size },
        metrics,
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// GET /buscar
// ================================================================

router.get('/buscar', rateLimiter, async (req, res) => {
    const startedAt = Date.now();
    metrics.searches++;

    try {
        if (!process.env.GOOGLE_MAPS_API_KEY) {
            metrics.failedSearches++;
            return handleSearchError({ code: 'MISSING_GOOGLE_MAPS_API_KEY' }, res);
        }

        const rawQuery = String(req.query.q || '').trim();

        if (rawQuery.length < CONFIG.MIN_QUERY_LENGTH) {
            metrics.failedSearches++;
            return safeJson(res, 400, {
                error: 'QUERY_TOO_SHORT',
                message: 'Escribe al menos ' + CONFIG.MIN_QUERY_LENGTH + ' caracteres.'
            });
        }
        if (rawQuery.length > CONFIG.MAX_QUERY_LENGTH) {
            metrics.failedSearches++;
            return safeJson(res, 400, {
                error: 'QUERY_TOO_LONG',
                message: 'La consulta no puede superar ' + CONFIG.MAX_QUERY_LENGTH + ' caracteres.'
            });
        }

        const query = buildQuery(req);
        if (query.invalidCoordinates) {
            metrics.failedSearches++;
            return safeJson(res, 400, {
                error: 'INVALID_COORDINATES',
                message: 'Latitud entre -90 y 90; longitud entre -180 y 180.'
            });
        }

        const response = await executeSearch(query);
        metrics.successfulSearches++;
        return res.json(response);
    } catch (error) {
        metrics.failedSearches++;
        metrics.lastError = {
            code: error.code || error.name || 'UNKNOWN',
            timestamp: new Date().toISOString()
        };
        return handleSearchError(error, res);
    } finally {
        // Métrica de latencia simple; no se acumula en memoria.
        metrics.lastLatencyMs = Date.now() - startedAt;
    }
});

module.exports = router;