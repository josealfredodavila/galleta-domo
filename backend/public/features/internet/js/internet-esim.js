// ================================================================
// INTERNET · ESIM
// ================================================================
// Obtener eSIM, renderizar estado/QR/consumo, sincronizar,
// cambiar celular y copiar código LPA.
// Depende de: internet-config.js, internet-utils.js
// ================================================================

// ================================================================
// OBTENER ESIM DEL BACKEND
// ================================================================
async function obtenerEsim() {
    try {
        var r = await api('/api/telnyx/esim/mia');
        if (r.resp.ok && r.data.success && r.data.data) {
            esimActual = r.data.data;
            return esimActual;
        }
    } catch (_) {
        // sin sesión o sin red
    }
    return null;
}

// ================================================================
// ABRIR VISTA "MI ESIM"
// ================================================================
async function abrirMiEsim() {
    var e = await obtenerEsim();
    if (e && e.tiene_esim) {
        renderEsim(e);
        mostrarVista('esim');
    } else {
        showToast('◈ Aún no tienes una eSIM', 'warning');
    }
}

// ================================================================
// RENDERIZAR eSIM (estado, consumo, QR, código LPA)
// ================================================================
function renderEsim(esim) {
    esimActual = esim;

    // ---- BADGE DE ESTADO ----
    var badge = document.getElementById('esimEstadoBadge');
    var estado = esim.estado || 'pendiente';

    if (badge) {
        var map = {
            'activa': { txt: '◈ ACTIVA', cls: 'activa' },
            'sin_saldo': { txt: '◈ SIN SALDO', cls: 'sin_saldo' },
            'pendiente': { txt: '◈ PENDIENTE', cls: 'pendiente' },
            'aprovisionando': { txt: '◈ PREPARANDO', cls: 'aprovisionando' },
            'reemplazando': { txt: '◈ CAMBIANDO', cls: 'aprovisionando' }
        };
        var info = map[estado] || { txt: '◈ ' + String(estado).toUpperCase(), cls: 'pendiente' };
        badge.textContent = info.txt;
        badge.className = 'esim-badge ' + info.cls;
    }

    // ---- DATOS / CONSUMO ----
    var totalMb = Number(esim.datos_total_mb) || 0;
    var usadosMb = Number(esim.datos_usados_mb) || 0;
    var restanteMb = Math.max(totalMb - usadosMb, 0);
    var pct = totalMb > 0 ? Math.min((usadosMb / totalMb) * 100, 100) : 0;

    setTexto('esimUsados', fmtMb(usadosMb));
    setTexto('esimTotal', fmtMb(totalMb));
    setTexto('esimRestanteText', fmtMb(restanteMb) + ' restantes');
    setTexto('esimPctText', pct.toFixed(1) + '% usado');
    setTexto('esimIccid', esim.iccid || '—');
    setTexto('esimUltimoSync', esim.ultimo_sync_at
        ? new Date(esim.ultimo_sync_at).toLocaleString('es-MX')
        : '—');

    // ---- BARRA DE PROGRESO ----
    var fill = document.getElementById('esimProgressFill');
    if (fill) {
        fill.style.width = pct + '%';
        fill.classList.remove('warn', 'danger');
        if (pct > 80) fill.classList.add('danger');
        else if (pct > 50) fill.classList.add('warn');
    }

    // ---- AVISO DE SALDO ----
    var aviso = document.getElementById('esimAviso');
    if (aviso) {
        aviso.className = 'esim-aviso';
        if (estado === 'sin_saldo') {
            aviso.textContent = 'Se acabaron tus datos. Recarga gigas y tu eSIM se reactiva automáticamente.';
            aviso.classList.add('show', 'sin_saldo');
        } else if (estado === 'activa' && pct >= 80) {
            aviso.textContent = 'Te queda poco saldo. Puedes recargar cuando quieras; los gigas se suman a tu eSIM.';
            aviso.classList.add('show', 'poco');
        }
    }

    // ---- QR + CÓDIGO DE ACTIVACIÓN ----
    var code = esim.activation_code || null;
    var qrCanvas = document.getElementById('qrCanvas');
    var lpaBox = document.getElementById('esimLpaBox');
    var btnIos = document.getElementById('btnInstalarIos');

    if (code && qrCanvas && typeof QRCode !== 'undefined') {
        QRCode.toCanvas(qrCanvas, code, {
            width: 220,
            margin: 1,
            color: { dark: '#05080f', light: '#ffffff' }
        }, function(err) {
            if (err) console.error('Error generando QR:', err);
        });
    } else if (qrCanvas) {
        qrCanvas.width = 220;
        qrCanvas.height = 220;
        var ctx = qrCanvas.getContext('2d');
        ctx.fillStyle = '#05080f';
        ctx.fillRect(0, 0, 220, 220);
        ctx.fillStyle = '#D4AF37';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(code ? 'Usa el código de abajo' : 'QR no disponible', 110, 110);
    }

    if (code) {
        var partes = String(code).split('$'); // LPA:1$<SM-DP+>$<código>
        setTexto('esimLpaValue', code);
        setTexto('esimSmdp', partes[1] || '—');
        setTexto('esimMatching', partes[2] || '—');
        if (lpaBox) lpaBox.style.display = 'block';

        if (btnIos) {
            var esIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            btnIos.style.display = esIos ? 'inline-flex' : 'none';
            btnIos.href = 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=' + encodeURI(code);
        }
    } else {
        if (lpaBox) lpaBox.style.display = 'none';
        if (btnIos) btnIos.style.display = 'none';
    }

    // ---- BOTÓN "CAMBIAR DE CELULAR" ----
    var btnCambiar = document.getElementById('btnCambiarCelular');
    if (btnCambiar) {
        var bloqueado = !esim.puede_reemplazar || estado === 'reemplazando' || estado === 'aprovisionando';
        btnCambiar.disabled = bloqueado;
        var desde = esim.reemplazo_disponible_desde ? new Date(esim.reemplazo_disponible_desde) : null;
        btnCambiar.title = bloqueado && desde
            ? 'Disponible desde ' + desde.toLocaleDateString('es-MX')
            : 'Pasar tu eSIM a otro celular';
    }
}

