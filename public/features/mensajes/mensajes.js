// public/features/mensajes/mensajes.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let socket = null;
    let conversacionActual = null;
    let mensajesCargados = [];

    // ========================================
    // ELEMENTOS DEL DOM
    // ========================================
    const conversacionesList = document.getElementById('conversacionesList');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const btnEnviar = document.getElementById('btnEnviar');
    const chatNombre = document.querySelector('.chat-nombre');
    const chatEstado = document.querySelector('.chat-estado');
    const chatAvatar = document.querySelector('.chat-avatar');

    // ========================================
    // CONEXIÓN A SOCKET.IO
    // ========================================
    function conectarSocket() {
        const token = localStorage.getItem('galleta_token');
        if (!token) return;

        const socketUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3001'
            : window.location.origin;

        socket = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('🔌 Conectado al servidor de mensajería');
            const userId = localStorage.getItem('userId');
            if (userId) {
                socket.emit('authenticate', { userId });
            }
        });

        socket.on('authenticated', (data) => {
            console.log('✅ Autenticado en Socket.IO');
        });

        socket.on('new_message', (data) => {
            const mensaje = data.mensaje;
            const de = data.de;

            // Si la conversación actual es con quien envió el mensaje
            if (conversacionActual && conversacionActual._id === de) {
                agregarMensajeAlChat(mensaje, false);
                marcarMensajesComoLeidos(de);
            }

            // Actualizar lista de conversaciones
            cargarConversaciones();
        });

        socket.on('user_online', (data) => {
            actualizarEstadoContacto(data.userId, true);
        });

        socket.on('user_offline', (data) => {
            actualizarEstadoContacto(data.userId, false);
        });

        socket.on('disconnect', () => {
            console.log('🔌 Desconectado del servidor');
        });
    }

    // ========================================
    // CARGAR CONVERSACIONES
    // ========================================
    async function cargarConversaciones() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/mensajes/conversaciones', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar conversaciones');

            const data = await response.json();
            const conversaciones = data.conversaciones || [];

            if (conversaciones.length === 0) {
                conversacionesList.innerHTML = `
                    <div style="padding: 30px 20px; text-align: center; color: #4a6a8a; font-size: 0.85rem;">
                        <div style="font-size: 2rem; margin-bottom: 8px;">💬</div>
                        <p>No tienes conversaciones</p>
                        <p style="font-size: 0.75rem;">Agrega contactos para empezar a chatear</p>
                    </div>
                `;
                return;
            }

            conversacionesList.innerHTML = conversaciones.map(conv => {
                const contacto = conv.contacto || {};
                const ultimoMsg = conv.ultimoMensaje || {};
                const esMiMensaje = ultimoMsg.de === usuarioActual?._id;
                const fecha = ultimoMsg.createdAt ? new Date(ultimoMsg.createdAt) : null;

                return `
                    <div class="conv-item ${conversacionActual && conversacionActual._id === contacto._id ? 'active' : ''}"
                         data-id="${contacto._id}"
                         onclick="abrirConversacion('${contacto._id}')">
                        <div class="conv-avatar ${contacto.estado === 'conectado' ? 'online' : 'offline'}">
                            ${contacto.nombre ? contacto.nombre[0].toUpperCase() : '👤'}
                        </div>
                        <div class="conv-info">
                            <div class="conv-nombre">${contacto.nombre || 'Usuario'}</div>
                            <div class="conv-msg">
                                ${esMiMensaje ? 'Tú: ' : ''}${ultimoMsg.contenido || 'Sin mensajes'}
                            </div>
                        </div>
                        <div class="conv-meta">
                            <div class="conv-hora">${fecha ? formatearHora(fecha) : ''}</div>
                            ${conv.noLeidos > 0 ? `<span class="conv-badge">${conv.noLeidos}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Error cargando conversaciones:', error);
        }
    }

    // ========================================
    // ABRIR CONVERSACIÓN
    // ========================================
    window.abrirConversacion = async function(contactoId) {
        try {
            const token = localStorage.getItem('galleta_token');

            // Obtener información del contacto
            const response = await fetch(`/api/perfil/${contactoId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar contacto');

            const contacto = await response.json();
            conversacionActual = contacto;

            // Actualizar cabecera del chat
            if (chatNombre) chatNombre.textContent = contacto.nombre || 'Usuario';
            if (chatEstado) {
                chatEstado.textContent = contacto.estado === 'conectado' ? '🟢 En línea' : '⚪ Desconectado';
                chatEstado.className = `chat-estado ${contacto.estado === 'conectado' ? 'online' : ''}`;
            }
            if (chatAvatar) {
                chatAvatar.textContent = contacto.nombre ? contacto.nombre[0].toUpperCase() : '👤';
            }

            // Marcar mensajes como leídos
            await marcarMensajesComoLeidos(contactoId);

            // Cargar mensajes
            await cargarMensajes(contactoId);

            // Actualizar lista de conversaciones
            await cargarConversaciones();

            // Habilitar input
            chatInput.disabled = false;
            btnEnviar.disabled = false;

            // Scroll al final
            chatMessages.scrollTop = chatMessages.scrollHeight;

        } catch (error) {
            console.error('Error abriendo conversación:', error);
        }
    };

    // ========================================
    // CARGAR MENSAJES
    // ========================================
    async function cargarMensajes(contactoId, page = 1) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/mensajes/${contactoId}?page=${page}&limit=50`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar mensajes');

            const data = await response.json();
            const mensajes = data.mensajes || [];

            if (page === 1) {
                chatMessages.innerHTML = '';
                mensajesCargados = [];
            }

            if (mensajes.length > 0) {
                mensajes.forEach(msg => {
                    agregarMensajeAlChat(msg, false);
                });
                mensajesCargados = [...mensajes, ...mensajesCargados];
            } else if (page === 1) {
                chatMessages.innerHTML = `
                    <div class="empty-chat">
                        <span class="icon">💬</span>
                        <h3>Sin mensajes</h3>
                        <p>Envía un mensaje para empezar la conversación</p>
                    </div>
                `;
            }

            // Scroll al final
            chatMessages.scrollTop = chatMessages.scrollHeight;

        } catch (error) {
            console.error('Error cargando mensajes:', error);
        }
    }

    // ========================================
    // AGREGAR MENSAJE AL CHAT
    // ========================================
    function agregarMensajeAlChat(mensaje, scroll = true) {
        const esEnviado = mensaje.de === usuarioActual?._id;
        const tipo = esEnviado ? 'enviado' : 'recibido';
        const fecha = new Date(mensaje.createdAt);

        // Eliminar empty state si existe
        const empty = chatMessages.querySelector('.empty-chat');
        if (empty) empty.remove();

        let archivoHtml = '';
        if (mensaje.archivo) {
            const ext = mensaje.archivo.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                archivoHtml = `
                    <div class="msg-archivo">
                        <img src="${mensaje.archivo}" alt="Imagen" loading="lazy" />
                    </div>
                `;
            } else if (['mp4', 'webm', 'mov'].includes(ext)) {
                archivoHtml = `
                    <div class="msg-archivo">
                        <video controls src="${mensaje.archivo}"></video>
                    </div>
                `;
            } else {
                archivoHtml = `
                    <div class="msg-archivo">
                        <a href="${mensaje.archivo}" target="_blank" class="file-link">📎 Ver archivo</a>
                    </div>
                `;
            }
        }

        let comprobanteHtml = '';
        if (mensaje.tipo === 'comprobante') {
            comprobanteHtml = `<div class="msg-comprobante">🧾 Comprobante de pago</div>`;
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${tipo}`;
        msgDiv.innerHTML = `
            ${comprobanteHtml}
            <span class="msg-text">${mensaje.contenido || ''}</span>
            ${archivoHtml}
            <span class="msg-hora">${formatearHora(fecha)}</span>
        `;

        chatMessages.appendChild(msgDiv);

        if (scroll) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // ========================================
    // ENVIAR MENSAJE
    // ========================================
    async function enviarMensaje() {
        const contenido = chatInput.value.trim();
        if (!contenido || !conversacionActual) return;

        const token = localStorage.getItem('galleta_token');

        try {
            const response = await fetch('/api/mensajes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    para: conversacionActual._id,
                    contenido: contenido
                })
            });

            if (!response.ok) throw new Error('Error al enviar mensaje');

            const data = await response.json();

            // Limpiar input
            chatInput.value = '';

            // Agregar mensaje al chat
            agregarMensajeAlChat(data.mensaje);

            // Actualizar lista de conversaciones
            cargarConversaciones();

        } catch (error) {
            console.error('Error enviando mensaje:', error);
            alert('❌ Error al enviar mensaje');
        }
    }

    // ========================================
    // MARCAR MENSAJES COMO LEÍDOS
    // ========================================
    async function marcarMensajesComoLeidos(contactoId) {
        try {
            const token = localStorage.getItem('galleta_token');
            await fetch(`/api/mensajes/leer/${contactoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Error marcando mensajes como leídos:', error);
        }
    }

    // ========================================
    // ACTUALIZAR ESTADO DE CONTACTO
    // ========================================
    function actualizarEstadoContacto(userId, online) {
        const items = conversacionesList.querySelectorAll('.conv-item');
        items.forEach(item => {
            if (item.dataset.id === userId) {
                const avatar = item.querySelector('.conv-avatar');
                if (avatar) {
                    avatar.className = `conv-avatar ${online ? 'online' : 'offline'}`;
                }
            }
        });

        if (conversacionActual && conversacionActual._id === userId) {
            if (chatEstado) {
                chatEstado.textContent = online ? '🟢 En línea' : '⚪ Desconectado';
                chatEstado.className = `chat-estado ${online ? 'online' : ''}`;
            }
        }
    }

    // ========================================
    // NUEVA CONVERSACIÓN (MODAL)
    // ========================================
    async function nuevaConversacion() {
        const wallet = prompt('Ingresa la dirección wallet del usuario:');
        if (!wallet || wallet.length < 10) {
            alert('Ingresa una wallet válida');
            return;
        }

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/perfil/buscar?wallet=${wallet}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Usuario no encontrado');

            const data = await response.json();
            if (data.encontrado) {
                abrirConversacion(data.usuarioId);
            } else {
                alert('❌ Usuario no encontrado');
            }
        } catch (error) {
            console.error('Error buscando usuario:', error);
            alert('❌ Error al buscar usuario');
        }
    }

    // ========================================
    // UTILIDADES
    // ========================================
    function formatearHora(fecha) {
        return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ========================================
    // EVENTOS
    // ========================================
    btnEnviar.addEventListener('click', enviarMensaje);

    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviarMensaje();
        }
    });

    // Botón nueva conversación
    const btnNuevo = document.querySelector('.btn-nuevo');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', nuevaConversacion);
    }

    // ========================================
    // INICIALIZAR
    // ========================================
    async function init() {
        // Cargar usuario
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

            if (response.ok) {
                usuarioActual = await response.json();
                localStorage.setItem('userId', usuarioActual._id);
            }
        } catch (error) {
            console.error('Error cargando usuario:', error);
        }

        // Conectar Socket
        conectarSocket();

        // Cargar conversaciones
        await cargarConversaciones();

        // Verificar contacto en URL
        const urlParams = new URLSearchParams(window.location.search);
        const contactoId = urlParams.get('contacto');
        if (contactoId) {
            await abrirConversacion(contactoId);
        }

        // Deshabilitar input si no hay conversación
        if (!conversacionActual) {
            chatInput.disabled = true;
            btnEnviar.disabled = true;
        }
    }

    init();

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