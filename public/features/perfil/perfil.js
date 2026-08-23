/* ================================================================
   PERFIL ULTRA MEGA PRO - SARIEL'S
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

function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) tabContent.classList.add('active');
    const tabBtn = document.querySelector(`.tab-btn[onclick="cambiarTab('${tab}')"]`);
    if (tabBtn) tabBtn.classList.add('active');
}

async function cargarPerfil() {
    try {
        const response = await fetchWithAuth(`${API_URL}/perfil`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.perfil) {
                actualizarUI(data.perfil);
                return;
            }
        }
    } catch (error) {
        console.warn('Error cargando perfil desde API:', error);
    }

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const tokens = parseInt(localStorage.getItem('sariels_tokens') || '0');
    const nfts = parseInt(localStorage.getItem('sariels_nft') === 'true' ? 1 : 0);

    actualizarUI({
        nombre: perfil.nombre || 'Explorador',
        handle: perfil.handle || 'explorador',
        bio: perfil.bio || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
        avatar: perfil.avatar || null,
        tokens: tokens,
        nfts: nfts,
        seguidores: perfil.seguidores || 0,
        siguiendo: perfil.siguiendo || 0
    });
}

function actualizarUI(data) {
    const nombreEl = document.getElementById('perfilNombre');
    const handleEl = document.getElementById('perfilHandle');
    const bioEl = document.getElementById('perfilBio');
    const avatarEl = document.getElementById('perfilAvatar');

    if (nombreEl) {
        nombreEl.innerHTML = `${data.nombre || 'Explorador'} <span class="verified">✦ VERIFICADO</span>`;
    }
    if (handleEl) handleEl.textContent = '@' + (data.handle || 'explorador');
    if (bioEl) bioEl.textContent = data.bio || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';

    if (avatarEl) {
        if (data.avatar_url) {
            avatarEl.innerHTML = `<img src="${data.avatar_url}" alt="Avatar" /><span class="edit-badge" onclick="editarAvatar()" title="Cambiar avatar">✎</span>`;
        } else {
            avatarEl.innerHTML = `◈<span class="edit-badge" onclick="editarAvatar()" title="Cambiar avatar">✎</span>`;
        }
    }

    const statTokens = document.getElementById('statTokens');
    const statNFTS = document.getElementById('statNFTS');
    const statSeguidores = document.getElementById('statSeguidores');
    const statSiguiendo = document.getElementById('statSiguiendo');

    if (statTokens) statTokens.textContent = data.tokens_acumulados || 0;
    if (statNFTS) statNFTS.textContent = 0;
    if (statSeguidores) statSeguidores.textContent = data.seguidores || 0;
    if (statSiguiendo) statSiguiendo.textContent = data.siguiendo || 0;

    const editNombre = document.getElementById('editNombre');
    const editHandle = document.getElementById('editHandle');
    const editBio = document.getElementById('editBio');
    const editAvatar = document.getElementById('editAvatar');

    if (editNombre) editNombre.value = data.nombre || 'Explorador';
    if (editHandle) editHandle.value = '@' + (data.handle || 'explorador');
    if (editBio) editBio.value = data.bio || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';
    if (editAvatar) editAvatar.value = data.avatar_url || '';
}

async function guardarPerfil() {
    const perfil = {
        nombre: document.getElementById('editNombre').value.trim() || 'Explorador',
        handle: document.getElementById('editHandle').value.trim().replace('@', '') || 'explorador',
        bio: document.getElementById('editBio').value.trim() || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
        avatar_url: document.getElementById('editAvatar').value.trim() || null
    };

    try {
        const response = await fetchWithAuth(`${API_URL}/perfil`, {
            method: 'PUT',
            body: JSON.stringify(perfil)
        });

        if (response.ok) {
            localStorage.setItem('sariels_perfil', JSON.stringify(perfil));
            cargarPerfil();
            showToast('✅ Perfil guardado correctamente');
            return;
        }
    } catch (error) {
        console.warn('Error guardando perfil vía API:', error);
    }

    localStorage.setItem('sariels_perfil', JSON.stringify(perfil));
    cargarPerfil();
    showToast('✅ Perfil guardado correctamente');
}

function editarAvatar() {
    const url = prompt('◈ Ingresa la URL de tu avatar:');
    if (url && url.trim()) {
        document.getElementById('editAvatar').value = url.trim();
        guardarPerfil();
    }
}

function editarPerfil() {
    cambiarTab('config');
    setTimeout(() => {
        const input = document.getElementById('editNombre');
        if (input) input.focus();
    }, 300);
}

function compartirPerfil() {
    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const handle = perfil.handle || 'explorador';
    const url = `${window.location.origin}/perfil/${handle}`;
    const texto = `◈ Perfil de ${perfil.nombre || 'Explorador'} en Sariel's\n◈ ${url}`;

    if (navigator.share) {
        navigator.share({ title: `Perfil de ${perfil.nombre || 'Explorador'}`, text: texto, url: url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast('◈ Copiado al portapapeles');
        }).catch(() => {
            prompt('Copia este enlace:', url);
        });
    }
}

function irAMuro() {
    window.location.href = '/features/muro/muro.html';
}

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    cargarPerfil();
});

window.cambiarTab = cambiarTab;
window.cargarPerfil = cargarPerfil;
window.guardarPerfil = guardarPerfil;
window.editarAvatar = editarAvatar;
window.editarPerfil = editarPerfil;
window.compartirPerfil = compartirPerfil;
window.irAMuro = irAMuro;
window.showToast = showToast;