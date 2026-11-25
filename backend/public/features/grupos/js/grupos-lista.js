// ================================================================
// GRUPOS · LISTA / DIRECTORIO (v3)
// ================================================================
// Listado de canales, filtros, paginación y "Crear Comunidad".
// v3:
//  - Campo "Ciudad" restaurado: se guarda en grupos_video.ciudad.
//  - Filtro por categoría: se compara el UUID tal cual.
//  - "Solo mis canales" incluye tus canales privados (RLS lo permite
//    para miembros). El listado general solo muestra públicos.
//  - Filtros de estado y municipio solo consideran canales públicos.
//  - IDs escapados en los atributos onclick.
// Depende de: grupos-config.js, grupos-utils.js
// ================================================================

// ================================================================
// DEBOUNCE DE BÚSQUEDA
// ================================================================
function buscarGruposDebounce() {
    if (grpBuscarTimer) clearTimeout(grpBuscarTimer);
    grpBuscarTimer = setTimeout(function () {
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
        grid.innerHTML = htmlVacio('Sin conexión a Supabase', true);
        return;
    }

    if (!esPaginaSiguiente) grpPagina = 0;

    var timeoutId = setTimeout(function () {
        var titulo = grid.querySelector('.empty-state h3');
        if (titulo && titulo.textContent.indexOf('Cargando') !== -1) {
            grid.innerHTML = htmlVacio('La carga está tardando', true, 'Intenta recargar la página');
        }
    }, 8000);

    try {
        try {
            if (!sessionUser) {
                await Promise.race([
                    cargarUsuarioActual(),
                    new Promise(function (_, reject) {
                        setTimeout(function () { reject(new Error('timeout usuario')); }, 3000);
                    })
                ]);
            }
        } catch (e) {
            console.warn('[Grupos] Timeout de usuario: se sigue como anónimo');
        }

        var buscar = (document.getElementById('inputBuscar') || {}).value || '';
        var estado = (document.getElementById('selectEstado') || {}).value || '';
        var municipio = (document.getElementById('selectMunicipio') || {}).value || '';
        var categoria = (document.getElementById('selectCategoria') || {}).value || '';

        buscar = buscar.replace(/[(),%*\\]/g, ' ').trim();

        var query = window.supabaseClient
            .from('grupos_video')
            .select('id, nombre, descripcion, avatar_url, municipio, estado_region, ciudad, visibilidad, precio_usdt, marketplace_activo')
            .order('created_at', { ascending: false });

        // Listado general: solo canales públicos.
        // "Solo mis canales": RLS deja ver también los privados de los que eres miembro.
        if (!soloMisGrupos) {
            query = query.eq('visibilidad', 'publico');
        }

        if (buscar) query = query.or('nombre.ilike.%' + buscar + '%,descripcion.ilike.%' + buscar + '%');
        if (estado) query = query.eq('estado_region', estado);
        if (municipio) query = query.eq('municipio', municipio);
        if (categoria) query = query.eq('categoria_id', categoria);

        if (soloMisGrupos && sessionUser) {
            var misGruposResult = await window.supabaseClient
                .from('grupos_video_miembros')
                .select('grupo_id')
                .eq('usuario_id', sessionUser.id)
                .eq('estado', 'activo');
            if (misGruposResult.error) throw misGruposResult.error;

            var ids = (misGruposResult.data || []).map(function (m) { return m.grupo_id; });
            if (ids.length === 0) {
                clearTimeout(timeoutId);
                grid.innerHTML = htmlVacio('No sigues ningún canal', false, null, 'polygon');
                ocultarBotonMas();
                return;
            }
            query = query.in('id', ids);
        }

        var offsetInicio = grpPagina * grpPaginaSize;
        query = query.range(offsetInicio, offsetInicio + grpPaginaSize - 1);

        var result = await query;
        clearTimeout(timeoutId);
        if (result.error) throw result.error;

        var grupos = result.data || [];
        grpHayMas = grupos.length === grpPaginaSize;

        if (grupos.length === 0 && !esPaginaSiguiente) {
            grid.innerHTML = htmlVacio('No hay canales disponibles', false, 'Activa el primero', 'polygon');
            ocultarBotonMas();
            return;
        }

        // Lives activos (solo para marcar las tarjetas)
        var liveMap = {};
        try {
            var liveResult = await window.supabaseClient
                .from('transmisiones')
                .select('grupo_id')
                .eq('estado', 'en_vivo')
                .eq('is_live', true);
            (liveResult.data || []).forEach(function (t) { liveMap[t.grupo_id] = true; });
        } catch (e) {
            console.warn('[Grupos] Error consultando lives (se ignora):', e);
        }

        var gruposHTML = grupos.map(htmlTarjetaGrupo.bind(null, liveMap)).join('');

        if (esPaginaSiguiente) {
            grid.insertAdjacentHTML('beforeend', gruposHTML);
        } else {
            grid.innerHTML = gruposHTML;
        }

        var btnMas = document.getElementById('btnCargarMasContainer');
        if (btnMas) btnMas.style.display = grpHayMas ? 'block' : 'none';
    } catch (e) {
        clearTimeout(timeoutId);
        console.error('[Grupos] Error cargando canales:', e);
        grid.innerHTML = htmlVacio('Error cargando canales', true, e.message || 'Error desconocido');
    }
}

// ================================================================
// HTML DEL LISTADO
// ================================================================
function htmlVacio(titulo, esError, detalle, icono) {
    var svg = icono === 'polygon'
        ? '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg>'
        : '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/>' +
          (esError ? '<line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' : '') +
          '</svg>';
    return '<div class="empty-state">' + svg +
        '<h3>' + grpEscapeHTML(titulo) + '</h3>' +
        (detalle ? '<p>' + grpEscapeHTML(detalle) + '</p>' : '') +
    '</div>';
}

function ocultarBotonMas() {
    var btn = document.getElementById('btnCargarMasContainer');
    if (btn) btn.style.display = 'none';
}

function htmlTarjetaGrupo(liveMap, g) {
    var tieneLive = !!liveMap[g.id];
    var visibilidad = g.visibilidad || 'publico';

    var visBadge = visibilidad === 'publico'
        ? '<span class="estado-badge">' +
              '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Público</span>'
        : '<span class="estado-badge privado">' +
              '<svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Privado</span>';

    var precio = g.precio_usdt > 0
        ? '<span class="precio-badge"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 11h6"/></svg>$' + grpEscapeHTML(g.precio_usdt) + ' USDT</span>'
        : '';

    var mkBadge = g.marketplace_activo
        ? '<span class="mk-badge"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>Marketplace</span>'
        : '';

    var ubicacion = [];
    if (g.ciudad) ubicacion.push(g.ciudad);
    if (g.municipio) ubicacion.push(g.municipio);
    if (g.estado_region) ubicacion.push(g.estado_region);
    var ubicacionTexto = ubicacion.length > 0 ? ubicacion.join(', ') : 'Sin ubicación';

    var img = grpSafeUrl(g.avatar_url);
    var idSeguro = grpEscapeHTML(g.id);

    return '<div class="grupo-card' + (tieneLive ? ' en-vivo' : '') + '" onclick="abrirGrupo(\'' + idSeguro + '\')">' +
        '<div class="avatar">' + (img ? '<img src="' + grpEscapeHTML(img) + '" alt="">' : '◈') + '</div>' +
        '<div class="nombre">' + grpEscapeHTML(g.nombre) + '</div>' +
        '<div class="descripcion">' + grpEscapeHTML((g.descripcion || '').substring(0, 80)) + '</div>' +
        '<div class="meta">' +
            '<span class="ciudad"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + grpEscapeHTML(ubicacionTexto) + '</span>' +
            visBadge + precio + mkBadge +
            (tieneLive ? ' <span class="live-badge"><svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#fff;fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="5"/></svg>EN VIVO</span>' : '') +
        '</div>' +
    '</div>';
}

// ================================================================
// TOGGLE "MIS CANALES" (solo los canales donde soy miembro)
// ================================================================
function toggleMisGrupos() {
    soloMisGrupos = !soloMisGrupos;
    var btn = document.getElementById('btnMisGrupos');
    if (btn) {
        btn.style.borderColor = soloMisGrupos ? 'var(--gold)' : '';
        btn.style.color = soloMisGrupos ? 'var(--gold)' : '';
        btn.style.boxShadow = soloMisGrupos ? '0 0 20px rgba(212,175,55,0.4)' : '';
    }
    grpPagina = 0;
    cargarGrupos();
}

// ================================================================
// FILTROS: categorías, estados y municipios
// ================================================================
function llenarSelect(select, valores, etiquetaTodos) {
    var valorActual = select.value;
    select.innerHTML = '';
    var todos = document.createElement('option');
    todos.value = '';
    todos.textContent = etiquetaTodos;
    select.appendChild(todos);

    valores.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.valor;
        opt.textContent = v.texto;
        select.appendChild(opt);
    });
    select.value = valorActual;
}

