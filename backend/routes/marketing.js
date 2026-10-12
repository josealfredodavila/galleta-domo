/* ================================================================
   ROUTES/MARKETING.JS — Csariel's
   Targets soportados: 'live' (transmisiones.id, integer),
                       'grupo' (grupos_video.id, uuid),
                       'video' (videos.id, uuid)
   Funciones SQL usadas: obtener_campanas_candidatas,
                         registrar_vista_anuncio,
                         descontar_presupuesto_campana
   Fallback en JS si la función SQL de selección falla.
   ================================================================ */

const express = require('express');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

const COSTOS = {
    impresion: 0.05,
    vista: 0.10,
    vista_completa: 0.25,
    clic: 0.50,
    interaccion: 0.15,
    reproduccion: 0.20,
    conversion: 1.00
};

const EVENTOS_VALIDOS = ['impresion', 'vista', 'vista_completa', 'clic', 'interaccion', 'reproduccion', 'conversion'];
const TARGETS_VALIDOS = ['live', 'grupo', 'video'];
const MAX_IMPRESIONES_POR_USUARIO = 3;
const VENTANA_FRECUENCIA_HORAS = 24;

const campoTarget = (tipo) =>
    tipo === 'live' ? 'live_id' : tipo === 'grupo' ? 'grupo_id' : 'video_id';

