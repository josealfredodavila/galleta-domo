/* ================================================================
   MERCADO - SARIEL'S ECOSYSTEM
   Rutas backend: membresías + pagos NOWPayments
   Ruta: /backend/routes/mercado.js
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

// Tipo de cambio MXN -> USD (ajústalo o hazlo dinámico)
const TIPO_CAMBIO_MXN_USD = 17.5;

// Planes válidos (debe coincidir con el frontend)
const PLANES = {
    basico: { id: 'basico', nombre: 'Básico', precio_mxn: 99, duracion_dias: 30 },
    pro:    { id: 'pro',    nombre: 'Pro',    precio_mxn: 299, duracion_dias: 30 },
    max:    { id: 'max',    nombre: 'Max',    precio_mxn: 599, duracion_dias: 30 }
};

// Criptos soportadas (para validar)
const CRIPTOS_SOPORTADAS = ['usdttrc20', 'usdc', 'btc', 'eth', 'usdterc20', 'bnbbsc', 'maticmainnet'];

// ================================================================
// MIDDLEWARE: autenticar usuario con Supabase JWT
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
function generarIdPago() {
    return 'mem_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
}

function mxnAUsd(mxn) {
    return parseFloat((parseFloat(mxn) / TIPO_CAMBIO_MXN_USD).toFixed(2));
}

// ================================================================
// POST /api/mercado/crear-pago-membresia
// Crea un pago en NOWPayments y devuelve la dirección
// Body: { plan, pay_currency, precio_mxn, duracion_dias }
// ================================================================
router.post('/crear-pago-membresia', autenticarUsuario, async (req, res) => {
    try {
        const { plan, pay_currency } = req.body;
        const usuarioId = req.usuario.id;

        // Validaciones
        if (!plan || !PLANES[plan]) {
            return res.status(400).json({ error: 'Plan inválido' });
        }

        if (!pay_currency || !CRIPTOS_SOPORTADAS.includes(pay_currency.toLowerCase())) {
            return res.status(400).json({ error: 'Criptomoneda no soportada' });
        }

        const planData = PLANES[plan];
        const montoMxn = planData.precio_mxn;
        const montoUsd = mxnAUsd(montoMxn);

        if (!NOWPAYMENTS_API_KEY) {
            return res.status(500).json({ error: 'NOWPayments no está configurado en el servidor' });
        }

        // Verificar si ya tiene una membresía activa del mismo plan
        const { data: membresiaExistente } = await supabaseAdmin
            .from('mercado_membresias')
            .select('id, plan, fecha_fin')
            .eq('usuario_id', usuarioId)
            .eq('estado', 'activa')
            .gte('fecha_fin', new Date().toISOString())
            .maybeSingle();

        // Si ya tiene una activa, la renovación extiende desde fecha_fin
        // Si no, empieza desde ahora. (Esto lo maneja el webhook)

        // ============ CREAR PAGO EN NOWPAYMENTS ============
        const orderId = generarIdPago();

        const payload = {
            price_amount: montoUsd,
            price_currency: 'usd',
            pay_currency: pay_currency.toLowerCase(),
            order_id: orderId,
            order_description: `Membresía ${planData.nombre} - Sariel's Mercado (${planData.duracion_dias} días)`,
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

        // ============ GUARDAR EN DB ============
        const pagoId = orderId;

        const { data: pagoGuardado, error: errorGuardado } = await supabaseAdmin
            .from('mercado_pagos')
            .insert({
                id: pagoId,
                usuario_id: usuarioId,
                plan: plan,
                monto_mxn: montoMxn,
                monto_usd: montoUsd,
                cripto: pay_currency.toLowerCase(),
                pay_address: npData.pay_address,
                pay_amount: npData.pay_amount,
                nowpayments_id: String(npData.payment_id),
                estado: 'esperando',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (errorGuardado) {
            console.error('❌ Error guardando pago en DB:', errorGuardado);
            // Aún así devolvemos el pago al frontend, pero avisamos
        }

        // ============ RESPUESTA ============
        return res.json({
            ok: true,
            pago_id: pagoId,
            nowpayments_id: String(npData.payment_id),
            pay_address: npData.pay_address,
            pay_amount: npData.pay_amount,
            pay_currency: npData.pay_currency,
            price_amount: npData.price_amount,
            price_currency: npData.price_currency,
            estado: 'esperando',
            plan: plan,
            monto_mxn: montoMxn,
            monto_usd: montoUsd,
            expira_en: 20 * 60 // 20 minutos (aprox)
        });

    } catch (e) {
        console.error('❌ Error creando pago:', e);
        return res.status(500).json({ error: e.message || 'Error creando pago' });
    }
});

// ================================================================
// GET /api/mercado/estado-pago/:pagoId
// Consulta el estado actual del pago (frontend hace polling)
// ================================================================
router.get('/estado-pago/:pagoId', autenticarUsuario, async (req, res) => {
    try {
        const { pagoId } = req.params;
        const usuarioId = req.usuario.id;

        // Buscar el pago
        const { data: pago, error } = await supabaseAdmin
            .from('mercado_pagos')
            .select('*')
            .eq('id', pagoId)
            .eq('usuario_id', usuarioId)
            .maybeSingle();

        if (error || !pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        // Si ya está confirmado en DB, devolver directo
        if (pago.estado === 'confirmado' || pago.estado === 'activa') {
            return res.json({
                ok: true,
                estado: 'confirmado',
                pago_id: pago.id,
                plan: pago.plan
            });
        }

        if (pago.estado === 'fallido' || pago.estado === 'rechazado') {
            return res.json({
                ok: true,
                estado: pago.estado,
                pago_id: pago.id
            });
        }

        // Si aún espera, consultar a NOWPayments
        if (!pago.nowpayments_id) {
            return res.json({ ok: true, estado: 'esperando', pago_id: pago.id });
        }

        const npResp = await fetch(`${NOWPAYMENTS_API_URL}/payment/${pago.nowpayments_id}`, {
            headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
        });

        const npData = await npResp.json();

        if (!npResp.ok) {
            console.error('Error consultando NOWPayments:', npData);
            return res.json({ ok: true, estado: 'esperando', pago_id: pago.id });
        }

        const npEstado = (npData.payment_status || '').toLowerCase();

        // Estados posibles: waiting, confirming, confirmed, sending, partially_paid, finished, failed, refunded, expired
        let estadoFinal = 'esperando';

        if (npEstado === 'finished' || npEstado === 'confirmed') {
            estadoFinal = 'confirmado';
        } else if (npEstado === 'failed' || npEstado === 'refunded' || npEstado === 'expired') {
            estadoFinal = 'fallido';
        }

        // Si cambió, actualizar DB (aunque el webhook debería hacerlo, esto es red de seguridad)
        if (estadoFinal !== 'esperando') {
            await supabaseAdmin
                .from('mercado_pagos')
                .update({
                    estado: estadoFinal,
                    updated_at: new Date().toISOString(),
                    np_status: npEstado
                })
                .eq('id', pagoId);

            // Si está confirmado, activar membresía (por si el webhook no llegó)
            if (estadoFinal === 'confirmado' && pago.estado !== 'confirmado') {
                await activarMembresia(pago.usuario_id, pago.plan, pagoId);
            }
        }

        return res.json({
            ok: true,
            estado: estadoFinal,
            pago_id: pago.id,
            plan: pago.plan,
            np_status: npEstado
        });

    } catch (e) {
        console.error('❌ Error consultando estado:', e);
        return res.status(500).json({ error: e.message || 'Error consultando estado' });
    }
});

// ================================================================
// FUNCIÓN: ACTIVAR MEMBRESÍA
// ================================================================
async function activarMembresia(usuarioId, plan, pagoId) {
    try {
        const planData = PLANES[plan];
        if (!planData) {
            console.error('Plan inválido al activar:', plan);
            return { ok: false, error: 'Plan inválido' };
        }

        const ahora = new Date();

        // Buscar membresía activa existente
        const { data: existente } = await supabaseAdmin
            .from('mercado_membresias')
            .select('id, fecha_fin')
            .eq('usuario_id', usuarioId)
            .eq('estado', 'activa')
            .gte('fecha_fin', ahora.toISOString())
            .order('fecha_fin', { ascending: false })
            .maybeSingle();

        // Calcular fecha de inicio y fin
        let fechaInicio = ahora;
        let fechaFin;

        if (existente && existente.fecha_fin) {
            // Renovación: extiende desde la fecha_fin actual
            const fechaFinAnterior = new Date(existente.fecha_fin);
            if (fechaFinAnterior > ahora) {
                fechaInicio = new Date(existente.fecha_fin);
            }
            fechaFin = new Date(fechaInicio);
            fechaFin.setDate(fechaFin.getDate() + planData.duracion_dias);

            // Actualizar la existente
            const { error } = await supabaseAdmin
                .from('mercado_membresias')
                .update({
                    plan: plan,
                    fecha_inicio: existente.fecha_inicio || ahora.toISOString(),
                    fecha_fin: fechaFin.toISOString(),
                    estado: 'activa',
                    pago_id_ultimo: pagoId,
                    updated_at: ahora.toISOString()
                })
                .eq('id', existente.id);

            if (error) {
                console.error('Error actualizando membresía:', error);
                return { ok: false, error: error.message };
            }

            console.log('✅ Membresía extendida:', existente.id, 'hasta', fechaFin.toISOString());
            return { ok: true, membresia_id: existente.id, extendida: true };
        }

        // Nueva membresía
        fechaFin = new Date(ahora);
        fechaFin.setDate(fechaFin.getDate() + planData.duracion_dias);

        const { data: nuevaMembresia, error } = await supabaseAdmin
            .from('mercado_membresias')
            .insert({
                usuario_id: usuarioId,
                plan: plan,
                estado: 'activa',
                fecha_inicio: fechaInicio.toISOString(),
                fecha_fin: fechaFin.toISOString(),
                pago_id_ultimo: pagoId,
                created_at: ahora.toISOString(),
                updated_at: ahora.toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Error creando membresía:', error);
            return { ok: false, error: error.message };
        }

        console.log('✅ Membresía nueva activada:', nuevaMembresia.id, 'hasta', fechaFin.toISOString());
        return { ok: true, membresia_id: nuevaMembresia.id };

    } catch (e) {
        console.error('Error en activarMembresia:', e);
        return { ok: false, error: e.message };
    }
}

// ================================================================
// GET /api/mercado/mi-membresia
// Devuelve la membresía activa del usuario
// ================================================================
router.get('/mi-membresia', autenticarUsuario, async (req, res) => {
    try {
        const usuarioId = req.usuario.id;

        const { data, error } = await supabaseAdmin
            .from('mercado_membresias')
            .select('*')
            .eq('usuario_id', usuarioId)
            .eq('estado', 'activa')
            .gte('fecha_fin', new Date().toISOString())
            .order('fecha_fin', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            return res.status(500).json({ error: error.message });
        }

        if (!data) {
            return res.json({ ok: true, membresia: null });
        }

        const diasRestantes = Math.max(0, Math.ceil((new Date(data.fecha_fin) - new Date()) / (1000 * 60 * 60 * 24)));

        return res.json({
            ok: true,
            membresia: {
                ...data,
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
    try {
        const firmaRecibida = req.headers['x-nowpayments-sig'];
        const bodyString = JSON.stringify(req.body);

        // Verificar firma HMAC
        if (NOWPAYMENTS_IPN_SECRET && firmaRecibida) {
            const firmaCalculada = crypto
                .createHmac('sha512', NOWPAYMENTS_IPN_SECRET)
                .update(bodyString)
                .digest('hex');

            if (firmaCalculada !== firmaRecibida) {
                console.error('❌ Firma IPN inválida');
                return res.status(401).json({ error: 'Firma inválida' });
            }
        }

        const data = req.body;
        console.log('📥 Webhook NOWPayments recibido:', {
            payment_id: data.payment_id,
            order_id: data.order_id,
            payment_status: data.payment_status
        });

        const orderId = data.order_id;
        const paymentId = data.payment_id;
        const status = (data.payment_status || '').toLowerCase();

        if (!orderId) {
            console.warn('⚠️ Webhook sin order_id');
            return res.status(200).json({ ok: true, ignorado: 'sin order_id' });
        }

        // Buscar el pago
        const { data: pago, error } = await supabaseAdmin
            .from('mercado_pagos')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (error || !pago) {
            console.warn('⚠️ Pago no encontrado:', orderId);
            return res.status(200).json({ ok: true, ignorado: 'pago no encontrado' });
        }

        // Evitar reprocesar
        if (pago.estado === 'confirmado') {
            console.log('ℹ️ Pago ya confirmado previamente');
            return res.status(200).json({ ok: true, ya_confirmado: true });
        }

        let estadoFinal = pago.estado;

        if (status === 'finished' || status === 'confirmed') {
            estadoFinal = 'confirmado';
        } else if (status === 'failed' || status === 'refunded' || status === 'expired') {
            estadoFinal = 'fallido';
        } else if (status === 'confirming' || status === 'sending' || status === 'partially_paid') {
            estadoFinal = 'procesando';
        }

        // Actualizar pago
        await supabaseAdmin
            .from('mercado_pagos')
            .update({
                estado: estadoFinal,
                np_status: status,
                tx_hash: data.payin_hash || data.outcome_hash || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        // Si está confirmado, activar membresía
        if (estadoFinal === 'confirmado') {
            const resultado = await activarMembresia(pago.usuario_id, pago.plan, pago.id);
            if (!resultado.ok) {
                console.error('❌ Error activando membresía desde webhook:', resultado.error);
                // Devolvemos 200 igual para que NOWPayments no reintente infinitamente
            } else {
                console.log('✅ Membresía activada desde webhook');
            }
        }

        return res.status(200).json({ ok: true, estado: estadoFinal });

    } catch (e) {
        console.error('❌ Error procesando webhook:', e);
        // Devolvemos 200 para evitar reintentos masivos
        return res.status(200).json({ ok: true, error: e.message });
    }
});

// ================================================================
// GET /api/mercado/health
// Health check para verificar que el router está montado
// ================================================================
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        servicio: 'Mercado',
        nowpayments_configurado: !!NOWPAYMENTS_API_KEY,
        ipn_configurado: !!NOWPAYMENTS_IPN_SECRET,
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// EXPORT
// ================================================================
module.exports = router;