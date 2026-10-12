// ================================================================
// UTILS/NOWPAYMENTS-SIG.JS
// Verificación de firma HMAC-SHA512 de los IPN de NOWPayments.
// Método oficial: JSON con llaves ordenadas (recursivo) → HMAC-SHA512.
// Respaldo: HMAC sobre el cuerpo crudo, si está disponible.
// ================================================================

'use strict';

const crypto = require('crypto');

const FIRMA_HEX_RE = /^[0-9a-f]{128}$/i;

// Ordena las llaves de forma recursiva, como exige NOWPayments
function ordenarLlaves(valor) {
    if (Array.isArray(valor)) return valor.map(ordenarLlaves);
    if (valor && typeof valor === 'object') {
        const ordenado = {};
        for (const k of Object.keys(valor).sort()) {
            ordenado[k] = ordenarLlaves(valor[k]);
        }
        return ordenado;
    }
    return valor;
}

function hmacHex(texto, secret) {
    return crypto.createHmac('sha512', secret).update(texto, 'utf8').digest('hex');
}

function firmasIguales(firmaRecibida, firmaCalculada) {
    const a = Buffer.from(firmaRecibida, 'hex');
    const b = Buffer.from(firmaCalculada, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {Object} payload  - body ya parseado (JSON)
 * @param {Buffer|string} rawBody - body crudo (opcional, respaldo)
 * @param {string} signature - valor del header x-nowpayments-sig
 * @param {string} secret    - IPN secret de NOWPayments
 * @returns {boolean}
 */
function verificarFirmaNowPayments(payload, rawBody, signature, secret) {
    if (!signature || !secret || payload == null) return false;

    const firma = String(signature).trim().toLowerCase();
    if (!FIRMA_HEX_RE.test(firma)) return false;

    try {
        // 1) Método oficial: JSON con llaves ordenadas
        const canonico = JSON.stringify(ordenarLlaves(payload));
        if (firmasIguales(firma, hmacHex(canonico, secret))) return true;

        // 2) Respaldo: cuerpo crudo (solo si el servidor lo capturó)
        if (rawBody && (Buffer.isBuffer(rawBody) || typeof rawBody === 'string')) {
            const texto = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
            if (firmasIguales(firma, hmacHex(texto, secret))) return true;
        }

        return false;
    } catch (error) {
        console.error('[NOWPayments Sig] Error verificando firma:', error.message);
        return false;
    }
}

module.exports = { verificarFirmaNowPayments, ordenarLlaves };