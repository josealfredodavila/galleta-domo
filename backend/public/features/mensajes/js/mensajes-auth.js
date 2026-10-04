// ================================================================
// MENSAJES · AUTENTICACIÓN
// ================================================================
// Inicialización de Supabase, sesión, perfil de usuario.
// Depende de: mensajes-config.js, mensajes-utils.js
// ================================================================

// ================================================================
// INICIALIZAR SUPABASE (idempotente)
// ================================================================
function inicializarSupabase() {
    // Si ya existe, reutilizarlo
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
        db = window.supabaseClient;
        return db;
    }

    // Verificar SDK
    var SDK = window.supabase;
    if (!SDK || typeof SDK.createClient !== 'function') {
        console.error('[Auth] Supabase SDK no disponible');
        return null;
    }

    // Crear cliente
    try {
        db = SDK.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
        console.log('[Auth] ✅ Supabase Client inicializado');
        return db;
    } catch (e) {
        console.error('[Auth] ❌ Error inicializando Supabase:', e);
        return null;
    }
}

// ================================================================
// OBTENER SESIÓN ACTUAL
// ================================================================
async function session() {
    if (!db) {
        db = inicializarSupabase();
        if (!db) return null;
    }
    try {
        var r = await db.auth.getSession();
        if (r.error) throw r.error;
        return r.data.session;
    } catch (e) {
        console.warn('[Auth] Error obteniendo sesión:', e);
        return null;
    }
}

// ================================================================
// ESPERAR SESIÓN (con timeout)
// ================================================================
async function esperarSesion(maxMs) {
    maxMs = maxMs || 2000;
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
        // Asegurar que db exista
        if (!db) {
            db = inicializarSupabase();
            if (!db) {
                console.warn('[Auth] No hay db');
                return false;
            }
        }

        // Si ya tenemos user, devolver true (optimización)
        if (user && user.id) return true;

        // Consultar sesión
        var s = await session();
        if (!s || !s.user) {
            console.warn('[Auth] No hay sesión activa');
            return false;
        }

        user = s.user;
        console.log('[Auth] ✅ Usuario autenticado:', user.id);
        return true;
    } catch (e) {
        console.error('[Auth] Error en auth():', e);
        return false;
    }
}

// ================================================================
// PERFIL DE USUARIO
// ================================================================
async function profile(id) {
    if (!id) return { id: null, nombre: 'Usuario', avatar_url: null, online: false };

    // Si es el bot
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
            .select('id,nombre,handle,avatar_url,online,ultima_conexion')
            .eq('id', id)
            .maybeSingle();

        return r.data || { id: id, nombre: 'Usuario', avatar_url: null, online: false };
    } catch (e) {
        console.warn('[Auth] Error profile():', e);
        return { id: id, nombre: 'Usuario', avatar_url: null, online: false };
    }
}

// ================================================================
// CARGAR FOTO DEL HEADER
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
            console.warn('[Auth] No se pudo cargar perfil:', result.error.message);
            return;
        }

        currentUserProfile = result.data;

        // Header avatar
        var headerAvatar = $('headerAvatar');
        if (headerAvatar) {
            if (result.data && result.data.avatar_url) {
                headerAvatar.innerHTML = '<img src="' + esc(result.data.avatar_url) + '" alt="Mi foto">';
            } else {
                var inicial = ((result.data && (result.data.nombre || result.data.handle)) || '◈').charAt(0).toUpperCase();
                headerAvatar.innerHTML = esc(inicial);
            }
        }

        // Modal avatar
        var modalAvatar = $('profileModalAvatar');
        if (modalAvatar) {
            modalAvatar.innerHTML = (result.data && result.data.avatar_url)
                ? '<img src="' + esc(result.data.avatar_url) + '" alt="Mi foto">'
                : esc(((result.data && (result.data.nombre || result.data.handle)) || '◈').charAt(0).toUpperCase());
        }

        // Modal nombre
        var modalName = $('profileModalName');
        if (modalName) modalName.textContent = (result.data && result.data.nombre) || 'Mi Perfil';

        // Modal handle
        var modalHandle = $('profileModalHandle');
        if (modalHandle) modalHandle.textContent = '@' + ((result.data && result.data.handle) || 'usuario');

    } catch (e) {
        console.warn('[Auth] Error cargando foto del header:', e);
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
    var file = event.target.files[0];
    if (!file) return;
    if (!await auth()) return;

    if (file.size > 5 * 1024 * 1024) {
        toast('La imagen no puede superar 5 MB', 'error');
        event.target.value = '';
        return;
    }
    if (!file.type.startsWith('image/')) {
        toast('Solo se permiten imágenes', 'error');
        event.target.value = '';
        return;
    }

    var fileExt = file.name.split('.').pop().toLowerCase();
    var filePath = user.id + '/avatar.' + fileExt;

    try {
        toast('Subiendo foto...', '', 5000);

        var uploadResult = await db.storage
            .from('sariels-avatars')
            .upload(filePath, file, { upsert: true, contentType: file.type });

        if (uploadResult.error) throw uploadResult.error;

        var urlData = db.storage.from('sariels-avatars').getPublicUrl(filePath);
        var publicUrl = urlData.data.publicUrl + '?t=' + Date.now();

        var updateResult = await db
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', user.id);

        if (updateResult.error) throw updateResult.error;

        toast('Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarFotoHeader();
    } catch (error) {
        console.error('[Auth] Error al subir foto:', error);
        toast('Error al subir foto: ' + error.message, 'error');
    }
}

// ================================================================
// VISOR DE FOTO AMPLIADA
// ================================================================
function verFotoAmpliada(url, nombre, handle) {
    if (!url) {
        toast('Este usuario no tiene foto de perfil', 'warning');
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

console.log('[Mensajes] ✅ Auth cargado');