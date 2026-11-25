// ================================================================
// CSARIEL'S · VIDEOS · CONTROLES (v1)
// ================================================================
// Controles visibles de cada tarjeta del carrusel.
// - Oculta sidebar, overlay y barra inferior tras unos segundos sin
//   interacción, mientras el video se reproduce.
// - Los muestra de nuevo al tocar la tarjeta.
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

    /* Muestra los controles y programa su ocultado si el video está sonando. */
    function mostrarControles(card) {
        if (!card) return;
        card.classList.remove('controles-ocultos');

        clearTimeout(S.timersOcultar.get(card));

        var video = card.querySelector('video');
        if (video && !video.paused) {
            S.timersOcultar.set(card, setTimeout(function () {
                card.classList.add('controles-ocultos');
                cerrarBarrasReacciones();
            }, CONFIG.OCULTAR_CONTROLES_MS));
        }
    }

    /* Oculta los controles de inmediato (por ejemplo, al pausar). */
    function ocultarControlesYa(card) {
        if (!card) return;
        clearTimeout(S.timersOcultar.get(card));
        card.classList.add('controles-ocultos');
    }

    /* Cierra todas las barras de reacción abiertas. */
    function cerrarBarrasReacciones() {
        document.querySelectorAll('.reac-barra.show').forEach(function (b) {
            b.classList.remove('show');
        });
    }

    /* Abre la barra de un video; si ya estaba abierta, la cierra. */
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

    VA.controles = {
        mostrarControles: mostrarControles,
        ocultarControlesYa: ocultarControlesYa,
        cerrarBarrasReacciones: cerrarBarrasReacciones,
        alternarBarraReacciones: alternarBarraReacciones,
        hayBarraAbierta: hayBarraAbierta
    };
})();