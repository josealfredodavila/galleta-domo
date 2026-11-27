// ================================================================
// ROUTES/RECOMENDACION.JS — Sariel's Ecosystem
// Fase 0 (registro de eventos y votos «¿Te interesa?») y
// Fase 1 (feed por reglas, sin IA).
// ================================================================
// Endpoints:
//   POST /api/recomendacion/eventos   → lote de eventos (idempotente por event_id)
//   POST /api/recomendacion/interes   → voto «interesa» / «no_interesa» / null (quitar)
//   GET  /api/recomendacion/feed      → lote de videos ordenado por reglas
//
// Tablas usadas (verificadas en Supabase):
//   recomendacion_eventos (extendida: event_id, item_tipo, session_id, ...)
//   recomendacion_interes (nueva: votos por usuario e ítem)
//   publicaciones, videos, seguidores, bloqueos, publicaciones_ocultas,
//   usuarios_temas_interes, usuarios_temas_bloqueados,
//   usuarios_idiomas_contenido, usuarios_preferencias, perfiles_publicos
//
// Notas:
//   - Los grupos privados (grupos_*) no se leen ni escriben aquí.
//   - Todas las escrituras usan el usuario del token, nunca el del cuerpo.
//   - La versión de ranking viaja con cada lote para poder medir después.
// ================================================================

'use strict';

const express = require('express');
const { randomUUID } = require('node:crypto');

const { verificarToken } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

const VERSION_RANKING = 'reglas-v1';
const MAX_EVENTOS_LOTE = 50;
const POOL_CANDIDATOS = 300;
const LIMITE_POR_AUTOR = 2;
const CADA_EXPLORACION = 6;
const VENTANA_VISTO_MS = 24 * 60 * 60 * 1000;

const TIPOS_EVENTO = new Set([
    'impression', 'view_start', 'progress', 'complete', 'rewatch',
    'like', 'unlike', 'comment', 'share', 'save', 'follow', 'unfollow',
    'hide', 'not_interested', 'interesa', 'block', 'report'
]);

