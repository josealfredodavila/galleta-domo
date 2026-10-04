// ================================================================
// MENSAJES · UTILS
// ================================================================
// Helpers globales: $, toast, esc, haceTiempo, limpiarMarkdown,
// avatar HTML. Se carga DESPUÉS de config.
// ================================================================

// ---- Selector corto ----
const $ = function(id) { return document.getElementById(id); };

// ---- Toast ----
function toast(text, type) {
    type = type || '';
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast show ' + type;
    clearTimeout(el.t);
    el.t = setTimeout(function() { el.classList.remove('show'); }, 3500);
}

// ---- Escapar HTML ----
function esc(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : v;
    return d.innerHTML;
}

// ---- Tiempo relativo ----
function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';
    var diffMin = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return 'hace ' + diffMin + ' min';
    if (diffMin < 1440) return 'hace ' + Math.floor(diffMin / 60) + ' h';
    return 'hace ' + Math.floor(diffMin / 1440) + ' d';
}

// ---- Limpieza de Markdown (doble protección) ----
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

// ---- Avatar HTML helper ----
function avatar(name, url, cls) {
    cls = cls || 'avatar';
    var inicial = (name || '◈').charAt(0).toUpperCase();
    var contenido = url
        ? '<img src="' + esc(url) + '" alt="">'
        : esc(inicial);
    return '<div class="' + cls + '">' + contenido + '</div>';
}

// ---- Avatar HTML para visor de estado ----
function avatarEstadoHTML(perfil, fallback) {
    if (perfil && perfil.avatar_url) {
        return '<img src="' + esc(perfil.avatar_url) + '" alt="">';
    }
    var inicial = ((perfil && perfil.nombre) || fallback || '◈').charAt(0).toUpperCase();
    return esc(inicial);
}

// ---- Verificar DOM listo ----
function domListo(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

console.log('[Mensajes] ✅ Utils cargado');