// ================================================================
// MENSAJES · CANALES Y GRUPOS
// ================================================================
// Pestañas, listas, filtros y creación de canales y grupos.
// Depende de: config, utils, auth, conversaciones.
// ================================================================

// ================================================================
// ESTADO LOCAL
// ================================================================
var pestanaActual = 'chats';
var _canalesDebounce = null;
var _gruposDebounce = null;

// ================================================================
// CAMBIAR DE PESTAÑA (Chats / Canales / Grupos)
// ================================================================
function cambiarPestana(nombre) {
    pestanaActual = nombre;

    // Actualizar botones de tabs
    var tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === nombre);
    });

    // Actualizar contenido
    var tabChats = $('tabChats');
    var tabCanales = $('tabCanales');
    var tabGrupos = $('tabGrupos');

    if (tabChats) tabChats.classList.toggle('hidden', nombre !== 'chats');
    if (tabCanales) tabCanales.classList.toggle('hidden', nombre !== 'canales');
    if (tabGrupos) tabGrupos.classList.toggle('hidden', nombre !== 'grupos');

    // Cargar contenido
    if (nombre === 'canales') {
        cargarCanales();
    } else if (nombre === 'grupos') {
        cargarGrupos();
    }
}

// ================================================================
// BOTÓN "+" DINÁMICO
// ================================================================
function onNuevoClick() {
    if (pestanaActual === 'chats') {
        newConversation();
    } else if (pestanaActual === 'canales') {
        abrirModalCrearCanal();
    } else if (pestanaActual === 'grupos') {
        abrirModalCrearGrupo();
    }
}

// ================================================================
// DEBOUNCE PARA BÚSQUEDAS
// ================================================================
function buscarCanalesDebounce() {
    clearTimeout(_canalesDebounce);
    _canalesDebounce = setTimeout(function() { cargarCanales(); }, 350);
}

function buscarGruposDebounce() {
    clearTimeout(_gruposDebounce);
    _gruposDebounce = setTimeout(function() { cargarGrupos(); }, 350);
}

// ================================================================
// CARGAR CANALES
// ================================================================
async function cargarCanales() {
    var cont = $('canalesLista');
    if (!cont) return;

    cont.innerHTML = '<div class="empty-state-small">' +
        '<div class="empty-icon">✦</div>' +
        '<div class="empty-text">Cargando canales...</div>' +
    '</div>';

    if (!user) {
        cont.innerHTML = '<div class="empty-state-small">' +
            '<div class="empty-icon">✦</div>' +
            '<div class="empty-text">Inicia sesión para ver canales</div>' +
        '</div>';
        return;
    }

    try {
        var busqueda = ($('searchCanales') && $('searchCanales').value || '').trim();
        var filtroEstado = ($('filtroEstadoCanal') && $('filtroEstadoCanal').value || '');
        var filtroCategoria = ($('filtroCategoriaCanal') && $('filtroCategoriaCanal').value || '');

        var q = db.from('canales')
            .select('id, nombre, descripcion, avatar_url, estado, municipio, categoria, created_at')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (busqueda) q = q.ilike('nombre', '%' + busqueda + '%');
        if (filtroEstado) q = q.eq('estado', filtroEstado);
        if (filtroCategoria) q = q.eq('categoria', filtroCategoria);

        var r = await q;

        if (r.error) {
            console.warn('[Mensajes] Error cargando canales:', r.error);
            cont.innerHTML = '<div class="empty-state-small">' +
                '<div class="empty-icon">✦</div>' +
                '<div class="empty-text">No se pudieron cargar los canales</div>' +
            '</div>';
            return;
        }

        if (!r.data || !r.data.length) {
            cont.innerHTML = '<div class="empty-state-small">' +
                '<div class="empty-icon">✦</div>' +
                '<div class="empty-text">Aún no hay canales</div>' +
            '</div>';
            return;
        }

        cont.innerHTML = '';
        r.data.forEach(function(c) {
            var inicial = (c.nombre || '✦').charAt(0).toUpperCase();
            var avatarHTML = c.avatar_url
                ? '<img src="' + esc(c.avatar_url) + '" alt="">'
                : esc(inicial);

            var item = document.createElement('div');
            item.className = 'canal-item';
            item.dataset.id = c.id;
            item.style.cssText = 'display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(212,175,55,.08);cursor:pointer;';

            item.innerHTML =
                '<div class="avatar" style="width:42px;height:42px;flex:0 0 42px;">' + avatarHTML + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:700;font-size:.82rem;">' + esc(c.nombre || 'Canal') + '</div>' +
                    '<div style="font-size:.68rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                        esc(c.descripcion || (c.municipio || '') + (c.estado ? ', ' + c.estado : '')) +
                    '</div>' +
                '</div>';

            item.onclick = function() { abrirCanalOGrupo(c.id, 'canal'); };
            cont.appendChild(item);
        });
    } catch (e) {
        console.error('[Mensajes] Error cargando canales:', e);
        cont.innerHTML = '<div class="empty-state-small">' +
            '<div class="empty-icon">✦</div>' +
            '<div class="empty-text">Error cargando canales</div>' +
        '</div>';
    }
}

