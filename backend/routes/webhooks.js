// ================================================================
// ROUTES/WEBHOOKS.JS - SARIEL'S ECOSYSTEM
// ================================================================
// Router principal de webhooks. server.js lo monta en /api/webhook
//
// Webhooks soportados:
// - POST /api/webhook/nowpayments → IPN de NOWPayments
// - POST /api/webhook/membresia   → Membresía Pro (alias)
// - POST /api/webhook/stripe      → Placeholder
// - POST /api/webhook/fintoc      → Placeholder
// ================================================================

const express = require('express');
const router = express.Router();

// ================================================================
// HANDLER DE MEMBRESÍA PRO
// ================================================================
const {
    procesarWebhookMembresia
} = require('./membresia-webhook-handler');

// ================================================================
// HANDLER DE NOWPAYMENTS PARA EL MURO
// (puede venir de routes/webhooks/nowpayments.js si existe)
// ================================================================
let procesarWebhookMuro = null;
try {
    const nowpaymentsHandler = require('./webhooks/nowpayments');
    if (typeof nowpaymentsHandler === 'function') {
        procesarWebhookMuro = nowpaymentsHandler;
    } else if (nowpaymentsHandler && typeof nowpaymentsHandler.procesarWebhookMuro === 'function') {
        procesarWebhookMuro = nowpaymentsHandler.procesarWebhookMuro;
    }
} catch (e) {
    // El archivo puede no existir o tener otra forma. No es crítico.
    console.log('ℹ️ routes/webhooks/nowpayments.js no disponible o sin export compatible');
}

// ================================================================
// POST /api/webhook/nowpayments
// ================================================================
// Recibe los IPN de NOWPayments. Según el `order_id`, decide a qué
// handler enrutar:
//   - order_id empieza con "pro_" → membresía Pro
//   - en cualquier otro caso → Muro (si el handler existe)
// ================================================================
router.post('/nowpayments', async (req, res) => {
    try {
        const payload = req.body || {};
        const orderId = payload.order_id || '';

        console.log('📩 Webhook recibido en /api/webhook/nowpayments:', {
            order_id: orderId,
            payment_status: payload.payment_status,
            payment_id: payload.payment_id
        });

        // 1) Membresía Pro
        if (orderId.startsWith('pro_')) {
            const result = await procesarWebhookMembresia(payload);
            if (result.success) {
                return res.status(200).json({ status: 'ok' });
            }
            return res
                .status(result.noRetry ? 200 : 500)
                .json({ status: 'error', error: result.error });
        }

        // 2) Muro P2P (si el handler existe)
        if (procesarWebhookMuro) {
            try {
                const result = await procesarWebhookMuro(payload);
                if (result && result.success === false) {
                    return res.status(result.noRetry ? 200 : 500).json({
                        status: 'error',
                        error: result.error
                    });
                }
                return res.status(200).json({ status: 'ok' });
            } catch (e) {
                console.error('❌ Error procesando webhook del Muro:', e);
                return res.status(500).json({ status: 'error', error: e.message });
            }
        }

        // 3) Fallback: no hay handler específico
        console.warn('⚠️ Webhook sin handler específico:', { order_id: orderId });
        return res.status(200).json({ status: 'ok', message: 'Recibido (sin handler)' });

    } catch (error) {
        console.error('❌ Error en /api/webhook/nowpayments:', error);
        return res.status(500).json({ status: 'error', error: 'Error interno' });
    }
});

// ================================================================
// POST /api/webhook/membresia (alias)
// ================================================================
router.post('/membresia', async (req, res) => {
    try {
        const payload = req.body || {};
        const result = await procesarWebhookMembresia(payload);

        if (result.success) {
            return res.status(200).json({ status: 'ok' });
        }
        return res
            .status(result.noRetry ? 200 : 500)
            .json({ status: 'error', error: result.error });

    } catch (error) {
        console.error('❌ Error en /api/webhook/membresia:', error);
        return res.status(500).json({ status: 'error', error: 'Error interno' });
    }
});

// ================================================================
// POST /api/webhook/stripe (placeholder)
// ================================================================
router.post('/stripe', (req, res) => {
    console.log('📩 Webhook Stripe recibido (no implementado)');
    return res.status(200).json({ received: true });
});

// ================================================================
// POST /api/webhook/fintoc (placeholder)
// ================================================================
router.post('/fintoc', (req, res) => {
    console.log('📩 Webhook Fintoc recibido (no implementado)');
    return res.status(200).json({ received: true });
});

// ================================================================
// GET /api/webhook/health (útil para verificar que el router vive)
// ================================================================
router.get('/health', (req, res) => {
    return res.status(200).json({
        status: 'ok',
        router: 'webhooks',
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// EXPORT
// ================================================================
// ⚠️ CRÍTICO: debe exportar el router, NO un objeto
module.exports = router;