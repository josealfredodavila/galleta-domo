// ================================================================
// GRUPOS · LISTA / DIRECTORIO
// ================================================================
// Listado de canales, filtros, paginación y "Crear Comunidad".
// Depende de: grupos-config.js, grupos-utils.js
// ================================================================

// ================================================================
// DEBOUNCE DE BÚSQUEDA
// ================================================================
function buscarGruposDebounce() {
    if (grpBuscarTimer) clearTimeout(grpBuscarTimer);
    grpBuscarTimer = setTimeout(function() {
        grpPagina = 0;
        cargarGrupos();
    }, 300);
}

async function cargarMasGrupos() {
    grpPagina++;
    await cargarGrupos(true);
}

// ================================================================
// CARGAR GRUPOS (paginado con filtros)
// ================================================================
async function cargarGrupos(esPaginaSiguiente) {
    var grid = document.getElementById('gruposGrid');
    if (!grid) return;

    if (!(await esperarSupabase())) {
        console.error('[Grupos] cargarGrupos: supabaseClient no disponible');
        grid.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h3>Sin conexión a Supabase</h3></div>';
        return;
    }

    if (!esPaginaSiguiente) grpPagina = 0;

    var timeoutId = setTimeout(function() {
        if (grid.querySelector('.empty-state h3')?.textContent.includes('Cargando')) {
            grid.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h3>La carga está tardando</h3><p>Intenta recargar la página</p></div>';
        }
    }, 8000);

    try {
        if (!window.supabaseClient) {
            clearTimeout(timeoutId);
            grid.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg><h3>Sin conexión a Supabase</h3></div>';
            return;
        }

        try {
            if (!sessionUser) {
                await Promise.race([
                    cargarUsuarioActual(),
                    new Promise(function(_, reject) { setTimeout(function() { reject(new Error('timeout usuario')); }, 3000); })
                ]);
            }
        } catch (e) {
            console.warn('[Grupos] Timeout usuario, siguiendo anónimo');
        }

        var buscar = document.getElementById('inputBuscar')?.value?.trim() || '';
        var estado = document.getElementById('selectEstado')?.value || '';
        var municipio = document.getElementById('selectMunicipio')?.value || '';
        var categoria = document.getElementById('selectCategoria')?.value || '';

        buscar = buscar.replace(/[(),%*\\]/g, ' ').trim();

        var query = window.supabaseClient
            .from('grupos_video')
            .select('id, nombre, descripcion, avatar_url, municipio, estado_region, visibilidad, precio_usdt, marketplace_activo')
            .order('created_at', { ascending: false });

        // ✅ NUEVO: solo mostrar canales públicos en el listado general.
        // Los grupos privados solo aparecen en "Mis Canales" del dashboard.
        query = query.eq('visibilidad', 'publico');

        if (buscar) query = query.or(`nombre.ilike.%${buscar}%,descripcion.ilike.%${buscar}%`);
        if (estado) query = query.eq('estado_region', estado);
        if (municipio) query = query.eq('municipio', municipio);
        if (categoria) query = query.eq('categoria_id', parseInt(categoria));

        if (soloMisGrupos && sessionUser) {
            var misGruposResult = await window.supabaseClient
                .from('grupos_video_miembros')
                .select('grupo_id')
                .eq('usuario_id', sessionUser.id)
                .eq('estado', 'activo');
            if (misGruposResult.error) throw misGruposResult.error;
            var ids = (misGruposResult.data || []).map(function(m) { return m.grupo_id; });
            if (ids.length === 0) {
                clearTimeout(timeoutId);
                grid.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg><h3>No sigues ningún canal</h3></div>';
                var btnMasVacio = document.getElementById('btnCargarMasContainer');
                if (btnMasVacio) btnMasVacio.style.display = 'none';
                return;
            }
            query = query.in('id', ids);
        }

        var offsetInicio = grpPagina * grpPaginaSize;
        var offsetFin = offsetInicio + grpPaginaSize - 1;
        query = query.range(offsetInicio, offsetFin);

        var result = await query;
        clearTimeout(timeoutId);

        if (result.error) throw result.error;
        var grupos = result.data || [];

        grpHayMas = grupos.length === grpPaginaSize;

        if (grupos.length === 0 && !esPaginaSiguiente) {
            grid.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg><h3>No hay canales disponibles</h3><p>Activa el primero</p></div>';
            var btnMas = document.getElementById('btnCargarMasContainer');
            if (btnMas) btnMas.style.display = 'none';
            return;
        }

        var liveMap = {};
        try {
            var liveResult = await window.supabaseClient
                .from('transmisiones')
                .select('grupo_id')
                .eq('estado', 'en_vivo')
                .eq('is_live', true);
            (liveResult.data || []).forEach(function(t) { liveMap[t.grupo_id] = true; });
        } catch (e) {
            console.warn('[Grupos] Error lives (ignorado):', e);
        }

        var gruposHTML = grupos.map(function(g) {
            var tieneLive = liveMap[g.id] ? true : false;
            var visibilidad = g.visibilidad || 'publico';
            var visBadge = visibilidad === 'publico'
                ? '<span class="estado-badge"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Público</span>'
                : '<span class="estado-badge privado"><svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Privado</span>';
            var precio = g.precio_usdt > 0
                ? `<span class="precio-badge"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 11h6"/></svg>$${g.precio_usdt} USDT</span>`
                : '';
            var mkBadge = g.marketplace_activo
                ? '<span class="mk-badge"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>Marketplace</span>'
                : '';
            var liveClass = tieneLive ? 'en-vivo' : '';
            var ubicacion = [];
            if (g.municipio) ubicacion.push(g.municipio);
            if (g.estado_region) ubicacion.push(g.estado_region);
            var ubicacionTexto = ubicacion.length > 0 ? ubicacion.join(', ') : 'Sin ubicación';
            var img = grpSafeUrl(g.avatar_url);

            return '<div class="grupo-card ' + liveClass + '" onclick="abrirGrupo(\'' + g.id + '\')">' +
                '<div class="avatar">' + (img ? '<img src="' + grpEscapeHTML(img) + '">' : '◈') + '</div>' +
                '<div class="nombre">' + grpEscapeHTML(g.nombre) + '</div>' +
                '<div class="descripcion">' + grpEscapeHTML((g.descripcion || '').substring(0, 80)) + '</div>' +
                '<div class="meta">' +
                '<span class="ciudad"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + grpEscapeHTML(ubicacionTexto) + '</span>' +
                visBadge + precio + mkBadge +
                (tieneLive ? ' <span class="live-badge"><svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#fff;fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="5"/></svg>EN VIVO</span>' : '') +
                '</div></div>';
        }).join('');

        if (esPaginaSiguiente) {
            grid.insertAdjacentHTML('beforeend', gruposHTML);
        } else {
            grid.innerHTML = gruposHTML;
        }

        var btnMas = document.getElementById('btnCargarMasContainer');
        if (btnMas) btnMas.style.display = grpHayMas ? 'block' : 'none';

    } catch (e) {
        clearTimeout(timeoutId);
        console.error('[Grupos] ERROR cargando canales:', e);
        grid.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg><h3>Error cargando canales</h3><p style="font-size:0.7rem;">' + grpEscapeHTML(e.message || 'Error desconocido') + '</p></div>';
    }
}

