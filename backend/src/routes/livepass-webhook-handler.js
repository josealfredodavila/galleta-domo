// ================================================================
// ROUTES/LIVEPASS-WEBHOOK-HANDLER.JS - SARIEL'S ECOSYSTEM
// ================================================================
// Handler para procesar los webhooks (IPN) de NOWPayments
// que corresponden al Live Pass (order_id empieza con "LP-").
//
// Reutiliza la misma lógica que membresia-webhook-handler.js pero:
// - Llama a la RPC `activar_live_pass` (no `activar_membresia_pro`)
// - Extrae el plan_tipo del order_id o del payload
//
// ================================================================

const crypto = require('crypto');

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

// ================================================================
// VALIDAR FIRMA DE NOWPAYMENTS
// ================================================================

function validarFirmaNowPayments(req) {
    // Si no está configurado el secret, no podemos validar.
    // En producción debería estar SIEMPRE configurado.
    if (!NOWPAYMENTS_IPN_SECRET) {
        console.warn(
            '⚠️ [LivePass Webhook] NOWPAYMENTS_IPN_SECRET no configurado. Saltando validación.'
        );
        return true;
    }

    const sig =
        req.headers['x-nowpayments-sig'] ||
        req.headers['x-signature'];

    if (!sig) {
        console.error(
            '❌ [LivePass Webhook] Falta cabecera de firma (x-nowpayments-sig).'
        );
        return false;
    }

    const rawBody = req.rawBody || '';

    if (!rawBody) {
        console.error(
            '❌ [LivePass Webhook] No hay rawBody para verificar firma.'
        );
        return false;
    }

    const hmac = crypto
        .createHmac('sha512', NOWPAYMENTS_IPN_SECRET)
        .update(rawBody)
        .digest('hex');

    if (hmac !== sig) {
        console.error(
            '❌ [LivePass Webhook] Firma inválida.'
        );
        return false;
    }

    return true;
}

// ================================================================
// DETERMINAR PLAN TIPO DESDE EL PAYLOAD
// ================================================================
// NOWPayments devuelve el order_id original en el payload.
// Ejemplo: "LP-1712345678901-abc12345"
//
// El plan_tipo real (live_basico o live_pro) lo determina:
// 1) Si el payload incluye metadata → usarlo
// 2) Si no, buscar en pagos_membresia por order_id
// ================================================================

async function determinarPlanTipo(orderId, payload) {
    // 1) Intentar obtener de metadata del payload
    if (payload && payload.metadata) {
        const meta =
            typeof payload.metadata === 'string'
                ? JSON.parse(payload.metadata || '{}')
                : payload.metadata;

        if (meta && (meta.plan_tipo === 'live_basico' || meta.plan_tipo === 'live_pro')) {
            return meta.plan_tipo;
        }
    }

    // 2) Buscar en pagos_membresia por order_id para obtener monto
    const { data: pago, error } = await supabaseAdmin
        .from('pagos_membresia')
        .select('monto_mxn')
        .eq('order_id', orderId)
        .maybeSingle();

    if (error) {
        console.error(
            '❌ [LivePass Webhook] Error buscando pago:',
            error
        );
        return null;
    }

    if (!pago) {
        console.error(
            '❌ [LivePass Webhook] Pago no encontrado para order_id:',
            orderId
        );
        return null;
    }

    // 3) Determinar plan por monto
    const monto = parseFloat(pago.monto_mxn);

    if (monto === 300) return 'live_basico';
    if (monto === 600) return 'live_pro';

    console.error(
        '❌ [LivePass Webhook] No se pudo determinar plan por monto:',
        monto
    );
    return null;
}

// ================================================================
// HANDLER PRINCIPAL
// ================================================================

