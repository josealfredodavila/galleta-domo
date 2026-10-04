// ================================================================
// MENSAJES · CONFIG
// ================================================================
// Constantes globales, límites, IDs, buckets y estado compartido.
// Se carga PRIMERO. Todos los demás archivos dependen de este.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// COMPATIBLE CON: tablas Supabase reales (usuarios, mensajes_chat,
//                 contactos, perfiles_publicos, estados, estados_vistas,
//                 llamadas, llamadas_participantes).
// ================================================================

'use strict';

// ================================================================
// SUPABASE
// ================================================================
const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

// Cliente global (se inicializa de forma idempotente más abajo)
let db = null;

// ================================================================
// BOT · MARQUINHOS
// ================================================================
const BOT_ID = 'bot-marquinhos';
const BOT_UUID = '0a000000-0000-4000-8000-000000000001';
const BOT_NOMBRE = 'Marquinhos';
const BOT_MAX_HISTORY = 6;

// ================================================================
// BUCKETS DE STORAGE
// ================================================================
const ESTADOS_BUCKET = 'sariels-estados';
const AVATARS_BUCKET = 'sariels-avatars';
const CHAT_AUDIO_BUCKET = 'chat-audio';
const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';

// ================================================================
// LÍMITES DE ARCHIVOS
// ================================================================
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;        // 5 MB  · avatar / estados
const MAX_FILE_SIZE = 50 * 1024 * 1024;        // 50 MB · adjuntos chat
const MAX_FOTO_BYTES = 10 * 1024 * 1024;       // 10 MB · fotos chat
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;      // 50 MB · video chat
const MAX_AUDIO_SEGUNDOS = 5 * 60;             // 5 min · audio
const MAX_VIDEO_SEGUNDOS = 2 * 60;             // 2 min · video
const MAX_TEXTO_LEN = 1000;                    // 1000 caracteres · texto

// ================================================================
// SCROLL
// ================================================================
const SCROLL_THRESHOLD = 100;
const SCROLL_RETRY_MS = 100;
const SCROLL_RETRY_MAX = 10;

// ================================================================
// ESTADOS · TIEMPO DE VISUALIZACIÓN
// ================================================================
const ESTADO_DURACION_MS = 5000; // 5 segundos por estado

// ================================================================
// LIVEKIT · LLAMADAS
// ================================================================
const LIVEKIT_CONFIG = {
    url: 'wss://csariels-domo-57ujk04t.livekit.cloud'
};

// ================================================================
// UTILIDAD · UUID v4 regex
// ================================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ================================================================
// POLYFILL · Promise.allSettled
// ================================================================
if (typeof Promise.allSettled !== 'function') {
    Promise.allSettled = function(promises) {
        return Promise.all((promises || []).map(function(p) {
            return Promise.resolve(p).then(
                function(value) { return { status: 'fulfilled', value: value }; },
                function(reason) { return { status: 'rejected', reason: reason }; }
            );
        }));
    };
}

// ================================================================
// ESTADO GLOBAL DE LA APP
// ================================================================
let user = null;                     // Usuario autenticado (auth.user)
let current = null;                  // Conversación activa { id, profile, bot }
let currentUserProfile = null;       // Perfil del usuario logueado (tabla usuarios)
let conversationFilter = '';         // Filtro del buscador de conversaciones

// ================================================================
// ESTADO DEL CHAT
// ================================================================
let isUserAtBottom = true;           // ¿El usuario está pegado al fondo?
let unreadCount = 0;                 // Mensajes no leídos en el chat activo
let scrollRetryTimer = null;         // Timer para reintentar scroll
let msgChannel = null;               // Canal realtime de mensajes
let callChannel = null;              // Canal realtime de llamadas
let incomingId = null;               // ID de llamada entrante

// ================================================================
// GRABACIÓN DE AUDIO · NOTA NORMAL
// ================================================================
let recorder = null;
let audioChunks = [];
let recordingMode = null;            // 'bot' | 'normal'
let recordingStartedAt = 0;

