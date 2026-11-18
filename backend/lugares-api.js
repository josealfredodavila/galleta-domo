// ================================================================
// CSARIEL'S TURISMO · SMART DESTINATION ENGINE
// backend/lugares-api.js
// Version 4.0 · High-Scale Intelligent Tourism Search
//
// Node.js 18+ · Express · Google Places API (New)
// CommonJS · Sin dependencias adicionales
//
// ARQUITECTURA:
// - Búsqueda turística inteligente.
// - Motor de intención y categorización.
// - Ranking geoespacial, de calidad, popularidad y relevancia.
// - Single-flight para colapsar búsquedas idénticas.
// - LRU + TTL incremental.
// - Semáforo de concurrencia upstream.
// - Circuit breaker con recuperación gradual.
// - Retry con backoff exponencial y jitter.
// - Rate limiting por ventana deslizante.
// - Paginación por cursor.
// - Field mask para reducir costo y latencia.
//
// IMPORTANTE:
// Google Places prohíbe almacenar contenido de Places más allá
// de excepciones permitidas. Este servicio cachea únicamente
// place_id y metadatos técnicos de control; la caché de respuesta
// está desactivada por defecto y debe habilitarse solo tras revisar
// los términos vigentes de Google Maps Platform.
//
// VARIABLES DE ENTORNO:
// GOOGLE_MAPS_API_KEY
//
// ENDPOINTS:
// GET /salud
// GET /buscar?q=Cholula
// GET /buscar?q=restaurantes%20romanticos&max=10
// GET /buscar?q=hoteles&lat=19.0414&lng=-98.2063&radio=10000
// GET /buscar?q=museos&orden=distancia&cursor=...
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

    MAX_CURSOR_AGE_MS: 10 * 60 * 1000,

    // Concurrencia máxima hacia Google por instancia.
    MAX_UPSTREAM_CONCURRENCY: 20,

    // Cola máxima esperando un slot upstream.
    MAX_QUEUE_WAIT_MS: 5000,

    REQUEST_TIMEOUT_MS: 8000,
    MAX_RETRIES: 2,
    RETRY_BASE_DELAY_MS: 300,
    RETRY_MAX_DELAY_MS: 2000,

    CIRCUIT_FAILURE_THRESHOLD: 8,
    CIRCUIT_OPEN_MS: 30000,
    CIRCUIT_HALF_OPEN_MAX: 3,

    // Caché de place IDs: place_id es una excepción permitida por Google.
    PLACE_ID_CACHE_MAX: 250000,
    PLACE_ID_CACHE_TTL_MS: 24 * 60 * 60 * 1000,

    // Caché de respuesta: DESACTIVADA por defecto por políticas de Google.
    RESPONSE_CACHE_ENABLED: false,
    RESPONSE_CACHE_MAX: 20000,
    RESPONSE_CACHE_TTL_MS: 30000,

    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_ANONYMOUS_MAX: 30,
    RATE_LIMIT_AUTHENTICATED_MAX: 120,
    RATE_LIMIT_CLEANUP_BATCH: 256,

    UPSTREAM_HARD_LIMIT_PER_MINUTE: 900,

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
        DISTANCE_25KM: 6,
        DISTANCE_OVER_25KM: 0
    })
});

// ================================================================
// MÉTRICAS
// ================================================================

const metrics = {
    startedAt: new Date().toISOString(),

    searches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    singleFlightHits: 0,
    upstreamRequests: 0,
    upstreamErrors: 0,
    upstreamTimeouts: 0,
    rateLimited: 0,
    circuitOpenRejections: 0,
    concurrencyQueueRejections: 0,

    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,

    lastError: null
};

const latencySamples = [];
const LATENCY_SAMPLE_MAX = 5000;

