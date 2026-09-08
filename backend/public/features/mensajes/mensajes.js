// ================================================================
// MENSAJES.JS - SARIEL'S WEB3
// Lógica de Mensajería, Conversaciones y Búsqueda
// ================================================================

window.conversacionActual = null;
let suscripcionMensajes = null;
let archivoAdjunto = null;

// Helper para obtener cliente Supabase
function getSupabase() {
    return window.supabaseClient || window.supabase;
}

// Helper para formatear horas
function formatearHora(fechaIso) {
    if (!fechaIso) return '';
    const fecha = new Date(fechaIso);
    return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Sanitizar texto para evitar XSS
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ----------------------------------------------------------------
// 1. CARGAR Y LISTAR CONVERSACIONES
// ----------------------------------------------------------------
async function cargarConversaciones() {
    const container = document.getElementById('conversationList');
    if (!container) return;

    const client = getSupabase();
    if (!client) {
        container.innerHTML = `<div class="sin-conversaciones"><p>Error: Cliente de base de datos no listo</p></div>`;
        return;
    }

    try {
        const { data: { user }, error: userError } = await client.auth.getUser();
        if (userError || !user) {
            container.innerHTML = `<div class="sin-conversaciones"><p>Inicia sesión para ver tus chats</p></div>`;
            return;
        }

        // Obtener IDs de conversaciones del usuario
        const { data: participaciones, error: partError } = await client
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', user.id);

        if (partError || !participaciones || participaciones.length === 0) {
            container.innerHTML = `
                <div class="sin-conversaciones">
                    <span class="icono">💬</span>
                    <p>No tienes conversaciones aún</p>
                </div>`;
            return;
        }

        const convIds = participaciones.map(p => p.conversation_id);

        // Obtener participantes de esas conversaciones (excluyendo al usuario actual)
        const { data: participantes, error: partOtrosError } = await client
            .from('conversation_participants')
            .select('conversation_id, user_id, profiles(id, username, avatar_url)')
            .in('conversation_id', convIds)
            .neq('user_id', user.id);

        if (partOtrosError) throw partOtrosError;

        container.innerHTML = '';

        participantes.forEach(p => {
            const perfil = p.profiles || {};
            const username = perfil.username || 'Usuario';
            const avatarUrl = perfil.avatar_url;
            const convId = p.conversation_id;

            const div = document.createElement('div');
            div.className = `conversation-item ${window.conversacionActual === convId ? 'active' : ''}`;
            div.onclick = () => abrirConversacion(convId, username, avatarUrl);

            div.innerHTML = `
                <div class="conversation-avatar">
                    ${avatarUrl ? `<img src="${escapeHTML(avatarUrl)}" alt="Avatar"/>` : `<span class="avatar-placeholder">${username.charAt(0).toUpperCase()}</span>`}
                </div>
                <div class="conversation-content">
                    <strong>${escapeHTML(username)}</strong>
                    <span>Toca para abrir el chat</span>
                </div>
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error('Error al cargar conversaciones:', err);
        container.innerHTML = `<div class="sin-conversaciones"><p>Error al cargar las conversaciones</p></div>`;
    }
}

// ----------------------------------------------------------------
// 2. ABRIR CONVERSACIÓN Y CARGAR MENSAJES
// ----------------------------------------------------------------
async function abrirConversacion(convId, nombre, avatarUrl) {
    window.conversacionActual = convId;

    // Actualizar encabezado del chat
    const nameEl = document.getElementById('chatUserName');
    const avatarEl = document.getElementById('chatUserAvatar');

    if (nameEl) nameEl.textContent = nombre || 'Chat';
    if (avatarEl) {
        avatarEl.innerHTML = avatarUrl 
            ? `<img src="${escapeHTML(avatarUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` 
            : `<span>◈</span>`;
    }

    // Refrescar lista de conversaciones para marcar la activa
    cargarConversaciones();

    // Cargar mensajes
    await cargarMensajes(convId);

    // Suscribirse en tiempo real a mensajes nuevos de esta conversación
    suscribirMensajesTiempoReal(convId);
}

async function cargarMensajes(convId) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = `<div class="loading-mensajes">Cargando mensajes...</div>`;

    const client = getSupabase();
    try {
        const { data: { user } } = await client.auth.getUser();

        const { data: mensajes, error } = await client
            .from('messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!mensajes || mensajes.length === 0) {
            container.innerHTML = `
                <div class="sin-mensajes">
                    <span class="icono">💭</span>
                    <p>No hay mensajes en este chat</p>
                    <span style="font-size:0.7rem;opacity:0.7;">¡Sé el primero en escribir!</span>
                </div>`;
            return;
        }

        container.innerHTML = '';
        mensajes.forEach(msg => {
            const esMio = msg.sender_id === user.id;
            renderizarMensaje(msg, esMio);
        });

        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error('Error al cargar mensajes:', err);
        container.innerHTML = `<div class="sin-mensajes"><p>Error al obtener los mensajes</p></div>`;
    }
}

// Renderizar mensaje individual en el DOM
function renderizarMensaje(msg, esMio) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `message ${esMio ? 'own' : ''}`;

    let adjuntoHTML = '';
    if (msg.media_url) {
        if (msg.media_type === 'image') {
            adjuntoHTML = `
                <div class="message-image">
                    <img src="${escapeHTML(msg.media_url)}" onclick="abrirModalImagen('${escapeHTML(msg.media_url)}')" alt="Imagen"/>
                </div>`;
        } else if (msg.media_type === 'audio') {
            adjuntoHTML = `
                <div class="message-audio">
                    <audio controls src="${escapeHTML(msg.media_url)}"></audio>
                </div>`;
        }
    }

    div.innerHTML = `
        ${msg.content ? `<div class="message-text">${escapeHTML(msg.content)}</div>` : ''}
        ${adjuntoHTML}
        <div class="message-meta">
            <span>${formatearHora(msg.created_at)}</span>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ----------------------------------------------------------------
// 3. ENVIAR MENSAJES Y ADJUNTOS
// ----------------------------------------------------------------
async function enviarMensaje() {
    if (!window.conversacionActual) {
        return showToast('Selecciona una conversación primero', 'warning');
    }

    const input = document.getElementById('messageInput');
    const texto = input ? input.value.trim() : '';
    const fileInput = document.getElementById('fileInput');
    const file = fileInput ? fileInput.files[0] : null;

    if (!texto && !file) {
        return showToast('Escribe un mensaje o selecciona un archivo', 'warning');
    }

    const btnEnviar = document.getElementById('sendMessageButton');
    if (btnEnviar) btnEnviar.disabled = true;

    const client = getSupabase();

    try {
        const { data: { user } } = await client.auth.getUser();
        let mediaUrl = null;
        let mediaType = null;

        // Subir archivo a Supabase Storage si se seleccionó uno
        if (file) {
            const fileExt = file.name.split('.').pop();
            const filePath = `chat_media/${window.conversacionActual}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await client.storage
                .from('mensajes-media')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = client.storage
                .from('mensajes-media')
                .getPublicUrl(filePath);

            mediaUrl = publicUrlData.publicUrl;
            mediaType = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('audio/') ? 'audio' : 'file');
        }

        // Insertar en la tabla 'messages'
        const { data: nuevoMensaje, error: sendError } = await client
            .from('messages')
            .insert({
                conversation_id: window.conversacionActual,
                sender_id: user.id,
                content: texto || null,
                media_url: mediaUrl,
                media_type: mediaType
            })
            .select()
            .single();

        if (sendError) throw sendError;

        // Limpiar controles
        if (input) input.value = '';
        if (fileInput) fileInput.value = '';
        limpiarArchivosSeleccionados();
        actualizarContadorTexto();

    } catch (err) {
        console.error('Error al enviar mensaje:', err);
        showToast('Error al enviar el mensaje', 'error');
    } finally {
        if (btnEnviar) btnEnviar.disabled = false;
    }
}

