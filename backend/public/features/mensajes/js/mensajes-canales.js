// ================================================================
// MENSAJES · CANALES Y GRUPOS (puente con grupos.html)
// ================================================================
// Tabs Chats/Canales/Grupos dentro de mensajes. Lista canales
// públicos y grupos privados desde tabla grupos_video. Al hacer
// click redirige a /features/grupos/grupos.html?grupo=ID
//
// Se carga DESPUÉS de config, utils, auth, conversaciones, chat, bot, archivos.
//
// FUENTE DE VERDAD: monolítico mensajes.html original + grupos-config.js
// COMPATIBLE CON: tabla grupos_video (integración de ecosistema).
// ================================================================

'use strict';

// ================================================================
// ESTADO INTERNO
// ================================================================
var _canalesTimer = null;
var _gruposTimer = null;
var _pestanaActual = 'chats';

// ================================================================
// GENERAR SLUG (para crear canal/grupo)
// ================================================================
function generarSlug(nombre) {
    var slug = (nombre || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // quitar acentos
        .replace(/[^a-z0-9\s-]/g, '')     // quitar caracteres especiales
        .replace(/\s+/g, '-')             // espacios → guiones
        .replace(/-+/g, '-')              // múltiples guiones → uno
        .replace(/^-|-$/g, '');           // quitar guiones al inicio/fin

    if (!slug) slug = 'grupo';
    return slug + '-' + Date.now();
}

// ================================================================
// CAMBIAR DE PESTAÑA (Chats / Canales / Grupos)
// ================================================================
function cambiarPestana(pestana) {
    _pestanaActual = pestana;

    // Actualizar botones de tabs
    document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === pestana);
    });

    // Actualizar contenido visible
    var tabChats = document.getElementById('tabChats');
    var tabCanales = document.getElementById('tabCanales');
    var tabGrupos = document.getElementById('tabGrupos');

    if (tabChats) tabChats.classList.toggle('hidden', pestana !== 'chats');
    if (tabCanales) tabCanales.classList.toggle('hidden', pestana !== 'canales');
    if (tabGrupos) tabGrupos.classList.toggle('hidden', pestana !== 'grupos');

    // Actualizar title del FAB (+)
    var fab = document.getElementById('newChat');
    if (fab) {
        if (pestana === 'chats') fab.title = 'Nueva conversación';
        else if (pestana === 'canales') fab.title = 'Nuevo canal';
        else if (pestana === 'grupos') fab.title = 'Nuevo grupo';
    }

    // Cargar datos de la pestaña activa
    if (pestana === 'canales') cargarCanales();
    else if (pestana === 'grupos') cargarGrupos();
}

// ================================================================
// BOTÓN FLOTANTE "+" (según pestaña)
// ================================================================
function onNuevoClick() {
    if (_pestanaActual === 'chats') newConversation();
    else if (_pestanaActual === 'canales') abrirModalCrearCanal();
    else if (_pestanaActual === 'grupos') abrirModalCrearGrupo();
}

// ================================================================
// BUSCADORES CON DEBOUNCE
// ================================================================
function buscarCanalesDebounce() {
    if (_canalesTimer) clearTimeout(_canalesTimer);
    _canalesTimer = setTimeout(cargarCanales, 300);
}

function buscarGruposDebounce() {
    if (_gruposTimer) clearTimeout(_gruposTimer);
    _gruposTimer = setTimeout(cargarGrupos, 300);
}