function recordLatency(ms) {
    latencySamples.push(ms);

    if (latencySamples.length > LATENCY_SAMPLE_MAX) {
        latencySamples.shift();
    }

    const sorted = [...latencySamples].sort((a, b) => a - b);

    const percentile = (p) => {
        if (!sorted.length) return 0;
        const index = Math.min(
            sorted.length - 1,
            Math.floor((p / 100) * sorted.length)
        );

        return sorted[index];
    };

    metrics.p50LatencyMs = percentile(50);
    metrics.p95LatencyMs = percentile(95);
    metrics.p99LatencyMs = percentile(99);
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
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

function getClientIp(req) {
    return (
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

function haversineMeters(lat1, lng1, lat2, lng2) {
    const EARTH_RADIUS = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;

    return Math.round(
        EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    );
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashString(value) {
    return crypto
        .createHash('sha256')
        .update(String(value))
        .digest('hex')
        .slice(0, 32);
}

function safeJson(res, status, payload) {
    return res.status(status).json(payload);
}

// ================================================================
// LRU + TTL
// ================================================================

class LruTtlCache {
    constructor({ maxSize, defaultTtlMs }) {
        this.maxSize = maxSize;
        this.defaultTtlMs = defaultTtlMs;
        this.map = new Map();
        this.cleanedAt = Date.now();
    }

    get(key) {
        const entry = this.map.get(key);

        if (!entry) return undefined;

        if (entry.expiresAt <= Date.now()) {
            this.map.delete(key);
            return undefined;
        }

        // Refresca posición LRU.
        this.map.delete(key);
        this.map.set(key, entry);

        return entry.value;
    }

    set(key, value, ttlMs = this.defaultTtlMs) {
        if (this.map.has(key)) {
            this.map.delete(key);
        }

        this.map.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        });

        this.evictIfNeeded();
        this.incrementalCleanup();
    }

    has(key) {
        return this.get(key) !== undefined;
    }

    delete(key) {
        this.map.delete(key);
    }

    get size() {
        return this.map.size;
    }

    evictIfNeeded() {
        while (this.map.size > this.maxSize) {
            const oldestKey = this.map.keys().next().value;

            if (!oldestKey) break;

            this.map.delete(oldestKey);
        }
    }

    incrementalCleanup() {
        const now = Date.now();

        // Evita escaneos completos constantes.
        if (now - this.cleanedAt < 5000) return;

        this.cleanedAt = now;

        let inspected = 0;
        const maxInspections = 512;

        for (const [key, entry] of this.map) {
            if (entry.expiresAt <= now) {
                this.map.delete(key);
            }

            inspected++;

            if (inspected >= maxInspections) break;
        }
    }
}

// ================================================================
// CACHÉS
// ================================================================

// Cache permitido: place_id y metadatos de control.
const placeIdCache = new LruTtlCache({
    maxSize: CONFIG.PLACE_ID_CACHE_MAX,
    defaultTtlMs: CONFIG.PLACE_ID_CACHE_TTL_MS
});

// Caché opcional de respuesta. NO habilitar sin validación legal.
const responseCache = new LruTtlCache({
    maxSize: CONFIG.RESPONSE_CACHE_MAX,
    defaultTtlMs: CONFIG.RESPONSE_CACHE_TTL_MS
});

// Single-flight: evita llamadas duplicadas simultáneas.
const singleFlight = new Map();

// ================================================================
// RATE LIMITER · VENTANA DESLIZANTE
// ================================================================

const rateLimitStore = new Map();

function rateLimitFor(req) {
    const authenticated = Boolean(
        req.headers.authorization || req.headers['x-api-key']
    );

    return {
        limit: authenticated
            ? CONFIG.RATE_LIMIT_AUTHENTICATED_MAX
            : CONFIG.RATE_LIMIT_ANONYMOUS_MAX,
        windowMs: CONFIG.RATE_LIMIT_WINDOW_MS
    };
}

function rateLimiter(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    const { limit, windowMs } = rateLimitFor(req);

    let entry = rateLimitStore.get(ip);

    if (!entry) {
        entry = {
            hits: []
        };
    }

    // Ventana deslizante.
    entry.hits = entry.hits.filter((time) => now - time < windowMs);

    if (entry.hits.length >= limit) {
        metrics.rateLimited++;

        const oldest = entry.hits[0];
        const retryAfter = Math.max(
            1,
            Math.ceil((windowMs - (now - oldest)) / 1000)
        );

        res.setHeader('RateLimit-Limit', limit);
        res.setHeader('RateLimit-Remaining', 0);
        res.setHeader('RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
        res.setHeader('Retry-After', retryAfter);

        return safeJson(res, 429, {
            error: 'TOO_MANY_REQUESTS',
            message: 'Has alcanzado el límite temporal de búsquedas.',
            retryAfterSeconds: retryAfter
        });
    }

    entry.hits.push(now);
    rateLimitStore.set(ip, entry);

    // Limpieza incremental para evitar bloqueos bajo alto tráfico.
    if (rateLimitStore.size > CONFIG.RATE_LIMIT_CLEANUP_BATCH * 8) {
        let cleaned = 0;

        for (const [key, value] of rateLimitStore) {
            const active = value.hits.some(
                (time) => now - time < windowMs
            );

            if (!active) {
                rateLimitStore.delete(key);
                cleaned++;
            }

            if (cleaned >= CONFIG.RATE_LIMIT_CLEANUP_BATCH) break;
        }
    }

    res.setHeader('RateLimit-Limit', limit);
    res.setHeader(
        'RateLimit-Remaining',
        Math.max(0, limit - entry.hits.length)
    );
    res.setHeader(
        'RateLimit-Reset',
        Math.ceil((now + windowMs) / 1000)
    );

    return next();
}

// ================================================================
// SEMÁFORO DE CONCURRENCIA
// ================================================================

class Semaphore {
    constructor(max) {
        this.max = max;
        this.active = 0;
        this.queue = [];
    }

    async acquire(waitMs = CONFIG.MAX_QUEUE_WAIT_MS) {
        if (this.active < this.max) {
            this.active++;
            return;
        }

        const canWait = waitMs > 0;

        if (!canWait) {
            const error = new Error('CONCURRENCY_LIMIT');
            error.code = 'CONCURRENCY_LIMIT';
            throw error;
        }

        const startedAt = Date.now();

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const index = this.queue.indexOf(entry);

                if (index !== -1) {
                    this.queue.splice(index, 1);
                }

                const error = new Error('CONCURRENCY_TIMEOUT');
                error.code = 'CONCURRENCY_TIMEOUT';
                reject(error);
            }, waitMs);

            const entry = {
                resolve: () => {
                    clearTimeout(timer);
                    this.active++;
                    resolve();
                },
                reject
            };

            this.queue.push(entry);
        });
    }

    release() {
        this.active = Math.max(0, this.active - 1);

        const next = this.queue.shift();

        if (next) {
            next.resolve();
        }
    }
}

