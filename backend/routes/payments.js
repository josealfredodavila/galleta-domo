// ================================================================
// ROUTES/PAYMENTS.JS — Csariel's (v3.2)
// Transmisiones (pay-per-view), Muro P2P, Marketing e Internet.
// Método: NOWPayments. NO toca membresías, Live Pass ni donaciones de Live.
// Estados de ordenes_internet permitidos: pendiente, pagado, activo, cancelado.
// v3.2: mínimo de 16 USD en todas las redes USDT/USDC (confirmado en
//       pruebas: NOWPayments rechaza montos menores a ~11 USDT).
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');

const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');
const { verificarToken } = require('../middleware/auth');
const { limitadorPagos } = require('../middleware/rateLimit');
const { procesarOrdenInternet } = require('../services/telnyx/esim');

let verificarErrores = (req, res, next) => next();
try {
    const middleware = require('../middleware/validation');
    if (middleware && typeof middleware.verificarErrores === 'function') {
        verificarErrores = middleware.verificarErrores;
    }
} catch (e) { /* opcional */ }

// ================================================================
// CONFIGURACIÓN
// ================================================================
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1/payment';

// Redes permitidas. Los códigos deben coincidir con los de NOWPayments.
// minimo_usd: NOWPayments rechaza montos menores (comprobado: 10.94 USDT
// rechazado, 16.3 USDT aceptado). Se usa 16 USD como mínimo seguro.
const REDES_PERMITIDAS = {
    usdttrc20: { moneda: 'USDT', red: 'TRON',     minimo_usd: 16 },
    usdtbsc:   { moneda: 'USDT', red: 'BSC',      minimo_usd: 16 },
    usdtmatic: { moneda: 'USDT', red: 'Polygon',  minimo_usd: 16 },
    usdtsol:   { moneda: 'USDT', red: 'Solana',   minimo_usd: 16 },
    usdterc20: { moneda: 'USDT', red: 'Ethereum', minimo_usd: 20 },
    usdcsol:   { moneda: 'USDC', red: 'Solana',   minimo_usd: 16 },
    usdcmatic: { moneda: 'USDC', red: 'Polygon',  minimo_usd: 16 },
    usdcbsc:   { moneda: 'USDC', red: 'BSC',      minimo_usd: 16 },
    usdc:      { moneda: 'USDC', red: 'Ethereum', minimo_usd: 20 }
};

const MXN_A_USD_APROX = 0.055;

// ================================================================
// HELPERS
// ================================================================
const numeroValido = (v) => Number.isFinite(Number(v)) && Number(v) >= 0;
const enteroPositivo = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const respuestaError = (res, status, error) => res.status(status).json({ success: false, error });

function validarRedPago(payCurrency, montoMxn) {
    const red = REDES_PERMITIDAS[payCurrency];
    if (!red) return { valido: false, error: 'Red de pago no soportada' };

    const montoUsd = Number(montoMxn) * MXN_A_USD_APROX;
    if (montoUsd < red.minimo_usd) {
        const minimoMxn = Math.ceil(red.minimo_usd / MXN_A_USD_APROX);
        return {
            valido: false,
            error: `El monto es demasiado bajo para ${red.moneda} en ${red.red}. Mínimo: ${red.minimo_usd} USD (~$${minimoMxn} MXN)`
        };
    }
    return { valido: true, red };
}

// Estado de NOWPayments → estado local de ordenes_internet (solo valores permitidos)
function estadoInternetLocal(npStatus, estadoActual) {
    if (npStatus === 'finished') return 'pagado';
    if (['failed', 'refunded', 'expired', 'canceled', 'cancelled'].includes(npStatus)) return 'cancelado';
    return estadoActual === 'pendiente' ? 'pendiente' : estadoActual;
}

