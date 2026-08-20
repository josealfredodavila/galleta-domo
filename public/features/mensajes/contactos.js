// public/features/mensajes/contactos.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let contactos = [];
    let contactosFiltrados = [];
    let filtroActual = 'todos';
    let socket = null;

    // ========================================
    // ELEMENTOS DEL DOM
    // ========================================
    const contactosList = document.getElementById('contactosList');
    const searchInput = document.getElementById('searchInput');
    const btnAgregar = document.getElementById('btnAgregar');
    const filtros = document.querySelectorAll('.filtro');

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
            console.log('🔌 Conectado al servidor de contactos');
            const userId = localStorage.getItem('userId');
            if (userId) {
                socket.emit('authenticate', { userId });
            }
        });

        socket.on('user_online', (data) => {
            actualizarEstadoContacto(data.userId, true);
        });

        socket.on('user_offline', (data) => {
            actualizarEstadoContacto(data.userId, false);
        });

        socket.on('new_contact_request', (data) => {
            mostrarNotificacion(`📩 ${data.nombre} quiere ser tu contacto`);
            cargarContactos();
        });
    }

    // ========================================
    // CARGAR CONTACTOS
    // ========================================
    async function cargarContactos() {
        try {
            const token = localStorage.getItem('galleta_token');
            if (!token) {
                window.location.href = '/';
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
                    window.location.href = '/';
                }
                throw new Error('Error al cargar contactos');
            }

            const data = await response.json();
            contactos = data.contactos || [];
            aplicarFiltros();

        } catch (error) {
            console.error('Error cargando contactos:', error);
            mostrarNotificacion('❌ Error al cargar contactos', 'error');
        }
    }

    // ========================================
    // RENDERIZAR CONTACTOS
    // ========================================
    function renderizarContactos(lista) {
        if (!lista || lista.length === 0) {
            contactosList.innerHTML = `
                <div class="empty-state">
                    <span class="icon">👤</span>
                    <h3>Sin contactos</h3>
                    <p>Comienza a agregar personas a tu red</p>
                    <button class="btn-accion" onclick="abrirAgregarContacto()">➕ Agregar contacto</button>
                </div>
            `;
            return;
        }

        contactosList.innerHTML = lista.map(contacto => {
            const esOnline = contacto.estado === 'conectado';
            const esFavorito = contacto.esFavorito || false;

            return `
                <div class="contacto-card" data-id="${contacto._id}">
                    <div class="contacto-avatar ${esOnline ? 'online' : 'offline'} ${esFavorito ? 'favorito' : ''}">
                        ${contacto.fotoPerfil ? `<img src="${contacto.fotoPerfil}" alt="${contacto.nombre}" />` : (contacto.nombre ? contacto.nombre[0].toUpperCase() : '👤')}
                        ${esFavorito ? '<span class="favorito-badge">⭐</span>' : ''}
                    </div>
                    <div class="contacto-info">
                        <div class="nombre">
                            ${contacto.nombre || 'Usuario'}
                            ${contacto.verificado ? '<span class="verified">✦ VERIFICADO</span>' : ''}
                        </div>
                        <div class="estado ${esOnline ? 'online' : 'offline'}">
                            ${esOnline ? '🟢 En línea' : '⚪ Desconectado'}
                        </div>
                        <div class="contacto-meta">
                            <span>📱 ${contacto.walletAddress ? contacto.walletAddress.slice(0, 10) + '...' : 'Sin wallet'}</span>
                            ${contacto.ultimoMensaje ? `<span>💬 ${contacto.ultimoMensaje.slice(0, 20)}${contacto.ultimoMensaje.length > 20 ? '...' : ''}</span>` : ''}
                        </div>
                    </div>
                    <div class="contacto-actions">
                        <button class="mensaje" onclick="irAMensajes('${contacto._id}')" title="Enviar mensaje">💬</button>
                        <button class="favorito ${esFavorito ? 'active' : ''}" onclick="toggleFavorito('${contacto._id}')" title="Favorito">⭐</button>
                        <button class="bloquear" onclick="bloquearContacto('${contacto._id}')" title="Bloquear">🚫</button>
                        <button class="eliminar" onclick="eliminarContacto('${contacto._id}')" title="Eliminar">✕</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ========================================
    // FILTROS
    // ========================================
    function aplicarFiltros() {
        const query = searchInput.value.toLowerCase().trim();

        contactosFiltrados = contactos.filter(c => {
            // Filtro por búsqueda
            const matchNombre = c.nombre?.toLowerCase().includes(query) || false;
            const matchWallet = c.walletAddress?.toLowerCase().includes(query) || false;
            const matchBusqueda = matchNombre || matchWallet;

            // Filtro por tipo
            let matchFiltro = true;
            if (filtroActual === 'online') {
                matchFiltro = c.estado === 'conectado';
            } else if (filtroActual === 'favoritos') {
                matchFiltro = c.esFavorito === true;
            } else if (filtroActual === 'recientes') {
                matchFiltro = true; // Se ordena después
            }

            return matchBusqueda && matchFiltro;
        });

        // Ordenar por recientes si aplica
        if (filtroActual === 'recientes') {
            contactosFiltrados.sort((a, b) => {
                const fechaA = a.ultimoMensaje ? new Date(a.ultimoMensaje) : new Date(0);
                const fechaB = b.ultimoMensaje ? new Date(b.ultimoMensaje) : new Date(0);
                return fechaB - fechaA;
            });
        }

        renderizarContactos(contactosFiltrados);
    }

    // ========================================
    // ACTUALIZAR ESTADO DE CONTACTO
    // ========================================
    function actualizarEstadoContacto(userId, online) {
        const items = contactosList.querySelectorAll('.contacto-card');
        items.forEach(item => {
            if (item.dataset.id === userId) {
                const avatar = item.querySelector('.contacto-avatar');
                const estado = item.querySelector('.estado');
                if (avatar) {
                    avatar.className = `contacto-avatar ${online ? 'online' : 'offline'}`;
                }
                if (estado) {
                    estado.textContent = online ? '🟢 En línea' : '⚪ Desconectado';
                    estado.className = `estado ${online ? 'online' : 'offline'}`;
                }
            }
        });
    }

    // ========================================
    // ACCIONES DE CONTACTOS
    // ========================================
    window.irAMensajes = function(contactoId) {
        window.location.href = `/features/mensajes/mensajes.html?contacto=${contactoId}`;
    };

    window.toggleFavorito = async function(contactoId) {
        try {
            const token = localStorage.getItem('galleta_token');
            const contacto = contactos.find(c => c._id === contactoId);
            if (!contacto) return;

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
                mostrarNotificacion(contacto.esFavorito ? '⭐ Favorito eliminado' : '⭐ Agregado a favoritos');
                cargarContactos();
            } else {
                throw new Error('Error al actualizar favorito');
            }
        } catch (error) {
            console.error('Error actualizando favorito:', error);
            mostrarNotificacion('❌ Error al actualizar favorito', 'error');
        }
    };

    window.bloquearContacto = async function(contactoId) {
        if (!confirm('¿Estás seguro de bloquear a este usuario?')) return;

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil/bloquear', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usuarioId: contactoId })
            });

            if (response.ok) {
                mostrarNotificacion('✅ Usuario bloqueado');
                cargarContactos();
            } else {
                throw new Error('Error al bloquear');
            }
        } catch (error) {
            console.error('Error bloqueando:', error);
            mostrarNotificacion('❌ Error al bloquear', 'error');
        }
    };

    window.eliminarContacto = async function(contactoId) {
        if (!confirm('¿Estás seguro de eliminar este contacto?')) return;

        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/contactos/${contactoId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                mostrarNotificacion('✅ Contacto eliminado');
                cargarContactos();
            } else {
                throw new Error('Error al eliminar contacto');
            }
        } catch (error) {
            console.error('Error eliminando contacto:', error);
            mostrarNotificacion('❌ Error al eliminar contacto', 'error');
        }
    };

    // ========================================
    // AGREGAR CONTACTO
    // ========================================
    window.abrirAgregarContacto = function() {
        const wallet = prompt('Ingresa la dirección wallet del usuario:');
        if (!wallet || wallet.length < 10) {
            alert('Ingresa una wallet válida');
            return;
        }
        buscarYAgregarContacto(wallet);
    };

    async function buscarYAgregarContacto(wallet) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/perfil/buscar?wallet=${wallet}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Usuario no encontrado');

            const data = await response.json();
            if (!data.encontrado) {
                alert('❌ Usuario no encontrado');
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
                mostrarNotificacion('✅ Contacto agregado');
                cargarContactos();
            } else {
                const error = await addResponse.json();
                alert(`❌ ${error.error || 'Error al agregar contacto'}`);
            }
        } catch (error) {
            console.error('Error agregando contacto:', error);
            alert('❌ Error al agregar contacto');
        }
    }

    // ========================================
    // FILTROS UI
    // ========================================
    filtros.forEach(btn => {
        btn.addEventListener('click', function() {
            filtros.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroActual = this.dataset.filtro;
            aplicarFiltros();
        });
    });

    // ========================================
    // BÚSQUEDA
    // ========================================
    searchInput.addEventListener('input', function() {
        aplicarFiltros();
    });

    // ========================================
    // AGREGAR CONTACTO (BOTÓN)
    // ========================================
    btnAgregar.addEventListener('click', abrirAgregarContacto);

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

        // Cargar contactos
        await cargarContactos();
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