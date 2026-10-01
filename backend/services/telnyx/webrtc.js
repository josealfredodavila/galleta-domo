// backend/services/telnyx/webrtc.js
// Client Tokens (JWT) para WebRTC. Se reutiliza 1 credencial por usuario (tag u:<id>), sin tocar Supabase.
const { telnyx } = require('./client');

async function obtenerTokenWebrtc(usuarioId) {
  const connectionId = process.env.TELNYX_SIP_CONNECTION_ID;
  if (!connectionId) throw new Error('TELNYX_SIP_CONNECTION_ID no configurada');
  const tag = `u:${usuarioId}`;

  // Buscar credencial existente del usuario
  const lista = await telnyx('GET', `/telephony_credentials?filter[tag]=${encodeURIComponent(tag)}&page[size]=1`);
  let cred = lista?.data?.[0];

  if (!cred) {
    const nueva = await telnyx('POST', '/telephony_credentials', {
      connection_id: connectionId,
      name: `sariels-${usuarioId}`,
      tag,
    });
    cred = nueva.data;
  }

  // La respuesta del token es texto plano (JWT)
  const token = await telnyx('POST', `/telephony_credentials/${cred.id}/token`);
  return typeof token === 'string' ? token : token?.data;
}

module.exports = { obtenerTokenWebrtc };
