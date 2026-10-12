// ================================================================
// NOWPAYMENTS-INTERNET.JS — Csariel's (paquetes de Internet, order "NET-")
// Llamado desde routes/webhooks.js, que ya verificó la firma.
// Estados de ordenes_internet permitidos: pendiente, pagado, activo, cancelado.
// Flujo: pendiente → pagado → (activar_orden_internet) activo → aprovisionar eSIM.
// procesarOrdenInternet debe ser idempotente: se vuelve a llamar en cada IPN final.
// ================================================================

const { supabaseAdmin } = require('../../config/supabase');
const { verificarFirmaNowPayments } = require('../../utils/nowpayments-sig');
const { procesarOrdenInternet } = require('../../services/telnyx/esim');

const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

const log = (...args) => console.log('[Internet IPN]', ...args);
const logError = (...args) => console.error('[Internet IPN ERROR]', ...args);

// Estado de NOWPayments → estado local permitido (o null si no cambia el estado)
function estadoNoFinal(npStatus) {
    const s = String(npStatus || '').toLowerCase();
    if (['failed', 'refunded', 'expired', 'canceled', 'cancelled'].includes(s)) return 'cancelado';
    return null; // waiting, confirming, sending, partially_paid: siguen pendientes
}

async function handleWebhookInternet(req, res) {
    try {
        if (!NOWPAYMENTS_IPN_SECRET) {
            logError('NOWPAYMENTS_IPN_SECRET no configurado');
            return res.status(500).json({ ok: false, error: 'config' });
        }
        const firma = req.headers['x-nowpayments-sig'];
        if (!verificarFirmaNowPayments(req.body, req.rawBody, firma, NOWPAYMENTS_IPN_SECRET)) {
            logError('firma inválida');
            return res.status(401).json({ ok: false, error: 'firma' });
        }

        const payload = req.body || {};
        const paymentId = payload.payment_id != null ? String(payload.payment_id) : '';
        const npStatus = String(payload.payment_status || '').toLowerCase();
        if (!paymentId) return res.status(200).json({ ok: true, ignorado: 'sin_payment_id' });

        const { data: orden, error: errOrden } = await supabaseAdmin
            .from('ordenes_internet')
            .select('id, estado, monto_mxn')
            .eq('payment_id', paymentId)
            .maybeSingle();

        if (errOrden) {
            logError('consulta orden:', errOrden.message);
            return res.status(500).json({ ok: false, error: 'db' });
        }
        if (!orden) return res.status(200).json({ ok: true, ignorado: 'orden_no_registrada' });

        // ---------- No final: solo registrar, sin retroceder órdenes ya pagadas ----------
        if (npStatus !== 'finished') {
            const nuevo = estadoNoFinal(npStatus);
            if (orden.estado === 'pendiente') {
                const { error } = await supabaseAdmin.from('ordenes_internet')
                    .update({
                        nowpayments_status: npStatus,
                        ...(nuevo ? { estado: nuevo } : {}),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', orden.id)
                    .eq('estado', 'pendiente');
                if (error) {
                    logError('registrar estado:', error.message);
                    return res.status(500).json({ ok: false, error: 'db' });
                }
            }
            return res.status(200).json({ ok: true, estado: npStatus });
        }

        // ---------- Final ----------
        if (orden.estado === 'cancelado') {
            logError('pago final para orden cancelada, revisión manual:', orden.id);
            return res.status(200).json({ ok: true, ignorado: 'orden_cancelada' });
        }

        // Validar monto (requiere factura creada en MXN, igual que Live Pass y Pro)
        const precio = Number(payload.price_amount);
        const moneda = String(payload.price_currency || '').toLowerCase();
        if (moneda !== 'mxn' || !Number.isFinite(precio) || Math.abs(precio - Number(orden.monto_mxn)) > 0.01) {
            logError('monto/moneda no coincide:', orden.id, { precio, moneda, esperado: orden.monto_mxn });
            await supabaseAdmin.from('ordenes_internet')
                .update({ estado: 'cancelado', nowpayments_status: npStatus, updated_at: new Date().toISOString() })
                .eq('id', orden.id)
                .eq('estado', 'pendiente');
            return res.status(200).json({ ok: true, ignorado: 'monto_no_coincide' });
        }

        // 1) Marcar pagada (solo si sigue pendiente: evita carreras entre IPN)
        if (orden.estado === 'pendiente') {
            const { error } = await supabaseAdmin.from('ordenes_internet')
                .update({
                    estado: 'pagado',
                    nowpayments_status: 'finished',
                    pagado_en: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', orden.id)
                .eq('estado', 'pendiente');
            if (error) {
                logError('marcar pagado:', error.message);
                return res.status(500).json({ ok: false, error: 'db' });
            }
        }

        // 2) Activar la orden (idempotente en SQL)
        if (orden.estado !== 'activo') {
            const { data: r, error } = await supabaseAdmin.rpc('activar_orden_internet', { p_orden_id: orden.id });
            if (error || !r?.success) {
                logError('activar_orden_internet:', error?.message || r?.error);
                return res.status(500).json({ ok: false, error: 'activacion' });
            }
        }

        // 3) Aprovisionar eSIM y acreditar datos (idempotente; se reintenta en cada IPN final)
        try {
            await procesarOrdenInternet(orden.id);
        } catch (e) {
            logError('aprovisionamiento eSIM:', e.message);
            return res.status(500).json({ ok: false, error: 'aprovisionamiento_pendiente' });
        }

        log('orden procesada', orden.id);
        return res.status(200).json({ ok: true, estado: 'activo' });
    } catch (e) {
        logError('excepción:', e.message);
        return res.status(500).json({ ok: false, error: 'interno' });
    }
}

module.exports = { handleWebhookInternet };