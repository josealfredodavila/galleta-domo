// backend/routes/telnyx.js
// Rutas autenticadas, montadas en /api/telnyx (server.js).
// El aprovisionamiento NO se pide desde aquí: ocurre solo cuando se
// confirma el pago de un paquete de internet (nowpayments-internet.js).
//
// Endpoints:
//   GET  /api/telnyx/esim/mia       estado, código de activación, saldo y consumo
//   POST /api/telnyx/esim/sync      refresca el consumo (máximo una vez por minuto)
//   POST /api/telnyx/esim/reemplazar cambio de celular (conserva los gigas restantes)

'use strict';

const express = require('express');
const { supabaseAdmin } = require('../services/telnyx/supabase');
const { asegurarFila, sincronizarFila, reemplazarEsim, vistaEsim } = require('../services/telnyx/esim');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const SYNC_COOLDOWN_MS = 60 * 1000;

// Cambios de eSIM en curso por usuario (una sola instancia). Evita dobles clics.
const reemplazosEnCurso = new Set();

// Errores de negocio que se devuelven tal cual al frontend.
// 503: eSIM deshabilitada. 409: operación en curso. 429: límite de cambios. 404: sin eSIM.
const ERRORES_CONTROLADOS = [404, 409, 429, 503];

// GET /api/telnyx/esim/mia
router.get('/esim/mia', verificarToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('esims_usuario')
      .select('*')
      .eq('usuario_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    return res.json({ success: true, data: vistaEsim(data) });
  } catch (e) {
    logger.error(`[telnyx] esim/mia: ${e.message}`);
    return res.status(500).json({ success: false, error: 'Error consultando tu eSIM' });
  }
});

// POST /api/telnyx/esim/sync
// Reclamo atómico del turno: solo una petición gana dentro de la ventana de cooldown.
router.post('/esim/sync', verificarToken, async (req, res) => {
  try {
    const fila = await asegurarFila(req.user.id);

    const corte = new Date(Date.now() - SYNC_COOLDOWN_MS).toISOString();
    const { data: reclamada, error } = await supabaseAdmin
      .from('esims_usuario')
      .update({ ultimo_sync_at: new Date().toISOString() })
      .eq('usuario_id', req.user.id)
      .or('ultimo_sync_at.is.null,ultimo_sync_at.lt.' + corte)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    if (!reclamada) {
      return res.json({ success: true, data: vistaEsim(fila), cooldown: true });
    }

    const actualizada = (await sincronizarFila(reclamada)) || reclamada;
    return res.json({ success: true, data: vistaEsim(actualizada), cooldown: false });
  } catch (e) {
    logger.error(`[telnyx] esim/sync: ${e.message}`);
    return res.status(502).json({ success: false, error: 'No se pudo actualizar el consumo' });
  }
});

// POST /api/telnyx/esim/reemplazar
router.post('/esim/reemplazar', verificarToken, async (req, res) => {
  const usuarioId = req.user.id;

  if (reemplazosEnCurso.has(usuarioId)) {
    return res.status(409).json({ success: false, error: 'Ya hay un cambio de eSIM en curso' });
  }
  reemplazosEnCurso.add(usuarioId);

  try {
    const fila = await reemplazarEsim(usuarioId);
    return res.json({ success: true, data: vistaEsim(fila) });
  } catch (e) {
    const controlado = ERRORES_CONTROLADOS.includes(e.status);
    if (!controlado) logger.error(`[telnyx] reemplazar: ${e.message}`);

    return res.status(controlado ? e.status : 502).json({
      success: false,
      error: controlado ? e.message : 'No se pudo cambiar la eSIM'
    });
  } finally {
    reemplazosEnCurso.delete(usuarioId);
  }
});

module.exports = router;