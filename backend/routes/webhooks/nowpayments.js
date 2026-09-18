/* ================================================================
   MERCADO - SARIEL'S ECOSYSTEM
   Webhook dedicado: NOTIFICACIONES IPN DE NOWPAYMENTS
   Ruta: /backend/routes/webhooks/nowpayments.js
   
   Este archivo maneja EXCLUSIVAMENTE las notificaciones IPN
   que NOWPayments envía cuando un pago cambia de estado.
   
   Esquema real:
   - mercado_membresias_pagos (bigint id, tienda_id NOT NULL, plan_slug,
     plan_nombre, monto_mxn, duracion_dias, estado, payment_id,
     pay_address, pay_amount, pay_currency, nowpayments_status,
     activa_desde, activa_hasta, pagado_en)
   - Estados: pendiente, pagando, confirmando, pagada, cancelada, expirada, fallida
   - Al confirmar → actualiza mercado_tiendas.nivel + activa_hasta
   ================================================================ */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ================================================================
// SUPABASE ADMIN
// ================================================================
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================================================================
// CONFIG
// ================================================================
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

// Planes válidos (duplicados aquí para evitar dependencia circular con mercado.js)
const PLANES = {
    basico: { slug: 'basico', nombre: 'Básico', precio_mxn: 99,  duracion_dias: 30 },
    pro:    { slug: 'pro',    nombre: 'Pro',    precio_mxn: 299, duracion_dias: 30 },
    max:    { slug: 'max',    nombre: 'Max',    precio_mxn: 599, duracion_dias: 30 }
};

// ================================================================
// LOGS
// ================================================================
function log(...args) {
    console.log('[NOWPayments Webhook]', ...args);
}

function logError(...args) {
    console.error('[NOWPayments Webhook ERROR]', ...args);
}

// ================================================================
// VERIFICAR FIRMA HMAC
// ================================================================
function verificarFirma(bodyString, firmaRecibida) {
    if (!NOWPAYMENTS_IPN_SECRET) {
        logError('Falta NOWPAYMENTS_IPN_SECRET en env — no se puede verificar firma');
        return false;
    }
    if (!firmaRecibida) {
        logError('No se recibió firma en headers');
        return false;
    }

    const firmaCalculada = crypto
        .createHmac('sha512', NOWPAYMENTS_IPN_SECRET)
        .update(bodyString)
        .digest('hex');

    // Comparación segura contra timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(firmaCalculada, 'hex'),
            Buffer.from(firmaRecibida, 'hex')
        );
    } catch (e) {
        // Si los buffers no son del mismo tamaño, devuelve false
        return false;
    }
}

// ================================================================
// MAPEAR ESTADO DE NOWPAYMENTS A ESTADO INTERNO
// (los 7 estados reales de mercado_membresias_pagos)
// ================================================================
function mapearEstado(npStatus) {
    const s = (npStatus || '').toLowerCase();
    if (s === 'finished' || s === 'confirmed') return 'pagada';
    if (s === 'failed' || s === 'refunded' || s === 'expired') return 'fallida';
    if (s === 'confirming' || s === 'sending' || s === 'partially_paid') return 'confirmando';
    if (s === 'waiting') return 'pendiente';
    return 'pendiente';
}

// ================================================================
// ACTIVAR O EXTENDER MEMBRESÍA
// Actualiza:
// - mercado_membresias_pagos.estado = 'pagada' + fechas
// - mercado_tiendas.nivel + activa_hasta + estado
// ================================================================
async function activarMembresia(tiendaId, pagoId, planSlug, duracionDias) {
    try {
        const planData = PLANES[planSlug];
        if (!planData) {
            logError('Plan inválido:', planSlug);
            return { ok: false, error: 'Plan inválido: ' + planSlug };
        }

        const ahora = new Date();
        const duracion = parseInt(duracionDias || planData.duracion_dias);

        // 1) Obtener tienda actual
        const { data: tienda, error: errT } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, nivel, activa_hasta')
            .eq('id', tiendaId)
            .maybeSingle();

        if (errT || !tienda) {
            logError('Tienda no encontrada:', tiendaId);
            return { ok: false, error: 'Tienda no encontrada' };
        }

        // 2) Calcular nueva fecha de vencimiento
        // Si ya hay una fecha futura, se extiende desde ahí
        let fechaBase = ahora;
        if (tienda.activa_hasta) {
            const fechaAnterior = new Date(tienda.activa_hasta);
            if (fechaAnterior > ahora) {
                fechaBase = fechaAnterior;
            }
        }

        const nuevaFechaFin = new Date(fechaBase);
        nuevaFechaFin.setDate(nuevaFechaFin.getDate() + duracion);

        // 3) Actualizar tienda
        const { error: errUpd } = await supabaseAdmin
            .from('mercado_tiendas')
            .update({
                nivel: planSlug,
                activa_hasta: nuevaFechaFin.toISOString(),
                estado: 'activa',
                updated_at: ahora.toISOString()
            })
            .eq('id', tiendaId);

        if (errUpd) {
            logError('Error actualizando tienda:', errUpd);
            return { ok: false, error: errUpd.message };
        }

        // 4) Actualizar el pago con las fechas de activación
        const { error: errPago } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .update({
                estado: 'pagada',
                activa_desde: ahora.toISOString(),
                activa_hasta: nuevaFechaFin.toISOString(),
                pagado_en: ahora.toISOString(),
                updated_at: ahora.toISOString()
            })
            .eq('id', pagoId);

        if (errPago) {
            logError('Error actualizando pago:', errPago);
            // No fallamos porque la tienda ya está activada
        }

        log('✅ Membresía activada:', tiendaId, '→ nivel', planSlug, '→ hasta', nuevaFechaFin.toISOString());

        return {
            ok: true,
            tienda_id: tiendaId,
            nivel: planSlug,
            fecha_fin: nuevaFechaFin.toISOString(),
            extendida: !!tienda.activa_hasta && new Date(tienda.activa_hasta) > ahora
        };

    } catch (e) {
        logError('Excepción activarMembresia:', e);
        return { ok: false, error: e.message };
    }
}

