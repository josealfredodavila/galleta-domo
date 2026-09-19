// ================================================================
// MEMBRESIA-WEBHOOK-HANDLER.JS - SARIEL'S ECOSYSTEM
//
// CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR
// 1) Firma: HMAC-SHA512 sobre el JSON con llaves ordenadas
//    (utils/nowpayments-sig.js). Antes usaba sha256 y rechazaba
//    todos los webhooks reales.
// 2) Estados: pagos_membresia_estado_check solo permite
//    pendiente, waiting, confirming, confirmed, finished,
//    partially_paid, failed, refunded, expired.
//    Antes se escribía el estado crudo de NOWPayments ('sending',
//    'canceled', etc.) y el UPDATE fallaba en silencio.
// 3) La RPC activar_membresia_pro devuelve { success: false } SIN
//    lanzar error de Supabase. Antes solo se revisaba result.error,
//    así que una activación fallida se reportaba como éxito.
// 4) La idempotencia ahora la garantiza la RPC (estado 'finished'
//    + pagado_at) y ya no se puede activar dos veces el mismo pago.
// 5) Errores temporales → 500 (NOWPayments reintenta).
//    Errores permanentes (pago inexistente, plan no encontrado)
//    → 200 con log, porque reintentar no los arregla.
//
// UBICACIÓN: backend/routes/membresia-webhook-handler.js
//            (junto a routes/webhooks.js)
// ================================================================

const { supabaseAdmin } = require('../config/supabase.js');
const { verificarFirmaNowPayments } = require('../utils/nowpayments-sig.js');

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

// Estados internos que ya cuentan como pago confirmado
// ('confirmado' es legado de la versión anterior)
const ESTADOS_CONFIRMADOS = ['finished', 'confirmado'];

// ===== VERIFICAR FIRMA =====
function verificarFirma(payload, signature, rawBody) {
    if (!NOWPAYMENTS_IPN_SECRET || !signature) {
        console.warn('⚠️ IPN_SECRET no configurado o firma faltante');
        return false;
    }

    try {
        return verificarFirmaNowPayments(
            payload,
            rawBody,
            signature,
            NOWPAYMENTS_IPN_SECRET
        );
    } catch (error) {
        console.error('❌ Error verificando firma:', error);
        return false;
    }
}

// ===== MAPEAR ESTADO NOWPAYMENTS → ESTADO PERMITIDO POR EL CHECK =====
function estadoPermitido(npStatus, estadoActual) {
    const mapa = {
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

    return mapa[String(npStatus || '').toLowerCase()] || estadoActual;
}

// ===== PROCESAR WEBHOOK =====
// Devuelve { success, message?, error?, noRetry? }
//   noRetry=true → el fallo es permanente; responder 200 para que
//                  NOWPayments no reintente en vano.
async function procesarWebhookMembresia(payload) {
    try {
        const { order_id, payment_id, payment_status } = payload;
        const status = String(payment_status || '').toLowerCase();

        console.log('📩 Webhook membresía:', { order_id, payment_status });

        if (!order_id) {
            return { success: false, noRetry: true, error: 'Falta order_id' };
        }

        // Buscar el pago
        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .select('id, usuario_id, estado, monto_mxn')
            .eq('order_id', order_id)
            .maybeSingle();

        if (pagoError) {
            console.error('❌ Error consultando pago:', pagoError.message);
            return { success: false, error: pagoError.message };
        }

        if (!pago) {
            console.error('❌ Pago no encontrado:', order_id);
            return { success: false, noRetry: true, error: 'Pago no encontrado' };
        }

        // Ya confirmado: nada que hacer
        if (ESTADOS_CONFIRMADOS.includes(pago.estado)) {
            console.log('ℹ️ Pago ya confirmado, ignorando:', order_id);
            return { success: true, message: 'Ya confirmado' };
        }

        const esFinal = status === 'finished' || status === 'confirmed';

        // ---------- Estados intermedios / fallidos: solo registrar ----------
        if (!esFinal) {
            const { error: updError } = await supabaseAdmin
                .from('pagos_membresia')
                .update({
                    estado: estadoPermitido(status, pago.estado),
                    datos_webhook: payload,
                    updated_at: new Date().toISOString()
                })
                .eq('id', pago.id)
                .neq('estado', 'finished');

            if (updError) {
                console.error('❌ Error actualizando pago:', updError.message);
                return { success: false, error: updError.message };
            }

            return { success: true, message: 'Estado actualizado' };
        }

        // ---------- Pago confirmado: activar vía RPC (idempotente) ----------
        const { data: resultado, error: rpcError } = await supabaseAdmin.rpc(
            'activar_membresia_pro',
            {
                p_usuario_id: pago.usuario_id,
                p_order_id: order_id,
                p_payment_id: payment_id ? String(payment_id) : null,
                p_monto_mxn: pago.monto_mxn,
                p_pay_address: payload.pay_address || null,
                p_privacy_version: '1.0'
            }
        );

        if (rpcError) {
            console.error('❌ Error RPC activar_membresia_pro:', rpcError.message);
            return { success: false, error: rpcError.message };
        }

        // La RPC puede devolver { success: false } sin lanzar error
        if (!resultado || resultado.success !== true) {
            const motivo = (resultado && resultado.error) || 'La RPC no devolvió respuesta';
            console.error(
                '🚨 activar_membresia_pro rechazó el pago', order_id, '→', motivo,
                '— requiere revisión manual'
            );
            return { success: false, noRetry: true, error: motivo };
        }

        if (resultado.already_processed) {
            console.log('ℹ️ Membresía ya había sido activada:', order_id);
        } else {
            console.log('✅ Membresía activada para:', pago.usuario_id);
        }

        // Guardar el payload del webhook (mejor esfuerzo, no cambia el estado)
        await supabaseAdmin
            .from('pagos_membresia')
            .update({
                datos_webhook: payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', pago.id);

        return { success: true, data: resultado };

    } catch (error) {
        console.error('❌ Error procesando webhook:', error);
        return { success: false, error: error.message };
    }
}

// ===== HANDLER PRINCIPAL =====
async function handleWebhookMembresia(req, res) {
    try {
        const payload = req.body;
        const signature = req.headers['x-nowpayments-sig'] || req.headers['x-signature'];

        // Verificar firma (OBLIGATORIO)
        if (!NOWPAYMENTS_IPN_SECRET) {
            console.error('❌ NOWPAYMENTS_IPN_SECRET no configurado');
            return res.status(500).json({ error: 'Configuración incompleta' });
        }

        if (!signature) {
            console.error('❌ Firma faltante en webhook');
            return res.status(401).json({ error: 'Firma requerida' });
        }

        const esValida = verificarFirma(payload, signature, req.rawBody);
        if (!esValida) {
            console.error('❌ Firma inválida en webhook');
            return res.status(401).json({ error: 'Firma inválida' });
        }

        // Procesar
        const result = await procesarWebhookMembresia(payload);

        if (result.success) {
            return res.status(200).json({ status: 'ok', ...result });
        }

        if (result.noRetry) {
            // Fallo permanente: 200 para que NOWPayments deje de reintentar
            return res.status(200).json({ status: 'ignored', error: result.error });
        }

        return res.status(500).json({ status: 'error', error: result.error });

    } catch (error) {
        console.error('❌ Error en webhook membresía:', error);
        return res.status(500).json({ error: 'Error interno' });
    }
}

module.exports = {
    handleWebhookMembresia,
    procesarWebhookMembresia,
    verificarFirma
};
