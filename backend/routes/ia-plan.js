/* ================================================================
   routes/ia-plan.js - ENDPOINTS DE PLANES IA (v1.1)
   ================================================================
   Endpoints:
   - GET  /api/ai/plan/catalogo   → lista planes pagados disponibles
   - GET  /api/ai/plan            → plan vigente del usuario + uso
   - POST /api/ai/plan/checkout   → crea pedido + factura NOWPayments
   - POST /api/ai/plan/cancelar   → cancela el plan al final del periodo

   FASE 1: solo NOWPayments. Stripe se rechaza con 400.

   NO TOCA: payments.js, pay/*, membresia.js,
   membresia-webhook-handler.js, livepass-webhook-handler.js,
   telnyx.js, server.js.
================================================================ */

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');

const supabase = require('../lib/supabase-admin');
const { verificarToken } = require('../middleware/auth');
const { limitadorPagos } = require('../middleware/rateLimit');

/* ================================================================
   CONFIGURACIÓN
================================================================ */

const NOWPAYMENTS_URL = 'https://api.nowpayments.io/v1/invoice';
const NOWPAYMENTS_TIMEOUT_MS = 15000;

const PLANES_PAGO = ['ia_basico', 'ia_pro', 'ia_premium'];
const RANGO_PLAN = { ia_basico: 1, ia_pro: 2, ia_premium: 3 };

/* ================================================================
   UTILIDADES
================================================================ */

function log(evento, datos = {}) {
    console.log(JSON.stringify({
        t: new Date().toISOString(),
        mod: 'ia-plan',
        evento,
        ...datos
    }));
}

function ok(res, data) {
    return res.json({ success: true, data });
}

function err(res, status, mensaje) {
    return res.status(status).json({ success: false, error: mensaje });
}

/* ================================================================
   GET /api/ai/plan/catalogo
   ----------------------------------------------------------------
   Lista los planes pagados disponibles.
   NO devuelve datos del usuario.
================================================================ */

router.get('/catalogo', verificarToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ai_planes_limites')
            .select('plan, nombre, precio_mxn, personajes, mensajes_max, tavily_max, perplexity_max')
            .eq('activo', true)
            .gt('precio_mxn', 0)
            .order('precio_mxn', { ascending: true });

        if (error) {
            log('catalogo_error', { codigo: error.code });
            return err(res, 500, 'No se pudo cargar el catálogo.');
        }

        return ok(res, { planes: data || [] });
    } catch (e) {
        log('catalogo_exception', { mensaje: e.message });
        return err(res, 500, 'Error interno.');
    }
});

/* ================================================================
   GET /api/ai/plan
   ----------------------------------------------------------------
   Plan vigente del usuario + contadores de uso.
   Llama a la función SQL obtener_plan_usuario().
================================================================ */

router.get('/', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.user.id;

        // 1. Plan vigente
        const { data: planRows, error: errPlan } = await supabase.rpc(
            'obtener_plan_usuario',
            { p_usuario: usuarioId, p_huella: null }
        );

        if (errPlan) {
            log('plan_error', { codigo: errPlan.code });
            return err(res, 500, 'No se pudo obtener tu plan.');
        }

        const planRow = Array.isArray(planRows) ? planRows[0] : planRows;

        if (!planRow) {
            return err(res, 404, 'No se encontró un plan para este usuario.');
        }

        // 2. Detalles del plan (nombre, personajes, cuotas)
        const { data: detalles, error: errDet } = await supabase
            .from('ai_planes_limites')
            .select('nombre, personajes, mensajes_max, tavily_max, perplexity_max')
            .eq('plan', planRow.plan_codigo)
            .maybeSingle();

        if (errDet) {
            log('plan_detalles_error', { codigo: errDet.code });
            return err(res, 500, 'No se pudo cargar tu plan.');
        }

        // 3. Días restantes
        let diasRestantes = null;
        if (planRow.fin) {
            const ms = new Date(planRow.fin).getTime() - Date.now();
            diasRestantes = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
        }

        // 4. Cancelada
        const { data: periodo } = await supabase
            .from('usuarios_planes')
            .select('cancelada_at')
            .eq('id', planRow.periodo_id)
            .maybeSingle();

        // 5. Contadores del periodo vigente
        const { data: contadores } = await supabase
            .from('ai_contadores_uso')
            .select('tipo, usados')
            .eq('periodo_id', planRow.periodo_id);

        const uso = {
            mensajes: { usados: 0, limite: detalles?.mensajes_max ?? null },
            tavily: { usados: 0, limite: detalles?.tavily_max ?? null },
            perplexity: { usados: 0, limite: detalles?.perplexity_max ?? null }
        };

        if (Array.isArray(contadores)) {
            contadores.forEach((c) => {
                if (c.tipo === 'mensaje') uso.mensajes.usados = c.usados;
                if (c.tipo === 'busqueda_tavily') uso.tavily.usados = c.usados;
                if (c.tipo === 'busqueda_perplexity') uso.perplexity.usados = c.usados;
            });
        }

        return ok(res, {
            plan: {
                codigo: planRow.plan_codigo,
                nombre: detalles?.nombre || planRow.plan_codigo,
                es_prueba: planRow.plan_codigo === 'ia_gratis_prueba',
                fecha_inicio: planRow.inicio,
                fecha_fin: planRow.fin,
                dias_restantes: diasRestantes,
                cancelada_at: periodo?.cancelada_at || null,
                personajes: detalles?.personajes || []
            },
            uso
        });

    } catch (e) {
        log('plan_exception', { mensaje: e.message });
        return err(res, 500, 'Error interno.');
    }
});

