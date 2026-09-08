// ================================================================
// MENSAJES.JS - SARIEL'S WEB3
// Módulo de mensajería en tiempo real con Supabase
// ================================================================

// Obtener la instancia del cliente público de Supabase expuesta en el entorno global
const supabase = window.supabaseClient || window.supabase;

// Variables de estado global
window.conversacionActual = null;
let suscripcionRealtime = null;

// ================================================================
// 1. CARGAR Y LISTAR CONVERSACIONES
// ================================================================

/**
 * Carga las conversaciones del usuario autenticado
 */
async function cargarConversaciones() {
    const container = document.getElementById('conversationList');
    if (!container) return;

    if (!supabase) {
        console.error('❌ Cliente de Supabase no inicializado.');
        return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        container.innerHTML = `
            <div class="sin-conversaciones">
                <span class="icono">🔒</span>
                <p>Inicia sesión para ver tus mensajes</p>
            </div>`;
        return;
    }

    // Consultar chats donde participa el usuario actual
    const { data: participaciones, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id, conversations(created_at)')
        .eq('user_id', user.id);

    if (error) {
        console.error('Error al obtener conversaciones:', error);
        showToast('Error al cargar conversaciones', 'error');
        return;
    }

    if (!participaciones || participaciones.length === 0) {
        container.innerHTML = `
            <div class="sin-conversaciones">
                <span class="icono">💬</span>
                <p>No tienes conversaciones activas</p>
            </div>`;
        return;
    }

    container.innerHTML = '';

    // Renderizar cada conversación
    for (const item of participaciones) {
        const convId = item.conversation_id;

        const div = document.createElement('button');
        div.className = `conversation-item ${window.conversacionActual === convId ? 'active' : ''}`;
        div.onclick = () => abrirConversacion(convId);

        div.innerHTML = `
            <div class="conversation-avatar">
                <span class="avatar-placeholder">◈</span>
            </div>
            <div class="conversation-content">
                <strong>Chat #${convId.substring(0, 8)}</strong>
                <span>Haz clic para abrir la sala</span>
            </div>
        `;
        container.appendChild(div);
    }
}

/**
 * Selecciona una conversación y carga sus mensajes
 */
async function abrirConversacion(conversationId) {
    window.conversacionActual = conversationId;

    // Actualizar estado visual de la lista
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    
    const chatTitle = document.getElementById('chatUserName');
    if (chatTitle) {
        chatTitle.textContent = `Chat #${conversationId.substring(0, 8)}`;
    }

    await cargarMensajes(conversationId);
}

// ================================================================
// 2. CARGAR Y ESCUCHAR MENSAJES EN TIEMPO REAL
// ================================================================

/**
 * Consulta los mensajes de una conversación específica
 */
async function cargarMensajes(conversationId) {
    if (!conversationId) return;

    window.conversacionActual = conversationId;
    const chatContainer = document.getElementById('chatMessages');
    if (!chatContainer) return;

    chatContainer.innerHTML = '<div class="loading-mensajes">Cargando mensajes...</div>';

    const { data: mensajes, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error al consultar mensajes:', error);
        showToast('Error al cargar los mensajes', 'error');
        return;
    }

    renderizarMensajes(mensajes);
    suscribirseAChat(conversationId);
}

/**
 * Habilita la recepción en tiempo real mediante WebSockets
 */
function suscribirseAChat(conversationId) {
    if (suscripcionRealtime) {
        supabase.removeChannel(suscripcionRealtime);
    }

    suscripcionRealtime = supabase
        .channel(`chat:${conversationId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
        }, payload => {
            agregarMensajeAUI(payload.new);
        })
        .subscribe();
}

// ================================================================
// 3. ENVIAR MENSAJES Y ADJUNTOS
// ================================================================

/**
 * Envía un mensaje de texto o archivo adjunto
 */
async function enviarMensaje() {
    const input = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    if (!input || !fileInput) return;

    const text = input.value.trim();
    if (!text && fileInput.files.length === 0) return;

    if (!window.conversacionActual) {
        showToast('Selecciona una conversación primero', 'warning');
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Debes iniciar sesión para responder', 'error');
        return;
    }

    let mediaUrl = null;
    let mediaType = null;

    // Subida de archivos al bucket de almacenamiento 'chat-attachments'
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase
            .storage
            .from('chat-attachments')
            .upload(fileName, file);

        if (uploadError) {
            console.error('Error al subir archivo:', uploadError);
            showToast('Error al subir el archivo adjunto', 'error');
            return;
        }

        const { data: publicUrlData } = supabase
            .storage
            .from('chat-attachments')
            .getPublicUrl(fileName);

        mediaUrl = publicUrlData.publicUrl;
        mediaType = file.type.startsWith('image/') ? 'image' : 'audio';
    }

    // Inserción en la base de datos
    const { error } = await supabase
        .from('messages')
        .insert({
            conversation_id: window.conversacionActual,
            sender_id: user.id,
            content: text,
            media_url: mediaUrl,
            media_type: mediaType
        });

    if (error) {
        console.error('Error al enviar mensaje:', error);
        showToast('No se pudo enviar el mensaje', 'error');
    } else {
        input.value = '';
        fileInput.value = '';
        input.style.height = 'auto';
        
        const counter = document.getElementById('charCounter');
        if (counter) counter.textContent = '0/2000';
        
        const listaArchivos = document.getElementById('archivosSeleccionados');
        if (listaArchivos) listaArchivos.innerHTML = '';
    }
}

// ================================================================
// 4. RENDERS Y UTILIDADES DE UI
// ================================================================

function renderizarMensajes(mensajes) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '';

    if (!mensajes || mensajes.length === 0) {
        container.innerHTML = `
            <div class="sin-mensajes">
                <span class="icono">💭</span>
                <p>No hay mensajes en este chat</p>
                <span style="font-size:0.7rem;opacity:0.7;">¡Envía el primer mensaje!</span>
            </div>`;
        return;
    }

    mensajes.forEach(msg => agregarMensajeAUI(msg));
}

async function agregarMensajeAUI(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    // Limpiar pantalla inicial si no hay mensajes
    if (container.querySelector('.sin-mensajes')) {
        container.innerHTML = '';
    }

    const { data: { user } } = await supabase.auth.getUser();
    const isOwn = msg.sender_id === user?.id;

    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : ''}`;

    let mediaHTML = '';
    if (msg.media_url) {
        if (msg.media_type === 'image') {
            mediaHTML = `<div class="message-image"><img src="${msg.media_url}" alt="Adjunto" onclick="abrirImagen('${msg.media_url}')" /></div>`;
        } else if (msg.media_type === 'audio') {
            mediaHTML = `<div class="message-audio"><audio controls src="${msg.media_url}"></audio></div>`;
        }
    }

    const hora = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="message-text">${msg.content ? escapeHTML(msg.content) : ''}</div>
        ${mediaHTML}
        <div class="message-meta">
            <span>${hora}</span>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ================================================================
// 5. MODALES Y CONTACTOS
// ================================================================

function nuevaConversacion() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) modal.classList.add('show');
}

function cerrarModalNuevoContacto() {
    const modal = document.getElementById('modalNuevoContacto');
    if (modal) modal.classList.remove('show');
}

async function iniciarConversacionConUsuario(targetUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return showToast('Debes iniciar sesión', 'error');

    // 1. Crear registro en conversations
    const { data: nuevaConv, error: errConv } = await supabase
        .from('conversations')
        .insert({})
        .select()
        .single();

    if (errConv) return showToast('Error al crear la sala', 'error');

    // 2. Insertar participantes
    const { error: errPart } = await supabase
        .from('conversation_participants')
        .insert([
            { conversation_id: nuevaConv.id, user_id: user.id },
            { conversation_id: nuevaConv.id, user_id: targetUserId }
        ]);

    if (errPart) return showToast('Error al añadir participantes', 'error');

    // 3. Abrir la nueva conversación
    cerrarModalNuevoContacto();
    await cargarConversaciones();
    abrirConversacion(nuevaConv.id);
}

function showToast(mensaje, tipo = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.className = `toast ${tipo} show`;
    toast.textContent = mensaje;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function abrirImagen(url) {
    const modal = document.getElementById('modalImagenMensaje');
    if (!modal) return;
    const img = modal.querySelector('img');
    if (img) img.src = url;
    modal.classList.add('show');
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// ================================================================
// 6. EVENTOS DE INICIALIZACIÓN DOM
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    const charCounter = document.getElementById('charCounter');
    const fileInput = document.getElementById('fileInput');

    // Manejo de auto-resize y contador
    if (messageInput) {
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = `${messageInput.scrollHeight}px`;

            if (charCounter) {
                charCounter.textContent = `${messageInput.value.length}/2000`;
            }
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarMensaje();
            }
        });
    }

    // Preview de archivos adjuntos
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const container = document.getElementById('archivosSeleccionados');
            if (!container) return;
            container.innerHTML = '';

            Array.from(fileInput.files).forEach(file => {
                const badge = document.createElement('div');
                badge.className = 'archivo-seleccionado';
                badge.innerHTML = `📎 ${file.name} <button onclick="this.parentElement.remove()">✕</button>`;
                container.appendChild(badge);
            });
        });
    }

    // Cargar historial inicial de chats
    cargarConversaciones();
});

// Exponer funciones necesarias al scope global (window) para los bindings del HTML
window.cargarConversaciones = cargarConversaciones;
window.abrirConversacion = abrirConversacion;
window.cargarMensajes = cargarMensajes;
window.enviarMensaje = enviarMensaje;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.iniciarConversacionConUsuario = iniciarConversacionConUsuario;
window.showToast = showToast;
window.abrirImagen = abrirImagen;
