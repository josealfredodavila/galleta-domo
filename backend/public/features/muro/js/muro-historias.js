// ================================================================
// MURO · HISTORIAS (tabla estados) — v4.0
// ================================================================
// Cambios v4.0:
//  - Renderizado con DOM seguro (el + createTextNode), sin innerHTML
//  - Rol Dueño vs Espectador en el visor
//  - Paneles de vistas / comentarios con RPCs SECURITY DEFINER
//  - Registro de vistas únicas con upsert (sin contar al dueño)
//  - Temporizador pausable / reanudable
// ================================================================

var HISTORIA_MAX_IMAGEN_BYTES = 10 * 1024 * 1024;
var HISTORIA_MAX_VIDEO_BYTES  = 25 * 1024 * 1024;
var HISTORIA_MAX_VIDEO_SEG    = 30;
var HISTORIA_DURACION_IMAGEN  = 5;

var historiasDelFeed = [];
var historiaSeleccionada = null;
var estadosVistosIds = new Set();
var temporizadorHistoria = null;
var timerPausado = false;
var timerRestanteMs = 0;
var panelAbierto = null;

// ----------------------------------------------------------------
// UTILIDADES DOM SEGURO
// ----------------------------------------------------------------
function el(tag, props, children) {
    var nodo = document.createElement(tag);
    if (props) {
        Object.keys(props).forEach(function (k) {
            var v = props[k];
            if (v == null) return;
            if (k === 'class' || k === 'className') { nodo.className = v; }
            else if (k === 'style' && typeof v === 'object') {
                Object.keys(v).forEach(function (s) { nodo.style[s] = v[s]; });
            }
            else if (k === 'text') { nodo.appendChild(document.createTextNode(String(v))); }
            else if (k.indexOf('on') === 0 && typeof v === 'function') {
                nodo.addEventListener(k.slice(2).toLowerCase(), v);
            }
            else if (k === 'dataset' && typeof v === 'object') {
                Object.keys(v).forEach(function (d) { nodo.dataset[d] = v[d]; });
            }
            else { nodo.setAttribute(k, String(v)); }
        });
    }
    if (children) {
        (Array.isArray(children) ? children : [children]).forEach(function (c) {
            if (c == null || c === false) return;
            nodo.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
    }
    return nodo;
}

function limpiar(nodo) { while (nodo.firstChild) nodo.removeChild(nodo.firstChild); }

function esMiHistoria(u) {
    return !!(sessionUser && u && u.usuario_id === sessionUser.id);
}

// ----------------------------------------------------------------
// CARGA
// ----------------------------------------------------------------
async function cargarHistorias() {
    var contenedor = document.getElementById('csStoryStrip');
    if (!contenedor) return;

    try {
        var rpc = await supabaseClient.rpc('estados_activos_por_usuario');
        if (rpc.error) throw rpc.error;

        var datosCrudos = rpc.data || [];
        historiasDelFeed = datosCrudos.map(function (u) {
            var estadosFiltrados = (u.estados || []).filter(function (e) {
                return (e.origen || 'muro') === 'muro';
            });
            return {
                usuario_id: u.usuario_id,
                nombre: u.nombre,
                handle: u.handle,
                avatar_url: u.avatar_url,
                estados: estadosFiltrados
            };
        }).filter(function (u) { return u.estados.length > 0; });

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

// ----------------------------------------------------------------
// BARRA
// ----------------------------------------------------------------
function renderizarBarraHistorias() {
    var contenedor = document.getElementById('csStoryStrip');
    if (!contenedor) return;
    limpiar(contenedor);

    var miHistoria = historiasDelFeed.find(function (u) {
        return sessionUser && u.usuario_id === sessionUser.id;
    });

    // ---- MI HISTORIA ----
    if (miHistoria && miHistoria.estados.length > 0) {
        var ultimo = miHistoria.estados[miHistoria.estados.length - 1];
        var miFoto = ultimo.media_url || ultimo.imagen_url || '';

        var ringMio = el('span', { class: 'cs-story-ring' }, [
            el('img', { src: miFoto, alt: 'Tu historia' })
        ]);

        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                onclick: function () { abrirHistoriasDe(sessionUser.id); }
            }, [ringMio, el('span', null, 'Tú')])
        );
    } else {
        var ringAdd = el('span', { class: 'cs-story-ring story-add' }, [
            el('svg', { class: 'icon', viewBox: '0 0 24 24' }, [
                el('path', { d: 'M12 5v14M5 12h14' })
            ])
        ]);
        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                onclick: crearHistoria
            }, [ringAdd, el('span', null, 'Tu historia')])
        );
    }

    // ---- OTRAS HISTORIAS ----
    historiasDelFeed.forEach(function (u) {
        if (sessionUser && u.usuario_id === sessionUser.id) return;

        var vistas = todosVistos(u.estados);
        var ring = el('span', { class: 'cs-story-ring' + (vistas ? ' vista' : '') });

        if (u.avatar_url) {
            ring.appendChild(el('img', { src: u.avatar_url, alt: '' }));
        } else {
            var inicial = (u.nombre || '?').charAt(0).toUpperCase();
            ring.appendChild(el('span', {
                class: 'story-avatar',
                style: {
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg,#1a4a2a,#a855f7)',
                    color: '#fff', fontWeight: '700'
                }
            }, inicial));
        }

        var nombre = u.nombre || u.handle || 'Explorador';
        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                onclick: function () { abrirHistoriasDe(u.usuario_id); }
            }, [ring, el('span', null, nombre)])
        );
    });
}

