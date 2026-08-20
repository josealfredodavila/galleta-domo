/* ================================================================
   MENSAJES ULTRA MEGA PRO - SARIEL'S
   Lógica premium - Sin redirección agresiva
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
let conversacionActual = null;
let mensajesCargados = [];
let modoOscuro = true;
let paginaMensajes = 1;
let cargandoMensajes = false;
let hayMasMensajes = true;

// ================================================================
// ELEMENTOS DEL DOM
// ================================================================
const conversacionesList = document.getElementById('conversacionesList');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const btnEnviar = document.getElementById('btnEnviar');
const chatNombre = document.querySelector('.chat-nombre');
const chatEstado = document.querySelector('.chat-estado');
const chatAvatar = document.querySelector('.chat-avatar');

// ================================================================
// VERIFICAR AUTENTICACIÓN (SIN REDIRECCIÓN)
// ================================================================
function verificarAutenticacion() {
    const token = localStorage.getItem('galleta_token');
    if (!token) {
        showToast('⚠️ Conecta tu wallet para usar mensajería', 'warning');
        return false;
    }
    return true;
}

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
        console.log('◉ Conectado al servidor de mensajería');
        const userId = localStorage.getItem('userId');
        if (userId) {
            socket.emit('authenticate', { userId });
        }
    });

    socket.on('authenticated', (data) => {
        console.log('◆ Autenticado en Socket.IO');
    });

    socket.on('new_message', (data) => {
        const mensaje = data.mensaje;
        const de = data.de;

        if (conversacionActual && conversacionActual._id === de) {
            agregarMensajeAlChat(mensaje, false);
            marcarMensajesComoLeidos(de);
        }

        cargarConversaciones();
        mostrarNotificacionMensaje(data);
    });

    socket.on('user_online', (data) => {
        actualizarEstadoContacto(data.userId, true);
    });

    socket.on('user_offline', (data) => {
        actualizarEstadoContacto(data.userId, false);
    });

    socket.on('typing', (data) => {
        if (conversacionActual && conversacionActual._id === data.userId) {
            mostrarIndicadorEscritura(data.userName);
        }
    });

    socket.on('disconnect', () => {
        console.log('◉ Desconectado del servidor');
    });
}

// ================================================================
// NOTIFICACIÓN DE MENSAJE
// ================================================================
function mostrarNotificacionMensaje(data) {
    const usuario = data.usuario?.nombre || 'Alguien';
    const mensaje = data.mensaje?.contenido || 'Nuevo mensaje';
    
    if (document.hidden) {
        if (Notification.permission === 'granted') {
            new Notification(`◈ ${usuario}`, {
                body: mensaje,
                icon: '/favicon.ico'
            });
        }
    }
    
    showToast(`◈ ${usuario}: ${mensaje.substring(0, 50)}${mensaje.length > 50 ? '...' : ''}`);
}

// ================================================================
// CARGAR CONVERSACIONES
// ================================================================
async function cargarConversaciones() {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            cargarConversacionesEjemplo();
            return;
        }

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
                <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
                    <div style="font-size: 2.5rem; margin-bottom: 12px; font-family:'Orbitron',monospace; color:var(--gold); opacity:0.4; letter-spacing:2px;">◈</div>
                    <p style="letter-spacing:0.3px;">Sin conversaciones</p>
                    <p style="font-size: 0.75rem; letter-spacing:0.3px;">Agrega contactos para empezar a chatear</p>
                </div>
            `;
            return;
        }

        conversacionesList.innerHTML = conversaciones.map(conv => {
            const contacto = conv.contacto || {};
            const ultimoMsg = conv.ultimoMensaje || {};
            const esMiMensaje = ultimoMsg.de === usuarioActual?._id;
            const fecha = ultimoMsg.createdAt ? new Date(ultimoMsg.createdAt) : null;
            const estaActivo = contacto.estado === 'conectado';

            return `
                <div class="conv-item ${conversacionActual && conversacionActual._id === contacto._id ? 'active' : ''}"
                     data-id="${contacto._id}"
                     onclick="abrirConversacion('${contacto._id}')">
                    <div class="conv-avatar">
                        ${contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦'}
                        ${estaActivo ? '<span class="online-dot"></span>' : ''}
                    </div>
                    <div class="conv-info">
                        <div class="conv-nombre">${contacto.nombre || 'Usuario'}</div>
                        <div class="conv-msg">
                            ${esMiMensaje ? '◈ Tú: ' : ''}${ultimoMsg.contenido || 'Sin mensajes'}
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
        cargarConversacionesEjemplo();
    }
}

// ================================================================
// CONVERSACIONES DE EJEMPLO (MODO DEMO)
// ================================================================
function cargarConversacionesEjemplo() {
    conversacionesList.innerHTML = `
        <div class="conv-item active" data-id="1" onclick="seleccionarConversacionDemo(1)">
            <div class="conv-avatar">✦</div>
            <div class="conv-info">
                <div class="conv-nombre">Ana Martínez</div>
                <div class="conv-msg">Hola, ¿cómo estás?</div>
            </div>
            <div class="conv-meta">
                <div class="conv-hora">14:30</div>
                <span class="conv-badge">2</span>
            </div>
        </div>
        <div class="conv-item" data-id="2" onclick="seleccionarConversacionDemo(2)">
            <div class="conv-avatar">◆</div>
            <div class="conv-info">
                <div class="conv-nombre">Carlos López</div>
                <div class="conv-msg">Nos vemos mañana</div>
            </div>
            <div class="conv-meta">
                <div class="conv-hora">12:15</div>
            </div>
        </div>
        <div class="conv-item" data-id="3" onclick="seleccionarConversacionDemo(3)">
            <div class="conv-avatar">◈</div>
            <div class="conv-info">
                <div class="conv-nombre">María García</div>
                <div class="conv-msg">Gracias por tu ayuda</div>
            </div>
            <div class="conv-meta">
                <div class="conv-hora">Ayer</div>
            </div>
        </div>
    `;
    showToast('◈ Modo demostración - Conversaciones de ejemplo', 'warning');
}

function seleccionarConversacionDemo(id) {
    const mensajesDemo = {
        1: [
            { tipo: 'recibido', texto: 'Hola, ¿cómo estás?', hora: '14:25' },
            { tipo: 'enviado', texto: '¡Hola! Todo bien, ¿y tú?', hora: '14:27', leido: true },
            { tipo: 'recibido', texto: 'Bien, quería preguntarte sobre los tokens', hora: '14:28' },
            { tipo: 'enviado', texto: 'Claro, ¿qué necesitas saber?', hora: '14:30', leido: true }
        ],
        2: [
            { tipo: 'recibido', texto: '¿Confirmamos la reunión?', hora: '12:10' },
            { tipo: 'enviado', texto: 'Sí, a las 5 pm', hora: '12:12', leido: true },
            { tipo: 'recibido', texto: 'Nos vemos mañana', hora: '12:15' }
        ],
        3: [
            { tipo: 'enviado', texto: '¿Necesitas ayuda con algo más?', hora: '10:00', leido: true },
            { tipo: 'recibido', texto: 'Gracias por tu ayuda', hora: '10:05' }
        ]
    };

    const mensajes = mensajesDemo[id] || [];
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';

    if (mensajes.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <span class="icon">◈</span>
                <h3>Sin mensajes</h3>
                <p>Inicia la conversación</p>
            </div>
        `;
        return;
    }

    mensajes.forEach(msg => {
        const div = document.createElement('div');
        div.className = `msg ${msg.tipo}`;
        div.innerHTML = `
            ${msg.texto}
            <span class="msg-hora">${msg.hora}</span>
            ${msg.leido ? '<span class="msg-leido">✓✓ Leído</span>' : ''}
        `;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;

    document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
    const selected = document.querySelector(`.conv-item[data-id="${id}"]`);
    if (selected) selected.classList.add('active');
}

// ================================================================
// ABRIR CONVERSACIÓN
// ================================================================
window.abrirConversacion = async function(contactoId) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            seleccionarConversacionDemo(contactoId);
            return;
        }

        const response = await fetch(`/api/perfil/${contactoId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Error al cargar contacto');

        const contacto = await response.json();
        conversacionActual = contacto;

        if (chatNombre) chatNombre.textContent = contacto.nombre || 'Usuario';
        if (chatEstado) {
            const online = contacto.estado === 'conectado';
            chatEstado.textContent = online ? '◉ En línea' : '◈ Desconectado';
            chatEstado.className = `chat-estado ${online ? 'online' : ''}`;
        }
        if (chatAvatar) {
            chatAvatar.textContent = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';
        }

        await marcarMensajesComoLeidos(contactoId);
        paginaMensajes = 1;
        hayMasMensajes = true;
        await cargarMensajes(contactoId, 1);
        await cargarConversaciones();

        chatInput.disabled = false;
        btnEnviar.disabled = false;
        chatInput.focus();

        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        console.error('Error abriendo conversación:', error);
        showToast('❌ Error al abrir conversación', 'error');
    }
};

// ================================================================
// CARGAR MENSAJES (CON PAGINACIÓN)
// ================================================================
async function cargarMensajes(contactoId, page = 1) {
    if (cargandoMensajes) return;
    cargandoMensajes = true;

    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            cargandoMensajes = false;
            return;
        }

        const response = await fetch(`/api/mensajes/${contactoId}?page=${page}&limit=50`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Error al cargar mensajes');

        const data = await response.json();
        const mensajes = data.mensajes || [];
        const totalPages = data.pagination?.pages || 1;

        hayMasMensajes = page < totalPages;

        if (page === 1) {
            chatMessages.innerHTML = '';
            mensajesCargados = [];
        }

        if (mensajes.length > 0) {
            const fragment = document.createDocumentFragment();
            mensajes.forEach(msg => {
                const el = crearElementoMensaje(msg, false);
                fragment.appendChild(el);
            });
            chatMessages.prepend(fragment);
            mensajesCargados = [...mensajes, ...mensajesCargados];
        } else if (page === 1) {
            chatMessages.innerHTML = `
                <div class="empty-chat">
                    <span class="icon">◈</span>
                    <h3>Sin mensajes</h3>
                    <p>Inicia la conversación</p>
                </div>
            `;
        }

        if (page === 1) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

    } catch (error) {
        console.error('Error cargando mensajes:', error);
    } finally {
        cargandoMensajes = false;
    }
}

// ================================================================
// CREAR ELEMENTO DE MENSAJE
// ================================================================
function crearElementoMensaje(mensaje, scroll = true) {
    const esEnviado = mensaje.de === usuarioActual?._id;
    const tipo = esEnviado ? 'enviado' : 'recibido';
    const fecha = new Date(mensaje.createdAt);

    const div = document.createElement('div');
    div.className = `msg ${tipo}`;
    
    let contenido = '';
    
    if (mensaje.contenido) {
        contenido += `<span class="msg-text">${mensaje.contenido}</span>`;
    }
    
    if (mensaje.archivo) {
        const ext = mensaje.archivo.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            contenido += `
                <div class="msg-archivo" onclick="window.open('${mensaje.archivo}', '_blank')">
                    <img src="${mensaje.archivo}" alt="Imagen" loading="lazy" />
                </div>
            `;
        } else if (['mp4', 'webm', 'mov'].includes(ext)) {
            contenido += `
                <div class="msg-archivo">
                    <video controls src="${mensaje.archivo}"></video>
                </div>
            `;
        } else {
            contenido += `
                <div class="msg-archivo">
                    <a href="${mensaje.archivo}" target="_blank" class="file-link">◈ Ver archivo</a>
                </div>
            `;
        }
    }
    
    if (mensaje.tipo === 'comprobante') {
        contenido += `<div class="msg-comprobante">◈ Comprobante de pago</div>`;
    }
    
    if (mensaje.reacciones && Object.keys(mensaje.reacciones).length > 0) {
        const reaccionesStr = Object.entries(mensaje.reacciones)
            .map(([emoji, count]) => `${emoji} ${count}`)
            .join(' ');
        contenido += `<div class="msg-reacciones">${reaccionesStr}</div>`;
    }
    
    contenido += `<span class="msg-hora">${formatearHora(fecha)}</span>`;
    
    div.innerHTML = contenido;
    return div;
}

function agregarMensajeAlChat(mensaje, scroll = true) {
    const empty = chatMessages.querySelector('.empty-chat');
    if (empty) empty.remove();

    const div = crearElementoMensaje(mensaje, scroll);
    chatMessages.appendChild(div);

    if (scroll) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================
async function enviarMensaje() {
    const contenido = chatInput.value.trim();
    if (!contenido || !conversacionActual) {
        if (!conversacionActual) showToast('⚠️ Selecciona una conversación', 'warning');
        return;
    }

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

        chatInput.value = '';
        agregarMensajeAlChat(data.mensaje);
        cargarConversaciones();

        if (socket) {
            socket.emit('typing', {
                userId: conversacionActual._id,
                userName: usuarioActual?.nombre
            });
        }

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showToast('❌ Error al enviar mensaje', 'error');
    }
}

// ================================================================
// INDICADOR DE ESCRITURA
// ================================================================
let typingTimeout = null;

function mostrarIndicadorEscritura(userName) {
    const estado = document.getElementById('chatEstado');
    if (estado && !estado.textContent.includes('escribiendo')) {
        estado.textContent = `◈ ${userName || 'Alguien'} está escribiendo...`;
        estado.className = 'chat-estado typing';
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            if (conversacionActual) {
                const online = conversacionActual.estado === 'conectado';
                estado.textContent = online ? '◉ En línea' : '◈ Desconectado';
                estado.className = `chat-estado ${online ? 'online' : ''}`;
            }
        }, 3000);
    }
}

// ================================================================
// MARCAR MENSAJES COMO LEÍDOS
// ================================================================
async function marcarMensajesComoLeidos(contactoId) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) return;
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

// ================================================================
// ACTUALIZAR ESTADO DE CONTACTO
// ================================================================
function actualizarEstadoContacto(userId, online) {
    const items = conversacionesList.querySelectorAll('.conv-item');
    items.forEach(item => {
        if (item.dataset.id === userId) {
            const avatar = item.querySelector('.conv-avatar');
            if (avatar) {
                const dot = avatar.querySelector('.online-dot');
                if (online) {
                    if (!dot) {
                        const newDot = document.createElement('span');
                        newDot.className = 'online-dot';
                        avatar.appendChild(newDot);
                    }
                } else if (dot) {
                    dot.remove();
                }
            }
        }
    });

    if (conversacionActual && conversacionActual._id === userId) {
        if (chatEstado) {
            chatEstado.textContent = online ? '◉ En línea' : '◈ Desconectado';
            chatEstado.className = `chat-estado ${online ? 'online' : ''}`;
        }
    }
}

// ================================================================
// NUEVA CONVERSACIÓN
// ================================================================
window.nuevaConversacion = function() {
    const wallet = prompt('◈ Ingresa la dirección wallet del usuario:');
    if (!wallet || wallet.length < 10) {
        showToast('⚠️ Ingresa una wallet válida', 'warning');
        return;
    }
    buscarYAgregarConversacion(wallet);
};

async function buscarYAgregarConversacion(wallet) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            showToast('⚠️ Conecta tu wallet para iniciar conversaciones', 'warning');
            return;
        }

        const response = await fetch(`/api/perfil/buscar?wallet=${wallet}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Usuario no encontrado');

        const data = await response.json();
        if (data.encontrado) {
            abrirConversacion(data.usuarioId);
            showToast('◈ Conversación iniciada');
        } else {
            showToast('❌ Usuario no encontrado', 'error');
        }
    } catch (error) {
        console.error('Error buscando usuario:', error);
        showToast('❌ Error al buscar usuario', 'error');
    }
}

// ================================================================
// CARGAR MÁS MENSAJES (SCROLL INFINITO)
// ================================================================
function cargarMasMensajes() {
    if (chatMessages.scrollTop === 0 && hayMasMensajes && !cargandoMensajes && conversacionActual) {
        paginaMensajes++;
        cargarMensajes(conversacionActual._id, paginaMensajes);
    }
}

// ================================================================
// UTILIDADES
// ================================================================
function formatearHora(fecha) {
    return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
document.addEventListener('DOMContentLoaded', function() {
    cargarModo();
    verificarAutenticacion();
    conectarSocket();
    cargarConversaciones();

    btnEnviar.addEventListener('click', enviarMensaje);

    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviarMensaje();
        }
    });

    chatMessages.addEventListener('scroll', function() {
        if (this.scrollTop === 0) {
            cargarMasMensajes();
        }
    });

    const btnNuevo = document.querySelector('.btn-nuevo');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', nuevaConversacion);
    }

    // Botón de modo oscuro
    const btnModo = document.createElement('button');
    btnModo.textContent = modoOscuro ? '◆' : '◇';
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
        font-family: 'Inter', sans-serif;
    `;
    btnModo.onmouseover = () => btnModo.style.transform = 'scale(1.1)';
    btnModo.onmouseout = () => btnModo.style.transform = 'scale(1)';
    btnModo.onclick = toggleModo;
    document.body.appendChild(btnModo);

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Verificar wallet (solo UI, sin redirigir)
    const token = localStorage.getItem('galleta_token');
    const connectBtn = document.getElementById('connectWallet');
    if (token && connectBtn) {
        connectBtn.textContent = '✅ Conectado';
        connectBtn.disabled = true;
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', function() {
            if (confirm('⚠️ ¿Quieres ir al inicio para conectar tu wallet?')) {
                window.location.href = '/';
            }
        });
    }

    console.log('◈ Sariel\'s - Mensajes Ultra Mega Pro (sin redirección)');
    console.log('◆ Conversaciones cargadas');
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.abrirConversacion = abrirConversacion;
window.nuevaConversacion = nuevaConversacion;
window.enviarMensaje = enviarMensaje;
window.toggleModo = toggleModo;
window.cargarConversaciones = cargarConversaciones;