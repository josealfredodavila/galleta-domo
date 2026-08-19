// features/perfil/perfil.js

document.addEventListener('DOMContentLoaded', function() {
    
    // ========================================
    // VARIABLES GLOBALES
    // ========================================
    let usuarioActual = null;
    let socket = null;

    // ========================================
    // CONEXIÓN A SOCKET.IO
    // ========================================
    function conectarSocket() {
        const token = localStorage.getItem('galleta_token');
        if (!token) return;

        socket = io('/', {
            auth: { token }
        });

        socket.on('connect', () => {
            console.log('🔌 Conectado al servidor de mensajería');
            const userId = localStorage.getItem('userId');
            if (userId) {
                socket.emit('authenticate', { userId });
            }
        });

        socket.on('disconnect', () => {
            console.log('🔌 Desconectado del servidor');
        });

        socket.on('user_online', (data) => {
            actualizarEstadoContacto(data.userId, 'conectado');
        });

        socket.on('user_offline', (data) => {
            actualizarEstadoContacto(data.userId, 'ausente');
        });

        socket.on('new_contact_request', (data) => {
            mostrarNotificacion(`📩 ${data.nombre} quiere ser tu contacto`);
        });
    }

    // ========================================
    // OBTENER DATOS DEL USUARIO
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
            localStorage.setItem('userId', data._id);
            actualizarUI(data);
            
        } catch (error) {
            console.error('Error cargando perfil:', error);
            mostrarNotificacion('❌ Error al cargar perfil', 'error');
        }
    }

    // ========================================
    // ACTUALIZAR UI
    // ========================================
    function actualizarUI(usuario) {
        // Foto de perfil
        const fotoPerfil = document.getElementById('fotoPerfil');
        if (usuario.fotoPerfil && usuario.fotoPerfil !== '/default-avatar.png') {
            fotoPerfil.src = usuario.fotoPerfil;
        } else {
            fotoPerfil.src = '/default-avatar.png';
        }
        
        // Nombre
        document.getElementById('nombreUsuario').textContent = usuario.nombre || 'Usuario';
        
        // Wallet
        const walletPerfil = document.getElementById('walletPerfil');
        if (usuario.walletAddress) {
            walletPerfil.textContent = `${usuario.walletAddress.slice(0, 6)}...${usuario.walletAddress.slice(-4)}`;
        } else {
            walletPerfil.textContent = 'No conectada';
        }
        
        // Estado
        const estado = usuario.estado || 'conectado';
        const estadoIndicador = document.getElementById('estadoIndicador');
        const estadoTexto = document.getElementById('estadoTexto');
        estadoIndicador.className = `estado-indicador ${estado}`;
        const estados = { 
            conectado: '🟢 Conectado', 
            ausente: '🟡 Ausente', 
            ocupado: '🔴 Ocupado' 
        };
        estadoTexto.textContent = estados[estado] || 'Conectado';
        
        // Estadísticas
        document.getElementById('statsDomos').textContent = usuario.domosComprados || 0;
        document.getElementById('statsTokens').textContent = `${usuario.tokensAcumulados || 0}/12`;
        document.getElementById('statsNft').textContent = usuario.haCanjeado ? '✅ Sí' : 'No';
        document.getElementById('statsAmigos').textContent = usuario.contactos?.length || 0;
        
        // Esim
        if (usuario.esim) {
            const esimEstado = document.getElementById('esimEstado');
            if (usuario.esim.activo) {
                const tipo = usuario.esim.tipo === 'wifi' ? 'WiFi' : 'Datos Móviles';
                esimEstado.textContent = `Conectado por ${tipo}`;
                document.getElementById('esimEstado').style.color = '#00b894';
            } else {
                esimEstado.textContent = 'Desconectado';
                document.getElementById('esimEstado').style.color = '#e17055';
            }
        }
        
        // Seguridad - 2FA
        document.getElementById('toggle2fa').checked = usuario.seguridad?.['2fa'] || false;
        
        // Verificación de identidad
        const verificadoBadge = document.getElementById('verificadoBadge');
        if (usuario.seguridad?.verificado) {
            verificadoBadge.textContent = '✅ Verificado';
            verificadoBadge.className = 'badge ok';
        } else {
            verificadoBadge.textContent = '⏳ Pendiente';
            verificadoBadge.className = 'badge';
        }
        
        // Contactos
        if (usuario.contactos && usuario.contactos.length > 0) {
            renderizarContactos(usuario.contactos);
        } else {
            document.getElementById('listaContactos').innerHTML = 
                '<p class="empty-message">📭 No hay contactos aún</p>';
        }
    }

    // ========================================
    // RENDERIZAR CONTACTOS
    // ========================================
    function renderizarContactos(contactos) {
        const lista = document.getElementById('listaContactos');
        
        lista.innerHTML = contactos.map(contacto => `
            <div class="contacto-item" data-id="${contacto._id}">
                <img src="${contacto.fotoPerfil || '/default-avatar.png'}" alt="${contacto.nombre}" />
                <div class="info">
                    <div class="nombre">${contacto.nombre || 'Usuario'}</div>
                    <div class="estado-texto">${contacto.estado === 'conectado' ? '🟢 En línea' : '🟡 Ausente'}</div>
                </div>
                <div class="acciones">
                    <button class="mensaje" onclick="window.location.href='/features/mensajes/mensajes.html?contacto=${contacto._id}'" title="Enviar mensaje">💬</button>
                    <button class="bloquear" onclick="bloquearUsuario('${contacto._id}')" title="Bloquear">🚫</button>
                </div>
            </div>
        `).join('');
    }

    // ========================================
    // ACTUALIZAR ESTADO DE CONTACTO (SOCKET)
    // ========================================
    function actualizarEstadoContacto(userId, estado) {
        const items = document.querySelectorAll('.contacto-item');
        items.forEach(item => {
            if (item.dataset.id === userId) {
                const estadoEl = item.querySelector('.estado-texto');
                estadoEl.textContent = estado === 'conectado' ? '🟢 En línea' : '🟡 Ausente';
            }
        });
    }

    // ========================================
    // BLOQUEAR USUARIO
    // ========================================
    window.bloquearUsuario = async function(userId) {
        if (!confirm('¿Estás seguro de bloquear a este usuario?')) return;
        
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil/bloquear', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usuarioId: userId })
            });
            
            if (response.ok) {
                mostrarNotificacion('✅ Usuario bloqueado');
                cargarPerfil();
            }
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('❌ Error al bloquear usuario', 'error');
        }
    };

    // ========================================
    // SUBIR FOTO DE PERFIL
    // ========================================
    document.getElementById('cambiarFoto').addEventListener('click', function() {
        document.getElementById('inputFoto').click();
    });

    document.getElementById('inputFoto').addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validar tamaño (5MB)
        if (file.size > 5 * 1024 * 1024) {
            mostrarNotificacion('❌ La imagen no debe superar los 5MB', 'error');
            this.value = '';
            return;
        }
        
        const formData = new FormData();
        formData.append('foto', file);
        
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil/foto', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                document.getElementById('fotoPerfil').src = data.fotoUrl;
                mostrarNotificacion('✅ Foto actualizada exitosamente');
            } else {
                throw new Error('Error al subir foto');
            }
        } catch (error) {
            console.error('Error subiendo foto:', error);
            mostrarNotificacion('❌ Error al subir foto', 'error');
        }
        
        this.value = '';
    });

    // ========================================
    // TOGGLE 2FA
    // ========================================
    document.getElementById('toggle2fa').addEventListener('change', async function() {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil/2fa', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activar: this.checked })
            });
            
            if (!response.ok) {
                this.checked = !this.checked;
                mostrarNotificacion('❌ Error al configurar 2FA', 'error');
            } else {
                mostrarNotificacion(this.checked ? '✅ 2FA activado' : '✅ 2FA desactivado');
            }
        } catch (error) {
            console.error('Error:', error);
            this.checked = !this.checked;
            mostrarNotificacion('❌ Error al configurar 2FA', 'error');
        }
    });

    // ========================================
    // ESIM - WIFI / DATOS
    // ========================================
    document.getElementById('btnWifi').addEventListener('click', function() {
        document.querySelectorAll('.btn-esim').forEach(b => b.classList.remove('activo'));
        this.classList.add('activo');
        document.getElementById('esimEstado').textContent = 'Conectado por WiFi';
        document.getElementById('esimEstado').style.color = '#00b894';
        actualizarEsim('wifi');
    });

    document.getElementById('btnDatos').addEventListener('click', function() {
        document.querySelectorAll('.btn-esim').forEach(b => b.classList.remove('activo'));
        this.classList.add('activo');
        document.getElementById('esimEstado').textContent = 'Conectado por Datos Móviles';
        document.getElementById('esimEstado').style.color = '#00b894';
        actualizarEsim('datos');
    });

    async function actualizarEsim(tipo) {
        try {
            const token = localStorage.getItem('galleta_token');
            await fetch('/api/perfil/esim', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tipo, activo: true })
            });
        } catch (error) {
            console.error('Error actualizando Esim:', error);
        }
    }

    // ========================================
    // CONTACTOS - IMPORTAR
    // ========================================
    document.getElementById('importarContactos').addEventListener('click', function() {
        // Simular importación de contactos del celular
        mostrarNotificacion('📱 Importando contactos del celular...', 'info');
        setTimeout(() => {
            mostrarNotificacion('✅ Contactos importados (simulación)', 'success');
        }, 2000);
    });

    // ========================================
    // CONTACTOS - AGREGAR MANUAL
    // ========================================
    document.getElementById('agregarContacto').addEventListener('click', function() {
        const wallet = prompt('Ingresa la dirección wallet del usuario:');
        if (wallet && wallet.length > 0) {
            buscarYAgregarContacto(wallet);
        }
    });

    async function buscarYAgregarContacto(wallet) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch(`/api/perfil/buscar?wallet=${wallet}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.encontrado) {
                    // Agregar contacto
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
                        cargarPerfil();
                    }
                } else {
                    mostrarNotificacion('❌ Usuario no encontrado', 'error');
                }
            }
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('❌ Error al buscar usuario', 'error');
        }
    }

    // ========================================
    // RECOMENDADOS
    // ========================================
    document.getElementById('recomendados').addEventListener('click', function() {
        mostrarNotificacion('🌟 Buscando recomendados...', 'info');
        setTimeout(() => {
            mostrarNotificacion('👥 Recomendados: Juan, María, Carlos (simulación)', 'success');
        }, 1500);
    });

    // ========================================
    // EDITAR PERFIL
    // ========================================
    document.getElementById('editarPerfil').addEventListener('click', function() {
        const nuevoNombre = prompt('Nuevo nombre:', usuarioActual?.nombre || '');
        if (nuevoNombre && nuevoNombre.trim().length > 0) {
            actualizarNombre(nuevoNombre.trim());
        }
    });

    async function actualizarNombre(nombre) {
        try {
            const token = localStorage.getItem('galleta_token');
            const response = await fetch('/api/perfil', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nombre })
            });
            
            if (response.ok) {
                document.getElementById('nombreUsuario').textContent = nombre;
                mostrarNotificacion('✅ Nombre actualizado');
            }
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('❌ Error al actualizar nombre', 'error');
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
            background: ${tipo === 'success' ? 'var(--dorado)' : tipo === 'error' ? '#e17055' : '#0984e3'};
            color: ${tipo === 'success' ? 'var(--verde-bosque-dark)' : 'white'};
            border-radius: 12px;
            z-index: 9999;
            max-width: 400px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            animation: slideIn 0.4s ease;
            font-weight: 500;
            font-size: 0.95rem;
        `;
        document.body.appendChild(div);
        
        setTimeout(() => {
            div.style.animation = 'slideOut 0.4s ease';
            setTimeout(() => div.remove(), 500);
        }, 4000);
    }

    // ========================================
    // AGREGAR ESTILOS PARA NOTIFICACIONES
    // ========================================
    const styleNotif = document.createElement('style');
    styleNotif.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(30px); }
        }
    `;
    document.head.appendChild(styleNotif);

    // ========================================
    // INICIALIZAR
    // ========================================
    cargarPerfil();
    conectarSocket();

    // Verificar wallet conectada
    const token = localStorage.getItem('galleta_token');
    if (token) {
        document.getElementById('connectWallet').textContent = '✅ Conectado';
        document.getElementById('connectWallet').disabled = true;
    }

    // Botón de conexión de wallet
    document.getElementById('connectWallet').addEventListener('click', function() {
        window.location.href = '/';
    });

});