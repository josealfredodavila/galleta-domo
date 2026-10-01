// backend/services/telnyx/callControl.js
// Voice Call Control: responde a eventos de llamada de la Voice App (TELNYX_VOICE_APP_ID).
const { telnyx } = require('./client');

const E164 = /^\+[1-9]\d{6,14}$/;
// Anti-fraude: prefijos permitidos para llamadas salientes. Ej: "+52,+57,+56,+54,+51,+593,+1"
const PREFIJOS = (process.env.TELNYX_ALLOWED_PREFIXES || '+52').split(',').map(s => s.trim()).filter(Boolean);

function destinoPermitido(to) {
  return E164.test(to) && PREFIJOS.some(p => to.startsWith(p));
}

async function manejarEventoLlamada(evento) {
  const tipo = evento?.data?.event_type;
  const p = evento?.data?.payload || {};
  const id = p.call_control_id;
  if (!tipo || !id) return;

  switch (tipo) {
    case 'call.initiated': {
      if (p.direction !== 'incoming') return; // las patas salientes las crea Telnyx
      await telnyx('POST', `/calls/${id}/actions/answer`);
      break;
    }
    case 'call.answered': {
      // Llamada que sale desde el cliente WebRTC: p.from = usuario SIP, p.to = número destino
      if (p.direction !== 'incoming') return;
      const to = String(p.to || '');
      if (to.startsWith('sip:')) return; // llamada interna entre clientes: Telnyx la enruta sola
      if (!destinoPermitido(to) || !process.env.TELNYX_CALLER_ID) {
        await telnyx('POST', `/calls/${id}/actions/hangup`);
        console.warn('[telnyx] destino bloqueado o sin caller id:', to);
        return;
      }
      await telnyx('POST', `/calls/${id}/actions/transfer`, { to, from: process.env.TELNYX_CALLER_ID });
      break;
    }
    case 'call.hangup':
      console.log('[telnyx] llamada terminada', id, p.hangup_cause || '');
      break;
    default:
      break;
  }
}

module.exports = { manejarEventoLlamada };