// ----------------------------------------------------------------
// 4. SUSCRIPCIÓN EN TIEMPO REAL (REALTIME)
// ----------------------------------------------------------------
function suscribirMensajesTiempoReal(convId) {
    const client = getSupabase();
    if (!client) return;

    if (suscripcionMensajes) {
        client.removeChannel(suscripcionMensajes);
    }

    suscripcionMensajes = client
        .channel(`chat_${convId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${convId}`
            },
            async (payload) => {
                const nuevoMsg = payload.new;
                const { data: { user } } = await client.auth.getUser();

                // Eliminar vista de "sin mensajes" si está presente
                const sinMensajesEl = document.querySelector('.chat-messages .sin-mensajes');
                if (sinMensajesEl) sinMensajesEl.remove();

                const esMio = nuevoMsg.sender_id === user.id;
                renderizarMensaje(nuevoMsg, esMio);
            }
        )
        .subscribe();
}

// ----------------------------------------------------------------
// 5. GESTIÓN DE MODALES Y COMPONENTES VISUALES
// ----------------------------------------------------------------
function nuevaConversacion() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) {
        modal.classList.add('show');
        const input = document.getElementById('searchInputModal');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function cerrarModalNuevoContacto() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) modal.classList.remove('show');
}

async function iniciarConversacionConUsuario(targetUserId) {
    const client = getSupabase();
    try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return showToast('Inicia sesión para chatear', 'warning');

        // Crear una nueva conversación
        const { data: nuevaConv, error: convError } = await client
            .from('conversations')
            .insert({})
            .select()
            .single();

        if (convError) throw convError;

        // Agregar a ambos usuarios como participantes
        const { error: partError } = await client
            .from('conversation_participants')
            .insert([
                { conversation_id: nuevaConv.id, user_id: user.id },
                { conversation_id: nuevaConv.id, user_id: targetUserId }
            ]);

        if (partError) throw partError;

        cerrarModalNuevoContacto();

        // Obtener perfil del usuario destino para el título del chat
        const { data: targetProfile } = await client
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', targetUserId)
            .single();

        const nombre = targetProfile ? targetProfile.username : 'Usuario';
        const avatar = targetProfile ? targetProfile.avatar_url : null;

        abrirConversacion(nuevaConv.id, nombre, avatar);

    } catch (err) {
        console.error('Error al iniciar conversación:', err);
        showToast('Error al crear el chat', 'error');
    }
}

