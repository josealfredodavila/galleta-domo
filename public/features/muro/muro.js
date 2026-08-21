// ================================================================
// MURO ULTRA MEGA PRO - SARIEL'S (CON SUPABASE AUTH)
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

// SUPABASE CLIENTE
const SUPABASE_URL = 'https://hbbwopkfpkvahgtawqke.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j';
let supabase = null;

if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('◈ Supabase cliente inicializado en muro.js');
}

// HEADERS AUTENTICADOS
async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }
        } catch (e) {
            console.warn('No se pudo obtener sesión de Supabase:', e);
        }
    }
    return headers;
}

async function fetchWithAuth(url, options = {}) {
    const headers = await getAuthHeaders();
    return fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
    });
}

// LOCALSTORAGE FALLBACK
function cargarPublicacionesLocal() {
    const saved = localStorage.getItem('sariels_muro_posts');
    if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
}

function guardarPublicacionesLocal(posts) {
    localStorage.setItem('sariels_muro_posts', JSON.stringify(posts));
}

let publicaciones = [];
let paginaActual = 1;
let cargando = false;

// INICIALIZACIÓN AL CARGAR LA PÁGINA
document.addEventListener('DOMContentLoaded', () => {
    cargarPublicaciones(1);
    actualizarPerfilUsuario();
});

function actualizarPerfilUsuario() {
    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const nameEl = document.getElementById('userName');
    const avatarEl = document.getElementById('userAvatar');
    if (nameEl && perfil.nombre) nameEl.textContent = perfil.nombre;
    if (avatarEl && perfil.avatar) avatarEl.textContent = perfil.avatar;
}

// CARGAR PUBLICACIONES
async function cargarPublicaciones(pagina = 1) {
    if (cargando) return;
    cargando = true;

    try {
        const response = await fetchWithAuth(`/api/muro?page=${pagina}&limit=10`);
        if (!response.ok) throw new Error('Error backend');

        const data = await response.json();
        const feedContainer = document.getElementById('feedContainer');

        if (pagina === 1 && feedContainer) feedContainer.innerHTML = '';

        if (data.publicaciones && data.publicaciones.length > 0) {
            data.publicaciones.forEach(post => renderizarPublicacion(post));
        } else {
            cargarDesdeLocalStorage();
        }
    } catch (error) {
        cargarDesdeLocalStorage();
    } finally {
        cargando = false;
    }
}

function cargarDesdeLocalStorage() {
    const posts = cargarPublicacionesLocal();
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    if (posts.length > 0) {
        feedContainer.innerHTML = '';
        posts.forEach(post => renderizarPublicacion(post));
    } else {
        feedContainer.innerHTML = `
            <div class="empty-state">
                <span class="icon">📭</span>
                <h3>Sin publicaciones</h3>
                <p>Sé el primero en compartir algo en la red.</p>
            </div>
        `;
    }
}

// PUBLICAR
async function publicar() {
    const postContent = document.getElementById('postContent');
    const btnPublicar = document.getElementById('btnPublicar');
    const contenido = postContent ? postContent.value.trim() : '';

    if (!contenido) {
        showToast('⚠️ Escribe algo para publicar', 'error');
        return;
    }

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const nuevoPost = {
        id: Date.now(),
        autor: perfil.nombre || 'Explorador',
        avatar: perfil.avatar || '◈',
        contenido: contenido,
        fecha: new Date().toLocaleString(),
        likes: 0,
        comentarios: []
    };

    const posts = cargarPublicacionesLocal();
    posts.unshift(nuevoPost);
    guardarPublicacionesLocal(posts);

    if (btnPublicar) btnPublicar.disabled = true;

    try {
        await fetchWithAuth('/api/muro', {
            method: 'POST',
            body: JSON.stringify({ contenido, tipo: 'texto' })
        });
    } catch (e) {
        console.warn('Backend offline, guardado en LocalStorage');
    } finally {
        if (postContent) postContent.value = '';
        if (btnPublicar) btnPublicar.disabled = false;
        cargarDesdeLocalStorage();
        showToast('✅ Publicación creada');
    }
}

// RENDERIZAR
function renderizarPublicacion(post) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    const postCard = document.createElement('div');
    postCard.className = 'post-card';

    postCard.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">${post.avatar || '◈'}</div>
            <div>
                <div class="post-author">${post.autor || 'Explorador'} <span class="badge-verificado">✦ Verificado</span></div>
                <div class="post-date">${post.fecha || 'Hace un momento'}</div>
            </div>
        </div>
        <div class="post-content">${post.contenido || ''}</div>
        <div class="post-stats">
            <span>❤️ ${post.likes || 0}</span>
            <span>💬 ${(post.comentarios || []).length}</span>
        </div>
    `;

    feedContainer.appendChild(postCard);
}
