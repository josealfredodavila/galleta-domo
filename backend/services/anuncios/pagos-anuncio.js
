// ================================================================
// services/anuncios/pagos-anuncio.js — Csariel's (v2, con reutilización)
// Pagos de anuncios del carrusel (flujo propio, prefijo ANU-).
//   POST /api/payments/anuncio/create          → crea o reutiliza el pago
//   GET  /api/payments/anuncio/status/:pagoId  → estado (solo lectura)
//   procesarPagoAnuncio(...)                   → lo llama el webhook ANU-
// Reglas:
//   - Precio fijo en USD por semana, calculado en el servidor.
//   - Solo redes sin ERC20.
//   - Términos v1.4 obligatorios (sin devoluciones).
//   - Si ya hay una factura viva para el mismo anuncio/semanas/red, se reutiliza.
//   - La vigencia se calcula en la RPC activar_anuncio_pagado, nunca aquí.
// ================================================================

'use strict';

const axios = require('axios');
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const { decidirFactura } = require('../pagos/reutilizar-factura');

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1/payment';
const TERMINOS_VERSION_ACTUAL = '1.4';
const PRECIO_SEMANA_USD = 17.5;
const PRECIO_SEMANA_MXN_REF = 299; // solo referencia visual
const SEMANAS_PERMITIDAS = [1, 2, 3, 4];
const MIN_NOWPAYMENTS_USD = 16;

const REDES_ANUNCIO = {
    usdttrc20: 'USDT · TRON',
    usdtbsc: 'USDT · BSC',
    usdtmatic: 'USDT · Polygon',
    usdtsol: 'USDT · Solana',
    usdcsol: 'USDC · Solana',
    usdcmatic: 'USDC · Polygon',
    usdcbsc: 'USDC · BSC'
};

const fail = (res, status, error) => res.status(status).json({ success: false, error });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function precioTotalUsd(semanas) {
    return Number((PRECIO_SEMANA_USD * semanas).toFixed(2));
}

