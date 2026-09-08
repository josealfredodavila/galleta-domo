// ================================================================
// MENSAJES.JS - SARIEL'S WEB3 (PRODUCCIÓN) - VERSIÓN CON BACKEND
// ================================================================

window.conversacionActual = null;
let suscripcionMensajes = null;
const API_BASE = '/api/mensajes';

// ================================================================
// FUNCIONES AUXILIARES
// ================================================================

function formatearHora(fechaIso) {
    if (!fechaIso) return '';
    const fecha = new Date(fechaIso);
    if (isNaN(fecha.getTime())) return '';
    return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function obtenerToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function headersAutenticados() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${obtenerToken()}`
    };
}

// ================================================================
// CARGAR CONVERSACIONES
// ================================================================

async function cargarConversaciones() {
    const container = document.getElementById('conversationList');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/conversaciones`, {
            headers: headersAutenticados()
        });

        if (!response.ok) {
            if (response.status === 401) {
                container.innerHTML = `<div class="sin-conversaciones"><p>Inicia sesión para ver tus chats</p></div>`;
                return;
            }
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success || !data.conversaciones || data.conversaciones.length === 0) {
            container.innerHTML = `
                <div class="sin-conversaciones">
                    <span class="icono">💬</span>
                    <p>No tienes conversaciones aún</p>
                </div>`;
            return;
        }

        container.innerHTML = '';
        
        data.conversaciones.forEach(conv => {
            const usuario = conv.otros_participantes?.[0] || {};
            const username = usuario.username || 'Usuario';
            const avatarUrl = usuario.avatar_url;
            const convId = conv.id;
            const ultimoMensaje = conv.ultimo_mensaje?.contenido || 'Toca para abrir el chat';
            const hora = conv.ultimo_mensaje ? formatearHora(conv.ultimo_mensaje.created_at) : '';

            const div = document.createElement('div');
            div.className = `conversation-item ${window.conversacionActual === convId ? 'active' : ''}`;
            div.onclick = () => abrirConversacion(convId, username, avatarUrl);

            div.innerHTML = `
                <div class="conversation-avatar">
                    ${avatarUrl ? `<img src="${escapeHTML(avatarUrl)}" alt="Avatar"/>` : `<span class="avatar-placeholder">${username.charAt(0).toUpperCase()}</span>`}
                </div>
                <div class="conversation-content">
                    <strong>${escapeHTML(username)}</strong>
                    <span>${escapeHTML(ultimoMensaje)} ${hora ? `· ${hora}` : ''}</span>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error('Error al cargar conversaciones:', err);
        container.innerHTML = `<div class="sin-conversaciones"><p>Error al cargar las conversaciones</p></div>`;
    }
}

// ================================================================
// ABRIR CONVERSACIÓN
// ================================================================

async function abrirConversacion(convId, nombre, avatarUrl) {
    window.conversacionActual = convId;

    const nameEl = document.getElementById('chatUserName');
    const avatarEl = document.getElementById('chatUserAvatar');

    if (nameEl) nameEl.textContent = nombre || 'Chat';
    if (avatarEl) {
        avatarEl.innerHTML = avatarUrl 
            ? `<img src="${escapeHTML(avatarUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` 
            : `<span>◈</span>`;
    }

    cargarConversaciones();
    await cargarMensajes(convId);
    suscribirMensajesTiempoReal(convId);
}

// ================================================================
// CARGAR MENSAJES
// ================================================================

async function cargarMensajes(convId) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = `<div class="loading-mensajes">Cargando mensajes...</div>`;

    try {
        const response = await fetch(`${API_BASE}/mensajes/${convId}`, {
            headers: headersAutenticados()
        });

        if (!response.ok) {
            if (response.status === 404) {
                container.innerHTML = `
                    <div class="sin-mensajes">
                        <span class="icono">💭</span>
                        <p>No hay mensajes en este chat</p>
                        <span style="font-size:0.7rem;opacity:0.7;">¡Sé el primero en escribir!</span>
                    </div>`;
                return;
            }
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success || !data.mensajes || data.mensajes.length === 0) {
            container.innerHTML = `
                <div class="sin-mensajes">
                    <span class="icono">💭</span>
                    <p>No hay mensajes en este chat</p>
                    <span style="font-size:0.7rem;opacity:0.7;">¡Sé el primero en escribir!</span>
                </div>`;
            return;
        }

        container.innerHTML = '';
        
        const userId = data.usuario_id;
        data.mensajes.forEach(msg => {
            const esMio = msg.sender_id === userId;
            renderizarMensaje(msg, esMio);
        });

        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error('Error al cargar mensajes:', err);
        container.innerHTML = `<div class="sin-mensajes"><p>Error al obtener los mensajes</p></div>`;
    }
}

// ================================================================
// RENDERIZAR MENSAJE
// ================================================================