// ================================================================
// POST /api/payments/create  (acceso a transmisión de pago)
// El monto se toma de transmisiones.precio_acceso, nunca del cliente.
// Guarda payment_id para que el webhook pueda enlazar el pago con la orden.
// ================================================================
router.post('/create', verificarToken, limitadorPagos, verificarErrores, async (req, res) => {
    try {
        const { transmisionId } = req.body || {};
        const userId = req.usuario.id;

        if (!transmisionId) return respuestaError(res, 400, 'transmisionId es requerido');
        if ((req.body.metodo || 'crypto') !== 'crypto') return respuestaError(res, 400, 'Método de pago no soportado');
        if (!NOWPAYMENTS_API_KEY) return respuestaError(res, 500, 'Servicio de pagos no configurado');

        const { data: transmision, error: errT } = await supabaseAdmin
            .from('transmisiones')
            .select('id, streamer_id, precio_acceso')
            .eq('id', Number(transmisionId))
            .maybeSingle();
        if (errT) throw errT;
        if (!transmision) return respuestaError(res, 404, 'Transmisión no encontrada');
        if (transmision.streamer_id === userId) return respuestaError(res, 400, 'No puedes pagar tu propia transmisión');

        const monto = Number(transmision.precio_acceso);
        if (!Number.isFinite(monto) || monto <= 0) return respuestaError(res, 400, 'Esta transmisión no tiene acceso de pago');

        const comision = Number((monto * 0.02).toFixed(2));
        const montoStreamer = Number((monto - comision).toFixed(2));

        const { data: orden, error: errO } = await supabaseAdmin
            .from('pagos_transmision')
            .insert({
                transmision_id: transmision.id,
                espectador_id: userId,
                streamer_id: transmision.streamer_id,
                monto_pagado: monto,
                comision_sariels: comision,
                monto_streamer: montoStreamer,
                metodo_pago: 'crypto',
                tipo_pago: 'acceso',
                estado: 'pendiente',
                monto_usd_esperado: monto,
                moneda_orden: 'USD',
                price_amount_enviado: monto,
                price_currency_enviado: 'usd',
                pay_currency_enviado: 'usdttrc20'
            })
            .select()
            .single();
        if (errO) throw errO;

        let np;
        try {
            const r = await axios.post(NOWPAYMENTS_API_URL, {
                price_amount: monto,
                price_currency: 'usd',
                pay_currency: 'usdttrc20',
                order_id: `TRX-${orden.id}`,
                order_description: `Pago transmisión ${transmision.id}`
            }, {
                headers: { 'x-api-key': NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' },
                timeout: 15000
            });
            np = r.data;
        } catch (e) {
            logger.error(`NOWPayments transmisión ${orden.id}: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`);
            return res.status(502).json({ success: false, error: 'No fue posible crear el pago con NOWPayments' });
        }

        const paymentId = np?.payment_id || null;
        if (!paymentId) {
            return res.status(502).json({ success: false, error: 'NOWPayments no devolvió un identificador de pago' });
        }

        // Enlazar el pago con la orden: sin payment_id el webhook no puede encontrarla
        const { error: errLink } = await supabaseAdmin
            .from('pagos_transmision')
            .update({
                payment_id: String(paymentId),
                payment_url: np.payment_url || null,
                pay_address: np.pay_address || null,
                pay_amount_esperado: numeroValido(np.pay_amount) ? Number(np.pay_amount) : null,
                moneda_pago_esperada: np.pay_currency || 'usdttrc20'
            })
            .eq('id', orden.id);
        if (errLink) {
            logger.error(`guardar payment_id transmisión ${orden.id}: ${errLink.message}`);
            return res.status(500).json({ success: false, error: 'El pago fue creado pero no se pudo guardar la orden', orden_id: orden.id, payment_id: paymentId });
        }

        return res.status(201).json({
            success: true,
            data: {
                id: orden.id,
                estado: orden.estado,
                monto,
                moneda: 'USD',
                payment_id: paymentId,
                payment_url: np.payment_url || null,
                pay_address: np.pay_address || null,
                pay_amount: np.pay_amount || null,
                pay_currency: np.pay_currency || null
            }
        });
    } catch (e) {
        logger.error(`Error creando pago de transmisión: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error interno creando el pago' });
    }
});

// ================================================================
// POST /api/payments/muro/create  (venta P2P de tokens)
// ================================================================
router.post('/muro/create', verificarToken, limitadorPagos, async (req, res) => {
    try {
        const userId = req.usuario.id;
        const postId = Number(req.body?.postId);
        const cantidad = Number(req.body?.cantidad);
        const payCurrency = String(req.body?.payCurrency || 'usdttrc20').toLowerCase();

        if (!Number.isInteger(postId) || postId <= 0) return respuestaError(res, 400, 'postId inválido');
        if (!enteroPositivo(cantidad)) return respuestaError(res, 400, 'La cantidad debe ser un entero mayor a 0');
        if (cantidad > 1000000000) return respuestaError(res, 400, 'Cantidad inválida');
        if (!REDES_PERMITIDAS[payCurrency]) return respuestaError(res, 400, 'Red de pago no soportada');
        if (!NOWPAYMENTS_API_KEY) return respuestaError(res, 500, 'Servicio de pagos no configurado');

        const { data: orden, error: errOrden } = await supabaseAdmin.rpc('crear_orden_muro', {
            p_post_id: postId,
            p_comprador_id: userId,
            p_cantidad: cantidad,
            p_pay_currency: payCurrency
        });
        if (errOrden) {
            logger.error(`crear_orden_muro: ${errOrden.message}`);
            return respuestaError(res, 500, 'Error creando la orden P2P');
        }

        if (!orden || orden.success !== true) {
            const motivo = orden?.error ? String(orden.error) : 'error_desconocido';
            const mapa = {
                post_no_encontrado:           { status: 404, msg: 'Publicación no encontrada' },
                no_puedes_comprar_tus_tokens: { status: 400, msg: 'No puedes comprar tus propios tokens' },
                sin_inventario:               { status: 409, msg: 'Esta publicación ya no tiene tokens disponibles' },
                inventario_insuficiente:      { status: 409, msg: orden?.disponible ? `Solo hay ${orden.disponible} tokens disponibles` : 'Inventario insuficiente' },
                cantidad_invalida:            { status: 400, msg: 'Cantidad inválida' },
                precio_invalido:              { status: 500, msg: 'La publicación tiene un precio inválido' },
                red_no_soportada:             { status: 400, msg: 'Red de pago no soportada' }
            };
            const info = mapa[motivo] || { status: 409, msg: 'No se pudo crear la orden' };
            return respuestaError(res, info.status, info.msg);
        }

        const ventaId = Number(orden.venta_id);
        if (!Number.isInteger(ventaId) || ventaId <= 0) return respuestaError(res, 500, 'Respuesta inválida del servidor');

        const precioMxn = Number(orden.precio_mxn);
        const validacion = validarRedPago(payCurrency, precioMxn);
        if (!validacion.valido) {
            await supabaseAdmin.rpc('cancelar_venta_muro', { p_venta_id: ventaId, p_estado: 'cancelado', p_nowpayments_status: 'creation_failed' })
                .catch((e) => logger.error(`cancelar_venta_muro ${ventaId}: ${e.message}`));
            return respuestaError(res, 400, validacion.error);
        }

        const orderId = `muro_${ventaId}`;
        let np;
        try {
            const r = await axios.post(NOWPAYMENTS_API_URL, {
                price_amount: precioMxn,
                price_currency: 'mxn',
                pay_currency: payCurrency,
                order_id: orderId,
                order_description: `Compra de ${orden.cantidad} tokens en Muro #${orden.post_id}`
            }, {
                headers: { 'x-api-key': NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' },
                timeout: 15000
            });
            np = r.data;
        } catch (e) {
            logger.error(`NOWPayments Muro ${orderId}: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`);
            await supabaseAdmin.rpc('cancelar_venta_muro', { p_venta_id: ventaId, p_estado: 'cancelado', p_nowpayments_status: 'creation_failed' })
                .catch((err) => logger.error(`cancelar_venta_muro ${ventaId}: ${err.message}`));
            return res.status(502).json({ success: false, error: 'No fue posible crear el pago con NOWPayments', venta_id: ventaId });
        }

        const paymentId = np?.payment_id || null;
        if (!paymentId) {
            await supabaseAdmin.rpc('cancelar_venta_muro', { p_venta_id: ventaId, p_estado: 'cancelado', p_nowpayments_status: 'creation_failed' })
                .catch((err) => logger.error(`cancelar_venta_muro ${ventaId}: ${err.message}`));
            return res.status(502).json({ success: false, error: 'NOWPayments no devolvió un identificador de pago', venta_id: ventaId });
        }

        const payAmount = numeroValido(np.pay_amount) ? Number(np.pay_amount) : 0;
        const payCurrencyReal = np.pay_currency || payCurrency;

        const { data: registro, error: errReg } = await supabaseAdmin.rpc('registrar_payment_muro', {
            p_venta_id: ventaId,
            p_payment_id: String(paymentId),
            p_pay_amount: payAmount,
            p_pay_currency: String(payCurrencyReal),
            p_payment_status: String(np.payment_status || 'waiting')
        });
        if (errReg) {
            logger.error(`registrar_payment_muro ${ventaId}: ${errReg.message}`);
            return res.status(500).json({ success: false, error: 'El pago fue creado pero no se pudo guardar la orden', venta_id: ventaId, payment_id: paymentId });
        }

        return res.status(201).json({
            success: true,
            data: {
                venta_id: ventaId,
                post_id: orden.post_id,
                cantidad: orden.cantidad,
                precio_mxn: precioMxn,
                comision_plataforma: Number(orden.comision_plataforma),
                precio_usdt: payAmount,
                estado: registro?.estado || 'pagando',
                payment_id: paymentId,
                payment_url: np.payment_url || null,
                pay_address: np.pay_address || null,
                pay_amount: np.pay_amount || null,
                pay_currency: payCurrencyReal,
                order_id: orderId,
                expires_at: orden.expires_at || null
            }
        });
    } catch (e) {
        logger.error(`Error creando pago Muro: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error interno creando el pago del Muro' });
    }
});

// ================================================================
// POST /api/payments/marketing/create  (campaña)
// ================================================================
router.post('/marketing/create', verificarToken, limitadorPagos, async (req, res) => {
    try {
        const userId = req.usuario.id;
        const campaignId = req.body?.campaignId;
        const payCurrency = String(req.body?.payCurrency || 'usdttrc20').toLowerCase();

        if (!campaignId) return respuestaError(res, 400, 'campaignId es requerido');
        if (!REDES_PERMITIDAS[payCurrency]) return respuestaError(res, 400, 'Red de pago no soportada');
        if (!NOWPAYMENTS_API_KEY) return respuestaError(res, 500, 'Servicio de pagos no configurado');

        const { data: campaign, error: errC } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('id, anunciante_id, presupuesto, moneda, estado, nombre')
            .eq('id', campaignId)
            .eq('anunciante_id', userId)
            .maybeSingle();
        if (errC) throw errC;
        if (!campaign) return respuestaError(res, 404, 'Campaña no encontrada');
        if (campaign.estado !== 'pendiente_pago') return respuestaError(res, 409, 'La campaña no está pendiente de pago');

        const validacion = validarRedPago(payCurrency, campaign.presupuesto);
        if (!validacion.valido) return respuestaError(res, 400, validacion.error);

        const { data: pago, error: errP } = await supabaseAdmin
            .from('marketing_pagos')
            .insert({
                campaign_id: campaign.id,
                anunciante_id: userId,
                monto_mxn: campaign.presupuesto,
                estado: 'pendiente',
                pay_currency: payCurrency
            })
            .select()
            .single();
        if (errP) throw errP;

        const orderId = `MKT-${pago.id}`;
        let np;
        try {
            const r = await axios.post(NOWPAYMENTS_API_URL, {
                price_amount: Number(campaign.presupuesto),
                price_currency: 'mxn',
                pay_currency: payCurrency,
                order_id: orderId,
                order_description: `Campaña de marketing: ${campaign.nombre}`
            }, {
                headers: { 'x-api-key': NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' },
                timeout: 15000
            });
            np = r.data;
        } catch (e) {
            logger.error(`NOWPayments Marketing ${orderId}: ${e.message}`);
            await supabaseAdmin.from('marketing_pagos').update({ nowpayments_status: 'creation_failed', estado: 'cancelado' }).eq('id', pago.id);
            return res.status(502).json({ success: false, error: 'No fue posible crear el pago con NOWPayments', pago_id: pago.id });
        }

        const paymentId = np?.payment_id || null;
        if (!paymentId) {
            await supabaseAdmin.from('marketing_pagos').update({ nowpayments_status: 'creation_failed', estado: 'cancelado' }).eq('id', pago.id);
            return res.status(502).json({ success: false, error: 'NOWPayments no devolvió un identificador de pago', pago_id: pago.id });
        }

        const { data: actualizado, error: errU } = await supabaseAdmin
            .from('marketing_pagos')
            .update({
                payment_id: String(paymentId),
                precio_usdt: numeroValido(np.pay_amount) ? Number(np.pay_amount) : null,
                moneda_pago: np.pay_currency || payCurrency,
                nowpayments_status: np.payment_status || 'waiting'
            })
            .eq('id', pago.id)
            .select()
            .single();
        if (errU) {
            logger.error(`guardar payment_id Marketing ${pago.id}: ${errU.message}`);
            return res.status(500).json({ success: false, error: 'El pago fue creado pero no se pudo guardar la orden', pago_id: pago.id, payment_id: paymentId });
        }

        return res.status(201).json({
            success: true,
            data: {
                pago_id: actualizado.id,
                campaign_id: campaign.id,
                estado: actualizado.estado,
                monto_mxn: actualizado.monto_mxn,
                payment_id: paymentId,
                payment_url: np.payment_url || null,
                pay_address: np.pay_address || null,
                pay_amount: np.pay_amount || null,
                pay_currency: np.pay_currency || null,
                order_id: orderId
            }
        });
    } catch (e) {
        logger.error(`Error creando pago de marketing: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error interno creando el pago de la campaña' });
    }
});

// ================================================================
// POST /api/payments/internet/create  (paquete de datos eSIM)
// Estados: pendiente (esperando pago) → pagado → activo.
// ================================================================
router.post('/internet/create', verificarToken, limitadorPagos, async (req, res) => {
    try {
        const userId = req.usuario.id;
        const ordenId = req.body?.ordenId;
        const payCurrency = String(req.body?.payCurrency || 'usdttrc20').toLowerCase();

        if (!ordenId) return respuestaError(res, 400, 'ordenId es requerido');
        if (!REDES_PERMITIDAS[payCurrency]) return respuestaError(res, 400, 'Red de pago no soportada');
        if (!NOWPAYMENTS_API_KEY) return respuestaError(res, 500, 'Servicio de pagos no configurado');

        const { data: orden, error: errO } = await supabaseAdmin
            .from('ordenes_internet')
            .select('id, usuario_id, plan_nombre, monto_mxn, estado')
            .eq('id', ordenId)
            .eq('usuario_id', userId)
            .maybeSingle();
        if (errO) throw errO;
        if (!orden) return respuestaError(res, 404, 'Orden no encontrada');
        if (orden.estado !== 'pendiente') return respuestaError(res, 409, 'La orden no está pendiente de pago');

        const validacion = validarRedPago(payCurrency, orden.monto_mxn);
        if (!validacion.valido) return respuestaError(res, 400, validacion.error);

        const orderId = `NET-${orden.id}`;
        let np;
        try {
            const r = await axios.post(NOWPAYMENTS_API_URL, {
                price_amount: Number(orden.monto_mxn),
                price_currency: 'mxn',
                pay_currency: payCurrency,
                order_id: orderId,
                order_description: `Paquete Internet: ${orden.plan_nombre}`
            }, {
                headers: { 'x-api-key': NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' },
                timeout: 15000
            });
            np = r.data;
        } catch (e) {
            logger.error(`NOWPayments Internet ${orderId}: ${e.message}`);
            // La orden sigue 'pendiente' y el usuario puede reintentar; no se cancela
            return res.status(502).json({ success: false, error: 'No fue posible crear el pago con NOWPayments' });
        }

        const paymentId = np?.payment_id || null;
        if (!paymentId) return res.status(502).json({ success: false, error: 'NOWPayments no devolvió un identificador de pago' });

        const { data: actualizada, error: errU } = await supabaseAdmin
            .from('ordenes_internet')
            .update({
                payment_id: String(paymentId),
                precio_usdt: numeroValido(np.pay_amount) ? Number(np.pay_amount) : null,
                pay_currency: payCurrency,
                nowpayments_status: np.payment_status || 'waiting',
                updated_at: new Date().toISOString()
            })
            .eq('id', orden.id)
            .select()
            .single();
        if (errU) {
            logger.error(`guardar payment_id Internet ${orden.id}: ${errU.message}`);
            return res.status(500).json({ success: false, error: 'El pago fue creado pero no se pudo guardar la orden', orden_id: orden.id, payment_id: paymentId });
        }

        return res.status(201).json({
            success: true,
            data: {
                orden_id: actualizada.id,
                estado: actualizada.estado,
                monto_mxn: actualizada.monto_mxn,
                payment_id: paymentId,
                payment_url: np.payment_url || null,
                pay_address: np.pay_address || null,
                pay_amount: np.pay_amount || null,
                pay_currency: np.pay_currency || null,
                order_id: orderId
            }
        });
    } catch (e) {
        logger.error(`Error creando pago Internet: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error interno creando el pago de Internet' });
    }
});

// ================================================================
// GET /api/payments/status/:ordenId  (transmisiones)
// ================================================================
router.get('/status/:ordenId', verificarToken, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('pagos_transmision')
            .select('*')
            .eq('id', req.params.ordenId)
            .eq('espectador_id', req.usuario.id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return respuestaError(res, 404, 'Orden no encontrada');
        return res.json({ success: true, data });
    } catch (e) {
        logger.error(`Error verificando pago: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error verificando el pago' });
    }
});

// ================================================================
// GET /api/payments/muro/status/:ventaId
// Consulta NOWPayments; liquida solo si el pago está finished/confirmed.
// ================================================================
router.get('/muro/status/:ventaId', verificarToken, async (req, res) => {
    try {
        const ventaId = Number(req.params.ventaId);
        const userId = req.usuario.id;
        if (!Number.isInteger(ventaId) || ventaId <= 0) return respuestaError(res, 400, 'ventaId inválido');
        if (!NOWPAYMENTS_API_KEY) return respuestaError(res, 500, 'Servicio de pagos no configurado');

        const { data: venta, error: errV } = await supabaseAdmin
            .from('muro_ventas_tokens')
            .select('*')
            .eq('id', ventaId)
            .eq('comprador_id', userId)
            .maybeSingle();
        if (errV) throw errV;
        if (!venta) return respuestaError(res, 404, 'Venta no encontrada');

        if (['pagado', 'completado'].includes(venta.estado)) {
            return res.json({ success: true, data: venta, final: true, paid: true, liquidated: true });
        }
        if (['expirado', 'expirada'].includes(venta.estado)) {
            return res.json({ success: true, data: venta, final: true, paid: false, expired: true });
        }
        if (['cancelado', 'cancelada', 'fallido'].includes(venta.estado)) {
            return res.json({ success: true, data: venta, final: true, paid: false, cancelled: true });
        }
        if (!venta.payment_id) {
            return res.json({ success: true, data: venta, final: false, paid: false, message: 'El pago todavía no tiene payment_id' });
        }

        let payment;
        try {
            const r = await axios.get(`${NOWPAYMENTS_API_URL}/${encodeURIComponent(venta.payment_id)}`, {
                headers: { 'x-api-key': NOWPAYMENTS_API_KEY }, timeout: 15000
            });
            payment = r.data;
        } catch (e) {
            logger.error(`NOWPayments payment ${venta.payment_id}: ${e.message}`);
            return res.status(502).json({ success: false, error: 'No fue posible consultar el estado del pago' });
        }

        const estadoNow = String(payment?.payment_status || 'unknown').toLowerCase();
        const payAmount = numeroValido(payment?.pay_amount) ? Number(payment.pay_amount) : 0;
        const payCurrency = payment?.pay_currency || venta.moneda_pago || 'usdt';

        if (['finished', 'confirmed'].includes(estadoNow)) {
            const { error: errReg } = await supabaseAdmin.rpc('registrar_payment_muro', {
                p_venta_id: ventaId, p_payment_id: String(venta.payment_id),
                p_pay_amount: payAmount, p_pay_currency: String(payCurrency), p_payment_status: 'finished'
            });
            if (errReg) logger.warn(`registrar_payment_muro ${ventaId}: ${errReg.message}`);

            const { data: liq, error: errLiq } = await supabaseAdmin.rpc('liquidar_venta_token_muro', { p_venta_id: ventaId });
            if (errLiq) {
                logger.error(`liquidar_venta_token_muro ${ventaId}: ${errLiq.message}`);
                return res.json({ success: true, data: venta, final: true, paid: true, liquidated: false,
                    message: 'Pago confirmado. La liquidación está pendiente de procesamiento.' });
            }
            if (liq && liq.success === false && liq.expired === true) {
                return res.json({ success: true, data: venta, final: true, paid: false, expired: true,
                    message: 'La orden expiró durante el procesamiento del pago' });
            }

            const { data: ventaFinal } = await supabaseAdmin.from('muro_ventas_tokens').select('*').eq('id', ventaId).single();
            return res.json({
                success: true, data: ventaFinal || venta, final: true, paid: true,
                liquidated: liq ? liq.success !== false : true,
                already_processed: liq ? Boolean(liq.already_processed) : false,
                liquidation: liq || null
            });
        }

        if (['failed', 'refunded', 'expired', 'canceled'].includes(estadoNow)) {
            const { error: errCan } = await supabaseAdmin.rpc('cancelar_venta_muro', {
                p_venta_id: ventaId, p_estado: 'cancelado', p_nowpayments_status: estadoNow
            });
            if (errCan) logger.warn(`cancelar_venta_muro ${ventaId}: ${errCan.message}`);
            const { data: ventaFinal } = await supabaseAdmin.from('muro_ventas_tokens').select('*').eq('id', ventaId).single();
            return res.json({ success: true, data: ventaFinal || venta, final: true, paid: false, failed: true, nowpayments_status: estadoNow });
        }

        const { error: errProc } = await supabaseAdmin.rpc('registrar_payment_muro', {
            p_venta_id: ventaId, p_payment_id: String(venta.payment_id),
            p_pay_amount: payAmount, p_pay_currency: String(payCurrency), p_payment_status: estadoNow
        });
        if (errProc) logger.warn(`registrar_payment_muro (proceso) ${ventaId}: ${errProc.message}`);

        const { data: ventaAct } = await supabaseAdmin.from('muro_ventas_tokens').select('*').eq('id', ventaId).single();
        return res.json({ success: true, data: ventaAct || venta, final: false, paid: false, nowpayments_status: estadoNow });
    } catch (e) {
        logger.error(`Error estado Muro: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error verificando el estado del pago' });
    }
});

// ================================================================
// GET /api/payments/marketing/status/:pagoId
// ================================================================
router.get('/marketing/status/:pagoId', verificarToken, async (req, res) => {
    try {
        const pagoId = req.params.pagoId;
        const userId = req.usuario.id;
        if (!pagoId) return respuestaError(res, 400, 'pagoId inválido');
        if (!NOWPAYMENTS_API_KEY) return respuestaError(res, 500, 'Servicio de pagos no configurado');

        const { data: pago, error: errP } = await supabaseAdmin
            .from('marketing_pagos').select('*').eq('id', pagoId).eq('anunciante_id', userId).maybeSingle();
        if (errP) throw errP;
        if (!pago) return respuestaError(res, 404, 'Pago no encontrado');

        if (pago.estado === 'pagado') return res.json({ success: true, data: pago, final: true, paid: true });
        if (!pago.payment_id) return res.json({ success: true, data: pago, final: false, paid: false, message: 'El pago todavía no tiene payment_id' });

        let payment;
        try {
            const r = await axios.get(`${NOWPAYMENTS_API_URL}/${encodeURIComponent(pago.payment_id)}`, {
                headers: { 'x-api-key': NOWPAYMENTS_API_KEY }, timeout: 15000
            });
            payment = r.data;
        } catch (e) {
            logger.error(`NOWPayments payment ${pago.payment_id}: ${e.message}`);
            return res.status(502).json({ success: false, error: 'No fue posible consultar el estado del pago' });
        }

        const estadoNow = String(payment?.payment_status || 'unknown').toLowerCase();
        const pagado = estadoNow === 'finished';
        const fallido = ['failed', 'refunded', 'expired'].includes(estadoNow);

        let estadoLocal = 'pendiente';
        if (pagado) estadoLocal = 'pagado';
        else if (fallido) estadoLocal = 'cancelado';
        else if (['confirming', 'sending'].includes(estadoNow)) estadoLocal = 'confirmando';

        const { data: actualizado, error: errU } = await supabaseAdmin
            .from('marketing_pagos')
            .update({ nowpayments_status: estadoNow, estado: estadoLocal })
            .eq('id', pago.id).eq('anunciante_id', userId).select().single();
        if (errU) throw errU;

        if (pagado) {
            const { error: errAct } = await supabaseAdmin.rpc('activar_campana_marketing', { p_campaign_id: pago.campaign_id });
            if (errAct) {
                logger.error(`activar_campana_marketing ${pago.campaign_id}: ${errAct.message}`);
                return res.json({ success: true, data: actualizado, final: true, paid: true, activated: false,
                    message: 'Pago confirmado. La activación está pendiente de procesamiento.' });
            }
            return res.json({ success: true, data: actualizado, final: true, paid: true, activated: true });
        }
        return res.json({ success: true, data: actualizado, final: fallido, paid: false, failed: fallido });
    } catch (e) {
        logger.error(`Error estado Marketing: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error verificando el estado del pago' });
    }
});

// ================================================================
// GET /api/payments/internet/status/:ordenId
// Consulta NOWPayments y, si está pagado, activa la orden y aprovisiona la eSIM.
// ================================================================
router.get('/internet/status/:ordenId', verificarToken, async (req, res) => {
    try {
        const ordenId = req.params.ordenId;
        const userId = req.usuario.id;
        if (!ordenId) return respuestaError(res, 400, 'ordenId inválido');
        if (!NOWPAYMENTS_API_KEY) return respuestaError(res, 500, 'Servicio de pagos no configurado');

        const { data: orden, error: errO } = await supabaseAdmin
            .from('ordenes_internet').select('*').eq('id', ordenId).eq('usuario_id', userId).maybeSingle();
        if (errO) throw errO;
        if (!orden) return respuestaError(res, 404, 'Orden no encontrada');

        if (orden.estado === 'activo') {
            return res.json({ success: true, data: orden, final: true, paid: true, activated: true });
        }
        if (orden.estado === 'cancelado') {
            return res.json({ success: true, data: orden, final: true, paid: false, failed: true });
        }
        if (!orden.payment_id) {
            return res.json({ success: true, data: orden, final: false, paid: false, message: 'La orden todavía no tiene payment_id' });
        }

        let payment;
        try {
            const r = await axios.get(`${NOWPAYMENTS_API_URL}/${encodeURIComponent(orden.payment_id)}`, {
                headers: { 'x-api-key': NOWPAYMENTS_API_KEY }, timeout: 15000
            });
            payment = r.data;
        } catch (e) {
            logger.error(`NOWPayments payment ${orden.payment_id}: ${e.message}`);
            return res.status(502).json({ success: false, error: 'No fue posible consultar el estado del pago' });
        }

        const estadoNow = String(payment?.payment_status || 'unknown').toLowerCase();
        const pagado = estadoNow === 'finished';
        const nuevoEstado = estadoInternetLocal(estadoNow, orden.estado);

        const updates = { nowpayments_status: estadoNow, estado: nuevoEstado, updated_at: new Date().toISOString() };
        if (pagado) updates.pagado_en = orden.pagado_en || new Date().toISOString();

        const { data: actualizada, error: errU } = await supabaseAdmin
            .from('ordenes_internet').update(updates).eq('id', orden.id).eq('usuario_id', userId).select().single();
        if (errU) throw errU;

        if (!pagado) {
            return res.json({
                success: true, data: actualizada, final: nuevoEstado === 'cancelado', paid: false,
                failed: nuevoEstado === 'cancelado'
            });
        }

        const { error: errAct } = await supabaseAdmin.rpc('activar_orden_internet', { p_orden_id: orden.id });
        if (errAct) {
            logger.error(`activar_orden_internet ${orden.id}: ${errAct.message}`);
            return res.json({ success: true, data: actualizada, final: true, paid: true, activated: false,
                message: 'Pago confirmado. La activación está pendiente de procesamiento.' });
        }

        // Aprovisionamiento en segundo plano (idempotente). El webhook también lo reintenta.
        procesarOrdenInternet(orden.id).catch((e) =>
            logger.error(`aprovisionamiento eSIM ${orden.id}: ${e.message}`)
        );

        const { data: final } = await supabaseAdmin.from('ordenes_internet').select('*').eq('id', orden.id).single();
        return res.json({ success: true, data: final || actualizada, final: true, paid: true, activated: true });
    } catch (e) {
        logger.error(`Error estado Internet: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error verificando el estado del pago' });
    }
});

// ================================================================
// GET /api/payments/history  (transmisiones)
// ================================================================
router.get('/history', verificarToken, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('pagos_transmision')
            .select('*')
            .eq('espectador_id', req.usuario.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return res.json({ success: true, data: data || [] });
    } catch (e) {
        logger.error(`Error historial: ${e.message}`);
        return res.status(500).json({ success: false, error: 'Error obteniendo historial de pagos' });
    }
});

// ================================================================
// GET /api/payments/health
// ================================================================
router.get('/health', (req, res) => {
    res.json({ success: true, modulo: 'payments', nowpayments_configurado: Boolean(NOWPAYMENTS_API_KEY) });
});

module.exports = router;