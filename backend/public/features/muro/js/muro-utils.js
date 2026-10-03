// ================================================================
// MURO · UTILIDADES
// ================================================================
// Helpers generales: toast, escape HTML, sanitizado, formato tiempo.
// Depende de: muro-config.js
// ================================================================

// ================================================================
// TOAST (notificaciones emergentes)
// ================================================================
function showToast(mensaje, tipo) {
    try {
        var toastEl = document.getElementById('toast');
        if (!toastEl) {
            console.warn('[Muro Toast]', mensaje);
            return;
        }
        toastEl.textContent = mensaje;
        toastEl.className = 'toast show';
        if (tipo === 'error') toastEl.classList.add('error');
        else if (tipo === 'warning') toastEl.classList.add('warning');
        else if (tipo === 'success') toastEl.classList.add('success');
        clearTimeout(toastEl._timeout);
        toastEl._timeout = setTimeout(function() {
            toastEl.classList.remove('show');
        }, 3500);
    } catch (e) {
        console.warn('Toast error:', e);
    }
}

// ================================================================
// ESCAPE HTML
// ================================================================
function escapeHTML(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ================================================================
// SANITIZAR HTML (con hashtags y menciones clickables)
// ================================================================
function sanitizarHTML(texto) {
    if (!texto) return '';
    var sanitizado = escapeHTML(texto);
    sanitizado = sanitizado.replace(/#(\w+)/g, '<a href="#" class="hashtag" onclick="buscarHashtag(\'$1\');return false;">#$1</a>');
    sanitizado = sanitizado.replace(/@(\w+)/g, '<a href="/perfil/$1" class="mencion">@$1</a>');
    return sanitizado;
}

// ================================================================
// FORMATEAR TIEMPO (mm:ss)
// ================================================================
function formatearTiempoRestante(segundos) {
    if (segundos < 0) segundos = 0;
    var m = Math.floor(segundos / 60);
    var s = segundos % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

// ================================================================
// TIEMPO RELATIVO ("hace 2h")
// ================================================================
function haceTiempoMuro(fecha) {
    if (!fecha) return '';
    var diffMin = Math.floor((new Date() - new Date(fecha)) / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return 'hace ' + diffMin + ' min';
    if (diffMin < 1440) return 'hace ' + Math.floor(diffMin / 60) + ' h';
    return 'hace ' + Math.floor(diffMin / 1440) + ' d';
}

// ================================================================
// VER TOKENS (navegación al perfil)
// ================================================================
function verTokens() {
    window.location.href = '/features/perfil/perfil.html';
}