const upstreamSemaphore = new Semaphore(CONFIG.MAX_UPSTREAM_CONCURRENCY);

// ================================================================
// CIRCUIT BREAKER
// ================================================================

const circuit = {
    state: 'CLOSED', // CLOSED | OPEN | HALF_OPEN
    failures: 0,
    openedAt: 0,
    halfOpenAttempts: 0
};

function circuitAllowsRequest() {
    const now = Date.now();

    if (circuit.state === 'CLOSED') return true;

    if (circuit.state === 'OPEN') {
        if (now - circuit.openedAt >= CONFIG.CIRCUIT_OPEN_MS) {
            circuit.state = 'HALF_OPEN';
            circuit.halfOpenAttempts = 0;
            return true;
        }

        return false;
    }

    if (circuit.state === 'HALF_OPEN') {
        return circuit.halfOpenAttempts < CONFIG.CIRCUIT_HALF_OPEN_MAX;
    }

    return false;
}

function circuitRegisterAttempt() {
    if (circuit.state === 'HALF_OPEN') {
        circuit.halfOpenAttempts++;
    }
}

function circuitRegisterSuccess() {
    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.halfOpenAttempts = 0;
}

function circuitRegisterFailure() {
    circuit.failures++;

    if (
        circuit.state === 'HALF_OPEN' ||
        circuit.failures >= CONFIG.CIRCUIT_FAILURE_THRESHOLD
    ) {
        circuit.state = 'OPEN';
        circuit.openedAt = Date.now();
        circuit.halfOpenAttempts = 0;
    }
}

