/* ================================================================
   PERFIL ULTRA MEGA PRO - SARIEL'S
   Lógica premium competitiva con Silicon Valley
   ================================================================ */

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
// SUPABASE CLIENTE
// ================================================================
const SUPABASE_URL = 'https://hbbwopkfpkvahgtawqke.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j';
let supabase = null;

if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('◈ Supabase cliente inicializado en perfil.js');
}

// ================================================================
// API URL - PRODUCCIÓN (RAILWAY)
// ================================================================
const API_URL = 'https://galleta-domo.up.railway.app/api';

// ================================================================
// HEADERS DE AUTENTICACIÓN
// ================================================================
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
        headers: {
            ...headers,
            ...(options.headers || {})
        }
    });
}

// ================================================================
// TABS
// ================================================================
function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) tabContent.classList.add('active');
    const tabBtn = document.querySelector(`.tab-btn[onclick="cambiarTab('${tab}')"]`);
    if (tabBtn) tabBtn.classList.add('active');
}

// ================================================================
// CARGAR PERFIL DESDE SUPABASE / localStorage
// ================================================================
async function cargarPerfil() {
    try {
        // Intentar cargar desde Supabase primero
        const response = await fetchWithAuth(`${API_URL}/perfil`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.perfil) {
                actualizarUI(data.perfil);
                return;
            }
        }
    } catch (error) {
        console.warn('Error cargando perfil desde Supabase, usando localStorage:', error);
    }

    // Fallback: localStorage
    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const tokens = parseInt(localStorage.getItem('sariels_tokens') || '0');
    const nfts = parseInt(localStorage.getItem('sariels_nft') === 'true' ? 1 : 0);
    const domos = parseInt(localStorage.getItem('sariels_domos') || '0');

    actualizarUI({
        nombre: perfil.nombre || 'Explorador',
        handle: perfil.handle || 'explorador',
        bio: perfil.bio || '🌍 Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
        avatar: perfil.avatar || null,
        tokens: tokens,
        nfts: nfts,
        domos: domos,
        seguidores: perfil.seguidores || 0,
        siguiendo: perfil.siguiendo || 0
    });

    cargarPublicaciones();
    cargarHistorial();
}

// ================================================================
// ACTUALIZAR UI DEL PERFIL
// ================================================================
function actualizarUI(data) {
    const nombreEl = document.getElementById('perfilNombre');
    const handleEl = document.getElementById('perfilHandle');
    const bioEl = document.getElementById('perfilBio');
    const avatarEl = document.getElementById('perfilAvatar');

    if (nombreEl) {
        nombreEl.innerHTML = `${data.nombre || 'Explorador'} <span class="verified">✦ VERIFICADO</span>`;
    }
    if (handleEl) handleEl.textContent = '@' + (data.handle || 'explorador');
    if (bioEl) bioEl.textContent = data.bio || '🌍 Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';

    if (avatarEl) {
        if (data.avatar) {
            avatarEl.innerHTML = `<img src="${data.avatar}" alt="Avatar" /><span class="edit-badge" onclick="editarAvatar()" title="Cambiar avatar">✎</span>`;
        } else {
            avatarEl.innerHTML = `◈<span class="edit-badge" onclick="editarAvatar()" title="Cambiar avatar">✎</span>`;
        }
    }

    const statTokens = document.getElementById('statTokens');
    const statNFTS = document.getElementById('statNFTS');
    const statSeguidores = document.getElementById('statSeguidores');
    const statSiguiendo = document.getElementById('statSiguiendo');

    if (statTokens) statTokens.textContent = data.tokens || 0;
    if (statNFTS) statNFTS.textContent = data.nfts || 0;
    if (statSeguidores) statSeguidores.textContent = data.seguidores || 0;
    if (statSiguiendo) statSiguiendo.textContent = data.siguiendo || 0;

    const tokenTotal = document.getElementById('tokenTotal');
    const tokenDisponibles = document.getElementById('tokenDisponibles');
    const tokenVendidos = document.getElementById('tokenVendidos');
    const tokenNFTs = document.getElementById('tokenNFTs');

    if (tokenTotal) tokenTotal.textContent = data.tokens || 0;
    if (tokenDisponibles) tokenDisponibles.textContent = data.tokens || 0;
    if (tokenVendidos) tokenVendidos.textContent = 0;
    if (tokenNFTs) tokenNFTs.textContent = data.nfts || 0;

    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progreso = Math.min(data.tokens || 0, 12);
    if (progressFill) progressFill.style.width = `${(progreso / 12) * 100}%`;
    if (progressText) progressText.textContent = `${progreso} / 12`;

    const editNombre = document.getElementById('editNombre');
    const editHandle = document.getElementById('editHandle');
    const editBio = document.getElementById('editBio');
    const editAvatar = document.getElementById('editAvatar');

    if (editNombre) editNombre.value = data.nombre || 'Explorador';
    if (editHandle) editHandle.value = '@' + (data.handle || 'explorador');
    if (editBio) editBio.value = data.bio || '🌍 Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';
    if (editAvatar) editAvatar.value = data.avatar || '';
}

