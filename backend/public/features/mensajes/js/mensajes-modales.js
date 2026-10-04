// ================================================================
// MENSAJES · MODALES Y ATAJOS GLOBALES — v2.0
// ================================================================
// Comportamientos comunes de modales, atajos de teclado y
// funciones que cruzan varios módulos.
//
// Depende de:
//   • mensajes-config.js       (db, user, current, call, msgChannel...)
//   • mensajes-utils.js        ($, toast, esc, domListo)
//   • mensajes-auth.js         (auth)
//   • mensajes-conversaciones.js
//   • mensajes-chat.js         (cerrarEstadoViewer, cerrarPhotoViewer...)
//   • mensajes-estados.js      (cerrarEstadoViewer, estadoPausado...)
//   • mensajes-llamadas.js     (hangup, rejectCall, cleanupCall...)
//
// INTEGRACIÓN v2.0:
//   • Namespace window.Chat.*
//   • Exposición directa window.* (compatibilidad legacy)
//   • Fallbacks robustos si algún módulo no cargó
//   • Cleanup de micrófono/cámara al cerrar modales de llamada
//   • Emisión de eventos del ecosistema
//   • ESC cierra llamadas entrantes
//   • Logs de diagnóstico si DEBUG_CHAT
// ================================================================

// ----------------------------------------------------------------
// NAMESPACE
// ----------------------------------------------------------------
window.Chat = window.Chat || {};

// ----------------------------------------------------------------
// FLAG DEBUG
// ----------------------------------------------------------------
if (typeof window.DEBUG_CHAT === 'undefined') {
    window.DEBUG_CHAT = false;
}

// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------
function _modLog() {
    if (window.DEBUG_CHAT && console && console.log) {
        console.log.apply(console, ['[Modales]'].concat(Array.prototype.slice.call(arguments)));
    }
}

function _modSafeCall(fnName, args) {
    // Llama a una función global si existe, con fallback vía window.Chat
    var fn = (window.Chat && typeof window.Chat[fnName] === 'function')
        ? window.Chat[fnName]
        : (typeof window[fnName] === 'function' ? window[fnName] : null);

    if (typeof fn !== 'function') {
        _modLog('⚠️ Función no disponible:', fnName);
        return false;
    }

    try {
        fn.apply(null, args || []);
        return true;
    } catch (e) {
        console.warn('[Modales] Error llamando a', fnName, e);
        return false;
    }
}

// ================================================================
// CERRAR TODOS LOS MODALES
// ================================================================
function cerrarTodosLosModales() {
    _modLog('cerrarTodosLosModales()');

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
        if (el && el.classList) {
            el.classList.remove('show');
        }
    });

    // Visor de estados (usa función dedicada)
    var estados = document.getElementById('estadoViewer');
    if (estados && estados.classList.contains('show')) {
        _modSafeCall('cerrarEstadoViewer', []);
    }

    // ✅ v2.0: Emitir evento
    try {
        window.dispatchEvent(new CustomEvent('modales:cerradosTodos'));
    } catch (e) {}

    // ✅ v2.0: Actualizar bloqueo de scroll inmediatamente
    actualizarBloqueoScroll();
}

// ================================================================
// CERRAR UN MODAL POR ID
// ================================================================
function cerrarModalPorId(id) {
    if (!id) return;

    _modLog('cerrarModalPorId:', id);

    var el = document.getElementById(id);
    if (el && el.classList) {
        el.classList.remove('show');

        // ✅ v2.0: Emitir evento específico
        try {
            window.dispatchEvent(new CustomEvent('modal:cerrado', {
                detail: { id: id }
            }));
        } catch (e) {}

        actualizarBloqueoScroll();
    }
}

