/* ================================================================
   MERCADO - CSARIEL'S ECOSYSTEM
   Webhook dedicado: NOTIFICACIONES IPN DE NOWPAYMENTS
   Ruta: /backend/routes/webhooks/nowpayments.js

   CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR
   1) Firma: usa utils/nowpayments-sig.js (HMAC-SHA512 sobre el JSON
      con llaves ordenadas, con respaldo sobre rawBody).
   2) Bug del paso 7: antes el pago se marcaba 'pagada' ANTES de
      activar la membresía. Si la activación fallaba, el reintento de
      NOWPayments veía 'pagada' y se saltaba todo (usuario pagó y
      nunca recibió el plan). Ahora:
        a) se "reclama" el pago con un UPDATE condicional
           (estado <> 'pagada'), lo que también evita doble proceso
           si llegan dos IPN a la vez;
        b) se activa la membresía;
        c) si la activación falla, se REVIERTE el pago a su estado
           anterior y se responde 500 para que NOWPayments reintente.
   3) Errores reales de base de datos responden 500 (reintentable).
      Solo se responde 200 cuando no hay nada que reintentar
      (pago desconocido, ya procesado, error no reintentable).
   4) 'canceled' y 'expired' ya no caen en 'pendiente'.

   Esquema real confirmado:
   - mercado_membresias_pagos:
       id, tienda_id (FK), usuario_id (FK), plan_slug, plan_nombre,
       monto_mxn, duracion_dias, estado, payment_id, pay_address,
       pay_amount, pay_currency, nowpayments_status,
       activa_desde, activa_hasta, pagado_en, created_at, updated_at
     Estados: pendiente, pagando, confirmando, pagada, cancelada, expirada, fallida
   - Al confirmar → actualiza mercado_tiendas.nivel + activa_hasta + estado
   - notificaciones usa: user_id, tipo, mensaje, fecha, emisor_id, leida, metadata
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { verificarFirmaNowPayments } = require('../../utils/nowpayments-sig');

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
// LOGS CON SÍMBOLOS CSARIEL'S
// ================================================================
function log(...args) {
    console.log('[◈ NOWPayments Webhook]', ...args);
}

function logError(...args) {
    console.error('[✶ NOWPayments Webhook ERROR]', ...args);
}

// ================================================================
// MAPEAR ESTADO DE NOWPAYMENTS A ESTADO INTERNO
// (los 7 estados reales de mercado_membresias_pagos)
// Si el estado de NOWPayments no se reconoce, se conserva el actual.
// ================================================================
function mapearEstado(npStatus, estadoActual) {
    const s = (npStatus || '').toLowerCase();

    if (s === 'finished' || s === 'confirmed') return 'pagada';
    if (s === 'failed' || s === 'refunded') return 'fallida';
    if (s === 'expired') return 'expirada';
    if (s === 'canceled' || s === 'cancelled') return 'cancelada';
    if (s === 'confirming' || s === 'sending' || s === 'partially_paid') return 'confirmando';
    if (s === 'waiting') return 'pendiente';

    return estadoActual || 'pendiente';
}

// ================================================================
// ACTIVAR O EXTENDER MEMBRESÍA
// Actualiza:
// - mercado_tiendas.nivel + activa_hasta + estado
// - mercado_membresias_pagos.activa_desde / activa_hasta
//   (el estado 'pagada' ya lo dejó el "reclamo" del handler)
//
// Devuelve { ok, error, reintentable }
// - reintentable=true  → fallo temporal (DB), conviene que NOWPayments reintente
// - reintentable=false → fallo permanente (plan/tienda inválidos), requiere revisión manual
// ================================================================
async function activarMembresia(tiendaId, pagoId, planSlug, duracionDias) {
    try {
        const planData = PLANES[planSlug];
        if (!planData) {
            logError('Plan inválido:', planSlug);
            return { ok: false, error: 'Plan inválido: ' + planSlug, reintentable: false };
        }

        const ahora = new Date();
        const duracionParseada = parseInt(duracionDias, 10);
        const duracion = Number.isFinite(duracionParseada) && duracionParseada > 0
            ? duracionParseada
            : planData.duracion_dias;

        // 1) Obtener tienda actual
        const { data: tienda, error: errT } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, nivel, activa_hasta, usuario_id')
            .eq('id', tiendaId)
            .maybeSingle();

        if (errT) {
            logError('Error consultando tienda:', errT);
            return { ok: false, error: errT.message, reintentable: true };
        }

        if (!tienda) {
            logError('Tienda no encontrada:', tiendaId);
            return { ok: false, error: 'Tienda no encontrada', reintentable: false };
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
            return { ok: false, error: errUpd.message, reintentable: true };
        }

        // 4) Fechas de activación en el pago (no crítico: la tienda ya está activa)
        const { error: errPago } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .update({
                activa_desde: ahora.toISOString(),
                activa_hasta: nuevaFechaFin.toISOString(),
                updated_at: ahora.toISOString()
            })
            .eq('id', pagoId);

        if (errPago) {
            logError('Error guardando fechas en el pago (tienda ya activada):', errPago);
        }

        log('● Membresía activada:', tiendaId, '→ nivel', planSlug, '→ hasta', nuevaFechaFin.toISOString());

        return {
            ok: true,
            tienda_id: tiendaId,
            usuario_id: tienda.usuario_id,
            nivel: planSlug,
            fecha_fin: nuevaFechaFin.toISOString(),
            extendida: !!tienda.activa_hasta && new Date(tienda.activa_hasta) > ahora
        };

    } catch (e) {
        logError('Excepción activarMembresia:', e);
        return { ok: false, error: e.message, reintentable: true };
    }
}

// ================================================================
// CREAR NOTIFICACIÓN PARA EL USUARIO
// Adaptado a la estructura real de la tabla notificaciones:
// user_id, tipo, mensaje, fecha, emisor_id, leida, metadata
// ================================================================
async function crearNotificacionMembresia(usuarioId, planSlug, fechaFin) {
    try {
        const { error } = await supabaseAdmin
            .from('notificaciones')
            .insert({
                user_id: usuarioId,
                tipo: 'membresia_activada',
                mensaje: '◈ Tu membresía ' + planSlug.toUpperCase() + ' está activa hasta ' + new Date(fechaFin).toLocaleDateString('es-MX'),
                fecha: new Date().toISOString(),
                emisor_id: null,
                leida: false,
                metadata: {
                    tipo_evento: 'membresia_activada',
                    plan: planSlug,
                    fecha_fin: fechaFin,
                    plataforma: 'Csariel\'s Mercado'
                }
            });

        if (error) {
            log('ℹ️ No se pudo insertar notificación:', error.message);
            return { ok: false, error: error.message };
        }

        log('◆ Notificación creada para usuario:', usuarioId);
        return { ok: true };
    } catch (e) {
        log('ℹ️ Excepción insertando notificación:', e.message);
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
        // ============ 1) VERIFICAR FIRMA HMAC-SHA512 ============
        const firmaRecibida = req.headers['x-nowpayments-sig'];

        const firmaValida = verificarFirmaNowPayments(
            req.body,
            req.rawBody,
            firmaRecibida,
            NOWPAYMENTS_IPN_SECRET
        );

        if (!firmaValida) {
            logError('✶ Firma inválida o IPN secret ausente — solicitud rechazada');
            return res.status(401).json({ ok: false, error: 'Firma inválida' });
        }

        log('● Firma verificada');

        // ============ 2) EXTRAER DATOS ============
        const data = req.body;
        const paymentId = data.payment_id;
        const npStatus = data.payment_status;
        const payCurrency = data.pay_currency;
        const actuallyPaid = data.actually_paid;
        const payinHash = data.payin_hash;
        const outcomeHash = data.outcome_hash;

        log('◈ IPN:', {
            payment_id: paymentId,
            status: npStatus,
            pay_currency: payCurrency,
            actually_paid: actuallyPaid,
            payin_hash: payinHash ? String(payinHash).substring(0, 16) + '...' : null,
            outcome_hash: outcomeHash ? String(outcomeHash).substring(0, 16) + '...' : null
        });

        // ============ 3) VALIDAR ============
        if (!paymentId) {
            logError('✶ Sin payment_id — ignorando');
            return res.status(200).json({ ok: true, ignorado: 'sin payment_id' });
        }

        // ============ 4) BUSCAR PAGO EN DB ============
        const { data: pago, error: errBuscar } = await supabaseAdmin
            .from('mercado_membresias_pagos')
   