/* ================================================================
   MENSAJES.JS - SARIEL'S ECOSYSTEM
   VERSIÓN CORREGIDA Y OPTIMIZADA
   ================================================================ */

'use strict';

/* ================================================================
   SUPABASE
================================================================ */

let supabase = null;
let SUPABASE_READY = false;

async function obtenerSupabase() {
    if (SUPABASE_READY && supabase) {
        return supabase;
    }

    if (typeof window !== 'undefined' && window.supabase) {
        supabase = window.supabase;
        SUPABASE_READY = true;
        return supabase;
    }

    for (let intento = 0; intento < 10; intento++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (typeof window !== 'undefined' && window.supabase) {
            supabase = window.supabase;
            SUPABASE_READY = true;
            return supabase;
        }
    }

    throw new Error('Supabase no está disponible');
}

/* ================================================================
   LOGGER
================================================================ */

const Logger = {
    prefijo: '[Sariel\'s Mensajes]',
    info(...args) { console.info(this.prefijo, ...args); },
    warn(...args) { console.warn(this.prefijo, ...args); },
    error(...args) { console.error(this.prefijo, ...args); }
};

/* ================================================================
   UTILIDADES DOM
================================================================ */

function obtenerElemento(...ids) {
    for (const id of ids) {
        const elemento = document.getElementById(id);
        if (elemento) return elemento;
    }
    return null;
}

/* ================================================================
   PROTECCIÓN XSS & SANITIZACIÓN
================================================================ */