// ================================================================
// ✅ v2.0: CLEANUP DE LLAMADA (micrófono + cámara)
// ================================================================
function _cleanupLlamadaSiNecesario() {
    // Si la llamada está activa o hay overlays abiertos, limpiar
    var callActiva = (typeof call !== 'undefined' && call && call.active);
    var overlayCall = document.getElementById('callOverlay');
    var overlayIncoming = document.getElementById('incomingOverlay');

    var callVisible = overlayCall && overlayCall.classList.contains('show');
    var incomingVisible = overlayIncoming && overlayIncoming.classList.contains('show');

    if (callActiva || callVisible || incomingVisible) {
        _modLog('🧹 Limpiando recursos de llamada al cerrar modales');

        // ✅ Detener tracks locales
        try {
            if (typeof call !== 'undefined' && call) {
                if (call.audio && typeof call.audio.stop === 'function') {
                    call.audio.stop();
                }
                if (call.video && typeof call.video.stop === 'function') {
                    call.video.stop();
                }
                if (call.screen && typeof call.screen.stop === 'function') {
                    call.screen.stop();
                }
            }
        } catch (e) {
            console.warn('[Modales] Error deteniendo tracks:', e);
        }

        // ✅ Rechazar/colgar la llamada si hay funciones disponibles
        if (incomingVisible && typeof rejectCall === 'function') {
            try { rejectCall(); } catch (e) {}
        } else if (callVisible && typeof hangup === 'function') {
            try { hangup(); } catch (e) {}
        }

        // ✅ Ocultar overlays
        if (overlayCall) overlayCall.classList.remove('show');
        if (overlayIncoming) overlayIncoming.classList.remove('show');
    }
}

// ================================================================
// ATAJOS DE TECLADO GLOBALES
// ================================================================
document.addEventListener('keydown', function(e) {

    // ✅ v2.0: Solo procesar ESC si no hay un input activo
    var tag = (e.target && e.target.tagName) ? e.target.tagName : '';
    var esInput = (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable));

    if (e.key === 'Escape') {

        // 1. Cerrar visor de estados primero (prioridad)
        var viewer = document.getElementById('estadoViewer');
        if (viewer && viewer.classList.contains('show')) {
            _modLog('ESC → cerrando visor de estados');
            _modSafeCall('cerrarEstadoViewer', []);
            return;
        }

        // 2. Cerrar visor de fotos
        var pv = document.getElementById('photoViewer');
        if (pv && pv.classList.contains('show')) {
            _modLog('ESC → cerrando visor de fotos');
            _modSafeCall('cerrarPhotoViewer', []);
            return;
        }

        // 3. Cerrar modales de llamada (con cleanup)
        var incoming = document.getElementById('incomingOverlay');
        if (incoming && incoming.classList.contains('show')) {
            _modLog('ESC → rechazando llamada entrante');
            _modSafeCall('rejectCall', []);
            return;
        }

        var callOverlay = document.getElementById('callOverlay');
        if (callOverlay && callOverlay.classList.contains('show')) {
            _modLog('ESC → colgando llamada');
            _modSafeCall('hangup', []);
            return;
        }

        // 4. Cerrar otros modales
        if (!esInput) {
            _modLog('ESC → cerrando todos los modales');
            cerrarTodosLosModales();
        }
    }
});

// ================================================================
// CLICK FUERA DEL MODAL → CERRAR
// ================================================================
document.addEventListener('click', function(e) {
    if (!e.target || !e.target.classList) return;

    // ✅ Si el click fue directamente en el fondo del modal
    if (e.target.classList.contains('modal')) {
        _modLog('Click fuera del modal → cerrando:', e.target.id);
        e.target.classList.remove('show');
        actualizarBloqueoScroll();
    }

    // ✅ v2.0: Si fue en el fondo del photo-viewer
    if (e.target.classList.contains('photo-viewer')) {
        _modSafeCall('cerrarPhotoViewer', []);
    }
});

// ================================================================
// BLOQUEO DE SCROLL DEL BODY CON MODALES ABIERTOS
// ================================================================
function actualizarBloqueoScroll() {
    var algunoAbierto =
        document.querySelector('.modal.show') ||
        document.querySelector('.photo-viewer.show') ||
        document.querySelector('.estado-viewer.show') ||
        document.querySelector('.call.show');

    if (algunoAbierto) {
        if (document.body.style.overflow !== 'hidden') {
            document.body.style.overflow = 'hidden';
            _modLog('Body scroll bloqueado');
        }
    } else {
        if (document.body.style.overflow !== '') {
            document.body.style.overflow = '';
            _modLog('Body scroll desbloqueado');
        }
    }
}