// ----------------------------------------------------------------
// SUBIR HISTORIA
// ----------------------------------------------------------------
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
            ? sesion.data.session.access_token : null;
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

        var insert = await supabaseClient.from('estados').insert({
            usuario_id: sessionUser.id,
            imagen_url: data.url,
            media_tipo: tipo,
            media_url: data.url,
            duracion_segundos: duracion,
            caption: null,
            origen: 'muro'
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

// ----------------------------------------------------------------
// VISOR
// ----------------------------------------------------------------
function abrirHistoriasDe(usuarioId) {
    var usuario = historiasDelFeed.find(function (u) { return u.usuario_id === usuarioId; });
    if (!usuario || !usuario.estados.length) {
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
    var soyDueno = esMiHistoria(u);

    limpiar(visor);

    // ---- Barras ----
    var barras = el('div', { class: 'cs-historia-barras' });
    u.estados.forEach(function (_, i) {
        var clase = i < historiaSeleccionada.indice ? 'completada'
            : (i === historiaSeleccionada.indice ? 'activa' : '');
        barras.appendChild(el('div', { class: 'cs-historia-barra ' + clase }));
    });

    // ---- Header ----
    var header = el('div', { class: 'cs-historia-header' }, [
        el('span', { class: 'cs-historia-autor' }, nombre),
        el('button', {
            class: 'cs-historia-cerrar',
            onclick: cerrarVisorHistoria,
            'aria-label': 'Cerrar'
        }, '✕')
    ]);

    // ---- Media ----
    var media = el('div', { class: 'cs-historia-media' });
    var urlMedia = estado.media_url || estado.imagen_url || '';

    if (estado.media_tipo === 'video') {
        media.appendChild(el('video', {
            id: 'csHistoriaVideo',
            src: urlMedia,
            autoplay: '',
            muted: '',
            playsinline: '',
            class: 'cs-historia-media-el',
            style: { maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px' }
        }));
    } else {
        media.appendChild(el('img', {
            src: urlMedia,
            alt: 'Historia',
            class: 'cs-historia-media-el',
            style: { maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px', objectFit: 'contain' }
        }));
    }

    // ---- Caption ----
    var caption = null;
    if (estado.caption) {
        caption = el('div', { class: 'cs-historia-caption' }, estado.caption);
    }

    // ---- Pie (dueño vs espectador) ----
    var pie = null;
    if (soyDueno) {
        pie = el('div', { class: 'cs-historia-pie' }, [
            el('div', { class: 'cs-historia-resumen', id: 'csResumenEstado' }, 'Cargando resumen…'),
            el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
                el('button', {
                    class: 'cs-historia-pie-btn',
                    onclick: function () { abrirPanel('vistas'); }
                }, '👁 Vistas'),
                el('button', {
                    class: 'cs-historia-pie-btn',
                    onclick: function () { abrirPanel('comentarios'); }
                }, '💬 Comentarios')
            ])
        ]);
    } else {
        var inputComentario = el('input', {
            type: 'text',
            id: 'csComentarioInput',
            class: 'cs-historia-input',
            maxlength: '200',
            placeholder: 'Escribe un comentario…'
        });
        inputComentario.addEventListener('focus', pausarTimer);
        inputComentario.addEventListener('blur', reanudarTimer);
        inputComentario.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarComentarioHistoria(inputComentario);
            }
        });

        var btnEnviar = el('button', {
            class: 'cs-historia-enviar',
            onclick: function () { enviarComentarioHistoria(inputComentario); }
        }, 'Enviar');

        pie = el('div', { class: 'cs-historia-pie' }, [
            el('div', { class: 'cs-historia-comentar' }, [inputComentario, btnEnviar])
        ]);
    }

    // ---- Nav ----
    var nav = el('div', { class: 'cs-historia-nav' }, [
        el('button', {
            onclick: historiaAnterior,
            disabled: historiaSeleccionada.indice === 0 ? '' : null
        }, '◀'),
        el('button', { onclick: historiaSiguiente }, '▶')
    ]);

    // ---- Card ----
    var card = el('div', { class: 'cs-historia-card', onclick: function (e) { e.stopPropagation(); } }, [
        barras, header, media, caption, pie, nav
    ]);

    // Mantener presionada la historia → pausar
    card.addEventListener('mousedown', pausarTimer);
    card.addEventListener('mouseup', reanudarTimer);
    card.addEventListener('mouseleave', reanudarTimer);
    card.addEventListener('touchstart', pausarTimer, { passive: true });
    card.addEventListener('touchend', reanudarTimer, { passive: true });
    card.addEventListener('touchcancel', reanudarTimer, { passive: true });

    // Backdrop
    var backdrop = el('div', { class: 'cs-historia-backdrop', onclick: cerrarVisorHistoria });

    visor.appendChild(backdrop);
    visor.appendChild(card);

    // Registrar vista (solo espectadores)
    registrarVista(estado.id, soyDueno);

    // Cargar resumen del dueño
    if (soyDueno) cargarResumenEstado(estado.id);

    // Arrancar temporizador
    iniciarTimer(estado);
}

