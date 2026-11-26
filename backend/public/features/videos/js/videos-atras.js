// ================================================================
// CSARIEL'S · VIDEOS · BOTÓN ATRÁS (v1.1)
// ================================================================
// Controla el botón atrás del celular en videos.html.
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
//
// Cambios v1.1:
//  - Cierre de capas residuales: buscador (#vfBuscar.open / .show)
//    y confirmaciones visibles se limpian antes de navegar fuera.
//  - Respaldo de sheets: si .cs-sheet.show sigue visible y
//    VideosPublicar.cerrarTodosLosSheets no está disponible, se
//    quita .show de forma segura para no bloquear el historial.
//  - Historial y navegación protegidos: pushState y
//    location.replace envueltos en try/catch.
//  - activar() idempotente: no registra listeners duplicados y no
//    empuja entradas extra si ya se activó.
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

    /* Cierra el buscador visible (#vfBuscar con .open o .show). */
    function cerrarBuscadorSiVisible() {
        var buscador = document.getElementById('vfBuscar');
        if (!buscador) return false;
        if (!buscador.classList.contains('open') && !buscador.classList.contains('show')) {
            return false;
        }

        try {
            var input = buscador.querySelector('input');
            if (input) {
                input.value = '';
                if (typeof input.blur === 'function') input.blur();
            }
        } catch (e) { /* noop */ }

        buscador.classList.remove('open');
        buscador.classList.remove('show');
        return true;
    }

    /* Cierra cualquier overlay de confirmación visible. */
    function cerrarConfirmacionSiVisible() {
        var overlay = document.querySelector('.cs-confirm-overlay.show');
        if (!overlay) return false;

        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        } catch (e) {
            /* Si el dispatch falla, quitamos la clase como respaldo. */
            overlay.classList.remove('show');
        }
        return true;
    }

    /* Respaldo: si quedan .cs-sheet.show, los limpia a mano. */
    function respaldarCierreSheets() {
        var sheets = document.querySelectorAll('.cs-sheet.show');
        if (!sheets || !sheets.length) return false;

        for (var i = 0; i < sheets.length; i++) {
            sheets[i].classList.remove('show');
        }
        return true;
    }

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
            var cerroSheet = false;
            if (window.VideosPublicar && typeof window.VideosPublicar.cerrarTodosLosSheets === 'function') {
                try {
                    window.VideosPublicar.cerrarTodosLosSheets();
                    cerroSheet = true;
                } catch (e) {
                    cerroSheet = false;
                }
            }
            // Respaldo: si no había API o falló, limpiamos a mano.
            if (!cerroSheet) {
                respaldarCierreSheets();
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
            cerrarConfirmacionSiVisible();
            return true;
        }

        // 8. Capas residuales antes de navegar fuera
        if (cerrarBuscadorSiVisible()) return true;
        if (cerrarConfirmacionSiVisible()) return true;

        return false;
    }

    /* Vuelve a poner una entrada en el historial para que el siguiente
       botón atrás vuelva a pasar por este módulo. */
    function reponerEntrada() {
        try {
            history.pushState({ csVideos: true }, '', location.href);
        } catch (e) {
            console.warn('[Videos] pushState falló:', e);
        }
    }

    /* Navega al perfil con respaldo si location.replace falla. */
    function irAPerfil() {
        try {
            location.replace(CONFIG.RUTA_PERFIL);
        } catch (e) {
            console.warn('[Videos] location.replace falló, usando location.href:', e);
            try {
                location.href = CONFIG.RUTA_PERFIL;
            } catch (e2) {
                console.error('[Videos] No se pudo navegar al perfil:', e2);
            }
        }
    }

    /* Manejador del evento popstate. */
    function alPresionarAtras() {
        if (cerrarSuperposicion()) {
            reponerEntrada();
            return;
        }
        irAPerfil();
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