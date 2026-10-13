// ================================================================
// RUTAS GEO — Csariel's
//   POST /api/geo/ubicacion → convierte coordenadas en ciudad (Google)
//                              y guarda la ubicación del usuario.
// La clave GOOGLE_MAPS_API_KEY vive SOLO en el servidor (Railway).
// Privacidad: si la precisión es "aproximada", las coordenadas se
// redondean a ~1 km ANTES de salir del servidor hacia Google.
// ================================================================

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const CACHE_MAX = 500;
const LIMITE_POR_MINUTO = 10;

const cacheDirecciones = new Map();   // "lat,lng" → { t, v }
const conteoPorUsuario = new Map();   // uid → { inicio, n }

function redondear(valor, decimales) {
    const f = Math.pow(10, decimales);
    return Math.round(valor * f) / f;
}

// Límite simple por usuario: 10 consultas por minuto
function dentroDelLimite(uid) {
    const ahora = Date.now();
    if (conteoPorUsuario.size > 5000) conteoPorUsuario.clear();

    const r = conteoPorUsuario.get(uid);
    if (!r || ahora - r.inicio > 60000) {
        conteoPorUsuario.set(uid, { inicio: ahora, n: 1 });
        return true;
    }
    if (r.n >= LIMITE_POR_MINUTO) return false;
    r.n++;
    return true;
}

// Convierte coordenadas en ciudad/municipio/estado/país con Google
async function obtenerDireccion(lat, lng) {
    const clave = lat + ',' + lng;

    const enCache = cacheDirecciones.get(clave);
    if (enCache && Date.now() - enCache.t < CACHE_TTL_MS) {
        return enCache.v;
    }

    const url = new URL(GEOCODE_URL);
    url.searchParams.set('latlng', clave);
    url.searchParams.set('language', 'es');
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 8000);
    let data;
    try {
        const respuesta = await fetch(url, { signal: controlador.signal });
        data = await respuesta.json();
    } finally {
        clearTimeout(timeout);
    }

    if (data.status === 'ZERO_RESULTS') {
        return { ciudad: null, municipio: null, estado_region: null, pais: null };
    }
    if (data.status !== 'OK' || !Array.isArray(data.results)) {
        throw new Error('geocode_' + (data.status || 'desconocido'));
    }

    const componentes = data.results.flatMap((r) => r.address_components || []);
    const buscar = (tipo) => {
        const c = componentes.find((x) => Array.isArray(x.types) && x.types.includes(tipo));
        return c ? c.long_name : null;
    };

    const v = {
        ciudad: buscar('locality') || buscar('sublocality') || buscar('administrative_area_level_3'),
        municipio: buscar('administrative_area_level_2'),
        estado_region: buscar('administrative_area_level_1'),
        pais: buscar('country')
    };

    if (cacheDirecciones.size >= CACHE_MAX) {
        cacheDirecciones.delete(cacheDirecciones.keys().next().value);
    }
    cacheDirecciones.set(clave, { t: Date.now(), v });
    return v;
}

// ================================================================
// POST /ubicacion
// Body: { lat, lng, precision: 'exacta' | 'aproximada', guardar_historial: boolean }
// ================================================================
router.post('/ubicacion', verificarToken, async (req, res) => {
    try {
        if (!GOOGLE_MAPS_API_KEY) {
            logger.error('[Geo] GOOGLE_MAPS_API_KEY no configurada');
            return res.status(500).json({ success: false, error: 'geo_no_configurado' });
        }

        const uid = req.usuario.id;
        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);
        const precision = req.body?.precision === 'exacta' ? 'exacta' : 'aproximada';
        const guardarHistorial = req.body?.guardar_historial !== false;

        if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ success: false, error: 'coordenadas_invalidas' });
        }

        if (!dentroDelLimite(uid)) {
            return res.status(429).json({ success: false, error: 'demasiadas_solicitudes' });
        }

        // Aproximada: ~1 km (2 decimales). Exacta: ~1 m (5 decimales).
        const decimales = precision === 'exacta' ? 5 : 2;
        const latG = redondear(lat, decimales);
        const lngG = redondear(lng, decimales);

        let dir = { ciudad: null, municipio: null, estado_region: null, pais: null };
        let aviso = null;
        try {
            dir = await obtenerDireccion(latG, lngG);
        } catch (e) {
            // Se guardan las coordenadas aunque Google falle
            logger.warn('[Geo] No se pudo obtener dirección: ' + e.message);
            aviso = 'sin_direccion';
        }

        // Si el usuario apagó el historial, solo conserva la última ubicación
        if (!guardarHistorial) {
            await supabaseAdmin.from('usuarios_ubicaciones').delete().eq('usuario_id', uid);
        }

        const { data, error } = await supabaseAdmin
            .from('usuarios_ubicaciones')
            .insert({
                usuario_id: uid,
                latitud: latG,
                longitud: lngG,
                precision: precision,
                ciudad: dir.ciudad,
                municipio: dir.municipio,
                estado_region: dir.estado_region,
                pais: dir.pais || 'Desconocido',
                fuente: 'navegador'
            })
            .select()
            .single();

        if (error) {
            logger.error('[Geo] insert: ' + error.message);
            return res.status(500).json({ success: false, error: 'db' });
        }

        return res.json({
            success: true,
            aviso,
            ubicacion: {
                id: data.id,
                latitud: data.latitud,
                longitud: data.longitud,
                ciudad: data.ciudad,
                municipio: data.municipio,
                estado_region: data.estado_region,
                pais: data.pais,
                precision: data.precision,
                created_at: data.created_at
            }
        });
    } catch (e) {
        logger.error('[Geo] ubicacion: ' + e.message);
        return res.status(500).json({ success: false, error: 'servidor' });
    }
});

module.exports = router;