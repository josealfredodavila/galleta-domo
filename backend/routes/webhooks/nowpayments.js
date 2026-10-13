// ================================================================
// ROUTES/WEBHOOKS/NOWPAYMENTS.JS — Csariel's
// Handlers de IPN para: Live Pass (LP-), donaciones (DON-),
// transmisiones de pago (TRX-) y membresía de Mercado (resto).
// NO define router: lo usa routes/webhooks.js, que ya verificó la firma.
// 200 = procesado o no reintentable. 500 = NOWPayments reintenta.
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../config/supabase');

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
// LIVE PASS (LP-)
// ================================================================
async function procesarLivePass(orderId, npStatus, data, res) {
    const { data: r, error } = await supabaseAdmin.rpc('confirmar_live_pass_ipn', {
        p_order_id: orderId,
        p_payment_id: data.payment_id != null ? String(data.payment_id) : null,
        p_np_status: npStatus,
        p_price_amount: Number(data.price_amount) || 0,
        p_pay_address: data.pay_address || null
    });

    if (error) {
        logError('RPC confirmar_live_pass_ipn:', error.message);
        return res.status(500).json({ ok: false, error: 'db' });
    }
    if (!r?.ok) {
        logError('Live Pass no activado:', orderId, r?.motivo);
        return res.status(200).json({ ok: true, ignorado: r?.motivo });
    }

    log('Live Pass', orderId, '→', r.motivo);
    return res.status(200).json({ ok: true, estado: r.motivo });
}

// ================================================================
// DONACIONES DE LIVE (DON-<id>)
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
// TRANSMISIONES DE PAGO (TRX-<pagos_transmision.id>)
// Libera el acceso del espectador: estado 'pagado'.
// Valida monto y moneda (USD) contra la orden guardada en la base.
// ================================================================
async function procesarTransmision(orderId, npStatus, data, res) {
    const pagoId = parseInt(orderId.slice(4), 10);
    if (!Number.isInteger(pagoId) || pagoId <= 0) {
        return res.status(200).json({ ok: true, ignorado: 'order_id_invalido' });
    }

    const { data: orden, error: errOrden } = await supabaseAdmin
        .from('pagos_transmision')
        .select('id, monto_pagado, estado')
        .eq('id', pagoId)
        .maybeSingle();

    if (errOrden) {
        logError('consulta pagos_transmision:', errOrden.message);
        return res.status(500).json({ ok: false, error: 'db' });
    }
    if (!orden) {
        logError('Orden de transmisión no encontrada:', orderId);
        return res.status(200).json({ ok: true, ignorado: 'orden_no_encontrada' });
    }

    // Ya pagada: no se vuelve a procesar
    if (orden.estado === 'pagado') {
        return res.status(200).json({ ok: true, ignorado: 'ya_pagado' });
    }

    const ahora = new Date().toISOString();

    if (npStatus === 'finished' || npStatus === 'confirmed') {
        const montoOk = Number(data.price_amount) === Number(orden.monto_pagado);
        const monedaOk = String(data.price_currency || '').toLowerCase() === 'usd';

        if (!montoOk || !monedaOk) {
            logError('Monto o moneda no coinciden en transmisión:', orderId, data.price_amount, data.price_currency);
            await supabaseAdmin
                .from('pagos_transmision')
                .update({ estado: 'fallido', datos_webhook: data, updated_at: ahora })
                .eq('id', orden.id)
                .neq('estado', 'pagado');
            return res.status(200).json({ ok: true, ignorado: 'monto_no_coincide' });
        }

        const { error: errUpd } = await supabaseAdmin
            .from('pagos_transmision')
            .update({ estado: 'pagado', pagado_en: ahora, datos_webhook: data, updated_at: ahora })
            .eq('id', orden.id)
            .neq('estado', 'pagado');

        if (errUpd) {
            logError('actualizar pagos_transmision:', errUpd.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }

        log('Transmisión', orderId, '→ pagado');
        return res.status(200).json({ ok: true, estado: 'pagado' });
    }

    if (ESTADOS_FALLIDOS.includes(npStatus)) {
        await supabaseAdmin
            .from('pagos_transmision')
            .update({ estado: 'fallido', datos_webhook: data, updated_at: ahora })
            .eq('id', orden.id)
            .neq('estado', 'pagado');
        return res.status(200).json({ ok: true, estado: 'fallido' });
    }

    // Estados intermedios: solo se registra el aviso
    await supabaseAdmin
        .from('pagos_transmision')
        .update({ datos_webhook: data, updated_at: ahora })
        .eq('id', orden.id)
        .neq('estado', 'pagado');
    return res.status(200).json({ ok: true, estado: npStatus });
}

// ================================================================
// MEMBRESÍA DE MERCADO (resto de order_id)
// ================================================================
async function procesarMembresia(npStatus, data, res) {
    const paymentId = data.payment_id != null ? String(data.payment_id) : '';
    if (!paymentId) {
        return res.status(200).json({ ok: true, ignorado: 'sin_payment_id' });
    }

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
            logError('Registrar fallo de pago:', error.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }
        return res.status(200).json({ ok: true, estado: MAPA_FALLIDO[npStatus] });
    }

    const { data: r, error } = await supabaseAdmin.rpc('confirmar_pago_membresia', {
        p_payment_id: paymentId,
        p_np_status: npStatus,
        p_monto_pagado: Number(data.actually_paid) || 0
    });

    if (error) {
        logError('RPC confirmar_pago_membresia:', error.message);
        return res.status(500).json({ ok: false, error: 'db' });
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

module.exports = { procesarLivePass, procesarDonacion, procesarTransmision, procesarMembresia };