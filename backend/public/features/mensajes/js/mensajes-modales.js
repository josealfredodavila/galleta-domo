// ================================================================
// MENSAJES · MODALES Y ATAJOS GLOBALES
// ================================================================
// Comportamientos comunes: ESC con stack, click fuera, bloqueo de
// scroll, evitar drag de imágenes y doble tap zoom.
// Se carga DESPUÉS de todos los módulos anteriores.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// ================================================================

'use strict';

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
        'modalCrearGrupo',
        'incomingOverlay'
    ];

    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });

    // Visores full-screen (los cierra cada módulo específico)
    var estados = document.getElementById('estadoViewer');
    if (estados && estados.classList.contains('show')) {
        if (typeof cerrarEstadoViewer === 'function') {
            cerrarEstadoViewer();
        }
    }

    // Reset file inputs
    var fi = document.getElementById('estadoFileInput');
    if (fi) fi.value = '';

    var avatarInput = document.getElementById('avatarInput');
    if (avatarInput) avatarInput.value = '';

    // Actualizar bloqueo de scroll
    if (typeof actualizarBloqueoScroll === 'function') {
        actualizarBloqueoScroll();
    }
}

// ================================================================
// CERRAR UN MODAL POR ID
// ================================================================
function cerrarModalPorId(id) {
    if (!id) return;
    var el = document.getElementById(id);
    if (el) el.classList.remove('show');
    if (typeof actualizarBloqueoScroll === 'function') {
        actualizarBloqueoScroll();
    }
}

// ================================================================
// ATAJO ESC CON STACK (cierra el último modal abierto)
// ================================================================
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;

    // 1. Visor de estados (prioridad máxima)
    var viewer = document.getElementById('estadoViewer');
    if (viewer && viewer.classList.contains('show')) {
        if (typeof cerrarEstadoViewer === 'function') cerrarEstadoViewer();
        return;
    }

    // 2. Visor de fotos
    var pv = document.getElementById('photoViewer');
    if (pv && pv.classList.contains('show')) {
        if (typeof cerrarPhotoViewer === 'function') cerrarPhotoViewer();
        return;
    }

    // 3. Modal de vistas (secundario)
    var vistasModal = document.getElementById('vistasModal');
    if (vistasModal && vistasModal.classList.contains('show')) {
        if (typeof cerrarVistasModal === 'function') cerrarVistasModal();
        return;
    }

    // 4. Modal de subir estado
    var estadoUpload = document.getElementById('estadoUploadModal');
    if (estadoUpload && estadoUpload.classList.contains('show')) {
        if (typeof cerrarModalEstado === 'function') cerrarModalEstado();
        return;
    }

    // 5. Modal de perfil
    var profileModal = document.getElementById('profileModal');
    if (profileModal && profileModal.classList.contains('show')) {
        if (typeof cerrarProfileModal === 'function') cerrarProfileModal();
        return;
    }

    // 6. Modal de nueva conversación
    var newModal = document.getElementById('newModal');
    if (newModal && newModal.classList.contains('show')) {
        if (typeof cerrarModalNuevaConversacion === 'function') cerrarModalNuevaConversacion();
        return;
    }

    // 7. Modales de crear canal/grupo
    var modalCanal = document.getElementById('modalCrearCanal');
    if (modalCanal && modalCanal.classList.contains('show')) {
        if (typeof cerrarModalCrearCanal === 'function') cerrarModalCrearCanal();
        return;
    }

    var modalGrupo = document.getElementById('modalCrearGrupo');
    if (modalGrupo && modalGrupo.classList.contains('show')) {
        if (typeof cerrarModalCrearGrupo === 'function') cerrarModalCrearGrupo();
        return;
    }

    // 8. Stack genérico: si no cayó ninguna prioridad, cerrar el último `.modal.show`
    var abiertos = Array.prototype.slice.call(document.querySelectorAll('.modal.show'));
    if (abiertos.length) {
        abiertos[abiertos.length - 1].classList.remove('show');
        if (typeof actualizarBloqueoScroll === 'function') {
            actualizarBloqueoScroll();
        }
        return;
    }

    // 9. Fallback
    cerrarTodosLosModales();
});

// ================================================================
// CLICK FUERA DEL MODAL → CERRAR
// ================================================================
document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t) return;

    // Click directo sobre el fondo del modal (no sobre el contenido)
    if (t.classList && t.classList.contains('modal')) {
        t.classList.remove('show');
        if (typeof actualizarBloqueoScroll === 'function') {
            actualizarBloqueoScroll();
        }
        return;
    }

    // Click sobre un hijo directo del modal (por si el modal tiene wrapper)
    if (t.parentElement && t.parentElement.classList && t.parentElement.classList.contains('modal')) {
        // Verificar que no sea el contenido del modal
        if (!t.closest('.modalbox') && !t.closest('.profile-modal-box')) {
            t.parentElement.classList.remove('show');
            if (typeof actualizarBloqueoScroll === 'function') {
                actualizarBloqueoScroll();
            }
        }
    }
}, { passive: true });

// ================================================================
// BLOQUEO DE SCROLL DEL BODY
// ================================================================
var _overflowPrevio = null;

