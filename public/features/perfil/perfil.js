/* ================================================================
   MENSAJES ULTRA MEGA PRO - SARIEL'S
   Con Supabase Realtime + Sincronización de Conversaciones
   ================================================================ */

const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

let usuarioActual = null;
let conversacionActual = null;
let realtimeChannel = null;

// ================================================================
// TOAST
// ================================================================
function showToast(msg, type = '') {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show';
    if (type === 'error') t.classList.add('error');
    else if (type === 'warning') t.classList.add('warning');
    else t.classList.remove('error', 'warning');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================================================================
// VERIFICAR AUTENTICACIÓN
// ================================================================
async function verificarAutenticacion() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para usar mensajería real', 'warning');
        return false;
    }
    usuarioActual = session.user;
    return true;
}

// ================================================================
// NUEVA CONVERSACIÓN (Función faltante)
// ================================================================
function nuevaConversacion() {
    showToast('◈ Buscador de contactos listo para integrarse. ¡Muy pronto!');
}

// ================================================================
// CARGAR CONVERSACIONES
// ================================================================
async function cargarConversaciones() {
    if (!await verificarAutenticacion()) return;

    try {
        const { data: contactos, error } = await supabase
            .from('contactos')
            .select('*, usuarios!contactos_contacto_id_fkey(id, nombre, handle, avatar_url)')
            .eq('usuario_id', usuarioActual.id);

        if (error) throw error;

        if (!contactos || contactos.length === 0) {
            const convList = document.getElementById('conversacionesList');
            if (convList) {
                convList.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Sin contactos agregados</div>';
            }
            return;
        }

        const conversaciones = await Promise.all(contactos.map(async (contacto) => {
            const contactoInfo = contacto.usuarios || {};
            const { data: ultimoMensaje } = await supabase
                .from('mensajes_chat')
                .select('contenido, created_at')
                .or(`and(remitente_id.eq.${usuarioActual.id},destinatario_id.eq.${contactoInfo.id}),and(remitente_id.eq.${contactoInfo.id},destinatario_id.eq.${usuarioActual.id})`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            return {
                id: contactoInfo.id,
                nombre: contactoInfo.nombre || 'Usuario',
                avatar_url: contactoInfo.avatar_url || null,
                ultimoMensaje: ultimoMensaje?.contenido || 'Sin mensajes'
            };
        }));

        const convList = document.getElementById('conversacionesList');
        if (convList) {
            convList.innerHTML = conversaciones.map(conv => {
                const avatar = conv.avatar_url ? `<img src="${conv.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : (conv.nombre ? conv.nombre[0].toUpperCase() : '✦');

                return `
                    <div class="conv-item ${conversacionActual?.id === conv.id ? 'active' : ''}" 
                         data-id="${conv.id}" 
                         onclick="abrirConversacion('${conv.id}')">
                        <div class="conv-avatar">${avatar}</div>
                        <div class="conv-info">
                            <div class="conv-nombre">${conv.nombre}</div>
                            <div class="conv-msg">${conv.ultimoMensaje}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error cargando conversaciones:', error);
    }
}

// ================================================================
// ABRIR CONVERSACIÓN
// ================================================================
async function abrirConversacion(contactoId) {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para abrir conversaciones', 'error');
        return;
    }

    try {
        const { data: contacto } = await supabase
            .from('usuarios')
            .select('id, nombre, handle, avatar_url')
            .eq('id', contactoId)
            .single();

        conversacionActual = contacto;

        const chatNombre = document.getElementById('chatNombre');
        if (chatNombre) chatNombre.textContent = contacto.nombre || 'Usuario';

        const chatAvatar = document.querySelector('.chat-avatar');
        if (chatAvatar) chatAvatar.textContent = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';

        await cargarMensajes(contactoId);

        // Cerrar canal anterior si existe
        if (realtimeChannel) {
            await supabase.removeChannel(realtimeChannel);
        }

        // Crear canal Realtime para la conversación actual
        realtimeChannel = supabase
            .channel(`chat-${contactoId}`)
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: `remitente_id=eq.${contactoId}` },
                (payload) => {
                    if (payload.new.destinatario_id === session.user.id) {
                        agregarMensajeRealtime(payload.new);
                    }
                }
            )
            .subscribe();

    } catch (error) {
        console.error('Error abriendo conversación:', error);
    }
}

// ================================================================
// CARGAR MENSAJES
// ================================================================
async function cargarMensajes(contactoId) {
    const session = await getSession();
    if (!session) return;

    const container = document.getElementById('chatMessages');
    if (!container) return;

    const { data: mensajes, error } = await supabase
        .from('mensajes_chat')
        .select('*')
        .or(`and(remitente_id.eq.${session.user.id},destinatario_id.eq.${contactoId}),and(remitente_id.eq.${contactoId},destinatario_id.eq.${session.user.id})`)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error cargando mensajes:', error);
        return;
    }

    if (mensajes && mensajes.length > 0) {
        container.innerHTML = mensajes.map(msg => crearMensajeHTML(msg)).join('');
        container.scrollTop = container.scrollHeight;
    } else {
        container.innerHTML = '<div class="empty-chat"><span class="icon">◈</span><h3>Inicia la conversación</h3></div>';
    }
}

// ================================================================
// CREAR MENSAJE HTML
// ================================================================
function crearMensajeHTML(msg) {
    const esEnviado = msg.remitente_id === usuarioActual?.id;
    const tipo = esEnviado ? 'enviado' : 'recibido';
    const fecha = new Date(msg.created_at);
    const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (esEnviado) {
        return `
            <div class="msg-wrapper enviado">
                <div class="burbuja">${msg.contenido}</div>
                <div class="meta">${hora} <span class="leido leido">◆◆</span></div>
            </div>
        `;
    }

    return `
        <div class="msg-wrapper recibido">
            <div class="fila">
                <div class="avatar estado-conectado">◈</div>
                <div class="burbuja">${msg.contenido}</div>
            </div>
            <div class="meta">${hora}</div>
        </div>
    `;
}

// ================================================================
// AGREGAR MENSAJE EN TIEMPO REAL
// ================================================================
function agregarMensajeRealtime(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const empty = container.querySelector('.empty-chat');
    if (empty) empty.remove();

    container.innerHTML += crearMensajeHTML(msg);
    container.scrollTop = container.scrollHeight;
}

// ================================================================
// ENVIAR MENSAJE
// ================================================================
async function enviarMensaje() {
    const chatInput = document.getElementById('chatInput');
    const contenido = chatInput.value.trim();
    if (!contenido || !conversacionActual) {
        if (!conversacionActual) showToast('⚠️ Selecciona una conversación', 'warning');
        return;
    }

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para enviar mensajes', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('mensajes_chat')
            .insert({
                remitente_id: session.user.id,
                destinatario_id: conversacionActual.id,
                contenido: contenido
            });

        if (error) throw error;

        chatInput.value = '';
        await cargarMensajes(conversacionActual.id);
        cargarConversaciones();
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showToast('❌ Error al enviar mensaje', 'error');
    }
}

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    await verificarAutenticacion();
    cargarConversaciones();

    const btnEnviar = document.getElementById('btnEnviar');
    if (btnEnviar) btnEnviar.addEventListener('click', enviarMensaje);

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarMensaje();
            }
        });
    }
});

// ================================================================
// EXPONER FUNCIONES
// ================================================================
window.showToast = showToast;
window.nuevaConversacion = nuevaConversacion;
window.abrirConversacion = abrirConversacion;
window.enviarMensaje = enviarMensaje;
window.cargarConversaciones = cargarConversaciones;