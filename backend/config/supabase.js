// ================================================================
// CONFIGURACIÓN DE SUPABASE
// UNIFICADO - CLIENTE PÚBLICO Y ADMIN
// ================================================================
// IMPORTANTE: No crashea el proceso si falta alguna variable.
// Solo muestra warnings para permitir que el Worker arranque.
// ================================================================

const { createClient } = require('@supabase/supabase-js');

// ================================================================
// VARIABLES DE ENTORNO
// ================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ================================================================
// VALIDACIÓN CRÍTICA (sin crashear el proceso)
// ================================================================

if (!supabaseUrl) {
    console.warn('⚠️ SUPABASE_URL no definida. Configuración de Supabase deshabilitada.');
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

let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
    console.warn('⚠️ Cliente público de Supabase no inicializado.');
}

// ================================================================
// CLIENTE ADMIN (solo backend - service_role)
// ================================================================

let supabaseAdmin = null;

if (supabaseUrl && supabaseServiceKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
} else {
    console.warn('⚠️ Cliente admin de Supabase no inicializado.');
}

// ================================================================
// EXPORTAR
// ================================================================

module.exports = {
    supabase,
    supabaseAdmin,
    supabaseUrl
};