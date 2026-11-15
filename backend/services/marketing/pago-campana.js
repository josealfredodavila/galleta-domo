// ================================================================
// services/marketing/pago-campana.js — Csariel's
// Crea el pago en NOWPayments (/v1/payment) para una campaña.
// /v1/payment NO devuelve payment_url: devuelve pay_address y pay_amount,
// que es lo que el usuario necesita para pagar. Por eso el frontend
// muestra la dirección, el monto y la red (no un enlace).
// ================================================================

'use strict';

const axios = require('axios');

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1/payment';

async function crearPagoNowPayments({ pagoId, payCurrency, montoMxn, descripcion }) {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
        throw Object.assign(new Error('Servicio de pagos no configurado'), { codigo: 'config' });
    }

    const orderId = `MKT-${pagoId}`;

    let respuesta;
    try {
        respuesta = await axios.post(NOWPAYMENTS_API_URL, {
            price_amount: Number(montoMxn),
            price_currency: 'mxn',
            pay_currency: payCurrency,
            order_id: orderId,
            order_description: descripcion
        }, {
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            timeout: 15000
        });
    } catch (e) {
        throw Object.assign(new Error('NOWPayments no respondió correctamente'), {
            codigo: 'np_http',
            detalle: e.response?.data || e.message
        });
    }

    const d = respuesta.data || {};
    if (!d.payment_id || !d.pay_address) {
        throw Object.assign(new Error('NOWPayments no devolvió dirección de pago'), {
            codigo: 'np_respuesta',
            detalle: d
        });
    }

    return {
        orderId,
        payment_id: String(d.payment_id),
        pay_address: d.pay_address,
        pay_amount: Number(d.pay_amount) || null,
        pay_currency: d.pay_currency || payCurrency,
        payment_status: d.payment_status || 'waiting'
    };
}

module.exports = { crearPagoNowPayments };
