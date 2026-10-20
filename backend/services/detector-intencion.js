// ================================================================
// backend/services/detector-intencion.js
// ================================================================
// Decide si un mensaje necesita internet.
//
// Solo regex: sin llamadas externas, sin latencia.
//
// Devuelve { tipo: 'ninguna' | 'simple' | 'complejo', motivo }.
// El motivo no contiene el texto del usuario.
//
// v2.2: ajustes finos en DATOS_VIVOS (quita "clima" suelto,
//       "polygon", "ultima hora" y "lo nuevo"), RE_VS_Y (sin
//       "contra") y COMPLEJO (sin "que paso").
// ================================================================

'use strict';

const MAX_LARGO = 500;

function quitarAcentos(t) {
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizar(texto) {
    return quitarAcentos(String(texto || '').slice(0, MAX_LARGO))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function construirPatron(palabras) {
    const alternativas = palabras.map((p) =>
        quitarAcentos(p).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return new RegExp(`\\b(?:${alternativas.join('|')})\\b`);
}

// Temas que cambian con el tiempo: siempre requieren búsqueda
const DATOS_VIVOS = construirPatron([
    // 💰 Cripto / finanzas
    'precio', 'cotizacion', 'cuanto vale', 'cuanto cuesta', 'tipo de cambio',
    'bolsa', 'dolar', 'bitcoin', 'btc', 'ethereum',
    'usdt', 'usdc', 'cripto', 'criptomoneda',
    'inflacion', 'tasa de interes', 'gasolina',

    // 🌤️ Clima
    'pronostico', 'clima en', 'pronostico en', 'temperatura',

    // 📰 Noticias
    'noticia', 'noticias',

    // 🏆 Deportes
    'marcador', 'partido', 'torneo',

    // 🗳️ Política / eventos
    'elecciones',

    // 🌋 Desastres
    'sismo', 'temblor', 'huracan',

    // 🆕 Actualidad / mundo real
    'actualidad', 'mundo real', 'en vivo', 'en directo',
    'novedades', 'lo ultimo', 'que hay de nuevo',
    'informacion actual', 'breaking',
    'por estos dias', 'lo que pasa en el mundo', 'como esta el mundo'
]);

// Señales temporales fuertes: bastan por sí solas
const TEMPORAL_FUERTE = construirPatron([
    'en vivo', 'ultima hora', 'ultimas noticias', 'esta semana', 'este mes',
    'actualmente'
]);

// Señales temporales débiles: solo cuentan si además hay una pregunta compleja
const TEMPORAL_DEBIL = construirPatron(['hoy', 'ahora mismo']);

// Pide análisis o explicación de un hecho
const COMPLEJO = construirPatron([
    'por que', 'que esta pasando', 'compara', 'comparar',
    'comparacion', 'diferencia entre', 'versus',
    'analisis', 'analiza', 'consecuencias', 'tendencia',
    'pros y contras', 'ventajas y desventajas'
]);

// Regex específicas para "x vs y" y años solo con contexto temporal
const RE_VS_Y = /\b[a-z0-9]+\s+(?:vs|versus)\s+[a-z0-9]+\b/;
const RE_ANIO_CONTEXTO = /\b(?:en|del|para|hasta)\s+(?:2025|2026)\b/;

// Palabras sensibles al tiempo que solo cuentan con contexto temporal
const RE_PALABRAS_TIEMPO_SENSIBLES =
    /\b(?:resultado|presidente|politica)\b.*\b(?:hoy|ayer|ultimo|actual|en 2025|en 2026)\b/;

function detectarIntencion(mensaje) {
    const t = normalizar(mensaje);
    if (t.length < 3) return { tipo: 'ninguna', motivo: 'mensaje_corto' };

    // Complejo: por palabras clave o por patrones específicos
    const esComplejo = COMPLEJO.test(t) ||
        RE_VS_Y.test(t);

    // Datos vivos: por palabras clave o por patrones de tiempo sensibles
    let datos = DATOS_VIVOS.test(t) || RE_PALABRAS_TIEMPO_SENSIBLES.test(t);

    // Temporal: fuerte (incluye años con contexto) o débil + complejo
    const temporal = TEMPORAL_FUERTE.test(t) ||
        RE_ANIO_CONTEXTO.test(t) ||
        (TEMPORAL_DEBIL.test(t) && esComplejo);

    if (!datos && !temporal) {
        return { tipo: 'ninguna', motivo: 'sin_senal_en_vivo' };
    }

    return {
        tipo: esComplejo ? 'complejo' : 'simple',
        motivo: datos ? 'datos_vivos' : 'temporal'
    };
}

module.exports = { detectarIntencion, normalizarMensaje: normalizar };