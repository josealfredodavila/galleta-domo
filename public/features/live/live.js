/* ================================================================
   MURO ULTRA MEGA PRO - SARIEL'S
   Con Supabase Realtime + Subida de Fotos
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (El mismo de app.js)
// ================================================================
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

// ================================================================
// TOAST
// ================================================================
function showToast(msg, type = '') {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show';
    if (type === 'error') t.classList.add('error');
    else if (type === 'warning') t.classList.add('warning');
    else t.classList.remove('error', 'warning');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// CARGAR PUBLICACIONES (Para el estado inicial)
// ================================================================
async function cargarPublicaciones() {
    try {
        const { data, error } = await supabase
            .from('muro_posts')
            .select('*, usuarios(nombre, avatar_url), muro_likes(count), muro_comentarios(count)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            renderizarPublicaciones(data);
        } else {
            const feedContainer = document.getElementById('feedContainer');
            if (feedContainer) {
                feedContainer.innerHTML = `
                    <div class="empty-state">
                        <span class="icon">◈</span>
                        <h3>Sin publicaciones</h3>
                        <p>Sé el primero en compartir algo.</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error cargando publicaciones desde Supabase:', error);
        showToast('❌ Error al cargar publicaciones', 'error');
    }
}

// ================================================================
// SUSCRIBIRSE A REALTIME
// ================================================================
async function suscribirseARealtime() {
    const channel = supabase
        .channel('muro-realtime')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_posts' },
            (payload) => {
                // Agregar la publicación nueva al DOM sin recargar
                agregarPostRealtime(payload.new);
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'muro_posts' },
            () => cargarPublicaciones()
        )
        .subscribe();

    return channel;
}

// ================================================================
// AGREGAR POST EN TIEMPO REAL
// ================================================================
async function agregarPostRealtime(post) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    // Obtener usuario
    const { data: userData } = await supabase
        .from('usuarios')
        .select('nombre, avatar_url')
        .eq('id', post.usuario_id)
        .single();

    const avatar = userData?.avatar_url ? `<img src="${userData.avatar_url}">` : '◈';
    const nombre = userData?.nombre || 'Explorador';

    const newPost = `
        <div class="post-card">
            <div class="post-header">
                <div class="post-avatar">${avatar}</div>
                <div>
                    <div class="post-author">${nombre} <span class="badge-verificado">✦ Verificado</span></div>
                    <div class="post-date">${new Date(post.created_at).toLocaleString()}</div>
                </div>
            </div>
            <div class="post-content">${post.contenido || ''}</div>
            ${post.imagen_url ? `<img src="${post.imagen_url}" style="width:100%; border-radius:12px; margin-top:12px;" />` : ''}
        </div>
    `;

    feedContainer.insertAdjacentHTML('afterbegin', newPost);
}

// ================================================================
// RENDERIZAR PUBLICACIONES (Para el estado inicial)
// ================================================================
function renderizarPublicaciones(posts) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    feedContainer.innerHTML = posts.map(post => {
        const avatar = post.usuarios?.avatar_url ? `<img src="${post.usuarios.avatar_url}">` : '◈';
        const likes = post.muro_likes?.length || 0;
        const comentarios = post.muro_comentarios?.length || 0;

        return `
            <div class="post-card">
                <div class="post-header">
                    <div class="post-avatar">${avatar}</div>
                    <div>
                        <div class="post-author">${post.usuarios?.nombre || 'Explorador'} <span class="badge-verificado">✦ Verificado</span></div>
                        <div class="post-date">${new Date(post.created_at).toLocaleString()}</div>
                    </div>
                </div>
                <div class="post-content">${post.contenido || ''}</div>
                ${post.imagen_url ? `<img src="${post.imagen_url}" style="width:100%; border-radius:12px; margin-top:12px;" />` : ''}
                <div class="post-stats">
                    <span>❤️ ${likes}</span>
                    <span>💬 ${comentarios}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// PUBLICAR NUEVA PUBLICACIÓN
// ================================================================
async function publicar() {
    const postContent = document.getElementById('postContent');
    const btnPublicar = document.getElementById('btnPublicar');
    const contenido = postContent ? postContent.value.trim() : '';

    if (!contenido) {
        showToast('⚠️ Escribe algo para publicar', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para publicar', 'error');
            return;
        }

        btnPublicar.disabled = true;

        const { error } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: session.user.id,
                contenido: contenido
            });

        if (error) throw error;

        postContent.value = '';
        showToast('✅ Publicación creada');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al publicar:', error);
        showToast('❌ Error al publicar', 'error');
    } finally {
        btnPublicar.disabled = false;
    }
}

// ================================================================
// SUBIR IMAGEN AL MURO
// ================================================================
async function subirImagenMuro(event) {
    const file = event.target.files[0];
    if (!file) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para subir imagen', 'error');
        return;
    }

    // ✅ Regla correcta de AMI: `${user.id}/${Date.now()}.${fileExt}`
    const fileExt = file.name.split('.').pop().toLowerCase();
    const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

    try {
        showToast('⏳ Subiendo imagen...');

        const { error: uploadError } = await supabase.storage
            .from('muro-imagenes')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('muro-imagenes')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // Guardar como publicación de imagen
        const { error: insertError } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: session.user.id,
                contenido: '',
                imagen_url: publicUrl
            });

        if (insertError) throw insertError;

        showToast('✅ Imagen subida correctamente');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al subir imagen:', error);
        showToast('❌ Error al subir imagen', 'error');
    }
}

// ================================================================
// DAR LIKE
// ================================================================
async function likePublicacion(postId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para dar like', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_likes')
            .insert({
                post_id: postId,
                usuario_id: session.user.id
            });

        if (error) throw error;

        showToast('❤️ Like dado');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al dar like:', error);
        showToast('❌ Error al dar like', 'error');
    }
}

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para ver y publicar', 'warning');
    }

    cargarPublicaciones();
    suscribirseARealtime();

    const btnPublicar = document.getElementById('btnPublicar');
    if (btnPublicar) {
        btnPublicar.addEventListener('click', publicar);
    }
});

// ================================================================
// EXPONER FUNCIONES
// ================================================================
window.publicar = publicar;
window.cargarPublicaciones = cargarPublicaciones;
window.likePublicacion = likePublicacion;
window.subirImagenMuro = subirImagenMuro;
window.showToast = showToast;