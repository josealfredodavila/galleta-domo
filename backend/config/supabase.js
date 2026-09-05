// ================================================================
// CONFIGURACIÓN DE SUPABASE
// UNIFICADO - CLIENTE PÚBLICO Y ADMIN
// ================================================================

const { createClient } = require('@supabase/supabase-js');

// ================================================================
// VARIABLES DE ENTORNO
// ================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ================================================================
// VALIDACIÓN CRÍTICA
// ================================================================

if (!supabaseUrl) {
    throw new Error('❌ Falta la variable de entorno SUPABASE_URL');
}

if (!supabaseAnonKey) {
    console.warn('⚠️ SUPABASE_ANON_KEY no definida. Operaciones cliente pueden fallar.');
}

if (!supabaseServiceKey) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY no definida. Operaciones admin deshabilitadas.');
}

// ================================================================
// CLIENTE PÚBLICO (frontend/navegador)
// ================================================================

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ================================================================
// CLIENTE ADMIN (solo backend - service_role)
// ================================================================

let supabaseAdmin = null;

if (supabaseServiceKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
} else {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY no definida. Operaciones admin deshabilitadas.');
}

// ================================================================
// EXPORTAR
// ================================================================

module.exports = {
    supabase,
    supabaseAdmin,
    supabaseUrl
};