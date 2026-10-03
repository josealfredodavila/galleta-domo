// ================================================================
// LIVEPASS.JS - SARIEL'S ECOSYSTEM
// Endpoint para Live Pass (Básico y Pro)
//
// Reutiliza la misma lógica de membresia.js pero:
// - Acepta 2 planes: 'live_basico' y 'live_pro'
// - El webhook activará la RPC `activar_live_pass` (no `activar_membresia_pro`)
// - Guarda en `pagos_membresia` con order_id distinto: LP-XXXX
//
// PRECIOS:
// - live_basico: $300 MXN / 30 días / 2h al día
// - live_pro:    $600 MXN / 30 días / 5h al día
//
// ENDPOINTS:
// - POST /api/payments/live-pass/create
// - GET  /api/payments/live-pass/status
// ================================================================

const express = require('express');
const router = express.Router();

const { createClient } = require('@supabase/supabase-js');

const { limitadorPagos } = require('../middleware/rateLimit');

// ===== CONFIGURACIÓN =====
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const PAY_CURRENCY = 'usdttrc20';

const DEFAULT_SITE_URL = 'https://galleta-domo-production.up.railway.app';

const SITE_URL =
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    DEFAULT_SITE_URL;

console.log('🔑 [LivePass] NOWPAYMENTS_API_KEY:', NOWPAYMENTS_API_KEY ? '✅ Definida' : '❌ NO DEFINIDA');
console.log('🌐 [LivePass] SITE_URL:', SITE_URL);

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
            console.error('❌ [LivePass] Error de autenticación:', error);
            return res.status(401).json({ success: false, error: 'Token inválido' });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ [LivePass] Error en autenticación:', error);
        return res.status(500).json({ success: false, error: 'Error de autenticación' });
    }
}

// ================================================================
// POST /api/payments/live-pass/create
// ================================================================

