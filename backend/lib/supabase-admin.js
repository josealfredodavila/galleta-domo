// ================================================================
// backend/lib/supabase-admin.js
// ================================================================
// Cliente único de Supabase con service_role.
// Solo backend, nunca al navegador.
//
// Node cachea el módulo: esta instancia es un singleton.
// Todos los servicios lo importan con:
//   const supabaseAdmin = require('../lib/supabase-admin');
// ================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
        'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno'
    );
}

const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    }
);

module.exports = supabaseAdmin;