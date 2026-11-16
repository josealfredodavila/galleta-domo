// ================================================================
// services/anuncios/confirmar-pago-campana.js — Csariel's
// ÚNICO punto que confirma un pago de campaña. Lo usan el webhook
// (IPN) y la consulta de estado (polling). Orden de operaciones:
//   1. Validar payment_id, moneda y monto contra la orden guardada.
//   2. Copiar el creativo a R2 pública y guardar la URL en el anuncio.
//   3. Activar campaña y marcar pago en UNA transacción SQL
//      (confirmar_pago_campana_marketing).
// Así una campaña activa siempre tiene su creativo publicado, y nunca
// se activa sin un pago finished validado.
// Idempotente: un pago ya confirmado devuelve ok sin tocar nada.
// ================================================================

'use strict';

// Corrección de ruta: al estar en services/anuncios/, necesitamos subir 3 niveles (../../../) para llegar a backend/config/
const { supabaseAdmin } = require('../../../config/supabase');
const { publicarMediaDeCampana } = require('./publicar-media');

async function enRevision(pagoId, npStatus) {
    const { error } = await supabaseAdmin
        .from('marketing_pagos')
        .update({ estado: 'revision_manual', nowpayments_status: npStatus })
        .eq('id', pagoId)
        .neq('estado', 'pagado');
    if (error) console.error('[Marketing] no se pudo marcar revision_manual:', error.message);
}

async function confirmarPagoCampana({ pagoId, paymentData, source }) {
    const npStatus = String(paymentData?.payment_status || 'finished').toLowerCase();

    const { data: pago, error } = await supabaseAdmin
        .from('marketing_pagos')
        .select('id, campaign_id, estado, payment_id, monto_mxn')
        .eq('id', pagoId)
        .maybeSingle();
    if (error) return { ok: false, permanente: false, motivo: 'db_pago' };
    if (!pago) return { ok: false, permanente: true, motivo: 'pago_no_encontrado' };

    if (pago.estado === 'pagado') {
        return { ok: true, yaConfirmado: true, campaign_id: pago.campaign_id };
    }

    // 1) Validación de la orden
    const paymentId = paymentData?.payment_id != null ? String(paymentData.payment_id) : '';
    if (!paymentId || (pago.payment_id && pago.payment_id !== paymentId)) {
        await enRevision(pago.id, npStatus);
        return { ok: false, permanente: true, motivo: 'payment_id_no_coincide' };
    }

    const moneda = String(paymentData.price_currency || '').toLowerCase();
    const precio = Number(paymentData.price_amount);
    if (moneda !== 'mxn' || !Number.isFinite(precio) || Math.abs(precio - Number(pago.monto_mxn)) > 0.01) {
        await enRevision(pago.id, npStatus);
        return { ok: false, permanente: true, motivo: 'monto_no_coincide' };
    }

    // 2) Creativo público (idempotente)
    try {
        await publicarMediaDeCampana(pago.campaign_id);
    } catch (e) {
        if (e.permanente) {
            await enRevision(pago.id, npStatus);
            return { ok: false, permanente: true, motivo: e.message };
        }
        // Error transitorio (R2, base): no se activa; el llamador reintenta
        console.error(`[Marketing] publicar media campaña ${pago.campaign_id} (${source}): ${e.message}`);
        return { ok: false, permanente: false, motivo: `publicar_media: ${e.message}` };
    }

    // 3) Activación y pago en una sola transacción
    const { data: r, error: errR } = await supabaseAdmin.rpc('confirmar_pago_campana_marketing', {
        p_pago_id: pago.id,
        p_payment_id: paymentId,
        p_nowpayments_status: npStatus
    });
    if (errR) {
        console.error(`[Marketing] confirmar_pago_campana_marketing ${pago.id}: ${errR.message}`);
        return { ok: false, permanente: false, motivo: `rpc: ${errR.message}` };
    }
    if (!r || r.ok !== true) {
        return { ok: false, permanente: r?.permanente === true, motivo: r?.motivo || 'rpc_rechazo' };
    }

    return { ok: true, campaign_id: r.campaign_id, yaConfirmado: r.ya_confirmado === true, source };
}

module.exports = { confirmarPagoCampana };