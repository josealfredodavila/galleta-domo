/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · BASE (v1)
   ================================================================
   Primer módulo de la división de videos-publicar.js.
   Contiene solo lo compartido por todos los demás módulos:
   - Constantes (capas z-index, configuración, claves de almacenamiento).
   - Catálogos de sonidos y ubicaciones.
   - Estado compartido de la publicación.
   - Utilidades (DOM, texto, URLs temporales, Supabase, sesión).
   No crea interfaz ni hace peticiones de subida.
   Expuesto en window.VideosPublicarNS:
     NS.C      → constantes
     NS.DATA   → catálogos
     NS.state  → estado compartido
     NS.u      → utilidades
   Lo carga videos-publicar.js (entrada); no va en videos.html.
   ================================================================ */

(function () {
    'use strict';

    var NS = window.VideosPublicarNS = window.VideosPublicarNS || {};
    if (NS.C) return;

    /* ----------------------------------------------------------------
       CONSTANTES
       ---------------------------------------------------------------- */

    var Z = {
        SHEET_BACKDROP: 100000,
        SHEET: 100001,
        PREVIEW: 100030,
        CONFIRM: 100010,
        TOAST: 100020
    };

    /* Ocultan elementos del feed que ya no se usan (reacciones antiguas). */
    var FEED_UI = {
        ocultarLikes: true,
        ocultarCompartir: true,
        ocultarReacciones: true
    };

    /* Escudo con la "C" sobre los videos. ACTIVA: false lo quita. */
    var MARCA_AGUA = {
        ACTIVA: true,
        OPACIDAD: 1
    };

    /* Colores de las barras del ecualizador. */
    var EQ_COLORES = ['#ff2bd6', '#ff3d7f', '#00f0ff', '#39ff14', '#ffe600', '#b026ff'];

    var IDB_NAME = 'csVideosPublicar';
    var IDB_STORE = 'kv';
    var KEY_META = 'meta';
    var KEY_FILE = 'file';
    var MAX_FILE_SIZE_FOR_IDB = 15 * 1024 * 1024;

    var FAV_KEY = 'cs_sonidos_favoritos_v1';
    var DURACION_PREVIEW_MS = 5000;

    var LIMITE_BORRADORES = 3;
    var RUTA_MEMBRESIA_PRO = '/membresia-pro.html';

    var SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
    var SUPABASE_STORAGE_URL = SUPABASE_URL + '/storage/v1/object/public/audios';

    var CONFIG = {
        PROVIDER: 'supabase',
        BUCKET: 'videos',
        CARPETA_BORRADORES: 'borradores',
        MAX_VIDEO_MB: 100,
        MAX_VIDEO_MB_R2: 500,
        VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
        IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
        PORTADA_TIMEOUT_MS: 4000,
        MAX_BORRADORES_LISTA: 50
    };

    /* Estilo visual por género: degradado y glifo. Sin imágenes externas. */
    var GENEROS = {
        phonk:   { label: 'Phonk',   bg: 'linear-gradient(135deg,#ff2bd6,#3b0a4f 70%)', glyph: '◆' },
        epico:   { label: 'Épico',   bg: 'linear-gradient(135deg,#ffe600,#6b3d00 70%)', glyph: '✦' },
        comedia: { label: 'Comedia', bg: 'linear-gradient(135deg,#39ff14,#0b3d14 70%)', glyph: '◉' },
        trap:    { label: 'Trap',    bg: 'linear-gradient(135deg,#ff3d7f,#2a0010 70%)', glyph: '▲' },
        house:   { label: 'House',   bg: 'linear-gradient(135deg,#00f0ff,#03303d 70%)', glyph: '◈' },
        electro: { label: 'Electro', bg: 'linear-gradient(135deg,#b026ff,#00f0ff 120%)', glyph: '●' }
    };

    /* ----------------------------------------------------------------
       CATÁLOGOS
       ---------------------------------------------------------------- */

    var SONIDOS_SEED = {
        parati: [
            { id: 'sd-phonk', nombre: 'Phonk Bass Drop', artista: 'Echoes of Lumen', genero: 'phonk', url: SUPABASE_STORAGE_URL + '/echoes_of_lumen-phonk-bass-neon-aura-night-drive-588671.mp3', duracion: 128 },
            { id: 'sd-suspenso', nombre: 'Suspenso Épico', artista: 'Absolute Sound', genero: 'epico', url: SUPABASE_STORAGE_URL + '/absolutesound-suspense-tense-atmosphere-514617.mp3', duracion: 137 },
            { id: 'sd-comedia', nombre: 'Risa y Caos', artista: 'Alex Morgan', genero: 'comedia', url: SUPABASE_STORAGE_URL + '/alex-morgan-comedy-bgm-funny-background-music-583242.mp3', duracion: 62 },
            { id: 'sd-n1', nombre: 'Brazilian Phonk', artista: 'Sub Clair', genero: 'phonk', url: SUPABASE_STORAGE_URL + '/sub_clair-brazilian-phonk-instrumental-585588.mp3', duracion: 120 },
            { id: 'sd-n2', nombre: 'Sosin Phonk Music', artista: 'Sosin', genero: 'phonk', url: SUPABASE_STORAGE_URL + '/sosin-phonk-phonk-music-621003.mp3', duracion: 110 },
            { id: 'sd-n3', nombre: 'Phonk No Copyright', artista: 'ARP Media', genero: 'phonk', url: SUPABASE_STORAGE_URL + '/arpmedia-phonk-no-copyright-music-588451.mp3', duracion: 95 },
            { id: 'sd-n4', nombre: 'Gym Workout', artista: 'Echoes of Lumen', genero: 'trap', url: SUPABASE_STORAGE_URL + '/echoes_of_lumen-sport-phonk-gym-workout-586978.mp3', duracion: 105 }
        ],
        populares: [
            { id: 'sd-trend1', nombre: 'Aesthetic Vibes', artista: 'Adrihuwu', genero: 'house', url: SUPABASE_STORAGE_URL + '/adrihuwu-adrihuwu-join-my-server-209103.mp3', duracion: 134 },
            { id: 'sd-trend2', nombre: 'Corrido Bélico (Trap)', artista: 'LN Plus Music', genero: 'trap', url: SUPABASE_STORAGE_URL + '/lnplusmusic-cuban-latin-trap-beat-469610.mp3', duracion: 127 },
            { id: 'sd-reward', nombre: 'Gancho de Éxito', artista: 'Freesound Community', genero: 'electro', url: SUPABASE_STORAGE_URL + '/freesound_community-victoria_claudia_baja_fidelidad_almacen_exito_cali-79564.mp3', duracion: 55 },
            { id: 'sd-n5', nombre: 'Dark Aggressive Bass', artista: 'Watermelon Beats', genero: 'phonk', url: SUPABASE_STORAGE_URL + '/watermelon_beats-phonk-drift-dark-aggressive-bass-612474.mp3', duracion: 140 },
            { id: 'sd-n6', nombre: 'House Phonk', artista: 'Alex Zavesa', genero: 'house', url: SUPABASE_STORAGE_URL + '/alexzavesa-house-phonk-short-version-613118.mp3', duracion: 85 },
            { id: 'sd-n7', nombre: 'Phonk Instrumental', artista: 'Sub Clair', genero: 'phonk', url: SUPABASE_STORAGE_URL + '/sub_clair-phonk-instrumental-610091.mp3', duracion: 115 },
            { id: 'sd-n8', nombre: 'Ultrakill', artista: 'Cloud System', genero: 'electro', url: SUPABASE_STORAGE_URL + '/cloudsystem-ultrakill-46s-621400.mp3', duracion: 46 }
        ],
        favoritos: []
    };

    var UBICACIONES_SEED = [
        { id: 'pue-capital',  nombre: 'Puebla Capital',      pais: 'México', lat: 19.0414,  lng: -98.2063 },
        { id: 'pue-cholula',  nombre: 'Cholula',             pais: 'México', lat: 19.0621,  lng: -98.3053 },
        { id: 'pue-atlixco',  nombre: 'Atlixco',             pais: 'México', lat: 18.9083,  lng: -98.4367 },
        { id: 'pue-tehuacan', nombre: 'Tehuacán',            pais: 'México', lat: 18.4611,  lng: -97.3928 },
        { id: 'pue-izucar',   nombre: 'Izúcar de Matamoros', pais: 'México', lat: 18.6017,  lng: -98.4646 },
        { id: 'cdmx-centro',  nombre: 'CDMX · Centro',       pais: 'México', lat: 19.4326,  lng: -99.1332 },
        { id: 'gdl-centro',   nombre: 'Guadalajara',         pais: 'México', lat: 20.6597,  lng: -103.3496 },
        { id: 'mty-centro',   nombre: 'Monterrey',           pais: 'México', lat: 25.6866,  lng: -100.3161 },
        { id: 'cancun',       nombre: 'Cancún',              pais: 'México', lat: 21.1619,  lng: -86.8515 },
        { id: 'veracruz',     nombre: 'Veracruz',            pais: 'México', lat: 19.1738,  lng: -96.1342 },
        { id: 'oaxaca',       nombre: 'Oaxaca de Juárez',    pais: 'México', lat: 17.0732,  lng: -96.7266 },
        { id: 'queretaro',    nombre: 'Querétaro',           pais: 'México', lat: 20.5888,  lng: -100.3899 }
    ];

    /* ----------------------------------------------------------------
       ESTADO COMPARTIDO
       Solo se modifica a través de los módulos; nunca reasignar el objeto.
       ---------------------------------------------------------------- */

    var state = {
        sonidoSeleccionado: null,
        ubicacionSeleccionada: null,
        archivoVideo: null,
        archivoConAudioMezclado: false,
        previewURL: null,
        portadaURL: null,
        portadaBlob: null,
        tabSonidosActiva: 'parati',
        sbCliente: null,
        borradorEditandoId: null,
        guardandoBorrador: false,
        archivoPathRemoto: null,
        portadaPathRemoto: null,
        borradorPaths: null,
        subiendo: false
    };

    /* URLs de objeto creadas (para liberarlas al salir). */
    var objectURLsActivas = new Set();

    /* ----------------------------------------------------------------
       UTILIDADES
       ---------------------------------------------------------------- */

    function $(id) { return document.getElementById(id); }

    function esc(v) {
        var d = document.createElement('div');
        d.textContent = v == null ? '' : String(v);
        return d.innerHTML;
    }

    function log() {
        var args = Array.prototype.slice.call(arguments);
        console.log.apply(console, ['[VideosPublicar]'].concat(args));
    }

    function warn() {
        var args = Array.prototype.slice.call(arguments);
        console.warn.apply(console, ['[VideosPublicar]'].concat(args));
    }

    /* Traducción con respaldo. Si el sistema de idiomas no está, usa el texto dado. */
    function vt(clave, respaldo) {
        if (typeof window.tConFallback === 'function') return window.tConFallback(clave, respaldo);
        return respaldo !== undefined ? respaldo : clave;
    }

    /* Cambia el texto de un elemento solo si existe. */
    function setTexto(el, texto) {
        if (el) el.textContent = texto;
    }

    /* Cambia el texto de la línea .cs-preview-txt dentro de un contenedor. */
    function setTextoLinea(contenedor, texto) {
        if (!contenedor) return;
        var txt = contenedor.querySelector('.cs-preview-txt');
        if (txt) txt.textContent = texto;
    }

    /* Retrasa una función hasta que pasan ms sin nuevas llamadas. */
    function debouncer(fn, ms) {
        var t = null;
        return function () {
            var self = this;
            var args = arguments;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }

    /* Segundos → m:ss. */
    function fmtDuracion(seg) {
        var s = Math.max(0, Math.floor(Number(seg) || 0));
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    /* MB → "x MB" o "x GB". */
    function formatearEspacio(mb) {
        var n = Number(mb) || 0;
        return n >= 1024 ? (Math.round((n / 1024) * 10) / 10) + ' GB' : Math.round(n) + ' MB';
    }

    /* Estilo visual de una pista (si no tiene género válido, usa phonk). */
    function generoDe(s) {
        return GENEROS[s && s.genero] || GENEROS.phonk;
    }

    /* Crea una URL temporal y la registra para liberarla después. */
    function crearObjectURL(blob) {
        var url = URL.createObjectURL(blob);
        objectURLsActivas.add(url);
        return url;
    }

    function revocarObjectURL(url) {
        if (!url) return;
        try { URL.revokeObjectURL(url); } catch (e) {}
        objectURLsActivas.delete(url);
    }

    /* Libera todas las URLs temporales y limpia las referencias del estado. */
    function limpiarTodasLasURLs() {
        objectURLsActivas.forEach(function (url) {
            try { URL.revokeObjectURL(url); } catch (e) {}
        });
        objectURLsActivas.clear();
        state.previewURL = null;
        state.portadaURL = null;
    }

    /* "Nombre, País" de una ubicación, o null. */
    function textoUbicacion(u) {
        return u ? u.nombre + ', ' + u.pais : null;
    }

    /* Acepta solo URLs del bucket de audios del proyecto. */
    function urlSonidoValida(url) {
        if (typeof url !== 'string') return false;
        try {
            var u = new URL(url);
            if (u.origin !== SUPABASE_URL) return false;
            var prefijoPath = '/storage/v1/object/public/audios/';
            return u.pathname.indexOf(prefijoPath) === 0 && u.pathname.length > prefijoPath.length;
        } catch (e) {
            return false;
        }
    }

    /* URL pública de un archivo de borrador en el bucket de videos. */
    function urlPublicaBorrador(path) {
        if (!path) return null;
        return SUPABASE_URL + '/storage/v1/object/public/' + CONFIG.BUCKET + '/' + path;
    }

    /* Cliente de Supabase: primero el compartido de videos-config.js. */
    function getSupabaseClient() {
        if (state.sbCliente) return state.sbCliente;
        try {
            if (window.sbVideos && typeof window.sbVideos.from === 'function') {
                state.sbCliente = window.sbVideos;
                return state.sbCliente;
            }
            if (window.supabaseClient) {
                state.sbCliente = window.supabaseClient;
                return state.sbCliente;
            }
        } catch (e) {}
        return null;
    }

    /* Sesión activa o null. */
    async function obtenerSesion() {
        var sb = getSupabaseClient();
        if (!sb) return null;
        var r = await sb.auth.getSession();
        return (r && r.data && r.data.session) || null;
    }

    /* Busca una pista por id en los catálogos "Para ti" y "Populares". */
    function buscarSonidoPorId(id) {
        var todas = [].concat(SONIDOS_SEED.parati).concat(SONIDOS_SEED.populares);
        for (var i = 0; i < todas.length; i++) {
            if (todas[i].id === id) return todas[i];
        }
        return null;
    }

    /* ----------------------------------------------------------------
       EXPOSICIÓN
       ---------------------------------------------------------------- */

    NS.C = {
        Z: Z,
        FEED_UI: FEED_UI,
        MARCA_AGUA: MARCA_AGUA,
        EQ_COLORES: EQ_COLORES,
        IDB_NAME: IDB_NAME,
        IDB_STORE: IDB_STORE,
        KEY_META: KEY_META,
        KEY_FILE: KEY_FILE,
        MAX_FILE_SIZE_FOR_IDB: MAX_FILE_SIZE_FOR_IDB,
        FAV_KEY: FAV_KEY,
        DURACION_PREVIEW_MS: DURACION_PREVIEW_MS,
        LIMITE_BORRADORES: LIMITE_BORRADORES,
        RUTA_MEMBRESIA_PRO: RUTA_MEMBRESIA_PRO,
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_STORAGE_URL: SUPABASE_STORAGE_URL,
        CONFIG: CONFIG,
        GENEROS: GENEROS
    };

    NS.DATA = {
        SONIDOS_SEED: SONIDOS_SEED,
        UBICACIONES_SEED: UBICACIONES_SEED
    };

    NS.state = state;

    NS.u = {
        $: $,
        esc: esc,
        log: log,
        warn: warn,
        vt: vt,
        setTexto: setTexto,
        setTextoLinea: setTextoLinea,
        debouncer: debouncer,
        fmtDuracion: fmtDuracion,
        formatearEspacio: formatearEspacio,
        generoDe: generoDe,
        crearObjectURL: crearObjectURL,
        revocarObjectURL: revocarObjectURL,
        limpiarTodasLasURLs: limpiarTodasLasURLs,
        textoUbicacion: textoUbicacion,
        urlSonidoValida: urlSonidoValida,
        urlPublicaBorrador: urlPublicaBorrador,
        getSupabaseClient: getSupabaseClient,
        obtenerSesion: obtenerSesion,
        buscarSonidoPorId: buscarSonidoPorId
    };
})();