router.post('/create', verificarAutenticacion, limitadorPagos, async (req, res) => {
    try {
        console.log('📩 [LivePass] Solicitud recibida');

        const { plan_tipo, privacy_version } = req.body;
        const usuario_id = req.user.id;

        console.log('👤 [LivePass] Usuario ID:', usuario_id);
        console.log('📦 [LivePass] Plan solicitado:', plan_tipo);

        // Validar plan
        if (plan_tipo !== 'live_basico' && plan_tipo !== 'live_pro') {
            return res.status(400).json({
                success: false,
                error: 'Plan inválido. Debe ser "live_basico" o "live_pro"'
            });
        }

        // Verificar configuración
        if (!supabaseAdmin) {
            console.error('❌ [LivePass] supabaseAdmin NO DISPONIBLE');
            return res.status(500).json({
                success: false,
                error: 'Error de configuración: supabaseAdmin no disponible.'
            });
        }

        if (!NOWPAYMENTS_API_KEY) {
            console.error('❌ [LivePass] NOWPAYMENTS_API_KEY no configurada');
            return res.status(500).json({ success: false, error: 'Servicio de pagos no configurado' });
        }

        // Obtener usuario
        const { data: usuario, error: userError } = await supabaseAdmin
            .from('usuarios')
            .select('id, email, nombre')
            .eq('id', usuario_id)
            .single();

        if (userError || !usuario) {
            console.error('❌ [LivePass] Error obteniendo usuario:', userError);
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        console.log('👤 [LivePass] Usuario encontrado:', usuario.email);

        // Obtener plan de la BD
        const { data: plan, error: planError } = await supabaseAdmin
            .from('planes_membresia')
            .select('id, nombre, precio_mxn, intervalo_dias')
            .eq('id', plan_tipo)
            .eq('activo', true)
            .single();

        if (planError || !plan) {
            console.error('❌ [LivePass] Plan no encontrado:', planError);
            return res.status(404).json({ success: false, error: 'Plan no disponible' });
        }

        const precioMxn = parseFloat(plan.precio_mxn);
        console.log('✅ [LivePass] Plan encontrado:', plan.nombre, '$' + precioMxn);

        // Generar order_id con prefijo LP (Live Pass)
        const orderId = `LP-${Date.now()}-${usuario_id.slice(0, 8)}`;
        console.log('📦 [LivePass] Order ID generado:', orderId);

        // ------------------------------------------------------------
        // 1) GUARDAR EL PAGO COMO PENDIENTE
        // ------------------------------------------------------------
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
            console.error('❌ [LivePass] Error guardando pago:', pagoError);
            return res.status(500).json({ success: false, error: 'Error al guardar pago' });
        }

        console.log('✅ [LivePass] Pago pendiente guardado:', pago.id);

        // ------------------------------------------------------------
        // 2) CREAR INVOICE EN NOWPAYMENTS
        // ------------------------------------------------------------
        const invoiceData = {
            price_amount: precioMxn,
            price_currency: 'mxn',
            pay_currency: PAY_CURRENCY,
            order_id: orderId,
            order_description: `${plan.nombre} Sariel's - ${usuario.email}`,
            ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
            success_url: `${SITE_URL}/features/live/membresia-live.html?payment=success`,
            cancel_url: `${SITE_URL}/features/live/membresia-live.html?payment=cancel`
        };

        console.log('📤 [LivePass] Enviando invoice a NOWPayments...');

        let nowpaymentsOk = false;
        let nowpaymentsData = {};

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const nowpaymentsResponse = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': NOWPAYMENTS_API_KEY
                },
                body: JSON.stringify(invoiceData),
                signal: controller.signal
            });

            nowpaymentsData = await nowpaymentsResponse.json().catch(() => ({}));
            nowpaymentsOk = nowpaymentsResponse.ok;
        } catch (fetchError) {
            nowpaymentsData = { message: fetchError.message };
            nowpaymentsOk = false;
        } finally {
            clearTimeout(timeout);
        }

        if (!nowpaymentsOk || !nowpaymentsData.invoice_url) {
            console.error('❌ [LivePass] Error en NOWPayments:', nowpaymentsData);

            await supabaseAdmin
                .from('pagos_membresia')
                .update({ estado: 'failed', updated_at: new Date().toISOString() })
                .eq('id', pago.id);

            return res.status(502).json({
                success: false,
                error: nowpaymentsData.message || 'Error al crear pago en NOWPayments'
            });
        }

        console.log('✅ [LivePass] Invoice creado:', nowpaymentsData.id);
        console.log('🔗 [LivePass] URL de pago:', nowpaymentsData.invoice_url);

        // ------------------------------------------------------------
        // 3) GUARDAR LA URL DEL INVOICE
        // ------------------------------------------------------------
        const { error: urlError } = await supabaseAdmin
            .from('pagos_membresia')
            .update({
                payment_url: nowpaymentsData.invoice_url,
                moneda_pago: nowpaymentsData.pay_currency || PAY_CURRENCY,
                updated_at: new Date().toISOString()
            })
            .eq('id', pago.id);

        if (urlError) {
            console.error('⚠️ [LivePass] No se pudo guardar payment_url:', urlError.message);
        }

        res.json({
            success: true,
            order_id: orderId,
            payment_id: null,
            payment_url: nowpaymentsData.invoice_url,
            pay_address: null,
            price_amount: precioMxn,
            price_currency: 'MXN',
            plan_tipo: plan_tipo,
            plan_nombre: plan.nombre
        });

    } catch (error) {
        console.error('❌ [LivePass] Error en /create:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// ================================================================
// GET /api/payments/live-pass/status
// ================================================================

router.get('/status', verificarAutenticacion, async (req, res) => {
    try {
        const usuario_id = req.user.id;

        console.log('📊 [LivePass] Consultando estado para:', usuario_id);

        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Servicio no configurado' });
        }

        const { data, error } = await supabaseAdmin
            .rpc('puede_transmitir_live', {
                p_usuario_id: usuario_id
            });

        if (error) {
            console.error('❌ [LivePass] Error en puede_transmitir_live:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        console.log('✅ [LivePass] Estado obtenido:', data);

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('❌ [LivePass] Error en /status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// EXPORTAR
// ================================================================

module.exports = router;