/* ================================================================
   MERCADO - CSARIEL'S ECOSYSTEM
   Rutas backend: membresías + pagos NOWPayments + ubicación repartidor
   Ruta: /backend/routes/mercado.js

   v2 (correcciones de seguridad y cobro):
   - Precio y duración de la membresía salen de mercado_planes.
     El cliente ya no puede mandar monto ni duración.
   - El IPN exige firma válida (verificarFirmaNowPayments).
     Sin firma o con firma inválida → 401.
   - Activación idempotente: un pago solo activa una vez, aunque
     lleguen el IPN y el polling al mismo tiempo.
   - Los pagos se crean en MXN (price_currency 'mxn').

   NO montar el archivo separado routes/webhooks/nowpayments.js.
   ================================================================ */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { verificarFirmaNowPayments } = require('../utils/nowpayments-sig');

// ================================================================
// SUPABASE ADMIN Y CONFIGURACIÓN
// ================================================================
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const PUBLIC_URL = process.env.PUBLIC_URL || '';

const CRIPTOS_SOPORTADAS = [
    'usdttrc20', 'usdterc20', 'usdc', 'usdcmatic', 'btc', 'eth',
    'bnbbsc', 'maticmainnet', 'trx', 'ltc', 'doge', 'xrp'
];

const log = (...args) => console.log('[Mercado]', ...args);
const logError = (...args) => console.error('[Mercado ERROR]', ...args);

// ================================================================
// PLANES: siempre desde la base (mercado_planes)
// ================================================================
async function obtenerPlan(slug) {
    const { data, error } = await supabaseAdmin
        .from('mercado_planes')
        .select('slug, nombre, precio_mxn, duracion_dias, activo')
        .eq('slug', slug)
        .eq('activo', true)
        .maybeSingle();

    if (error || !data) return null;

    return {
        slug: data.slug,
        nombre: data.nombre,
        precio_mxn: Number(data.precio_mxn),
        duracion_dias: data.duracion_dias || 30
    };
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
        logError('Error autenticando:', e.message);
        return res.status(401).json({ error: 'Error de autenticación' });
    }
}

// ================================================================
// HELPERS
// ================================================================
function mapearEstadoNOWPayments(npStatus) {
    const s = (npStatus || '').toLowerCase();
    if (s === 'finished' || s === 'confirmed') return 'pagada';
    if (s === 'failed' || s === 'refunded' || s === 'expired') return 'fallida';
    if (s === 'confirming' || s === 'sending' || s === 'partially_paid') return 'confirmando';
    return 'pendiente';
}

// Reclama el pago para activarlo. Solo UNA petición (IPN o polling) lo logra.
// Si ya estaba pagado, devuelve null y no se activa de nuevo.
async function reclamarPagoParaActivar(pagoId) {
    const ahora = new Date().toISOString();
    const { data, error } = await supabaseAdmin
        .from('mercado_membresias_pagos')
        .update({ estado: 'pagada', pagado_en: ahora, updated_at: ahora })
        .eq('id', pagoId)
        .neq('estado', 'pagada')
        .select('id, tienda_id, usuario_id, plan_slug, duracion_dias')
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

// Si la activación falla después de reclamar, se devuelve el pago a 'confirmando'
// para que el polling lo reintente.
async function revertirReclamo(pagoId) {
    await supabaseAdmin
        .from('mercado_membresias_pagos')
        .update({ estado: 'confirmando', pagado_en: null, updated_at: new Date().toISOString() })
        .eq('id', pagoId);
}

// Extiende la membresía desde la fecha de vencimiento si aún está vigente
async function activarMembresia(tiendaId, planSlug, duracionDias) {
    try {
        const ahora = new Date();

        const { data: tienda, error: errT } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, usuario_id, activa_hasta')
            .eq('id', tiendaId)
            .maybeSingle();

        if (errT || !tienda) {
            return { ok: false, error: 'Tienda no encontrada' };
        }

        let fechaBase = ahora;
        if (tienda.activa_hasta) {
            const anterior = new Date(tienda.activa_hasta);
            if (anterior > ahora) fechaBase = anterior;
        }

        const nuevaFechaFin = new Date(fechaBase);
        nuevaFechaFin.setDate(nuevaFechaFin.getDate() + duracionDias);

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
            logError('Error actualizando tienda:', errUpd.message);
            return { ok: false, error: errUpd.message };
        }

        log('Membresía activada para tienda', tiendaId, 'hasta', nuevaFechaFin.toISOString());

        return {
            ok: true,
            usuario_id: tienda.usuario_id,
            fecha_fin: nuevaFechaFin.toISOString()
        };
    } catch (e) {
        logError('Excepción activarMembresia:', e.message);
        return { ok: false, error: e.message };
    }
}

