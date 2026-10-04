// ================================================================
// MENSAJES · MODALES Y ATALLOS GLOBALES
// ================================================================
// Comportamientos comunes de modales, atajos de teclado y
// funciones que cruzan varios módulos.
// Depende de: config, utils, auth, conversaciones, chat, estados.
// ================================================================

// ================================================================
// CERRAR TODOS LOS MODALES
// ================================================================
function cerrarTodosLosModales() {
    var ids = [
        'newModal',
        'profileModal',
        'vistasModal',
        'photoViewer',
        'estadoUploadModal',
        'modalCrearCanal',
        'modalCrearGrupo'
    ];

    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });

    // Visores full-screen
    var estados = document.getElementById('estadoViewer');
    if (estados && estados.classList.contains('show')) {
        cerrarEstadoViewer();
    }
}

// ================================================================
// CERRAR UN MODAL POR ID
// ================================================================
function cerrarModalPorId(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('show');
}

// ================================================================
// ATAJOS DE TECLADO GLOBALES (ESC)
// ================================================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Cerrar visor de estados primero (prioridad)
        var viewer = document.getElementById('estadoViewer');
        if (viewer && viewer.classList.contains('show')) {
            cerrarEstadoViewer();
            return;
        }

        // Luego el visor de fotos
        var pv = document.getElementById('photoViewer');
        if (pv && pv.classList.contains('show')) {
            cerrarPhotoViewer();
            return;
        }

        // Luego los modales
        cerrarTodosLosModales();
    }
});

// ================================================================
// CLICK FUERA DEL MODAL → CERRAR
// ================================================================
document.addEventListener('click', function(e) {
    // Si el click fue directamente en el fondo del modal
    if (e.target.classList && e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});

// ================================================================
// EVITAR SCROLL DEL BODY CUANDO HAY MODAL/VIEWER ABIERTO
// ================================================================
function actualizarBloqueoScroll() {
    var algunoAbierto =
        document.querySelector('.modal.show') ||
        document.querySelector('.photo-viewer.show') ||
        document.querySelector('.estado-viewer.show') ||
        document.querySelector('.call.show');

    if (algunoAbierto) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

// MutationObserver para detectar cambios de clases en modales/visores
(function observarModales() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function() {
        actualizarBloqueoScroll();
    });

    domListo(function() {
        var targets = document.querySelectorAll('.modal, .photo-viewer, .estado-viewer, .call');
        targets.forEach(function(el) {
            observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
    });
})();

// ================================================================
// PREVENIR DRAG DE IMÁGENES EN MÓVIL (evita el "ghost drag")
// ================================================================
document.addEventListener('dragstart', function(e) {
    if (e.target && e.target.tagName === 'IMG') {
        e.preventDefault();
    }
});

// ================================================================
// PREVENIR ZOOM ACCIDENTAL EN DOBLE TAP (móvil)
// ================================================================
(function prevenirDobleTapZoom() {
    var lastTap = 0;
    document.addEventListener('touchend', function(e) {
        var now = Date.now();
        if (now - lastTap < 300) {
            // Solo prevenimos si el target NO es un botón/input
            var t = e.target;
            if (t && t.tagName !== 'BUTTON' && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'A') {
                e.preventDefault();
            }
        }
        lastTap = now;
    }, { passive: false });
})();

// ================================================================
// RESIZE / ORIENTATION CHANGE
// ================================================================
window.addEventListener('resize', function() {
    // Re-scroll al fondo si estamos abajo (por si cambia el layout)
    if (isUserAtBottom && typeof scrollToBottom === 'function') {
        scrollToBottom(true);
    }
});

// ================================================================
// BEFORE UNLOAD — limpiar timers
// ================================================================
window.addEventListener('beforeunload', function() {
    // Estados
    if (typeof _estadoTimerRAF !== 'undefined' && _estadoTimerRAF) {
        cancelAnimationFrame(_estadoTimerRAF);
    }

    // Scroll retry
    if (typeof scrollRetryTimer !== 'undefined' && scrollRetryTimer) {
        clearInterval(scrollRetryTimer);
    }

    // Realtime
    try {
        if (typeof msgChannel !== 'undefined' && msgChannel && window.db) {
            window.db.removeChannel(msgChannel);
        }
        if (typeof callChannel !== 'undefined' && callChannel && window.db) {
            window.db.removeChannel(callChannel);
        }
    } catch (e) {}
});

// ================================================================
// HELPERS PARA EXPONER AL WINDOW
// ================================================================
window.cerrarTodosLosModales = cerrarTodosLosModales;
window.cerrarModalPorId = cerrarModalPorId;

console.log('[Mensajes] ✅ Modales cargado');