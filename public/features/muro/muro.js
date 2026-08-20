/* ================================================================
   MURO ULTRA MEGA PRO - SARIEL'S
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
// DATOS DEL MURO (localStorage - FALLBACK)
// ================================================================
function cargarPublicacionesLocal() {
    const saved = localStorage.getItem('sariels_muro');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {}
    }
    return [];
}

function guardarPublicacionesLocal(posts) {
    localStorage.setItem('sariels_muro', JSON.stringify(posts));
}

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let usuarioActual = null;
let publicaciones = [];
let paginaActual = 1;
let cargando = false;
let hayMas = true;
let modoOscuro = true;

// ================================================================
// ELEMENTOS DEL DOM
// ================================================================
const feedContainer = document.getElementById('feedContainer');
const postContent = document.getElementById('postContent');
const btnPublicar = document.getElementById('btnPublicar');
const btnCargarMas = document.getElementById('btnCargarMas');

// ================================================================
// CARGAR PUBLICACIONES DESDE EL BACKEND
// ================================================================
async function cargarPublicaciones(pagina = 1) {
    if (cargando) return;
    cargando = true;

    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            // Fallback: cargar desde localStorage
            const posts = cargarPublicacionesLocal();
            if (posts.length > 0) {
                renderizarFeedLocal(posts);
                hayMas = false;
                if (btnCargarMas) btnCargarMas.style.display = 'none';
            } else {
                mostrarSinPublicaciones();
            }
            cargando = false;
            return;
        }

        const response = await fetch(`/api/muro?page=${pagina}&limit=10`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('galleta_token');
                localStorage.removeItem('userId');
                window.location.href = '/';
                return;
            }
            throw new Error('Error al cargar publicaciones');
        }

        const data = await response.json();

        if (pagina === 1) {
            publicaciones = [];
            feedContainer.innerHTML = '';
        }

        if (data.publicaciones && data.publicaciones.length > 0) {
            data.publicaciones.forEach(post => {
                publicaciones.push(post);
                renderizarPublicacion(post);
            });

            hayMas = data.pagination && data.pagination.pages > pagina;
            if (btnCargarMas) {
                btnCargarMas.style.display = hayMas ? 'block' : 'none';
            }
        } else if (pagina === 1) {
            // Fallback: mostrar desde localStorage
            const posts = cargarPublicacionesLocal();
            if (posts.length > 0) {
                renderizarFeedLocal(posts);
            } else {
                mostrarSinPublicaciones();
            }
        }

        paginaActual = pagina;

    } catch (error) {
        console.error('Error cargando publicaciones:', error);
        // Fallback: mostrar desde localStorage
        const posts = cargarPublicacionesLocal();
        if (posts.length > 0) {
            renderizarFeedLocal(posts);
        } else if (pagina === 1) {
            mostrarErrorPublicaciones();
        }
    } finally {
        cargando = false;
    }
}

// ================================================================
// RENDERIZAR FEED LOCAL (FALLBACK)
// ================================================================
function renderizarFeedLocal(posts) {
    posts.sort((a, b) => {
        if (a.anclado && !b.anclado) return -1;
        if (!a.anclado && b.anclado) return 1;
        return new Date(b.fecha) - new Date(a.fecha);
    });

    feedContainer.innerHTML = '';
    posts.forEach(post => {
        // Convertir post de localStorage a formato compatible
        const postData = {
            _id: post.id || Date.now().toString(),
            autor: { nombre: post.autor || 'Explorador', fotoPerfil: '/default-avatar.png', verificado: true },
            contenido: post.contenido || '',
            createdAt: post.fecha || new Date().toISOString(),
            reacciones: { meGusta: post.likes || 0 },
            usuarioReacciono: post.liked || false,
            totalComentarios: post.comentarios ? post.comentarios.length : 0,
            comentarios: post.comentarios || [],
            imagen: post.imagen || null,
            tipo: post.tipo || 'texto',
            anclado: post.anclado || false,
            programado: post.programado || null,
            vistas: post.vistas || 0,
            encuesta: post.encuesta || null
        };
        renderizarPublicacion(postData);
    });

    if (btnCargarMas) btnCargarMas.style.display = 'none';
}

// ================================================================
// RENDERIZAR PUBLICACIÓN
// ================================================================
function renderizarPublicacion(post) {
    const esVenta = post.tipo === 'venta' || post.tipo === 'token';
    const autor = post.autor || { nombre: 'Usuario', fotoPerfil: '/default-avatar.png', verificado: false };
    const fecha = new Date(post.createdAt).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const reacciones = post.reacciones || {};
    const totalReacciones = Object.values(reacciones).reduce((a, b) => a + b, 0);
    const comentarios = post.comentarios || [];

    const postCard = document.createElement('div');
    postCard.className = 'post-card';
    postCard.dataset.id = post._id;

    // ===== ENCUESTA =====
    let encuestaHtml = '';
    if (post.encuesta) {
        const totalVotos = post.encuesta.opciones.reduce((sum, o) => sum + (o.votos || 0), 0);
        encuestaHtml = `
            <div class="post-encuesta">
                <div class="pregunta">📊 ${post.encuesta.pregunta}</div>
                ${post.encuesta.opciones.map((op, i) => {
                    const porcentaje = totalVotos > 0 ? Math.round((op.votos || 0) / totalVotos * 100) : 0;
                    return `
                        <div class="opcion" onclick="votarEncuesta('${post._id}', ${i})">
                            <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);">
                                <span>${op.icon || '○'} ${op.texto}</span>
                                <span style="color:var(--text-muted);font-size:0.65rem;">${op.votos || 0} (${porcentaje}%)</span>
                            </div>
                            <div class="barra"><div class="fill" style="width:${porcentaje}%;"></div></div>
                        </div>
                    `;
                }).join('')}
                <div class="total-votos">${totalVotos} votos totales</div>
            </div>
        `;
    }

    // ===== VENTA =====
    let ventaHtml = '';
    if (esVenta) {
        ventaHtml = `
            <div class="post-venta">
                <div>
                    <div class="precio">💰 ${post.precioToken || 0} pesos/token</div>
                    <div class="cantidad">📦 ${post.cantidadTokens || 0} tokens disponibles</div>
                </div>
                <button class="btn-comprar" onclick="comprarTokens('${post._id}')">Comprar</button>
            </div>
        `;
    }

    // ===== MEDIA =====
    let mediaHtml = '';
    if (post.imagen) {
        mediaHtml = `<div class="post-media"><img src="${post.imagen}" alt="Imagen" loading="lazy" /></div>`;
    } else if (post.video) {
        mediaHtml = `<div class="post-media"><video controls src="${post.video}"></video></div>`;
    }

    // ===== COMENTARIOS =====
    const comentariosHtml = comentarios.map(c => `
        <div class="comentario">
            <div class="avatar">${c.avatar || '◈'}</div>
            <div class="texto">
                <strong>${c.autor || 'Usuario'}</strong> ${c.texto}
                <div class="fecha">${c.fecha || 'Ahora'}</div>
            </div>
        </div>
    `).join('');

    postCard.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">
                <img src="${autor.fotoPerfil || '/default-avatar.png'}" alt="${autor.nombre}" />
            </div>
            <div>
                <div class="post-author">
                    ${autor.nombre || 'Usuario'}
                    ${autor.verificado ? '<span class="badge-verificado">✦ VERIFICADO</span>' : ''}
                    ${post.anclado ? '<span class="badge-anclado">📌 Anclado</span>' : ''}
                </div>
                <div class="post-date">${fecha} · 👁️ ${post.vistas || 0} vistas</div>
            </div>
        </div>
        <div class="post-content">${formatearContenido(post.contenido || '')}</div>
        ${ventaHtml}
        ${encuestaHtml}
        ${mediaHtml}
        <div class="post-stats">
            <span>❤️ ${totalReacciones}</span>
            <span>💬 ${post.totalComentarios || 0}</span>
            <span>👁️ ${post.vistas || 0}</span>
        </div>
        <div class="post-actions">
            <button class="like-btn ${post.usuarioReacciono ? 'liked' : ''}" onclick="toggleLike('${post._id}')">
                ❤️ <span class="count">${totalReacciones}</span>
            </button>
            <button onclick="toggleComentarios('${post._id}')">
                💬 <span class="count">${post.totalComentarios || 0}</span>
            </button>
            <button onclick="compartirPublicacion('${post._id}')">🔗 Compartir</button>
            <button onclick="generarQRPost('${post._id}')">📱 QR</button>
            ${post.anclado ? '' : `<button onclick="anclarPost('${post._id}')">📌</button>`}
            <button onclick="programarPost('${post._id}')">⏰</button>
        </div>
        <div class="post-comentarios" id="comentarios-${post._id}" style="display:none;">
            <div class="comentarios-lista">
                ${comentariosHtml}
                ${comentarios.length === 0 ? '<p style="color:#4a6a8a;font-size:0.8rem;text-align:center;padding:8px 0;">Sin comentarios</p>' : ''}
            </div>
            <div class="input-comentario">
                <input type="text" placeholder="Escribe un comentario..." id="comentario-input-${post._id}" />
                <button onclick="enviarComentario('${post._id}')">Enviar</button>
            </div>
        </div>
    `;

    if (feedContainer) feedContainer.appendChild(postCard);
}

// ================================================================
// FORMATEAR CONTENIDO (hashtags, menciones, links)
// ================================================================
function formatearContenido(texto) {
    if (!texto) return '';
    texto = texto.replace(/#(\w+)/g, '<span class="hashtag" onclick="buscarHashtag(\'$1\')">#$1</span>');
    texto = texto.replace(/@(\w+)/g, '<span class="hashtag" onclick="buscarUsuario(\'$1\')">@$1</span>');
    texto = texto.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--gold);text-decoration:underline;">$1</a>');
    return texto;
}

function buscarHashtag(tag) { showToast(`🔍 Buscando #${tag}...`); }
function buscarUsuario(user) { showToast(`🔍 Buscando @${user}...`); }

// ================================================================
// MOSTRAR ESTADOS VACÍOS / ERROR
// ================================================================
function mostrarSinPublicaciones() {
    if (!feedContainer) return;
    feedContainer.innerHTML = `
        <div class="empty-state">
            <span class="icon">📭</span>
            <h3>Sin publicaciones</h3>
            <p>Sé el primero en publicar algo</p>
        </div>
    `;
    if (btnCargarMas) btnCargarMas.style.display = 'none';
}

function mostrarErrorPublicaciones() {
    if (!feedContainer) return;
    feedContainer.innerHTML = `
        <div class="empty-state">
            <span class="icon">⚠️</span>
            <h3>Error al cargar</h3>
            <p>No pudimos cargar las publicaciones. Intenta de nuevo.</p>
            <button class="btn-accion" onclick="cargarPublicaciones(1)">🔄 Reintentar</button>
        </div>
    `;
}

// ================================================================
// PUBLICAR NUEVA PUBLICACIÓN
// ================================================================
async function publicar() {
    const contenido = postContent.value.trim();
    if (!contenido) {
        showToast('⚠️ Escribe algo para publicar', 'error');
        return;
    }

    const token = localStorage.getItem('galleta_token');
    if (!token) {
        // Publicar localmente (fallback)
        publicarLocal(contenido);
        return;
    }

    btnPublicar.disabled = true;
    btnPublicar.textContent = '⏳ Publicando...';

    try {
        const response = await fetch('/api/muro', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contenido: contenido,
                tipo: 'texto'
            })
        });

        if (!response.ok) throw new Error('Error al publicar');

        const data = await response.json();
        postContent.value = '';
        cargarPublicaciones(1);
        showToast('✅ Publicación creada');

    } catch (error) {
        console.error('Error publicando:', error);
        publicarLocal(contenido);
    } finally {
        btnPublicar.disabled = false;
        btnPublicar.textContent = '🚀 Publicar';
    }
}

// ================================================================
// PUBLICAR LOCAL (FALLBACK)
// ================================================================
function publicarLocal(contenido) {
    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const posts = cargarPublicacionesLocal();

    const nuevoPost = {
        id: Date.now(),
        autor: perfil.nombre || 'Explorador',
        avatar: perfil.avatar || '◈',
        verificado: true,
        contenido: contenido,
        fecha: new Date().toLocaleString(),
        likes: 0,
        liked: false,
        comentarios: [],
        vistas: Math.floor(Math.random() * 50) + 10,
        anclado: false,
        imagen: null,
        encuesta: null,
        programado: null,
        tipo: 'texto'
    };

    posts.unshift(nuevoPost);
    guardarPublicacionesLocal(posts);
    postContent.value = '';
    cargarPublicaciones(1);
    showToast('✅ Publicación creada (modo local)');
}

// ================================================================
// REACCIONES (LIKES CON MÚLTIPLES EMOJIS)
// ================================================================
const EMOJIS_REACCIONES = ['❤️', '👍', '😂', '😮', '😢'];

window.toggleLike = async function(postId) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            toggleLikeLocal(postId);
            return;
        }

        const response = await fetch('/api/muro/reaccion', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ postId, reaccion: 'meGusta' })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Error en like:', error);
            toggleLikeLocal(postId);
            return;
        }

        const data = await response.json();
        actualizarReacciones(postId, data.reacciones);

    } catch (error) {
        console.error('Error en like:', error);
        toggleLikeLocal(postId);
    }
};

function toggleLikeLocal(postId) {
    const posts = cargarPublicacionesLocal();
    const post = posts.find(p => p.id === postId || p.id === parseInt(postId));
    if (post) {
        post.liked = !post.liked;
        post.likes += post.liked ? 1 : -1;
        guardarPublicacionesLocal(posts);
        cargarPublicaciones(1);
    }
}

function actualizarReacciones(postId, reacciones) {
    const postCard = document.querySelector(`.post-card[data-id="${postId}"]`);
    if (!postCard) return;

    const total = Object.values(reacciones).reduce((a, b) => a + b, 0);
    const likeBtn = postCard.querySelector('.like-btn .count');
    if (likeBtn) likeBtn.textContent = total;
}

// ================================================================
// COMENTARIOS
// ================================================================
window.toggleComentarios = function(postId) {
    const container = document.getElementById(`comentarios-${postId}`);
    if (!container) return;

    const isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        cargarComentarios(postId);
        // Enfocar input
        setTimeout(() => {
            const input = document.getElementById(`comentario-input-${postId}`);
            if (input) input.focus();
        }, 200);
    }
};

async function cargarComentarios(postId) {
    try {
        const token = localStorage.getItem('galleta_token');
        const response = await fetch(`/api/muro/${postId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const lista = document.querySelector(`#comentarios-${postId} .comentarios-lista`);
            if (lista) {
                if (data.comentarios && data.comentarios.length > 0) {
                    lista.innerHTML = data.comentarios.map(c => `
                        <div class="comentario">
                            <div class="avatar">${c.usuario?.nombre?.[0] || '👤'}</div>
                            <div class="texto">
                                <strong>${c.usuario?.nombre || 'Usuario'}</strong>
                                ${c.contenido}
                            </div>
                        </div>
                    `).join('');
                } else {
                    lista.innerHTML = '<p style="color:#4a6a8a;font-size:0.8rem;text-align:center;padding:8px 0;">Sin comentarios</p>';
                }
            }
        }
    } catch (error) {
        console.error('Error cargando comentarios:', error);
    }
}

window.enviarComentario = async function(postId) {
    const input = document.getElementById(`comentario-input-${postId}`);
    if (!input) return;

    const contenido = input.value.trim();
    if (!contenido) {
        showToast('⚠️ Escribe un comentario', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            enviarComentarioLocal(postId, contenido);
            return;
        }

        const response = await fetch('/api/muro/comentario', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ postId, comentario: contenido })
        });

        if (response.ok) {
            input.value = '';
            cargarComentarios(postId);
            // Incrementar contador de comentarios
            const postCard = document.querySelector(`.post-card[data-id="${postId}"]`);
            if (postCard) {
                const countEl = postCard.querySelector('.post-actions button:nth-child(2) .count');
                if (countEl) {
                    const current = parseInt(countEl.textContent) || 0;
                    countEl.textContent = current + 1;
                }
            }
            showToast('✅ Comentario agregado');
        } else {
            const error = await response.json();
            showToast(`❌ ${error.error || 'Error al comentar'}`, 'error');
        }
    } catch (error) {
        console.error('Error enviando comentario:', error);
        enviarComentarioLocal(postId, contenido);
    }
};

function enviarComentarioLocal(postId, contenido) {
    const posts = cargarPublicacionesLocal();
    const post = posts.find(p => p.id === postId || p.id === parseInt(postId));
    if (post) {
        if (!post.comentarios) post.comentarios = [];
        const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
        post.comentarios.push({
            autor: perfil.nombre || 'Usuario',
            avatar: perfil.avatar || '◈',
            texto: contenido,
            fecha: new Date().toLocaleString()
        });
        guardarPublicacionesLocal(posts);
        cargarPublicaciones(1);
        showToast('✅ Comentario agregado (local)');
    }
}

// ================================================================
// COMPRAR TOKENS (P2P)
// ================================================================
window.comprarTokens = function(postId) {
    showToast('🛒 Función de compra de tokens en desarrollo');
};

// ================================================================
// COMPARTIR
// ================================================================
window.compartirPublicacion = function(postId) {
    const url = `${window.location.origin}/muro/${postId}`;
    const texto = `📢 Publicación en Sariel's\n🔗 ${url}`;

    if (navigator.share) {
        navigator.share({
            title: 'Publicación en Sariel\'s',
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
};

// ================================================================
// GENERAR QR DE PUBLICACIÓN
// ================================================================
window.generarQRPost = function(postId) {
    const url = `${window.location.origin}/muro/${postId}`;

    // Usar QRCode.js si está disponible
    if (typeof QRCode !== 'undefined') {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(5, 8, 15, 0.9);
            backdrop-filter: blur(20px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        modal.innerHTML = `
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:24px;padding:30px;text-align:center;max-width:400px;width:90%;">
                <h3 style="font-family:'Orbitron',monospace;color:var(--gold);font-size:1rem;margin-bottom:12px;">◈ QR de publicación</h3>
                <div id="qrContainer" style="background:white;padding:16px;border-radius:16px;display:inline-block;margin:0 auto;"></div>
                <p style="color:var(--text-muted);font-size:0.7rem;margin-top:12px;">Escanea para ver esta publicación</p>
                <button onclick="this.closest('div[style]').remove()" style="margin-top:16px;padding:8px 24px;border-radius:30px;border:1px solid var(--glass-border);background:transparent;color:var(--text-secondary);cursor:pointer;font-family:'Inter',sans-serif;">Cerrar</button>
            </div>
        `;
        document.body.appendChild(modal);

        try {
            new QRCode(document.getElementById('qrContainer'), {
                text: url,
                width: 200,
                height: 200,
                colorDark: '#0F2D1A',
                colorLight: '#ffffff'
            });
            showToast('📱 QR generado');
        } catch (e) {
            document.getElementById('qrContainer').innerHTML = '⚠️ Error generando QR';
            showToast('⚠️ Error generando QR', 'error');
        }
    } else {
        // Fallback: mostrar URL
        showToast(`📱 QR: ${url.substring(0, 50)}...`);
    }
};

// ================================================================
// ANCLAR PUBLICACIÓN
// ================================================================
window.anclarPost = async function(postId) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            anclarPostLocal(postId);
            return;
        }

        const response = await fetch(`/api/muro/anclar/${postId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            cargarPublicaciones(1);
            showToast('📌 Publicación anclada');
        } else {
            anclarPostLocal(postId);
        }
    } catch (error) {
        console.error('Error anclando:', error);
        anclarPostLocal(postId);
    }
};

function anclarPostLocal(postId) {
    const posts = cargarPublicacionesLocal();
    posts.forEach(p => p.anclado = false);
    const post = posts.find(p => p.id === postId || p.id === parseInt(postId));
    if (post) {
        post.anclado = true;
        guardarPublicacionesLocal(posts);
        cargarPublicaciones(1);
        showToast('📌 Publicación anclada (local)');
    }
}

// ================================================================
// PROGRAMAR PUBLICACIÓN
// ================================================================
window.programarPost = function(postId) {
    const fecha = prompt('📅 Fecha y hora para publicar (formato: YYYY-MM-DD HH:MM):');
    if (fecha) {
        const fechaObj = new Date(fecha);
        if (fechaObj > new Date()) {
            const posts = cargarPublicacionesLocal();
            const post = posts.find(p => p.id === postId || p.id === parseInt(postId));
            if (post) {
                post.programado = fechaObj.toISOString();
                guardarPublicacionesLocal(posts);
                showToast(`⏰ Publicación programada para ${fechaObj.toLocaleString()}`);
            }
        } else {
            showToast('⚠️ La fecha debe ser futura', 'error');
        }
    }
};

// ================================================================
// VOTAR ENCUESTA
// ================================================================
window.votarEncuesta = async function(postId, opcionIndex) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            showToast('⚠️ Conecta tu wallet primero', 'error');
            return;
        }

        const response = await fetch('/api/muro/encuesta/votar', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ postId, opcionIndex })
        });

        if (response.ok) {
            cargarPublicaciones(1);
            showToast('✅ Voto registrado');
        } else {
            const error = await response.json();
            showToast(`❌ ${error.error || 'Error al votar'}`, 'error');
        }
    } catch (error) {
        console.error('Error votando:', error);
        showToast('❌ Error al votar', 'error');
    }
};

// ================================================================
// AGREGAR IMAGEN
// ================================================================
window.agregarImagen = function() {
    const url = prompt('🖼️ Ingresa la URL de la imagen:');
    if (url && url.trim()) {
        const contenido = postContent.value.trim() || '📸 Imagen compartida';
        const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
        const posts = cargarPublicacionesLocal();

        const nuevoPost = {
            id: Date.now(),
            autor: perfil.nombre || 'Explorador',
            avatar: perfil.avatar || '◈',
            verificado: true,
            contenido: contenido,
            fecha: new Date().toLocaleString(),
            likes: 0,
            liked: false,
            comentarios: [],
            vistas: Math.floor(Math.random() * 50) + 5,
            anclado: false,
            imagen: url.trim(),
            encuesta: null,
            programado: null,
            tipo: 'imagen'
        };

        posts.unshift(nuevoPost);
        guardarPublicacionesLocal(posts);
        postContent.value = '';
        cargarPublicaciones(1);
        showToast('🖼️ Imagen publicada');
    }
};

// ================================================================
// CREAR ENCUESTA
// ================================================================
window.agregarEncuesta = function() {
    const pregunta = prompt('📊 Pregunta de la encuesta:');
    if (!pregunta) return;

    const opciones = [];
    for (let i = 0; i < 4; i++) {
        const opcion = prompt(`Opción ${i + 1} (deja vacío para terminar):`);
        if (!opcion) break;
        opciones.push({
            texto: opcion,
            icon: ['○', '●', '◐', '◑'][i] || '○',
            votos: 0
        });
    }

    if (opciones.length < 2) {
        showToast('⚠️ Necesitas al menos 2 opciones', 'error');
        return;
    }

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const posts = cargarPublicacionesLocal();
    const contenido = postContent.value.trim() || `📊 Encuesta: ${pregunta}`;

    const nuevoPost = {
        id: Date.now(),
        autor: perfil.nombre || 'Explorador',
        avatar: perfil.avatar || '◈',
        verificado: true,
        contenido: contenido,
        fecha: new Date().toLocaleString(),
        likes: 0,
        liked: false,
        comentarios: [],
        vistas: Math.floor(Math.random() * 50) + 5,
        anclado: false,
        imagen: null,
        encuesta: {
            pregunta: pregunta,
            opciones: opciones,
            votado: false
        },
        programado: null,
        tipo: 'encuesta'
    };

    posts.unshift(nuevoPost);
    guardarPublicacionesLocal(posts);
    postContent.value = '';
    cargarPublicaciones(1);
    showToast('📊 Encuesta publicada');
};

// ================================================================
// MODO OSCURO/CLARO
// ================================================================
function toggleModo() {
    modoOscuro = !modoOscuro;
    const body = document.body;
    if (modoOscuro) {
        body.classList.remove('modo-claro');
        localStorage.setItem('sariels_modo', 'oscuro');
        showToast('🌙 Modo oscuro');
    } else {
        body.classList.add('modo-claro');
        localStorage.setItem('sariels_modo', 'claro');
        showToast('☀️ Modo claro');
    }
}

function cargarModo() {
    const modo = localStorage.getItem('sariels_modo');
    if (modo === 'claro') {
        modoOscuro = false;
        document.body.classList.add('modo-claro');
    }
}

// ================================================================
// FUNCIONES DE HERRAMIENTAS (para el HTML)
// ================================================================
function insertarHashtag() {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    textarea.value = textBefore + '#' + textAfter;
    textarea.focus();
    textarea.selectionStart = cursorPos + 1;
    textarea.selectionEnd = cursorPos + 1;
    showToast('✎ Hashtag agregado');
}

function insertarEmoji() {
    const emojis = ['😊', '🔥', '✨', '🌟', '💎', '🚀', '🎯', '🏆', '⭐', '💫'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    textarea.value = textBefore + emoji + textAfter;
    textarea.focus();
    textarea.selectionStart = cursorPos + 1;
    textarea.selectionEnd = cursorPos + 1;
}

// ================================================================
// EVENTOS
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    cargarModo();
    cargarPublicaciones(1);

    if (btnPublicar) {
        btnPublicar.addEventListener('click', publicar);
    }

    if (postContent) {
        postContent.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                publicar();
            }
        });
    }

    if (btnCargarMas) {
        btnCargarMas.addEventListener('click', function() {
            cargarPublicaciones(paginaActual + 1);
        });
    }

    // Botón de modo oscuro/claro
    const btnModo = document.createElement('button');
    btnModo.textContent = '🌙';
    btnModo.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 999;
        padding: 10px 14px;
        border-radius: 50%;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--gold);
        cursor: pointer;
        font-size: 1.2rem;
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
    `;
    btnModo.onmouseover = () => btnModo.style.transform = 'scale(1.1)';
    btnModo.onmouseout = () => btnModo.style.transform = 'scale(1)';
    btnModo.onclick = toggleModo;
    document.body.appendChild(btnModo);

    // Verificar wallet
    const token = localStorage.getItem('galleta_token');
    const connectBtn = document.getElementById('connectWallet');
    if (token && connectBtn) {
        connectBtn.textContent = '✅ Conectado';
        connectBtn.disabled = true;
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', function() {
            window.location.href = '/';
        });
    }

    console.log('◈ Sariel\'s - Muro Ultra Mega Pro');
    console.log('🚀 Competencia de Silicon Valley');
    console.log('🔑 Innovaciones: Reacciones, Comentarios anidados, QR, Imágenes, Encuestas, Trending, Modo oscuro, Anclaje, Programación');
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.publicar = publicar;
window.toggleLike = toggleLike;
window.toggleComentarios = toggleComentarios;
window.enviarComentario = enviarComentario;
window.compartirPublicacion = compartirPublicacion;
window.generarQRPost = generarQRPost;
window.anclarPost = anclarPost;
window.programarPost = programarPost;
window.votarEncuesta = votarEncuesta;
window.comprarTokens = comprarTokens;
window.agregarImagen = agregarImagen;
window.agregarEncuesta = agregarEncuesta;
window.insertarHashtag = insertarHashtag;
window.insertarEmoji = insertarEmoji;
window.buscarHashtag = buscarHashtag;
window.buscarUsuario = buscarUsuario;
window.toggleModo = toggleModo;
window.cargarPublicaciones = cargarPublicaciones;