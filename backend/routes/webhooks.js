/* ================================================================
   UTILS/NOWPAYMENTS-SIG.JS - SARIEL'S ECOSYSTEM
   Verificación de firma IPN de NOWPayments

   Reglas de NOWPayments:
   - Algoritmo: HMAC-SHA512 con el IPN secret
   - Se firma el JSON del body con las llaves ordenadas
     alfabéticamente (de forma recursiva)
   - La firma llega en el header x-nowpayments-sig

   Se acepta también la firma sobre el body crudo (rawBody) como
   respaldo, porque si NOWPayments ya lo manda ordenado, el JSON
   re-serializado puede diferir en formato de números.
   ================================================================ */

const crypto = require('crypto');

function ordenarLlaves(valor) {
    if (Array.isArray(valor)) {
        return valor.map(ordenarLlaves);
    }

    if (valor && typeof valor === 'object') {
        return Object.keys(valor)
            .sort()
            .reduce((acc, llave) => {
                acc[llave] = ordenarLlaves(valor[llave]);
                return acc;
            }, {});
    }

    return valor;
}

function firmaHex(contenido, secret) {
    return crypto
        .createHmac('sha512', secret)
        .update(contenido)
        .digest('hex');
}

function compararSeguro(esperadaHex, recibida) {
    if (typeof recibida !== 'string' || !/^[0-9a-f]+$/i.test(recibida)) {
        return false;
    }

    const a = Buffer.from(esperadaHex, 'hex');
    const b = Buffer.from(recibida.toLowerCase(), 'hex');

    if (a.length !== b.length) {
        return false;
    }

    return crypto.timingSafeEqual(a, b);
}

/**
 * @param {object} body          req.body (ya parseado)
 * @param {Buffer|string} rawBody req.rawBody (opcional, respaldo)
 * @param {string} firmaRecibida header x-nowpayments-sig
 * @param {string} secret        NOWPAYMENTS_IPN_SECRET
 * @returns {boolean}
 */
function verificarFirmaNowPayments(body, rawBody, firmaRecibida, secret) {
    if (!secret || !firmaRecibida || !body || typeof body !== 'object') {
        return false;
    }

    // 1) Método oficial: JSON con llaves ordenadas
    const ordenado = JSON.stringify(ordenarLlaves(body));

    if (compararSeguro(firmaHex(ordenado, secret), firmaRecibida)) {
        return true;
    }

    // 2) Respaldo: body crudo tal como llegó
    if (rawBody) {
        const crudo = Buffer.isBuffer(rawBody)
            ? rawBody
            : Buffer.from(String(rawBody));

        return compararSeguro(firmaHex(crudo, secret), firmaRecibida);
    }

    return false;
}

module.exports = {
    verificarFirmaNowPayments,
    ordenarLlaves
};
