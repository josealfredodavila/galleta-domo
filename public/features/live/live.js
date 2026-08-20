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
const liveCount = document.getElementById('liveCount');
const totalViewers = document.getElementById('totalViewers');

// ================================================================
// CREAR TRANSMISIÓN
// ================================================================
window.crearTransmision = function() {
    const token = localStorage.getItem('galleta_token');
    if (!token) {
        showToast('⚠️ Conecta tu wallet primero', 'error');
        return;
    }

    const titulo = prompt('◆ Título de la transmisión:');
    if (!titulo || titulo.trim() === '') return;

    const tagsInput = prompt('◈ Tags (separados por coma, ej: Música, Tokens, Gaming):');
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : ['En vivo'];

    showToast(`◉ Transmisión iniciada: ${titulo.trim()}`);

    // Actualizar contador
    if (liveCount) {
        const current = parseInt(liveCount.textContent) || 0;
        liveCount.textContent = current + 1;
    }

    // Agregar tarjeta simulada
    agregarLiveSimulado(titulo.trim(), tags);
};

// ================================================================
// AGREGAR LIVE SIMULADO
// ================================================================
function agregarLiveSimulado(titulo, tags) {
    if (!liveGrid) return;

    // Eliminar empty state si existe
    const emptyState = liveGrid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const nombre = perfil.nombre || 'Explorador';
    const avatar = perfil.avatar || '✦';

    const card = document.createElement('div');
    card.className = 'live-card';
    card.onclick = function() { abrirModalLive(); };

    card.innerHTML = `
        <div class="live-thumbnail">
            <div class="live-badge">
                <span class="dot"></span> EN VIVO
            </div>
            <div class="live-placeholder">◈</div>
            <div class="live-overlay"></div>
            <div class="live-viewers">◉ 1</div>
            <button class="live-qr-btn" onclick="event.stopPropagation();generarQRLive()">◈ QR</button>
        </div>
        <div class="live-info">
            <div class="live-title">${titulo}</div>
            <div class="live-host">
                <div class="host-avatar">${avatar}</div>
                <span class="host-name">${nombre}</span>
            </div>
            <div class="live-tags">
                ${tags.map(tag => `<span class="tag live-tag">◉ ${tag}</span>`).join('')}
            </div>
            <div class="live-meta">
                <span>⏱ Recién iniciado</span>
                <span>◆ Público</span>
            </div>
        </div>
    `;

    liveGrid.prepend(card);

    // Actualizar contador
    if (liveCount) {
        const current = parseInt(liveCount.textContent) || 0;
        liveCount.textContent = current + 1;
    }

    showToast('◉ Transmisión iniciada exitosamente');
    abrirModalLive();
}

// ================================================================
// ABRIR MODAL LIVE
// ================================================================
function abrirModalLive() {
    const modal = document.getElementById('modalLive');
    if (!modal) return;
    modal.classList.add('active');

    // Iniciar timer
    segundosTransmitidos = 0;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        segundosTransmitidos++;
        actualizarTimer();
    }, 1000);

    // Simular conexión
    const placeholder = document.querySelector('.player-placeholder');
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
            // Simular chat
            simularChat();
        }, 1500);
    }
}

// ================================================================
// CERRAR MODAL
// ================================================================
window.cerrarModalTransmision = function() {
    const modal = document.getElementById('modalLive');
    if (modal) modal.classList.remove('active');

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    segundosTransmitidos = 0;

    // Limpiar chat
    const messages = document.querySelector('.chat-messages');
    if (messages) {
        messages.innerHTML = `<div class="empty-message">Sin mensajes aún</div>`;
    }
};

// ================================================================
// ACTUALIZAR TIMER
// ================================================================
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
function simularChat() {
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

    const emptyMsg = messages.querySelector('.empty-message');
    if (emptyMsg) emptyMsg.remove();

    let count = 0;
    const maxMessages = 5;

    const interval = setInterval(() => {
        if (count >= maxMessages || !document.getElementById('modalLive')?.classList.contains('active')) {
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
// ENVIAR MENSAJE
// ================================================================
window.enviarMensajeChat = function() {
    const input = document.getElementById('chatInput');
    if (!input) return;

    const mensaje = input.value.trim();
    if (!mensaje) return;

    const messages = document.querySelector('.chat-messages');
    if (!messages) return;

    const perfil = JSON.parse(localStorage.getItem('sariels_perfil') || '{}');
    const usuario = perfil.nombre || 'Explorador';
    const hora = new Date().toLocaleTimeString();

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
};

// ================================================================
// GENERAR QR
// ================================================================
window.generarQRLive = function() {
    const url = window.location.href;

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
// EVENTOS
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
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

    // Cerrar modal con Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarModalTransmision();
        }
    });

    // Cerrar modal click fuera
    const modal = document.getElementById('modalLive');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                cerrarModalTransmision();
            }
        });
    }

    console.log('◈ Sariel\'s - Live Ultra Mega Pro');
    console.log('◉ Transmisiones en vivo listas');
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.crearTransmision = crearTransmision;
window.generarQRLive = generarQRLive;
window.enviarMensajeChat = enviarMensajeChat;
window.cerrarModalTransmision = cerrarModalTransmision;