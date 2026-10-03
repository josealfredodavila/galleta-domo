// ================================================================
// MURO · CONFIGURACIÓN GLOBAL
// ================================================================
// Supabase, constantes, variables globales y emojis.
// Debe cargarse ANTES que cualquier otro script del muro.
// Depende de: (nada, este es el primero)
// ================================================================

// ================================================================
// SUPABASE
// ================================================================
var supabaseUrl = 'https://zultnlogdoajehbswlih.supabase.co';
var supabaseKey = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';
var supabaseClient = null;

(function inicializarSupabase() {
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
            window.supabaseClient = supabaseClient;
            window.supabase = supabaseClient; // alias
            console.log('[Muro] ✅ Supabase Client inicializado');
        } else {
            console.error('[Muro] ❌ Supabase SDK no disponible');
            if (window.mostrarErrorEnPantalla) {
                window.mostrarErrorEnPantalla('No se pudo cargar la conexión a Supabase.');
            }
        }
    } catch (e) {
        console.error('[Muro] ❌ Error inicializando Supabase:', e);
        if (window.mostrarErrorEnPantalla) {
            window.mostrarErrorEnPantalla('Error inicializando Supabase: ' + e.message);
        }
    }
})();

// ================================================================
// CONSTANTES
// ================================================================
var BACKEND_URL = 'https://galleta-domo-production.up.railway.app';
var COMISION_PORCENTAJE = 0.03;
var TIMEOUT_MINUTOS = 30;
var POSTS_PER_PAGE = 10;
var SUPABASE_PUBLIC_PREFIX = 'https://zultnlogdoajehbswlih.supabase.co/storage/v1/object/public/';

// ================================================================
// VARIABLES GLOBALES
// ================================================================
var sessionUser = null;
var currentPage = 0;
var isLoading = false;
var hasMorePosts = true;
var precioActual = 4.50;
var publicando = false;
var muroChannel = null;
var isRealtimeProcessing = false;
var likeCache = new Map();
var likeCacheOrden = [];
var observerGlobal = null;

// Temas
var temasDisponibles = [];
var temaSeleccionado = null;
var filtroTemasActivo = false;
var temasUsuario = [];

// Pagos
var pagoActual = {
    ventaId: null,
    paymentId: null,
    expiresAt: null,
    contadorInterval: null,
    pollingInterval: null,
    postId: null
};

// ================================================================
// EMOJIS DISPONIBLES
// ================================================================
var emojisDisponibles = ['😀','😁','😂','🤣','😃','😄','😅','😊','😇','🙂','😉','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','👾','🤖','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🔥','✨','🌟','💫','⭐','⚡','💥','💢','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌊','💧','💦','☔','☂️','🌂','🎉','🎊','🎈','🎁','🎂','🍰','🧁','🍕','🍔','🍟','🌮','🌯','🍿','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🍾','☕','🍵','🧃','🥤','🧋','🍼','🥛','💊','🌿','🍃','🍀','🍁','🍂','🌸','🌺','🌻','🌹','🌷','🌼','💐','🌱','🌲','🌳','🌴','🌵','🌾','🍄','🐚','🪨','🌍','🌎','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌚','🌝','🌞','🪐','☄️','🌠','🌌'];

// ================================================================
// HELPERS DE CONFIG
// ================================================================
function esUrlSeguraMuro(url) {
    return typeof url === 'string' && url.indexOf(SUPABASE_PUBLIC_PREFIX) === 0;
}

async function getSessionMuro() {
    try {
        if (!supabaseClient) return null;
        var result = await supabaseClient.auth.getSession();
        return result.data.session;
    } catch (e) {
        console.error('Error obteniendo sesión:', e);
        return null;
    }
}

// ================================================================
// BANNER DE ERRORES (Debug)
// ================================================================
function mostrarErrorEnPantalla(mensaje) {
    var banner = document.getElementById('errorBanner');
    var texto = document.getElementById('errorBannerText');
    if (banner && texto) {
        texto.textContent = mensaje;
        banner.style.display = 'block';
    } else {
        console.error('[Muro]', mensaje);
    }
}
window.mostrarErrorEnPantalla = mostrarErrorEnPantalla;

window.addEventListener('error', function (event) {
    mostrarErrorEnPantalla((event.message || 'Error desconocido') + ' — línea ' + event.lineno);
});
window.addEventListener('unhandledrejection', function (event) {
    mostrarErrorEnPantalla('Promesa rechazada: ' + (event.reason && event.reason.message ? event.reason.message : event.reason));
});