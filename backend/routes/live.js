// ================================================================
// ROUTES/LIVE.JS - SARIEL'S ECOSYSTEM
// ================================================================
// Endpoints del sistema Live:
//   POST /api/live/registrar-minuto       → Descuenta 1 minuto del Live Pass
//   POST /api/live/donacion/crear         → Crea donación en NOWPayments
//   GET  /api/live/donacion/:id/estado    → Consulta estado de donación
// ================================================================

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const SITE_URL =
    process.env.SITE_URL ||
    process.env.PUBLIC_APP_URL ||
    'https://galleta-domo-production.up.railway.app';

// ================================================================
// MIDDLEWARE
// ================================================================
async function verificarAutenticacion(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }
        const token = authHeader.slice(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token vacío' });
        }
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    } catch (error) {
        console.error('[Live] Error auth:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

// ================================================================
// POST /api/live/registrar-minuto
// ================================================================
router.post('/registrar-minuto', verificarAutenticacion, async (req, res) => {
    try {
        const usuarioId = req.user.id;

        const { data, error } = await supabaseAdmin.rpc('registrar_minuto_live', {
            p_usuario_id: usuarioId
        });

        if (error) {
            console.error('[Live] Error registrar_minuto_live:', error);
            return res.status(500).json({ success: false, error: 'Error registrando minuto' });
        }

        if (!data || data.success !== true) {
            return res.status(403).json({
                success: false,
                error: data?.error || 'limite_alcanzado',
                minutos_usados: data?.minutos_usados,
                minutos_limite: data?.minutos_limite,
                minutos_restantes: data?.minutos_restantes
            });
        }

        return res.json({
            success: true,
            minutos_usados: data.minutos_usados,
            minutos_limite: data.minutos_limite,
            minutos_restantes: data.minutos_restantes
        });
    } catch (error) {
        console.error('[Live] Error en /registrar-minuto:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// POST /api/live/donacion/crear
// ================================================================
router.post('/donacion/crear', verificarAutenticacion, async (req, res) => {
    try {
        const { transmision_id, monto_usd, pay_currency } = req.body;
        const donanteId = req.user.id;

        if (!transmision_id || !monto_usd || !pay_currency) {
            return res.status(400).json({
                success: false,
                error: 'Faltan parámetros: transmision_id, monto_usd, pay_currency'
            });
        }

        const montoNum = parseFloat(monto_usd);
        if (!Number.isFinite(montoNum) || montoNum < 1 || montoNum > 10000) {
            return res.status(400).json({
                success: false,
                error: 'Monto inválido (min $1, max $10000)'
            });
        }

        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({ success: false, error: 'NOWPayments no configurado' });
        }

        const { data: transmision, error: errT } = await supabaseAdmin
            .from('transmisiones')
            .select('id, streamer_id, estado, is_live')
            .eq('id', transmision_id)
            .maybeSingle();

        if (errT) {
            console.error('[Live] Error consultando transmisión:', errT);
            return res.status(500).json({ success: false, error: 'Error consultando transmisión' });
        }

        if (!transmision || transmision.estado !== 'en_vivo' || !transmision.is_live) {
            return res.status(404).json({ success: false, error: 'Transmisión no activa' });
        }

        if (transmision.streamer_id === donanteId) {
            return res.status(400).json({ success: false, error: 'No puedes donarte a ti mismo' });
        }

        const idempotencyKey = `don-${transmision_id}-${donanteId}-${Date.now()}`;

        const { data: donacion, error: errD } = await supabaseAdmin.rpc(
            'iniciar_donacion_live',
            {
                p_transmision_id: transmision_id,
                p_donante_id: donanteId,
                p_monto_usd: montoNum,
                p_idempotency_key: idempotencyKey
            }
        );

        if (errD) {
            console.error('[Live] Error iniciar_donacion_live:', errD);
            return res.status(500).json({ success: false, error: 'Error creando donación' });
        }

        if (!donacion || donacion.success !== true || !donacion.donacion_id) {
            return res.status(500).json({
                success: false,
                error: donacion?.error || 'No se creó la donación'
            });
        }

        const donacionId = donacion.donacion_id;
        const orderId = `DON-${donacionId}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        let npData = {};
        let npOk = false;

        try {
            const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': NOWPAYMENTS_API_KEY
                },
                body: JSON.stringify({
                    price_amount: montoNum,
                    price_currency: 'usd',
                    pay_currency: pay_currency,
                    order_id: orderId,
                    order_description: `Donación Live #${transmision_id}`,
                    ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
                    success_url: `${SITE_URL}/features/live/live.html?payment=success&don=${donacionId}`,
                    cancel_url: `${SITE_URL}/features/live/live.html?payment=cancel&don=${donacionId}`
                }),
                signal: controller.signal
            });

            npData = await response.json().catch(() => ({}));
            npOk = response.ok;
        } catch (fetchErr) {
            npData = { message: fetchErr.message };
            npOk = false;
        } finally {
            clearTimeout(timeout);
        }

        if (!npOk || !npData.invoice_url) {
            console.error('[Live] Error NOWPayments:', npData);
            await supabaseAdmin
                .from('live_donaciones')
                .update({ estado: 'fallida' })
                .eq('id', donacionId);
            return res.status(502).json({
                success: false,
                error: npData.message || 'Error al crear pago en NOWPayments'
            });
        }

        return res.status(201).json({
            success: true,
            id: donacionId,
            donacion_id: donacionId,
            payment_url: npData.invoice_url,
            monto_usd: montoNum,
            pay_currency: pay_currency
        });
    } catch (error) {
        console.error('[Live] Error en /donacion/crear:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ================================================================
// GET /api/live/donacion/:id/estado
// ================================================================
router.get('/donacion/:id/estado', verificarAutenticacion, async (req, res) => {
    try {
        const donacionId = parseInt(req.params.id, 10);

        if (!Number.isInteger(donacionId) || donacionId <= 0) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const { data, error } = await supabaseAdmin
            .from('live_donaciones')
            .select('id, estado, monto_usd, donante_id')
            .eq('id', donacionId)
            .maybeSingle();

        if (error) {
            console.error('[Live] Error consultando donación:', error);
            return res.status(500).json({ success: false, error: 'Error consultando donación' });
        }

        if (!data) {
            return res.status(404).json({ success: false, error: 'Donación no encontrada' });
        }

        if (data.donante_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        return res.json({
            success: true,
            id: data.id,
            estado: data.estado,
            monto_usd: data.monto_usd
        });
    } catch (error) {
        console.error('[Live] Error en /donacion/:id/estado:', error);
        return res.status(500).json({ success: false, error: 'Error interno' });
    }
});

module.exports = router;