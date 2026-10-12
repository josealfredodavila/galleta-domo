// ================================================================
// MEMBRESIA-WEBHOOK-HANDLER.JS — Csariel's (membresía Pro, order "PRO-")
// Llamado desde routes/webhooks.js, que ya verificó la firma.
// La activación la hace activar_membresia_pro (SQL, idempotente).
// Errores temporales → 500 (NOWPayments reintenta).
// Errores permanentes → 200 (reintentar no los arregla).
// ================================================================

const { supabaseAdmin } = require('../config/supabase');
const { verificarFirmaNowPayments } = require('../utils/nowpayments-sig');

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

// Estados que el CHECK de pagos_membresia permite
const MAPA_ESTADO = {
    waiting: 'waiting',
    confirming: 'confirming',
    sending: 'confirming',
    confirmed: 'confirmed',
    partially_paid: 'partially_paid',
    failed: 'failed',
    refunded: 'refunded',
    expired: 'expired',
    canceled: 'failed',
    cancelled: 'failed'
};

const log = (...args) => console.log('[Membresía Pro]', ...args);
const logError = (...args) => console.error('[Membresía Pro ERROR]', ...args);

function firmaValida(payload, rawBody, signature) {
    if (!NOWPAYMENTS_IPN_SECRET || !signature) return false;
    return verificarFirmaNowPayments(payload, rawBody, signature, NOWPAYMENTS_IPN_SECRET);
}

// Devuelve { success, noRetry?, error?, message?, data? }
async function procesarWebhookMembresia(payload) {
    try {
        const orderId = String(payload.order_id || '');
        const paymentId = payload.payment_id != null ? String(payload.payment_id) : null;
        const status = String(payload.payment_status || '').toLowerCase();

        if (!orderId) return { success: false, noRetry: true, error: 'sin_order_id' };

        const { data: pago, error: errPago } = await supabaseAdmin
            .from('pagos_membresia')
            .select('id, usuario_id, estado, monto_mxn')
            .eq('order_id', orderId)
            .maybeSingle();

        if (errPago) {
            logError('consulta pago:', errPago.message);
            return { success: false, error: 'db' };
        }
        if (!pago) {
            logError('pago no encontrado:', orderId);
            return { success: false, noRetry: true, error: 'pago_no_encontrado' };
        }
        if (pago.estado === 'finished') {
            return { success: true, message: 'ya_confirmado' };
        }

        const esFinal = status === 'finished' || status === 'confirmed';

        // ---------- Estados intermedios o fallidos: solo registrar ----------
        if (!esFinal) {
            const { error: errUpd } = await supabaseAdmin
                .from('pagos_membresia')
                .update({
                    estado: MAPA_ESTADO[status] || pago.estado,
                    payment_id: paymentId || undefined,
                    datos_webhook: payload,
                    updated_at: new Date().toISOString()
                })
                .eq('id', pago.id)
                .neq('estado', 'finished');

            if (errUpd) {
                logError('actualizar estado:', errUpd.message);
                return { success: false, error: 'db' };
            }
            return { success: true, message: 'estado_registrado' };
        }

        // ---------- Pago final: validar monto antes de activar ----------
        // Requiere que la factura Pro se haya creado en MXN (ver nota del paquete).
        const precio = Number(payload.price_amount);
        const moneda = String(payload.price_currency || '').toLowerCase();
        if (moneda !== 'mxn' || !Number.isFinite(precio) || Math.abs(precio - Number(pago.monto_mxn)) > 0.01) {
            logError('monto/moneda no coincide:', orderId, { precio, moneda, esperado: pago.monto_mxn });
            await supabaseAdmin.from('pagos_membresia')
                .update({
                    estado: 'failed',
                    datos_webhook: { ...payload, motivo: 'monto_o_moneda_no_coincide' },
                    updated_at: new Date().toISOString()
                })
                .eq('id', pago.id);
            return { success: false, noRetry: true, error: 'monto_no_coincide' };
        }

        // ---------- Activación (idempotente en SQL) ----------
        const { data: r, error: errRpc } = await supabaseAdmin.rpc('activar_membresia_pro', {
            p_usuario_id: pago.usuario_id,
            p_order_id: orderId,
            p_payment_id: paymentId,
            p_monto_mxn: pago.monto_mxn,
            p_pay_address: payload.pay_address || null,
            p_privacy_version: '1.0'
        });

        if (errRpc) {
            logError('RPC activar_membresia_pro:', errRpc.message);
            return { success: false, error: 'db' };
        }

        // La RPC devuelve { success: false } sin lanzar error
        if (!r || r.success !== true) {
            const motivo = r?.error || 'sin_respuesta';
            logError('activación rechazada, revisión manual:', orderId, motivo);
            return { success: false, noRetry: true, error: motivo };
        }

        await supabaseAdmin.from('pagos_membresia')
            .update({ datos_webhook: payload, updated_at: new Date().toISOString() })
            .eq('id', pago.id);

        log(r.already_processed ? 'ya activada:' : 'activada:', orderId);
        return { success: true, data: r };
    } catch (e) {
        logError('procesarWebhookMembresia:', e.message);
        return { success: false, error: 'excepcion' };
    }
}

// Handler HTTP. routes/webhooks.js lo llama tras verificar la firma;
// aquí se vuelve a verificar para que también funcione montado solo.
async function handleWebhookMembresia(req, res) {
    try {
        const signature = req.headers['x-nowpayments-sig'];
        if (!NOWPAYMENTS_IPN_SECRET) {
            logError('NOWPAYMENTS_IPN_SECRET no configurado');
            return res.status(500).json({ ok: false, error: 'config' });
        }
        if (!firmaValida(req.body, req.rawBody, signature)) {
            logError('firma inválida');
            return res.status(401).json({ ok: false, error: 'firma' });
        }

        const result = await procesarWebhookMembresia(req.body || {});

        if (result.success) return res.status(200).json({ ok: true, ...result });
        if (result.noRetry) return res.status(200).json({ ok: true, ignorado: result.error });
        return res.status(500).json({ ok: false, error: result.error });
    } catch (e) {
        logError('handler:', e.message);
        return res.status(500).json({ ok: false, error: 'interno' });
    }
}

module.exports = { handleWebhookMembresia, procesarWebhookMembresia };