function escapeHTML(valor) {
    if (valor === null || valor === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(valor);
    return div.innerHTML;
}

function sanitizarContenido(texto) {
    if (texto === null || texto === undefined) return '';
    const temporal = document.createElement('div');
    temporal.textContent = String(texto);
    return temporal.innerHTML.replace(/\r\n|\r|\n/g, '<br>');
}

function escaparAtributo(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function urlSegura(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        const parsed = new URL(url, window.location.origin);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        return parsed.href;
    } catch {
        return '';
    }
}

/* ================================================================
   NOTIFICACIONES & CARGA
================================================================ */

function showToast(mensaje, tipo = 'info') {
    let toast = document.getElementById('sarielsToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sarielsToast';
        toast.className = 'sariels-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje || '';
    toast.dataset.tipo = tipo;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

function mostrarLoading(mostrar = true) {
    let loading = document.getElementById('mensajesLoading');
    if (!loading) {
        loading = document.createElement('div');
        loading.id = 'mensajesLoading';
        loading.className = 'mensajes-loading';
        loading.innerHTML = '<div class="mensajes-loading-spinner"></div>';
        document.body.appendChild(loading);
    }
    loading.style.display = mostrar ? 'flex' : 'none';
}

/* ================================================================
   SESSION MANAGER
================================================================ */

const SessionManager = {
    _usuario: null,
    _session: null,
    _cargando: null,

    async obtenerSesion(forzar = false) {
        if (this._session && !forzar) {
            const exp = this._session.expires_at;
            if (exp && exp * 1000 > Date.now() + 5 * 60 * 1000) {
                return this._session;
            }
        }

        if (this._cargando) return this._cargando;

        this._cargando = (async () => {
            const client = await obtenerSupabase();
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            this._session = data?.session || null;
            this._usuario = data?.session?.user || null;
            return this._session;
        })();

        try {
            return await this._cargando;
        } finally {
            this._cargando = null;
        }
    },

    async obtenerUsuario() {
        const session = await this.obtenerSesion();
        return session?.user || null;
    },

    async cerrarSesion() {
        try {
            const client = await obtenerSupabase();
            await client.auth.signOut();
        } catch (error) {
            Logger.error('Error cerrando sesión:', error);
        } finally {
            this._session = null;
            this._usuario = null;
            window.location.href = '/login';
        }
    }
};

/* ================================================================
   PETICIONES API
================================================================ */

async function llamadaAPI(endpoint, options = {}, timeout = 15000) {
    const session = await SessionManager.obtenerSesion();
    if (!session?.access_token) {
        throw new Error('NO_AUTENTICADO');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const headers = {
            ...(options.headers || {}),
            Authorization: `Bearer ${session.access_token}`,
            'X-Requested-With': 'XMLHttpRequest'
        };

        if (options.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(endpoint, {
            ...options,
            headers,
            signal: controller.signal
        });

        if (response.status === 401 || response.status === 403) {
            SessionManager._session = null;
            SessionManager._usuario = null;
            throw new Error('NO_AUTORIZADO');
        }

        let data = null;
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const texto = await response.text();
            try {
                data = JSON.parse(texto);
            } catch {
                data = { success: response.ok, message: texto };
            }
        }

        if (!response.ok) {
            const error = new Error(data?.error || data?.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('La solicitud tardó demasiado');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/* ================================================================
   LIMITADOR DE FRECUENCIA DE PETICIONES
================================================================ */

const FrontRateLimiter = {
    acciones: new Map(),
    permitir(nombre, intervalo = 800) {
        const ahora = Date.now();
        const anterior = this.acciones.get(nombre) || 0;
        if (ahora - anterior < intervalo) return false;
        this.acciones.set(nombre, ahora);
        return true;
    }
};

/* ================================================================
   VALIDACIÓN DE ARCHIVOS
================================================================ */

const FILE_CONFIG = {
    maxSize: 10 * 1024 * 1024,
    mimeTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'
    ],
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'webm', 'ogg', 'wav']
};

function validarArchivo(archivo) {
    if (!archivo) return { valido: false, error: 'Archivo no válido' };

    if (archivo.size > FILE_CONFIG.maxSize) {
        return { valido: false, error: 'El archivo supera el límite de 10 MB' };
    }

    const extension = archivo.name.split('.').pop().toLowerCase();
    if (!FILE_CONFIG.extensions.includes(extension)) {
        return { valido: false, error: 'Tipo de archivo no permitido' };
    }

    if (archivo.type && !FILE_CONFIG.mimeTypes.includes(archivo.type)) {
        return { valido: false, error: 'Formato de archivo no permitido' };
    }

    return { valido: true };
}

/* ================================================================
   ESTADO DEL MÓDULO
================================================================ */

let conversacionActual = null;
let usuarioActual = null;
let canalRealtime = null;
let archivosSeleccionados = [];
let grabandoAudio = false;
let mediaRecorder = null;
let audioChunks = [];

const mensajesCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/* ================================================================
   REALTIME
================================================================ */

function limpiarRealtime() {
    if (canalRealtime && supabase) {
        try {
            supabase.removeChannel(canalRealtime);
        } catch (error) {
            Logger.warn('No se pudo eliminar canal realtime:', error);
        }
    }
    canalRealtime = null;
}

async function crearCanalRealtime(contactoId, onMessage, onUpdate) {
    limpiarRealtime();
    if (!contactoId) return;

    const client = await obtenerSupabase();
    const usuario = await SessionManager.obtenerUsuario();
    if (!usuario) return;

    const nombreCanal = `mensajes-${usuario.id}-${contactoId}-${Date.now()}`;

    const canal = client
        .channel(nombreCanal)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'mensajes_chat' },
            payload => {
                const mensaje = payload.new;
                if (!mensaje) return;

                const pertenece =
                    (mensaje.remitente_id === usuario.id && mensaje.destinatario_id === contactoId) ||
                    (mensaje.remitente_id === contactoId && mensaje.destinatario_id === usuario.id);

                if (pertenece && typeof onMessage === 'function') {
                    onMessage(mensaje);
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'mensajes_chat' },
            payload => {
                const mensaje = payload.new;
                if (!mensaje) return;

                const pertenece =
                    (mensaje.remitente_id === usuario.id && mensaje.destinatario_id === contactoId) ||
                    (mensaje.remitente_id === contactoId && mensaje.destinatario_id === usuario.id);

                if (pertenece && typeof onUpdate === 'function') {
                    onUpdate(mensaje);
                }
            }
        );

    canalRealtime = canal;
    canal.subscribe(status => {
        Logger.info('Realtime status:', status);
    });

    return canal;
}

/* ================================================================
   FORMATEO Y BÚSQUEDA
================================================================ */

function formatearFecha(fecha) {
    if (!fecha) return '';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function formatearTexto(texto) {
    return sanitizarContenido(texto);
}

async function buscarContactos(query) {
    if (!FrontRateLimiter.permitir('buscar-contactos', 300)) return;

    query = typeof query === 'string' ? query.trim() : '';
    const resultados = obtenerElemento('resultadosBusqueda', 'resultadosBusquedaContactos');
    if (!resultados) return;

    if (query.length < 2) {
        resultados.innerHTML = '<p class="mensaje-ayuda">Escribe al menos 2 caracteres para buscar</p>';
        return;
    }

    try {
        const usuario = await SessionManager.obtenerUsuario();
        if (!usuario) return;

        const client = await obtenerSupabase();
        const querySeguro = query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

        const { data, error } = await client
            .from('usuarios')
            .select('id,nombre,handle,avatar_url')
            .or(`nombre.ilike.%${querySeguro}%,handle.ilike.%${querySeguro}%`)
            .neq('id', usuario.id)
            .limit(20);

        if (error) throw error;

        if (!data || data.length === 0) {
            resultados.innerHTML = `
                <div class="sin-resultados">
                    <strong>No se encontraron resultados</strong>
                    <p>No hay usuarios que coincidan con "${escapeHTML(query)}"</p>
                </div>
            `;
            return;
        }

        resultados.innerHTML = data.map(contacto => crearContactoHTML(contacto)).join('');

    } catch (error) {
        Logger.error('Error buscando contactos:', error);
        resultados.innerHTML = '<p class="error">No se pudieron buscar los contactos.</p>';
    }
}

function crearContactoHTML(contacto) {
    const avatar = urlSegura(contacto.avatar_url);
    const nombre = escapeHTML(contacto.nombre || 'Usuario');
    const handle = escapeHTML(contacto.handle ? `@${contacto.handle}` : '');
    const id = escaparAtributo(contacto.id);

    const avatarHTML = avatar
        ? `<img src="${escaparAtributo(avatar)}" alt="${nombre}" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="avatar-placeholder">${escapeHTML((contacto.nombre || 'U').charAt(0).toUpperCase())}</div>`;

    return `
        <div class="contacto-resultado">
            <div class="contacto-avatar">${avatarHTML}</div>
            <div class="contacto-info">
                <strong>${nombre}</strong>
                <span>${handle}</span>
            </div>
            <button type="button" class="btn-agregar-contacto" data-contacto-id="${id}" onclick="agregarContacto('${id}')">
                Agregar
            </button>
        </div>
    `;
}

async function agregarContacto(contactoId) {
    if (!contactoId || !FrontRateLimiter.permitir('agregar-contacto', 1000)) return;

    try {
        const usuario = await SessionManager.obtenerUsuario();
        if (!usuario) throw new Error('No autenticado');

        if (contactoId === usuario.id) {
            showToast('No puedes agregarte a ti mismo', 'warning');
            return;
        }

        const client = await obtenerSupabase();
        const { error } = await client
            .from('contactos')
            .insert({ usuario_id: usuario.id, contacto_id: contactoId, estado: 'activo' });

        if (error) {
            if (error.code === '23505') {
                showToast('Este contacto ya existe', 'info');
                return;
            }
            throw error;
        }

        showToast('Contacto agregado correctamente', 'success');
        await cargarConversaciones();

    } catch (error) {
        Logger.error('Error agregando contacto:', error);
        showToast('No se pudo agregar el contacto', 'error');
    }
}

/* ================================================================
   CARGA DE CONVERSACIONES
================================================================ */

async function cargarConversaciones() {
    const contenedor = obtenerElemento('conversationList', 'conversaciones', 'listaConversaciones');
    if (!contenedor) return;

    try {
        const resultado = await llamadaAPI('/api/mensajes/conversaciones', { method: 'GET' });
        const conversaciones = Array.isArray(resultado?.data)
            ? resultado.data
            : Array.isArray(resultado) ? resultado : [];

        if (conversaciones.length === 0) {
            contenedor.innerHTML = `
                <div class="sin-conversaciones">
                    <p>No tienes conversaciones todavía.</p>
                </div>
            `;
            return;
        }

        contenedor.innerHTML = conversaciones.map(crearConversacionHTML).join('');

    } catch (error) {
        Logger.error('Error cargando conversaciones:', error);
        if (error.message === 'NO_AUTORIZADO') {
            await SessionManager.cerrarSesion();
            return;
        }
        contenedor.innerHTML = '<div class="error">No se pudieron cargar las conversaciones.</div>';
    }
}

function crearConversacionHTML(conversacion) {
    const contacto = conversacion.contacto || conversacion.usuario || conversacion;
    const contactoId = contacto.id || conversacion.contacto_id || conversacion.usuario_id;

    if (!contactoId) return '';

    const nombre = escapeHTML(contacto.nombre || contacto.handle || 'Usuario');
    const ultimoMensaje = escapeHTML(conversacion.ultimo_mensaje || conversacion.ultimoMensaje || '');
    const avatar = urlSegura(contacto.avatar_url);
    const unread = Number(conversacion.mensajes_no_leidos || conversacion.no_leidos || conversacion.unread_count || 0);

    const avatarHTML = avatar
        ? `<img src="${escaparAtributo(avatar)}" alt="${nombre}" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="avatar-placeholder">${escapeHTML((contacto.nombre || 'U').charAt(0).toUpperCase())}</div>`;

    return `
        <button type="button" class="conversation-item" data-contacto-id="${escaparAtributo(contactoId)}" onclick="abrirConversacion('${escaparAtributo(contactoId)}')">
            <div class="conversation-avatar">${avatarHTML}</div>
            <div class="conversation-content">
                <strong>${nombre}</strong>
                <span>${ultimoMensaje}</span>
            </div>
            ${unread > 0 ? `<span class="unread-count">${unread > 99 ? '99+' : unread}</span>` : ''}
        </button>
    `;
}

/* ================================================================
   ABRIR Y RENDERIZAR CHAT
================================================================ */

async function abrirConversacion(contactoId) {
    if (!contactoId) return;

    try {
        const usuario = await SessionManager.obtenerUsuario();
        if (!usuario) throw new Error('No autenticado');

        const client = await obtenerSupabase();
        const { data: contacto, error } = await client
            .from('usuarios')
            .select('id,nombre,handle,avatar_url')
            .eq('id', contactoId)
            .maybeSingle();

        if (error) throw error;
        if (!contacto) {
            showToast('Usuario no encontrado', 'error');
            return;
        }

        conversacionActual = contactoId;
        mostrarCabeceraConversacion(contacto);

        await marcarMensajesLeidos(contactoId);
        await cargarMensajes(contactoId);

        await crearCanalRealtime(
            contactoId,
            mensaje => {
                const safeId = String(mensaje.id || '').replace(/"/g, '\\"');
                const existente = document.querySelector(`[data-message-id="${safeId}"]`);
                if (!existente) {
                    agregarMensajeRealtime(mensaje);
                }
            },
            mensaje => {
                actualizarMensajeEnPantalla(mensaje);
            }
        );

        await cargarConversaciones();

    } catch (error) {
        Logger.error('Error abriendo conversación:', error);
        showToast('No se pudo abrir la conversación', 'error');
    }
}

function mostrarCabeceraConversacion(contacto) {
    const nombre = obtenerElemento('chatUserName', 'nombreContacto', 'conversationUserName');
    const avatar = obtenerElemento('chatUserAvatar', 'avatarContacto', 'conversationAvatar');

    if (nombre) {
        nombre.textContent = contacto.nombre || contacto.handle || 'Usuario';
    }

    if (avatar) {
        const url = urlSegura(contacto.avatar_url);
        if (url) {
            avatar.src = url;
            avatar.style.display = '';
        }
    }
}

async function cargarMensajes(contactoId) {
    const contenedor = obtenerElemento('chatMessages', 'mensajesChat', 'messagesContainer');
    if (!contenedor) return;

    const cache = mensajesCache.get(contactoId);
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        renderizarMensajes(cache.data, contenedor);
        return;
    }

    try {
        contenedor.innerHTML = '<div class="loading-mensajes">Cargando mensajes...</div>';

        const resultado = await llamadaAPI(`/api/mensajes/mensajes/${encodeURIComponent(contactoId)}`, { method: 'GET' });
        const mensajes = Array.isArray(resultado?.data)
            ? resultado.data
            : Array.isArray(resultado?.mensajes)
                ? resultado.mensajes
                : Array.isArray(resultado) ? resultado : [];

        mensajesCache.set(contactoId, { data: mensajes, timestamp: Date.now() });
        renderizarMensajes(mensajes, contenedor);

    } catch (error) {
        Logger.error('Error cargando mensajes:', error);
        contenedor.innerHTML = '<div class="error">No se pudieron cargar los mensajes.</div>';
    }
}

function renderizarMensajes(mensajes, contenedor) {
    if (!mensajes || mensajes.length === 0) {
        contenedor.innerHTML = `
            <div class="sin-mensajes">
                <p>No hay mensajes todavía.</p>
                <span>Inicia la conversación.</span>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = mensajes.map(crearMensajeHTML).join('');
    desplazarChatAlFinal(contenedor);
}

function crearMensajeHTML(mensaje) {
    if (!mensaje) return '';

    const currentUserId = usuarioActual?.id || SessionManager._usuario?.id;
    const propio = mensaje.remitente_id === currentUserId;
    const id = escaparAtributo(mensaje.id);
    const clase = propio ? 'message own' : 'message';
    const eliminado = Boolean(mensaje.eliminado || mensaje.eliminado_at);

    if (eliminado) {
        return `
            <div class="${clase} deleted" data-message-id="${id}">
                <div class="message-content">
                    <em>Este mensaje fue eliminado.</em>
                </div>
            </div>
        `;
    }

    let contenido = '';
    const texto = mensaje.contenido || mensaje.texto || mensaje.mensaje;

    if (texto) {
        contenido += `<div class="message-text">${formatearTexto(texto)}</div>`;
    }

    if (mensaje.imagen_url) {
        const url = urlSegura(mensaje.imagen_url);
        if (url) {
            const tipo = mensaje.tipo || '';
            if (tipo === 'audio' || tipo.startsWith('audio/')) {
                contenido += crearMensajeAudio(mensaje, url);
            } else {
                contenido += crearMensajeImagen(mensaje, url);
            }
        }
    }

    if (!contenido) {
        contenido = '<div class="message-text">Mensaje</div>';
    }

    const fecha = formatearFecha(mensaje.created_at || mensaje.fecha_creacion);
    const editado = mensaje.editado ? '<small class="edited">editado</small>' : '';

    return `
        <div class="${clase}" data-message-id="${id}">
            <div class="message-content">
                ${contenido}
                <div class="message-meta">
                    <time>${escapeHTML(fecha)}</time>
                    ${editado}
                </div>
            </div>
            ${propio ? `
                <div class="message-actions">
                    <button type="button" onclick="editarMensaje('${id}')" aria-label="Editar mensaje">✏️</button>
                    <button type="button" onclick="eliminarMensaje('${id}')" aria-label="Eliminar mensaje">🗑️</button>
                </div>
            ` : ''}
        </div>
    `;
}

function crearMensajeImagen(mensaje, url) {
    return `
        <div class="message-image">
            <img src="${escaparAtributo(url)}" alt="Imagen enviada" loading="lazy" decoding="async" referrerpolicy="no-referrer" onclick="abrirImagen('${escaparAtributo(url)}')">
        </div>
    `;
}

function crearMensajeAudio(mensaje, url) {
    const mime = mensaje.mime_type || mensaje.tipo_mime || (mensaje.imagen_url && mensaje.imagen_url.toLowerCase().includes('.webm') ? 'audio/webm' : 'audio/mpeg');
    return `
        <div class="message-audio">
            <audio controls preload="metadata">
                <source src="${escaparAtributo(url)}" type="${escaparAtributo(mime)}">
                Tu navegador no puede reproducir este audio.
            </audio>
        </div>
    `;
}

function abrirImagen(url) {
    const segura = urlSegura(url);
    if (!segura) return;

    let modal = document.getElementById('modalImagenMensaje');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalImagenMensaje';
        modal.className = 'modal-imagen-mensaje';
        modal.innerHTML = `
            <button type="button" class="cerrar-modal-imagen" aria-label="Cerrar">×</button>
            <img alt="Imagen">
        `;
        modal.addEventListener('click', event => {
            if (event.target === modal || event.target.classList.contains('cerrar-modal-imagen')) {
                modal.classList.remove('show');
            }
        });
        document.body.appendChild(modal);
    }

    modal.querySelector('img').src = segura;
    modal.classList.add('show');
}

function desplazarChatAlFinal(contenedor) {
    if (!contenedor) return;
    requestAnimationFrame(() => {
        contenedor.scrollTop = contenedor.scrollHeight;
    });
}

function agregarMensajeRealtime(mensaje) {
    if (!conversacionActual || !mensaje) return;

    const currentUserId = usuarioActual?.id || SessionManager._usuario?.id;
    const pertenece =
        (mensaje.remitente_id === currentUserId && mensaje.destinatario_id === conversacionActual) ||
        (mensaje.remitente_id === conversacionActual && mensaje.destinatario_id === currentUserId);

    if (!pertenece) return;

    const contenedor = obtenerElemento('chatMessages', 'mensajesChat', 'messagesContainer');
    if (!contenedor) return;

    const id = String(mensaje.id || '');
    if (!id) return;

    const safeId = id.replace(/"/g, '\\"');
    if (contenedor.querySelector(`[data-message-id="${safeId}"]`)) return;

    const vacio = contenedor.querySelector('.sin-mensajes');
    if (vacio) vacio.remove();

    contenedor.insertAdjacentHTML('beforeend', crearMensajeHTML(mensaje));
    desplazarChatAlFinal(contenedor);
    mensajesCache.delete(conversacionActual);
}

function actualizarMensajeEnPantalla(mensaje) {
    if (!mensaje?.id) return;
    const safeId = String(mensaje.id).replace(/"/g, '\\"');
    const elemento = document.querySelector(`[data-message-id="${safeId}"]`);
    if (!elemento) return;

    elemento.outerHTML = crearMensajeHTML(mensaje);
    if (conversacionActual) {
        mensajesCache.delete(conversacionActual);
    }
}

/* ================================================================
   ENVÍO Y GESTIÓN DE ARCHIVOS
================================================================ */

async function enviarMensaje() {
    if (!FrontRateLimiter.permitir('enviar-mensaje', 250)) return;

    if (!conversacionActual) {
        showToast('Selecciona una conversación', 'warning');
        return;
    }

    const input = obtenerElemento('messageInput', 'mensajeInput', 'chatInput');
    const texto = input ? input.value.trim() : '';

    if (!texto && archivosSeleccionados.length === 0) return;

    try {
        const session = await SessionManager.obtenerSesion();
        if (!session) throw new Error('No autenticado');

        if (archivosSeleccionados.length > 0) {
            const archivos = [...archivosSeleccionados];
            for (const archivo of archivos) {
                await subirArchivo(archivo, session);
            }
            archivosSeleccionados = [];
            actualizarVistaArchivos();
        }

        if (texto) {
            await llamadaAPI('/api/mensajes/mensajes', {
                method: 'POST',
                body: JSON.stringify({
                    destinatario_id: conversacionActual,
                    contenido: texto
                })
            });
        }

        if (input) input.value = '';
        actualizarContadorCaracteres();
        mensajesCache.delete(conversacionActual);

        await cargarMensajes(conversacionActual);
        await cargarConversaciones();

    } catch (error) {
        Logger.error('Error enviando mensaje:', error);
        showToast(error.message || 'No se pudo enviar el mensaje', 'error');
    }
}

async function subirArchivo(archivo, session) {
    const validacion = validarArchivo(archivo);
    if (!validacion.valido) throw new Error(validacion.error);
    if (!session?.user?.id) throw new Error('Sesión no válida');

    const client = await obtenerSupabase();
    const extension = archivo.name.split('.').pop().toLowerCase();
    const nombreArchivo = `${session.user.id}/${cryptoRandomId()}.${extension}`;

    const { error: uploadError } = await client.storage
        .from('mensajes')
        .upload(nombreArchivo, archivo, {
            cacheControl: '3600',
            upsert: false,
            contentType: archivo.type || undefined
        });

    if (uploadError) throw uploadError;

    const { data: publicData } = client.storage
        .from('mensajes')
        .getPublicUrl(nombreArchivo);

    const publicUrl = publicData?.publicUrl;
    if (!publicUrl) throw new Error('No se pudo obtener la URL del archivo');

    await llamadaAPI('/api/mensajes/mensajes', {
        method: 'POST',
        body: JSON.stringify({
            destinatario_id: conversacionActual,
            contenido: '',
            imagen_url: publicUrl,
            tipo: archivo.type || 'archivo',
            mime_type: archivo.type || null
        })
    });
}

function cryptoRandomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function handleFileSelect(event) {
    const archivos = Array.from(event.target.files || []);
    if (archivos.length === 0) return;

    for (const archivo of archivos) {
        const validacion = validarArchivo(archivo);
        if (!validacion.valido) {
            showToast(`${archivo.name}: ${validacion.error}`, 'error');
            continue;
        }

        const duplicado = archivosSeleccionados.some(
            existente => existente.name === archivo.name && existente.size === archivo.size && existente.lastModified === archivo.lastModified
        );

        if (!duplicado) {
            archivosSeleccionados.push(archivo);
        }
    }

    actualizarVistaArchivos();
    event.target.value = '';
}

function actualizarVistaArchivos() {
    const contenedor = obtenerElemento('archivosSeleccionados', 'selectedFiles');
    if (!contenedor) return;

    if (archivosSeleccionados.length === 0) {
        contenedor.innerHTML = '';
        return;
    }

    contenedor.innerHTML = archivosSeleccionados.map((archivo, indice) => `
        <div class="archivo-seleccionado" data-file-index="${indice}">
            <span>${escapeHTML(archivo.name)}</span>
            <button type="button" onclick="removerArchivo(${indice})" aria-label="Eliminar archivo">×</button>
        </div>
    `).join('');
}

function removerArchivo(indice) {
    if (indice < 0 || indice >= archivosSeleccionados.length) return;
    archivosSeleccionados.splice(indice, 1);
    actualizarVistaArchivos();
}

/* ================================================================
   GRABACIÓN DE AUDIO
================================================================ */

async function iniciarGrabacionAudio() {
    if (grabandoAudio) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Tu navegador no permite grabar audio', 'error');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let mimeType = '';
        const formatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

        for (const formato of formatos) {
            if (MediaRecorder.isTypeSupported(formato)) {
                mimeType = formato;
                break;
            }
        }

        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            try {
                const tipo = mediaRecorder.mimeType || 'audio/webm';
                const extension = tipo.includes('ogg') ? 'ogg' : 'webm';
                const blob = new Blob(audioChunks, { type: tipo });
                const archivo = new File([blob], `audio-${Date.now()}.${extension}`, { type: tipo });

                archivosSeleccionados.push(archivo);
                await enviarMensaje();
            } catch (error) {
                Logger.error('Error procesando grabación:', error);
                showToast('No se pudo enviar el audio', 'error');
            } finally {
                stream.getTracks().forEach(track => track.stop());
                audioChunks = [];
                mediaRecorder = null;
                grabandoAudio = false;
                actualizarEstadoGrabacion();
            }
        };

        mediaRecorder.start();
        grabandoAudio = true;
        actualizarEstadoGrabacion();

    } catch (error) {
        Logger.error('Error iniciando grabación:', error);
        showToast('No se pudo acceder al micrófono', 'error');
    }
}

function detenerGrabacionAudio() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    mediaRecorder.stop();
}

function actualizarEstadoGrabacion() {
    const boton = obtenerElemento('btnGrabarAudio', 'recordButton', 'btnAudio');
    if (!boton) return;

    if (grabandoAudio) {
        boton.classList.add('grabando');
        boton.setAttribute('aria-label', 'Detener grabación');
        boton.textContent = '⏹️';
    } else {
        boton.classList.remove('grabando');
        boton.setAttribute('aria-label', 'Grabar audio');
        boton.textContent = '🎤';
    }
}

async function toggleGrabacionAudio() {
    if (grabandoAudio) {
        detenerGrabacionAudio();
    } else {
        await iniciarGrabacionAudio();
    }
}

/* ================================================================
   ACCIONES DE MENSAJES Y CONVERSACIONES
================================================================ */

async function eliminarMensaje(mensajeId) {
    if (!mensajeId) return;
    if (!confirm('¿Seguro que deseas eliminar este mensaje?')) return;

    try {
        await llamadaAPI(`/api/mensajes/mensajes/${encodeURIComponent(mensajeId)}`, { method: 'DELETE' });
        showToast('Mensaje eliminado', 'success');

        if (conversacionActual) {
            mensajesCache.delete(conversacionActual);
            await cargarMensajes(conversacionActual);
        }
    } catch (error) {
        Logger.error('Error eliminando mensaje:', error);
        showToast('No se pudo eliminar el mensaje', 'error');
    }
}

async function editarMensaje(mensajeId) {
    if (!mensajeId) return;

    const safeId = String(mensajeId).replace(/"/g, '\\"');
    const elemento = document.querySelector(`[data-message-id="${safeId}"]`);
    if (!elemento) return;

    const actual = elemento.querySelector('.message-text')?.textContent?.trim();
    const nuevo = prompt('Editar mensaje:', actual || '');

    if (nuevo === null) return;
    const contenido = nuevo.trim();

    if (!contenido) {
        showToast('El mensaje no puede quedar vacío', 'warning');
        return;
    }

    try {
        await llamadaAPI(`/api/mensajes/mensajes/${encodeURIComponent(mensajeId)}`, {
            method: 'PUT',
            body: JSON.stringify({ contenido })
        });

        showToast('Mensaje editado', 'success');
        if (conversacionActual) {
            mensajesCache.delete(conversacionActual);
            await cargarMensajes(conversacionActual);
        }
    } catch (error) {
        Logger.error('Error editando mensaje:', error);
        showToast('No se pudo editar el mensaje', 'error');
    }
}

async function eliminarConversacion() {
    if (!conversacionActual) {
        showToast('No hay una conversación seleccionada', 'warning');
        return;
    }

    if (!confirm('¿Seguro que deseas eliminar esta conversación?')) return;

    try {
        await llamadaAPI(`/api/mensajes/conversaciones/${encodeURIComponent(conversacionActual)}`, { method: 'DELETE' });

        mensajesCache.delete(conversacionActual);
        conversacionActual = null;
        limpiarRealtime();

        const chat = obtenerElemento('chatMessages', 'mensajesChat', 'messagesContainer');
        if (chat) {
            chat.innerHTML = '<div class="sin-conversacion"><p>Selecciona una conversación.</p></div>';
        }

        await cargarConversaciones();
        showToast('Conversación eliminada', 'success');

    } catch (error) {
        Logger.error('Error eliminando conversación:', error);
        showToast('No se pudo eliminar la conversación', 'error');
    }
}

async function marcarMensajesLeidos(contactoId) {
    if (!contactoId) return;

    try {
        await llamadaAPI('/api/mensajes/mensajes/leer', {
            method: 'PATCH',
            body: JSON.stringify({ remitente_id: contactoId })
        });
        mensajesCache.delete(contactoId);
    } catch (error) {
        Logger.warn('No se pudieron marcar mensajes como leídos:', error);
    }
}

async function reportarMensaje(mensajeId) {
    if (!mensajeId) return;
    const motivo = prompt('Indica el motivo del reporte:');
    if (!motivo || !motivo.trim()) return;

    try {
        await llamadaAPI(`/api/mensajes/reportar/${encodeURIComponent(mensajeId)}`, {
            method: 'POST',
            body: JSON.stringify({ motivo: motivo.trim() })
        });
        showToast('Mensaje reportado correctamente', 'success');
    } catch (error) {
        Logger.error('Error reportando mensaje:', error);
        showToast('No se pudo reportar el mensaje', 'error');
    }
}

async function bloquearUsuario(usuarioId) {
    if (!usuarioId) return;
    if (!confirm('¿Seguro que deseas bloquear a este usuario?')) return;

    try {
        await llamadaAPI(`/api/mensajes/bloquear/${encodeURIComponent(usuarioId)}`, { method: 'POST' });
        showToast('Usuario bloqueado', 'success');

        if (conversacionActual === usuarioId) {
            conversacionActual = null;
            limpiarRealtime();
        }

        await cargarConversaciones();
    } catch (error) {
        Logger.error('Error bloqueando usuario:', error);
        showToast('No se pudo bloquear al usuario', 'error');
    }
}

async function buscarEnConversacion(query) {
    if (!conversacionActual) {
        showToast('Selecciona una conversación', 'warning');
        return;
    }

    query = typeof query === 'string' ? query.trim() : '';

    if (!query) {
        await cargarMensajes(conversacionActual);
        return;
    }

    try {
        const resultado = await llamadaAPI(`/api/mensajes/mensajes/${encodeURIComponent(conversacionActual)}?search=${encodeURIComponent(query)}`, { method: 'GET' });
        const mensajes = Array.isArray(resultado?.data) ? resultado.data : [];
        const contenedor = obtenerElemento('chatMessages', 'mensajesChat', 'messagesContainer');

        if (!contenedor) return;

        if (mensajes.length === 0) {
            contenedor.innerHTML = `
                <div class="sin-resultados">
                    <strong>No se encontraron resultados</strong>
                    <p>No hay mensajes que coincidan con "${escapeHTML(query)}"</p>
                    <button type="button" onclick="cargarMensajes('${escaparAtributo(conversacionActual)}')">Volver</button>
                </div>
            `;
            return;
        }

        renderizarMensajes(mensajes, contenedor);

    } catch (error) {
        Logger.error('Error buscando mensajes:', error);
        try {
            const cache = mensajesCache.get(conversacionActual);
            if (cache?.data) {
                const encontrados = cache.data.filter(mensaje =>
                    String(mensaje.contenido || mensaje.texto || '').toLowerCase().includes(query.toLowerCase())
                );
                const contenedor = obtenerElemento('chatMessages', 'mensajesChat', 'messagesContainer');
                renderizarMensajes(encontrados, contenedor);
            }
        } catch (fallbackError) {
            Logger.error('Error en búsqueda local:', fallbackError);
        }
    }
}

/* ================================================================
   MODALES Y CONTADORES
================================================================ */

function nuevaConversacion() {
    const modal = obtenerElemento('modalNuevoContacto');
    if (!modal) return;

    const input = obtenerElemento('searchInputModal');
    const resultados = obtenerElemento('resultadosBusqueda');

    if (resultados) resultados.innerHTML = '';
    modal.classList.add('show');

    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 200);
    }
}

function cerrarModalNuevoContacto() {
    const modal = obtenerElemento('modalNuevoContacto');
    if (modal) modal.classList.remove('show');
}

function actualizarContadorCaracteres() {
    const input = obtenerElemento('messageInput', 'mensajeInput', 'chatInput');
    const contador = obtenerElemento('charCounter', 'contadorCaracteres');

    if (!input || !contador) return;
    contador.textContent = `${input.value.length}/2000`;
}

function limpiarMensajeria() {
    limpiarRealtime();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch {}
    }
    mediaRecorder = null;
    grabandoAudio = false;
    archivosSeleccionados = [];
    mensajesCache.clear();
    conversacionActual = null;
}

/* ================================================================
   INICIALIZACIÓN DE EVENTOS DOM
================================================================ */

document.addEventListener('DOMContentLoaded', async () => {
    Logger.info('Inicializando módulo de mensajes...');

    try {
        usuarioActual = await SessionManager.obtenerUsuario();
        if (usuarioActual) {
            await cargarConversaciones();
        } else {
            Logger.warn('No existe sesión activa');
        }
    } catch (error) {
        Logger.error('Error inicializando mensajería:', error);
    }

    const input = obtenerElemento('messageInput', 'mensajeInput', 'chatInput');
    if (input) {
        input.addEventListener('input', actualizarContadorCaracteres);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                enviarMensaje();
            }
        });
    }

    const botonEnviar = obtenerElemento('sendMessageButton', 'btnEnviarMensaje', 'sendButton');
    if (botonEnviar) botonEnviar.addEventListener('click', enviarMensaje);

    const botonAudio = obtenerElemento('btnGrabarAudio', 'recordButton', 'btnAudio');
    if (botonAudio) botonAudio.addEventListener('click', toggleGrabacionAudio);

    const fileInput = obtenerElemento('fileInput', 'archivoInput', 'inputArchivo');
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);

    const searchInput = obtenerElemento('searchInputModal');
    if (searchInput) {
        searchInput.addEventListener('input', event => buscarContactos(event.target.value));
        searchInput.addEventListener('keydown', event => {
            if (event.key === 'Escape') cerrarModalNuevoContacto();
        });
    }

    const searchConversation = obtenerElemento('searchConversationInput', 'buscarConversacionInput');
    if (searchConversation) {
        searchConversation.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                buscarEnConversacion(event.target.value);
            }
        });
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') cerrarModalNuevoContacto();
    });

    const modal = obtenerElemento('modalNuevoContacto');
    if (modal) {
        modal.addEventListener('click', event => {
            if (event.target === modal) cerrarModalNuevoContacto();
        });
    }

    try {
        const client = await obtenerSupabase();
        client.auth.onAuthStateChange((event, session) => {
            SessionManager._session = session || null;
            SessionManager._usuario = session?.user || null;
            usuarioActual = session?.user || null;

            if (event === 'SIGNED_OUT') {
                limpiarMensajeria();
                window.location.href = '/login';
            }
        });
    } catch (error) {
        Logger.warn('No se pudo registrar listener de Auth:', error);
    }

    actualizarContadorCaracteres();
    Logger.info('Módulo de mensajes inicializado correctamente');
});

window.addEventListener('beforeunload', () => {
    limpiarMensajeria();
});

/* ================================================================
   EXPORTACIÓN AL ÁMBITO GLOBAL
================================================================ */

window.cargarConversaciones = cargarConversaciones;
window.buscarContactos = buscarContactos;
window.agregarContacto = agregarContacto;
window.abrirConversacion = abrirConversacion;
window.cargarMensajes = cargarMensajes;
window.enviarMensaje = enviarMensaje;
window.subirArchivo = subirArchivo;
window.handleFileSelect = handleFileSelect;
window.removerArchivo = removerArchivo;
window.iniciarGrabacionAudio = iniciarGrabacionAudio;
window.detenerGrabacionAudio = detenerGrabacionAudio;
window.toggleGrabacionAudio = toggleGrabacionAudio;
window.eliminarMensaje = eliminarMensaje;
window.editarMensaje = editarMensaje;
window.eliminarConversacion = eliminarConversacion;
window.marcarMensajesLeidos = marcarMensajesLeidos;
window.reportarMensaje = reportarMensaje;
window.bloquearUsuario = bloquearUsuario;
window.buscarEnConversacion = buscarEnConversacion;
window.nuevaConversacion = nuevaConversacion;
window.cerrarModalNuevoContacto = cerrarModalNuevoContacto;
window.abrirImagen = abrirImagen;
window.showToast = showToast;
window.formatearTexto = formatearTexto;