function iniciarTimer(estado) {
    clearTimeout(temporizadorHistoria);
    timerPausado = false;
    var duracionMs = (estado.duracion_segundos || HISTORIA_DURACION_IMAGEN) * 1000;
    timerRestanteMs = duracionMs;

    if (estado.media_tipo === 'video') {
        var video = document.getElementById('csHistoriaVideo');
        if (video) {
            video.addEventListener('ended', historiaSiguiente);
            timerRestanteMs = duracionMs + 2000;
        }
    }
    programarTimer(timerRestanteMs);
}

function programarTimer(ms) {
    clearTimeout(temporizadorHistoria);
    timerRestanteMs = ms;
    if (timerPausado) return;
    temporizadorHistoria = setTimeout(historiaSiguiente, ms);
}

function pausarTimer() {
    if (timerPausado) return;
    timerPausado = true;
    clearTimeout(temporizadorHistoria);
    var video = document.getElementById('csHistoriaVideo');
    if (video) video.pause();
}

function reanudarTimer() {
    if (!timerPausado) return;
    timerPausado = false;
    var video = document.getElementById('csHistoriaVideo');
    if (video) video.play().catch(function () {});
    programarTimer(timerRestanteMs);
}

// ----------------------------------------------------------------
// VISTAS
// ----------------------------------------------------------------
async function registrarVista(estadoId, soyDueno) {
    // El dueño NO cuenta como espectador
    if (soyDueno) return;
    if (!sessionUser || estadosVistosIds.has(estadoId)) return;

    estadosVistosIds.add(estadoId);
    try {
        var res = await supabaseClient
            .from('estados_vistas')
            .upsert(
                { estado_id: estadoId, usuario_id: sessionUser.id, visto_at: new Date().toISOString() },
                { onConflict: 'estado_id,usuario_id', ignoreDuplicates: true }
            );
        if (res.error) throw res.error;
    } catch (e) {
        console.error('No se pudo registrar la vista:', e);
        estadosVistosIds.delete(estadoId);
    }
}

