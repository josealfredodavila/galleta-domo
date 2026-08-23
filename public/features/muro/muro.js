/* ================================================================
   MURO ULTRA MEGA PRO - SARIEL'S
   ================================================================ */

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

const API_URL = '/api';

async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('galleta_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

async function fetchWithAuth(url, options = {}) {
    const headers = await getAuthHeaders();
    return fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
    });
}

// Cargar publicaciones
async function cargarPublicaciones() {
    try {
        const response = await fetchWithAuth(`${API_URL}/muro`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.posts) {
                renderizarPublicaciones(data.posts);
                return;
            }
        }
    } catch (error) {
        console.warn('Error cargando muro desde API:', error);
    }
    // Fallback local
    const posts = JSON.parse(localStorage.getItem('sariels_muro_posts') || '[]');
    renderizarPublicaciones(posts);
}

function renderizarPublicaciones(posts) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    if (posts.length === 0) {
        feedContainer.innerHTML = `
            <div class="empty-state">
                <span class="icon">◈</span>
                <h3>Sin publicaciones</h3>
                <p>Sé el primero en compartir algo.</p>
            </div>
        `;
        return;
    }

    feedContainer.innerHTML = posts.map(post => `
        <div class="post-card">
            <div class="post-header">
                <div class="post-avatar">${post.usuarios?.avatar_url ? `<img src="${post.usuarios.avatar_url}">` : '◈'}</div>
                <div>
                    <div class="post-author">${post.usuarios?.nombre || 'Explorador'} <span class="badge-verificado">✦ Verificado</span></div>
                    <div class="post-date">${new Date(post.created_at).toLocaleString()}</div>
                </div>
            </div>
            <div class="post-content">${post.contenido || ''}</div>
            <div class="post-stats">
                <span>❤️ ${post.muro_likes?.length || 0}</span>
                <span>💬 ${post.muro_comentarios?.length || 0}</span>
            </div>
        </div>
    `).join('');
}

// Publicar
async function publicar() {
    const postContent = document.getElementById('postContent');
    const btnPublicar = document.getElementById('btnPublicar');
    const contenido = postContent ? postContent.value.trim() : '';

    if (!contenido) {
        showToast('⚠️ Escribe algo para publicar', 'error');
        return;
    }

    try {
        const response = await fetchWithAuth(`${API_URL}/muro`, {
            method: 'POST',
            body: JSON.stringify({ contenido })
        });

        if (response.ok) {
            showToast('✅ Publicación creada');
            if (postContent) postContent.value = '';
            cargarPublicaciones();
        }
    } catch (error) {
        showToast('❌ Error al publicar', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    cargarPublicaciones();
});

window.publicar = publicar;
window.showToast = showToast;