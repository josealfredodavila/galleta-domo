// ================================================================
// MURO · HISTORIAS (tabla estados) — v3.4 (Anillo con foto propia)
// ================================================================
// Filtra las historias para que solo aparezcan las que se subieron
// desde el Muro (origen === 'muro'). Muestra tu foto en el anillo
// si ya tienes una historia activa, o el botón '+' si no.
// ================================================================

var HISTORIA_MAX_IMAGEN_BYTES = 10 * 1024 * 1024;  // 10 MB
var HISTORIA_MAX_VIDEO_BYTES  = 25 * 1024 * 1024;  // 25 MB
var HISTORIA_MAX_VIDEO_SEG    = 30;
var HISTORIA_DURACION_IMAGEN  = 5;

var historiasDelFeed = [];        
var historiaSeleccionada = null;  
var estadosVistosIds = new Set(); 
var temporizadorHistoria = null;

async function cargarHistorias() {
    var contenedor = document.getElementById('csStoryStrip');
    if (!contenedor) return;

    try {
        // La RPC hace todo el trabajo pesado en el servidor
        var rpc = await supabaseClient.rpc('estados_activos_por_usuario');
        if (rpc.error) throw rpc.error;
        
        // FILTRO: Solo traer los estados con origen 'muro'
        var datosCrudos = rpc.data || [];
        historiasDelFeed = datosCrudos.map(function(u) {
            var estadosFiltrados = (u.estados || []).filter(function(e) {
                return (e.origen || 'muro') === 'muro';
            });
            return {
                usuario_id: u.usuario_id,
                nombre: u.nombre,
                handle: u.handle,
                avatar_url: u.avatar_url,
                estados: estadosFiltrados
            };
        }).filter(function(u) {
            return u.estados.length > 0;
        });

        await cargarMisVistas();
        renderizarBarraHistorias();
    } catch (e) {
        console.error('Error cargando historias:', e);
    }
}

async function cargarMisVistas() {
    estadosVistosIds = new Set();
    if (!sessionUser) return;

    var ids = [];
    historiasDelFeed.forEach(function (u) {
        (u.estados || []).forEach(function (e) { ids.push(e.id); });
    });
    if (!ids.length) return;

    // Consulta indexada, rápida incluso con millones de vistas
    var res = await supabaseClient
        .from('estados_vistas')
        .select('estado_id')
        .eq('usuario_id', sessionUser.id)
        .in('estado_id', ids);

    if (res.error) throw res.error;
    (res.data || []).forEach(function (v) { estadosVistosIds.add(v.estado_id); });
}

function todosVistos(estados) {
    return (estados || []).every(function (e) { return estadosVistosIds.has(e.id); });
}

function renderizarBarraHistorias() {
    var contenedor = document.getElementById('csStoryStrip');
    if (!contenedor) return;

    // 1. Buscar si YO tengo una historia activa
    var miHistoria = historiasDelFeed.find(function(u) { 
        return sessionUser && u.usuario_id === sessionUser.id; 
    });

    var html = '';
    
    if (miHistoria && miHistoria.estados && miHistoria.estados.length > 0) {
        // MOSTRAR MI FOTO EN EL ANILLO CON EL DISEÑO FUTURISTA
        var ultimoEstado = miHistoria.estados[miHistoria.estados.length - 1];
        var miFoto = ultimoEstado.media_url || ultimoEstado.imagen_url;
        html +=
            '<button type="button" class="cs-story-item" onclick="abrirHistoriasDe(\'' + sessionUser.id + '\')">' +
                '<span class="cs-story-ring" style="background: conic-gradient(from 0deg, #00e5ff, #8b5cf6, #00e5ff); animation: girarHolograma 3s linear infinite; overflow: hidden !important; padding: 3px; border-radius: 50%;">' +
                    '<img src="' + escapeHTML(miFoto) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid #0a0f16;">' +
                '</span>' +
                '<span>Tú</span>' +
            '</button>';
    } else {
        // SI NO HAY FOTO, MOSTRAR BOTÓN "+"
        html +=
            '<button type="button" class="cs-story-item" onclick="crearHistoria()">' +
                '<span class="cs-story-ring story-add" style="background: conic-gradient(from 0deg, #00e5ff, #8b5cf6, #00e5ff); animation: girarHolograma 3s linear infinite;">＋</span>' +
                '<span>Tu historia</span>' +
            '</button>';
    }

    // 2. Agregar historias de OTROS usuarios
    historiasDelFeed.forEach(function (u) {
        if (sessionUser && u.usuario_id === sessionUser.id) return;

        var vistas = todosVistos(u.estados);
        var inicial = (u.nombre || '?').charAt(0).toUpperCase();
        var avatar = u.avatar_url
            ? '<img src="' + escapeHTML(u.avatar_url) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid #0a0f16;">'
            : inicial;

        html +=
            '<button type="button" class="cs-story-item" onclick="abrirHistoriasDe(\'' + u.usuario_id + '\')">' +
                '<span class="cs-story-ring' + (vistas ? ' vista' : '') + '">' + avatar + '</span>' +
                '<span>' + escapeHTML(u.nombre || u.handle || 'Explorador') + '</span>' +
            '</button>';
    });

    contenedor.innerHTML = html;
}

