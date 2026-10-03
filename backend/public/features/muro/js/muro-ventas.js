// ================================================================
// MURO · VENTAS Y COMPRAS
// ================================================================
// Vender tokens (publicar venta), comprar tokens, modal de
// confirmación de compra.
// Depende de: muro-config.js, muro-utils.js, muro-publicar.js, muro-pagos.js
// ================================================================

// ================================================================
// MODAL VENTA — abrir
// ================================================================
function abrirModalVenta() {
    var modal = document.getElementById('modalVender');
    if (!modal) return;

    modal.classList.add('show');

    var tokensDisp = document.getElementById('tokensDisponibles');
    if (tokensDisp) {
        tokensDisp.textContent = (sessionUser && sessionUser.tokens) || 0;
    }

    var inputCantidad = document.getElementById('inputCantidadTokens');
    var inputPrecio = document.getElementById('inputPrecioToken');
    if (inputCantidad) inputCantidad.value = 1;
    if (inputPrecio) inputPrecio.value = precioActual.toFixed(2);

    actualizarResumenVenta();
}

// ================================================================
// MODAL VENTA — cerrar
// ================================================================
function cerrarModalVenta() {
    var modal = document.getElementById('modalVender');
    if (modal) modal.classList.remove('show');
}

// ================================================================
// ACTUALIZAR RESUMEN DE VENTA
// ================================================================
function actualizarResumenVenta() {
    var cantidadEl = document.getElementById('inputCantidadTokens');
    var precioEl = document.getElementById('inputPrecioToken');
    if (!cantidadEl || !precioEl) return;

    var cantidad = parseInt(cantidadEl.value) || 0;
    var precio = parseFloat(precioEl.value) || 0;

    var total = cantidad * precio;
    var comision = total * COMISION_PORCENTAJE;
    var vendedorRecibe = total - comision;

    var totalEl = document.getElementById('ventaTotalVendedor');
    var comisionEl = document.getElementById('ventaComisionPlataforma');
    if (totalEl) totalEl.textContent = '$' + vendedorRecibe.toFixed(2) + ' MXN';
    if (comisionEl) comisionEl.textContent = '$' + comision.toFixed(2) + ' MXN';
}

