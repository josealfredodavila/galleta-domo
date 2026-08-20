// features/mensajes/contactos.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let contactos = [];
    let filtroActual = 'todos';
    let usuarioActual = null;

    // ========================================
    // CARGAR USUARIO Y CONTACTOS
    // ========================================
    async function cargarDatos() {
        try {
            const token = localStorage.getItem('galleta_token');
            if (!token) {
                window.location.href = '/';
                return;
            }

            // Cargar perfil del usuario
            const perfilResponse = await fetch('/api/perfil', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!perfilResponse.ok) {
                if (perfilResponse.status === 401) {
                    localStorage.removeItem('galleta_token');
                    localStorage.removeItem('userId');
                    window.location.href = '/';
                }
                throw new Error('Error al cargar perfil');
            }

            usuarioActual = await perfilResponse.json();

            // Cargar contactos
            const contactosResponse = await fetch('/api/contactos', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!contactosResponse.ok) throw new Error('Error al cargar contactos');

            const data = await contactosResponse.json();
            contactos = data.contactos || [];
            renderizarContactos(contactos);

            // Actualizar badge de solicitudes
            actualizarBadgeSolicitudes();

        } catch (error) {
            console.error('Error cargando datos:', error);
            mostrarNotificacion('❌ Error al cargar contactos', 'error');
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
                <div class="contact-info" onclick="verPerfil('${contacto._id}')">
                    <div class="contact-name">
                        ${contacto.nombre || 'Usuario'}
                        <span class="online-dot ${contacto.estado === 'conectado' ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="contact-meta">
                        ${contacto.walletAddress ? contacto.walletAddress.slice(0, 10) + '...' : 'Sin wallet'}
                        ${contacto.esFavorito ? ' ⭐' : ''}
                    </div>
                </div>
                <div class="contact-actions">
                    <button class="btn btn-primary btn-sm" onclick="enviarMensaje('${contacto._id}')">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="toggleFavorito('${contacto._id}')">
                        <i class="fas fa-star"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="bloquearContacto('${contacto._id}')">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ========================================
    // RENDERIZAR SOLICITUDES
    // ========================================
    function renderizarSolicitudes(lista) {
        const container = document.getElementById('listaSolicitudes');
        
        if (!lista || lista.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📩</div>
                    <h3>Sin solicitudes</h3>
                    <p>No tienes solicitudes de amistad pendientes</p>
                </div>
            `;
            return;
        }

        container.innerHTML = lista.map(solicitud => `
            <div class="contact-card">
                <div class="contact-avatar">
                    <img src="${solicitud.fotoPerfil || '/default-avatar.png'}" alt="${solicitud.nombre}" />
                </div>
                <div class="contact-info">
                    <div class="contact-name">${solicitud.nombre || 'Usuario'}</div>
                    <div class="contact-meta">${solicitud.walletAddress ? solicitud.walletAddress.slice(0, 10) + '...' : 'Sin wallet'}</div>
                </div>
                <div class="contact-actions">
                    <button class="btn btn-success btn-sm" onclick="aceptarSolicitud('${solicitud._id}')">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="rechazarSolicitud('${solicitud._id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ========================================
    // FILTROS
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
    // ACCIONES DE CONTACTOS
    // ========================================
    window.enviarMensaje = function(userId) {
        window.location.href = `/features/mensajes/mensajes.html?contacto=${userId}`;
    };

    window.verPerfil = function(userId) {
        window.location.href = `/features/perfil/perfil.html?id=${userId}`;
    };

    window.toggleFavorito = async function(userId) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/contactos/favorito', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ contactoId: userId })
            });

            if (response.ok) {
                mostrarNotificacion('⭐ Favorito actualizado');
                cargarDatos();
            }
        } catch (error) {
            console.error('Error actualizando favorito:', error);
            mostrarNotificacion('❌ Error al actualizar favorito', 'error');
        }
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
            cargarDatos();
        } catch (error) {
            console.error('Error bloqueando:', error);
            mostrarNotificacion('❌ Error al bloquear', 'error');
        }
    };

    // ========================================
    // SOLICITUDES
    // ========================================
    window.aceptarSolicitud = async function(userId) {
        try {
            const token = localStorage.getItem('galleta_token');
            await fetch('/api/contactos/aceptar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ solicitudId: userId })
            });
            mostrarNotificacion('✅ Solicitud aceptada');
            cargarDatos();
        } catch (error) {
            console.error('Error aceptando solicitud:', error);
            mostrarNotificacion('❌ Error al aceptar solicitud', 'error');
        }
    };

    window.rechazarSolicitud = async function(userId) {
        try {
            const token = localStorage.getItem('galleta_token');
            await fetch('/api/contactos/rechazar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ solicitudId: userId })
            });
            mostrarNotificacion('❌ Solicitud rechazada');
            cargarDatos();
        } catch (error) {
            console.error('Error rechazando solicitud:', error);
            mostrarNotificacion('❌ Error al rechazar solicitud', 'error');
        }
    };

    // ========================================
    // TABS
    // ========================================
    window.cambiarTab = function(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add('active');
        
        document.querySelectorAll('#app > .main > .container > div[id^="tab-"]').forEach(el => {
            el.style.display = 'none';
        });
        
        const target = document.getElementById(`tab-${tab}`);
        if (target) {
            target.style.display = 'block';
            if (tab === 'solicitudes') {
                cargarSolicitudes();
            } else if (tab === 'descubrir') {
                cargarDescubrir();
            } else if (tab === 'grupos') {
                cargarGrupos();
            } else if (tab === 'bloqueados') {
                cargarBloqueados();
            }
        }
    };

    // ========================================
    // CARGAR SOLICITUDES
    // ========================================
    async function cargarSolicitudes() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/contactos/solicitudes', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar solicitudes');

            const data = await response.json();
            renderizarSolicitudes(data.solicitudes || []);
        } catch (error) {
            console.error('Error cargando solicitudes:', error);
        }
    }

    function actualizarBadgeSolicitudes() {
        // Simulación - en producción se obtendría del backend
        const badge = document.getElementById('badgeSolicitudes');
        if (badge) {
            badge.classList.add('hidden');
        }
    }

    // ========================================
    // DESCUBRIR, GRUPOS Y BLOQUEADOS
    // ========================================
    async function cargarDescubrir() {
        const container = document.getElementById('listaDescubrir');
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🔍</div>
                <h3>Descubre personas</h3>
                <p>Encuentra nuevos contactos en tu red</p>
            </div>
        `;
    }

    async function cargarGrupos() {
        const container = document.getElementById('listaGrupos');
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">👥</div>
                <h3>Grupos</h3>
                <p>Todavía no tienes grupos</p>
            </div>
        `;
    }

    async function cargarBloqueados() {
        const container = document.getElementById('listaBloqueados');
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🚫</div>
                <h3>Sin bloqueados</h3>
                <p>No has bloqueado a nadie</p>
            </div>
        `;
    }

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
    cargarDatos();

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