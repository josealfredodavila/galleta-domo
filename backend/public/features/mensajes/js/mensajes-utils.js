// ================================================================
// MENSAJES · UTILS
// ================================================================
// Helpers globales: $, toast, esc, haceTiempo, limpiarMarkdown,
// avatar, getSignedUrlForMessage, icono() con SVG inline.
// Se carga DESPUÉS de mensajes-config.js.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// ================================================================

'use strict';

// ================================================================
// SELECTOR CORTO
// ================================================================
const $ = function(id) { return document.getElementById(id); };

// ================================================================
// TOAST
// ================================================================
function toast(text, type, duracionMs) {
    type = type || '';
    duracionMs = duracionMs || 3500;
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast show ' + type;
    clearTimeout(el.t);
    el.t = setTimeout(function() { el.classList.remove('show'); }, duracionMs);
}

// ================================================================
// ESCAPAR HTML
// ================================================================
function esc(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : v;
    return d.innerHTML;
}

// ================================================================
// VALIDACIÓN BÁSICA
// ================================================================
function esUUID(v) {
    return typeof v === 'string' && UUID_RE.test(v);
}

function urlSegura(u) {
    if (!u || typeof u !== 'string') return false;
    try {
        var url = new URL(u, location.origin);
        return url.protocol === 'http:' ||
               url.protocol === 'https:' ||
               url.protocol === 'blob:' ||
               url.protocol === 'data:';
    } catch (e) {
        return false;
    }
}

// ================================================================
// TIEMPO RELATIVO
// ================================================================
function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';
    var diffMin = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return 'hace ' + diffMin + ' min';
    if (diffMin < 1440) return 'hace ' + Math.floor(diffMin / 60) + ' h';
    return 'hace ' + Math.floor(diffMin / 1440) + ' d';
}

