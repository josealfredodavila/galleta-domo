// ================================================================
// PERFIL · QR (Escanear domos + Historial)
// ================================================================
// Escáner QR con cámara, validación de códigos de domos,
// y lista de escaneos recientes.
// Depende de: perfil-config.js, perfil-utils.js
//
// CAMBIO v2 (traducciones):
// - Todos los textos usan perfilT(clave, respaldo).
// - Las fechas del historial usan el idioma actual.
// ================================================================

// Código de idioma actual para formatear fechas
function qrCodigoIdioma() {
    try {
        if (typeof window.obtenerCodigoIdiomaActual === 'function') {
            return window.obtenerCodigoIdiomaActual();
        }
    } catch (e) {}
    return 'es-MX';
}

// ================================================================
// ABRIR CÁMARA QR
// ================================================================
async function abrirCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    const status = document.getElementById('qrCamaraStatus');
    const canvas = document.getElementById('qrCanvas');
    const ctx = canvas?.getContext('2d');

    if (scannerActive) {
        cerrarCamaraQR();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });

        video.srcObject = stream;
        await video.play();
        container.style.display = 'block';
        scannerActive = true;
        status.textContent = perfilT('perfil_qr_enfoca', '📷 Enfoca el QR...');

        const leerQR = async () => {
            if (!scannerActive || !video.readyState || video.readyState < 2) return;
            try {
                if (!canvas || !ctx) return;
                canvas.width = video.videoWidth || 400;
                canvas.height = video.videoHeight || 300;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                if (typeof jsQR !== 'undefined') {
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: 'dontInvert'
                    });
                    if (code && code.data) {
                        const qrData = code.data;
                        status.textContent = perfilT('perfil_qr_detectado', '✅ QR detectado');
                        const input = document.getElementById('qrInput');
                        if (input) input.value = qrData;
                        cerrarCamaraQR();
                        await procesarQR(qrData);
                        return;
                    }
                }
            } catch (error) {}
        };

        if (qrScannerInterval) clearInterval(qrScannerInterval);
        qrScannerInterval = setInterval(leerQR, 500);

        showToast(perfilT('perfil_qr_apunta', '📷 Apunta la cámara al QR'), 'warning');
    } catch (error) {
        const msg = perfilT('perfil_qr_sin_camara', '❌ No se pudo acceder a la cámara');
        if (status) status.textContent = msg;
        showToast(msg, 'error');
    }
}

// ================================================================
// CERRAR CÁMARA QR
// ================================================================
function cerrarCamaraQR() {
    const container = document.getElementById('qrReaderContainer');
    const video = document.getElementById('qrVideo');
    const status = document.getElementById('qrCamaraStatus');

    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    if (container) container.style.display = 'none';
    scannerActive = false;
    if (status) status.textContent = '';
    if (qrScannerInterval) {
        clearInterval(qrScannerInterval);
        qrScannerInterval = null;
    }
}

// ================================================================
// ESCANEAR QR (manual desde input de texto)
// ================================================================
async function escanearQR() {
    const input = document.getElementById('qrInput');
    const qrCode = input?.value?.trim();
    if (!qrCode) {
        showToast(perfilT('perfil_qr_escribe', '⚠️ Escribe o escanea el código QR'), 'error');
        return;
    }
    await procesarQR(qrCode);
}

