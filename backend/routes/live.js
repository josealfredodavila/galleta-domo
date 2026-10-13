// ================================================================
// RUTAS LIVE — Csariel's
//   POST /api/live/registrar-minuto            → descuenta 1 min del Live Pass
//   POST /api/live/donacion/crear              → donación en live.html
//   POST /api/live/donacion/canal/crear        → donación en un canal (solo con live activo)
//   GET  /api/live/donacion/:id/estado         → estado de la donación (solo el donante)
// Todas las operaciones usan supabaseAdmin (service_role) de config/supabase.js.
// Las RPC de dinero están revocadas para anon/authenticated: solo el servidor las llama.
// v3: montos de donación de 20, 50, 100 y 200 USD (mínimo de la pasarela).
// ================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const SITE_URL = process.env.SITE_URL || process.env.PUBLIC_APP_URL || 'https://galleta-domo-production.up.railway.app';

// Montos permitidos en lives y en canales (mínimo 20 USD: la pasarela rechaza montos menores)
const MONTOS_DONACION = new Set([20, 50, 100, 200]);

// Redes permitidas en lives: id del cliente → código de moneda de NOWPayments.
// VERIFICAR los códigos con GET https://api.nowpayments.io/v1/currencies antes de producción.
const REDES_NOWPAYMENTS = {
    usdttrc20:   'usdttrc20',
    usdtpolygon: 'usdtmatic',
    usdtsol:     'usdtsol',
    usdtbsc:     'usdtbsc',
    usdcpolygon: 'usdcmatic',
    usdcsol:     'usdcsol',
    usdcbsc:     'usdcbsc'
};

// Redes que se ofrecen en canales
const REDES_CANAL = {
    usdttrc20: 'usdttrc20',
    usdcpolygon: 'usdcmatic'
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = (...args) => console.log('[Live]', ...args);
const logError = (...args) => console.error('[Live ERROR]', ...args);

// ================================================================
// MIDDLEWARE: verifica el JWT con Supabase
// ================================================================
async function verificarAutenticacion(req, res, next) {
    try {
        if (!supabaseAdmin) return res.status(500).json({ success: false, error: 'config' });

        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'no_autenticado' });
        }
        const token = authHeader.slice(7).trim();
        if (!token) return res.status(401).json({ success: false, error: 'no_autenticado' });

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) return res.status(401).json({ success: false, error: 'sesion_invalida' });

        req.user = user;
        return next();
    } catch (e) {
        logError('Auth:', e.message);
        return res.status(500).json({ success: false, error: 'auth' });
    }
}

// ================================================================
// Crea la factura de NOWPayments para una donación ya registrada.
// Si falla, marca la donación como fallida y devuelve null.
// ================================================================
async function crearFacturaDonacion({ donacionId, montoNum, payCurrencyNP, descripcion, urlRetorno }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let npData = {};
    let npOk = false;

    try {
        const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': NOWPAYMENTS_API_KEY },
            body: JSON.stringify({
                price_amount: montoNum,
                price_currency: 'usd',
                pay_currency: payCurrencyNP,
                order_id: `DON-${donacionId}`,
                order_description: descripcion,
                ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
                success_url: `${urlRetorno}&payment=success`,
                cancel_url: `${urlRetorno}&payment=cancel`
            }),
            signal: controller.signal
        });
        npData = await response.json().catch(() => ({}));
        npOk = response.ok;
    } catch (e) {
        npData = { message: e.message };
    } finally {
        clearTimeout(timeout);
    }

    if (!npOk || !npData.invoice_url) {
        logError('NOWPayments:', npData);
        await supabaseAdmin.from('live_donaciones').update({ estado: 'fallida' }).eq('id', donacionId);
        return null;
    }
    return npData.invoice_url;
}

