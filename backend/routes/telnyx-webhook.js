// backend/routes/telnyx-webhook.js
// POST /api/telnyx/webhook
// Eventos de eSIM (sincronización desde la API de Telnyx), llamadas y WhatsApp.
// La firma se verifica ANTES de procesar. Se responde 200 de inmediato;
// el procesamiento es idempotente, así que los reintentos de Telnyx son seguros.
//
// IMPORTANTE: debe montarse ANTES de express.json() (ver server.js), para
// que el cuerpo llegue crudo y la firma pueda verificarse.

'use strict';

const express = require('express');
const { verificarFirmaTelnyx } = require('../services/telnyx/firma');
const { sincronizarPorSimId } = require('../services/telnyx/esim');
const logger = require('../utils/logger');

// Módulos opcionales: si no existen, el resto del webhook sigue funcionando.
function cargarOpcional(ruta) {
  try {
    return require(ruta);
  } catch (e) {
    logger.warn(`[telnyx-webhook] módulo opcional no disponible (${ruta}): ${e.code || e.message}`);
    return null;
  }
}

const callControl = cargarOpcional('../services/telnyx/callControl');
const marquinhosWa = cargarOpcional('../services/marquinhos-whatsapp');

const router = express.Router();

// Id de SIM contenido en el evento. El valor real se confirma con la API,
// así que un id equivocado solo produce un "no encontrado" inofensivo.
function extraerSimId(evento) {
  const d = (evento && evento.data) || {};
  const p = d.payload || {};
  const tipo = String(d.event_type || '');
  const registro = String(d.record_type || p.record_type || '');

  const esSim = tipo.startsWith('sim_card') || registro === 'sim_card';
  if (!esSim) return null;

  return p.sim_card_id || p.id || d.id || null;
}

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = req.body;

  if (!Buffer.isBuffer(raw)) {
    return res.status(400).json({ success: false, error: 'cuerpo inválido' });
  }

  let firmaValida = false;
  try {
    firmaValida = verificarFirmaTelnyx(raw, req.headers);
  } catch (e) {
    // Configuración incompleta: no se procesa nada y Telnyx reintentará.
    logger.error(`[telnyx-webhook] verificación no disponible: ${e.message}`);
    return res.status(500).json({ success: false, error: 'configuración' });
  }

  if (!firmaValida) {
    logger.warn('[telnyx-webhook] firma inválida o timestamp fuera de rango');
    return res.status(401).json({ success: false, error: 'firma inválida' });
  }

  let evento;
  try {
    evento = JSON.parse(raw.toString('utf8'));
  } catch (_) {
    return res.status(400).json({ success: false, error: 'json inválido' });
  }

  // Responder antes de procesar, para no hacer esperar a Telnyx.
  res.status(200).json({ success: true });

  try {
    const tipo = String((evento && evento.data && evento.data.event_type) || (evento && evento.type) || '');
    logger.info(`[telnyx-webhook] evento ${tipo || '(sin tipo)'}`);

    if (marquinhosWa && typeof marquinhosWa.esMensajeWhatsApp === 'function'
        && marquinhosWa.esMensajeWhatsApp(evento)) {
      return await marquinhosWa.manejarMensajeWhatsApp(evento);
    }

    if (tipo.startsWith('call.')) {
      if (callControl && typeof callControl.manejarEventoLlamada === 'function') {
        return await callControl.manejarEventoLlamada(evento);
      }
      logger.warn(`[telnyx-webhook] evento de llamada ignorado (callControl no disponible): ${tipo}`);
      return;
    }

    const simId = extraerSimId(evento);
    if (simId) {
      await sincronizarPorSimId(String(simId));
    }
  } catch (e) {
    logger.error(`[telnyx-webhook] error procesando evento: ${e.message}`);
  }
});

module.exports = router;