// ================================================================
// GRUPOS · INICIALIZACIÓN
// ================================================================
// Arranque del módulo: carga inicial, eventos globales y exposición
// de todas las funciones a window para los onclick del HTML.
// Depende de: TODOS los archivos anteriores.
// ================================================================

// ================================================================
// INICIALIZACIÓN AL CARGAR EL DOM
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('◈ Sariel\'s - Cablera Descentralizada');
    console.log('[Grupos] supabaseClient:', !!window.supabaseClient);

    if (!window.supabaseClient) {
        if (window.__dbgShow) window.__dbgShow('Init: supabaseClient no disponible');
    }

    var timeoutGlobal = setTimeout(function() {
        var grid = document.getElementById('gruposGrid');
        if (grid && grid.innerHTML.includes('Cargando canales')) {
            console.warn('[Grupos] Timeout global, reintentando carga directa');
            cargarGrupos();
        }
    }, 8000);

    try {
        await esperarSupabase();

        try { await cargarUsuarioActual(); } catch (e) { console.warn('[Grupos] Usuario:', e.message); }

        await Promise.all([
            cargarCategorias().catch(function(e) { console.warn('[Grupos] Cat:', e.message); }),
            cargarEstados().catch(function(e) { console.warn('[Grupos] Est:', e.message); }),
            cargarMunicipios().catch(function(e) { console.warn('[Grupos] Mun:', e.message); })
        ]);

        try { await cargarDashboard(); } catch (e) { console.warn('[Grupos] Dash:', e.message); }

        var params = new URLSearchParams(window.location.search);
        var grupoIdDesdeUrl = params.get('grupo');

        if (grupoIdDesdeUrl) {
            await abrirGrupo(grupoIdDesdeUrl);
        } else {
            await cargarGrupos();
        }

        clearTimeout(timeoutGlobal);
    } catch (e) {
        console.error('[Grupos] Error en init:', e);
        if (window.__dbgShow) window.__dbgShow('Init: ' + (e && e.message ? e.message : String(e)));
        clearTimeout(timeoutGlobal);
        try { await cargarGrupos(); } catch (e2) { console.error('[Grupos] Error final:', e2); }
    }

    if (window.innerWidth < 900) switchTab('mis-canales');

    // ---- Atajos de teclado ----
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarModalCrearGrupo();
            cerrarModalAdmin();
            cerrarModalRegalos();
            cerrarConfirmacionEliminarGrupo();
            cerrarAjustesCanal();
            cerrarModalReportar();
            cerrarModalReportarAdmin();
            cerrarModalEtiquetar();
            cerrarModalMarketplace();
        }
        if (e.key === 'Enter') {
            var input = e.target;
            if (input.id === 'grupoLiveChatInput') {
                e.preventDefault();
                enviarMensajeLiveGrupo();
            }
            if (input.id && input.id.startsWith('inputComentario-')) {
                e.preventDefault();
                enviarComentarioPublicacion(input.id.replace('inputComentario-', ''));
            }
        }
    });

    // ---- Cerrar modales haciendo click fuera ----
    document.querySelectorAll('.modal-overlay').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('show');
        });
    });

    // ---- Navegación atrás/adelante ----
    window.addEventListener('popstate', async function(e) {
        var params = new URLSearchParams(window.location.search);
        var grupoId = params.get('grupo');
        if (grupoId) {
            if (grupoId !== grupoActualId) await abrirGrupo(grupoId);
        } else {
            volverALista();
        }
    });

    // ---- Idiomas ----
    setTimeout(async function() {
        try {
            if (typeof window.inicializarIdiomas === 'function') {
                await window.inicializarIdiomas();
                console.log('✅ Idiomas aplicados');
            }
        } catch (e) {
            console.warn('Error idiomas:', e);
        }
    }, 500);
});

// ================================================================
// EXPOSICIÓN GLOBAL A WINDOW
// (para que los onclick del HTML funcionen)
// ================================================================

// --- Lista / Directorio ---
window.cargarGrupos = cargarGrupos;
window.cargarMasGrupos = cargarMasGrupos;
window.buscarGruposDebounce = buscarGruposDebounce;
window.toggleMisGrupos = toggleMisGrupos;
window.switchTab = switchTab;
window.verTokens = verTokens;

// --- Interno del grupo ---
window.abrirGrupo = abrirGrupo;
window.volverALista = volverALista;
window.publicarEnGrupo = publicarEnGrupo;
window.subirFotoGrupo = subirFotoGrupo;
window.subirVideoGrupo = subirVideoGrupo;
window.reaccionarPublicacion = reaccionarPublicacion;
window.toggleComentariosPublicacion = toggleComentariosPublicacion;
window.enviarComentarioPublicacion = enviarComentarioPublicacion;
window.compartirPublicacion = compartirPublicacion;
window.filtrarFeed = filtrarFeed;
window.abrirFormPublicacion = abrirFormPublicacion;
window.toggleEmojiPickerGrupo = toggleEmojiPickerGrupo;
window.insertarHashtagGrupo = insertarHashtagGrupo;

