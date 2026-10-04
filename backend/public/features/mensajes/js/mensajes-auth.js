// ================================================================
// MENSAJES · AUTH
// ================================================================
// Cliente Supabase, sesión, y utilidades de autenticación.
// CRÍTICO: usa el cliente GLOBAL si ya existe (comparte sesión
// con Perfil/Contactos/Grupos).
// ================================================================

// ================================================================
// INICIALIZAR CLIENTE SUPABASE
// ================================================================
function inicializarSupabase() {
    // ✅ Si ya existe un cliente global (compartido con Perfil, Contactos, Grupos)
    //    lo reutilizamos → así vemos la sesión activa
    if (window.supabaseClient) {
        db = window.supabaseClient;
        console.log('[Mensajes] ✅ Cliente Supabase GLOBAL reutilizado (con sesión compartida)');
        return db;
    }

    // ⚠️ Si no existe, creamos uno nuevo Y lo exponemos globalmente
    if (!window.supabase || !window.supabase.createClient) {
        console.error('[Mensajes] ❌ SDK de Supabase no está cargado');
        return null;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        },
        realtime: {
            params: { eventsPerSecond: 10 }
        }
    });
    window.supabaseClient = db;
    console.log('[Mensajes] ✅ Cliente Supabase CREADO (fallback, sin sesión previa)');
    return db;
}

// ================================================================
// OBTENER SESIÓN ACTUAL
// ================================================================
async function session() {
    if (!db) return null;
    try {
        var r = await db.auth.getSession();
        if (r.error) throw r.error;
        return r.data.session;
    } catch (e) {
        console.warn('[Mensajes] Error obteniendo sesión:', e);
        return null;
    }
}

// ================================================================
// ESPERAR SESIÓN (con fallback a onAuthStateChange)
// ================================================================
// Intenta obtener la sesión inmediatamente. Si no hay, espera
// hasta 2s a que Supabase restaure la sesión del localStorage.
async function esperarSesion() {
    // 1er intento: directo
    var s = await session();
    if (s && s.user) return s;

    // 2do intento: esperar el primer evento de auth
    return await new Promise(function(resolve) {
        var resuelto = false;
        var timeout = setTimeout(function() {
            if (!resuelto) { resuelto = true; resolve(null); }
        }, 2000);

        var sub = db.auth.onAuthStateChange(function(event, sess) {
            if (resuelto) return;
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                resuelto = true;
                clearTimeout(timeout);
                try { sub.data.subscription.unsubscribe(); } catch (e) {}
                resolve(sess);
            }
        });
    });
}

// ================================================================
// AUTH — verifica sesión activa, muestra toast si no
// ================================================================
async function auth() {
    if (!db) {
        toast('⚠️ No hay conexión con el servidor', 'error');
        return false;
    }

    var s = await session();
    if (!s || !s.user) {
        toast('⚠️ Inicia sesión para usar Mensajes', 'error');
        return false;
    }

    user = s.user;
    return true;
}

// ================================================================
// CARGAR FOTO DEL HEADER + PERFIL DEL USUARIO
// ================================================================
async function cargarFotoHeader() {
    if (!user || !user.id) return;

    try {
        var r = await db
            .from('usuarios')
            .select('avatar_url, nombre, handle')
            .eq('id', user.id)
            .maybeSingle();

        if (r.error) {
            console.warn('[Mensajes] No se pudo cargar perfil:', r.error.message);
            return;
        }

        currentUserProfile = r.data;

        var headerAvatar = $('headerAvatar');
        if (headerAvatar) {
            if (r.data && r.data.avatar_url) {
                headerAvatar.innerHTML = '<img src="' + esc(r.data.avatar_url) + '" alt="Mi foto">';
            } else {
                var inicial = ((r.data && r.data.nombre) || (r.data && r.data.handle) || '◈').charAt(0).toUpperCase();
                headerAvatar.innerHTML = esc(inicial);
            }
        }

        var profileModalAvatar = $('profileModalAvatar');
        if (profileModalAvatar) {
            if (r.data && r.data.avatar_url) {
                profileModalAvatar.innerHTML = '<img src="' + esc(r.data.avatar_url) + '" alt="Mi foto">';
            } else {
                var inicial2 = ((r.data && r.data.nombre) || (r.data && r.data.handle) || '◈').charAt(0).toUpperCase();
                profileModalAvatar.innerHTML = esc(inicial2);
            }
        }

        var profileModalName = $('profileModalName');
        if (profileModalName) {
            profileModalName.textContent = (r.data && r.data.nombre) || 'Mi Perfil';
        }

        var profileModalHandle = $('profileModalHandle');
        if (profileModalHandle) {
            profileModalHandle.textContent = '@' + ((r.data && r.data.handle) || 'usuario');
        }
    } catch (e) {
        console.warn('[Mensajes] Error cargando foto del header:', e);
    }
}

