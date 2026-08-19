// features/muro/muro.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let socket = null;
    let paginaActual = 1;
    let cargando = false;
    let archivoSeleccionado = null;
    let tipoArchivo = null; // 'image' o 'video'
    let vistaActual = 'feed'; // 'feed', 'mis', 'ventas'

    // ========================================
    // CONEXIÓN A SOCKET.IO
    // ========================================
    function conectarSocket() {
        const token = localStorage.getItem('galleta_token');
        if (!token) return;

        socket = io('/', {
            auth: { token }
        });

        socket.on('connect', () => {
            console.log('🔌 Conectado al servidor');
            const userId = localStorage.getItem('userId');
            if (userId) {
                socket.emit('authenticate', { userId });
            }
        });

        socket.on('new_post', (data) => {
            agregarPublicacionAlFeed(data);
            mostrarNotificacion(`📱 ${data.autor.nombre} ha publicado algo`);
        });

        socket.on('post_updated', (data) => {
            actualizarReaccionesPost(data.postId, data.reacciones);
        });
    }

    // ========================================
    // CARGAR DATOS DEL USUARIO
    // ========================================
    async function cargarUsuario() {
        try {
            const token = localStorage.getItem('galleta_token');
            if (!token) {
                window.location.href = '/';
                return;
            }

            const response = await fetch('/api/perfil', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('galleta_token');
                    localStorage.removeItem('userId');
                    window.location.href = '/';
                }
                throw new Error('Error al cargar usuario');
            }

            usuarioActual = await response.json();
            localStorage.setItem('userId', usuarioActual._id);

            // Actualizar foto en el creador
            const fotoPerfil = document.getElementById('crearFotoPerfil');
            if (usuarioActual.fotoPerfil) {
                fotoPerfil.src = usuarioActual.fotoPerfil;
            }

        } catch (error) {
            console.error('Error cargando usuario:', error);
        }
    }

    // ========================================
    // CARGAR PUBLICACIONES
    // ========================================
    async function cargarPublicaciones(pagina = 1, tipo = null) {
        if (cargando) return;
        cargando = true;

        try {
            const token = localStorage.getItem('galleta_token');
            let url = `/api/muro?page=${pagina}&limit=10`;

            if (tipo === 'mis') {
                url += '&autor=yo';
            } else if (tipo === 'ventas') {
                url += '&tipo=venta';
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar publicaciones');

            const data = await response.json();

            if (pagina === 1) {
                document.getElementById('feedPublicaciones').innerHTML = '';
            }

            if (data.publicaciones && data.publicaciones.length > 0) {
                data.publicaciones.forEach(post => {
                    renderizarPublicacion(post);
                });

                // Mostrar botón "Cargar más" si hay más páginas
                const cargarMas = document.getElementById('cargarMas');
                if (data.pagination && data.pagination.pages > pagina) {
                    cargarMas.classList.remove('hidden');
                } else {
                    cargarMas.classList.add('hidden');
                }
            } else if (pagina === 1) {
                document.getElementById('feedPublicaciones').innerHTML = `
                    <div class="sin-publicaciones">
                        <span class="icono">📭</span>
                        <p>No hay publicaciones aún</p>
                        <p style="font-size:0.85rem;opacity:0.5;">Sé el primero en publicar algo</p>
                    </div>
                `;
            }

            paginaActual = pagina;

        } catch (error) {
            console.error('Error cargando publicaciones:', error);
            mostrarNotificacion('❌ Error al cargar publicaciones', 'error');
        } finally {
            cargando = false;
        }
    }

    // ========================================
    // RENDERIZAR PUBLICACIÓN
    // ========================================
    function renderizarPublicacion(post) {
        const feed = document.getElementById('feedPublicaciones');

        // Eliminar mensaje de "sin publicaciones"
        const sinPub = feed.querySelector('.sin-publicaciones');
        if (sinPub) sinPub.remove();

        const isMiPublicacion = usuarioActual && post.autor._id === usuarioActual._id;

        // Calcular reacciones totales para mostrar
        const reacciones = post.reacciones || {};
        const totalReacciones = Object.values(reacciones).reduce((a, b) => a + b, 0);

        const esVenta = post.tipo === 'venta' || post.tipo === 'token';

        // Verificar si el usuario ya reaccionó
        let reaccionUsuario = null;
        if (usuarioActual && post.usuariosReaccionaron) {
            const found = post.usuariosReaccionaron.find(
                u => u.usuario && u.usuario._id === usuarioActual._id
            );
            if (found) reaccionUsuario = found.reaccion;
        }

        const html = `
            <div class="publicacion" data-id="${post._id}">
                <!-- Cabecera -->
                <div class="publicacion-header">
                    <img src="${post.autor.fotoPerfil || '/default-avatar.png'}" 
                         alt="${post.autor.nombre}" 
                         onclick="verPerfil('${post.autor._id}')" />
                    <div class="info">
                        <span class="nombre" onclick="verPerfil('${post.autor._id}')">${post.autor.nombre || 'Usuario'}</span>
                        <div class="fecha">${formatearFecha(post.createdAt)}</div>
                    </div>
                    ${esVenta ? '<span class="badge-venta">💰 Venta</span>' : ''}
                </div>

                <!-- Cuerpo -->
                <div class="publicacion-body">
                    ${post.contenido ? `<div class="contenido">${post.contenido}</div>` : ''}
                    
                    ${esVenta ? `
                        <div class="publicacion-venta-info">
                            <div class="precio">💰 ${post.precioToken || '0'} pesos/token</div>
                            <div class="cantidad">📦 ${post.cantidadTokens || '0'} tokens disponibles</div>
                        </div>
                    ` : ''}

                    ${post.imagen ? `
                        <div class="publicacion-media">
                            <img src="${post.imagen}" alt="Imagen de la publicación" loading="lazy" />
                        </div>
                    ` : ''}

                    ${post.video ? `
                        <div class="publicacion-media">
                            <video controls>
                                <source src="${post.video}" type="video/mp4" />
                                Tu navegador no soporta video
                            </video>
                        </div>
                    ` : ''}
                </div>

                <!-- Reacciones -->
                ${totalReacciones > 0 ? `
                    <div class="publicacion-reacciones">
                        ${Object.entries(reacciones).filter(([_, count]) => count > 0).map(([tipo, count]) => `
                            <span class="reaccion-item">
                                <span class="emoji">${getEmojiReaccion(tipo)}</span>
                                <span class="count">${count}</span>
                            </span>
                        `).join('')}
                    </div>
                ` : ''}

                <!-- Acciones -->
                <div class="publicacion-acciones">
                    <button class="accion-btn ${reaccionUsuario ? 'reaccionado' : ''}" onclick="mostrarReacciones('${post._id}')">
                        <span class="emoji">❤️</span>
                        <span class="contador">${totalReacciones || 0}</span>
                    </button>
                    <button class="accion-btn" onclick="comentarPost('${post._id}')">
                        💬 Comentar
                    </button>
                    ${isMiPublicacion ? `
                        <button class="accion-btn" onclick="eliminarPublicacion('${post._id}')" style="color:#e17055;">
                            🗑️ Eliminar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // Insertar al inicio o al final según contexto
        if (paginaActual === 1 && document.querySelector('.publicacion')) {
            feed.insertAdjacentHTML('afterbegin', html);
        } else {
            feed.insertAdjacentHTML('beforeend', html);
        }
    }

    // ========================================
    // AGREGAR PUBLICACIÓN AL FEED (SOCKET)
    // ========================================
    function agregarPublicacionAlFeed(data) {
        const post = data.post;
        post.autor = data.autor;
        renderizarPublicacion(post);
        mostrarNotificacion(`📱 ${data.autor.nombre} ha publicado algo`);
    }

    // ========================================
    // ACTUALIZAR REACCIONES
    // ========================================
    function actualizarReaccionesPost(postId, reacciones) {
        const postEl = document.querySelector(`.publicacion[data-id="${postId}"]`);
        if (!postEl) return;

        const reaccionesContainer = postEl.querySelector('.publicacion-reacciones');
        const total = Object.values(reacciones).reduce((a, b) => a + b, 0);

        // Actualizar contador de reacciones
        const btnReaccion = postEl.querySelector('.accion-btn:first-child .contador');
        if (btnReaccion) btnReaccion.textContent = total || 0;

        // Actualizar lista de reacciones
        if (reaccionesContainer) {
            const entries = Object.entries(reacciones).filter(([_, count]) => count > 0);
            if (entries.length > 0) {
                reaccionesContainer.innerHTML = entries.map(([tipo, count]) => `
                    <span class="reaccion-item">
                        <span class="emoji">${getEmojiReaccion(tipo)}</span>
                        <span class="count">${count}</span>
                    </span>
                `).join('');
                reaccionesContainer.style.display = 'flex';
            } else {
                reaccionesContainer.style.display = 'none';
            }
        }
    }

    // ========================================
    // PUBLICAR
    // ========================================
    async function publicar() {
        const contenido = document.getElementById('inputPublicacion').value.trim();
        const tipo = document.querySelector('.crear-btn.publicar').dataset.tipo || 'texto';
        const cantidadTokens = document.getElementById('ventaCantidad').value;
        const precioToken = document.getElementById('ventaPrecio').value;

        // Validar contenido
        if (!contenido && !archivoSeleccionado) {
            mostrarNotificacion('⚠️ Escribe algo o adjunta un archivo', 'error');
            return;
        }

        // Validar venta
        if (tipo === 'venta' || tipo === 'token') {
            if (!cantidadTokens || cantidadTokens < 1) {
                mostrarNotificacion('⚠️ Ingresa la cantidad de tokens a vender', 'error');
                return;
            }
            if (!precioToken || precioToken < 1) {
                mostrarNotificacion('⚠️ Ingresa el precio por token', 'error');
                return;
            }
        }

        const token = localStorage.getItem('galleta_token');
        const button = document.getElementById('btnPublicar');
        button.disabled = true;
        button.textContent = '⏳ Publicando...';

        try {
            const formData = new FormData();
            formData.append('contenido', contenido || '');
            formData.append('tipo', tipo);

            if (tipo === 'venta' || tipo === 'token') {
                formData.append('cantidadTokens', cantidadTokens);
                formData.append('precioToken', precioToken);
            }

            if (archivoSeleccionado) {
                formData.append('archivo', archivoSeleccionado);
                formData.append('tipoArchivo', tipoArchivo);
            }

            const response = await fetch('/api/muro', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Error al publicar');

            const data = await response.json();
            mostrarNotificacion('✅ Publicado exitosamente');

            // Limpiar formulario
            document.getElementById('inputPublicacion').value = '';
            document.getElementById('ventaCantidad').value = '';
            document.getElementById('ventaPrecio').value = '';
            document.getElementById('previewContainer').classList.add('hidden');
            document.getElementById('ventaCampos').classList.add('hidden');
            archivoSeleccionado = null;
            tipoArchivo = null;

            // Recargar feed
            paginaActual = 1;
            await cargarPublicaciones(1, vistaActual === 'feed' ? null : vistaActual);

        } catch (error) {
            console.error('Error publicando:', error);
            mostrarNotificacion('❌ Error al publicar', 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Publicar';
        }
    }

    // ========================================
    // MOSTRAR REACCIONES
    // ========================================
    window.mostrarReacciones = function(postId) {
        // Mostrar selector de reacciones
        const opciones = [
            { emoji: '❤️', tipo: 'meGusta' },
            { emoji: '😂', tipo: 'meDivierte' },
            { emoji: '😍', tipo: 'meEncanta' },
            { emoji: '😢', tipo: 'meEntristese' },
            { emoji: '😡', tipo: 'meEnoja' }
        ];

        const html = opciones.map(o =>
            `<button onclick="enviarReaccion('${postId}', '${o.tipo}')" style="font-size:2rem;background:none;border:none;cursor:pointer;padding:5px 10px;border-radius:10px;transition:all 0.2s;">${o.emoji}</button>`
        ).join('');

        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--verde-bosque);
            padding: 15px 25px;
            border-radius: var(--radius);
            border: 1px solid var(--dorado);
            box-shadow: var(--glow-dorado);
            z-index: 9999;
            display: flex;
            gap: 5px;
        `;
        modal.innerHTML = html;
        document.body.appendChild(modal);

        // Cerrar al hacer clic fuera
        setTimeout(() => {
            document.addEventListener('click', function cerrar(e) {
                if (!modal.contains(e.target)) {
                    modal.remove();
                    document.removeEventListener('click', cerrar);
                }
            }, { once: true });
        }, 100);
    };

    // ========================================
    // ENVIAR REACCIÓN
    // ========================================
    window.enviarReaccion = async function(postId, reaccion) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/muro/reaccion', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ postId, reaccion })
            });

            if (response.ok) {
                const data = await response.json();

                // Actualizar UI
                const postEl = document.querySelector(`.publicacion[data-id="${postId}"]`);
                if (postEl) {
                    // Marcar botón como reaccionado
                    const btn = postEl.querySelector('.accion-btn:first-child');
                    if (btn) btn.classList.add('reaccionado');

                    // Actualizar contador
                    const total = Object.values(data.reacciones).reduce((a, b) => a + b, 0);
                    const contador = btn?.querySelector('.contador');
                    if (contador) contador.textContent = total;
                }

                // Cerrar modal
                const modal = document.querySelector('div[style*="position: fixed; bottom: 100px;"]');
                if (modal) modal.remove();

                mostrarNotificacion(`✅ Reacción enviada`);
            }
        } catch (error) {
            console.error('Error reaccionando:', error);
        }
    };

    // ========================================
    // COMENTAR
    // ========================================
    window.comentarPost = function(postId) {
        const comentario = prompt('Escribe tu comentario:');
        if (comentario && comentario.trim().length > 0) {
            enviarComentario(postId, comentario.trim());
        }
    };

    async function enviarComentario(postId, comentario) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/muro/comentario', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ postId, comentario })
            });

            if (response.ok) {
                mostrarNotificacion('✅ Comentario agregado');
            } else {
                throw new Error('Error al comentar');
            }
        } catch (error) {
            console.error('Error comentando:', error);
            mostrarNotificacion('❌ Error al comentar', 'error');
        }
    }

    // ========================================
    // ELIMINAR PUBLICACIÓN
    // ========================================
    window.eliminarPublicacion = async function(postId) {
        if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/muro/${postId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const postEl = document.querySelector(`.publicacion[data-id="${postId}"]`);
                if (postEl) postEl.remove();
                mostrarNotificacion('🗑️ Publicación eliminada');
            }
        } catch (error) {
            console.error('Error eliminando:', error);
            mostrarNotificacion('❌ Error al eliminar', 'error');
        }
    };

    // ========================================
    // VER PERFIL
    // ========================================
    window.verPerfil = function(userId) {
        window.location.href = `/features/perfil/perfil.html?id=${userId}`;
    };

    // ========================================
    // UTILIDADES
    // ========================================
    function formatearFecha(fecha) {
        const diff = Date.now() - new Date(fecha).getTime();
        const minutos = Math.floor(diff / 60000);
        const horas = Math.floor(diff / 3600000);
        const dias = Math.floor(diff / 86400000);

        if (minutos < 1) return 'Ahora mismo';
        if (minutos < 60) return `Hace ${minutos} min`;
        if (horas < 24) return `Hace ${horas} h`;
        if (dias < 7) return `Hace ${dias} d`;
        return new Date(fecha).toLocaleDateString();
    }

    function getEmojiReaccion(tipo) {
        const emojis = {
            meGusta: '❤️',
            meDivierte: '😂',
            meEncanta: '😍',
            meEntristese: '😢',
            meEnoja: '😡'
        };
        return emojis[tipo] || '❤️';
    }

    function mostrarNotificacion(mensaje, tipo = 'success') {
        const existing = document.querySelector('.notification-toast');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.className = 'notification-toast';
        div.textContent = mensaje;
        div.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 14px 24px;
            background: ${tipo === 'success' ? 'var(--dorado)' : tipo === 'error' ? '#e17055' : '#0984e3'};
            color: ${tipo === 'success' ? 'var(--verde-bosque-dark)' : 'white'};
            border-radius: 12px;
            z-index: 9999;
            max-width: 400px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            animation: slideIn 0.4s ease;
            font-weight: 500;
            font-size: 0.95rem;
        `;
        document.body.appendChild(div);

        setTimeout(() => {
            div.style.animation = 'slideOut 0.4s ease';
            setTimeout(() => div.remove(), 500);
        }, 4000);
    }

    // ========================================
    // EVENTOS - CREAR PUBLICACIÓN
    // ========================================

    // Botón Foto
    document.getElementById('btnFoto').addEventListener('click', function() {
        document.getElementById('inputFile').accept = 'image/*';
        document.getElementById('inputFile').click();
    });

    // Botón Video
    document.getElementById('btnVideo').addEventListener('click', function() {
        document.getElementById('inputFile').accept = 'video/*';
        document.getElementById('inputFile').click();
    });

    // Botón Vender
    document.getElementById('btnVender').addEventListener('click', function() {
        const campos = document.getElementById('ventaCampos');
        campos.classList.toggle('hidden');
        const btn = this;
        btn.textContent = campos.classList.contains('hidden') ? '💰 Vender tokens' : '💰 Ocultar venta';
        if (!campos.classList.contains('hidden')) {
            document.querySelector('.crear-btn.publicar').dataset.tipo = 'venta';
        } else {
            document.querySelector('.crear-btn.publicar').dataset.tipo = 'texto';
        }
    });

    // Seleccionar archivo
    document.getElementById('inputFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        archivoSeleccionado = file;
        tipoArchivo = file.type.startsWith('image') ? 'image' : 'video';

        const preview = document.getElementById('previewContainer');
        const img = document.getElementById('previewImage');
        const url = URL.createObjectURL(file);

        if (tipoArchivo === 'image') {
            img.src = url;
            img.style.display = 'block';
            document.querySelector('#previewContainer video')?.remove();
        } else {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.style.maxWidth = '100%';
            video.style.maxHeight = '300px';
            video.style.borderRadius = '8px';
            video.id = 'previewVideo';
            img.style.display = 'none';
            const existing = document.getElementById('previewVideo');
            if (existing) existing.remove();
            preview.appendChild(video);
        }

        preview.classList.remove('hidden');
        this.value = '';
    });

    // Eliminar preview
    document.getElementById('eliminarPreview').addEventListener('click', function() {
        document.getElementById('previewContainer').classList.add('hidden');
        document.getElementById('previewImage').src = '';
        archivoSeleccionado = null;
        tipoArchivo = null;
        const video = document.getElementById('previewVideo');
        if (video) video.remove();
    });

    // Publicar
    document.getElementById('btnPublicar').addEventListener('click', publicar);

    // Enter para publicar
    document.getElementById('inputPublicacion').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            publicar();
        }
    });

    // ========================================
    // EVENTOS - NAVEGACIÓN
    // ========================================

    document.getElementById('btnFeed').addEventListener('click', function() {
        actualizarNav('feed');
        vistaActual = 'feed';
        paginaActual = 1;
        document.getElementById('feedPublicaciones').innerHTML =
            '<div class="loading-spinner"><span>Cargando publicaciones...</span></div>';
        cargarPublicaciones(1);
    });

    document.getElementById('btnMisPublicaciones').addEventListener('click', function() {
        actualizarNav('mis');
        vistaActual = 'mis';
        paginaActual = 1;
        document.getElementById('feedPublicaciones').innerHTML =
            '<div class="loading-spinner"><span>Cargando tus publicaciones...</span></div>';
        cargarPublicaciones(1, 'mis');
    });

    document.getElementById('btnVentas').addEventListener('click', function() {
        actualizarNav('ventas');
        vistaActual = 'ventas';
        paginaActual = 1;
        document.getElementById('feedPublicaciones').innerHTML =
            '<div class="loading-spinner"><span>Cargando ventas...</span></div>';
        cargarPublicaciones(1, 'ventas');
    });

    function actualizarNav(active) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const map = {
            feed: 'btnFeed',
            mis: 'btnMisPublicaciones',
            ventas: 'btnVentas'
        };
        document.getElementById(map[active]).classList.add('active');
    }

    // Cargar más
    document.getElementById('cargarMas').addEventListener('click', function() {
        const tipo = vistaActual === 'feed' ? null : vistaActual;
        cargarPublicaciones(paginaActual + 1, tipo);
    });

    // ========================================
    // INICIALIZAR
    // ========================================

    // Animaciones CSS
    const styleAnim = document.createElement('style');
    styleAnim.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(30px); }
        }
        .publicacion {
            animation: slideIn 0.4s ease;
        }
    `;
    document.head.appendChild(styleAnim);

    // Cargar datos
    cargarUsuario().then(() => {
        cargarPublicaciones(1);
    });

    // Conectar Socket
    conectarSocket();

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