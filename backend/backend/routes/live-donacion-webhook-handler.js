// ================================================================
// ROUTES/LIVE-DONACION-WEBHOOK-HANDLER.JS - SARIEL'S ECOSYSTEM
// ================================================================
// IPN de NOWPayments para donaciones de Live (order_id "DON-...").
//
// - Firma obligatoria: HMAC-SHA512 (utils/nowpayments-sig).
// - Solo procesa estados finales (finished, confirmed).
// - Idempotente: si la donación ya está pagada, ignora.
// - Fallos temporales → 500 (reintentar).
// - Fallos permanentes → 200 (no reintentar).
// ================================================================

const { createClient } = require('@supabase/supabase-js');
const { verificarFirmaNowPayments } = require('../utils/nowpayments-sig.js');

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

const ESTADOS_FINALES = ['finished', 'confirmed'];

// ================================================================
// LOGS ESTRUCTURADOS
// ================================================================
function log(evento, datos = {}) {
    console.log(JSON.stringify({
        t: new Date().toISOString(),
        mod: 'live-donacion-webhook',
        evento,
        ...datos
    }));
}

function ignorado(res, motivo, extra = {}) {
    return res.status(200).json({
        status: 'ignored',
        motivo,
        ...extra
    });
}

// ================================================================
// VERIFICAR FIRMA
// ================================================================
function firmaValida(req) {
    const firma = req.headers['x-nowpayments-sig'];
    if (!firma) return false;

    try {
        return verificarFirmaNowPayments(
            req.body,
            req.rawBody,
            firma,
            NOWPAYMENTS_IPN_SECRET
        );
    } catch (err) {
        log('firma_error', { motivo: err.message });
        return false;
    }
}

// ================================================================
// HANDLER PRINCIPAL
// ================================================================
async function handleWebhookDonacionLive(req, res) {
    try {
        // 1) Configuración
        if (!NOWPAYMENTS_IPN_SECRET || !req.rawBody) {
            log('config_incompleta');
            return res.status(500).json({
                status: 'error',
                error: 'Configuración incompleta'
            });
        }

        // 2) Firma obligatoria
        if (!firmaValida(req)) {
            log('firma_invalida');
            return res.status(401).json({
                status: 'error',
                error: 'Firma inválida'
            });
        }

        const payload = req.body || {};
        const orderId = String(payload.order_id || '');
        const paymentId = String(payload.payment_id || '');
        const estado = String(payload.payment_status || '').toLowerCase();

        // 3) Filtro: solo donaciones
        if (!orderId.startsWith('DON-')) {
            return ignorado(res, 'no_es_donacion');
        }

        // 4) Filtro: solo estados finales
        if (!ESTADOS_FINALES.includes(estado)) {
            return ignorado(res, 'estado_no_final', {
                payment_status: estado
            });
        }

        // 5) Extraer donacion_id
        const donacionId = parseInt(orderId.replace('DON-', ''), 10);

        if (!Number.isInteger(donacionId) || donacionId <= 0) {
            log('id_invalido', { order_id: orderId });
            return ignorado(res, 'id_invalido');
        }

        // 6) Confirmar vía RPC
        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
            'confirmar_donacion_live',
            {
                p_donacion_id: donacionId,
                p_payment_id: paymentId
            }
        );

        if (rpcError) {
            log('error_rpc', {
                donacion_id: donacionId,
                motivo: rpcError.message
            });
            return res.status(500).json({
                status: 'error',
                error: 'Error confirmando donación'
            });
        }

        // La RPC puede devolver { success: false, error: 'no_encontrada' }
        if (!rpcResult || rpcResult.success !== true) {
            log('rechazo', {
                donacion_id: donacionId,
                motivo: rpcResult?.error
            });
            return ignorado(res, 'rechazado', {
                error: rpcResult?.error || 'sin_respuesta'
            });
        }

        // 7) Éxito (nuevo o ya procesada)
        log('donacion_confirmada', {
            donacion_id: donacionId,
            ya_procesada: rpcResult.ya_procesada === true
        });

        return res.status(200).json({
            status: 'ok',
            message: rpcResult.ya_procesada
                ? 'Donación ya procesada'
                : 'Donación confirmada',
            donacion_id: donacionId
        });
    } catch (error) {
        log('error_inesperado', { motivo: error.message });
        return res.status(500).json({
            status: 'error',
            error: 'Error interno'
        });
    }
}

module.exports = { handleWebhookDonacionLive };