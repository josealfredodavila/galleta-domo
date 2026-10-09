/* routes/admin/ai.js: estadísticas IA para el admin.
   Montar en server.js con authMiddleware + adminMiddleware (ambos de server.js),
   que dejan req.user. Este router solo LEE; no escribe nada. */
'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase-admin');

const TIPO_CAMBIO = Number(process.env.TIPO_CAMBIO_MXN_POR_USD) || 0;

function log(evento, datos = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), mod: 'admin-ai', evento, ...datos }));
}

function redondear(x) {
  return Math.round(x * 100) / 100;
}

function rangoMes(mes) {
  const hoy = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
  const y = m ? Number(m[1]) : hoy.getUTCFullYear();
  const mo = m ? Number(m[2]) : hoy.getUTCMonth() + 1;
  if (mo < 1 || mo > 12) return null;
  return {
    etiqueta: `${y}-${String(mo).padStart(2, '0')}`,
    inicio: new Date(Date.UTC(y, mo - 1, 1)).toISOString(),
    fin: new Date(Date.UTC(y, mo, 1)).toISOString()
  };
}

async function datosDeUsuarios(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return {};
  const { data, error } = await supabase.from('usuarios').select('id, email, handle').in('id', unicos);
  if (error) throw error;
  return Object.fromEntries((data || []).map((u) => [u.id, { email: u.email, handle: u.handle }]));
}

// GET /api/admin/ai/uso?mes=YYYY-MM
router.get('/uso', async (req, res) => {
  const rango = rangoMes(req.query.mes);
  if (!rango) return res.status(400).json({ success: false, error: 'mes inválido (YYYY-MM)' });

  try {
    const [{ data: busquedas, error: e1 }, { data: mensajes, error: e2 }] = await Promise.all([
      supabase.from('v_uso_busquedas_usuario').select('*').gte('mes', rango.inicio).lt('mes', rango.fin).limit(500),
      supabase.from('v_uso_mensajes_usuario').select('*').limit(500)
    ]);
    if (e1 || e2) throw e1 || e2;

    const usuarios = await datosDeUsuarios([...(busquedas || []), ...(mensajes || [])].map((r) => r.usuario_id));
    const conDatos = (r) => ({ ...r, ...(usuarios[r.usuario_id] || {}) });

    return res.json({
      success: true,
      data: {
        mes: rango.etiqueta,
        busquedas: (busquedas || []).map(conDatos),
        mensajes: (mensajes || []).map(conDatos)
      }
    });
  } catch (e) {
    log('uso_error', { codigo: e.code, mensaje: e.message });
    return res.status(500).json({ success: false, error: 'No se pudo cargar el uso' });
  }
});

// GET /api/admin/ai/pruebas
router.get('/pruebas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('v_usuarios_prueba_activa')
      .select('*')
      .order('dias_restantes', { ascending: true })
      .limit(500);
    if (error) throw error;

    const usuarios = await datosDeUsuarios((data || []).map((r) => r.usuario_id));
    return res.json({
      success: true,
      data: (data || []).map((r) => ({ ...r, ...(usuarios[r.usuario_id] || {}) }))
    });
  } catch (e) {
    log('pruebas_error', { codigo: e.code, mensaje: e.message });
    return res.status(500).json({ success: false, error: 'No se pudieron cargar las pruebas' });
  }
});

// GET /api/admin/ai/webhooks?limit=50
router.get('/webhooks', async (req, res) => {
  const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  try {
    const { data, error } = await supabase
      .from('ai_webhook_eventos')
      .select('event_id, proveedor, tipo, estado, motivo, created_at')
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  } catch (e) {
    log('webhooks_error', { codigo: e.code, mensaje: e.message });
    return res.status(500).json({ success: false, error: 'No se pudieron cargar los eventos' });
  }
});

// GET /api/admin/ai/ganancia?mes=YYYY-MM
// Ingresos en MXN (pedidos pagados) y costo de APIs en USD (uso). Convierte solo si
// TIPO_CAMBIO_MXN_POR_USD está configurada; si no, la ganancia queda en null.
router.get('/ganancia', async (req, res) => {
  const rango = rangoMes(req.query.mes);
  if (!rango) return res.status(400).json({ success: false, error: 'mes inválido (YYYY-MM)' });

  try {
    const [{ data: pagos, error: e1 }, { data: uso, error: e2 }] = await Promise.all([
      supabase.from('ai_pedidos_pago').select('plan, monto_mxn')
        .eq('estado', 'pagado').gte('pagado_at', rango.inicio).lt('pagado_at', rango.fin),
      supabase.from('v_uso_busquedas_usuario').select('costo_apis_usd')
        .gte('mes', rango.inicio).lt('mes', rango.fin)
    ]);
    if (e1 || e2) throw e1 || e2;

    const ingresosMxn = (pagos || []).reduce((s, p) => s + Number(p.monto_mxn), 0);
    const costoUsd = (uso || []).reduce((s, u) => s + Number(u.costo_apis_usd), 0);
    const costoMxn = TIPO_CAMBIO ? costoUsd * TIPO_CAMBIO : null;

    const porPlan = {};
    for (const p of pagos || []) {
      porPlan[p.plan] = porPlan[p.plan] || { pedidos: 0, ingresos_mxn: 0 };
      porPlan[p.plan].pedidos += 1;
      porPlan[p.plan].ingresos_mxn = redondear(porPlan[p.plan].ingresos_mxn + Number(p.monto_mxn));
    }

    return res.json({
      success: true,
      data: {
        mes: rango.etiqueta,
        pedidos_pagados: (pagos || []).length,
        ingresos_mxn: redondear(ingresosMxn),
        costo_apis_usd: redondear(costoUsd),
        costo_apis_mxn: costoMxn === null ? null : redondear(costoMxn),
        ganancia_mxn: costoMxn === null ? null : redondear(ingresosMxn - costoMxn),
        por_plan: porPlan,
        nota: 'El costo de APIs incluye usuarios de prueba (sin ingreso).'
      }
    });
  } catch (e) {
    log('ganancia_error', { codigo: e.code, mensaje: e.message });
    return res.status(500).json({ success: false, error: 'No se pudo calcular la ganancia' });
  }
});

module.exports = router;