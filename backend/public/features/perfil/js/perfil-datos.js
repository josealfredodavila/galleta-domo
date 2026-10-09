// ================================================================
// PERFIL · DATOS DEL USUARIO
// ================================================================
// Cargar/actualizar perfil, contadores sociales, avatar, guardar.
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

// ================================================================
// CARGAR PERFIL
// ================================================================
async function cargarPerfil(forzarActualizacion = false) {
    try {
        if (!cli()) return;
        const session = await getSession();
        if (!session) { window.location.replace('/'); return; }
        const ahora = Date.now();
        if (!forzarActualizacion && perfilCache && (ahora - ultimaActualizacion) < CACHE_DURATION) {
            actualizarUI(perfilCache);
            return;
        }
        let perfil = null;

        // ✅ NUEVO: leer perfil propio vía RPC seguro (devuelve SETOF usuarios → array)
        try {
            const { data, error } = await window.supabaseClient.rpc('mi_perfil_privado');
            if (!error && data) {
                perfil = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
            }
        } catch (rpcErr) {
            console.warn('[Perfil] mi_perfil_privado falló:', rpcErr);
        }

        // Fallback: obtener_mi_perfil (RPC antiguo, por si acaso)
        if (!perfil) {
            try {
                const { data, error } = await window.supabaseClient.rpc('obtener_mi_perfil');
                if (!error && data) {
                    perfil = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
                }
            } catch (rpcErr) {}
        }

        // Último fallback: perfil básico desde la sesión
        if (!perfil) perfil = perfilBasico(session);

        perfilCache = perfil;
        window.perfilCache = perfil;
        ultimaActualizacion = ahora;
        await actualizarEstadoEnLinea(true);
        actualizarUI(perfil);
        Promise.all([
            cargarEstadoConexion(),
            cargarAmigosEnLinea(),
            cargarHistorialQR(),
            cargarEstadoPro(),
            cargarContadoresSociales(session.user.id)
        ]).catch(function(){});
        await aplicarI18NPerfil();
    } catch (error) {
        showToast('❌ Error al cargar perfil', 'error');
    }
}

