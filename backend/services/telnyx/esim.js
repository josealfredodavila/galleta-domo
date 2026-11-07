// backend/services/telnyx/esim.js
// Una eSIM por usuario (tabla esims_usuario). Cada compra SUMA gigas.
//
// Garantías:
//   - Nunca se compra una eSIM si la fila ya tiene telnyx_sim_id.
//   - telnyx_sim_id se guarda justo después de la compra, antes del código.
//   - La eSIM se compra DESHABILITADA. Se habilita solo con límite fijado.
//   - El límite (data_limit) se fija en Telnyx antes de cada acreditación.
//   - Todo es idempotente por orden (ordenes_acreditadas) y usa version.
//
// Verificado en documentación pública de Telnyx:
//   POST  /actions/purchase/esims  (amount, sim_card_group_id, tags, status)
//   PATCH /sim_cards/{id}          (data_limit: { amount, unit })
//   GET   /sim_cards/{id}          (status, current_billing_period_consumed_data)
//   POST  /sim_cards/{id}/actions/enable
// NO verificado (confirmar antes de vender):
//   GET   /sim_cards/{id}/activation_code
//   POST  /sim_cards/{id}/actions/disable

'use strict';

const { telnyx } = require('./client');
const { supabaseAdmin } = require('./supabase');

const MB_POR_GB = 1000;
const ESTADOS_PAGADOS = ['pagado', 'activo'];
const REEMPLAZO_DIAS = Number(process.env.TELNYX_REEMPLAZO_DIAS || 30);
const CLAIM_CADUCA_MS = 5 * 60 * 1000;

const ahora = () => new Date().toISOString();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const fallo = (msg, status, code) => Object.assign(new Error(msg), { status, code });

function exigirHabilitado() {
  if (process.env.TELNYX_ESIM_ENABLED !== 'true') {
    throw fallo('eSIM deshabilitada (TELNYX_ESIM_ENABLED no es true)', 503, 'DESHABILITADA');
  }
}

// ---------------------------------------------------------------- base de datos

async function asegurarFila(usuarioId) {
  await supabaseAdmin
    .from('esims_usuario')
    .upsert({ usuario_id: usuarioId }, { onConflict: 'usuario_id', ignoreDuplicates: true });
  const { data, error } = await supabaseAdmin
    .from('esims_usuario').select('*').eq('usuario_id', usuarioId).single();
  if (error) throw error;
  return data;
}

