// features/live/live.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let socket = null;
    let livekitClient = null;
    let streamActual = null;
    let roomActual = null;
    let chatInterval = null;
    let timerInterval = null;
    let segundosTransmitidos = 0;

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

        socket.on('disconnect', () => {
            console.log('🔌 Desconectado del servidor');
        });

        // Eventos de transmisión
        socket.on('live_started', (data) => {
            mostrarNotificacion(`🔴 ${data.usuario.nombre} ha iniciado una transmisión: ${data.titulo}`);
            cargarTransmisionesActivas();
        });

        socket.on('live_stopped', (data) => {
            mostrarNotificacion('📺 Una transmisión ha finalizado');
            cargarTransmisionesActivas();
        });

        socket.on('stream_started', (data) => {
            if (data.success) {
                mostrarNotificacion('✅ Transmisión iniciada');
                // Abrir modal de transmisión
                abrirModalTransmision(data.streamId, data.roomName);
            }
        });

        socket.on('stream_stopped', (data) => {
            if (data.success) {
                mostrarNotificacion('📺 Transmisión finalizada');
                cerrarModalTransmision();
            }
        });

        socket.on('stream_error', (data) => {
            mostrarNotificacion(`❌ Error: ${data.error}`, 'error');
        });

        socket.on('algoritmo_cobro', (data) => {
            mostrarNotificacion(
                `💰 Cobro por algoritmo: ${data.totalCobrado} MATIC (Neto: ${data.neto} MATIC)`,
                'success'
            );
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
            console.error('❌ Error cargando usuario:', error);
        }
    }

    // ========================================
    // CARGAR TRANSMISIONES ACTIVAS
    // ========================================
    async function cargarTransmisionesActivas() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/live/active', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar transmisiones');

            const data = await response.json();
            const grid = document.getElementById('liveGrid');

            if (data.streams && data.streams.length > 0) {
                grid.innerHTML = data.streams.map(stream => `
                    <div class="live-card" onclick="unirseATransmision('${stream._id}')">
                        <div class="thumbnail">
                            <div class="status-badge">
                                <span class="dot"></span>
                                EN VIVO
                            </div>
                            <div class="espectadores-badge">
                                👁️ ${stream.espectadores || 0}
                            </div>
                        </div>
                        <div class="live-info">
                            <div class="titulo">${stream.titulo || 'Sin título'}</div>
                            <div class="host">
                                <img src="${stream.usuario?.fotoPerfil || '/default-avatar.png'}" alt="${stream.usuario?.nombre}" />
                                <span class="nombre">${stream.usuario?.nombre || 'Usuario'}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                grid.innerHTML = `
                    <div class="sin-publicaciones" style="grid-column: 1 / -1;">
                        <span class="icono">📺</span>
                        <p>No hay transmisiones activas</p>
                        <p style="font-size:0.85rem;opacity:0.5;">Inicia una transmisión para compartir en vivo</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('❌ Error cargando transmisiones:', error);
            document.getElementById('liveGrid').innerHTML = `
                <div class="sin-publicaciones" style="grid-column: 1 / -1;">
                    <span class="icono">⚠️</span>
                    <p>Error al cargar transmisiones</p>
                </div>
            `;
        }
    }

    // ========================================
    // CARGAR MIS TRANSMISIONES
    // ========================================
    async function cargarMisTransmisiones() {
        try {
            const token = localStorage.getItem('galleta_token');
            const userId = localStorage.getItem('userId');
            const response = await fetch(`/api/live/user/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar tus transmisiones');

            const data = await response.json();
            const container = document.getElementById('misTransmisiones');

            if (data.streams && data.streams.length > 0) {
                container.innerHTML = data.streams.map(stream => `
                    <div class="live-card" onclick="verDetalleTransmision('${stream._id}')">
                        <div class="live-info">
                            <div class="titulo">${stream.titulo || 'Sin título'}</div>
                            <div style="display:flex;gap:15px;font-size:0.8rem;color:var(--texto-claro);opacity:0.6;margin-top:6px;">
                                <span>📊 ${stream.estado === 'en_vivo' ? '🔴 En vivo' : stream.estado === 'terminado' ? '✅ Finalizado' : stream.estado}</span>
                                <span>👁️ ${stream.espectadores || 0} espectadores</span>
                                <span>⏱️ ${stream.duracion ? Math.floor(stream.duracion / 60) + ' min' : '0 min'}</span>
                            </div>
                            <div style="font-size:0.75rem;color:var(--texto-claro);opacity:0.4;margin-top:4px;">
                                ${new Date(stream.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = `
                    <div class="sin-publicaciones">
                        <span class="icono">🎥</span>
                        <p>No has creado ninguna transmisión</p>
                        <p style="font-size:0.85rem;opacity:0.5;">Crea tu primera transmisión en vivo</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('❌ Error cargando mis transmisiones:', error);
        }
    }

    // ========================================
    // CREAR TRANSMISIÓN
    // ========================================
    async function crearTransmision() {
        const titulo = document.getElementById('liveTitulo').value.trim();
        const descripcion = document.getElementById('liveDescripcion').value.trim();
        const privacidad = document.querySelector('input[name="privacidad"]:checked').value;
        const cobroActivo = document.getElementById('cobroActivo').checked;

        if (!titulo) {
            mostrarNotificacion('⚠️ Ingresa un título para la transmisión', 'error');
            return;
        }

        const token = localStorage.getItem('galleta_token');
        const button = document.getElementById('btnCrearLive');
        button.disabled = true;
        button.textContent = '⏳ Creando...';

        try {
            const response = await fetch('/api/live/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    titulo,
                    descripcion,
                    privacidad,
                    cobroActivo
                })
            });

            if (!response.ok) throw new Error('Error al crear transmisión');

            const data = await response.json();

            if (data.success) {
                streamActual = data.stream;
                mostrarNotificacion('✅ Transmisión creada');

                // Iniciar transmisión
                await iniciarTransmision(data.stream._id);

                // Limpiar formulario
                document.getElementById('liveTitulo').value = '';
                document.getElementById('liveDescripcion').value = '';
                document.getElementById('cobroActivo').checked = false;

                // Cambiar a pestaña de mis transmisiones
                cambiarPanel('misTransmisiones');
                cargarMisTransmisiones();
            }

        } catch (error) {
            console.error('❌ Error creando transmisión:', error);
            mostrarNotificacion('❌ Error al crear transmisión', 'error');
        } finally {
            button.disabled = false;
            button.textContent = '🚀 Iniciar transmisión';
        }
    }

    // ========================================
    // INICIAR TRANSMISIÓN
    // ========================================
    async function iniciarTransmision(streamId) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/live/start/${streamId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al iniciar transmisión');

            const data = await response.json();

            if (data.success) {
                // Socket emit para iniciar transmisión
                socket.emit('start_stream', { streamId });

                // Abrir modal con el token de LiveKit
                // El socket enviará 'stream_started' con los datos
            }

        } catch (error) {
            console.error('❌ Error iniciando transmisión:', error);
            mostrarNotificacion('❌ Error al iniciar transmisión', 'error');
        }
    }

    // ========================================
    // UNIRSE A TRANSMISIÓN
    // ========================================
    window.unirseATransmision = async function(streamId) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/live/join/${streamId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                mostrarNotificacion(`❌ ${error.error || 'Error al unirse'}`, 'error');
                return;
            }

            const data = await response.json();

            if (data.success) {
                abrirModalTransmision(streamId, data.roomName, data.tokenLiveKit);
            }

        } catch (error) {
            console.error('❌ Error uniéndose a transmisión:', error);
            mostrarNotificacion('❌ Error al unirse a la transmisión', 'error');
        }
    };

    // ========================================
    // ABRIR MODAL DE TRANSMISIÓN
    // ========================================
    function abrirModalTransmision(streamId, roomName, tokenLiveKit) {
        const modal = document.getElementById('modalLive');
        modal.classList.add('visible');

        // Cargar información de la transmisión
        cargarInfoTransmision(streamId);

        // Configurar reproductor
        configurarReproductor(roomName, tokenLiveKit);

        // Iniciar timer
        segundosTransmitidos = 0;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            segundosTransmitidos++;
            actualizarTimer();
        }, 1000);

        // Iniciar chat
        if (chatInterval) clearInterval(chatInterval);
        chatInterval = setInterval(() => {
            cargarChat(streamId);
        }, 3000);

        // Escuchar mensajes del chat
        document.getElementById('liveChatSend').onclick = () => enviarMensajeChat(streamId);
        document.getElementById('liveChatInput').onkeydown = (e) => {
            if (e.key === 'Enter') enviarMensajeChat(streamId);
        };
    }

    // ========================================
    // CERRAR MODAL DE TRANSMISIÓN
    // ========================================
    function cerrarModalTransmision() {
        const modal = document.getElementById('modalLive');
        modal.classList.remove('visible');

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (chatInterval) {
            clearInterval(chatInterval);
            chatInterval = null;
        }

        // Desconectar LiveKit
        if (livekitClient) {
            livekitClient.disconnect();
            livekitClient = null;
        }
    }

    // ========================================
    // CONFIGURAR REPRODUCTOR (LiveKit)
    // ========================================
    function configurarReproductor(roomName, tokenLiveKit) {
        const playerContainer = document.getElementById('livePlayer');
        playerContainer.innerHTML = `
            <video id="liveVideo" autoplay playsinline></video>
        `;

        const video = document.getElementById('liveVideo');

        // Aquí se conectaría con LiveKit SDK
        // Por ahora simulamos
        console.log(`📺 Conectando a sala: ${roomName}`);
        console.log(`🔑 Token: ${tokenLiveKit}`);

        // Simular conexión exitosa
        setTimeout(() => {
            const placeholder = playerContainer.querySelector('.live-placeholder');
            if (placeholder) placeholder.style.display = 'none';
            video.style.display = 'block';
            video.poster = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%230B3D2E"/><text x="100" y="120" text-anchor="middle" font-size="40" fill="%23D4A857">📺</text></svg>';
        }, 1000);
    }

    // ========================================
    // CARGAR INFO DE TRANSMISIÓN
    // ========================================
    async function cargarInfoTransmision(streamId) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/live/metrics/${streamId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar información');

            const data = await response.json();

            if (data.success) {
                const metrics = data.metrics;
                document.getElementById('modalLiveTitulo').textContent = metrics.titulo || 'Transmisión en vivo';
                document.getElementById('liveHostNombre').textContent = metrics.usuario?.nombre || 'Usuario';
                document.getElementById('liveHostFoto').src = metrics.usuario?.fotoPerfil || '/default-avatar.png';
                document.getElementById('liveEspectadores').textContent = `👁️ ${metrics.espectadores?.actuales || 0}`;
            }

        } catch (error) {
            console.error('❌ Error cargando info:', error);
        }
    }

    // ========================================
    // ACTUALIZAR TIMER
    // ========================================
    function actualizarTimer() {
        const minutos = Math.floor(segundosTransmitidos / 60);
        const segundos = segundosTransmitidos % 60;
        document.getElementById('liveDuracion').textContent =
            `⏱️ ${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    }

    // ========================================
    // CARGAR CHAT
    // ========================================
    async function cargarChat(streamId) {
        // Simulación de chat
        // En producción, se cargaría de la base de datos
    }

    // ========================================
    // ENVIAR MENSAJE AL CHAT
    // ========================================
    function enviarMensajeChat(streamId) {
        const input = document.getElementById('liveChatInput');
        const mensaje = input.value.trim();

        if (!mensaje) return;

        const messagesContainer = document.getElementById('liveChatMessages');
        const empty = messagesContainer.querySelector('.empty-message');
        if (empty) empty.remove();

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message';
        msgDiv.innerHTML = `
            <span class="user">${usuarioActual?.nombre || 'Tú'}:</span>
            <span class="text">${mensaje}</span>
            <span class="time">${new Date().toLocaleTimeString()}</span>
        `;
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        input.value = '';

        // Enviar al servidor via Socket.IO
        socket.emit('live_chat_message', {
            streamId,
            mensaje
        });
    }

    // ========================================
    // CAMBIAR PANEL
    // ========================================
    function cambiarPanel(panel) {
        // Ocultar todos los paneles
        document.querySelectorAll('.live-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.live-panel').forEach(p => p.classList.add('hidden'));

        // Mostrar panel seleccionado
        const panelMap = {
            'explorar': 'panelExplorar',
            'misTransmisiones': 'panelMisTransmisiones',
            'crear': 'panelCrear'
        };

        const panelId = panelMap[panel];
        if (panelId) {
            const el = document.getElementById(panelId);
            el.classList.remove('hidden');
            el.classList.add('active');
        }

        // Actualizar navegación
        document.querySelectorAll('.live-nav .nav-btn').forEach(btn => btn.classList.remove('active'));
        const btnMap = {
            'explorar': 'btnExplorar',
            'misTransmisiones': 'btnMisTransmisiones',
            'crear': 'btnCrear'
        };
        const btnId = btnMap[panel];
        if (btnId) {
            document.getElementById(btnId).classList.add('active');
        }
    }

    // ========================================
    // VER DETALLE DE TRANSMISIÓN
    // ========================================
    window.verDetalleTransmision = function(streamId) {
        // Abrir modal o redirigir a detalle
        mostrarNotificacion(`📺 Cargando detalle de transmisión...`);
        // Implementar según necesidad
    };

    // ========================================
    // NOTIFICACIONES
    // ========================================
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

    // Cambiar panel: Explorar
    document.getElementById('btnExplorar').addEventListener('click', function() {
        cambiarPanel('explorar');
        cargarTransmisionesActivas();
    });

    // Cambiar panel: Mis transmisiones
    document.getElementById('btnMisTransmisiones').addEventListener('click', function() {
        cambiarPanel('misTransmisiones');
        cargarMisTransmisiones();
    });

    // Cambiar panel: Crear
    document.getElementById('btnCrear').addEventListener('click', function() {
        cambiarPanel('crear');
    });

    // Crear transmisión
    document.getElementById('btnCrearLive').addEventListener('click', crearTransmision);

    // Cerrar modal
    document.getElementById('cerrarModalLive').addEventListener('click', cerrarModalTransmision);

    // Cerrar modal al hacer clic fuera
    document.getElementById('modalLive').addEventListener('click', function(e) {
        if (e.target === this) {
            cerrarModalTransmision();
        }
    });

    // ========================================
    // INICIALIZAR
    // ========================================

    // Estilos de animación
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
        .live-card {
            animation: slideIn 0.4s ease;
        }
    `;
    document.head.appendChild(styleAnim);

    // Cargar datos
    cargarUsuario().then(() => {
        cargarTransmisionesActivas();
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

    // Escuchar eventos de chat
    if (socket) {
        socket.on('live_chat_message', (data) => {
            // Mostrar mensaje en el chat
            const messagesContainer = document.getElementById('liveChatMessages');
            const empty = messagesContainer.querySelector('.empty-message');
            if (empty) empty.remove();

            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message';
            msgDiv.innerHTML = `
                <span class="user">${data.nombre || 'Usuario'}:</span>
                <span class="text">${data.mensaje}</span>
                <span class="time">${new Date().toLocaleTimeString()}</span>
            `;
            messagesContainer.appendChild(msgDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    }

});