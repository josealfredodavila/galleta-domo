// ================================================================
// CSARIEL'S · VIDEOS · CONTROLES (v2)
// ================================================================
// Controles visibles de cada tarjeta del carrusel.
// - Oculta sidebar, overlay y barra inferior tras unos segundos sin
//   interacción, mientras el video se reproduce.
// - Los muestra de nuevo al tocar la tarjeta.
// - Respeta arrastre de barra y barras de reacción abiertas.
// - Gestiona la barra de reacciones: abrir, cerrar y alternar.
// Expuesto en window.VideosApp.controles.
// Requiere: config, utils.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils) {
        console.error('[Videos] videos-controles.js requiere videos-config.js y videos-utils.js.');
        return;
    }
    if (VA.controles) return;

    var CONFIG = VA.CONFIG;
    var S = VA.state;

    // Asegurar la estructura de timers una sola vez.
    if (!S.timersOcultar || typeof S.timersOcultar.get !== 'function') {
        S.timersOcultar = new Map();
    }

    /* ---------------- Utilidades internas ---------------- */

    /* ¿La tarjeta está siendo arrastrada en la barra de tiempo?
       Videos-feed.js marca card.dataset.scrubbing = '1' durante el drag. */
    function estaArrastrando(card) {
        if (!card) return false;
        if (card.dataset && card.dataset.scrubbing === '1') return true;
        // Refuerzo: si hay un pointer activo sobre la barra dentro de la tarjeta.
        if (typeof card.querySelector === 'function') {
            var barra = card.querySelector('.barra-inferior, .barra-prog');
            if (barra && barra.dataset && barra.dataset.arrastrando === '1') return true;
        }
        return false;
    }

    /* ¿Hay alguna barra de reacciones abierta en esta tarjeta? */
    function tieneBarraAbierta(card) {
        if (!card || typeof card.querySelector !== 'function') return false;
        return !!card.querySelector('.reac-barra.show');
    }

    /* Limpia el temporizador de una tarjeta de forma segura. */
    function limpiarTimer(card) {
        if (!card) return;
        var t = S.timersOcultar.get(card);
        if (t) {
            clearTimeout(t);
            S.timersOcultar.delete(card);
        }
    }

    /* ---------------- Mostrar / ocultar ---------------- */

    /* Muestra los controles y programa su ocultado si el video está sonando. */
    function mostrarControles(card) {
        if (!card) return;
        if (card.isConnected === false) return;

        card.classList.remove('controles-ocultos');
        limpiarTimer(card);

        var video = card.querySelector('video');
        if (!video) return;

        // Solo programar ocultado cuando realmente hay reproducción en curso.
        if (!video.paused && !video.ended) {
            var timer = setTimeout(function () {
                S.timersOcultar.delete(card);
                if (!card.isConnected) return;
                // No ocultar si el usuario sigue arrastrando o hay reacciones abiertas.
                if (estaArrastrando(card)) return;
                if (tieneBarraAbierta(card)) return;
                card.classList.add('controles-ocultos');
                cerrarBarrasReacciones();
            }, CONFIG.OCULTAR_CONTROLES_MS);
            S.timersOcultar.set(card, timer);
        }
    }

    /* Oculta los controles de inmediato (por ejemplo, al pausar). */
    function ocultarControlesYa(card) {
        if (!card) return;
        limpiarTimer(card);
        if (card.isConnected === false) return;
        card.classList.add('controles-ocultos');
    }

    /* ---------------- Limpieza global (cambio de tarjeta / cámara / segundo plano) ---------------- */

    /* Limpia temporizadores y cierra barras de reacciones.
       No manipula nodos desconectados. */
    function limpiarTodo() {
        // Timers: limpiar todos los pendientes.
        if (S.timersOcultar && typeof S.timersOcultar.forEach === 'function') {
            S.timersOcultar.forEach(function (timer) {
                if (timer) clearTimeout(timer);
            });
            S.timersOcultar.clear();
        }
        // Cerrar barras de reacciones abiertas.
        cerrarBarrasReacciones();
    }

    /* ---------------- Barras de reacciones ---------------- */

    /* Cierra todas las barras de reacción abiertas. */
    function cerrarBarrasReacciones() {
        document.querySelectorAll('.reac-barra.show').forEach(function (b) {
            b.classList.remove('show');
        });
    }

    /* Abre la barra de un video; si ya estaba abierta, la cierra.
       Garantiza que solo quede una barra abierta a la vez. */
    function alternarBarraReacciones(videoId) {
        var barra = document.getElementById('reac-' + videoId);
        if (!barra) return;

        var abrir = !barra.classList.contains('show');
        cerrarBarrasReacciones();
        if (abrir) barra.classList.add('show');
    }

    /* ¿Hay alguna barra de reacciones abierta? (para el cierre al tocar fuera). */
    function hayBarraAbierta() {
        return !!document.querySelector('.reac-barra.show');
    }

    /* ---------------- Listeners globales (idempotentes) ---------------- */

    // Cámara: limpiar temporizadores y barras al abrir/grabar.
    window.addEventListener('cs:camara-abrir', limpiarTodo);
    window.addEventListener('cs:grabacion-iniciar', limpiarTodo);

    // Visibilidad: al pasar a segundo plano, limpiar temporizadores.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) limpiarTodo();
    });
    window.addEventListener('pagehide', limpiarTodo);

    /* ---------------- Contrato público ---------------- */

    VA.controles = {
        mostrarControles: mostrarControles,
        ocultarControlesYa: ocultarControlesYa,
        cerrarBarrasReacciones: cerrarBarrasReacciones,
        alternarBarraReacciones: alternarBarraReacciones,
        hayBarraAbierta: hayBarraAbierta
    };
})();