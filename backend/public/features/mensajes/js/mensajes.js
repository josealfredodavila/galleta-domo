// ================================================================
// FOTO DEL HEADER
// ================================================================
async function cargarFotoHeader() {
    if (!user || !user.id) return;
    try {
        const { data, error } = await db
            .from('usuarios')
            .select('avatar_url, nombre, handle')
            .eq('id', user.id)
            .maybeSingle();
        if (error) {
            console.warn('No se pudo cargar perfil:', error.message);
            return;
        }
        currentUserProfile = data;
        const headerAvatar = $('headerAvatar');
        if (data?.avatar_url) {
            headerAvatar.innerHTML = `<img src="${esc(data.avatar_url)}" alt="Mi foto">`;
        } else {
            const inicial = (data?.nombre || data?.handle || '◈').charAt(0).toUpperCase();
            headerAvatar.innerHTML = esc(inicial);
        }
        $('profileModalAvatar').innerHTML = data?.avatar_url
            ? `<img src="${esc(data.avatar_url)}" alt="Mi foto">`
            : esc((data?.nombre || data?.handle || '◈').charAt(0).toUpperCase());
        $('profileModalName').textContent = data?.nombre || 'Mi Perfil';
        $('profileModalHandle').textContent = '@' + (data?.handle || 'usuario');
    } catch (e) {
        console.warn('Error cargando foto del header:', e);
    }
}