// ================================================================
// GRABACIÓN DE AUDIO · VOZ AL BOT
// ================================================================
let voiceBotRecorder = null;
let voiceBotChunks = [];
let voiceBotGrabando = false;
let enviandoVozBot = false;

// ================================================================
// ESTADOS · VISOR
// ================================================================
let estadosCache = [];
let estadoActualIndex = 0;
let estadoActualUserId = null;
let estadoTimer = null;
let estadoProgresoActual = 0;
let estadoPausado = false;
let estadoVistos = {};

// Cargar estados vistos de localStorage (con try/catch por si está corrupto)
try {
    estadoVistos = JSON.parse(localStorage.getItem('sariels_estados_vistos') || '{}');
    if (!estadoVistos || typeof estadoVistos !== 'object') estadoVistos = {};
} catch (e) {
    estadoVistos = {};
}

// ================================================================
// LLAMADAS · ESTADO ACTIVO
// ================================================================
const call = {
    room: null,
    id: null,
    active: false,
    audio: null,
    video: null,
    screen: null,
    initiator: false
};

// ================================================================
// DEBUG · LOGS CONDICIONALES
// ================================================================
if (typeof window.DEBUG_CHAT === 'undefined') {
    window.DEBUG_CHAT = false;
}

// ================================================================
// INICIALIZACIÓN DEL CLIENTE SUPABASE (idempotente)
// ================================================================
(function inicializarSupabaseConfig() {
    try {
        // 1. Ya existe un cliente global → reutilizar
        if (window.__sarielsSupabaseSingleton && typeof window.__sarielsSupabaseSingleton.from === 'function') {
            db = window.__sarielsSupabaseSingleton;
            window.supabaseClient = db;
            return;
        }

        if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
            db = window.supabaseClient;
            window.__sarielsSupabaseSingleton = db;
            return;
        }

        // 2. SDK disponible → crear cliente
        var SDK = window.supabase;
        if (!SDK || typeof SDK.createClient !== 'function') {
            console.warn('[Mensajes/Config] Supabase SDK no disponible todavía');
            return;
        }

        db = SDK.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
        window.__sarielsSupabaseSingleton = db;

        if (window.DEBUG_CHAT) {
            console.log('[Mensajes/Config] ✅ Supabase Client inicializado');
        }
    } catch (e) {
        console.error('[Mensajes/Config] ❌ Error inicializando Supabase:', e);
    }
})();

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.BOT_ID = BOT_ID;
window.BOT_UUID = BOT_UUID;
window.BOT_NOMBRE = BOT_NOMBRE;
window.BOT_MAX_HISTORY = BOT_MAX_HISTORY;
window.ESTADOS_BUCKET = ESTADOS_BUCKET;
window.AVATARS_BUCKET = AVATARS_BUCKET;
window.CHAT_AUDIO_BUCKET = CHAT_AUDIO_BUCKET;
window.CHAT_ATTACHMENTS_BUCKET = CHAT_ATTACHMENTS_BUCKET;
window.MAX_IMAGE_SIZE = MAX_IMAGE_SIZE;
window.MAX_FILE_SIZE = MAX_FILE_SIZE;
window.MAX_FOTO_BYTES = MAX_FOTO_BYTES;
window.MAX_VIDEO_BYTES = MAX_VIDEO_BYTES;
window.MAX_AUDIO_SEGUNDOS = MAX_AUDIO_SEGUNDOS;
window.MAX_VIDEO_SEGUNDOS = MAX_VIDEO_SEGUNDOS;
window.MAX_TEXTO_LEN = MAX_TEXTO_LEN;
window.SCROLL_THRESHOLD = SCROLL_THRESHOLD;
window.SCROLL_RETRY_MS = SCROLL_RETRY_MS;
window.SCROLL_RETRY_MAX = SCROLL_RETRY_MAX;
window.ESTADO_DURACION_MS = ESTADO_DURACION_MS;
window.LIVEKIT_CONFIG = LIVEKIT_CONFIG;
window.UUID_RE = UUID_RE;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Config] ✅ Config cargado');
}