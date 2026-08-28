/* ================================================================
   MURO ULTRA MEGA PRO - SARIEL'S
   CON COMENTARIOS FUNCIONALES (Supabase + Realtime)
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (CON NUEVAS LLAVES)
// ================================================================
const supabase = window.supabase.createClient(
    'https://zultnlogdoajehbswlih.supabase.co',
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
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
// CARGAR PUBLICACIONES (Con likes y comentarios)
// ================================================================
async function cargarPublicaciones() {
    try {
        const { data, error } = await supabase
            .from('muro_posts')
            .select('*, usuarios(nombre, avatar_url), muro_likes(id), muro_comentarios(id, contenido, usuario_id, usuarios(nombre))')
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
// RENDERIZAR PUBLICACIONES (Con Comentarios y Likes)
// ================================================================
function renderizarPublicaciones(posts) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    feedContainer.innerHTML = posts.map(post => {
        const avatar = post.usuarios?.avatar_url ? `<img src="${post.usuarios.avatar_url}">` : '◈';
        const likes = post.muro_likes?.length || 0;
        const comentarios = post.muro_comentarios || [];
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
                    <span style="cursor:pointer;" onclick="toggleComentariosPost('${post.id}')">💬 <span class="count">${comentarios.length}</span></span>
                </div>
                <div class="post-comentarios" id="comentarios-post-${post.id}" style="display:none;">
                    ${comentarios.map(c => `
                        <div class="comentario">
                            <div class="avatar">${c.usuarios?.avatar_url ? `<img src="${c.usuarios.avatar_url}">` : '◈'}</div>
                            <div class="texto">
                                <strong>${c.usuarios?.nombre || 'Usuario'}</strong> ${c.contenido}
                                <div class="fecha">${new Date(c.created_at).toLocaleString()}</div>
                                ${c.usuario_id === sessionUser?.id ? `<button class="btn-eliminar-comentario" onclick="eliminarComentario('${c.id}')">✕ Eliminar</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                    <div class="input-comentario">
                        <input type="text" id="input-comentario-${post.id}" placeholder="Escribe un comentario..." />
                        <button onclick="enviarComentario('${post.id}')">Enviar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// TOGGLE COMENTARIOS
// ================================================================
function toggleComentariosPost(postId) {
    const container = document.getElementById(`comentarios-post-${postId}`);
    if (container) {
        const isVisible = container.style.display !== 'none';
        container.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            setTimeout(() => {
                const input = document.getElementById(`input-comentario-${postId}`);
                if (input) input.focus();
            }, 200);
        }
    }
}

// ================================================================
// ENVIAR COMENTARIO
// ================================================================
async function enviarComentario(postId) {
    const input = document.getElementById(`input-comentario-${postId}`);
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) {
        showToast('⚠️ Escribe un comentario', 'error');
        return;
    }

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para comentar', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('muro_comentarios')
            .insert({
                post_id: postId,
                usuario_id: session.user.id,
                contenido: texto
            });

        if (error) throw error;

        input.value = '';
        showToast('✅ Comentario agregado');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al comentar:', error);
        showToast('❌ Error al comentar', 'error');
    }
}

// ================================================================
// ELIMINAR COMENTARIO (Solo del autor)
// ================================================================
async function eliminarComentario(comentarioId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para eliminar comentario', 'error');
            return;
        }

        const { error } = await supabase
            .from('muro_comentarios')
            .delete()
            .eq('id', comentarioId)
            .eq('usuario_id', session.user.id);

        if (error) throw error;

        showToast('🗑️ Comentario eliminado');
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al eliminar comentario:', error);
        showToast('❌ Error al eliminar comentario', 'error');
    }
}

// ================================================================
// DAR LIKE (Manejo del error 23505)
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

        if (error) {
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

        const { error: insertError } = await supabase
            .from('muro_posts')
            .insert({
                usuario_id: session.user.id,
                contenido: '',
                imagen_url: publicUrl
            });

        if (insertError) throw insertError;

        showToast('✅ Imagen subida correctamente');
        event.target.value = '';
        cargarPublicaciones();
    } catch (error) {
        console.error('Error al subir imagen:', error);
        showToast('❌ Error al subir imagen', 'error');
    }
}

// ================================================================
// SUSCRIBIRSE A REALTIME
// ================================================================
let sessionUser = null;

async function suscribirseARealtime() {
    const session = await getSession();
    sessionUser = session?.user || null;

    const channel = supabase
        .channel('muro-realtime')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_posts' },
            (payload) => {
                const existingPost = document.querySelector(`[data-post-id="${payload.new.id}"]`);
                if (!existingPost) {
                    agregarPostRealtime(payload.new);
                }
            }
        )
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_comentarios' },
            () => cargarPublicaciones()
        )
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_likes' },
            () => cargarPublicaciones()
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'muro_comentarios' },
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
    sessionUser = session?.user || null;

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
window.toggleComentariosPost = toggleComentariosPost;
window.enviarComentario = enviarComentario;
window.eliminarComentario = eliminarComentario;