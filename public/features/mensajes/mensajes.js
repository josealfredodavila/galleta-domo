/* ================================================================
   MENSAJES ULTRA MEGA PRO - SARIEL'S
   Conectado a Supabase REAL (Sin localStorage ni API vieja)
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (El mismo de app.js)
// ================================================================
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

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
// VARIABLES GLOBALES
// ================================================================
let usuarioActual = null;
let conversacionActual = null;
let mensajesCargados = [];
let paginaMensajes = 1;
let cargandoMensajes = false;
let hayMasMensajes = true;

// ================================================================
// ELEMENTOS DEL DOM
// ================================================================
const conversacionesList = document.getElementById('conversacionesList');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const btnEnviar = document.getElementById('btnEnviar');
const chatNombre = document.querySelector('.chat-nombre');
const chatEstado = document.querySelector('.chat-estado');
const chatAvatar = document.querySelector('.chat-avatar');

// ================================================================
// VERIFICAR AUTENTICACIÓN
// ================================================================
async function verificarAutenticacion() {
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para usar mensajería', 'warning');
        return false;
    }
    usuarioActual = session.user;
    return true;
}

// ================================================================
// CARGAR CONVERSACIONES (Desde Supabase)
// ================================================================
async function cargarConversaciones() {
    if (!await verificarAutenticacion()) {
        cargarConversacionesEjemplo();
        return;
    }

    try {
        // Obtener contactos del usuario
        const { data: contactos, error } = await supabase
            .from('contactos')
            .select('*, usuarios!contactos_contacto_id_fkey(id, nombre, handle, avatar_url)')
            .eq('usuario_id', usuarioActual.id);

        if (error) throw error;

        if (!contactos || contactos.length === 0) {
            conversacionesList.innerHTML = `
                <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
                    <div style="font-size: 2.5rem; margin-bottom: 12px; font-family:'Orbitron',monospace; color:var(--gold); opacity:0.4; letter-spacing:2px;">◈</div>
                    <p style="letter-spacing:0.3px;">Sin contactos</p>
                    <p style="font-size: 0.75rem; letter-spacing:0.3px;">Agrega contactos para empezar a chatear</p>
                </div>
            `;
            return;
        }

        // Obtener último mensaje de cada contacto
        const conversaciones = await Promise.all(contactos.map(async (contacto) => {
            const contactoInfo = contacto.usuarios || {};
            const { data: ultimoMensaje } = await supabase
                .from('mensajes_chat')
                .select('*')
                .or(`and(remitente_id.eq.${usuarioActual.id},destinatario_id.eq.${contactoInfo.id}),and(remitente_id.eq.${contactoInfo.id},destinatario_id.eq.${usuarioActual.id})`)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            return {
                id: contactoInfo.id,
                nombre: contactoInfo.nombre || 'Usuario',
                handle: contactoInfo.handle || '',
                avatar_url: contactoInfo.avatar_url || null,
                ultimoMensaje: ultimoMensaje?.contenido || 'Sin mensajes',
                fecha: ultimoMensaje?.created_at || null
            };
        }));

        conversacionesList.innerHTML = conversaciones.map(conv => {
            const fecha = conv.fecha ? new Date(conv.fecha) : null;
            const avatar = conv.avatar_url ? `<img src="${conv.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : (conv.nombre ? conv.nombre[0].toUpperCase() : '✦');

            return `
                <div class="conv-item ${conversacionActual && conversacionActual.id === conv.id ? 'active' : ''}"
                     data-id="${conv.id}"
                     onclick="abrirConversacion('${conv.id}')">
                    <div class="conv-avatar">${avatar}</div>
                    <div class="conv-info">
                        <div class="conv-nombre">${conv.nombre}</div>
                        <div class="conv-msg">${conv.ultimoMensaje}</div>
                    </div>
                    <div class="conv-meta">
                        <div class="conv-hora">${fecha ? formatearHora(fecha) : ''}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error cargando conversaciones desde Supabase:', error);
        cargarConversacionesEjemplo();
    }
}

// ================================================================
// CONVERSACIONES DE EJEMPLO (Solo si no hay sesión)
// ================================================================
function cargarConversacionesEjemplo() {
    conversacionesList.innerHTML = `
        <div class="conv-item" data-id="1" onclick="seleccionarConversacionDemo(1)">
            <div class="conv-avatar">✦</div>
            <div class="conv-info">
                <div class="conv-nombre">Ana Martínez</div>
                <div class="conv-msg">Hola, ¿cómo estás?</div>
            </div>
            <div class="conv-meta">
                <div class="conv-hora">14:30</div>
            </div>
        </div>
        <div class="conv-item" data-id="2" onclick="seleccionarConversacionDemo(2)">
            <div class="conv-avatar">◆</div>
            <div class="conv-info">
                <div class="conv-nombre">Carlos López</div>
                <div class="conv-msg">Nos vemos mañana</div>
            </div>
            <div class="conv-meta">
                <div class="conv-hora">12:15</div>
            </div>
        </div>
    `;
    showToast('⚠️ Inicia sesión para ver conversaciones reales', 'warning');
}

function seleccionarConversacionDemo(id) {
    const mensajesDemo = {
        1: [
            { tipo: 'recibido', texto: 'Hola, ¿cómo estás?', hora: '14:25' },
            { tipo: 'enviado', texto: '¡Hola! Todo bien, ¿y tú?', hora: '14:27' },
            { tipo: 'recibido', texto: 'Bien, quería preguntarte sobre los tokens', hora: '14:28' }
        ],
        2: [
            { tipo: 'recibido', texto: '¿Confirmamos la reunión?', hora: '12:10' },
            { tipo: 'enviado', texto: 'Sí, a las 5 pm', hora: '12:12' }
        ]
    };

    const mensajes = mensajesDemo[id] || [];
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';

    if (mensajes.length === 0) {
        container.innerHTML = `<div class="empty-chat"><span class="icon">◈</span><h3>Sin mensajes</h3></div>`;
        return;
    }

    mensajes.forEach(msg => {
        const div = document.createElement('div');
        div.className = `msg-wrapper ${msg.tipo}`;
        
        if (msg.tipo === 'enviado') {
            div.innerHTML = `<div class="burbuja">${msg.texto}</div><div class="meta">${msg.hora} <span class="leido leido">◆◆</span></div>`;
        } else {
            div.innerHTML = `
                <div class="fila">
                    <div class="avatar estado-conectado">◈</div>
                    <div class="burbuja">${msg.texto}</div>
                </div>
                <div class="meta">${msg.hora}</div>
            `;
        }
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// ================================================================
// ABRIR CONVERSACIÓN (Desde Supabase)
// ================================================================
window.abrirConversacion = async function(contactoId) {
    try {
        const session = await getSession();
        if (!session) {
            seleccionarConversacionDemo(contactoId);
            return;
        }

        const { data: contacto } = await supabase
            .from('usuarios')
            .select('id, nombre, handle, avatar_url')
            .eq('id', contactoId)
            .single();

        conversacionActual = contacto;

        if (chatNombre) chatNombre.textContent = contacto.nombre || 'Usuario';
        if (chatAvatar) chatAvatar.textContent = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';

        paginaMensajes = 1;
        hayMasMensajes = true;
        await cargarMensajes(contactoId, 1);

        chatInput.disabled = false;
        btnEnviar.disabled = false;
        chatInput.focus();

        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        console.error('Error abriendo conversación:', error);
        showToast('❌ Error al abrir conversación', 'error');
    }
};

// ================================================================
// CARGAR MENSAJES (Desde Supabase)
// ================================================================
async function cargarMensajes(contactoId, page = 1) {
    if (cargandoMensajes) return;
    cargandoMensajes = true;

    try {
        const session = await getSession();
        if (!session) {
            cargandoMensajes = false;
            return;
        }

        const { data: mensajes, error } = await supabase
            .from('mensajes_chat')
            .select('*')
            .or(`and(remitente_id.eq.${session.user.id},destinatario_id.eq.${contactoId}),and(remitente_id.eq.${contactoId},destinatario_id.eq.${session.user.id})`)
            .order('created_at', { ascending: false })
            .range((page - 1) * 50, (page * 50) - 1);

        if (error) throw error;

        hayMasMensajes = mensajes.length === 50;

        if (page === 1) {
            chatMessages.innerHTML = '';
            mensajesCargados = [];
        }

        if (mensajes && mensajes.length > 0) {
            const fragment = document.createDocumentFragment();
            mensajes.reverse().forEach(msg => {
                const el = crearElementoMensaje(msg, false);
                fragment.appendChild(el);
            });
            chatMessages.prepend(fragment);
            mensajesCargados = [...mensajes, ...mensajesCargados];
        } else if (page === 1) {
            chatMessages.innerHTML = `<div class="empty-chat"><span class="icon">◈</span><h3>Sin mensajes</h3><p>Inicia la conversación</p></div>`;
        }

        if (page === 1) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

    } catch (error) {
        console.error('Error cargando mensajes desde Supabase:', error);
    } finally {
        cargandoMensajes = false;
    }
}

// ================================================================
// CREAR ELEMENTO DE MENSAJE
// ================================================================
function crearElementoMensaje(mensaje, scroll = true) {
    const session = usuarioActual;
    const esEnviado = mensaje.remitente_id === session?.id;
    const tipo = esEnviado ? 'enviado' : 'recibido';
    const fecha = new Date(mensaje.created_at);

    const div = document.createElement('div');
    div.className = `msg-wrapper ${tipo}`;
    
    if (tipo === 'enviado') {
        div.innerHTML = `
            <div class="burbuja">${mensaje.contenido || ''}</div>
            <div class="meta">${formatearHora(fecha)} <span class="leido leido">◆◆</span></div>
        `;
    } else {
        div.innerHTML = `
            <div class="fila">
                <div class="avatar estado-conectado">◈</div>
                <div class="burbuja">${mensaje.contenido || ''}</div>
            </div>
            <div class="meta">${formatearHora(fecha)}</div>
        `;
    }
    
    return div;
}

// ================================================================
// ENVIAR MENSAJE (Desde Supabase)
// ================================================================
async function enviarMensaje() {
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
        await cargarMensajes(conversacionActual.id, 1);
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

    btnEnviar.addEventListener('click', enviarMensaje);

    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviarMensaje();
        }
    });
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.showToast = showToast;
window.abrirConversacion = abrirConversacion;
window.nuevaConversacion = nuevaConversacion;
window.enviarMensaje = enviarMensaje;
window.cargarConversaciones = cargarConversaciones;