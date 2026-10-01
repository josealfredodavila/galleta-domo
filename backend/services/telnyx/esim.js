// backend/services/telnyx/esim.js
// UNA eSIM por usuario (tabla public.esims_usuario). Cada compra de internet SUMA gigas a esa eSIM.
// - procesarOrdenInternet(ordenId): crea la eSIM si no existe y acredita los GB (idempotente).
// - sincronizarFila / sincronizarPorSimId: lee consumo en Telnyx, corta la SIM si se acabó, la reactiva al recargar.
// - reemplazarEsim(usuarioId): cambio de celular (nueva eSIM, conserva el saldo restante).
// Solo backend (service_role). Las escrituras usan control optimista con la columna "version".
const { telnyx } = require('./client');
const { supabaseAdmin } = require('./supabase');

const MB_POR_GB = 1000; // criterio conservador (decimal)
const ESTADOS_PAGADOS = ['pagada', 'activa', 'activada', 'completado'];
const REEMPLAZO_DIAS = Number(process.env.TELNYX_REEMPLAZO_DIAS || 30);
const CLAIM_CADUCA_MS = 5 * 60 * 1000;

const ahora = () => new Date().toISOString();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const fallo = (msg, status, code) => Object.assign(new Error(msg), { status, code });

// ---------------------------------------------------------------- base de datos
async function asegurarFila(usuarioId) {
  await supabaseAdmin
    .from('esims_usuario')
    .upsert({ usuario_id: usuarioId }, { onConflict: 'usuario_id', ignoreDuplicates: true });
  const { data, error } = await supabaseAdmin.from('esims_usuario').select('*').eq('usuario_id', usuarioId).single();
  if (error) throw error;
  return data;
}

// Actualiza solo si nadie más tocó la fila (version). Devuelve la fila nueva o null.
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

// ---------------------------------------------------------------- Telnyx
async function comprarEsimTelnyx(usuarioId) {
  const compra = await telnyx('POST', '/actions/purchase/esims', {
    amount: 1,
    ...(process.env.TELNYX_SIM_GROUP_ID ? { sim_card_group_id: process.env.TELNYX_SIM_GROUP_ID } : {}),
    tags: [`usuario-${usuarioId}`],
  });
  const sim = Array.isArray(compra.data) ? compra.data[0] : compra.data;
  if (!sim?.id) throw new Error('Telnyx no devolvió el id de la eSIM');

  try {
    const act = await telnyx('GET', `/sim_cards/${sim.id}/activation_code`);
    const codigo = act?.data?.activation_code;
    if (!codigo) throw new Error('sin activation_code');
    return { simId: sim.id, iccid: sim.iccid || null, codigo };
  } catch (e) {
    console.error(`[telnyx] eSIM ${sim.id} comprada pero sin código de activación (revisar en portal):`, e.message);
    throw e;
  }
}

const habilitarSim = (id) => telnyx('POST', `/sim_cards/${id}/actions/enable`);
const deshabilitarSim = (id) => telnyx('POST', `/sim_cards/${id}/actions/disable`);

