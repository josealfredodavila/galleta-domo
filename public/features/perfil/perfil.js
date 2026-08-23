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
    else t.classList.remove('error');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ================================================================
// DATOS DEL PERFIL (localStorage)
// ================================================================
function cargarPerfil() {
    const saved = localStorage.getItem('sariels_perfil');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {}
    }
    return {
        nombre: 'Explorador',
        handle: 'explorador',
        bio: 'Construyendo el futuro descentralizado en Sariel\'s',
        edad: '24 años',
        estudio: 'Ingeniería',
        musica: 'Electronic · Jazz',
        viajes: 'Viajero',
        ubicacion: 'CDMX, México',
        estadoCivil: 'Soltera(o)',
        avatar: '◈',
        avatarUrl: null,
        portada: '',
        tokens: 5,
        contactos: 12,
        nft: 1,
        seguidores: 42
    };
}

function guardarPerfilData(data) {
    localStorage.setItem('sariels_perfil', JSON.stringify(data));
}

// ================================================================
// RENDERIZAR PERFIL
// ================================================================
function renderizarPerfil() {
    const data = cargarPerfil();

    // Nombre y handle
    const nombreEl = document.getElementById('displayNombre');
    const handleEl = document.getElementById('displayHandle');
    const bioEl = document.getElementById('displayBio');
    const avatarEl = document.getElementById('avatarEmoji');

    if (nombreEl) nombreEl.textContent = data.nombre;
    if (handleEl) handleEl.textContent = '@' + data.handle;
    if (bioEl) bioEl.textContent = data.bio;
    
    // Avatar - soporte para foto real o emoji
    if (avatarEl) {
        if (data.avatarUrl) {
            avatarEl.innerHTML = `<img src="${data.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else {
            avatarEl.textContent = data.avatar || '◈';
        }
    }

    // Detalles
    const detalles = {
        'displayEdad': data.edad,
        'displayEstudio': data.estudio,
        'displayMusica': data.musica,
        'displayViajes': data.viajes,
        'displayUbicacion': data.ubicacion,
        'displayEstadoCivil': data.estadoCivil
    };
    Object.keys(detalles).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = detalles[id];
    });

    // Estadísticas
    const stats = {
        'statTokens': data.tokens || 0,
        'statContactos': data.contactos || 0,
        'statNFT': data.nft || 0,
        'statSeguidores': data.seguidores || 0
    };
    Object.keys(stats).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = stats[id];
    });

    // Tokens
    const tokens = data.tokens || 0;
    const maxTokens = 12;
    const progreso = Math.min((tokens / maxTokens) * 100, 100);
    const progressEl = document.getElementById('tokenProgress');
    const textEl = document.getElementById('tokenText');
    const cantidadEl = document.getElementById('tokenCantidad');
    if (progressEl) progressEl.style.width = progreso + '%';
    if (textEl) textEl.textContent = tokens + '/' + maxTokens;
    if (cantidadEl) cantidadEl.textContent = tokens;

    // Portada
    if (data.portada) {
        const img = document.getElementById('portadaImg');
        if (img) {
            img.src = data.portada;
            img.style.display = 'block';
        }
    }

    // Huella Digital
    const huella = Math.min(tokens * 5 + 20, 100);
    const barraEl = document.getElementById('huellaBarra');
    const nivelEl = document.getElementById('huellaNivel');
    const descEl = document.getElementById('huellaDescripcion');
    if (barraEl) barraEl.style.width = huella + '%';
    if (nivelEl) {
        const niveles = ['Baja', 'Media', 'Alta', 'Muy Alta', 'Excelente'];
        const idx = Math.min(Math.floor(huella / 25), 4);
        nivelEl.textContent = '✦ ' + niveles[idx];
    }
    if (descEl) {
        descEl.textContent = huella + '% · ' + 
            (huella > 70 ? 'Contribuyente activo' : 
             huella > 40 ? 'Explorador' : 
             'Iniciando');
    }

    // Amigos sugeridos
    renderizarAmigos();
}

// ================================================================
// AMIGOS SUGERIDOS
// ================================================================
function renderizarAmigos() {
    const amigos = [
        { nombre: 'CryptoQueen', handle: 'cryptoq', avatar: '◈' },
        { nombre: 'BlockBuilder', handle: 'blockb', avatar: '◆' },
        { nombre: 'TokenMaster', handle: 'tokenm', avatar: '✦' },
        { nombre: 'Web3Nomad', handle: 'web3n', avatar: '◉' },
        { nombre: 'NFTArtist', handle: 'nfta', avatar: '◈' },
        { nombre: 'DeFiWizard', handle: 'defiw', avatar: '◇' }
    ];

    const grid = document.getElementById('amigosGrid');
    if (!grid) return;

    grid.innerHTML = amigos.map(a => `
        <div class="amigo-card">
            <div class="avatar">${a.avatar}</div>
            <div class="nombre">${a.nombre}</div>
            <div class="handle">@${a.handle}</div>
            <button class="btn-seguir" onclick="seguirAmigo(this)">✦ Seguir</button>
        </div>
    `).join('');
}

function seguirAmigo(btn) {
    if (!btn) return;
    if (btn.textContent === '✦ Siguiendo') {
        btn.textContent = '✦ Seguir';
        btn.classList.remove('siguiendo');
        showToast('Dejaste de seguir a este usuario');
    } else {
        btn.textContent = '✦ Siguiendo';
        btn.classList.add('siguiendo');
        showToast('Ahora sigues a este usuario');
    }
}

// ================================================================
// MODAL EDITAR
// ================================================================
function abrirModalEditar() {
    const data = cargarPerfil();
    const inputs = {
        'inputNombre': data.nombre || '',
        'inputHandle': data.handle || '',
        'inputBio': data.bio || '',
        'inputEdad': data.edad || '',
        'inputEstudio': data.estudio || '',
        'inputMusica': data.musica || '',
        'inputViajes': data.viajes || '',
        'inputUbicacion': data.ubicacion || '',
        'inputEstadoCivil': data.estadoCivil || 'Soltera(o)'
    };
    Object.keys(inputs).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = inputs[id];
    });
    const modal = document.getElementById('modalEditar');
    if (modal) modal.classList.add('show');
}

function cerrarModal() {
    const modal = document.getElementById('modalEditar');
    if (modal) modal.classList.remove('show');
}

function guardarPerfil() {
    const data = cargarPerfil();
    const campos = {
        nombre: 'inputNombre',
        handle: 'inputHandle',
        bio: 'inputBio',
        edad: 'inputEdad',
        estudio: 'inputEstudio',
        musica: 'inputMusica',
        viajes: 'inputViajes',
        ubicacion: 'inputUbicacion',
        estadoCivil: 'inputEstadoCivil'
    };
    Object.keys(campos).forEach(key => {
        const el = document.getElementById(campos[key]);
        if (el) {
            const val = el.value.trim();
            if (key === 'handle') {
                data[key] = val.replace('@', '') || data[key];
            } else {
                data[key] = val || data[key];
            }
        }
    });

    guardarPerfilData(data);
    renderizarPerfil();
    cerrarModal();
    showToast('Perfil actualizado correctamente');
}

// ================================================================
// PORTADA Y AVATAR (CON SOPORTE PARA FOTO REAL)
// ================================================================
function cambiarPortada() {
    const url = prompt('Ingresa la URL de tu nueva portada:');
    if (url && url.trim()) {
        const data = cargarPerfil();
        data.portada = url.trim();
        guardarPerfilData(data);
        renderizarPerfil();
        showToast('Portada actualizada');
    }
}

function cambiarAvatar() {
    // Crear un input de tipo file para fotos reales
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Leer la imagen como URL de datos
        const reader = new FileReader();
        reader.onload = function(ev) {
            const data = cargarPerfil();
            data.avatarUrl = ev.target.result;
            data.avatar = 'foto';
            guardarPerfilData(data);
            renderizarPerfil();
            showToast('Foto de perfil actualizada');
        };
        reader.readAsDataURL(file);
        document.body.removeChild(input);
    };

    // También ofrecer la opción de emoji
    const usarEmoji = confirm('¿Quieres usar un emoji en lugar de una foto? (Cancelar = subir foto)');
    if (usarEmoji) {
        const emoji = prompt('Elige un emoji para tu avatar:', '◈');
        if (emoji && emoji.trim()) {
            const data = cargarPerfil();
            data.avatar = emoji.trim();
            data.avatarUrl = null;
            guardarPerfilData(data);
            renderizarPerfil();
            showToast('Avatar actualizado');
        }
    } else {
        input.click();
    }
}

// ================================================================
// eSIM
// ================================================================
let esimActivo = false;

function toggleESIM() {
    esimActivo = !esimActivo;
    const status = document.getElementById('esimStatus');
    const info = document.getElementById('esimInfo');
    const btn = document.querySelector('.conectividad-card:first-child .btn-accion');
    if (!status || !info) return;

    if (esimActivo) {
        status.textContent = 'Activa';
        status.className = 'status active';
        info.innerHTML = '<strong>Conectado</strong> · Datos móviles activos';
        if (btn) btn.textContent = 'Desactivar eSIM';
        showToast('eSIM activada correctamente');
    } else {
        status.textContent = 'Inactiva';
        status.className = 'status inactive';
        info.textContent = 'Sin datos activos';
        if (btn) btn.textContent = 'Activar eSIM';
        showToast('eSIM desactivada');
    }
}

// ================================================================
// WiFi
// ================================================================
let wifiActivo = false;

function toggleWiFi() {
    wifiActivo = !wifiActivo;
    const status = document.getElementById('wifiStatus');
    const info = document.getElementById('wifiInfo');
    const btn = document.querySelector('.conectividad-card:last-child .btn-accion');
    if (!status || !info) return;

    if (wifiActivo) {
        status.textContent = 'Conectado';
        status.className = 'status active';
        info.innerHTML = '<strong>Conectado</strong> · Ahorrando datos móviles';
        if (btn) btn.textContent = 'Desconectar WiFi';
        showToast('WiFi conectado');
    } else {
        status.textContent = 'Desconectado';
        status.className = 'status inactive';
        info.textContent = 'Ahorra tus datos móviles';
        if (btn) btn.textContent = 'Conectar WiFi';
        showToast('WiFi desconectado');
    }
}

// ================================================================
// BLOQUEAR USUARIO
// ================================================================
function bloquearUsuario() {
    if (confirm('¿Estás seguro de bloquear a este usuario?')) {
        showToast('Usuario bloqueado correctamente');
    }
}

// ================================================================
// PUBLICACIONES DEL PERFIL
// ================================================================

// Cargar publicaciones desde localStorage
function cargarPublicacionesPerfil() {
    const container = document.getElementById('publicacionesContainer');
    if (!container) return;

    let posts = JSON.parse(localStorage.getItem('sariels_perfil_posts') || '[]');

    if (!Array.isArray(posts) || posts.length === 0) {
        const postEjemplo = {
            id: Date.now(),
            autor: 'Sariel\'s',
            avatar: '◈',
            contenido: 'Bienvenido a tu perfil. Comparte tus momentos, fotos y videos.',
            fecha: new Date().toLocaleString(),
            likes: 2,
            divertido: 1,
            media: null,
            tipo: 'texto'
        };
        posts = [postEjemplo];
        localStorage.setItem('sariels_perfil_posts', JSON.stringify(posts));
    }

    renderizarPublicaciones(posts);
}

// Renderizar publicaciones
function renderizarPublicaciones(posts) {
    const container = document.getElementById('publicacionesContainer');
    if (!container) return;

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');

    let html = '';
    posts.slice().reverse().forEach(post => {
        const esAutor = post.autor === (perfil.nombre || 'Explorador');
        const fecha = post.fecha || 'Hace un momento';

        let mediaHtml = '';
        if (post.media) {
            if (post.tipo === 'imagen') {
                mediaHtml = `<img src="${post.media}" class="pub-media" alt="Imagen" />`;
            } else if (post.tipo === 'video') {
                mediaHtml = `<video controls class="pub-media"><source src="${post.media}" /></video>`;
            }
        }

        html += `
            <div class="publicacion-item" data-id="${post.id}">
                <div class="pub-header">
                    <span class="pub-autor">${post.autor || 'Explorador'}</span>
                    <span>${fecha}</span>
                </div>
                <div class="pub-contenido">${post.contenido || ''}</div>
                ${mediaHtml}
                <div class="pub-reacciones">
                    <button onclick="reaccionarPublicacion(${post.id}, 'like')" aria-label="Me gusta">
                        👍 Me gusta <span class="contador" id="likes-${post.id}">${post.likes || 0}</span>
                    </button>
                    <button onclick="reaccionarPublicacion(${post.id}, 'divertido')" aria-label="Me divierte">
                        😄 Me divierte <span class="contador" id="divertido-${post.id}">${post.divertido || 0}</span>
                    </button>
                    ${esAutor ? `<button onclick="eliminarPublicacionPerfil(${post.id})" style="color:var(--danger);" aria-label="Eliminar publicación">✕ Eliminar</button>` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Subir archivo (foto/video)
function subirArchivo(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const contenido = prompt('Descripción de tu foto/video:');
        if (contenido === null) return;

        const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
        let posts = JSON.parse(localStorage.getItem('sariels_perfil_posts') || '[]');
        if (!Array.isArray(posts)) posts = [];

        const nuevoPost = {
            id: Date.now(),
            autor: perfil.nombre || 'Explorador',
            avatar: perfil.avatar || '◈',
            contenido: contenido || 'Foto / Video compartido',
            fecha: new Date().toLocaleString(),
            likes: 0,
            divertido: 0,
            media: e.target.result,
            tipo: file.type.startsWith('video') ? 'video' : 'imagen'
        };

        posts.push(nuevoPost);
        localStorage.setItem('sariels_perfil_posts', JSON.stringify(posts));
        renderizarPublicaciones(posts);
        showToast('Foto/Video publicado');
    };
    reader.readAsDataURL(file);
    input.value = '';
}

// Publicar texto desde el perfil
function publicarTextoPerfil() {
    const input = document.getElementById('inputPublicarTexto');
    const contenido = input.value.trim();
    if (!contenido) {
        showToast('Escribe algo para publicar', 'error');
        return;
    }

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    let posts = JSON.parse(localStorage.getItem('sariels_perfil_posts') || '[]');
    if (!Array.isArray(posts)) posts = [];

    const nuevoPost = {
        id: Date.now(),
        autor: perfil.nombre || 'Explorador',
        avatar: perfil.avatar || '◈',
        contenido: contenido,
        fecha: new Date().toLocaleString(),
        likes: 0,
        divertido: 0,
        media: null,
        tipo: 'texto'
    };

    posts.push(nuevoPost);
    localStorage.setItem('sariels_perfil_posts', JSON.stringify(posts));
    renderizarPublicaciones(posts);
    input.value = '';
    showToast('Publicado correctamente');
}

// Reaccionar (Me gusta / Me divierte)
function reaccionarPublicacion(id, tipo) {
    const posts = JSON.parse(localStorage.getItem('sariels_perfil_posts') || '[]');
    const post = posts.find(p => p.id === id);
    if (!post) return;

    if (tipo === 'like') {
        post.likes = (post.likes || 0) + 1;
    } else if (tipo === 'divertido') {
        post.divertido = (post.divertido || 0) + 1;
    }

    localStorage.setItem('sariels_perfil_posts', JSON.stringify(posts));
    renderizarPublicaciones(posts);
}

// Eliminar publicación
function eliminarPublicacionPerfil(id) {
    if (!confirm('¿Eliminar esta publicación?')) return;
    let posts = JSON.parse(localStorage.getItem('sariels_perfil_posts') || '[]');
    posts = posts.filter(p => p.id !== id);
    localStorage.setItem('sariels_perfil_posts', JSON.stringify(posts));
    renderizarPublicaciones(posts);
    showToast('Publicación eliminada');
}

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    renderizarPerfil();

    // Cargar publicaciones del perfil
    cargarPublicacionesPerfil();

    // Cerrar modal con Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') cerrarModal();
    });

    // Cerrar modal haciendo clic fuera
    const modal = document.getElementById('modalEditar');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) cerrarModal();
        });
    }

    console.log('◈ Sariel\'s - Perfil Ultra Mega Pro');
    console.log('Con publicaciones y foto real');
    console.log('Datos cargados desde localStorage');
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.renderizarPerfil = renderizarPerfil;
window.abrirModalEditar = abrirModalEditar;
window.cerrarModal = cerrarModal;
window.guardarPerfil = guardarPerfil;
window.cambiarPortada = cambiarPortada;
window.cambiarAvatar = cambiarAvatar;
window.toggleESIM = toggleESIM;
window.toggleWiFi = toggleWiFi;
window.bloquearUsuario = bloquearUsuario;
window.seguirAmigo = seguirAmigo;
window.cargarPublicacionesPerfil = cargarPublicacionesPerfil;
window.renderizarPublicaciones = renderizarPublicaciones;
window.subirArchivo = subirArchivo;
window.publicarTextoPerfil = publicarTextoPerfil;
window.reaccionarPublicacion = reaccionarPublicacion;
window.eliminarPublicacionPerfil = eliminarPublicacionPerfil;