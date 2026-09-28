// ================================================================
// UTILS/NOWPAYMENTS-SIG.JS
// VERIFICACIÓN DE FIRMA HMAC-SHA512 PARA WEBHOOKS DE NOWPAYMENTS
// ================================================================
// NowPayments envía webhooks con firma HMAC-SHA512 en el header
// x-nowpayments-sig. Esta utilidad verifica que la firma sea válida.
// ================================================================

'use strict';

const crypto = require('crypto');

/**
 * Verifica la firma HMAC-SHA512 de un webhook de NowPayments
 * @param {Object} payload - Objeto JSON parseado del body
 * @param {Buffer} rawBody - Body sin parsear como Buffer
 * @param {String} signature - Firma recibida en header (hex)
 * @param {String} secret - Secret de NowPayments IPN
 * @returns {Boolean} true si la firma es válida, false si no
 */
function verificarFirmaNowPayments(payload, rawBody, signature, secret) {
    if (!signature || !secret || !rawBody) {
        return false;
    }

    try {
        // Calcular HMAC-SHA512 sobre el rawBody
        const firmaCalculada = crypto
            .createHmac('sha512', secret)
            .update(rawBody, 'utf8')
            .digest('hex');

        // Comparación timing-safe para evitar timing attacks
        const bufRecibida = Buffer.from(signature, 'hex');
        const bufCalculada = Buffer.from(firmaCalculada, 'hex');

        if (bufRecibida.length !== bufCalculada.length) {
            return false;
        }

        // timingSafeEqual lanza error si los buffers tienen tamaño diferente
        // pero ya lo verificamos arriba
        return crypto.timingSafeEqual(bufRecibida, bufCalculada);

    } catch (error) {
        console.error('[NowPayments Sig] Error verificando firma:', error.message);
        return false;
    }
}

module.exports = {
    verificarFirmaNowPayments
};