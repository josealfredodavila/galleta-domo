// ================================================================
// MENSAJES - SARIEL'S ECOSYSTEM
// VERSIÓN CORREGIDA - COMPATIBLE CON BACKEND
// ================================================================

// ================================================================
// CONFIGURACIÓN SUPABASE - REUTILIZAR CLIENTE GLOBAL
// ================================================================
let supabase = window.supabase;

if (typeof supabase === 'undefined') {
    console.error('❌ Supabase no está disponible');
}

// ================================================================
// ESCAPE HTML - PREVENCIÓN XSS
// ================================================================
function escapeHTML(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// TOAST NOTIFICACIONES
// ================================================================
function showToast(msg, type = '', duration = 3500) {
    try {
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
        else if (type === 'success') t.classList.add('success');
        else t.classList.remove('error', 'warning', 'success');
        clearTimeout(t._timeout);
        t._timeout = setTimeout(() => t.classList.remove('show'), duration);
    } catch (e) {
        console.warn('Toast no disponible:', e);
        alert(msg);
    }
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    } catch (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
    }
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
// VARIABLES GLOBALES
// ================================================================
let usuarioActual = null;
let conversacionActual = null;
let realtimeChannel = null;
let archivosSeleccionados = [];
let grabacionActiva = false;
let mediaRecorder = null;
let audioChunks = [];

// ================================================================
// FORMATEAR TEXTO (Emojis) - CON ESCAPE HTML
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
        ':sariel:': '◈'
    };
    for (const [key, value] of Object.entries(emojis)) {
        textoFormateado = textoFormateado.replaceAll(key, value);
    }
    return textoFormateado;
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
                <div style="padding:12px;text-align:center;color:#667788;font-size:0.75rem;">
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
            const nombreSanitizado = escapeHTML(usuario.nombre || 'Usuario');
            const handleSanitizado = escapeHTML(usuario.handle || 'usuario');
            const avatarHtml = usuario.avatar_url 
                ? `<img src="${usuario.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` 
                : (usuario.nombre ? nombreSanitizado[0].toUpperCase() : '◈');
            
            return `
                <div class="resultado-item" style="
                    display:flex;align-items:center;gap:10px;padding:8px 12px;
                    border-bottom:1px solid rgba(212,175,55,0.05);
                    transition:all 0.2s;
                ">
                    <div class="avatar" style="
                        width:36px;height:36px;border-radius:50%;
                        background:linear-gradient(135deg,#1a2a1a,#d4af37);
                        display:flex;align-items:center;justify-content:center;
                        color:white;font-size:0.8rem;overflow:hidden;
                    ">
                        ${avatarHtml}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.8rem;">${nombreSanitizado}</div>
                        <div style="font-size:0.6rem;color:#667788;">@${handleSanitizado}</div>
                    </div>
                    ${yaEsContacto ? `
                        <span style="font-size:0.55rem;color:#4ade80;background:rgba(0,214,143,0.1);padding:2px 10px;border-radius:12px;">
                            ✓ Contacto
                        </span>
                    ` : `
                        <button onclick="agregarContacto('${usuario.id}')" style="
                            background:linear-gradient(135deg,#d4af37,#c49a2a);
                            color:#0b0e14;border:none;padding:4px 12px;border-radius:12px;
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
            .maybeSingle();

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
        
        document.getElementById('searchInputModal').value = '';
        document.getElementById('resultadosBusqueda').innerHTML = '';
        cerrarModalNuevoContacto();
        await cargarConversaciones();

    } catch (error) {
        console.error('Error agregando contacto:', error);
        showToast('❌ Error al agregar contacto', 'error');
    }
}

