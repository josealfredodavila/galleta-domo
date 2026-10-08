// ================================================================
// backend/services/plan-guard.js
// ================================================================
// Orquesta la búsqueda web:
// - Caché (memoria + Supabase)
// - Cuota por plan
// - Circuit breaker por proveedor
// - Llamada al proveedor
// - Registro de uso
//
// v1.1: presupuesto total por canal + circuit breaker no cuenta
//       cortes por presupuesto.
// ================================================================

'use strict';

const crypto = require('crypto');
const supabase = require('../lib/supabase-admin');
const tavily = require('./web-search');
const perplexity = require('./perplexity');
const { CircuitBreaker } = require('./circuit-breaker');

if (!process.env.QUERY_HASH_SECRET) {
    throw new Error('Falta la variable QUERY_HASH_SECRET');
}

const TTL_CACHE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 6000;               // red de seguridad total
const MAX_CACHE_JSON = 3000;           // bytes máx por entrada de caché
const MAX_MEMORIA = 1000;              // entradas máx en caché de memoria

const proveedores = {
    tavily: {
        api: tavily,
        breaker: new CircuitBreaker({ nombre: 'tavily' })
    },
    perplexity: {
        api: perplexity,
        breaker: new CircuitBreaker({ nombre: 'perplexity' })
    }
};

const memoriaCache = new Map(); // "proveedor:hash" -> { resultado, expira }

function log(evento, datos = {}) {
    console.log(JSON.stringify({
        t: new Date().toISOString(),
        mod: 'plan-guard',
        evento,
        ...datos
    }));
}

