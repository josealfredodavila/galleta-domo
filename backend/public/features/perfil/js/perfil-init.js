// ================================================================
// PERFIL · INICIALIZACIÓN
// ================================================================
// Arranque del módulo, eventos globales, exposición a window y
// sincronización realtime con Supabase.
//
// v2 (menú de foto):
// - No sobrescribe toggleAvatarMenu / cerrarAvatarMenu si el controlador
//   del HTML (window.__avatarMenuControlador) ya las definió.
// - El listener de clic global cierra la hoja quitando show y open.
// - La actualización realtime solo cambia la imagen del avatar y
//   conserva el botón de lápiz y el menú, para no romper el controlador.
// ================================================================

function publicarFuncionesGlobales() {
    // Utils
    window.showToast = typeof showToast === 'function' ? showToast : null;
    if (!window.__avatarMenuControlador) {
        window.toggleAvatarMenu = typeof toggleAvatarMenu === 'function' ? toggleAvatarMenu : null;
        window.cerrarAvatarMenu = typeof cerrarAvatarMenu === 'function' ? cerrarAvatarMenu : null;
    }
    window.escapeHtmlPerfil = typeof escapeHtmlPerfil === 'function' ? escapeHtmlPerfil : null;

    // Datos
    window.cargarPerfil = typeof cargarPerfil === 'function' ? cargarPerfil : null;
    window.guardarPerfil = typeof guardarPerfil === 'function' ? guardarPerfil : null;
    window.editarPerfil = typeof editarPerfil === 'function' ? editarPerfil : null;
    window.compartirPerfil = typeof compartirPerfil === 'function' ? compartirPerfil : null;
    window.generarQRPerfil = typeof generarQRPerfil === 'function' ? generarQRPerfil : null;
    window.abrirSelectorArchivo = typeof abrirSelectorArchivo === 'function' ? abrirSelectorArchivo : null;
    window.expandirAvatar = typeof expandirAvatar === 'function' ? expandirAvatar : null;
    window.expandirFotoPublicacion = typeof expandirFotoPublicacion === 'function' ? expandirFotoPublicacion : null;
    window.subirFoto = typeof subirFoto === 'function' ? subirFoto : null;
    window.subirVideo = typeof subirVideo === 'function' ? subirVideo : null;
    window.eliminarFotoPerfil = typeof eliminarFotoPerfil === 'function' ? eliminarFotoPerfil : null;
    window.cerrarSesion = typeof cerrarSesion === 'function' ? cerrarSesion : null;
    window.irAMuro = typeof irAMuro === 'function' ? irAMuro : null;
    window.obtenerEstadisticas = typeof obtenerEstadisticas === 'function' ? obtenerEstadisticas : null;
    window.calcularNivel = typeof calcularNivel === 'function' ? calcularNivel : null;

    // Estado
    window.cambiarEstado = typeof cambiarEstado === 'function' ? cambiarEstado : null;
    window.actualizarEstadoEnLinea = typeof actualizarEstadoEnLinea === 'function' ? actualizarEstadoEnLinea : null;

    // Amigos
    window.cargarAmigosEnLinea = typeof cargarAmigosEnLinea === 'function' ? cargarAmigosEnLinea : null;
    window.actualizarListaAmigos = typeof actualizarListaAmigos === 'function' ? actualizarListaAmigos : null;
    window.agregarAmigo = typeof agregarAmigo === 'function' ? agregarAmigo : null;

    // Conexión
    window.cambiarConexion = typeof cambiarConexion === 'function' ? cambiarConexion : null;
    window.cargarEstadoConexion = typeof cargarEstadoConexion === 'function' ? cargarEstadoConexion : null;

    // Tokens / NFT / Pro
    window.cargarEstadoPro = typeof cargarEstadoPro === 'function' ? cargarEstadoPro : null;
    window.contratarPro = typeof contratarPro === 'function' ? contratarPro : null;
    window.activarProDirecto = typeof activarProDirecto === 'function' ? activarProDirecto : null;
    window.canjearNFT = typeof canjearNFT === 'function' ? canjearNFT : null;
    window.compartirLogro = typeof compartirLogro === 'function' ? compartirLogro : null;

    // QR
    window.escanearQR = typeof escanearQR === 'function' ? escanearQR : null;
    window.abrirCamaraQR = typeof abrirCamaraQR === 'function' ? abrirCamaraQR : null;
    window.cerrarCamaraQR = typeof cerrarCamaraQR === 'function' ? cerrarCamaraQR : null;
    window.cargarHistorialQR = typeof cargarHistorialQR === 'function' ? cargarHistorialQR : null;
    window.actualizarUIHistorialQR = typeof actualizarUIHistorialQR === 'function' ? actualizarUIHistorialQR : null;
    window.procesarQR = typeof procesarQR === 'function' ? procesarQR : null;

    // eSIM
    window.cargarEsimNueva = typeof cargarEsimNueva === 'function' ? cargarEsimNueva : null;
    window.sincronizarEsimNuevo = typeof sincronizarEsimNuevo === 'function' ? sincronizarEsimNuevo : null;
    window.verQREsimNuevo = typeof verQREsimNuevo === 'function' ? verQREsimNuevo : null;
    window.irAComprarInternet = typeof irAComprarInternet === 'function' ? irAComprarInternet : null;

    // Wallet
    window.conectarWallet = typeof conectarWallet === 'function' ? conectarWallet : null;
    window.desconectarWallet = typeof desconectarWallet === 'function' ? desconectarWallet : null;

    // Publicaciones
    window.toggleEmojiPickerPerfil = typeof toggleEmojiPickerPerfil === 'function' ? toggleEmojiPickerPerfil : null;
    window.insertarHashtagPerfil = typeof insertarHashtagPerfil === 'function' ? insertarHashtagPerfil : null;
    window.seleccionarArchivoPerfil = typeof seleccionarArchivoPerfil === 'function' ? seleccionarArchivoPerfil : null;
    window.quitarArchivoPerfil = typeof quitarArchivoPerfil === 'function' ? quitarArchivoPerfil : null;
    window.publicarDesdePerfil = typeof publicarDesdePerfil === 'function' ? publicarDesdePerfil : null;
    window.cargarMisPublicaciones = typeof cargarMisPublicaciones === 'function' ? cargarMisPublicaciones : null;
    window.toggleReaccionDropdown = typeof toggleReaccionDropdown === 'function' ? toggleReaccionDropdown : null;
    window.reaccionarPublicacionPerfil = typeof reaccionarPublicacionPerfil === 'function' ? reaccionarPublicacionPerfil : null;
    window.toggleComentariosPerfil = typeof toggleComentariosPerfil === 'function' ? toggleComentariosPerfil : null;
    window.enviarComentarioPerfil = typeof enviarComentarioPerfil === 'function' ? enviarComentarioPerfil : null;
    window.eliminarMiPublicacion = typeof eliminarMiPublicacion === 'function' ? eliminarMiPublicacion : null;

    // Internet
    window.cargarOrdenesInternet = typeof cargarOrdenesInternet === 'function' ? cargarOrdenesInternet : null;
    window.filtrarOrdenesInternet = typeof filtrarOrdenesInternet === 'function' ? filtrarOrdenesInternet : null;

    // Repartidor
    window.verificarEstadoRepartidorPerfil = typeof verificarEstadoRepartidorPerfil === 'function' ? verificarEstadoRepartidorPerfil : null;
    window.irARepartidorDesdePerfil = typeof irARepartidorDesdePerfil === 'function' ? irARepartidorDesdePerfil : null;

    // Cambiar tab
    window.cambiarTab = typeof cambiarTab === 'function' ? cambiarTab : null;

    // i18n
    window.perfilT = typeof perfilT === 'function' ? perfilT : null;
    window.aplicarI18NPerfil = typeof aplicarI18NPerfil === 'function' ? aplicarI18NPerfil : null;
    window.traducirPlanMeta = typeof traducirPlanMeta === 'function' ? traducirPlanMeta : null;
}