// ================================================================
// SINCRONIZAR CONSUMO DE DATOS
// ================================================================
async function sincronizarEsim() {
    var btn = document.getElementById('btnSync');
    if (btn) btn.disabled = true;

    try {
        var r = await api('/api/telnyx/esim/sync', { method: 'POST' });
        if (!r.resp.ok || !r.data.success) {
            showToast('✕ ' + (r.data.error || 'No se pudo actualizar'), 'error');
            return;
        }
        renderEsim(r.data.data);
        showToast('◈ Datos actualizados', 'success');
    } catch (error) {
        showToast('✕ ' + error.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ================================================================
// CAMBIAR DE CELULAR (genera nueva eSIM con saldo restante)
// ================================================================
async function cambiarCelular() {
    if (!confirm('¿Cambiar tu eSIM a otro celular?\n\nSe genera una eSIM nueva con los gigas que te quedan y la anterior deja de funcionar. Solo puedes hacerlo una vez cada 30 días.')) return;

    var btn = document.getElementById('btnCambiarCelular');
    if (btn) btn.disabled = true;
    showToast('◈ Generando tu nueva eSIM...', '', 8000);

    try {
        var r = await api('/api/telnyx/esim/reemplazar', { method: 'POST' });

        if (!r.resp.ok || !r.data.success) {
            var prefijo = r.resp.status === 429 ? '◈ ' : '✕ ';
            var tipo = r.resp.status === 429 ? 'warning' : 'error';
            showToast(prefijo + (r.data.error || 'No se pudo cambiar la eSIM'), tipo, 6000);
            if (esimActual) renderEsim(esimActual);
            return;
        }

        renderEsim(r.data.data);
        showToast('◈ Listo. Instala la nueva eSIM con el código de abajo.', 'success', 6000);
    } catch (error) {
        showToast('✕ ' + error.message, 'error');
        if (esimActual) renderEsim(esimActual);
    }
}

// ================================================================
// COPIAR CÓDIGO LPA
// ================================================================
async function copiarLPA() {
    var lpaEl = document.getElementById('esimLpaValue');
    var lpa = lpaEl ? lpaEl.textContent : null;

    if (!lpa || lpa === '—') {
        showToast('◈ No hay código para copiar', 'warning');
        return;
    }

    try {
        await navigator.clipboard.writeText(lpa);
        showToast('◈ Código copiado', 'success');
    } catch (_) {
        showToast('✕ No se pudo copiar. Mantén presionado el código para copiarlo.', 'error', 5000);
    }
}