function renderizarMensaje(msg, esMio) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `message ${esMio ? 'own' : ''}`;

    let adjuntoHTML = '';
    if (msg.media_url) {
        const mediaType = msg.media_type || 'archivo';
        if (mediaType === 'imagen' || mediaType === 'image') {
            adjuntoHTML = `
                <div class="message-image">
                    <img src="${escapeHTML(msg.media_url)}" onclick="abrirModalImagen('${escapeHTML(msg.media_url)}')" alt="Imagen"/>
                </div>`;
        } else if (mediaType === 'audio') {
            adjuntoHTML = `
                <div class="message-audio">
                    <audio controls src="${escapeHTML(msg.media_url)}"></audio>
                </div>`;
        } else if (mediaType === 'video') {
            adjuntoHTML = `
                <div class="message-video">
                    <video controls src="${escapeHTML(msg.media_url)}" style="max-width:100%; border-radius:8px;"></video>
                </div>`;
        } else {
            const nombreArchivo = msg.file_name || 'Descargar archivo';
            adjuntoHTML = `
                <div class="message-file">
                    <a href="${escapeHTML(msg.media_url)}" target="_blank" download>📎 ${escapeHTML(nombreArchivo)}</a>
                </div>`;
        }
    }

    const contenido = msg.contenido || '';
    const hora = formatearHora(msg.created_at);

    div.innerHTML = `
        ${contenido ? `<div class="message-text">${escapeHTML(contenido)}</div>` : ''}
        ${adjuntoHTML}
        <div class="message-meta">
            <span>${hora}</span>
            ${esMio ? `<span>${msg.is_read ? '✓✓' : '✓'}</span>` : ''}
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================

async function enviarMensaje() {
    if (!window.conversacionActual) {
        return alert('Selecciona una conversación primero');
    }

    const input = document.getElementById('messageInput');
    const texto = input ? input.value.trim() : '';
    const fileInput = document.getElementById('fileInput');
    const file = fileInput ? fileInput.files[0] : null;

    if (!texto && !file) {
        return alert('Escribe un mensaje o selecciona un archivo');
    }

    const btnEnviar = document.getElementById('sendMessageButton');
    if (btnEnviar) btnEnviar.disabled = true;

    try {
        let mediaUrl = null;
        let mediaType = 'texto';
        let fileName = null;
        let fileSize = null;
        let mimeType = null;

        // Si hay archivo, subirlo primero
        if (file) {
            const formData = new FormData();
            formData.append('archivo', file);
            formData.append('conversacionId', window.conversacionActual);

            const uploadResponse = await fetch(`${API_BASE}/subir-archivo`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${obtenerToken()}`
                },
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error('Error al subir el archivo');
            }

            const uploadData = await uploadResponse.json();
            if (!uploadData.success) {
                throw new Error(uploadData.error || 'Error al subir el archivo');
            }

            mediaUrl = uploadData.url;
            mediaType = uploadData.tipo || 'archivo';
            fileName = file.name;
            fileSize = file.size;
            mimeType = file.type;
        }

        // Enviar mensaje
        const response = await fetch(`${API_BASE}/enviar`, {
            method: 'POST',
            headers: headersAutenticados(),
            body: JSON.stringify({
                conversationId: window.conversacionActual,
                contenido: texto || null,
                media_url: mediaUrl,
                media_type: mediaType,
                file_name: fileName,
                file_size: fileSize,
                mime_type: mimeType
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al enviar mensaje');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Error al enviar mensaje');
        }

        // Limpiar campos
        if (input) input.value = '';
        if (fileInput) fileInput.value = '';
        limpiarArchivosSeleccionados();

        // Agregar mensaje localmente
        const mensajeEnviado = data.mensaje;
        if (mensajeEnviado) {
            renderizarMensaje(mensajeEnviado, true);
        }

    } catch (err) {
        console.error('Error al enviar mensaje:', err);
        alert(err.message || 'Error al enviar el mensaje');
    } finally {
        if (btnEnviar) btnEnviar.disabled = false;
    }
}

// ================================================================
// SUSCRIPCIÓN EN TIEMPO REAL (Polling simple)
// ================================================================

let ultimoMensajeId = null;

