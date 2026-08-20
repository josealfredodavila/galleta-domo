// public/features/muro/muro.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let publicaciones = [];
    let paginaActual = 1;
    let cargando = false;
    let hayMas = true;

    // ========================================
    // ELEMENTOS DEL DOM
    // ========================================
    const feedContainer = document.getElementById('feedContainer');
    const postContent = document.getElementById('postContent');
    const btnPublicar = document.getElementById('btnPublicar');
    const btnCargarMas = document.getElementById('btnCargarMas');

    // ========================================
    // CARGAR PUBLICACIONES DESDE EL BACKEND
    // ========================================
    async function cargarPublicaciones(pagina = 1) {
        if (cargando) return;
        cargando = true;

        try {
            const token = localStorage.getItem('galleta_token');
            if (!token) {
                mostrarSinPublicaciones();
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
                mostrarSinPublicaciones();
            }

            paginaActual = pagina;

        } catch (error) {
            console.error('Error cargando publicaciones:', error);
            if (pagina === 1) {
                mostrarErrorPublicaciones();
            }
        } finally {
            cargando = false;
        }
    }

    // ========================================
    // RENDERIZAR PUBLICACIÓN
    // ========================================
    function renderizarPublicacion(post) {
        const esVenta = post.tipo === 'venta' || post.tipo === 'token';
        const autor = post.autor || { nombre: 'Usuario', fotoPerfil: '/default-avatar.png' };
        const fecha = new Date(post.createdAt).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const reacciones = post.reacciones || {};
        const totalReacciones = Object.values(reacciones).reduce((a, b) => a + b, 0);

        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.dataset.id = post._id;

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

        let mediaHtml = '';
        if (post.imagen) {
            mediaHtml = `<div class="post-media"><img src="${post.imagen}" alt="Imagen de la publicación" loading="lazy" /></div>`;
        } else if (post.video) {
            mediaHtml = `<div class="post-media"><video controls src="${post.video}"></video></div>`;
        }

        postCard.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">
                    <img src="${autor.fotoPerfil || '/default-avatar.png'}" alt="${autor.nombre}" />
                </div>
                <div>
                    <div class="post-author">
                        ${autor.nombre || 'Usuario'}
                        ${post.autor?.verificado ? '<span class="badge-verificado">✦ VERIFICADO</span>' : ''}
                    </div>
                    <div class="post-date">${fecha}</div>
                </div>
            </div>
            <div class="post-content">${post.contenido || ''}</div>
            ${ventaHtml}
            ${mediaHtml}
            <div class="post-actions">
                <button class="like-btn ${post.usuarioReacciono ? 'liked' : ''}" onclick="toggleLike('${post._id}')">
                    ❤️ <span class="count">${totalReacciones}</span>
                </button>
                <button onclick="toggleComentarios('${post._id}')">
                    💬 <span class="count">${post.totalComentarios || 0}</span>
                </button>
                <button onclick="compartirPublicacion('${post._id}')">🔗 Compartir</button>
            </div>
            <div class="post-comentarios" id="comentarios-${post._id}" style="display:none;">
                <div class="comentarios-lista"></div>
                <div class="input-comentario">
                    <input type="text" placeholder="Escribe un comentario..." id="comentario-input-${post._id}" />
                    <button onclick="enviarComentario('${post._id}')">Enviar</button>
                </div>
            </div>
        `;

        feedContainer.appendChild(postCard);
    }

    // ========================================
    // MOSTRAR ESTADOS VACÍOS / ERROR
    // ========================================
    function mostrarSinPublicaciones() {
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
        feedContainer.innerHTML = `
            <div class="empty-state">
                <span class="icon">⚠️</span>
                <h3>Error al cargar</h3>
                <p>No pudimos cargar las publicaciones. Intenta de nuevo.</p>
                <button class="btn-accion" onclick="cargarPublicaciones(1)">🔄 Reintentar</button>
            </div>
        `;
    }

    // ========================================
    // PUBLICAR NUEVA PUBLICACIÓN
    // ========================================
    async function publicar() {
        const contenido = postContent.value.trim();
        if (!contenido) {
            alert('Escribe algo para publicar');
            return;
        }

        const token = localStorage.getItem('galleta_token');
        if (!token) {
            alert('Conecta tu wallet primero');
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

        } catch (error) {
            console.error('Error publicando:', error);
            alert('❌ Error al publicar. Intenta de nuevo.');
        } finally {
            btnPublicar.disabled = false;
            btnPublicar.textContent = '📤 Publicar';
        }
    }

    // ========================================
    // REACCIONES (LIKE)
    // ========================================
    window.toggleLike = async function(postId) {
        try {
            const token = localStorage.getItem('galleta_token');
            if (!token) return;

            const response = await fetch('/api/muro/reaccion', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ postId, reaccion: 'meGusta' })
            });

            if (response.ok) {
                const data = await response.json();
                actualizarReacciones(postId, data.reacciones);
            }
        } catch (error) {
            console.error('Error en like:', error);
        }
    };

    function actualizarReacciones(postId, reacciones) {
        const postCard = document.querySelector(`.post-card[data-id="${postId}"]`);
        if (!postCard) return;

        const total = Object.values(reacciones).reduce((a, b) => a + b, 0);
        const likeBtn = postCard.querySelector('.like-btn .count');
        if (likeBtn) likeBtn.textContent = total;
    }

    // ========================================
    // COMENTARIOS
    // ========================================
    window.toggleComentarios = function(postId) {
        const container = document.getElementById(`comentarios-${postId}`);
        if (!container) return;

        const isVisible = container.style.display !== 'none';
        container.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            cargarComentarios(postId);
        }
    };

    async function cargarComentarios(postId) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/muro/${postId}/comentarios`, {
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
        if (!contenido) return;

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/muro/comentario`, {
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
            }
        } catch (error) {
            console.error('Error enviando comentario:', error);
        }
    };

    // ========================================
    // COMPRAR TOKENS (P2P)
    // ========================================
    window.comprarTokens = function(postId) {
        alert('🛒 Función de compra de tokens en desarrollo');
    };

    // ========================================
    // COMPARTIR
    // ========================================
    window.compartirPublicacion = function(postId) {
        const url = `${window.location.origin}/muro/${postId}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('🔗 Enlace copiado al portapapeles');
        }).catch(() => {
            prompt('Copia este enlace:', url);
        });
    };

    // ========================================
    // EVENTOS
    // ========================================
    btnPublicar.addEventListener('click', publicar);

    postContent.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            publicar();
        }
    });

    if (btnCargarMas) {
        btnCargarMas.addEventListener('click', function() {
            cargarPublicaciones(paginaActual + 1);
        });
    }

    // ========================================
    // INICIALIZAR
    // ========================================
    cargarPublicaciones(1);

    // Verificar wallet
    const token = localStorage.getItem('galleta_token');
    if (token) {
        document.getElementById('connectWallet').textContent = '✅ Conectado';
        document.getElementById('connectWallet').disabled = true;
    }

    document.getElementById('connectWallet').addEventListener('click', function() {
        window.location.href = '/';
    });

});