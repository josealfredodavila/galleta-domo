// backend/routes/telnyx.js — rutas autenticadas (montar en /api/telnyx)
// El aprovisionamiento NO se pide desde aquí: ocurre solo al confirmarse el pago de un paquete de internet.
const express = require('express');
const { supabaseAdmin } = require('../services/telnyx/supabase');
const { asegurarFila, sincronizarFila, reemplazarEsim, vistaEsim } = require('../services/telnyx/esim');
const { obtenerTokenWebrtc } = require('../services/telnyx/webrtc');
const logger = require('../utils/logger');

const router = express.Router();

const SYNC_COOLDOWN_MS = 60000;
// Cambios de eSIM en curso por usuario. Protege contra doble clic mientras haya una sola instancia.
const reemplazosEnCurso = new Set();

// Misma validación que authMiddleware de server.js (JWT de Supabase)
async function verificarToken(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'No autenticado' });
    const { data, error } = await supabaseAdmin.auth.getUser(h.substring(7).trim());
    if (error || !data?.user) return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    req.user = data.user;
    req.usuario = data.user;
    next();
  } catch (e) {
    res.status(401).json({ success: false, error: 'No autenticado' });
  }
}

// GET /api/telnyx/esim/mia → estado, QR/código de activación, saldo y consumo
router.get('/esim/mia', verificarToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('esims_usuario')
      .select('*')
      .eq('usuario_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, data: vistaEsim(data) });
  } catch (e) {
    logger.error(`[telnyx] esim/mia: ${e.message}`);
    res.status(500).json({ success: false, error: 'Error consultando tu eSIM' });
  }
});

// POST /api/telnyx/esim/sync → refrescar consumo (máx. 1 vez por minuto por usuario)
router.post('/esim/sync', verificarToken, async (req, res) => {
  try {
    const fila = await asegurarFila(req.user.id);

    // Reclamo atómico: solo una petición gana el turno, aunque lleguen varias a la vez.
    // Si el UPDATE no devuelve fila, otra petición ya reclamó el turno dentro del minuto.
    const corte = new Date(Date.now() - SYNC_COOLDOWN_MS).toISOString();
    const { data: reclamada, error } = await supabaseAdmin
      .from('esims_usuario')
      .update({ ultimo_sync_at: new Date().toISOString() })
      .eq('usuario_id', req.user.id)
      .or(`ultimo_sync_at.is.null,ultimo_sync_at.lt.${corte}`)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    if (!reclamada) {
      return res.json({ success: true, data: vistaEsim(fila), cooldown: true });
    }

    const actualizada = (await sincronizarFila(reclamada)) || reclamada;
    res.json({ success: true, data: vistaEsim(actualizada), cooldown: false });
  } catch (e) {
    logger.error(`[telnyx] esim/sync: ${e.message}`);
    res.status(502).json({ success: false, error: 'No se pudo actualizar el consumo' });
  }
});

// POST /api/telnyx/esim/reemplazar → cambio de celular (nueva eSIM, conserva gigas restantes)
router.post('/esim/reemplazar', verificarToken, async (req, res) => {
  const usuarioId = req.user.id;

  if (reemplazosEnCurso.has(usuarioId)) {
    return res.status(409).json({ success: false, error: 'Ya hay un cambio de eSIM en curso' });
  }
  reemplazosEnCurso.add(usuarioId);

  try {
    const fila = await reemplazarEsim(usuarioId);
    res.json({ success: true, data: vistaEsim(fila) });
  } catch (e) {
    const controlado = [404, 409, 429].includes(e.status);
    if (!controlado) logger.error(`[telnyx] reemplazar: ${e.message}`);
    res.status(controlado ? e.status : 502).json({
      success: false,
      error: controlado ? e.message : 'No se pudo cambiar la eSIM'
    });
  } finally {
    reemplazosEnCurso.delete(usuarioId);
  }
});

// POST /api/telnyx/webrtc/token → JWT temporal para el SDK WebRTC
router.post('/webrtc/token', verificarToken, async (req, res) => {
  try {
    const token = await obtenerTokenWebrtc(req.user.id);
    res.json({ success: true, data: { token } });
  } catch (e) {
    logger.error(`[telnyx] webrtc token: ${e.message}`);
    res.status(502).json({ success: false, error: 'No se pudo generar el token' });
  }
});

module.exports = router;