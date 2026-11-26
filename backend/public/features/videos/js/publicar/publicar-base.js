// ================================================================
// CSARIEL'S · VIDEOS · PUBLICAR · BASE (v2 - RAÍZ)
// ================================================================
// Adaptador para el compositor. Usa la configuración y estado de VideosApp.
// ================================================================

(function () {
    'use strict';

    var NS = window.VideosPublicarNS = window.VideosPublicarNS || {};
    if (NS.C) return;

    var VA = window.VideosApp;
    if (!VA || !VA.__config) {
        console.error('[VideosPublicar] videos-config.js debe cargarse primero.');
        return;
    }

    // Constantes visuales
    var Z = {
        SHEET_BACKDROP: 100000,
        SHEET: 100001,
        PREVIEW: 100030,
        CONFIRM: 100010,
        TOAST: 100020
    };

    var FEED_UI = { ocultarLikes: true, ocultarCompartir: true, ocultarReacciones: true };
    var MARCA_AGUA = { ACTIVA: false, OPACIDAD: 1 };
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
    
    var GENEROS = {
        phonk:   { label: 'Phonk',   bg: 'linear-gradient(135deg,#ff2bd6,#3b0a4f 70%)', glyph: '◆' },
        epico:   { label: 'Épico',   bg: 'linear-gradient(135deg,#ffe600,#6b3d00 70%)', glyph: '✦' },
        comedia: { label: 'Comedia', bg: 'linear-gradient(135deg,#39ff14,#0b3d14 70%)', glyph: '◉' },
        trap:    { label: 'Trap',    bg: 'linear-gradient(135deg,#ff3d7f,#2a0010 70%)', glyph: '▲' },
        house:   { label: 'House',   bg: 'linear-gradient(135deg,#00f0ff,#03303d 70%)', glyph: '◈' },
        electro: { label: 'Electro', bg: 'linear-gradient(135deg,#b026ff,#00f0ff 120%)', glyph: '●' }
    };

    var SONIDOS_SEED = {
        parati: [
            { id: 'sd-phonk', nombre: 'Phonk Bass Drop', artista: 'Echoes of Lumen', genero: 'phonk', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/echoes_of_lumen-phonk-bass-neon-aura-night-drive-588671.mp3', duracion: 128 },
            { id: 'sd-suspenso', nombre: 'Suspenso Épico', artista: 'Absolute Sound', genero: 'epico', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/absolutesound-suspense-tense-atmosphere-514617.mp3', duracion: 137 },
            { id: 'sd-comedia', nombre: 'Risa y Caos', artista: 'Alex Morgan', genero: 'comedia', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/alex-morgan-comedy-bgm-funny-background-music-583242.mp3', duracion: 62 },
            { id: 'sd-n1', nombre: 'Brazilian Phonk', artista: 'Sub Clair', genero: 'phonk', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/sub_clair-brazilian-phonk-instrumental-585588.mp3', duracion: 120 },
            { id: 'sd-n2', nombre: 'Sosin Phonk Music', artista: 'Sosin', genero: 'phonk', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/sosin-phonk-phonk-music-621003.mp3', duracion: 110 },
            { id: 'sd-n3', nombre: 'Phonk No Copyright', artista: 'ARP Media', genero: 'phonk', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/arpmedia-phonk-no-copyright-music-588451.mp3', duracion: 95 },
            { id: 'sd-n4', nombre: 'Gym Workout', artista: 'Echoes of Lumen', genero: 'trap', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/echoes_of_lumen-sport-phonk-gym-workout-586978.mp3', duracion: 105 }
        ],
        populares: [
            { id: 'sd-trend1', nombre: 'Aesthetic Vibes', artista: 'Adrihuwu', genero: 'house', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/adrihuwu-adrihuwu-join-my-server-209103.mp3', duracion: 134 },
            { id: 'sd-trend2', nombre: 'Corrido Bélico (Trap)', artista: 'LN Plus Music', genero: 'trap', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/lnplusmusic-cuban-latin-trap-beat-469610.mp3', duracion: 127 },
            { id: 'sd-reward', nombre: 'Gancho de Éxito', artista: 'Freesound Community', genero: 'electro', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/freesound_community-victoria_claudia_baja_fidelidad_almacen_exito_cali-79564.mp3', duracion: 55 },
            { id: 'sd-n5', nombre: 'Dark Aggressive Bass', artista: 'Watermelon Beats', genero: 'phonk', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/watermelon_beats-phonk-drift-dark-aggressive-bass-612474.mp3', duracion: 140 },
            { id: 'sd-n6', nombre: 'House Phonk', artista: 'Alex Zavesa', genero: 'house', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/alexzavesa-house-phonk-short-version-613118.mp3', duracion: 85 },
            { id: 'sd-n7', nombre: 'Phonk Instrumental', artista: 'Sub Clair', genero: 'phonk', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/sub_clair-phonk-instrumental-610091.mp3', duracion: 115 },
            { id: 'sd-n8', nombre: 'Ultrakill', artista: 'Cloud System', genero: 'electro', url: VA.CONFIG.SUPABASE_STORAGE_URL + '/audios/cloudsystem-ultrakill-46s-621400.mp3', duracion: 46 }
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

    var objectURLsActivas = new Set();

    // --- UTILIDADES ---
    function $(id) { return document.getElementById(id); }
    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function log() { console.log.apply(console, ['[VideosPublicar]'].concat(Array.prototype.slice.call(arguments))); }
    function warn() { console.warn.apply(console, ['[VideosPublicar]'].concat(Array.prototype.slice.call(arguments))); }
    function vt(clave, respaldo) { if (typeof window.tConFallback === 'function') return window.tConFallback(clave, respaldo); return respaldo !== undefined ? respaldo : clave; }
    function setTexto(el, texto) { if (el) el.textContent = texto; }
    function setTextoLinea(contenedor, texto) { if (!contenedor) return; var txt = contenedor.querySelector('.cs-preview-txt'); if (txt) txt.textContent = texto; }
    function debouncer(fn, ms) { var t = null; return function () { var self = this; var args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); }; }
    function fmtDuracion(seg) { var s = Math.max(0, Math.floor(Number(seg) || 0)); var m = Math.floor(s / 60); var r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
    function formatearEspacio(mb) { var n = Number(mb) || 0; return n >= 1024 ? (Math.round((n / 1024) * 10) / 10) + ' GB' : Math.round(n) + ' MB'; }
    function generoDe(s) { return GENEROS[s && s.genero] || GENEROS.phonk; }
    function crearObjectURL(blob) { var url = URL.createObjectURL(blob); objectURLsActivas.add(url); return url; }
    function revocarObjectURL(url) { if (!url) return; try { URL.revokeObjectURL(url); } catch (e) {} objectURLsActivas.delete(url); }
    function limpiarTodasLasURLs() { objectURLsActivas.forEach(function (url) { try { URL.revokeObjectURL(url); } catch (e) {} }); objectURLsActivas.clear(); VA.state.previewURL = null; VA.state.portadaURL = null; }
    function textoUbicacion(u) { return u ? u.nombre + ', ' + u.pais : null; }
    function urlSonidoValida(url) { if (typeof url !== 'string') return false; try { var u = new URL(url); if (u.origin !== VA.CONFIG.SUPABASE_URL) return false; var prefijoPath = '/storage/v1/object/public/audios/'; return u.pathname.indexOf(prefijoPath) === 0 && u.pathname.length > prefijoPath.length; } catch (e) { return false; } }
    function urlPublicaBorrador(path) { if (!path) return null; return VA.CONFIG.SUPABASE_URL + '/storage/v1/object/public/' + VA.CONFIG.BUCKET + '/' + path; }
    function getSupabaseClient() { return window.sbVideos || null; }
    async function obtenerSesion() { var sb = getSupabaseClient(); if (!sb) return null; var r = await sb.auth.getSession(); return (r && r.data && r.data.session) || null; }
    function buscarSonidoPorId(id) { var todas = [].concat(SONIDOS_SEED.parati).concat(SONIDOS_SEED.populares); for (var i = 0; i < todas.length; i++) { if (todas[i].id === id) return todas[i]; } return null; }

    // --- EXPOSICIÓN ---
    NS.C = {
        Z: Z, FEED_UI: FEED_UI, MARCA_AGUA: MARCA_AGUA, EQ_COLORES: EQ_COLORES,
        IDB_NAME: IDB_NAME, IDB_STORE: IDB_STORE, KEY_META: KEY_META, KEY_FILE: KEY_FILE,
        MAX_FILE_SIZE_FOR_IDB: MAX_FILE_SIZE_FOR_IDB, FAV_KEY: FAV_KEY, DURACION_PREVIEW_MS: DURACION_PREVIEW_MS,
        LIMITE_BORRADORES: LIMITE_BORRADORES, RUTA_MEMBRESIA_PRO: RUTA_MEMBRESIA_PRO,
        SUPABASE_URL: VA.CONFIG.SUPABASE_URL, SUPABASE_STORAGE_URL: VA.CONFIG.SUPABASE_STORAGE_URL,
        CONFIG: VA.CONFIG, GENEROS: GENEROS
    };

    NS.DATA = { SONIDOS_SEED: SONIDOS_SEED, UBICACIONES_SEED: UBICACIONES_SEED };
    NS.state = VA.state; // Apunta al estado unificado

    NS.u = {
        $: $, esc: esc, log: log, warn: warn, vt: vt, setTexto: setTexto, setTextoLinea: setTextoLinea,
        debouncer: debouncer, fmtDuracion: fmtDuracion, formatearEspacio: formatearEspacio, generoDe: generoDe,
        crearObjectURL: crearObjectURL, revocarObjectURL: revocarObjectURL, limpiarTodasLasURLs: limpiarTodasLasURLs,
        textoUbicacion: textoUbicacion, urlSonidoValida: urlSonidoValida, urlPublicaBorrador: urlPublicaBorrador,
        getSupabaseClient: getSupabaseClient, obtenerSesion: obtenerSesion, buscarSonidoPorId: buscarSonidoPorId
    };
})();