// ================================================================
// AUTENTICACIÓN
// ================================================================
async function autenticar(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        if (!token) return res.status(401).json({ success: false, error: 'No autenticado' });

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) return res.status(401).json({ success: false, error: 'No autenticado' });

        req.user = user;
        return next();
    } catch (e) {
        console.error('[Marketing] auth:', e.message);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

// ================================================================
// CONTEXTO DEL USUARIO Y DEL TARGET
// ================================================================
async function obtenerCiudadUsuario(usuarioId) {
    const { data } = await supabaseAdmin.from('usuarios').select('ciudad').eq('id', usuarioId).maybeSingle();
    return data?.ciudad || null;
}

async function obtenerCategoriaTarget(tipo, id) {
    try {
        if (tipo === 'live') {
            const { data } = await supabaseAdmin.from('transmisiones').select('categoria').eq('id', id).maybeSingle();
            return data?.categoria || null;
        }
        if (tipo === 'grupo') {
            const { data } = await supabaseAdmin
                .from('grupos_video')
                .select('grupos_video_categorias:categoria_id(nombre)')
                .eq('id', id)
                .maybeSingle();
            return data?.grupos_video_categorias?.nombre || null;
        }
        if (tipo === 'video') {
            const { data } = await supabaseAdmin.from('videos').select('categoria').eq('id', id).maybeSingle();
            return data?.categoria || null;
        }
    } catch (e) {
        console.warn('[Marketing] categoría:', e.message);
    }
    return null;
}

// ================================================================
// ALGORITMO EN JS (fallback)
// ================================================================
async function algoritmoJS({ target_tipo, target_id, usuario_id, ciudadUsuario, categoriaTarget }) {
    const { data: targets, error } = await supabaseAdmin
        .from('marketing_campaign_targets')
        .select(`
            campaign_id,
            marketing_campaigns!inner(
                id, nombre, estado, presupuesto, gastado, moneda,
                segmentacion_ciudad, segmentacion_categoria,
                horario_inicio, horario_fin, prioridad, peso_rotacion
            )
        `)
        .eq('target_tipo', target_tipo)
        .eq(campoTarget(target_tipo), target_id);

    if (error || !targets?.length) return [];

    const horaActual = new Date().toTimeString().slice(0, 8);

    const validas = targets.map((t) => t.marketing_campaigns).filter((c) => {
        if (!c || c.estado !== 'activa') return false;
        if (parseFloat(c.gastado || 0) >= parseFloat(c.presupuesto || 0)) return false;
        if (c.segmentacion_ciudad && ciudadUsuario && c.segmentacion_ciudad !== ciudadUsuario) return false;
        if (c.segmentacion_categoria && categoriaTarget && c.segmentacion_categoria !== categoriaTarget) return false;
        if (c.horario_inicio && c.horario_fin) {
            const ini = String(c.horario_inicio).slice(0, 8);
            const fin = String(c.horario_fin).slice(0, 8);
            if (horaActual < ini || horaActual > fin) return false;
        }
        return true;
    });

    if (!validas.length) return [];

    const ventana = new Date(Date.now() - VENTANA_FRECUENCIA_HORAS * 3600 * 1000).toISOString();
    const { data: vistas } = await supabaseAdmin
        .from('marketing_events')
        .select('campaign_id')
        .eq('usuario_id', usuario_id)
        .eq('evento', 'impresion')
        .gte('created_at', ventana);

    const conteo = {};
    for (const e of vistas || []) conteo[e.campaign_id] = (conteo[e.campaign_id] || 0) + 1;

    const filtradas = validas.filter((c) => (conteo[c.id] || 0) < MAX_IMPRESIONES_POR_USUARIO);

    const resultados = [];
    for (const c of filtradas) {
        const { data: ads } = await supabaseAdmin
            .from('marketing_ads').select('id').eq('campaign_id', c.id).eq('activo', true).limit(1);
        if (!ads?.length) continue;

        const presupuesto = parseFloat(c.presupuesto || 0);
        const ratio = presupuesto > 0 ? (presupuesto - parseFloat(c.gastado || 0)) / presupuesto : 0;

        let score = ratio * 100;
        let razon = 'rotacion_normal';

        if (c.prioridad > 0) { score += c.prioridad * 10; razon = 'prioridad_alta'; }
        if (c.segmentacion_ciudad && c.segmentacion_ciudad === ciudadUsuario) { score += 50; razon = 'match_ciudad'; }
        if (c.segmentacion_categoria && c.segmentacion_categoria === categoriaTarget) { score += 30; razon = 'match_categoria'; }
        if (c.peso_rotacion > 0) score += c.peso_rotacion * 20;
        if (ratio > 0.5 && razon === 'rotacion_normal') razon = 'presupuesto_alto';

        resultados.push({ campaign_id: c.id, ad_id: ads[0].id, score: Math.round(score), razon });
    }

    resultados.sort((a, b) => b.score - a.score);
    return resultados;
}

// ================================================================
// POST /get-ad
// ================================================================
router.post('/get-ad', autenticar, async (req, res) => {
    try {
        const { target_tipo, target_id, session_id } = req.body || {};
        const usuarioId = req.user.id;

        if (!TARGETS_VALIDOS.includes(target_tipo)) {
            return res.status(400).json({ success: false, error: 'target_tipo inválido' });
        }
        if (target_id === undefined || target_id === null || target_id === '') {
            return res.status(400).json({ success: false, error: 'target_id requerido' });
        }

        const [ciudad, categoria] = await Promise.all([
            obtenerCiudadUsuario(usuarioId),
            obtenerCategoriaTarget(target_tipo, target_id)
        ]);

        let candidatas = null;
        try {
            const { data, error } = await supabaseAdmin.rpc('obtener_campanas_candidatas', {
                p_target_tipo: target_tipo,
                p_target_id: String(target_id),
                p_usuario_id: usuarioId,
                p_ciudad_usuario: ciudad,
                p_categoria_target: categoria
            });
            if (!error && data?.length) candidatas = data;
            else if (error) console.warn('[Marketing] RPC candidatas:', error.message);
        } catch (e) {
            console.warn('[Marketing] RPC candidatas excepción:', e.message);
        }

        if (!candidatas?.length) {
            candidatas = await algoritmoJS({ target_tipo, target_id, usuario_id: usuarioId, ciudadUsuario: ciudad, categoriaTarget: categoria });
        }

        if (!candidatas?.length) return res.json({ success: true, ad: null, reason: 'sin_candidatas' });

        const ganadora = candidatas[0];

        const { data: ad } = await supabaseAdmin
            .from('marketing_ads').select('*').eq('id', ganadora.ad_id).eq('activo', true).maybeSingle();
        if (!ad) return res.json({ success: true, ad: null, reason: 'ad_no_encontrado' });

        await supabaseAdmin.from('marketing_events').insert({
            campaign_id: ganadora.campaign_id,
            ad_id: ad.id,
            usuario_id: usuarioId,
            target_tipo,
            [campoTarget(target_tipo)]: target_id,
            evento: 'impresion',
            session_id: session_id || null,
            ciudad_usuario: ciudad,
            categoria_target: categoria,
            score_asignado: ganadora.score,
            razon_seleccion: ganadora.razon,
            metadata: { user_agent: String(req.headers['user-agent'] || '').slice(0, 300) }
        });

        try {
            await supabaseAdmin.rpc('registrar_vista_anuncio', {
                p_usuario_id: usuarioId,
                p_ad_id: ad.id,
                p_campaign_id: ganadora.campaign_id,
                p_target_tipo: target_tipo,
                p_target_id: String(target_id)
            });
        } catch (e) {
            console.warn('[Marketing] vista única:', e.message);
        }

        const { error: errCobro } = await supabaseAdmin.rpc('descontar_presupuesto_campana', {
            p_campaign_id: ganadora.campaign_id,
            p_monto: COSTOS.impresion
        });
        if (errCobro) console.error('[Marketing] cobro impresión:', errCobro.message);

        return res.json({
            success: true,
            ad: {
                id: ad.id,
                campaign_id: ad.campaign_id,
                titulo: ad.titulo,
                descripcion: ad.descripcion,
                imagen_url: ad.imagen_url,
                video_url: ad.video_url,
                cta_texto: ad.cta_texto,
                destino_tipo: ad.destino_tipo,
                cta_url: ad.cta_url || null
            }
        });
    } catch (e) {
        console.error('[Marketing] get-ad:', e.message);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// POST /register-event
// ================================================================
router.post('/register-event', autenticar, async (req, res) => {
    try {
        const { ad_id, campaign_id, target_tipo, target_id, evento, session_id, metadata } = req.body || {};
        const usuarioId = req.user.id;

        if (!EVENTOS_VALIDOS.includes(evento)) {
            return res.status(400).json({ success: false, error: 'Evento inválido' });
        }
        if (!ad_id || !campaign_id) {
            return res.status(400).json({ success: false, error: 'ad_id y campaign_id requeridos' });
        }

        const { data: ad } = await supabaseAdmin
            .from('marketing_ads').select('id, campaign_id, activo').eq('id', ad_id).maybeSingle();
        if (!ad || ad.campaign_id !== campaign_id || ad.activo !== true) {
            return res.status(404).json({ success: false, error: 'Anuncio no encontrado' });
        }

        const { data: campaña } = await supabaseAdmin
            .from('marketing_campaigns').select('estado').eq('id', campaign_id).maybeSingle();
        if (!campaña || campaña.estado !== 'activa') {
            return res.status(400).json({ success: false, error: 'Campaña no activa' });
        }

        const fila = {
            campaign_id,
            ad_id,
            usuario_id: usuarioId,
            target_tipo: TARGETS_VALIDOS.includes(target_tipo) ? target_tipo : null,
            evento,
            session_id: session_id || null,
            metadata: metadata && typeof metadata === 'object' ? metadata : {}
        };
        if (target_tipo && target_id) fila[campoTarget(target_tipo)] = target_id;

        const { error: errIns } = await supabaseAdmin.from('marketing_events').insert(fila);
        if (errIns) {
            console.error('[Marketing] insertar evento:', errIns.message);
            return res.status(500).json({ success: false, error: 'Error registrando evento' });
        }

        if (evento !== 'impresion' && COSTOS[evento] > 0) {
            const { error: errCobro } = await supabaseAdmin.rpc('descontar_presupuesto_campana', {
                p_campaign_id: campaign_id,
                p_monto: COSTOS[evento]
            });
            if (errCobro) console.error('[Marketing] cobro evento:', errCobro.message);
        }

        return res.json({ success: true, evento });
    } catch (e) {
        console.error('[Marketing] register-event:', e.message);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// GET /my-campaigns  (solo el anunciante)
// ================================================================
router.get('/my-campaigns', autenticar, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('*')
            .eq('anunciante_id', req.user.id)
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ success: false, error: 'Error consultando campañas' });
        return res.json({ success: true, campaigns: data || [] });
    } catch (e) {
        console.error('[Marketing] my-campaigns:', e.message);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;