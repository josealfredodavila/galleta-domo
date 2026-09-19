// ================================================================
// MEMBRESIA.JS - SARIEL'S ECOSYSTEM
// VERSIÓN SIMPLIFICADA - CON VERIFICACIÓN DE SUPABASE
//
// CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR
// 1) El pago se guarda en Supabase (estado 'pendiente') ANTES de
//    crear el cobro en NOWPayments. Antes era al revés: si el INSERT
//    fallaba, el usuario podía pagar y el webhook no encontraba la fila
//    (pagó y no recibía la membresía).
// 2) Se usa POST /v1/invoice. El endpoint /v1/payment NO devuelve
//    invoice_url ni acepta success_url/cancel_url, así que payment_url
//    quedaba vacío. /v1/invoice sí devuelve invoice_url.
// 3) Monedas en minúsculas y con ticker válido: price_currency 'mxn',
//    pay_currency 'usdttrc20' (el mismo que usa payments.js).
// 4) Timeout de 15 s en la llamada a NOWPayments y limitadorPagos.
// 5) Si NOWPayments falla, la fila queda en estado 'failed'.
//
// El webhook (/api/webhook/nowpayments) encuentra el pago por order_id
// y la RPC activar_membresia_pro completa payment_id al confirmarse.
// ================================================================

const express = require('express');
const router = express.Router();

const { limitadorPagos } = require('../middleware/rateLimit');

// ===== CONFIGURACIÓN =====
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const SITE_URL = process.env.SITE_URL || 'https://sariels.xyz';
const PAY_CURRENCY = 'usdttrc20';

console.log('🔑 NOWPAYMENTS_API_KEY:', NOWPAYMENTS_API_KEY ? '✅ Definida' : '❌ NO DEFINIDA');
console.log('🌐 SITE_URL:', SITE_URL);

// ===== SUPABASE ADMIN =====
let supabaseAdmin = null;

try {
    const supabaseConfig = require('../config/supabase');
    supabaseAdmin = supabaseConfig.supabaseAdmin;
    console.log('✅ supabaseAdmin cargado:', supabaseAdmin ? '✅ Disponible' : '❌ NO DISPONIBLE');
} catch (error) {
    console.error('❌ Error cargando config/supabase.js:', error.message);
}

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

        const { createClient: createUserClient } = require('@supabase/supabase-js');
        const supabaseUser = createUserClient(
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

        const { privacy_version } = req.body;
        const usuario_id = req.user.id;

        console.log('👤 Usuario ID:', usuario_id);

        // 🔴 VERIFICACIÓN CRÍTICA
        if (!supabaseAdmin) {
            console.error('❌ supabaseAdmin NO DISPONIBLE');
            return res.status(500).json({
                success: false,
                error: 'Error de configuración: supabaseAdmin no disponible. Verifica SUPABASE_SERVICE_ROLE_KEY en Railway.'
            });
        }

        if (!NOWPAYMENTS_API_KEY) {
            console.error('❌ NOWPAYMENTS_API_KEY no configurada');
            return res.status(500).json({ success: false, error: 'Servicio de pagos no configurado' });
        }

        // Obtener usuario
        const { data: usuario, error: userError } = await supabaseAdmin
            .from('usuarios')
            .select('id, email, nombre')
            .eq('id', usuario_id)
            .single();

        if (userError || !usuario) {
            console.error('❌ Error obteniendo usuario:', userError);
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        console.log('👤 Usuario encontrado:', usuario.email);

        // Obtener plan Pro (el precio SIEMPRE sale de la base de datos)
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
        console.log('✅ Plan encontrado:', plan.nombre, '$' + precioMxn);

        // Generar order_id
        const orderId = `PRO-${Date.now()}-${usuario_id.slice(0, 8)}`;
        console.log('📦 Order ID generado:', orderId);

        // ------------------------------------------------------------
        // 1) GUARDAR EL PAGO COMO PENDIENTE (antes de cobrar)
        // payment_id queda NULL hasta que llegue el webhook.
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
            console.error('❌ Error guardando pago:', pagoError);
            return res.status(500).json({ success: false, error: 'Error al guardar pago' });
        }

        console.log('✅ Pago pendiente guardado en Supabase:', pago.id);

        // ------------------------------------------------------------
        // 2) CREAR INVOICE EN NOWPAYMENTS
        // ------------------------------------------------------------
        const invoiceData = {
            price_amount: precioMxn,
            price_currency: 'mxn',
            pay_currency: PAY_CURRENCY,
            order_id: orderId,
            order_description: `Membresía Sariel's Pro - ${usuario.email}`,
            ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
            success_url: `${SITE_URL}/features/perfil/perfil.html?payment=success`,
            cancel_url: `${SITE_URL}/features/perfil/perfil.html?payment=cancel`
        };

        console.log('📤 Enviando invoice a NOWPayments...');

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
            console.error('❌ Error en NOWPayments:', nowpaymentsData);

            // Dejar constancia: este pago nunca se cobró
            await supabaseAdmin
                .from('pagos_membresia')
                .update({ estado: 'failed', updated_at: new Date().toISOString() })
                .eq('id', pago.id);

            return res.status(502).json({
                success: false,
                error: nowpaymentsData.message || 'Error al crear pago en NOWPayments'
            });
        }

        console.log('✅ Invoice creado en NOWPayments:', nowpaymentsData.id);
        console.log('🔗 URL de pago:', nowpaymentsData.invoice_url);

        // ------------------------------------------------------------
        // 3) GUARDAR LA URL DEL INVOICE
        // Si esto falla no es crítico: el webhook localiza el pago por
        // order_id y la RPC completa payment_id al confirmarse.
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
            console.error('⚠️ No se pudo guardar payment_url (el pago sigue siendo válido):', urlError.message);
        }

        res.json({
            success: true,
            order_id: orderId,
            payment_id: null, // se conoce hasta que llega el webhook
            payment_url: nowpaymentsData.invoice_url,
            pay_address: null, // el invoice muestra la dirección en su propia página
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

        console.log('📊 Consultando membresía para:', usuario_id);

        if (!supabaseAdmin) {
            console.error('❌ supabaseAdmin no disponible');
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

        console.log('✅ Membresía obtenida:', data);

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
