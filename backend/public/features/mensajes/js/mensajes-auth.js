// ================================================================
// MENSAJES · AUTH
// ================================================================
// Sesión, autenticación, perfil, avatar del header y visor de foto.
// Se carga DESPUÉS de mensajes-config.js y mensajes-utils.js.
//
// FUENTE DE VERDAD: monolítico mensajes.html original.
// COMPATIBLE CON: tabla usuarios, perfiles_publicos, bucket sariels-avatars.
// ================================================================

'use strict';

// ================================================================
// SESIÓN
// ================================================================
async function session() {
    if (!db) {
        console.warn('[Mensajes/Auth] db no disponible');
        return null;
    }
    try {
        var r = await db.auth.getSession();
        if (r.error) throw r.error;
        return r.data.session;
    } catch (e) {
        console.warn('[Mensajes/Auth] Error obteniendo sesión:', e);
        return null;
    }
}

// ================================================================
// ESPERAR SESIÓN (con timeout)
// ================================================================
async function esperarSesion(maxMs) {
    maxMs = maxMs || 3000;
    var inicio = Date.now();
    while (Date.now() - inicio < maxMs) {
        var s = await session();
        if (s && s.user) return s;
        await new Promise(function(r) { setTimeout(r, 100); });
    }
    return await session();
}

// ================================================================
// VERIFICAR AUTENTICACIÓN
// ================================================================
async function auth() {
    try {
        // Optimización: si ya tenemos user, devolver true
        if (user && user.id) return true;

        // Si no hay db, intentar inicializar desde config
        if (!db) {
            if (window.supabaseClient) {
                db = window.supabaseClient;
            } else if (window.supabase && window.supabase.createClient) {
                db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                });
                window.supabaseClient = db;
            } else {
                console.warn('[Mensajes/Auth] No hay cliente Supabase');
                return false;
            }
        }

        var s = await session();
        if (!s || !s.user) {
            console.warn('[Mensajes/Auth] No hay sesión activa');
            return false;
        }

        user = s.user;
        if (window.DEBUG_CHAT) {
            console.log('[Mensajes/Auth] ✅ Usuario autenticado:', user.id);
        }
        return true;
    } catch (e) {
        console.error('[Mensajes/Auth] Error en auth():', e);
        return false;
    }
}

// ================================================================
// PERFIL DE USUARIO
// ================================================================
async function profile(id) {
    if (!id) {
        return { id: null, nombre: 'Usuario', avatar_url: null, online: false };
    }

    // Si es el bot
    if (id === BOT_ID || id === BOT_UUID) {
        return {
            id: BOT_ID,
            nombre: BOT_NOMBRE,
            handle: 'marquinhos',
            avatar_url: null,
            online: true,
            bot: true
        };
    }

    try {
        var r = await db
            .from('perfiles_publicos')
            .select('id,nombre,handle,avatar_url,online,ultima_conexion,verificado')
            .eq('id', id)
            .maybeSingle();

        if (r.error) {
            console.warn('[Mensajes/Auth] Error profile():', r.error);
            return { id: id, nombre: 'Usuario', avatar_url: null, online: false };
        }

        if (!r.data) {
            return { id: id, nombre: 'Usuario', avatar_url: null, online: false };
        }

        return r.data;
    } catch (e) {
        console.warn('[Mensajes/Auth] Excepción profile():', e);
        return { id: id, nombre: 'Usuario', avatar_url: null, online: false };
    }
}

// ================================================================
// CARGAR FOTO DEL HEADER + PERFIL MODAL
// ================================================================
async function cargarFotoHeader() {
    if (!user || !user.id) return;

    try {
        var result = await db
            .from('usuarios')
            .select('avatar_url, nombre, handle')
            .eq('id', user.id)
            .maybeSingle();

        if (result.error) {
            console.warn('[Mensajes/Auth] No se pudo cargar perfil:', result.error.message);
            return;
        }

        currentUserProfile = result.data || null;

        var nombre = (currentUserProfile && currentUserProfile.nombre) || 'Usuario';
        var handle = (currentUserProfile && currentUserProfile.handle) || 'usuario';
        var avatarUrl = (currentUserProfile && currentUserProfile.avatar_url) || null;

        // Header avatar
        var headerAvatar = $('headerAvatar');
        if (headerAvatar) {
            if (avatarUrl) {
                headerAvatar.innerHTML = '<img src="' + esc(avatarUrl) + '" alt="Mi foto">';
            } else {
                var inicial = nombre.charAt(0).toUpperCase();
                headerAvatar.innerHTML = esc(inicial);
            }
        }

        // Modal avatar
        var modalAvatar = $('profileModalAvatar');
        if (modalAvatar) {
            if (avatarUrl) {
                modalAvatar.innerHTML = '<img src="' + esc(avatarUrl) + '" alt="Mi foto">';
            } else {
                modalAvatar.innerHTML = esc(nombre.charAt(0).toUpperCase());
            }
        }

        // Modal nombre
        var modalName = $('profileModalName');
        if (modalName) modalName.textContent = nombre;

        // Modal handle
        var modalHandle = $('profileModalHandle');
        if (modalHandle) modalHandle.textContent = '@' + handle;

    } catch (e) {
        console.warn('[Mensajes/Auth] Error cargando foto del header:', e);
    }
}

// ================================================================
// MODAL DE PERFIL
// ================================================================
function abrirProfileModal() {
    var el = $('profileModal');
    if (el) el.classList.add('show');
}

function cerrarProfileModal() {
    var el = $('profileModal');
    if (el) el.classList.remove('show');
}

// ================================================================
// SUBIR FOTO DEL HEADER
// ================================================================
async function subirFotoHeader(event) {
    var file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;

    if (!await auth()) return;

    if (file.size > MAX_IMAGE_SIZE) {
        toast('❌ La imagen no puede superar los 5 MB', 'error');
        event.target.value = '';
        return;
    }

    if (!file.type.startsWith('image/')) {
        toast('❌ Solo se permiten imágenes', 'error');
        event.target.value = '';
        return;
    }

    var fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    var filePath = user.id + '/avatar.' + fileExt;

    try {
        toast('⏳ Subiendo foto...', '', 5000);

        var uploadResult = await db.storage
            .from(AVATARS_BUCKET)
            .upload(filePath, file, {
                upsert: true,
                contentType: file.type,
                cacheControl: '3600'
            });

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
        console.error('[Mensajes/Auth] Error al subir foto:', error);
        toast('❌ Error al subir foto: ' + (error.message || 'desconocido'), 'error');
    }
}

// ================================================================
// VISOR DE FOTO AMPLIADA
// ================================================================
function verFotoAmpliada(url, nombre, handle) {
    if (!url || !urlSegura(url)) {
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
    var el = $('photoViewer');
    if (el) el.classList.remove('show');
}

// ================================================================
// SIGNOUT (por si se usa desde algún botón)
// ================================================================
async function cerrarSesion() {
    try {
        if (db && db.auth) {
            await db.auth.signOut();
        }
        window.location.href = '/';
    } catch (e) {
        console.error('[Mensajes/Auth] Error cerrando sesión:', e);
        toast('❌ Error al cerrar sesión', 'error');
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.session = session;
window.esperarSesion = esperarSesion;
window.auth = auth;
window.profile = profile;
window.cargarFotoHeader = cargarFotoHeader;
window.abrirProfileModal = abrirProfileModal;
window.cerrarProfileModal = cerrarProfileModal;
window.subirFotoHeader = subirFotoHeader;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarPhotoViewer = cerrarPhotoViewer;
window.cerrarSesion = cerrarSesion;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Auth] ✅ Auth cargado');
}