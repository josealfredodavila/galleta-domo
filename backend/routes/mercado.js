/* ================================================================
   MERCADO - CSARIEL'S ECOSYSTEM
   Rutas backend: membresías + pagos NOWPayments + ubicación repartidor
   Ruta: /backend/routes/mercado.js
   
   Esquema real confirmado:
   - mercado_membresias_pagos:
       id, tienda_id (FK), usuario_id (FK), plan_slug, plan_nombre,
       monto_mxn, duracion_dias, estado, payment_id, pay_address,
       pay_amount, pay_currency, nowpayments_status,
       activa_desde, activa_hasta, pagado_en, created_at, updated_at
     Estados: pendiente, pagando, confirmando, pagada, cancelada, expirada, fallida
   - notificaciones usa: user_id, tipo, mensaje, fecha, emisor_id, leida, metadata
   - Al confirmar → actualiza mercado_tiendas.nivel + activa_hasta + estado
   
   Este archivo YA INCLUYE:
   - El webhook de NOWPayments (/api/mercado/webhook-nowpayments)
   - El endpoint de ubicación (/api/mercado/ubicacion-repartidor/:pedidoId)
   
   NO montar el archivo separado routes/webhooks/nowpayments.js.
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
// PLANES VÁLIDOS
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
// LOGS CON SÍMBOLOS CSARIEL'S
// ================================================================
function log(...args) {
    console.log('[◈ Mercado]', ...args);
}

function logError(...args) {
    console.error('[✶ Mercado ERROR]', ...args);
}

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
        logError('Error autenticando:', e);
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
            .select('id, usuario_id, nivel, activa_hasta')
            .eq('id', tiendaId)
            .maybeSingle();

        if (errT || !tienda) {
            return { ok: false, error: 'Tienda no encontrada' };
        }

        // 2) Calcular nueva fecha de vencimiento
        let fechaBase = ahora;
        if (tienda.activa_hasta) {
            const fechaAnterior = new Date(tienda.activa_hasta);
            if (fechaAnterior > ahora) {
                fechaBase = fechaAnterior;
            }
        }

        const nuevaFechaFin = new Date(fechaBase);
        nuevaFechaFin.setDate(nuevaFechaFin.getDate() + (duracionDias || planData.duracion_dias));

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

        // 4) Actualizar pago
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
        }

        log('● Membresía activada para tienda', tiendaId, 'hasta', nuevaFechaFin.toISOString());

        return {
            ok: true,
            tienda_id: tiendaId,
            usuario_id: tienda.usuario_id,
            nivel: planSlug,
            fecha_fin: nuevaFechaFin.toISOString()
        };

    } catch (e) {
        logError('Excepción activarMembresia:', e);
        return { ok: false, error: e.message };
    }
}

// ================================================================
// FUNCIÓN: CREAR NOTIFICACIÓN AL USUARIO
// Adaptada a la estructura real de la tabla notificaciones:
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
// GET /api/mercado/health
// ================================================================
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        servicio: '◈ Mercado · Csariel\'s',
        nowpayments_configurado: !!NOWPAYMENTS_API_KEY,
        ipn_configurado: !!NOWPAYMENTS_IPN_SECRET,
        planes: Object.keys(PLANES),
        criptos_soportadas: CRIPTOS_SOPORTADAS.length,
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// POST /api/mercado/crear-pago-membresia
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
            log('ℹ️ Ya hay un pago en curso:', pagoExistente.id);
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

        log('◈ Creando pago NOWPayments:', {
            plan: plan_slug,
            monto_usd: montoUsd,
            cripto: pay_currency
        });

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
            logError('Error NOWPayments:', npData);
            return res.status(500).json({
                error: npData.message || 'NOWPayments rechazó la solicitud',
                detalle: npData
            });
        }

        log('● Pago NOWPayments creado:', npData.payment_id);

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
            logError('Error guardando pago en DB:', errIns);
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
        logError('Error creando pago:', e);
        return res.status(500).json({ error: e.message || 'Error creando pago' });
    }
});

// ================================================================
// GET /api/mercado/estado-pago/:pagoId
// ================================================================
router.get('/estado-pago/:pagoId', autenticarUsuario, async (req, res) => {
    try {
        const { pagoId } = req.params;
        const usuarioId = req.usuario.id;

        const { data: pago, error } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('*')
            .eq('id', pagoId)
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (error || !pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

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

        if (!pago.payment_id) {
            return res.json({ ok: true, estado: pago.estado, pago_id: String(pago.id) });
        }

        const npResp = await fetch(`${NOWPAYMENTS_API_URL}/payment/${pago.payment_id}`, {
            headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
        });

        const npData = await npResp.json();

        if (!npResp.ok) {
            logError('Error consultando NOWPayments:', npData);
            return res.json({ ok: true, estado: pago.estado, pago_id: String(pago.id) });
        }

        const npStatus = (npData.payment_status || '').toLowerCase();
        const estadoFinal = mapearEstadoNOWPayments(npStatus);

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

        if (estadoFinal === 'pagada' && pago.estado !== 'pagada') {
            log('✧ Red de seguridad: activando membresía desde polling');
            const resultado = await activarMembresia(
                pago.tienda_id,
                pago.id,
                pago.plan_slug,
                pago.duracion_dias
            );

            if (resultado.ok) {
                await crearNotificacionMembresia(pago.usuario_id, pago.plan_slug, resultado.fecha_fin);
            }
        }

        return res.json({
            ok: true,
            estado: estadoFinal,
            pago_id: String(pago.id),
            plan_slug: pago.plan_slug,
            np_status: npStatus
        });

    } catch (e) {
        logError('Error consultando estado:', e);
        return res.status(500).json({ error: e.message || 'Error consultando estado' });
    }
});

// ================================================================
// POST /api/mercado/cancelar-pago/:pagoId
// Cancela un pago pendiente si el usuario abandona
// ================================================================
router.post('/cancelar-pago/:pagoId', autenticarUsuario, async (req, res) => {
    try {
        const { pagoId } = req.params;
        const usuarioId = req.usuario.id;

        const { data: pago, error } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('id, estado')
            .eq('id', pagoId)
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (error || !pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        if (pago.estado === 'pagada') {
            return res.status(400).json({ error: 'Este pago ya fue completado, no se puede cancelar' });
        }

        if (['cancelada', 'expirada', 'fallida'].includes(pago.estado)) {
            return res.json({ ok: true, mensaje: 'Ya estaba cancelado', estado: pago.estado });
        }

        await supabaseAdmin
            .from('mercado_membresias_pagos')
            .update({
                estado: 'cancelada',
                updated_at: new Date().toISOString()
            })
            .eq('id', pagoId);

        log('✶ Pago cancelado:', pagoId);

        return res.json({ ok: true, estado: 'cancelada' });

    } catch (e) {
        logError('Error cancelando pago:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// GET /api/mercado/mi-membresia
// ================================================================
router.get('/mi-membresia', autenticarUsuario, async (req, res) => {
    try {
        const usuarioId = req.usuario.id;

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
        logError('Error obteniendo membresía:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// GET /api/mercado/ubicacion-repartidor/:pedidoId
// Devuelve la ubicación actual del repartidor asignado a un pedido
// (fallback por si Realtime falla)
// ================================================================
router.get('/ubicacion-repartidor/:pedidoId', autenticarUsuario, async (req, res) => {
    try {
        const { pedidoId } = req.params;
        const usuarioId = req.usuario.id;

        // 1) Buscar el pedido y verificar que sea del comprador
        const { data: pedido, error: errP } = await supabaseAdmin
            .from('mercado_pedidos')
            .select('id, comprador_id, tienda_id, repartidor_id, estado, latitud_entrega, longitud_entrega')
            .eq('id', pedidoId)
            .maybeSingle();

        if (errP || !pedido) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        // Solo el comprador puede ver la ubicación
        if (pedido.comprador_id !== usuarioId) {
            return res.status(403).json({ error: 'No tienes acceso a este pedido' });
        }

        // 2) Si no tiene repartidor, avisar
        if (!pedido.repartidor_id) {
            return res.json({
                ok: true,
                tiene_repartidor: false,
                mensaje: 'Aún no hay repartidor asignado'
            });
        }

        // 3) Obtener la ubicación del repartidor
        const { data: rep, error: errR } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('id, usuario_id, nombre_completo, telefono, vehiculo, latitud_actual, longitud_actual, ultima_ubicacion')
            .eq('usuario_id', pedido.repartidor_id)
            .maybeSingle();

        if (errR) {
            return res.status(500).json({ error: errR.message });
        }

        // 4) Obtener la ubicación de la tienda (origen)
        const { data: tienda } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('nombre_negocio, direccion, latitud, longitud, telefono')
            .eq('id', pedido.tienda_id)
            .maybeSingle();

        return res.json({
            ok: true,
            tiene_repartidor: true,
            pedido: {
                estado: pedido.estado,
                latitud_entrega: pedido.latitud_entrega,
                longitud_entrega: pedido.longitud_entrega
            },
            repartidor: rep ? {
                id: rep.id,
                usuario_id: rep.usuario_id,
                nombre: rep.nombre_completo || 'Repartidor',
                telefono: rep.telefono,
                vehiculo: rep.vehiculo,
                latitud: rep.latitud_actual,
                longitud: rep.longitud_actual,
                ultima_actualizacion: rep.ultima_ubicacion
            } : null,
            tienda: tienda ? {
                nombre: tienda.nombre_negocio,
                direccion: tienda.direccion,
                latitud: tienda.latitud,
                longitud: tienda.longitud,
                telefono: tienda.telefono
            } : null
        });

    } catch (e) {
        logError('Error ubicación repartidor:', e);
        return res.status(500).json({ error: e.message });
    }
});

// ================================================================
// POST /api/mercado/webhook-nowpayments
// Recibe notificaciones IPN de NOWPayments
// ================================================================
router.post('/webhook-nowpayments', async (req, res) => {
    const inicio = Date.now();

    try {
        const firmaRecibida = req.headers['x-nowpayments-sig'];
        const bodyString = req.rawBody || JSON.stringify(req.body);

        if (NOWPAYMENTS_IPN_SECRET && firmaRecibida) {
            const firmaCalculada = crypto
                .createHmac('sha512', NOWPAYMENTS_IPN_SECRET)
                .update(bodyString)
                .digest('hex');

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
                logError('Firma IPN inválida');
                return res.status(401).json({ ok: false, error: 'Firma inválida' });
            }
        }

        const data = req.body;
        const paymentId = data.payment_id;
        const npStatus = data.payment_status;

        log('◈ Webhook NOWPayments:', {
            payment_id: paymentId,
            status: npStatus
        });

        if (!paymentId) {
            return res.status(200).json({ ok: true, ignorado: 'sin payment_id' });
        }

        const { data: pago, error } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('*')
            .eq('payment_id', String(paymentId))
            .maybeSingle();

        if (error || !pago) {
            logError('Pago no encontrado:', paymentId);
            return res.status(200).json({ ok: true, ignorado: 'pago no encontrado' });
        }

        if (pago.estado === 'pagada') {
            log('ℹ️ Pago ya procesado previamente');
            return res.status(200).json({ ok: true, ya_pagado: true });
        }

        const estadoFinal = mapearEstadoNOWPayments(npStatus);

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

        log('◆ Pago actualizado:', pago.id, '→', estadoFinal);

        if (estadoFinal === 'pagada') {
            const resultado = await activarMembresia(
                pago.tienda_id,
                pago.id,
                pago.plan_slug,
                pago.duracion_dias
            );

            if (!resultado.ok) {
                logError('Error activando membresía:', resultado.error);
                return res.status(200).json({
                    ok: true,
                    procesado: true,
                    membresia_error: resultado.error
                });
            }

            await crearNotificacionMembresia(pago.usuario_id, pago.plan_slug, resultado.fecha_fin);

            return res.status(200).json({
                ok: true,
                procesado: true,
                estado: 'pagada',
                tienda_id: pago.tienda_id,
                fecha_fin: resultado.fecha_fin,
                duracion_ms: Date.now() - inicio
            });
        }

        return res.status(200).json({
            ok: true,
            procesado: true,
            estado: estadoFinal,
            duracion_ms: Date.now() - inicio
        });

    } catch (e) {
        logError('Error procesando webhook:', e);
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