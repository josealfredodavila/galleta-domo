// ================================================================
// MURO · INICIALIZACIÓN
// ================================================================
// Arranque del módulo, delegación de eventos, exposición a window.
// Depende de: TODOS los archivos anteriores.
// ================================================================

// ================================================================
// CARGAR USUARIO ACTUAL (con tokens y avatar)
// ================================================================
async function cargarUsuarioActual() {
    try {
        var session = await getSessionMuro();

        if (!session) {
            sessionUser = null;
            var elNombre = document.getElementById('userNombre');
            var elHandle = document.getElementById('userHandle');
            var elAvatar = document.getElementById('userAvatar');
            if (elNombre) elNombre.textContent = 'Explorador';
            if (elHandle) elHandle.textContent = '@explorador';
            if (elAvatar) elAvatar.textContent = '◈';
            return null;
        }

        sessionUser = session.user;

        var result = await supabaseClient
            .from('usuarios')
            .select('nombre, handle, avatar_url, tokens')
            .eq('id', session.user.id)
            .single();
        if (result.error) throw result.error;

        var data = result.data;
        if (data) {
            var elNombre = document.getElementById('userNombre');
            var elHandle = document.getElementById('userHandle');
            var elAvatar = document.getElementById('userAvatar');
            if (elNombre) elNombre.textContent = data.nombre || 'Explorador';
            if (elHandle) elHandle.textContent = '@' + (data.handle || 'explorador');

            if (elAvatar) {
                if (data.avatar_url) {
                    elAvatar.innerHTML = '<img src="' + escapeHTML(data.avatar_url) + '">';
                } else {
                    elAvatar.textContent = '◈';
                }
            }

            var tokenBadge = document.getElementById('tokenBadgeCantidad');
            if (tokenBadge) tokenBadge.textContent = data.tokens || 0;

            var tokensDisp = document.getElementById('tokensDisponibles');
            if (tokensDisp) tokensDisp.textContent = data.tokens || 0;

            // Guardar tokens en sessionUser para uso posterior
            sessionUser.tokens = data.tokens || 0;
        }

        return data;
    } catch (e) {
        console.error('Error cargando usuario:', e);
        return null;
    }
}

// ================================================================
// CARGAR PRECIOS DE MERCADO
// ================================================================
async function cargarPreciosMercado() {
    try {
        var result = await supabaseClient
            .from('muro_precios')
            .select('*')
            .order('ultima_actualizacion', { ascending: false })
            .limit(1);
        if (result.error) throw result.error;

        var data = result.data;
        if (data && data.length > 0) {
            var precios = data[0];
            precioActual = precios.precio_actual || 4.50;

            var precioEl = document.getElementById('precioToken');
            if (precioEl) precioEl.innerHTML = precioActual.toFixed(2) + ' <span class="moneda">MXN</span>';

            var ofertaEl = document.getElementById('ofertaTotal');
            if (ofertaEl) ofertaEl.textContent = precios.oferta_total || 0;

            var demandaEl = document.getElementById('demandaTotal');
            if (demandaEl) demandaEl.textContent = precios.demanda_total || 0;

            var tv = document.getElementById('tendenciaValor');
            if (tv) {
                var diff = precioActual - (precios.precio_base || precioActual);
                if (diff > 0) { tv.textContent = 'ALZA'; tv.style.color = 'var(--success)'; }
                else if (diff < 0) { tv.textContent = 'BAJA'; tv.style.color = 'var(--danger)'; }
                else { tv.textContent = 'ESTABLE'; tv.style.color = 'var(--text-muted)'; }
            }

            return precios;
        }
    } catch (e) {
        console.error('Error cargando precios:', e);
    }
    return null;
}

