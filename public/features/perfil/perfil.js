/* ================================================================
   PERFIL ULTRA MEGA PRO - SARIEL'S
   Con Supabase Auth + Subida de Fotos a Storage
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (El MISMO que está en app.js)
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
            // Si no hay sesión, redirigir al inicio
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
            // Si no tiene perfil creado, usar datos por defecto
            const defaultData = {
                nombre: session.user.user_metadata?.nombre || 'Explorador',
                handle: session.user.email?.split('@')[0] || 'explorador',
                bio: 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
                avatar_url: null,
                tokens_acumulados: 0
            };
            actualizarUI(defaultData);
        }
    } catch (error) {
        console.error('Error cargando perfil desde Supabase:', error);
        showToast('❌ Error al cargar perfil', 'error');
    }
}

// ================================================================
// ACTUALIZAR UI
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
        bio: document.getElementById('editBio').value.trim() || 'Explorando el ecosistema Sariel\'s · WEB3 · Comunidad',
        avatar_url: document.getElementById('editAvatar').value.trim() || null
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

    const fileName = `avatar-${session.user.id}-${Date.now()}.jpg`;
    const filePath = `avatars/${fileName}`;

    try {
        showToast('⏳ Subiendo foto...');

        // Subir a Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from('sariels-avatars')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // Obtener URL pública
        const { data: urlData } = supabase.storage
            .from('sariels-avatars')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // Actualizar en la tabla usuarios
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ avatar_url: publicUrl })
            .eq('id', session.user.id);

        if (updateError) throw updateError;

        showToast('✅ Foto actualizada correctamente');
        cargarPerfil();
    } catch (error) {
        console.error('Error subiendo foto:', error);
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
window.editarAvatar = abrirSelectorArchivo;
window.editarPerfil = editarPerfil;
window.compartirPerfil = compartirPerfil;
window.irAMuro = irAMuro;
window.showToast = showToast;
window.abrirSelectorArchivo = abrirSelectorArchivo;
window.subirFoto = subirFoto;