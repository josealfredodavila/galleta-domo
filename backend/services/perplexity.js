// ================================================================
// backend/services/perplexity.js
// ================================================================
// Búsqueda con análisis usando Perplexity (chat completions).
//
// Contrato: buscar(consulta) -> { resultados, costoUsd }
// ================================================================

'use strict';

const PPLX_URL = 'https://api.perplexity.ai/chat/completions';
const MODELO = process.env.PERPLEXITY_MODEL || 'sonar';
const TIMEOUT_MS = Number(process.env.PERPLEXITY_TIMEOUT_MS || 4500);
const USD_POR_MTOKEN = Number(process.env.PERPLEXITY_USD_POR_MTOKEN || 1);
const USD_POR_REQUEST = Number(process.env.PERPLEXITY_USD_POR_REQUEST || 0.005);

const SISTEMA =
    'Responde en español, en máximo 3 frases, sin enlaces ni listas. ' +
    'Si la información puede haber cambiado, dilo brevemente.';

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
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw errorCon('sin_api_key', 'Falta PERPLEXITY_API_KEY');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let res;
    try {
        res = await fetch(PPLX_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODELO,
                messages: [
                    { role: 'system', content: SISTEMA },
                    { role: 'user', content: consulta }
                ],
                max_tokens: 300,
                temperature: 0.2
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
    const respuesta = String(data?.choices?.[0]?.message?.content || '').slice(0, 500);
    if (!respuesta) throw errorCon('respuesta_vacia');

    const citas = Array.isArray(data.citations) ? data.citations.slice(0, 2) : [];

    const resultados = [
        { titulo: 'Respuesta', fuente: 'perplexity', url: '', extracto: respuesta },
        ...citas.map((u) => ({
            titulo: dominio(u),
            fuente: dominio(u),
            url: u,
            extracto: 'Fuente citada por Perplexity'
        }))
    ];

    const tokens = Number(data?.usage?.total_tokens || 0);
    const costoUsd = (tokens / 1_000_000) * USD_POR_MTOKEN + USD_POR_REQUEST;

    return { resultados, costoUsd };
}

module.exports = { buscar };