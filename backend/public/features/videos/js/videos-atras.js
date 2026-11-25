// ================================================================
// CSARIEL'S · VIDEOS · BOTÓN ATRÁS (v1)
// ================================================================
//控制 el botón atrás del celular en videos.html.
// Orden de cierre (de lo más reciente a lo más antiguo):
//   1. Hojas inferiores de videos.html (comentarios, menú, mapa, publicar)
//   2. Barra de reacciones abierta
//   3. Cámara (#csModalCamara)
//   4. Vista previa (#csModalPreview)
//   5. Sheets de sonidos, ubicación y borradores (.cs-sheet)
//   6. Aviso de cuota (#csModalCuota)
//   7. Diálogo de confirmación (.cs-confirm-overlay)
// Si no hay nada abierto, el botón lleva al perfil.
// Expuesto en window.VideosApp.atras.
// Requiere: config, utils, hojas, controles.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.hojas || !VA.controles) {
        console.error('[Videos] videos-atras.js requiere config, utils, hojas y controles.');
        return;
    }
    if (VA.atras) return;

    var CONFIG = VA.CONFIG;
    var marcaActiva = false;

    /* Cierra la superposición más reciente. Devuelve true si cerró algo. */
    function cerrarSuperposicion() {
        // 1. Hojas inferiores de videos.html
        if (VA.hojas.hayHojaAbierta()) {
            VA.hojas.cerrarTodasHojas();
            return true;
        }

        // 2. Barra de reacciones
        if (VA.controles.hayBarraAbierta()) {
            VA.controles.cerrarBarrasReacciones();
            return true;
        }

        // 3. Cámara
        var camara = document.getElementById('csModalCamara');
        if (camara && camara.classList.contains('show')) {
            if (window.VideosCamara && typeof window.VideosCamara.cerrarCamara === 'function') {
                window.VideosCamara.cerrarCamara();
            }
            camara.classList.remove('show');
            return true;
        }

        // 4. Vista previa del video
        var preview = document.getElementById('csModalPreview');
        if (preview && preview.classList.contains('show')) {
            if (window.VideosPublicar && typeof window.VideosPublicar.cerrarPreview === 'function') {
                window.VideosPublicar.cerrarPreview();
            }
            return true;
        }

        // 5. Sheets de sonidos, ubicación y borradores
        if (document.querySelector('.cs-sheet.show')) {
            if (window.VideosPublicar && typeof window.VideosPublicar.cerrarTodosLosSheets === 'function') {
                window.VideosPublicar.cerrarTodosLosSheets();
            }
            return true;
        }

        // 6. Aviso de cuota
        var cuota = document.getElementById('csModalCuota');
        if (cuota) {
            cuota.remove();
            return true;
        }

        // 7. Diálogo de confirmación: se cierra simulando Escape
        if (document.querySelector('.cs-confirm-overlay.show')) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return true;
        }

        return false;
    }

    /* Vuelve a poner una entrada en el historial para que el siguiente
       botón atrás vuelva a pasar por este módulo. */
    function reponerEntrada() {
        history.pushState({ csVideos: true }, '', location.href);
    }

    /* Manejador del evento popstate. */
    function alPresionarAtras() {
        if (cerrarSuperposicion()) {
            reponerEntrada();
            return;
        }
        location.replace(CONFIG.RUTA_PERFIL);
    }

    /* Activa el control del botón atrás. Se llama una sola vez desde videos-init.js. */
    function activar() {
        if (marcaActiva) return;
        marcaActiva = true;

        reponerEntrada();
        window.addEventListener('popstate', alPresionarAtras);
    }

    VA.atras = {
        activar: activar,
        cerrarSuperposicion: cerrarSuperposicion
    };
})();