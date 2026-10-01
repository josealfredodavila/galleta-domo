// backend/routes/telnyx-webhook.js
// POST /api/telnyx/webhook  — eSIM/datos + Call Control, con firma Ed25519.
// IMPORTANTE: debe montarse ANTES de express.json() y del rate limit (ver server.js).
const express = require('express');
const { verificarFirmaTelnyx } = require('../services/telnyx/firma');
const { sincronizarPorSimId } = require('../services/telnyx/esim');
const { manejarEventoLlamada } = require('../services/telnyx/callControl');

const router = express.Router();

function extraerSimId(evento) {
  const d = evento?.data || {};
  const p = d.payload || {};
  return p.sim_card_id || d.sim_card_id || (String(d.event_type || d.type || '').startsWith('sim_card') ? (d.id || p.id) : null) || null;
}

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = req.body; // Buffer
  let ok = false;
  try { ok = verificarFirmaTelnyx(raw, req.headers); }
  catch (e) { console.error('[telnyx] verificación imposible:', e.message); return res.status(500).json({ success: false, error: 'config' }); }
  if (!ok) return res.status(401).json({ success: false, error: 'firma inválida' });

  let evento;
  try { evento = JSON.parse(raw.toString('utf8')); }
  catch { return res.status(400).json({ success: false, error: 'json inválido' }); }

  res.status(200).json({ success: true }); // responder rápido; Telnyx reintenta si tarda

  try {
    const tipo = String(evento?.data?.event_type || evento?.type || '');
    console.log('[telnyx] evento', tipo);

    if (tipo.startsWith('call.')) return await manejarEventoLlamada(evento);

    // Cualquier evento de SIM (estado, límite de datos, notificación de consumo): re-sincronizar desde la API
    const simId = extraerSimId(evento);
    if (simId) await sincronizarPorSimId(simId);
  } catch (e) {
    console.error('[telnyx] error procesando evento:', e.message);
  }
});

module.exports = router;