function crearHistoria() {
    if (!sessionUser) {
        showToast('Inicia sesión para subir una historia', 'error');
        return;
    }
    var input = document.getElementById('inputHistoria');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'inputHistoria';
        input.accept = 'image/*,video/*';
        input.style.display = 'none';
        input.addEventListener('change', subirHistoria);
        document.body.appendChild(input);
    }
    input.click();
}

function leerDuracionVideo(file) {
    return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = function () {
            var seg = v.duration;
            URL.revokeObjectURL(url);
            resolve(seg);
        };
        v.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('No se pudo leer el video'));
        };
        v.src = url;
    });
}

async function subirHistoria(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    if (!file) return;

    var esImagen = file.type.startsWith('image/');
    var esVideo = file.type.startsWith('video/');
    if (!esImagen && !esVideo) {
        showToast('Solo imágenes o videos', 'error');
        input.value = '';
        return;
    }

    var tipo = esVideo ? 'video' : 'imagen';
    var maxBytes = esVideo ? HISTORIA_MAX_VIDEO_BYTES : HISTORIA_MAX_IMAGEN_BYTES;
    if (file.size > maxBytes) {
        showToast(esVideo ? 'Video máximo 25 MB' : 'Imagen máxima 10 MB', 'error');
        input.value = '';
        return;
    }

    var duracion = HISTORIA_DURACION_IMAGEN;
    if (esVideo) {
        try {
            var seg = await leerDuracionVideo(file);
            if (!seg || seg > HISTORIA_MAX_VIDEO_SEG) {
                showToast('El video debe durar máximo ' + HISTORIA_MAX_VIDEO_SEG + ' segundos', 'error');
                input.value = '';
                return;
            }
            duracion = Math.max(1, Math.round(seg));
        } catch (e) {
            showToast('No se pudo leer el video', 'error');
            input.value = '';
            return;
        }
    }

    showToast('Subiendo historia...', '');

    try {
        var sesion = await supabaseClient.auth.getSession();
        var token = sesion && sesion.data && sesion.data.session
            ? sesion.data.session.access_token
            : null;
        if (!token) throw new Error('Sesión expirada');

        var fd = new FormData();
        fd.append('file', file);
        fd.append('destino', 'sariels-estados');
        fd.append('tipo', tipo);

        var resp = await fetch('/api/media/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
        });
        var data = await resp.json().catch(function () { return {}; });
        if (!resp.ok || !data.ok) {
            throw new Error(data.error || 'No se pudo subir la historia');
        }

        // Inserción optimizada con todas las columnas
        var insert = await supabaseClient
            .from('estados')
            .insert({
                usuario_id: sessionUser.id,
                imagen_url: data.url,
                media_tipo: tipo,
                media_url: data.url,
                duracion_segundos: duracion,
                caption: null,
                origen: 'muro' // VITAL: Marca esta historia como del Muro
            });
        if (insert.error) throw insert.error;

        showToast('Historia publicada', 'success');
        await cargarHistorias();
    } catch (e) {
        console.error('Error subiendo historia:', e);
        showToast(e.message || 'Error al subir', 'error');
    } finally {
        input.value = '';
    }
}

function abrirHistoriasDe(usuarioId) {
    var usuario = historiasDelFeed.find(function (u) { return u.usuario_id === usuarioId; });
    if (!usuario || !usuario.estados || !usuario.estados.length) {
        showToast('Este usuario no tiene historias activas', 'warning');
        return;
    }
    historiaSeleccionada = { usuario: usuario, indice: 0 };
    mostrarVisorHistoria(true);
    renderizarVisorHistoria();
}

