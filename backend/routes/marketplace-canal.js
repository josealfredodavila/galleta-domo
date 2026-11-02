// ================================================================
// ROUTES/MARKETPLACE-CANAL.JS — Csariel's
// Montado en /api/marketplace
//   POST /api/marketplace/canal/pago → crea la factura NOWPayments
//        de una compra pendiente (creada antes con crear_compra_marketplace)
// El total y la moneda salen de la base de datos, nunca del cliente.
// La confirmación llega por el webhook (routes/webhooks/nowpayments-marketplace.js).
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const { supabaseAdmin } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_INVOICE_URL = 'https://api.nowpayments.io/v1/invoice';
const SITE_URL = process.env.SITE_URL || process.env.PUBLIC_APP_URL || 'https://galleta-domo-production.up.railway.app';

// Redes Polygon permitidas para compras de canal (id del cliente → código NOWPayments)
const REDES_MARKETPLACE = {
    usdtmatic: 'usdtmatic',
    usdcmatic: 'usdcmatic'
};

// NOWPayments rechaza montos pequeños. Mismo criterio que payments.js (16 USD).
const MINIMO_USD = 16;
const MXN_A_USD_APROX = 0.055;

router.post('/canal/pago', verificarToken, async (req, res) => {
    try {
        const uid = req.usuario.id;
        const compraId = Number(req.body?.compra_id);
        const payCurrency = typeof req.body?.pay_currency === 'string' ? req.body.pay_currency : '';

        if (!Number.isInteger(compraId) || compraId <= 0) {
            return res.status(400).json({ success: false, error: 'compra_invalida' });
        }
        if (!Object.prototype.hasOwnProperty.call(REDES_MARKETPLACE, payCurrency)) {
            return res.status(400).json({ success: false, error: 'red_invalida' });
        }
        if (!NOWPAYMENTS_API_KEY) {
            logger.error('[Marketplace] NOWPAYMENTS_API_KEY ausente');
            return res.status(500).json({ success: false, error: 'pagos_no_configurados' });
        }

        const { data: compra, error } = await supabaseAdmin
            .from('grupos_marketplace_compras')
            .select('id, comprador_id, cantidad, total, moneda, estado')
            .eq('id', compraId)
            .maybeSingle();

        if (error) {
            logger.error(`[Marketplace] Consulta de compra: ${error.message}`);
            return res.status(500).json({ success: false, error: 'db' });
        }
        if (!compra || compra.comprador_id !== uid || compra.estado !== 'pendiente') {
            return res.status(404).json({ success: false, error: 'compra_no_disponible' });
        }

        const total = Number(compra.total);
        const totalUsd = compra.moneda === 'USDT' ? total : total * MXN_A_USD_APROX;
        if (!Number.isFinite(totalUsd) || totalUsd < MINIMO_USD) {
            return res.status(400).json({ success: false, error: 'monto_bajo' });
        }

        const priceCurrency = compra.moneda === 'MXN' ? 'mxn' : 'usd';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let factura = {};
        let facturaOk = false;

        try {
            const r = await fetch(NOWPAYMENTS_INVOICE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': NOWPAYMENTS_API_KEY },
                body: JSON.stringify({
                    price_amount: total,
                    price_currency: priceCurrency,
                    pay_currency: REDES_MARKETPLACE[payCurrency],
                    order_id: `MKC-${compra.id}`,
                    order_description: `Compra Marketplace #${compra.id} x${compra.cantidad}`,
                    ipn_callback_url: `${SITE_URL}/api/webhook/nowpayments`,
                    success_url: `${SITE_URL}/features/grupos/grupos.html?compra=${compra.id}&payment=success`,
                    cancel_url: `${SITE_URL}/features/grupos/grupos.html?compra=${compra.id}&payment=cancel`
                }),
                signal: controller.signal
            });
            factura = await r.json().catch(() => ({}));
            facturaOk = r.ok;
        } catch (e) {
            factura = { message: e.message };
        } finally {
            clearTimeout(timeout);
        }

        if (!facturaOk || !factura.invoice_url) {
            logger.error(`[Marketplace] NOWPayments compra ${compra.id}: ${JSON.stringify(factura)}`);
            return res.status(502).json({ success: false, error: 'pago_no_creado' });
        }

        // Guarda el id de la factura como referencia. El webhook guarda después el payment_id real.
        const { error: errUp } = await supabaseAdmin
            .from('grupos_marketplace_compras')
            .update({ payment_id: `inv:${String(factura.id || '')}` })
            .eq('id', compra.id)
            .eq('estado', 'pendiente');
        if (errUp) {
            logger.error(`[Marketplace] Guardar referencia de factura ${compra.id}: ${errUp.message}`);
        }

        return res.status(201).json({
            success: true,
            compra_id: compra.id,
            payment_url: factura.invoice_url
        });
    } catch (e) {
        logger.error(`[Marketplace] Error creando pago: ${e.message}`);
        return res.status(500).json({ success: false, error: 'interno' });
    }
});

module.exports = router;