function abrirModalImagen(src) {
    const modal = document.getElementById('modalImagenMensaje');
    if (modal) {
        const img = modal.querySelector('img');
        if (img) img.src = src;
        modal.classList.add('show');
    }
}

function limpiarArchivosSeleccionados() {
    const div = document.getElementById('archivosSeleccionados');
    if (div) div.innerHTML = '';
}

function actualizarContadorTexto() {
    const input = document.getElementById('messageInput');
    const counter = document.getElementById('charCounter');
    if (input && counter) {
        counter.textContent = `${input.value.length}/2000`;
    }
}

// Event Listeners para entradas
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');

    if (messageInput) {
        messageInput.addEventListener('input', () => {
            actualizarContadorTexto();
            // Autoajustar altura del textarea
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
                            <span>📎 ${escapeHTML(file.name)}</span>
                            <button onclick="document.getElementById('fileInput').value=''; limpiarArchivosSeleccionados();">✕</button>
                        </div>`;
                } else {
                    divContainer.innerHTML = '';
                }
            }
        });
    }
});

// Exponer funciones necesarias globalmente
window.cargarConversaciones = cargarConversaciones;
window.abrirConversacion = abrirConversacion;
window.enviarMensaje = enviarMensaje;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.iniciarConversacionConUsuario = iniciarConversacionConUsuario;
window.abrirModalImagen = abrirModalImagen;
window.limpiarArchivosSeleccionados = limpiarArchivosSeleccionados;
