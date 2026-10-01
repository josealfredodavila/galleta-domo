// backend/services/telnyx/firma.js
// Telnyx firma sus webhooks con Ed25519 (NO con un secreto compartido).
// Headers: telnyx-signature-ed25519 + telnyx-timestamp. Mensaje firmado: "<timestamp>|<body crudo>".
// Requiere la variable TELNYX_PUBLIC_KEY (Portal Telnyx → Account Settings → Keys & Credentials → Public Key).
const crypto = require('crypto');

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const TOLERANCIA_SEG = 300;

function verificarFirmaTelnyx(rawBody, headers) {
  const publicKeyB64 = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKeyB64) throw new Error('TELNYX_PUBLIC_KEY no configurada');

  const firma = headers['telnyx-signature-ed25519'];
  const timestamp = headers['telnyx-timestamp'];
  if (!firma || !timestamp) return false;

  const ahora = Math.floor(Date.now() / 1000);
  if (Math.abs(ahora - Number(timestamp)) > TOLERANCIA_SEG) return false;

  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyB64, 'base64')]),
      format: 'der',
      type: 'spki',
    });
    const mensaje = Buffer.concat([Buffer.from(`${timestamp}|`), rawBody]);
    return crypto.verify(null, mensaje, key, Buffer.from(firma, 'base64'));
  } catch (e) {
    return false;
  }
}

module.exports = { verificarFirmaTelnyx };