// ================================================================
// OBSERVER DE MODALES (para bloqueo de scroll)
// ================================================================
(function observarModales() {
    if (!window.MutationObserver) {
        _modLog('MutationObserver no soportado, usando fallback');
        return;
    }

    var observer = new MutationObserver(function() {
        actualizarBloqueoScroll();
    });

    // ✅ v2.0: Ejecutar cuando el DOM esté listo
    function setup() {
        var targets = document.querySelectorAll('.modal, .photo-viewer, .estado-viewer, .call');
        targets.forEach(function(el) {
            observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
        _modLog('Observer instalado en', targets.length, 'elementos');
    }

    if (typeof domListo === 'function') {
        domListo(setup);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup, { once: true });
    } else {
        setup();
    }
})();

// ================================================================
// PREVENIR DRAG DE IMÁGENES EN MÓVIL
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
            var t = e.target;

            // ✅ v2.0: Excluir más elementos interactivos
            var esInteractivo = t && (
                t.tagName === 'BUTTON' ||
                t.tagName === 'INPUT' ||
                t.tagName === 'TEXTAREA' ||
                t.tagName === 'A' ||
                t.tagName === 'SELECT' ||
                (t.closest && t.closest('button, input, textarea, select, a, [role="button"]'))
            );

            if (!esInteractivo) {
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
    if (isUserAtBottom && typeof scrollToBottom === 'function') {
        _modSafeCall('scrollToBottom', [true]);
    }
});

// ================================================================
// BEFORE UNLOAD — limpiar timers y canales
// ================================================================
window.addEventListener('beforeunload', function() {
    _modLog('🧹 beforeunload: limpiando recursos');

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
    } catch (e) {
        console.warn('[Modales] Error cerrando canales realtime:', e);
    }

    // ✅ v2.0: Cleanup de llamada
    try {
        if (typeof call !== 'undefined' && call) {
            if (call.audio && typeof call.audio.stop === 'function') call.audio.stop();
            if (call.video && typeof call.video.stop === 'function') call.video.stop();
            if (call.screen && typeof call.screen.stop === 'function') call.screen.stop();
            if (call.room && typeof call.room.disconnect === 'function') call.room.disconnect();
        }
    } catch (e) {}
});

// ================================================================
// ✅ v2.0: EXPOSICIÓN GLOBAL — Namespace Chat
// ================================================================
window.Chat.cerrarTodosLosModales = cerrarTodosLosModales;
window.Chat.cerrarModalPorId = cerrarModalPorId;
window.Chat.actualizarBloqueoScroll = actualizarBloqueoScroll;

// ================================================================
// ✅ v2.0: EXPOSICIÓN GLOBAL — Compatibilidad legacy
// ================================================================
window.cerrarTodosLosModales = cerrarTodosLosModales;
window.cerrarModalPorId = cerrarModalPorId;
window.actualizarBloqueoScroll = actualizarBloqueoScroll;

// ================================================================
// ✅ v2.0: EVENTO DE LISTO
// ================================================================
try {
    window.dispatchEvent(new CustomEvent('modales:listo', {
        detail: {
            version: '2.0',
            funciones: [
                'cerrarTodosLosModales',
                'cerrarModalPorId',
                'actualizarBloqueoScroll'
            ]
        }
    }));
} catch (e) {}

// ================================================================
// DIAGNÓSTICO
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes] ✅ Modales v2.0 cargado (integración con ecosistema)');
    console.log('[Mensajes] Funciones expuestas:');
    console.log('  • window.cerrarTodosLosModales');
    console.log('  • window.cerrarModalPorId');
    console.log('  • window.actualizarBloqueoScroll');
    console.log('  • window.Chat.* (namespace)');
} else {
    console.log('[Mensajes] ✅ Modales v2.0 cargado');
}