// Actualiza solo si nadie cambió la fila (version). Devuelve la fila nueva o null.
async function actualizarFila(fila, cambios) {
  const { data, error } = await supabaseAdmin
    .from('esims_usuario')
    .update({ ...cambios, version: fila.version + 1, updated_at: ahora() })
    .eq('id', fila.id)
    .eq('version', fila.version)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function leerFila(id) {
  const { data, error } = await supabaseAdmin.from('esims_usuario').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

function restanteMb(fila) {
  return Math.max(0, Number(fila.datos_total_mb) - Number(fila.datos_usados_mb));
}

function estadoSegunDatos(fila) {
  if (!fila.qr_code) return 'pendiente_codigo';
  return restanteMb(fila) > 0 ? 'activa' : 'sin_saldo';
}

// ---------------------------------------------------------------- Telnyx

async function comprarEsimTelnyx(usuarioId) {
  const cuerpo = {
    amount: 1,
    status: 'disabled',                       // nunca habilitada sin límite
    tags: ['usuario-' + usuarioId],
  };
  if (process.env.TELNYX_SIM_GROUP_ID) cuerpo.sim_card_group_id = process.env.TELNYX_SIM_GROUP_ID;

  const r = await telnyx('POST', '/actions/purchase/esims', cuerpo);
  const sim = Array.isArray(r.data) ? r.data[0] : r.data;
  if (!sim || !sim.id) throw new Error('Telnyx no devolvió el id de la eSIM');
  return { simId: String(sim.id), iccid: sim.iccid || null };
}

async function obtenerCodigoActivacion(simId) {
  try {
    const r = await telnyx('GET', '/sim_cards/' + encodeURIComponent(simId) + '/activation_code');
    return (r.data && r.data.activation_code) || null;
  } catch (e) {
    console.warn(`[telnyx] código de activación aún no disponible para ${simId}: ${e.message}`);
    return null;
  }
}

function fijarLimiteDatos(simId, mb) {
  return telnyx('PATCH', '/sim_cards/' + encodeURIComponent(simId), {
    data_limit: { amount: String(Math.max(0, Math.round(mb))), unit: 'MB' },
  });
}

function habilitarSim(simId) {
  return telnyx('POST', '/sim_cards/' + encodeURIComponent(simId) + '/actions/enable');
}

function deshabilitarSim(simId) {
  return telnyx('POST', '/sim_cards/' + encodeURIComponent(simId) + '/actions/disable');
}

// ---------------------------------------------------------------- código y reconciliación

async function completarCodigo(fila) {
  if (!fila.telnyx_sim_id || fila.qr_code) return fila;
  const codigo = await obtenerCodigoActivacion(fila.telnyx_sim_id);
  if (!codigo) return fila;
  const conCodigo = { ...fila, qr_code: codigo };
  return (await actualizarFila(fila, { qr_code: codigo, estado: estadoSegunDatos(conCodigo) })) || fila;
}

// Para filas en pendiente_codigo: fija el límite, habilita si hay saldo y pide el código.
async function reconciliarSim(fila) {
  if (!fila.telnyx_sim_id || fila.estado !== 'pendiente_codigo') return fila;
  const restante = restanteMb(fila);
  if (restante > 0) {
    await fijarLimiteDatos(fila.telnyx_sim_id, restante);
    await habilitarSim(fila.telnyx_sim_id);
  }
  return completarCodigo(fila);
}

// ---------------------------------------------------------------- aprovisionar (primera compra)

async function aprovisionar(fila, usuarioId) {
  const caduco = fila.estado === 'aprovisionando'
    && Date.now() - new Date(fila.updated_at).getTime() > CLAIM_CADUCA_MS;
  if (fila.estado === 'aprovisionando' && !caduco) throw fallo('Aprovisionamiento en curso', 409, 'EN_CURSO');

  const claim = await actualizarFila(fila, { estado: 'aprovisionando' });
  if (!claim) throw fallo('Aprovisionamiento en curso', 409, 'EN_CURSO');

  let compra;
  try {
    compra = await comprarEsimTelnyx(usuarioId);
  } catch (e) {
    // La compra falló antes de obtener id: no hay nada cobrado que conciliar.
    await supabaseAdmin.from('esims_usuario')
      .update({ estado: 'pendiente', updated_at: ahora() })
      .eq('id', claim.id).eq('estado', 'aprovisionando');
    throw e;
  }

  // GUARDAR EL ID DE INMEDIATO. Desde aquí la eSIM ya está cobrada.
  const { data: guardada, error } = await supabaseAdmin
    .from('esims_usuario')
    .update({
      telnyx_sim_id: compra.simId,
      iccid: compra.iccid,
      estado: 'pendiente_codigo',
      version: claim.version + 1,
      updated_at: ahora(),
    })
    .eq('id', claim.id)
    .eq('version', claim.version)
    .select('*')
    .maybeSingle();

  if (error || !guardada) {
    console.error(`[telnyx] ALERTA: eSIM ${compra.simId} comprada y NO guardada (usuario ${usuarioId}). Conciliar en el portal.`);
    throw fallo('eSIM comprada pero no guardada; revisar en el portal', 500, 'COMPRA_SIN_GUARDAR');
  }

  return completarCodigo(guardada);
}

// ---------------------------------------------------------------- acreditar gigas (idempotente)

async function acreditar(filaId, ordenId, mb) {
  for (let i = 0; i < 6; i++) {
    const fila = await leerFila(filaId);

    if (fila.ordenes_acreditadas.includes(ordenId)) return { fila, ya_acreditada: true };
    if (fila.estado === 'aprovisionando' || fila.estado === 'reemplazando') {
      throw fallo('Operación en curso, reintentar', 409, 'EN_CURSO');
    }

    const totalNuevo = Number(fila.datos_total_mb) + mb;
    const restanteNuevo = totalNuevo - Number(fila.datos_usados_mb);

    // 1) Límite en Telnyx (valor absoluto: repetirlo es seguro). Si falla, no se acredita.
    await fijarLimiteDatos(fila.telnyx_sim_id, restanteNuevo);

    // 2) Estado local con control de versión
    const estadoNuevo = fila.qr_code
      ? (restanteNuevo > 0 ? 'activa' : 'sin_saldo')
      : 'pendiente_codigo';

    const nueva = await actualizarFila(fila, {
      datos_total_mb: totalNuevo,
      ordenes_acreditadas: [...fila.ordenes_acreditadas, ordenId],
      estado: estadoNuevo,
    });

    if (nueva) {
      if (estadoNuevo === 'activa') {
        try { await habilitarSim(fila.telnyx_sim_id); }
        catch (e) { console.warn('[telnyx] enable tras acreditar falló; el ciclo lo corrige:', e.message); }
      }
      return { fila: nueva, ya_acreditada: false };
    }

    await dormir(100 + Math.random() * 200);
  }
  throw fallo('No se pudo acreditar (concurrencia)', 409, 'EN_CURSO');
}

async function procesarOrdenInternet(ordenId) {
  exigirHabilitado();

  const { data: orden, error } = await supabaseAdmin
    .from('ordenes_internet')
    .select('id, usuario_id, datos_gb, estado')
    .eq('id', ordenId)
    .maybeSingle();
  if (error) throw error;
  if (!orden) throw fallo('Orden no encontrada', 404, 'NO_EXISTE');
  if (!ESTADOS_PAGADOS.includes(orden.estado)) throw fallo('La orden no está pagada', 402, 'NO_PAGADA');

  let fila = await asegurarFila(orden.usuario_id);
  if (fila.ordenes_acreditadas.includes(orden.id)) return { fila, ya_procesada: true };

  if (!fila.telnyx_sim_id) fila = await aprovisionar(fila, orden.usuario_id);

  const mb = Math.round(Number(orden.datos_gb) * MB_POR_GB);
  const { fila: final } = await acreditar(fila.id, orden.id, mb);
  return { fila: final, ya_procesada: false };
}

// ---------------------------------------------------------------- consumo y corte

async function sincronizarFila(fila) {
  if (!fila.telnyx_sim_id || !['activa', 'sin_saldo'].includes(fila.estado)) return fila;

  const r = await telnyx('GET', '/sim_cards/' + encodeURIComponent(fila.telnyx_sim_id));
  const d = r.data || {};
  const statusTelnyx = (d.status && d.status.value) || d.status || null;

  let usados = Number(fila.datos_usados_mb);
  let periodo = Number(fila.consumo_periodo_mb);
  const c = d.current_billing_period_consumed_data; // { amount: "123.0", unit: "MB" }
  if (c && c.amount != null) {
    const n = Number(c.amount);
    const mb = Math.round(String(c.unit || 'MB').toUpperCase() === 'GB' ? n * MB_POR_GB : n);
    usados += mb >= periodo ? mb - periodo : mb; // si bajó, empezó un periodo nuevo
    periodo = mb;
  }

  const agotada = Number(fila.datos_total_mb) > 0 && usados >= Number(fila.datos_total_mb);

  const nueva = await actualizarFila(fila, {
    datos_usados_mb: usados,
    consumo_periodo_mb: periodo,
    estado: agotada ? 'sin_saldo' : 'activa',
    ultimo_sync_at: ahora(),
  });
  if (!nueva) return fila;

  try {
    if (agotada && statusTelnyx === 'enabled') await deshabilitarSim(fila.telnyx_sim_id);
    if (!agotada && statusTelnyx && statusTelnyx !== 'enabled') await habilitarSim(fila.telnyx_sim_id);
  } catch (e) {
    console.warn('[telnyx] cambio de estado de SIM falló:', e.message);
  }
  return nueva;
}

async function sincronizarPorSimId(simId) {
  const { data: fila } = await supabaseAdmin
    .from('esims_usuario').select('*').eq('telnyx_sim_id', String(simId)).maybeSingle();
  return fila ? sincronizarFila(fila) : null;
}

// ---------------------------------------------------------------- cambio de celular

async function reemplazarEsim(usuarioId) {
  exigirHabilitado();

  let fila = await asegurarFila(usuarioId);
  if (!fila.telnyx_sim_id) throw fallo('Aún no tienes una eSIM', 404, 'SIN_ESIM');

  const enCurso = fila.estado === 'reemplazando'
    && Date.now() - new Date(fila.updated_at).getTime() <= CLAIM_CADUCA_MS;
  if (enCurso || fila.estado === 'aprovisionando' || fila.estado === 'pendiente_codigo') {
    throw fallo('Operación en curso; intenta en unos minutos', 409, 'EN_CURSO');
  }

  if (fila.ultimo_reemplazo_at) {
    const dias = (Date.now() - new Date(fila.ultimo_reemplazo_at).getTime()) / 86400000;
    if (dias < REEMPLAZO_DIAS) {
      throw fallo(`Solo puedes cambiar de celular una vez cada ${REEMPLAZO_DIAS} días`, 429, 'LIMITE');
    }
  }

  // Capturar el consumo real antes del cambio
  fila = (await sincronizarFila(fila).catch(() => fila)) || fila;

  const restante = restanteMb(fila);
  const simVieja = fila.telnyx_sim_id;
  const estadoPrevio = fila.estado;

  const claim = await actualizarFila(fila, { estado: 'reemplazando' });
  if (!claim) throw fallo('Cambio en curso', 409, 'EN_CURSO');

  let compra;
  try {
    compra = await comprarEsimTelnyx(usuarioId);
  } catch (e) {
    await supabaseAdmin.from('esims_usuario')
      .update({ estado: estadoPrevio, updated_at: ahora() })
      .eq('id', claim.id).eq('estado', 'reemplazando');
    throw e;
  }

  // Guardar la nueva SIM de inmediato
  const { data: nueva, error } = await supabaseAdmin
    .from('esims_usuario')
    .update({
      telnyx_sim_id: compra.simId,
      iccid: compra.iccid,
      qr_code: null,
      datos_total_mb: restante,
      datos_usados_mb: 0,
      consumo_periodo_mb: 0,
      estado: 'pendiente_codigo',
      reemplazos: Number(claim.reemplazos || 0) + 1,
      ultimo_reemplazo_at: ahora(),
      ultimo_sync_at: ahora(),
      version: claim.version + 1,
      updated_at: ahora(),
    })
    .eq('id', claim.id)
    .eq('version', claim.version)
    .select('*')
    .maybeSingle();

  if (error || !nueva) {
    console.error(`[telnyx] ALERTA: eSIM ${compra.simId} de reemplazo comprada y NO guardada (usuario ${usuarioId}); SIM anterior ${simVieja}.`);
    throw fallo('ESIM nueva comprada pero no guardada; revisar en el portal', 500, 'COMPRA_SIN_GUARDAR');
  }

  // Ajustes posteriores: si fallan, el ciclo los completa (reconciliarSim)
  let final = nueva;
  try { final = await reconciliarSim(nueva); }
  catch (e) { console.warn('[telnyx] reemplazo: ajustes pendientes, el ciclo los completa:', e.message); }

  // La SIM anterior se deshabilita para que no consuma datos
  try { await deshabilitarSim(simVieja); }
  catch (e) { console.warn(`[telnyx] no se pudo deshabilitar la SIM anterior ${simVieja}:`, e.message); }

  console.log(`[telnyx] eSIM reemplazada usuario=${usuarioId} anterior=${simVieja} nueva=${compra.simId}`);
  return final;
}

// ---------------------------------------------------------------- vista para el frontend

function vistaEsim(fila) {
  if (!fila) return { tiene_esim: false };

  const proximo = fila.ultimo_reemplazo_at
    ? new Date(new Date(fila.ultimo_reemplazo_at).getTime() + REEMPLAZO_DIAS * 86400000).toISOString()
    : null;

  return {
    tiene_esim: Boolean(fila.telnyx_sim_id),
    estado: fila.estado,
    activation_code: fila.qr_code || null,
    iccid: fila.iccid || null,
    datos_total_mb: Number(fila.datos_total_mb),
    datos_usados_mb: Number(fila.datos_usados_mb),
    datos_restantes_mb: restanteMb(fila),
    reemplazos: fila.reemplazos,
    puede_reemplazar: !proximo || new Date(proximo) <= new Date(),
    reemplazo_disponible_desde: proximo,
    ultimo_sync_at: fila.ultimo_sync_at,
  };
}

// ---------------------------------------------------------------- mantenimiento (cada 5 min)

async function reconciliarOrdenes() {
  const desde = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: ordenes } = await supabaseAdmin
    .from('ordenes_internet').select('id, usuario_id')
    .in('estado', ESTADOS_PAGADOS).gte('created_at', desde).limit(200);
  if (!ordenes || !ordenes.length) return 0;

  const usuarios = [...new Set(ordenes.map((o) => o.usuario_id))];
  const { data: filas } = await supabaseAdmin
    .from('esims_usuario').select('usuario_id, ordenes_acreditadas').in('usuario_id', usuarios);
  const acreditadas = new Map((filas || []).map((f) => [f.usuario_id, new Set(f.ordenes_acreditadas || [])]));

  let n = 0;
  for (const o of ordenes) {
    if (acreditadas.get(o.usuario_id) && acreditadas.get(o.usuario_id).has(o.id)) continue;
    try { await procesarOrdenInternet(o.id); n++; }
    catch (e) { console.warn(`[telnyx] reconciliación orden ${o.id}: ${e.message}`); }
  }
  return n;
}

async function cicloMantenimientoEsims() {
  if (process.env.TELNYX_ESIM_ENABLED !== 'true') return;

  try {
    const reconciliadas = await reconciliarOrdenes();

    const { data: pendientes } = await supabaseAdmin
      .from('esims_usuario').select('*')
      .eq('estado', 'pendiente_codigo').not('telnyx_sim_id', 'is', null).limit(200);
    for (const f of pendientes || []) {
      try { await reconciliarSim(f); }
      catch (e) { console.warn(`[telnyx] reconciliar ${f.telnyx_sim_id}: ${e.message}`); }
    }

    const { data: filas } = await supabaseAdmin
      .from('esims_usuario').select('*')
      .in('estado', ['activa', 'sin_saldo']).not('telnyx_sim_id', 'is', null).limit(500);
    for (const f of filas || []) {
      try { await sincronizarFila(f); }
      catch (e) { console.warn(`[telnyx] sync ${f.telnyx_sim_id}: ${e.message}`); }
    }

    console.log(`🕒 Ciclo eSIM: ${reconciliadas} órdenes, ${(pendientes || []).length} pendientes, ${(filas || []).length} sincronizadas.`);
  } catch (e) {
    console.error('❌ Ciclo eSIM:', e.message);
  }
}

module.exports = {
  procesarOrdenInternet,
  sincronizarFila,
  sincronizarPorSimId,
  reemplazarEsim,
  vistaEsim,
  asegurarFila,
  cicloMantenimientoEsims,
};