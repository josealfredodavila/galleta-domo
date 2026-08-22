// ================================================================
// LIVE.JS - VERSIÓN COMPLETA CON SUPABASE + LIVEKIT
// ================================================================

// ================================================================
// TOAST (reutiliza el de app.js)
// ================================================================
// showToast ya está definido en app.js

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let livekitRoom = null;
let transmisionActual = null;
let chatSubscription = null;
let socket = null;

// ================================================================
// ELEMENTOS DEL DOM
// ================================================================
const liveGrid = document.getElementById('liveGrid');
const liveCount = document.getElementById('liveCount');
const totalViewers = document.getElementById('totalViewers');

// ================================================================
// CREAR TRANSMISIÓN (CON SUPABASE)
// ================================================================
window.crearTransmision = async function() {
    if (!window.app || !window.app.usuario) {
        showToast('⚠️ Inicia sesión primero', 'error');
        if (confirm('¿Quieres iniciar sesión ahora?')) {
            const email = prompt('Correo:');
            if (email) {
                const pass = prompt('Contraseña:');
                if (pass) await app.iniciarSesion(email, pass);
            }
        }
        return;
    }

    const titulo = prompt('◆ Título de la transmisión:');
    if (!titulo || titulo.trim() === '') return;

    const tipo = confirm('¿Quieres cobrar por acceso? (Cancelar = Gratis)');
    let precio = 0;
    if (tipo) {
        precio = parseFloat(prompt('Precio en MXN:')) || 0;
    }

    const tagsInput = prompt('◈ Tags (separados por coma):');
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : ['En vivo'];

    // Crear en Supabase
    const transmision = await app.crearTransmision({
        titulo: titulo.trim(),
        descripcion: '',
        tags: tags,
        tipo: tipo ? 'pago' : 'gratis',
        precio: precio
    });

    if (!transmision) return;

    transmisionActual = transmision;
    
    // Conectar a LiveKit
    await conectarLiveKit(transmision.id);

    // Agregar al grid
    agregarLiveReal(transmision);

    showToast(`◉ Transmisión iniciada: ${titulo.trim()}`);
    abrirModalLive(transmision.id);
};

// ================================================================
// CONECTAR A LIVEKIT
// ================================================================
async function conectarLiveKit(transmisionId) {
    try {
        const nombre = window.app?.usuario?.user_metadata?.nombre || 'Streamer';
        
        const response = await fetch(`/api/token?room=transmision-${transmisionId}&name=${nombre}`);
        const data = await response.json();

        if (!data.token) {
            throw new Error('No se pudo obtener token');
        }

        const wsUrl = 'wss://csariels-domo-57ujk04t.livekit.cloud';
        livekitRoom = new LivekitClient.Room();

        await livekitRoom.connect(wsUrl, data.token);
        await livekitRoom.localParticipant.enableCameraAndMicrophone();

        // Mostrar video propio
        const videoContainer = document.getElementById('videoContainer');
        if (videoContainer) {
            videoContainer.innerHTML = '';
            livekitRoom.localParticipant.trackPublications.forEach(pub => {
                if (pub.track) {
                    const element = pub.track.attach();
                    videoContainer.appendChild(element);
                }
            });
        }

        // Escuchar nuevos participantes
        livekitRoom.on(LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                const element = track.attach();
                videoContainer.appendChild(element);
            }
        });

        showToast('◉ Conectado a LiveKit');
        return true;
    } catch (error) {
        console.error('Error LiveKit:', error);
        showToast('❌ Error al conectar: ' + error.message, 'error');
        return false;
    }
}

