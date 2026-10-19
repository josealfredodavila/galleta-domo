// backend/routes/llamadas.js
// Motor de cada llamada:
//   - usuario del ecosistema  → LiveKit (motor 'livekit')
//   - número real             → Telnyx  (motor 'telnyx', Fase 2, deshabilitado)
// Esquema verificado contra Supabase (proyecto zultnlogdoajehbswlih):
//   llamadas: estado IN (ringing, active, ended, rejected, missed, failed)
//   llamadas_participantes:
//     rol    IN ('caller', 'participant')
//     estado IN ('invited', 'joined', 'left', 'declined')
//   historial_llamadas: auditoría alimentada por trigger (trg_registrar_historial_llamada)
//   bloqueos: (usuario_id, bloqueado_id, motivo, created_at)
//   función public.puede_llamar(p_origen, p_destino)
// El backend usa service_role (omite RLS).

const express = require('express');
const crypto = require('crypto');
const { AccessToken } = require('livekit-server-sdk');
const { supabaseAdmin } = require('../config/supabase');
const { verificarToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// NUEVO: Importamos el helper de Push para notificar al destinatario
const { enviarPushLlamadaEntrante } = require('./push');

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

function rolDe(llamada, uid) {
  return llamada.creador_id === uid ? 'caller' : 'participant';
}

// Valores válidos según los CHECK de la tabla
async function registrarParticipante(llamadaId, uid, rol, estado) {
  const ahora = new Date().toISOString();

  const { data, error: errBusca } = await supabaseAdmin
    .from('llamadas_participantes').select('id')
    .eq('llamada_id', llamadaId).eq('usuario_id', uid).maybeSingle();
  if (errBusca) throw errBusca;

  if (data) {
    const { error } = await supabaseAdmin.from('llamadas_participantes')
      .update({ estado, entro_at: ahora, salio_at: null })
      .eq('id', data.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from('llamadas_participantes').insert({
    llamada_id: llamadaId,
    usuario_id: uid,
    rol,
    estado,
    entro_at: estado === 'joined' ? ahora : null
  });
  if (error) throw error;
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

async function perfilesPorIds(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { data, error } = await supabaseAdmin
    .from('perfiles_publicos')
    .select('id, nombre, handle, avatar_url')
    .in('id', unicos);
  if (error) throw error;
  const mapa = {};
  (data || []).forEach((p) => { mapa[p.id] = p; });
  return mapa;
}

// ================================================================
// POST /iniciar
// Body: { destinatarioId, tipo: 'audio' | 'video' }
//    o: { numero: '+52...', tipo }   (Fase 2)
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
      origen: 'app'
    });
    if (errIns) throw errIns;

    await registrarParticipante(id, uid, 'caller', 'invited');

    // ============================================================
    // NUEVO: Disparar Notificación Push al destinatario
    // ============================================================
    try {
      // Obtenemos el nombre y avatar del que llama para la notificación
      const { data: creador } = await supabaseAdmin
        .from('usuarios')
        .select('nombre, avatar_url')
        .eq('id', uid)
        .maybeSingle();

      const nombreCreador = creador?.nombre || 'Alguien';
      const avatarCreador = creador?.avatar_url || '/icon-192.png';

      // Enviamos el push sin bloquear la respuesta HTTP (fire and forget)
      enviarPushLlamadaEntrante(destinoId, nombreCreador, avatarCreador, id)
        .catch((err) => logger.error(`[llamadas] Error enviando Push: ${err.message}`));

    } catch (pushErr) {
      // Si falla el push, no rompemos la llamada. Solo lo registramos en logs.
      logger.error(`[llamadas] Error preparando Push: ${pushErr.message}`);
    }
    // ============================================================

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

    await registrarParticipante(llamada.id, uid, 'participant', 'joined');

    const sala = await tokenParaSala(llamada.room_name, uid);
    return res.json({
      success: true,
      data: { ...sala, llamadaId: llamada.id, roomName: llamada.room_name, tipo: llamada.tipo, canPublish: true }
    });
  } catch (e) {
    logger.error(`[llamadas] aceptar: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// POST /:id/token  → el creador (o un participante) se une a la sala
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

    await registrarParticipante(llamada.id, uid, rolDe(llamada, uid), 'joined');

    const sala = await tokenParaSala(llamada.room_name, uid);
    return res.json({
      success: true,
      data: { ...sala, llamadaId: llamada.id, roomName: llamada.room_name, tipo: llamada.tipo, canPublish: true }
    });
  } catch (e) {
    logger.error(`[llamadas] token: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// POST /:id/terminar
//   - creador, ringing         → 'missed'
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
      .update({ salio_at: ahora.toISOString(), estado: 'left' })
      .eq('llamada_id', llamada.id)
      .eq('usuario_id', uid);

    return res.json({
      success: true,
      data: { estado: nuevoEstado, duracion_seg: update.duracion_seg ?? null }
    });
  } catch (e) {
    logger.error(`[llamadas] terminar: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// GET /historial?limite=50&tipo=all|audio|video&direccion=all|saliente|entrante
// Lee de historial_llamadas (auditoría alimentada por trigger).
// ================================================================
router.get('/historial', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const limite = Math.min(Number(req.query.limite) || 50, 100);
    const tipo = req.query.tipo;
    const direccion = req.query.direccion;

    let q = supabaseAdmin
      .from('historial_llamadas')
      .select('id, llamada_id, direccion, tipo, estado, duracion_seg, contraparte_id, iniciada_at, finalizada_at')
      .eq('usuario_id', uid)
      .eq('oculto_por_usuario', false);

    if (tipo === 'audio' || tipo === 'video') q = q.eq('tipo', tipo);
    if (direccion === 'saliente' || direccion === 'entrante') q = q.eq('direccion', direccion);

    const { data, error } = await q
      .order('iniciada_at', { ascending: false })
      .limit(limite);
    if (error) throw error;

    const perfiles = await perfilesPorIds((data || []).map((h) => h.contraparte_id));

    const lista = (data || []).map((h) => {
      const p = perfiles[h.contraparte_id] || {};
      return {
        id: h.id,
        llamada_id: h.llamada_id,
        direccion: h.direccion,
        tipo: h.tipo,
        estado: h.estado,
        duracion_seg: h.duracion_seg,
        contraparte_id: h.contraparte_id,
        contraparte_nombre: p.nombre || 'Usuario',
        contraparte_avatar: p.avatar_url || null,
        iniciada_at: h.iniciada_at,
        finalizada_at: h.finalizada_at
      };
    });

    return res.json({ success: true, data: lista });
  } catch (e) {
    logger.error(`[llamadas] historial: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// DELETE /historial/:id  → soft delete (oculto_por_usuario = true)
// ================================================================
router.delete('/historial/:id', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const id = String(req.params.id || '');
    if (!UUID.test(id)) {
      return res.status(400).json({ success: false, error: 'id_invalido' });
    }

    const { data, error } = await supabaseAdmin
      .from('historial_llamadas')
      .update({ oculto_por_usuario: true })
      .eq('id', id)
      .eq('usuario_id', uid)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ success: false, error: 'entrada_no_encontrada' });
    }

    return res.json({ success: true, data: { id: data.id } });
  } catch (e) {
    logger.error(`[llamadas] historial delete: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// DELETE /historial  → oculta TODO el historial del usuario
// ================================================================
router.delete('/historial', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const { data, error } = await supabaseAdmin
      .from('historial_llamadas')
      .update({ oculto_por_usuario: true })
      .eq('usuario_id', uid)
      .eq('oculto_por_usuario', false)
      .select('id');
    if (error) throw error;

    return res.json({ success: true, data: { eliminadas: (data || []).length } });
  } catch (e) {
    logger.error(`[llamadas] historial delete all: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// GET /bloqueos  → usuarios bloqueados por el actual
// ================================================================
router.get('/bloqueos', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const { data, error } = await supabaseAdmin
      .from('bloqueos')
      .select('id, bloqueado_id, motivo, created_at')
      .eq('usuario_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const perfiles = await perfilesPorIds((data || []).map((b) => b.bloqueado_id));

    const lista = (data || []).map((b) => {
      const p = perfiles[b.bloqueado_id] || {};
      return {
        id: b.id,
        bloqueado_id: b.bloqueado_id,
        nombre: p.nombre || 'Usuario',
        handle: p.handle || null,
        avatar_url: p.avatar_url || null,
        motivo: b.motivo,
        created_at: b.created_at
      };
    });

    return res.json({ success: true, data: lista });
  } catch (e) {
    logger.error(`[llamadas] bloqueos get: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// POST /bloqueos  Body: { bloqueadoId, motivo? }
// ================================================================
router.post('/bloqueos', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const bloqueadoId = String(req.body?.bloqueadoId || '');
    const motivo = req.body?.motivo ? String(req.body.motivo).slice(0, 200) : null;

    if (!UUID.test(bloqueadoId) || bloqueadoId === uid) {
      return res.status(400).json({ success: false, error: 'bloqueado_invalido' });
    }

    const { data, error } = await supabaseAdmin
      .from('bloqueos')
      .insert({ usuario_id: uid, bloqueado_id: bloqueadoId, motivo })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: 'ya_bloqueado' });
      }
      throw error;
    }

    return res.json({ success: true, data: { id: data.id } });
  } catch (e) {
    logger.error(`[llamadas] bloqueos post: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// DELETE /bloqueos/:bloqueadoId
// ================================================================
router.delete('/bloqueos/:bloqueadoId', verificarToken, async (req, res) => {
  try {
    const uid = req.usuario.id;
    const bloqueadoId = String(req.params.bloqueadoId || '');
    if (!UUID.test(bloqueadoId)) {
      return res.status(400).json({ success: false, error: 'bloqueado_invalido' });
    }

    const { data, error } = await supabaseAdmin
      .from('bloqueos')
      .delete()
      .eq('usuario_id', uid)
      .eq('bloqueado_id', bloqueadoId)
      .select('id');
    if (error) throw error;
    if (!data || !data.length) {
      return res.status(404).json({ success: false, error: 'bloqueo_no_encontrado' });
    }

    return res.json({ success: true, data: { eliminado: true } });
  } catch (e) {
    logger.error(`[llamadas] bloqueos delete: ${e.message}`);
    return res.status(500).json({ success: false, error: 'servidor' });
  }
});

// ================================================================
// GET /configuracion  y  PUT /configuracion
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