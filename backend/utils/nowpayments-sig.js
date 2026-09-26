// ================================================================
// UTILS/NOWPAYMENTS-SIG.JS - VERIFICACIÓN DE FIRMA HMAC-SHA512
// ================================================================
const crypto = require('crypto');

/**
 * Verifica la firma HMAC-SHA512 enviada por NOWPayments en sus webhooks.
 *
 * @param {Object} payload - El objeto req.body recibido en el webhook.
 * @param {Buffer|string} [rawBody] - El cuerpo crudo si está disponible.
 * @param {string} signature - La firma recibida en los headers ('x-nowpayments-sig').
 * @param {string} secretKey - Tu IPN Secret Key de NOWPayments.
 * @returns {boolean} True si la firma es válida, False en caso contrario.
 */
function verificarFirmaNowPayments(payload, rawBody, signature, secretKey) {
  if (!secretKey || !signature) {
    return false;
  }

  try {
    // Si no se pasa payload o es un objeto vacío, no se puede validar
    const dataToSign = payload || {};

    // NOWPayments exige ordenar las llaves del objeto alfabéticamente
    const sortedKeys = Object.keys(dataToSign).sort();
    const sortedPayload = {};
    
    for (const key of sortedKeys) {
      sortedPayload[key] = dataToSign[key];
    }

    // Convertir el objeto ordenado a cadena JSON
    const jsonString = JSON.stringify(sortedPayload);

    // Generar HMAC con SHA-512
    const hmac = crypto.createHmac('sha512', secretKey);
    hmac.update(jsonString);
    const calculatedSignature = hmac.digest('hex');

    return calculatedSignature === signature;
  } catch (error) {
    console.error('❌ Error interno al verificar la firma de NOWPayments:', error);
    return false;
  }
}

module.exports = {
  verificarFirmaNowPayments
};
