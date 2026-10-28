// ================================================================
// COMPARTIR PERFIL (Enlace directo al perfil público)
// ================================================================
function compartirPerfil() {
    const nombreCompleto = document.getElementById('perfilNombre')?.textContent || '';
    const nombre = nombreCompleto
        .replace(perfilT('perfil_verificado', '✦ VERIFICADO'), '')
        .replace('✦ VERIFICADO', '')
        .trim()
        .split(' ')[0] || perfilT('perfil_nombre_usuario', 'Explorador');
    
    const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
    
    // 🔥 CORRECCIÓN: Ahora apunta a perfil-publico.html con el handle
    const url = window.location.origin + '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(handle);
    
    const textoBase = perfilT('perfil_compartir_texto', "◈ Perfil de {nombre} en Sariel's")
        .split('{nombre}').join(nombre);
    const texto = textoBase + "\n◈ " + url + "\n\n#Sariels #WEB3";
    
    if (navigator.share) {
        navigator.share({ title: textoBase, text: texto, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto)
            .then(() => { showToast(perfilT('perfil_copiado', '◈ Copiado'), 'success'); })
            .catch(() => { prompt(perfilT('perfil_copiar_prompt', 'Copia:'), url); });
    }
}

// ================================================================
// GENERAR QR DEL PERFIL (QR con enlace al perfil público)
// ================================================================
async function generarQRPerfil() {
    try {
        const session = await getSession();
        if (!session) return;
        
        const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
        
        // 🔥 CORRECCIÓN: La URL que se convierte en QR apunta al perfil público
        const url = window.location.origin + '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(handle);
        
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(url);
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 9999;';
        
        modal.innerHTML = '<div style="background: var(--bg-card); border-radius: 20px; padding: 30px; text-align: center; max-width: 90vw; box-shadow: 0 0 40px rgba(0,0,0,0.5);">'
            + '<h3 style="color: var(--gold); margin-bottom: 20px; font-family: Orbitron, sans-serif;">' + escaparHTML(perfilT('perfil_share_qr_titulo', '📱 Mi Perfil QR')) + '</h3>'
            + '<div style="background: white; padding: 15px; border-radius: 15px; display: inline-block;">'
            + '<img src="' + escaparHTML(qrUrl) + '" alt="QR Perfil" style="display: block; border-radius: 5px;">'
            + '</div>'
            + '<p style="color: var(--text-muted); margin-top: 15px; font-size: 12px; word-break: break-all; max-width: 280px;">' + escaparHTML(url) + '</p>'
            + '<button onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px; background: var(--gold); border: none; color: #fff; padding: 10px 40px; border-radius: 10px; font-weight: bold; cursor: pointer;" data-clave="perfil_cerrar">'
            + escaparHTML(perfilT('perfil_cerrar', 'Cerrar')) + '</button></div>';
        
        document.body.appendChild(modal);
        aplicarI18NPerfil(modal);
    } catch (error) {
        showToast(perfilT('perfil_error_generar_qr', '❌ Error al generar QR'), 'error');
    }
}