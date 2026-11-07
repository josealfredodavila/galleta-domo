// backend/services/telnyx/firma.js
// Verificación de firma de los webhooks de Telnyx (Ed25519).
// Headers: telnyx-signature-ed25519 (base64) y telnyx-timestamp (segundos Unix).
// Mensaje firmado: "<telnyx-timestamp>|<cuerpo crudo>".
// Llave: TELNYX_PUBLIC_KEY (base64 de 32 bytes). Portal Telnyx →
//        Account Settings → Keys & Credentials → Public Key.
//
// Devuelve true solo si la firma es válida y el timestamp está dentro de
// la tolerancia. Lanza error si la configuración es inválida, para que la
// ruta responda 500 y el problema quede en los logs (no 401 silencioso).

'use strict';

const crypto = require('crypto');

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const TOLERANCIA_SEG = 300;

let llaveCacheada = null;
let llaveCacheadaB64 = null;

function llaveDesdeBase64(b64) {
  if (llaveCacheada && llaveCacheadaB64 === b64) return llaveCacheada;

  const cruda = Buffer.from(b64, 'base64');
  if (cruda.length !== 32) {
    throw new Error('TELNYX_PUBLIC_KEY debe ser una llave Ed25519 de 32 bytes en base64');
  }

  llaveCacheada = crypto.createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, cruda]),
    format: 'der',
    type: 'spki',
  });
  llaveCacheadaB64 = b64;
  return llaveCacheada;
}

function verificarFirmaTelnyx(rawBody, headers) {
  const publicKeyB64 = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKeyB64) throw new Error('TELNYX_PUBLIC_KEY no configurada');

  const firma = headers['telnyx-signature-ed25519'];
  const timestamp = headers['telnyx-timestamp'];

  if (!firma || !timestamp || !Buffer.isBuffer(rawBody)) return false;

  // Validar que el timestamp sea un número real. Con NaN la comparación
  // de tolerancia sería falsa y el chequeo de replay se saltaría.
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos)) return false;

  const ahora = Math.floor(Date.now() / 1000);
  if (Math.abs(ahora - segundos) > TOLERANCIA_SEG) return false;

  let sig;
  try {
    sig = Buffer.from(String(firma), 'base64');
  } catch (_) {
    return false;
  }

  const mensaje = Buffer.concat([Buffer.from(String(timestamp) + '|', 'utf8'), rawBody]);

  // Errores de configuración (llave mal formada) se lanzan a propósito.
  return crypto.verify(null, mensaje, llaveDesdeBase64(publicKeyB64), sig);
}

module.exports = { verificarFirmaTelnyx };