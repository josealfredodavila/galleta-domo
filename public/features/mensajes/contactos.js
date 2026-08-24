/* ================================================================
   CONTACTOS ULTRA MEGA PRO - SARIEL'S
   Conectado a Supabase REAL (Sin conflictos de variables)
   ================================================================ */

// ================================================================
// SUPABASE CLIENTE (El mismo de app.js)
// ================================================================
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co',
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

// ================================================================
// VARIABLES GLOBALES (Declaradas arriba del todo)
// ================================================================
let contactos = [];               // Lista de todos los contactos
let contactosFiltrados = [];      // Lista filtrada (después de búsqueda/filtro)
let filtroActual = 'todos';       // Filtro activo (todos, online, favoritos, recientes)
let usuarioActual = null;         // Usuario autenticado
let modoOscuro = true;            // Modo oscuro/claro

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
// CARGAR CONTACTOS (Renombrado a `dataContactos`)
// ================================================================
async function cargarContactos() {
    try {
        if (!await verificarAutenticacion()) {
            cargarContactosEjemplo();
            return;
        }

        // 1. Consultar a Supabase (Renombrado para evitar conflicto)
        const { data: dataContactos, error } = await supabase
            .from('contactos')
            .select('*, usuarios!contactos_contacto_id_fkey(id, nombre, handle, avatar_url)')
            .eq('usuario_id', usuarioActual.id);

        if (error) throw error;

        // 2. Mapear los datos a la variable global `contactos`
        contactos = (dataContactos || []).map(c => {
            const contacto = c.usuarios || {};
            return {
                _id: contacto.id,
                nombre: contacto.nombre || 'Usuario',
                handle: contacto.handle || '',
                avatar_url: contacto.avatar_url || null,
                walletAddress: c.wallet_address || 'Sin wallet',
                estado: 'desconectado', // No hay estado en Supabase aún
                esFavorito: c.es_favorito || false,
                verificado: true
            };
        });

        // 3. Actualizar UI
        actualizarContadores();
        aplicarFiltros();

    } catch (error) {
        console.error('Error cargando contactos desde Supabase:', error);
        cargarContactosEjemplo();
    }
}

