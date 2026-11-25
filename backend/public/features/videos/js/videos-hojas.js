// ================================================================
// CSARIEL'S · VIDEOS · HOJAS INFERIORES (v1)
// ================================================================
// Control de las hojas inferiores de videos.html:
// comentarios, menú del video, mapa y publicar.
// - Abrir y cerrar una hoja por id.
// - Mostrar u ocultar el fondo oscuro (#hojaFondo).
// - Bloquear el scroll de la página mientras hay una hoja abierta.
// - Conectar los botones de cierre y el toque en el fondo.
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

    /* Muestra el fondo oscuro si está en el DOM. */
    function mostrarFondo(visible) {
        var fondo = document.getElementById('hojaFondo');
        if (fondo) fondo.classList.toggle('show', !!visible);
    }

    /* ¿Queda alguna hoja abierta? */
    function hayHojaAbierta() {
        return !!document.querySelector('.hoja.show');
    }

    /* Abre una hoja por id, con fondo y bloqueo de scroll. */
    function abrirHoja(id) {
        var hoja = document.getElementById(id);
        if (!hoja) return;

        hoja.classList.add('show');
        mostrarFondo(true);
        document.body.style.overflow = 'hidden';
    }

    /* Cierra una hoja por id. Si era la última abierta, quita el fondo
       y devuelve el scroll. Al cerrar comentarios se limpia el video activo. */
    function cerrarHoja(id) {
        var hoja = document.getElementById(id);
        if (hoja) hoja.classList.remove('show');

        if (!hayHojaAbierta()) {
            mostrarFondo(false);
            document.body.style.overflow = '';
        }

        if (id === 'hojaComentarios') S.videoIdComentariosActual = null;
    }

    /* Cierra todas las hojas abiertas de una vez. */
    function cerrarTodasHojas() {
        document.querySelectorAll('.hoja.show').forEach(function (h) {
            h.classList.remove('show');
        });
        mostrarFondo(false);
        document.body.style.overflow = '';
        S.videoIdComentariosActual = null;
    }

    /* Conecta el toque en el fondo y los botones con data-cerrar.
       Lo llama videos-init.js una sola vez. */
    function engancharHojas() {
        var fondo = document.getElementById('hojaFondo');
        if (fondo && !fondo.dataset.hojasEnganchado) {
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

    VA.hojas = {
        abrirHoja: abrirHoja,
        cerrarHoja: cerrarHoja,
        cerrarTodasHojas: cerrarTodasHojas,
        hayHojaAbierta: hayHojaAbierta,
        engancharHojas: engancharHojas
    };
})();