// ----------------------------------------------------------------
// RESUMEN DEL DUEÑO
// ----------------------------------------------------------------
async function cargarResumenEstado(estadoId) {
    var resumenEl = document.getElementById('csResumenEstado');
    if (!resumenEl) return;

    try {
        var [rv, rc] = await Promise.all([
            supabaseClient.rpc('estado_vistas_lista', { p_estado_id: estadoId }),
            supabaseClient.rpc('estado_comentarios_lista', { p_estado_id: estadoId })
        ]);

        if (rv.error) console.warn('vistas_lista:', rv.error);
        if (rc.error) console.warn('comentarios_lista:', rc.error);

        var nVistas = (rv.data || []).length;
        var nComent = (rc.data || []).length;

        limpiar(resumenEl);
        resumenEl.appendChild(el('span', null, '👁 ' + nVistas + ' vista' + (nVistas === 1 ? '' : 's')));
        resumenEl.appendChild(el('span', null, '💬 ' + nComent + ' comentario' + (nComent === 1 ? '' : 's')));

        // Guardar para el panel
        window.__csVistasCache = rv.data || [];
        window.__csComentariosCache = rc.data || [];
    } catch (e) {
        console.error('Error cargando resumen:', e);
        resumenEl.textContent = 'No se pudo cargar el resumen.';
    }
}

// ----------------------------------------------------------------
// PANELES · VISTAS / COMENTARIOS
// ----------------------------------------------------------------
function abrirPanel(tipo) {
    if (!historiaSeleccionada) return;
    pausarTimer();
    panelAbierto = tipo;

    var card = document.querySelector('.cs-historia-card');
    if (!card) return;

    // Cerrar panel previo si existe
    var prev = card.querySelector('.cs-historia-panel');
    if (prev) prev.remove();

    var estado = historiaSeleccionada.usuario.estados[historiaSeleccionada.indice];
    var datos = tipo === 'vistas'
        ? (window.__csVistasCache || [])
        : (window.__csComentariosCache || []);

    var tituloTexto = tipo === 'vistas' ? '👁 Vistas' : '💬 Comentarios';

    var lista = el('div', { class: 'cs-panel-lista' });

    if (!datos.length) {
        lista.appendChild(el('div', { class: 'cs-panel-vacio' },
            tipo === 'vistas' ? 'Aún no hay vistas.' : 'Aún no hay comentarios.'
        ));
    } else {
        datos.forEach(function (row) {
            var fila = el('div', { class: 'cs-panel-fila' + (tipo === 'comentarios' ? ' alto' : '') });

            // Avatar
            var avatar = el('div', { class: 'cs-panel-avatar' });
            if (row.avatar_url) {
                avatar.appendChild(el('img', { src: row.avatar_url, alt: '' }));
            } else {
                avatar.appendChild(document.createTextNode(
                    ((row.nombre || row.usuario_handle || '?').charAt(0)).toUpperCase()
                ));
            }
            fila.appendChild(avatar);

            // Info
            var info = el('div', { class: 'cs-panel-info' });
            var nombre = row.nombre || row.usuario_handle || 'Usuario';
            info.appendChild(el('div', { class: 'cs-panel-nombre' }, nombre));

            var sub = '';
            if (tipo === 'vistas') {
                sub = row.visto_at ? new Date(row.visto_at).toLocaleString() : '';
            } else {
                sub = row.comentario || row.texto || row.contenido || '';
                info.appendChild(el('div', { class: 'cs-panel-texto' }, sub));
                sub = row.created_at ? new Date(row.created_at).toLocaleString() : '';
            }
            if (sub) info.appendChild(el('div', { class: 'cs-panel-sub' }, sub));

            fila.appendChild(info);
            lista.appendChild(fila);
        });
    }

    var btnCerrar = el('button', { onclick: cerrarPanel, 'aria-label': 'Cerrar panel' }, '✕');
    var panel = el('div', { class: 'cs-historia-panel' }, [
        el('div', { class: 'cs-panel-titulo' }, [
            el('span', null, tituloTexto),
            btnCerrar
        ]),
        lista
    ]);

    card.appendChild(panel);
}

