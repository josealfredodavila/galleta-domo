/* ================================================================
   NOWPAYMENTS IPN — backend/routes/webhooks/nowpayments.js
   Un solo endpoint atiende dos flujos:
     - order_id "DON-<id>"  → donaciones de Live
     - cualquier otro       → membresías de Csariel's Mercado
   La lógica crítica (estado, activación, idempotencia y monto)
   vive en funciones SQL atómicas. Este archivo solo verifica la
   firma, enruta y responde.
   Respuestas: 500 = reintentar (NOWPayments volverá a enviar),
               200 = procesado o no reintentable.
   ================================================================ */

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const { verificarFirmaNowPayments } = require('../../utils/nowpayments-sig');

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

const ESTADOS_FALLIDOS = ['failed', 'refunded', 'expired', 'canceled', 'cancelled'];
const MAPA_FALLIDO = {
    failed: 'fallida',
    refunded: 'fallida',
    expired: 'expirada',
    canceled: 'cancelada',
    cancelled: 'cancelada'
};

const log = (...args) => console.log('[NOWPayments]', ...args);
const logError = (...args) => console.error('[NOWPayments ERROR]', ...args);

// ================================================================
// POST /  (montado en /api/webhook/nowpayments)
// ================================================================
router.post('/', async (req, res) => {
    try {
        if (!supabaseAdmin) {
            logError('supabaseAdmin no configurado');
            return res.status(500).json({ ok: false, error: 'config' });
        }
        if (!NOWPAYMENTS_IPN_SECRET) {
            logError('NOWPAYMENTS_IPN_SECRET ausente');
            return res.status(500).json({ ok: false, error: 'config' });
        }

        const firma = req.headers['x-nowpayments-sig'];
        if (!verificarFirmaNowPayments(req.body, req.rawBody, firma, NOWPAYMENTS_IPN_SECRET)) {
            logError('Firma inválida, solicitud rechazada');
            return res.status(401).json({ ok: false, error: 'firma' });
        }

        const data = req.body || {};
        const npStatus = String(data.payment_status || '').toLowerCase();
        const orderId = String(data.order_id || '');

        log('IPN recibido', { order_id: orderId, status: npStatus, payment_id: data.payment_id });

        if (orderId.startsWith('DON-')) {
            return await procesarDonacion(orderId, npStatus, data, res);
        }
        return await procesarMembresia(npStatus, data, res);
    } catch (e) {
        logError('Excepción en webhook:', e);
        return res.status(500).json({ ok: false, error: 'interno' });
    }
});

// ================================================================
// DONACIONES DE LIVE
// ================================================================
async function procesarDonacion(orderId, npStatus, data, res) {
    const donacionId = parseInt(orderId.slice(4), 10);
    if (!Number.isInteger(donacionId) || donacionId <= 0) {
        return res.status(200).json({ ok: true, ignorado: 'order_id_invalido' });
    }

    const { data: r, error } = await supabaseAdmin.rpc('confirmar_donacion_live', {
        p_donacion_id: donacionId,
        p_np_status: npStatus,
        p_price_amount: Number(data.price_amount) || 0
    });

    if (error) {
        logError('RPC confirmar_donacion_live:', error.message);
        return res.status(500).json({ ok: false, error: 'db' });
    }

    if (!r?.ok) {
        logError('Donación no confirmada:', donacionId, r?.motivo);
        return res.status(200).json({ ok: true, ignorado: r?.motivo });
    }

    log('Donación', donacionId, '→', r.motivo);
    return res.status(200).json({ ok: true, estado: r.motivo });
}

// ================================================================
// MEMBRESÍAS DE MERCADO
// ================================================================
async function procesarMembresia(npStatus, data, res) {
    const paymentId = data.payment_id != null ? String(data.payment_id) : '';
    if (!paymentId) {
        return res.status(200).json({ ok: true, ignorado: 'sin_payment_id' });
    }

    // Estados de fallo: se registran directamente (no activan nada)
    if (ESTADOS_FALLIDOS.includes(npStatus)) {
        const { error } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .update({
                estado: MAPA_FALLIDO[npStatus],
                nowpayments_status: npStatus,
                updated_at: new Date().toISOString()
            })
            .eq('payment_id', paymentId)
            .neq('estado', 'pagada');

        if (error) {
            logError('Error registrando fallo de pago:', error.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }
        return res.status(200).json({ ok: true, estado: MAPA_FALLIDO[npStatus] });
    }

    // Confirmación atómica: bloquea el pago, valida monto, activa tienda y marca pagada
    const { data: r, error } = await supabaseAdmin.rpc('confirmar_pago_membresia', {
        p_payment_id: paymentId,
        p_np_status: npStatus,
        p_monto_pagado: Number(data.actually_paid) || 0
    });

    if (error) {
        logError('RPC confirmar_pago_membresia:', error.message);
        return res.status(500).json({ ok: false, error: 'db' });   // NOWPayments reintenta
    }

    if (!r?.ok) {
        logError('Membresía no activada:', paymentId, r?.motivo);
        return res.status(200).json({ ok: true, ignorado: r?.motivo });
    }

    if (r.motivo === 'activada') {
        await crearNotificacionMembresia(r.usuario_id, r.nivel, r.fecha_fin);
    }

    log('Membresía', paymentId, '→', r.motivo);
    return res.status(200).json({ ok: true, estado: r.motivo });
}

// ================================================================
// NOTIFICACIÓN AL USUARIO (best-effort, no bloquea la respuesta)
// ================================================================
async function crearNotificacionMembresia(usuarioId, planSlug, fechaFin) {
    try {
        const { error } = await supabaseAdmin.from('notificaciones').insert({
            user_id: usuarioId,
            tipo: 'membresia_activada',
            mensaje: `Tu membresía ${String(planSlug).toUpperCase()} está activa hasta ${new Date(fechaFin).toLocaleDateString('es-MX')}`,
            fecha: new Date().toISOString(),
            emisor_id: null,
            leida: false,
            metadata: { tipo_evento: 'membresia_activada', plan: planSlug, fecha_fin: fechaFin, plataforma: "Csariel's Mercado" }
        });
        if (error) logError('Notificación no creada:', error.message);
    } catch (e) {
        logError('Excepción en notificación:', e.message);
    }
}

module.exports = router;