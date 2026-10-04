// ================================================================
// MENSAJES · CANALES Y GRUPOS
// ================================================================
// Usa la tabla real: grupos_video (con visibilidad publico/privado).
// Depende de: config, utils, auth, conversaciones.
// ================================================================

// ================================================================
// VARIABLES LOCALES
// ================================================================
var _canalesTimer = null;
var _gruposTimer = null;
var _pestanaActual = 'chats';

// ================================================================
// CAMBIAR DE PESTAÑA
// ================================================================
function cambiarPestana(pestana) {
    _pestanaActual = pestana;

    document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === pestana);
    });

    var tabChats = document.getElementById('tabChats');
    var tabCanales = document.getElementById('tabCanales');
    var tabGrupos = document.getElementById('tabGrupos');

    if (tabChats) tabChats.classList.toggle('hidden', pestana !== 'chats');
    if (tabCanales) tabCanales.classList.toggle('hidden', pestana !== 'canales');
    if (tabGrupos) tabGrupos.classList.toggle('hidden', pestana !== 'grupos');

    var fab = document.getElementById('newChat');
    if (fab) {
        if (pestana === 'chats') fab.title = 'Nueva conversación';
        else if (pestana === 'canales') fab.title = 'Nuevo canal';
        else if (pestana === 'grupos') fab.title = 'Nuevo grupo';
    }

    if (pestana === 'canales') cargarCanales();
    else if (pestana === 'grupos') cargarGrupos();
}

// ================================================================
// BOTÓN FLOTANTE "+"
// ================================================================
function onNuevoClick() {
    if (_pestanaActual === 'chats') {
        newConversation();
    } else if (_pestanaActual === 'canales') {
        abrirModalCrearCanal();
    } else if (_pestanaActual === 'grupos') {
        abrirModalCrearGrupo();
    }
}

// ================================================================
// DEBOUNCE DE BUSCADORES
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
// CARGAR CANALES (visibilidad = 'publico')
// ================================================================
async function cargarCanales() {
    var lista = document.getElementById('canalesLista');
    if (!lista) return;

    if (!await auth()) return;

    lista.innerHTML = '<div class="empty-state-small">' +
        '<div class="empty-icon">✦</div>' +
        '<div class="empty-text">Cargando canales...</div>' +
    '</div>';

    try {
        var searchEl = document.getElementById('searchCanales');
        var buscar = (searchEl ? searchEl.value : '').trim();

        var estadoEl = document.getElementById('filtroEstadoCanal');
        var filtroEstado = estadoEl ? estadoEl.value : '';

        var catEl = document.getElementById('filtroCategoriaCanal');
        var filtroCategoria = catEl ? catEl.value : '';

        buscar = buscar.replace(/[(),%*\\]/g, ' ').trim();

        var query = db
            .from('grupos_video')
            .select('id, nombre, descripcion, avatar_url, municipio, estado_region, visibilidad, precio_usdt, marketplace_activo, categoria_id, created_at')
            .eq('visibilidad', 'publico')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (buscar) {
            query = query.or('nombre.ilike.%' + buscar + '%,descripcion.ilike.%' + buscar + '%');
        }
        if (filtroEstado) {
            query = query.eq('estado_region', filtroEstado);
        }
        if (filtroCategoria) {
            query = query.eq('categoria_id', filtroCategoria);
        }

        var result = await query;
        if (result.error) throw result.error;

        var canales = result.data || [];

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
        console.error('[Canales] Error:', e);
        lista.innerHTML = '<div class="empty-state-small">' +
            '<div class="empty-icon">!</div>' +
            '<div class="empty-text">Error al cargar canales</div>' +
        '</div>';
    }
}

// ================================================================
// CARGAR GRUPOS (visibilidad = 'privado')
// ================================================================
async function cargarGrupos() {
    var lista = document.getElementById('gruposLista');
    if (!lista) return;

    if (!await auth()) return;

    lista.innerHTML = '<div class="empty-state-small">' +
        '<div class="empty-icon">◆</div>' +
        '<div class="empty-text">Cargando grupos...</div>' +
    '</div>';

    try {
        var searchEl = document.getElementById('searchGrupos');
        var buscar = (searchEl ? searchEl.value : '').trim();

        var estadoEl = document.getElementById('filtroEstadoGrupo');
        var filtroEstado = estadoEl ? estadoEl.value : '';

        var catEl = document.getElementById('filtroCategoriaGrupo');
        var filtroCategoria = catEl ? catEl.value : '';

        buscar = buscar.replace(/[(),%*\\]/g, ' ').trim();

        var query = db
            .from('grupos_video')
            .select('id, nombre, descripcion, avatar_url, municipio, estado_region, visibilidad, precio_usdt, marketplace_activo, categoria_id, created_at')
            .eq('visibilidad', 'privado')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (buscar) {
            query = query.or('nombre.ilike.%' + buscar + '%,descripcion.ilike.%' + buscar + '%');
        }
        if (filtroEstado) {
            query = query.eq('estado_region', filtroEstado);
        }
        if (filtroCategoria) {
            query = query.eq('categoria_id', filtroCategoria);
        }

        var result = await query;
        if (result.error) throw result.error;

        var grupos = result.data || [];

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
        console.error('[Grupos] Error:', e);
        lista.innerHTML = '<div class="empty-state-small">' +
            '<div class="empty-icon">!</div>' +
            '<div class="empty-text">Error al cargar grupos</div>' +
        '</div>';
    }
}

