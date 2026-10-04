// ================================================================
// MENSAJES · MODALES Y EVENTOS GLOBALES
// ================================================================
// Manejo de todos los modales, cierre con ESC y clic fuera.
// Depende de: mensajes-config.js, mensajes-utils.js,
//             mensajes-auth.js, mensajes-conversaciones.js,
//             mensajes-estados.js, mensajes-llamadas.js
// ================================================================

// ================================================================
// CERRAR TODOS LOS MODALES
// ================================================================
function cerrarTodosLosModales() {
    var ids = [
        'newModal',
        'profileModal',
        'vistasModal',
        'estadoUploadModal',
        'photoViewer',
        'estadoViewer'
    ];
    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
}

// ================================================================
// CERRAR MODAL POR CLICK FUERA
// ================================================================
function setupClickFuera() {
    // Modal nueva conversación
    var newModal = $('newModal');
    if (newModal) {
        newModal.addEventListener('click', function(e) {
            if (e.target === newModal) cerrarModalNuevaConversacion();
        });
    }

    // Modal perfil
    var profileModal = $('profileModal');
    if (profileModal) {
        profileModal.addEventListener('click', function(e) {
            if (e.target === profileModal) cerrarProfileModal();
        });
    }

    // Modal vistas
    var vistasModal = $('vistasModal');
    if (vistasModal) {
        vistasModal.addEventListener('click', function(e) {
            if (e.target === vistasModal) cerrarVistasModal();
        });
    }

    // Modal subir estado
    var estadoUploadModal = $('estadoUploadModal');
    if (estadoUploadModal) {
        estadoUploadModal.addEventListener('click', function(e) {
            if (e.target === estadoUploadModal) cerrarModalEstado();
        });
    }

    // Visor de foto
    var photoViewer = $('photoViewer');
    if (photoViewer) {
        photoViewer.addEventListener('click', function(e) {
            if (e.target === photoViewer) cerrarPhotoViewer();
        });
    }
}

// ================================================================
// SETUP DE BOTONES DE CERRAR
// ================================================================
function setupBotonesCerrar() {
    // Cerrar modal nueva conversación
    var closeModal = $('closeModal');
    if (closeModal) closeModal.onclick = cerrarModalNuevaConversacion;

    // Cerrar modal perfil
    var btnCerrarProfileModal = $('btnCerrarProfileModal');
    if (btnCerrarProfileModal) btnCerrarProfileModal.onclick = cerrarProfileModal;

    // Cerrar modal vistas
    var closeVistasModal = $('closeVistasModal');
    if (closeVistasModal) closeVistasModal.onclick = cerrarVistasModal;

    // Cerrar modal subir estado
    var closeEstadoModal = $('closeEstadoModal');
    if (closeEstadoModal) closeEstadoModal.onclick = cerrarModalEstado;

    // Cerrar visor de foto
    var pvClose = $('pvClose');
    if (pvClose) pvClose.onclick = cerrarPhotoViewer;

    // Cerrar visor de estado
    var evClose = $('evClose');
    if (evClose) evClose.onclick = cerrarEstadoViewer;
}

// ================================================================
// SETUP DE BOTONES DEL ESTADO VIEWER
// ================================================================
function setupEstadoViewerBotones() {
    // Navegación prev / next
    var evPrev = $('evPrev');
    if (evPrev) {
        evPrev.onclick = function(e) {
            e.stopPropagation();
            anteriorEstado();
        };
    }

    var evNext = $('evNext');
    if (evNext) {
        evNext.onclick = function(e) {
            e.stopPropagation();
            siguienteEstado();
        };
    }

    // Click en el contador de vistas
    var evVistas = $('evVistas');
    if (evVistas) {
        evVistas.onclick = function(e) {
            e.stopPropagation();
            var estadoId = evVistas.dataset.estadoId;
            if (estadoId) abrirVistasModal(estadoId);
        };
    }

    // Pausar / reanudar al mantener presionado
    var evBody = $('evBody');
    if (evBody) {
        evBody.addEventListener('mousedown', activarPausaEstado);
        evBody.addEventListener('mouseup', desactivarPausaEstado);
        evBody.addEventListener('mouseleave', desactivarPausaEstado);

        evBody.addEventListener('touchstart', function(e) {
            e.preventDefault();
            activarPausaEstado();
        }, { passive: false });

        evBody.addEventListener('touchend', function(e) {
            e.preventDefault();
            desactivarPausaEstado();
        }, { passive: false });

        evBody.addEventListener('touchcancel', desactivarPausaEstado);
    }

    // Barra espaciadora para pausar/reanudar
    document.addEventListener('keydown', function(e) {
        var viewer = $('estadoViewer');
        if (e.key === ' ' && viewer && viewer.classList.contains('show')) {
            e.preventDefault();
            if (estadoPausado) desactivarPausaEstado();
            else activarPausaEstado();
        }
    });
}

// ================================================================
// SETUP DE BOTÓN SUBIR ESTADO
// ================================================================
function setupSubirEstado() {
    var btnSubirEstado = $('btnSubirEstado');
    if (btnSubirEstado) btnSubirEstado.onclick = abrirModalEstado;

    var btnSeleccionarEstado = $('btnSeleccionarEstado');
    if (btnSeleccionarEstado) btnSeleccionarEstado.onclick = seleccionarArchivoEstado;

    var estadoFileInput = $('estadoFileInput');
    if (estadoFileInput) estadoFileInput.addEventListener('change', previewEstado);

    var btnPublicarEstado = $('btnPublicarEstado');
    if (btnPublicarEstado) btnPublicarEstado.onclick = publicarEstado;
}

// ================================================================
// SETUP DE MODAL DE PERFIL
// ================================================================
function setupProfileModal() {
    var headerAvatar = $('headerAvatar');
    if (headerAvatar) headerAvatar.onclick = abrirProfileModal;

    var avatarInput = $('avatarInput');
    if (avatarInput) avatarInput.addEventListener('change', subirFotoHeader);

    var btnCambiarFoto = $('btnCambiarFoto');
    if (btnCambiarFoto) {
        btnCambiarFoto.onclick = function() {
            var avatarInput = $('avatarInput');
            if (avatarInput) avatarInput.click();
        };
    }
}

// ================================================================
// SETUP ESCAPE
// ================================================================
function setupEscape() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarProfileModal();
            cerrarPhotoViewer();
            cerrarEstadoViewer();
            cerrarModalEstado();
            cerrarVistasModal();
            cerrarModalNuevaConversacion();
        }
    });
}