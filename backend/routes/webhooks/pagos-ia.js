/* ================================================================
   routes/webhooks/pagos-ia.js - IPN de NOWPayments para planes IA (v0.3)
   ================================================================
   FASE 1: solo NOWPayments.

   - Acepta DOS métodos de firma:
     A) HMAC-SHA512 sobre JSON con claves ordenadas.
     B) utils/nowpayments-sig.js (raw body).
     Registra en log cuál coincidió. Si ninguno coincide, responde 401.
   - Solo procesa payment_status finished / confirmed.
   - order_id debe ser UUID de un pedido de IA; cualquier otra cosa se ignora (200).
   - Idempotente por payment_id (ai_webhook_eventos) y por referencia_pago (activar_plan_pago).
   - Errores temporales → 500 (NOWPayments reintenta). Rechazos → 200 (no reintenta).

   NO TOCA: /api/webhook/ (membresías), /api/pay/webhooks/ (Pay),
   livepass-webhook-handler.js, membresia-webhook-handler.js,
   utils/nowpayments-sig.js.
================================================================ */

'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const supabase = require('../../lib/supabase-admin');
const { verificarFirmaNowPayments } = require('../../utils/nowpayments-sig.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_PAGADOS = ['finished', 'confirmed'];

/* ================================================================
   UTILIDADES
================================================================ */

function log(evento, datos = {}) {
    console.log(JSON.stringify({
        t: new Date().toISOString(),
        mod: 'pagos-ia',
        evento,
        ...datos
    }));
}

function ordenarClaves(valor) {
    if (Array.isArray(valor)) return valor.map(ordenarClaves);
    if (valor && typeof valor === 'object') {
        return Object.keys(valor).sort().reduce((acc, k) => {
            acc[k] = ordenarClaves(valor[k]);
            return acc;
        }, {});
    }
    return valor;
}

// Firma HMAC-SHA512 sobre el JSON con claves ordenadas, comparación en tiempo constante.
function verificarFirmaIA(payload, firma, secreto) {
    if (!firma || !secreto || !payload || typeof payload !== 'object') return false;

    const esperada = crypto
        .createHmac('sha512', secreto)
        .update(JSON.stringify(ordenarClaves(payload)))
        .digest('hex');

    const a = Buffer.from(String(firma).toLowerCase(), 'utf8');
    const b = Buffer.from(esperada, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Acepta cualquiera de los dos métodos. Ambos requieren el secreto.
// Devuelve el método que coincidió, para dejarlo en el log.
function verificarFirmaTodos(req, firma, secreto) {
    if (!firma || !secreto) return { ok: false, metodo: null };

    if (verificarFirmaIA(req.body, firma, secreto)) {
        return { ok: true, metodo: 'claves_ordenadas' };
    }

    if (req.rawBody && verificarFirmaNowPayments(req.body, req.rawBody, firma, secreto)) {
        return { ok: true, metodo: 'raw_body' };
    }

    return { ok: false, metodo: null };
}

// Respuesta de "recibido pero no aplica": 200 para que NOWPayments no reintente.
function ignorado(res, motivo, extra = {}) {
    return res.status(200).json({ success: true, ignored: motivo, ...extra });
}

async function registrarEvento({ event_id, tipo, estado, motivo }) {
    try {
        const { error } = await supabase
            .from('ai_webhook_eventos')
            .upsert(
                {
                    event_id,
                    proveedor: 'nowpayments',
                    tipo,
                    estado,
                    motivo,
                    created_at: new Date().toISOString()
                },
                { onConflict: 'event_id' }
            );
        if (error) log('registrar_evento_error', { codigo: error.code });
    } catch (e) {
        log('registrar_evento_excepcion', { mensaje: e.message });
    }
}

/* ================================================================
   POST /nowpayments
================================================================ */

router.post('/nowpayments', express.json(), async (req, res) => {
    const inicio = Date.now();

    try {
        // 1. Configuración y firma
        const secreto = process.env.NOWPAYMENTS_IPN_SECRET;
        if (!secreto) {
            log('config_incompleta');
            return res.status(500).json({ error: 'configuracion' });
        }

        const firma = req.headers['x-nowpayments-sig'];
        const resultadoFirma = verificarFirmaTodos(req, firma, secreto);

        if (!resultadoFirma.ok) {
            log('firma_invalida');
            return res.status(401).json({ error: 'firma_invalida' });
        }

        log('firma_ok', { metodo: resultadoFirma.metodo });

        const pago = req.body || {};

        // 2. Identificadores y estado
        if (!pago.payment_id) {
            log('payment_id_ausente');
            return ignorado(res, 'sin_payment_id');
        }
        const eventId = String(pago.payment_id);

        if (!ESTADOS_PAGADOS.includes(pago.payment_status)) {
            return ignorado(res, 'estado_no_final', { estado: pago.payment_status });
        }

        // 3. order_id debe ser UUID de un pedido de IA.
        const orderId = String(pago.order_id || '');
        if (!UUID_RE.test(orderId)) {
            return ignorado(res, 'no_es_ia');
        }

        // 4. Idempotencia por evento
        const { data: eventoExistente, error: errEvento } = await supabase
            .from('ai_webhook_eventos')
            .select('estado')
            .eq('event_id', eventId)
            .maybeSingle();

        if (errEvento) {
            log('evento_db_error', { codigo: errEvento.code });
            return res.status(500).json({ error: 'db' });
        }

        if (eventoExistente && eventoExistente.estado === 'procesado') {
            log('duplicado', { event_id: eventId });
            return res.status(200).json({ success: true, duplicado: true });
        }

        // 5. Buscar pedido de IA
        const { data: pedido, error: errPedido } = await supabase
            .from('ai_pedidos_pago')
            .select('id, usuario_id, plan, monto_mxn, estado')
            .eq('id', orderId)
            .eq('proveedor', 'nowpayments')
            .maybeSingle();

        if (errPedido) {
            log('pedido_db_error', { codigo: errPedido.code });
            return res.status(500).json({ error: 'db' });
        }

        if (!pedido) {
            log('pedido_no_encontrado');
            return ignorado(res, 'no_es_ia');
        }

        // 6. Pago doble
        if (pedido.estado === 'pagado') {
            log('pedido_ya_pagado', { pedido_id: pedido.id });
            await registrarEvento({
                event_id: eventId,
                tipo: 'payment',
                estado: 'ignorado',
                motivo: 'pedido_ya_pagado'
            });
            return ignorado(res, 'pedido_ya_pagado');
        }

        // 7. Monto y moneda
        const montoOk = Number(pago.price_amount) === Number(pedido.monto_mxn);
        const monedaOk = String(pago.price_currency || '').toLowerCase() === 'mxn';

        if (!montoOk || !monedaOk) {
            log('monto_no_coincide', {
                pedido_id: pedido.id,
                esperado: Number(pedido.monto_mxn),
                recibido: pago.price_amount,
                moneda: pago.price_currency
            });
            await registrarEvento({
                event_id: eventId,
                tipo: 'payment',
                estado: 'rechazado',
                motivo: 'monto_no_coincide'
            });
            return ignorado(res, 'monto_no_coincide');
        }

        // 8. Activar plan
        const { error: errActivar } = await supabase.rpc('activar_plan_pago', {
            p_usuario: pedido.usuario_id,
            p_plan: pedido.plan,
            p_referencia: `nowpayments:${eventId}`
        });

        if (errActivar) {
            const permanente = errActivar.code === '23503';

            log('activar_error', {
                pedido_id: pedido.id,
                codigo: errActivar.code,
                permanente
            });

            await registrarEvento({
                event_id: eventId,
                tipo: 'payment',
                estado: permanente ? 'rechazado' : 'error',
                motivo: errActivar.code || 'rpc'
            });

            return permanente
                ? ignorado(res, 'usuario_invalido')
                : res.status(500).json({ error: 'temporal' });
        }

        // 9. Marcar pedido como pagado
        const { error: errUpdate } = await supabase
            .from('ai_pedidos_pago')
            .update({ estado: 'pagado', pagado_at: new Date().toISOString() })
            .eq('id', pedido.id);

        if (errUpdate) {
            log('update_pedido_error', { pedido_id: pedido.id, codigo: errUpdate.code });
        }

        // 10. Registrar evento procesado
        await registrarEvento({
            event_id: eventId,
            tipo: 'payment',
            estado: 'procesado',
            motivo: null
        });

        log('webhook_ok', { pedido_id: pedido.id, plan: pedido.plan, ms: Date.now() - inicio });

        return res.status(200).json({ success: true });

    } catch (e) {
        log('webhook_exception', { mensaje: e.message, ms: Date.now() - inicio });
        return res.status(500).json({ error: 'interno' });
    }
});

module.exports = router;