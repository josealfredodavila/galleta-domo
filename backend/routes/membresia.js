// ================================================================
// MEMBRESIA.JS - SARIEL'S ECOSYSTEM
// v2 · Pago directo NOWPayments (/v1/payment) para Pro
// ================================================================
// Cambio: antes usaba /v1/invoice (página vacía al cargar). Ahora
// crea el pago directo; la página de NOWPayments muestra monto en
// USDT, red TRX, dirección y QR de inmediato.
// ================================================================

const express = require('express');
const router = express.Router();

const { createClient } = require('@supabase/supabase-js');

const { limitadorPagos } = require('../middleware/rateLimit');

// ===== CONFIGURACIÓN =====
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_PAGO_URL = 'https://api.nowpayments.io/v1/payment';
const PAY_CURRENCY = 'usdttrc20';

const DEFAULT_SITE_URL = 'https://galleta-domo-production.up.railway.app';

const SITE_URL =
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    DEFAULT_SITE_URL;

// Página hosted de NOWPayments: monto, red, dirección y QR
const urlPaginaPago = (paymentId) =>
    `https://nowpayments.io/payment/?iid=${encodeURIComponent(paymentId)}`;

console.log('🔑 NOWPAYMENTS_API_KEY:', NOWPAYMENTS_API_KEY ? '✅ Definida' : '❌ NO DEFINIDA');
console.log('🌐 SITE_URL:', SITE_URL);

// ===== SUPABASE ADMIN =====
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ================================================================

async function verificarAutenticacion(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No autenticado: token requerido' });
        }

        const token = authHeader.slice(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'No autenticado: token vacío' });
        }

        const supabaseUser = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                auth: { autoRefreshToken: false, persistSession: false },
                global: { headers: { Authorization: `Bearer ${token}` } }
            }
        );

        const { data: { user }, error } = await supabaseUser.auth.getUser();

        if (error || !user) {
            console.error('❌ Error de autenticación:', error);
            return res.status(401).json({ success: false, error: 'Token inválido' });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Error en autenticación:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

// ================================================================
// POST /api/payments/membresia/create
// ================================================================

router.post('/create', verificarAutenticacion, limitadorPagos, async (req, res) => {
    try {
        console.log('📩 Solicitud de membresía recibida');

        const { privacy_version } = req.body || {};
        const usuario_id = req.user.id;

        if (!supabaseAdmin) {
            return res.status(500).json({
                success: false,
                error: 'Error de configuración: supabaseAdmin no disponible.'
            });
        }

        if (!NOWPAYMENTS_API_KEY) {
            console.error('❌ NOWPAYMENTS_API_KEY no configurada');
            return res.status(500).json({ success: false, error: 'Servicio de pagos no configurado' });
        }

        const { data: usuario, error: userError } = await supabaseAdmin
            .from('usuarios')
            .select('id, email, nombre')
            .eq('id', usuario_id)
            .single();

        if (userError || !usuario) {
            console.error('❌ Error obteniendo usuario:', userError);
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const { data: plan, error: planError } = await supabaseAdmin
            .from('planes_membresia')
            .select('id, nombre, precio_mxn, intervalo_dias')
            .eq('id', 'pro')
            .eq('activo', true)
            .single();

        if (planError || !plan) {
            console.error('❌ Plan Pro no encontrado:', planError);
            return res.status(404).json({ success: false, error: 'Plan Pro no disponible' });
        }

        const precioMxn = parseFloat(plan.precio_mxn);
        const orderId = `PRO-${Date.now()}-${usuario_id.slice(0, 8)}`;

        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .insert({
                usuario_id: usuario_id,
                proveedor: 'nowpayments',
                order_id: orderId,
                estado: 'pendiente',
                monto_mxn: precioMxn,
                privacy_version: privacy_version || '1.0',
                privacy_accepted_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (pagoError || !pago) {
            console.error('❌ Error guardando pago:', pagoError);
            return res.status(500).json({ success: false, error: 'Error al guardar pago' });
        }

        // ---------- Pago directo en NOWPayments ----------
        let nowpaymentsData = {};
        let nowpaymentsOk = false;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const respuesta = await fetch(NOWPAYMENTS_PAGO_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': NOWPAYMENTS_API_KEY
                },
                body: JSON.stringify({
                    price_amount: precioMxn,
                    price_currency: 'mxn',
                    pay_currency: PAY_CURRENCY,
                    order_id: orderId,
                    order_description: `Membresía Sariel's Pro - ${usuario.email}`,
                    ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`
                }),
                signal: controller.signal
            });

            nowpaymentsData = await respuesta.json().catch(() => ({}));
            nowpaymentsOk = respuesta.ok;
        } catch (fetchError) {
            nowpaymentsData = { message: fetchError.message };
            nowpaymentsOk = false;
        } finally {
            clearTimeout(timeout);
        }

        if (!nowpaymentsOk || !nowpaymentsData.payment_id || !nowpaymentsData.pay_address) {
            console.error('❌ Error en NOWPayments:', nowpaymentsData);

            await supabaseAdmin
                .from('pagos_membresia')
                .update({ estado: 'failed', updated_at: new Date().toISOString() })
                .eq('id', pago.id);

            return res.status(502).json({
                success: false,
                error: nowpaymentsData.message || 'Error al crear pago en NOWPayments'
            });
        }

        const paymentId = String(nowpaymentsData.payment_id);
        const paymentUrl = urlPaginaPago(paymentId);

        const { error: urlError } = await supabaseAdmin
            .from('pagos_membresia')
            .update({
                payment_id: paymentId,
                payment_url: paymentUrl,
                moneda_pago: nowpaymentsData.pay_currency || PAY_CURRENCY,
                updated_at: new Date().toISOString()
            })
            .eq('id', pago.id);

        if (urlError) {
            console.error('⚠️ No se pudo guardar payment_url:', urlError.message);
        }

        res.json({
            success: true,
            order_id: orderId,
            payment_id: paymentId,
            payment_url: paymentUrl,
            pay_address: nowpaymentsData.pay_address,
            pay_amount: nowpaymentsData.pay_amount,
            pay_currency: nowpaymentsData.pay_currency || PAY_CURRENCY,
            price_amount: precioMxn,
            price_currency: 'MXN'
        });

    } catch (error) {
        console.error('❌ Error en /membresia/create:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// ================================================================
// GET /api/payments/membresia/status
// ================================================================

router.get('/status', verificarAutenticacion, async (req, res) => {
    try {
        const usuario_id = req.user.id;

        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Servicio no configurado' });
        }

        const { data, error } = await supabaseAdmin
            .rpc('obtener_membresia_usuario', {
                p_usuario_id: usuario_id
            });

        if (error) {
            console.error('❌ Error en obtener_membresia_usuario:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('❌ Error en /membresia/status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// EXPORTAR
// ================================================================

module.exports = router;