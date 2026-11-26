// ================================================================
// CSARIEL'S · VIDEOS · HOJAS INFERIORES (v2)
// ================================================================
// Control de las hojas inferiores de videos.html:
// comentarios, menú del video, mapa y publicar.
// - Abrir y cerrar una hoja por id (validando existencia).
// - Mostrar u ocultar el fondo oscuro (#hojaFondo) de forma consistente.
// - Bloquear el scroll de la página mientras hay una hoja abierta.
// - Conectar los botones de cierre y el toque en el fondo (idempotente).
// Expuesto en window.VideosApp.hojas.
// Requiere: config, utils.
// Debe cargarse antes que videos-comentarios.js y videos-menu.js.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils) {
        console.error('[Videos] videos-hojas.js requiere videos-config.js y videos-utils.js.');
        return;
    }
    if (VA.hojas) return;

    var S = VA.state;

    /* ---------------- Fondo y bloqueo de scroll ---------------- */

    /* Muestra u oculta el fondo oscuro si está en el DOM. */
    function mostrarFondo(visible) {
        var fondo = document.getElementById('hojaFondo');
        if (!fondo) return;
        fondo.classList.toggle('show', !!visible);
    }

    /* Restaura el scroll del body de forma segura. */
    function restaurarScroll() {
        if (document.body && document.body.style) {
            document.body.style.overflow = '';
        }
    }

    /* Bloquea el scroll del body mientras hay hoja abierta. */
    function bloquearScroll() {
        if (document.body && document.body.style) {
            document.body.style.overflow = 'hidden';
        }
    }

    /* ¿Queda alguna hoja abierta? */
    function hayHojaAbierta() {
        return !!document.querySelector('.hoja.show');
    }

    /* ---------------- Abrir / cerrar ---------------- */

    /* Abre una hoja por id, con fondo y bloqueo de scroll. */
    function abrirHoja(id) {
        var hoja = document.getElementById(id);
        if (!hoja) return;

        hoja.classList.add('show');
        mostrarFondo(true);
        bloquearScroll();
    }

    /* Cierra una hoja por id. Si era la última abierta, quita el fondo
       y devuelve el scroll. Al cerrar comentarios se limpia el video activo. */
    function cerrarHoja(id) {
        var hoja = document.getElementById(id);
        if (hoja) hoja.classList.remove('show');

        if (!hayHojaAbierta()) {
            mostrarFondo(false);
            restaurarScroll();
        }

        if (id === 'hojaComentarios') S.videoIdComentariosActual = null;
    }

    /* Cierra todas las hojas abiertas de una vez. */
    function cerrarTodasHojas() {
        document.querySelectorAll('.hoja.show').forEach(function (h) {
            h.classList.remove('show');
        });
        mostrarFondo(false);
        restaurarScroll();
        S.videoIdComentariosActual = null;
    }

    /* ---------------- Enganche de eventos ---------------- */

    /* Conecta el toque en el fondo y los botones con data-cerrar.
       Idempotente: no duplica listeners aunque se llame varias veces. */
    function engancharHojas() {
        var fondo = document.getElementById('hojaFondo');
        if (fondo && fondo.dataset.hojasEnganchado !== '1') {
            fondo.dataset.hojasEnganchado = '1';
            fondo.addEventListener('click', cerrarTodasHojas);
        }

        document.querySelectorAll('[data-cerrar]').forEach(function (b) {
            if (b.dataset.hojasEnganchado === '1') return;
            b.dataset.hojasEnganchado = '1';
            b.addEventListener('click', function () {
                cerrarHoja(b.dataset.cerrar);
            });
        });
    }

    /* ---------------- Contrato público ---------------- */

    VA.hojas = {
        abrirHoja: abrirHoja,
        cerrarHoja: cerrarHoja,
        cerrarTodasHojas: cerrarTodasHojas,
        hayHojaAbierta: hayHojaAbierta,
        engancharHojas: engancharHojas
    };
})();