// ================================================================
// PERFIL · INICIALIZACIÓN
// ================================================================
// Arranque del módulo, eventos globales, exposición a window y
// sincronización realtime con Supabase.
// Depende de: TODOS los archivos anteriores.
// ================================================================

// ================================================================
// EXPOSICIÓN GLOBAL A WINDOW
// (para los onclick del HTML)
// ================================================================
function publicarFuncionesGlobales() {
    // Utils
    window.showToast = showToast;
    window.toggleAvatarMenu = toggleAvatarMenu;
    window.cerrarAvatarMenu = cerrarAvatarMenu;
    window.escapeHtmlPerfil = escapeHtmlPerfil;

    // Datos
    window.cargarPerfil = cargarPerfil;
    window.guardarPerfil = guardarPerfil;
    window.editarPerfil = editarPerfil;
    window.compartirPerfil = compartirPerfil;
    window.generarQRPerfil = generarQRPerfil;
    window.abrirSelectorArchivo = abrirSelectorArchivo;
    window.expandirAvatar = expandirAvatar;
    window.expandirFotoPublicacion = expandirFotoPublicacion;
    window.subirFoto = subirFoto;
    window.subirVideo = subirVideo;
    window.eliminarFotoPerfil = eliminarFotoPerfil;
    window.cerrarSesion = cerrarSesion;
    window.irAMuro = irAMuro;
    window.obtenerEstadisticas = obtenerEstadisticas;
    window.calcularNivel = calcularNivel;

    // Estado
    window.cambiarEstado = cambiarEstado;
    window.actualizarEstadoEnLinea = actualizarEstadoEnLinea;

    // Amigos
    window.cargarAmigosEnLinea = cargarAmigosEnLinea;
    window.actualizarListaAmigos = actualizarListaAmigos;
    window.agregarAmigo = agregarAmigo;

    // Conexión
    window.cambiarConexion = cambiarConexion;
    window.cargarEstadoConexion = cargarEstadoConexion;

    // Tokens / NFT / Pro
    window.cargarEstadoPro = cargarEstadoPro;
    window.contratarPro = contratarPro;
    window.activarProDirecto = activarProDirecto;
    window.canjearNFT = canjearNFT;
    window.compartirLogro = compartirLogro;

    // QR
    window.escanearQR = escanearQR;
    window.abrirCamaraQR = abrirCamaraQR;
    window.cerrarCamaraQR = cerrarCamaraQR;
    window.cargarHistorialQR = cargarHistorialQR;
    window.actualizarUIHistorialQR = actualizarUIHistorialQR;
    window.procesarQR = procesarQR;

    // eSIM
    window.cargarEsimNueva = cargarEsimNueva;
    window.sincronizarEsimNuevo = sincronizarEsimNuevo;
    window.verQREsimNuevo = verQREsimNuevo;
    window.irAComprarInternet = irAComprarInternet;

    // Wallet
    window.conectarWallet = conectarWallet;
    window.desconectarWallet = desconectarWallet;

    // Publicaciones
    window.toggleEmojiPickerPerfil = toggleEmojiPickerPerfil;
    window.insertarHashtagPerfil = insertarHashtagPerfil;
    window.seleccionarArchivoPerfil = seleccionarArchivoPerfil;
    window.quitarArchivoPerfil = quitarArchivoPerfil;
    window.publicarDesdePerfil = publicarDesdePerfil;
    window.cargarMisPublicaciones = cargarMisPublicaciones;
    window.toggleReaccionDropdown = toggleReaccionDropdown;
    window.reaccionarPublicacionPerfil = reaccionarPublicacionPerfil;
    window.toggleComentariosPerfil = toggleComentariosPerfil;
    window.enviarComentarioPerfil = enviarComentarioPerfil;
    window.eliminarMiPublicacion = eliminarMiPublicacion;

    // Internet
    window.cargarOrdenesInternet = cargarOrdenesInternet;
    window.filtrarOrdenesInternet = filtrarOrdenesInternet;

    // Repartidor
    window.verificarEstadoRepartidorPerfil = verificarEstadoRepartidorPerfil;
    window.irARepartidorDesdePerfil = irARepartidorDesdePerfil;

    // Cambiar tab
    window.cambiarTab = cambiarTab;

    // i18n
    window.perfilT = t;
    window.aplicarI18NPerfil = aplicarI18NPerfil;
    window.traducirPlanMeta = traducirPlanMeta;
}

