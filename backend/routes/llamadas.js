// backend/routes/llamadas.js
// Decide el motor de cada llamada en el servidor:
//   - usuario del ecosistema  → LiveKit (motor 'livekit')
//   - número real             → Telnyx  (motor 'telnyx', Fase 2, deshabilitado por ahora)
const express = require('express');
const crypto = require('crypto');
const { AccessToken } = require('livekit-server-sdk');
const { supabaseAdmin } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL } = process.env;
const TELNYX_CALLS_ENABLED = process.env.TELNYX_CALLS_ENABLED === 'true';
const PREFIJOS = (process.env.TELNYX_ALLOWED_PREFIXES || '+52')
  .split(',').map((s) => s.trim()).filter(Boolean);
const E164 = /^\+[1-9]\d{6,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_TOKEN = '2h';

// ---------------- helpers ----------------

async function cargarLlamada(id) {
  const { data, error } = await supabaseAdmin
    .from('llamadas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

function esParticipante(llamada, uid) {
  return llamada.creador_id === uid || llamada.destinatario_id === uid;
}

async function registrarParticipante(llamadaId, uid, rol) {
  const { data } = await supabaseAdmin
    .from('llamadas_participantes').select('id')
    .eq('llamada_id', llamadaId).eq('usuario_id', uid).maybeSingle();

  const ahora = new Date().toISOString();

  if (data) {
    await supabaseAdmin.from('llamadas_participantes')
      .update({ estado: 'conectado', entro_at: ahora, salio_at: null })
      .eq('id', data.id);
    return;
  }

  await supabaseAdmin.from('llamadas_participantes').insert({
    llamada_id: llamadaId, usuario_id: uid, rol, estado: 'conectado', entro_at: ahora
  });
}

async function tokenParaSala(roomName, uid) {
  const { data: perfil } = await supabaseAdmin
    .from('usuarios').select('nombre').eq('id', uid).maybeSingle();

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: uid,
    name: perfil?.nombre || 'Usuario',
    ttl: TTL_TOKEN
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false
  });

  return { token: await at.toJwt(), url: LIVEKIT_WS_URL };
}

function livekitConfigurado() {
  return Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_WS_URL);
}

