/* ================================================================
   PERFIL ULTRA MEGA PRO - SARIEL'S
   Con Supabase Auth + Subida de Fotos a Storage + Wallet
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
// FUNCIÓN PARA CAMBIAR TABS
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
// FUNCIÓN PARA OBTENER SESIÓN
// ================================================================
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// CARGAR PERFIL REAL DESDE SUPABASE
// ================================================================
async function cargarPerfil() {
    try {
        const session = await getSession();
        if (!session) {
            window.location.href = '/';
            return;
        }

        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error) throw error;

        if (data) {
            actualizarUI(data);
        } else {
            const defaultData = {
                nombre: session.user.user_metadata?.nombre || 'Explorador',
                handle: session.user.email?.split('@')[0] || 'explorador',
                bio: 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
                avatar_url: null,
                tokensAcumulados: 0,
                progresoCanje: 0,
                puedeCanjear: false
            };
            actualizarUI(defaultData);
        }
    } catch (error) {
        console.error('Error cargando perfil desde Supabase:', error);
        showToast('❌ Error al cargar perfil', 'error');
    }
}

// ================================================================
// ACTUALIZAR UI (SIN VARIABLES HUÉRFANAS)
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
    if (bioEl) bioEl.textContent = data.bio || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';

    if (avatarEl) {
        if (data.avatar_url) {
            avatarEl.innerHTML = `<img src="${data.avatar_url}" alt="Avatar" /><span class="edit-badge" onclick="abrirSelectorArchivo()" title="Cambiar avatar">✎</span>`;
        } else {
            avatarEl.innerHTML = `◈<span class="edit-badge" onclick="abrirSelectorArchivo()" title="Cambiar avatar">✎</span>`;
        }
    }

    const statTokens = document.getElementById('statTokens');
    const statNFTS = document.getElementById('statNFTS');
    const statSeguidores = document.getElementById('statSeguidores');
    const statSiguiendo = document.getElementById('statSiguiendo');

    if (statTokens) statTokens.textContent = data.tokensAcumulados || 0;
    if (statNFTS) statNFTS.textContent = 0;
    if (statSeguidores) statSeguidores.textContent = data.seguidores || 0;
    if (statSiguiendo) statSiguiendo.textContent = data.siguiendo || 0;

    // ✅ ACTUALIZAR PROGRESO DE TOKENS (META: 12 TOKENS)
    const tokens = data.tokensAcumulados || 0;
    const progreso = Math.min(tokens, 12);
    const progresoCanje = data.progresoCanje || 0;
    const puedeCanjear = data.puedeCanjear || false;

    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) progressFill.style.width = `${(progreso / 12) * 100}%`;
    if (progressText) progressText.textContent = `${progreso} / 12`;

    const tokenTotal = document.getElementById('tokenTotal');
    const tokenDisponibles = document.getElementById('tokenDisponibles');
    const tokenVendidos = document.getElementById('tokenVendidos');
    const tokenNFTs = document.getElementById('tokenNFTs');

    if (tokenTotal) tokenTotal.textContent = tokens;
    if (tokenDisponibles) tokenDisponibles.textContent = tokens;
    if (tokenVendidos) tokenVendidos.textContent = 0;
    if (tokenNFTs) tokenNFTs.textContent = progresoCanje || 0;

    const editNombre = document.getElementById('editNombre');
    const editHandle = document.getElementById('editHandle');
    const editBio = document.getElementById('editBio');

    if (editNombre) editNombre.value = data.nombre || 'Explorador';
    if (editHandle) editHandle.value = '@' + (data.handle || 'explorador');
    if (editBio) editBio.value = data.bio || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad';

    const btnCanjear = document.getElementById('canjearNft');
    if (btnCanjear) btnCanjear.disabled = !puedeCanjear;
}

// ================================================================
// CONECTAR WALLET (MetaMask)
// ================================================================
async function conectarWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast('⚠️ Instala MetaMask para conectar tu wallet', 'error');
        return;
    }

    try {
        // Obtener cuenta de MetaMask
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const cuenta = accounts[0];

        // Guardar en Supabase usando la función RPC
        const { error } = await supabase.rpc('vincular_wallet', { p_wallet_address: cuenta });

        if (error) throw error;

        // Actualizar UI
        const walletDisplay = document.getElementById('walletDisplay');
        const btnConectar = document.querySelector('.btn-outline.btn-sm');
        const btnDesconectar = document.getElementById('btnDisconnect');

        if (walletDisplay) {
            walletDisplay.textContent = cuenta.slice(0, 6) + '...' + cuenta.slice(-4);
            walletDisplay.style.color = 'var(--success)';
        }
        if (btnConectar) btnConectar.style.display = 'none';
        if (btnDesconectar) btnDesconectar.style.display = 'inline-flex';

        showToast('✅ Wallet conectada correctamente');
    } catch (error) {
        console.error('Error conectando wallet:', error);
        showToast('❌ Error al conectar wallet: ' + error.message, 'error');
    }
}

// ================================================================
// DESCONECTAR WALLET
// ================================================================
async function desconectarWallet() {
    try {
        // Llamar a la función RPC para desvincular (si existe)
        // const { error } = await supabase.rpc('desvincular_wallet');
        
        const walletDisplay = document.getElementById('walletDisplay');
        const btnConectar = document.querySelector('.btn-outline.btn-sm');
        const btnDesconectar = document.getElementById('btnDisconnect');

        if (walletDisplay) {
            walletDisplay.textContent = 'No conectada';
            walletDisplay.style.color = 'var(--text-muted)';
        }
        if (btnConectar) btnConectar.style.display = 'inline-flex';
        if (btnDesconectar) btnDesconectar.style.display = 'none';

        showToast('🔌 Wallet desconectada');
    } catch (error) {
        console.error('Error desconectando wallet:', error);
        showToast('❌ Error al desconectar wallet', 'error');
    }
}

// ================================================================
// CERRAR SESIÓN
// ================================================================
async function cerrarSesion() {
    try {
        await supabase.auth.signOut();
        window.location.href = '/';
        showToast('🔌 Sesión cerrada');
    } catch (error) {
        console.error('Error cerrando sesión:', error);
        showToast('❌ Error al cerrar sesión', 'error');
    }
}

// ================================================================
// SUBIR FOTO DE PERFIL (Supabase Storage)
// ================================================================
function abrirSelectorArchivo() {
    const input = document.getElementById('fileInput');
    if (input) input.click();
}

async function subirFoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para subir foto', 'error');
        return;
    }

    // ✅ Regla correcta: `${user.id}/avatar.${fileExt}`
    const fileExt = file.name.split('.').pop().toLowerCase();
    const filePath = `${session.user.id}/avatar.${fileExt}`;

    try {
        showToast('⏳ Subiendo foto...');

        const { error: uploadError } = await supabase.storage
            .from('sariels-avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('sariels-avatars')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', session.user.id);

        if (updateError) throw updateError;

        showToast('✅ Foto actualizada correctamente');
        event.target.value = '';
        cargarPerfil();
    } catch (error) {
        console.error('Error al subir foto:', error);
        showToast('❌ Error al subir foto', 'error');
    }
}

// ================================================================
// EDITAR PERFIL (cambia a pestaña config)
// ================================================================
function editarPerfil() {
    cambiarTab('config');
    setTimeout(() => {
        const input = document.getElementById('editNombre');
        if (input) input.focus();
    }, 300);
}

// ================================================================
// GUARDAR PERFIL REAL EN SUPABASE
// ================================================================
async function guardarPerfil() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para guardar', 'error');
        return;
    }

    const perfil = {
        nombre: document.getElementById('editNombre').value.trim() || 'Explorador',
        handle: document.getElementById('editHandle').value.trim().replace('@', '') || 'explorador',
        bio: document.getElementById('editBio').value.trim() || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad'
    };

    try {
        const { error } = await supabase
            .from('usuarios')
            .update(perfil)
            .eq('id', session.user.id);

        if (error) throw error;

        showToast('✅ Perfil guardado correctamente');
        cargarPerfil();
    } catch (error) {
        console.error('Error guardando perfil:', error);
        showToast('❌ Error al guardar', 'error');
    }
}

// ================================================================
// COMPARTIR PERFIL
// ================================================================
function compartirPerfil() {
    const nombre = document.getElementById('perfilNombre')?.textContent.split(' ')[0] || 'Explorador';
    const handle = document.getElementById('perfilHandle')?.textContent.replace('@', '') || 'explorador';
    const url = `${window.location.origin}/perfil/${handle}`;
    const texto = `◈ Perfil de ${nombre} en Sariel's\n◈ ${url}`;

    if (navigator.share) {
        navigator.share({ title: `Perfil de ${nombre}`, text: texto, url: url }).catch(() => {});
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

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    cargarPerfil();
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.cambiarTab = cambiarTab;
window.cargarPerfil = cargarPerfil;
window.guardarPerfil = guardarPerfil;
window.abrirSelectorArchivo = abrirSelectorArchivo;
window.subirFoto = subirFoto;
window.editarPerfil = editarPerfil;
window.compartirPerfil = compartirPerfil;
window.conectarWallet = conectarWallet;
window.desconectarWallet = desconectarWallet;
window.cerrarSesion = cerrarSesion;
window.irAMuro = irAMuro;
window.showToast = showToast;