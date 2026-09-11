/* ================================================================
   ROUTES/MARKETING.JS - SARIEL'S ECOSYSTEM
   VERSIÓN CON ALGORITMO MEJORADO
   ================================================================
   SOPORTA:
   ✅ target_tipo = 'live'   (transmisiones.id es integer)
   ✅ target_tipo = 'grupo'  (grupos_video.id es uuid)
   ✅ target_tipo = 'video'  (videos.id es uuid)

   USA:
   ✅ Función SQL: obtener_campanas_candidatas
   ✅ Función SQL: registrar_vista_anuncio
   ✅ Fallback en JS si las funciones SQL fallan
   ================================================================ */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : null;

const COSTOS = {
    impresion: 0.05,
    vista: 0.10,
    vista_completa: 0.25,
    clic: 0.50,
    interaccion: 0.15,
    reproduccion: 0.20,
    conversion: 1.00
};

const MAX_IMPRESIONES_POR_USUARIO = 3;
const VENTANA_FRECUENCIA_HORAS = 24;

const TARGETS_VALIDOS = ['live', 'grupo', 'video'];

function getBearerToken(req) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
}

async function obtenerUsuario(req) {
    const token = getBearerToken(req);
    if (!token) return null;
    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) return null;
        return user;
    } catch (err) {
        return null;
    }
}

function normalizarEvento(evento) {
    const eventos = ['impresion', 'vista', 'vista_completa', 'clic', 'interaccion', 'reproduccion', 'conversion'];
    return eventos.includes(evento) ? evento : null;
}