// ================================================================
// PUBLICAR VENTA DE TOKENS
// ================================================================
async function publicarVenta() {
    var cantidadEl = document.getElementById('inputCantidadTokens');
    var precioEl = document.getElementById('inputPrecioToken');
    var btn = document.getElementById('btnPublicarVenta');

    var cantidad = parseInt(cantidadEl.value);
    var precio = parseFloat(precioEl.value);

    if (!cantidad || cantidad <= 0 || !Number.isInteger(cantidad)) {
        showToast('Cantidad inválida', 'error');
        return;
    }
    if (cantidad > 100) {
        showToast('Máximo 100 tokens', 'error');
        return;
    }
    if (!precio || precio <= 0) {
        showToast('Precio inválido', 'error');
        return;
    }
    if (!sessionUser) {
        showToast('Inicia sesión', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Publicando...';

    try {
        // Verificar tokens disponibles
        var userResult = await supabaseClient
            .from('usuarios')
            .select('tokens')
            .eq('id', sessionUser.id)
            .single();
        if (userResult.error) throw userResult.error;

        if (userResult.data.tokens < cantidad) {
            showToast('Sin tokens suficientes', 'error');
            btn.disabled = false;
            btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/><polygon points="12 7 16 9.5 16 14.5 12 17 8 14.5 8 9.5 12 7"/></svg> Publicar venta';
            return;
        }

        // Crear publicación de venta
        var result = await supabaseClient
            .from('muro_posts')
            .insert({
                usuario_id: sessionUser.id,
                contenido: 'Venta de ' + cantidad + ' tokens a $' + precio.toFixed(2) + ' c/u',
                cantidad_venta: cantidad,
                precio_venta: precio,
                tema_id: temaSeleccionado || null
            });
        if (result.error) throw result.error;

        showToast('Venta publicada', 'success');
        cerrarModalVenta();

        await cargarPublicaciones(true);
        await cargarTokensDestacados();
    } catch (e) {
        console.error('Error publicando venta:', e);
        showToast('Error: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/><polygon points="12 7 16 9.5 16 14.5 12 17 8 14.5 8 9.5 12 7"/></svg> Publicar venta';
    }
}

// ================================================================
// MODAL COMPRA — abrir
// ================================================================
function abrirModalCompra(postId) {
    var postCard = document.querySelector('[data-post-id="' + postId + '"]');
    if (!postCard) {
        showToast('No encontrada', 'error');
        return;
    }

    var modal = document.getElementById('modalConfirmarCompra');
    var seccionVenta = postCard.querySelector('.post-venta');
    if (!seccionVenta) {
        showToast('Sin tokens', 'error');
        return;
    }

    // Extraer cantidad disponible y precio desde el HTML
    var textoVenta = seccionVenta.querySelector('div').textContent || '';
    var matchDisp = textoVenta.match(/(\d+)\s*tokens disponibles/);
    var matchPrecio = textoVenta.match(/\$([\d.]+)\s*MXN/);

    if (!matchDisp || !matchPrecio) {
        showToast('Error leyendo info', 'error');
        return;
    }

    var disponibles = parseInt(matchDisp[1]);
    var precioUnitario = parseFloat(matchPrecio[1]);

    modal.dataset.postId = postId;
    modal.dataset.disponibles = disponibles;
    modal.dataset.precioUnitario = precioUnitario;

    var inputCantidad = document.getElementById('inputCantidadCompra');
    inputCantidad.value = 1;
    inputCantidad.max = disponibles;

    document.getElementById('confirmDisponibles').textContent = disponibles + ' tokens';

    actualizarResumenCompra();
    modal.classList.add('show');
}

// ================================================================
// SELECCIONAR TODOS LOS TOKENS
// ================================================================
function seleccionarTodosTokens() {
    var modal = document.getElementById('modalConfirmarCompra');
    var disponibles = parseInt(modal.dataset.disponibles) || 1;
    document.getElementById('inputCantidadCompra').value = disponibles;
    actualizarResumenCompra();
}

// ================================================================
// ACTUALIZAR RESUMEN DE COMPRA
// ================================================================
function actualizarResumenCompra() {
    var modal = document.getElementById('modalConfirmarCompra');
    if (!modal) return;

    var precioUnitario = parseFloat(modal.dataset.precioUnitario) || 0;
    var disponibles = parseInt(modal.dataset.disponibles) || 0;
    var inputCantidad = document.getElementById('inputCantidadCompra');
    var cantidad = parseInt(inputCantidad.value) || 0;

    if (cantidad < 1) {
        cantidad = 1;
        inputCantidad.value = 1;
    }
    if (cantidad > disponibles) {
        cantidad = disponibles;
        inputCantidad.value = disponibles;
    }

    var total = cantidad * precioUnitario;
    var comision = total * COMISION_PORCENTAJE;
    var vendedorRecibe = total - comision;

    document.getElementById('confirmPrecioUnitario').textContent = '$' + precioUnitario.toFixed(2) + ' MXN';
    document.getElementById('confirmCantidadLabel').textContent = cantidad + ' token' + (cantidad !== 1 ? 's' : '');
    document.getElementById('confirmTotal').textContent = '$' + total.toFixed(2) + ' MXN';
    document.getElementById('confirmComision').textContent = '$' + comision.toFixed(2) + ' MXN';
    document.getElementById('confirmVendedor').textContent = '$' + vendedorRecibidor.toFixed(2) + ' MXN';
}

// ================================================================
// CERRAR MODAL CONFIRMACIÓN
// ================================================================
function cerrarModalConfirmacion() {
    var modal = document.getElementById('modalConfirmarCompra');
    if (modal) modal.classList.remove('show');
}

// ================================================================
// CONFIRMAR COMPRA (llama al backend + abre modal de pago)
// ================================================================
async function confirmarCompraCrypto() {
    var modal = document.getElementById('modalConfirmarCompra');
    var postId = modal.dataset.postId;
    var disponibles = parseInt(modal.dataset.disponibles);
    var btn = document.getElementById('btnConfirmarCompra');
    var cantidad = parseInt(document.getElementById('inputCantidadCompra').value) || 0;

    if (cantidad < 1 || cantidad > disponibles) {
        showToast('Cantidad inválida', 'error');
        return;
    }

    var payCurrency = document.getElementById('muro-pay-currency').value;

    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Creando pago...';

    try {
        var sessionResult = await supabaseClient.auth.getSession();
        var accessToken = sessionResult.data.session.access_token;

        var resp = await fetch(BACKEND_URL + '/api/payments/muro/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            body: JSON.stringify({
                postId: postId,
                cantidad: cantidad,
                payCurrency: payCurrency
            })
        });
        var pagoData = await resp.json();

        if (!resp.ok || !pagoData.success || !pagoData.data) {
            showToast((pagoData.error || 'Error'), 'error');
            return;
        }

        pagoActual.ventaId = pagoData.data.venta_id;
        pagoActual.paymentId = pagoData.data.payment_id;
        pagoActual.postId = postId;
        pagoActual.expiresAt = pagoData.data.expires_at
            ? new Date(pagoData.data.expires_at)
            : new Date(Date.now() + TIMEOUT_MINUTOS * 60 * 1000);

        cerrarModalConfirmacion();
        mostrarModalPagoReal(pagoData.data);
    } catch (e) {
        console.error('Error confirmar compra:', e);
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Ir a pagar';
    }
}