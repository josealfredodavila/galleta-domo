// ================================================================
// MURO · PAGOS (Crypto Modal + Polling)
// ================================================================
// Modal de pago crypto, contador de tiempo, polling de estado,
// verificación manual de pago.
// Depende de: muro-config.js, muro-utils.js, muro-ventas.js
// ================================================================

// ================================================================
// MOSTRAR MODAL DE PAGO
// ================================================================
function mostrarModalPagoReal(pagoData) {
    var modal = document.getElementById('cryptoPaymentModal');
    if (!modal) return;

    modal.dataset.ventaId = pagoData.venta_id;
    modal.dataset.paymentId = pagoData.payment_id;

    var addressEl = document.getElementById('cryptoAddress');
    var montoEl = document.getElementById('cryptoMonto');
    var monedaEl = document.getElementById('cryptoMoneda');
    var qrImg = document.getElementById('cryptoQR');
    var statusEl = document.getElementById('cryptoStatus');

    if (addressEl) addressEl.textContent = pagoData.pay_address || 'Ver en NOWPayments';
    if (montoEl) montoEl.textContent = parseFloat(pagoData.pay_amount || 0).toFixed(8);
    if (monedaEl) monedaEl.textContent = (pagoData.pay_currency || 'USDT').toUpperCase();

    if (qrImg && pagoData.pay_address) {
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(pagoData.pay_address);
    }

    if (statusEl) {
        statusEl.textContent = 'Esperando pago en ' + (pagoData.pay_currency || '').toUpperCase();
        statusEl.style.color = 'var(--text-muted)';
    }

    iniciarContadorTiempo(pagoActual.expiresAt);

    // Abrir pasarela externa si existe
    if (pagoData.payment_url) {
        try {
            window.open(pagoData.payment_url, '_blank');
        } catch (e) {}
    }

    modal.classList.add('show');
    iniciarPollingMuro(pagoData.venta_id);
}

// ================================================================
// CONTADOR DE TIEMPO RESTANTE
// ================================================================
function iniciarContadorTiempo(expiresAt) {
    if (pagoActual.contadorInterval) clearInterval(pagoActual.contadorInterval);

    var contadorEl = document.getElementById('contadorPago');
    var tiempoEl = document.getElementById('tiempoRestante');

    function tick() {
        var restante = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

        if (restante <= 0) {
            if (tiempoEl) tiempoEl.textContent = '00:00';
            if (contadorEl) contadorEl.classList.add('urgente');
            clearInterval(pagoActual.contadorInterval);
            var statusEl = document.getElementById('cryptoStatus');
            if (statusEl) {
                statusEl.textContent = 'Orden expirada';
                statusEl.style.color = 'var(--danger)';
            }
            return;
        }

        if (tiempoEl) tiempoEl.textContent = formatearTiempoRestante(restante);

        if (restante < 300) {
            if (contadorEl) contadorEl.classList.add('urgente');
        } else {
            if (contadorEl) contadorEl.classList.remove('urgente');
        }
    }

    tick();
    pagoActual.contadorInterval = setInterval(tick, 1000);
}