// ================================================================
// MOTOR DE INTENCIÓN
// ================================================================

const INTENTS = Object.freeze({
    nature: {
        keywords: [
            'cascada', 'cascadas', 'montana', 'montanas', 'bosque',
            'laguna', 'lago', 'playa', 'parque', 'senderismo',
            'naturaleza', 'cueva', 'gruta', 'volcan'
        ],
        includedTypes: ['park', 'natural_feature', 'hiking_area']
    },

    food: {
        keywords: [
            'comer', 'comida', 'restaurante', 'restaurantes', 'desayuno',
            'comida tipica', 'antojitos', 'tacos', 'cafe', 'cafeteria',
            'postres', 'bar', 'cantina'
        ],
        includedTypes: ['restaurant', 'cafe', 'bakery']
    },

    lodging: {
        keywords: [
            'hotel', 'hoteles', 'hospedaje', 'hostal', 'hostales',
            'resort', 'alojamiento', 'donde dormir'
        ],
        includedTypes: ['hotel', 'lodging', 'resort']
    },

    culture: {
        keywords: [
            'museo', 'museos', 'cultura', 'historia', 'iglesia',
            'templo', 'zona arqueologica', 'piramide', 'monumento',
            'galeria', 'arte'
        ],
        includedTypes: [
            'museum', 'art_gallery', 'church', 'historical_landmark'
        ]
    },

    entertainment: {
        keywords: [
            'diversion', 'entretenimiento', 'parque de diversiones',
            'cine', 'zoo', 'acuario', 'boliche', 'actividades', 'familia'
        ],
        includedTypes: [
            'amusement_park', 'aquarium', 'zoo', 'movie_theater'
        ]
    },

    shopping: {
        keywords: [
            'compras', 'tiendas', 'mercado', 'mercados', 'souvenirs',
            'artesanias', 'centro comercial'
        ],
        includedTypes: ['shopping_mall', 'store']
    },

    adventure: {
        keywords: [
            'aventura', 'senderismo', 'camping', 'rappel',
            'cicloturismo', 'excursion', 'tour', 'tours'
        ],
        includedTypes: ['campground', 'hiking_area', 'tourist_attraction']
    }
});

function detectIntent(normalizedQuery) {
    for (const [intent, definition] of Object.entries(INTENTS)) {
        const matched = definition.keywords.some((keyword) =>
            normalizedQuery.includes(keyword)
        );

        if (matched) {
            return {
                intent,
                includedTypes: definition.includedTypes
            };
        }
    }

    return {
        intent: 'general',
        includedTypes: []
    };
}

// ================================================================
// CATEGORÍAS Y TRADUCCIONES
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
    aquarium: 'Aquarium',
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
    'tourist_attraction',
    'museum',
    'park',
    'natural_feature',
    'amusement_park',
    'aquarium',
    'zoo',
    'art_gallery',
    'church',
    'historical_landmark',
    'national_park',
    'hiking_area'
]);