// ================================================================
// AGREGAR LIVE REAL (desde Supabase)
// ================================================================
function agregarLiveReal(transmision) {
    if (!liveGrid) return;

    const emptyState = liveGrid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const nombre = perfil.nombre || transmision.usuarios?.nombre || 'Streamer';
    const avatar = perfil.avatar || '✦';

    const card = document.createElement('div');
    card.className = 'live-card';
    card.dataset.id = transmision.id;
    card.onclick = function() { abrirModalLive(transmision.id); };

    const esPago = transmision.tipo_transmision === 'pago' && transmision.precio > 0;

    card.innerHTML = `
        <div class="live-thumbnail">
            <div class="live-badge">
                <span class="dot"></span> EN VIVO
            </div>
            <div class="live-placeholder">◈</div>
            <div class="live-overlay"></div>
            <div class="live-viewers">◉ ${transmision.espectadores || 0}</div>
            <button class="live-qr-btn" onclick="event.stopPropagation();generarQRLive()">◈ QR</button>
        </div>
        <div class="live-info">
            <div class="live-title">
                ${transmision.titulo}
                ${esPago ? `<span class="tag">◆ $${transmision.precio}</span>` : `<span class="tag">✨ Gratis</span>`}
            </div>
            <div class="live-host">
                <div class="host-avatar">${avatar}</div>
                <span class="host-name">${nombre}</span>
            </div>
            <div class="live-tags">
                ${transmision.tags?.map(tag => `<span class="tag live-tag">◉ ${tag}</span>`).join('') || ''}
            </div>
            <div class="live-meta">
                <span>⏱ ${new Date(transmision.fecha_inicio).toLocaleTimeString()}</span>
                <span>◆ ${esPago ? 'Pago' : 'Público'}</span>
            </div>
        </div>
    `;

    liveGrid.prepend(card);
    actualizarContadores();
}

// ================================================================
// ABRIR MODAL LIVE
// ================================================================
window.abrirModalLive = async function(transmisionId) {
    const modal = document.getElementById('modalLive');
    if (!modal) return;

    // Verificar si es pago
    const { data: transmision } = await app.supabase
        .from('transmisiones')
        .select('*')
        .eq('id', transmisionId)
        .single();

    if (transmision && transmision.tipo_transmision === 'pago' && transmision.precio > 0) {
        // Verificar si ya pagó
        const tieneAcceso = await app.verificarAcceso(transmisionId);
        if (!tieneAcceso) {
            const pagar = confirm(`Esta transmisión cuesta $${transmision.precio} MXN. ¿Quieres pagar para acceder?`);
            if (pagar) {
                const pago = await app.registrarPago(transmisionId, transmision.precio, 'stripe');
                if (!pago) return;
            } else {
                showToast('⚠️ Necesitas pagar para acceder', 'warning');
                return;
            }
        }
    }

    modal.classList.add('active');
    document.getElementById('liveStatusText').textContent = 'Conectando...';

    // Conectar a LiveKit como espectador
    if (!livekitRoom || livekitRoom.state === 'disconnected') {
        const nombre = window.app?.usuario?.user_metadata?.nombre || 'Espectador';
        const response = await fetch(`/api/token?room=transmision-${transmisionId}&name=${nombre}`);
        const data = await response.json();

        if (data.token) {
            const wsUrl = 'wss://csariels-domo-57ujk04t.livekit.cloud';
            livekitRoom = new LivekitClient.Room();
            await livekitRoom.connect(wsUrl, data.token);
            
            // Escuchar tracks de otros
            livekitRoom.on(LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
                const videoContainer = document.getElementById('videoContainer');
                if (videoContainer) {
                    const element = track.attach();
                    videoContainer.appendChild(element);
                }
            });

            // Ocultar placeholder
            const placeholder = document.querySelector('.player-placeholder');
            if (placeholder) placeholder.style.display = 'none';

            document.getElementById('liveStatusText').textContent = 'Conectado';
            showToast('◉ Conectado a la transmisión');
        }
    }

    // Suscribirse al chat
    if (chatSubscription) {
        await chatSubscription.unsubscribe();
        chatSubscription = null;
    }

    chatSubscription = app.suscribirseChat(transmisionId, (mensaje) => {
        agregarMensajeChat(mensaje.nombre_usuario || 'Anónimo', mensaje.mensaje);
    });

    // Cargar mensajes anteriores
    const mensajes = await app.obtenerMensajes(transmisionId);
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        mensajes.forEach(msg => {
            agregarMensajeChat(msg.nombre_usuario || 'Anónimo', msg.mensaje);
        });
    }

    // Actualizar contador de espectadores
    actualizarContadores();
};