// ================================================================
// CONTACTOS DE EJEMPLO (Solo si no hay sesión)
// ================================================================
function cargarContactosEjemplo() {
    contactos = [
        { _id: '1', nombre: 'Ana Martínez', estado: 'conectado', esFavorito: true, verificado: true, walletAddress: '0x7F3a...9Bc2' },
        { _id: '2', nombre: 'Carlos López', estado: 'desconectado', esFavorito: false, verificado: false, walletAddress: '0x8A4b...3Cd1' },
        { _id: '3', nombre: 'María García', estado: 'conectado', esFavorito: false, verificado: true, walletAddress: '0x9B5c...4De2' }
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
    const online = contactos.filter(c => c.estado === 'conectado').length;

    const totalContactosEl = document.getElementById('totalContactos');
    const onlineContactosEl = document.getElementById('onlineContactos');

    if (totalContactosEl) totalContactosEl.textContent = total;
    if (onlineContactosEl) onlineContactosEl.textContent = online;
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
        const esOnline = contacto.estado === 'conectado';
        const esFavorito = contacto.esFavorito || false;
        const inicial = contacto.nombre ? contacto.nombre[0].toUpperCase() : '✦';

        return `
            <div class="contacto-card" data-id="${contacto._id}">
                <div class="contacto-avatar ${esOnline ? 'online' : 'offline'} ${esFavorito ? 'favorito' : ''}">
                    ${inicial}
                    ${esOnline ? '<span class="online-dot"></span>' : ''}
                    ${esFavorito ? '<span class="favorito-badge">◆</span>' : ''}
                </div>
                <div class="contacto-info">
                    <div class="nombre">
                        ${contacto.nombre || 'Usuario'}
                        ${contacto.verificado ? '<span class="verified">✦ VERIFICADO</span>' : ''}
                    </div>
                    <div class="estado ${esOnline ? 'online' : 'offline'}">
                        ${esOnline ? '◉ En línea' : '◈ Desconectado'}
                    </div>
                    <div class="contacto-meta">
                        <span>◈ ${contacto.walletAddress || 'Sin wallet'}</span>
                    </div>
                </div>
                <div class="contacto-actions">
                    <button class="mensaje" onclick="irAMensajes('${contacto._id}')" title="Enviar mensaje">◈</button>
                    <button class="favorito ${esFavorito ? 'active' : ''}" onclick="toggleFavorito('${contacto._id}')" title="Favorito">◆</button>
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
        const matchWallet = c.walletAddress?.toLowerCase().includes(query) || false;
        const matchBusqueda = matchNombre || matchWallet;

        let matchFiltro = true;
        if (filtroActual === 'online') {
            matchFiltro = c.estado === 'conectado';
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
// IR A MENSAJES
// ================================================================
function irAMensajes(contactoId) {
    window.location.href = `/features/mensajes/mensajes.html?contacto=${contactoId}`;
}

// ================================================================
// TOGGLE FAVORITO (Desde Supabase)
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

        const { error } = await supabase
            .from('contactos')
            .update({ es_favorito: !contacto.esFavorito })
            .eq('usuario_id', session.user.id)
            .eq('contacto_id', contactoId);

        if (error) throw error;

        // Actualizar localmente
        contacto.esFavorito = !contacto.esFavorito;
        aplicarFiltros();
        showToast(contacto.esFavorito ? '◆ Agregado a favoritos' : '◆ Favorito eliminado');
    } catch (error) {
        console.error('Error actualizando favorito:', error);
        showToast('❌ Error al actualizar favorito', 'error');
    }
}

// ================================================================
// ELIMINAR CONTACTO (Desde Supabase)
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
// AGREGAR CONTACTO (Desde Supabase)
// ================================================================
async function abrirAgregarContacto() {
    const wallet = prompt('◈ Ingresa la dirección wallet del usuario:');
    if (!wallet || wallet.length < 10) {
        showToast('⚠️ Ingresa una wallet válida', 'warning');
        return;
    }

    const session = await getSession();
    if (!session) {
        showToast('⚠️ Inicia sesión para agregar contactos', 'error');
        return;
    }

    try {
        // Buscar usuario por wallet
        const { data: usuario, error: buscarError } = await supabase
            .from('usuarios')
            .select('id, nombre')
            .eq('wallet_address', wallet)
            .single();

        if (buscarError || !usuario) {
            showToast('❌ Usuario no encontrado', 'error');
            return;
        }

        // Agregar como contacto
        const { error: addError } = await supabase
            .from('contactos')
            .insert({
                usuario_id: session.user.id,
                contacto_id: usuario.id
            });

        if (addError) throw addError;

        showToast('✅ Contacto agregado');
        cargarContactos();
    } catch (error) {
        console.error('Error agregando contacto:', error);
        showToast('❌ Error al agregar contacto', 'error');
    }
}

// ================================================================
// FILTROS UI
// ================================================================
document.querySelectorAll('.filtro').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filtro').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        filtroActual = this.dataset.filtro;
        aplicarFiltros();
    });
});

// ================================================================
// BÚSQUEDA
// ================================================================
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', function() {
        aplicarFiltros();
    });
}

// ================================================================
// AGREGAR CONTACTO (BOTÓN)
// ================================================================
const btnAgregar = document.getElementById('btnAgregar');
if (btnAgregar) {
    btnAgregar.addEventListener('click', abrirAgregarContacto);
}

// ================================================================
// INICIALIZAR
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    await cargarContactos();
});

// ================================================================
// EXPONER FUNCIONES GLOBALES
// ================================================================
window.cargarContactos = cargarContactos;
window.irAMensajes = irAMensajes;
window.toggleFavorito = toggleFavorito;
window.eliminarContacto = eliminarContacto;
window.abrirAgregarContacto = abrirAgregarContacto;
window.showToast = showToast;