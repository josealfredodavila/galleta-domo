// ================================================================
// PROCESAR WEBHOOK DE MEMBRESÍA PRO
// ================================================================

async function procesarWebhookMembresia(payload) {
    try {
        const { order_id, payment_id, payment_status, price_amount, pay_address } = payload;

        console.log('📩 Webhook membresía recibido:', { order_id, payment_status });

        if (!order_id) {
            return { success: false, error: 'Falta order_id' };
        }

        // Buscar el pago en la base de datos
        const { data: pago, error: pagoError } = await supabaseAdmin
            .from('pagos_membresia')
            .select('id, usuario_id, estado')
            .eq('order_id', order_id)
            .single();

        if (pagoError || !pago) {
            console.warn(`❌ Pago de membresía no encontrado: ${order_id}`);
            return { success: false, error: 'Pago no encontrado', order_id };
        }

        // IDEMPOTENCIA
        if (pago.estado === 'confirmado' || pago.estado === 'completado') {
            console.log(`ℹ️ Pago ya confirmado, ignorando: ${order_id}`);
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

        // Si el pago está confirmado, activar la membresía
        if (payment_status === 'finished' || payment_status === 'confirmed') {
            console.log(`✅ Pago de membresía confirmado: ${order_id}`);

            // ✅ LLAMADA CORRECTA A LA RPC CON 6 PARÁMETROS
            const result = await supabaseAdmin.rpc('activar_membresia_pro', {
                p_usuario_id: pago.usuario_id,
                p_order_id: order_id,
                p_payment_id: payment_id || `webhook-${Date.now()}`,
                p_monto_mxn: price_amount || 20,
                p_pay_address: pay_address || null,
                p_privacy_version: '1.0'
            });

            if (result.error) {
                console.error(`❌ Error activando membresía:`, result.error);
                return { success: false, error: result.error.message, order_id };
            }

            console.log(`✅ Membresía activada correctamente para: ${pago.usuario_id}`);
            return { success: true, data: result.data, order_id };
        }

        console.log(`⏳ Pago en proceso: ${order_id} - ${payment_status}`);
        return { success: true, message: 'Estado actualizado', order_id };

    } catch (error) {
        console.error(`❌ Error procesando webhook membresía:`, error);
        return { success: false, error: error.message };
    }
}

// ================================================================
// DENTRO DEL ENDPOINT /nowpayments - AGREGAR ESTA SECCIÓN
// ================================================================

// Después de verificar firma y extraer información, agregar:

// ====================================================
// MEMBRESÍA PRO - DETECCIÓN POR order_id
// ====================================================

if (typeof ordenId === 'string' && ordenId.startsWith('PRO-')) {
    const result = await procesarWebhookMembresia({
        order_id: ordenId,
        payment_id: paymentId,
        payment_status: paymentStatus,
        price_amount: priceAmount || payAmount || 20,
        pay_address: payAddress,
        pay_currency: payCurrency
    });

    if (result.success) {
        return res.status(200).json({
            success: true,
            message: result.message || 'Procesado correctamente'
        });
    } else {
        return res.status(500).json({
            success: false,
            error: result.error || 'Error procesando membresía'
        });
    }
}