// ================================================================
// CARGAR GRUPOS
// ================================================================
async function cargarGrupos() {
    var cont = $('gruposLista');
    if (!cont) return;

    cont.innerHTML = '<div class="empty-state-small">' +
        '<div class="empty-icon">◆</div>' +
        '<div class="empty-text">Cargando grupos...</div>' +
    '</div>';

    if (!user) {
        cont.innerHTML = '<div class="empty-state-small">' +
            '<div class="empty-icon">◆</div>' +
            '<div class="empty-text">Inicia sesión para ver grupos</div>' +
        '</div>';
        return;
    }

    try {
        var busqueda = ($('searchGrupos') && $('searchGrupos').value || '').trim();
        var filtroEstado = ($('filtroEstadoGrupo') && $('filtroEstadoGrupo').value || '');
        var filtroCategoria = ($('filtroCategoriaGrupo') && $('filtroCategoriaGrupo').value || '');

        var q = db.from('grupos')
            .select('id, nombre, descripcion, avatar_url, estado, municipio, categoria, created_at')
            .eq('activo', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (busqueda) q = q.ilike('nombre', '%' + busqueda + '%');
        if (filtroEstado) q = q.eq('estado', filtroEstado);
        if (filtroCategoria) q = q.eq('categoria', filtroCategoria);

        var r = await q;

        if (r.error) {
            console.warn('[Mensajes] Error cargando grupos:', r.error);
            cont.innerHTML = '<div class="empty-state-small">' +
                '<div class="empty-icon">◆</div>' +
                '<div class="empty-text">No se pudieron cargar los grupos</div>' +
            '</div>';
            return;
        }

        if (!r.data || !r.data.length) {
            cont.innerHTML = '<div class="empty-state-small">' +
                '<div class="empty-icon">◆</div>' +
                '<div class="empty-text">Aún no hay grupos</div>' +
            '</div>';
            return;
        }

        cont.innerHTML = '';
        r.data.forEach(function(g) {
            var inicial = (g.nombre || '◆').charAt(0).toUpperCase();
            var avatarHTML = g.avatar_url
                ? '<img src="' + esc(g.avatar_url) + '" alt="">'
                : esc(inicial);

            var item = document.createElement('div');
            item.className = 'grupo-item';
            item.dataset.id = g.id;
            item.style.cssText = 'display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(212,175,55,.08);cursor:pointer;';

            item.innerHTML =
                '<div class="avatar" style="width:42px;height:42px;flex:0 0 42px;">' + avatarHTML + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:700;font-size:.82rem;">' + esc(g.nombre || 'Grupo') + '</div>' +
                    '<div style="font-size:.68rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                        esc(g.descripcion || (g.municipio || '') + (g.estado ? ', ' + g.estado : '')) +
                    '</div>' +
                '</div>';

            item.onclick = function() { abrirCanalOGrupo(g.id, 'grupo'); };
            cont.appendChild(item);
        });
    } catch (e) {
        console.error('[Mensajes] Error cargando grupos:', e);
        cont.innerHTML = '<div class="empty-state-small">' +
            '<div class="empty-icon">◆</div>' +
            '<div class="empty-text">Error cargando grupos</div>' +
        '</div>';
    }
}

// ================================================================
// ABRIR CANAL O GRUPO
// ================================================================
function abrirCanalOGrupo(id, tipo) {
    // Placeholder: en el futuro se puede abrir el canal/grupo completo
    toast('ℹ️ ' + (tipo === 'canal' ? 'Canal' : 'Grupo') + ' seleccionado', 'warning');
}

// ================================================================
// MODAL CREAR CANAL
// ================================================================
function abrirModalCrearCanal() {
    var m = $('modalCrearCanal');
    if (m) m.classList.add('show');

    ['canalNombre', 'canalDescripcion', 'canalEstado', 'canalMunicipio', 'canalCiudad'].forEach(function(fid) {
        var el = $(fid);
        if (el) el.value = '';
    });
}

function cerrarModalCrearCanal() {
    var m = $('modalCrearCanal');
    if (m) m.classList.remove('show');
}

async function crearCanal() {
    if (!await auth()) return;

    var nombre = ($('canalNombre') && $('canalNombre').value || '').trim();
    var descripcion = ($('canalDescripcion') && $('canalDescripcion').value || '').trim();
    var estado = ($('canalEstado') && $('canalEstado').value || '').trim();
    var municipio = ($('canalMunicipio') && $('canalMunicipio').value || '').trim();
    var ciudad = ($('canalCiudad') && $('canalCiudad').value || '').trim();
    var pais = ($('canalPais') && $('canalPais').value || 'México').trim();

    if (!nombre) {
        toast('⚠️ El nombre es obligatorio', 'error');
        return;
    }
    if (!municipio) {
        toast('⚠️ El municipio es obligatorio', 'error');
        return;
    }

    var btn = $('btnCrearCanal');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Creando...';
    }

    try {
        var r = await db.from('canales').insert({
            creador_id: user.id,
            nombre: nombre,
            descripcion: descripcion || null,
            estado: estado || null,
            municipio: municipio,
            ciudad: ciudad || null,
            pais: pais,
            activo: true
        });

        if (r.error) throw r.error;

        toast('✅ Canal creado', 'success');
        cerrarModalCrearCanal();
        cargarCanales();
    } catch (e) {
        console.error('[Mensajes] Error creando canal:', e);
        toast('❌ Error: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✦ Crear Canal';
        }
    }
}