// ================================================================
// CARGAR PUBLICACIONES DEL USUARIO
// ================================================================
function cargarPublicaciones() {
    const posts = JSON.parse(localStorage.getItem('sariels_muro_posts') || '[]');
    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const misPosts = posts.filter(p => p.autor === perfil.nombre);

    const container = document.getElementById('postsList');
    const count = document.getElementById('postsCount');

    if (count) count.textContent = misPosts.length;

    if (!container) return;

    if (misPosts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="icon">◈</span>
                <h4>Sin publicaciones</h4>
                <p>Publica algo en el Muro</p>
            </div>
        `;
        return;
    }

    container.innerHTML = misPosts.map(p => `
        <div class="activity-item">
            <div class="icon">◈</div>
            <div class="content">
                <div class="text">
                    <strong>${p.autor || 'Explorador'}</strong> ${p.contenido || ''}
                </div>
                <div class="fecha">${p.fecha || 'Hace un momento'}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="irAPublicacion(${p.id})">Ver</button>
        </div>
    `).join('');
}

// ================================================================
// CARGAR HISTORIAL
// ================================================================
function cargarHistorial() {
    const historial = JSON.parse(localStorage.getItem('sariels_historial_compras') || '[]');
    const container = document.getElementById('historialList');
    const count = document.getElementById('historialCount');

    if (count) count.textContent = historial.length;

    if (!container) return;

    if (historial.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="icon">◈</span>
                <h4>Sin transacciones</h4>
                <p>Compra domos para acumular tokens</p>
            </div>
        `;
        return;
    }

    container.innerHTML = historial.slice(-10).reverse().map(h => `
        <div class="activity-item">
            <div class="icon">🛒</div>
            <div class="content">
                <div class="text">
                    <strong>${h.cantidad || 0} tokens</strong> · ${h.tipo || 'compra'}
                    <span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px;">${h.precio ? h.precio + ' MXN c/u' : ''}</span>
                </div>
                <div class="fecha">${h.fecha ? new Date(h.fecha).toLocaleDateString() : 'Hace un momento'}</div>
            </div>
            ${h.total ? `<span style="font-size:0.65rem;color:var(--gold);">${h.total} MXN</span>` : ''}
        </div>
    `).join('');
}

// ================================================================
// GUARDAR PERFIL
// ================================================================
async function guardarPerfil() {
    const perfil = {
        nombre: document.getElementById('editNombre').value.trim() || 'Explorador',
        handle: document.getElementById('editHandle').value.trim().replace('@', '') || 'explorador',
        bio: document.getElementById('editBio').value.trim() || '🌍 Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
        avatar: document.getElementById('editAvatar').value.trim() || null
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
        console.warn('Error guardando perfil en Supabase, usando localStorage:', error);
    }

    // Fallback: localStorage
    localStorage.setItem('sariels_perfil', JSON.stringify(perfil));
    cargarPerfil();
    showToast('✅ Perfil guardado correctamente');
}

