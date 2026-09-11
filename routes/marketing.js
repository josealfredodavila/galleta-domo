/* ================================================================
   ROUTES/MARKETING.JS - SARIEL'S ECOSYSTEM
   ================================================================
   ENDPOINTS:
   ✅ POST /api/marketing/get-ad         → Devuelve el anuncio a mostrar
   ✅ POST /api/marketing/register-event → Registra impresión/vista/clic
   ✅ POST /api/marketing/descontar      → Descuenta presupuesto
   ✅ GET  /api/marketing/my-campaigns   → Lista campañas del usuario
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

/* ================================================================
   CONFIGURACIÓN DEL ALGORITMO
================================================================ */

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

/* ================================================================
   HELPERS
================================================================ */

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

/* ================================================================
   MIDDLEWARE AUTH
================================================================ */

async function autenticar(req, res, next) {
    const user = await obtenerUsuario(req);
    if (!user) {
        return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    req.user = user;
    next();
}

/* ================================================================
   ✅ POST /api/marketing/get-ad
================================================================ */

router.post('/get-ad', autenticar, async (req, res) => {
    try {
        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Admin no configurado' });
        }

        const { target_tipo, target_id, session_id } = req.body;
        const usuario_id = req.user.id;

        if (!['live', 'grupo'].includes(target_tipo)) {
            return res.status(400).json({ success: false, error: 'target_tipo debe ser "live" o "grupo"' });
        }
        if (!target_id) {
            return res.status(400).json({ success: false, error: 'target_id requerido' });
        }

        const targetField = target_tipo === 'live' ? 'live_id' : 'grupo_id';

        const { data: targets, error: targetsError } = await supabaseAdmin
            .from('marketing_campaign_targets')
            .select(`
                campaign_id,
                marketing_campaigns!inner(
                    id, nombre, estado, presupuesto, gastado, moneda
                )
            `)
            .eq('target_tipo', target_tipo)
            .eq(targetField, target_id);

        if (targetsError) {
            console.error('❌ Error targets:', targetsError);
            return res.status(500).json({ success: false, error: 'Error consultando campañas' });
        }

        if (!targets || targets.length === 0) {
            return res.json({ success: true, ad: null, reason: 'sin_campañas' });
        }

        const campanasValidas = targets
            .map(t => t.marketing_campaigns)
            .filter(c =>
                c &&
                c.estado === 'activa' &&
                parseFloat(c.gastado || 0) < parseFloat(c.presupuesto || 0)
            );

        if (campanasValidas.length === 0) {
            return res.json({ success: true, ad: null, reason: 'sin_presupuesto' });
        }

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

        if (campanasFiltradas.length === 0) {
            return res.json({ success: true, ad: null, reason: 'frecuencia_maxima' });
        }

        // ALGORITMO: menor gastado primero
        campanasFiltradas.sort((a, b) => {
            const gastoA = parseFloat(a.gastado || 0);
            const gastoB = parseFloat(b.gastado || 0);
            return gastoA - gastoB;
        });

        const campanaGanadora = campanasFiltradas[0];

        const { data: ads, error: adsError } = await supabaseAdmin
            .from('marketing_ads')
            .select('*')
            .eq('campaign_id', campanaGanadora.id)
            .eq('activo', true)
            .limit(1);

        if (adsError || !ads || ads.length === 0) {
            return res.json({ success: true, ad: null, reason: 'sin_anuncio' });
        }

        const ad = ads[0];

        // Registrar impresión
        await supabaseAdmin
            .from('marketing_events')
            .insert({
                campaign_id: campanaGanadora.id,
                ad_id: ad.id,
                usuario_id: usuario_id,
                target_tipo: target_tipo,
                [targetField]: target_id,
                evento: 'impresion',
                session_id: session_id || null,
                metadata: {
                    user_agent: req.headers['user-agent'] || null,
                    timestamp: new Date().toISOString()
                }
            });

        // Descontar presupuesto
        await supabaseAdmin.rpc('descontar_presupuesto_campana', {
            p_campaign_id: campanaGanadora.id,
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
            campaign_nombre: campanaGanadora.nombre,
            costo: COSTOS.impresion
        });

    } catch (error) {
        console.error('❌ Error get-ad:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/* ================================================================
   ✅ POST /api/marketing/register-event
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

        const { error: insertError } = await supabaseAdmin
            .from('marketing_events')
            .insert({
                campaign_id,
                ad_id,
                usuario_id,
                target_tipo: target_tipo || null,
                live_id: target_tipo === 'live' ? target_id : null,
                grupo_id: target_tipo === 'grupo' ? target_id : null,
                evento: eventoNormalizado,
                session_id: session_id || null,
                metadata: metadata || {}
            });

        if (insertError) {
            console.error('❌ Error insertando evento:', insertError);
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
        console.error('❌ Error register-event:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/* ================================================================
   ✅ POST /api/marketing/descontar
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
            console.error('❌ Error descontar:', error);
            return res.status(500).json({ success: false, error: 'Error descontando' });
        }

        return res.json({ success: true, resultado: data });

    } catch (error) {
        console.error('❌ Error descontar:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

/* ================================================================
   ✅ GET /api/marketing/my-campaigns
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
        console.error('❌ Error my-campaigns:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;