// ================================================================
// TOGGLE "MIS GRUPOS" (solo mis canales)
// ================================================================
function toggleMisGrupos() {
    soloMisGrupos = !soloMisGrupos;
    var btn = document.getElementById('btnMisGrupos');
    if (soloMisGrupos) {
        btn.style.borderColor = 'var(--gold)';
        btn.style.color = 'var(--gold)';
        btn.style.boxShadow = '0 0 20px rgba(212,175,55,0.4)';
    } else {
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.boxShadow = '';
    }
    grpPagina = 0;
    cargarGrupos();
}

// ================================================================
// CARGAR CATEGORÍAS / ESTADOS / MUNICIPIOS (para filtros)
// ================================================================
async function cargarCategorias() {
    try {
        var result = await window.supabaseClient
            .from('grupos_video_categorias')
            .select('*')
            .eq('activo', true)
            .order('nombre', { ascending: true });
        if (result.error) throw result.error;
        categoriasCache = result.data || [];
        var select = document.getElementById('selectCategoria');
        if (select) {
            var currentVal = select.value;
            select.innerHTML = '<option value="">Todas las categorías</option>';
            categoriasCache.forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.nombre;
                select.appendChild(opt);
            });
            select.value = currentVal;
        }
    } catch (e) {
        console.warn('[Grupos] Error cargando categorías:', e);
    }
}

async function cargarEstados() {
    try {
        var result = await window.supabaseClient
            .from('grupos_video')
            .select('estado_region')
            .not('estado_region', 'is', null)
            .neq('estado_region', '')
            .limit(1000);
        if (result.error) throw result.error;
        var estados = {};
        (result.data || []).forEach(function(g) {
            if (g.estado_region) estados[g.estado_region] = true;
        });
        var select = document.getElementById('selectEstado');
        if (select) {
            var currentVal = select.value;
            select.innerHTML = '<option value="">Todos los estados</option>';
            Object.keys(estados).sort().forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                select.appendChild(opt);
            });
            select.value = currentVal;
        }
    } catch (e) {
        console.warn('[Grupos] Error cargando estados:', e);
    }
}

