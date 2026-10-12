// ================================================================
// ROUTES/PAYMENTS/LIVEPASS.JS — Csariel's
//   POST /api/payments/live-pass/create  → crea factura NOWPayments
//   GET  /api/payments/live-pass/status  → estado del Live Pass
// Precios: se leen de planes_membresia (nunca del cliente).
// La activación la hace el webhook IPN (confirmar_live_pass_ipn), no este archivo.
// ================================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const { limitadorPagos } = require('../../middleware/rateLimit');

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const PAY_CURRENCY = 'usdttrc20';
const PLANES_VALIDOS = ['live_basico', 'live_pro'];

const SITE_URL =
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    'https://galleta-domo-production.up.railway.app';

const log = (...args) => console.log('[LivePass]', ...args);
const logError = (...args) => console.error('[LivePass ERROR]', ...args);

// ================================================================
// MIDDLEWARE: valida el JWT con el cliente admin (sin crear clientes por petición)
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
        logError('auth:', e.message);
        return res.status(500).json({ success: false, error: 'auth' });
    }
}

// ================================================================
// POST /create
// ================================================================
router.post('/create', verificarAutenticacion, limitadorPagos, async (req, res) => {
    try {
        const usuarioId = req.user.id;
        const { plan_tipo, privacy_version } = req.body || {};

        if (!PLANES_VALIDOS.includes(plan_tipo)) {
            return res.status(400).json({ success: false, error: 'plan_invalido' });
        }
        if (!NOWPAYMENTS_API_KEY) {
            logError('NOWPAYMENTS_API_KEY no configurada');
            return res.status(500).json({ success: false, error: 'pagos_no_configurados' });
        }

        const { data: usuario, error: errU } = await supabaseAdmin
            .from('usuarios')
            .select('id, email, nombre')
            .eq('id', usuarioId)
            .maybeSingle();
        if (errU || !usuario) return res.status(404).json({ success: false, error: 'usuario_no_encontrado' });

        // Precio y nombre desde la base, nunca desde el cliente
        const { data: plan, error: errP } = await supabaseAdmin
            .from('planes_membresia')
            .select('id, nombre, precio_mxn, intervalo_dias')
            .eq('id', plan_tipo)
            .eq('activo', true)
            .maybeSingle();
        if (errP || !plan) return res.status(404).json({ success: false, error: 'plan_no_disponible' });

        const precioMxn = Number(plan.precio_mxn);
        if (!Number.isFinite(precioMxn) || precioMxn <= 0) {
            return res.status(500).json({ success: false, error: 'precio_invalido' });
        }

        const orderId = `LP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

        const { data: pago, error: errPago } = await supabaseAdmin
            .from('pagos_membresia')
            .insert({
                usuario_id: usuarioId,
                proveedor: 'nowpayments',
                order_id: orderId,
                plan_tipo,
                estado: 'pendiente',
                monto_mxn: precioMxn,
                moneda_pago: PAY_CURRENCY,
                privacy_version: typeof privacy_version === 'string' ? privacy_version.slice(0, 20) : '1.0',
                privacy_accepted_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (errPago || !pago) {
            logError('guardar pago:', errPago?.message);
            return res.status(500).json({ success: false, error: 'no_se_guardo_pago' });
        }

        // Factura en NOWPayments con timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let npData = {};
        let npOk = false;

        try {
            const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': NOWPAYMENTS_API_KEY },
                body: JSON.stringify({
                    price_amount: precioMxn,
                    price_currency: 'mxn',
                    pay_currency: PAY_CURRENCY,
                    order_id: orderId,
                    order_description: `${plan.nombre} Csariel's`,
                    ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
                    success_url: `${SITE_URL}/features/live/membresia-live.html?payment=success`,
                    cancel_url: `${SITE_URL}/features/live/membresia-live.html?payment=cancel`
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
            // Guardamos la respuesta de NOWPayments para diagnosticar el rechazo
            logError('NOWPayments rechazó la factura:', npData);
            await supabaseAdmin
                .from('pagos_membresia')
                .update({
                    estado: 'failed',
                    datos_webhook: { error_creacion: npData, at: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                })
                .eq('id', pago.id);
            return res.status(502).json({ success: false, error: 'pago_no_creado' });
        }

        await supabaseAdmin
            .from('pagos_membresia')
            .update({ payment_url: npData.invoice_url, updated_at: new Date().toISOString() })
            .eq('id', pago.id);

        log('factura creada', orderId, plan_tipo);
        return res.json({
            success: true,
            order_id: orderId,
            payment_url: npData.invoice_url,
            plan_tipo,
            plan_nombre: plan.nombre,
            precio_mxn: precioMxn
        });
    } catch (e) {
        logError('create:', e.message);
        return res.status(500).json({ success: false, error: 'interno' });
    }
});

// ================================================================
// GET /status
// ================================================================
router.get('/status', verificarAutenticacion, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.rpc('puede_transmitir_live', {
            p_usuario_id: req.user.id
        });
        if (error) {
            logError('status:', error.message);
            return res.status(500).json({ success: false, error: 'db' });
        }
        return res.json({ success: true, data });
    } catch (e) {
        logError('status:', e.message);
        return res.status(500).json({ success: false, error: 'interno' });
    }
});

module.exports = router;