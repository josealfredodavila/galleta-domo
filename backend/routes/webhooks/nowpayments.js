/* ================================================================
   MERCADO - SARIEL'S ECOSYSTEM
   Webhook dedicado: NOTIFICACIONES IPN DE NOWPAYMENTS
   Ruta: /backend/routes/webhooks/nowpayments.js
   
   Este archivo se encarga EXCLUSIVAMENTE de recibir y procesar
   las notificaciones IPN que NOWPayments envía cuando un pago
   cambia de estado. Cuando se confirma, activa la membresía.
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

// Planes válidos (duplicados aquí para evitar dependencia circular)
const PLANES = {
    basico: { id: 'basico', nombre: 'Básico', precio_mxn: 99,  duracion_dias: 30 },
    pro:    { id: 'pro',    nombre: 'Pro',    precio_mxn: 299, duracion_dias: 30 },
    max:    { id: 'max',    nombre: 'Max',    precio_mxn: 599, duracion_dias: 30 }
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
        logError('Falta NOWPAYMENTS_IPN_SECRET en env — NO se puede verificar firma');
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
// ================================================================
function mapearEstado(npStatus) {
    const s = (npStatus || '').toLowerCase();
    if (s === 'finished' || s === 'confirmed') return 'confirmado';
    if (s === 'failed' || s === 'refunded' || s === 'expired') return 'fallido';
    if (s === 'confirming' || s === 'sending' || s === 'partially_paid') return 'procesando';
    if (s === 'waiting') return 'esperando';
    return 'esperando';
}

// ================================================================
// ACTIVAR O EXTENDER MEMBRESÍA
// ================================================================
async function activarMembresia(usuarioId, plan, pagoId) {
    try {
        const planData = PLANES[plan];
        if (!planData) {
            logError('Plan inválido:', plan);
            return { ok: false, error: 'Plan inválido' };
        }

        const ahora = new Date();

        // Buscar membresía activa existente
        const { data: existente, error: errBuscar } = await supabaseAdmin
            .from('mercado_membresias')
            .select('id, fecha_inicio, fecha_fin, plan')
            .eq('usuario_id', usuarioId)
            .eq('estado', 'activa')
            .gte('fecha_fin', ahora.toISOString())
            .order('fecha_fin', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (errBuscar && errBuscar.code !== 'PGRST116') {
            logError('Error buscando membresía:', errBuscar);
            return { ok: false, error: errBuscar.message };
        }

        // Caso 1: Extender membresía existente
        if (existente && existente.fecha_fin) {
            const fechaFinAnterior = new Date(existente.fecha_fin);
            const base = fechaFinAnterior > ahora ? fechaFinAnterior : ahora;
            const nuevaFechaFin = new Date(base);
            nuevaFechaFin.setDate(nuevaFechaFin.getDate() + planData.duracion_dias);

            const { error: errUpd } = await supabaseAdmin
                .from('mercado_membresias')
                .update({
                    plan: plan,
                    fecha_fin: nuevaFechaFin.toISOString(),
                    estado: 'activa',
                    pago_id_ultimo: pagoId,
                    updated_at: ahora.toISOString()
                })
                .eq('id', existente.id);

            if (errUpd) {
                logError('Error extendiendo membresía:', errUpd);
                return { ok: false, error: errUpd.message };
            }

            log('✅ Membresía extendida:', existente.id, '→ hasta', nuevaFechaFin.toISOString());
            return {
                ok: true,
                membresia_id: existente.id,
                extendida: true,
                fecha_fin: nuevaFechaFin.toISOString()
            };
        }

        // Caso 2: Crear membresía nueva
        const fechaFin = new Date(ahora);
        fechaFin.setDate(fechaFin.getDate() + planData.duracion_dias);

        const { data: nueva, error: errIns } = await supabaseAdmin
            .from('mercado_membresias')
            .insert({
                usuario_id: usuarioId,
                plan: plan,
                estado: 'activa',
                fecha_inicio: ahora.toISOString(),
                fecha_fin: fechaFin.toISOString(),
                pago_id_ultimo: pagoId,
                created_at: ahora.toISOString(),
                updated_at: ahora.toISOString()
            })
            .select()
            .single();

        if (errIns) {
            logError('Error creando membresía:', errIns);
            return { ok: false, error: errIns.message };
        }

        log('✅ Membresía nueva activada:', nueva.id, '→ hasta', fechaFin.toISOString());
        return {
            ok: true,
            membresia_id: nueva.id,
            nueva: true,
            fecha_fin: fechaFin.toISOString()
        };

    } catch (e) {
        logError('Excepción en activarMembresia:', e);
        return { ok: false, error: e.message };
    }
}

// ================================================================
// POST /api/mercado/webhook-nowpayments
// Recibe notificaciones IPN de NOWPayments
// ================================================================
router.post('/', async (req, res) => {
    const inicio = Date.now();
    let bodyString = '';

    try {
        // ============ 1) VERIFICAR FIRMA ============
        // Necesitamos el body SIN parsear. Si el server ya hizo express.json(),
        // reconstruimos el string con JSON.stringify (funciona si los campos van en mismo orden).
        // Lo ideal: configurar express.raw() para esta ruta específica.
        bodyString = JSON.stringify(req.body);

        const firmaRecibida = req.headers['x-nowpayments-sig'];
        const firmaValida = verificarFirma(bodyString, firmaRecibida);

        if (!firmaValida) {
            logError('❌ Firma inválida — solicitud rechazada');
            return res.status(401).json({ ok: false, error: 'Firma inválida' });
        }

        log('✅ Firma verificada');

        // ============ 2) EXTRAER DATOS ============
        const data = req.body;
        const orderId = data.order_id;
        const paymentId = data.payment_id;
        const npStatus = data.payment_status;
        const payinHash = data.payin_hash;
        const outcomeHash = data.outcome_hash;
        const priceAmount = data.price_amount;
        const actuallyPaid = data.actually_paid;
        const payCurrency = data.pay_currency;

        log('📥 IPN:', {
            order_id: orderId,
            payment_id: paymentId,
            status: npStatus,
            pay_currency: payCurrency,
            actually_paid: actuallyPaid
        });

        // ============ 3) VALIDAR ============
        if (!orderId) {
            logError('⚠️ Sin order_id — ignorando');
            return res.status(200).json({ ok: true, ignorado: 'sin order_id' });
        }

        // ============ 4) BUSCAR PAGO EN DB ============
        const { data: pago, error: errBuscar } = await supabaseAdmin
            .from('mercado_pagos')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (errBuscar || !pago) {
            logError('⚠️ Pago no encontrado en DB:', orderId);
            // Devolvemos 200 para que NOWPayments no reintente infinitamente
            return res.status(200).json({ ok: true, ignorado: 'pago no encontrado' });
        }

        // ============ 5) EVITAR REPROCESAR ============
        if (pago.estado === 'confirmado') {
            log('ℹ️ Pago ya confirmado previamente — ignorando');
            return res.status(200).json({ ok: true, ya_confirmado: true });
        }

        // ============ 6) MAPEAR ESTADO ============
        const estadoFinal = mapearEstado(npStatus);

        // ============ 7) ACTUALIZAR PAGO EN DB ============
        const updates = {
            estado: estadoFinal,
            np_status: npStatus,
            updated_at: new Date().toISOString()
        };

        if (payinHash) updates.tx_hash = payinHash;
        else if (outcomeHash) updates.tx_hash = outcomeHash;

        if (actuallyPaid) updates.monto_recibido_cripto = String(actuallyPaid);

        const { error: errUpd } = await supabaseAdmin
            .from('mercado_pagos')
            .update(updates)
            .eq('id', orderId);

        if (errUpd) {
            logError('Error actualizando pago:', errUpd);
            // Seguimos adelante — la membresía es más importante
        }

        log('💾 Pago actualizado:', orderId, '→', estadoFinal);

        // ============ 8) ACTIVAR MEMBRESÍA SI CONFIRMADO ============
        if (estadoFinal === 'confirmado') {
            const resultado = await activarMembresia(pago.usuario_id, pago.plan, pago.id);

            if (!resultado.ok) {
                logError('❌ Error activando membresía:', resultado.error);
                // Devolvemos 200 igual para que NOWPayments no reintente
                return res.status(200).json({
                    ok: true,
                    procesado: true,
                    membresia_error: resultado.error
                });
            }

            log('🎉 Membresía activada exitosamente para usuario:', pago.usuario_id);

            // Notificación opcional: insertar en algún log/notificaciones
            try {
                await supabaseAdmin
                    .from('notificaciones')
                    .insert({
                        usuario_id: pago.usuario_id,
                        tipo: 'membresia_activada',
                        titulo: '🎉 Membresía activada',
                        mensaje: 'Tu membresía del Mercado ' + pago.plan + ' está activa.',
                        created_at: new Date().toISOString()
                    });
            } catch (e) {
                // Silencioso: si no existe la tabla de notificaciones, no pasa nada
                log('ℹ️ No se pudo insertar notificación (tabla opcional)');
            }

            return res.status(200).json({
                ok: true,
                procesado: true,
                membresia_id: resultado.membresia_id,
                extendida: resultado.extendida || false,
                fecha_fin: resultado.fecha_fin
            });
        }

        // Estados no confirmados: solo actualizamos y respondemos OK
        log('ℹ️ Pago en estado:', estadoFinal, '— sin activar membresía aún');
        return res.status(200).json({
            ok: true,
            procesado: true,
            estado: estadoFinal
        });

    } catch (e) {
        logError('❌ Excepción procesando webhook:', e);
        // Devolvemos 200 para evitar reintentos masivos
        return res.status(200).json({
            ok: true,
            error: e.message,
            duracion_ms: Date.now() - inicio
        });
    }
});

// ================================================================
// GET /api/mercado/webhook-nowpayments/test
// Endpoint para probar que el webhook está montado
// ================================================================
router.get('/test', (req, res) => {
    res.json({
        ok: true,
        servicio: 'Webhook NOWPayments',
        configurado: !!NOWPAYMENTS_IPN_SECRET,
        url_esperada_ipn: process.env.PUBLIC_URL
            ? `${process.env.PUBLIC_URL}/api/mercado/webhook-nowpayments`
            : '(configura PUBLIC_URL en env)',
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// EXPORT
// ================================================================
module.exports = router;