// ================================================================
// CAMBIAR TAB (publicaciones / actividad / tokens / esim / qr / internet)
// ================================================================
function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) {
        tabContent.classList.add('active');
        tabContent.style.animation = 'fadeIn 0.3s ease-out';
    }
    const tabBtn = document.querySelector('.tab-btn[onclick*="\'' + tab + '\'"]');
    if (tabBtn) tabBtn.classList.add('active');

    // Cargar datos según la tab
    if (tab === 'esim' && typeof window.cargarEsimNueva === 'function') {
        window.cargarEsimNueva();
    }
    if (tab === 'internet' && typeof window.cargarOrdenesInternet === 'function') {
        window.cargarOrdenesInternet();
    }
}

// ================================================================
// SINCRONIZACIÓN REALTIME DEL PERFIL
// ================================================================
var ultimaRecargaPerfilSync = 0;

function actualizarDOMDesdeRealtime(usuario) {
    try {
        if (!usuario) return;
        // Nombre
        var nombreContainer = document.querySelector('#perfilNombre');
        if (nombreContainer) {
            var nombreSpan = nombreContainer.querySelector('[data-clave="perfil_nombre_usuario"]');
            if (nombreSpan) {
                nombreSpan.textContent = usuario.nombre || 'Explorador';
            } else {
                nombreContainer.textContent = usuario.nombre || 'Explorador';
            }
        }
        // Handle
        var handleElement = document.querySelector('#perfilHandle');
        if (handleElement) {
            handleElement.textContent = usuario.handle ? '@' + usuario.handle : '@explorador';
        }
        // Avatar
        var avatarElement = document.querySelector('#perfilAvatar');
        if (avatarElement) {
            if (usuario.avatar_url) {
                avatarElement.innerHTML =
                    '<img src="' + escaparHTML(usuario.avatar_url) + '" alt="Avatar">' +
                    '<span class="avatar-menu-toggle" title="Opciones de foto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></span>';
            } else {
                avatarElement.innerHTML =
                    '◈' +
                    '<span class="avatar-menu-toggle" title="Opciones de foto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></span>';
            }
            var toggle = avatarElement.querySelector('.avatar-menu-toggle');
            if (toggle) {
                toggle.onclick = function(ev) {
                    ev.stopPropagation();
                    if (typeof window.toggleAvatarMenu === 'function') window.toggleAvatarMenu(ev);
                };
            }
        }
    } catch (error) {
        console.warn('[Perfil] Error actualizando el DOM:', error);
    }
}

async function recargarPerfilRealtime(forzar) {
    try {
        var ahora = Date.now();
        if (!forzar && ahora - ultimaRecargaPerfilSync < 500) return;
        ultimaRecargaPerfilSync = ahora;

        if (!window.supabaseClient) {
            setTimeout(function() { recargarPerfilRealtime(true); }, 500);
            return;
        }
        var sessionResult = await window.supabaseClient.auth.getSession();
        if (sessionResult.error || !sessionResult.data || !sessionResult.data.session || !sessionResult.data.session.user) return;

        var userId = sessionResult.data.session.user.id;
        var result = await window.supabaseClient
            .from('usuarios')
            .select('id, nombre, handle, bio, avatar_url')
            .eq('id', userId)
            .maybeSingle();
        if (result.error) return;

        if (result.data) {
            actualizarDOMDesdeRealtime(result.data);
            window.perfilCache = Object.assign(window.perfilCache || {}, result.data);
        }
    } catch (error) {
        console.warn('[Perfil] Error en recargarPerfilRealtime():', error);
    }
}

function iniciarRecargaRealtime() {
    if (window.supabaseClient) {
        recargarPerfilRealtime(true);
    } else {
        setTimeout(iniciarRecargaRealtime, 200);
    }
}

async function iniciarRealtimePerfil() {
    try {
        if (!window.supabaseClient) {
            setTimeout(iniciarRealtimePerfil, 500);
            return;
        }
        var sessionResult = await window.supabaseClient.auth.getSession();
        if (!sessionResult.data || !sessionResult.data.session || !sessionResult.data.session.user) return;

        var userId = sessionResult.data.session.user.id;
        window.supabaseClient
            .channel('perfil-sync-' + userId)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'usuarios',
                filter: 'id=eq.' + userId
            }, function(payload) {
                if (payload && payload.new) {
                    actualizarDOMDesdeRealtime(payload.new);
                }
            })
            .subscribe();
    } catch (e) {
        console.warn('[Perfil] Realtime error:', e);
    }
}

