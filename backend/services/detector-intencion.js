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
// v2.0: amplía DATOS_VIVOS para capturar mejor "mundo real",
//       "actualidad", "en vivo", "lo último", etc.
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
    'bolsa', 'dolar', 'bitcoin', 'btc', 'ethereum', 'eth', 'polygon', 'pol',
    'usdt', 'usdc', 'cripto', 'criptomoneda', 'inflacion', 'tasa de interes',
    'gasolina',

    // 🌤️ Clima
    'clima', 'pronostico', 'tiempo en', 'temperatura',

    // 📰 Noticias
    'noticia', 'noticias', 'ultima hora',

    // 🏆 Deportes
    'resultado', 'marcador', 'partido', 'torneo',

    // 🗳️ Política / eventos
    'elecciones', 'presidente', 'politica',

    // 🌋 Desastres
    'sismo', 'temblor', 'huracan',

    // 🆕 v2.0: actualidad / mundo real
    'actualidad', 'mundo real', 'en vivo', 'en directo',
    'novedades', 'lo ultimo', 'lo nuevo', 'que hay de nuevo',
    'que esta pasando', 'que pasa', 'que paso', 'actual', 'reciente',
    'informacion actual', 'breaking', 'hoy en dia', 'estos dias',
    'por estos dias', 'lo que pasa en el mundo', 'como esta el mundo',
    'que se dice', 'que se comenta', 'en el mundo'
]);

// Señales temporales fuertes: bastan por sí solas
const TEMPORAL_FUERTE = construirPatron([
    'en vivo', 'ultima hora', 'ultimas noticias', 'esta semana', 'este mes',
    'actualmente', '2025', '2026'
]);

// Señales temporales débiles: solo cuentan si además hay una pregunta compleja
const TEMPORAL_DEBIL = construirPatron(['hoy', 'ahora mismo']);

// Pide análisis o explicación de un hecho
const COMPLEJO = construirPatron([
    'por que', 'que paso', 'que pasa', 'que esta pasando', 'compara', 'comparar',
    'comparacion', 'diferencia entre', 'versus', 'vs', 'analisis', 'analiza',
    'impacto', 'consecuencias', 'tendencia', 'pros y contras',
    'ventajas y desventajas'
]);

function detectarIntencion(mensaje) {
    const t = normalizar(mensaje);
    if (t.length < 3) return { tipo: 'ninguna', motivo: 'mensaje_corto' };

    const esComplejo = COMPLEJO.test(t);
    const datos = DATOS_VIVOS.test(t);
    const temporal = TEMPORAL_FUERTE.test(t) ||
        (TEMPORAL_DEBIL.test(t) && esComplejo);

    if (!datos && !temporal) return { tipo: 'ninguna', motivo: 'sin_senal_en_vivo' };

    return {
        tipo: esComplejo ? 'complejo' : 'simple',
        motivo: datos ? 'datos_vivos' : 'temporal'
    };
}

module.exports = { detectarIntencion, normalizarMensaje: normalizar };