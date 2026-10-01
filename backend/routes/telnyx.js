// backend/routes/telnyx.js — rutas autenticadas (montar en /api/telnyx)
// El aprovisionamiento NO se pide desde aquí: ocurre solo al confirmarse el pago de un paquete de internet.
const express = require('express');
const { supabaseAdmin } = require('../services/telnyx/supabase');
const { asegurarFila, sincronizarFila, reemplazarEsim, vistaEsim } = require('../services/telnyx/esim');
const { obtenerTokenWebrtc } = require('../services/telnyx/webrtc');

const router = express.Router();

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
    const { data } = await supabaseAdmin.from('esims_usuario').select('*').eq('usuario_id', req.user.id).maybeSingle();
    res.json({ success: true, data: vistaEsim(data) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error consultando tu eSIM' });
  }
});

// POST /api/telnyx/esim/sync → refrescar consumo (máx. 1 vez por minuto)
router.post('/esim/sync', verificarToken, async (req, res) => {
  try {
    let fila = await asegurarFila(req.user.id);
    const reciente = fila.ultimo_sync_at && Date.now() - new Date(fila.ultimo_sync_at).getTime() < 60000;
    if (!reciente) fila = (await sincronizarFila(fila)) || fila;
    res.json({ success: true, data: vistaEsim(fila) });
  } catch (e) {
    res.status(502).json({ success: false, error: 'No se pudo actualizar el consumo' });
  }
});

// POST /api/telnyx/esim/reemplazar → cambio de celular (nueva eSIM, conserva gigas restantes)
router.post('/esim/reemplazar', verificarToken, async (req, res) => {
  try {
    const fila = await reemplazarEsim(req.user.id);
    res.json({ success: true, data: vistaEsim(fila) });
  } catch (e) {
    const controlado = [404, 409, 429].includes(e.status);
    if (!controlado) console.error('[telnyx] reemplazar:', e.message);
    res.status(controlado ? e.status : 502).json({ success: false, error: controlado ? e.message : 'No se pudo cambiar la eSIM' });
  }
});

// POST /api/telnyx/webrtc/token → JWT temporal para el SDK WebRTC
router.post('/webrtc/token', verificarToken, async (req, res) => {
  try {
    const token = await obtenerTokenWebrtc(req.user.id);
    res.json({ success: true, data: { token } });
  } catch (e) {
    console.error('[telnyx] webrtc token:', e.message);
    res.status(502).json({ success: false, error: 'No se pudo generar el token' });
  }
});

module.exports = router;