// ================================================================
// RENDERIZAR TARJETA DE CANAL/GRUPO
// ================================================================
function renderCanalCard(item, tipo) {
    var esCanal = tipo === 'canal';
    var inicial = (item.nombre || '◈').charAt(0).toUpperCase();
    var avatarHTML = item.avatar_url
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

    var ubicacion = [];
    if (item.municipio) ubicacion.push(item.municipio);
    if (item.estado_region) ubicacion.push(item.estado_region);
    var ubicacionTexto = ubicacion.length > 0 ? ubicacion.join(', ') : 'Sin ubicación';

    return '<div class="' + claseCard + '" onclick="abrirCanalOGrupo(\'' + item.id + '\', \'' + tipo + '\')">' +
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
// ACTUALIZAR FILTROS DE ESTADO
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
    select.value = valorActual;
}

// ================================================================
// ABRIR CANAL O GRUPO
// ================================================================
function abrirCanalOGrupo(id, tipo) {
    window.location.href = '/features/grupos/grupos.html?grupo=' + id;
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
// CREAR CANAL (visibilidad = 'publico')
// ================================================================
async function crearCanal() {
    if (!await auth()) return;

    var nombreEl = document.getElementById('canalNombre');
    var descEl = document.getElementById('canalDescripcion');
    var estadoEl = document.getElementById('canalEstado');
    var municipioEl = document.getElementById('canalMunicipio');
    var ciudadEl = document.getElementById('canalCiudad');
    var paisEl = document.getElementById('canalPais');

    var nombre = (nombreEl ? nombreEl.value : '').trim();
    var descripcion = (descEl ? descEl.value : '').trim();
    var estado = (estadoEl ? estadoEl.value : '').trim();
    var municipio = (municipioEl ? municipioEl.value : '').trim();
    var ciudad = (ciudadEl ? ciudadEl.value : '').trim();
    var pais = (paisEl ? paisEl.value : 'México').trim();

    if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
    if (!municipio) { toast('El municipio es obligatorio', 'error'); return; }
    if (nombre.length > 80) { toast('El nombre es muy largo', 'error'); return; }
    if (descripcion.length > 300) { toast('La descripción es muy larga', 'error'); return; }

    var btn = document.getElementById('btnCrearCanal');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creando...';
    }

    try {
        var result = await db.from('grupos_video').insert({
            nombre: nombre,
            descripcion: descripcion || null,
            estado_region: estado || null,
            municipio: municipio,
            ciudad: ciudad || null,
            pais: pais,
            visibilidad: 'publico',
            precio_usdt: 0,
            marketplace_activo: false,
            creador_id: user.id,
            activo: true,
            firma_ligera: 'Yo me hago cargo de lo que digo aquí'
        }).select().single();

        if (result.error) throw result.error;

        toast('Canal creado correctamente', 'success');
        cerrarModalCrearCanal();

        ['canalNombre', 'canalDescripcion', 'canalEstado', 'canalMunicipio', 'canalCiudad'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        await cargarCanales();

        if (result.data && result.data.id) {
            setTimeout(function() {
                abrirCanalOGrupo(result.data.id, 'canal');
            }, 500);
        }
    } catch (e) {
        console.error('[Canales] Error creando:', e);
        toast('Error al crear el canal: ' + (e.message || 'desconocido'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✦ Crear Canal';
        }
    }
}

// ================================================================
// CREAR GRUPO (visibilidad = 'privado')
// ================================================================
async function crearGrupo() {
    if (!await auth()) return;

    var nombreEl = document.getElementById('grupoNombre');
    var descEl = document.getElementById('grupoDescripcion');
    var estadoEl = document.getElementById('grupoEstado');
    var municipioEl = document.getElementById('grupoMunicipio');
    var ciudadEl = document.getElementById('grupoCiudad');
    var paisEl = document.getElementById('grupoPais');

    var nombre = (nombreEl ? nombreEl.value : '').trim();
    var descripcion = (descEl ? descEl.value : '').trim();
    var estado = (estadoEl ? estadoEl.value : '').trim();
    var municipio = (municipioEl ? municipioEl.value : '').trim();
    var ciudad = (ciudadEl ? ciudadEl.value : '').trim();
    var pais = (paisEl ? paisEl.value : 'México').trim();

    if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
    if (!municipio) { toast('El municipio es obligatorio', 'error'); return; }
    if (nombre.length > 80) { toast('El nombre es muy largo', 'error'); return; }
    if (descripcion.length > 300) { toast('La descripción es muy larga', 'error'); return; }

    var btn = document.getElementById('btnCrearGrupo');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creando...';
    }

    try {
        var result = await db.from('grupos_video').insert({
            nombre: nombre,
            descripcion: descripcion || null,
            estado_region: estado || null,
            municipio: municipio,
            ciudad: ciudad || null,
            pais: pais,
            visibilidad: 'privado',
            precio_usdt: 0,
            marketplace_activo: false,
            creador_id: user.id,
            activo: true,
            firma_ligera: 'Yo me hago cargo de lo que digo aquí'
        }).select().single();

        if (result.error) throw result.error;

        toast('Grupo creado correctamente', 'success');
        cerrarModalCrearGrupo();

        ['grupoNombre', 'grupoDescripcion', 'grupoEstado', 'grupoMunicipio', 'grupoCiudad'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        await cargarGrupos();

        if (result.data && result.data.id) {
            setTimeout(function() {
                abrirCanalOGrupo(result.data.id, 'grupo');
            }, 500);
        }
    } catch (e) {
        console.error('[Grupos] Error creando:', e);
        toast('Error al crear el grupo: ' + (e.message || 'desconocido'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '◆ Crear Grupo';
        }
    }
}

console.log('[Mensajes] ✅ Canales y Grupos cargado (usa grupos_video)');