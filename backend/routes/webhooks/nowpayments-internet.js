// backend/routes/webhooks/nowpayments-internet.js
// IPN de NOWPayments para paquetes de internet (order_id "NET-<uuid>").
// Lo invoca routes/webhooks.js. Idempotente; responde 500 solo cuando conviene que NOWPayments reintente.
const { verificarFirmaNowPayments } = require('../../utils/nowpayments-sig');
const { supabaseAdmin } = require('../../services/telnyx/supabase');
const { procesarOrdenInternet } = require('../../services/telnyx/esim');

const PAGADAS = ['pagada', 'activa', 'activada', 'completado'];
const log = (...a) => console.log('[◈ Internet IPN]', ...a);
const logError = (...a) => console.error('[✶ Internet IPN ERROR]', ...a);

function estadoLocal(np, actual) {
  const s = String(np || '').toLowerCase();
  if (s === 'failed' || s === 'refunded' || s === 'expired' || s === 'canceled' || s === 'cancelled') return 'cancelada';
  if (s === 'confirming' || s === 'sending') return 'confirmando';
  if (s === 'waiting' || s === 'partially_paid') return 'pagando';
  return actual;
}

async function handleWebhookInternet(req, res) {
  try {
    if (!verificarFirmaNowPayments(req.body, req.rawBody, req.headers['x-nowpayments-sig'], process.env.NOWPAYMENTS_IPN_SECRET)) {
      logError('Firma inválida — rechazado');
      return res.status(401).json({ ok: false, error: 'Firma inválida' });
    }

    const { payment_id: paymentId, payment_status: npStatus } = req.body || {};
    if (!paymentId) return res.status(200).json({ ok: true, ignorado: 'sin payment_id' });

    const { data: orden, error } = await supabaseAdmin
      .from('ordenes_internet').select('id, estado, pagado_en').eq('payment_id', String(paymentId)).maybeSingle();
    if (error) { logError('consulta:', error.message); return res.status(500).json({ ok: false }); }
    if (!orden) return res.status(200).json({ ok: true, ignorado: 'orden no registrada' });

    const yaPagada = PAGADAS.includes(orden.estado);
    const esFinal = String(npStatus).toLowerCase() === 'finished'; // mismo criterio que /internet/status

    if (!esFinal) {
      if (!yaPagada) {
        await supabaseAdmin.from('ordenes_internet')
          .update({ nowpayments_status: npStatus || null, estado: estadoLocal(npStatus, orden.estado), updated_at: new Date().toISOString() })
          .eq('id', orden.id);
      }
      return res.status(200).json({ ok: true, estado: npStatus });
    }

    // Pago confirmado
    if (!yaPagada) {
      const { error: e1 } = await supabaseAdmin.from('ordenes_internet')
        .update({ estado: 'pagada', nowpayments_status: 'finished', pagado_en: orden.pagado_en || new Date().toISOString() })
        .eq('id', orden.id);
      if (e1) { logError('marcar pagada:', e1.message); return res.status(500).json({ ok: false }); }
    }

    const { error: e2 } = await supabaseAdmin.rpc('activar_orden_internet', { p_orden_id: orden.id });
    if (e2) { logError('activar_orden_internet:', e2.message); return res.status(500).json({ ok: false }); }

    try {
      await procesarOrdenInternet(orden.id); // crea la eSIM (1ª vez) y acredita los gigas
    } catch (e) {
      logError('aprovisionamiento eSIM:', e.message);
      return res.status(500).json({ ok: false, error: 'Aprovisionamiento pendiente' }); // reintento + ciclo de reconciliación
    }

    log('✔ Orden procesada', orden.id);
    return res.status(200).json({ ok: true, estado: 'activa' });
  } catch (e) {
    logError('excepción:', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
}

module.exports = { handleWebhookInternet };
