// ================================================================
// MENSAJES.JS - SARIEL'S WEB3 (PRODUCCIÓN)
// ================================================================

window.conversacionActual = null;
let suscripcionMensajes = null;

function getSupabase() {
    return window.supabaseClient || window.supabase;
}

function formatearHora(fechaIso) {
    if (!fechaIso) return '';
    return new Date(fechaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

        const { data: participantes, error: partOtrosError } = await client
            .from('conversation_participants')
            .select('conversation_id, user_id, usuarios(id, username, avatar_url)')
            .in('conversation_id', convIds)
            .neq('user_id', user.id);

        if (partOtrosError) throw partOtrosError;

        container.innerHTML = '';

        if (!participantes || participantes.length === 0) {
            container.innerHTML = `<div class="sin-conversaciones"><p>No hay otros participantes en los chats</p></div>`;
            return;
        }

        participantes.forEach(p => {
            const perfil = p.usuarios || {};
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

function renderizarMensaje(msg, esMio) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `message ${esMio ? 'own' : ''}`;

    let adjuntoHTML = '';
    if (msg.media_url) {
        if (msg.tipo === 'imagen') {
            adjuntoHTML = `
                <div class="message-image">
                    <img src="${escapeHTML(msg.media_url)}" onclick="abrirModalImagen('${escapeHTML(msg.media_url)}')" alt="Imagen"/>
                </div>`;
        } else if (msg.tipo === 'audio') {
            adjuntoHTML = `
                <div class="message-audio">
                    <audio controls src="${escapeHTML(msg.media_url)}"></audio>
                </div>`;
        } else if (msg.tipo === 'video') {
            adjuntoHTML = `
                <div class="message-video">
                    <video controls src="${escapeHTML(msg.media_url)}" style="max-width:100%; border-radius:8px;"></video>
                </div>`;
        } else {
            adjuntoHTML = `
                <div class="message-file">
                    <a href="${escapeHTML(msg.media_url)}" target="_blank" download>📎 ${escapeHTML(msg.nombre_archivo || 'Descargar archivo')}</a>
                </div>`;
        }
    }

    div.innerHTML = `
        ${msg.contenido ? `<div class="message-text">${escapeHTML(msg.contenido)}</div>` : ''}
        ${adjuntoHTML}
        <div class="message-meta">
            <span>${formatearHora(msg.created_at)}</span>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

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

    const client = getSupabase();

    try {
        const { data: { user } } = await client.auth.getUser();
        let mediaUrl = null;
        let tipoMensaje = 'texto';

        if (file) {
            const fileExt = file.name.split('.').pop().toLowerCase();
            const esAudio = file.type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(fileExt);
            const bucketName = esAudio ? 'chat-audio' : 'chat-attachments';
            const folderPrefix = esAudio ? 'audios' : 'media';

            const filePath = `${folderPrefix}/${window.conversacionActual}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

            const { error: uploadError } = await client.storage
                .from(bucketName)
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = client.storage
                .from(bucketName)
                .getPublicUrl(filePath);

            mediaUrl = publicUrlData.publicUrl;

            if (file.type.startsWith('image/')) tipoMensaje = 'imagen';
            else if (file.type.startsWith('video/')) tipoMensaje = 'video';
            else if (esAudio) tipoMensaje = 'audio';
            else tipoMensaje = 'archivo';
        }

        const { error: sendError } = await client
            .from('messages')
            .insert({
                conversation_id: window.conversacionActual,
                sender_id: user.id,
                contenido: texto || null,
                media_url: mediaUrl,
                tipo: tipoMensaje,
                nombre_archivo: file ? file.name : null,
                tamano_bytes: file ? file.size : null,
                mime_type: file ? file.type : null
            })
            .select()
            .single();

        if (sendError) throw sendError;

        if (input) input.value = '';
        if (fileInput) fileInput.value = '';
        limpiarArchivosSeleccionados();
        actualizarContadorTexto();

    } catch (err) {
        console.error('Error al enviar mensaje:', err);
        alert('Error al enviar el mensaje');
    } finally {
        if (btnEnviar) btnEnviar.disabled = false;
    }
}

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

                const sinMensajesEl = document.querySelector('.chat-messages .sin-mensajes');
                if (sinMensajesEl) sinMensajesEl.remove();

                const esMio = nuevoMsg.sender_id === user.id;
                renderizarMensaje(nuevoMsg, esMio);
            }
        )
        .subscribe();
}

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
        if (!user) return alert('Inicia sesión para chatear');

        const { data: nuevaConv, error: convError } = await client
            .from('conversations')
            .insert({
                usuario_a_id: user.id,
                usuario_b_id: targetUserId,
                tipo: 'directo'
            })
            .select()
            .single();

        if (convError) throw convError;

        const { error: partError } = await client
            .from('conversation_participants')
            .insert([
                { conversation_id: nuevaConv.id, user_id: user.id },
                { conversation_id: nuevaConv.id, user_id: targetUserId }
            ]);

        if (partError) throw partError;

        cerrarModalNuevoContacto();

        const { data: targetProfile } = await client
            .from('usuarios')
            .select('username, avatar_url')
            .eq('id', targetUserId)
            .single();

        const nombre = targetProfile ? targetProfile.username : 'Usuario';
        const avatar = targetProfile ? targetProfile.avatar_url : null;

        abrirConversacion(nuevaConv.id, nombre, avatar);

    } catch (err) {
        console.error('Error al iniciar conversación:', err);
        alert('Error al crear el chat');
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

document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');

    if (messageInput) {
        messageInput.addEventListener('input', () => {
            actualizarContadorTexto();
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

window.cargarConversaciones = cargarConversaciones;
window.abrirConversacion = abrirConversacion;
window.enviarMensaje = enviarMensaje;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.iniciarConversacionConUsuario = iniciarConversacionConUsuario;
window.abrirModalImagen = abrirModalImagen;
window.limpiarArchivosSeleccionados = limpiarArchivosSeleccionados;