function cerrarPanel() {
    panelAbierto = null;
    var card = document.querySelector('.cs-historia-card');
    if (!card) return;
    var panel = card.querySelector('.cs-historia-panel');
    if (panel) panel.remove();
    reanudarTimer();
}

// ----------------------------------------------------------------
// COMENTARIO · ESPECTADOR
// ----------------------------------------------------------------
async function enviarComentarioHistoria(inputEl) {
    if (!historiaSeleccionada || !inputEl) return;
    var texto = (inputEl.value || '').trim();
    if (!texto) return;
    if (texto.length > 200) {
        showToast('Máximo 200 caracteres', 'error');
        return;
    }

    var estado = historiaSeleccionada.usuario.estados[historiaSeleccionada.indice];
    var btn = inputEl.parentElement.querySelector('.cs-historia-enviar');
    if (btn) btn.disabled = true;

    try {
        var res = await supabaseClient.rpc('estado_enviar_comentario', {
            p_estado_id: estado.id,
            p_comentario: texto
        });
        if (res.error) throw res.error;

        inputEl.value = '';
        showToast('Comentario enviado', 'success');

        // Refrescar resumen del dueño si está abierto
        if (esMiHistoria(historiaSeleccionada.usuario)) {
            cargarResumenEstado(estado.id);
        }
    } catch (e) {
        console.error('Error al enviar comentario:', e);
        showToast(e.message || 'No se pudo enviar el comentario', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ----------------------------------------------------------------
// NAVEGACIÓN
// ----------------------------------------------------------------
function historiaSiguiente() {
    if (!historiaSeleccionada) return;
    var u = historiaSeleccionada.usuario;
    if (historiaSeleccionada.indice < u.estados.length - 1) {
        historiaSeleccionada.indice++;
        cerrarPanel();
        renderizarVisorHistoria();
    } else {
        cerrarVisorHistoria();
        renderizarBarraHistorias();
    }
}

function historiaAnterior() {
    if (!historiaSeleccionada || historiaSeleccionada.indice === 0) return;
    historiaSeleccionada.indice--;
    cerrarPanel();
    renderizarVisorHistoria();
}

function mostrarVisorHistoria(mostrar) {
    var visor = document.getElementById('csHistoriaVisor');
    if (visor) visor.style.display = mostrar ? 'flex' : 'none';
}

function cerrarVisorHistoria() {
    clearTimeout(temporizadorHistoria);
    panelAbierto = null;
    historiaSeleccionada = null;
    window.__csVistasCache = null;
    window.__csComentariosCache = null;
    mostrarVisorHistoria(false);
}

// ----------------------------------------------------------------
// EXPORTS GLOBALES
// ----------------------------------------------------------------
window.cargarHistorias = cargarHistorias;
window.crearHistoria = crearHistoria;
window.abrirHistoriasDe = abrirHistoriasDe;
window.historiaSiguiente = historiaSiguiente;
window.historiaAnterior = historiaAnterior;
window.cerrarVisorHistoria = cerrarVisorHistoria;