function normalizarConsulta(texto) {
    return String(texto || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

function hashConsulta(consultaNormalizada) {
    return crypto
        .createHmac('sha256', process.env.QUERY_HASH_SECRET)
        .update(consultaNormalizada)
        .digest('hex');
}

function conTimeout(promesa, ms, codigo = 'timeout') {
    let timer;
    const limite = new Promise((_, rechazar) => {
        timer = setTimeout(() => {
            const err = new Error(codigo);
            err.codigo = codigo;
            rechazar(err);
        }, ms);
    });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(timer));
}

async function rpc(nombre, args) {
    const { data, error } = await supabase.rpc(nombre, args);
    if (error) throw error;
    return data;
}

function tipoCuota(proveedor) {
    return proveedor === 'perplexity' ? 'busqueda_perplexity' : 'busqueda_tavily';
}

function compactar(resultados = []) {
    return resultados.slice(0, 3).map((r) => ({
        titulo: String(r.titulo || '').slice(0, 120),
        fuente: String(r.fuente || r.url || '')
            .replace(/^https?:\/\//, '')
            .split('/')[0]
            .slice(0, 80),
        extracto: String(r.extracto || '').slice(0, 500)
    }));
}

function formatearParaPrompt(resultados) {
    if (!resultados || resultados.length === 0) return null;
    return resultados
        .map((r, i) => `[${i + 1}] ${r.titulo} (${r.fuente}): ${r.extracto}`)
        .join('\n');
}

function sinBusqueda(motivo) {
    return { fuente: 'ninguna', contexto: null, motivo };
}

function memoriaSet(clave, resultado, expira) {
    if (memoriaCache.size >= MAX_MEMORIA) {
        memoriaCache.delete(memoriaCache.keys().next().value);
    }
    memoriaCache.set(clave, { resultado, expira });
}

async function leerCache(proveedor, hash) {
    const clave = `${proveedor}:${hash}`;
    const enMemoria = memoriaCache.get(clave);
    if (enMemoria && enMemoria.expira > Date.now()) return enMemoria.resultado;

    try {
        const { data, error } = await supabase
            .from('ai_cache_busquedas')
            .select('resultado, expira_at')
            .eq('query_hash', hash)
            .eq('proveedor', proveedor)
            .gt('expira_at', new Date().toISOString())
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        memoriaSet(clave, data.resultado, new Date(data.expira_at).getTime());
        return data.resultado;
    } catch (err) {
        log('cache_lectura_error', { codigo: err.code || err.message });
        return null;
    }
}

async function guardarCache(proveedor, hash, resultado) {
    const json = JSON.stringify(resultado);
    if (json.length > MAX_CACHE_JSON) return;

    const expira = Date.now() + TTL_CACHE_MS;
    memoriaSet(`${proveedor}:${hash}`, resultado, expira);

    const { error } = await supabase.from('ai_cache_busquedas').upsert(
        {
            query_hash: hash,
            proveedor,
            resultado,
            creado_at: new Date().toISOString(),
            expira_at: new Date(expira).toISOString()
        },
        { onConflict: 'query_hash,proveedor' }
    );

    if (error) log('cache_escritura_error', { codigo: error.code });
}

// Registro sin bloquear la respuesta al usuario
function registrar({
    usuarioId, personaje, proveedor, hash,
    costo = 0, latencia = null, exito = true, error = null
}) {
    supabase
        .from('ai_busquedas_web')
        .insert({
            usuario_id: usuarioId,
            personaje,
            proveedor,
            query_hash: hash,
            costo_usd: costo,
            latencia_ms: latencia,
            exito,
            error_codigo: error
        })
        .then(({ error: e }) => {
            if (e) log('registro_error', { codigo: e.code });
        });
}

// ---------- API pública ----------

// Cuenta un mensaje de chat. Si la base falla, deja pasar (fail open).
async function consumirMensaje({ usuarioId, personaje, huella = null }) {
    try {
        return await rpc('consumir_mensaje', {
            p_usuario: usuarioId,
            p_personaje: personaje,
            p_huella: huella
        });
    } catch (err) {
        log('mensaje_db_error', { codigo: err.code || err.message });
        return { permitido: true, motivo: 'db_fallback' };
    }
}

// Para la UI: ¿este usuario tiene búsqueda web en su plan?
async function verificarPuedeBuscar(usuarioId) {
    try {
        return (await rpc('puede_buscar_web', { p_usuario: usuarioId })) === true;
    } catch (err) {
        log('puede_buscar_db_error', { codigo: err.code || err.message });
        return false;
    }
}

// tipo: 'simple' (Tavily) o 'complejo' (Perplexity con Tavily de respaldo)
async function buscarEnTiempoReal({
    usuarioId,
    personaje,
    consulta,
    tipo = 'simple',
    huella = null,
    presupuestoMs = 6000
}) {
    const q = normalizarConsulta(consulta);
    if (!q) return sinBusqueda('consulta_vacia');

    const limiteTotal = Date.now() + presupuestoMs;
    const hash = hashConsulta(q);
    const candidatos = tipo === 'complejo'
        ? ['perplexity', 'tavily']
        : ['tavily'];

    try {
        for (const proveedor of candidatos) {
            const restante = limiteTotal - Date.now();
            if (restante < 1500) break; // no alcanza para otro intento

            // 1. Caché (no consume cuota)
            const cacheado = await leerCache(proveedor, hash);
            if (cacheado) {
                registrar({ usuarioId, personaje, proveedor: 'cache', hash });
                return {
                    fuente: 'cache',
                    contexto: formatearParaPrompt(cacheado),
                    motivo: 'ok'
                };
            }

            // 2. Circuit breaker
            const { api, breaker } = proveedores[proveedor];
            if (breaker.estaAbierto()) continue;

            // 3. Cuota atómica
            const cuota = await rpc('verificar_y_consumir_limite', {
                p_usuario: usuarioId,
                p_tipo: tipoCuota(proveedor),
                p_huella: huella
            });
            if (!cuota.permitido) continue;

            // 4. Llamada al proveedor con presupuesto
            const inicio = Date.now();
            try {
                const respuesta = await conTimeout(
                    api.buscar(q),
                    limiteTotal - Date.now(),
                    'presupuesto'
                );
                breaker.registrarExito();

                const compacto = compactar(respuesta.resultados);
                await guardarCache(proveedor, hash, compacto);

                registrar({
                    usuarioId, personaje, proveedor, hash,
                    costo: respuesta.costoUsd ?? 0,
                    latencia: Date.now() - inicio
                });

                return {
                    fuente: proveedor,
                    contexto: formatearParaPrompt(compacto),
                    motivo: 'ok'
                };
            } catch (err) {
                // Un corte por presupuesto NO es culpa del proveedor
                if (err.codigo !== 'presupuesto') breaker.registrarFallo();

                log('proveedor_fallo', {
                    proveedor,
                    codigo: err.codigo || err.code || err.name
                });

                await rpc('devolver_consumo', {
                    p_usuario: usuarioId,
                    p_tipo: tipoCuota(proveedor)
                }).catch((e) => log('devolucion_error', {
                    codigo: e.code || e.message
                }));

                registrar({
                    usuarioId, personaje, proveedor, hash,
                    latencia: Date.now() - inicio,
                    exito: false,
                    error: err.codigo || err.name
                });
            }
        }

        return sinBusqueda('sin_cuota_o_proveedor');
    } catch (err) {
        // Fail closed: si no podemos contar, no gastamos
        log('busqueda_db_error', { codigo: err.code || err.message });
        return sinBusqueda('db_no_disponible');
    }
}

module.exports = {
    buscarEnTiempoReal,
    consumirMensaje,
    verificarPuedeBuscar,
    normalizarConsulta
};