/* ================================================================
   POST /api/ai/plan/checkout
   ----------------------------------------------------------------
   Body: { plan, proveedor }
   FASE 1: solo proveedor 'nowpayments'.
================================================================ */

router.post('/checkout', verificarToken, limitadorPagos, async (req, res) => {
    try {
        // 0. Feature flag
        if (process.env.IA_CHECKOUT_ENABLED !== 'true') {
            return err(res, 503, 'El sistema de pagos aún no está disponible.');
        }

        // 0b. Configuración obligatoria: sin estas variables la factura saldría mal
        const faltan = ['NOWPAYMENTS_API_KEY', 'IA_WEBHOOK_BASE_URL', 'PUBLIC_URL']
            .filter((v) => !process.env[v]);
        if (faltan.length) {
            log('checkout_config_incompleta', { faltan });
            return err(res, 503, 'El sistema de pagos aún no está disponible.');
        }

        const usuarioId = req.user.id;
        const { plan, proveedor } = req.body || {};

        // 1. Validar proveedor
        if (proveedor !== 'nowpayments') {
            return err(res, 400, 'Proveedor no disponible todavía.');
        }

        // 2. Validar plan
        if (!PLANES_PAGO.includes(plan)) {
            return err(res, 400, 'Plan inválido.');
        }

        // 3. Leer precio y verificar que el plan exista y esté activo
        const { data: planDb, error: errPlan } = await supabase
            .from('ai_planes_limites')
            .select('plan, nombre, precio_mxn, activo')
            .eq('plan', plan)
            .maybeSingle();

        if (errPlan) {
            log('checkout_plan_error', { codigo: errPlan.code });
            return err(res, 500, 'No se pudo verificar el plan.');
        }

        if (!planDb || planDb.activo !== true || planDb.precio_mxn <= 0) {
            return err(res, 400, 'Plan no disponible.');
        }

        // 4. Control de downgrade
        const { data: planVigente } = await supabase.rpc('obtener_plan_usuario', {
            p_usuario: usuarioId,
            p_huella: null
        });

        const vigente = Array.isArray(planVigente) ? planVigente[0] : planVigente;

        if (vigente && PLANES_PAGO.includes(vigente.plan_codigo)) {
            const rangoActual = RANGO_PLAN[vigente.plan_codigo] || 0;
            const rangoPedido = RANGO_PLAN[plan] || 0;

            if (rangoPedido < rangoActual) {
                return err(res, 409,
                    'Podrás cambiar a un plan más económico cuando termine tu plan actual.');
            }
        }

        // 5. Crear pedido
        const montoMxn = Number(planDb.precio_mxn);
        const expiraAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        const { data: pedido, error: errPedido } = await supabase
            .from('ai_pedidos_pago')
            .insert({
                usuario_id: usuarioId,
                plan: plan,
                proveedor: 'nowpayments',
                monto_mxn: montoMxn,
                estado: 'pendiente',
                expira_at: expiraAt
            })
            .select('id')
            .single();

        if (errPedido || !pedido) {
            log('checkout_pedido_error', { codigo: errPedido?.code });
            return err(res, 500, 'No se pudo crear el pedido.');
        }

        // 6. Crear factura en NOWPayments
        let factura;
        try {
            const respuesta = await axios.post(
                NOWPAYMENTS_URL,
                {
                    price_amount: montoMxn,
                    price_currency: 'mxn',
                    pay_currency: 'usdttrc20',
                    order_id: pedido.id,
                    order_description: `Plan ${planDb.nombre}`,
                    ipn_callback_url: `${process.env.IA_WEBHOOK_BASE_URL}/api/webhooks/ia/nowpayments`,
                    success_url: `${process.env.PUBLIC_URL}/features/perfil/configuracion/mascotas/plan.html?pago=ok`,
                    cancel_url: `${process.env.PUBLIC_URL}/features/perfil/configuracion/mascotas/plan.html?pago=cancelado`
                },
                {
                    headers: {
                        'x-api-key': process.env.NOWPAYMENTS_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: NOWPAYMENTS_TIMEOUT_MS
                }
            );

            factura = respuesta.data;
        } catch (e) {
            log('checkout_nowpayments_error', {
                status: e.response?.status,
                codigo: e.code
            });

            // Marcar pedido como cancelado
            await supabase
                .from('ai_pedidos_pago')
                .update({ estado: 'cancelado' })
                .eq('id', pedido.id);

            return err(res, 502, 'No fue posible iniciar el pago.');
        }

        if (!factura || !factura.invoice_url || !factura.id) {
            log('checkout_nowpayments_respuesta_invalida');

            await supabase
                .from('ai_pedidos_pago')
                .update({ estado: 'cancelado' })
                .eq('id', pedido.id);

            return err(res, 502, 'No fue posible iniciar el pago.');
        }

        // 7. Guardar proveedor_ref
        const { error: errUpdate } = await supabase
            .from('ai_pedidos_pago')
            .update({ proveedor_ref: String(factura.id) })
            .eq('id', pedido.id);

        if (errUpdate) {
            log('checkout_update_error', { codigo: errUpdate.code });
            // No es crítico: el pedido ya está creado
        }

        log('checkout_ok', {
            pedido_id: pedido.id,
            plan,
            monto_mxn: montoMxn
        });

        return res.status(201).json({
            success: true,
            data: {
                pedido_id: pedido.id,
                url: factura.invoice_url
            }
        });

    } catch (e) {
        log('checkout_exception', { mensaje: e.message });
        return err(res, 500, 'Error interno.');
    }
});

/* ================================================================
   POST /api/ai/plan/cancelar
   ----------------------------------------------------------------
   Marca cancelada_at. El usuario conserva acceso hasta fecha_fin.
   NO llama a NOWPayments (no hay suscripciones).
================================================================ */

router.post('/cancelar', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.user.id;

        const { data, error } = await supabase.rpc('cancelar_plan_ia', {
            p_usuario: usuarioId
        });

        if (error) {
            log('cancelar_error', { codigo: error.code });
            return err(res, 500, 'No se pudo cancelar el plan.');
        }

        if (Number(data) === 0) {
            return err(res, 404, 'No tienes un plan de pago activo para cancelar.');
        }

        // Obtener fecha_fin del periodo vigente
        const { data: planRows } = await supabase.rpc('obtener_plan_usuario', {
            p_usuario: usuarioId,
            p_huella: null
        });

        const vigente = Array.isArray(planRows) ? planRows[0] : planRows;

        const fechaFin = vigente?.fin
            ? new Date(vigente.fin).toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            })
            : 'la fecha de fin';

        return ok(res, {
            cancelada: true,
            fecha_fin: vigente?.fin || null,
            mensaje: `Tu plan termina el ${fechaFin}. No se renovará automáticamente y no hay reembolso.`
        });

    } catch (e) {
        log('cancelar_exception', { mensaje: e.message });
        return err(res, 500, 'Error interno.');
    }
});

module.exports = router;