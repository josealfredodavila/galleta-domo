// backend/services/telnyx/client.js
// Cliente mínimo para la API REST v2 de Telnyx (Node 18+ trae fetch nativo).
const BASE = 'https://api.telnyx.com/v2';

async function telnyx(method, path, body) {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error('TELNYX_API_KEY no configurada');

  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const texto = await res.text();
  let data = texto;
  try { data = JSON.parse(texto); } catch (_) { /* algunas rutas (token WebRTC) devuelven texto plano */ }

  if (!res.ok) {
    const detalle = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || texto.slice(0, 200);
    const err = new Error(`Telnyx ${method} ${path} → ${res.status}: ${detalle}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = { telnyx };