async function crearNotificacionMembresia(usuarioId, planSlug, fechaFin) {
    try {
        const { error } = await supabaseAdmin
            .from('notificaciones')
            .insert({
                user_id: usuarioId,
                tipo: 'membresia_activada',
                mensaje: 'Tu membresía ' + String(planSlug).toUpperCase() +
                    ' del Mercado está activa hasta ' + new Date(fechaFin).toLocaleDateString('es-MX'),
                fecha: new Date().toISOString(),
                emisor_id: null,
                leida: false,
                metadata: {
                    tipo_evento: 'membresia_activada',
                    plan: planSlug,
                    fecha_fin: fechaFin,
                    plataforma: "Csariel's Mercado"
                }
            });

        if (error) log('No se pudo insertar notificación:', error.message);
    } catch (e) {
        log('Excepción insertando notificación:', e.message);
    }
}

// Ejecuta la activación completa de un pago ya reclamado
async function completarActivacion(pagoReclamado) {
    const resultado = await activarMembresia(
        pagoReclamado.tienda_id,
        pagoReclamado.plan_slug,
        pagoReclamado.duracion_dias
    );

    if (!resultado.ok) {
        await revertirReclamo(pagoReclamado.id);
        return { ok: false, error: resultado.error };
    }

    await crearNotificacionMembresia(resultado.usuario_id, pagoReclamado.plan_slug, resultado.fecha_fin);
    return { ok: true, fecha_fin: resultado.fecha_fin };
}