function renderizarVisorHistoria() {
    var visor = document.getElementById('csHistoriaVisor');
    if (!visor || !historiaSeleccionada) return;

    var u = historiaSeleccionada.usuario;
    var estado = u.estados[historiaSeleccionada.indice];
    var nombre = u.nombre || u.handle || 'Explorador';
    var url = escapeHTML(estado.media_url || '');

    var mediaHtml = estado.media_tipo === 'video'
        ? '<video id="csHistoriaVideo" src="' + url + '" autoplay muted playsinline style="max-width:100%;max-height:80vh;border-radius:12px;"></video>'
        : '<img src="' + url + '" style="max-width:100%;max-height:80vh;border-radius:12px;object-fit:contain;">';

    var barras = '';
    u.estados.forEach(function (_, i) {
        var clase = i < historiaSeleccionada.indice ? 'completada'
            : (i === historiaSeleccionada.indice ? 'activa' : '');
        barras += '<div class="cs-historia-barra ' + clase + '"></div>';
    });

    visor.innerHTML =
        '<div class="cs-historia-backdrop" onclick="cerrarVisorHistoria()"></div>' +
        '<div class="cs-historia-card" onclick="event.stopPropagation()">' +
            '<div class="cs-historia-barras">' + barras + '</div>' +
            '<div class="cs-historia-header">' +
                '<span class="cs-historia-autor">' + escapeHTML(nombre) + '</span>' +
                '<button class="cs-historia-cerrar" onclick="cerrarVisorHistoria()">✕</button>' +
            '</div>' +
            '<div class="cs-historia-media">' + mediaHtml + '</div>' +
            (estado.caption ? '<div class="cs-historia-caption">' + escapeHTML(estado.caption) + '</div>' : '') +
            '<div class="cs-historia-nav">' +
                '<button onclick="historiaAnterior()"' + (historiaSeleccionada.indice === 0 ? ' disabled' : '') + '>◀</button>' +
                '<button onclick="historiaSiguiente()">▶</button>' +
            '</div>' +
        '</div>';

    registrarVista(estado.id);

    clearTimeout(temporizadorHistoria);
    var duracionMs = (estado.duracion_segundos || HISTORIA_DURACION_IMAGEN) * 1000;

    if (estado.media_tipo === 'video') {
        var video = document.getElementById('csHistoriaVideo');
        if (video) {
            video.addEventListener('ended', historiaSiguiente);
            temporizadorHistoria = setTimeout(historiaSiguiente, duracionMs + 2000);
        }
    } else {
        temporizadorHistoria = setTimeout(historiaSiguiente, duracionMs);
    }
}

async function registrarVista(estadoId) {
    if (!sessionUser || estadosVistosIds.has(estadoId)) return;
    estadosVistosIds.add(estadoId);
    try {
        var res = await supabaseClient
            .from('estados_vistas')
            .upsert(
                { estado_id: estadoId, usuario_id: sessionUser.id },
                { onConflict: 'estado_id,usuario_id', ignoreDuplicates: true }
            );
        if (res.error) throw res.error;
    } catch (e) {
        console.error('No se pudo registrar la vista:', e);
        estadosVistosIds.delete(estadoId);
    }
}

function historiaSiguiente() {
    if (!historiaSeleccionada) return;
    var u = historiaSeleccionada.usuario;
    if (historiaSeleccionada.indice < u.estados.length - 1) {
        historiaSeleccionada.indice++;
        renderizarVisorHistoria();
    } else {
        cerrarVisorHistoria();
        renderizarBarraHistorias();
    }
}

function historiaAnterior() {
    if (!historiaSeleccionada || historiaSeleccionada.indice === 0) return;
    historiaSeleccionada.indice--;
    renderizarVisorHistoria();
}

function mostrarVisorHistoria(mostrar) {
    var visor = document.getElementById('csHistoriaVisor');
    if (visor) visor.style.display = mostrar ? 'flex' : 'none';
}

function cerrarVisorHistoria() {
    clearTimeout(temporizadorHistoria);
    historiaSeleccionada = null;
    mostrarVisorHistoria(false);
}

window.cargarHistorias = cargarHistorias;
window.crearHistoria = crearHistoria;
window.abrirHistoriasDe = abrirHistoriasDe;
window.historiaSiguiente = historiaSiguiente;
window.historiaAnterior = historiaAnterior;
window.cerrarVisorHistoria = cerrarVisorHistoria;