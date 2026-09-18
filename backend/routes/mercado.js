/* ================================================================
   MERCADO - SARIEL'S ECOSYSTEM
   Rutas backend: membresías + pagos NOWPayments
   Ruta: /backend/routes/mercado.js
   
   Esquema real:
   - mercado_membresias_pagos (bigint id, tienda_id NOT NULL, plan_slug,
     plan_nombre, monto_mxn, duracion_dias, estado, payment_id,
     pay_address, pay_amount, pay_currency, nowpayments_status,
     activa_desde, activa_hasta, pagado_en)
   - Estados: pendiente, pagando, confirmando, pagada, cancelada, expirada, fallida
   - Al confirmar → actualiza mercado_tiendas.nivel + activa_hasta
   
   Este archivo YA INCLUYE el webhook de NOWPayments (ruta
   /api/mercado/webhook-nowpayments). NO montar el archivo separado
   routes/webhooks/nowpayments.js.
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ================================================================
// SUPABASE ADMIN
// ================================================================
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================================================================
// CONFIG NOWPAYMENTS
// ================================================================
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;

const TIPO_CAMBIO_MXN_USD = 17.5;

// ================================================================
// PLANES VÁLIDOS (deben coincidir con el frontend)
// ================================================================
const PLANES = {
    basico: { slug: 'basico', nombre: 'Básico', precio_mxn: 99,  duracion_dias: 30 },
    pro:    { slug: 'pro',    nombre: 'Pro',    precio_mxn: 299, duracion_dias: 30 },
    max:    { slug: 'max',    nombre: 'Max',    precio_mxn: 599, duracion_dias: 30 }
};

// Criptos soportadas
const CRIPTOS_SOPORTADAS = [
    'usdttrc20', 'usdterc20', 'usdc', 'usdcmatic', 'btc', 'eth',
    'bnbbsc', 'maticmainnet', 'trx', 'ltc', 'doge', 'xrp'
];

// ================================================================
// MIDDLEWARE: autenticar con JWT de Supabase
// ================================================================
async function autenticarUsuario(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '').trim();

        if (!token) {
            return res.status(401).json({ error: 'Falta token de autenticación' });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data || !data.user) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        req.usuario = data.user;
        next();
    } catch (e) {
        console.error('Error autenticando:', e);
        return res.status(401).json({ error: 'Error de autenticación' });
    }
}

// ================================================================
// HELPERS
// ================================================================
function mxnAUsd(mxn) {
    return parseFloat((parseFloat(mxn) / TIPO_CAMBIO_MXN_USD).toFixed(2));
}

function mapearEstadoNOWPayments(npStatus) {
    const s = (npStatus || '').toLowerCase();
    if (s === 'finished' || s === 'confirmed') return 'pagada';
    if (s === 'failed' || s === 'refunded' || s === 'expired') return 'fallida';
    if (s === 'confirming' || s === 'sending' || s === 'partially_paid') return 'confirmando';
    if (s === 'waiting') return 'pendiente';
    return 'pendiente';
}

// ================================================================
// FUNCIÓN: ACTIVAR O EXTENDER MEMBRESÍA
// ================================================================
async function activarMembresia(tiendaId, pagoId, planSlug, duracionDias) {
    try {
        const planData = PLANES[planSlug];
        if (!planData) {
            return { ok: false, error: 'Plan inválido: ' + planSlug };
        }

        const ahora = new Date();

        // 1) Obtener la tienda actual
        const { data: tienda, error: errT } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, nivel, activa_hasta')
            .eq('id', tiendaId)
            .maybeSingle();

        if (errT || !tienda) {
            return { ok: false, error: 'Tienda no encontrada' };
        }

        // 2) Calcular nueva fecha de vencimiento
        // Si ya hay una fecha futura, se extiende desde ahí
        // Si no, se empieza desde ahora
        let fechaBase = ahora;
        if (tienda.activa_hasta) {
            const fechaAnterior = new Date(tienda.activa_hasta);
            if (fechaAnterior > ahora) {
                fechaBase = fechaAnterior;
            }
        }

        const nuevaFechaFin = new Date(fechaBase);
        nuevaFechaFin.setDate(nuevaFechaFin.getDate() + (duracionDias || planData.duracion_dias));

        // 3) Actualizar tienda (nivel + activa_hasta + estado activa)
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
            console.error('Error actualizando tienda:', errUpd);
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
            console.error('Error actualizando pago:', errPago);
            // No fallamos porque la tienda ya está activada
        }

        console.log('✅ Membresía activada para tienda', tiendaId, 'hasta', nuevaFechaFin.toISOString());

        return {
            ok: true,
            tienda_id: tiendaId,
            nivel: planSlug,
            fecha_fin: nuevaFechaFin.toISOString()
        };

    } catch (e) {
        console.error('Excepción activarMembresia:', e);
        return { ok: false, error: e.message };
    }
}

// ================================================================
// GET /api/mercado/health
// ================================================================
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        servicio: 'Mercado',
        nowpayments_configurado: !!NOWPAYMENTS_API_KEY,
        ipn_configurado: !!NOWPAYMENTS_IPN_SECRET,
        planes: Object.keys(PLANES),
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// POST /api/mercado/crear-pago-membresia
// Body: { tienda_id, plan_slug, plan_nombre, monto_mxn,
//         duracion_dias, pay_currency }
// ================================================================
router.post('/crear-pago-membresia', autenticarUsuario, async (req, res) => {
    try {
        const {
            tienda_id,
            plan_slug,
            plan_nombre,
            monto_mxn,
            duracion_dias,
            pay_currency
        } = req.body;

        const usuarioId = req.usuario.id;

        // Validaciones
        if (!tienda_id) {
            return res.status(400).json({ error: 'Falta tienda_id' });
        }
        if (!plan_slug || !PLANES[plan_slug]) {
            return res.status(400).json({ error: 'Plan inválido' });
        }
        if (!pay_currency || !CRIPTOS_SOPORTADAS.includes(pay_currency.toLowerCase())) {
            return res.status(400).json({ error: 'Criptomoneda no soportada' });
        }

        // Verificar que la tienda sea del usuario
        const { data: tienda, error: errT } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, usuario_id, nombre_negocio, nivel, activa_hasta')
            .eq('id', tienda_id)
            .maybeSingle();

        if (errT || !tienda) {
            return res.status(404).json({ error: 'Tienda no encontrada' });
        }
        if (tienda.usuario_id !== usuarioId) {
            return res.status(403).json({ error: 'Esta tienda no te pertenece' });
        }

        const planData = PLANES[plan_slug];
        const montoFinalMxn = parseFloat(monto_mxn || planData.precio_mxn);
        const duracionFinal = parseInt(duracion_dias || planData.duracion_dias);
        const montoUsd = mxnAUsd(montoFinalMxn);

        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({ error: 'NOWPayments no está configurado en el servidor' });
        }

        // Verificar si ya hay un pago en curso para esta tienda
        const { data: pagoExistente } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('id, estado')
            .eq('tienda_id', tienda_id)
            .in('estado', ['pendiente', 'pagando', 'confirmando'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (pagoExistente) {
            console.log('ℹ️ Ya hay un pago en curso:', pagoExistente.id);
            // Devolvemos info del pago existente en vez de crear uno nuevo
            const { data: pagoCompleto } = await supabaseAdmin
                .from('mercado_membresias_pagos')
                .select('*')
                .eq('id', pagoExistente.id)
                .single();

            if (pagoCompleto) {
                return res.json({
                    ok: true,
                    pago_id: String(pagoCompleto.id),
                    nowpayments_id: pagoCompleto.payment_id,
                    pay_address: pagoCompleto.pay_address,
                    pay_amount: pagoCompleto.pay_amount,
                    pay_currency: pagoCompleto.pay_currency,
                    estado: pagoCompleto.estado,
                    reutilizado: true
                });
            }
        }

        // ============ CREAR PAGO EN NOWPAYMENTS ============
        const payload = {
            price_amount: montoUsd,
            price_currency: 'usd',
            pay_currency: pay_currency.toLowerCase(),
            order_description: `Membresía ${planData.nombre} - ${tienda.nombre_negocio} (${duracionFinal} días)`,
            ipn_callback_url: process.env.PUBLIC_URL
                ? `${process.env.PUBLIC_URL}/api/mercado/webhook-nowpayments`
                : undefined,
            success_url: process.env.PUBLIC_URL
                ? `${process.env.PUBLIC_URL}/features/mercado/membresia.html?pago=exitoso`
                : undefined,
            cancel_url: process.env.PUBLIC_URL
                ? `${process.env.PUBLIC_URL}/features/mercado/membresia.html?pago=cancelado`
                : undefined
        };

        console.log('📤 Creando pago NOWPayments:', payload);

        const npResp = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
            method: 'POST',
            headers: {
                'x-api-key': NOWPAYMENTS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const npData = await npResp.json();

        if (!npResp.ok || !npData.payment_id) {
            console.error('❌ Error NOWPayments:', npData);
            return res.status(500).json({
                error: npData.message || 'NOWPayments rechazó la solicitud',
                detalle: npData
            });
        }

        console.log('✅ Pago NOWPayments creado:', npData.payment_id);

        // ============ GUARDAR EN mercado_membresias_pagos ============
        const { data: pagoGuardado, error: errIns } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .insert({
                tienda_id: tienda_id,
                usuario_id: usuarioId,
                plan_slug: plan_slug,
                plan_nombre: plan_nombre || planData.nombre,
                monto_mxn: montoFinalMxn,
                duracion_dias: duracionFinal,
                estado: 'pendiente',
                payment_id: String(npData.payment_id),
                pay_address: npData.pay_address,
                pay_amount: npData.pay_amount,
                pay_currency: npData.pay_currency,
                nowpayments_status: npData.payment_status || 'waiting'
            })
            .select()
            .single();

        if (errIns) {
            console.error('❌ Error guardando pago en DB:', errIns);
            return res.status(500).json({
                error: 'Pago creado en NOWPayments pero no se pudo guardar en DB',
                detalle: errIns.message,
                nowpayments_id: String(npData.payment_id),
                pay_address: npData.pay_address,
                pay_amount: npData.pay_amount,
                pay_currency: npData.pay_currency
            });
        }

        // ============ RESPUESTA ============
        return res.json({
            ok: true,
            pago_id: String(pagoGuardado.id),
            nowpayments_id: String(npData.payment_id),
            pay_address: npData.pay_address,
            pay_amount: npData.pay_amount,
            pay_currency: npData.pay_currency,
            price_amount: npData.price_amount,
            price_currency: npData.price_currency,
            estado: 'pendiente',
            plan_slug: plan_slug,
            plan_nombre: planData.nombre,
            monto_mxn: montoFinalMxn,
            monto_usd: montoUsd,
            duracion_dias: duracionFinal
        });

    } catch (e) {
        console.error('❌ Error creando pago:', e);
        return res.status(500).json({ error: e.message || 'Error creando pago' });
    }
});

// ================================================================
// GET /api/mercado/estado-pago/:pagoId
// Consulta el estado del pago (frontend hace polling)
// ================================================================
router.get('/estado-pago/:pagoId', autenticarUsuario, async (req, res) => {
    try {
        const { pagoId } = req.params;
        const usuarioId = req.usuario.id;

        // Buscar el pago
        const { data: pago, error } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('*')
            .eq('id', pagoId)
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (error || !pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        // Si ya está pagada o en estado terminal, responder directo
        if (pago.estado === 'pagada') {
            return res.json({
                ok: true,
                estado: 'pagada',
                pago_id: String(pago.id),
                plan_slug: pago.plan_slug,
                activa_hasta: pago.activa_hasta
            });
        }

        if (['fallida', 'cancelada', 'expirada'].includes(pago.estado)) {
            return res.json({
                ok: true,
                estado: pago.estado,
                pago_id: String(pago.id)
            });
        }

        // Si aún espera, consultar a NOWPayments
        if (!pago.payment_id) {
            return res.json({ ok: true, estado: pago.estado, pago_id: String(pago.id) });
        }

        const npResp = await fetch(`${NOWPAYMENTS_API_URL}/payment/${pago.payment_id}`, {
            headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
        });

        const npData = await npResp.json();

        if (!npResp.ok) {
            console.error('Error consultando NOWPayments:', npData);
            return res.json({ ok: true, estado: pago.estado, pago_id: String(pago.id) });
        }

        const npStatus = (npData.payment_status || '').toLowerCase();
        const estadoFinal = mapearEstadoNOWPayments(npStatus);

        // Si cambió, actualizar DB
        if (estadoFinal !== pago.estado) {
            await supabaseAdmin
                .from('mercado_membresias_pagos')
                .update({
                    estado: estadoFinal,
                    nowpayments_status: npStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', pagoId);
        }

        // Red de seguridad: si está confirmado pero el webhook no llegó, activar aquí
        if (estadoFinal === 'pagada' && pago.estado !== 'pagada') {
            console.log('⚠️ Red de seguridad: activando membresía desde polling');
            await activarMembresia(
                pago.tienda_id,
                pago.id,
                pago.plan_slug,
                pago.duracion_dias
            );
        }

        return res.json({
            ok: true,
            estado: estadoFinal,
            pago_id: String(pago.id),
            plan_slug: pago.plan_slug,
            np_status: npStatus
        });

    } catch (e) {
        console.error('❌ Error consultando estado:', e);
        return res.status(500).json({ error: e.message || 'Error consultando estado' });
    }
});

// ================================================================
// GET /api/mercado/mi-membresia
// Devuelve la membresía activa de la tienda del usuario
// ================================================================
router.get('/mi-membresia', autenticarUsuario, async (req, res) => {
    try {
        const usuarioId = req.usuario.id;

        // Obtener la tienda del usuario
        const { data: tienda, error: errT } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, nombre_negocio, nivel, activa_hasta, estado')
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (errT) {
            return res.status(500).json({ error: errT.message });
        }

        if (!tienda) {
            return res.json({ ok: true, membresia: null, tienda: null });
        }

        const activa = tienda.activa_hasta && new Date(tienda.activa_hasta) > new Date();
        const diasRestantes = tienda.activa_hasta
            ? Math.max(0, Math.ceil((new Date(tienda.activa_hasta) - new Date()) / (1000 * 60 * 60 * 24)))
            : 0;

        return res.json({
            ok: true,
            tienda: {
                id: tienda.id,
                nombre_negocio: tienda.nombre_negocio,
                estado: tienda.estado
            },
            membresia: {
                nivel: tienda.nivel || 'basico',
                activa: activa,
                activa_hasta: tienda.activa_hasta,
                dias_restantes: diasRestantes
            }
        });

    } catch (e) {
        console.error('Error obteniendo membresía:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// POST /api/mercado/webhook-nowpayments
// Recibe notificaciones IPN de NOWPayments
// (NO autentica con JWT, usa firma HMAC)
// ================================================================
router.post('/webhook-nowpayments', async (req, res) => {
    const inicio = Date.now();

    try {
        // Verificar firma HMAC
        const firmaRecibida = req.headers['x-nowpayments-sig'];
        const bodyString = req.rawBody || JSON.stringify(req.body);

        if (NOWPAYMENTS_IPN_SECRET && firmaRecibida) {
            const firmaCalculada = crypto
                .createHmac('sha512', NOWPAYMENTS_IPN_SECRET)
                .update(bodyString)
                .digest('hex');

            // Comparación segura contra timing attacks
            let firmaValida = false;
            try {
                firmaValida = crypto.timingSafeEqual(
                    Buffer.from(firmaCalculada, 'hex'),
                    Buffer.from(firmaRecibida, 'hex')
                );
            } catch (e2) {
                firmaValida = false;
            }

            if (!firmaValida) {
                console.error('❌ Firma IPN inválida');
                return res.status(401).json({ ok: false, error: 'Firma inválida' });
            }
        }

        const data = req.body;
        const paymentId = data.payment_id;
        const npStatus = data.payment_status;

        console.log('📥 Webhook NOWPayments:', {
            payment_id: paymentId,
            status: npStatus
        });

        if (!paymentId) {
            return res.status(200).json({ ok: true, ignorado: 'sin payment_id' });
        }

        // Buscar el pago por payment_id
        const { data: pago, error } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('*')
            .eq('payment_id', String(paymentId))
            .maybeSingle();

        if (error || !pago) {
            console.warn('⚠️ Pago no encontrado:', paymentId);
            return res.status(200).json({ ok: true, ignorado: 'pago no encontrado' });
        }

        // Evitar reprocesar si ya está pagada
        if (pago.estado === 'pagada') {
            console.log('ℹ️ Pago ya procesado previamente');
            return res.status(200).json({ ok: true, ya_pagado: true });
        }

        // Mapear estado
        const estadoFinal = mapearEstadoNOWPayments(npStatus);

        // Actualizar pago
        const updates = {
            estado: estadoFinal,
            nowpayments_status: npStatus,
            updated_at: new Date().toISOString()
        };

        if (estadoFinal === 'pagada') {
            updates.pagado_en = new Date().toISOString();
        }

        await supabaseAdmin
            .from('mercado_membresias_pagos')
            .update(updates)
            .eq('id', pago.id);

        console.log('💾 Pago actualizado:', pago.id, '→', estadoFinal);

        // Si está confirmada → activar membresía
        if (estadoFinal === 'pagada') {
            const resultado = await activarMembresia(
                pago.tienda_id,
                pago.id,
                pago.plan_slug,
                pago.duracion_dias
            );

            if (!resultado.ok) {
                console.error('❌ Error activando membresía:', resultado.error);
                return res.status(200).json({
                    ok: true,
                    procesado: true,
                    membresia_error: resultado.error
                });
            }

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
                console.log('ℹ️ No se pudo insertar notificación (tabla opcional)');
            }

            return res.status(200).json({
                ok: true,
                procesado: true,
                estado: 'pagada',
                tienda_id: pago.tienda_id,
                fecha_fin: resultado.fecha_fin,
                duracion_ms: Date.now() - inicio
            });
        }

        // Estados no confirmados
        return res.status(200).json({
            ok: true,
            procesado: true,
            estado: estadoFinal,
            duracion_ms: Date.now() - inicio
        });

    } catch (e) {
        console.error('❌ Error procesando webhook:', e);
        // Siempre 200 para evitar reintentos masivos
        return res.status(200).json({
            ok: true,
            error: e.message,
            duracion_ms: Date.now() - inicio
        });
    }
});

// ================================================================
// EXPORT
// ================================================================
module.exports = router;