async function cargarMunicipios() {
    try {
        var result = await window.supabaseClient
            .from('grupos_video')
            .select('municipio')
            .not('municipio', 'is', null)
            .neq('municipio', '')
            .limit(1000);
        if (result.error) throw result.error;
        var municipios = {};
        (result.data || []).forEach(function(g) {
            if (g.municipio) municipios[g.municipio] = true;
        });
        var select = document.getElementById('selectMunicipio');
        if (select) {
            var currentVal = select.value;
            select.innerHTML = '<option value="">Todos los municipios</option>';
            Object.keys(municipios).sort().forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                select.appendChild(opt);
            });
            select.value = currentVal;
        }
    } catch (e) {
        console.warn('[Grupos] Error cargando municipios:', e);
    }
}

// ================================================================
// MODAL CREAR GRUPO
// ================================================================
function abrirModalCrearGrupo() {
    document.getElementById('modalCrearGrupo').classList.add('show');
    document.getElementById('inputNombreGrupo').focus();
}

function cerrarModalCrearGrupo() {
    document.getElementById('modalCrearGrupo').classList.remove('show');
}

// ================================================================
// CREAR GRUPO
// ================================================================
async function crearGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }

    var nombre = document.getElementById('inputNombreGrupo').value.trim();
    var descripcion = document.getElementById('inputDescripcionGrupo').value.trim();
    var categoriaNombre = document.getElementById('inputCategoriaGrupo').value;
    var estadoRegion = document.getElementById('inputEstadoGrupo').value.trim();
    var municipio = document.getElementById('inputMunicipioGrupo').value.trim();
    var ciudad = document.getElementById('inputCiudadGrupo').value.trim();
    var pais = document.getElementById('inputPaisGrupo').value.trim() || 'México';
    var precioUsdt = document.getElementById('inputPrecioUsdt').value;
    var marketplaceActivo = document.getElementById('inputMarketplaceActivo').checked;
    var visibilidad = document.getElementById('inputVisibilidadGrupo').value;
    var modoIngreso = document.getElementById('inputModoIngresoGrupo').value;

    if (!nombre) { grpShowToast('Nombre requerido', 'warning'); return; }
    if (!municipio) { grpShowToast('Municipio requerido', 'warning'); return; }
    if (!validarTextoPermitido(nombre, 'Nombre del canal')) return;
    if (!validarTextoPermitido(descripcion, 'Descripción del canal')) return;

    var btn = document.getElementById('btnCrearGrupo');
    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Activando...';

    try {
        var catResult = await window.supabaseClient
            .from('grupos_video_categorias')
            .select('id')
            .eq('nombre', categoriaNombre)
            .maybeSingle();
        var categoriaId = catResult.data?.id || '2822d03e-c8aa-4e65-a537-736dd432ed36';

        var groupResult = await window.supabaseClient.from('grupos_video').insert({
            nombre: nombre,
            descripcion: descripcion || null,
            categoria_id: categoriaId,
            estado_region: estadoRegion || null,
            municipio: municipio,
            ciudad: ciudad || null,
            pais: pais,
            precio_usdt: parseFloat(precioUsdt) || 0,
            firma_ligera: 'Yo me hago cargo de lo que digo aquí',
            marketplace_activo: marketplaceActivo,
            visibilidad: visibilidad,
            modo_ingreso: modoIngreso,
            creador_id: sessionUser.id,
            activo: true
        }).select().single();

        if (groupResult.error) throw groupResult.error;

        grpShowToast('Comunidad Creada', 'success');
        cerrarModalCrearGrupo();

        document.getElementById('inputNombreGrupo').value = '';
        document.getElementById('inputDescripcionGrupo').value = '';
        document.getElementById('inputEstadoGrupo').value = '';
        document.getElementById('inputMunicipioGrupo').value = '';
        document.getElementById('inputCiudadGrupo').value = '';
        document.getElementById('inputMarketplaceActivo').checked = false;

        if (groupResult.data?.id) {
            await abrirGrupo(groupResult.data.id);
        } else {
            cargarGrupos();
        }
        await cargarDashboard();
    } catch (e) {
        grpShowToast('Error: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg> Crear Comunidad';
    }
}