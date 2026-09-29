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
// IMPORTANTE:
// - handleWebhookMembresia() valida la firma de NOWPayments.
// - procesarWebhookMembresia() procesa directamente el payload.
//
// Las peticiones HTTP públicas deben utilizar
// handleWebhookMembresia() para no saltarse la validación
// criptográfica del webhook.
// ================================================================
const {
    handleWebhookMembresia
} = require('./membresia-webhook-handler');

// ================================================================
// HANDLER DE NOWPAYMENTS PARA EL MURO
// ================================================================
// routes/webhooks/nowpayments.js exporta un Express Router.
//
// Los Routers de Express son funciones (typeof === 'function'), así
// que la primera rama del if lo captura directamente.
//
// El Router espera (req, res) porque necesita:
//   - req.rawBody                     → verificar HMAC-SHA512
//   - req.headers['x-nowpayments-sig'] → verificar HMAC-SHA512
//   - req.body                        → payload del IPN
//
// NO se le pasa solo el payload: sin los headers ni el rawBody no
// puede verificar la firma.
// ================================================================
let procesarWebhookMuro = null;

try {
    const nowpaymentsHandler = require('./webhooks/nowpayments');

    if (typeof nowpaymentsHandler === 'function') {
        // Express Router (o cualquier handler con firma (req, res, next)).
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
// Recibe los IPN de NOWPayments.
//
// Según order_id:
//   - order_id empieza con "PRO-" (case-insensitive) → Membresía Pro
//   - cualquier otro order_id → Muro P2P
//
// IMPORTANTE:
// El prefijo real que emite routes/membresia.js es "PRO-" (mayúsculas
// con guion). Se compara con toUpperCase() para no perder ningún IPN.
//
// Para membresía Pro se utiliza handleWebhookMembresia()
// y NO procesarWebhookMembresia() directamente.
//
// Esto garantiza que se compruebe:
//   x-nowpayments-sig
//   x-signature
//   NOWPAYMENTS_IPN_SECRET
//   rawBody
// ================================================================
router.post('/nowpayments', async (req, res) => {
    try {
        const payload = req.body || {};
        const orderId = String(payload.order_id || '');

        console.log(
            '📩 Webhook recibido en /api/webhook/nowpayments:',
            {
                order_id: orderId,
                payment_status: payload.payment_status,
                payment_id: payload.payment_id
            }
        );

        // ============================================================
        // 1) MEMBRESÍA PRO
        // ============================================================
        // El prefijo real es "PRO-" (mayúsculas). Se normaliza a
        // mayúsculas para tolerar también "pro-" si algún día cambia.
        if (orderId.toUpperCase().startsWith('PRO-')) {
            console.log(
                '💳 Webhook identificado como membresía Pro:',
                orderId
            );

            // IMPORTANTE:
            // Este handler valida la firma de NOWPayments antes
            // de permitir el procesamiento del pago.
            return await handleWebhookMembresia(req, res);
        }

        // ============================================================
        // 2) MURO P2P
        // ============================================================
        // Cubre muro_, MKT- y NET- (todos los que no son PRO-).
        //
        // IMPORTANTE:
        // Se delega el Router COMPLETO con (req, res) para que el
        // handler del Muro pueda:
        //   - verificar la firma HMAC-SHA512 con req.rawBody
        //     y req.headers['x-nowpayments-sig']
        //   - leer req.body
        //
        // NO se le pasa solo el payload.
        if (procesarWebhookMuro) {
            return procesarWebhookMuro(req, res);
        }

        // ============================================================
        // 3) FALLBACK
        // ============================================================
        console.warn(
            '⚠️ Webhook sin handler específico:',
            {
                order_id: orderId
            }
        );

        // Se devuelve 200 para evitar reintentos innecesarios
        // cuando el pedido no pertenece a ningún handler conocido.
        return res.status(200).json({
            status: 'ok',
            message: 'Recibido (sin handler)'
        });

    } catch (error) {
        console.error(
            '❌ Error en /api/webhook/nowpayments:',
            error
        );

        return res.status(500).json({
            status: 'error',
            error: 'Error interno'
        });
    }
});

// ================================================================
// POST /api/webhook/membresia
// ================================================================
// Alias para recibir directamente el webhook de membresía.
//
// IMPORTANTE:
// También utiliza handleWebhookMembresia() para que la firma
// de NOWPayments sea obligatoria.
// ================================================================
router.post('/membresia', async (req, res) => {
    try {
        console.log(
            '📩 Webhook de membresía recibido en /api/webhook/membresia'
        );

        return await handleWebhookMembresia(req, res);

    } catch (error) {
        console.error(
            '❌ Error en /api/webhook/membresia:',
            error
        );

        return res.status(500).json({
            status: 'error',
            error: 'Error interno'
        });
    }
});

// ================================================================
// POST /api/webhook/stripe
// ================================================================
// Placeholder.
// No procesa pagos todavía.
// ================================================================
router.post('/stripe', (req, res) => {
    console.log(
        '📩 Webhook Stripe recibido (no implementado)'
    );

    return res.status(200).json({
        received: true
    });
});

// ================================================================
// POST /api/webhook/fintoc
// ================================================================
// Placeholder.
// No procesa pagos todavía.
// ================================================================
router.post('/fintoc', (req, res) => {
    console.log(
        '📩 Webhook Fintoc recibido (no implementado)'
    );

    return res.status(200).json({
        received: true
    });
});

// ================================================================
// GET /api/webhook/health
// ================================================================
// Útil para verificar que el router de webhooks está montado.
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
// CRÍTICO:
// server.js hace:
//
// const webhookRoutes = require('./routes/webhooks');
// app.use('/api/webhook', webhookRoutes);
//
// Por eso este archivo DEBE exportar directamente el Router.
//
// NO cambiar a:
// module.exports = { router };
//
// NO cambiar a:
// module.exports = { webhookRoutes };
// ================================================================
module.exports = router;