// ================================================================
// POST /registrar-minuto
// Solo cobra si el usuario tiene un live activo (live.html con Live Pass).
// Los lives de canal usan registrar_minuto_canal desde el cliente.
// ================================================================
router.post('/registrar-minuto', verificarAutenticacion, async (req, res) => {
    try {
        const uid = req.user.id;

        const { data: activo, error: errA } = await supabaseAdmin
            .from('transmisiones')
            .select('id')
            .eq('streamer_id', uid)
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .maybeSingle();

        if (errA) {
            logError('Consulta de live activo:', errA.message);
            return res.status(500).json({ success: false, error: 'db' });
        }
        if (!activo) return res.status(409).json({ success: false, error: 'sin_live_activo' });

        const { data, error } = await supabaseAdmin.rpc('registrar_minuto_live', { p_usuario_id: uid });

        if (error) {
            logError('registrar_minuto_live:', error.message);
            return res.status(500).json({ success: false, error: 'db' });
        }

        if (!data || data.success !== true) {
            return res.status(403).json({
                success: false,
                error: data?.error || 'limite_alcanzado',
                minutos_usados: data?.minutos_usados,
                minutos_limite: data?.minutos_limite
            });
        }

        return res.json({
            success: true,
            minutos_usados: data.minutos_usados,
            minutos_limite: data.minutos_limite,
            minutos_restantes: data.minutos_restantes
        });
    } catch (e) {
        logError('registrar-minuto:', e.message);
        return res.status(500).json({ success: false, error: 'interno' });
    }
});

// ================================================================
// POST /donacion/crear  (live.html)
// ================================================================
router.post('/donacion/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { transmision_id, monto_usd, pay_currency } = req.body || {};
        const donanteId = req.user.id;

        const transmisionId = Number(transmision_id);
        if (!Number.isInteger(transmisionId) || transmisionId <= 0) {
            return res.status(400).json({ success: false, error: 'transmision_invalida' });
        }

        const montoNum = Number(monto_usd);
        if (!MONTOS_DONACION.has(montoNum)) {
            return res.status(400).json({ success: false, error: 'monto_invalido' });
        }

        if (typeof pay_currency !== 'string' || !Object.prototype.hasOwnProperty.call(REDES_NOWPAYMENTS, pay_currency)) {
            return res.status(400).json({ success: false, error: 'red_invalida' });
        }

        if (!NOWPAYMENTS_API_KEY) {
            logError('NOWPAYMENTS_API_KEY ausente');
            return res.status(500).json({ success: false, error: 'pagos_no_configurados' });
        }

        const { data: t, error: errT } = await supabaseAdmin
            .from('transmisiones')
            .select('id, streamer_id, estado, is_live')
            .eq('id', transmisionId)
            .maybeSingle();

        if (errT) {
            logError('Consulta de transmisión:', errT.message);
            return res.status(500).json({ success: false, error: 'db' });
        }
        if (!t || t.estado !== 'en_vivo' || t.is_live !== true) {
            return res.status(404).json({ success: false, error: 'transmision_no_activa' });
        }
        if (t.streamer_id === donanteId) {
            return res.status(400).json({ success: false, error: 'no_puedes_donarte' });
        }

        const idempotencyKey = `don-${transmisionId}-${donanteId}-${crypto.randomUUID()}`;
        const { data: d, error: errD } = await supabaseAdmin.rpc('iniciar_donacion_live', {
            p_transmision_id: transmisionId,
            p_donante_id: donanteId,
            p_monto_usd: montoNum,
            p_idempotency_key: idempotencyKey
        });

        if (errD || !d || d.success !== true || !d.donacion_id) {
            logError('iniciar_donacion_live:', errD?.message || d?.error);
            return res.status(500).json({ success: false, error: 'no_se_creo_donacion' });
        }

        const donacionId = d.donacion_id;

        const urlPago = await crearFacturaDonacion({
            donacionId,
            montoNum,
            payCurrencyNP: REDES_NOWPAYMENTS[pay_currency],
            descripcion: `Donación Live #${transmisionId}`,
            urlRetorno: `${SITE_URL}/features/live/live.html?don=${donacionId}`
        });

        if (!urlPago) return res.status(502).json({ success: false, error: 'pago_no_creado' });

        return res.status(201).json({
            success: true,
            donacion_id: donacionId,
            payment_url: urlPago,
            monto_usd: montoNum
        });
    } catch (e) {
        logError('donacion/crear:', e.message);
        return res.status(500).json({ success: false, error: 'interno' });
    }
});

