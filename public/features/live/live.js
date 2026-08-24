/* ================================================================
   MURO ULTRA MEGA PRO - SARIEL'S
   Corregido: Likes interactivos, Realtime sin duplicados, .count()
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE
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
// CARGAR PUBLICACIONES (CORRECCIÓN DEL .count())
// ================================================================
async function cargarPublicaciones() {
    try {
        const { data, error } = await supabase
            .from('muro_posts')
            .select('*, usuarios(nombre, avatar_url), muro_likes(id), muro_comentarios(id)')
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
// RENDERIZAR PUBLICACIONES (CON BOTÓN DE LIKE INTERACTIVO)
// ================================================================
function renderizarPublicaciones(posts) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    feedContainer.innerHTML = posts.map(post => {
        const avatar = post.usuarios?.avatar_url ? `<img src="${post.usuarios.avatar_url}">` : '◈';
        const likes = post.muro_likes?.length || 0;
        const comentarios = post.muro_comentarios?.length || 0;
        const imagen = post.imagen_url ? `<img src="${post.imagen_url}" style="width:100%; border-radius:12px; margin-top:12px;" />` : '';

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">${avatar}</div>
                    <div>
                        <div class="post-author">${post.usuarios?.nombre || 'Explorador'} <span class="badge-verificado">✦ Verificado</span></div>
                        <div class="post-date">${new Date(post.created_at).toLocaleString()}</div>
                    </div>
                </div>
                <div class="post-content">${post.contenido || ''}</div>
                ${imagen}
                <div class="post-stats">
                    <span onclick="likePublicacion('${post.id}')" style="cursor:pointer;" class="like-btn">❤️ <span class="count">${likes}</span></span>
                    <span>💬 <span class="count">${comentarios}</span></span>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// DAR LIKE CON MANEJO DE ERROR (DUPLICADO)
// ================================================================
async function likePublicacion(postId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para dar like', 'error');
            return;
        }

        // Intentar insertar like
        const { error } = await supabase
            .from('muro_likes')
            .insert({
                post_id: postId,
                usuario_id: session.user.id
            });

        if (error) {
            // Manejo del error 23505 (duplicate key value)
            if (error.code === '23505') {
                showToast('⚠️ Ya diste like a este post', 'warning');
                return;
            }
            throw error;
        }

        showToast('❤️ Like dado');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al dar like:', error);
        showToast('❌ Error al dar like', 'error');
    }
}

// ================================================================
// SUBIR IMAGEN AL MURO (CON LIMPIEZA DEL INPUT)
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
        
        // ✅ LIMPIEZA DEL INPUT (para no fallar al subir la misma foto)
        event.target.value = '';
        
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al subir imagen:', error);
        showToast('❌ Error al subir imagen', 'error');
    }
}

// ================================================================
// SUSCRIBIRSE A REALTIME (EVITANDO DUPLICADOS)
// ================================================================
async function suscribirseARealtime() {
    const channel = supabase
        .channel('muro-realtime')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_posts' },
            (payload) => {
                // Validar si ya existe en el DOM
                const existingPost = document.querySelector(`[data-post-id="${payload.new.id}"]`);
                if (!existingPost) {
                    agregarPostRealtime(payload.new);
                }
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
// AGREGAR POST EN TIEMPO REAL (SIN DUPLICAR)
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
        <div class="post-card" data-post-id="${post.id}">
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
        
        // ⚠️ NO llamamos a cargarPublicaciones() aquí, 
        // dejamos que Realtime lo agregue automáticamente.
        
    } catch (error) {
        console.error('Error al publicar:', error);
        showToast('❌ Error al publicar', 'error');
    } finally {
        btnPublicar.disabled = false;
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