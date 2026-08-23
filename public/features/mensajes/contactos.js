/* ================================================================
   CONTACTOS ULTRA MEGA PRO - SARIEL'S
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
let contactos = [];
let contactosFiltrados = [];
let filtroActual = 'todos';
let socket = null;
let modoOscuro = true;

// ================================================================
// ELEMENTOS DEL DOM
// ================================================================
const contactosList = document.getElementById('contactosList');
const searchInput = document.getElementById('searchInput');
const btnAgregar = document.getElementById('btnAgregar');
const filtros = document.querySelectorAll('.filtro');
const totalContactos = document.getElementById('totalContactos');
const onlineContactos = document.getElementById('onlineContactos');

// ================================================================
// VERIFICAR AUTENTICACIÓN (SIN REDIRECCIÓN)
// ================================================================
function verificarAutenticacion() {
    const token = localStorage.getItem('galleta_token');
    if (!token) {
        showToast('⚠️ Conecta tu wallet para ver contactos', 'warning');
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
        console.log('◉ Conectado al servidor de contactos');
        const userId = localStorage.getItem('userId');
        if (userId) {
            socket.emit('authenticate', { userId });
        }
    });

    socket.on('authenticated', (data) => {
        console.log('◆ Autenticado en Socket.IO');
    });

    socket.on('user_online', (data) => {
        actualizarEstadoContacto(data.userId, true);
        actualizarContadores();
    });

    socket.on('user_offline', (data) => {
        actualizarEstadoContacto(data.userId, false);
        actualizarContadores();
    });

    socket.on('new_contact_request', (data) => {
        showToast(`◈ ${data.nombre} quiere ser tu contacto`);
        cargarContactos();
    });

    socket.on('contact_accepted', (data) => {
        showToast(`◈ ${data.nombre} aceptó tu solicitud`);
        cargarContactos();
    });

    socket.on('disconnect', () => {
        console.log('◉ Desconectado del servidor');
    });
}

// ================================================================
// CARGAR CONTACTOS (SIN REDIRECCIÓN)
// ================================================================
async function cargarContactos() {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            cargarContactosEjemplo();
            return;
        }

        const response = await fetch('/api/contactos', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('galleta_token');
                localStorage.removeItem('userId');
                cargarContactosEjemplo();
                return;
            }
            throw new Error('Error al cargar contactos');
        }

        const data = await response.json();
        contactos = data.contactos || [];
        actualizarContadores();
        aplicarFiltros();

    } catch (error) {
        console.error('Error cargando contactos:', error);
        showToast('❌ Error al cargar contactos', 'error');
        cargarContactosEjemplo();
    }
}

// ================================================================
// CONTACTOS DE EJEMPLO (MODO DEMO)
// ================================================================
function cargarContactosEjemplo() {
    contactos = [
        { _id: '1', nombre: 'Ana Martínez', estado: 'conectado', esFavorito: true, verificado: true, walletAddress: '0x7F3a...9Bc2' },
        { _id: '2', nombre: 'Carlos López', estado: 'desconectado', esFavorito: false, verificado: false, walletAddress: '0x8A4b...3Cd1' },
        { _id: '3', nombre: 'María García', estado: 'conectado', esFavorito: false, verificado: true, walletAddress: '0x9B5c...4De2' },
        { _id: '4', nombre: 'Juan Pérez', estado: 'desconectado', esFavorito: false, verificado: false, walletAddress: '0x1C6d...5Ef3' },
        { _id: '5', nombre: 'Sofia Ramírez', estado: 'conectado', esFavorito: true, verificado: true, walletAddress: '0x2D7e...6Fg4' }
    ];
    actualizarContadores();
    aplicarFiltros();
    if (contactos.length > 0) {
        showToast('◈ Modo demostración - Contactos de ejemplo', 'warning');
    }
}

// ================================================================
// ACTUALIZAR CONTADORES
// ================================================================
function actualizarContadores() {
    const total = contactos.length;
    const online = contactos.filter(c => c.estado === 'conectado').length;

    if (totalContactos) totalContactos.textContent = total;
    if (onlineContactos) onlineContactos.textContent = online;
}

// ================================================================
// RENDERIZAR CONTACTOS (Estilo Premium)
// ================================================================
function renderizarContactos(lista) {
    if (!lista || lista.length === 0) {
        contactosList.innerHTML = `
            <div class="empty-state">
                <span class="icon">◈</span>
                <h3>Sin contactos</h3>
                <p>Comienza a agregar personas a tu red</p>
                <button class="btn-accion" onclick="abrirAgregarContacto()">◈ Agregar contacto</button>
            </div>
        `;
        return;
    }

    contactosList.innerHTML = lista.map(contacto => {
        const esOnline = contacto.estado === 'conectado';
        const esFavorito = contacto.esFavorito || false;
        const inicial = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';

        return `
            <div class="contacto-card" data-id="${contacto._id}">
                <div class="contacto-avatar ${esOnline ? 'online' : 'offline'} ${esFavorito ? 'favorito' : ''}">
                    ${inicial}
                    ${esOnline ? '<span class="online-dot"></span>' : ''}
                    ${esFavorito ? '<span class="favorito-badge">◆</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">
                        ${contacto.nombre || 'Usuario'}
                        ${contacto.verificado ? '<span class="verified">✦ VERIFICADO</span>' : ''}
                    </div>
                    <div class="estado ${esOnline ? 'online' : 'offline'}">
                        ${esOnline ? '◉ En línea' : '◈ Desconectado'}
                    </div>
                    <div class="contacto-meta">
                        <span>◈ ${contacto.walletAddress || 'Sin wallet'}</span>
                    </div>
                </div>
                <div class="contacto-actions">
                    <button class="mensaje" onclick="irAMensajes('${contacto._id}')" title="Enviar mensaje">◈</button>
                    <button class="favorito ${esFavorito ? 'active' : ''}" onclick="toggleFavorito('${contacto._id}')" title="Favorito">◆</button>
                    <button class="bloquear" onclick="bloquearContacto('${contacto._id}')" title="Bloquear">⊘</button>
                    <button class="eliminar" onclick="eliminarContacto('${contacto._id}')" title="Eliminar">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// FILTROS
// ================================================================
function aplicarFiltros() {
    const query = searchInput.value.toLowerCase().trim();

    contactosFiltrados = contactos.filter(c => {
        const matchNombre = c.nombre?.toLowerCase().includes(query) || false;
        const matchWallet = c.walletAddress?.toLowerCase().includes(query) || false;
        const matchBusqueda = matchNombre || matchWallet;

        let matchFiltro = true;
        if (filtroActual === 'online') {
            matchFiltro = c.estado === 'conectado';
        } else if (filtroActual === 'favoritos') {
            matchFiltro = c.esFavorito === true;
        } else if (filtroActual === 'recientes') {
            matchFiltro = true;
        }

        return matchBusqueda && matchFiltro;
    });

    renderizarContactos(contactosFiltrados);
}

// ================================================================
// ACTUALIZAR ESTADO DE CONTACTO
// ================================================================
function actualizarEstadoContacto(userId, online) {
    const items = contactosList.querySelectorAll('.contacto-card');
    items.forEach(item => {
        if (item.dataset.id === userId) {
            const avatar = item.querySelector('.contacto-avatar');
            const estado = item.querySelector('.estado');
            const dot = item.querySelector('.online-dot');
            
            if (avatar) {
                avatar.className = `contacto-avatar ${online ? 'online' : 'offline'}`;
                if (online && !dot) {
                    const newDot = document.createElement('span');
                    newDot.className = 'online-dot';
                    avatar.appendChild(newDot);
                } else if (!online && dot) {
                    dot.remove();
                }
            }
            if (estado) {
                estado.textContent = online ? '◉ En línea' : '◈ Desconectado';
                estado.className = `estado ${online ? 'online' : 'offline'}`;
            }
        }
    });
}

// ================================================================
// ACCIONES DE CONTACTOS
// ================================================================
window.irAMensajes = function(contactoId) {
    window.location.href = `/features/mensajes/mensajes.html?contacto=${contactoId}`;
};

window.toggleFavorito = async function(contactoId) {
    try {
        const token = localStorage.getItem('galleta_token');
        const contacto = contactos.find(c => c._id === contactoId);
        if (!contacto) return;

        if (!token) {
            contacto.esFavorito = !contacto.esFavorito;
            actualizarContadores();
            aplicarFiltros();
            showToast(contacto.esFavorito ? '◆ Agregado a favoritos' : '◆ Favorito eliminado');
            return;
        }

        const response = await fetch('/api/contactos/favorito', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contactoId: contactoId,
                favorito: !contacto.esFavorito
            })
        });

        if (response.ok) {
            showToast(contacto.esFavorito ? '◆ Agregado a favoritos' : '◆ Favorito eliminado');
            cargarContactos();
        } else {
            throw new Error('Error al actualizar favorito');
        }
    } catch (error) {
        console.error('Error actualizando favorito:', error);
        showToast('❌ Error al actualizar favorito', 'error');
    }
};

window.bloquearContacto = async function(contactoId) {
    if (!confirm('¿Estás seguro de bloquear a este usuario?')) return;

    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            showToast('✅ Usuario bloqueado (modo demo)', 'warning');
            return;
        }

        const response = await fetch('/api/perfil/bloquear', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ usuarioId: contactoId })
        });

        if (response.ok) {
            showToast('✅ Usuario bloqueado');
            cargarContactos();
        } else {
            throw new Error('Error al bloquear');
        }
    } catch (error) {
        console.error('Error bloqueando:', error);
        showToast('❌ Error al bloquear', 'error');
    }
};

window.eliminarContacto = async function(contactoId) {
    if (!confirm('¿Estás seguro de eliminar este contacto?')) return;

    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            contactos = contactos.filter(c => c._id !== contactoId);
            actualizarContadores();
            aplicarFiltros();
            showToast('✅ Contacto eliminado (modo demo)');
            return;
        }

        const response = await fetch(`/api/contactos/${contactoId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            showToast('✅ Contacto eliminado');
            cargarContactos();
        } else {
            throw new Error('Error al eliminar contacto');
        }
    } catch (error) {
        console.error('Error eliminando contacto:', error);
        showToast('❌ Error al eliminar contacto', 'error');
    }
};

// ================================================================
// AGREGAR CONTACTO
// ================================================================
window.abrirAgregarContacto = function() {
    const wallet = prompt('◈ Ingresa la dirección wallet del usuario:');
    if (!wallet || wallet.length < 10) {
        showToast('⚠️ Ingresa una wallet válida', 'warning');
        return;
    }
    buscarYAgregarContacto(wallet);
};

async function buscarYAgregarContacto(wallet) {
    try {
        const token = localStorage.getItem('galleta_token');
        if (!token) {
            const nombre = prompt('◈ Nombre del contacto (modo demo):');
            if (nombre && nombre.trim()) {
                contactos.push({
                    _id: Date.now().toString(),
                    nombre: nombre.trim(),
                    estado: 'desconectado',
                    esFavorito: false,
                    verificado: false,
                    walletAddress: wallet
                });
                actualizarContadores();
                aplicarFiltros();
                showToast(`✅ Contacto ${nombre.trim()} agregado (modo demo)`);
            }
            return;
        }

        const response = await fetch(`/api/perfil/buscar?wallet=${wallet}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Usuario no encontrado');

        const data = await response.json();
        if (!data.encontrado) {
            showToast('❌ Usuario no encontrado', 'error');
            return;
        }

        const addResponse = await fetch('/api/perfil/contacto', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ contactoId: data.usuarioId })
        });

        if (addResponse.ok) {
            showToast('✅ Contacto agregado');
            cargarContactos();
        } else {
            const error = await addResponse.json();
            showToast(`❌ ${error.error || 'Error al agregar contacto'}`, 'error');
        }
    } catch (error) {
        console.error('Error agregando contacto:', error);
        showToast('❌ Error al agregar contacto', 'error');
    }
}

// ================================================================
// FILTROS UI
// ================================================================
filtros.forEach(btn => {
    btn.addEventListener('click', function() {
        filtros.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        filtroActual = this.dataset.filtro;
        aplicarFiltros();
    });
});

// ================================================================
// BÚSQUEDA
// ================================================================
searchInput.addEventListener('input', function() {
    aplicarFiltros();
});

// ================================================================
// AGREGAR CONTACTO (BOTÓN)
// ================================================================
btnAgregar.addEventListener('click', abrirAgregarContacto);

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
    cargarContactos();

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

    console.log('◈ Sariel\'s - Contactos Ultra Mega Pro (sin redirección)');
    console.log('◆ Contactos cargados:', contactos.length);
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.irAMensajes = irAMensajes;
window.toggleFavorito = toggleFavorito;
window.bloquearContacto = bloquearContacto;
window.eliminarContacto = eliminarContacto;
window.abrirAgregarContacto = abrirAgregarContacto;
window.toggleModo = toggleModo;
window.cargarContactos = cargarContactos;