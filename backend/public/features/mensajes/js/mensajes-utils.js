// ================================================================
// MENSAJES · UTILIDADES
// ================================================================
function $(id) { return document.getElementById(id); }

function toast(text, type) {
    type = type || '';
    var el = $('toast');
    if (!el) { console.warn('[Toast]', text); return; }
    el.textContent = text;
    el.className = 'toast show ' + type;
    clearTimeout(el.t);
    el.t = setTimeout(function() { el.classList.remove('show'); }, 3500);
}

function esc(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : v;
    return d.innerHTML;
}

function limpiarMarkdown(texto) {
    if (typeof texto !== 'string') return '';
    var t = texto;
    t = t.replace(/```[\s\S]*?```/g, '');
    t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
    t = t.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    t = t.replace(/\*\*(.*?)\*\*/g, '$1');
    t = t.replace(/\*(.*?)\*/g, '$1');
    t = t.replace(/___(.*?)___/g, '$1');
    t = t.replace(/__(.*?)__/g, '$1');
    t = t.replace(/_(.*?)_/g, '$1');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/^\s{0,3}[-*+]\s+/gm, '');
    t = t.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '');
    t = t.replace(/^\s{0,3}>\s?/gm, '');
    t = t.replace(/^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/gm, '');
    t = t.replace(/^\s{0,3}[-*_]{3,}\s*$/gm, '');
    t = t.replace(/^\s*\|.*\|\s*$/gm, '');
    t = t.replace(/\|/g, ' ');
    t = t.replace(/^\s*[*#_~•◈✦🔴🟡🟢➤→»]+\s*/gm, '');
    t = t.replace(/\s+[*#_~]{2,}\s+/g, ' ');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';
    var diffMin = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return 'hace ' + diffMin + ' min';
    if (diffMin < 1440) return 'hace ' + Math.floor(diffMin / 60) + ' h';
    return 'hace ' + Math.floor(diffMin / 1440) + ' d';
}

function avatar(name, url, cls) {
    cls = cls || 'avatar';
    return '<div class="' + cls + '">' + (url ? '<img src="' + esc(url) + '" alt="">' : esc((name || '◈').charAt(0).toUpperCase())) + '</div>';
}

async function getSignedUrlForMessage(m) {
    if (!m.imagen_url) return null;
    var raw = m.imagen_url;
    if (raw.startsWith('http')) {
        if (raw.includes('/object/public/')) return raw;
        try {
            var url = new URL(raw);
            var parts = url.pathname.split('/').filter(Boolean);
            var idx = parts.findIndex(function(p) { return p === 'chat-audio' || p === 'chat-attachments'; });
            if (idx === -1) return raw;
            var bucket = parts[idx];
            var filePath = parts.slice(idx + 1).join('/');
            var result = await db.storage.from(bucket).createSignedUrl(filePath, 3600);
            if (result.error) return raw;
            return result.data.signedUrl;
        } catch (e) { return raw; }
    }
    if (raw.startsWith('bucket://')) {
        try {
            var withoutPrefix = raw.replace('bucket://', '');
            var slashIdx = withoutPrefix.indexOf('/');
            if (slashIdx === -1) return null;
            var bucket2 = withoutPrefix.slice(0, slashIdx);
            var filePath2 = withoutPrefix.slice(slashIdx + 1);
            var result2 = await db.storage.from(bucket2).createSignedUrl(filePath2, 3600);
            if (result2.error) { console.warn('Error firmando:', result2.error); return null; }
            return result2.data.signedUrl;
        } catch (e) { console.warn('Error parseando ruta:', e); return null; }
    }
    return null;
}
console.log('[Mensajes] ✅ Utils cargado');