// ================================================================
// POST /api/payments/anuncio/create
// ================================================================
async function crearPagoAnuncio(req, res) {
    try {
        const userId = req.usuario.id;
        const anuncioId = Number(req.body?.anuncioId);
        const semanas = Number(req.body?.semanas ?? 1);
        const payCurrency = String(req.body?.payCurrency || '').toLowerCase();
        const terminosOk = req.body?.terminosAceptados === true
            && String(req.body?.terminosVersion) === TERMINOS_VERSION_ACTUAL;

        if (!Number.isInteger(anuncioId) || anuncioId <= 0) return fail(res, 400, 'anuncioId inválido');
        if (!SEMANAS_PERMITIDAS.includes(semanas)) return fail(res, 400, 'semanas debe ser 1, 2, 3 o 4');
        if (!REDES_ANUNCIO[payCurrency]) return fail(res, 400, 'Red de pago no permitida para anuncios');
        if (!process.env.NOWPAYMENTS_API_KEY) return fail(res, 500, 'Servicio de pagos no configurado');

        const { data: anuncio, error: errA } = await supabaseAdmin
            .from('anuncios')
            .select('id, usuario_id, estado_moderacion, archivado_at')
            .eq('id', anuncioId)
            .maybeSingle();
        if (errA) throw errA;
        if (!anuncio || anuncio.usuario_id !== userId) return fail(res, 404, 'Anuncio no encontrado');
        if (anuncio.archivado_at) return fail(res, 409, 'El anuncio fue eliminado');
        if (anuncio.estado_moderacion !== 'pendiente_pago') {
            return fail(res, 409, 'El anuncio no está pendiente de pago');
        }

        // Antes de crear una factura nueva, revisamos si ya existe una viva con estas mismas opciones.
        const decision = await decidirFactura({
            supabaseAdmin,
            tabla: 'pagos_anuncios',
            filtros: { anuncio_id: anuncioId, usuario_id: userId, semanas, pay_currency: payCurrency }
        });

        if (decision.modo === 'bloqueado') {
            return res.status(409).json({
                success: false,
                error: 'Ya tienes un pago parcial en esta orden. Escríbenos a soporte antes de intentar de nuevo.'
            });
        }

        if (decision.modo === 'reutilizar') {
            const f = decision.fila;
            return res.status(200).json({
                success: true,
                reutilizado: true,
                data: {
                    pago_id: f.id,
                    semanas: f.semanas,
                    total_usd: Number(f.precio_usd),
                    payment_url: f.payment_url || null,
                    pay_address: decision.np.payAddress || f.pay_address,
                    pay_amount: decision.np.payAmount ?? f.pay_amount,
                    pay_currency: decision.np.payCurrency || f.pay_currency,
                    estado_np: decision.np.status
                }
            });
        }

        // decision.modo === 'crear': los términos solo se exigen para una factura nueva
        if (!terminosOk) return fail(res, 400, 'Debes aceptar los Términos v1.4 para continuar');

        const totalUsd = precioTotalUsd(semanas);
        if (totalUsd < MIN_NOWPAYMENTS_USD) {
            logger.error(`ANU precio ${totalUsd} USD bajo el mínimo: revisar configuración`);
            return fail(res, 500, 'Configuración de precio inválida');
        }

        const { data: pago, error: errP } = await supabaseAdmin
            .from('pagos_anuncios')
            .insert({
                anuncio_id: anuncioId,
                usuario_id: userId,
                semanas,
                monto_mxn: PRECIO_SEMANA_MXN_REF * semanas,
                moneda: 'MXN',
                precio_usd: totalUsd,
                pay_currency: payCurrency,
                estado: 'pendiente',
                proveedor_pago: 'nowpayments',
                terminos_version: TERMINOS_VERSION_ACTUAL,
                terminos_aceptado_at: new Date().toISOString()
            })
            .select('id')
            .single();
        if (errP) throw errP;

        const orderId = `ANU-${pago.id}`;
        let np;
        try {
            const r = await axios.post(NOWPAYMENTS_API_URL, {
                price_amount: totalUsd,
                price_currency: 'usd',
                pay_currency: payCurrency,
                order_id: orderId,
                order_description: `Anuncio ${anuncioId} · ${semanas} semana(s)`
            }, {
                headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' },
                timeout: 15000
            });
            np = r.data;
        } catch (e) {
            logger.error(`NOWPayments ANU ${orderId}: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`);
            await supabaseAdmin.from('pagos_anuncios')
                .update({ estado: 'cancelado', nowpayments_status: 'creation_failed', updated_at: new Date().toISOString() })
                .eq('id', pago.id);
            return fail(res, 502, 'No fue posible crear el pago');
        }

        const paymentId = np?.payment_id ? String(np.payment_id) : null;
        if (!paymentId) {
            await supabaseAdmin.from('pagos_anuncios')
                .update({ estado: 'cancelado', nowpayments_status: 'no_payment_id', updated_at: new Date().toISOString() })
                .eq('id', pago.id);
            return fail(res, 502, 'NOWPayments no devolvió un identificador de pago');
        }

        // El webhook busca por el id de la fila (dentro del order_id), así que
        // aunque este update falle, un IPN válido igual encuentra el pago.
        const { error: errU } = await supabaseAdmin.from('pagos_anuncios').update({
            payment_id: paymentId,
            order_id: orderId,
            payment_url: np.payment_url || null,
            pay_address: np.pay_address || null,
            pay_amount: Number(np.pay_amount) || null,
            nowpayments_status: np.payment_status || 'waiting',
            updated_at: new Date().toISOString()
        }).eq('id', pago.id);
        if (errU) logger.error(`ANU guardar payment_id ${pago.id}: ${errU.message}`);

        return res.status(201).json({
            success: true,
            reutilizado: false,
            data: {
                pago_id: pago.id,
                semanas,
                total_usd: totalUsd,
                payment_url: np.payment_url || null,
                pay_address: np.pay_address || null,
                pay_amount: np.pay_amount || null,
                pay_currency: np.pay_currency || payCurrency
            }
        });
    } catch (e) {
        logger.error(`Error creando pago de anuncio: ${e.message}`);
        return fail(res, 500, 'Error interno creando el pago del anuncio');
    }
}