// ================================================================
// DELEGACIÓN DE EVENTOS (FIX CRÍTICO)
// ================================================================
// Todos los botones se manejan con UN SOLO listener en document.body.
// Esto funciona aunque los elementos se creen dinámicamente.
// ================================================================
function iniciarDelegacionEventos() {
    // ---- CLICK ----
    document.body.addEventListener('click', function(e) {
        var target = e.target;

        // ===== BOTÓN PUBLICAR =====
        if (target.closest('#btnPublicar')) {
            e.preventDefault();
            console.log('🖱️ Click en Publicar');
            window.publicar();
            return;
        }

        // ===== BOTÓN PUBLICAR VENTA =====
        if (target.closest('#btnPublicarVenta')) {
            e.preventDefault();
            console.log('🖱️ Click en Publicar venta');
            window.publicarVenta();
            return;
        }

        // ===== BOTÓN ENVIAR COMENTARIO (con data-post-id) =====
        var btnComentario = target.closest('.btn-enviar-comentario');
        if (btnComentario) {
            e.preventDefault();
            var postId = btnComentario.dataset.postId;
            console.log('🖱️ Click en Enviar comentario del post:', postId);
            window.enviarComentario(postId);
            return;
        }

        // ===== BOTÓN ENVIAR COMENTARIO (legacy) =====
        if (target.closest('.post-comentarios .input-comentario button')) {
            e.preventDefault();
            var inputContainer = target.closest('.input-comentario');
            if (inputContainer) {
                var inputEl = inputContainer.querySelector('input');
                if (inputEl && inputEl.id) {
                    var pid = inputEl.id.replace('input-comentario-', '');
                    console.log('🖱️ Click en Enviar comentario (legacy) del post:', pid);
                    window.enviarComentario(pid);
                }
            }
            return;
        }

        // ===== BOTÓN CONFIRMAR COMPRA =====
        if (target.closest('#btnConfirmarCompra')) {
            e.preventDefault();
            console.log('🖱️ Click en Confirmar compra');
            window.confirmarCompraCrypto();
            return;
        }

        // ===== BOTÓN VERIFICAR PAGO =====
        if (target.closest('#btnVerificarPago')) {
            e.preventDefault();
            console.log('🖱️ Click en Verificar pago');
            window.verificarPagoCrypto();
            return;
        }

        // ===== BOTÓN VENDER TOKENS (valor mercado) =====
        if (target.closest('.btn-vender-token')) {
            e.preventDefault();
            console.log('🖱️ Click en Vender tokens');
            window.abrirModalVenta();
            return;
        }

        // ===== CERRAR MODALES =====
        if (target.closest('.btn-cerrar')) {
            var modal = target.closest('.modal-overlay');
            if (modal) modal.classList.remove('show');
            return;
        }

        // ===== CERRAR MODAL AL HACER CLICK FUERA =====
        if (target.classList && target.classList.contains('modal-overlay')) {
            target.classList.remove('show');
            return;
        }

        // ===== CERRAR EMOJI PICKER AL HACER CLICK FUERA =====
        var picker = document.getElementById('emojiPicker');
        var btnEmoji = document.getElementById('btnEmoji');
        if (picker && btnEmoji && !picker.contains(target) && !btnEmoji.contains(target)) {
            picker.classList.remove('show');
        }

        // ===== CERRAR TEMA DROPDOWN AL HACER CLICK FUERA =====
        var dd = document.getElementById('temaDropdown');
        var btnTema = document.getElementById('btnTemaSelector');
        if (dd && btnTema && !dd.contains(target) && !btnTema.contains(target)) {
            dd.classList.remove('show');
        }
    });

    // ---- ENTER EN INPUT DE COMENTARIO ----
    document.body.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            var input = e.target;
            if (input && input.id && input.id.indexOf('input-comentario-') === 0) {
                e.preventDefault();
                var postId = input.id.replace('input-comentario-', '');
                window.enviarComentario(postId);
            }
        }
    });

    // ---- INPUTS QUE ACTUALIZAN RESUMEN ----
    document.body.addEventListener('input', function(e) {
        var target = e.target;
        if (target.id === 'inputCantidadTokens' || target.id === 'inputPrecioToken') {
            actualizarResumenVenta();
        }
        if (target.id === 'inputCantidadCompra') {
            actualizarResumenCompra();
        }
    });
}

