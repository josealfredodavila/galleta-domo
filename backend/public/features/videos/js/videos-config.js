// ================================================================
// CSARIEL'S · VIDEOS · CONFIG (v2 - RAÍZ)
// ================================================================
// Única fuente de configuración, estado y utilidades de red.
// Crea el cliente de Supabase y expone window.VideosApp.
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

    window.sbVideos = sbVideos;

    // CONFIGURACIÓN UNIFICADA (Fusión de videos-config y publicar-base)
    var CONFIG = Object.freeze({
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_STORAGE_URL: SUPABASE_URL + '/storage/v1/object/public',
        
        // Proveedor de archivos
        PROVIDER: 'supabase',
        BUCKET: 'videos',
        CARPETA_BORRADORES: 'borradores',

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

        // Rutas
        RUTA_PERFIL: '/features/perfil/perfil.html',
        RUTA_VIDEO_COMPARTIR: '/features/videos/videos.html?v=',

        // Límites y Tiempos
        LIMITE_SUBIDA_MB: 100,
        MAX_VIDEO_MB: 100,
        MAX_VIDEO_MB_R2: 500,
        VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
        IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
        MAX_CARACTERES_DESCRIPCION: 2000,
        PORTADA_TIMEOUT_MS: 4000,
        MAX_BORRADORES_LISTA: 50,

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

        // Interfaz
        OCULTAR_CONTROLES_MS: 3000,
        MOTIVOS_REPORTE: ['Spam', 'Contenido inapropiado', 'Violencia', 'Acoso', 'Otro'],
        PUEBLA_LUGARES: ['puebla', 'cholula', 'atlixco', 'tehuacan', 'izucar'],
        LIMITE_VIDEOS_FEED: 30,
        LIMITE_BUSQUEDA_MS: 160,
        CLAVE_AUTOPLAY: 'contenido_auto_reproducir'
    });

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

    // ESTADO GLOBAL UNIFICADO
    VA.state = {
        // Estado del Feed
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
        
        // Estado de la Cola
        colaCache: [],
        colaOcupada: false,
        colaTimer: null,
        jobsSeguidos: {},
        progresoJob: null,

        // Estado del Compositor (Publicar)
        sonidoSeleccionado: null,
        ubicacionSeleccionada: null,
        archivoVideo: null,
        archivoConAudioMezclado: false,
        previewURL: null,
        portadaURL: null,
        portadaBlob: null,
        tabSonidosActiva: 'parati',
        borradorEditandoId: null,
        guardandoBorrador: false,
        archivoPathRemoto: null,
        portadaPathRemoto: null,
        borradorPaths: null,
        subiendo: false
    };

    // UTILIDADES DE RED GLOBALES (Para videos-cola.js)
    VA.utils = {
        getSession: async function() {
            var sb = window.sbVideos;
            if (!sb) return null;
            try {
                var r = await sb.auth.getSession();
                return (r && r.data && r.data.session) || null;
            } catch(e) { return null; }
        },
        showToast: function(msg, tipo, dur) {
            if (window.csToast) window.csToast(msg, tipo, dur);
            else console.log('[Toast]', msg);
        },
        leerJSONSeguro: async function(respuesta) {
            try { return await respuesta.json(); } catch (e) { return {}; }
        },
        fetchConTimeout: async function(url, opciones, ms) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), ms);
            try {
                const res = await fetch(url, { ...opciones, signal: controller.signal });
                clearTimeout(id);
                return res;
            } catch (e) {
                clearTimeout(id);
                throw e;
            }
        },
        errorDeRespuesta: function(paso, r, j) {
            var error = new Error('Error en ' + paso + ' (' + (r ? r.status : 'Network') + ')');
            error.detalles = j;
            return error;
        }
    };
})();