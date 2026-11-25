// ================================================================
// CSARIEL'S · VIDEOS · UTILIDADES (v1)
// ================================================================
// Funciones auxiliares sin estado ni dependencias de la UI del feed.
// - Escape y seguridad de atributos (safeAttr).
// - Texto: normalización para búsqueda, formato de tiempo y contadores.
// - Toast y vibración.
// - Red: fetch con timeout y lectura segura de JSON.
// - Errores de subida con clasificación reintentable / fatal.
// - Sesión de Supabase.
// - Iconos SVG.
// Expuesto en window.VideosApp.utils.
// Requiere: videos-config.js
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config) {
        console.error('[Videos] videos-utils.js requiere videos-config.js cargado antes.');
        return;
    }
    if (VA.utils) return;

    /* ---------------- Escape y atributos ---------------- */

    function escapeHTML(texto) {
        if (texto === null || texto === undefined) return '';
        return String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* Solo acepta URLs https; cualquier otra cosa se reemplaza por '#'. */
    function safeAttr(url) {
        if (!url || typeof url !== 'string') return '#';
        return url.indexOf('https://') === 0 ? url : '#';
    }

    /* ---------------- Texto ---------------- */

    /* Quita acentos y pasa a minúsculas, para comparar búsquedas. */
    function normalizarTexto(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    /* Segundos → m:ss. Valores inválidos muestran 0:00. */
    function formatearTiempo(seg) {
        if (!seg || !isFinite(seg)) return '0:00';
        var m = Math.floor(seg / 60);
        var s = Math.floor(seg % 60);
        return m + ':' + (s < 10 ? '0' + s : s);
    }

    /* 1500 → "1.5K", 2000000 → "2M". */
    function formatContador(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
        return String(n);
    }

    /* Lee un contador mostrado ("1.5K") y lo devuelve como número aproximado. */
    function leerContadorMostrado(texto) {
        return parseInt(String(texto || '').replace(/[^\d]/g, ''), 10) || 0;
    }

    /* ---------------- Interfaz ---------------- */

    function vibrar(ms) {
        try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {}
    }

    /* Toast del feed. Reutiliza el elemento #toast de videos.html. */
    function showToast(msg, type, duracion) {
        var t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'toast show' + (type ? ' ' + type : '');
        clearTimeout(t._timeout);
        t._timeout = setTimeout(function () { t.classList.remove('show'); }, duracion || 3000);
    }

    /* Traduce un bloque del DOM si el sistema de idiomas está disponible. */
    function aplicarI18N(raiz) {
        try {
            if (typeof window.aplicarTraducciones === 'function') {
                window.aplicarTraducciones(raiz || document);
            }
        } catch (e) {}
    }

    /* ---------------- Sesión ---------------- */

    async function getSession() {
        try {
            var sb = VA.cliente();
            if (!sb) return null;
            var r = await sb.auth.getSession();
            return r && r.data ? r.data.session : null;
        } catch (e) {
            return null;
        }
    }

    /* ---------------- Red ---------------- */

    /* Lee el cuerpo como JSON sin lanzar excepción. Devuelve un objeto
       con marcas (_vacio, _invalido) cuando no es JSON válido. */
    async function leerJSONSeguro(respuesta) {
        var texto = '';
        try {
            texto = await respuesta.text();
        } catch (e) {
            return { _error: 'lectura', status: respuesta.status };
        }
        if (!texto) return { _vacio: true, status: respuesta.status };
        try {
            return JSON.parse(texto);
        } catch (e) {
            return { _invalido: true, status: respuesta.status };
        }
    }

    /* fetch con tiempo límite. Cancela la petición al vencer. */
    function fetchConTimeout(url, opciones, ms) {
        var controlador = new AbortController();
        var temporizador = setTimeout(function () { controlador.abort(); }, ms || 120000);
        var opts = Object.assign({}, opciones, { signal: controlador.signal });
        return fetch(url, opts).finally(function () { clearTimeout(temporizador); });
    }

    /* Clasifica un error de respuesta HTTP.
       - fatal: no tiene sentido reintentar (400, 404, 413 por cuota, etc.).
       - reintentable: 401/403/408/429/5xx; la cola lo vuelve a intentar. */
    function errorDeRespuesta(etapa, respuesta, cuerpo) {
        var status = respuesta && respuesta.status;
        var mensajeServidor = cuerpo && cuerpo.error ? String(cuerpo.error) : '';
        var e = new Error(mensajeServidor ? etapa + ': ' + mensajeServidor : etapa + ': error HTTP ' + status);

        if (status === 413 && mensajeServidor === 'cuota_excedida') {
            e.fatal = true;
            e.cuota = cuerpo;
            return e;
        }

        var reintentable = status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
        if (!reintentable && status >= 400) {
            e.fatal = true;
            if (mensajeServidor) e.message = mensajeServidor;
        }
        return e;
    }

    /* ---------------- Iconos SVG ---------------- */

    function svgIcono(contenido) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + contenido + '</svg>';
    }

    var ICONO = Object.freeze({
        corazon: svgIcono('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
        comentario: svgIcono('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
        mas: svgIcono('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
        play: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
        descargar: svgIcono('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
        reportar: svgIcono('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
        eliminar: svgIcono('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
        compartirMenu: svgIcono('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8 15.8 6.2M8.2 13.2 15.8 17.8"/>')
    });

    /* ---------------- Exposición ---------------- */

    VA.utils = {
        escapeHTML: escapeHTML,
        safeAttr: safeAttr,
        normalizarTexto: normalizarTexto,
        formatearTiempo: formatearTiempo,
        formatContador: formatContador,
        leerContadorMostrado: leerContadorMostrado,
        vibrar: vibrar,
        showToast: showToast,
        aplicarI18N: aplicarI18N,
        getSession: getSession,
        leerJSONSeguro: leerJSONSeguro,
        fetchConTimeout: fetchConTimeout,
        errorDeRespuesta: errorDeRespuesta,
        svgIcono: svgIcono,
        ICONO: ICONO
    };
})();