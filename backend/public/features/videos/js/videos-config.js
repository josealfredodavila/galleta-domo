// ================================================================
// CSARIEL'S · VIDEOS · CONFIG (v1)
// ================================================================
// Única fuente de configuración del módulo de videos.
// - Crea el cliente de Supabase una sola vez (window.sbVideos).
// - Define constantes compartidas (endpoints, tablas, límites).
// - Declara el espacio de nombres window.VideosApp y el estado
//   compartido entre módulos.
// Requiere: window.supabase (SDK UMD) cargado antes de este archivo.
// Los demás módulos NO crean variables globales sueltas: todo vive en
// window.VideosApp.
// ================================================================

(function () {
    'use strict';

    if (window.VideosApp && window.VideosApp.__config) return;

    var SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
    var SUPABASE_CLAVE_PUBLICA = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

    var sbVideos = null;
    try {
        var SDK = window.supabase;
        if (SDK && typeof SDK.createClient === 'function') {
            sbVideos = SDK.createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
        } else {
            console.error('[Videos] SDK de Supabase no disponible.');
        }
    } catch (e) {
        console.error('[Videos] Error creando el cliente de Supabase:', e);
    }

    // Cliente compartido. Lo usan videos-publicar.js y los módulos del feed.
    window.sbVideos = sbVideos;

    var CONFIG = Object.freeze({
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_STORAGE_URL: SUPABASE_URL + '/storage/v1/object/public',

        // Tablas
        TABLA_VIDEOS: 'videos',
        TABLA_VIDEOS_LIKES: 'videos_likes',
        TABLA_VIDEOS_COMENTARIOS: 'videos_comentarios',
        TABLA_VIDEOS_REPORTES: 'videos_reportes',
        TABLA_VIDEO_JOBS: 'video_jobs',
        TABLA_CONTACTOS: 'contactos',

        // RPC
        RPC_INCREMENTAR_REPRODUCCIONES: 'incrementar_reproducciones',
        RPC_MI_PERFIL_PRIVADO: 'mi_perfil_privado',

        // Endpoints del servidor
        ENDPOINT_UPLOAD: '/api/media/upload',
        ENDPOINT_LIBERAR: '/api/media/liberar',
        ENDPOINT_COLA_VIDEO: '/api/video/queue',
        ENDPOINT_ESTADO_VIDEO: '/api/video/status/',

        // Rutas de navegación
        RUTA_PERFIL: '/features/perfil/perfil.html',
        RUTA_VIDEO_COMPARTIR: '/features/videos/videos.html?v=',

        // Interfaz
        OCULTAR_CONTROLES_MS: 3000,
        MOTIVOS_REPORTE: ['Spam', 'Contenido inapropiado', 'Violencia', 'Acoso', 'Otro'],
        PUEBLA_LUGARES: ['puebla', 'cholula', 'atlixco', 'tehuacan', 'izucar'],
        MAX_CARACTERES_DESCRIPCION: 2000,

        // Feed
        LIMITE_VIDEOS_FEED: 30,
        LIMITE_BUSQUEDA_MS: 160,
        LIMITE_SUBIDA_MB: 100,

        // Cola de subida (IndexedDB)
        COLA_DB: 'csVideosCola',
        COLA_STORE: 'items',
        COLA_VERSION: 1,
        MAX_INTENTOS: 8,
        TIMEOUT_SUBIDA_MS: 900000,
        TIMEOUT_COLA_MS: 60000,
        TIMEOUT_ESTADO_MS: 120000,
        SONDEO_JOB_MS: 4000,
        SONDEO_JOB_MAX: 150,

        // Localización
        CLAVE_AUTOPLAY: 'contenido_auto_reproducir'
    });

    // Reacciones: se leen de ReaccionesGlobal cuando ya cargó (ver reacciones()).
    var REACCIONES_RESPALDO = ['❤️', '😂', '🥺', '💎'];

    function reacciones() {
        var RG = window.ReaccionesGlobal;
        return RG && Array.isArray(RG.EMOJIS) ? RG.EMOJIS.slice() : REACCIONES_RESPALDO.slice();
    }

    function reaccionPorDefecto() {
        var RG = window.ReaccionesGlobal;
        return RG && RG.POR_DEFECTO ? RG.POR_DEFECTO : REACCIONES_RESPALDO[0];
    }

    window.VideosApp = window.VideosApp || {};
    var VA = window.VideosApp;

    VA.__config = true;
    VA.CONFIG = CONFIG;
    VA.reacciones = reacciones;
    VA.reaccionPorDefecto = reaccionPorDefecto;
    VA.cliente = function () { return window.sbVideos || null; };

    // Estado compartido entre módulos. Solo los módulos lo modifican
    // a través de sus propias funciones.
    VA.state = {
        sessionUser: null,
        videosPublicados: [],
        siguiendoIds: new Set(),
        pestanaActiva: 'para_ti',
        textoBusqueda: '',
        likeCache: new Map(),
        reaccionesCache: new Map(),
        observerCarrusel: null,
        cardActiva: null,
        indiceActivo: 0,
        videoIdComentariosActual: null,
        vistasContadas: {},
        audioGlobalActivado: false,
        renderVersion: 0,
        timersOcultar: new WeakMap(),
        mapaLeaflet: null,
        colaCache: [],
        colaOcupada: false,
        colaTimer: null,
        jobsSeguidos: {},
        progresoJob: null
    };
})();