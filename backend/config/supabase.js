// ================================================================
// CONFIGURACIÓN DE SUPABASE
// ================================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente público (para el frontend)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente de servicio (para el backend - con más permisos)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

module.exports = {
    supabase,
    supabaseAdmin,
    supabaseUrl,
    supabaseAnonKey
};