// ================================================================
// POST /iniciar
// Body: { destinatarioId, tipo: 'audio' | 'video' }
//    o: { numero: '+52...', tipo }   (Fase 2)
// Crea la fila en llamadas. Eso también dispara el aviso Realtime
// que ya escucha mensajes.js (estado 'ringing').
// ================================================================
router.post('/iniciar', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const tipo = req.body?.tipo === 'audio' ? 'audio' : 'video';

    // ---------- Número externo (Telnyx, Fase 2) ----------
    if (req.body?.numero) {
      const numero = String(req.body.numero).replace(/\s|-/g, '');

      if (!E164.test(numero) || !PREFIJOS.some((p) => numero.startsWith(p))) {
        return res.status(400).json({ success: false, error: 'numero_no_permitido' });
      }
      if (!TELNYX_CALLS_ENABLED) {
        return res.status(503).json({ success: false, error: 'telefonia_no_disponible' });
      }
      // Fase 2: aquí irá el alta en Telnyx con motor 'telnyx'
      return res.status(501).json({ success: false, error: 'telefonia_en_construccion' });
    }

    // ---------- Usuario del ecosistema (LiveKit) ----------
    const destinoId = String(req.body?.destinatarioId || '');

    if (!UUID.test(destinoId) || destinoId === uid) {
      return res.status(400).json({ success: false, error: 'destinatario_invalido' });
    }
    if (!livekitConfigurado()) {
      return res.status(503).json({ success: false, error: 'livekit_no_configurado' });
    }

    const { data: puede, error: errPuede } = await supabaseAdmin
      .rpc('puede_llamar', { p_origen: uid, p_destino: destinoId });
    if (errPuede) throw errPuede;

    // Mensaje genérico: no revela si hay bloqueo o si el usuario existe
    if (!puede) {
      return res.status(403).json({ success: false, error: 'llamada_no_permitida' });
    }

    const id = crypto.randomUUID();
    const roomName = 'call_' + id;

    const { error: errIns } = await supabaseAdmin.from('llamadas').insert({
      id,
      creador_id: uid,
      destinatario_id: destinoId,
      conversation_id: destinoId,
      tipo,
      estado: 'ringing',
      room_name: roomName,
      motor: 'livekit',
      origen: 'app',
      iniciada_at: new Date().toISOString()
    });
    if (errIns) throw errIns;

    await registrarParticipante(id, uid, 'creador');

    return res.json({
      success: true,
      data: { llamadaId: id, roomName, motor: 'livekit', tipo }
    });
  } catch (e) {
    logger.error(`[llamadas] iniciar: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// POST /:id/aceptar  → el destinatario contesta
// ================================================================
router.post('/:id/aceptar', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const llamada = await cargarLlamada(req.params.id);

    if (!llamada || llamada.destinatario_id !== uid) {
      return res.status(404).json({ success: false, error: 'llamada_no_encontrada' });
    }
    if (llamada.estado !== 'ringing') {
      return res.status(409).json({ success: false, error: 'llamada_no_disponible' });
    }
    if (llamada.motor !== 'livekit') {
      return res.status(400).json({ success: false, error: 'motor_no_compatible' });
    }

    const { error } = await supabaseAdmin.from('llamadas').update({
      estado: 'active',
      contestada_at: new Date().toISOString()
    }).eq('id', llamada.id);
    if (error) throw error;

    await registrarParticipante(llamada.id, uid, 'invitado');

    const sala = await tokenParaSala(llamada.room_name, uid);
    return res.json({ success: true, data: { ...sala, roomName: llamada.room_name, canPublish: true } });
  } catch (e) {
    logger.error(`[llamadas] aceptar: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// POST /:id/token  → el creador se une a la sala (después de iniciar)
// ================================================================
router.post('/:id/token', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const llamada = await cargarLlamada(req.params.id);

    if (!llamada || !esParticipante(llamada, uid)) {
      return res.status(404).json({ success: false, error: 'llamada_no_encontrada' });
    }
    if (!['ringing', 'active'].includes(llamada.estado)) {
      return res.status(409).json({ success: false, error: 'llamada_no_disponible' });
    }
    if (llamada.motor !== 'livekit') {
      return res.status(400).json({ success: false, error: 'motor_no_compatible' });
    }

    const sala = await tokenParaSala(llamada.room_name, uid);
    return res.json({ success: true, data: { ...sala, roomName: llamada.room_name, canPublish: true } });
  } catch (e) {
    logger.error(`[llamadas] token: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// POST /:id/terminar
// Body: opcional { motivo }. Reglas:
//   - creador, estado ringing  → 'missed'  (cancelada antes de contestar)
//   - destinatario, ringing    → 'rejected'
//   - cualquiera, active       → 'ended' (con duración)
// ================================================================
router.post('/:id/terminar', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const llamada = await cargarLlamada(req.params.id);

    if (!llamada || !esParticipante(llamada, uid)) {
      return res.status(404).json({ success: false, error: 'llamada_no_encontrada' });
    }
    if (['ended', 'rejected', 'missed', 'failed'].includes(llamada.estado)) {
      return res.json({ success: true, data: { estado: llamada.estado } });
    }

    const ahora = new Date();
    let nuevoEstado;
    let motivo = String(req.body?.motivo || '').slice(0, 40) || null;
    const update = { finalizada_at: ahora.toISOString() };

    if (llamada.estado === 'ringing') {
      if (llamada.creador_id === uid) {
        nuevoEstado = 'missed';
        motivo = motivo || 'cancelada';
      } else {
        nuevoEstado = 'rejected';
        motivo = motivo || 'rechazada';
      }
    } else {
      nuevoEstado = 'ended';
      motivo = motivo || 'colgada';
      if (llamada.contestada_at) {
        update.duracion_seg = Math.max(
          0,
          Math.round((ahora - new Date(llamada.contestada_at)) / 1000)
        );
      }
    }

    update.estado = nuevoEstado;
    update.motivo_fin = motivo;

    const { error } = await supabaseAdmin.from('llamadas').update(update).eq('id', llamada.id);
    if (error) throw error;

    await supabaseAdmin.from('llamadas_participantes')
      .update({ salio_at: ahora.toISOString(), estado: 'desconectado' })
      .eq('llamada_id', llamada.id)
      .eq('usuario_id', uid);

    return res.json({ success: true, data: { estado: nuevoEstado, duracion_seg: update.duracion_seg ?? null } });
  } catch (e) {
    logger.error(`[llamadas] terminar: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// GET /historial?limite=50
// Devuelve llamadas perdidas, entrantes, salientes y realizadas.
// ================================================================
router.get('/historial', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const limite = Math.min(Number(req.query.limite) || 50, 100);

    const { data, error } = await supabaseAdmin
      .from('llamadas')
      .select('id, creador_id, destinatario_id, numero_destino, tipo, estado, motivo_fin, duracion_seg, created_at, contestada_at')
      .or(`creador_id.eq.${uid},destinatario_id.eq.${uid}`)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;

    const lista = (data || []).map((l) => {
      const saliente = l.creador_id === uid;
      let direccion = saliente ? 'saliente' : 'entrante';
      let resultado = 'realizada';

      if (!l.contestada_at) {
        if (saliente) resultado = 'no_contestada';
        else resultado = l.estado === 'rejected' ? 'rechazada' : 'perdida';
      }

      return {
        id: l.id,
        direccion,
        resultado,
        contraparte_id: saliente ? l.destinatario_id : l.creador_id,
        numero_destino: l.numero_destino,
        tipo: l.tipo,
        duracion_seg: l.duracion_seg,
        fecha: l.created_at
      };
    });

    return res.json({ success: true, data: lista });
  } catch (e) {
    logger.error(`[llamadas] historial: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// GET /configuracion  y  PUT /configuracion
// Body PUT: { quien_puede_llamarme: 'todos' | 'contactos' | 'nadie' }
// ================================================================
router.get('/configuracion', verificarToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_llamadas')
      .select('quien_puede_llamarme')
      .eq('usuario_id', req.usuario.id)
      .maybeSingle();
    if (error) throw error;
    return res.json({
      success: true,
      data: { quien_puede_llamarme: data?.quien_puede_llamarme || 'contactos' }
    });
  } catch (e) {
    logger.error(`[llamadas] config get: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

router.put('/configuracion', verificarToken, async (req, res) => {
  try {
    const valor = req.body?.quien_puede_llamarme;
    if (!['todos', 'contactos', 'nadie'].includes(valor)) {
      return res.status(400).json({ success: false, error: 'valor_invalido' });
    }
    const { error } = await supabaseAdmin.from('configuracion_llamadas').upsert({
      usuario_id: req.usuario.id,
      quien_puede_llamarme: valor,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return res.json({ success: true, data: { quien_puede_llamarme: valor } });
  } catch (e) {
    logger.error(`[llamadas] config put: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

module.exports = router;