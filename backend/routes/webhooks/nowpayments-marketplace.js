// ================================================================
// ROUTES/WEBHOOKS/NOWPAYMENTS-MARKETPLACE.JS — Csariel's (v2)
// Procesa el IPN de compras del Marketplace de canales (order_id MKC-<id>).
// La firma ya fue verificada en routes/webhooks.js antes de llegar aquí.
//
// Flujo:
//   finished → confirmar_compra_marketplace (baja stock, estado 'pagada')
//            → pagarVendedorMarketplace (NUNCA lanza error hacia el webhook)
//   failed/expired/refunded/canceled → compra 'fallida' (solo si seguía pendiente)
//
// Payout (97% al vendedor):
//   - Solo compras en USDT, con MARKETPLACE_PAYOUT_ENABLED='true'.
//   - Cualquier fallo del payout (KYB pendiente, credenciales, API caída,
//     límite) deja payout_estado = 'pendiente_manual' y guarda el motivo
//     en payout_error. La compra sigue 'pagada' y el stock NO se revierte.
//   - Las compras en MXN también quedan en 'pendiente_manual'.
//
// Respuesta del webhook: siempre 200 tras confirmar el pago, para que
// NOWPayments no reenvíe el IPN por un fallo del payout.
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');

const NP_API = 'https://api.nowpayments.io/v1';
const SITE_URL = process.env.SITE_URL || process.env.PUBLIC_APP_URL || 'https://galleta-domo-production.up.railway.app';
const TIMEOUT_MS = 15000;

// Valor exacto 'true' (sin distinguir mayúsculas ni espacios)
function payoutHabilitado() {
    return String(process.env.MARKETPLACE_PAYOUT_ENABLED || '').trim().toLowerCase() === 'true';
}

function idDeCompra(orderId) {
    const m = /^MKC-(\d+)$/i.exec(String(orderId || ''));
    return m ? Number(m[1]) : null;
}

// fetch con timeout
async function fetchConTimeout(url, opciones) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, { ...opciones, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Clasifica el motivo de un rechazo de NOWPayments para guardarlo en payout_error
function clasificarErrorPayout(status, cuerpo) {
    const texto = JSON.stringify(cuerpo || {}).toLowerCase();
    if (/kyb|kyc|verif|verification|not verified|identity|identidad/.test(texto)) {
        return 'kyb_pendiente';
    }
    if (status === 401 || status === 403) return 'auth_rechazada';
    if (status === 429) return 'limite_api';
    if (status === 400 || status === 422) return 'solicitud_rechazada';
    return 'error_api_payout';
}

// Error controlado con código y detalle
class ErrorPayout extends Error {
    constructor(codigo, detalle) {
        super(codigo);
        this.codigo = codigo;
        this.detalle = detalle || '';
    }
}

async function obtenerTokenPayout() {
    const email = process.env.NOWPAYMENTS_PAYOUT_EMAIL;
    const password = process.env.NOWPAYMENTS_PAYOUT_PASSWORD;
    if (!email || !password) {
        throw new ErrorPayout('credenciales_ausentes', 'Faltan NOWPAYMENTS_PAYOUT_EMAIL o NOWPAYMENTS_PAYOUT_PASSWORD');
    }

    const r = await fetchConTimeout(`${NP_API}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) {
        throw new ErrorPayout(clasificarErrorPayout(r.status, d), `auth ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
    }
    return d.token;
}

// Marca el payout como pendiente manual con el motivo. Nunca lanza.
async function marcarPendienteManual(compraId, codigo, detalle) {
    const motivo = `${codigo}: ${String(detalle || '').slice(0, 450)}`;
    const { error } = await supabaseAdmin
        .from('grupos_marketplace_compras')
        .update({ payout_estado: 'pendiente_manual', payout_error: motivo, payout_id: null })
        .eq('id', compraId);
    if (error) {
        logger.error(`[Marketplace] No se pudo marcar pendiente_manual compra ${compraId}: ${error.message}`);
    }
    logger.warn(`[Marketplace] Payout pendiente manual compra ${compraId} (${codigo})`);
}

// Paga el 97% al vendedor. Nunca lanza errores hacia el webhook.
async function pagarVendedorMarketplace(compraId) {
    try {
        const { data: compra, error } = await supabaseAdmin
            .from('grupos_marketplace_compras')
            .select('id, moneda, monto_vendedor, publicacion_id, payout_estado')
            .eq('id', compraId)
            .maybeSingle();
        if (error || !compra) {
            logger.error(`[Marketplace] Payout: compra ${compraId} no encontrada`);
            return;
        }

        // Ya procesada o en curso: no hacer nada (evita pagos duplicados)
        if (compra.payout_estado !== 'no_aplica') return;

        const ahora = new Date().toISOString();

        // Solo USDT y con el interruptor encendido
        if (compra.moneda !== 'USDT' || !payoutHabilitado()) {
            const motivo = compra.moneda !== 'USDT' ? 'moneda_no_automatizada' : 'payout_desactivado';
            await supabaseAdmin
                .from('grupos_marketplace_compras')
                .update({ payout_estado: 'pendiente_manual', payout_error: motivo, pagada_en: ahora })
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

        // Reclamo atómico: solo una ejecución puede pasar a 'procesando'
        const { data: reclamo, error: errReclamo } = await supabaseAdmin
            .from('grupos_marketplace_compras')
            .update({ payout_estado: 'procesando', pagada_en: ahora })
            .eq('id', compraId)
            .eq('payout_estado', 'no_aplica')
            .select('id')
            .maybeSingle();
        if (errReclamo || !reclamo) return;

        try {
            const token = await obtenerTokenPayout();

            const r = await fetchConTimeout(`${NP_API}/payout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-api-key': process.env.NOWPAYMENTS_API_KEY || ''
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

            if (!r.ok) {
                throw new ErrorPayout(clasificarErrorPayout(r.status, d), `payout ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
            }

            const payoutId = d.withdrawals?.[0]?.id || d.id || null;
            const { error: errOk } = await supabaseAdmin
                .from('grupos_marketplace_compras')
                .update({ payout_estado: 'enviado', payout_id: payoutId ? String(payoutId) : null, payout_error: null })
                .eq('id', compraId);
            if (errOk) logger.error(`[Marketplace] Payout enviado sin guardar compra ${compraId}: ${errOk.message}`);
            else logger.info(`[Marketplace] Payout enviado compra ${compraId}`);
        } catch (e) {
            // KYB, credenciales, API caída, límite: todo queda como pendiente manual
            const codigo = e instanceof ErrorPayout ? e.codigo : 'error_inesperado';
            const detalle = e instanceof ErrorPayout ? e.detalle : e.message;
            await marcarPendienteManual(compraId, codigo, detalle);
        }
    } catch (e) {
        // Cualquier error no previsto: no debe afectar la confirmación del pago
        logger.error(`[Marketplace] Error inesperado en payout compra ${compraId}: ${e.message}`);
        await marcarPendienteManual(compraId, 'error_inesperado', e.message);
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
            // 500 para que NOWPayments reintente el IPN: el pago aún no quedó confirmado
            return res.status(500).json({ ok: false, error: 'confirmar' });
        }

        if (resultado === 'pagada') {
            // No se espera ni se propaga: el pago ya está confirmado
            pagarVendedorMarketplace(compraId).catch((e) =>
                logger.error(`[Marketplace] Payout compra ${compraId}: ${e.message}`)
            );
        } else if (resultado === 'sin_stock') {
            // El cliente pagó sin stock disponible: requiere reembolso manual
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

module.exports = { procesarCompraMarketplace, pagarVendedorMarketplace };