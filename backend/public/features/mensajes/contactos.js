/* ================================================================
   CONTACTOS - SARIEL'S ECOSYSTEM
   VERSIÓN CORREGIDA - cliente real + tabla usuarios
   ================================================================ */

// ================================================================
// FIX CRÍTICO: obtiene el cliente real (no la librería UMD)
// ================================================================
function sb() {
    return window.supabaseClient || window.supabase;
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
// TOAST - NOTIFICACIONES
// ================================================================
function showToast(msg, type = '') {
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
        t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
    } catch (e) {
        console.warn('Toast error:', e);
    }
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    try {
        const client = sb();
        if (!client || typeof client.auth === 'undefined') {
            console.warn('Supabase cliente no disponible aún');
            return null;
        }
        const { data: { session } } = await client.auth.getSession();
        return session;
    } catch (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
    }
}

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let contactos = [];
let contactosFiltrados = [];
let filtroActual = 'todos';
let usuarioActual = null;
let canalContactos = null;

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
// ACTUALIZAR ESTADO ONLINE
// ================================================================
async function actualizarOnline(online) {
    try {
        const session = await getSession();
        if (!session) return;

        const result = await sb()
            .from('usuarios')
            .update({
                online: online,
                ultima_conexion: new Date().toISOString()
            })
            .eq('id', session.user.id);

        if (result.error) throw result.error;
        if (usuarioActual) usuarioActual.online = online;
    } catch (error) {
        console.error('Error actualizando online:', error);
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

        const { data, error } = await sb()
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
// ESCUCHA REALTIME
// ================================================================
function iniciarEscuchaContactos() {
    if (!usuarioActual) return;
    const client = sb();
    if (!client) return;

    if (canalContactos) {
        try { client.removeChannel(canalContactos); } catch (e) {}
        canalContactos = null;
    }

    canalContactos = client
        .channel('contactos-realtime-' + usuarioActual.id)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'contactos',
            filter: `usuario_id=eq.${usuarioActual.id}`
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
}

// ================================================================
// ACTUALIZAR CONTADORES
// ================================================================
function actualizarContadores() {
    const total = contactos.length;
    const online = contactos.filter(c => c.online).length;

    const totalEl = document.getElementById('totalContactos');
    const onlineEl = document.getElementById('onlineContactos');

    if (totalEl) totalEl.textContent = total;
    if (onlineEl) onlineEl.textContent = online;
}

// ================================================================
// FORMATEAR TIEMPO
// ================================================================
function formatearTiempo(fecha) {
    if (!fecha) return 'Desconectado';
    const ahora = new Date();
    const entonces = new Date(fecha);
    const diffMin = Math.floor((ahora - entonces) / 60000);

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
        mostrarSinContactos();
        return;
    }

    contactosListEl.innerHTML = lista.map(contacto => {
        const esOnline = contacto.online === true;
        const esFavorito = contacto.esFavorito || false;
        const inicial = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';
        const estadoTexto = esOnline ? '◉ En línea' : `◈ ${formatearTiempo(contacto.ultima_conexion)}`;
        const nombreSanitizado = escapeHTML(contacto.nombre || 'Usuario');
        const handleSanitizado = escapeHTML(contacto.handle || 'usuario');

        return `
            <div class="contacto-card" data-id="${escapeHTML(contacto._id)}">
                <div class="contacto-avatar ${esOnline ? 'online' : 'offline'} ${esFavorito ? 'favorito' : ''}">
                    ${contacto.avatar_url ? `<img src="${escapeHTML(contacto.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : inicial}
                    ${esOnline ? '<span class="online-dot"></span>' : ''}
                    ${esFavorito ? '<span class="favorito-badge">◆</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">${nombreSanitizado}${contacto.verificado ? ' <span class="verified">✦ VERIFICADO</span>' : ''}</div>
                    <div class="estado ${esOnline ? 'online' : 'offline'}">${estadoTexto}</div>
                    <div class="contacto-meta"><span>@${handleSanitizado}</span></div>
                </div>
                <div class="contacto-actions">
                    <button class="mensaje" onclick="irAMensajes('${escapeHTML(contacto._id)}')" title="Enviar mensaje">◈</button>
                    <button class="favorito ${esFavorito ? 'active' : ''}" onclick="toggleFavorito('${escapeHTML(contacto._id)}')" title="Favorito">◆</button>
                    <button class="bloquear" onclick="bloquearContacto('${escapeHTML(contacto._id)}')" title="Bloquear">🚫</button>
                    <button class="eliminar" onclick="eliminarContacto('${escapeHTML(contacto._id)}')" title="Eliminar">✕</button>
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
        if (filtroActual === 'online') matchFiltro = c.online === true;
        else if (filtroActual === 'favoritos') matchFiltro = c.esFavorito === true;

        return matchBusqueda && matchFiltro;
    });

    renderizarContactos(contactosFiltrados);
}

// ================================================================
// BUSCAR USUARIOS
// ================================================================
async function buscarUsuarios(query) {
    if (!query || query.length < 2) {
        const cont = document.getElementById('resultadosBusqueda');
        if (cont) cont.innerHTML = '';
        return;
    }

    try {
        const session = await getSession();
        if (!session) return;

        const q = query.replace(/[%_,()]/g, '');

        const { data, error } = await sb()
            .from('usuarios')
            .select('id, nombre, handle, avatar_url, online')
            .or(`nombre.ilike.%${q}%,handle.ilike.%${q}%`)
            .neq('id', session.user.id)
            .limit(10);

        if (error) throw error;

        const container = document.getElementById('resultadosBusqueda');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:0.75rem;">No se encontraron usuarios</div>`;
            return;
        }

        const { data: contactosExistentes } = await sb()
            .from('contactos')
            .select('contacto_id')
            .eq('usuario_id', session.user.id);

        const idsExistentes = contactosExistentes?.map(c => c.contacto_id) || [];

        container.innerHTML = data.map(usuario => {
            const yaEsContacto = idsExistentes.includes(usuario.id);
            const estaOnline = usuario.online || false;
            const nombreSanitizado = escapeHTML(usuario.nombre || 'Usuario');
            const handleSanitizado = escapeHTML(usuario.handle || 'usuario');

            return `
                <div class="resultado-item" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid rgba(212,175,55,0.05);">
                    <div class="avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--green-deep),var(--gold));display:flex;align-items:center;justify-content:center;color:white;font-size:0.8rem;overflow:hidden;border:2px solid ${estaOnline ? 'var(--success)' : 'var(--text-muted)'};">
                        ${usuario.avatar_url ? `<img src="${escapeHTML(usuario.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">` : (usuario.nombre ? nombreSanitizado[0].toUpperCase() : '◈')}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.8rem;">${nombreSanitizado}</div>
                        <div style="font-size:0.6rem;color:var(--text-muted);">@${handleSanitizado} ${estaOnline ? '· 🟢 En línea' : ''}</div>
                    </div>
                    ${yaEsContacto ? `
                        <span style="font-size:0.55rem;color:var(--success);background:rgba(0,214,143,0.1);padding:2px 10px;border-radius:12px;">✓ Contacto</span>
                    ` : `
                        <button onclick="agregarContacto('${usuario.id}')" style="background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:var(--space);border:none;padding:4px 12px;border-radius:12px;font-size:0.6rem;font-weight:600;cursor:pointer;">+ Agregar</button>
                    `}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error buscando usuarios:', error);
    }
}

// ================================================================
// AGREGAR CONTACTO
// ================================================================
async function agregarContacto(contactoId) {
    try {
        const session = await getSession();
        if (!session) { showToast('⚠️ Inicia sesión', 'error'); return; }
        if (contactoId === session.user.id) { showToast('⚠️ No puedes agregarte a ti mismo', 'warning'); return; }

        const { data: existe } = await sb()
            .from('contactos')
            .select('id')
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId)
            .maybeSingle();

        if (existe) {
            showToast('⚠️ Ya es tu contacto', 'warning');
            return;
        }

        const result = await sb()
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: contactoId,
                estado: 'activo',
                es_favorito: false
            });

        if (result.error) throw result.error;

        showToast('✅ Contacto agregado', 'success');
        const inputModal = document.getElementById('searchInputModal');
        const resBusqueda = document.getElementById('resultadosBusqueda');
        if (inputModal) inputModal.value = '';
        if (resBusqueda) resBusqueda.innerHTML = '';
        cerrarModalBuscar();
        await cargarContactos();

    } catch (error) {
        console.error('Error agregando contacto:', error);
        showToast('❌ Error al agregar contacto', 'error');
    }
}

// ================================================================
// BLOQUEAR CONTACTO
// ================================================================
async function bloquearContacto(contactoId) {
    if (!confirm('¿Bloquear a este usuario?')) return;

    try {
        const session = await getSession();
        if (!session) { showToast('⚠️ Inicia sesión', 'error'); return; }

        const r1 = await sb().from('bloqueos').insert({
            usuario_id: session.user.id,
            bloqueado_id: contactoId
        });
        if (r1.error) throw r1.error;

        await sb()
            .from('contactos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        contactos = contactos.filter(c => c._id !== contactoId);
        actualizarContadores();
        aplicarFiltros();
        showToast('🚫 Usuario bloqueado', 'warning');

    } catch (error) {
        console.error('Error bloqueando usuario:', error);
        showToast('❌ Error al bloquear', 'error');
    }
}

// ================================================================
// IR A MENSAJES
// ================================================================
function irAMensajes(contactoId) {
    window.location.href = `/features/mensajes/mensajes.html?contacto=${contactoId}`;
}

// ================================================================
// TOGGLE FAVORITO
// ================================================================
async function toggleFavorito(contactoId) {
    const session = await getSession();
    if (!session) { showToast('⚠️ Inicia sesión', 'error'); return; }

    try {
        const contacto = contactos.find(c => c._id === contactoId);
        if (!contacto) return;

        const nuevoEstado = !contacto.esFavorito;

        const result = await sb()
            .from('contactos')
            .update({ es_favorito: nuevoEstado })
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (result.error) throw result.error;

        contacto.esFavorito = nuevoEstado;
        aplicarFiltros();
        showToast(nuevoEstado ? '◆ Agregado a favoritos' : '◆ Favorito eliminado');

    } catch (error) {
        console.error('Error actualizando favorito:', error);
        showToast('❌ Error al actualizar favorito', 'error');
    }
}

// ================================================================
// ELIMINAR CONTACTO
// ================================================================
async function eliminarContacto(contactoId) {
    if (!confirm('¿Eliminar este contacto?')) return;

    const session = await getSession();
    if (!session) { showToast('⚠️ Inicia sesión', 'error'); return; }

    try {
        const result = await sb()
            .from('contactos')
            .delete()
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (result.error) throw result.error;

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
// INVITAR CONTACTO
// ================================================================
async function invitarContacto() {
    try {
        const session = await getSession();
        if (!session) { showToast('⚠️ Inicia sesión', 'error'); return; }

        const codigo = 'SAR-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        const result = await sb()
            .from('invitaciones')
            .insert({
                usuario_id: session.user.id,
                codigo: codigo,
                activo: true
            })
            .select()
            .single();

        if (result.error) throw result.error;

        const modal = document.getElementById('modalInvitacion');
        const codigoEl = document.getElementById('codigoInvitacion');
        if (modal && codigoEl) {
            codigoEl.textContent = codigo;
            modal.classList.add('show');
            modal.style.display = 'flex';
        }

        showToast('✅ Código generado', 'success');

    } catch (error) {
        console.error('Error generando invitación:', error);
        showToast('❌ Error al generar invitación', 'error');
    }
}

function cerrarModalInvitacion() {
    const modal = document.getElementById('modalInvitacion');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
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
// ORDENAR CONTACTOS
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
    }
    aplicarFiltros();
}

// ================================================================
// ABRIR MODALES
// ================================================================
function abrirAgregarContacto() {
    const modal = document.getElementById('modalBuscarContacto');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        setTimeout(() => {
            const inp = document.getElementById('searchInputModal');
            if (inp) inp.focus();
        }, 300);
    }
}

function cerrarModalBuscar() {
    const modal = document.getElementById('modalBuscarContacto');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
    const input = document.getElementById('searchInputModal');
    if (input) input.value = '';
    const res = document.getElementById('resultadosBusqueda');
    if (res) res.innerHTML = '';
}

// ================================================================
// LIMPIEZA
// ================================================================
function limpiarRecursosContactos() {
    if (canalContactos) {
        try { sb().removeChannel(canalContactos); } catch(e) {}
        canalContactos = null;
    }
}

window.addEventListener('beforeunload', limpiarRecursosContactos);

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('◈ Sariel\'s - Contactos');

    // Filtros
    const filtros = document.querySelectorAll('.filtro');
    filtros.forEach(btn => {
        btn.addEventListener('click', function() {
            filtros.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroActual = this.getAttribute('data-filtro') || 'todos';
            if (filtroActual === 'online') ordenarContactos('online');
            else if (filtroActual === 'recientes') ordenarContactos('reciente');
            else ordenarContactos('nombre');
            aplicarFiltros();
        });
    });

    // Init con reintentos
    let intentos = 0;
    function init() {
        const client = sb();
        if (!client || typeof client.auth === 'undefined') {
            intentos++;
            if (intentos < 20) { setTimeout(init, 500); return; }
            console.warn('Supabase nunca estuvo listo');
            mostrarSinContactos();
            return;
        }

        verificarAutenticacion().then(autenticado => {
            if (autenticado) {
                actualizarOnline(true);
                cargarContactos();
                window.addEventListener('beforeunload', () => actualizarOnline(false));
            } else {
                mostrarSinContactos();
            }
        });
    }
    init();

    const searchModal = document.getElementById('searchInputModal');
    if (searchModal) {
        let timeout;
        searchModal.addEventListener('input', function() {
            clearTimeout(timeout);
            const val = this.value;
            timeout = setTimeout(() => buscarUsuarios(val), 300);
        });
        searchModal.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') buscarUsuarios(this.value);
        });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', aplicarFiltros);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            cerrarModalBuscar();
            cerrarModalInvitacion();
        }
    });
});

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.cargarContactos = cargarContactos;
window.irAMensajes = irAMensajes;
window.toggleFavorito = toggleFavorito;
window.eliminarContacto = eliminarContacto;
window.abrirAgregarContacto = abrirAgregarContacto;
window.buscarUsuarios = buscarUsuarios;
window.agregarContacto = agregarContacto;
window.bloquearContacto = bloquearContacto;
window.invitarContacto = invitarContacto;
window.copiarCodigoInvitacion = copiarCodigoInvitacion;
window.cerrarModalInvitacion = cerrarModalInvitacion;
window.cerrarModalBuscar = cerrarModalBuscar;
window.ordenarContactos = ordenarContactos;
window.actualizarOnline = actualizarOnline;
window.showToast = showToast;
window.aplicarFiltros = aplicarFiltros;
window.limpiarRecursosContactos = limpiarRecursosContactos;