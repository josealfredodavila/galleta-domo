// ================================================================
// MENSAJES.JS - SARIEL'S WEB3
// VERSIÓN UNIFICADA CON API REST + VIDEOLLAMADA
// ================================================================

const API_BASE = '/api/mensajes';

// ================================================================
// ESTADO GLOBAL
// ================================================================
let conversacionActual = null;
let usuarioActual = null;
let realtimeChannel = null;
let mensajesCargados = false;
let page = 0;
let cargandoMas = false;
let hayMasMensajes = true;

// Estado de llamada
const callState = {
    active: false,
    room: null,
    localTrack: null,
    audioTrack: null,
    screenTrack: null,
    callId: null,
    isInitiator: false,
    startTime: null,
    durationInterval: null,
    incomingCallId: null,
    incomingFrom: null,
    participants: [],
    _ringInterval: null
};

let callChannel = null;
let callListeners = [];

// ================================================================
// FUNCIONES DE AUTENTICACIÓN
// ================================================================

function getSession() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    return { access_token: token, user: JSON.parse(localStorage.getItem('user') || '{}') };
}

function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function headersAutenticados() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

// ================================================================
// FUNCIONES DE UTILERÍA
// ================================================================

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatearHora(fechaIso) {
    if (!fechaIso) return '';
    const fecha = new Date(fechaIso);
    if (isNaN(fecha.getTime())) return '';
    return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatearFecha(fechaIso) {
    if (!fechaIso) return '';
    const fecha = new Date(fechaIso);
    if (isNaN(fecha.getTime())) return '';
    return fecha.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showToast(mensaje, tipo = 'info') {
    const toast = document.getElementById('toastNotification') || crearToast();
    const iconos = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    toast.innerHTML = `${iconos[tipo] || 'ℹ️'} ${mensaje}`;
    toast.className = `toast-notification show ${tipo}`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function crearToast() {
    const toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
    return toast;
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

        if (response.status === 401) {
            container.innerHTML = `<div class="sin-conversaciones"><p>Inicia sesión para ver tus chats</p></div>`;
            return;
        }

        if (!response.ok) throw new Error(`Error ${response.status}`);

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
            div.className = `conversation-item ${conversacionActual === convId ? 'active' : ''}`;
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
    conversacionActual = convId;

    const nameEl = document.getElementById('chatUserName');
    const avatarEl = document.getElementById('chatUserAvatar');

    if (nameEl) nameEl.textContent = nombre || 'Chat';
    if (avatarEl) {
        avatarEl.innerHTML = avatarUrl 
            ? `<img src="${escapeHTML(avatarUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` 
            : `<span>◈</span>`;
    }

    // Guardar nombre para videollamada
    if (nombre) {
        const session = getSession();
        if (session && session.user) {
            const user = session.user;
            // Guardar el nombre del contacto para la videollamada
            if (!user.contactos) user.contactos = {};
            user.contactos[convId] = { nombre, avatar_url: avatarUrl };
            localStorage.setItem('user', JSON.stringify(user));
        }
    }

    cargarConversaciones();
    await cargarMensajes(convId);
    suscribirMensajesTiempoReal(convId);
}

// ================================================================
// CARGAR MENSAJES
// ================================================================

async function cargarMensajes(convId, cargarMas = false) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (!cargarMas) {
        container.innerHTML = `<div class="loading-mensajes">Cargando mensajes...</div>`;
        page = 0;
        hayMasMensajes = true;
        mensajesCargados = false;
    }

    if (!hayMasMensajes && cargarMas) return;

    try {
        const url = `${API_BASE}/mensajes/${convId}?page=${page}&limit=50`;
        const response = await fetch(url, {
            headers: headersAutenticados()
        });

        if (response.status === 403) {
            container.innerHTML = `<div class="sin-mensajes"><p>No tienes acceso a esta conversación</p></div>`;
            return;
        }

        if (!response.ok) throw new Error(`Error ${response.status}`);

        const data = await response.json();

        if (!data.success) throw new Error(data.error || 'Error al cargar mensajes');

        const mensajes = data.mensajes || [];
        const userId = data.usuario_id;

        if (mensajes.length === 0 && !cargarMas) {
            container.innerHTML = `
                <div class="sin-mensajes">
                    <span class="icono">💭</span>
                    <p>No hay mensajes en este chat</p>
                    <span style="font-size:0.7rem;opacity:0.7;">¡Sé el primero en escribir!</span>
                </div>`;
            return;
        }

        if (mensajes.length < 50) hayMasMensajes = false;

        if (cargarMas) {
            // Insertar al inicio
            const fragment = document.createDocumentFragment();
            mensajes.forEach(msg => {
                const esMio = msg.sender_id === userId;
                const div = crearMensajeElemento(msg, esMio);
                fragment.appendChild(div);
            });
            container.prepend(fragment);
        } else {
            container.innerHTML = '';
            mensajes.forEach(msg => {
                const esMio = msg.sender_id === userId;
                const div = crearMensajeElemento(msg, esMio);
                container.appendChild(div);
            });
            mensajesCargados = true;
        }

        // Marcar como leídos en el backend
        await fetch(`${API_BASE}/leer/${convId}`, {
            method: 'POST',
            headers: headersAutenticados()
        });

        if (!cargarMas) {
            container.scrollTop = container.scrollHeight;
        }

    } catch (err) {
        console.error('Error al cargar mensajes:', err);
        if (!cargarMas) {
            container.innerHTML = `<div class="sin-mensajes"><p>Error al obtener los mensajes</p></div>`;
        }
    }
}

// ================================================================
// CREAR ELEMENTO DE MENSAJE
// ================================================================

function crearMensajeElemento(msg, esMio) {
    const div = document.createElement('div');
    div.className = `message ${esMio ? 'own' : ''}`;
    div.dataset.mensajeId = msg.id;

    let adjuntoHTML = '';
    if (msg.media_url) {
        const mediaType = msg.tipo || 'archivo';
        if (mediaType === 'imagen') {
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
            const nombre = msg.nombre_archivo || 'Descargar archivo';
            adjuntoHTML = `
                <div class="message-file">
                    <a href="${escapeHTML(msg.media_url)}" target="_blank" download>📎 ${escapeHTML(nombre)}</a>
                    ${msg.tamano_bytes ? `<span class="file-size">(${(msg.tamano_bytes / 1024).toFixed(1)} KB)</span>` : ''}
                </div>`;
        }
    }

    const contenido = msg.contenido || '';
    const hora = formatearHora(msg.created_at);
    const fecha = formatearFecha(msg.created_at);

    div.innerHTML = `
        ${contenido ? `<div class="message-text">${escapeHTML(contenido)}</div>` : ''}
        ${adjuntoHTML}
        <div class="message-meta">
            <span>${hora}</span>
            ${msg.editado ? `<span class="editado">(editado)</span>` : ''}
            ${esMio ? `<span class="estado">${msg.is_read ? '✓✓' : '✓'}</span>` : ''}
        </div>
        ${!esMio ? `
            <div class="message-actions">
                <button onclick="reportarMensaje('${msg.id}')" title="Reportar">🚩</button>
            </div>
        ` : `
            <div class="message-actions">
                <button onclick="editarMensaje('${msg.id}')" title="Editar">✎</button>
                <button onclick="eliminarMensaje('${msg.id}')" title="Eliminar">🗑️</button>
            </div>
        `}
    `;

    return div;
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================

async function enviarMensaje() {
    if (!conversacionActual) {
        showToast('Selecciona una conversación primero', 'warning');
        return;
    }

    const input = document.getElementById('chatInput');
    const texto = input ? input.value.trim() : '';
    const fileInput = document.getElementById('fileInput');
    const file = fileInput ? fileInput.files[0] : null;

    if (!texto && !file) {
        showToast('Escribe un mensaje o selecciona un archivo', 'warning');
        return;
    }

    const btnEnviar = document.getElementById('btnEnviar');
    if (btnEnviar) btnEnviar.disabled = true;

    try {
        let mediaUrl = null;
        let mediaType = 'texto';
        let fileName = null;
        let fileSize = null;
        let mimeType = null;
        let duracionSegundos = null;

        // Subir archivo si existe
        if (file) {
            const formData = new FormData();
            formData.append('archivo', file);
            formData.append('conversacionId', conversacionActual);

            const uploadResponse = await fetch(`${API_BASE}/subir-archivo`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                },
                body: formData
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.error || 'Error al subir archivo');
            }

            const uploadData = await uploadResponse.json();
            if (!uploadData.success) throw new Error(uploadData.error || 'Error al subir archivo');

            mediaUrl = uploadData.url;
            mediaType = uploadData.tipo || 'archivo';
            fileName = file.name;
            fileSize = file.size;
            mimeType = file.mimeType || file.type;

            // Si es audio, obtener duración
            if (file.type.startsWith('audio/')) {
                try {
                    const audio = new Audio();
                    audio.src = URL.createObjectURL(file);
                    await new Promise((resolve, reject) => {
                        audio.onloadedmetadata = () => {
                            duracionSegundos = Math.round(audio.duration);
                            resolve();
                        };
                        audio.onerror = reject;
                        setTimeout(resolve, 3000);
                    });
                } catch (e) {
                    console.warn('No se pudo obtener duración del audio:', e);
                }
            }
        }

        // Enviar mensaje
        const response = await fetch(`${API_BASE}/enviar`, {
            method: 'POST',
            headers: headersAutenticados(),
            body: JSON.stringify({
                conversationId: conversacionActual,
                contenido: texto || null,
                media_url: mediaUrl,
                media_type: mediaType,
                file_name: fileName,
                file_size: fileSize,
                mime_type: mimeType,
                duracion_segundos: duracionSegundos
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al enviar mensaje');
        }

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al enviar mensaje');

        // Limpiar campos
        if (input) input.value = '';
        if (fileInput) fileInput.value = '';
        limpiarArchivosSeleccionados();

        // Actualizar altura del input
        input.style.height = 'auto';

        // Agregar mensaje localmente
        if (data.mensaje) {
            const container = document.getElementById('chatMessages');
            const sinMensajes = container.querySelector('.sin-mensajes');
            if (sinMensajes) sinMensajes.remove();

            const div = crearMensajeElemento(data.mensaje, true);
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }

        showToast('Mensaje enviado', 'success');

    } catch (err) {
        console.error('Error al enviar mensaje:', err);
        showToast(err.message || 'Error al enviar mensaje', 'error');
    } finally {
        if (btnEnviar) btnEnviar.disabled = false;
    }
}

// ================================================================
// ELIMINAR MENSAJE
// ================================================================

async function eliminarMensaje(mensajeId) {
    if (!confirm('¿Eliminar este mensaje?')) return;

    try {
        const response = await fetch(`${API_BASE}/mensajes/${mensajeId}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });

        if (!response.ok) throw new Error('Error al eliminar mensaje');

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al eliminar mensaje');

        // Eliminar del DOM
        const mensajeEl = document.querySelector(`.message[data-mensaje-id="${mensajeId}"]`);
        if (mensajeEl) {
            mensajeEl.style.opacity = '0.5';
            setTimeout(() => mensajeEl.remove(), 300);
        }

        showToast('Mensaje eliminado', 'success');

    } catch (err) {
        console.error('Error al eliminar mensaje:', err);
        showToast(err.message || 'Error al eliminar mensaje', 'error');
    }
}

// ================================================================
// EDITAR MENSAJE
// ================================================================

async function editarMensaje(mensajeId) {
    const mensajeEl = document.querySelector(`.message[data-mensaje-id="${mensajeId}"]`);
    if (!mensajeEl) return;

    const textoEl = mensajeEl.querySelector('.message-text');
    if (!textoEl) return;

    const textoActual = textoEl.textContent;
    const nuevoTexto = prompt('Editar mensaje:', textoActual);
    if (nuevoTexto === null || nuevoTexto.trim() === textoActual) return;
    if (!nuevoTexto.trim()) {
        showToast('El mensaje no puede estar vacío', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/mensajes/${mensajeId}`, {
            method: 'PUT',
            headers: headersAutenticados(),
            body: JSON.stringify({ contenido: nuevoTexto.trim() })
        });

        if (!response.ok) throw new Error('Error al editar mensaje');

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al editar mensaje');

        textoEl.textContent = nuevoTexto.trim();
        mensajeEl.querySelector('.editado')?.remove();
        const meta = mensajeEl.querySelector('.message-meta');
        if (meta) {
            const editSpan = document.createElement('span');
            editSpan.className = 'editado';
            editSpan.textContent = '(editado)';
            meta.prepend(editSpan);
        }

        showToast('Mensaje editado', 'success');

    } catch (err) {
        console.error('Error al editar mensaje:', err);
        showToast(err.message || 'Error al editar mensaje', 'error');
    }
}

// ================================================================
// REPORTAR MENSAJE
// ================================================================

async function reportarMensaje(mensajeId) {
    const motivo = prompt('Motivo del reporte:');
    if (!motivo) return;

    try {
        const response = await fetch(`${API_BASE}/reportar/${mensajeId}`, {
            method: 'POST',
            headers: headersAutenticados(),
            body: JSON.stringify({ motivo: motivo.trim() })
        });

        if (!response.ok) throw new Error('Error al reportar mensaje');

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al reportar mensaje');

        showToast('Mensaje reportado', 'success');

    } catch (err) {
        console.error('Error al reportar mensaje:', err);
        showToast(err.message || 'Error al reportar mensaje', 'error');
    }
}

// ================================================================
// ELIMINAR CONVERSACIÓN
// ================================================================

async function eliminarConversacion() {
    if (!conversacionActual) {
        showToast('Selecciona una conversación primero', 'warning');
        return;
    }

    if (!confirm('¿Deseas salir de este chat?')) return;

    try {
        const response = await fetch(`${API_BASE}/conversacion/${conversacionActual}`, {
            method: 'DELETE',
            headers: headersAutenticados()
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al salir del chat');
        }

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al salir del chat');

        // Limpiar estado
        conversacionActual = null;
        document.getElementById('chatUserName').textContent = 'Selecciona una conversación';
        document.getElementById('chatUserAvatar').innerHTML = '<span>◈</span>';
        document.getElementById('chatMessages').innerHTML = `
            <div class="sin-mensajes">
                <span class="icono">💭</span>
                <p>Selecciona una conversación</p>
            </div>
        `;

        // Cancelar suscripción
        if (realtimeChannel) {
            try {
                // Supabase realtime removal
                if (window.supabase && window.supabase.removeChannel) {
                    window.supabase.removeChannel(realtimeChannel);
                }
            } catch (e) {}
            realtimeChannel = null;
        }

        cargarConversaciones();
        showToast('Has salido del chat', 'success');

    } catch (err) {
        console.error('Error al eliminar conversación:', err);
        showToast(err.message || 'Error al salir del chat', 'error');
    }
}

// ================================================================
// BLOQUEAR USUARIO
// ================================================================

async function bloquearUsuario() {
    if (!conversacionActual) {
        showToast('Selecciona una conversación primero', 'warning');
        return;
    }

    if (!confirm('¿Bloquear a este usuario?')) return;

    try {
        // Obtener el ID del otro participante
        const response = await fetch(`${API_BASE}/conversacion/${conversacionActual}/participantes`, {
            headers: headersAutenticados()
        });

        if (!response.ok) throw new Error('Error al obtener participantes');

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al obtener participantes');

        const otros = data.participantes.filter(p => p.user_id !== getSession()?.user?.id);
        if (otros.length === 0) {
            showToast('No se pudo identificar al usuario', 'error');
            return;
        }

        const usuarioId = otros[0].user_id;

        const blockResponse = await fetch(`${API_BASE}/bloquear/${usuarioId}`, {
            method: 'POST',
            headers: headersAutenticados()
        });

        if (!blockResponse.ok) {
            const errorData = await blockResponse.json();
            throw new Error(errorData.error || 'Error al bloquear usuario');
        }

        const blockData = await blockResponse.json();
        if (!blockData.success) throw new Error(blockData.error || 'Error al bloquear usuario');

        showToast('Usuario bloqueado', 'success');
        eliminarConversacion();

    } catch (err) {
        console.error('Error al bloquear usuario:', err);
        showToast(err.message || 'Error al bloquear usuario', 'error');
    }
}

// ================================================================
// BUSCAR EN CONVERSACIÓN
// ================================================================

async function buscarEnConversacion(query) {
    if (!query || !query.trim()) {
        showToast('Escribe algo para buscar', 'warning');
        return;
    }

    if (!conversacionActual) {
        showToast('Selecciona una conversación', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/buscar/${conversacionActual}?q=${encodeURIComponent(query.trim())}`, {
            headers: headersAutenticados()
        });

        if (!response.ok) throw new Error('Error al buscar');

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al buscar');

        const container = document.getElementById('chatMessages');
        const resultados = data.mensajes || [];

        if (resultados.length === 0) {
            container.innerHTML = `
                <div class="sin-mensajes">
                    <span class="icono">🔍</span>
                    <p>No se encontraron resultados</p>
                    <span style="font-size:0.7rem;opacity:0.7;">No hay mensajes que coincidan con "${escapeHTML(query.trim())}"</span>
                    <br>
                    <button class="btn btn-sm" onclick="cargarMensajes('${conversacionActual}')">Volver</button>
                </div>`;
            return;
        }

        // Mostrar resultados
        const userId = getSession()?.user?.id;
        container.innerHTML = '';
        resultados.forEach(msg => {
            const esMio = msg.sender_id === userId;
            const div = crearMensajeElemento(msg, esMio);
            container.appendChild(div);
        });
        container.scrollTop = 0;

        showToast(`Encontrados ${resultados.length} mensajes`, 'success');

    } catch (err) {
        console.error('Error buscando:', err);
        showToast(err.message || 'Error al buscar', 'error');
    }
}

// ================================================================
// NUEVA CONVERSACIÓN
// ================================================================

function nuevaConversacion() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) modal.classList.add('show');
    const input = document.getElementById('searchInputModal');
    if (input) {
        input.value = '';
        input.focus();
        const resultados = document.getElementById('resultadosBusqueda');
        if (resultados) {
            resultados.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.75rem;padding:12px;">Escribe al menos 2 caracteres para buscar</p>';
        }
    }
}

function cerrarModalNuevoContacto() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) modal.classList.remove('show');
}

// ================================================================
// BUSCAR CONTACTOS (para nueva conversación)
// ================================================================

async function buscarContactos(query) {
    const resultados = document.getElementById('resultadosBusqueda');
    if (!resultados) return;

    if (!query || query.length < 2) {
        resultados.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.75rem;padding:12px;">Escribe al menos 2 caracteres para buscar</p>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/usuarios?query=${encodeURIComponent(query)}`, {
            headers: headersAutenticados()
        });

        if (!response.ok) throw new Error('Error al buscar usuarios');

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al buscar usuarios');

        const usuarios = data.usuarios || [];

        if (usuarios.length === 0) {
            resultados.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.75rem;padding:12px;">No se encontraron usuarios</p>';
            return;
        }

        resultados.innerHTML = usuarios.map(u => `
            <div class="contacto-resultado">
                <div class="contacto-avatar">
                    ${u.avatar_url ? `<img src="${escapeHTML(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;"/>` : '◈'}
                </div>
                <div class="contacto-info">
                    <strong>${escapeHTML(u.username || 'Usuario')}</strong>
                </div>
                <button class="btn-agregar-contacto" onclick="iniciarConversacionConUsuario('${u.id}')">Chatear</button>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error buscando contactos:', err);
        resultados.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.75rem;padding:12px;">Error al buscar usuarios</p>';
    }
}

// ================================================================
// INICIAR CONVERSACIÓN CON USUARIO
// ================================================================

async function iniciarConversacionConUsuario(targetUserId) {
    try {
        const response = await fetch(`${API_BASE}/conversacion`, {
            method: 'POST',
            headers: headersAutenticados(),
            body: JSON.stringify({ targetUserId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al crear la conversación');
        }

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error al crear la conversación');

        cerrarModalNuevoContacto();

        const conversacion = data.conversacion;
        const usuario = data.otros_participantes?.[0] || {};
        const nombre = usuario.username || 'Usuario';
        const avatar = usuario.avatar_url || null;

        abrirConversacion(conversacion.id, nombre, avatar);
        showToast('Conversación creada', 'success');

    } catch (err) {
        console.error('Error al iniciar conversación:', err);
        showToast(err.message || 'Error al crear el chat', 'error');
    }
}

// ================================================================
// SUSCRIPCIÓN EN TIEMPO REAL (Polling)
// ================================================================

let ultimoMensajeId = null;

function suscribirMensajesTiempoReal(convId) {
    // Cancelar suscripción anterior
    if (realtimeChannel) {
        clearInterval(realtimeChannel);
        realtimeChannel = null;
    }

    // Polling cada 3 segundos
    realtimeChannel = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/mensajes/${convId}?since=${ultimoMensajeId || ''}`, {
                headers: headersAutenticados()
            });

            if (!response.ok) return;

            const data = await response.json();
            if (!data.success || !data.mensajes) return;

            const userId = data.usuario_id;
            const mensajesNuevos = data.mensajes;

            // Filtrar mensajes nuevos
            mensajesNuevos.forEach(msg => {
                // Verificar si ya existe en el DOM
                const existe = document.querySelector(`.message[data-mensaje-id="${msg.id}"]`);
                if (!existe) {
                    const esMio = msg.sender_id === userId;
                    const container = document.getElementById('chatMessages');
                    const sinMensajes = container.querySelector('.sin-mensajes');
                    if (sinMensajes) sinMensajes.remove();

                    const div = crearMensajeElemento(msg, esMio);
                    container.appendChild(div);
                    container.scrollTop = container.scrollHeight;

                    if (msg.id) ultimoMensajeId = msg.id;
                }
            });

        } catch (err) {
            // Silenciar errores de polling
        }
    }, 3000);
}

// ================================================================
// SUBIR ARCHIVO
// ================================================================

let archivosSeleccionados = [];

function seleccionarArchivo() {
    document.getElementById('fileInput')?.click();
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (file.size > maxSize) {
        showToast('El archivo excede el tamaño máximo de 50MB', 'error');
        e.target.value = '';
        return;
    }

    archivosSeleccionados.push(file);
    mostrarArchivosSeleccionados();

    // Auto-enviar si es audio
    if (file.type.startsWith('audio/')) {
        enviarMensaje();
    }
}

function mostrarArchivosSeleccionados() {
    const container = document.getElementById('archivosSeleccionados');
    if (!container) return;

    if (archivosSeleccionados.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = archivosSeleccionados.map((file, index) => `
        <div class="archivo-seleccionado">
            <span>📎 ${escapeHTML(file.name)} (${(file.size / 1024).toFixed(1)} KB)</span>
            <button onclick="quitarArchivoSeleccionado(${index})">✕</button>
        </div>
    `).join('');
}

function quitarArchivoSeleccionado(index) {
    archivosSeleccionados.splice(index, 1);
    mostrarArchivosSeleccionados();
    document.getElementById('fileInput').value = '';
}

function limpiarArchivosSeleccionados() {
    archivosSeleccionados = [];
    mostrarArchivosSeleccionados();
    document.getElementById('fileInput').value = '';
}

// ================================================================
// 🎥 VIDEOLLAMADA - FUNCIONES COMPLETAS
// ================================================================

async function obtenerTokenLiveKit(roomName, participantName) {
    try {
        const response = await fetch('/api/livekit/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                roomName: roomName,
                participantName: participantName
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al obtener token');
        }

        return await response.json();
    } catch (e) {
        console.error('Error obteniendo token LiveKit:', e);
        throw e;
    }
}

async function iniciarVideollamada() {
    if (!conversacionActual) {
        showToast('Selecciona una conversación para llamar', 'warning');
        return;
    }

    if (callState.active) {
        mostrarLlamada();
        return;
    }

    try {
        const session = getSession();
        if (!session) {
            showToast('Inicia sesión para llamar', 'error');
            return;
        }

        // Obtener información del contacto
        const user = session.user;
        const contactoNombre = document.getElementById('chatUserName')?.textContent || 'Usuario';

        // Verificar si ya hay una llamada activa
        const response = await fetch(`${API_BASE}/llamada/verificar/${conversacionActual}`, {
            headers: headersAutenticados()
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.activa) {
                showToast('Ya hay una llamada en curso', 'warning');
                return;
            }
        }

        // Crear la llamada
        const callId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
        const roomName = 'call_' + callId;

        const createResponse = await fetch(`${API_BASE}/llamada`, {
            method: 'POST',
            headers: headersAutenticados(),
            body: JSON.stringify({
                conversationId: conversacionActual,
                tipo: 'video',
                roomName: roomName
            })
        });

        if (!createResponse.ok) {
            const errorData = await createResponse.json();
            throw new Error(errorData.error || 'Error al crear la llamada');
        }

        const createData = await createResponse.json();
        if (!createData.success) throw new Error(createData.error || 'Error al crear la llamada');

        // Guardar estado
        callState.callId = createData.llamada.id;
        callState.isInitiator = true;
        callState.active = true;

        // Mostrar interfaz
        mostrarLlamada();

        // Conectar a LiveKit
        await conectarALiveKit(roomName, user.id, callState.callId);

        // Iniciar contador
        iniciarContadorDuracion();

        showToast(`📞 Llamando a ${contactoNombre}...`, '');

        // Actualizar botón
        const btnCall = document.getElementById('btnVideoCall');
        if (btnCall) {
            btnCall.textContent = '📞';
            btnCall.classList.add('active-call');
        }

    } catch (e) {
        console.error('Error iniciando videollamada:', e);
        showToast('❌ Error al iniciar llamada: ' + e.message, 'error');
        limpiarLlamada();
    }
}

async function conectarALiveKit(roomName, participantId, callId) {
    try {
        const tokenData = await obtenerTokenLiveKit(roomName, participantId);

        // Verificar que LiveKitClient esté disponible
        if (typeof LivekitClient === 'undefined') {
            throw new Error('LiveKit no está disponible');
        }

        const room = new LivekitClient.Room();

        room.on(LivekitClient.RoomEvent.TrackSubscribed, function(track, publication, participant) {
            if (track.kind === 'video' && !track.isLocal) {
                const videoElement = document.getElementById('remoteVideo');
                if (videoElement) {
                    track.attach(videoElement);
                    document.getElementById('remoteAvatarPlaceholder').style.display = 'none';
                    document.getElementById('remoteLabel').textContent = participant.name || 'Participante';
                }
            }
            if (track.kind === 'audio' && !track.isLocal) {
                track.attach();
            }
        });

        room.on(LivekitClient.RoomEvent.ParticipantConnected, function(participant) {
            actualizarParticipantes(room);
            showToast('👤 ' + (participant.name || 'Usuario') + ' se unió a la llamada', 'success');
        });

        room.on(LivekitClient.RoomEvent.ParticipantDisconnected, function(participant) {
            actualizarParticipantes(room);
            showToast('👤 ' + (participant.name || 'Usuario') + ' abandonó la llamada', 'warning');
        });

        room.on(LivekitClient.RoomEvent.Disconnected, function() {
            if (callState.active) {
                colgarLlamada();
            }
        });

        await room.connect(tokenData.wsUrl || tokenData.url, tokenData.token);
        await publicarTracksLocales(room);

        callState.room = room;
        callState.active = true;

        actualizarParticipantes(room);
        showToast('✅ Conectado a la videollamada', 'success');

    } catch (e) {
        console.error('Error conectando a LiveKit:', e);
        showToast('❌ Error al conectar a la videollamada: ' + e.message, 'error');
        colgarLlamada();
        throw e;
    }
}

async function publicarTracksLocales(room) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
            await room.localParticipant.publishTrack(audioTrack, {
                name: 'microphone',
                source: LivekitClient.TrackSource.Microphone
            });
            callState.audioTrack = audioTrack;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            await room.localParticipant.publishTrack(videoTrack, {
                name: 'camera',
                source: LivekitClient.TrackSource.Camera
            });
            callState.localTrack = videoTrack;

            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = new MediaStream([videoTrack]);
                document.getElementById('localAvatarPlaceholder').style.display = 'none';
            }
        }

        return stream;
    } catch (e) {
        console.error('Error publicando tracks:', e);
        // Intentar solo audio
        try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioTrack = audioOnly.getAudioTracks()[0];
            if (audioTrack) {
                await room.localParticipant.publishTrack(audioTrack, {
                    name: 'microphone',
                    source: LivekitClient.TrackSource.Microphone
                });
                callState.audioTrack = audioTrack;
                showToast('🎤 Audio disponible (cámara no accesible)', 'warning');
            }
        } catch (audioError) {
            showToast('⚠️ No se pudo acceder a cámara ni micrófono', 'error');
        }
    }
}

