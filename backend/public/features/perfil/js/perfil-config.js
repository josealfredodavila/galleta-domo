// ================================================================
// PERFIL · CONFIGURACIÓN GLOBAL
// ================================================================
// Constantes, cliente Supabase y estado compartido.
// Debe cargarse ANTES que cualquier otro script del perfil.
// Depende de: (nada, este es el primero)
// ================================================================

// ================================================================
// SUPABASE
// ================================================================
function cli() {
    if (!window.supabaseClient && window.supabase) {
        window.supabaseClient = window.supabase.createClient(
            'https://zultnlogdoajehbswlih.supabase.co',
            'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu',
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );
    }
    return window.supabaseClient;
}

// ================================================================
// CONSTANTES
// ================================================================
const PRO_PLAN_ID = 1;
const PRO_PRECIO_MXN = 60;
const PRO_DURACION_DIAS = 30;
const SESSION_TIMEOUT_MS = 15000;
const CACHE_DURATION = 30000;
const CONTADORES_CACHE_DURATION = 5 * 60 * 1000;

const ENV = {
    isProduction: window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1'),
    isTestnet: true,
    networkName: 'Polygon Amoy Testnet',
    networkChainId: '0x13882',
    networkCurrency: 'MATIC',
    networkRPC: 'https://rpc-amoy.polygon.technology/',
    networkExplorer: 'https://www.oklink.com/amoy'
};

const BACKEND_URL = window.location.origin;
const API_ENDPOINTS = {
    pagos: BACKEND_URL + '/api/payments'
};

const COLUMNAS_PERFIL = [
    'id', 'email', 'nombre', 'handle', 'username', 'bio', 'avatar_url',
    'portada_url', 'ubicacion', 'sitio_web', 'verificado', 'es_admin',
    'tokens', 'tokens_acumulados', 'progreso_canje', 'puede_canjear',
    'nft_canjeado', 'domos', 'tokens_para_canje',
    'plan', 'plan_expira_at', 'plan_meta', 'membresia_live_hasta',
    'telefono', 'numero_verificado',
    'online', 'ultima_conexion', 'offline_desde',
    'conexion_tipo', 'conexion_activa', 'conexion_velocidad',
    'conexion_senal', 'conexion_ultimo_cambio',
    'wallet_address', 'stripe_account_id',
    'pais_codigo', 'roaming_activo', 'ciudad',
    'minutos_disponibles', 'sms_disponibles',
    'idioma_preferido_id', 'avatar_verificacion_url',
    'seguidores_count', 'siguiendo_count',
    'created_at', 'updated_at'
].join(', ');

// ================================================================
// EMOJIS
// ================================================================
const EMOJIS_REACCION = ['❤️', '😊', '🔥', '👏', '🎉', '💎', '🤩', '😍', '😂'];

var emojisDisponibles = ['😀','😁','😂','🤣','😃','😄','😅','😊','😇','🙂','😉','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','👾','🤖','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🔥','✨','🌟','💫','⭐','⚡','💥','💢','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌊','💧','💦','☔','☂️','🌂','🎉','🎊','🎈','🎁','🎂','🍰','🧁','🍕','🍔','🍟','🌮','🌯','🍿','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🍾','☕','🍵','🧃','🥤','🧋','🍼','🥛','💊','🌿','🍃','🍀','🍁','🍂','🌸','🌺','🌻','🌹','🌷','🌼','💐','🌱','🌲','🌳','🌴','🌵','🌾','🍄','🐚','🪨','🌍','🌎','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌚','🌝','🌞','🪐','☄️','🌠','🌌'];

// ================================================================
// ESTADO COMPARTIDO
// ================================================================
var perfilCache = null;
var ultimaActualizacion = 0;
var contadoresSocialesCache = null;
var ultimaActualizacionContadores = 0;

// Estado online/offline
var tiempoInactividad = 0;
var maxInactividad = 300000;
var detectorInactividadIniciado = false;

// Amigos
var canalAmigos = null;
var idsAmigos = new Set();
var temporizadorAmigos = null;

// Conexión
var estadoConexion = {
    tipo: 'wifi',
    activa: true,
    velocidad: '0 Mbps',
    señal: 100,
    operador: "Sariel's Net",
    datos_usados: 0,
    datos_limite: 0,
    datos_restantes: 0
};
var ultimaClaveConexionGuardada = '';
var escuchaConexionIniciada = false;

// QR Scanner
var qrScannerInterval = null;
var scannerActive = false;
var qrHistorial = [];
var qrScanningLock = false;

// Notificaciones
var canalNotificaciones = null;

// Publicaciones del perfil
var archivosSeleccionados = { imagen: null, video: null };

// Pagos Pro
var pollingPagoProInterval = null;

// ================================================================
// EXPORTAR A WINDOW (para debug y acceso cross-archivo)
// ================================================================
try {
    Object.defineProperty(window, 'perfilCache', {
        get: function () { return perfilCache; },
        set: function (v) { perfilCache = v; },
        configurable: true
    });
} catch (e) {
    window.perfilCache = perfilCache;
}