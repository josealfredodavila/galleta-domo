// ================================================================
// backend/services/web-search.js
// ================================================================
// Búsqueda rápida con Tavily.
//
// Contrato: buscar(consulta) -> { resultados, costoUsd }
// ================================================================

'use strict';

const TAVILY_URL = 'https://api.tavily.com/search';
const TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS || 3000);
const COSTO_POR_BUSQUEDA_USD = Number(process.env.TAVILY_COSTO_USD || 0.008);

function errorCon(codigo, mensaje) {
    const e = new Error(mensaje || codigo);
    e.codigo = codigo;
    return e;
}

function dominio(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

async function buscar(consulta) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw errorCon('sin_api_key', 'Falta TAVILY_API_KEY');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let res;
    try {
        res = await fetch(TAVILY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                query: consulta,
                search_depth: 'basic',
                max_results: 3,
                include_answer: false,
                include_raw_content: false
            }),
            signal: ctrl.signal
        });
    } catch (err) {
        if (err.name === 'AbortError') throw errorCon('timeout');
        throw errorCon('red', err.message);
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        throw errorCon(res.status === 429 ? 'rate_limit' : `http_${res.status}`);
    }

    const data = await res.json();
    const resultados = (data.results || []).slice(0, 3).map((r) => ({
        titulo: String(r.title || '').slice(0, 120),
        fuente: dominio(r.url),
        url: r.url || '',
        extracto: String(r.content || '').slice(0, 500)
    }));

    return { resultados, costoUsd: COSTO_POR_BUSQUEDA_USD };
}

module.exports = { buscar };