function suscribirMensajesTiempoReal(convId) {
    // Cancelar suscripción anterior si existe
    if (suscripcionMensajes) {
        clearInterval(suscripcionMensajes);
        suscripcionMensajes = null;
    }

    // Usar polling como fallback cuando no hay WebSocket
    suscripcionMensajes = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/mensajes/${convId}?since=${ultimoMensajeId || ''}`, {
                headers: headersAutenticados()
            });

            if (!response.ok) return;

            const data = await response.json();
            if (!data.success || !data.mensajes) return;

            const userId = data.usuario_id;
            const mensajesNuevos = data.mensajes;

            // Filtrar mensajes nuevos (los que no están en el DOM)
            const mensajesExistentes = document.querySelectorAll('.chat-messages .message');
            const ultimoMensajeDom = mensajesExistentes[mensajesExistentes.length - 1];
            const ultimoId = ultimoMensajeDom?.dataset?.mensajeId;

            mensajesNuevos.forEach(msg => {
                if (msg.id === ultimoId) return;
                // Verificar si ya existe en el DOM
                const existe = document.querySelector(`.chat-messages .message[data-mensaje-id="${msg.id}"]`);
                if (!existe) {
                    const esMio = msg.sender_id === userId;
                    renderizarMensaje(msg, esMio);
                    if (msg.id) ultimoMensajeId = msg.id;
                }
            });

        } catch (err) {
            // Silenciar errores de polling
        }
    }, 3000);
}

// ================================================================
// ELIMINAR CONVERSACIÓN
// ================================================================

async function eliminarConversacion() {
    if (!window.conversacionActual) {
        return alert('Selecciona una conversación primero');
    }

    if (!confirm('¿Deseas salir de este chat?')) return;

    try {
        const response = await fetch(`${API_BASE}/conversacion/${window.conversacionActual}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al salir del chat');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Error al salir del chat');
        }

        // Limpiar estado
        window.conversacionActual = null;
        document.getElementById('chatUserName').textContent = 'Selecciona una conversación';
        document.getElementById('chatUserAvatar').innerHTML = '<span>◈</span>';
        document.getElementById('chatMessages').innerHTML = `
            <div class="sin-mensajes">
                <span class="icono">💭</span>
                <p>Selecciona una conversación</p>
            </div>
        `;

        // Cancelar suscripción
        if (suscripcionMensajes) {
            clearInterval(suscripcionMensajes);
            suscripcionMensajes = null;
        }

        cargarConversaciones();

    } catch (err) {
        console.error('Error al eliminar conversación:', err);
        alert(err.message || 'Error al salir del chat');
    }
}

// ================================================================
// NUEVA CONVERSACIÓN
// ================================================================

function nuevaConversacion() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) {
        modal.classList.add('show');
        const input = document.getElementById('searchInputModal');
        if (input) {
            input.value = '';
            input.focus();
            // Limpiar resultados
            const resultados = document.getElementById('resultadosBusqueda');
            if (resultados) {
                resultados.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.75rem;padding:12px;">Escribe al menos 2 caracteres</p>';
            }
        }
    }
}

function cerrarModalNuevoContacto() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) modal.classList.remove('show');
}

// ================================================================
// INICIAR CONVERSACIÓN CON USUARIO
// ================================================================

async function iniciarConversacionConUsuario(targetUserId) {
    try {
        const response = await fetch(`${API_BASE}/conversacion`, {
            method: 'POST',
            headers: headersAutenticados(),
            body: JSON.stringify({
                targetUserId: targetUserId
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al crear la conversación');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Error al crear la conversación');
        }

        cerrarModalNuevoContacto();

        const conversacion = data.conversacion;
        const usuario = data.otros_participantes?.[0] || {};
        const nombre = usuario.username || 'Usuario';
        const avatar = usuario.avatar_url || null;

        abrirConversacion(conversacion.id, nombre, avatar);

    } catch (err) {
        console.error('Error al iniciar conversación:', err);
        alert(err.message || 'Error al crear el chat');
    }
}

// ================================================================
// ABRIR MODAL DE IMAGEN
// ================================================================

function abrirModalImagen(src) {
    const modal = document.getElementById('modalImagenMensaje');
    if (modal) {
        const img = modal.querySelector('img');
        if (img) img.src = src;
        modal.classList.add('show');
    }
}

// ================================================================
// LIMPIAR ARCHIVOS SELECCIONADOS
// ================================================================

function limpiarArchivosSeleccionados() {
    const div = document.getElementById('archivosSeleccionados');
    if (div) div.innerHTML = '';
}

// ================================================================
// EVENTOS DOM
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');

    if (messageInput) {
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarMensaje();
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const divContainer = document.getElementById('archivosSeleccionados');
            if (divContainer) {
                if (file) {
                    divContainer.innerHTML = `
                        <div class="archivo-seleccionado">
                            <span>📎 ${escapeHTML(file.name)} (${(file.size / 1024).toFixed(1)} KB)</span>
                            <button onclick="document.getElementById('fileInput').value=''; limpiarArchivosSeleccionados();">✕</button>
                        </div>`;
                } else {
                    divContainer.innerHTML = '';
                }
            }
        });
    }

    // Cargar conversaciones al iniciar
    cargarConversaciones();
});

// ================================================================
// EXPONER FUNCIONES GLOBALMENTE
// ================================================================

window.cargarConversaciones = cargarConversaciones;
window.abrirConversacion = abrirConversacion;
window.enviarMensaje = enviarMensaje;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.iniciarConversacionConUsuario = iniciarConversacionConUsuario;
window.abrirModalImagen = abrirModalImagen;
window.limpiarArchivosSeleccionados = limpiarArchivosSeleccionados;
window.eliminarConversacion = eliminarConversacion;