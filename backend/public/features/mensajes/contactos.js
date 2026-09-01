/* ================================================================
   CONTACTOS - SARIEL'S ECOSYSTEM
   VERSIÓN REFACTORIZADA - SINGLETON + RESOURCE MANAGER
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - SINGLETON GLOBAL
// ================================================================
const supabaseClient = window.supabaseClient;

// Verificar que el singleton existe
if (!supabaseClient) {
    console.error('❌ Supabase Client no inicializado. Cargando app.js primero.');
    window.location.reload();
}

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let contactos = [];
let contactosFiltrados = [];
let filtroActual = 'todos';
let usuarioActual = null;
let canalContactos = null;
let modoOscuro = true;

// ================================================================
// NOTA: showToast(), getSession(), escapeHTML() ESTÁN EN app.js
// ================================================================

// ================================================================
// VERIFICAR AUTENTICACIÓN
// ================================================================
async function verificarAutenticacion() {
    const session = await window.getSession();
    if (!session) {
        window.showToast('⚠️ Inicia sesión para ver contactos', 'warning');
        return false;
    }
    usuarioActual = session.user;
    return true;
}

// ================================================================
// ACTUALIZAR ESTADO ONLINE
// ================================================================
async function actualizarOnline(online) {
    try {
        const session = await window.getSession();
        if (!session) return;

        const { error } = await supabaseClient
            .from('usuarios')
            .update({
                online: online,
                ultima_conexion: online ? new Date().toISOString() : new Date().toISOString()
            })
            .eq('id', session.user.id);

        if (error) throw error;

        if (usuarioActual) {
            usuarioActual.online = online;
        }
    } catch (error) {
        console.error('Error actualizando estado online:', error);
    }
}

// ================================================================
// CARGAR CONTACTOS
// ================================================================
async function cargarContactos() {
    try {
        if (!await verificarAutenticacion()) {
            mostrarSinContactos();
            return;
        }

        const { data, error } = await supabaseClient
            .from('contactos')
            .select(`
                id,
                contacto_id,
                estado,
                es_favorito,
                created_at,
                usuarios:contacto_id (
                    id,
                    nombre,
                    handle,
                    avatar_url,
                    online,
                    ultima_conexion,
                    verificado
                )
            `)
            .eq('usuario_id', usuarioActual.id)
            .eq('estado', 'activo');

        if (error) throw error;

        if (!data || data.length === 0) {
            mostrarSinContactos();
            contactos = [];
            actualizarContadores();
            aplicarFiltros();
            return;
        }

        contactos = data.map(c => {
            const usuario = c.usuarios || {};
            return {
                _id: c.contacto_id,
                nombre: usuario.nombre || 'Usuario',
                handle: usuario.handle || '',
                avatar_url: usuario.avatar_url || null,
                online: usuario.online || false,
                ultima_conexion: usuario.ultima_conexion || null,
                esFavorito: c.es_favorito || false,
                verificado: usuario.verificado || false,
                estado_relacion: c.estado || 'activo'
            };
        });

        actualizarContadores();
        aplicarFiltros();
        iniciarEscuchaContactos();

    } catch (error) {
        console.error('Error cargando contactos:', error);
        mostrarSinContactos();
    }
}

// ================================================================
// MOSTRAR SIN CONTACTOS
// ================================================================
function mostrarSinContactos() {
    const contactosListEl = document.getElementById('contactosList');
    if (contactosListEl) {
        contactosListEl.innerHTML = `
            <div class="empty-state">
                <span class="icon">◈</span>
                <h3>Sin contactos</h3>
                <p>Comienza a agregar personas a tu red</p>
                <button class="btn-accion" onclick="abrirAgregarContacto()">◈ Agregar contacto</button>
            </div>
        `;
    }
}

// ================================================================
// 🔥 INICIAR ESCUCHA DE CONTACTOS (REALTIME) - CON REGISTER CHANNEL (REGLA D)
// ================================================================
function iniciarEscuchaContactos() {
    // ✅ LIMPIAR CANAL ANTERIOR
    if (canalContactos) {
        try {
            supabaseClient.removeChannel(canalContactos);
        } catch (e) {
            console.warn('Error removiendo canal contactos:', e);
        }
        canalContactos = null;
    }

    canalContactos = supabaseClient
        .channel('contactos-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'contactos',
            filter: `usuario_id=eq.${usuarioActual?.id}`
        }, () => {
            cargarContactos();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'usuarios'
        }, (payload) => {
            const usuario = payload.new;
            const contacto = contactos.find(c => c._id === usuario.id);
            if (contacto) {
                contacto.online = usuario.online || false;
                contacto.ultima_conexion = usuario.ultima_conexion;
                actualizarContadores();
                aplicarFiltros();
            }
        })
        .subscribe();

    // ✅ REGISTRAR CANAL CON RESOURCE MANAGER
    window.registerSupabaseChannel(canalContactos, 'contactos_realtime');
}

// ================================================================
// ACTUALIZAR CONTADORES
// ================================================================
function actualizarContadores() {
    const total = contactos.length;
    const online = contactos.filter(c => c.online).length;

    const totalContactosEl = document.getElementById('totalContactos');
    const onlineContactosEl = document.getElementById('onlineContactos');

    if (totalContactosEl) totalContactosEl.textContent = total;
    if (onlineContactosEl) onlineContactosEl.textContent = online;
}

// ================================================================
// FORMATEAR TIEMPO
// ================================================================
function formatearTiempo(fecha) {
    if (!fecha) return 'Desconectado';
    const ahora = new Date();
    const entonces = new Date(fecha);
    const diffMs = ahora - entonces;
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffMin < 1440) return `hace ${Math.floor(diffMin / 60)} h`;
    return `hace ${Math.floor(diffMin / 1440)} d`;
}

// ================================================================
// RENDERIZAR CONTACTOS - CON ESCAPE HTML
// ================================================================
function renderizarContactos(lista) {
    const contactosListEl = document.getElementById('contactosList');
    if (!contactosListEl) return;

    if (!lista || lista.length === 0) {
        mostrarSinContactos();
        return;
    }

    contactosListEl.innerHTML = lista.map(contacto => {
        const esOnline = contacto.online === true;
        const esFavorito = contacto.esFavorito || false;
        const inicial = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';
        const estadoTexto = esOnline ? '◉ En línea' : `◈ ${formatearTiempo(contacto.ultima_conexion)}`;
        const nombreSanitizado = window.escapeHTML(contacto.nombre || 'Usuario');
        const handleSanitizado = window.escapeHTML(contacto.handle || 'usuario');
        const idSanitizado = window.escapeHTML(contacto._id);
        const avatarSanitizado = contacto.avatar_url ? window.escapeHTML(contacto.avatar_url) : '';

        return `
            <div class="contacto-card" data-id="${idSanitizado}">
                <div class="contacto-avatar ${esOnline ? 'online' : 'offline'} ${esFavorito ? 'favorito' : ''}">
                    ${avatarSanitizado ? `<img src="${avatarSanitizado}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : inicial}
                    ${esOnline ? '<span class="online-dot"></span>' : ''}
                    ${esFavorito ? '<span class="favorito-badge">◆</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">
                        ${nombreSanitizado}
                        ${contacto.verificado ? '<span class="verified">✦ VERIFICADO</span>' : ''}
                    </div>
                    <div class="estado ${esOnline ? 'online' : 'offline'}">
                        ${estadoTexto}
                    </div>
                    <div class="contacto-meta">
                        <span>@${handleSanitizado}</span>
                    </div>
                </div>
                <div class="contacto-actions">
                    <button class="mensaje" onclick="irAMensajes('${idSanitizado}')" title="Enviar mensaje">◈</button>
                    <button class="favorito ${esFavorito ? 'active' : ''}" onclick="toggleFavorito('${idSanitizado}')" title="Favorito">◆</button>
                    <button class="bloquear" onclick="bloquearContacto('${idSanitizado}')" title="Bloquear">🚫</button>
                    <button class="eliminar" onclick="eliminarContacto('${idSanitizado}')" title="Eliminar">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// APLICAR FILTROS
// ================================================================
function aplicarFiltros() {
    const searchInputEl = document.getElementById('searchInput');
    const query = searchInputEl ? searchInputEl.value.toLowerCase().trim() : '';

    contactosFiltrados = contactos.filter(c => {
        const matchNombre = c.nombre?.toLowerCase().includes(query) || false;
        const matchHandle = c.handle?.toLowerCase().includes(query) || false;
        const matchBusqueda = matchNombre || matchHandle;

        let matchFiltro = true;
        if (filtroActual === 'online') {
            matchFiltro = c.online === true;
        } else if (filtroActual === 'favoritos') {
            matchFiltro = c.esFavorito === true;
        } else if (filtroActual === 'recientes') {
            matchFiltro = true;
        }

        return matchBusqueda && matchFiltro;
    });

    renderizarContactos(contactosFiltrados);
}

// ================================================================
// 🔍 BUSCAR USUARIOS
// ================================================================
async function buscarUsuarios(query) {
    if (!query || query.length < 2) {
        document.getElementById('resultadosBusqueda').innerHTML = '';
        return;
    }

    try {
        const session = await window.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('id, nombre, handle, avatar_url, online')
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

        const { data: contactosExistentes } = await supabaseClient
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);

        const idsExistentes = contactosExistentes?.map(c => c.contacto_id) || [];

        container.innerHTML = data.map(usuario => {
            const yaEsContacto = idsExistentes.includes(usuario.id);
            const estaOnline = usuario.online || false;
            const nombreSanitizado = window.escapeHTML(usuario.nombre || 'Usuario');
            const handleSanitizado = window.escapeHTML(usuario.handle || 'usuario');
            const avatarSanitizado = usuario.avatar_url ? window.escapeHTML(usuario.avatar_url) : '';
            const idSanitizado = window.escapeHTML(usuario.id);

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
                        border:2px solid ${estaOnline ? 'var(--success)' : 'var(--text-muted)'};
                        position:relative;
                    ">
                        ${avatarSanitizado ? `<img src="${avatarSanitizado}" style="width:100%;height:100%;object-fit:cover;">` : (usuario.nombre ? nombreSanitizado[0].toUpperCase() : '◈')}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.8rem;">${nombreSanitizado}</div>
                        <div style="font-size:0.6rem;color:var(--text-muted);">@${handleSanitizado} ${estaOnline ? '· 🟢 En línea' : ''}</div>
                    </div>
                    ${yaEsContacto ? `
                        <span style="font-size:0.55rem;color:var(--success);background:rgba(0,214,143,0.1);padding:2px 10px;border-radius:12px;">
                            ✓ Contacto
                        </span>
                    ` : `
                        <button onclick="agregarContacto('${idSanitizado}')" style="
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
        console.error('Error buscando usuarios:', error);
    }
}

// ================================================================
// ➕ AGREGAR CONTACTO
// ================================================================
async function agregarContacto(contactoId) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para agregar contactos', 'error');
            return;
        }

        const { data: existe } = await supabaseClient
            .from('contactos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId)
            .maybeSingle();

        if (existe) {
            window.showToast('⚠️ Este usuario ya es tu contacto', 'warning');
            return;
        }

        const { error } = await supabaseClient
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: contactoId,
                estado: 'activo',
                es_favorito: false
            });

        if (error) throw error;

        window.showToast('✅ Contacto agregado correctamente', 'success');
        
        document.getElementById('searchInputModal').value = '';
        document.getElementById('resultadosBusqueda').innerHTML = '';
        cerrarModalBuscar();
        await cargarContactos();

    } catch (error) {
        console.error('Error agregando contacto:', error);
        window.showToast('❌ Error al agregar contacto', 'error');
    }
}

// ================================================================
// 🚫 BLOQUEAR CONTACTO
// ================================================================
async function bloquearContacto(contactoId) {
    if (!confirm('¿Bloquear a este usuario? No podrán enviarte mensajes ni ver tu perfil.')) return;

    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('bloqueos')
                .insert({
                    usuario_id: session.user.id,
                    bloqueado_id: contactoId
                });

            if (error) {
                if (error.code === '42P01') {
                    window.showToast('⚠️ La tabla de bloqueos no está configurada', 'warning');
                    return;
                }
                throw error;
            }
        } catch (insertError) {
            console.error('Error insertando bloqueo:', insertError);
            window.showToast('❌ Error al bloquear usuario', 'error');
            return;
        }

        await supabaseClient
            .from('contactos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        contactos = contactos.filter(c => c._id !== contactoId);
        actualizarContadores();
        aplicarFiltros();
        window.showToast('🚫 Usuario bloqueado', 'warning');

    } catch (error) {
        console.error('Error bloqueando usuario:', error);
        window.showToast('❌ Error al bloquear usuario', 'error');
    }
}

// ================================================================
// 🔓 DESBLOQUEAR USUARIO
// ================================================================
async function desbloquearUsuario(contactoId) {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabaseClient
            .from('bloqueos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('bloqueado_id', contactoId);

        if (error) {
            if (error.code === '42P01') {
                window.showToast('⚠️ La tabla de bloqueos no está configurada', 'warning');
                return;
            }
            throw error;
        }

        window.showToast('✅ Usuario desbloqueado', 'success');
        await cargarContactos();

    } catch (error) {
        console.error('Error desbloqueando usuario:', error);
        window.showToast('❌ Error al desbloquear', 'error');
    }
}

// ================================================================
// 📨 IR A MENSAJES
// ================================================================
function irAMensajes(contactoId) {
    window.location.href = `/features/mensajes/mensajes.html?contacto=${contactoId}`;
}

// ================================================================
// ◆ TOGGLE FAVORITO
// ================================================================
async function toggleFavorito(contactoId) {
    const session = await window.getSession();
    if (!session) {
        window.showToast('⚠️ Inicia sesión para marcar favoritos', 'error');
        return;
    }

    try {
        const contacto = contactos.find(c => c._id === contactoId);
        if (!contacto) return;

        const nuevoEstado = !contacto.esFavorito;

        const { error } = await supabaseClient
            .from('contactos')
            .update({ es_favorito: nuevoEstado })
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (error) throw error;

        contacto.esFavorito = nuevoEstado;
        aplicarFiltros();
        window.showToast(nuevoEstado ? '◆ Agregado a favoritos' : '◆ Favorito eliminado');

    } catch (error) {
        console.error('Error actualizando favorito:', error);
        window.showToast('❌ Error al actualizar favorito', 'error');
    }
}

// ================================================================
// 🗑️ ELIMINAR CONTACTO
// ================================================================
async function eliminarContacto(contactoId) {
    if (!confirm('¿Estás seguro de eliminar este contacto?')) return;

    const session = await window.getSession();
    if (!session) {
        window.showToast('⚠️ Inicia sesión para eliminar contactos', 'error');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('contactos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (error) throw error;

        contactos = contactos.filter(c => c._id !== contactoId);
        actualizarContadores();
        aplicarFiltros();
        window.showToast('✅ Contacto eliminado');

    } catch (error) {
        console.error('Error eliminando contacto:', error);
        window.showToast('❌ Error al eliminar contacto', 'error');
    }
}

// ================================================================
// 📧 INVITAR CONTACTO POR CÓDIGO
// ================================================================
async function invitarContacto() {
    try {
        const session = await window.getSession();
        if (!session) {
            window.showToast('⚠️ Inicia sesión para invitar', 'error');
            return;
        }

        const codigo = 'SAR-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        try {
            const { data, error } = await supabaseClient
                .from('invitaciones')
                .insert({
                    usuario_id: session.user.id,
                    codigo: codigo,
                    activo: true
                })
                .select()
                .single();

            if (error) {
                if (error.code === '42P01') {
                    window.showToast('⚠️ La tabla de invitaciones no está configurada', 'warning');
                    return;
                }
                throw error;
            }

            const modal = document.getElementById('modalInvitacion');
            const codigoEl = document.getElementById('codigoInvitacion');
            if (modal && codigoEl) {
                codigoEl.textContent = codigo;
                modal.style.display = 'flex';
            }

            window.showToast('✅ Código de invitación generado', 'success');

        } catch (insertError) {
            console.error('Error generando invitación:', insertError);
            window.showToast('❌ Error al generar invitación', 'error');
        }

    } catch (error) {
        console.error('Error generando invitación:', error);
        window.showToast('❌ Error al generar invitación', 'error');
    }
}

function cerrarModalInvitacion() {
    document.getElementById('modalInvitacion').style.display = 'none';
}

async function copiarCodigoInvitacion() {
    const codigo = document.getElementById('codigoInvitacion')?.textContent;
    if (!codigo) return;
    
    try {
        await navigator.clipboard.writeText(`◈ Únete a Sariel's con mi código: ${codigo}`);
        window.showToast('📋 Código copiado', 'success');
    } catch {
        prompt('Copia este código:', codigo);
    }
}

// ================================================================
// 👁️ VER PERFIL DE CONTACTO
// ================================================================
function verPerfilContacto(contactoId) {
    window.location.href = `/features/perfil/perfil.html?contacto=${contactoId}`;
}

// ================================================================
// 🔄 ORDENAR CONTACTOS
// ================================================================
function ordenarContactos(criterio) {
    switch (criterio) {
        case 'nombre':
            contactos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            break;
        case 'online':
            contactos.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
            break;
        case 'reciente':
            contactos.sort((a, b) => {
                const fechaA = a.ultima_conexion ? new Date(a.ultima_conexion) : new Date(0);
                const fechaB = b.ultima_conexion ? new Date(b.ultima_conexion) : new Date(0);
                return fechaB - fechaA;
            });
            break;
        default:
            break;
    }
    aplicarFiltros();
}

// ================================================================
// ABRIR MODAL AGREGAR CONTACTO
// ================================================================
function abrirAgregarContacto() {
    const modal = document.getElementById('modalBuscarContacto');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            document.getElementById('searchInputModal')?.focus();
        }, 300);
    }
}

function cerrarModalBuscar() {
    document.getElementById('modalBuscarContacto').style.display = 'none';
    document.getElementById('searchInputModal').value = '';
    document.getElementById('resultadosBusqueda').innerHTML = '';
}

// ================================================================
// 🎯 INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    const autenticado = await verificarAutenticacion();
    
    if (autenticado) {
        await actualizarOnline(true);
        await cargarContactos();
        
        window.addEventListener('beforeunload', function() {
            actualizarOnline(false);
        });
    } else {
        mostrarSinContactos();
    }

    const searchModal = document.getElementById('searchInputModal');
    if (searchModal) {
        let timeout;
        searchModal.addEventListener('input', function() {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                buscarUsuarios(this.value);
            }, 300);
        });
        searchModal.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                buscarUsuarios(this.value);
            }
        });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            aplicarFiltros();
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(modal => {
                modal.style.display = 'none';
            });
            cerrarModalBuscar();
            cerrarModalInvitacion();
        }
    });

    console.log('◈ Sariel\'s - Contactos');
    console.log('👥 Contactos cargados:', contactos.length);
    console.log('📡 Realtime activado');
});

// ================================================================
// 📤 EXPOSICIÓN DE FUNCIONES GLOBALES
// ================================================================
window.cargarContactos = cargarContactos;
window.irAMensajes = irAMensajes;
window.toggleFavorito = toggleFavorito;
window.eliminarContacto = eliminarContacto;
window.abrirAgregarContacto = abrirAgregarContacto;
window.buscarUsuarios = buscarUsuarios;
window.agregarContacto = agregarContacto;
window.bloquearContacto = bloquearContacto;
window.desbloquearUsuario = desbloquearUsuario;
window.invitarContacto = invitarContacto;
window.copiarCodigoInvitacion = copiarCodigoInvitacion;
window.cerrarModalInvitacion = cerrarModalInvitacion;
window.cerrarModalBuscar = cerrarModalBuscar;
window.verPerfilContacto = verPerfilContacto;
window.ordenarContactos = ordenarContactos;
window.actualizarOnline = actualizarOnline;