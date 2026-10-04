// ================================================================
// MENSAJES · AUTENTICACIÓN Y PERFIL
// ================================================================
async function session() {
    if (!db) return null;
    var r = await db.auth.getSession();
    if (r.error) throw r.error;
    return r.data.session;
}

async function auth() {
    try {
        var s = await session();
        if (!s) { toast('⚠️ Inicia sesión para usar Mensajes', 'error'); return false; }
        user = s.user;
        return true;
    } catch (e) { console.warn('Error auth:', e); return false; }
}

async function profile(id) {
    if (id === BOT_ID) return { id: BOT_ID, nombre: "Marquinhos", handle: 'marquinhos', avatar_url: null, online: true, bot: true };
    try {
        var r = await db.from('perfiles_publicos').select('id,nombre,handle,avatar_url,online,ultima_conexion').eq('id', id).maybeSingle();
        return r.data || { id: id, nombre: 'Usuario', avatar_url: null, online: false };
    } catch (e) { return { id: id, nombre: 'Usuario', avatar_url: null, online: false }; }
}

async function cargarFotoHeader() {
    if (!user || !user.id) return;
    try {
        var result = await db.from('usuarios').select('avatar_url, nombre, handle').eq('id', user.id).maybeSingle();
        if (result.error) { console.warn('No se pudo cargar perfil:', result.error.message); return; }
        currentUserProfile = result.data;
        var headerAvatar = $('headerAvatar');
        if (headerAvatar) {
            if (result.data && result.data.avatar_url) headerAvatar.innerHTML = '<img src="' + esc(result.data.avatar_url) + '" alt="Mi foto">';
            else headerAvatar.innerHTML = esc((result.data && (result.data.nombre || result.data.handle) || '◈').charAt(0).toUpperCase());
        }
        var modalAvatar = $('profileModalAvatar');
        if (modalAvatar) modalAvatar.innerHTML = (result.data && result.data.avatar_url) ? '<img src="' + esc(result.data.avatar_url) + '" alt="Mi foto">' : esc((result.data && (result.data.nombre || result.data.handle) || '◈').charAt(0).toUpperCase());
        var modalName = $('profileModalName');
        if (modalName) modalName.textContent = (result.data && result.data.nombre) || 'Mi Perfil';
        var modalHandle = $('profileModalHandle');
        if (modalHandle) modalHandle.textContent = '@' + ((result.data && result.data.handle) || 'usuario');
    } catch (e) { console.warn('Error cargando foto del header:', e); }
}

function abrirProfileModal() { var el = $('profileModal'); if (el) el.classList.add('show'); }
function cerrarProfileModal() { var el = $('profileModal'); if (el) el.classList.remove('show'); }

async function subirFotoHeader(event) {
    var file = event.target.files[0];
    if (!file) return;
    if (!await auth()) return;
    if (file.size > 5 * 1024 * 1024) { toast('❌ La imagen no puede superar los 5 MB', 'error'); event.target.value = ''; return; }
    if (!file.type.startsWith('image/')) { toast('❌ Solo se permiten imágenes', 'error'); event.target.value = ''; return; }
    var fileExt = file.name.split('.').pop().toLowerCase();
    var filePath = user.id + '/avatar.' + fileExt;
    try {
        toast('⏳ Subiendo foto...', '', 5000);
        var uploadResult = await db.storage.from('sariels-avatars').upload(filePath, file, { upsert: true, contentType: file.type });
        if (uploadResult.error) throw uploadResult.error;
        var urlData = db.storage.from('sariels-avatars').getPublicUrl(filePath);
        var publicUrl = urlData.data.publicUrl + '?t=' + Date.now();
        var updateResult = await db.from('usuarios').update({ avatar_url: publicUrl }).eq('id', user.id);
        if (updateResult.error) throw updateResult.error;
        toast('✅ Foto actualizada correctamente', 'success');
        event.target.value = '';
        await cargarFotoHeader();
    } catch (error) { console.error('Error al subir foto:', error); toast('❌ Error al subir foto: ' + error.message, 'error'); }
}

function verFotoAmpliada(url, nombre, handle) {
    if (!url) { toast('ℹ️ Este usuario no tiene foto de perfil', 'warning'); return; }
    var img = $('pvImage'); if (img) img.src = url;
    var nameEl = $('pvName'); if (nameEl) nameEl.textContent = nombre || 'Usuario';
    var handleEl = $('pvHandle'); if (handleEl) handleEl.textContent = handle ? '@' + handle : '';
    var viewer = $('photoViewer'); if (viewer) viewer.classList.add('show');
}
function cerrarPhotoViewer() { var el = $('photoViewer'); if (el) el.classList.remove('show'); }
console.log('[Mensajes] ✅ Auth cargado');