async function autenticar(req, res, next) {
    const user = await obtenerUsuario(req);
    if (!user) {
        return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    req.user = user;
    next();
}

async function obtenerCiudadUsuario(usuario_id) {
    try {
        const { data, error } = await supabaseAdmin
            .from('usuarios')
            .select('ciudad')
            .eq('id', usuario_id)
            .maybeSingle();
        if (error || !data) return null;
        return data.ciudad || null;
    } catch (err) {
        return null;
    }
}

async function obtenerCategoriaTarget(target_tipo, target_id) {
    try {
        if (target_tipo === 'live') {
            const { data } = await supabaseAdmin
                .from('transmisiones')
                .select('categoria')
                .eq('id', target_id)
                .maybeSingle();
            return data?.categoria || null;
        } else if (target_tipo === 'grupo') {
            const { data } = await supabaseAdmin
                .from('grupos_video')
                .select('categoria_id, grupos_video_categorias:categoria_id(nombre)')
                .eq('id', target_id)
                .maybeSingle();
            return data?.grupos_video_categorias?.nombre || null;
        } else if (target_tipo === 'video') {
            const { data } = await supabaseAdmin
                .from('videos')
                .select('categoria')
                .eq('id', target_id)
                .maybeSingle();
            return data?.categoria || null;
        }
        return null;
    } catch (err) {
        return null;
    }
}

/* ================================================================
   POST /api/marketing/get-ad
================================================================ */

router.post('/get-ad', autenticar, async (req, res) => {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Admin no configurado' });
        }

        const { target_tipo, target_id, session_id } = req.body;
        const usuario_id = req.user.id;

        if (!TARGETS_VALIDOS.includes(target_tipo)) {
            return res.status(400).json({
                success: false,
                error: `target_tipo debe ser uno de: ${TARGETS_VALIDOS.join(', ')}`
            });
        }
        if (!target_id) {
            return res.status(400).json({ success: false, error: 'target_id requerido' });
        }

        const targetField = target_tipo === 'live' ? 'live_id'
                          : target_tipo === 'grupo' ? 'grupo_id'
                          : 'video_id';

        const [ciudadUsuario, categoriaTarget] = await Promise.all([
            obtenerCiudadUsuario(usuario_id),
            obtenerCategoriaTarget(target_tipo, target_id)
        ]);

        console.log(`📢 [ALGO] usuario=${usuario_id} target=${target_tipo}:${target_id} ciudad=${ciudadUsuario} categoria=${categoriaTarget}`);

        let candidatas = null;
        try {
            const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('obtener_campanas_candidatas', {
                p_target_tipo: target_tipo,
                p_target_id: String(target_id),
                p_usuario_id: usuario_id,
                p_ciudad_usuario: ciudadUsuario,
                p_categoria_target: categoriaTarget
            });

            if (!rpcError && rpcData && rpcData.length > 0) {
                candidatas = rpcData;
                console.log(`✅ [ALGO] RPC devolvió ${candidatas.length} candidatas`);
            } else if (rpcError) {
                console.warn('⚠️ [ALGO] RPC falló, usando fallback JS:', rpcError.message);
            }
        } catch (rpcCatchError) {
            console.warn('⚠️ [ALGO] Excepción en RPC, usando fallback JS:', rpcCatchError.message);
        }

        if (!candidatas || candidatas.length === 0) {
            console.log('🔄 [ALGO] Usando algoritmo en JS (fallback)');
            candidatas = await algoritmoJS({
                target_tipo,
                target_id,
                usuario_id,
                ciudadUsuario,
                categoriaTarget
            });
        }

        if (!candidatas || candidatas.length === 0) {
            return res.json({ success: true, ad: null, reason: 'sin_candidatas' });
        }

        const ganadora = candidatas[0];
        console.log(`🏆 [ALGO] Ganadora: campaign=${ganadora.campaign_id} ad=${ganadora.ad_id} score=${ganadora.score} razon=${ganadora.razon}`);

        const { data: ad, error: adError } = await supabaseAdmin
            .from('marketing_ads')
            .select('*')
            .eq('id', ganadora.ad_id)
            .eq('activo', true)
            .maybeSingle();

        if (adError || !ad) {
            return res.json({ success: true, ad: null, reason: 'ad_no_encontrado' });
        }

        await supabaseAdmin
            .from('marketing_events')
            .insert({
                campaign_id: ganadora.campaign_id,
                ad_id: ad.id,
                usuario_id: usuario_id,
                target_tipo: target_tipo,
                [targetField]: target_id,
                evento: 'impresion',
                session_id: session_id || null,
                metadata: {
                    user_agent: req.headers['user-agent'] || null,
                    timestamp: new Date().toISOString(),
                    score: ganadora.score,
                    razon: ganadora.razon,
                    ciudad_usuario: ciudadUsuario,
                    categoria_target: categoriaTarget
                }
            });

        try {
            await supabaseAdmin.rpc('registrar_vista_anuncio', {
                p_usuario_id: usuario_id,
                p_ad_id: ad.id,
                p_campaign_id: ganadora.campaign_id,
                p_target_tipo: target_tipo,
                p_target_id: String(target_id)
            });
        } catch (vistaError) {
            console.warn('⚠️ [ALGO] No se pudo registrar vista única:', vistaError.message);
        }

        await supabaseAdmin.rpc('descontar_presupuesto_campana', {
            p_campaign_id: ganadora.campaign_id,
            p_monto: COSTOS.impresion
        });

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
                destino_tipo: ad.destino_tipo
            },
            meta: {
                score: ganadora.score,
                razon: ganadora.razon,
                costo: COSTOS.impresion
            }
        });

    } catch (error) {
        console.error('❌ Error get-ad:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/* ================================================================
   ALGORITMO EN JS (FALLBACK)
================================================================ */

async function algoritmoJS({ target_tipo, target_id, usuario_id, ciudadUsuario, categoriaTarget }) {
    const targetField = target_tipo === 'live' ? 'live_id'
                      : target_tipo === 'grupo' ? 'grupo_id'
                      : 'video_id';

    const { data: targets, error: targetsError } = await supabaseAdmin
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
        .eq(targetField, target_id);

    if (targetsError || !targets || targets.length === 0) {
        return [];
    }

    const horaActual = new Date().toTimeString().slice(0, 8);
    const campanasValidas = targets
        .map(t => t.marketing_campaigns)
        .filter(c => {
            if (!c) return false;
            if (c.estado !== 'activa') return false;
            if (parseFloat(c.gastado || 0) >= parseFloat(c.presupuesto || 0)) return false;
            if (c.segmentacion_ciudad && ciudadUsuario && c.segmentacion_ciudad !== ciudadUsuario) return false;
            if (c.segmentacion_categoria && categoriaTarget && c.segmentacion_categoria !== categoriaTarget) return false;
            if (c.horario_inicio && c.horario_fin) {
                const inicio = String(c.horario_inicio).slice(0, 8);
                const fin = String(c.horario_fin).slice(0, 8);
                if (horaActual < inicio || horaActual > fin) return false;
            }
            return true;
        });

    if (campanasValidas.length === 0) return [];

    const ventana = new Date();
    ventana.setHours(ventana.getHours() - VENTANA_FRECUENCIA_HORAS);

    const { data: impresionesRecientes } = await supabaseAdmin
        .from('marketing_events')
        .select('campaign_id')
        .eq('usuario_id', usuario_id)
        .eq('evento', 'impresion')
        .gte('created_at', ventana.toISOString());

    const conteoPorCampana = {};
    (impresionesRecientes || []).forEach(e => {
        conteoPorCampana[e.campaign_id] = (conteoPorCampana[e.campaign_id] || 0) + 1;
    });

    const campanasFiltradas = campanasValidas.filter(
        c => (conteoPorCampana[c.id] || 0) < MAX_IMPRESIONES_POR_USUARIO
    );

    if (campanasFiltradas.length === 0) return [];

    const resultados = [];
    for (const c of campanasFiltradas) {
        const { data: ads } = await supabaseAdmin
            .from('marketing_ads')
            .select('id')
            .eq('campaign_id', c.id)
            .eq('activo', true)
            .limit(1);

        if (!ads || ads.length === 0) continue;

        const presupuesto = parseFloat(c.presupuesto || 0);
        const gastado = parseFloat(c.gastado || 0);
        const restante = presupuesto - gastado;
        const ratioRestante = presupuesto > 0 ? restante / presupuesto : 0;

        let score = 0;
        let razon = 'rotacion_normal';

        score += ratioRestante * 100;

        if (c.prioridad && c.prioridad > 0) {
            score += c.prioridad * 10;
            razon = 'prioridad_alta';
        }
        if (c.segmentacion_ciudad && ciudadUsuario && c.segmentacion_ciudad === ciudadUsuario) {
            score += 50;
            razon = 'match_ciudad';
        }
        if (c.segmentacion_categoria && categoriaTarget && c.segmentacion_categoria === categoriaTarget) {
            score += 30;
            razon = 'match_categoria';
        }
        if (c.peso_rotacion && c.peso_rotacion > 0) {
            score += c.peso_rotacion * 20;
        }
        if (ratioRestante > 0.5 && razon === 'rotacion_normal') {
            razon = 'presupuesto_alto';
        }

        resultados.push({
            campaign_id: c.id,
            ad_id: ads[0].id,
            score: Math.round(score),
            razon
        });
    }

    resultados.sort((a, b) => b.score - a.score);
    return resultados;
}

/* ================================================================
   POST /api/marketing/register-event
================================================================ */

router.post('/register-event', autenticar, async (req, res) => {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Admin no configurado' });
        }

        const { ad_id, campaign_id, target_tipo, target_id, evento, session_id, metadata } = req.body;
        const usuario_id = req.user.id;

        const eventoNormalizado = normalizarEvento(evento);
        if (!eventoNormalizado) {
            return res.status(400).json({ success: false, error: 'Evento inválido' });
        }
        if (!ad_id || !campaign_id) {
            return res.status(400).json({ success: false, error: 'ad_id y campaign_id requeridos' });
        }

        const { data: ad, error: adError } = await supabaseAdmin
            .from('marketing_ads')
            .select('id, campaign_id, activo')
            .eq('id', ad_id)
            .maybeSingle();

        if (adError || !ad || ad.campaign_id !== campaign_id) {
            return res.status(404).json({ success: false, error: 'Anuncio no encontrado' });
        }

        const { data: campaign } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('estado, presupuesto, gastado')
            .eq('id', campaign_id)
            .maybeSingle();

        if (!campaign || campaign.estado !== 'activa') {
            return res.status(400).json({ success: false, error: 'Campaña no activa' });
        }

        const insertData = {
            campaign_id,
            ad_id,
            usuario_id,
            target_tipo: target_tipo || null,
            evento: eventoNormalizado,
            session_id: session_id || null,
            metadata: metadata || {}
        };

        if (target_tipo === 'live') insertData.live_id = target_id;
        else if (target_tipo === 'grupo') insertData.grupo_id = target_id;

        const { error: insertError } = await supabaseAdmin
            .from('marketing_events')
            .insert(insertData);

        if (insertError) {
            console.error('Error insertando evento:', insertError);
            return res.status(500).json({ success: false, error: 'Error registrando evento' });
        }

        if (eventoNormalizado !== 'impresion') {
            const costo = COSTOS[eventoNormalizado] || 0;
            if (costo > 0) {
                await supabaseAdmin.rpc('descontar_presupuesto_campana', {
                    p_campaign_id: campaign_id,
                    p_monto: costo
                });
            }
        }

        return res.json({ success: true, evento: eventoNormalizado });

    } catch (error) {
        console.error('Error register-event:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/* ================================================================
   POST /api/marketing/descontar
================================================================ */

router.post('/descontar', autenticar, async (req, res) => {
    try {
        const { campaign_id, monto } = req.body;

        if (!campaign_id || !monto || monto <= 0) {
            return res.status(400).json({ success: false, error: 'Datos inválidos' });
        }

        const { data: campaign } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('id, anunciante_id')
            .eq('id', campaign_id)
            .maybeSingle();

        if (!campaign || campaign.anunciante_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        const { data, error } = await supabaseAdmin.rpc('descontar_presupuesto_campana', {
            p_campaign_id: campaign_id,
            p_monto: parseFloat(monto)
        });

        if (error) {
            console.error('Error descontar:', error);
            return res.status(500).json({ success: false, error: 'Error descontando' });
        }

        return res.json({ success: true, resultado: data });

    } catch (error) {
        console.error('Error descontar:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/* ================================================================
   GET /api/marketing/my-campaigns
================================================================ */

router.get('/my-campaigns', autenticar, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('*')
            .eq('anunciante_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.json({ success: true, campaigns: data || [] });

    } catch (error) {
        console.error('Error my-campaigns:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/* ================================================================
   GET /api/marketing/debug-algo (SOLO PARA PRUEBAS)
================================================================ */

router.get('/debug-algo', autenticar, async (req, res) => {
    try {
        const { target_tipo, target_id } = req.query;
        if (!target_tipo || !target_id) {
            return res.status(400).json({ success: false, error: 'target_tipo y target_id requeridos' });
        }

        const usuario_id = req.user.id;
        const ciudadUsuario = await obtenerCiudadUsuario(usuario_id);
        const categoriaTarget = await obtenerCategoriaTarget(target_tipo, target_id);

        const candidatas = await algoritmoJS({
            target_tipo,
            target_id,
            usuario_id,
            ciudadUsuario,
            categoriaTarget
        });

        return res.json({
            success: true,
            contexto: { ciudadUsuario, categoriaTarget, usuario_id, target_tipo, target_id },
            candidatas
        });

    } catch (error) {
        console.error('Error debug-algo:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;