// ---------------------------------------------------------------- aprovisionar (primera compra)
async function aprovisionar(fila, usuarioId) {
  const caduco = fila.estado === 'aprovisionando' && Date.now() - new Date(fila.updated_at).getTime() > CLAIM_CADUCA_MS;
  if (fila.estado === 'aprovisionando' && !caduco) throw fallo('Aprovisionamiento en curso', 409, 'EN_CURSO');

  const claim = await actualizarFila(fila, { estado: 'aprovisionando' });
  if (!claim) throw fallo('Aprovisionamiento en curso', 409, 'EN_CURSO');

  try {
    const { simId, iccid, codigo } = await comprarEsimTelnyx(usuarioId);
    const { data, error } = await supabaseAdmin
      .from('esims_usuario')
      .update({
        telnyx_sim_id: simId, iccid, qr_code: codigo, estado: 'sin_saldo',
        ultimo_sync_at: ahora(), version: claim.version + 1, updated_at: ahora(),
      })
      .eq('id', claim.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    await supabaseAdmin.from('esims_usuario').update({ estado: 'pendiente', updated_at: ahora() }).eq('id', claim.id).eq('estado', 'aprovisionando');
    throw e;
  }
}

// ---------------------------------------------------------------- acreditar gigas (idempotente por orden)
async function acreditar(filaId, ordenId, mb) {
  for (let i = 0; i < 6; i++) {
    const fila = await leerFila(filaId);
    if (fila.ordenes_acreditadas.includes(ordenId)) return { fila, ya_acreditada: true };

    const nueva = await actualizarFila(fila, {
      datos_total_mb: Number(fila.datos_total_mb) + mb,
      ordenes_acreditadas: [...fila.ordenes_acreditadas, ordenId],
      estado: fila.estado === 'sin_saldo' ? 'activa' : fila.estado,
    });
    if (nueva) {
      if (fila.estado === 'sin_saldo' && nueva.telnyx_sim_id) {
        try { await habilitarSim(nueva.telnyx_sim_id); }
        catch (e) { console.warn('[telnyx] enable falló (el ciclo de sincronización reintentará):', e.message); }
      }
      return { fila: nueva, ya_acreditada: false };
    }
    await dormir(100 + Math.random() * 200);
  }
  throw fallo('No se pudo acreditar (concurrencia)', 409, 'EN_CURSO');
}

async function procesarOrdenInternet(ordenId) {
  const { data: orden, error } = await supabaseAdmin
    .from('ordenes_internet').select('id, usuario_id, datos_gb, estado').eq('id', ordenId).maybeSingle();
  if (error) throw error;
  if (!orden) throw fallo('Orden no encontrada', 404, 'NO_EXISTE');
  if (!ESTADOS_PAGADOS.includes(orden.estado)) throw fallo('La orden no está pagada', 402, 'NO_PAGADA');

  let fila = await asegurarFila(orden.usuario_id);
  if (fila.ordenes_acreditadas.includes(orden.id)) return { fila, ya_procesada: true };

  if (!fila.telnyx_sim_id) fila = await aprovisionar(fila, orden.usuario_id);

  const { fila: final } = await acreditar(fila.id, orden.id, Math.round(Number(orden.datos_gb) * MB_POR_GB));
  return { fila: final, ya_procesada: false };
}

// ---------------------------------------------------------------- consumo y corte
async function sincronizarFila(fila) {
  if (!fila.telnyx_sim_id || !['activa', 'sin_saldo'].includes(fila.estado)) return fila;

  const r = await telnyx('GET', `/sim_cards/${fila.telnyx_sim_id}`);
  const d = r.data || {};
  const statusTelnyx = d.status?.value || d.status || null;

  let usados = Number(fila.datos_usados_mb);
  let periodo = Number(fila.consumo_periodo_mb);
  const c = d.current_billing_period_consumed_data; // { amount: "123.0", unit: "MB" }
  if (c?.amount != null) {
    const n = Number(c.amount);
    const mb = Math.round(String(c.unit || 'MB').toUpperCase() === 'GB' ? n * MB_POR_GB : n);
    usados += mb >= periodo ? mb - periodo : mb; // si bajó, empezó un periodo de facturación nuevo
    periodo = mb;
  }

  const agotada = usados >= Number(fila.datos_total_mb);
  const estadoNuevo = agotada ? 'sin_saldo' : 'activa';

  const nueva = await actualizarFila(fila, {
    datos_usados_mb: usados, consumo_periodo_mb: periodo, estado: estadoNuevo, ultimo_sync_at: ahora(),
  });
  if (!nueva) return fila; // otro proceso la modificó; el siguiente ciclo recalcula sin perder consumo

  try {
    if (agotada && statusTelnyx === 'enabled') await deshabilitarSim(fila.telnyx_sim_id);
    if (!agotada && statusTelnyx && statusTelnyx !== 'enabled') await habilitarSim(fila.telnyx_sim_id);
  } catch (e) { console.warn('[telnyx] cambio de estado de SIM falló:', e.message); }
  return nueva;
}

async function sincronizarPorSimId(simId) {
  const { data: fila } = await supabaseAdmin.from('esims_usuario').select('*').eq('telnyx_sim_id', simId).maybeSingle();
  return fila ? sincronizarFila(fila) : null;
}

// ---------------------------------------------------------------- cambio de celular
async function reemplazarEsim(usuarioId) {
  let fila = await asegurarFila(usuarioId);
  if (!fila.telnyx_sim_id) throw fallo('Aún no tienes una eSIM', 404, 'SIN_ESIM');

  if (fila.ultimo_reemplazo_at) {
    const dias = (Date.now() - new Date(fila.ultimo_reemplazo_at).getTime()) / 86400000;
    if (dias < REEMPLAZO_DIAS) throw fallo(`Solo puedes cambiar de celular una vez cada ${REEMPLAZO_DIAS} días`, 429, 'LIMITE');
  }

  fila = (await sincronizarFila(fila)) || fila; // capturar el último consumo antes del cambio
  const estadoPrevio = fila.estado;
  const claim = await actualizarFila(fila, { estado: 'reemplazando' });
  if (!claim) throw fallo('Cambio en curso', 409, 'EN_CURSO');

  try {
    const nueva = await comprarEsimTelnyx(usuarioId);
    const restante = Math.max(0, Number(claim.datos_total_mb) - Number(claim.datos_usados_mb));
    const { data, error } = await supabaseAdmin
      .from('esims_usuario')
      .update({
        telnyx_sim_id: nueva.simId, iccid: nueva.iccid, qr_code: nueva.codigo,
        datos_total_mb: restante, datos_usados_mb: 0, consumo_periodo_mb: 0,
        estado: restante > 0 ? 'activa' : 'sin_saldo',
        reemplazos: claim.reemplazos + 1, ultimo_reemplazo_at: ahora(), ultimo_sync_at: ahora(),
        version: claim.version + 1, updated_at: ahora(),
      })
      .eq('id', claim.id).select('*').single();
    if (error) throw error;

    console.log(`[telnyx] eSIM reemplazada usuario=${usuarioId} anterior=${claim.telnyx_sim_id} nueva=${nueva.simId}`);
    try { if (restante > 0) await habilitarSim(nueva.simId); } catch (e) { console.warn('[telnyx] enable nueva falló:', e.message); }
    try { await deshabilitarSim(claim.telnyx_sim_id); } catch (e) { console.warn('[telnyx] disable anterior falló:', e.message); }
    return data;
  } catch (e) {
    await supabaseAdmin.from('esims_usuario').update({ estado: estadoPrevio, updated_at: ahora() }).eq('id', claim.id).eq('estado', 'reemplazando');
    throw e;
  }
}

// ---------------------------------------------------------------- vista para el frontend
function vistaEsim(fila) {
  if (!fila) return { tiene_esim: false };
  const restante = Math.max(0, Number(fila.datos_total_mb) - Number(fila.datos_usados_mb));
  const proximo = fila.ultimo_reemplazo_at
    ? new Date(new Date(fila.ultimo_reemplazo_at).getTime() + REEMPLAZO_DIAS * 86400000).toISOString() : null;
  return {
    tiene_esim: Boolean(fila.telnyx_sim_id),
    estado: fila.estado,
    activation_code: fila.qr_code || null,
    iccid: fila.iccid || null,
    datos_total_mb: Number(fila.datos_total_mb),
    datos_usados_mb: Number(fila.datos_usados_mb),
    datos_restantes_mb: restante,
    reemplazos: fila.reemplazos,
    puede_reemplazar: !proximo || new Date(proximo) <= new Date(),
    reemplazo_disponible_desde: proximo,
    ultimo_sync_at: fila.ultimo_sync_at,
  };
}

// ---------------------------------------------------------------- mantenimiento periódico (cron)
async function reconciliarOrdenes() {
  const desde = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: ordenes } = await supabaseAdmin
    .from('ordenes_internet').select('id, usuario_id').in('estado', ESTADOS_PAGADOS).gte('created_at', desde).limit(200);
  if (!ordenes?.length) return 0;

  const usuarios = [...new Set(ordenes.map((o) => o.usuario_id))];
  const { data: filas } = await supabaseAdmin.from('esims_usuario').select('usuario_id, ordenes_acreditadas').in('usuario_id', usuarios);
  const acreditadas = new Map((filas || []).map((f) => [f.usuario_id, new Set(f.ordenes_acreditadas)]));

  let n = 0;
  for (const o of ordenes) {
    if (acreditadas.get(o.usuario_id)?.has(o.id)) continue;
    try { await procesarOrdenInternet(o.id); n++; }
    catch (e) { console.warn(`[telnyx] reconciliación orden ${o.id}:`, e.message); }
  }
  return n;
}

async function cicloMantenimientoEsims() {
  try {
    const rec = await reconciliarOrdenes();
    const { data: filas } = await supabaseAdmin
      .from('esims_usuario').select('*').in('estado', ['activa', 'sin_saldo']).not('telnyx_sim_id', 'is', null).limit(500);
    for (const f of filas || []) {
      try { await sincronizarFila(f); } catch (e) { console.warn(`[telnyx] sync ${f.telnyx_sim_id}:`, e.message); }
    }
    console.log(`🕒 Ciclo eSIM: ${rec} órdenes reconciliadas, ${(filas || []).length} eSIMs sincronizadas.`);
  } catch (e) {
    console.error('❌ Ciclo eSIM:', e.message);
  }
}

module.exports = {
  procesarOrdenInternet, sincronizarFila, sincronizarPorSimId, reemplazarEsim,
  vistaEsim, asegurarFila, cicloMantenimientoEsims,
};