async function handleWebhookLivePass(req, res) {
    try {
        console.log(
            '🎥 [LivePass Webhook] Procesando webhook de Live Pass...'
        );

        // 1) Validar firma
        if (!validarFirmaNowPayments(req)) {
            console.error(
                '❌ [LivePass Webhook] Firma inválida. Rechazando.'
            );
            return res.status(401).json({
                status: 'error',
                error: 'Firma inválida'
            });
        }

        const payload = req.body || {};
        const orderId = String(payload.order_id || '');
        const paymentId = String(payload.payment_id || '');
        const paymentStatus = String(payload.payment_status || '').toLowerCase();

        console.log(
            '🎥 [LivePass Webhook] Datos:',
            {
                order_id: orderId,
                payment_id: paymentId,
                payment_status: paymentStatus
            }
        );

        // 2) Solo procesar si el pago está confirmado
        const estadosOk = ['finished', 'confirmed', 'partially_paid'];

        if (!estadosOk.includes(paymentStatus)) {
            console.log(
                `ℹ️ [LivePass Webhook] Estado "${paymentStatus}" no es válido para activar. Ignorando.`
            );

            return res.status(200).json({
                status: 'ok',
                message: 'Estado no procesable',
                payment_status: paymentStatus
            });
        }

        // 3) Obtener el pago en la BD
        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .select('id, usuario_id, monto_mxn, estado')
            .eq('order_id', orderId)
            .maybeSingle();

        if (pagoError) {
            console.error(
                '❌ [LivePass Webhook] Error buscando pago:',
                pagoError
            );
            return res.status(500).json({
                status: 'error',
                error: 'Error buscando pago'
            });
        }

        if (!pago) {
            console.error(
                '❌ [LivePass Webhook] Pago no encontrado:',
                orderId
            );
            return res.status(404).json({
                status: 'error',
                error: 'Pago no encontrado'
            });
        }

        // 4) Idempotencia: si ya está finished, no hacer nada
        if (pago.estado === 'finished') {
            console.log(
                'ℹ️ [LivePass Webhook] Pago ya procesado previamente. Ignorando.'
            );
            return res.status(200).json({
                status: 'ok',
                message: 'Ya procesado previamente'
            });
        }

        // 5) Determinar plan_tipo
        const planTipo = await determinarPlanTipo(orderId, payload);

        if (!planTipo) {
            console.error(
                '❌ [LivePass Webhook] No se pudo determinar plan_tipo para:',
                orderId
            );
            return res.status(400).json({
                status: 'error',
                error: 'No se pudo determinar plan_tipo'
            });
        }

        console.log(
            '🎯 [LivePass Webhook] Plan detectado:',
            planTipo
        );

        // 6) Extraer datos del payload
        const payAddress =
            payload.pay_address ||
            payload.payin_address ||
            payload.payout_address ||
            null;

        const privacyVersion = '1.0';

        // 7) Llamar a la RPC `activar_live_pass`
        const { data: rpcResult, error: rpcError } = await supabaseAdmin
            .rpc('activar_live_pass', {
                p_usuario_id: pago.usuario_id,
                p_order_id: orderId,
                p_payment_id: paymentId,
                p_monto_mxn: parseFloat(pago.monto_mxn),
                p_plan_tipo: planTipo,
                p_pay_address: payAddress,
                p_privacy_version: privacyVersion
            });

        if (rpcError) {
            console.error(
                '❌ [LivePass Webhook] Error llamando RPC activar_live_pass:',
                rpcError
            );
            return res.status(500).json({
                status: 'error',
                error: 'Error activando Live Pass'
            });
        }

        console.log(
            '✅ [LivePass Webhook] Live Pass activado:',
            rpcResult
        );

        return res.status(200).json({
            status: 'ok',
            message: 'Live Pass activado',
            result: rpcResult
        });

    } catch (error) {
        console.error(
            '❌ [LivePass Webhook] Error inesperado:',
            error
        );

        return res.status(500).json({
            status: 'error',
            error: 'Error interno'
        });
    }
}

// ================================================================
// EXPORT
// ================================================================

module.exports = {
    handleWebhookLivePass
};