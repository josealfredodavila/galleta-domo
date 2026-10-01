// backend/services/telnyx/supabase.js
// Clientes Supabase propios del módulo Telnyx (el server.js real NO exporta supabaseAdmin ni clienteDelUsuario).
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

// Solo backend (SERVICE_ROLE): escrituras de aprovisionamiento y webhooks
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Cliente con el JWT del usuario: respeta RLS (ordenes_esim_select_self)
function clienteDelUsuario(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

module.exports = { supabaseAdmin, clienteDelUsuario };