// ================================================================
// LLAMADA SEGURA A MÓDULOS OPCIONALES
// ================================================================
function llamarSiExiste(nombre, ...args) {
    try {
        var fn = window[nombre];
        if (typeof fn === 'function') return fn.apply(null, args);
    } catch (e) {
        console.warn('[Perfil] Error en ' + nombre + ':', e);
    }
    return undefined;
}

// ================================================================
// CAMBIAR TAB
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

    if (tab === 'esim') llamarSiExiste('cargarEsimNueva');
    if (tab === 'internet') llamarSiExiste('cargarOrdenesInternet');
}

// ================================================================
// NIVEL DEL USUARIO (badge)
// ================================================================
function aplicarNivelUsuario(nivel) {
    const nivelEl = document.getElementById('nivelUsuario');
    if (!nivelEl || !nivel) return;

    const destino = nivelEl.querySelector('span') || nivelEl;

    destino.removeAttribute('data-clave');
    destino.setAttribute('data-no-traducir', '1');
    destino.textContent = nivel.emoji + ' ' + perfilT(nivel.clave, nivel.nombre);
}

// ================================================================
// SINCRONIZACIÓN REALTIME
// ================================================================
var ultimaRecargaPerfilSync = 0;

function actualizarDOMDesdeRealtime(usuario) {
    try {
        if (!usuario) return;

        var nombreContainer = document.querySelector('#perfilNombre');
        if (nombreContainer) {
            var nombreSpan = nombreContainer.querySelector('[data-clave="perfil_nombre_usuario"]');
            var nombreTexto = usuario.nombre || perfilT('perfil_nombre_usuario', 'Explorador');
            if (nombreSpan) {
                nombreSpan.textContent = nombreTexto;
            } else {
                nombreContainer.textContent = nombreTexto;
            }
        }

        var handleElement = document.querySelector('#perfilHandle');
        if (handleElement) {
            handleElement.textContent = usuario.handle ? '@' + usuario.handle : '@explorador';
        }

        // Solo se cambia la imagen. El botón de lápiz y el menú de foto
        // se conservan tal cual, para no romper el controlador del HTML.
        var avatarElement = document.querySelector('#perfilAvatar');
        if (avatarElement) {
            var imgActual = avatarElement.querySelector('img');

            if (usuario.avatar_url) {
                if (imgActual) {
                    if (imgActual.getAttribute('src') !== usuario.avatar_url) {
                        imgActual.src = usuario.avatar_url;
                    }
                    imgActual.style.display = '';
                } else {
                    var nueva = document.createElement('img');
                    nueva.src = usuario.avatar_url;
                    nueva.alt = '';
                    nueva.onerror = function () { this.style.display = 'none'; };
                    avatarElement.insertBefore(nueva, avatarElement.firstChild);
                }
            } else if (imgActual) {
                imgActual.remove();
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
            setTimeout(function () { recargarPerfilRealtime(true); }, 500);
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
            }, function (payload) {
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
// APLICAR PARÁMETROS DE URL
// ================================================================
function aplicarParametrosURL() {
    var params = new URLSearchParams(window.location.search);
    var tab = params.get('tab');
    var action = params.get('action');

    if (tab && typeof window.cambiarTab === 'function') {
        setTimeout(function () {
            window.cambiarTab(tab);
            if (tab === 'qr') {
                var tabContent = document.getElementById('tab-qr');
                if (tabContent) {
                    setTimeout(function () {
                        tabContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 300);
                }
            }
        }, 600);
    }

    if (action === 'canjear') {
        setTimeout(function () {
            if (typeof window.cambiarTab === 'function') window.cambiarTab('tokens');
            setTimeout(function () {
                if (typeof window.canjearNFT === 'function') window.canjearNFT();
            }, 500);
        }, 800);
    }

    if (tab || action) {
        setTimeout(function () {
            try {
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {}
        }, 2000);
    }
}

// ================================================================
// ESPERAR TRADUCCIONES
// ================================================================
async function esperarTraduccionesPerfil() {
    for (var i = 0; i < 50 && typeof window.esperarIdiomas !== 'function'; i++) {
        await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }

    if (typeof window.esperarIdiomas === 'function') {
        try {
            await window.esperarIdiomas();
        } catch (e) {
            console.warn('[Perfil] No se pudieron cargar las traducciones:', e);
        }
    }

    try {
        await aplicarI18NPerfil(document);
    } catch (e) {
        console.warn('[Perfil] Error aplicando traducciones:', e);
    }
}

// ================================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================================
async function iniciarPerfil() {
    try { asegurarEstilosPerfil(); } catch (e) {}

    await esperarTraduccionesPerfil();

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

    // Cargar perfil principal (lo que más importa que aparezca)
    await llamarSiExiste('cargarPerfil');

    // Módulos opcionales: cada uno se llama solo si existe
    llamarSiExiste('cargarMisPublicaciones');

    try {
        const stats = await llamarSiExiste('obtenerEstadisticas');
        if (stats && typeof calcularNivel === 'function') {
            aplicarNivelUsuario(calcularNivel(stats.tokens_actuales || 0));
        }
    } catch (e) {}

    llamarSiExiste('iniciarNotificacionesRealtime');
    llamarSiExiste('iniciarEscuchaConexion');
    llamarSiExiste('iniciarEscuchaAmigos');
    llamarSiExiste('iniciarDetectorInactividad');
    llamarSiExiste('iniciarEscuchaWallet');

    setInterval(function () {
        if (!document.hidden) llamarSiExiste('cargarEstadoConexion');
    }, 60000);
    setInterval(function () {
        if (!document.hidden) llamarSiExiste('cargarAmigosEnLinea');
    }, 60000);

    setTimeout(aplicarParametrosURL, 500);
    setTimeout(function () { llamarSiExiste('verificarEstadoRepartidorPerfil'); }, 1500);
    setTimeout(function () { llamarSiExiste('cargarEsimNueva'); }, 2000);
}

// ================================================================
// ARRANQUE
// ================================================================
try { publicarFuncionesGlobales(); } catch (e) { console.warn('[Perfil] publicarFuncionesGlobales:', e); }
try { asegurarEstilosPerfil(); } catch (e) {}

iniciarRecargaRealtime();
setTimeout(function () { recargarPerfilRealtime(true); }, 800);
setTimeout(function () { recargarPerfilRealtime(true); }, 1600);
setTimeout(function () { recargarPerfilRealtime(true); }, 3000);
setTimeout(iniciarRealtimePerfil, 1000);

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') recargarPerfilRealtime(true);
});
window.addEventListener('focus', function () {
    recargarPerfilRealtime(true);
});

// Cierre de menús al tocar fuera. El menú de foto lo gestiona el controlador
// del HTML; aquí solo se cierra la hoja si el controlador no existe.
document.addEventListener('click', function (e) {
    if (!window.__avatarMenuControlador) {
        var menu = document.getElementById('avatarMenu');
        var avatar = document.getElementById('perfilAvatar');
        if (menu && menu.classList.contains('show')) {
            if (!menu.contains(e.target) && avatar && !avatar.contains(e.target)) {
                menu.classList.remove('show', 'open');
            }
        }
    }

    var picker = document.getElementById('emojiPickerPerfil');
    if (picker && picker.classList.contains('show')) {
        if (!picker.contains(e.target) && e.target.id !== 'btnEmojiPerfil') {
            picker.classList.remove('show');
        }
    }

    var rd = document.querySelectorAll('.reaccion-dropdown.show');
    rd.forEach(function (dd) {
        if (!dd.contains(e.target) && !dd.parentElement.contains(e.target)) {
            dd.classList.remove('show');
        }
    });
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarPerfil);
} else {
    iniciarPerfil();
}