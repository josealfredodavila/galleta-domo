// backend/services/telnyx/client.js
// Cliente HTTP de Telnyx. Devuelve el JSON COMPLETO de la respuesta
// (con la propiedad "data" intacta). Lanza ErrorTelnyx en cualquier fallo.

'use strict';

const TELNYX_BASE = 'https://api.telnyx.com/v2';
const TIMEOUT_MS = 20000;

class ErrorTelnyx extends Error {
  constructor(mensaje, status, reintentable) {
    super(mensaje);
    this.name = 'ErrorTelnyx';
    this.status = status || 0;
    this.reintentable = reintentable === true;
  }
}

async function telnyx(metodo, ruta, cuerpo) {
  const clave = process.env.TELNYX_API_KEY;
  if (!clave) throw new ErrorTelnyx('TELNYX_API_KEY no configurada', 0, true);

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(TELNYX_BASE + ruta, {
      method: metodo,
      headers: {
        'Authorization': 'Bearer ' + clave,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: controlador.signal,
    });
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Telnyx no respondió a tiempo' : e.message;
    throw new ErrorTelnyx(msg, 0, true);
  } finally {
    clearTimeout(temporizador);
  }

  const texto = await resp.text();
  let json = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch (_) {
    json = {};
  }

  if (!resp.ok) {
    const detalle = (json.errors && json.errors[0] && json.errors[0].detail) || ('HTTP ' + resp.status);
    // 429 y 5xx son temporales; el resto son errores de la solicitud.
    const reintentable = resp.status === 429 || resp.status >= 500;
    console.error(`[telnyx] ${metodo} ${ruta} -> ${resp.status}: ${detalle}`);
    throw new ErrorTelnyx(detalle, resp.status, reintentable);
  }

  return json; // JSON completo: { data: ... }
}

module.exports = { telnyx, ErrorTelnyx };