// ================================================================
// AGREGAR MENSAJE AL CHAT
// ================================================================
function agregarMensajeChat(usuario, mensaje) {
    const messages = document.getElementById('chatMessages');
    if (!messages) return;

    const emptyMsg = messages.querySelector('.empty-message');
    if (emptyMsg) emptyMsg.remove();

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
}

// ================================================================
// ENVIAR MENSAJE AL CHAT
// ================================================================
window.enviarMensajeChat = async function() {
    const input = document.getElementById('chatInput');
    if (!input) return;

    const mensaje = input.value.trim();
    if (!mensaje) return;

    if (!transmisionActual) {
        showToast('⚠️ No hay transmisión activa', 'error');
        return;
    }

    await app.enviarMensaje(transmisionActual.id, mensaje);
    input.value = '';
};

// ================================================================
// CERRAR MODAL
// ================================================================
window.cerrarModalTransmision = async function() {
    const modal = document.getElementById('modalLive');
    if (modal) modal.classList.remove('active');

    if (chatSubscription) {
        await chatSubscription.unsubscribe();
        chatSubscription = null;
    }

    if (livekitRoom) {
        await livekitRoom.disconnect();
        livekitRoom = null;
    }

    const videoContainer = document.getElementById('videoContainer');
    if (videoContainer) videoContainer.innerHTML = '';

    const placeholder = document.querySelector('.player-placeholder');
    if (placeholder) placeholder.style.display = 'flex';
};

// ================================================================
// ACTUALIZAR CONTADORES
// ================================================================
function actualizarContadores() {
    const cards = document.querySelectorAll('.live-card');
    if (liveCount) liveCount.textContent = cards.length;

    // Actualizar espectadores (simulado)
    const viewers = cards.length * Math.floor(Math.random() * 10 + 1);
    if (totalViewers) totalViewers.textContent = viewers;
}

// ================================================================
// CARGAR TRANSMISIONES AL INICIO
// ================================================================
async function cargarTransmisiones() {
    if (!window.app) return;

    const transmisiones = await app.obtenerTransmisionesActivas();
    
    if (transmisiones.length === 0) {
        // Mostrar empty state
        if (liveGrid) {
            liveGrid.innerHTML = `
                <div class="empty-state">
                    <span class="icon">◈</span>
                    <h3>Sin transmisiones activas</h3>
                    <p>Inicia una transmisión para compartir en vivo</p>
                    <button class="btn-crear-live-empty" onclick="crearTransmision()">
                        <span>◉</span> Iniciar transmisión
                    </button>
                </div>
            `;
        }
        return;
    }

    transmisiones.forEach(trans => agregarLiveReal(trans));
}

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    // Cargar transmisiones
    setTimeout(cargarTransmisiones, 500);

    // Enter para enviar mensaje
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                enviarMensajeChat();
            }
        });
    }

    // Escape para cerrar modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') cerrarModalTransmision();
    });

    // Click fuera del modal
    const modal = document.getElementById('modalLive');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) cerrarModalTransmision();
        });
    }

    console.log('◈ Sariel\'s - Live Ultra Mega Pro');
    console.log('◉ Transmisiones en vivo listas');
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.cargarTransmisiones = cargarTransmisiones;
window.agregarLiveReal = agregarLiveReal;
window.abrirModalLive = abrirModalLive;
window.enviarMensajeChat = enviarMensajeChat;
window.cerrarModalTransmision = cerrarModalTransmision;
window.actualizarContadores = actualizarContadores;