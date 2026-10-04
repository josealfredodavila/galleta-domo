// ================================================================
// MENSAJES · CONFIGURACIÓN GLOBAL
// ================================================================
// Supabase, constantes, estado global compartido.
// Debe cargarse ANTES que cualquier otro script de mensajes.
// Depende de: (nada, este es el primero)
// ================================================================

// ================================================================
// CONSTANTES
// ================================================================
var SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

var BOT_ID = 'bot-marquinhos';
var BOT_UUID = '0a000000-0000-4000-8000-000000000001';
var ESTADOS_BUCKET = 'sariels-estados';
var BOT_MAX_HISTORY = 6;

// ================================================================
// SUPABASE
// ================================================================
var db = null;

(function inicializarSupabase() {
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                },
                realtime: {
                    params: { eventsPerSecond: 10 }
                }
            });
            window.supabaseClient = db;
            window.supabase = db; // alias
            console.log('[Mensajes] ✅ Supabase Client inicializado');
        } else {
            console.error('[Mensajes] ❌ Supabase SDK no disponible');
        }
    } catch (e) {
        console.error('[Mensajes] ❌ Error inicializando Supabase:', e);
    }
})();

// ================================================================
// ESTADO GLOBAL
// ================================================================
var user = null;
var current = null;

// Canales realtime
var msgChannel = null;
var callChannel = null;

// Grabadora de audio (notas de voz)
var recorder = null;
var audioChunks = [];
var recordingMode = null;
var recordingStartedAt = 0;

// Grabadora de audio para el bot (voz con IA)
var voiceBotRecorder = null;
var voiceBotChunks = [];
var voiceBotGrabando = false;
var enviandoVozBot = false;

// Scroll
var isUserAtBottom = true;
var unreadCount = 0;
var SCROLL_THRESHOLD = 100;
var scrollRetryTimer = null;

// Perfil
var currentUserProfile = null;

// Estados
var estadosCache = [];
var estadoActualIndex = 0;
var estadoActualUserId = null;
var estadoTimer = null;
var estadoProgresoActual = 0;
var estadoPausado = false;
var estadoVistos = {};
try {
    estadoVistos = JSON.parse(localStorage.getItem('sariels_estados_vistos') || '{}');
} catch (e) {
    estadoVistos = {};
}

// Llamadas (LiveKit)
var incomingId = null;
var call = {
    room: null,
    id: null,
    active: false,
    audio: null,
    video: null,
    screen: null,
    initiator: false
};

// Filtro de conversaciones
var conversationFilter = '';