const ITEM_TIPOS = new Set(['publicacion', 'video']);
const VOTOS = new Set(['interesa', 'no_interesa']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ID_RE = /^[A-Za-z0-9_:.-]{8,80}$/;

// ================================================================
// HELPERS
// ================================================================

function usuarioDe(req) {
    return req.usuarioId || (req.usuario && req.usuario.id) || null;
}

function textoLimitado(v, max) {
    return typeof v === 'string' ? v.trim().slice(0, max) : null;
}

function numeroONulo(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function sanitizarContexto(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;

    const out = {};

    if (typeof c.entrada === 'string') out.entrada = c.entrada.slice(0, 32);
    if (Number.isFinite(c.visible_ms)) out.visible_ms = Math.max(0, Math.min(c.visible_ms, 3600000));
    if (Number.isFinite(c.duracion_ms)) out.duracion_ms = Math.max(0, Math.min(c.duracion_ms, 86400000));
    if (Number.isFinite(c.progreso)) out.progreso = Math.max(0, Math.min(c.progreso, 1));

    return Object.keys(out).length ? out : null;
}

function urlHttps(u) {
    if (typeof u !== 'string' || !u) return null;
    try {
        const x = new URL(u);
        return x.protocol === 'https:' ? x.href : null;
    } catch (e) {
        return null;
    }
}

/* Lectura tolerante: un fallo en una consulta auxiliar no tumba el feed. */
async function leerLista(promesa, nombre) {
    try {
        const { data, error } = await promesa;
        if (error) {
            console.warn(`[recomendacion] ${nombre}:`, error.message);
            return [];
        }
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn(`[recomendacion] ${nombre}:`, e.message);
        return [];
    }
}

// ================================================================
// POST /api/recomendacion/eventos
// Body: { eventos: [ { event_id, item_id, item_tipo, tipo_evento, valor?,
//         posicion?, session_id?, request_id?, ranking_version?,
//         fuente?, contexto? } ] }
// Idempotente: un event_id repetido se ignora sin error.
// ================================================================

router.post('/eventos', verificarToken, async (req, res) => {
    const usuarioId = usuarioDe(req);
    if (!usuarioId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const lista = req.body && Array.isArray(req.body.eventos) ? req.body.eventos : null;

    if (!lista || lista.length === 0) {
        return res.status(400).json({ ok: false, error: 'Sin eventos' });
    }

    if (lista.length > MAX_EVENTOS_LOTE) {
        return res.status(400).json({ ok: false, error: `Máximo ${MAX_EVENTOS_LOTE} eventos por lote` });
    }

    const filas = [];
    let descartados = 0;

    for (const e of lista) {
        if (!e || typeof e !== 'object') { descartados++; continue; }

        const eventId = textoLimitado(e.event_id, 80);
        if (!eventId || !EVENT_ID_RE.test(eventId)) { descartados++; continue; }

        const itemId = typeof e.item_id === 'string' ? e.item_id : '';
        if (!UUID_RE.test(itemId)) { descartados++; continue; }

        if (!ITEM_TIPOS.has(e.item_tipo)) { descartados++; continue; }
        if (!TIPOS_EVENTO.has(e.tipo_evento)) { descartados++; continue; }

        filas.push({
            event_id: eventId,
            usuario_id: usuarioId,
            item_id: itemId,
            item_tipo: e.item_tipo,
            tipo_evento: e.tipo_evento,
            valor: numeroONulo(e.valor),
            posicion: Number.isInteger(e.posicion) ? e.posicion : null,
            session_id: textoLimitado(e.session_id, 64),
            request_id: textoLimitado(e.request_id, 64),
            ranking_version: textoLimitado(e.ranking_version, 32),
            fuente: textoLimitado(e.fuente, 32),
            contexto: sanitizarContexto(e.contexto)
        });
    }

    if (filas.length === 0) {
        return res.status(400).json({ ok: false, error: 'Ningún evento válido', descartados });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('recomendacion_eventos')
            .upsert(filas, { onConflict: 'event_id', ignoreDuplicates: true })
            .select('event_id');

        if (error) throw error;

        return res.status(200).json({
            ok: true,
            recibidos: lista.length,
            validos: filas.length,
            descartados,
            insertados: Array.isArray(data) ? data.length : 0
        });
    } catch (error) {
        console.error('❌ [recomendacion/eventos]:', error.message);
        return res.status(500).json({ ok: false, error: 'No se pudieron guardar los eventos' });
    }
});

// ================================================================
// POST /api/recomendacion/interes
// Body: { item_id, item_tipo: 'publicacion'|'video', voto: 'interesa'|'no_interesa'|null }
// voto null quita el voto. El dueño y el tema se resuelven aquí,
// no desde el cliente.
// ================================================================

router.post('/interes', verificarToken, async (req, res) => {
    const usuarioId = usuarioDe(req);
    if (!usuarioId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const body = req.body || {};
    const itemId = typeof body.item_id === 'string' ? body.item_id : '';
    const itemTipo = body.item_tipo;
    const voto = body.voto === null ? null : body.voto;

    if (!UUID_RE.test(itemId)) return res.status(400).json({ ok: false, error: 'item_id inválido' });
    if (!ITEM_TIPOS.has(itemTipo)) return res.status(400).json({ ok: false, error: 'item_tipo inválido' });
    if (voto !== null && !VOTOS.has(voto)) return res.status(400).json({ ok: false, error: 'voto inválido' });

    try {
        let autorId = null;
        let temaId = null;

        if (itemTipo === 'publicacion') {
            const { data, error } = await supabaseAdmin
                .from('publicaciones')
                .select('usuario_id, tema_id')
                .eq('id', itemId)
                .maybeSingle();
            if (error) throw error;
            if (!data) return res.status(404).json({ ok: false, error: 'Publicación no encontrada' });
            autorId = data.usuario_id;
            temaId = data.tema_id || null;
        } else {
            const { data, error } = await supabaseAdmin
                .from('videos')
                .select('usuario_id')
                .eq('id', itemId)
                .maybeSingle();
            if (error) throw error;
            if (!data) return res.status(404).json({ ok: false, error: 'Video no encontrado' });
            autorId = data.usuario_id;
        }

        if (voto === null) {
            const { error } = await supabaseAdmin
                .from('recomendacion_interes')
                .delete()
                .eq('usuario_id', usuarioId)
                .eq('item_id', itemId)
                .eq('item_tipo', itemTipo);
            if (error) throw error;
        } else {
            const { error } = await supabaseAdmin
                .from('recomendacion_interes')
                .upsert({
                    usuario_id: usuarioId,
                    item_id: itemId,
                    item_tipo: itemTipo,
                    voto: voto,
                    tema_id: temaId,
                    autor_id: autorId,
                    actualizado_en: new Date().toISOString()
                }, { onConflict: 'usuario_id,item_id,item_tipo' });
            if (error) throw error;
        }

        // Registro en el historial de eventos (sirve para medir después).
        if (voto !== null) {
            const { error: errEv } = await supabaseAdmin
                .from('recomendacion_eventos')
                .insert({
                    event_id: randomUUID(),
                    usuario_id: usuarioId,
                    item_id: itemId,
                    item_tipo: itemTipo,
                    tipo_evento: voto === 'no_interesa' ? 'not_interested' : 'interesa',
                    fuente: 'letrero_interes',
                    ranking_version: VERSION_RANKING
                });
            if (errEv) console.warn('[recomendacion/interes] evento:', errEv.message);
        }

        return res.status(200).json({ ok: true, voto: voto });
    } catch (error) {
        console.error('❌ [recomendacion/interes]:', error.message);
        return res.status(500).json({ ok: false, error: 'No se pudo guardar tu respuesta' });
    }
});

// ================================================================
// GET /api/recomendacion/feed?limite=20
// Reglas v1:
//   1. Quita: propias, ocultas, «no me interesa», bloqueados (en ambos
//      sentidos), temas bloqueados, sensibles si el usuario no los quiere,
//      y lo visto en las últimas 24 h.
//   2. Puntúa: seguido +3, tema de interés +3, idioma preferido +1,
//      voto «interesa» al autor +1.5, al tema +2, frescura (hasta +3).
//   3. Ordena por puntaje; no repite tema seguido ni más de 2 del mismo autor.
//   4. Cada 6 lugares, uno de un creador que no sigues (exploración).
// ================================================================

router.get('/feed', verificarToken, async (req, res) => {
    const usuarioId = usuarioDe(req);
    if (!usuarioId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const limite = Math.max(1, Math.min(parseInt(req.query.limite, 10) || 20, 40));
    const requestId = randomUUID();

    try {
        const [
            ocultas, votos, bloqueosHechos, bloqueosRecibidos,
            temasInteres, temasBloqueados, seguidos, idiomas, prefs, vistos
        ] = await Promise.all([
            leerLista(supabaseAdmin.from('publicaciones_ocultas').select('publicacion_id').eq('usuario_id', usuarioId).limit(1000), 'ocultas'),
            leerLista(supabaseAdmin.from('recomendacion_interes').select('item_id, item_tipo, voto, tema_id, autor_id').eq('usuario_id', usuarioId).limit(2000), 'votos'),
            leerLista(supabaseAdmin.from('bloqueos').select('bloqueado_id').eq('usuario_id', usuarioId).limit(1000), 'bloqueos hechos'),
            leerLista(supabaseAdmin.from('bloqueos').select('usuario_id').eq('bloqueado_id', usuarioId).limit(1000), 'bloqueos recibidos'),
            leerLista(supabaseAdmin.from('usuarios_temas_interes').select('tema_id').eq('usuario_id', usuarioId).limit(100), 'temas interés'),
            leerLista(supabaseAdmin.from('usuarios_temas_bloqueados').select('tema_id').eq('usuario_id', usuarioId).limit(100), 'temas bloqueados'),
            leerLista(supabaseAdmin.from('seguidores').select('seguido_id').eq('seguidor_id', usuarioId).limit(5000), 'seguidos'),
            leerLista(supabaseAdmin.from('usuarios_idiomas_contenido').select('idioma_id').eq('usuario_id', usuarioId).limit(20), 'idiomas'),
            supabaseAdmin.from('usuarios_preferencias').select('contenido_mostrar_sensible').eq('usuario_id', usuarioId).maybeSingle()
                .then(r => ({ data: r.data ? [r.data] : [], error: r.error }))
                .catch(() => ({ data: [], error: null })),
            leerLista(
                supabaseAdmin.from('recomendacion_eventos')
                    .select('item_id')
                    .eq('usuario_id', usuarioId)
                    .eq('tipo_evento', 'impression')
                    .eq('item_tipo', 'publicacion')
                    .gte('creado_en', new Date(Date.now() - VENTANA_VISTO_MS).toISOString())
                    .limit(1000),
                'vistos'
            )
        ]);

        const mostrarSensible = prefs.length > 0 && prefs[0].contenido_mostrar_sensible === true;

        const setOcultas = new Set(ocultas.map(x => String(x.publicacion_id)));
        const setVistos = new Set(vistos.map(x => String(x.item_id)));
        const setNoInteresa = new Set(votos.filter(v => v.item_tipo === 'publicacion' && v.voto === 'no_interesa').map(v => String(v.item_id)));
        const setBloqueados = new Set([...bloqueosHechos.map(x => String(x.bloqueado_id)), ...bloqueosRecibidos.map(x => String(x.usuario_id))]);
        const setTemasBloq = new Set(temasBloqueados.map(x => String(x.tema_id)));
        const setTemasInt = new Set(temasInteres.map(x => String(x.tema_id)));
        const setSeguidos = new Set(seguidos.map(x => String(x.seguido_id)));
        const setIdiomas = new Set(idiomas.map(x => String(x.idioma_id)));

        const votoAutor = new Map();
        const votoTema = new Map();
        votos.forEach(v => {
            if (v.voto !== 'interesa') return;
            if (v.autor_id) votoAutor.set(String(v.autor_id), (votoAutor.get(String(v.autor_id)) || 0) + 1);
            if (v.tema_id) votoTema.set(String(v.tema_id), (votoTema.get(String(v.tema_id)) || 0) + 1);
        });

        const { data: candidatosRaw, error: errCand } = await supabaseAdmin
            .from('publicaciones')
            .select('id, usuario_id, contenido, media_url, media_type, created_at, permitir_descarga, tema_id, idioma_id, es_sensible')
            .eq('estado', 'publicado')
            .eq('media_type', 'video')
            .is('perfil_destino_id', null)
            .neq('usuario_id', usuarioId)
            .order('created_at', { ascending: false })
            .limit(POOL_CANDIDATOS);

        if (errCand) throw errCand;

        const ahora = Date.now();
        const candidatos = [];

        for (const p of candidatosRaw || []) {
            const id = String(p.id);
            const autor = String(p.usuario_id);
            const tema = p.tema_id ? String(p.tema_id) : null;
            const idioma = p.idioma_id ? String(p.idioma_id) : null;

            if (setOcultas.has(id) || setVistos.has(id) || setNoInteresa.has(id)) continue;
            if (setBloqueados.has(autor)) continue;
            if (tema && setTemasBloq.has(tema)) continue;
            if (p.es_sensible === true && !mostrarSensible) continue;
            if (!urlHttps(p.media_url)) continue;

            let score = 0;
            let fuente = 'reciente';

            if (setSeguidos.has(autor)) { score += 3; fuente = 'seguido'; }
            if (tema && setTemasInt.has(tema)) { score += 3; if (fuente === 'reciente') fuente = 'interes'; }
            if (idioma && setIdiomas.has(idioma)) score += 1;
            score += Math.min(votoAutor.get(autor) || 0, 3) * 1.5;
            if (tema) score += Math.min(votoTema.get(tema) || 0, 3) * 2;

            const dias = (ahora - new Date(p.created_at).getTime()) / 86400000;
            if (Number.isFinite(dias) && dias > 0) score += Math.max(0, 3 - dias * 0.15);

            candidatos.push({ ...p, _score: score, _fuente: fuente, _seguido: setSeguidos.has(autor) });
        }

        candidatos.sort((a, b) => (b._score - a._score) || (new Date(b.created_at) - new Date(a.created_at)));

        // Selección con diversidad y exploración
        const seleccion = [];
        const porAutor = new Map();
        const pendientes = candidatos.slice();

        while (seleccion.length < limite && pendientes.length) {
            const siguiente = seleccion.length + 1;
            const toca_explorar = siguiente % CADA_EXPLORACION === 0;
            const ultimo = seleccion[seleccion.length - 1] || null;

            const cuotaOk = c => (porAutor.get(String(c.usuario_id)) || 0) < LIMITE_POR_AUTOR;

            let idx = -1;

            if (toca_explorar) {
                idx = pendientes.findIndex(c => cuotaOk(c) && !c._seguido);
                if (idx !== -1) pendientes[idx]._fuente = 'explorar';
            }

            if (idx === -1) {
                idx = pendientes.findIndex(c => cuotaOk(c) && (!ultimo || !c.tema_id || c.tema_id !== ultimo.tema_id));
            }

            if (idx === -1) {
                idx = pendientes.findIndex(c => cuotaOk(c));
            }

            if (idx === -1) break;

            const [elegido] = pendientes.splice(idx, 1);
            seleccion.push(elegido);
            porAutor.set(String(elegido.usuario_id), (porAutor.get(String(elegido.usuario_id)) || 0) + 1);
        }

        // Datos de autor (perfil público: nombre, handle y avatar)
        const idsAutores = [...new Set(seleccion.map(c => String(c.usuario_id)))];
        const mapaAutores = new Map();

        if (idsAutores.length) {
            const autores = await leerLista(
                supabaseAdmin.from('perfiles_publicos').select('id, nombre, handle, avatar_url').in('id', idsAutores),
                'autores'
            );
            autores.forEach(a => mapaAutores.set(String(a.id), a));
        }

        const items = seleccion.map(c => {
            const a = mapaAutores.get(String(c.usuario_id)) || {};
            return {
                id: c.id,
                item_tipo: 'publicacion',
                contenido: c.contenido || '',
                media_url: urlHttps(c.media_url),
                media_type: 'video',
                created_at: c.created_at,
                permitir_descarga: c.permitir_descarga !== false,
                usuario_id: c.usuario_id,
                usuario_nombre: a.nombre || a.handle || null,
                usuario_handle: a.handle || null,
                usuario_avatar_url: urlHttps(a.avatar_url),
                tema_id: c.tema_id || null,
                es_sensible: c.es_sensible === true,
                fuente: c._fuente,
                puntaje: Math.round(c._score * 100) / 100
            };
        });

        return res.status(200).json({
            ok: true,
            request_id: requestId,
            ranking_version: VERSION_RANKING,
            items
        });
    } catch (error) {
        console.error('❌ [recomendacion/feed]:', error.message);
        return res.status(500).json({ ok: false, error: 'No se pudo generar el feed' });
    }
});

module.exports = router;