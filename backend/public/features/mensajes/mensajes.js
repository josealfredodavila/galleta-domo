/* ================================================================
   MENSAJES ULTRA MEGA PRO - SARIEL'S
   Con Supabase Realtime + Sincronización de Conversaciones
   + Búsqueda + Agregar Contactos + Eliminar/Editar + Imágenes + Reacciones
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (CON NUEVAS LLAVES)
// ================================================================
const supabase = window.supabase.createClient(
    'https://zultnlogdoajehbswlih.supabase.co',
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
);

let usuarioActual = null;
let conversacionActual = null;
let realtimeChannel = null;
let archivosSeleccionados = [];

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
        showToast('⚠️ Inicia sesión para usar mensajería', 'warning');
        return false;
    }
    usuarioActual = session.user;
    return true;
}

// ================================================================
// 🏷️ FORMATEAR TEXTO (Emojis + Hashtags + Menciones)
// ================================================================
function formatearTexto(texto) {
    if (!texto) return '';
    
    let textoFormateado = escapeHTML(texto);
    
    const emojis = {
        ':feliz:': '😊',
        ':risa:': '😂',
        ':amo:': '❤️',
        ':fuego:': '🔥',
        ':estrella:': '⭐',
        ':genial:': '🤩',
        ':ok:': '👌',
        ':visto:': '👀',
        ':musica:': '🎵',
        ':pizza:': '🍕',
        ':cafe:': '☕',
        ':helado:': '🍦',
        ':rocket:': '🚀',
        ':sariel:': '◈',
        ':enfadado:': '😡',
        ':triste:': '😢',
        ':sonrisa:': '😄',
        ':guiño:': '😉'
    };
    
    for (const [key, value] of Object.entries(emojis)) {
        textoFormateado = textoFormateado.replaceAll(key, value);
    }
    
    return textoFormateado;
}

function escapeHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// 🔍 BUSCAR CONTACTOS
// ================================================================
async function buscarContactos(query) {
    if (!query || query.length < 2) {
        document.getElementById('resultadosBusqueda').innerHTML = '';
        return;
    }

    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, handle, avatar_url')
            .or(`nombre.ilike.%${query}%,handle.ilike.%${query}%`)
            .neq('id', session.user.id)
            .limit(10);

        if (error) throw error;

        const container = document.getElementById('resultadosBusqueda');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div style="padding:12px;text-align:center;color:var(--text-muted);font-size:0.75rem;">
                    No se encontraron usuarios
                </div>
            `;
            return;
        }

        const { data: contactosExistentes } = await supabase
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);

        const idsExistentes = contactosExistentes?.map(c => c.contacto_id) || [];

        container.innerHTML = data.map(usuario => {
            const yaEsContacto = idsExistentes.includes(usuario.id);
            return `
                <div class="resultado-item" style="
                    display:flex;align-items:center;gap:10px;padding:8px 12px;
                    border-bottom:1px solid rgba(212,175,55,0.05);
                    transition:all 0.2s;
                ">
                    <div class="avatar" style="
                        width:36px;height:36px;border-radius:50%;
                        background:linear-gradient(135deg,var(--green-deep),var(--gold));
                        display:flex;align-items:center;justify-content:center;
                        color:white;font-size:0.8rem;overflow:hidden;
                    ">
                        ${usuario.avatar_url ? `<img src="${usuario.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : (usuario.nombre ? usuario.nombre[0].toUpperCase() : '◈')}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.8rem;">${usuario.nombre || 'Usuario'}</div>
                        <div style="font-size:0.6rem;color:var(--text-muted);">@${usuario.handle || 'usuario'}</div>
                    </div>
                    ${yaEsContacto ? `
                        <span style="font-size:0.55rem;color:var(--success);background:rgba(0,214,143,0.1);padding:2px 10px;border-radius:12px;">
                            ✓ Contacto
                        </span>
                    ` : `
                        <button onclick="agregarContacto('${usuario.id}')" style="
                            background:linear-gradient(135deg,var(--gold),var(--gold-dark));
                            color:var(--space);border:none;padding:4px 12px;border-radius:12px;
                            font-size:0.6rem;font-weight:600;cursor:pointer;
                        ">
                            + Agregar
                        </button>
                    `}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error buscando contactos:', error);
    }
}

// ================================================================
// ➕ AGREGAR CONTACTO
// ================================================================
async function agregarContacto(contactoId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para agregar contactos', 'error');
            return;
        }

        const { data: existe } = await supabase
            .from('contactos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId)
            .single();

        if (existe) {
            showToast('⚠️ Este usuario ya es tu contacto', 'warning');
            return;
        }

        const { error } = await supabase
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: contactoId,
                estado: 'activo'
            });

        if (error) throw error;

        showToast('✅ Contacto agregado correctamente', 'success');
        
        document.getElementById('searchInput').value = '';
        document.getElementById('resultadosBusqueda').innerHTML = '';
        await cargarConversaciones();

    } catch (error) {
        console.error('Error agregando contacto:', error);
        showToast('❌ Error al agregar contacto', 'error');
    }
}

// ================================================================
// 📋 CARGAR CONVERSACIONES
// ================================================================
async function cargarConversaciones() {
    if (!await verificarAutenticacion()) return;

    try {
        const { data: contactos, error } = await supabase
            .from('contactos')
            .select('*, usuarios!contactos_contacto_id_fkey(id, nombre, handle, avatar_url)')
            .eq('usuario_id', usuarioActual.id)
            .eq('estado', 'activo');

        if (error) throw error;

        if (!contactos || contactos.length === 0) {
            const convList = document.getElementById('conversacionesList');
            if (convList) {
                convList.innerHTML = `
                    <div style="padding:40px;text-align:center;color:var(--text-muted);font-size:0.8rem;">
                        <div style="font-size:2rem;margin-bottom:10px;">◈</div>
                        <p>Sin contactos agregados</p>
                        <p style="font-size:0.6rem;">Busca y agrega contactos arriba</p>
                    </div>
                `;
            }
            return;
        }

        const conversaciones = await Promise.all(contactos.map(async (contacto) => {
            const contactoInfo = contacto.usuarios || {};
            const { data: ultimoMensaje } = await supabase
                .from('mensajes_chat')
                .select('contenido, created_at, leido, remitente_id')
                .or(`and(remitente_id.eq.${usuarioActual.id},destinatario_id.eq.${contactoInfo.id}),and(remitente_id.eq.${contactoInfo.id},destinatario_id.eq.${usuarioActual.id})`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const { count: noLeidos } = await supabase
                .from('mensajes_chat')
                .select('id', { count: 'exact' })
                .eq('remitente_id', contactoInfo.id)
                .eq('destinatario_id', usuarioActual.id)
                .eq('leido', false);

            return {
                id: contactoInfo.id,
                nombre: contactoInfo.nombre || 'Usuario',
                avatar_url: contactoInfo.avatar_url || null,
                ultimoMensaje: ultimoMensaje?.contenido || 'Sin mensajes',
                ultimoRemitente: ultimoMensaje?.remitente_id,
                noLeidos: noLeidos || 0,
                fecha: ultimoMensaje?.created_at
            };
        }));

        conversaciones.sort((a, b) => {
            if (!a.fecha) return 1;
            if (!b.fecha) return -1;
            return new Date(b.fecha) - new Date(a.fecha);
        });

        const convList = document.getElementById('conversacionesList');
        if (convList) {
            convList.innerHTML = conversaciones.map(conv => {
                const avatar = conv.avatar_url ? `<img src="${conv.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : (conv.nombre ? conv.nombre[0].toUpperCase() : '✦');
                const isActive = conversacionActual?.id === conv.id;

                return `
                    <div class="conv-item ${isActive ? 'active' : ''}" 
                         data-id="${conv.id}" 
                         onclick="abrirConversacion('${conv.id}')">
                        <div class="conv-avatar">${avatar}</div>
                        <div class="conv-info">
                            <div class="conv-nombre">${conv.nombre}</div>
                            <div class="conv-msg">${conv.ultimoMensaje.length > 40 ? conv.ultimoMensaje.substring(0, 40) + '...' : conv.ultimoMensaje}</div>
                        </div>
                        <div class="conv-meta">
                            ${conv.noLeidos > 0 ? `<span class="conv-badge">${conv.noLeidos}</span>` : ''}
                        </div>
                        <div style="display:flex;gap:4px;flex-shrink:0;">
                            <button onclick="event.stopPropagation();eliminarConversacion('${conv.id}')" 
                                    style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.6rem;">
                                ✕
                            </button>
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
// 💬 ABRIR CONVERSACIÓN
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

        const { data: estadoContacto } = await supabase
            .from('usuarios')
            .select('online, ultima_conexion')
            .eq('id', contactoId)
            .single();

        const chatEstado = document.getElementById('chatEstado');
        if (chatEstado) {
            if (estadoContacto?.online) {
                chatEstado.textContent = '🟢 En línea';
                chatEstado.className = 'chat-estado online';
            } else if (estadoContacto?.ultima_conexion) {
                const diff = Math.floor((Date.now() - new Date(estadoContacto.ultima_conexion)) / 60000);
                if (diff < 5) {
                    chatEstado.textContent = '🟡 Última vez hace unos minutos';
                } else if (diff < 60) {
                    chatEstado.textContent = `🟡 Última vez hace ${diff} min`;
                } else if (diff < 1440) {
                    chatEstado.textContent = `🟡 Última vez hace ${Math.floor(diff / 60)} h`;
                } else {
                    chatEstado.textContent = `🟡 Última vez hace ${Math.floor(diff / 1440)} d`;
                }
                chatEstado.className = 'chat-estado';
            } else {
                chatEstado.textContent = '⚪ Desconectado';
                chatEstado.className = 'chat-estado';
            }
        }

        await marcarMensajesLeidos(contactoId);
        await cargarMensajes(contactoId);

        if (realtimeChannel) {
            await supabase.removeChannel(realtimeChannel);
        }

        realtimeChannel = supabase
            .channel(`chat-${contactoId}`)
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: `remitente_id=eq.${contactoId}` },
                (payload) => {
                    if (payload.new.destinatario_id === session.user.id) {
                        agregarMensajeRealtime(payload.new);
                        marcarMensajesLeidos(contactoId);
                    }
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'mensajes_chat' },
                () => cargarConversaciones()
            )
            .subscribe();

        cargarConversaciones();

    } catch (error) {
        console.error('Error abriendo conversación:', error);
    }
}

// ================================================================
// 📖 CARGAR MENSAJES
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
        .eq('eliminado', false)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error cargando mensajes:', error);
        return;
    }

    if (mensajes && mensajes.length > 0) {
        container.innerHTML = mensajes.map(msg => crearMensajeHTML(msg)).join('');
        container.scrollTop = container.scrollHeight;
    } else {
        container.innerHTML = `
            <div class="empty-chat" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:var(--text-muted);text-align:center;padding:40px 20px;">
                <span class="icon" style="font-size:2.5rem;display:block;margin-bottom:16px;color:var(--gold);opacity:0.4;font-family:'Orbitron',monospace;">◈</span>
                <h3 style="font-family:'Orbitron',monospace;color:var(--text-secondary);font-size:1rem;font-weight:400;">Inicia la conversación</h3>
                <p style="font-size:0.8rem;">Envía un mensaje para comenzar</p>
            </div>
        `;
    }
}

// ================================================================
// ✏️ CREAR MENSAJE HTML
// ================================================================
function crearMensajeHTML(msg) {
    const esEnviado = msg.remitente_id === usuarioActual?.id;
    const tipo = esEnviado ? 'enviado' : 'recibido';
    const fecha = new Date(msg.created_at);
    const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const contenidoFormateado = formatearTexto(msg.contenido || '');

    if (msg.tipo === 'imagen' && msg.imagen_url) {
        if (esEnviado) {
            return `
                <div class="msg-wrapper enviado">
                    <div class="burbuja" style="padding:4px;background:transparent;border-radius:12px;">
                        <img src="${msg.imagen_url}" style="max-width:200px;border-radius:12px;border:2px solid var(--gold);" />
                    </div>
                    <div class="meta">${hora} ${msg.editado ? '✎' : ''} <span class="leido leido">${msg.leido ? '◆◆' : '◆◇'}</span></div>
                </div>
            `;
        }
        return `
            <div class="msg-wrapper recibido">
                <div class="fila">
                    <div class="avatar estado-conectado">◈</div>
                    <div class="burbuja" style="padding:4px;background:transparent;border-radius:12px;border:1px solid var(--glass-border);">
                        <img src="${msg.imagen_url}" style="max-width:200px;border-radius:12px;" />
                    </div>
                </div>
                <div class="meta">${hora} ${msg.editado ? '✎' : ''}</div>
            </div>
        `;
    }

    if (msg.tipo === 'voz' && msg.imagen_url) {
        if (esEnviado) {
            return `
                <div class="msg-wrapper enviado">
                    <div class="burbuja" style="display:flex;align-items:center;gap:8px;">
                        <span>🎵</span>
                        <audio controls style="max-width:150px;height:30px;">
                            <source src="${msg.imagen_url}" type="audio/mpeg">
                        </audio>
                    </div>
                    <div class="meta">${hora} <span class="leido leido">${msg.leido ? '◆◆' : '◆◇'}</span></div>
                </div>
            `;
        }
        return `
            <div class="msg-wrapper recibido">
                <div class="fila">
                    <div class="avatar estado-conectado">◈</div>
                    <div class="burbuja" style="display:flex;align-items:center;gap:8px;">
                        <span>🎵</span>
                        <audio controls style="max-width:150px;height:30px;">
                            <source src="${msg.imagen_url}" type="audio/mpeg">
                        </audio>
                    </div>
                </div>
                <div class="meta">${hora}</div>
            </div>
        `;
    }

    if (esEnviado) {
        return `
            <div class="msg-wrapper enviado">
                <div class="burbuja">${contenidoFormateado}</div>
                <div class="meta">
                    ${hora} ${msg.editado ? '✎' : ''}
                    <span class="leido leido">${msg.leido ? '◆◆' : '◆◇'}</span>
                    <button onclick="eliminarMensaje('${msg.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.5rem;">✕</button>
                    <button onclick="editarMensaje('${msg.id}')" style="background:none;border:none;color:var(--gold);cursor:pointer;font-size:0.5rem;">✎</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="msg-wrapper recibido">
            <div class="fila">
                <div class="avatar estado-conectado">◈</div>
                <div class="burbuja">${contenidoFormateado}</div>
            </div>
            <div class="meta">
                ${hora} ${msg.editado ? '✎' : ''}
                <button onclick="reportarMensaje('${msg.id}')" style="background:none;border:none;color:var(--warning);cursor:pointer;font-size:0.5rem;">⚠️</button>
            </div>
        </div>
    `;
}

// ================================================================
// 📨 AGREGAR MENSAJE EN TIEMPO REAL
// ================================================================
function agregarMensajeRealtime(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const empty = container.querySelector('.empty-chat');
    if (empty) empty.remove();

    if (msg.remitente_id !== conversacionActual?.id && msg.destinatario_id !== conversacionActual?.id) return;

    container.innerHTML += crearMensajeHTML(msg);
    container.scrollTop = container.scrollHeight;
    cargarConversaciones();
}

// ================================================================
// 📤 ENVIAR MENSAJE
// ================================================================
async function enviarMensaje() {
    const chatInput = document.getElementById('chatInput');
    const contenido = chatInput.value.trim();
    if (!contenido && archivosSeleccionados.length === 0) {
        if (!conversacionActual) showToast('⚠️ Selecciona una conversación', 'warning');
        return;
    }

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para enviar mensajes', 'error');
        return;
    }

    if (!conversacionActual) {
        showToast('⚠️ Selecciona una conversación', 'error');
        return;
    }

    try {
        if (archivosSeleccionados.length > 0) {
            for (const file of archivosSeleccionados) {
                await subirArchivo(file, session);
            }
            archivosSeleccionados = [];
            document.getElementById('filePreview').innerHTML = '';
            chatInput.value = '';
            return;
        }

        const { error } = await supabase
            .from('mensajes_chat')
            .insert({
                remitente_id: session.user.id,
                destinatario_id: conversacionActual.id,
                contenido: contenido,
                tipo: 'texto'
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
// 🖼️ SUBIR ARCHIVO (Imagen/Voz)
// ================================================================
async function subirArchivo(file, session) {
    try {
        const fileExt = file.name.split('.').pop().toLowerCase();
        const tipo = file.type.startsWith('image/') ? 'imagen' : 'voz';
        const filePath = `mensajes/${session.user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('mensajes')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('mensajes')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const { error } = await supabase
            .from('mensajes_chat')
            .insert({
                remitente_id: session.user.id,
                destinatario_id: conversacionActual.id,
                contenido: file.name,
                tipo: tipo,
                imagen_url: publicUrl
            });

        if (error) throw error;

        showToast('✅ Archivo enviado', 'success');
        await cargarMensajes(conversacionActual.id);
        cargarConversaciones();

    } catch (error) {
        console.error('Error subiendo archivo:', error);
        showToast('❌ Error al subir archivo', 'error');
    }
}

// ================================================================
// 📎 SELECCIONAR ARCHIVO
// ================================================================
function seleccionarArchivo() {
    document.getElementById('fileInput')?.click();
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const preview = document.getElementById('filePreview');
    preview.innerHTML = '';

    archivosSeleccionados = [];

    for (const file of files) {
        archivosSeleccionados.push(file);
        const isImage = file.type.startsWith('image/');
        const isAudio = file.type.startsWith('audio/');
        const icon = isImage ? '🖼️' : (isAudio ? '🎵' : '📎');
        const size = (file.size / 1024).toFixed(1);

        const el = document.createElement('div');
        el.style.cssText = `
            display:inline-flex;align-items:center;gap:6px;
            background:rgba(212,175,55,0.1);padding:4px 12px;
            border-radius:12px;font-size:0.65rem;color:var(--text-secondary);
        `;
        el.innerHTML = `${icon} ${file.name} (${size}KB) <span onclick="this.parentElement.remove();archivosSeleccionados=[];" style="cursor:pointer;color:var(--danger);">✕</span>`;
        preview.appendChild(el);
    }

    event.target.value = '';
    showToast(`📎 ${files.length} archivo(s) seleccionado(s)`, 'success');
}

// ================================================================
// 🗑️ ELIMINAR MENSAJE
// ================================================================
async function eliminarMensaje(mensajeId) {
    if (!confirm('¿Eliminar este mensaje?')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabase
            .from('mensajes_chat')
            .update({ eliminado: true, fecha_eliminacion: new Date().toISOString() })
            .eq('id', mensajeId)
            .eq('remitente_id', session.user.id);

        if (error) throw error;

        showToast('🗑️ Mensaje eliminado');
        if (conversacionActual) {
            await cargarMensajes(conversacionActual.id);
        }
        cargarConversaciones();

    } catch (error) {
        console.error('Error eliminando mensaje:', error);
        showToast('❌ Error al eliminar mensaje', 'error');
    }
}

// ================================================================
// ✏️ EDITAR MENSAJE
// ================================================================
async function editarMensaje(mensajeId) {
    const nuevoContenido = prompt('Edita tu mensaje:');
    if (nuevoContenido === null) return;
    if (!nuevoContenido.trim()) {
        showToast('⚠️ No puedes dejar vacío', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabase
            .from('mensajes_chat')
            .update({
                contenido: nuevoContenido,
                editado: true,
                fecha_edicion: new Date().toISOString()
            })
            .eq('id', mensajeId)
            .eq('remitente_id', session.user.id);

        if (error) throw error;

        showToast('✅ Mensaje editado');
        if (conversacionActual) {
            await cargarMensajes(conversacionActual.id);
        }

    } catch (error) {
        console.error('Error editando mensaje:', error);
        showToast('❌ Error al editar mensaje', 'error');
    }
}

// ================================================================
// 🗑️ ELIMINAR CONVERSACIÓN
// ================================================================
async function eliminarConversacion(contactoId) {
    if (!confirm('¿Eliminar toda la conversación con este contacto?')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        await supabase
            .from('mensajes_chat')
            .update({ eliminado: true, fecha_eliminacion: new Date().toISOString() })
            .or(`and(remitente_id.eq.${session.user.id},destinatario_id.eq.${contactoId}),and(remitente_id.eq.${contactoId},destinatario_id.eq.${session.user.id})`);

        await supabase
            .from('contactos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (conversacionActual?.id === contactoId) {
            conversacionActual = null;
            document.getElementById('chatNombre').textContent = 'Selecciona una conversación';
            document.getElementById('chatMessages').innerHTML = `
                <div class="empty-chat" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:var(--text-muted);text-align:center;padding:40px 20px;">
                    <span class="icon" style="font-size:2.5rem;display:block;margin-bottom:16px;color:var(--gold);opacity:0.4;font-family:'Orbitron',monospace;">◈</span>
                    <h3 style="font-family:'Orbitron',monospace;color:var(--text-secondary);font-size:1rem;font-weight:400;">Conversación eliminada</h3>
                </div>
            `;
        }

        showToast('🗑️ Conversación eliminada');
        await cargarConversaciones();

    } catch (error) {
        console.error('Error eliminando conversación:', error);
        showToast('❌ Error al eliminar conversación', 'error');
    }
}

// ================================================================
// 👁️ MARCAR MENSAJES COMO LEÍDOS
// ================================================================
async function marcarMensajesLeidos(contactoId) {
    try {
        const session = await getSession();
        if (!session) return;

        await supabase.rpc('marcar_mensajes_leidos', {
            p_remitente_id: contactoId,
            p_destinatario_id: session.user.id
        });

    } catch (error) {
        console.error('Error marcando mensajes como leídos:', error);
    }
}

// ================================================================
// ⚠️ REPORTAR MENSAJE
// ================================================================
async function reportarMensaje(mensajeId) {
    const motivo = prompt('¿Por qué reportas este mensaje? (spam, ofensa, acoso, ilegal)');
    if (!motivo) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para reportar', 'error');
            return;
        }

        const { error } = await supabase
            .from('mensajes_reportes')
            .insert({
                mensaje_id: mensajeId,
                usuario_id: session.user.id,
                motivo: motivo
            });

        if (error) throw error;

        showToast('⚠️ Reporte enviado. Gracias por ayudar.', 'warning');

    } catch (error) {
        console.error('Error reportando mensaje:', error);
        showToast('❌ Error al reportar', 'error');
    }
}

// ================================================================
// 🚫 BLOQUEAR USUARIO
// ================================================================
async function bloquearUsuario(usuarioId) {
    if (!confirm('¿Bloquear a este usuario? No podrán enviarte mensajes.')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        await supabase
            .from('bloqueos')
            .insert({
                usuario_id: session.user.id,
                bloqueado_id: usuarioId
            });

        await supabase
            .from('contactos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', usuarioId);

        showToast('🚫 Usuario bloqueado');

        if (conversacionActual?.id === usuarioId) {
            conversacionActual = null;
            document.getElementById('chatNombre').textContent = 'Selecciona una conversación';
            document.getElementById('chatMessages').innerHTML = `
                <div class="empty-chat" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:var(--text-muted);text-align:center;padding:40px 20px;">
                    <span class="icon" style="font-size:2.