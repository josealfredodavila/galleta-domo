// features/perfil/perfil.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let contactos = [];
    let filtroActual = 'todos';

    // ========================================
    // CARGAR PERFIL
    // ========================================
    async function cargarPerfil() {
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
                throw new Error('Error al cargar perfil');
            }

            usuarioActual = await response.json();
            actualizarUI(usuarioActual);
            cargarContactos();

        } catch (error) {
            console.error('Error cargando perfil:', error);
            mostrarNotificacion('❌ Error al cargar perfil', 'error');
        }
    }

    // ========================================
    // ACTUALIZAR UI
    // ========================================
    function actualizarUI(usuario) {
        // Nombre
        document.getElementById('profileName').textContent = usuario.nombre || 'Usuario';
        
        // Estadísticas
        document.getElementById('statContactos').textContent = usuario.contactos?.length || 0;
        document.getElementById('statTokens').textContent = usuario.tokensAcumulados || 0;
        document.getElementById('statNft').textContent = usuario.haCanjeado ? '✅ Sí' : 'No';
        document.getElementById('statSeguidores').textContent = usuario.seguidores || 0;
        
        // Avatar
        const avatar = document.getElementById('profileAvatar');
        if (usuario.fotoPerfil && usuario.fotoPerfil !== '/default-avatar.png') {
            avatar.innerHTML = `<img src="${usuario.fotoPerfil}" alt="Foto de perfil" />`;
        }
    }

    // ========================================
    // CARGAR CONTACTOS
    // ========================================
    async function cargarContactos() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/contactos', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar contactos');

            const data = await response.json();
            contactos = data.contactos || [];
            renderizarContactos(contactos);

        } catch (error) {
            console.error('Error cargando contactos:', error);
        }
    }

    // ========================================
    // RENDERIZAR CONTACTOS
    // ========================================
    function renderizarContactos(lista) {
        const container = document.getElementById('listaContactos');
        
        if (!lista || lista.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">👤</div>
                    <h3>Sin contactos</h3>
                    <p>Comienza a agregar personas a tu red</p>
                </div>
            `;
            return;
        }

        container.innerHTML = lista.map(contacto => `
            <div class="contact-card">
                <div class="contact-avatar ${contacto.estado === 'conectado' ? 'online' : 'offline'}">
                    <img src="${contacto.fotoPerfil || '/default-avatar.png'}" alt="${contacto.nombre}" />
                </div>
                <div class="contact-info">
                    <div class="contact-name">
                        ${contacto.nombre || 'Usuario'}
                        <span class="online-dot ${contacto.estado === 'conectado' ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="contact-meta">${contacto.walletAddress?.slice(0, 10) || 'Sin wallet'}</div>
                </div>
                <div class="contact-actions">
                    <button class="btn btn-primary btn-sm" onclick="enviarMensaje('${contacto._id}')">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="verPerfil('${contacto._id}')">
                        <i class="fas fa-user"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="bloquearContacto('${contacto._id}')">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ========================================
    // FILTROS DE CONTACTOS
    // ========================================
    window.filtrarContactos = function() {
        const query = document.getElementById('searchContactos').value.toLowerCase();
        const filtrados = contactos.filter(c => 
            c.nombre?.toLowerCase().includes(query) ||
            c.walletAddress?.toLowerCase().includes(query)
        );
        renderizarContactos(filtrados);
    };

    window.filtrarContactosPor = function(filtro) {
        filtroActual = filtro;
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filtro);
        });

        let lista = contactos;
        if (filtro === 'online') {
            lista = contactos.filter(c => c.estado === 'conectado');
        } else if (filtro === 'favoritos') {
            lista = contactos.filter(c => c.esFavorito);
        } else if (filtro === 'recientes') {
            lista = [...contactos].sort((a, b) => new Date(b.ultimoMensaje) - new Date(a.ultimoMensaje));
        }
        
        renderizarContactos(lista);
    };

    // ========================================
    // CAMBIAR TABS
    // ========================================
    window.cambiarTab = function(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add('active');
        
        document.querySelectorAll('#app > .container > div[id^="tab-"]').forEach(el => {
            el.style.display = 'none';
        });
        
        const target = document.getElementById(`tab-${tab}`);
        if (target) target.style.display = 'block';
    };

    // ========================================
    // ACCIONES DE CONTACTOS
    // ========================================
    window.enviarMensaje = function(userId) {
        window.location.href = `/features/mensajes/mensajes.html?contacto=${userId}`;
    };

    window.verPerfil = function(userId) {
        window.location.href = `/features/perfil/perfil.html?id=${userId}`;
    };

    window.bloquearContacto = async function(userId) {
        if (!confirm('¿Estás seguro de bloquear a este usuario?')) return;
        
        try {
            const token = localStorage.getItem('galleta_token');
            await fetch('/api/perfil/bloquear', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usuarioId: userId })
            });
            mostrarNotificacion('✅ Usuario bloqueado');
            cargarContactos();
        } catch (error) {
            console.error('Error bloqueando:', error);
            mostrarNotificacion('❌ Error al bloquear', 'error');
        }
    };

    // ========================================
    // eSIM
    // ========================================
    document.getElementById('btnActivarEsim').addEventListener('click', async function() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/esim/activar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                mostrarNotificacion('✅ eSIM activada correctamente');
                cargarPerfil();
            }
        } catch (error) {
            console.error('Error activando eSIM:', error);
            mostrarNotificacion('❌ Error al activar eSIM', 'error');
        }
    });

    // ========================================
    // NOTIFICACIONES
    // ========================================
    function mostrarNotificacion(mensaje, tipo = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        
        const div = document.createElement('div');
        div.className = `toast ${tipo === 'error' ? 'error' : ''}`;
        div.textContent = mensaje;
        document.body.appendChild(div);
        
        setTimeout(() => div.classList.add('active'), 10);
        setTimeout(() => {
            div.classList.remove('active');
            setTimeout(() => div.remove(), 400);
        }, 3000);
    }

    // ========================================
    // INICIALIZAR
    // ========================================
    cargarPerfil();

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