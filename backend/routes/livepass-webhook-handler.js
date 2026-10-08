// ================================================================
// ROUTES/LIVEPASS-WEBHOOK-HANDLER.JS - SARIEL'S ECOSYSTEM
// IPN de NOWPayments para Live Pass (order_id con prefijo "LP-").
//
// - Firma obligatoria: HMAC-SHA512 sobre JSON con claves ordenadas (utils/nowpayments-sig).
// - Solo activa con estados finales (finished, confirmed). Nunca con partially_paid.
// - Fallos permanentes responden 200 para que NOWPayments no reintente.
// - Fallos temporales responden 500 para que NOWPayments reintente.
// - Sin datos personales en logs.
// ================================================================

const { createClient } = require('@supabase/supabase-js');
const { verificarFirmaNowPayments } = require('../utils/nowpayments-sig.js');

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

const ESTADOS_FINALES = ['finished', 'confirmed'];
const PLANES_LIVE = ['live_basico', 'live_pro'];

// Respaldo si el pedido no trae metadata. Frágil: si cambian precios, hay que actualizarlo.
const PLAN_POR_MONTO = { 300: 'live_basico', 600: 'live_pro' };

function log(evento, datos = {}) {
    console.log(JSON.stringify({
        t: new Date().toISOString(),
        mod: 'livepass-webhook',
        evento,
        ...datos
    }));
}

// Respuesta de "no procesar, no reintentar"
function ignorado(res, motivo, extra = {}) {
    return res.status(200).json({ status: 'ignored', motivo, ...extra });
}

function firmaValida(req) {
    const firma = req.headers['x-nowpayments-sig'];
    if (!firma) return false;

    try {
        return verificarFirmaNowPayments(req.body, req.rawBody, firma, NOWPAYMENTS_IPN_SECRET);
    } catch (err) {
        log('firma_error', { motivo: err.message });
        return false;
    }
}

// Devuelve 'live_basico' | 'live_pro' | null. Lanza error solo si la base falla.
async function determinarPlanTipo(orderId, payload) {
    if (payload.metadata) {
        try {
            const meta = typeof payload.metadata === 'string'
                ? JSON.parse(payload.metadata)
                : payload.metadata;
            if (meta && PLANES_LIVE.includes(meta.plan_tipo)) {
                return meta.plan_tipo;
            }
        } catch {
            // metadata malformada: se intenta por monto
        }
    }

    const { data: pago, error } = await supabaseAdmin
        .from('pagos_membresia')
        .select('monto_mxn')
        .eq('order_id', orderId)
        .maybeSingle();

    if (error) throw error;
    if (!pago) return null;

    return PLAN_POR_MONTO[parseFloat(pago.monto_mxn)] || null;
}

async function handleWebhookLivePass(req, res) {
    try {
        // 1) Configuración: sin secreto o sin cuerpo crudo no se procesa nada
        if (!NOWPAYMENTS_IPN_SECRET || !req.rawBody) {
            log('config_incompleta');
            return res.status(500).json({ status: 'error', error: 'Configuración incompleta' });
        }

        // 2) Firma obligatoria
        if (!firmaValida(req)) {
            log('firma_invalida');
            return res.status(401).json({ status: 'error', error: 'Firma inválida' });
        }

        const payload = req.body || {};
        const orderId = String(payload.order_id || '');
        const paymentId = String(payload.payment_id || '');
        const estado = String(payload.payment_status || '').toLowerCase();

        // 3) Filtros: ignorar sin reintentos lo que no es nuestro o no es final
        if (!orderId.startsWith('LP-')) {
            return ignorado(res, 'no_es_live_pass');
        }

        if (!ESTADOS_FINALES.includes(estado)) {
            return ignorado(res, 'estado_no_final', { payment_status: estado });
        }

        // 4) Buscar el pago
        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .select('id, usuario_id, monto_mxn, estado')
            .eq('order_id', orderId)
            .maybeSingle();

        if (pagoError) {
            log('error_consulta_pago', { order_id: orderId, motivo: pagoError.message });
            return res.status(500).json({ status: 'error', error: 'Error buscando pago' });
        }

        if (!pago) {
            log('pago_no_encontrado', { order_id: orderId });
            return ignorado(res, 'pago_no_encontrado');
        }

        if (pago.estado === 'finished') {
            return ignorado(res, 'ya_procesado');
        }

        // 5) Determinar el plan
        let planTipo;
        try {
            planTipo = await determinarPlanTipo(orderId, payload);
        } catch (err) {
            log('error_determinar_plan', { order_id: orderId, motivo: err.message });
            return res.status(500).json({ status: 'error', error: 'Error determinando plan' });
        }

        if (!planTipo) {
            log('plan_no_determinado', { order_id: orderId });
            return ignorado(res, 'plan_no_determinado');
        }

        // 6) Activar
        const payAddress =
            payload.pay_address || payload.payin_address || payload.payout_address || null;

        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('activar_live_pass', {
            p_usuario_id: pago.usuario_id,
            p_order_id: orderId,
            p_payment_id: paymentId,
            p_monto_mxn: parseFloat(pago.monto_mxn),
            p_plan_tipo: planTipo,
            p_pay_address: payAddress,
            p_privacy_version: '1.0'
        });

        if (rpcError) {
            log('error_rpc', { order_id: orderId, motivo: rpcError.message });
            return res.status(500).json({ status: 'error', error: 'Error activando Live Pass' });
        }

        // La RPC puede responder { success: false } sin lanzar error: no se reporta como éxito
        if (!rpcResult || rpcResult.success !== true) {
            log('rechazo_requiere_revision', {
                order_id: orderId,
                motivo: rpcResult ? rpcResult.error : 'sin_respuesta'
            });
            return ignorado(res, 'rechazado_revision_manual');
        }

        log('live_pass_activado', { order_id: orderId, plan_tipo: planTipo });

        return res.status(200).json({ status: 'ok', message: 'Live Pass activado' });

    } catch (error) {
        log('error_inesperado', { motivo: error.message });
        return res.status(500).json({ status: 'error', error: 'Error interno' });
    }
}

module.exports = { handleWebhookLivePass };