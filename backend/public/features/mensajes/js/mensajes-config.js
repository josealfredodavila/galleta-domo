// ================================================================
// MENSAJES · CONFIGURACIÓN GLOBAL
// ================================================================
var SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';
var BOT_ID = 'bot-marquinhos';
var BOT_UUID = '0a000000-0000-4000-8000-000000000001';
var ESTADOS_BUCKET = 'sariels-estados';
var BOT_MAX_HISTORY = 6;

var db = null, user = null, current = null, msgChannel = null, callChannel = null, incomingId = null;
var recorder = null, audioChunks = [], recordingMode = null, recordingStartedAt = 0;
var voiceBotRecorder = null, voiceBotChunks = [], voiceBotGrabando = false;
var enviandoVozBot = false;
var isUserAtBottom = true;
var unreadCount = 0;
var SCROLL_THRESHOLD = 100;
var scrollRetryTimer = null;
var currentUserProfile = null;
var estadosCache = [];
var estadoActualIndex = 0;
var estadoActualUserId = null;
var estadoTimer = null;
var estadoProgresoActual = 0;
var estadoPausado = false;
var estadoVistos = {};
try { estadoVistos = JSON.parse(localStorage.getItem('sariels_estados_vistos') || '{}'); } catch (e) { estadoVistos = {}; }
var call = { room: null, id: null, active: false, audio: null, video: null, screen: null, initiator: false };
var conversationFilter = '';

if (typeof window.supabase !== 'undefined' && !window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
console.log('[Mensajes] ✅ Config cargado');