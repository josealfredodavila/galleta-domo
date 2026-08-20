// public/features/perfil/perfil.js

document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let contactos = [];

    // ========================================
    // ELEMENTOS DEL DOM
    // ========================================
    const perfilNombre = document.getElementById('perfilNombre');
    const perfilHandle = document.getElementById('perfilHandle');
    const perfilBio = document.getElementById('perfilBio');
    const statTokens = document.getElementById('statTokens');
    const statContactos = document.getElementById('statContactos');
    const statNFT = document.getElementById('statNFT');
    const tokenProgress = document.getElementById('tokenProgress');
    const tokenText = document.getElementById('tokenText');
    const esimDot = document.getElementById('esimDot');
    const esimText = document.getElementById('esimText');

    // ========================================
    // CARGAR PERFIL DEL USUARIO
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

            const data = await response.json();
            usuarioActual = data;
            actualizarUI(data);
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
        if (perfilNombre) {
            perfilNombre.textContent = usuario.nombre || 'Usuario';
        }

        // Handle (username)
        if (perfilHandle) {
            const wallet = usuario.walletAddress || 'usuario';
            perfilHandle.textContent = `@${wallet.slice(0, 12)}`;
        }

        // Biografía
        if (perfilBio) {
            perfilBio.textContent = usuario.biografia || '⚡ Explorador del ecosistema Sariel\'s';
        }

        // Estadísticas
        if (statTokens) {
            statTokens.textContent = usuario.tokensAcumulados || 0;
        }
        if (statContactos) {
            statContactos.textContent = usuario.contactos?.length || 0;
        }
        if (statNFT) {
            statNFT.textContent = usuario.haCanjeado ? '✅ Sí' : 'No';
        }

        // Progreso de tokens
        const tokens = usuario.tokensAcumulados || 0;
        const progreso = Math.min((tokens / 12) * 100, 100);
        if (tokenProgress) {
            tokenProgress.style.width = progreso + '%';
        }
        if (tokenText) {
            tokenText.textContent = `${tokens}/12`;
        }

        // Avatar
        const avatar = document.querySelector('.perfil-avatar');
        if (avatar && usuario.fotoPerfil && usuario.fotoPerfil !== '/default-avatar.png') {
            avatar.innerHTML = `<img src="${usuario.fotoPerfil}" alt="Foto de perfil" />`;
        }

        // eSIM
        actualizarEsim(usuario.esim);
    }

    // ========================================
    // eSIM
    // ========================================
    function actualizarEsim(esim) {
        if (!esim) return;

        if (esim.activo) {
            esimDot.className = 'dot';
            esimText.innerHTML = `<strong>Activa</strong> · ${esim.operador || 'Csariel\'s'} - ${esim.tipo || 'datos'}`;
        } else {
            esimDot.className = 'dot inactive';
            esimText.innerHTML = `<strong>Inactiva</strong> · Sin datos activos`;
        }
    }

    // ========================================
    // ACTIVAR eSIM
    // ========================================
    async function activarEsim() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil/esim', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activo: true, tipo: 'datos' })
            });

            if (response.ok) {
                mostrarNotificacion('✅ eSIM activada correctamente');
                cargarPerfil();
            } else {
                throw new Error('Error al activar eSIM');
            }
        } catch (error) {
            console.error('Error activando eSIM:', error);
            mostrarNotificacion('❌ Error al activar eSIM', 'error');
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
            renderizarContactosMini(contactos);

        } catch (error) {
            console.error('Error cargando contactos:', error);
        }
    }

    // ========================================
    // RENDERIZAR CONTACTOS (MINI)
    // ========================================
    function renderizarContactosMini(lista) {
        const container = document.querySelector('.mini-lista');
        if (!container) return;

        if (!lista || lista.length === 0) {
            container.innerHTML = `
                <div style="color:#4a6a8a;font-size:0.75rem;">Sin contactos aún</div>
            `;
            return;
        }

        const maxMostrar = 5;
        const mostrar = lista.slice(0, maxMostrar);

        container.innerHTML = mostrar.map(contacto => `
            <div class="contacto-item" onclick="window.location.href='/features/mensajes/contactos.html'">
                <div class="avatar">${contacto.nombre ? contacto.nombre[0].toUpperCase() : '👤'}</div>
                <span class="nombre">${contacto.nombre || 'Usuario'}</span>
            </div>
        `).join('');

        if (lista.length > maxMostrar) {
            const extra = document.createElement('div');
            extra.className = 'contacto-item';
            extra.innerHTML = `<span class="nombre" style="color:#D4AF37;">+${lista.length - maxMostrar} más</span>`;
            extra.style.cursor = 'pointer';
            extra.onclick = () => window.location.href = '/features/mensajes/contactos.html';
            container.appendChild(extra);
        }
    }

    // ========================================
    // EDITAR PERFIL (MODAL SIMULADO)
    // ========================================
    function abrirEditorPerfil() {
        const nombre = prompt('Nuevo nombre:', usuarioActual?.nombre || '');
        if (nombre && nombre.trim()) {
            actualizarPerfil({ nombre: nombre.trim() });
        }
    }

    async function actualizarPerfil(datos) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(datos)
            });

            if (response.ok) {
                mostrarNotificacion('✅ Perfil actualizado');
                cargarPerfil();
            } else {
                throw new Error('Error al actualizar perfil');
            }
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            mostrarNotificacion('❌ Error al actualizar perfil', 'error');
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
    // Botón editar perfil
    const btnEditar = document.querySelector('.btn-editar');
    if (btnEditar) {
        btnEditar.addEventListener('click', abrirEditorPerfil);
    }

    // Botón activar eSIM
    const btnActivarEsim = document.querySelector('.esim-section .btn-editar');
    if (btnActivarEsim) {
        btnActivarEsim.addEventListener('click', activarEsim);
    }

    // Botón "Ver todos" en contactos
    const verTodos = document.querySelector('.contactos-mini .ver-todos');
    if (verTodos) {
        verTodos.addEventListener('click', function() {
            window.location.href = '/features/mensajes/contactos.html';
        });
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