// ================================================================
// ROUTES/WEBHOOKS.JS — Csariel's
// Montado en /api/webhook
//   POST /api/webhook/nowpayments → IPN de NOWPayments (firma verificada)
//   POST /api/webhook/membresia   → membresía PRO (firma verificada)
//   POST /api/webhook/stripe      → placeholder
//   POST /api/webhook/fintoc      → placeholder
// Toda petición de NOWPayments pasa primero por verificarFirmaNowPayments.
// ================================================================

const express = require('express');
const router = express.Router();

const { verificarFirmaNowPayments } = require('../utils/nowpayments-sig');
const nowpayments = require('./webhooks/nowpayments');
const { handleWebhookMembresia } = require('./membresia-webhook-handler');
const { handleWebhookInternet } = require('./webhooks/nowpayments-internet');

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
        if (orderUpper.startsWith('PRO-')) {
            return handleWebhookMembresia(req, res);
        }
        if (orderUpper.startsWith('NET-')) {
            return handleWebhookInternet(req, res);
        }

        // Resto (muro_, MKT-, TRX-, membresía de Mercado): busca por payment_id.
        // Si no existe, responde 200 sin activar nada.
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