function mostrarLlamada() {
    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.classList.add('show');
    document.getElementById('remoteAvatarPlaceholder').style.display = 'block';
    document.getElementById('localAvatarPlaceholder').style.display = 'block';
}

function ocultarLlamada() {
    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.classList.remove('show');
}

function minimizarLlamada() {
    ocultarLlamada();
    showToast('📹 Llamada minimizada', '');
}

function iniciarContadorDuracion() {
    callState.startTime = Date.now();
    if (callState.durationInterval) clearInterval(callState.durationInterval);

    callState.durationInterval = setInterval(function() {
        if (!callState.active) {
            clearInterval(callState.durationInterval);
            return;
        }
        const elapsed = Math.floor((Date.now() - callState.startTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        const durationEl = document.getElementById('callDuration');
        if (durationEl) durationEl.textContent = mins + ':' + secs;
    }, 1000);
}

function actualizarParticipantes(room) {
    if (!room) return;
    const participants = [];
    const localIdentity = room.localParticipant.identity;

    participants.push({
        identity: localIdentity,
        name: room.localParticipant.name || 'Tú',
        isLocal: true
    });

    room.participants.forEach(function(p) {
        participants.push({
            identity: p.identity,
            name: p.name || 'Participante',
            isLocal: false
        });
    });

    callState.participants = participants;

    const list = document.getElementById('participantsList');
    const count = document.getElementById('participantsCount');
    if (list) {
        list.innerHTML = participants.map(function(p) {
            return `<div class="participant-item">${p.isLocal ? '👤' : '👤'} ${escapeHTML(p.name)}${p.isLocal ? ' (Tú)' : ''}</div>`;
        }).join('');
    }
    if (count) count.textContent = participants.length;
}

let audioMuted = false;
let videoMuted = false;
let screenSharing = false;

function toggleAudio() {
    const btn = document.getElementById('btnToggleAudio');
    if (!callState.room) return;

    try {
        audioMuted = !audioMuted;
        if (callState.audioTrack) {
            callState.audioTrack.enabled = !audioMuted;
        }
        if (audioMuted) {
            btn?.classList.add('muted');
            btn.textContent = '🔇';
            document.getElementById('localMuteIndicator')?.classList.add('show');
            showToast('🔇 Micrófono silenciado', '');
        } else {
            btn?.classList.remove('muted');
            btn.textContent = '🎤';
            document.getElementById('localMuteIndicator')?.classList.remove('show');
            showToast('🎤 Micrófono activado', '');
        }
    } catch (e) {
        console.error('Error toggling audio:', e);
    }
}

function toggleVideo() {
    const btn = document.getElementById('btnToggleVideo');
    if (!callState.room) return;

    try {
        videoMuted = !videoMuted;
        if (callState.localTrack) {
            callState.localTrack.enabled = !videoMuted;
        }
        if (videoMuted) {
            btn?.classList.add('muted');
            btn.textContent = '📷❌';
            document.getElementById('localVideo').style.display = 'none';
            document.getElementById('localAvatarPlaceholder').style.display = 'block';
        } else {
            btn?.classList.remove('muted');
            btn.textContent = '📷';
            document.getElementById('localVideo').style.display = 'block';
            document.getElementById('localAvatarPlaceholder').style.display = 'none';
        }
        showToast(videoMuted ? '📷 Cámara desactivada' : '📷 Cámara activada', '');
    } catch (e) {
        console.error('Error toggling video:', e);
    }
}

async function toggleScreenShare() {
    const btn = document.getElementById('btnToggleScreen');
    if (!callState.room) return;

    try {
        if (!screenSharing) {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                await callState.room.localParticipant.publishTrack(videoTrack, {
                    name: 'screen',
                    source: LivekitClient.TrackSource.ScreenShare
                });
                callState.screenTrack = videoTrack;
                screenSharing = true;
                btn?.classList.add('active');
                btn.textContent = '🖥️⏹️';
                videoTrack.onended = function() { detenerScreenShare(); };
                showToast('🖥️ Compartiendo pantalla', 'success');
            }
        } else {
            await detenerScreenShare();
        }
    } catch (e) {
        console.error('Error toggling screen share:', e);
        if (e.name === 'NotAllowedError') {
            showToast('⚠️ Permiso denegado para compartir pantalla', 'warning');
        } else {
            showToast('❌ Error al compartir pantalla: ' + e.message, 'error');
        }
    }
}

async function detenerScreenShare() {
    try {
        if (callState.screenTrack) {
            await callState.room.localParticipant.unpublishTrack(callState.screenTrack);
            callState.screenTrack.stop();
            callState.screenTrack = null;
        }
        screenSharing = false;
        const btn = document.getElementById('btnToggleScreen');
        if (btn) {
            btn.classList.remove('active');
            btn.textContent = '🖥️';
        }
        showToast('🖥️ Compartir pantalla detenido', '');
    } catch (e) {
        console.error('Error deteniendo screen share:', e);
    }
}

function toggleParticipantsPanel() {
    const panel = document.getElementById('participantsPanel');
    if (panel) panel.classList.toggle('show');
}

async function colgarLlamada() {
    if (!callState.active && !callState.callId) return;

    try {
        // Actualizar estado en BD
        if (callState.callId) {
            await fetch(`${API_BASE}/llamada/${callState.callId}`, {
                method: 'PUT',
                headers: headersAutenticados(),
                body: JSON.stringify({ estado: 'ended' })
            });
        }

        limpiarRecursosLiveKit();
        limpiarLlamada();
        ocultarLlamada();
        document.getElementById('callIncoming')?.classList.remove('show');

        const btnCall = document.getElementById('btnVideoCall');
        if (btnCall) {
            btnCall.textContent = '📹';
            btnCall.classList.remove('active-call');
        }

        showToast('📞 Llamada finalizada', '');

    } catch (e) {
        console.error('Error colgando llamada:', e);
        limpiarRecursosLiveKit();
        limpiarLlamada();
        ocultarLlamada();
    }
}

function limpiarRecursosLiveKit() {
    try {
        if (callState.room) {
            callState.room.disconnect();
            callState.room = null;
        }
        if (callState.localTrack) {
            callState.localTrack.stop();
            callState.localTrack = null;
        }
        if (callState.audioTrack) {
            callState.audioTrack.stop();
            callState.audioTrack = null;
        }
        if (callState.screenTrack) {
            callState.screenTrack.stop();
            callState.screenTrack = null;
        }

        document.getElementById('remoteVideo').srcObject = null;
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('remoteAvatarPlaceholder').style.display = 'block';
        document.getElementById('localAvatarPlaceholder').style.display = 'block';

        if (callState.durationInterval) {
            clearInterval(callState.durationInterval);
            callState.durationInterval = null;
        }
        if (callState._ringInterval) {
            clearInterval(callState._ringInterval);
            callState._ringInterval = null;
        }
    } catch (e) {
        console.error('Error limpiando recursos LiveKit:', e);
    }
}

function limpiarLlamada() {
    callState.active = false;
    callState.room = null;
    callState.localTrack = null;
    callState.audioTrack = null;
    callState.screenTrack = null;
    callState.callId = null;
    callState.isInitiator = false;
    callState.startTime = null;
    callState.incomingCallId = null;
    callState.incomingFrom = null;
    callState.participants = [];

    document.getElementById('participantsList').innerHTML = '';
    document.getElementById('participantsCount').textContent = '0';
    document.getElementById('callDuration').textContent = '00:00';
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
// LIMPIEZA DE RECURSOS
// ================================================================

function limpiarRecursosMensajes() {
    if (realtimeChannel) {
        clearInterval(realtimeChannel);
        realtimeChannel = null;
    }
    archivosSeleccionados = [];
    limpiarRecursosLiveKit();
}

// ================================================================
// INICIALIZACIÓN
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('◈ Sariel\'s - Mensajes con Videollamada');
    console.log('✅ Inicializando...');

    cargarConversaciones();

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                enviarMensaje();
            }
        });
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
    }

    const btnEnviar = document.getElementById('btnEnviar');
    if (btnEnviar) {
        btnEnviar.addEventListener('click', enviarMensaje);
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            buscarContactos(e.target.value);
        });
    }

    const searchInputModal = document.getElementById('searchInputModal');
    if (searchInputModal) {
        searchInputModal.addEventListener('input', function(e) {
            buscarContactos(e.target.value);
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarModalNuevoContacto();
            const incoming = document.getElementById('callIncoming');
            if (incoming && incoming.classList.contains('show')) {
                document.getElementById('callIncoming')?.classList.remove('show');
            }
            document.getElementById('modalImagenMensaje')?.classList.remove('show');
        }
    });

    // Limpiar recursos al cerrar
    window.addEventListener('beforeunload', function() {
        if (callState.active) {
            colgarLlamada();
        }
        limpiarRecursosMensajes();
    });
});

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================

window.cargarConversaciones = cargarConversaciones;
window.abrirConversacion = abrirConversacion;
window.enviarMensaje = enviarMensaje;
window.eliminarMensaje = eliminarMensaje;
window.editarMensaje = editarMensaje;
window.eliminarConversacion = eliminarConversacion;
window.bloquearUsuario = bloquearUsuario;
window.buscarEnConversacion = buscarEnConversacion;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.buscarContactos = buscarContactos;
window.iniciarConversacionConUsuario = iniciarConversacionConUsuario;
window.seleccionarArchivo = seleccionarArchivo;
window.handleFileSelect = handleFileSelect;
window.showToast = showToast;
window.limpiarRecursosMensajes = limpiarRecursosMensajes;
window.abrirModalImagen = abrirModalImagen;

// Videollamada
window.iniciarVideollamada = iniciarVideollamada;
window.colgarLlamada = colgarLlamada;
window.minimizarLlamada = minimizarLlamada;
window.toggleAudio = toggleAudio;
window.toggleVideo = toggleVideo;
window.toggleScreenShare = toggleScreenShare;
window.toggleParticipantsPanel = toggleParticipantsPanel;
window.mostrarLlamada = mostrarLlamada;
window.ocultarLlamada = ocultarLlamada;