// ================================================================
// CARGAR CANALES (públicos)
// ================================================================
async function cargarCanales() {
    var lista = document.getElementById('canalesLista');
    if (!lista) return;

    if (!await auth()) return;

    lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">✦</div><div class="empty-text">Cargando canales...</div></div>';

    try {
        var result = await db
            .from('grupos_video')
            .select('*')
            .eq('visibilidad', 'publico')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (result.error) {
            console.error('[Mensajes/Canales] Error Supabase:', result.error);
            throw result.error;
        }

        var canales = result.data || [];

        // Filtro de búsqueda
        var searchInput = document.getElementById('searchCanales');
        var buscar = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';

        if (buscar) {
            canales = canales.filter(function(c) {
                return (c.nombre || '').toLowerCase().indexOf(buscar) !== -1 ||
                       (c.descripcion || '').toLowerCase().indexOf(buscar) !== -1;
            });
        }

        if (canales.length === 0) {
            lista.innerHTML =
                '<div class="empty-state-small">' +
                    '<div class="empty-icon">✦</div>' +
                    '<div class="empty-text">Aún no hay canales públicos</div>' +
                    '<button class="empty-btn" onclick="abrirModalCrearCanal()">Crear el primero</button>' +
                '</div>';
            return;
        }

        lista.innerHTML = canales.map(function(c) {
            return renderCanalCard(c, 'canal');
        }).join('');

        actualizarFiltros('canal', canales);
    } catch (e) {
        console.error('[Mensajes/Canales] Error:', e);
        lista.innerHTML =
            '<div class="empty-state-small">' +
                '<div class="empty-icon">!</div>' +
                '<div class="empty-text">No se pudieron cargar los canales</div>' +
                '<div style="font-size:.6rem;color:#ff3366;margin-top:8px;padding:8px;background:rgba(255,51,102,.1);border-radius:8px;max-width:100%;word-break:break-all;">' +
                    esc(e.message || 'Error desconocido') +
                '</div>' +
            '</div>';
    }
}

// ================================================================
// CARGAR GRUPOS (privados)
// ================================================================
async function cargarGrupos() {
    var lista = document.getElementById('gruposLista');
    if (!lista) return;

    if (!await auth()) return;

    lista.innerHTML = '<div class="empty-state-small"><div class="empty-icon">◆</div><div class="empty-text">Cargando grupos...</div></div>';

    try {
        var result = await db
            .from('grupos_video')
            .select('*')
            .eq('visibilidad', 'privado')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (result.error) {
            console.error('[Mensajes/Grupos] Error Supabase:', result.error);
            throw result.error;
        }

        var grupos = result.data || [];

        // Filtro de búsqueda
        var searchInput = document.getElementById('searchGrupos');
        var buscar = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';

        if (buscar) {
            grupos = grupos.filter(function(g) {
                return (g.nombre || '').toLowerCase().indexOf(buscar) !== -1 ||
                       (g.descripcion || '').toLowerCase().indexOf(buscar) !== -1;
            });
        }

        if (grupos.length === 0) {
            lista.innerHTML =
                '<div class="empty-state-small">' +
                    '<div class="empty-icon">◆</div>' +
                    '<div class="empty-text">Aún no hay grupos privados</div>' +
                    '<button class="empty-btn" onclick="abrirModalCrearGrupo()">Crear el primero</button>' +
                '</div>';
            return;
        }

        lista.innerHTML = grupos.map(function(g) {
            return renderCanalCard(g, 'grupo');
        }).join('');

        actualizarFiltros('grupo', grupos);
    } catch (e) {
        console.error('[Mensajes/Grupos] Error:', e);
        lista.innerHTML =
            '<div class="empty-state-small">' +
                '<div class="empty-icon">!</div>' +
                '<div class="empty-text">No se pudieron cargar los grupos</div>' +
                '<div style="font-size:.6rem;color:#ff3366;margin-top:8px;padding:8px;background:rgba(255,51,102,.1);border-radius:8px;max-width:100%;word-break:break-all;">' +
                    esc(e.message || 'Error desconocido') +
                '</div>' +
            '</div>';
    }
}

