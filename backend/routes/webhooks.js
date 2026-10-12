// ================================================================
// ROUTES/WEBHOOKS.JS - SARIEL'S ECOSYSTEM
// ================================================================
// Router principal de webhooks. server.js lo monta en /api/webhook
//
// Webhooks soportados:
//   POST /api/webhook/nowpayments → IPN de NOWPayments
//   POST /api/webhook/membresia   → Membresía Pro (alias)
//   POST /api/webhook/stripe      → Placeholder
//   POST /api/webhook/fintoc      → Placeholder
//
// Depende de:
//   - handleWebhookMembresia      (membresías Pro)
//   - handleWebhookLivePass       (Live Pass - order_id "LP-")
//   - handleWebhookDonacionLive   (Donaciones Live - order_id "DON-")
//   - handleWebhookInternet       (Paquetes Internet - order_id "NET-")
//   - procesarWebhookMuro         (Muro P2P - resto)
// ================================================================

const express = require('express');
const router = express.Router();

// ================================================================
// HANDLERS
// ================================================================
const { handleWebhookMembresia } = require('./membresia-webhook-handler');

const { handleWebhookLivePass } = require('./livepass-webhook-handler');

const { handleWebhookDonacionLive } = require('./live-donacion-webhook-handler');

const { handleWebhookInternet } = require('./webhooks/nowpayments-internet');

// Muro P2P — puede no existir
let procesarWebhookMuro = null;
try {
    const nowpaymentsHandler = require('./webhooks/nowpayments');

    if (typeof nowpaymentsHandler === 'function') {
        procesarWebhookMuro = nowpaymentsHandler;
    } else if (
        nowpaymentsHandler &&
        typeof nowpaymentsHandler.procesarWebhookMuro === 'function'
    ) {
        procesarWebhookMuro = nowpaymentsHandler.procesarWebhookMuro;
    }
} catch (e) {
    console.log(
        'ℹ️ routes/webhooks/nowpayments.js no disponible o sin export compatible'
    );
}

// ================================================================
// POST /api/webhook/nowpayments
// ================================================================
// Según order_id:
//   "PRO-"  → Membresía Pro
//   "LP-"   → Live Pass
//   "DON-"  → Donación de Live
//   "NET-"  → Paquete Internet
//   otro    → Muro P2P
// ================================================================
router.post('/nowpayments', async (req, res) => {
    try {
        const payload = req.body || {};
        const orderId = String(payload.order_id || '');
        const orderUpper = orderId.toUpperCase();

        console.log(
            '📩 Webhook recibido en /api/webhook/nowpayments:',
            {
                order_id: orderId,
                payment_status: payload.payment_status,
                payment_id: payload.payment_id
            }
        );

        // 1) MEMBRESÍA PRO
        if (orderUpper.startsWith('PRO-')) {
            console.log('💳 Webhook identificado como membresía Pro:', orderId);
            return await handleWebhookMembresia(req, res);
        }

        // 2) LIVE PASS
        if (orderUpper.startsWith('LP-')) {
            console.log('🎥 Webhook identificado como Live Pass:', orderId);
            return await handleWebhookLivePass(req, res);
        }

        // 3) DONACIÓN DE LIVE
        if (orderUpper.startsWith('DON-')) {
            console.log('💎 Webhook identificado como donación de Live:', orderId);
            return await handleWebhookDonacionLive(req, res);
        }

        // 4) PAQUETE DE INTERNET
        if (orderUpper.startsWith('NET-')) {
            console.log('🌐 Webhook identificado como paquete de Internet:', orderId);
            return await handleWebhookInternet(req, res);
        }

        // 5) MURO P2P
        if (procesarWebhookMuro) {
            return procesarWebhookMuro(req, res);
        }

        // 6) FALLBACK
        console.warn('⚠️ Webhook sin handler específico:', { order_id: orderId });

        return res.status(200).json({
            status: 'ok',
            message: 'Recibido (sin handler)'
        });

    } catch (error) {
        console.error('❌ Error en /api/webhook/nowpayments:', error);
        return res.status(500).json({
            status: 'error',
            error: 'Error interno'
        });
    }
});

// ================================================================
// POST /api/webhook/membresia
// ================================================================
router.post('/membresia', async (req, res) => {
    try {
        console.log('📩 Webhook de membresía recibido en /api/webhook/membresia');
        return await handleWebhookMembresia(req, res);
    } catch (error) {
        console.error('❌ Error en /api/webhook/membresia:', error);
        return res.status(500).json({
            status: 'error',
            error: 'Error interno'
        });
    }
});

// ================================================================
// POST /api/webhook/stripe
// ================================================================
router.post('/stripe', (req, res) => {
    console.log('📩 Webhook Stripe recibido (no implementado)');
    return res.status(200).json({ received: true });
});

// ================================================================
// POST /api/webhook/fintoc
// ================================================================
router.post('/fintoc', (req, res) => {
    console.log('📩 Webhook Fintoc recibido (no implementado)');
    return res.status(200).json({ received: true });
});

// ================================================================
// GET /api/webhook/health
// ================================================================
router.get('/health', (req, res) => {
    return res.status(200).json({
        status: 'ok',
        router: 'webhooks',
        handlers: {
            membresia_pro: !!handleWebhookMembresia,
            live_pass: !!handleWebhookLivePass,
            donacion_live: !!handleWebhookDonacionLive,
            internet: !!handleWebhookInternet,
            muro_p2p: !!procesarWebhookMuro
        },
        timestamp: new Date().toISOString()
    });
});

module.exports = router;