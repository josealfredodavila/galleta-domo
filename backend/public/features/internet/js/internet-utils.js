// ================================================================
// INTERNET · UTILIDADES
// ================================================================
// Toast, escape HTML, formateo MB, api helper autenticado,
// localStorage para orden pendiente.
// Depende de: internet-config.js
// ================================================================

// ================================================================
// TOAST
// ================================================================
function showToast(mensaje, tipo, ms) {
    tipo = tipo || '';
    ms = ms || 3500;
    var toast = document.getElementById('toast');
    if (!toast) {
        console.warn('[Internet Toast]', mensaje);
        return;
    }
    toast.textContent = mensaje;
    toast.className = 'toast show';
    if (tipo) toast.classList.add(tipo); // error | success | warning
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function() {
        toast.classList.remove('show');
    }, ms);
}

// ================================================================
// ESCAPE HTML
// ================================================================
function escapeHTML(t) {
    if (t === null || t === undefined) return '';
    return String(t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ================================================================
// FORMATEO DE MB / GB
// ================================================================
function fmtMb(mb) {
    var n = Number(mb);
    if (!Number.isFinite(n) || n <= 0) return '0 MB';
    if (n >= 1000) return (n / 1000).toFixed(2) + ' GB';
    return Math.round(n) + ' MB';
}

// ================================================================
// SET TEXTO EN ELEMENTO POR ID
// ================================================================
function setTexto(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ================================================================
// API AUTENTICADA AL BACKEND
// ================================================================
async function api(path, opts) {
    opts = opts || {};
    var session = await getSessionInternet();
    if (!session) throw new Error('Inicia sesión');

    var headers = Object.assign({}, opts.headers || {}, {
        'Authorization': 'Bearer ' + session.access_token
    });

    var resp = await fetch(BACKEND_URL + path, Object.assign({}, opts, {
        headers: headers
    }));

    var data = {};
    try {
        data = await resp.json();
    } catch (_) {
        // respuesta sin JSON
    }
    return { resp: resp, data: data };
}

// ================================================================
// ORDEN PENDIENTE EN LOCALSTORAGE
// (Sobrevive a recargas de página mientras el usuario paga)
// ================================================================
function guardarPendiente() {
    try {
        var payload = Object.assign({}, ordenActual, {
            totalAntesMb: totalAntesMb,
            ts: Date.now()
        });
        localStorage.setItem(PENDIENTE_KEY, JSON.stringify(payload));
    } catch (_) {
        // almacenamiento no disponible
    }
}

function leerPendiente() {
    try {
        var r = localStorage.getItem(PENDIENTE_KEY);
        return r ? JSON.parse(r) : null;
    } catch (_) {
        return null;
    }
}

function limpiarPendiente() {
    try {
        localStorage.removeItem(PENDIENTE_KEY);
    } catch (_) {
        // nada
    }
}