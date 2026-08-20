/* ================================================================
   LIVE ULTRA MEGA PRO - SARIEL'S
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
// VARIABLES GLOBALES
// ================================================================
let usuarioActual = null;
let socket = null;
let transmisiones = [];
let streamActual = null;
let roomActual = null;
let timerInterval = null;
let segundosTransmitidos = 0;
let modoOscuro = true;
let liveActivo = false;

// ================================================================
// ELEMENTOS DEL DOM
// ================================================================
const liveGrid = document.getElementById('liveGrid');
const emptyLive = document.getElementById('emptyLive');
const btnCrearLive = document.querySelector('.btn-crear-live');
const liveCount = document.getElementById('liveCount');
const totalViewers = document.getElementById('totalViewers');

// ================================================================
// CONEXIÓN A SOCKET.IO
// ================================================================
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
        console.log('◉ Conectado al servidor de Live');
        const userId = localStorage.getItem('userId');
        if (userId) {
            socket.emit('authenticate', { userId });
        }
    });

    socket.on('authenticated', (data) => {
        console.log('◆ Autenticado en Socket.IO');
    });

    socket.on('live_started', (data) => {
        showToast(`◉ ${data.usuario?.nombre || 'Alguien'} ha iniciado una transmisión: ${data.titulo}`);
        cargarTransmisiones();
    });

    socket.on('live_stopped', (data) => {
        showToast('◆ Una transmisión ha finalizado');
        cargarTransmisiones();
    });

    socket.on('live_updated', (data) => {
        actualizarTransmision(data.streamId, data.espectadores);
    });

    socket.on('new_viewer', (data) => {
        if (data.streamId === streamActual?._id) {
            actualizarContadorEspectadores(data.total);
        }
    });

    socket.on('disconnect', () => {
        console.log('◉ Desconectado del servidor');
    });
}

// ================================================================
// CARGAR TRANSMISIONES
// ================================================================
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

        // Actualizar contadores
        if (liveCount) liveCount.textContent = transmisiones.length;
        if (totalViewers) {
            const viewers = transmisiones.reduce((sum, s) => sum + (s.espectadores || 0), 0);
            totalViewers.textContent = viewers;
        }

        if (transmisiones.length === 0) {
            if (liveGrid) liveGrid.style.display = 'none';
            if (emptyLive) emptyLive.style.display = 'block';
            return;
        }

        if (liveGrid) liveGrid.style.display = 'grid';
        if (emptyLive) emptyLive.style.display = 'none';

        renderizarTransmisiones(transmisiones);

    } catch (error) {
        console.error('Error cargando transmisiones:', error);
        if (liveGrid) {
            liveGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 12px; font-family: 'Orbitron', monospace;">◈</div>
                    <h3 style="font-family: 'Orbitron', monospace; color: var(--text-secondary); font-size: 1rem; letter-spacing: 1px; font-weight: 400;">Error al cargar transmisiones</h3>
                    <p style="font-size: 0.85rem; letter-spacing: 0.3px;">Intenta de nuevo más tarde</p>
                </div>
            `;
        }
    }
}

// ================================================================
// RENDERIZAR TRANSMISIONES
// ================================================================
function renderizarTransmisiones(lista) {
    if (!liveGrid) return;

    liveGrid.innerHTML = lista.map(stream => {
        const usuario = stream.usuario || {};
        const espectadores = stream.espectadores || 0;
        const titulo = stream.titulo || 'Sin título';
        const tags = stream.tags || ['En vivo'];

        return `
            <div class="live-card" onclick="unirseATransmision('${stream._id}')">
                <div class="live-thumbnail">
                    <div class="live-badge">
                        <span class="dot"></span> EN VIVO
                    </div>
                    <div class="live-placeholder">◈</div>
                    <div class="live-overlay"></div>
                    <div class="live-viewers">◉ ${espectadores}</div>
                    <button class="live-qr-btn" onclick="event.stopPropagation();generarQRLive('${stream._id}')">◈ QR</button>
                </div>
                <div class="live-info">
                    <div class="live-title">
                        ${titulo}
                        ${stream.tipo ? `<span class="tag">${stream.tipo}</span>` : ''}
                    </div>
                    <div class="live-host">
                        <div class="host-avatar">
                            ${usuario.nombre ? usuario.nombre[0].toUpperCase() : '✦'}
                        </div>
                        <span class="host-name">
                            ${usuario.nombre || 'Anónimo'}
                            ${usuario.verificado ? '<span class="verified">✦</span>' : ''}
                        </span>
                    </div>
                    <div class="live-tags">
                        ${tags.map(tag => `<span class="tag live-tag">◉ ${tag}</span>`).join('')}
                    </div>
                    <div class="live-meta">
                        <span>⏱ ${stream.duracion ? Math.floor(stream.duracion / 60) + ' min' : 'Recién iniciado'}</span>
                        <span>◆ ${stream.privacidad === 'publico' ? 'Público' : stream.privacidad === 'privado' ? 'Privado' : 'Por invitación'}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// ACTUALIZAR TRANSMISIÓN (Socket)
// ================================================================
function actualizarTransmision(streamId, espectadores) {
    const cards = liveGrid?.querySelectorAll('.live-card');
    if (!cards) return;

    cards.forEach(card => {
        const viewers = card.querySelector('.live-viewers');
        if (viewers) {
            viewers.textContent = `◉ ${espectadores}`;
        }
    });
}

function actualizarContadorEspectadores(total) {
    const viewers = document.querySelector('.modal-live .live-viewers-count');
    if (viewers) {
        viewers.textContent = `◉ ${total}`;
    }
}

// ================================================================
// UNIRSE A TRANSMISIÓN
// ================================================================
window.unirseATransmision = async function(streamId) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            showToast('⚠️ Conecta tu wallet primero', 'error');
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
            showToast(`❌ ${error.error || 'Error al unirse'}`, 'error');
            return;
        }

        const data = await response.json();

        if (data.success) {
            abrirModalTransmision(streamId, data.roomName, data.tokenLiveKit);
        }

    } catch (error) {
        console.error('Error uniéndose a transmisión:', error);
        showToast('❌ Error al unirse a la transmisión', 'error');
    }
};

// ================================================================
// CREAR TRANSMISIÓN
// ================================================================
async function crearTransmision() {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            showToast('⚠️ Conecta tu wallet primero', 'error');
            return;
        }

        const titulo = prompt('◆ Título de la transmisión:');
        if (!titulo || titulo.trim() === '') return;

        const descripcion = prompt('◇ Descripción (opcional):') || '';

        const tagsInput = prompt('◈ Tags (separados por coma, ej: Música, Tokens, Gaming):');
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : ['En vivo'];

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
                cobroActivo: false,
                tags: tags
            })
        });

        if (!response.ok) throw new Error('Error al crear transmisión');

        const data = await response.json();

        if (data.success) {
            showToast('◉ Transmisión creada exitosamente');
            await iniciarTransmision(data.stream._id);
        }

    } catch (error) {
        console.error('Error creando transmisión:', error);
        showToast('❌ Error al crear transmisión', 'error');
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
            if (socket) {
                socket.emit('start_stream', { streamId });
            }
            liveActivo = true;
            showToast('✅ Transmisión iniciada');
            await cargarTransmisiones();

            // Abrir modal automáticamente
            unirseATransmision(streamId);
        }

    } catch (error) {
        console.error('Error iniciando transmisión:', error);
        showToast('❌ Error al iniciar transmisión', 'error');
    }
}

// ================================================================
// GENERAR QR DE TRANSMISIÓN
// ================================================================
window.generarQRLive = function(streamId) {
    const url = `${window.location.origin}/live/${streamId}`;

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
                <h3 style="font-family:'Orbitron',monospace;color:var(--gold);font-size:1rem;margin-bottom:12px;letter-spacing:1px;">◈ QR de transmisión</h3>
                <div id="qrContainer" style="background:white;padding:16px;border-radius:16px;display:inline-block;margin:0 auto;"></div>
                <p style="color:var(--text-muted);font-size:0.7rem;margin-top:12px;letter-spacing:0.3px;">Escanea para unirte al live</p>
                <button onclick="this.closest('div[style]').remove()" style="margin-top:16px;padding:8px 24px;border-radius:30px;border:1px solid var(--glass-border);background:transparent;color:var(--text-secondary);cursor:pointer;font-family:'Inter',sans-serif;letter-spacing:0.3px;">Cerrar</button>
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
            showToast('◈ QR generado');
        } catch (e) {
            document.getElementById('qrContainer').innerHTML = '⚠️ Error generando QR';
            showToast('⚠️ Error generando QR', 'error');
        }
    } else {
        showToast(`◈ QR: ${url}`);
    }
};

// ================================================================
// MODAL DE TRANSMISIÓN
// ================================================================
function abrirModalTransmision(streamId, roomName, tokenLiveKit) {
    const modal = document.querySelector('.modal-live');
    if (!modal) return;

    modal.classList.add('active');
    streamActual = { _id: streamId };

    // Configurar título
    const title = modal.querySelector('.modal-live-title');
    if (title) {
        title.innerHTML = `<span class="live-dot">◉</span> Transmisión en vivo`;
    }

    // Configurar contador de espectadores
    const viewers = modal.querySelector('.live-viewers-count');
    if (viewers) {
        viewers.textContent = '◉ 0';
    }

    // Iniciar timer
    segundosTransmitidos = 0;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        segundosTransmitidos++;
        actualizarTimer();
    }, 1000);

    // Conectar al stream
    console.log(`◉ Conectando a sala: ${roomName}`);
    console.log(`◆ Token: ${tokenLiveKit}`);

    const player = modal.querySelector('.live-player');
    if (player) {
        const placeholder = player.querySelector('.player-placeholder');
        if (placeholder) {
            placeholder.innerHTML = `
                <div class="icon">◈</div>
                <p style="letter-spacing:0.5px;">◉ Transmisión en vivo</p>
                <p style="font-size: 0.8rem; color: var(--text-muted); letter-spacing:0.3px;">Conectando...</p>
            `;
            setTimeout(() => {
                placeholder.innerHTML = `
                    <div class="icon">◈</div>
                    <p style="color: var(--success); letter-spacing:0.5px;">◆ Conectado</p>
                    <p style="font-size: 0.8rem; color: var(--text-muted); letter-spacing:0.3px;">Transmisión en curso</p>
                `;
            }, 1500);
        }
    }

    // Simular chat
    simularChat(streamId);
}

function cerrarModalTransmision() {
    const modal = document.querySelector('.modal-live');
    if (modal) modal.classList.remove('active');

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    segundosTransmitidos = 0;
    streamActual = null;
    liveActivo = false;

    // Limpiar chat
    const messages = document.querySelector('.chat-messages');
    if (messages) {
        messages.innerHTML = `<div class="empty-message">Sin mensajes aún</div>`;
    }
}

function actualizarTimer() {
    const minutos = Math.floor(segundosTransmitidos / 60);
    const segundos = segundosTransmitidos % 60;
    const timerDisplay = document.querySelector('.live-timer');
    if (timerDisplay) {
        timerDisplay.textContent = `⏱ ${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    }
}

// ================================================================
// SIMULAR CHAT
// ================================================================
function simularChat(streamId) {
    const messages = document.querySelector('.chat-messages');
    if (!messages) return;

    const usuarios = ['Ana', 'Carlos', 'María', 'Luis', 'Sofia', 'David', 'Elena', 'Jorge'];
    const mensajes = [
        '◈ Gran transmisión!',
        '◆ Me encanta este contenido',
        '◉ Excelente calidad',
        '✨ Increíble',
        '🌟 Sigan así!',
        '◈ Cuánto cuesta?',
        '◆ Ya quiero probar',
        '◉ 🔥🔥🔥'
    ];

    // Limpiar mensajes anteriores
    messages.innerHTML = '';

    let count = 0;
    const maxMessages = 5;

    const interval = setInterval(() => {
        if (count >= maxMessages) {
            clearInterval(interval);
            return;
        }

        const usuario = usuarios[Math.floor(Math.random() * usuarios.length)];
        const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)];
        const hora = new Date().toLocaleTimeString();

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message';
        msgDiv.innerHTML = `
            <span class="user">${usuario}</span>
            <span class="text">${mensaje}</span>
            <span class="time">${hora}</span>
        `;
        messages.appendChild(msgDiv);
        messages.scrollTop = messages.scrollHeight;

        count++;
    }, 3000);
}

// ================================================================
// ENVIAR MENSAJE AL CHAT
// ================================================================
function enviarMensajeChat() {
    const input = document.querySelector('.chat-input-live input');
    if (!input) return;

    const mensaje = input.value.trim();
    if (!mensaje) return;

    const messages = document.querySelector('.chat-messages');
    if (!messages) return;

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const usuario = perfil.nombre || 'Explorador';
    const hora = new Date().toLocaleTimeString();

    // Eliminar mensaje vacío
    const emptyMsg = messages.querySelector('.empty-message');
    if (emptyMsg) emptyMsg.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `
        <span class="user">${usuario}</span>
        <span class="text">${mensaje}</span>
        <span class="time">${hora}</span>
    `;
    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
    input.value = '';

    // Emitir mensaje via socket
    if (socket && streamActual) {
        socket.emit('chat_message', {
            streamId: streamActual._id,
            mensaje: mensaje,
            usuario: usuario
        });
    }
}

// ================================================================
// MODO OSCURO/CLARO
// ================================================================
function toggleModo() {
    modoOscuro = !modoOscuro;
    const body = document.body;
    if (modoOscuro) {
        body.classList.remove('modo-claro');
        localStorage.setItem('sariels_modo', 'oscuro');
        showToast('◆ Modo oscuro');
    } else {
        body.classList.add('modo-claro');
        localStorage.setItem('sariels_modo', 'claro');
        showToast('◇ Modo claro');
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
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    cargarModo();

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

    // Eventos
    if (btnCrearLive) {
        btnCrearLive.addEventListener('click', crearTransmision);
    }

    // Cerrar modal
    const modal = document.querySelector('.modal-live');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                cerrarModalTransmision();
            }
        });
    }

    const btnCerrar = document.querySelector('.btn-cerrar-modal');
    if (btnCerrar) {
        btnCerrar.addEventListener('click', cerrarModalTransmision);
    }

    // Enviar mensaje con Enter
    const chatInput = document.querySelector('.chat-input-live input');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                enviarMensajeChat();
            }
        });
    }

    const btnEnviar = document.querySelector('.chat-input-live button');
    if (btnEnviar) {
        btnEnviar.addEventListener('click', enviarMensajeChat);
    }

    // Verificar wallet
    const connectBtn = document.getElementById('connectWallet');
    const token = localStorage.getItem('galleta_token');
    if (token && connectBtn) {
        connectBtn.textContent = '✅ Conectado';
        connectBtn.disabled = true;
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', function() {
            window.location.href = '/';
        });
    }

    console.log('◈ Sariel\'s - Live Ultra Mega Pro');
    console.log('◉ Transmisiones en vivo listas');
    console.log('◆ Innovaciones: QR, Chat en vivo, Calendario, Tags, Modo oscuro');
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.unirseATransmision = unirseATransmision;
window.crearTransmision = crearTransmision;
window.generarQRLive = generarQRLive;
window.cerrarModalTransmision = cerrarModalTransmision;
window.enviarMensajeChat = enviarMensajeChat;
window.toggleModo = toggleModo;
window.cargarTransmisiones = cargarTransmisiones;