// ================================================================
// PROCESAR QR (validación en backend)
// ================================================================
async function procesarQR(codigo) {
    if (qrScanningLock) {
        showToast(perfilT('perfil_qr_procesando_otro', '⏳ Procesando otro QR...'), 'warning');
        return;
    }
    qrScanningLock = true;
    const status = document.getElementById('qrStatus');
    const input = document.getElementById('qrInput');

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }
        if (status) status.textContent = perfilT('perfil_qr_validando', '⏳ Validando QR...');
        showToast(perfilT('perfil_qr_verificando', '⏳ Verificando QR...'), '', 5000);

        const { data, error } = await window.supabaseClient.rpc('reclamar_qr_domo', {
            p_codigo: codigo
        });

        if (error) {
            const m = error.message || '';
            if (m.includes('already used')) {
                showToast(perfilT('perfil_qr_usado', '❌ Este QR ya fue usado'), 'error');
                if (status) status.textContent = perfilT('perfil_qr_status_usado', '❌ QR ya utilizado');
            } else if (m.includes('invalid code')) {
                showToast(perfilT('perfil_qr_invalido', '❌ QR inválido'), 'error');
                if (status) status.textContent = perfilT('perfil_qr_invalido', '❌ QR inválido');
            } else if (m.includes('not a domo')) {
                showToast(perfilT('perfil_qr_no_domo', '❌ Este QR no es para un domo'), 'error');
                if (status) status.textContent = perfilT('perfil_qr_no_domo', '❌ Este QR no es para un domo');
            } else {
                throw error;
            }
            return;
        }

        if (!data || !data.success) {
            const detalle = (data && data.error) || perfilT('perfil_qr_error_reclamar', 'Error al reclamar QR');
            showToast('❌ ' + detalle, 'error');
            return;
        }

        if (status) status.textContent = perfilT('perfil_qr_reclamado', '✅ ¡QR reclamado exitosamente!');
        if (input) input.value = '';
        showToast(perfilT('perfil_qr_exito', '🎉 ¡QR escaneado! +1 Es.stok'), 'success');

        await cargarPerfil(true);
        await cargarHistorialQR();
        mostrarCelebracion();
    } catch (error) {
        if (status) status.textContent = perfilT('perfil_qr_status_error', '❌ Error al procesar QR');
        showToast(perfilT('perfil_qr_error_escanear', '❌ Error al escanear QR: ') + msgError(error), 'error');
    } finally {
        qrScanningLock = false;
    }
}

// ================================================================
// CARGAR HISTORIAL DE QR ESCANEADOS
// ================================================================
async function cargarHistorialQR() {
    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await window.supabaseClient
            .from('qr_historial')
            .select('*')
            .eq('user_id', session.user.id)
            .order('fecha', { ascending: false })
            .limit(10);

        if (error) {
            // Tabla no existe: silencioso
            if (error.code === '42P01') {
                qrHistorial = [];
                actualizarUIHistorialQR([]);
                return;
            }
            throw error;
        }
        qrHistorial = data || [];
        actualizarUIHistorialQR(qrHistorial);
    } catch (error) {
        actualizarUIHistorialQR([]);
    }
}

// ================================================================
// ACTUALIZAR UI DEL HISTORIAL QR
// ================================================================
function actualizarUIHistorialQR(historial = []) {
    const container = document.getElementById('qrHistorialList');
    const contador = document.getElementById('qrHistorialCount');
    if (contador) {
        contador.textContent = historial.length + ' ' + perfilT('perfil_escaneos', 'escaneos');
    }
    if (!container) return;

    if (!historial || historial.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:10px;"><span class="icon" style="font-size:1.5rem;">◈</span><p style="font-size:0.7rem;">'
            + escaparHTML(perfilT('perfil_sin_escaneos', 'Sin escaneos recientes'))
            + '</p></div>';
        aplicarI18NPerfil(container);
        return;
    }

    const etiquetaQR = escaparHTML(perfilT('perfil_qr_etiqueta', 'QR:'));

    container.innerHTML = historial.map(item => {
        const fecha = new Date(item.fecha).toLocaleString(qrCodigoIdioma());
        const qrId = item.qr_id ? escaparHTML(String(item.qr_id).slice(0, 15)) : 'N/A';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(212,175,55,0.05);font-size:0.7rem;color:var(--text-muted);">' +
            '<span>📱 ' + etiquetaQR + ' ' + qrId + '</span>' +
            '<span>' + escaparHTML(fecha) + '</span>' +
            '</div>';
    }).join('');
}