// ================================================================
// EDITAR AVATAR
// ================================================================
function editarAvatar() {
    const url = prompt('◈ Ingresa la URL de tu avatar:');
    if (url && url.trim()) {
        document.getElementById('editAvatar').value = url.trim();
        guardarPerfil();
    }
}

// ================================================================
// EDITAR PERFIL (cambia a la pestaña de configuración)
// ================================================================
function editarPerfil() {
    cambiarTab('config');
    setTimeout(() => {
        const input = document.getElementById('editNombre');
        if (input) input.focus();
    }, 300);
}

// ================================================================
// COMPARTIR PERFIL
// ================================================================
function compartirPerfil() {
    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const handle = perfil.handle || 'explorador';
    const url = `${window.location.origin}/perfil/${handle}`;
    const texto = `◈ Perfil de ${perfil.nombre || 'Explorador'} en Sariel's\n🔗 ${url}`;

    if (navigator.share) {
        navigator.share({
            title: `Perfil de ${perfil.nombre || 'Explorador'}`,
            text: texto,
            url: url
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(texto).then(() => {
            showToast('📋 Copiado al portapapeles');
        }).catch(() => {
            prompt('Copia este enlace:', url);
        });
    }
}

// ================================================================
// IR A PUBLICACIÓN
// ================================================================
function irAPublicacion(id) {
    window.location.href = `/features/muro/muro.html?post=${id}`;
}

function irAMuro() {
    window.location.href = '/features/muro/muro.html';
}

// ================================================================
// WALLET (con Supabase)
// ================================================================
let session = null;

async function conectarWallet() {
    if (typeof window.app !== 'undefined' && window.app.supabase) {
        try {
            const { data, error } = await window.app.supabase.auth.signInWithWeb3({
                chain: 'ethereum',
                statement: 'Inicia sesión en Sariel\'s Ecosystem'
            });
            if (error) throw error;
            showToast('✅ Wallet conectada exitosamente');
            actualizarWalletUI();
        } catch (error) {
            console.error('Error conectando wallet:', error);
            showToast('❌ Error al conectar wallet', 'error');
        }
    } else {
        showToast('⚠️ Conecta tu wallet desde el inicio', 'warning');
        window.location.href = '/';
    }
}

async function desconectarWallet() {
    if (typeof window.app !== 'undefined' && window.app.supabase) {
        await window.app.supabase.auth.signOut();
        showToast('🔌 Wallet desconectada');
        actualizarWalletUI();
    }
}

function actualizarWalletUI() {
    const session = localStorage.getItem('galleta_token');
    const display = document.getElementById('walletDisplay');
    const disconnect = document.getElementById('btnDisconnect');

    if (display) {
        if (session) {
            display.textContent = '✅ Conectada';
            display.style.color = 'var(--success)';
        } else {
            display.textContent = 'No conectada';
            display.style.color = 'var(--text-muted)';
        }
    }

    if (disconnect) {
        disconnect.style.display = session ? 'inline-flex' : 'none';
    }
}

// ================================================================
// CERRAR SESIÓN
// ================================================================
function cerrarSesion() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
        localStorage.removeItem('galleta_token');
        localStorage.removeItem('sariels_wallet');
        if (typeof window.app !== 'undefined' && window.app.supabase) {
            window.app.supabase.auth.signOut();
        }
        showToast('🔌 Sesión cerrada');
        actualizarWalletUI();
    }
}

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.cambiarTab = cambiarTab;
window.cargarPerfil = cargarPerfil;
window.guardarPerfil = guardarPerfil;
window.editarAvatar = editarAvatar;
window.editarPerfil = editarPerfil;
window.compartirPerfil = compartirPerfil;
window.irAPublicacion = irAPublicacion;
window.irAMuro = irAMuro;
window.conectarWallet = conectarWallet;
window.desconectarWallet = desconectarWallet;
window.cerrarSesion = cerrarSesion;
window.showToast = showToast;
window.actualizarWalletUI = actualizarWalletUI;
window.cargarPublicaciones = cargarPublicaciones;
window.cargarHistorial = cargarHistorial;
window.actualizarUI = actualizarUI;

console.log('◈ perfil.js cargado correctamente con Supabase Auth');