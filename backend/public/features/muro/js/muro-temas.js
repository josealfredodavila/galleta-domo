// ================================================================
// MURO · TEMAS
// ================================================================
// Cargar temas disponibles, dropdown, selector, filtro de temas.
// Depende de: muro-config.js, muro-utils.js
// ================================================================

// ================================================================
// CARGAR TEMAS DISPONIBLES
// ================================================================
async function cargarTemasDisponibles() {
    try {
        var result = await supabaseClient
            .from('temas')
            .select('id, slug, nombre, emoji, orden')
            .eq('activo', true)
            .order('orden', { ascending: true });
        if (result.error) throw result.error;
        temasDisponibles = result.data || [];
        renderTemaDropdown();
    } catch (e) {
        console.error('Error cargando temas:', e);
    }
}

// ================================================================
// RENDERIZAR DROPDOWN DE TEMAS
// ================================================================
function renderTemaDropdown() {
    var dd = document.getElementById('temaDropdown');
    if (!dd) return;
    var html = '<div class="tema-opt' + (temaSeleccionado === null ? ' selected' : '') + '" onclick="seleccionarTema(null)">Sin tema</div>';
    temasDisponibles.forEach(function(t) {
        html += '<div class="tema-opt' + (temaSeleccionado === t.id ? ' selected' : '') + '" onclick="seleccionarTema(\'' + t.id + '\', \'' + escapeHTML(t.nombre) + '\')">' +
            escapeHTML(t.nombre) + '</div>';
    });
    dd.innerHTML = html;
}

// ================================================================
// TOGGLE DROPDOWN
// ================================================================
function toggleTemaDropdown() {
    var dd = document.getElementById('temaDropdown');
    if (!dd) return;
    dd.classList.toggle('show');
}

// ================================================================
// SELECCIONAR TEMA
// ================================================================
function seleccionarTema(id, nombre) {
    temaSeleccionado = id ? id : null;
    var label = document.getElementById('temaSelectorLabel');
    var btn = document.getElementById('btnTemaSelector');
    if (id) {
        if (label) label.textContent = nombre || 'Tema';
        if (btn) btn.classList.add('selected');
    } else {
        if (label) label.textContent = 'Sin tema';
        if (btn) btn.classList.remove('selected');
    }
    renderTemaDropdown();
    var dd = document.getElementById('temaDropdown');
    if (dd) dd.classList.remove('show');
}

// ================================================================
// CERRAR DROPDOWN AL HACER CLICK FUERA
// ================================================================
document.addEventListener('click', function(e) {
    var dd = document.getElementById('temaDropdown');
    var btn = document.getElementById('btnTemaSelector');
    if (!dd || !btn) return;
    if (!dd.contains(e.target) && !btn.contains(e.target)) {
        dd.classList.remove('show');
    }
});

// ================================================================
// CARGAR TEMAS DEL USUARIO (intereses)
// ================================================================
async function cargarTemasUsuario() {
    if (!sessionUser) return;
    try {
        var result = await supabaseClient
            .from('usuarios_temas_interes')
            .select('tema_id')
            .eq('usuario_id', sessionUser.id);
        if (result.error) throw result.error;
        temasUsuario = (result.data || []).map(function(r) { return r.tema_id; });
        actualizarFiltroInfo();
    } catch (e) {
        console.error('Error cargando temas del usuario:', e);
    }
}

// ================================================================
// ACTUALIZAR INFO DEL FILTRO
// ================================================================
function actualizarFiltroInfo() {
    var info = document.getElementById('filtroInfo');
    var btn = document.getElementById('btnFiltroToggle');
    if (!info || !btn) return;
    if (temasUsuario.length === 0) {
        info.textContent = 'No has elegido temas (mostrando todo)';
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Explorar todo';
        btn.classList.add('active');
        filtroTemasActivo = false;
        return;
    }
    if (filtroTemasActivo) {
        info.textContent = 'Filtrando por ' + temasUsuario.length + ' tema' + (temasUsuario.length !== 1 ? 's' : '');
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> Filtro activo';
        btn.classList.add('active');
    } else {
        info.textContent = 'Mostrando todo (tienes ' + temasUsuario.length + ' temas)';
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Explorar todo';
        btn.classList.remove('active');
    }
}

// ================================================================
// TOGGLE FILTRO DE TEMAS
// ================================================================
function toggleFiltroTemas() {
    if (temasUsuario.length === 0) {
        showToast('Primero elige temas en tu perfil', 'warning');
        return;
    }
    filtroTemasActivo = !filtroTemasActivo;
    actualizarFiltroInfo();
    cargarPublicaciones(true);
}