// ================================================================
// ACTUALIZAR UI CON LOS DATOS DEL PERFIL
// ================================================================
function actualizarUI(data) {
    if (!data) return;
    const nombreEl = document.getElementById('perfilNombre');
    const handleEl = document.getElementById('perfilHandle');
    const bioEl = document.getElementById('perfilBio');
    const avatarEl = document.getElementById('perfilAvatar');

    if (nombreEl) {
        const verificado = data.verificado ? '<span class="verified">✦ VERIFICADO</span>' : '';
        const nombreSafe = escaparHTML(data.nombre || t('perfil_nombre_usuario', 'Explorador'));
        nombreEl.innerHTML = '<span data-no-traducir="1">' + nombreSafe + '</span> ' + verificado;
        nombreEl.setAttribute('data-no-traducir', '1');
    }
    if (handleEl) handleEl.textContent = '@' + (data.handle || 'explorador');

    if (bioEl) {
        const bioDefault = "Explorando el ecosistema Sariel's · WEB3 · Comunidad";
        const bioT = t('perfil_biografia_default', bioDefault);
        if (!data.bio || data.bio === bioDefault) {
            bioEl.setAttribute('data-clave', 'perfil_biografia_default');
            bioEl.textContent = bioT;
        } else {
            bioEl.removeAttribute('data-clave');
            bioEl.setAttribute('data-no-traducir', '1');
            bioEl.innerHTML = formatearTexto(data.bio);
        }
    }
    if (avatarEl) {
        const toggle = '<span class="avatar-menu-toggle" onclick="event.stopPropagation(); window.toggleAvatarMenu(event)" title="Opciones">✎</span>';
        if (data.avatar_url) {
            const urlSafe = escaparHTML(data.avatar_url);
            avatarEl.innerHTML = '<img src="' + urlSafe + '" alt="Avatar">' + toggle;
            const img = avatarEl.querySelector('img');
            if (img) img.addEventListener('error', function () { avatarEl.innerHTML = '◈' + toggle; });
        } else {
            avatarEl.innerHTML = '◈' + toggle;
        }
    }

    // ---- STATS (tokens, NFTs, seguidores, siguiendo) ----
    const stats = [
        { id: 'statTokens', value: data.tokens || 0 },
        { id: 'statNFTS', value: data.nft_canjeado ? 1 : (data.domos || 0) }
    ];
    stats.forEach(stat => {
        const el = document.getElementById(stat.id);
        if (el && el.textContent !== String(stat.value)) {
            animarContador(el, parseInt(el.textContent) || 0, stat.value);
        }
    });

    // ---- PROGRESO NFT ----
    const tokens = data.tokens || 0;
    const progreso = Math.min(tokens, 12);
    const puedeCanjear = data.puede_canjear || false;
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    if (progressFill) {
        progressFill.style.width = ((progreso / 12) * 100) + '%';
        progressFill.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
    }
    if (progressText) {
        progressText.textContent = progreso + ' / 12' + (progreso >= 12 ? ' 🎯' : '');
        progressText.style.color = progreso >= 12 ? 'var(--gold)' : '';
    }

    // ---- TOKENS DETALLE ----
    const tokenTotal = document.getElementById('tokenTotal');
    const tokenDisponibles = document.getElementById('tokenDisponibles');
    const tokenNFTs = document.getElementById('tokenNFTs');
    const tokenVendidos = document.getElementById('tokenVendidos');
    if (tokenTotal) tokenTotal.textContent = tokens;
    if (tokenDisponibles) tokenDisponibles.textContent = tokens;
    if (tokenNFTs) tokenNFTs.textContent = data.nft_canjeado ? 1 : 0;
    if (tokenVendidos) tokenVendidos.textContent = data.tokens_acumulados ? Math.max(0, (data.tokens_acumulados || 0) - tokens) : 0;

    // ---- BOTÓN CANJEAR NFT ----
    const btnCanjear = document.getElementById('canjearNft');
    if (btnCanjear) {
        btnCanjear.removeAttribute('data-clave');
        btnCanjear.disabled = !puedeCanjear;
        if (puedeCanjear) {
            btnCanjear.style.background = 'linear-gradient(135deg, var(--gold), #f7971e)';
            btnCanjear.style.border = 'none';
            btnCanjear.style.color = '#fff';
            btnCanjear.innerHTML = '🎁 CANJEAR NFT';
        } else {
            btnCanjear.style.background = 'var(--bg-card)';
            btnCanjear.style.border = '1px solid var(--text-muted)';
            btnCanjear.style.color = 'var(--text-muted)';
            btnCanjear.innerHTML = '🔒 NECESITAS 12 TOKENS';
        }
    }

    actualizarUIConexion(estadoConexion);
    actualizarUIEstado(data.online !== false);
}

// ================================================================
// CONTADORES SOCIALES (seguidores, siguiendo)
// ================================================================
async function cargarContadoresSociales(usuarioId) {
    try {
        if (!usuarioId) return;
        if (!cli()) return;
        const ahora = Date.now();
        if (contadoresSocialesCache && (ahora - ultimaActualizacionContadores) < CONTADORES_CACHE_DURATION) {
            aplicarContadoresSociales(contadoresSocialesCache);
            return;
        }

        // ✅ NUEVO: leer contadores desde perfiles_publicos (no de usuarios)
        try {
            const { data: usuario, error } = await window.supabaseClient
                .from('perfiles_publicos')
                .select('seguidores_count, siguiendo_count')
                .eq('id', usuarioId)
                .maybeSingle();
            if (!error && usuario && (typeof usuario.seguidores_count === 'number' || typeof usuario.siguiendo_count === 'number')) {
                contadoresSocialesCache = {
                    seguidores: usuario.seguidores_count || 0,
                    siguiendo: usuario.siguiendo_count || 0
                };
                ultimaActualizacionContadores = ahora;
                aplicarContadoresSociales(contadoresSocialesCache);
                return;
            }
        } catch (e) {
            console.warn('[Perfil] Error leyendo contadores desde perfiles_publicos:', e);
        }

        // Fallback: contar desde tabla contactos
        const [seguidoresRes, siguiendoRes] = await Promise.all([
            window.supabaseClient.from('contactos').select('*', { count: 'exact', head: true }).eq('contacto_id', usuarioId),
            window.supabaseClient.from('contactos').select('*', { count: 'exact', head: true }).eq('usuario_id', usuarioId)
        ]);
        contadoresSocialesCache = {
            seguidores: seguidoresRes.count || 0,
            siguiendo: siguiendoRes.count || 0
        };
        ultimaActualizacionContadores = ahora;
        aplicarContadoresSociales(contadoresSocialesCache);
    } catch (error) {}
}

