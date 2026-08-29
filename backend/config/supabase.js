// ================================================================
// CONFIGURACIÓN DE SUPABASE
// SARIEL'S BACKEND
// ================================================================

const { createClient } = require('@supabase/supabase-js');

// ================================================================
// VARIABLES DE ENTORNO
// ================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ================================================================
// VALIDACIÓN ESTRICTA
// ================================================================

if (!supabaseUrl) {
    throw new Error('Falta la variable de entorno SUPABASE_URL');
}

if (!supabaseAnonKey) {
    throw new Error('Falta la variable de entorno SUPABASE_ANON_KEY');
}

if (!supabaseServiceKey) {
    throw new Error(
        'Falta SUPABASE_SERVICE_ROLE_KEY. ' +
        'El backend no puede arrancar sin la clave de servicio.'
    );
}

// ================================================================
// CLIENTE PÚBLICO
// ================================================================
// Utiliza la ANON KEY.
// Este cliente respeta las políticas RLS de Supabase.

const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
);

// ================================================================
// CLIENTE ADMINISTRADOR
// ================================================================
// Utiliza exclusivamente SERVICE_ROLE.
// NUNCA debe exponerse al frontend.
//
// IMPORTANTE:
// Esta clave permite operaciones privilegiadas y puede
// saltarse RLS. Solo debe utilizarse desde el backend.

const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    supabase,
    supabaseAdmin,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey
};