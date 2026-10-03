// ================================================================
// PERFIL · QR (Escanear domos + Historial)
// ================================================================
// Escáner QR con cámara, validación de códigos de domos,
// y lista de escaneos recientes.
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

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
        status.textContent = '📷 Enfoca el QR...';

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
                        status.textContent = '✅ QR detectado';
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

        showToast('📷 Apunta la cámara al QR', 'warning');
    } catch (error) {
        if (status) status.textContent = '❌ No se pudo acceder a la cámara';
        showToast('❌ No se pudo acceder a la cámara', 'error');
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
        showToast('⚠️ Escribe o escanea el código QR', 'error');
        return;
    }
    await procesarQR(qrCode);
}

// ================================================================
// PROCESAR QR (validación en backend)
// ================================================================
async function procesarQR(codigo) {
    if (qrScanningLock) {
        showToast('⏳ Procesando otro QR...', 'warning');
        return;
    }
    qrScanningLock = true;
    const status = document.getElementById('qrStatus');
    const input = document.getElementById('qrInput');

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }
        if (status) status.textContent = '⏳ Validando QR...';
        showToast('⏳ Verificando QR...', '', 5000);

        const { data, error } = await window.supabaseClient.rpc('reclamar_qr_domo', {
            p_codigo: codigo
        });

        if (error) {
            const m = error.message || '';
            if (m.includes('already used')) {
                showToast('❌ Este QR ya fue usado', 'error');
                if (status) status.textContent = '❌ QR ya utilizado';
            } else if (m.includes('invalid code')) {
                showToast('❌ QR inválido', 'error');
                if (status) status.textContent = '❌ QR inválido';
            } else if (m.includes('not a domo')) {
                showToast('❌ Este QR no es para un domo', 'error');
                if (status) status.textContent = '❌ QR no es domo';
            } else {
                throw error;
            }
            return;
        }

        if (!data || !data.success) {
            showToast('❌ ' + ((data && data.error) || 'Error al reclamar QR'), 'error');
            return;
        }

        if (status) status.textContent = '✅ ¡QR reclamado exitosamente!';
        if (input) input.value = '';
        showToast('🎉 ¡QR escaneado! +1 Es.stok', 'success');

        await cargarPerfil(true);
        await cargarHistorialQR();
        mostrarCelebracion();
    } catch (error) {
        if (status) status.textContent = '❌ Error al procesar QR';
        showToast('❌ Error al escanear QR: ' + msgError(error), 'error');
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
    if (contador) contador.textContent = historial.length + ' ' + t('perfil_escaneos', 'escaneos');
    if (!container) return;

    if (!historial || historial.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:10px;"><span class="icon" style="font-size:1.5rem;">◈</span><p style="font-size:0.7rem;">Sin escaneos recientes</p></div>';
        aplicarI18NPerfil(container);
        return;
    }

    container.innerHTML = historial.map(item => {
        const fecha = new Date(item.fecha).toLocaleString('es-MX');
        const qrId = item.qr_id ? escaparHTML(String(item.qr_id).slice(0, 15)) : 'N/A';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(212,175,55,0.05);font-size:0.7rem;color:var(--text-muted);">' +
            '<span>📱 QR: ' + qrId + '</span>' +
            '<span>' + fecha + '</span>' +
            '</div>';
    }).join('');
}