// ================================================================
// MEMBRESIA-WEBHOOK-HANDLER.JS - SARIEL'S ECOSYSTEM
// ================================================================

const crypto = require('crypto');
const { supabaseAdmin } = require('../config/supabase.js');

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

// ===== VERIFICAR FIRMA =====
function verificarFirma(payload, signature) {
    if (!NOWPAYMENTS_IPN_SECRET || !signature) {
        console.warn('⚠️ IPN_SECRET no configurado o firma faltante');
        return false;
    }

    try {
        const expectedSignature = crypto
            .createHmac('sha256', NOWPAYMENTS_IPN_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch (error) {
        console.error('❌ Error verificando firma:', error);
        return false;
    }
}

// ===== PROCESAR WEBHOOK =====
async function procesarWebhookMembresia(payload) {
    try {
        const { order_id, payment_id, payment_status, price_amount, pay_address } = payload;

        console.log('📩 Webhook membresía:', { order_id, payment_status });

        // Buscar el pago
        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .select('id, usuario_id, estado')
            .eq('order_id', order_id)
            .single();

        if (pagoError || !pago) {
            console.error('❌ Pago no encontrado:', order_id);
            return { success: false, error: 'Pago no encontrado' };
        }

        // IDEMPOTENCIA: si ya está confirmado, ignorar
        if (pago.estado === 'confirmado') {
            console.log('ℹ️ Pago ya confirmado, ignorando:', order_id);
            return { success: true, message: 'Ya confirmado' };
        }

        // Actualizar estado del pago
        await supabaseAdmin
            .from('pagos_membresia')
            .update({
                estado: payment_status || pago.estado,
                datos_webhook: payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', pago.id);

        // Solo activar si el pago está confirmado
        if (payment_status === 'finished' || payment_status === 'confirmed') {
            const result = await supabaseAdmin.rpc('activar_membresia_pro', {
                p_usuario_id: pago.usuario_id,
                p_order_id: order_id,
                p_payment_id: payment_id || `webhook-${Date.now()}`,
                p_monto_mxn: price_amount || 20,
                p_pay_address: pay_address || null,
                p_privacy_version: '1.0'
            });

            if (result.error) {
                console.error('❌ Error activando membresía:', result.error);
                return { success: false, error: result.error.message };
            }

            console.log('✅ Membresía activada para:', pago.usuario_id);
            return { success: true, data: result.data };
        }

        return { success: true, message: 'Estado actualizado' };

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

        const esValida = verificarFirma(payload, signature);
        if (!esValida) {
            console.error('❌ Firma inválida en webhook');
            return res.status(401).json({ error: 'Firma inválida' });
        }

        // Procesar
        const result = await procesarWebhookMembresia(payload);

        if (result.success) {
            res.status(200).json({ status: 'ok', ...result });
        } else {
            res.status(500).json({ status: 'error', error: result.error });
        }

    } catch (error) {
        console.error('❌ Error en webhook membresía:', error);
        res.status(500).json({ error: 'Error interno' });
    }
}

module.exports = {
    handleWebhookMembresia,
    procesarWebhookMembresia,
    verificarFirma
};