// ================================================================
// GET /api/payments/anuncio/status/:pagoId
// Solo lee la base. La activación la hace el webhook, nunca el polling.
// ================================================================
async function estadoPagoAnuncio(req, res) {
    try {
        const pagoId = String(req.params.pagoId || '');
        if (!UUID_RE.test(pagoId)) return fail(res, 400, 'pagoId inválido');

        const { data: pago, error } = await supabaseAdmin
            .from('pagos_anuncios')
            .select('id, anuncio_id, estado, semanas, precio_usd, nowpayments_status, pagado_at')
            .eq('id', pagoId)
            .eq('usuario_id', req.usuario.id)
            .maybeSingle();
        if (error) throw error;
        if (!pago) return fail(res, 404, 'Pago no encontrado');

        return res.json({
            success: true,
            data: pago,
            paid: pago.estado === 'pagado',
            failed: pago.estado === 'cancelado'
        });
    } catch (e) {
        logger.error(`Error estado pago anuncio: ${e.message}`);
        return fail(res, 500, 'Error verificando el pago');
    }
}

// ================================================================
// WEBHOOK ANU- (llamado desde routes/webhooks.js)
// Firma ya verificada por el router. Idempotente.
// ================================================================
async function procesarPagoAnuncio(orderId, npStatus, data, res) {
    try {
        const pagoId = String(orderId).slice(4); // quita "ANU-"
        if (!UUID_RE.test(pagoId)) return res.status(200).json({ ok: true, ignorado: 'order_id' });

        const { data: pago, error } = await supabaseAdmin
            .from('pagos_anuncios')
            .select('id, estado')
            .eq('id', pagoId)
            .maybeSingle();
        if (error) throw error;
        if (!pago) return res.status(200).json({ ok: true, ignorado: 'pago_no_encontrado' });

        // Registrar el estado que llega, sin tocar un pago ya confirmado
        await supabaseAdmin.from('pagos_anuncios')
            .update({ nowpayments_status: npStatus, updated_at: new Date().toISOString() })
            .eq('id', pago.id)
            .neq('estado', 'pagado');

        if (npStatus === 'finished') {
            const montoUsd = Number(data.price_amount);
            const { data: r, error: errR } = await supabaseAdmin.rpc('activar_anuncio_pagado', {
                p_pago_id: pago.id,
                p_nowpayments_status: npStatus,
                p_price_amount: Number.isFinite(montoUsd) ? montoUsd : null
            });

            if (errR) {
                // Monto distinto: no es transitorio. Se responde 200 para no reintentar en bucle
                // y queda registrado para revisión manual (no hay devoluciones).
                if (String(errR.message).includes('monto_no_coincide')) {
                    logger.error(`ANU ${pago.id} MONTO NO COINCIDE: revisión manual. price_amount=${data.price_amount}`);
                    return res.status(200).json({ ok: true, revision_manual: true });
                }
                logger.error(`activar_anuncio_pagado ${pago.id}: ${errR.message}`);
                return res.status(500).json({ ok: false }); // NOWPayments reintenta
            }
            return res.status(200).json({ ok: true, ...(r || {}) });
        }

        if (['failed', 'expired', 'canceled', 'cancelled'].includes(npStatus)) {
            await supabaseAdmin.from('pagos_anuncios')
                .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
                .eq('id', pago.id)
                .neq('estado', 'pagado');
        }

        // partially_paid, confirming, sending, waiting: no activan nada
        return res.status(200).json({ ok: true });
    } catch (e) {
        logger.error(`procesarPagoAnuncio ${orderId}: ${e.message}`);
        return res.status(500).json({ ok: false });
    }
}

module.exports = {
    crearPagoAnuncio,
    estadoPagoAnuncio,
    procesarPagoAnuncio,
    TERMINOS_VERSION_ACTUAL
};