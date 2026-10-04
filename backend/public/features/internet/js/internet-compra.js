// ================================================================
// INTERNET · COMPRA
// ================================================================
// Flujo de compra, polling de estado, vistas (compra/esperando),
// reanudar orden pendiente.
// Depende de: internet-config.js, internet-utils.js, internet-planes.js, internet-esim.js
// ================================================================

// ================================================================
// VISTAS
// ================================================================
function mostrarVista(nombre) {
    document.querySelectorAll('.vista').forEach(function(v) {
        v.classList.remove('active');
    });
    var el = document.getElementById('vista-' + nombre);
    if (el) el.classList.add('active');
    if (nombre !== 'esperando') detenerPolling();
}

function actualizarBannerEsim() {
    var b = document.getElementById('bannerMiEsim');
    if (b) b.classList.toggle('show', Boolean(esimActual && esimActual.tiene_esim));
}

// Volver a los paquetes (compra o recarga).
function volverACompra() {
    detenerPolling();
    esperandoEsim = false;
    ordenActual = null;
    limpiarPendiente();
    mostrarVista('compra');
    actualizarBannerEsim();
}

// ================================================================
// POLLING DEL ESTADO DE LA ORDEN
// ================================================================
function setEstadoEsperando(txt) {
    setTexto('espEstadoTexto', txt);
}

function iniciarPolling() {
    detenerPolling();
    pollingIntentos = 0;
    pollingInterval = setInterval(async function() {
        pollingIntentos++;
        if (pollingIntentos > POLLING_MAX_INTENTOS) {
            detenerPolling();
            setEstadoEsperando('Sigue sin confirmarse. Si ya pagaste, tu eSIM se activará sola; puedes volver más tarde.');
            return;
        }
        await verificarEstadoOrden(false);
    }, POLLING_INTERVAL_MS);
}

function detenerPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

async function verificarPagoManual() {
    var btn = document.getElementById('btnVerificar');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '◈ Verificando...';
    }
    await verificarEstadoOrden(true);
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '◈ Ya pagué, verificar ahora';
    }
}

async function verificarEstadoOrden(manual) {
    if (manual === undefined) manual = false;
    if (!ordenActual || !ordenActual.id) return;

    try {
        var r = await api('/api/payments/internet/status/' + encodeURIComponent(ordenActual.id));
        var resp = r.resp;
        var data = r.data;

        if (!resp.ok || !data.success) {
            if (manual) showToast('◈ ' + (data.error || 'No se pudo verificar'), 'warning');
            return;
        }

        var estado = data.data ? data.data.estado : null;
        var activada = data.activated === true ||
            ['activa', 'activada', 'completado'].indexOf(estado) !== -1;

        if (activada) {
            detenerPolling();
            await esperarEsimLista();
            return;
        }

        if (estado === 'cancelada' || data.failed === true) {
            detenerPolling();
            limpiarPendiente();
            showToast('✕ El pago fue cancelado o falló', 'error', 6000);
            setTimeout(volverACompra, 2500);
            return;
        }

        if (manual) showToast('◈ Aún no se confirma el pago', 'warning', 4000);
    } catch (error) {
        console.error('Error verificando orden:', error);
        if (manual) showToast('✕ ' + error.message, 'error');
    }
}

// ================================================================
// ESPERAR A QUE LA eSIM SE ACREDITE
// (la eSIM se crea / se acreditan los gigas en el backend tras confirmar el pago)
// ================================================================
async function esperarEsimLista() {
    if (esperandoEsim) return;
    esperandoEsim = true;
    setEstadoEsperando('◈ Pago confirmado. Preparando tu eSIM…');

    try {
        for (var i = 0; i < 24 && esperandoEsim; i++) { // ~2 minutos
            var e = await obtenerEsim();
            if (e && e.tiene_esim && e.activation_code && Number(e.datos_total_mb) > totalAntesMb) {
                limpiarPendiente();
                renderEsim(e);
                mostrarVista('esim');
                showToast('◈ ¡Listo! Tus gigas ya están en tu eSIM', 'success', 5000);
                return;
            }
            await dormir(5000);
        }
        if (esperandoEsim) {
            setEstadoEsperando('Tu pago está confirmado. Tu eSIM se está preparando y puede tardar unos minutos. Vuelve a esta página más tarde: aparecerá sola.');
        }
    } finally {
        esperandoEsim = false;
    }
}

