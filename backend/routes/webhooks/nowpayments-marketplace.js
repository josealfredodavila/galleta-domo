// ================================================================
// ROUTES/WEBHOOKS/NOWPAYMENTS-MARKETPLACE.JS — Csariel's
// Procesa el IPN de compras del Marketplace de canales (order_id MKC-<id>).
// La firma ya fue verificada en routes/webhooks.js antes de llegar aquí.
//   finished  → confirmar_compra_marketplace (baja stock) → pago al vendedor
//   failed/expired/refunded/canceled → compra 'fallida' (solo si seguía pendiente)
// Pago al vendedor: solo compras en USDT y con MARKETPLACE_PAYOUT_ENABLED=true.
// Las compras en MXN quedan en 'pendiente_manual' para pagarse a mano.
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');

const NP_API = 'https://api.nowpayments.io/v1';
const SITE_URL = process.env.SITE_URL || process.env.PUBLIC_APP_URL || 'https://galleta-domo-production.up.railway.app';
const PAYOUT_ENABLED = process.env.MARKETPLACE_PAYOUT_ENABLED === 'true';

function idDeCompra(orderId) {
    const m = /^MKC-(\d+)$/i.exec(String(orderId || ''));
    return m ? Number(m[1]) : null;
}

async function obtenerTokenPayout() {
    const email = process.env.NOWPAYMENTS_PAYOUT_EMAIL;
    const password = process.env.NOWPAYMENTS_PAYOUT_PASSWORD;
    if (!email || !password) throw new Error('credenciales_payout_ausentes');

    const r = await fetch(`${NP_API}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) throw new Error('auth_payout_fallida');
    return d.token;
}

// Paga el 97% al vendedor. Reclama la compra con una condición para no pagar dos veces.
async function pagarVendedorMarketplace(compraId) {
    const { data: compra, error } = await supabaseAdmin
        .from('grupos_marketplace_compras')
        .select('id, moneda, monto_vendedor, publicacion_id')
        .eq('id', compraId)
        .maybeSingle();
    if (error || !compra) {
        logger.error(`[Marketplace] Payout: compra ${compraId} no encontrada`);
        return;
    }

    const ahora = new Date().toISOString();

    if (compra.moneda !== 'USDT' || !PAYOUT_ENABLED) {
        await supabaseAdmin
            .from('grupos_marketplace_compras')
            .update({ payout_estado: 'pendiente_manual', pagada_en: ahora })
            .eq('id', compraId)
            .eq('payout_estado', 'no_aplica');
        return;
    }

    const { data: pub } = await supabaseAdmin
        .from('grupos_video_publicaciones')
        .select('wallet_cobro')
        .eq('id', compra.publicacion_id)
        .maybeSingle();

    if (!pub || !pub.wallet_cobro) {
        await supabaseAdmin
            .from('grupos_marketplace_compras')
            .update({ payout_estado: 'pendiente_manual', payout_error: 'sin_wallet_cobro', pagada_en: ahora })
            .eq('id', compraId)
            .eq('payout_estado', 'no_aplica');
        return;
    }

    // Reclamo atómico: solo una ejecución puede pasar de 'no_aplica' a 'procesando'
    const { data: reclamo } = await supabaseAdmin
        .from('grupos_marketplace_compras')
        .update({ payout_estado: 'procesando', pagada_en: ahora })
        .eq('id', compraId)
        .eq('payout_estado', 'no_aplica')
        .select('id')
        .maybeSingle();
    if (!reclamo) return;

    try {
        const token = await obtenerTokenPayout();
        const r = await fetch(`${NP_API}/payout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-api-key': process.env.NOWPAYMENTS_API_KEY
            },
            body: JSON.stringify({
                ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
                withdrawals: [{
                    address: pub.wallet_cobro,
                    currency: 'usdtmatic',
                    amount: Number(compra.monto_vendedor),
                    ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`
                }]
            })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(JSON.stringify(d));

        const payoutId = d.withdrawals?.[0]?.id || d.id || null;
        await supabaseAdmin
            .from('grupos_marketplace_compras')
            .update({ payout_estado: 'enviado', payout_id: payoutId ? String(payoutId) : null })
            .eq('id', compraId);
        logger.info(`[Marketplace] Payout enviado compra ${compraId}`);
    } catch (e) {
        logger.error(`[Marketplace] Payout fallido compra ${compraId}: ${e.message}`);
        await supabaseAdmin
            .from('grupos_marketplace_compras')
            .update({ payout_estado: 'fallido', payout_error: String(e.message).slice(0, 500) })
            .eq('id', compraId);
    }
}

async function procesarCompraMarketplace(orderId, npStatus, data, res) {
    const compraId = idDeCompra(orderId);
    if (!compraId) return res.status(200).json({ ok: true, ignorado: 'order_id' });

    if (npStatus === 'finished') {
        const { data: resultado, error } = await supabaseAdmin.rpc('confirmar_compra_marketplace', {
            p_compra_id: compraId,
            p_payment_id: String(data.payment_id || '')
        });

        if (error) {
            logger.error(`[Marketplace] confirmar_compra_marketplace ${compraId}: ${error.message}`);
            // 500 para que NOWPayments reintente el IPN
            return res.status(500).json({ ok: false, error: 'confirmar' });
        }

        if (resultado === 'pagada') {
            await pagarVendedorMarketplace(compraId).catch((e) =>
                logger.error(`[Marketplace] Payout compra ${compraId}: ${e.message}`)
            );
        } else if (resultado === 'sin_stock') {
            // El cliente pagó pero ya no hay stock: requiere reembolso manual
            logger.warn(`[Marketplace] REEMBOLSO MANUAL requerido: compra ${compraId} sin stock`);
        }

        return res.status(200).json({ ok: true, resultado });
    }

    if (['failed', 'refunded', 'expired', 'canceled', 'cancelled'].includes(npStatus)) {
        await supabaseAdmin
            .from('grupos_marketplace_compras')
            .update({ estado: 'fallida', payment_id: String(data.payment_id || '') })
            .eq('id', compraId)
            .eq('estado', 'pendiente');
    }

    return res.status(200).json({ ok: true });
}

module.exports = { procesarCompraMarketplace };