function actualizarBloqueoScroll() {
    var algunoAbierto =
        document.querySelector('.modal.show') ||
        document.querySelector('.photo-viewer.show') ||
        document.querySelector('.estado-viewer.show') ||
        document.querySelector('.call.show');

    if (algunoAbierto) {
        if (_overflowPrevio === null) {
            _overflowPrevio = document.body.style.overflow || '';
        }
        document.body.style.overflow = 'hidden';
    } else if (_overflowPrevio !== null) {
        document.body.style.overflow = _overflowPrevio;
        _overflowPrevio = null;
    }

    // Accesibilidad: inert + aria-hidden en modales cerrados
    document.querySelectorAll('.modal, .photo-viewer, .estado-viewer, .call').forEach(function(el) {
        if (el.classList.contains('show')) {
            if (el.hasAttribute('inert')) el.removeAttribute('inert');
            el.setAttribute('aria-hidden', 'false');
        } else {
            el.setAttribute('inert', '');
            el.setAttribute('aria-hidden', 'true');
        }
    });
}

// ================================================================
// MUTATION OBSERVER (bloqueo de scroll automático)
// ================================================================
(function observarModales() {
    if (!window.MutationObserver) {
        // Fallback: llamar directo
        if (typeof domListo === 'function') {
            domListo(function() { actualizarBloqueoScroll(); });
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', actualizarBloqueoScroll);
        } else {
            actualizarBloqueoScroll();
        }
        return;
    }

    var observer = new MutationObserver(function() {
        actualizarBloqueoScroll();
    });

    var setup = function() {
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true
        });
        actualizarBloqueoScroll();
    };

    if (typeof domListo === 'function') {
        domListo(setup);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }

    window._modalObserver = observer;
})();

// ================================================================
// EVITAR DRAG DE IMÁGENES / SVG EN MÓVIL
// ================================================================
document.addEventListener('dragstart', function(e) {
    var t = e.target;
    if (!t) return;
    if (t.tagName === 'IMG' ||
        t.tagName === 'svg' ||
        (t.tagName && t.tagName.toLowerCase() === 'image')) {
        e.preventDefault();
    }
}, { passive: true });

// ================================================================
// EVITAR ZOOM ACCIDENTAL EN DOBLE TAP (solo en imágenes de chat)
// ================================================================
(function prevenirDobleTapZoom() {
    var lastTap = 0;
    var ignorar = { BUTTON: 1, INPUT: 1, TEXTAREA: 1, A: 1, SELECT: 1, LABEL: 1, SVG: 1 };

    document.addEventListener('touchend', function(e) {
        var t = e.target;
        if (!t || ignorar[t.tagName]) {
            lastTap = 0;
            return;
        }

        var now = Date.now();
        var esImagenDeChat = (t.tagName === 'IMG') || (t.closest && t.closest('.bubble img'));

        if (now - lastTap < 300 && esImagenDeChat) {
            e.preventDefault();
        }
        lastTap = now;
    }, { passive: false });
})();

// ================================================================
// RESIZE / ORIENTATION CHANGE (re-scroll si estamos abajo)
// ================================================================
var _resizeTimer = null;
window.addEventListener('resize', function() {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() {
        if (typeof detectarSiEstaAbajo === 'function') {
            detectarSiEstaAbajo();
        }
        if (typeof isUserAtBottom !== 'undefined' && isUserAtBottom && typeof scrollToBottom === 'function') {
            scrollToBottom(true);
        }
    }, 200);
});

// ================================================================
// BEFORE UNLOAD (limpieza de timers y canales)
// ================================================================
window.addEventListener('beforeunload', function() {
    // Cancelar timers de estados
    if (typeof estadoTimer !== 'undefined' && estadoTimer) {
        try { clearInterval(estadoTimer); } catch (e) {}
    }

    // Cancelar timers de scroll
    if (typeof scrollRetryTimer !== 'undefined' && scrollRetryTimer) {
        try { clearInterval(scrollRetryTimer); } catch (e) {}
    }
    if (window.scrollRetryTimer) {
        try { clearInterval(window.scrollRetryTimer); } catch (e) {}
    }

    // Detener grabaciones activas
    try {
        if (typeof voiceBotRecorder !== 'undefined' && voiceBotRecorder && voiceBotRecorder.state !== 'inactive') {
            voiceBotRecorder.stop();
        }
    } catch (e) {}

    try {
        if (typeof recorder !== 'undefined' && recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
    } catch (e) {}

    // Cancelar operaciones del bot
    if (typeof cancelarOperacionesBot === 'function') {
        try { cancelarOperacionesBot(); } catch (e) {}
    }

    // Remover canales realtime
    try {
        if (typeof msgChannel !== 'undefined' && msgChannel && window.db) {
            window.db.removeChannel(msgChannel);
        }
    } catch (e) {}

    try {
        if (typeof callChannel !== 'undefined' && callChannel && window.db) {
            window.db.removeChannel(callChannel);
        }
    } catch (e) {}

    // Desconectar observer
    if (window._modalObserver && typeof window._modalObserver.disconnect === 'function') {
        try { window._modalObserver.disconnect(); } catch (e) {}
    }
});

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.cerrarTodosLosModales = cerrarTodosLosModales;
window.cerrarModalPorId = cerrarModalPorId;
window.actualizarBloqueoScroll = actualizarBloqueoScroll;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Modales] ✅ Modales cargado');
}