// ================================================================
// LIMPIEZA DE MARKDOWN
// ================================================================
// Elimina negritas, cursivas, encabezados, listas, citas,
// separadores, tablas, código inline y símbolos decorativos.
function limpiarMarkdown(texto) {
    if (typeof texto !== 'string') return '';
    var t = texto;

    // Bloques de código
    t = t.replace(/```[\s\S]*?```/g, '');

    // Encabezados
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');

    // Negritas / cursivas
    t = t.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    t = t.replace(/\*\*(.*?)\*\*/g, '$1');
    t = t.replace(/\*(.*?)\*/g, '$1');
    t = t.replace(/___(.*?)___/g, '$1');
    t = t.replace(/__(.*?)__/g, '$1');
    t = t.replace(/_(.*?)_/g, '$1');

    // Código inline
    t = t.replace(/`([^`]+)`/g, '$1');

    // Listas
    t = t.replace(/^\s{0,3}[-*+]\s+/gm, '');
    t = t.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');

    // Citas
    t = t.replace(/^\s{0,3}>\s?/gm, '');

    // Separadores
    t = t.replace(/^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/gm, '');
    t = t.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');

    // Tablas
    t = t.replace(/^\s*\|.*\|\s*$/gm, '');
    t = t.replace(/\|/g, ' ');

    // Símbolos decorativos
    t = t.replace(/^\s*[*#_~•◈✦🔴🟡🟢➤→»]+\s*/gm, '');
    t = t.replace(/\s+[*#_~]{2,}\s+/g, ' ');

    // Colapsar espacios
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\n{3,}/g, '\n\n');

    return t.trim();
}

// ================================================================
// AVATAR HTML
// ================================================================
function avatar(name, url, cls) {
    cls = cls || 'avatar';
    var inicial = (name || '◈').charAt(0).toUpperCase();
    var contenido = (url && urlSegura(url))
        ? '<img src="' + esc(url) + '" alt="">'
        : esc(inicial);
    return '<div class="' + cls + '">' + contenido + '</div>';
}

function avatarEstadoHTML(perfil, fallback) {
    if (perfil && perfil.avatar_url && urlSegura(perfil.avatar_url)) {
        return '<img src="' + esc(perfil.avatar_url) + '" alt="">';
    }
    var inicial = ((perfil && perfil.nombre) || fallback || '◈').charAt(0).toUpperCase();
    return esc(inicial);
}

// ================================================================
// ICONOS SVG INLINE
// ================================================================
// Reemplazan los emojis feos. Heredan el color con currentColor.
var ICONOS_SVG = {
    chat:        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    canales:     '<polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/>',
    grupos:      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    papelera:    '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    video:       '<rect x="2" y="6" width="14" height="12" rx="2"/><polygon points="22 8 16 12 22 16 22 8"/>',
    buscar:      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    clip:        '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    microfono:   '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
    parlante:    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    enviar:      '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    mas:         '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    flechaAbajo: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    flechaIzq:   '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    cerrar:      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    camara:      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    play:        '<polygon points="5 3 19 12 5 21 5 3"/>',
    pausa:       '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    check:       '<polyline points="20 6 9 17 4 12"/>',
    checkDoble:  '<polyline points="18 6 7 17 2 12"/><polyline points="22 6 12 16 9 13"/>',
    campana:     '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    reloj:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    usuario:     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    ajustes:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    galeria:     '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    descarga:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    doc:         '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    emoji:       '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'
};

/**
 * Devuelve un SVG inline listo para insertar en HTML.
 * @param {string} nombre - Clave del icono (ver ICONOS_SVG).
 * @param {number} [size=18] - Tamaño en px.
 * @param {string} [extraClass=''] - Clase CSS adicional.
 * @returns {string} HTML del SVG.
 */
function icono(nombre, size, extraClass) {
    size = size || 18;
    extraClass = extraClass ? ' ' + extraClass : '';
    var path = ICONOS_SVG[nombre] || ICONOS_SVG.help || '';
    return '<svg class="icon' + extraClass + '" viewBox="0 0 24 24" ' +
        'width="' + size + '" height="' + size + '" ' +
        'fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        path +
        '</svg>';
}

// ================================================================
// GET SIGNED URL FOR MESSAGE
// ================================================================
// Convierte rutas tipo "bucket://chat-audio/..." o URLs antiguas
// con "/object/public/..." en URLs firmadas reales.
async function getSignedUrlForMessage(m) {
    if (!m) return null;

    var raw = m.imagen_url || m.url || null;
    if (!raw || typeof raw !== 'string') return null;

    // 1. URL http(s) directa
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        // Ya es URL pública: devolver tal cual
        if (raw.includes('/object/public/')) return raw;

        // URL con /object/sign/ o similar → intentar firmar de nuevo
        try {
            var url = new URL(raw);
            var parts = url.pathname.split('/').filter(Boolean);
            var idx = parts.findIndex(function(p) {
                return p === CHAT_AUDIO_BUCKET || p === CHAT_ATTACHMENTS_BUCKET;
            });
            if (idx === -1) return raw;

            var bucket = parts[idx];
            var filePath = parts.slice(idx + 1).join('/');
            if (!bucket || !filePath) return raw;

            var r1 = await db.storage.from(bucket).createSignedUrl(filePath, 3600);
            if (r1.error || !r1.data || !r1.data.signedUrl) return raw;
            return r1.data.signedUrl;
        } catch (e) {
            return raw;
        }
    }

    // 2. bucket://bucket/path
    if (raw.startsWith('bucket://')) {
        try {
            var resto = raw.replace('bucket://', '');
            var slashIdx = resto.indexOf('/');
            if (slashIdx === -1) return null;

            var bucket2 = resto.slice(0, slashIdx);
            var filePath2 = resto.slice(slashIdx + 1);
            if (!bucket2 || !filePath2) return null;

            var r2 = await db.storage.from(bucket2).createSignedUrl(filePath2, 3600);
            if (r2.error) {
                if (window.DEBUG_CHAT) {
                    console.warn('[Mensajes/Utils] Error firmando:', r2.error);
                }
                return null;
            }
            return r2.data.signedUrl;
        } catch (e) {
            if (window.DEBUG_CHAT) {
                console.warn('[Mensajes/Utils] Error parseando bucket://:', e);
            }
            return null;
        }
    }

    // 3. Cualquier otra cosa: no se puede resolver
    return null;
}

// ================================================================
// HELPERS DE DOM
// ================================================================
function domListo(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

function safeDomId(id) {
    if (!id) return '';
    return String(id).replace(/[^a-zA-Z0-9-]/g, '');
}

// ================================================================
// DEBOUNCE
// ================================================================
function debounce(fn, ms) {
    var timer = null;
    return function() {
        var ctx = this;
        var args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function() { fn.apply(ctx, args); }, ms);
    };
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.$ = $;
window.toast = toast;
window.esc = esc;
window.esUUID = esUUID;
window.urlSegura = urlSegura;
window.haceTiempo = haceTiempo;
window.limpiarMarkdown = limpiarMarkdown;
window.avatar = avatar;
window.avatarEstadoHTML = avatarEstadoHTML;
window.icono = icono;
window.getSignedUrlForMessage = getSignedUrlForMessage;
window.domListo = domListo;
window.safeDomId = safeDomId;
window.debounce = debounce;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Utils] ✅ Utils cargado');
}