function aplicarContadoresSociales(c) {
    const segEl = document.getElementById('statSeguidores');
    const sigEl = document.getElementById('statSiguiendo');
    if (segEl) segEl.textContent = String(c?.seguidores ?? 0);
    if (sigEl) sigEl.textContent = String(c?.siguiendo ?? 0);
}

// ================================================================
// GUARDAR PERFIL (nombre, handle, bio)
// ================================================================
async function guardarPerfil() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return;
    }
    const perfil = {
        nombre: (document.getElementById('editNombre')?.value || '').trim() || t('perfil_nombre_usuario', 'Explorador'),
        handle: (document.getElementById('editHandle')?.value || '').trim().replace('@', '') || 'explorador',
        bio: (document.getElementById('editBio')?.value || '').trim() || t('perfil_biografia_default', "Explorando el ecosistema Sariel's · WEB3 · Comunidad")
    };
    if (!/^[a-zA-Z0-9_]+$/.test(perfil.handle)) {
        showToast('❌ Handle inválido', 'error');
        return;
    }
    try {
        const { error } = await window.supabaseClient
            .from('usuarios')
            .update({
                nombre: perfil.nombre,
                handle: perfil.handle,
                bio: perfil.bio,
                updated_at: new Date().toISOString()
            })
            .eq('id', session.user.id);
        if (error) throw error;
        showToast('✅ Perfil guardado', 'success');
        await cargarPerfil(true);
    } catch (error) {
        showToast('❌ Error al guardar: ' + msgError(error), 'error');
    }
}

// ================================================================
// EDITAR PERFIL (ir a config)
// ================================================================
function editarPerfil() {
    cambiarTab('config');
    setTimeout(() => {
        const input = document.getElementById('editNombre');
        if (input) {
            input.focus();
            input.select();
        }
    }, 300);
}

// ================================================================
// COMPARTIR PERFIL
// ================================================================
function compartirPerfil() {
    const nombre = document.getElementById('perfilNombre')?.textContent.replace('✦ VERIFICADO', '').trim().split(' ')[0] || 'Explorador';
    const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
    const url = window.location.origin + '/perfil/' + encodeURIComponent(handle);
    const texto = "◈ Perfil de " + nombre + " en Sariel's\n◈ " + url + "\n\n#Sariels #WEB3";
    if (navigator.share) {
        navigator.share({ title: 'Perfil de ' + nombre, text: texto, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto)
            .then(() => { showToast('◈ Copiado', 'success'); })
            .catch(() => { prompt('Copia:', url); });
    }
}

// ================================================================
// GENERAR QR DEL PERFIL
// ================================================================
async function generarQRPerfil() {
    try {
        const session = await getSession();
        if (!session) return;
        const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
        const url = window.location.origin + '/perfil/' + encodeURIComponent(handle);
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 9999;';
        modal.innerHTML = '<div style="background: var(--bg-card); border-radius: 20px; padding: 30px; text-align: center; max-width: 90vw;">'
            + '<h3 style="color: var(--gold); margin-bottom: 20px;">📱 Share QR</h3>'
            + '<img src="' + escaparHTML(qrUrl) + '" alt="QR" style="border-radius: 10px; max-width: 200px;">'
            + '<p style="color: var(--text-muted); margin-top: 15px; font-size: 12px; word-break: break-all;">' + escaparHTML(url) + '</p>'
            + '<button onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px; background: var(--gold); border: none; color: #fff; padding: 10px 30px; border-radius: 10px; cursor: pointer;">Cerrar</button></div>';
        document.body.appendChild(modal);
        aplicarI18NPerfil(modal);
    } catch (error) {
        showToast('❌ Error al generar QR', 'error');
    }
}

// ================================================================
// ABRIR SELECTOR DE ARCHIVO (avatar)
// ================================================================
function abrirSelectorArchivo() {
    const input = document.getElementById('fileInput');
    if (input) input.click();
}

// ================================================================
// AVATAR MENU (toggle)
// ================================================================
function toggleAvatarMenu(event) {
    if (event) event.stopPropagation();
    var menu = document.getElementById('avatarMenu');
    if (!menu) return;
    menu.classList.toggle('show');
}

function cerrarAvatarMenu() {
    var menu = document.getElementById('avatarMenu');
    if (menu) menu.classList.remove('show');
}

// ================================================================
// EXPANDIR AVATAR (lightbox)
// ================================================================
function expandirAvatar() {
    const avatarEl = document.getElementById('perfilAvatar');
    if (!avatarEl) return;
    const img = avatarEl.querySelector('img');
    if (!img || !img.src) return;
    abrirVisorImagen(img.src, 'Avatar', 'perfilAvatarModal');
}

function expandirFotoPublicacion(src) {
    abrirVisorImagen(src, 'Imagen', 'fotoPublicacionModal');
}

// ================================================================
// SUBIR FOTO DE PERFIL
// ================================================================
async function subirFoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('❌ Máximo 5 MB', 'error');
        event.target.value = '';
        return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        showToast('❌ Solo JPG/PNG/WEBP/GIF', 'error');
        event.target.value = '';
        return;
    }
    const fileExt = file.name.split('.').pop().toLowerCase();
    const filePath = session.user.id + '/avatar.' + fileExt;
    try {
        showToast('⏳ Subiendo foto...', '', 5000);
        const { error: uploadError } = await window.supabaseClient.storage
            .from('sariels-avatars')
            .upload(filePath, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = window.supabaseClient.storage
            .from('sariels-avatars')
            .getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl + '?t=' + Date.now();
        const { error: updateError } = await window.supabaseClient
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', session.user.id);
        if (updateError) throw updateError;
        showToast('✅ Foto actualizada', 'success');
        event.target.value = '';
        await cargarPerfil(true);
    } catch (error) {
        showToast('❌ Error al subir: ' + msgError(error), 'error');
    }
}

