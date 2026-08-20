// public/features/live/live.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let socket = null;
    let transmisiones = [];
    let streamActual = null;
    let roomActual = null;
    let timerInterval = null;
    let segundosTransmitidos = 0;

    // ========================================
    // ELEMENTOS DEL DOM
    // ========================================
    const liveGrid = document.getElementById('liveGrid');
    const emptyLive = document.getElementById('emptyLive');
    const btnCrearLive = document.querySelector('.btn-crear-live');

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
            console.log('🔌 Conectado al servidor de Live');
            const userId = localStorage.getItem('userId');
            if (userId) {
                socket.emit('authenticate', { userId });
            }
        });

        socket.on('authenticated', (data) => {
            console.log('✅ Autenticado en Socket.IO');
        });

        socket.on('live_started', (data) => {
            mostrarNotificacion(`🔴 ${data.usuario?.nombre || 'Alguien'} ha iniciado una transmisión: ${data.titulo}`);
            cargarTransmisiones();
        });

        socket.on('live_stopped', (data) => {
            mostrarNotificacion('📺 Una transmisión ha finalizado');
            cargarTransmisiones();
        });

        socket.on('live_updated', (data) => {
            actualizarTransmision(data.streamId, data.espectadores);
        });

        socket.on('disconnect', () => {
            console.log('🔌 Desconectado del servidor');
        });
    }

    // ========================================
    // CARGAR TRANSMISIONES
    // ========================================
    async function cargarTransmisiones() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/live/active', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar transmisiones');

            const data = await response.json();
            transmisiones = data.streams || [];

            if (transmisiones.length === 0) {
                liveGrid.style.display = 'none';
                emptyLive.style.display = 'block';
                return;
            }

            liveGrid.style.display = 'grid';
            emptyLive.style.display = 'none';

            renderizarTransmisiones(transmisiones);

        } catch (error) {
            console.error('Error cargando transmisiones:', error);
            liveGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #4a6a8a;">
                    <div style="font-size: 2rem; margin-bottom: 12px;">⚠️</div>
                    <h3 style="font-family: 'Orbitron', monospace; color: #8ba3c7; font-size: 1rem;">Error al cargar transmisiones</h3>
                    <p style="font-size: 0.85rem;">Intenta de nuevo más tarde</p>
                </div>
            `;
        }
    }

    // ========================================
    // RENDERIZAR TRANSMISIONES
    // ========================================
    function renderizarTransmisiones(lista) {
        liveGrid.innerHTML = lista.map(stream => {
            const usuario = stream.usuario || {};
            const espectadores = stream.espectadores || 0;
            const titulo = stream.titulo || 'Sin título';

            return `
                <div class="live-card" onclick="unirseATransmision('${stream._id}')">
                    <div class="live-thumbnail">
                        <div class="live-badge">
                            <span class="dot"></span> EN VIVO
                        </div>
                        <div class="live-placeholder">📺</div>
                        <div class="live-overlay"></div>
                        <div class="live-viewers">👁️ ${espectadores}</div>
                    </div>
                    <div class="live-info">
                        <div class="live-title">
                            ${titulo}
                            ${stream.tipo ? `<span class="tag">${stream.tipo}</span>` : ''}
                        </div>
                        <div class="live-host">
                            <div class="host-avatar">
                                ${usuario.nombre ? usuario.nombre[0].toUpperCase() : '👤'}
                            </div>
                            <span class="host-name">
                                ${usuario.nombre || 'Anónimo'}
                                ${usuario.verificado ? '<span class="verified">✦</span>' : ''}
                            </span>
                        </div>
                        <div class="live-meta">
                            <span>⏱️ ${stream.duracion ? Math.floor(stream.duracion / 60) + ' min' : 'Recién iniciado'}</span>
                            <span>🔗 ${stream.privacidad === 'publico' ? 'Público' : stream.privacidad === 'privado' ? 'Privado' : 'Por invitación'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ========================================
    // ACTUALIZAR TRANSMISIÓN (Socket)
    // ========================================
    function actualizarTransmision(streamId, espectadores) {
        const cards = liveGrid.querySelectorAll('.live-card');
        cards.forEach(card => {
            const viewers = card.querySelector('.live-viewers');
            if (viewers) {
                // Actualizar contador de espectadores
                viewers.textContent = `👁️ ${espectadores}`;
            }
        });
    }

    // ========================================
    // UNIRSE A TRANSMISIÓN
    // ========================================
    window.unirseATransmision = async function(streamId) {
        try {
            const token = localStorage.getItem('galleta_token');
            if (!token) {
                alert('Conecta tu wallet primero');
                return;
            }

            const response = await fetch(`/api/live/join/${streamId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                alert(`❌ ${error.error || 'Error al unirse'}`);
                return;
            }

            const data = await response.json();

            if (data.success) {
                abrirModalTransmision(streamId, data.roomName, data.tokenLiveKit);
            }

        } catch (error) {
            console.error('Error uniéndose a transmisión:', error);
            alert('❌ Error al unirse a la transmisión');
        }
    };

    // ========================================
    // CREAR TRANSMISIÓN
    // ========================================
    async function crearTransmision() {
        try {
            const token = localStorage.getItem('galleta_token');
            if (!token) {
                alert('Conecta tu wallet primero');
                return;
            }

            const titulo = prompt('Título de la transmisión:');
            if (!titulo || titulo.trim() === '') return;

            const descripcion = prompt('Descripción (opcional):') || '';

            const response = await fetch('/api/live/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    titulo: titulo.trim(),
                    descripcion: descripcion.trim(),
                    privacidad: 'publico',
                    cobroActivo: false
                })
            });

            if (!response.ok) throw new Error('Error al crear transmisión');

            const data = await response.json();

            if (data.success) {
                // Iniciar transmisión
                await iniciarTransmision(data.stream._id);
            }

        } catch (error) {
            console.error('Error creando transmisión:', error);
            alert('❌ Error al crear transmisión');
        }
    }

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
                // El socket emitirá 'stream_started'
                socket.emit('start_stream', { streamId });
                mostrarNotificacion('✅ Transmisión iniciada');
                cargarTransmisiones();
            }

        } catch (error) {
            console.error('Error iniciando transmisión:', error);
            alert('❌ Error al iniciar transmisión');
        }
    }

    // ========================================
    // MODAL DE TRANSMISIÓN
    // ========================================
    function abrirModalTransmision(streamId, roomName, tokenLiveKit) {
        const modal = document.querySelector('.modal-live');
        if (!modal) return;

        modal.classList.add('active');

        // Configurar título
        const title = modal.querySelector('.modal-live-title');
        if (title) {
            title.innerHTML = `<span class="live-dot">●</span> Transmisión en vivo`;
        }

        // Iniciar timer
        segundosTransmitidos = 0;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            segundosTransmitidos++;
            actualizarTimer();
        }, 1000);

        // Aquí se conectaría con LiveKit SDK
        console.log(`📺 Conectando a sala: ${roomName}`);
        console.log(`🔑 Token: ${tokenLiveKit}`);

        // Simular conexión
        const player = modal.querySelector('.live-player');
        if (player) {
            const placeholder = player.querySelector('.player-placeholder');
            if (placeholder) {
                placeholder.innerHTML = `
                    <div class="icon">📺</div>
                    <p>🔴 Transmisión en vivo</p>
                    <p style="font-size: 0.8rem; color: #4a6a8a;">Conectando...</p>
                `;
                setTimeout(() => {
                    placeholder.innerHTML = `
                        <div class="icon">📺</div>
                        <p style="color: #00b894;">✅ Conectado</p>
                        <p style="font-size: 0.8rem; color: #4a6a8a;">Transmisión en curso</p>
                    `;
                }, 1500);
            }
        }
    }

    function cerrarModalTransmision() {
        const modal = document.querySelector('.modal-live');
        if (modal) modal.classList.remove('active');

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        segundosTransmitidos = 0;
    }

    function actualizarTimer() {
        const minutos = Math.floor(segundosTransmitidos / 60);
        const segundos = segundosTransmitidos % 60;
        const timerDisplay = document.querySelector('.live-timer');
        if (timerDisplay) {
            timerDisplay.textContent = `⏱️ ${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
        }
    }

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
            background: ${tipo === 'success' ? 'var(--gold-cosmic)' : tipo === 'error' ? 'var(--danger)' : 'var(--text-secondary)'};
            color: ${tipo === 'success' ? 'var(--space-deep)' : 'white'};
            border-radius: 12px;
            z-index: 9999;
            max-width: 400px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            animation: slideIn 0.4s ease;
            font-weight: 500;
            font-family: 'Space Grotesk', sans-serif;
            border: 1px solid rgba(212, 175, 55, 0.15);
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
    if (btnCrearLive) {
        btnCrearLive.addEventListener('click', crearTransmision);
    }

    // Cerrar modal al hacer clic fuera
    document.querySelector('.modal-live')?.addEventListener('click', function(e) {
        if (e.target === this) {
            cerrarModalTransmision();
        }
    });

    // Botón cerrar modal
    document.querySelector('.btn-cerrar-modal')?.addEventListener('click', cerrarModalTransmision);

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

        // Cargar transmisiones
        await cargarTransmisiones();
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