// ================================================================
// MOSTRAR VISTA ESPERANDO CON DATOS DE LA ORDEN
// ================================================================
function mostrarVistaEsperando() {
    if (!ordenActual) return;

    setTexto('espPlan', ordenActual.plan_nombre || '—');
    setTexto('espDatos', (ordenActual.datos_gb || 0) + ' GB · ' + (ordenActual.duracion_dias || 0) + ' días');
    setTexto('espMonto', '$' + Number(ordenActual.monto_mxn || 0).toFixed(2) + ' MXN');
    setTexto('espOrden', ordenActual.id);
    setEstadoEsperando('Esperando tu pago…');

    // Mostrar botón de "Abrir página de pago" si hay URL válida
    var link = document.getElementById('btnAbrirPago');
    if (link) {
        var url = String(ordenActual.payment_url || '');
        if (/^https:\/\//i.test(url)) {
            link.href = url;
            link.style.display = 'inline-flex';
        } else {
            link.style.display = 'none';
        }
    }

    // Resetear botón de verificar
    var btn = document.getElementById('btnVerificar');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '◈ Ya pagué, verificar ahora';
    }

    mostrarVista('esperando');
}

// ================================================================
// REANUDAR ORDEN PENDIENTE (si el usuario recargó la página)
// ================================================================
async function reanudarPendiente() {
    var p = leerPendiente();
    if (!p || !p.id) return false;
    if (Date.now() - (p.ts || 0) > PENDIENTE_MAX_MS) {
        limpiarPendiente();
        return false;
    }

    // Si la eSIM ya tiene más gigas que antes → ya se acreditó
    var e = esimActual;
    if (e && e.tiene_esim && Number(e.datos_total_mb) > Number(p.totalAntesMb || 0)) {
        limpiarPendiente();
        return false;
    }

    ordenActual = p;
    totalAntesMb = Number(p.totalAntesMb || 0);
    mostrarVistaEsperando();
    await verificarEstadoOrden(false);

    // Si después de verificar sigue en vista esperando, iniciar polling
    var vistaEsperando = document.getElementById('vista-esperando');
    if (vistaEsperando && vistaEsperando.classList.contains('active') && !esperandoEsim) {
        iniciarPolling();
    }
    return true;
}

// ================================================================
// COMPRAR INTERNET (flujo completo)
// ================================================================
async function comprarInternet() {
    var phone = document.getElementById('netPhone').value.trim();
    var status = document.getElementById('netStatus');
    var terms = document.getElementById('checkNetTerms').checked;
    var btn = document.getElementById('btnPagar');

    if (!selectedPack) { status.innerText = '◈ Selecciona un paquete'; return; }
    if (phone.length < 5) { status.innerText = '◈ Escribe tu número de celular'; return; }
    if (!terms) { status.innerText = '◈ Acepta términos'; return; }

    var payCurrency = document.getElementById('pay-currency').value;
    if (!payCurrency) { status.innerText = '◈ Selecciona una red de pago'; return; }

    status.innerText = '◈ Autenticando...';
    btn.disabled = true;

    try {
        var session = await getSessionInternet();
        if (!session) {
            status.innerText = '◈ Inicia sesión para comprar';
            showToast('◈ Inicia sesión primero', 'error');
            return;
        }

        // Saldo actual, para saber cuándo se acreditan los gigas nuevos
        await obtenerEsim();
        totalAntesMb = Number(esimActual && esimActual.datos_total_mb) || 0;

        // Crear orden en Supabase vía RPC
        status.innerText = '◈ Creando orden segura...';
        var rpcResult = await supabaseClient.rpc('crear_orden_internet', {
            p_plan_id: selectedPack.id,
            p_telefono: phone
        });
        if (rpcResult.error) throw rpcResult.error;
        var orden = rpcResult.data;

        // Crear pago en el backend
        status.innerText = '◈ Generando pago...';
        var resp = await fetch(BACKEND_URL + '/api/payments/internet/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + session.access_token
            },
            body: JSON.stringify({
                ordenId: orden.id,
                payCurrency: payCurrency
            })
        });
        var pagoData = await resp.json();

        if (!resp.ok || !pagoData.success || !pagoData.data || !pagoData.data.payment_url) {
            status.innerText = '✕ ' + (pagoData.error || 'Error generando el pago');
            showToast('✕ ' + (pagoData.error || 'Error generando pago'), 'error');
            return;
        }

        ordenActual = {
            id: orden.id,
            plan_nombre: orden.plan_nombre || selectedPack.nombre,
            datos_gb: orden.datos_gb || selectedPack.datos_gb,
            duracion_dias: orden.duracion_dias || selectedPack.duracion_dias,
            monto_mxn: orden.monto_mxn || selectedPack.precio_mxn,
            payCurrency: payCurrency,
            payment_url: pagoData.data.payment_url
        };
        guardarPendiente();
        status.innerText = '';

        mostrarVistaEsperando();
        iniciarPolling();

        // Abrir pasarela en pestaña nueva
        var ventana = window.open(ordenActual.payment_url, '_blank', 'noopener');
        if (!ventana) {
            showToast('◈ Toca "Abrir página de pago" para continuar', 'warning', 6000);
        }

    } catch (error) {
        console.error('Error en compra:', error);
        status.innerText = '✕ ' + (error.message || 'Error en la compra');
        showToast('✕ ' + (error.message || 'Error en la compra'), 'error');
    } finally {
        btn.disabled = false;
    }
}