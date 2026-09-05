// ================================================================
// MEMBRESIA.JS - SARIEL'S ECOSYSTEM
// ================================================================

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase.js');
const { verificarAutenticacion } = require('../middleware/auth.js');
const crypto = require('crypto');

// ===== CONFIGURACIÓN =====
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const SITE_URL = process.env.SITE_URL || 'https://sariels.xyz';

// ================================================================
// POST /api/payments/membresia/create
// ================================================================

router.post('/create', verificarAutenticacion, async (req, res) => {
    try {
        const { privacy_version, renovar } = req.body;
        const usuario_id = req.user.id;

        // 1. Obtener usuario
        const { data: usuario, error: userError } = await supabaseAdmin
            .from('usuarios')
            .select('id, email, nombre')
            .eq('id', usuario_id)
            .single();

        if (userError || !usuario) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        // 2. Obtener plan Pro desde la base de datos
        const { data: plan, error: planError } = await supabaseAdmin
            .from('planes_membresia')
            .select('id, nombre, precio_mxn, intervalo_dias')
            .eq('nombre', 'Pro')
            .eq('activo', true)
            .single();

        if (planError || !plan) {
            console.error('❌ Plan Pro no encontrado:', planError);
            return res.status(404).json({ success: false, error: 'Plan no disponible' });
        }

        // 3. Generar order_id
        const orderId = `PRO-${Date.now()}-${usuario_id.slice(0, 8)}`;

        // 4. Crear pago en NOWPayments
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

        // 5. Guardar pago en Supabase
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

        // 6. Responder
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================================================================
// GET /api/payments/membresia/status
// ================================================================

router.get('/status', verificarAutenticacion, async (req, res) => {
    try {
        const usuario_id = req.user.id;

        // Usar la función RPC existente
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