// ================================================================
// ELIMINAR FOTO DE PERFIL
// ================================================================
async function eliminarFotoPerfil() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión', 'error');
        return;
    }
    if (!confirm(t('perfil_confirma_eliminar_foto', '¿Eliminar foto de perfil?'))) return;
    try {
        showToast('⏳ Eliminando...', '', 4000);
        const extensiones = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        const paths = extensiones.map(ext => session.user.id + '/avatar.' + ext);
        try {
            await window.supabaseClient.storage.from('sariels-avatars').remove(paths);
        } catch (e) {}
        const { error } = await window.supabaseClient
            .from('usuarios')
            .update({ avatar_url: null })
            .eq('id', session.user.id);
        if (error) throw error;
        showToast('✅ Foto eliminada', 'success');
        await cargarPerfil(true);
    } catch (error) {
        showToast('❌ Error: ' + msgError(error), 'error');
    }
}

// ================================================================
// SUBIR VIDEO (para publicaciones)
// ================================================================
async function subirVideo(event) {
    const file = event.target.files[0];
    if (!file) return;
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión', 'error');
        return;
    }
    if (!file.type.startsWith('video/')) {
        showToast('❌ Solo videos', 'error');
        event.target.value = '';
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        showToast('❌ Máximo 50 MB', 'error');
        event.target.value = '';
        return;
    }
    try {
        showToast('⏳ Subiendo video...', '', 15000);
        const fileExt = file.name.split('.').pop().toLowerCase();
        const filePath = session.user.id + '/video_' + Date.now() + '.' + fileExt;
        const { error: uploadError } = await window.supabaseClient.storage
            .from('muro-videos')
            .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = window.supabaseClient.storage
            .from('muro-videos')
            .getPublicUrl(filePath);
        showToast('✅ Video subido', 'success');
        event.target.value = '';
        return urlData.publicUrl;
    } catch (error) {
        showToast('❌ Error: ' + msgError(error), 'error');
    }
}

// ================================================================
// CARGAR ORDENES DE INTERNET
// ================================================================
async function obtenerEstadisticas() {
    try {
        const session = await getSession();
        if (!session) return null;
        const { data, error } = await window.supabaseClient
            .from('estadisticas_usuarios')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    } catch (error) {
        return null;
    }
}

// ================================================================
// CERRAR SESIÓN
// ================================================================
async function cerrarSesion() {
    if (!confirm(t('perfil_cerrar_sesion', '¿Cerrar sesión?'))) return;
    try {
        await actualizarEstadoEnLinea(false);
    } catch (e) {}
    try {
        await window.supabaseClient.auth.signOut();
    } catch (error) {
        showToast('❌ Error al cerrar sesión', 'error');
        return;
    }
    window.location.replace('/');
}

// ================================================================
// IR AL MURO
// ================================================================
function irAMuro() {
    window.location.href = '/features/muro/muro.html';
}