async function cargarCategorias() {
    try {
        var result = await window.supabaseClient
            .from('grupos_video_categorias')
            .select('id, nombre')
            .eq('activo', true)
            .order('nombre', { ascending: true });
        if (result.error) throw result.error;

        categoriasCache = result.data || [];
        var select = document.getElementById('selectCategoria');
        if (select) {
            llenarSelect(select, categoriasCache.map(function (c) {
                return { valor: c.id, texto: c.nombre };
            }), 'Todas las categorías');
        }
    } catch (e) {
        console.warn('[Grupos] Error cargando categorías:', e);
    }
}

async function cargarEstados() {
    try {
        // Solo canales públicos: no se exponen ubicaciones de canales privados
        var result = await window.supabaseClient
            .from('grupos_video')
            .select('estado_region')
            .eq('visibilidad', 'publico')
            .not('estado_region', 'is', null)
            .neq('estado_region', '')
            .limit(1000);
        if (result.error) throw result.error;

        var estados = {};
        (result.data || []).forEach(function (g) { estados[g.estado_region] = true; });

        var select = document.getElementById('selectEstado');
        if (select) {
            llenarSelect(select, Object.keys(estados).sort().map(function (e) {
                return { valor: e, texto: e };
            }), 'Todos los estados');
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
            .eq('visibilidad', 'publico')
            .not('municipio', 'is', null)
            .neq('municipio', '')
            .limit(1000);
        if (result.error) throw result.error;

        var municipios = {};
        (result.data || []).forEach(function (g) { municipios[g.municipio] = true; });

        var select = document.getElementById('selectMunicipio');
        if (select) {
            llenarSelect(select, Object.keys(municipios).sort().map(function (m) {
                return { valor: m, texto: m };
            }), 'Todos los municipios');
        }
    } catch (e) {
        console.warn('[Grupos] Error cargando municipios:', e);
    }
}

// ================================================================
// MODAL CREAR CANAL
// ================================================================
function abrirModalCrearGrupo() {
    document.getElementById('modalCrearGrupo').classList.add('show');
    document.getElementById('inputNombreGrupo').focus();
}

function cerrarModalCrearGrupo() {
    document.getElementById('modalCrearGrupo').classList.remove('show');
}

// ================================================================
// CREAR CANAL
// ================================================================
var CATEGORIA_GENERAL_FALLBACK = '2822d03e-c8aa-4e65-a537-736dd432ed36';

async function crearGrupo() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }

    var campo = function (id) { return (document.getElementById(id) || {}); };
    var nombre = (campo('inputNombreGrupo').value || '').trim();
    var descripcion = (campo('inputDescripcionGrupo').value || '').trim();
    var categoriaNombre = campo('inputCategoriaGrupo').value || 'General';
    var estadoRegion = (campo('inputEstadoGrupo').value || '').trim();
    var municipio = (campo('inputMunicipioGrupo').value || '').trim();
    var ciudad = (campo('inputCiudadGrupo').value || '').trim();
    var pais = (campo('inputPaisGrupo').value || '').trim() || 'México';
    var precioUsdt = campo('inputPrecioUsdt').value;
    var marketplaceActivo = !!campo('inputMarketplaceActivo').checked;
    var visibilidad = campo('inputVisibilidadGrupo').value;
    var modoIngreso = campo('inputModoIngresoGrupo').value;

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
        var categoriaId = (catResult.data && catResult.data.id) || CATEGORIA_GENERAL_FALLBACK;

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

        grpShowToast('Comunidad creada', 'success');
        cerrarModalCrearGrupo();

        ['inputNombreGrupo', 'inputDescripcionGrupo', 'inputEstadoGrupo', 'inputMunicipioGrupo', 'inputCiudadGrupo'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('inputMarketplaceActivo').checked = false;

        if (groupResult.data && groupResult.data.id) {
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