// ================================================================
// APLICAR PARÁMETROS DE URL (tab, action)
// ================================================================
function aplicarParametrosURL() {
    var params = new URLSearchParams(window.location.search);
    var tab = params.get('tab');
    var action = params.get('action');

    if (tab && typeof window.cambiarTab === 'function') {
        setTimeout(function() {
            window.cambiarTab(tab);
            console.log('[Perfil] Tab cambiada a:', tab);

            if (tab === 'qr') {
                var tabContent = document.getElementById('tab-qr');
                if (tabContent) {
                    setTimeout(function() {
                        tabContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 300);
                }
            }
        }, 600);
    }

    if (action === 'canjear') {
        setTimeout(function() {
            if (typeof window.cambiarTab === 'function') {
                window.cambiarTab('tokens');
            }
            setTimeout(function() {
                if (typeof window.canjearNFT === 'function') {
                    window.canjearNFT();
                    console.log('[Perfil] Acción canjear ejecutada');
                }
            }, 500);
        }, 800);
    }

    if (tab || action) {
        setTimeout(function() {
            try {
                var urlLimpia = window.location.pathname;
                window.history.replaceState({}, document.title, urlLimpia);
            } catch (e) {
                console.warn('[Perfil] No se pudo limpiar la URL:', e);
            }
        }, 2000);
    }
}

// ================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================
async function iniciarPerfil() {
    // Asegurar estilos de animaciones
    asegurarEstilosPerfil();

    // Cargar jsQR si no está
    if (typeof jsQR === 'undefined') {
        try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
            document.head.appendChild(script);
            await new Promise(resolve => {
                script.onload = resolve;
                script.onerror = resolve;
            });
        } catch (e) {}
    }

    // Cargar perfil principal
    await cargarPerfil();

    // Cargar estadísticas y nivel
    const stats = await obtenerEstadisticas();
    if (stats) {
        const nivel = calcularNivel(stats.tokens_actuales || 0);
        const nivelEl = document.getElementById('nivelUsuario');
        if (nivelEl) nivelEl.textContent = nivel.emoji + ' ' + nivel.nombre;
    }

    // Iniciar módulos
    iniciarNotificacionesRealtime();
    iniciarEscuchaConexion();
    iniciarEscuchaAmigos();
    iniciarDetectorInactividad();
    iniciarEscuchaWallet();

    // Refrescos periódicos
    setInterval(() => {
        if (!document.hidden) cargarEstadoConexion();
    }, 60000);
    setInterval(() => {
        if (!document.hidden) cargarAmigosEnLinea();
    }, 60000);

    // Aplicar parámetros de URL
    setTimeout(aplicarParametrosURL, 500);

    // Cargar repartidor
    setTimeout(verificarEstadoRepartidorPerfil, 1500);

    // Verificar eSIM (para la pestaña)
    setTimeout(() => {
        if (typeof window.cargarEsimNueva === 'function') {
            window.cargarEsimNueva();
        }
    }, 2000);
}

// ================================================================
// ARRANQUE
// ================================================================
publicarFuncionesGlobales();
asegurarEstilosPerfil();

// Realtime sync
iniciarRecargaRealtime();
setTimeout(function() { recargarPerfilRealtime(true); }, 800);
setTimeout(function() { recargarPerfilRealtime(true); }, 1600);
setTimeout(function() { recargarPerfilRealtime(true); }, 3000);
setTimeout(iniciarRealtimePerfil, 1000);

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') recargarPerfilRealtime(true);
});
window.addEventListener('focus', function() {
    recargarPerfilRealtime(true);
});

// Click fuera de menús para cerrar
document.addEventListener('click', function(e) {
    // Cerrar avatar menu
    var menu = document.getElementById('avatarMenu');
    var avatar = document.getElementById('perfilAvatar');
    if (menu && menu.classList.contains('show')) {
        if (!menu.contains(e.target) && !avatar.contains(e.target)) {
            menu.classList.remove('show');
        }
    }

    // Cerrar emoji picker
    var picker = document.getElementById('emojiPickerPerfil');
    if (picker && picker.classList.contains('show')) {
        if (!picker.contains(e.target) && e.target.id !== 'btnEmojiPerfil') {
            picker.classList.remove('show');
        }
    }

    // Cerrar reacciones dropdowns
    var rd = document.querySelectorAll('.reaccion-dropdown.show');
    rd.forEach(function(dd) {
        if (!dd.contains(e.target) && !dd.parentElement.contains(e.target)) {
            dd.classList.remove('show');
        }
    });
});

// Arranque del módulo perfil (cuando el DOM esté listo)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarPerfil);
} else {
    iniciarPerfil();
}

console.log('[Perfil] ✅ Módulo dividido cargado correctamente');