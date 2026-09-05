// ================================================================
// MEMBRESIA.JS - SARIEL'S ECOSYSTEM
// VERSIÓN SIMPLIFICADA - CON VERIFICACIÓN DE SUPABASE
// ================================================================

const express = require('express');
const router = express.Router();

// ===== CONFIGURACIÓN =====
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const SITE_URL = process.env.SITE_URL || 'https://sariels.xyz';

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

router.post('/create', verificarAutenticacion, async (req, res) => {
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

        // Obtener plan Pro
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

        console.log('✅ Plan encontrado:', plan.nombre, '$' + plan.precio_mxn);

        // Verificar NOWPayments
        if (!NOWPAYMENTS_API_KEY) {
            console.error('❌ NOWPAYMENTS_API_KEY no configurada');
            return res.status(500).json({ success: false, error: 'Servicio de pagos no configurado' });
        }

        // Generar order_id
        const orderId = `PRO-${Date.now()}-${usuario_id.slice(0, 8)}`;
        console.log('📦 Order ID generado:', orderId);

        // Crear pago en NOWPayments
        const paymentData = {
            price_amount: parseFloat(plan.precio_mxn),
            price_currency: 'MXN',
            pay_currency: 'USDT',
            order_id: orderId,
            order_description: `Membresía Sariel's Pro - ${usuario.email}`,
            ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
            success_url: `${SITE_URL}/features/perfil/perfil.html?payment=success`,
            cancel_url: `${SITE_URL}/features/perfil/perfil.html?payment=cancel`
        };

        console.log('📤 Enviando a NOWPayments...');

        const nowpaymentsResponse = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': NOWPAYMENTS_API_KEY
            },
            body: JSON.stringify(paymentData)
        });

        const nowpaymentsData = await nowpaymentsResponse.json();

        if (!nowpaymentsResponse.ok) {
            console.error('❌ Error en NOWPayments:', nowpaymentsData);
            return res.status(500).json({
                success: false,
                error: nowpaymentsData.message || 'Error al crear pago en NOWPayments'
            });
        }

        console.log('✅ Pago creado en NOWPayments:', nowpaymentsData.payment_id);
        console.log('🔗 URL de pago:', nowpaymentsData.invoice_url);

        // Guardar pago en Supabase
        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .insert({
                usuario_id: usuario_id,
                proveedor: 'nowpayments',
                order_id: orderId,
                payment_id: nowpaymentsData.payment_id || `pay_${Date.now()}`,
                estado: 'pendiente',
                monto_mxn: parseFloat(plan.precio_mxn),
                payment_url: nowpaymentsData.invoice_url,
                pay_address: nowpaymentsData.pay_address || null,
                privacy_version: privacy_version || '1.0',
                privacy_accepted_at: new Date().toISOString()
            })
            .select()
            .single();

        if (pagoError) {
            console.error('❌ Error guardando pago:', pagoError);
            return res.status(500).json({ success: false, error: 'Error al guardar pago' });
        }

        console.log('✅ Pago guardado en Supabase:', pago.id);

        res.json({
            success: true,
            order_id: orderId,
            payment_id: nowpaymentsData.payment_id,
            payment_url: nowpaymentsData.invoice_url,
            pay_address: nowpaymentsData.pay_address,
            price_amount: parseFloat(plan.precio_mxn),
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