// ================================================================
// POST /donacion/canal/crear  (grupos — solo con live activo en el canal)
// Body: { grupo_id, monto_usd, pay_currency }
// El creador se toma del live activo del canal, nunca del cliente.
// ================================================================
router.post('/donacion/canal/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { grupo_id, monto_usd, pay_currency } = req.body || {};
        const donanteId = req.user.id;

        if (typeof grupo_id !== 'string' || !UUID_RE.test(grupo_id)) {
            return res.status(400).json({ success: false, error: 'grupo_invalido' });
        }

        const montoNum = Number(monto_usd);
        if (!MONTOS_DONACION.has(montoNum)) {
            return res.status(400).json({ success: false, error: 'monto_invalido' });
        }

        if (typeof pay_currency !== 'string' || !Object.prototype.hasOwnProperty.call(REDES_CANAL, pay_currency)) {
            return res.status(400).json({ success: false, error: 'red_invalida' });
        }

        if (!NOWPAYMENTS_API_KEY) {
            logError('NOWPAYMENTS_API_KEY ausente');
            return res.status(500).json({ success: false, error: 'pagos_no_configurados' });
        }

        // Live activo del canal (el servidor decide a quién va la donación)
        const { data: live, error: errLive } = await supabaseAdmin
            .from('transmisiones')
            .select('id, streamer_id, estado, is_live')
            .eq('grupo_id', grupo_id)
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .maybeSingle();

        if (errLive) {
            logError('Consulta de live del canal:', errLive.message);
            return res.status(500).json({ success: false, error: 'db' });
        }
        if (!live) {
            return res.status(409).json({ success: false, error: 'sin_live_activo' });
        }
        if (live.streamer_id === donanteId) {
            return res.status(400).json({ success: false, error: 'no_puedes_donarte' });
        }

        const idempotencyKey = `don-canal-${live.id}-${donanteId}-${crypto.randomUUID()}`;
        const { data: d, error: errD } = await supabaseAdmin.rpc('iniciar_donacion_live', {
            p_transmision_id: live.id,
            p_donante_id: donanteId,
            p_monto_usd: montoNum,
            p_idempotency_key: idempotencyKey
        });

        if (errD || !d || d.success !== true || !d.donacion_id) {
            logError('iniciar_donacion_live (canal):', errD?.message || d?.error);
            return res.status(500).json({ success: false, error: 'no_se_creo_donacion' });
        }

        const donacionId = d.donacion_id;

        const urlPago = await crearFacturaDonacion({
            donacionId,
            montoNum,
            payCurrencyNP: REDES_CANAL[pay_currency],
            descripcion: `Donación al canal #${live.id}`,
            urlRetorno: `${SITE_URL}/features/grupos/grupos.html?grupo=${grupo_id}&don=${donacionId}`
        });

        if (!urlPago) return res.status(502).json({ success: false, error: 'pago_no_creado' });

        return res.status(201).json({
            success: true,
            donacion_id: donacionId,
            payment_url: urlPago,
            monto_usd: montoNum
        });
    } catch (e) {
        logError('donacion/canal/crear:', e.message);
        return res.status(500).json({ success: false, error: 'interno' });
    }
});

// ================================================================
// GET /donacion/:id/estado — solo el donante puede consultarla
// ================================================================
router.get('/donacion/:id/estado', verificarAutenticacion, async (req, res) => {
    try {
        const donacionId = Number(req.params.id);
        if (!Number.isInteger(donacionId) || donacionId <= 0) {
            return res.status(400).json({ success: false, error: 'id_invalido' });
        }

        const { data, error } = await supabaseAdmin
            .from('live_donaciones')
            .select('id, estado, monto_usd, donante_id')
            .eq('id', donacionId)
            .maybeSingle();

        if (error) {
            logError('Consulta de donación:', error.message);
            return res.status(500).json({ success: false, error: 'db' });
        }
        if (!data) return res.status(404).json({ success: false, error: 'no_encontrada' });
        if (data.donante_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'no_autorizado' });
        }

        const { data: perfil } = await supabaseAdmin
            .from('usuarios')
            .select('nombre')
            .eq('id', data.donante_id)
            .maybeSingle();

        return res.json({
            success: true,
            id: data.id,
            estado: data.estado,
            monto_usd: data.monto_usd,
            donador_nombre: perfil?.nombre || 'Explorador'
        });
    } catch (e) {
        logError('donacion/estado:', e.message);
        return res.status(500).json({ success: false, error: 'interno' });
    }
});

module.exports = router;