// ================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================
async function iniciarMuro() {
    console.log('◈ Muro inicializando...');

    // Esperar a que Supabase esté listo
    if (!supabaseClient) {
        console.warn('[Muro] Supabase no está listo. Reintentando...');
        setTimeout(iniciarMuro, 500);
        return;
    }

    try {
        // 1. Cargar datos iniciales EN ORDEN
        await cargarUsuarioActual();
        await cargarTemasDisponibles();
        await cargarTemasUsuario();
        await cargarPreciosMercado();
        await cargarTendencias();
        await cargarTokensDestacados();
        await cargarPublicaciones(true);
        await suscribirseARealtime();

        // 2. Refrescos periódicos
        setInterval(cargarTendencias, 5 * 60 * 1000);       // cada 5 min
        setInterval(cargarTokensDestacados, 5 * 60 * 1000); // cada 5 min

        // 3. Idiomas
        setTimeout(async function() {
            try {
                if (typeof window.inicializarIdiomas === 'function') {
                    await window.inicializarIdiomas();
                }
            } catch (e) {}
        }, 500);

        // 4. Delegación de eventos
        iniciarDelegacionEventos();

        console.log('◈ Muro inicializado con delegación de eventos ✅');
    } catch (e) {
        console.error('[Muro] Error en init:', e);
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL A WINDOW
// ================================================================
// Utils
window.showToast = showToast;
window.escapeHTML = escapeHTML;
window.sanitizarHTML = sanitizarHTML;
window.verTokens = verTokens;

// Config
window.mostrarErrorEnPantalla = mostrarErrorEnPantalla;

// Datos
window.cargarUsuarioActual = cargarUsuarioActual;
window.cargarPreciosMercado = cargarPreciosMercado;

// Temas
window.cargarTemasDisponibles = cargarTemasDisponibles;
window.cargarTemasUsuario = cargarTemasUsuario;
window.toggleFiltroTemas = toggleFiltroTemas;
window.toggleTemaDropdown = toggleTemaDropdown;
window.seleccionarTema = seleccionarTema;

// Tendencias
window.cargarTendencias = cargarTendencias;
window.cargarTokensDestacados = cargarTokensDestacados;
window.irAPost = irAPost;
window.buscarPorTema = buscarPorTema;

// Publicaciones
window.cargarPublicaciones = cargarPublicaciones;
window.renderizarPost = renderizarPost;
window.verificarLike = verificarLike;

// Publicar
window.publicar = publicar;
window.insertarHashtag = insertarHashtag;
window.toggleEmojiPicker = toggleEmojiPicker;
window.abrirSelectorImagen = abrirSelectorImagen;
window.subirImagenMuro = subirImagenMuro;

// Likes y comentarios
window.toggleLike = toggleLike;
window.toggleComentarios = toggleComentarios;
window.cargarComentarios = cargarComentarios;
window.enviarComentario = enviarComentario;
window.eliminarComentario = eliminarComentario;
window.eliminarPublicacion = eliminarPublicacion;
window.compartirPublicacion = compartirPublicacion;
window.reportarPublicacion = reportarPublicacion;

// Búsqueda
window.buscarHashtag = buscarHashtag;
window.buscarPorTemaSlug = buscarPorTemaSlug;

// Ventas
window.abrirModalVenta = abrirModalVenta;
window.cerrarModalVenta = cerrarModalVenta;
window.publicarVenta = publicarVenta;
window.abrirModalCompra = abrirModalCompra;
window.cerrarModalConfirmacion = cerrarModalConfirmacion;
window.confirmarCompraCrypto = confirmarCompraCrypto;
window.seleccionarTodosTokens = seleccionarTodosTokens;
window.actualizarResumenVenta = actualizarResumenVenta;
window.actualizarResumenCompra = actualizarResumenCompra;

// Pagos
window.mostrarModalPagoReal = mostrarModalPagoReal;
window.iniciarPollingMuro = iniciarPollingMuro;
window.verificarPagoCrypto = verificarPagoCrypto;
window.cerrarModalPago = cerrarModalPago;
window.copiarDireccionCrypto = copiarDireccionCrypto;

// Realtime
window.suscribirseARealtime = suscribirseARealtime;

// ================================================================
// ARRANQUE
// ================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarMuro);
} else {
    iniciarMuro();
}