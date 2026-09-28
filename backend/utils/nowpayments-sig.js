// ================================================================
// UTILS/NOWPAYMENTS-SIG.JS
// VERIFICACIÓN DE FIRMA HMAC-SHA512 PARA WEBHOOKS DE NOWPAYMENTS
// ================================================================
// NOWPayments envía los webhooks con un header 'x-nowpayments-sig'
// que contiene el HMAC-SHA512 del cuerpo JSON ordenado alfabéticamente,
// firmado con tu IPN Secret Key.
//
// Docs: https://documenter.getpostman.com/view/7907941/S1a32n38#b3d1e2f4
// ================================================================

'use strict';

const crypto = require('crypto');

/**
 * Ordena recursivamente las claves de un objeto de forma alfabética.
 * NOWPayments firma el JSON con las claves ordenadas, así que esto es
 * obligatorio para que la firma coincida.
 *
 * @param {*} value - Valor a ordenar (objeto, array o primitivo)
 * @returns {*} El mismo valor con las claves ordenadas
 */
function ordenarClavesRecursivo(value) {
    if (Array.isArray(value)) {
        return value.map(ordenarClavesRecursivo);
    }

    if (value !== null && typeof value === 'object') {
        const resultado = {};
        const claves = Object.keys(value).sort();
        for (const clave of claves) {
            resultado[clave] = ordenarClavesRecursivo(value[clave]);
        }
        return resultado;
    }

    return value;
}

/**
 * Genera la firma HMAC-SHA512 a partir de un payload y un secret.
 * Útil para tests y para debug.
 *
 * @param {Object} payload - Objeto del webhook
 * @param {string} secretKey - IPN Secret Key de NOWPayments
 * @returns {string} Firma en hexadecimal
 */
function generarFirmaNowPayments(payload, secretKey) {
    if (!payload || !secretKey) {
        throw new Error('generarFirmaNowPayments: payload y secretKey son obligatorios');
    }

    const payloadOrdenado = ordenarClavesRecursivo(payload);
    const jsonString = JSON.stringify(payloadOrdenado);

    return crypto
        .createHmac('sha512', secretKey)
        .update(jsonString, 'utf8')
        .digest('hex');
}

/**
 * Verifica la firma HMAC-SHA512 enviada por NOWPayments en sus webhooks.
 *
 * @param {Object|Buffer|string} payload - El cuerpo del webhook (req.body).
 *                                          Si es Buffer/string, se parsea a JSON.
 * @param {Buffer|string} [rawBody] - El cuerpo crudo (opcional, no usado pero
 *                                     conservado por compatibilidad de firma).
 * @param {string} signature - La firma recibida en header 'x-nowpayments-sig'.
 * @param {string} secretKey - Tu IPN Secret Key de NOWPayments.
 * @returns {boolean} True si la firma es válida, False en caso contrario.
 */
function verificarFirmaNowPayments(payload, rawBody, signature, secretKey) {
    // --- Validaciones básicas ---
    if (!secretKey) {
        console.error('[NowPayments Sig] ❌ Falta NOWPAYMENTS_IPN_SECRET');
        return false;
    }

    if (!signature) {
        console.error('[NowPayments Sig] ❌ Falta header x-nowpayments-sig');
        return false;
    }

    if (!payload) {
        console.error('[NowPayments Sig] ❌ Payload vacío');
        return false;
    }

    try {
        // --- Normalizar payload ---
        let dataToSign = payload;

        // Si viene como Buffer o string, parseamos a objeto
        if (Buffer.isBuffer(payload)) {
            dataToSign = JSON.parse(payload.toString('utf8'));
        } else if (typeof payload === 'string') {
            dataToSign = JSON.parse(payload);
        }

        // --- Calcular firma esperada ---
        const firmaCalculada = generarFirmaNowPayments(dataToSign, secretKey);

        // --- Comparación timing-safe ---
        const bufRecibida = Buffer.from(String(signature), 'hex');
        const bufCalculada = Buffer.from(firmaCalculada, 'hex');

        if (bufRecibida.length !== bufCalculada.length) {
            console.error('[NowPayments Sig] ❌ Firma con longitud inválida');
            return false;
        }

        const esValida = crypto.timingSafeEqual(bufRecibida, bufCalculada);

        if (!esValida) {
            console.error('[NowPayments Sig] ❌ Firma NO coincide');
        }

        return esValida;
    } catch (error) {
        console.error('[NowPayments Sig] ❌ Error verificando firma:', error.message);
        return false;
    }
}

module.exports = {
    verificarFirmaNowPayments,
    generarFirmaNowPayments,
    ordenarClavesRecursivo
};