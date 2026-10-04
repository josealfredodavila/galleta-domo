// ================================================================
// INTERNET · INICIALIZACIÓN
// ================================================================
// Arranque del módulo, eventos globales, exposición a window.
// Depende de: TODOS los archivos anteriores.
// ================================================================

// ================================================================
// ARRANQUE DEL MÓDULO
// ================================================================
async function iniciarInternet() {
    console.log('◈ Internet inicializando...');

    // Esperar a que Supabase esté listo
    if (!supabaseClient) {
        console.warn('[Internet] Supabase no está listo. Reintentando...');
        setTimeout(iniciarInternet, 500);
        return;
    }

    // 1. Fondo animado (estrellas)
    initStars();

    // 2. Cargar planes desde Supabase
    await cargarPlanes();

    // 3. Listener del input de teléfono (para actualizar el resumen)
    var phoneInput = document.getElementById('netPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            if (selectedPack) selectPack(selectedPack.id);
        });
        phoneInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') comprarInternet();
        });
    }

    // 4. Cargar eSIM actual + reanudar compra pendiente (si existe)
    try {
        await obtenerEsim();
        if (esimActual && esimActual.tiene_esim) {
            renderEsim(esimActual);
        }

        var reanudado = await reanudarPendiente();

        if (!reanudado) {
            // Si tiene eSIM → vista eSIM
            // Si no → vista compra
            mostrarVista(esimActual && esimActual.tiene_esim ? 'esim' : 'compra');
        }

        actualizarBannerEsim();
    } catch (e) {
        console.warn('[Internet] Error iniciando vistas:', e);
        mostrarVista('compra');
    }

    // 5. Idiomas (después de 500ms para que todo esté montado)
    setTimeout(async function() {
        try {
            if (typeof window.inicializarIdiomas === 'function') {
                await window.inicializarIdiomas();
                console.log('[Internet] ✅ Idiomas aplicados');
            }
        } catch (e) {
            console.warn('⚠️ Error aplicando idiomas:', e);
        }
    }, 500);

    console.log('◈ Internet inicializado correctamente ✅');
}

// ================================================================
// EXPOSICIÓN GLOBAL A WINDOW
// (para los onclick del HTML)
// ================================================================

// Config / Utils
window.showToast = showToast;
window.escapeHTML = escapeHTML;

// Planes
window.cargarPlanes = cargarPlanes;
window.selectPack = selectPack;

// Compra
window.comprarInternet = comprarInternet;
window.verificarPagoManual = verificarPagoManual;
window.volverACompra = volverACompra;
window.mostrarVista = mostrarVista;

// eSIM
window.obtenerEsim = obtenerEsim;
window.abrirMiEsim = abrirMiEsim;
window.renderEsim = renderEsim;
window.sincronizarEsim = sincronizarEsim;
window.cambiarCelular = cambiarCelular;
window.copiarLPA = copiarLPA;

// Realtime / Supabase alias
window.supabase = supabaseClient;

// ================================================================
// ARRANQUE (cuando el DOM esté listo)
// ================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarInternet);
} else {
    iniciarInternet();
}