// ================================================================
// MENSAJES · CONFIG
// ================================================================
// Constantes globales del módulo. Se carga PRIMERO.
// ================================================================

// ---- Supabase ----
const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

// ---- Bot Marquinhos ----
const BOT_ID = 'bot-marquinhos';
const BOT_UUID = '0a000000-0000-4000-8000-000000000001';
const BOT_MAX_HISTORY = 6;

// ---- Storage buckets ----
const ESTADOS_BUCKET = 'sariels-estados';
const AVATARS_BUCKET = 'sariels-avatars';
const CHAT_AUDIO_BUCKET = 'chat-audio';
const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';

// ---- Límites ----
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;         // 5 MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;         // 50 MB
const SCROLL_THRESHOLD = 100;
const ESTADO_DURACION_MS = 5000;                 // 5s por estado

// ---- Cliente global (se inicializa en mensajes-auth.js) ----
let db = null;
let user = null;

// ---- Estado global de la app ----
let current = null;                  // Conversación actual
let currentUserProfile = null;       // Perfil del usuario logueado
let conversationFilter = '';         // Filtro del buscador
let isUserAtBottom = true;           // Scroll del chat
let unreadCount = 0;                 // Mensajes no leídos
let scrollRetryTimer = null;

// ---- Canales realtime ----
let msgChannel = null;
let callChannel = null;

// ---- Grabación de audio ----
let recorder = null;
let audioChunks = [];
let recordingMode = null;
let recordingStartedAt = 0;
let voiceBotRecorder = null;
let voiceBotChunks = [];
let voiceBotGrabando = false;
let enviandoVozBot = false;

// ---- Estados ----
let estadosCache = [];
let estadoActualIndex = 0;
let estadoActualUserId = null;
let estadoTimer = null;
let estadoProgresoActual = 0;
let estadoPausado = false;
let estadoVistos = {};

// ---- Llamadas ----
const call = {
    room: null,
    id: null,
    active: false,
    audio: null,
    video: null,
    screen: null,
    initiator: false
};
let incomingId = null;

// ---- Cargar vistos de localStorage ----
try {
    estadoVistos = JSON.parse(localStorage.getItem('sariels_estados_vistos') || '{}');
} catch (e) {
    estadoVistos = {};
}

console.log('[Mensajes] ✅ Config cargado');