function translateType(type) {
    return TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

function getPrimaryCategory(types = []) {
    const priority = [
        'tourist_attraction',
        'museum',
        'historical_landmark',
        'natural_feature',
        'national_park',
        'hiking_area',
        'amusement_park',
        'aquarium',
        'zoo',
        'park',
        'hotel',
        'lodging',
        'restaurant',
        'cafe',
        'bakery',
        'art_gallery',
        'church',
        'shopping_mall',
        'movie_theater',
        'store'
    ];

    for (const type of priority) {
        if (types.includes(type)) {
            return translateType(type);
        }
    }

    return types.length ? translateType(types[0]) : 'Lugar';
}

// ================================================================
// RANKING
// ================================================================

function calculateTourismScore(place, normalizedQuery, origin) {
    const weights = CONFIG.SCORING;

    let score = 0;

    const name = normalizeText(place.displayName?.text || '');
    const address = normalizeText(place.formattedAddress || '');

    const rating = place.rating || 0;
    const reviews = place.userRatingCount || 0;
    const types = place.types || [];

    if (name && normalizedQuery) {
        if (name.includes(normalizedQuery)) {
            score += weights.EXACT_NAME_MATCH;
        } else {
            const words = normalizedQuery.split(' ').filter(
                (word) => word.length > 2
            );

            const matches = words.filter((word) =>
                name.includes(word)
            ).length;

            score += matches * weights.WORD_MATCH;
        }
    }

    if (address && normalizedQuery && address.includes(normalizedQuery)) {
        score += weights.ADDRESS_MATCH;
    }

    if (rating > 0) {
        score += rating * weights.RATING_WEIGHT;
    }

    score += Math.min(
        reviews * weights.REVIEW_WEIGHT,
        weights.MAX_REVIEW_BOOST
    );

    for (const type of types) {
        if (HIGH_VALUE_TYPES.has(type)) {
            score += weights.HIGH_VALUE_TYPE;
        }
    }

    if (place.businessStatus === 'OPERATIONAL') {
        score += weights.OPERATIONAL_BONUS;
    } else if (place.businessStatus) {
        score -= weights.CLOSED_PENALTY;
    }

    if (origin && place.location) {
        const distance = haversineMeters(
            origin.lat,
            origin.lng,
            place.location.latitude,
            place.location.longitude
        );

        place._distanceMeters = distance;

        if (distance <= 1000) {
            score += weights.DISTANCE_1KM;
        } else if (distance <= 3000) {
            score += weights.DISTANCE_3KM;
        } else if (distance <= 5000) {
            score += weights.DISTANCE_5KM;
        } else if (distance <= 10000) {
            score += weights.DISTANCE_10KM;
        } else if (distance <= 25000) {
            score += weights.DISTANCE_25KM;
        }
    }

    return Math.round(score);
}

// ================================================================
// TRANSFORMACIÓN
// ================================================================

function transformPlace(place, normalizedQuery, origin) {
    const location = place.location || null;
    const types = place.types || [];

    const distance =
        origin && location
            ? haversineMeters(
                origin.lat,
                origin.lng,
                location.latitude,
                location.longitude
            )
            : null;

    const placeId = place.id || null;

    const photos = (place.photos || [])
        .slice(0, 5)
        .map((photo) => ({
            name: photo.name || null,
            width: photo.widthPx || null,
            height: photo.heightPx || null,
            authorAttributions: photo.authorAttributions || []
        }));

    return {
        placeId,

        name: place.displayName?.text || 'Lugar sin nombre',

        address: place.formattedAddress || '',

        location: location
            ? {
                lat: location.latitude,
                lng: location.longitude
            }
            : null,

        category: getPrimaryCategory(types),

        types,

        typeLabels: types.map(translateType),

        rating: place.rating || null,

        reviewCount: place.userRatingCount || 0,

        priceLevel: place.priceLevel || null,

        openNow: place.currentOpeningHours?.openNow ?? null,

        businessStatus: place.businessStatus || 'UNKNOWN',

        photos,

        distanceMeters: distance,

        mapUrl: placeId
            ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`
            : null,

        score: calculateTourismScore(place, normalizedQuery, origin)
    };
}

// ================================================================
// CONSULTA
// ================================================================

function buildQuery(req) {
    const rawQuery = String(req.query.q || '').trim();
    const normalizedQuery = normalizeText(rawQuery);

    const intent = detectIntent(normalizedQuery);

    let requestedType = normalizeText(req.query.tipo || '');
    const includedTypes = requestedType
        ? [requestedType]
        : intent.includedTypes;

    const lat = req.query.lat !== undefined
        ? toFloat(req.query.lat, NaN)
        : NaN;

    const lng = req.query.lng !== undefined
        ? toFloat(req.query.lng, NaN)
        : NaN;

    const hasLocation = isValidCoordinate(lat, lng);

    const radius = toInt(
        req.query.radio,
        CONFIG.DEFAULT_RADIUS_METERS,
        100,
        CONFIG.MAX_RADIUS_METERS
    );

    const pageSize = toInt(
        req.query.max,
        CONFIG.DEFAULT_PAGE_SIZE,
        1,
        CONFIG.MAX_PAGE_SIZE
    );

    const minRating = toFloat(req.query.rating, 0);

    const priceLevels = String(req.query.precio || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 4);

    const openNow = String(req.query.abierto || '').toLowerCase() === 'true';

    const sort = normalizeText(req.query.orden || 'relevancia');

    const cursor = req.query.cursor || null;

    return {
        rawQuery,
        normalizedQuery,
        includedTypes,
        intent: intent.intent,

        lat: hasLocation ? lat : null,
        lng: hasLocation ? lng : null,
        hasLocation,

        radius,
        pageSize,
        minRating,
        priceLevels,
        openNow,
        sort,
        cursor
    };
}

function buildCacheKey(query) {
    return hashString([
        query.normalizedQuery,
        query.includedTypes.join(','),
        query.lat ?? '',
        query.lng ?? '',
        query.radius,
        query.pageSize,
        query.minRating,
        query.priceLevels.join(','),
        query.openNow,
        query.sort,
        query.cursor || ''
    ].join('|'));
}

// ================================================================
// PLACES API (NEW)
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
        maxResultCount: Math.min(query.pageSize, 20)
    };

    if (query.includedTypes.length) {
        payload.includedType = query.includedTypes[0];
    }

    if (query.hasLocation) {
        payload.locationBias = {
            circle: {
                center: {
                    latitude: query.lat,
                    longitude: query.lng
                },
                radius: query.radius
            }
        };
    }

    if (pageToken) {
        payload.pageToken = pageToken;
    }

    return payload;
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

    await upstreamSemaphore.acquire();

    try {
        circuitRegisterAttempt();

        let lastError = null;

        for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
            const controller = new AbortController();

            const timeout = setTimeout(() => {
                controller.abort();
            }, CONFIG.REQUEST_TIMEOUT_MS);

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

                    body: JSON.stringify(
                        buildPlacesPayload(query, pageToken)
                    )
                });

                if (!response.ok) {
                    const error = new Error(
                        `GOOGLE_HTTP_${response.status}`
                    );

                    error.code = `GOOGLE_HTTP_${response.status}`;
                    error.retryable = response.status >= 500;
                    throw error;
                }

                const data = await response.json();

                if (data.error) {
                    const error = new Error(
                        data.error.message || 'GOOGLE_API_ERROR'
                    );

                    error.code = data.error.status || 'GOOGLE_API_ERROR';
                    error.retryable = [
                        'UNAVAILABLE',
                        'DEADLINE_EXCEEDED',
                        'RESOURCE_EXHAUSTED'
                    ].includes(error.code);

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

                const retryable =
                    error.retryable === true ||
                    error.name === 'AbortError';

                if (!retryable || attempt === CONFIG.MAX_RETRIES) {
                    break;
                }

                const exponential =
                    CONFIG.RETRY_BASE_DELAY_MS * 2 ** attempt;

                const jitter = Math.random() * exponential * 0.3;

                await sleep(
                    Math.min(
                        CONFIG.RETRY_MAX_DELAY_MS,
                        exponential + jitter
                    )
                );
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
// FILTROS Y ORDEN
// ================================================================

function applyFilters(places, query) {
    let filtered = places;

    if (query.minRating > 0) {
        filtered = filtered.filter(
            (place) => (place.rating || 0) >= query.minRating
        );
    }

    if (query.priceLevels.length) {
        filtered = filtered.filter(
            (place) =>
                !place.priceLevel ||
                query.priceLevels.includes(place.priceLevel)
        );
    }

    if (query.openNow) {
        filtered = filtered.filter(
            (place) => place.openNow === true
        );
    }

    return filtered;
}

function sortPlaces(places, sort) {
    const sorted = [...places];

    if (sort === 'distancia') {
        sorted.sort((a, b) => {
            const distanceA = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
            const distanceB = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;

            return distanceA - distanceB;
        });

        return sorted;
    }

    if (sort === 'rating') {
        sorted.sort((a, b) => {
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;

            if (ratingB !== ratingA) return ratingB - ratingA;

            return b.reviewCount - a.reviewCount;
        });

        return sorted;
    }

    if (sort === 'populares') {
        sorted.sort((a, b) => b.reviewCount - a.reviewCount);

        return sorted;
    }

    sorted.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }

        // Desempate estable.
        return String(a.placeId).localeCompare(String(b.placeId));
    });

    return sorted;
}

// ================================================================
// CURSOR
// ================================================================

function encodeCursor(nextPageToken) {
    if (!nextPageToken) return null;

    return Buffer.from(
        JSON.stringify({
            t: nextPageToken,
            e: Date.now() + CONFIG.MAX_CURSOR_AGE_MS
        })
    ).toString('base64url');
}

function decodeCursor(cursor) {
    if (!cursor) return null;

    try {
        const decoded = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8')
        );

        if (!decoded?.t || decoded.e < Date.now()) {
            return null;
        }

        return decoded.t;
    } catch {
        return null;
    }
}

// ================================================================
// ORQUESTACIÓN
// ================================================================

async function executeSearch(query) {
    const cacheKey = buildCacheKey(query);

    // Caché de respuesta opcional.
    if (CONFIG.RESPONSE_CACHE_ENABLED) {
        const cached = responseCache.get(cacheKey);

        if (cached) {
            metrics.cacheHits++;
            return {
                ...cached,
                meta: {
                    ...cached.meta,
                    cache: 'HIT'
                }
            };
        }
    }

    metrics.cacheMisses++;

    // Single-flight: evita llamar Google N veces por la misma consulta.
    if (singleFlight.has(cacheKey)) {
        metrics.singleFlightHits++;

        return singleFlight.get(cacheKey);
    }

    const execution = (async () => {
        const pageToken = decodeCursor(query.cursor);

        const data = await callGooglePlaces(query, pageToken);

        const origin = query.hasLocation
            ? { lat: query.lat, lng: query.lng }
            : null;

        let places = (data.places || []).map((place) =>
            transformPlace(place, query.normalizedQuery, origin)
        );

        places = applyFilters(places, query);
        places = sortPlaces(places, query.sort);
        places = places.slice(0, query.pageSize);

        // Cache permitido: place_id.
        for (const place of places) {
            if (place.placeId) {
                placeIdCache.set(place.placeId, {
                    cachedAt: Date.now()
                });
            }
        }

        const nextCursor = encodeCursor(data.nextPageToken);

        const response = {
            results: places,

            meta: {
                total: places.length,

                query: query.rawQuery,

                detectedIntent: query.intent,

                appliedTypes: query.includedTypes,

                sort: query.sort,

                provider: 'Google Places API (New)',

                version: '4.0',

                timestamp: new Date().toISOString(),

                locationApplied: query.hasLocation,

                radiusMeters: query.hasLocation ? query.radius : null,

                filters: {
                    minRating: query.minRating || null,
                    priceLevels: query.priceLevels.length
                        ? query.priceLevels
                        : null,
                    openNow: query.openNow
                },

                pagination: {
                    hasNextPage: Boolean(nextCursor),
                    nextCursor
                },

                cache: CONFIG.RESPONSE_CACHE_ENABLED ? 'MISS' : 'DISABLED'
            }
        };

        if (CONFIG.RESPONSE_CACHE_ENABLED) {
            responseCache.set(cacheKey, response);
        }

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
// ENDPOINT DE SALUD
// ================================================================

router.get('/salud', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Csariel’s Turismo · Smart Destination Engine',
        version: '4.0',

        circuit: {
            state: circuit.state,
            failures: circuit.failures
        },

        concurrency: {
            active: upstreamSemaphore.active,
            max: upstreamSemaphore.max,
            queued: upstreamSemaphore.queue.length
        },

        cache: {
            placeIds: placeIdCache.size,
            responseCacheEnabled: CONFIG.RESPONSE_CACHE_ENABLED,
            responseCacheEntries: responseCache.size
        },

        rateLimit: {
            trackedClients: rateLimitStore.size
        },

        metrics,

        timestamp: new Date().toISOString()
    });
});

// ================================================================
// ENDPOINT PRINCIPAL
// ================================================================

router.get('/buscar', rateLimiter, async (req, res) => {
    const startedAt = Date.now();

    try {
        metrics.searches++;

        const rawQuery = String(req.query.q || '').trim();

        if (rawQuery.length < CONFIG.MIN_QUERY_LENGTH) {
            return safeJson(res, 400, {
                error: 'QUERY_TOO_SHORT',
                message: `Escribe al menos ${CONFIG.MIN_QUERY_LENGTH} caracteres.`
            });
        }

        if (rawQuery.length > CONFIG.MAX_QUERY_LENGTH) {
            return safeJson(res, 400, {
                error: 'QUERY_TOO_LONG',
                message: `La consulta no puede superar ${CONFIG.MAX_QUERY_LENGTH} caracteres.`
            });
        }

        const query = buildQuery(req);

        const response = await executeSearch(query);

        recordLatency(Date.now() - startedAt);

        return res.json(response);
    } catch (error) {
        recordLatency(Date.now() - startedAt);

        metrics.lastError = {
            code: error.code || error.name || 'UNKNOWN',
            message: error.message,
            timestamp: new Date().toISOString()
        };

        if (error.code === 'CONCURRENCY_LIMIT') {
            metrics.concurrencyQueueRejections++;

            return safeJson(res, 503, {
                error: 'SERVICE_BUSY',
                message: 'El motor está procesando muchas búsquedas. Intenta nuevamente en unos segundos.'
            });
        }

        if (error.code === 'CONCURRENCY_TIMEOUT') {
            return safeJson(res, 503, {
                error: 'SERVICE_BUSY',
                message: 'El servicio está saturado temporalmente. Intenta nuevamente.'
            });
        }

        if (error.code === 'CIRCUIT_OPEN') {
            return safeJson(res, 503, {
                error: 'UPSTREAM_PROTECTED',
                message: 'El servicio está protegiendo el sistema ante alto volumen. Intenta en unos segundos.'
            });
        }

        if (error.code === 'UPSTREAM_TIMEOUT') {
            return safeJson(res, 504, {
                error: 'UPSTREAM_TIMEOUT',
                message: 'La búsqueda tardó demasiado. Intenta nuevamente.'
            });
        }

        if (error.code === 'RESOURCE_EXHAUSTED') {
            return safeJson(res, 429, {
                error: 'PROVIDER_QUOTA',
                message: 'El proveedor de mapas alcanzó temporalmente su límite.'
            });
        }

        if (error.code === 'PERMISSION_DENIED') {
            return safeJson(res, 502, {
                error: 'PROVIDER_UNAUTHORIZED',
                message: 'Revisa la configuración de Google Maps Platform.'
            });
        }

        if (error.code === 'INVALID_ARGUMENT') {
            return safeJson(res, 400, {
                error: 'INVALID_QUERY',
                message: 'No fue posible interpretar la búsqueda.'
            });
        }

        if (error.code === 'MISSING_GOOGLE_MAPS_API_KEY') {
            return safeJson(res, 500, {
                error: 'MAP_PROVIDER_NOT_CONFIGURED',
                message: 'El servicio de mapas no está configurado.'
            });
        }

        console.error('[Csariel’s Turismo]', error);

        return safeJson(res, 500, {
            error: 'INTERNAL_ERROR',
            message: 'No fue posible completar la búsqueda turística.'
        });
    }
});

// ================================================================
// EXPORTACIÓN
// ================================================================

module.exports = router;