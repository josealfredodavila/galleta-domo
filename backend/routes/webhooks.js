// ================================================================
// ROUTES/WEBHOOKS.JS — Csariel's
// Montado en /api/webhook
//   POST /api/webhook/nowpayments → IPN de NOWPayments (firma verificada)
//       LP-     → Live Pass
//       DON-    → donaciones de live
//       TRX-    → accesos de pago a lives
//       muro_   → ventas P2P del Muro
//       MKT-    → pagos de campañas de marketing
//       MKC-    → compras del Marketplace de canales
//       NET-    → paquetes de Internet
//       PRO-    → membresía PRO
//       ANU-    → pagos de anuncios del carrusel  ✅ NUEVO
//       resto   → membresía de Mercado (por payment_id)
//   POST /api/webhook/membresia   → membresía PRO
//   POST /api/webhook/stripe      → placeholder
//   POST /api/webhook/fintoc      → placeholder
// ================================================================

const express = require('express');
const router = express.Router();

const { verificarFirmaNowPayments } = require('../utils/nowpayments-sig');
const nowpayments = require('./webhooks/nowpayments');
const ventas = require('./webhooks/nowpayments-ventas');
const marketplaceCanal = require('./webhooks/nowpayments-marketplace');
const { handleWebhookMembresia } = require('./membresia-webhook-handler');
const { handleWebhookInternet } = require('./webhooks/nowpayments-internet');

// ✅ NUEVO: Módulo de pagos de anuncios
const anunciosPagos = require('../services/anuncios/pagos-anuncio');

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

const log = (...args) => console.log('[Webhook]', ...args);
const logError = (...args) => console.error('[Webhook ERROR]', ...args);

function firmaValida(req) {
    if (!NOWPAYMENTS_IPN_SECRET) {
        logError('NOWPAYMENTS_IPN_SECRET ausente: se rechazan todos los IPN');
        return false;
    }
    return verificarFirmaNowPayments(
        req.body,
        req.rawBody,
        req.headers['x-nowpayments-sig'],
        NOWPAYMENTS_IPN_SECRET
    );
}

// POST /api/webhook/nowpayments
router.post('/nowpayments', async (req, res) => {
    try {
        if (!firmaValida(req)) {
            logError('Firma inválida en /nowpayments');
            return res.status(401).json({ ok: false, error: 'firma' });
        }

        const data = req.body || {};
        const orderId = String(data.order_id || '');
        const orderUpper = orderId.toUpperCase();
        const npStatus = String(data.payment_status || '').toLowerCase();

        log('IPN', { order_id: orderId, status: npStatus, payment_id: data.payment_id });

        if (orderUpper.startsWith('LP-')) {
            return nowpayments.procesarLivePass(orderId, npStatus, data, res);
        }
        if (orderUpper.startsWith('DON-')) {
            return nowpayments.procesarDonacion(orderId, npStatus, data, res);
        }
        if (orderUpper.startsWith('TRX-')) {
            return nowpayments.procesarTransmision(orderId, npStatus, data, res);
        }
        if (orderUpper.startsWith('MURO_')) {
            return ventas.procesarVentaMuro(orderId.slice(5), npStatus, data, res);
        }
        if (orderUpper.startsWith('MKT-')) {
            return ventas.procesarPagoMarketing(orderId.slice(4), npStatus, data, res);
        }
        if (orderUpper.startsWith('MKC-')) {
            return marketplaceCanal.procesarCompraMarketplace(orderId, npStatus, data, res);
        }
        if (orderUpper.startsWith('NET-')) {
            return handleWebhookInternet(req, res);
        }
        if (orderUpper.startsWith('PRO-')) {
            return handleWebhookMembresia(req, res);
        }

        // ✅ NUEVO: Rama ANU- para anuncios del carrusel
        if (orderUpper.startsWith('ANU-')) {
            return anunciosPagos.procesarPagoAnuncio(orderId, npStatus, data, res);
        }

        // Resto (membresía de Mercado): busca por payment_id.
        return nowpayments.procesarMembresia(npStatus, data, res);
    } catch (e) {
        logError('/nowpayments:', e.message);
        return res.status(500).json({ ok: false, error: 'interno' });
    }
});

// POST /api/webhook/membresia
router.post('/membresia', async (req, res) => {
    try {
        if (!firmaValida(req)) {
            logError('Firma inválida en /membresia');
            return res.status(401).json({ ok: false, error: 'firma' });
        }
        return handleWebhookMembresia(req, res);
    } catch (e) {
        logError('/membresia:', e.message);
        return res.status(500).json({ ok: false, error: 'interno' });
    }
});

// Placeholders
router.post('/stripe', (req, res) => res.status(200).json({ received: true }));
router.post('/fintoc', (req, res) => res.status(200).json({ received: true }));

// GET /api/webhook/health
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        router: 'webhooks',
        firma_configurada: !!NOWPAYMENTS_IPN_SECRET,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;