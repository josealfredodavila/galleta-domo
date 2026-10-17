// ================================================================
// ROUTES/WEBHOOKS/NOWPAYMENTS-VENTAS.JS — Csariel's
// Handlers de IPN para Muro (muro_<venta_id>) y Marketing (MKT-<pago_id>).
// NO define router: lo usa routes/webhooks.js, que ya verificó la firma.
// Reglas:
//   - Se valida moneda (MXN) y monto contra la orden antes de liberar nada.
//   - Si el payment_id no coincide con el guardado, no se procesa.
//   - Un pago que no coincide queda para revisión manual (log), no se cancela.
//   - Marketing activa la campaña ANTES de marcar el pago como pagado.
// 200 = procesado o no reintentable. 500 = NOWPayments reintenta.
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../config/supabase');

const FINALES_OK = ['finished', 'confirmed'];
const FINALES_FALLO = ['failed', 'refunded', 'expired', 'canceled', 'cancelled'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = (...args) => console.log('[Ventas IPN]', ...args);
const logError = (...args) => console.error('[Ventas IPN ERROR]', ...args);

function paymentIdDe(data) {
    return data.payment_id != null ? String(data.payment_id) : '';
}

// La factura se crea en MXN: el IPN debe regresar price_currency mxn y el monto exacto
function coincideFactura(data, montoEsperadoMxn) {
    const moneda = String(data.price_currency || '').toLowerCase();
    const precio = Number(data.price_amount);
    if (moneda !== 'mxn') return false;
    if (!Number.isFinite(precio)) return false;
    return Math.abs(precio - Number(montoEsperadoMxn)) <= 0.01;
}

// ================================================================
// MURO — order_id "muro_<venta_id>"
// ================================================================
async function procesarVentaMuro(ventaIdRaw, npStatus, data, res) {
    const ventaId = parseInt(String(ventaIdRaw), 10);
    if (!Number.isInteger(ventaId) || ventaId <= 0) {
        return res.status(200).json({ ok: true, ignorado: 'order_id_invalido' });
    }

    const paymentId = paymentIdDe(data);

    const { data: venta, error: errV } = await supabaseAdmin
        .from('muro_ventas_tokens')
        .select('id, estado, payment_id, precio_mxn')
        .eq('id', ventaId)
        .maybeSingle();

    if (errV) {
        logError('consulta venta muro:', errV.message);
        return res.status(500).json({ ok: false, error: 'db' });
    }
    if (!venta) return res.status(200).json({ ok: true, ignorado: 'venta_no_encontrada' });

    if (venta.payment_id && paymentId && venta.payment_id !== paymentId) {
        logError('REVISIÓN MANUAL — payment_id no coincide (muro):', ventaId, { recibido: paymentId });
        return res.status(200).json({ ok: true, ignorado: 'payment_id_no_coincide' });
    }

    if (['pagado', 'completado'].includes(venta.estado)) {
        return res.status(200).json({ ok: true, ignorado: 'ya_pagada' });
    }

    // ---------- Pago final ----------
    if (FINALES_OK.includes(npStatus)) {
        if (!coincideFactura(data, venta.precio_mxn)) {
            logError('REVISIÓN MANUAL — monto/moneda no coincide (muro):', ventaId, {
                price_amount: data.price_amount,
                price_currency: data.price_currency,
                esperado_mxn: venta.precio_mxn
            });
            return res.status(200).json({ ok: true, ignorado: 'monto_no_coincide' });
        }

        if (['cancelado', 'cancelada', 'expirado', 'expirada', 'fallido'].includes(venta.estado)) {
            logError('REVISIÓN MANUAL — pago final en venta cerrada (muro):', ventaId, venta.estado);
            return res.status(200).json({ ok: true, ignorado: 'venta_cerrada' });
        }

        const { error: errReg } = await supabaseAdmin.rpc('registrar_payment_muro', {
            p_venta_id: ventaId,
            p_payment_id: paymentId,
            p_pay_amount: Number(data.pay_amount) || 0,
            p_pay_currency: String(data.pay_currency || 'usdt'),
            p_payment_status: npStatus
        });
        if (errReg) {
            logError('registrar_payment_muro:', errReg.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }

        // Idempotente: si ya estaba liquidada, responde already_processed
        const { data: liq, error: errLiq } = await supabaseAdmin.rpc('liquidar_venta_token_muro', {
            p_venta_id: ventaId
        });
        if (errLiq) {
            logError('liquidar_venta_token_muro:', errLiq.message);
            return res.status(500).json({ ok: false, error: 'liquidacion' });
        }
        if (liq?.expired === true) {
            return res.status(200).json({ ok: true, ignorado: 'expirada' });
        }

        log('venta muro liquidada', ventaId, { already_processed: liq?.already_processed === true });
        return res.status(200).json({ ok: true, estado: 'pagado' });
    }

    // ---------- Fallo ----------
    if (FINALES_FALLO.includes(npStatus)) {
        const { error: errCan } = await supabaseAdmin.rpc('cancelar_venta_muro', {
            p_venta_id: ventaId,
            p_estado: 'cancelado',
            p_nowpayments_status: npStatus
        });
        if (errCan) {
            logError('cancelar_venta_muro:', errCan.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }
        return res.status(200).json({ ok: true, estado: 'cancelado' });
    }

    // ---------- Intermedio: solo registrar el avance ----------
    const { error: errProc } = await supabaseAdmin.rpc('registrar_payment_muro', {
        p_venta_id: ventaId,
        p_payment_id: paymentId,
        p_pay_amount: Number(data.pay_amount) || 0,
        p_pay_currency: String(data.pay_currency || 'usdt'),
        p_payment_status: npStatus
    });
    if (errProc) logError('registrar_payment_muro (intermedio):', errProc.message);

    return res.status(200).json({ ok: true, estado: npStatus });
}

// ================================================================
// MARKETING — order_id "MKT-<pago_id>" (uuid)
// ================================================================
async function procesarPagoMarketing(pagoIdRaw, npStatus, data, res) {
    const pagoId = String(pagoIdRaw || '');
    if (!UUID_RE.test(pagoId)) {
        return res.status(200).json({ ok: true, ignorado: 'order_id_invalido' });
    }

    const paymentId = paymentIdDe(data);

    const { data: pago, error: errP } = await supabaseAdmin
        .from('marketing_pagos')
        .select('id, campaign_id, estado, payment_id, monto_mxn')
        .eq('id', pagoId)
        .maybeSingle();

    if (errP) {
        logError('consulta pago marketing:', errP.message);
        return res.status(500).json({ ok: false, error: 'db' });
    }
    if (!pago) return res.status(200).json({ ok: true, ignorado: 'pago_no_encontrado' });

    if (pago.payment_id && paymentId && pago.payment_id !== paymentId) {
        logError('REVISIÓN MANUAL — payment_id no coincide (marketing):', pagoId, { recibido: paymentId });
        return res.status(200).json({ ok: true, ignorado: 'payment_id_no_coincide' });
    }

    if (pago.estado === 'pagado') {
        return res.status(200).json({ ok: true, ignorado: 'ya_pagado' });
    }

    // ---------- Pago final ----------
    if (FINALES_OK.includes(npStatus)) {
        if (!coincideFactura(data, pago.monto_mxn)) {
            logError('REVISIÓN MANUAL — monto/moneda no coincide (marketing):', pagoId, {
                price_amount: data.price_amount,
                price_currency: data.price_currency,
                esperado_mxn: pago.monto_mxn
            });
            return res.status(200).json({ ok: true, ignorado: 'monto_no_coincide' });
        }

        const { data: camp, error: errC } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('id, estado')
            .eq('id', pago.campaign_id)
            .maybeSingle();

        if (errC) {
            logError('consulta campaña:', errC.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }
        if (!camp) {
            logError('REVISIÓN MANUAL — campaña no encontrada (marketing):', pagoId);
            return res.status(200).json({ ok: true, ignorado: 'campana_no_encontrada' });
        }

        // 1) Activar primero. Si falla, el pago NO se marca y NOWPayments reintenta.
        //    Se omite si ya está activa (la función lanza error en ese caso).
        if (camp.estado !== 'activa') {
            const { error: errAct } = await supabaseAdmin.rpc('activar_campana_marketing', {
                p_campaign_id: camp.id
            });
            if (errAct) {
                logError('activar_campana_marketing:', errAct.message);
                return res.status(500).json({ ok: false, error: 'activacion' });
            }
        }

        // 2) Marcar pagado solo después de activar
        const { error: errU } = await supabaseAdmin
            .from('marketing_pagos')
            .update({ estado: 'pagado', nowpayments_status: npStatus })
            .eq('id', pago.id)
            .neq('estado', 'pagado');
        if (errU) {
            logError('marcar pago marketing:', errU.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }

        log('campaña marketing activada', camp.id);
        return res.status(200).json({ ok: true, estado: 'pagado' });
    }

    // ---------- Fallo ----------
    if (FINALES_FALLO.includes(npStatus)) {
        const { error: errCan } = await supabaseAdmin
            .from('marketing_pagos')
            .update({ estado: 'cancelado', nowpayments_status: npStatus })
            .eq('id', pago.id)
            .neq('estado', 'pagado');
        if (errCan) {
            logError('cancelar pago marketing:', errCan.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }
        return res.status(200).json({ ok: true, estado: 'cancelado' });
    }

    // ---------- Intermedio ----------
    const estadoIntermedio = ['confirming', 'sending'].includes(npStatus) ? 'confirmando' : pago.estado;
    const { error: errI } = await supabaseAdmin
        .from('marketing_pagos')
        .update({ estado: estadoIntermedio, nowpayments_status: npStatus })
        .eq('id', pago.id)
        .neq('estado', 'pagado');
    if (errI) logError('estado intermedio marketing:', errI.message);

    return res.status(200).json({ ok: true, estado: npStatus });
}

module.exports = { procesarVentaMuro, procesarPagoMarketing };