// ================================================================
// MODAL CREAR GRUPO
// ================================================================
function abrirModalCrearGrupo() {
    var m = $('modalCrearGrupo');
    if (m) m.classList.add('show');

    ['grupoNombre', 'grupoDescripcion', 'grupoEstado', 'grupoMunicipio', 'grupoCiudad'].forEach(function(fid) {
        var el = $(fid);
        if (el) el.value = '';
    });
}

function cerrarModalCrearGrupo() {
    var m = $('modalCrearGrupo');
    if (m) m.classList.remove('show');
}

async function crearGrupo() {
    if (!await auth()) return;

    var nombre = ($('grupoNombre') && $('grupoNombre').value || '').trim();
    var descripcion = ($('grupoDescripcion') && $('grupoDescripcion').value || '').trim();
    var estado = ($('grupoEstado') && $('grupoEstado').value || '').trim();
    var municipio = ($('grupoMunicipio') && $('grupoMunicipio').value || '').trim();
    var ciudad = ($('grupoCiudad') && $('grupoCiudad').value || '').trim();
    var pais = ($('grupoPais') && $('grupoPais').value || 'México').trim();

    if (!nombre) {
        toast('⚠️ El nombre es obligatorio', 'error');
        return;
    }
    if (!municipio) {
        toast('⚠️ El municipio es obligatorio', 'error');
        return;
    }

    var btn = $('btnCrearGrupo');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Creando...';
    }

    try {
        var r = await db.from('grupos').insert({
            creador_id: user.id,
            nombre: nombre,
            descripcion: descripcion || null,
            estado: estado || null,
            municipio: municipio,
            ciudad: ciudad || null,
            pais: pais,
            activo: true
        });

        if (r.error) throw r.error;

        toast('✅ Grupo creado', 'success');
        cerrarModalCrearGrupo();
        cargarGrupos();
    } catch (e) {
        console.error('[Mensajes] Error creando grupo:', e);
        toast('❌ Error: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '◆ Crear Grupo';
        }
    }
}

console.log('[Mensajes] ✅ Canales y Grupos cargado');