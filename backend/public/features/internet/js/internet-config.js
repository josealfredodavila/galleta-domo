// ================================================================
// INTERNET · CONFIGURACIÓN GLOBAL
// ================================================================
// Supabase, constantes, redes de pago y estado global.
// Debe cargarse ANTES que cualquier otro script de internet.
// Depende de: (nada, este es el primero)
// ================================================================

// ================================================================
// CONSTANTES
// ================================================================
var SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
var SUPABASE_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';
var BACKEND_URL = 'https://galleta-domo-production.up.railway.app';

var MXN_A_USD_APROX = 0.055;

var REDES_PAGO = [
    { value: 'usdttrc20', moneda: 'USDT', red: 'TRON',     min: 1,  label: 'USDT · TRON (TRC20)' },
    { value: 'usdtbsc',   moneda: 'USDT', red: 'BSC',      min: 1,  label: 'USDT · BSC (BEP20)' },
    { value: 'usdtmatic', moneda: 'USDT', red: 'Polygon',  min: 1,  label: 'USDT · Polygon' },
    { value: 'usdtsol',   moneda: 'USDT', red: 'Solana',   min: 1,  label: 'USDT · Solana' },
    { value: 'usdcsol',   moneda: 'USDC', red: 'Solana',   min: 1,  label: 'USDC · Solana' },
    { value: 'usdcmatic', moneda: 'USDC', red: 'Polygon',  min: 1,  label: 'USDC · Polygon' },
    { value: 'usdcbsc',   moneda: 'USDC', red: 'BSC',      min: 1,  label: 'USDC · BSC (BEP20)' },
    { value: 'usdterc20', moneda: 'USDT', red: 'Ethereum', min: 20, label: 'USDT · Ethereum (ERC20) ⚠ gas alto' },
    { value: 'usdc',      moneda: 'USDC', red: 'Ethereum', min: 20, label: 'USDC · Ethereum (ERC20) ⚠ gas alto' },
];

var POLLING_INTERVAL_MS = 15000;
var POLLING_MAX_INTENTOS = 80; // ~20 min
var PENDIENTE_KEY = 'sariels_orden_internet_pendiente';
var PENDIENTE_MAX_MS = 6 * 60 * 60 * 1000; // 6 horas

// ================================================================
// SUPABASE
// ================================================================
var supabaseClient = null;

(function inicializarSupabase() {
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            window.supabaseClient = supabaseClient;
            window.supabase = supabaseClient; // alias
            console.log('[Internet] ✅ Supabase Client inicializado');
        } else {
            console.error('[Internet] ❌ Supabase SDK no disponible');
        }
    } catch (e) {
        console.error('[Internet] ❌ Error inicializando Supabase:', e);
    }
})();

// ================================================================
// ESTADO GLOBAL
// ================================================================
var selectedPack = null;
var planes = [];

// Estado de la compra y de la eSIM
var pollingInterval = null;
var pollingIntentos = 0;
var ordenActual = null;       // orden en curso (se guarda también en localStorage)
var esimActual = null;        // último estado conocido de la eSIM
var totalAntesMb = 0;         // gigas totales que tenía antes de esta compra
var esperandoEsim = false;    // evita dos esperas en paralelo

// ================================================================
// HELPERS DE CONFIG
// ================================================================
function dormir(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
}

async function getSessionInternet() {
    try {
        if (!supabaseClient) return null;
        var result = await supabaseClient.auth.getSession();
        return result.data.session;
    } catch (e) {
        console.error('[Internet] Error obteniendo sesión:', e);
        return null;
    }
}

// ================================================================
// BANNER DE ERRORES
// ================================================================
function mostrarErrorInternet(mensaje) {
    console.error('[Internet]', mensaje);
}
window.mostrarErrorInternet = mostrarErrorInternet;