// ================================================================
// POST /
// Recibe notificaciones IPN de NOWPayments
// (NO autentica con JWT, usa firma HMAC)
// ================================================================
router.post('/', async (req, res) => {
    const inicio = Date.now();

    try {
        // ============ 1) VERIFICAR FIRMA HMAC ============
        const firmaRecibida = req.headers['x-nowpayments-sig'];
        const bodyString = req.rawBody || JSON.stringify(req.body);

        const firmaValida = verificarFirma(bodyString, firmaRecibida);

        if (!firmaValida) {
            logError('❌ Firma inválida — solicitud rechazada');
            return res.status(401).json({ ok: false, error: 'Firma inválida' });
        }

        log('✅ Firma verificada');

        // ============ 2) EXTRAER DATOS ============
        const data = req.body;
        const paymentId = data.payment_id;
        const npStatus = data.payment_status;
        const payinHash = data.payin_hash;
        const outcomeHash = data.outcome_hash;
        const actuallyPaid = data.actually_paid;
        const payCurrency = data.pay_currency;

        log('📥 IPN:', {
            payment_id: paymentId,
            status: npStatus,
            pay_currency: payCurrency,
            actually_paid: actuallyPaid
        });

        // ============ 3) VALIDAR ============
        if (!paymentId) {
            logError('⚠️ Sin payment_id — ignorando');
            return res.status(200).json({ ok: true, ignorado: 'sin payment_id' });
        }

        // ============ 4) BUSCAR PAGO EN DB ============
        const { data: pago, error: errBuscar } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('*')
            .eq('payment_id', String(paymentId))
            .maybeSingle();

        if (errBuscar || !pago) {
            logError('⚠️ Pago no encontrado en DB:', paymentId);
            // Devolvemos 200 para que NOWPayments no reintente infinitamente
            return res.status(200).json({ ok: true, ignorado: 'pago no encontrado' });
        }

        // ============ 5) EVITAR REPROCESAR ============
        if (pago.estado === 'pagada') {
            log('ℹ️ Pago ya procesado previamente — ignorando');
            return res.status(200).json({ ok: true, ya_pagado: true });
        }

        // ============ 6) MAPEAR ESTADO ============
        const estadoFinal = mapearEstado(npStatus);

        // ============ 7) ACTUALIZAR PAGO EN DB ============
        const updates = {
            estado: estadoFinal,
            nowpayments_status: npStatus,
            updated_at: new Date().toISOString()
        };

        if (estadoFinal === 'pagada') {
            updates.pagado_en = new Date().toISOString();
        }

        const { error: errUpd } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .update(updates)
            .eq('id', pago.id);

        if (errUpd) {
            logError('Error actualizando pago:', errUpd);
        }

        log('💾 Pago actualizado:', pago.id, '→', estadoFinal);

        // ============ 8) ACTIVAR MEMBRESÍA SI PAGADA ============
        if (estadoFinal === 'pagada') {
            const resultado = await activarMembresia(
                pago.tienda_id,
                pago.id,
                pago.plan_slug,
                pago.duracion_dias
            );

            if (!resultado.ok) {
                logError('❌ Error activando membresía:', resultado.error);
                return res.status(200).json({
                    ok: true,
                    procesado: true,
                    membresia_error: resultado.error
                });
            }

            log('🎉 Membresía activada para tienda:', pago.tienda_id);

            // Notificación opcional (silenciosa si la tabla no existe)
            try {
                await supabaseAdmin
                    .from('notificaciones')
                    .insert({
                        usuario_id: pago.usuario_id,
                        tipo: 'membresia_activada',
                        titulo: '🎉 Membresía activada',
                        mensaje: 'Tu membresía ' + pago.plan_slug + ' está activa hasta ' + resultado.fecha_fin,
                        created_at: new Date().toISOString()
                    });
            } catch (eN) {
                log('ℹ️ No se pudo insertar notificación (tabla opcional)');
            }

            return res.status(200).json({
                ok: true,
                procesado: true,
                estado: 'pagada',
                tienda_id: pago.tienda_id,
                fecha_fin: resultado.fecha_fin,
                extendida: resultado.extendida || false,
                duracion_ms: Date.now() - inicio
            });
        }

        // Estados no confirmados: solo actualizamos y respondemos OK
        log('ℹ️ Pago en estado:', estadoFinal);
        return res.status(200).json({
            ok: true,
            procesado: true,
            estado: estadoFinal,
            duracion_ms: Date.now() - inicio
        });

    } catch (e) {
        logError('❌ Excepción procesando webhook:', e);
        // Siempre 200 para evitar reintentos masivos
        return res.status(200).json({
            ok: true,
            error: e.message,
            duracion_ms: Date.now() - inicio
        });
    }
});

// ================================================================
// GET /test
// Endpoint de prueba para verificar que el webhook está montado
// ================================================================
router.get('/test', (req, res) => {
    res.json({
        ok: true,
        servicio: 'Webhook NOWPayments',
        configurado: !!NOWPAYMENTS_IPN_SECRET,
        ipn_secret_presente: !!NOWPAYMENTS_IPN_SECRET,
        url_esperada_ipn: process.env.PUBLIC_URL
            ? `${process.env.PUBLIC_URL}/api/mercado/webhook-nowpayments`
            : '(configura PUBLIC_URL en env)',
        planes: Object.keys(PLANES),
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// EXPORT
// ================================================================
module.exports = router;