// ================================================================
// RENDERIZAR TARJETA DE CANAL / GRUPO
// ================================================================
function renderCanalCard(item, tipo) {
    var esCanal = tipo === 'canal';
    var inicial = (item.nombre || '◈').charAt(0).toUpperCase();
    var avatarHTML = (item.avatar_url && urlSegura(item.avatar_url))
        ? '<img src="' + esc(item.avatar_url) + '" alt="">'
        : esc(inicial);

    var claseAvatar = esCanal ? 'canal-avatar' : 'canal-avatar privado';
    var claseCard = esCanal ? 'canal-card publico' : 'canal-card privado';
    var badgeVisibilidad = esCanal
        ? '<span class="canal-badge publico">✦ Público</span>'
        : '<span class="canal-badge privado">◆ Privado</span>';

    var badgeMarketplace = item.marketplace_activo
        ? '<span class="canal-badge marketplace">▸ Marketplace</span>'
        : '';

    // Ubicación
    var ubicacion = [];
    if (item.municipio) ubicacion.push(item.municipio);
    if (item.estado_region) ubicacion.push(item.estado_region);
    var ubicacionTexto = ubicacion.length > 0 ? ubicacion.join(', ') : 'Sin ubicación';

    var itemId = esc(String(item.id || ''));

    return '<div class="' + claseCard + '" onclick="abrirCanalOGrupo(\'' + itemId + '\', \'' + tipo + '\')">' +
        '<div class="' + claseAvatar + '">' + avatarHTML + '</div>' +
        '<div class="canal-info">' +
            '<div class="canal-nombre">' + esc(item.nombre || 'Sin nombre') + '</div>' +
            '<div class="canal-desc">' + esc((item.descripcion || '').substring(0, 100) || 'Sin descripción') + '</div>' +
            '<div class="canal-meta">' +
                badgeVisibilidad +
                badgeMarketplace +
                '<span>' + esc(ubicacionTexto) + '</span>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ================================================================
// ACTUALIZAR FILTROS (select de estados)
// ================================================================
function actualizarFiltros(tipo, items) {
    var selectEstadoId = tipo === 'canal' ? 'filtroEstadoCanal' : 'filtroEstadoGrupo';
    var select = document.getElementById(selectEstadoId);
    if (!select) return;

    var estados = {};
    items.forEach(function(i) {
        if (i.estado_region) estados[i.estado_region] = true;
    });

    var valorActual = select.value;
    select.innerHTML = '<option value="">Todos los estados</option>';

    Object.keys(estados).sort().forEach(function(e) {
        var opt = document.createElement('option');
        opt.value = e;
        opt.textContent = e;
        select.appendChild(opt);
    });

    // Restaurar valor si aún existe
    if (valorActual && estados[valorActual]) {
        select.value = valorActual;
    }
}

// ================================================================
// ABRIR CANAL / GRUPO → redirige al módulo grupos.html
// ================================================================
function abrirCanalOGrupo(id, tipo) {
    if (!id) return;
    window.location.href = '/features/grupos/grupos.html?grupo=' + encodeURIComponent(id);
}

// ================================================================
// MODAL CREAR CANAL
// ================================================================
function abrirModalCrearCanal() {
    var modal = document.getElementById('modalCrearCanal');
    if (modal) modal.classList.add('show');

    setTimeout(function() {
        var input = document.getElementById('canalNombre');
        if (input) input.focus();
    }, 100);
}

function cerrarModalCrearCanal() {
    var modal = document.getElementById('modalCrearCanal');
    if (modal) modal.classList.remove('show');
}

// ================================================================
// MODAL CREAR GRUPO
// ================================================================
function abrirModalCrearGrupo() {
    var modal = document.getElementById('modalCrearGrupo');
    if (modal) modal.classList.add('show');

    setTimeout(function() {
        var input = document.getElementById('grupoNombre');
        if (input) input.focus();
    }, 100);
}

function cerrarModalCrearGrupo() {
    var modal = document.getElementById('modalCrearGrupo');
    if (modal) modal.classList.remove('show');
}

// ================================================================
// CREAR CANAL (público)
// ================================================================
async function crearCanal() {
    if (!await auth()) return;

    var nombre = (document.getElementById('canalNombre')?.value || '').trim();
    var descripcion = (document.getElementById('canalDescripcion')?.value || '').trim();
    var estado = (document.getElementById('canalEstado')?.value || '').trim();
    var municipio = (document.getElementById('canalMunicipio')?.value || '').trim();
    var ciudad = (document.getElementById('canalCiudad')?.value || '').trim();
    var pais = (document.getElementById('canalPais')?.value || 'México').trim();

    // Validaciones
    if (!nombre) { toast('⚠️ El nombre es obligatorio', 'error'); return; }
    if (!municipio) { toast('⚠️ El municipio es obligatorio', 'error'); return; }
    if (nombre.length > 80) { toast('⚠️ El nombre es muy largo', 'error'); return; }

    var btn = document.getElementById('btnCrearCanal');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }

    try {
        var slug = generarSlug(nombre);

        var result = await db.from('grupos_video').insert({
            creador_id: user.id,
            categoria_id: null,
            nombre: nombre,
            slug: slug,
            descripcion: descripcion || null,
            ciudad: ciudad || null,
            estado_region: estado || null,
            municipio: municipio,
            pais: pais,
            visibilidad: 'publico',
            modo_ingreso: 'abierto',
            precio_usdt: 0,
            marketplace_activo: false,
            activo: true,
            firma_ligera: 'Yo me hago cargo de lo que digo aquí'
        }).select().single();

        if (result.error) {
            console.error('[Mensajes/Canales] Error INSERT:', result.error);
            throw result.error;
        }

        toast('✅ Canal creado correctamente', 'success');
        cerrarModalCrearCanal();

        // Limpiar campos
        ['canalNombre','canalDescripcion','canalEstado','canalMunicipio','canalCiudad'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        await cargarCanales();
    } catch (e) {
        console.error('[Mensajes/Canales] Error creando:', e);
        toast('❌ Error: ' + (e.message || 'desconocido'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✦ Crear Canal'; }
    }
}

// ================================================================
// CREAR GRUPO (privado)
// ================================================================
async function crearGrupo() {
    if (!await auth()) return;

    var nombre = (document.getElementById('grupoNombre')?.value || '').trim();
    var descripcion = (document.getElementById('grupoDescripcion')?.value || '').trim();
    var estado = (document.getElementById('grupoEstado')?.value || '').trim();
    var municipio = (document.getElementById('grupoMunicipio')?.value || '').trim();
    var ciudad = (document.getElementById('grupoCiudad')?.value || '').trim();
    var pais = (document.getElementById('grupoPais')?.value || 'México').trim();

    // Validaciones
    if (!nombre) { toast('⚠️ El nombre es obligatorio', 'error'); return; }
    if (!municipio) { toast('⚠️ El municipio es obligatorio', 'error'); return; }
    if (nombre.length > 80) { toast('⚠️ El nombre es muy largo', 'error'); return; }

    var btn = document.getElementById('btnCrearGrupo');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }

    try {
        var slug = generarSlug(nombre);

        var result = await db.from('grupos_video').insert({
            creador_id: user.id,
            categoria_id: null,
            nombre: nombre,
            slug: slug,
            descripcion: descripcion || null,
            ciudad: ciudad || null,
            estado_region: estado || null,
            municipio: municipio,
            pais: pais,
            visibilidad: 'privado',
            modo_ingreso: 'invitacion',
            precio_usdt: 0,
            marketplace_activo: false,
            activo: true,
            firma_ligera: 'Yo me hago cargo de lo que digo aquí'
        }).select().single();

        if (result.error) {
            console.error('[Mensajes/Grupos] Error INSERT:', result.error);
            throw result.error;
        }

        toast('✅ Grupo creado correctamente', 'success');
        cerrarModalCrearGrupo();

        // Limpiar campos
        ['grupoNombre','grupoDescripcion','grupoEstado','grupoMunicipio','grupoCiudad'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        await cargarGrupos();
    } catch (e) {
        console.error('[Mensajes/Grupos] Error creando:', e);
        toast('❌ Error: ' + (e.message || 'desconocido'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '◆ Crear Grupo'; }
    }
}

// ================================================================
// EXPOSICIÓN GLOBAL
// ================================================================
window.cambiarPestana = cambiarPestana;
window.onNuevoClick = onNuevoClick;
window.buscarCanalesDebounce = buscarCanalesDebounce;
window.buscarGruposDebounce = buscarGruposDebounce;
window.cargarCanales = cargarCanales;
window.cargarGrupos = cargarGrupos;
window.renderCanalCard = renderCanalCard;
window.abrirCanalOGrupo = abrirCanalOGrupo;
window.abrirModalCrearCanal = abrirModalCrearCanal;
window.cerrarModalCrearCanal = cerrarModalCrearCanal;
window.abrirModalCrearGrupo = abrirModalCrearGrupo;
window.cerrarModalCrearGrupo = cerrarModalCrearGrupo;
window.crearCanal = crearCanal;
window.crearGrupo = crearGrupo;
window.generarSlug = generarSlug;

// ================================================================
// LOG FINAL
// ================================================================
if (window.DEBUG_CHAT) {
    console.log('[Mensajes/Canales] ✅ Canales y Grupos cargado');
}