// ================================================================
// GET /api/mercado/health
// ================================================================
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        servicio: "Mercado · Csariel's",
        nowpayments_configurado: !!NOWPAYMENTS_API_KEY,
        ipn_configurado: !!NOWPAYMENTS_IPN_SECRET,
        criptos_soportadas: CRIPTOS_SOPORTADAS.length,
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// POST /api/mercado/crear-pago-membresia
// Body: { tienda_id, plan_slug, pay_currency }
// El monto y la duración NO se aceptan del cliente.
// ================================================================
router.post('/crear-pago-membresia', autenticarUsuario, async (req, res) => {
    try {
        const { tienda_id, plan_slug, pay_currency } = req.body || {};
        const usuarioId = req.usuario.id;

        if (!tienda_id) return res.status(400).json({ error: 'Falta tienda_id' });

        const plan = await obtenerPlan(plan_slug);
        if (!plan) return res.status(400).json({ error: 'Plan inválido' });

        const cripto = String(pay_currency || '').toLowerCase();
        if (!CRIPTOS_SOPORTADAS.includes(cripto)) {
            return res.status(400).json({ error: 'Criptomoneda no soportada' });
        }

        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({ error: 'Servicio de pagos no configurado' });
        }

        const { data: tienda, error: errT } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, usuario_id, nombre_negocio')
            .eq('id', tienda_id)
            .maybeSingle();

        if (errT || !tienda) return res.status(404).json({ error: 'Tienda no encontrada' });
        if (tienda.usuario_id !== usuarioId) {
            return res.status(403).json({ error: 'Esta tienda no te pertenece' });
        }

        // Reutilizar un pago en curso para no crear duplicados
        const { data: pagoExistente } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('*')
            .eq('tienda_id', tienda_id)
            .in('estado', ['pendiente', 'confirmando'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (pagoExistente && pagoExistente.pay_address) {
            return res.json({
                ok: true,
                pago_id: String(pagoExistente.id),
                nowpayments_id: pagoExistente.payment_id,
                pay_address: pagoExistente.pay_address,
                pay_amount: pagoExistente.pay_amount,
                pay_currency: pagoExistente.pay_currency,
                estado: pagoExistente.estado,
                reutilizado: true
            });
        }

        // Pago directo en MXN: NOWPayments convierte al cripto elegido
        const payload = {
            price_amount: plan.precio_mxn,
            price_currency: 'mxn',
            pay_currency: cripto,
            order_description: `Membresía ${plan.nombre} - ${tienda.nombre_negocio} (${plan.duracion_dias} días)`,
            ipn_callback_url: PUBLIC_URL ? `${PUBLIC_URL}/api/mercado/webhook-nowpayments` : undefined
        };

        const npResp = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
            method: 'POST',
            headers: {
                'x-api-key': NOWPAYMENTS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const npData = await npResp.json().catch(() => ({}));

        if (!npResp.ok || !npData.payment_id || !npData.pay_address) {
            logError('Error NOWPayments:', npData.message || npResp.status);
            return res.status(502).json({
                error: npData.message || 'No fue posible iniciar el pago'
            });
        }

        const { data: pagoGuardado, error: errIns } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .insert({
                tienda_id: tienda_id,
                usuario_id: usuarioId,
                plan_slug: plan.slug,
                plan_nombre: plan.nombre,
                monto_mxn: plan.precio_mxn,
                duracion_dias: plan.duracion_dias,
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
            logError('Error guardando pago:', errIns.message);
            return res.status(500).json({
                error: 'El pago se creó pero no se pudo guardar. Contacta soporte.',
                nowpayments_id: String(npData.payment_id)
            });
        }

        return res.json({
            ok: true,
            pago_id: String(pagoGuardado.id),
            nowpayments_id: String(npData.payment_id),
            pay_address: npData.pay_address,
            pay_amount: npData.pay_amount,
            pay_currency: npData.pay_currency,
            estado: 'pendiente',
            plan_slug: plan.slug,
            plan_nombre: plan.nombre,
            monto_mxn: plan.precio_mxn,
            duracion_dias: plan.duracion_dias
        });

    } catch (e) {
        logError('Error creando pago:', e.message);
        return res.status(500).json({ error: 'Error creando el pago' });
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

        if (error || !pago) return res.status(404).json({ error: 'Pago no encontrado' });

        if (pago.estado === 'pagada') {
            return res.json({ ok: true, estado: 'pagada', pago_id: String(pago.id), plan_slug: pago.plan_slug });
        }
        if (['fallida', 'cancelada', 'expirada'].includes(pago.estado)) {
            return res.json({ ok: true, estado: pago.estado, pago_id: String(pago.id) });
        }
        if (!pago.payment_id) {
            return res.json({ ok: true, estado: pago.estado, pago_id: String(pago.id) });
        }

        const npResp = await fetch(`${NOWPAYMENTS_API_URL}/payment/${pago.payment_id}`, {
            headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
        });
        const npData = await npResp.json().catch(() => ({}));

        if (!npResp.ok) {
            logError('Error consultando NOWPayments:', npData.message || npResp.status);
            return res.json({ ok: true, estado: pago.estado, pago_id: String(pago.id) });
        }

        const npStatus = (npData.payment_status || '').toLowerCase();
        const estadoFinal = mapearEstadoNOWPayments(npStatus);

        if (estadoFinal === 'pagada') {
            const reclamado = await reclamarPagoParaActivar(pago.id);
            if (reclamado) {
                const r = await completarActivacion(reclamado);
                if (!r.ok) {
                    return res.json({ ok: true, estado: 'confirmando', pago_id: String(pago.id), error: r.error });
                }
                return res.json({ ok: true, estado: 'pagada', pago_id: String(pago.id), plan_slug: pago.plan_slug });
            }
            return res.json({ ok: true, estado: 'pagada', pago_id: String(pago.id), plan_slug: pago.plan_slug });
        }

        if (estadoFinal !== pago.estado) {
            await supabaseAdmin
                .from('mercado_membresias_pagos')
                .update({ estado: estadoFinal, nowpayments_status: npStatus, updated_at: new Date().toISOString() })
                .eq('id', pago.id)
                .neq('estado', 'pagada');
        }

        return res.json({ ok: true, estado: estadoFinal, pago_id: String(pago.id), np_status: npStatus });

    } catch (e) {
        logError('Error consultando estado:', e.message);
        return res.status(500).json({ error: 'Error consultando estado' });
    }
});

// ================================================================
// POST /api/mercado/cancelar-pago/:pagoId
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

        if (error || !pago) return res.status(404).json({ error: 'Pago no encontrado' });

        if (pago.estado === 'pagada') {
            return res.status(400).json({ error: 'Este pago ya fue completado' });
        }
        if (['cancelada', 'expirada', 'fallida'].includes(pago.estado)) {
            return res.json({ ok: true, mensaje: 'Ya estaba cancelado', estado: pago.estado });
        }

        await supabaseAdmin
            .from('mercado_membresias_pagos')
            .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
            .eq('id', pagoId)
            .neq('estado', 'pagada');

        return res.json({ ok: true, estado: 'cancelada' });

    } catch (e) {
        logError('Error cancelando pago:', e.message);
        return res.status(500).json({ error: 'Error cancelando el pago' });
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

        if (errT) return res.status(500).json({ error: 'Error consultando tienda' });
        if (!tienda) return res.json({ ok: true, membresia: null, tienda: null });

        const activa = tienda.activa_hasta && new Date(tienda.activa_hasta) > new Date();
        const diasRestantes = tienda.activa_hasta
            ? Math.max(0, Math.ceil((new Date(tienda.activa_hasta) - new Date()) / (1000 * 60 * 60 * 24)))
            : 0;

        return res.json({
            ok: true,
            tienda: { id: tienda.id, nombre_negocio: tienda.nombre_negocio, estado: tienda.estado },
            membresia: {
                nivel: tienda.nivel || 'basico',
                activa: !!activa,
                activa_hasta: tienda.activa_hasta,
                dias_restantes: diasRestantes
            }
        });

    } catch (e) {
        logError('Error obteniendo membresía:', e.message);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// ================================================================
// GET /api/mercado/ubicacion-repartidor/:pedidoId
// Solo el comprador del pedido puede ver la ubicación.
// ================================================================
router.get('/ubicacion-repartidor/:pedidoId', autenticarUsuario, async (req, res) => {
    try {
        const { pedidoId } = req.params;
        const usuarioId = req.usuario.id;

        const { data: pedido, error: errP } = await supabaseAdmin
            .from('mercado_pedidos')
            .select('id, comprador_id, tienda_id, repartidor_id, estado, latitud_entrega, longitud_entrega')
            .eq('id', pedidoId)
            .maybeSingle();

        if (errP || !pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (pedido.comprador_id !== usuarioId) {
            return res.status(403).json({ error: 'No tienes acceso a este pedido' });
        }

        if (!pedido.repartidor_id) {
            return res.json({ ok: true, tiene_repartidor: false, mensaje: 'Aún no hay repartidor asignado' });
        }

        const { data: rep, error: errR } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('id, usuario_id, nombre_completo, telefono, vehiculo, latitud_actual, longitud_actual, ultima_ubicacion')
            .eq('usuario_id', pedido.repartidor_id)
            .maybeSingle();

        if (errR) return res.status(500).json({ error: 'Error consultando repartidor' });

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
        logError('Error ubicación repartidor:', e.message);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// ================================================================
// POST /api/mercado/webhook-nowpayments
// IPN de NOWPayments. Sin firma válida → 401. Nunca activa sin firma.
// ================================================================
router.post('/webhook-nowpayments', async (req, res) => {
    try {
        if (!NOWPAYMENTS_IPN_SECRET) {
            logError('NOWPAYMENTS_IPN_SECRET no configurado');
            return res.status(500).json({ ok: false, error: 'configuracion' });
        }

        const firma = req.headers['x-nowpayments-sig'];
        if (!verificarFirmaNowPayments(req.body, req.rawBody, firma, NOWPAYMENTS_IPN_SECRET)) {
            logError('Firma IPN inválida o ausente');
            return res.status(401).json({ ok: false, error: 'firma' });
        }

        const data = req.body || {};
        const paymentId = data.payment_id != null ? String(data.payment_id) : null;
        const npStatus = String(data.payment_status || '').toLowerCase();

        log('Webhook NOWPayments:', { payment_id: paymentId, status: npStatus });

        if (!paymentId) return res.status(200).json({ ok: true, ignorado: 'sin_payment_id' });

        const { data: pago, error } = await supabaseAdmin
            .from('mercado_membresias_pagos')
            .select('*')
            .eq('payment_id', paymentId)
            .maybeSingle();

        if (error || !pago) {
            return res.status(200).json({ ok: true, ignorado: 'pago_no_encontrado' });
        }

        const estadoFinal = mapearEstadoNOWPayments(npStatus);

        if (estadoFinal !== 'pagada') {
            if (pago.estado !== 'pagada') {
                await supabaseAdmin
                    .from('mercado_membresias_pagos')
                    .update({ estado: estadoFinal, nowpayments_status: npStatus, updated_at: new Date().toISOString() })
                    .eq('id', pago.id)
                    .neq('estado', 'pagada');
            }
            return res.status(200).json({ ok: true, procesado: true, estado: estadoFinal });
        }

        // Monto y moneda deben coincidir con el plan de la base
        const montoOk = Number(data.price_amount) === Number(pago.monto_mxn);
        const monedaOk = String(data.price_currency || '').toLowerCase() === 'mxn';
        if (!montoOk || !monedaOk) {
            logError('Monto o moneda no coinciden:', { pago: pago.id, recibido: data.price_amount });
            await supabaseAdmin
                .from('mercado_membresias_pagos')
                .update({ estado: 'fallida', nowpayments_status: npStatus, updated_at: new Date().toISOString() })
                .eq('id', pago.id)
                .neq('estado', 'pagada');
            return res.status(200).json({ ok: true, ignorado: 'monto_no_coincide' });
        }

        const reclamado = await reclamarPagoParaActivar(pago.id);
        if (!reclamado) {
            return res.status(200).json({ ok: true, ya_procesado: true });
        }

        const r = await completarActivacion(reclamado);
        if (!r.ok) {
            // 500 para que NOWPayments reintente el aviso
            return res.status(500).json({ ok: false, error: 'activacion_pendiente' });
        }

        return res.status(200).json({ ok: true, procesado: true, estado: 'pagada', fecha_fin: r.fecha_fin });

    } catch (e) {
        logError('Error procesando webhook:', e.message);
        return res.status(500).json({ ok: false, error: 'interno' });
    }
});

// ================================================================
// EXPORT
// ================================================================
module.exports = router;