// ================================================================
// 📋 CARGAR CONVERSACIONES (USA EL BACKEND) - CORREGIDO
// ================================================================
async function cargarConversaciones() {
    if (!await verificarAutenticacion()) return;

    try {
        const session = await getSession();
        const response = await fetch('/api/mensajes/conversaciones', {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al cargar conversaciones');

        const conversaciones = result.conversaciones || [];

        const convList = document.getElementById('conversacionesList');
        if (!convList) return;

        if (conversaciones.length === 0) {
            convList.innerHTML = `
                <div style="padding:40px;text-align:center;color:#667788;font-size:0.8rem;">
                    <div style="font-size:2rem;margin-bottom:10px;">◈</div>
                    <p>Sin contactos agregados</p>
                    <p style="font-size:0.6rem;">Busca y agrega contactos arriba</p>
                </div>
            `;
            return;
        }

        convList.innerHTML = conversaciones.map(conv => {
            // ✅ CORREGIDO - NO usar escapeHTML en avatar_url
            const avatar = conv.avatar_url 
                ? `<img src="${conv.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` 
                : (conv.nombre ? conv.nombre[0].toUpperCase() : '✦');
            
            const isActive = conversacionActual?.id === conv.id;
            const nombreSanitizado = escapeHTML(conv.nombre);
            const ultimoMensajeSanitizado = escapeHTML(conv.ultimoMensaje);

            return `
                <div class="conv-item ${isActive ? 'active' : ''}" 
                     data-id="${conv.id}" 
                     onclick="abrirConversacion('${conv.id}')">
                    <div class="conv-avatar">${avatar}</div>
                    <div class="conv-info">
                        <div class="conv-nombre">${nombreSanitizado}</div>
                        <div class="conv-msg">${ultimoMensajeSanitizado.length > 40 ? ultimoMensajeSanitizado.substring(0, 40) + '...' : ultimoMensajeSanitizado}</div>
                    </div>
                    <div class="conv-meta">
                        ${conv.noLeidos > 0 ? `<span class="conv-badge">${conv.noLeidos}</span>` : ''}
                        ${conv.fecha ? `<span class="conv-hora">${new Date(conv.fecha).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error cargando conversaciones:', error);
        showToast('❌ Error al cargar conversaciones', 'error');
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
// 📖 CARGAR MENSAJES (USA EL BACKEND)
// ================================================================
async function cargarMensajes(contactoId) {
    const session = await getSession();
    if (!session) return;

    const container = document.getElementById('chatMessages');
    if (!container) return;

    try {
        const response = await fetch(`/api/mensajes/mensajes/${contactoId}?userId=${session.user.id}`, {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al cargar mensajes');

        const mensajes = result.mensajes || [];

        if (mensajes.length > 0) {
            container.innerHTML = mensajes.map(msg => crearMensajeHTML(msg)).join('');
            container.scrollTop = container.scrollHeight;
        } else {
            container.innerHTML = `
                <div class="empty-chat">
                    <span class="icon">◈</span>
                    <h3>Inicia la conversación</h3>
                    <p>Envía un mensaje para comenzar</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        showToast('❌ Error al cargar mensajes', 'error');
    }
}

// ================================================================
// ✏️ CREAR MENSAJE HTML
// ================================================================
function crearMensajeHTML(msg) {
    const esEnviado = msg.remitente_id === usuarioActual?.id;
    const fecha = new Date(msg.created_at);
    const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const contenidoFormateado = formatearTexto(msg.contenido || '');

    if (msg.tipo === 'imagen' && msg.imagen_url) {
        return crearMensajeImagen(msg, esEnviado, hora);
    }

    if (msg.tipo === 'voz' && msg.imagen_url) {
        return crearMensajeAudio(msg, esEnviado, hora);
    }

    if (esEnviado) {
        return `
            <div class="msg-wrapper enviado">
                <div class="burbuja">${contenidoFormateado}</div>
                <div class="meta">
                    ${hora} ${msg.editado ? '✎' : ''}
                    <span class="leido ${msg.leido ? 'leido' : 'no-leido'}">${msg.leido ? '◆◆' : '◆◇'}</span>
                    <button onclick="eliminarMensaje('${msg.id}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.5rem;">✕</button>
                    <button onclick="editarMensaje('${msg.id}')" style="background:none;border:none;color:#d4af37;cursor:pointer;font-size:0.5rem;">✎</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="msg-wrapper recibido">
            <div class="fila">
                <div class="avatar">◈</div>
                <div class="burbuja">${contenidoFormateado}</div>
            </div>
            <div class="meta">
                ${hora} ${msg.editado ? '✎' : ''}
                <button onclick="reportarMensaje('${msg.id}')" style="background:none;border:none;color:#fbbf24;cursor:pointer;font-size:0.5rem;">⚠️</button>
            </div>
        </div>
    `;
}

function crearMensajeImagen(msg, esEnviado, hora) {
    const imagenUrl = msg.imagen_url; // ✅ NO usar escapeHTML en URLs de imágenes
    if (esEnviado) {
        return `
            <div class="msg-wrapper enviado">
                <div class="burbuja" style="padding:4px;background:transparent;border-radius:12px;">
                    <img src="${imagenUrl}" style="max-width:200px;border-radius:12px;border:2px solid #d4af37;" />
                </div>
                <div class="meta">${hora} ${msg.editado ? '✎' : ''} <span class="leido ${msg.leido ? 'leido' : 'no-leido'}">${msg.leido ? '◆◆' : '◆◇'}</span></div>
            </div>
        `;
    }
    return `
        <div class="msg-wrapper recibido">
            <div class="fila">
                <div class="avatar">◈</div>
                <div class="burbuja" style="padding:4px;background:transparent;border-radius:12px;border:1px solid rgba(212,175,55,0.15);">
                    <img src="${imagenUrl}" style="max-width:200px;border-radius:12px;" />
                </div>
            </div>
            <div class="meta">${hora} ${msg.editado ? '✎' : ''}</div>
        </div>
    `;
}

function crearMensajeAudio(msg, esEnviado, hora) {
    const audioUrl = msg.imagen_url; // ✅ NO usar escapeHTML en URLs de audio
    if (esEnviado) {
        return `
            <div class="msg-wrapper enviado">
                <div class="burbuja" style="display:flex;align-items:center;gap:8px;">
                    <span>🎵</span>
                    <audio controls style="max-width:150px;height:30px;">
                        <source src="${audioUrl}" type="audio/mpeg">
                    </audio>
                </div>
                <div class="meta">${hora} <span class="leido ${msg.leido ? 'leido' : 'no-leido'}">${msg.leido ? '◆◆' : '◆◇'}</span></div>
            </div>
        `;
    }
    return `
        <div class="msg-wrapper recibido">
            <div class="fila">
                <div class="avatar">◈</div>
                <div class="burbuja" style="display:flex;align-items:center;gap:8px;">
                    <span>🎵</span>
                    <audio controls style="max-width:150px;height:30px;">
                        <source src="${audioUrl}" type="audio/mpeg">
                    </audio>
                </div>
            </div>
            <div class="meta">${hora}</div>
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
// 📤 ENVIAR MENSAJE (USA EL BACKEND)
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

        const response = await fetch('/api/mensajes/mensajes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                destinatario_id: conversacionActual.id,
                contenido: contenido,
                tipo: 'texto'
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al enviar mensaje');

        chatInput.value = '';
        await cargarMensajes(conversacionActual.id);
        cargarConversaciones();

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showToast('❌ Error al enviar mensaje', 'error');
    }
}

// ================================================================
// 🖼️ SUBIR ARCHIVO
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

        const response = await fetch('/api/mensajes/mensajes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                destinatario_id: conversacionActual.id,
                contenido: file.name,
                tipo: tipo,
                imagen_url: publicUrl
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al subir archivo');

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
            border-radius:12px;font-size:0.65rem;color:#8899aa;
        `;
        el.innerHTML = `${icon} ${escapeHTML(file.name)} (${size}KB) <span onclick="this.parentElement.remove();archivosSeleccionados=[];" style="cursor:pointer;color:#ef4444;">✕</span>`;
        preview.appendChild(el);
    }

    event.target.value = '';
    showToast(`📎 ${files.length} archivo(s) seleccionado(s)`, 'success');
}

// ================================================================
// 🎙️ GRABACIÓN DE VOZ
// ================================================================
function toggleGrabacionVoz() {
    const btn = document.getElementById('btnGrabarVoz');
    
    if (!grabacionActiva) {
        iniciarGrabacionVoz(btn);
    } else {
        detenerGrabacionVoz(btn);
    }
}

async function iniciarGrabacionVoz(btn) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const file = new File([audioBlob], `voz_${Date.now()}.webm`, { type: 'audio/webm' });
            
            const session = await getSession();
            if (session && conversacionActual) {
                archivosSeleccionados = [file];
                await enviarMensaje();
            }
            
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        grabacionActiva = true;
        btn.textContent = '⏹️';
        btn.style.color = '#ef4444';
        showToast('🎙️ Grabando...', '', 2000);

    } catch (error) {
        console.error('Error iniciando grabación:', error);
        showToast('❌ Error al acceder al micrófono', 'error');
    }
}

function detenerGrabacionVoz(btn) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        grabacionActiva = false;
        btn.textContent = '🎙️';
        btn.style.color = '';
        showToast('✅ Grabación finalizada', 'success');
    }
}

// ================================================================
// 🗑️ ELIMINAR MENSAJE (USA EL BACKEND)
// ================================================================
async function eliminarMensaje(mensajeId) {
    if (!confirm('¿Eliminar este mensaje?')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const response = await fetch(`/api/mensajes/mensajes/${mensajeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al eliminar mensaje');

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
// ✏️ EDITAR MENSAJE (USA EL BACKEND)
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

        const response = await fetch(`/api/mensajes/mensajes/${mensajeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ contenido: nuevoContenido })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al editar mensaje');

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
    if (!contactoId) {
        showToast('⚠️ No hay conversación seleccionada', 'error');
        return;
    }
    
    if (!confirm('¿Eliminar toda la conversación con este contacto?')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        await supabase
            .from('mensajes_chat')
            .update({ eliminado: true })
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
                <div class="empty-chat">
                    <span class="icon">◈</span>
                    <h3>Conversación eliminada</h3>
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

        await supabase
            .from('mensajes_chat')
            .update({ leido: true })
            .eq('remitente_id', contactoId)
            .eq('destinatario_id', session.user.id)
            .eq('leido', false)
            .is('eliminado', false);

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

        const response = await fetch(`/api/mensajes/reportar/${mensajeId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ motivo })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al reportar');

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
    if (!usuarioId) {
        showToast('⚠️ No hay usuario seleccionado', 'error');
        return;
    }
    
    if (!confirm('¿Bloquear a este usuario? No podrán enviarte mensajes.')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const response = await fetch(`/api/mensajes/bloquear/${usuarioId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Error al bloquear');

        showToast('🚫 Usuario bloqueado');

        if (conversacionActual?.id === usuarioId) {
            conversacionActual = null;
            document.getElementById('chatNombre').textContent = 'Selecciona una conversación';
            document.getElementById('chatMessages').innerHTML = `
                <div class="empty-chat">
                    <span class="icon">◈</span>
                    <h3>Usuario bloqueado</h3>
                </div>
            `;
        }

        await cargarConversaciones();

    } catch (error) {
        console.error('Error bloqueando usuario:', error);
        showToast('❌ Error al bloquear usuario', 'error');
    }
}

// ================================================================
// 🔍 BUSCAR EN CONVERSACIÓN (SEGURO)
// ================================================================
async function buscarEnConversacion(query) {
    if (!query || !query.trim()) {
        showToast('⚠️ Escribe algo para buscar', 'warning');
        return;
    }

    if (!conversacionActual) {
        showToast('⚠️ Selecciona una conversación', 'error');
        return;
    }

    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await supabase
            .rpc('buscar_mensajes_seguro', {
                p_usuario_id: session.user.id,
                p_contacto_id: conversacionActual.id,
                p_query: query.trim()
            });

        if (error) throw error;

        const container = document.getElementById('chatMessages');
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-chat">
                    <span class="icon">◈</span>
                    <h3>No se encontraron resultados</h3>
                    <p>No hay mensajes que coincidan con "${escapeHTML(query)}"</p>
                    <button onclick="cargarMensajes('${conversacionActual.id}')" 
                            style="margin-top:12px;padding:8px 20px;background:linear-gradient(135deg,#d4af37,#c49a2a);border:none;border-radius:30px;color:#0b0e14;font-weight:600;cursor:pointer;">
                        Volver
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(msg => crearMensajeHTML(msg)).join('');
        container.scrollTop = container.scrollHeight;
        showToast(`🔍 Encontrados ${data.length} mensajes`, 'success');

    } catch (error) {
        console.error('Error buscando:', error);
        showToast('❌ Error al buscar', 'error');
    }
}

// ================================================================
// ✎ NUEVA CONVERSACIÓN (ABRIR MODAL)
// ================================================================
function nuevaConversacion() {
    document.getElementById('modalNuevoContacto').classList.add('show');
    document.getElementById('searchInputModal').value = '';
    document.getElementById('resultadosBusqueda').innerHTML = `
        <div style="padding:20px;text-align:center;color:#667788;font-size:0.75rem;">
            Escribe al menos 2 caracteres para buscar
        </div>
    `;
    setTimeout(() => {
        document.getElementById('searchInputModal').focus();
    }, 200);
}

function cerrarModalNuevoContacto() {
    document.getElementById('modalNuevoContacto').classList.remove('show');
}

// ================================================================
// LIMPIEZA DE RECURSOS
// ================================================================
function limpiarRecursosMensajes() {
    if (realtimeChannel) {
        try { supabase.removeChannel(realtimeChannel); } catch(e) {}
        realtimeChannel = null;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch(e) {}
    }
    if (audioChunks.length > 0) {
        audioChunks = [];
    }
    archivosSeleccionados = [];
    grabacionActiva = false;
}

window.addEventListener('beforeunload', limpiarRecursosMensajes);

// ================================================================
// 🔄 INICIALIZACIÓN
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    await cargarConversaciones();

    document.getElementById('chatInput')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            enviarMensaje();
        }
    });

    document.getElementById('btnEnviar')?.addEventListener('click', enviarMensaje);

    document.getElementById('searchInput')?.addEventListener('input', function(e) {
        buscarContactos(e.target.value);
    });

    document.getElementById('searchInputModal')?.addEventListener('input', function(e) {
        buscarContactos(e.target.value);
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarModalNuevoContacto();
        }
    });

    console.log('◈ Sariel\'s - Mensajes (Backend integrado)');
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
window.reportarMensaje = reportarMensaje;
window.buscarEnConversacion = buscarEnConversacion;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.agregarContacto = agregarContacto;
window.buscarContactos = buscarContactos;
window.seleccionarArchivo = seleccionarArchivo;
window.handleFileSelect = handleFileSelect;
window.toggleGrabacionVoz = toggleGrabacionVoz;
window.showToast = showToast;
window.limpiarRecursosMensajes = limpiarRecursosMensajes;