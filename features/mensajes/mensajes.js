// features/mensajes/mensajes.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let socket = null;
    let conversacionActual = null;
    let archivoAdjunto = null;
    let paginaConversaciones = 1;
    let cargandoConversaciones = false;
    let tieneMasConversaciones = true;

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
            console.log('🔌 Conectado al servidor de mensajería');
            const userId = localStorage.getItem('userId');
            if (userId) {
                socket.emit('authenticate', { userId });
            }
        });

        socket.on('disconnect', () => {
            console.log('🔌 Desconectado del servidor');
        });

        // Recibir nuevo mensaje
        socket.on('new_message', (data) => {
            const mensaje = data.mensaje;
            const de = data.de;

            // Si es el usuario actual, actualizar conversación
            if (de === conversacionActual?._id || mensaje.de === conversacionActual?._id) {
                agregarMensajeAlChat(mensaje);
                marcarMensajesComoLeidos(conversacionActual._id);
            }

            // Actualizar lista de conversaciones
            cargarConversaciones();

            // Notificación
            if (de !== usuarioActual?._id) {
                const nombre = de === conversacionActual?._id ? 
                    conversacionActual.nombre : 
                    'Alguien';
                mostrarNotificacion(`💬 Nuevo mensaje de ${nombre}`);
            }
        });

        // Confirmación de mensaje enviado
        socket.on('message_sent', (data) => {
            if (data.success) {
                console.log('✅ Mensaje enviado');
            }
        });

        // Error al enviar mensaje
        socket.on('message_error', (data) => {
            mostrarNotificacion('❌ Error al enviar mensaje', 'error');
        });

        // Usuario en línea
        socket.on('user_online', (data) => {
            actualizarEstadoContacto(data.userId, 'online');
        });

        socket.on('user_offline', (data) => {
            actualizarEstadoContacto(data.userId, 'offline');
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

        } catch (error) {
            console.error('Error cargando usuario:', error);
        }
    }

    // ========================================
    // CARGAR CONVERSACIONES
    // ========================================
    async function cargarConversaciones() {
        if (cargandoConversaciones) return;
        cargandoConversaciones = true;

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/mensajes/conversaciones?page=${paginaConversaciones}&limit=20`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar conversaciones');

            const data = await response.json();

            const lista = document.getElementById('listaConversaciones');

            if (paginaConversaciones === 1) {
                lista.innerHTML = '';
            }

            if (data.conversaciones && data.conversaciones.length > 0) {
                data.conversaciones.forEach(conv => {
                    renderizarConversacion(conv);
                });

                tieneMasConversaciones = data.pagination && data.pagination.pages > paginaConversaciones;
            } else if (paginaConversaciones === 1) {
                lista.innerHTML = `
                    <div class="empty-chat" style="padding:40px 20px;">
                        <span class="icono" style="font-size:2.5rem;">💬</span>
                        <p style="color:var(--texto-claro);opacity:0.5;text-align:center;">
                            No tienes conversaciones aún<br />
                            <span style="font-size:0.85rem;">Busca un usuario para empezar a chatear</span>
                        </p>
                    </div>
                `;
            }

            // Scroll infinito
            if (tieneMasConversaciones) {
                const lastItem = lista.lastElementChild;
                if (lastItem) {
                    const observer = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting) {
                            paginaConversaciones++;
                            cargarConversaciones();
                        }
                    });
                    observer.observe(lastItem);
                }
            }

        } catch (error) {
            console.error('Error cargando conversaciones:', error);
        } finally {
            cargandoConversaciones = false;
        }
    }

    // ========================================
    // RENDERIZAR CONVERSACIÓN
    // ========================================
    function renderizarConversacion(conv) {
        const lista = document.getElementById('listaConversaciones');

        const esMiMensaje = conv.ultimoMensaje?.de === usuarioActual?._id;
        const nombre = conv.contacto?.nombre || 'Usuario';
        const foto = conv.contacto?.fotoPerfil || '/default-avatar.png';
        const estado = conv.contacto?.estado === 'conectado' ? 'online' : 'offline';

        const html = `
            <div class="conversacion-item ${conversacionActual?._id === conv.contacto?._id ? 'active' : ''}" 
                 data-id="${conv.contacto?._id}"
                 onclick="abrirConversacion('${conv.contacto?._id}')">
                <img src="${foto}" alt="${nombre}" />
                <div class="info">
                    <div class="nombre">${nombre}</div>
                    <div class="ultimo-msg">
                        ${esMiMensaje ? 'Tú: ' : ''}${conv.ultimoMensaje?.contenido || 'Sin mensajes'}
                    </div>
                </div>
                <div class="meta">
                    <span class="estado-online ${estado}"></span>
                    ${conv.noLeidos > 0 ? `<span class="no-leidos">${conv.noLeidos}</span>` : ''}
                </div>
            </div>
        `;

        lista.insertAdjacentHTML('beforeend', html);
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
            document.getElementById('chatFoto').src = contacto.fotoPerfil || '/default-avatar.png';
            document.getElementById('chatNombre').textContent = contacto.nombre || 'Usuario';
            const estadoEl = document.getElementById('chatEstado');
            if (contacto.estado === 'conectado') {
                estadoEl.textContent = '🟢 En línea';
                estadoEl.className = 'chat-estado online';
            } else {
                estadoEl.textContent = '🟡 Ausente';
                estadoEl.className = 'chat-estado';
            }

            // Cargar mensajes
            await cargarMensajes(contactoId);

            // Marcar mensajes como leídos
            await marcarMensajesComoLeidos(contactoId);

            // Actualizar lista de conversaciones
            await cargarConversaciones();

            // Habilitar input
            document.getElementById('inputMensaje').disabled = false;
            document.getElementById('btnEnviarMensaje').disabled = false;

            // Scroll al final
            setTimeout(() => {
                const chatMensajes = document.getElementById('chatMensajes');
                chatMensajes.scrollTop = chatMensajes.scrollHeight;
            }, 100);

        } catch (error) {
            console.error('Error abriendo conversación:', error);
            mostrarNotificacion('❌ Error al abrir conversación', 'error');
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
            const chatMensajes = document.getElementById('chatMensajes');

            if (page === 1) {
                chatMensajes.innerHTML = '';
            }

            if (data.mensajes && data.mensajes.length > 0) {
                // Invertir para mostrar los más antiguos primero
                const mensajes = data.mensajes.reverse();
                mensajes.forEach(msg => {
                    agregarMensajeAlChat(msg, false);
                });

                // Scroll al final
                chatMensajes.scrollTop = chatMensajes.scrollHeight;

            } else if (page === 1) {
                chatMensajes.innerHTML = `
                    <div class="empty-chat">
                        <span class="icono">💬</span>
                        <p>No hay mensajes aún</p>
                        <p style="font-size:0.85rem;opacity:0.5;">Envía un mensaje para empezar la conversación</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error cargando mensajes:', error);
        }
    }

    // ========================================
    // AGREGAR MENSAJE AL CHAT
    // ========================================
    function agregarMensajeAlChat(mensaje, scroll = true) {
        const chatMensajes = document.getElementById('chatMensajes');

        // Eliminar mensaje vacío si existe
        const empty = chatMensajes.querySelector('.empty-chat');
        if (empty) empty.remove();

        const esEnviado = mensaje.de === usuarioActual?._id;
        const tipo = esEnviado ? 'enviado' : 'recibido';

        let archivoHtml = '';
        if (mensaje.archivo) {
            const ext = mensaje.archivo.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                archivoHtml = `
                    <div class="archivo-msg">
                        <img src="${mensaje.archivo}" alt="Imagen" loading="lazy" />
                    </div>
                `;
            } else if (['mp4', 'webm', 'mov'].includes(ext)) {
                archivoHtml = `
                    <div class="archivo-msg">
                        <video controls>
                            <source src="${mensaje.archivo}" />
                        </video>
                    </div>
                `;
            } else if (ext === 'pdf') {
                archivoHtml = `
                    <div class="archivo-msg">
                        <a href="${mensaje.archivo}" target="_blank" class="pdf-link">📄 Ver PDF</a>
                    </div>
                `;
            } else {
                archivoHtml = `
                    <div class="archivo-msg">
                        <a href="${mensaje.archivo}" target="_blank" class="pdf-link">📎 Descargar archivo</a>
                    </div>
                `;
            }
        }

        const html = `
            <div class="mensaje ${tipo}">
                ${mensaje.tipo === 'comprobante' ? '<span class="comprobante-badge">🧾 Comprobante de pago</span>' : ''}
                ${mensaje.contenido ? `<div class="texto">${mensaje.contenido}</div>` : ''}
                ${archivoHtml}
                <span class="fecha-msg">${formatearFechaMensaje(mensaje.createdAt)}</span>
            </div>
        `;

        chatMensajes.insertAdjacentHTML('beforeend', html);

        if (scroll) {
            chatMensajes.scrollTop = chatMensajes.scrollHeight;
        }
    }

    // ========================================
    // ENVIAR MENSAJE
    // ========================================
    async function enviarMensaje() {
        const input = document.getElementById('inputMensaje');
        const contenido = input.value.trim();

        if (!contenido && !archivoAdjunto) {
            mostrarNotificacion('⚠️ Escribe un mensaje o adjunta un archivo', 'error');
            return;
        }

        if (!conversacionActual) {
            mostrarNotificacion('⚠️ Selecciona una conversación', 'error');
            return;
        }

        const token = localStorage.getItem('galleta_token');
        const button = document.getElementById('btnEnviarMensaje');
        button.disabled = true;

        try {
            const formData = new FormData();
            formData.append('para', conversacionActual._id);
            formData.append('contenido', contenido || '');

            if (archivoAdjunto) {
                formData.append('archivo', archivoAdjunto);
                formData.append('tipoArchivo', archivoAdjunto.type.startsWith('image') ? 'image' : 'file');
            }

            const response = await fetch('/api/mensajes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Error al enviar mensaje');

            const data = await response.json();

            // Limpiar input
            input.value = '';
            archivoAdjunto = null;
            document.getElementById('chatPreview').classList.add('hidden');
            document.getElementById('inputArchivo').value = '';

            // Agregar mensaje al chat
            agregarMensajeAlChat(data.mensaje);

            // Actualizar lista de conversaciones
            cargarConversaciones();

        } catch (error) {
            console.error('Error enviando mensaje:', error);
            mostrarNotificacion('❌ Error al enviar mensaje', 'error');
        } finally {
            button.disabled = false;
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
    function actualizarEstadoContacto(userId, estado) {
        // Actualizar en lista de conversaciones
        const items = document.querySelectorAll('.conversacion-item');
        items.forEach(item => {
            if (item.dataset.id === userId) {
                const estadoEl = item.querySelector('.estado-online');
                estadoEl.className = `estado-online ${estado}`;
            }
        });

        // Actualizar en chat actual
        if (conversacionActual && conversacionActual._id === userId) {
            const estadoEl = document.getElementById('chatEstado');
            if (estado === 'online') {
                estadoEl.textContent = '🟢 En línea';
                estadoEl.className = 'chat-estado online';
            } else {
                estadoEl.textContent = '🟡 Ausente';
                estadoEl.className = 'chat-estado';
            }
        }
    }

    // ========================================
    // BUSCAR USUARIO (Modal)
    // ========================================
    async function buscarUsuario(query) {
        if (!query || query.length < 2) {
            document.getElementById('modalResultados').innerHTML = `
                <p class="empty-message">Escribe al menos 2 caracteres para buscar</p>
            `;
            return;
        }

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/perfil/buscar?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al buscar');

            const data = await response.json();
            const resultados = document.getElementById('modalResultados');

            if (data.usuarios && data.usuarios.length > 0) {
                resultados.innerHTML = data.usuarios.map(user => `
                    <div class="resultado-item" onclick="iniciarConversacion('${user._id}')">
                        <img src="${user.fotoPerfil || '/default-avatar.png'}" alt="${user.nombre}" />
                        <div>
                            <div class="nombre">${user.nombre || 'Usuario'}</div>
                            <div class="wallet">${user.walletAddress ? user.walletAddress.slice(0, 10) + '...' : ''}</div>
                        </div>
                    </div>
                `).join('');
            } else {
                resultados.innerHTML = `<p class="empty-message">No se encontraron usuarios</p>`;
            }

        } catch (error) {
            console.error('Error buscando:', error);
            document.getElementById('modalResultados').innerHTML = `
                <p class="empty-message">❌ Error al buscar</p>
            `;
        }
    }

    // ========================================
    // INICIAR CONVERSACIÓN DESDE MODAL
    // ========================================
    window.iniciarConversacion = function(userId) {
        document.getElementById('modalNuevoMensaje').classList.add('hidden');
        abrirConversacion(userId);
    };

    // ========================================
    // VIDEO LLAMADA (LiveKit)
    // ========================================
    window.iniciarVideoLlamada = function() {
        if (!conversacionActual) {
            mostrarNotificacion('⚠️ Selecciona una conversación', 'error');
            return;
        }
        // Aquí se integraría LiveKit
        mostrarNotificacion('📹 Iniciando video llamada con ' + (conversacionActual.nombre || 'usuario'));
        // Redirigir a sala de video llamada
        // window.location.href = `/features/llamadas/video.html?room=${conversacionActual._id}`;
    };

    // ========================================
    // LLAMADA DE VOZ
    // ========================================
    window.iniciarLlamada = function() {
        if (!conversacionActual) {
            mostrarNotificacion('⚠️ Selecciona una conversación', 'error');
            return;
        }
        mostrarNotificacion('📞 Llamando a ' + (conversacionActual.nombre || 'usuario'));
        // Aquí se integraría la llamada de voz
    };

    // ========================================
    // BLOQUEAR USUARIO DESDE CHAT
    // ========================================
    async function bloquearUsuarioChat() {
        if (!conversacionActual) return;

        if (!confirm(`¿Estás seguro de bloquear a ${conversacionActual.nombre || 'este usuario'}?`)) return;

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil/bloquear', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usuarioId: conversacionActual._id })
            });

            if (response.ok) {
                mostrarNotificacion('✅ Usuario bloqueado');
                conversacionActual = null;
                document.getElementById('chatMensajes').innerHTML = `
                    <div class="empty-chat">
                        <span class="icono">🔒</span>
                        <p>Usuario bloqueado</p>
                    </div>
                `;
                document.getElementById('chatNombre').textContent = 'Selecciona una conversación';
                document.getElementById('chatEstado').textContent = 'Sin conexión';
                document.getElementById('chatFoto').src = '/default-avatar.png';
                document.getElementById('inputMensaje').disabled = true;
                document.getElementById('btnEnviarMensaje').disabled = true;
                cargarConversaciones();
            }
        } catch (error) {
            console.error('Error bloqueando:', error);
            mostrarNotificacion('❌ Error al bloquear', 'error');
        }
    }

    // ========================================
    // UTILIDADES
    // ========================================
    function formatearFechaMensaje(fecha) {
        const date = new Date(fecha);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} h`;
        return date.toLocaleDateString();
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
    // EVENTOS
    // ========================================

    // Enviar mensaje con Enter
    document.getElementById('inputMensaje').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviarMensaje();
        }
    });

    // Botón enviar
    document.getElementById('btnEnviarMensaje').addEventListener('click', enviarMensaje);

    // Adjuntar archivo
    document.getElementById('btnAdjuntar').addEventListener('click', function() {
        document.getElementById('inputArchivo').click();
    });

    document.getElementById('inputArchivo').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        archivoAdjunto = file;
        document.getElementById('previewNombre').textContent = file.name;
        document.getElementById('chatPreview').classList.remove('hidden');
        this.value = '';
    });

    document.getElementById('eliminarPreviewChat').addEventListener('click', function() {
        archivoAdjunto = null;
        document.getElementById('chatPreview').classList.add('hidden');
        document.getElementById('inputArchivo').value = '';
    });

    // Nuevo mensaje (abrir modal)
    document.getElementById('nuevoMensaje').addEventListener('click', function() {
        document.getElementById('modalNuevoMensaje').classList.remove('hidden');
        document.getElementById('modalBuscarUsuario').value = '';
        document.getElementById('modalResultados').innerHTML = `
            <p class="empty-message">Busca un usuario para empezar a chatear</p>
        `;
        document.getElementById('modalBuscarUsuario').focus();
    });

    // Cerrar modal
    document.getElementById('cerrarModal').addEventListener('click', function() {
        document.getElementById('modalNuevoMensaje').classList.add('hidden');
    });

    document.getElementById('modalNuevoMensaje').addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.add('hidden');
        }
    });

    // Buscar en modal
    let timeoutBusqueda;
    document.getElementById('modalBuscarUsuario').addEventListener('input', function() {
        clearTimeout(timeoutBusqueda);
        const query = this.value.trim();
        timeoutBusqueda = setTimeout(() => {
            buscarUsuario(query);
        }, 300);
    });

    // Video llamada
    document.getElementById('btnVideoLlamada').addEventListener('click', iniciarVideoLlamada);

    // Llamada de voz
    document.getElementById('btnLlamada').addEventListener('click', iniciarLlamada);

    // Bloquear usuario
    document.getElementById('btnBloquearChat').addEventListener('click', bloquearUsuarioChat);

    // ========================================
    // ESTILOS ANIMACIONES
    // ========================================
    const styleAnim = document.createElement('style');
    styleAnim.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(20px); }
        }
        .mensaje {
            animation: slideIn 0.3s ease;
        }
    `;
    document.head.appendChild(styleAnim);

    // ========================================
    // INICIALIZAR
    // ========================================

    async function init() {
        await cargarUsuario();

        // Verificar si hay un contacto en la URL
        const urlParams = new URLSearchParams(window.location.search);
        const contactoId = urlParams.get('contacto');
        if (contactoId) {
            await abrirConversacion(contactoId);
        }

        // Cargar conversaciones
        await cargarConversaciones();

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

        // Deshabilitar input si no hay conversación
        document.getElementById('inputMensaje').disabled = true;
        document.getElementById('btnEnviarMensaje').disabled = true;
    }

    init();

});