// --- Interacciones del post ---
window.togglePostMenu = togglePostMenu;
window.toggleMeInteresa = toggleMeInteresa;
window.toggleNoMeInteresa = toggleNoMeInteresa;
window.ocultarPublicacionUsuario = ocultarPublicacionUsuario;
window.toggleNotificacion = toggleNotificacion;
window.copiarEnlacePost = copiarEnlacePost;

// --- Reportes ---
window.abrirModalReportar = abrirModalReportar;
window.cerrarModalReportar = cerrarModalReportar;
window.enviarReportePublicacion = enviarReportePublicacion;
window.abrirModalReportarAdmin = abrirModalReportarAdmin;
window.cerrarModalReportarAdmin = cerrarModalReportarAdmin;
window.enviarReporteAdmin = enviarReporteAdmin;

// --- Etiquetas ---
window.abrirModalEtiquetar = abrirModalEtiquetar;
window.cerrarModalEtiquetar = cerrarModalEtiquetar;
window.buscarUsuariosEtiqueta = buscarUsuariosEtiqueta;
window.agregarEtiqueta = agregarEtiqueta;
window.quitarEtiqueta = quitarEtiqueta;
window.guardarEtiquetas = guardarEtiquetas;

// --- Ajustes del canal ---
window.abrirAjustesCanal = abrirAjustesCanal;
window.cerrarAjustesCanal = cerrarAjustesCanal;
window.cambiarAvatarGrupo = cambiarAvatarGrupo;
window.cambiarPortadaGrupo = cambiarPortadaGrupo;
window.mostrarConfirmacionEliminarGrupo = mostrarConfirmacionEliminarGrupo;
window.cerrarConfirmacionEliminarGrupo = cerrarConfirmacionEliminarGrupo;
window.ejecutarEliminarGrupo = ejecutarEliminarGrupo;

// --- Admin ---
window.abrirAdminGrupo = abrirAdminGrupo;
window.cerrarModalAdmin = cerrarModalAdmin;
window.cargarAdminMiembros = cargarAdminMiembros;
window.cargarAdminPublicaciones = cargarAdminPublicaciones;
window.cargarAdminSolicitudes = cargarAdminSolicitudes;
window.cargarAdminReportes = cargarAdminReportes;
window.cargarAdminEditar = cargarAdminEditar;
window.guardarEdicionGrupo = guardarEdicionGrupo;
window.aceptarSolicitud = aceptarSolicitud;
window.rechazarSolicitud = rechazarSolicitud;
window.asignarModerador = asignarModerador;
window.quitarModerador = quitarModerador;
window.expulsarMiembro = expulsarMiembro;
window.bloquearMiembro = bloquearMiembro;
window.ocultarPublicacion = ocultarPublicacion;
window.mostrarPublicacion = mostrarPublicacion;
window.eliminarPublicacion = eliminarPublicacion;
window.marcarReporte = marcarReporte;

// --- Crear grupo ---
window.abrirModalCrearGrupo = abrirModalCrearGrupo;
window.cerrarModalCrearGrupo = cerrarModalCrearGrupo;
window.crearGrupo = crearGrupo;

// --- Marketplace ---
window.abrirModalMarketplace = abrirModalMarketplace;
window.cerrarModalMarketplace = cerrarModalMarketplace;
window.publicarMarketplace = publicarMarketplace;

// --- Regalos / Donaciones ---
window.abrirModalRegalos = abrirModalRegalos;
window.cerrarModalRegalos = cerrarModalRegalos;
window.enviarRegalo = enviarRegalo;
window.verificarRegalo = verificarRegalo;

// --- Anuncios ---
window.cerrarAnuncio = cerrarAnuncio;
window.registrarClicAnuncio = registrarClicAnuncio;

// --- Live ---
window.iniciarLiveEnGrupo = iniciarLiveEnGrupo;
window.verLiveActivo = verLiveActivo;
window.finalizarLiveGrupo = finalizarLiveGrupo;
window.cerrarLiveGrupoInline = cerrarLiveGrupoInline;
window.toggleMuteGrupoLive = toggleMuteGrupoLive;
window.enviarMensajeLiveGrupo = enviarMensajeLiveGrupo;

// --- Unirse / Solicitar ---
window.unirseAlGrupo = unirseAlGrupo;
window.solicitarUnirseAlGrupo = solicitarUnirseAlGrupo;

// --- Helpers expuestos por si se usan desde otros scripts ---
window.showToast = grpShowToast;
window.escapeHTML = grpEscapeHTML;
window.contienePalabrasCripto = contienePalabrasCripto;
window.validarTextoPermitido = validarTextoPermitido;
window.detectarInfraccion = detectarInfraccion;