// ================================================================
// ABRIR / CERRAR MODAL PERFIL
// ================================================================
function abrirProfileModal() {
    var m = $('profileModal');
    if (m) m.classList.add('show');
}

function cerrarProfileModal() {
    var m = $('profileModal');
    if (m) m.classList.remove('show');
}

// ================================================================
// SUBIR FOTO DE PERFIL
// ================================================================
async function subirFotoHeader(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (!await auth()) return;

    if (file.size > MAX_IMAGE_SIZE) {
        toast('❌ La imagen no puede superar los 5 MB', 'error');
        event.target.value = '';
        return;
    }
    if (file.type.indexOf('image/') !== 0) {
        toast('❌ Solo se permiten imágenes', 'error');
        event.target.value = '';
        return;
    }

    var fileExt = file.name.split('.').pop().toLowerCase();
    var filePath = user.id + '/avatar.' + fileExt;

    try {
        toast('⏳ Subiendo foto...');

        var uploadResult = await db.storage
            .from(AVATARS_BUCKET)
            .upload(filePath, file, { upsert: true, contentType: file.type });

        if (uploadResult.error) throw uploadResult.error;

        var urlData = db.storage.from(AVATARS_BUCKET).getPublicUrl(filePath);
        var publicUrl = urlData.data.publicUrl + '?t=' + Date.now();

        var updateResult = await db
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', user.id);

        if (updateResult.error) throw updateResult.error;

        toast('✅ Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarFotoHeader();
    } catch (error) {
        console.error('[Mensajes] Error al subir foto:', error);
        toast('❌ Error al subir foto: ' + error.message, 'error');
    }
}

// ================================================================
// VER FOTO AMPLIADA
// ================================================================
function verFotoAmpliada(url, nombre, handle) {
    if (!url) {
        toast('ℹ️ Este usuario no tiene foto de perfil', 'warning');
        return;
    }

    var img = $('pvImage');
    if (img) img.src = url;

    var nameEl = $('pvName');
    if (nameEl) nameEl.textContent = nombre || 'Usuario';

    var handleEl = $('pvHandle');
    if (handleEl) handleEl.textContent = handle ? '@' + handle : '';

    var viewer = $('photoViewer');
    if (viewer) viewer.classList.add('show');
}

function cerrarPhotoViewer() {
    var viewer = $('photoViewer');
    if (viewer) viewer.classList.remove('show');
}

// ================================================================
// PERFIL PÚBLICO DE UN USUARIO
// ================================================================
async function profile(id) {
    if (id === BOT_ID) {
        return {
            id: BOT_ID,
            nombre: 'Marquinhos',
            handle: 'marquinhos',
            avatar_url: null,
            online: true,
            bot: true
        };
    }

    try {
        var r = await db
            .from('perfiles_publicos')
            .select('id, nombre, handle, avatar_url, online, ultima_conexion')
            .eq('id', id)
            .maybeSingle();

        return r.data || {
            id: id,
            nombre: 'Usuario',
            avatar_url: null,
            online: false
        };
    } catch (e) {
        return {
            id: id,
            nombre: 'Usuario',
            avatar_url: null,
            online: false
        };
    }
}

console.log('[Mensajes] ✅ Auth cargado');