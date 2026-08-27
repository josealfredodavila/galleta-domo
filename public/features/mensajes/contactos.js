/* ================================================================
   CONTACTOS ULTRA MEGA PRO - SARIEL'S
   Con Supabase REAL + Estado Online + Buscar Usuarios + Bloquear + Invitar
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE
// ================================================================
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let contactos = [];
let contactosFiltrados = [];
let filtroActual = 'todos';
let usuarioActual = null;
let modoOscuro = true;
let canalContactos = null;

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
        showToast('⚠️ Inicia sesión para ver contactos', 'warning');
        return false;
    }
    usuarioActual = session.user;
    return true;
}

// ================================================================
// ACTUALIZAR ESTADO ONLINE EN SUPABASE
// ================================================================
async function actualizarOnline(online) {
    try {
        const session = await getSession();
        if (!session) return;

        await supabase.rpc('actualizar_online', { p_online: online });
        
        if (usuarioActual) {
            usuarioActual.online = online;
        }
    } catch (error) {
        console.error('Error actualizando estado online:', error);
    }
}

// ================================================================
// CARGAR CONTACTOS CON ESTADO ONLINE REAL
// ================================================================
async function cargarContactos() {
    try {
        if (!await verificarAutenticacion()) {
            cargarContactosEjemplo();
            return;
        }

        // Usar la función RPC para obtener contactos con estado online
        const { data, error } = await supabase
            .rpc('obtener_contactos_con_estado', {
                p_usuario_id: usuarioActual.id
            });

        if (error) {
            // Fallback: consulta tradicional
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('contactos')
                .select('*, usuarios!contactos_contacto_id_fkey(id, nombre, handle, avatar_url, online, ultima_conexion)')
                .eq('usuario_id', usuarioActual.id)
                .eq('estado', 'activo');

            if (fallbackError) throw fallbackError;

            contactos = (fallbackData || []).map(c => {
                const contacto = c.usuarios || {};
                return {
                    _id: contacto.id,
                    nombre: contacto.nombre || 'Usuario',
                    handle: contacto.handle || '',
                    avatar_url: contacto.avatar_url || null,
                    walletAddress: c.wallet_address || 'Sin wallet',
                    online: contacto.online || false,
                    ultima_conexion: contacto.ultima_conexion || null,
                    esFavorito: c.es_favorito || false,
                    verificado: true
                };
            });
        } else {
            // Mapear datos de la RPC
            contactos = (data || []).map(c => ({
                _id: c.contacto_id,
                nombre: c.nombre || 'Usuario',
                handle: c.handle || '',
                avatar_url: c.avatar_url || null,
                online: c.online || false,
                ultima_conexion: c.ultima_conexion || null,
                esFavorito: c.es_favorito || false,
                verificado: true
            }));
        }

        // Actualizar UI
        actualizarContadores();
        aplicarFiltros();
        
        // Iniciar escucha de cambios en tiempo real
        iniciarEscuchaContactos();

    } catch (error) {
        console.error('Error cargando contactos desde Supabase:', error);
        cargarContactosEjemplo();
    }
}

// ================================================================
// INICIAR ESCUCHA DE CONTACTOS (REALTIME)
// ================================================================
function iniciarEscuchaContactos() {
    if (canalContactos) {
        supabase.removeChannel(canalContactos);
    }

    canalContactos = supabase
        .channel('contactos-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'contactos'
        }, () => {
            // Recargar contactos cuando haya cambios
            cargarContactos();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'usuarios',
            filter: `id=neq.${usuarioActual?.id}`
        }, (payload) => {
            // Actualizar estado online de un contacto
            const usuario = payload.new;
            const contacto = contactos.find(c => c._id === usuario.id);
            if (contacto) {
                contacto.online = usuario.online || false;
                contacto.ultima_conexion = usuario.ultima_conexion;
                aplicarFiltros();
            }
        })
        .subscribe();
}

// ================================================================
// CONTACTOS DE EJEMPLO (FALLBACK)
// ================================================================
function cargarContactosEjemplo() {
    contactos = [
        { _id: '1', nombre: 'Ana Martínez', online: true, esFavorito: true, verificado: true },
        { _id: '2', nombre: 'Carlos López', online: false, esFavorito: false, verificado: false },
        { _id: '3', nombre: 'María García', online: true, esFavorito: false, verificado: true }
    ];
    actualizarContadores();
    aplicarFiltros();
    showToast('⚠️ Inicia sesión para ver contactos reales', 'warning');
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
// FORMATEAR TIEMPO DE ÚLTIMA CONEXIÓN
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
// RENDERIZAR CONTACTOS
// ================================================================
function renderizarContactos(lista) {
    const contactosListEl = document.getElementById('contactosList');
    if (!contactosListEl) return;

    if (!lista || lista.length === 0) {
        contactosListEl.innerHTML = `
            <div class="empty-state">
                <span class="icon">◈</span>
                <h3>Sin contactos</h3>
                <p>Comienza a agregar personas a tu red</p>
                <button class="btn-accion" onclick="abrirAgregarContacto()">◈ Agregar contacto</button>
            </div>
        `;
        return;
    }

    contactosListEl.innerHTML = lista.map(contacto => {
        const esOnline = contacto.online === true;
        const esFavorito = contacto.esFavorito || false;
        const inicial = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';
        const estadoTexto = esOnline ? '◉ En línea' : `◈ ${formatearTiempo(contacto.ultima_conexion)}`;

        return `
            <div class="contacto-card" data-id="${contacto._id}">
                <div class="contacto-avatar ${esOnline ? 'online' : 'offline'} ${esFavorito ? 'favorito' : ''}">
                    ${contacto.avatar_url ? `<img src="${contacto.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : inicial}
                    ${esOnline ? '<span class="online-dot"></span>' : ''}
                    ${esFavorito ? '<span class="favorito-badge">◆</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">
                        ${contacto.nombre || 'Usuario'}
                        ${contacto.verificado ? '<span class="verified">✦ VERIFICADO</span>' : ''}
                    </div>
                    <div class="estado ${esOnline ? 'online' : 'offline'}">
                        ${estadoTexto}
                    </div>
                    <div class="contacto-meta">
                        <span>@${contacto.handle || 'usuario'}</span>
                        ${contacto.walletAddress ? `<span>· ◈ ${contacto.walletAddress.slice(0, 6)}...${contacto.walletAddress.slice(-4)}</span>` : ''}
                    </div>
                </div>
                <div class="contacto-actions">
                    <button class="mensaje" onclick="irAMensajes('${contacto._id}')" title="Enviar mensaje">◈</button>
                    <button class="favorito ${esFavorito ? 'active' : ''}" onclick="toggleFavorito('${contacto._id}')" title="Favorito">◆</button>
                    <button class="bloquear" onclick="bloquearContacto('${contacto._id}')" title="Bloquear">🚫</button>
                    <button class="eliminar" onclick="eliminarContacto('${contacto._id}')" title="Eliminar">✕</button>
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
// 🔍 BUSCAR USUARIOS POR NOMBRE/HANDLE (NUEVO)
// ================================================================
async function buscarUsuarios(query) {
    if (!query || query.length < 2) {
        document.getElementById('resultadosBusqueda').innerHTML = '';
        return;
    }

    try {
        const session = await getSession();
        if (!session) return;

        const { data, error } = await supabase
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

        // Verificar contactos existentes
        const { data: contactosExistentes } = await supabase
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);

        const idsExistentes = contactosExistentes?.map(c => c.contacto_id) || [];

        container.innerHTML = data.map(usuario => {
            const yaEsContacto = idsExistentes.includes(usuario.id);
            const estaOnline = usuario.online || false;
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
                    ">
                        ${usuario.avatar_url ? `<img src="${usuario.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : (usuario.nombre ? usuario.nombre[0].toUpperCase() : '◈')}
                        ${estaOnline ? '<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;background:var(--success);border:2px solid var(--space);"></span>' : ''}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.8rem;">${usuario.nombre || 'Usuario'}</div>
                        <div style="font-size:0.6rem;color:var(--text-muted);">@${usuario.handle || 'usuario'} ${estaOnline ? '· 🟢 En línea' : ''}</div>
                    </div>
                    ${yaEsContacto ? `
                        <span style="font-size:0.55rem;color:var(--success);background:rgba(0,214,143,0.1);padding:2px 10px;border-radius:12px;">
                            ✓ Contacto
                        </span>
                    ` : `
                        <button onclick="agregarContactoDesdeBusqueda('${usuario.id}')" style="
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
// ➕ AGREGAR CONTACTO DESDE BÚSQUEDA
// ================================================================
async function agregarContactoDesdeBusqueda(contactoId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para agregar contactos', 'error');
            return;
        }

        // Verificar si ya es contacto
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
        await cargarContactos();

    } catch (error) {
        console.error('Error agregando contacto:', error);
        showToast('❌ Error al agregar contacto', 'error');
    }
}

// ================================================================
// ➕ AGREGAR CONTACTO POR WALLET
// ================================================================
async function abrirAgregarContacto() {
    // Mostrar modal de búsqueda
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
// 🚫 BLOQUEAR CONTACTO (NUEVO)
// ================================================================
async function bloquearContacto(contactoId) {
    if (!confirm('¿Bloquear a este usuario? No podrán enviarte mensajes ni ver tu perfil.')) return;

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        // Llamar función RPC bloquear_usuario
        const { error } = await supabase.rpc('bloquear_usuario', {
            p_usuario_id: session.user.id,
            p_bloqueado_id: contactoId
        });

        if (error) throw error;

        // Eliminar de la lista local
        contactos = contactos.filter(c => c._id !== contactoId);
        actualizarContadores();
        aplicarFiltros();
        showToast('🚫 Usuario bloqueado', 'warning');

    } catch (error) {
        console.error('Error bloqueando usuario:', error);
        showToast('❌ Error al bloquear usuario', 'error');
    }
}

// ================================================================
// 🔓 DESBLOQUEAR USUARIO (NUEVO)
// ================================================================
async function desbloquearUsuario(contactoId) {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión', 'error');
            return;
        }

        const { error } = await supabase.rpc('desbloquear_usuario', {
            p_usuario_id: session.user.id,
            p_bloqueado_id: contactoId
        });

        if (error) throw error;

        showToast('✅ Usuario desbloqueado', 'success');
        await cargarContactos();

    } catch (error) {
        console.error('Error desbloqueando usuario:', error);
        showToast('❌ Error al desbloquear', 'error');
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
    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para marcar favoritos', 'error');
        return;
    }

    try {
        const contacto = contactos.find(c => c._id === contactoId);
        if (!contacto) return;

        const nuevoEstado = !contacto.esFavorito;

        const { error } = await supabase
            .from('contactos')
            .update({ es_favorito: nuevoEstado })
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (error) throw error;

        contacto.esFavorito = nuevoEstado;
        aplicarFiltros();
        showToast(nuevoEstado ? '◆ Agregado a favoritos' : '◆ Favorito eliminado');

    } catch (error) {
        console.error('Error actualizando favorito:', error);
        showToast('❌ Error al actualizar favorito', 'error');
    }
}

// ================================================================
// 🗑️ ELIMINAR CONTACTO
// ================================================================
async function eliminarContacto(contactoId) {
    if (!confirm('¿Estás seguro de eliminar este contacto?')) return;

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para eliminar contactos', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('contactos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (error) throw error;

        contactos = contactos.filter(c => c._id !== contactoId);
        actualizarContadores();
        aplicarFiltros();
        showToast('✅ Contacto eliminado');

    } catch (error) {
        console.error('Error eliminando contacto:', error);
        showToast('❌ Error al eliminar contacto', 'error');
    }
}

// ================================================================
// 📧 INVITAR CONTACTO POR CÓDIGO (NUEVO)
// ================================================================
async function invitarContacto() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ Inicia sesión para invitar', 'error');
            return;
        }

        // Generar código de invitación
        const codigo = 'SAR-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        const { data, error } = await supabase
            .from('invitaciones')
            .insert({
                usuario_id: session.user.id,
                codigo: codigo
            })
            .select()
            .single();

        if (error) throw error;

        // Mostrar modal con código
        const modal = document.getElementById('modalInvitacion');
        const codigoEl = document.getElementById('codigoInvitacion');
        if (modal && codigoEl) {
            codigoEl.textContent = codigo;
            modal.style.display = 'flex';
        }

        showToast('✅ Código de invitación generado', 'success');

    } catch (error) {
        console.error('Error generando invitación:', error);
        showToast('❌ Error al generar invitación', 'error');
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
        showToast('📋 Código copiado', 'success');
    } catch {
        prompt('Copia este código:', codigo);
    }
}

// ================================================================
// 👁️ VER PERFIL DE CONTACTO (NUEVO)
// ================================================================
function verPerfilContacto(contactoId) {
    window.location.href = `/features/perfil/perfil.html?contacto=${contactoId}`;
}

// ================================================================
// 🔄 ORDENAR CONTACTOS (NUEVO)
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
// 🎯 INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    // Verificar autenticación
    const autenticado = await verificarAutenticacion();
    
    if (autenticado) {
        // Actualizar estado online
        await actualizarOnline(true);
        
        // Cargar contactos
        await cargarContactos();
        
        // Detectar cierre de página para marcar offline
        window.addEventListener('beforeunload', function() {
            actualizarOnline(false);
        });
    }

    // Eventos de búsqueda en modal
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

    // Eventos de búsqueda principal
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            aplicarFiltros();
        });
    }

    // Filtros
    document.querySelectorAll('.filtro').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filtro').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroActual = this.dataset.filtro;
            
            // Ordenar según filtro
            if (filtroActual === 'recientes') {
                ordenarContactos('reciente');
            } else if (filtroActual === 'online') {
                ordenarContactos('online');
            } else {
                ordenarContactos('nombre');
            }
            
            aplicarFiltros();
        });
    });

    // Cerrar modales con click fuera
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    // Cerrar modales con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(modal => {
                modal.style.display = 'none';
            });
            cerrarModalBuscar();
            cerrarModalInvitacion();
        }
    });

    console.log('◈ Sariel\'s - Contactos Ultra Mega Pro');
    console.log('👥 Contactos cargados:', contactos.length);
    console.log('📡 Realtime activado');
});

// ================================================================
// 📤 EXPONER FUNCIONES GLOBALES
// ================================================================
window.cargarContactos = cargarContactos;
window.irAMensajes = irAMensajes;
window.toggleFavorito = toggleFavorito;
window.eliminarContacto = eliminarContacto;
window.abrirAgregarContacto = abrirAgregarContacto;
window.buscarUsuarios = buscarUsuarios;
window.agregarContactoDesdeBusqueda = agregarContactoDesdeBusqueda;
window.bloquearContacto = bloquearContacto;
window.desbloquearUsuario = desbloquearUsuario;
window.invitarContacto = invitarContacto;
window.copiarCodigoInvitacion = copiarCodigoInvitacion;
window.cerrarModalInvitacion = cerrarModalInvitacion;
window.cerrarModalBuscar = cerrarModalBuscar;
window.verPerfilContacto = verPerfilContacto;
window.ordenarContactos = ordenarContactos;
window.actualizarOnline = actualizarOnline;
window.showToast = showToast;