// ================================================================
// POLLING DE ESTADO (cada 10s)
// ================================================================
function iniciarPollingMuro(ventaId) {
    if (pagoActual.pollingInterval) clearInterval(pagoActual.pollingInterval);

    var intentos = 0;
    var statusEl = document.getElementById('cryptoStatus');

    pagoActual.pollingInterval = setInterval(async function() {
        intentos++;

        // Máximo 30 min (180 intentos de 10s)
        if (intentos >= 180) {
            clearInterval(pagoActual.pollingInterval);
            return;
        }

        // Si ya expiró + 1 min de gracia
        if (pagoActual.expiresAt && Date.now() > pagoActual.expiresAt.getTime() + 60000) {
            clearInterval(pagoActual.pollingInterval);
            return;
        }

        try {
            var sessionResult = await supabaseClient.auth.getSession();
            if (!sessionResult.data.session) return;

            var accessToken = sessionResult.data.session.access_token;
            var resp = await fetch(BACKEND_URL + '/api/payments/muro/status/' + ventaId, {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            var statusData = await resp.json();
            if (!statusData.success) return;

            var estado = statusData.data.estado;

            if (estado === 'pagado' || estado === 'completado') {
                clearInterval(pagoActual.pollingInterval);
                if (pagoActual.contadorInterval) clearInterval(pagoActual.contadorInterval);

                if (statusEl) {
                    statusEl.textContent = 'Pago confirmado';
                    statusEl.style.color = 'var(--success)';
                }
                showToast('Tokens acreditados', 'success');

                setTimeout(function() {
                    cerrarModalPago();
                    cargarPublicaciones();
                    cargarPreciosMercado();
                    cargarUsuarioActual();
                    cargarTokensDestacados();
                }, 2500);
                return;
            }

            if (estado === 'cancelado' || estado === 'expirado' || estado === 'expirada') {
                clearInterval(pagoActual.pollingInterval);
                if (pagoActual.contadorInterval) clearInterval(pagoActual.contadorInterval);

                if (statusEl) {
                    statusEl.textContent = 'Pago cancelado o expirado';
                    statusEl.style.color = 'var(--danger)';
                }
                return;
            }
        } catch (e) {
            // Silencioso, se reintenta en el próximo ciclo
        }
    }, 10000);
}

// ================================================================
// VERIFICAR PAGO MANUALMENTE
// ================================================================
async function verificarPagoCrypto() {
    var modal = document.getElementById('cryptoPaymentModal');
    var ventaId = modal.dataset.ventaId;
    var btn = document.getElementById('btnVerificarPago');

    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Verificando...';

    try {
        var sessionResult = await supabaseClient.auth.getSession();
        var accessToken = sessionResult.data.session.access_token;

        var resp = await fetch(BACKEND_URL + '/api/payments/muro/status/' + ventaId, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        var statusData = await resp.json();
        if (!statusData.success) {
            showToast('Error', 'error');
            return;
        }

        var estado = statusData.data.estado;
        var statusEl = document.getElementById('cryptoStatus');

        if (estado === 'pagado' || estado === 'completado') {
            if (statusEl) {
                statusEl.textContent = 'Pago confirmado';
                statusEl.style.color = 'var(--success)';
            }
            showToast('Tokens acreditados', 'success');

            if (pagoActual.contadorInterval) clearInterval(pagoActual.contadorInterval);
            if (pagoActual.pollingInterval) clearInterval(pagoActual.pollingInterval);

            setTimeout(function() {
                cerrarModalPago();
                cargarPublicaciones();
                cargarPreciosMercado();
                cargarUsuarioActual();
                cargarTokensDestacados();
            }, 2000);
        } else {
            if (statusEl) statusEl.textContent = 'Estado: ' + estado;
            showToast('Aún sin confirmar', 'warning');
        }
    } catch (e) {
        console.error('Error verificando pago:', e);
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Verificar pago';
    }
}

// ================================================================
// CERRAR MODAL DE PAGO
// ================================================================
function cerrarModalPago() {
    var modal = document.getElementById('cryptoPaymentModal');
    if (modal) modal.classList.remove('show');
    if (pagoActual.contadorInterval) clearInterval(pagoActual.contadorInterval);
}

// ================================================================
// COPIAR DIRECCIÓN CRYPTO
// ================================================================
function copiarDireccionCrypto() {
    var addressEl = document.getElementById('cryptoAddress');
    if (!addressEl) return;
    var address = addressEl.textContent;
    if (!address || address === 'Cargando...') return;

    navigator.clipboard.writeText(address)
        .then(function() { showToast('Copiada', 'success'); })
        .catch(function() { showToast('Copiada', 'success'); });
}

// ================================================================
// VISIBILIDAD: REANUDAR POLLING AL VOLVER A LA PESTAÑA
// ================================================================
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        if (pagoActual.ventaId && !pagoActual.pollingInterval) {
            var modal = document.getElementById('cryptoPaymentModal');
            if (modal && modal.classList.contains('show')) {
                iniciarPollingMuro(pagoActual.ventaId);
                if (pagoActual.expiresAt) iniciarContadorTiempo(pagoActual.expiresAt);
            }
        }
    }
});