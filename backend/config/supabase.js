// ================================================================
// CONFIGURACIÓN DE SUPABASE (ajustada para arranque seguro)
// ================================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    // Esta variable ES crítica: sin URL no se puede operar.
    throw new Error('Falta la variable de entorno SUPABASE_URL');
}

if (!supabaseAnonKey) {
    // La anon key es necesaria para operaciones cliente; avisamos pero no forzamos crash.
    console.warn('⚠️ SUPABASE_ANON_KEY no definida. Operaciones cliente pueden fallar.');
}

// Cliente público (usable por frontend desde el navegador).
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente administrador: sólo se crea si la SERVICE_ROLE_KEY está presente.
// No hacemos throw aquí: permitimos que el servidor arranque y que cada ruta
// que requiera privilegios compruebe la existencia de supabaseAdmin.
let supabaseAdmin = null;
if (supabaseServiceKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
} else {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY no definida. Operaciones admin deshabilitadas.');
}

// Exportar sólo los clientes y la URL; NO exportar claves en texto plano.
module.exports = {
    supabase,
    supabaseAdmin,
    supabaseUrl
};
