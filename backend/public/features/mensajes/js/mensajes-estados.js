// ================================================================
// MENSAJES · ESTADOS (HISTORIAS) v3.0 · MÓDULO 5 DE 8
// Ruta: frontend/features/mensajes/js/mensajes-estados.js
//
// ACTUALIZACIÓN v3.0:
// - Publicación múltiple: hasta 5 videos y 10 imágenes.
// - Videos de máximo 60 segundos.
// - Publicación individual de cada archivo.
// - Validación de límites antes de subir.
// - Visor multimedia adaptable a pantalla completa.
// - Imágenes con object-fit: contain (sin deformaciones).
// - Videos con object-fit: contain y controles.
// - Cambio seguro entre imágenes y videos.
// - Vista previa multimedia sin desbordamientos.
// - Progreso independiente para cada historia.
// - Publicaciones de 24 horas.
// - Control de propiedad al eliminar historias.
// - Compatible con la estructura existente de Supabase.
// - No inventa tablas ni columnas.
// - Referencias SQL al final para tablas y funciones faltantes.
// ================================================================

'use strict';

const ICO_ESTADO = {
    eye: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    chat: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>'
};

const ESTADOS_MAX_VIDEOS = 5;
const ESTADOS_MAX_IMAGENES = 10;
const ESTADOS_MAX_VIDEO_MB = 25;
const ESTADOS_MAX_IMAGEN_MB = 10;
const ESTADOS_MAX_VIDEO_SEGUNDOS = 60;
const ESTADOS_DURACION_IMAGEN = 5;

let estadosCache = [];
let estadoActualIndex = 0;
let estadoActualUserId = null;
let estadoTimer = null;
let estadoProgresoActual = 0;
let estadoPausado = false;
let estadosArchivosSeleccionados = [];
let estadosSubiendo = false;
let estadoMediaObjectURL = null;

/* ================================================================
   HELPERS
================================================================ */

function ocultarEl(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
}

function mostrarEl(id) {
    const el = $(id);
    if (el) el.classList.remove('hidden');
}

function estadoEsNuevo(estado) {
    if (!window.__estadosVistosIds) return true;
    return !window.__estadosVistosIds.has(estado.id);
}

function estadoEsVideo(estado) {
    return estado && (
        estado.media_tipo === 'video' ||
        (estado.media_url || estado.imagen_url || '').match(/\.(mp4|webm|mov|m4v)(\?|$)/i)
    );
}

function estadoObtenerURL(estado) {
    return estado ? (estado.media_url || estado.imagen_url || '') : '';
}

function estadoLiberarObjectURL() {
    if (estadoMediaObjectURL) {
        try {
            URL.revokeObjectURL(estadoMediaObjectURL);
        } catch (e) {}

        estadoMediaObjectURL = null;
    }
}

function estadoObtenerElemento(id) {
    return document.getElementById(id);
}

function estadoAplicarAjusteMedia(elemento, esVideo) {
    if (!elemento) return;

    elemento.style.setProperty('width', '100%', 'important');
    elemento.style.setProperty('height', '100%', 'important');
    elemento.style.setProperty('max-width', '100%', 'important');
    elemento.style.setProperty('max-height', '100%', 'important');
    elemento.style.setProperty('object-fit', 'contain', 'important');
    elemento.style.setProperty('object-position', 'center center', 'important');
    elemento.style.setProperty('display', 'block', 'important');
    elemento.style.setProperty('margin', 'auto', 'important');
    elemento.style.setProperty('background', '#000', 'important');

    if (esVideo) {
        elemento.playsInline = true;
        elemento.preload = 'metadata';
    }
}

function estadoAplicarVisorCompleto() {
    const viewer = $('estadoViewer');
    if (!viewer) return;

    viewer.style.setProperty('position', 'fixed', 'important');
    viewer.style.setProperty('inset', '0', 'important');
    viewer.style.setProperty('width', '100vw', 'important');
    viewer.style.setProperty('height', '100dvh', 'important');
    viewer.style.setProperty('max-width', '100vw', 'important');
    viewer.style.setProperty('max-height', '100dvh', 'important');
    viewer.style.setProperty('overflow', 'hidden', 'important');
    viewer.style.setProperty('background', '#000', 'important');
    viewer.style.setProperty('z-index', '99999', 'important');

    const imagen = $('evImage');
    const video = $('evVideo');

    [imagen, video].forEach(function (media) {
        if (!media) return;

        estadoAplicarAjusteMedia(media, media.tagName === 'VIDEO');

        media.style.setProperty('position', 'absolute', 'important');
        media.style.setProperty('inset', '0', 'important');
    });

    if (imagen || video) {
        const padre = (imagen || video).parentElement;

        if (padre) {
            padre.style.setProperty('position', 'absolute', 'important');
            padre.style.setProperty('inset', '0', 'important');
            padre.style.setProperty('width', '100%', 'important');
            padre.style.setProperty('height', '100%', 'important');
            padre.style.setProperty('overflow', 'hidden', 'important');
            padre.style.setProperty('display', 'flex', 'important');
            padre.style.setProperty('align-items', 'center', 'important');
            padre.style.setProperty('justify-content', 'center', 'important');
            padre.style.setProperty('background', '#000', 'important');
        }
    }
}

async function registrarVistaEstado(estadoId) {
    if (!user) return;

    try {
        const { error } = await db.from('estados_vistas').upsert(
            {
                estado_id: estadoId,
                usuario_id: user.id
            },
            {
                onConflict: 'estado_id,usuario_id',
                ignoreDuplicates: true
            }
        );

        if (!error && window.__estadosVistosIds) {
            window.__estadosVistosIds.add(estadoId);
        }
    } catch (e) {}
}

async function obtenerVistasEstado(estadoId) {
    try {
        const { count, error } = await db.from('estados_vistas')
            .select('id', {
                count: 'exact',
                head: true
            })
            .eq('estado_id', estadoId);

        if (error) return 0;

        return count || 0;
    } catch (e) {
        return 0;
    }
}

function haceTiempo(fecha) {
    if (!fecha) return 'hace tiempo';

    const diffMin = Math.floor(
        (Date.now() - new Date(fecha).getTime()) / 60000
    );

    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffMin < 1440) return `hace ${Math.floor(diffMin / 60)} h`;

    return `hace ${Math.floor(diffMin / 1440)} d`;
}

function avatarInicialHTML(nombre, avatarUrl) {
    if (avatarUrl) {
        return `<img src="${esc(avatarUrl)}" alt="">`;
    }

    return esc(((nombre || 'U') + '').charAt(0).toUpperCase());
}

function urlPerfil(handle, uid) {
    if (handle) {
        return '/features/perfil/perfil-publico.html?u=' +
            encodeURIComponent(handle);
    }

    if (uid) {
        return '/features/perfil/perfil-publico.html?id=' +
            encodeURIComponent(uid);
    }

    return null;
}

/* ================================================================
   CARGAR HISTORIAS
================================================================ */

async function cargarEstados() {
    const scroll = $('estadosScroll');

    if (!scroll || !user) return;

    scroll.innerHTML = '';

    try {
        let filas = [];

        const rpc = await db.rpc('estados_mensajes_activos');

        if (!rpc.error && Array.isArray(rpc.data)) {
            if (
                rpc.data.length > 0 &&
                Array.isArray(rpc.data[0].estados)
            ) {
                rpc.data.forEach(function (u) {
                    (u.estados || []).forEach(function (e) {
                        filas.push({
                            id: e.id,
                            usuario_id: u.usuario_id,
                            imagen_url: e.imagen_url,
                            media_url: e.media_url,
                            media_tipo: e.media_tipo,
                            duracion_segundos: e.duracion_segundos,
                            caption: e.caption,
                            created_at: e.created_at,
                            expires_at: e.expires_at,
                            origen: 'mensajes'
                        });
                    });
                });
            } else {
                filas = rpc.data.map(function (e) {
                    return Object.assign({}, e, {
                        origen: e.origen || 'mensajes'
                    });
                });
            }
        } else {
            if (rpc.error) {
                console.warn('[Estados] RPC falló:', rpc.error.message);
            }

            const { data, error } = await db.from('estados')
                .select(
                    'id, usuario_id, imagen_url, media_url, media_tipo, duracion_segundos, caption, created_at, expires_at, origen'
                )
                .eq('origen', 'mensajes')
                .gt('expires_at', new Date().toISOString())
                .order('created_at', {
                    ascending: true
                });

            if (error) {
                if (error.code === '42P01') {
                    console.warn('[Estados] Falta la tabla estados.');
                    scroll.innerHTML =
                        '<div class="estados-vacio">El módulo de estados necesita configuración en Supabase.</div>';
                    return;
                }

                throw error;
            }

            filas = data || [];
        }

        estadosCache = filas;

        if (!estadosCache.length) {
            scroll.innerHTML =
                '<div class="estados-vacio">Sin estados</div>';
            return;
        }

        window.__estadosVistosIds = new Set();

        const idsEstados = estadosCache.map(function (e) {
            return e.id;
        });

        try {
            const { data: vistasData } = await db.from('estados_vistas')
                .select('estado_id')
                .eq('usuario_id', user.id)
                .in('estado_id', idsEstados);

            (vistasData || []).forEach(function (v) {
                window.__estadosVistosIds.add(v.estado_id);
            });
        } catch (e) {}

        const porUsuario = {};

        estadosCache.forEach(function (e) {
            if (!porUsuario[e.usuario_id]) {
                porUsuario[e.usuario_id] = [];
            }

            porUsuario[e.usuario_id].push(e);
        });

        const idsUnicos = Object.keys(porUsuario).filter(function (uid) {
            return uid !== user.id;
        });

        if (idsUnicos.length) {
            try {
                const { data: perfilesEst } = await db.from('perfiles_publicos')
                    .select('id,nombre,handle,avatar_url')
                    .in('id', idsUnicos);

                (perfilesEst || []).forEach(function (p) {
                    if (perfilCache.size >= PERFIL_CACHE_LIMITE) {
                        const primera = perfilCache.keys().next().value;

                        if (primera !== undefined) {
                            perfilCache.delete(primera);
                        }
                    }

                    perfilCache.set(p.id, {
                        ts: Date.now(),
                        data: p
                    });
                });
            } catch (e) {}
        }

        const miEstado = porUsuario[user.id];

        if (miEstado && miEstado.length) {
            const tieneNuevos = miEstado.some(estadoEsNuevo);
            const ultimo = miEstado[miEstado.length - 1];
            const ultimoImg = estadoObtenerURL(ultimo);

            const totalVistas = await obtenerVistasEstado(ultimo.id);

            scroll.insertAdjacentHTML('beforeend', `
                <div class="estado-item" data-userid="${esc(user.id)}">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner">
                            ${estadoEsVideo(ultimo)
                                ? '<div class="estado-video-thumb">VIDEO</div>'
                                : `<img src="${esc(ultimoImg)}" alt="">`
                            }
                        </div>
                    </div>
                    ${totalVistas > 0
                        ? `<span class="estado-vistas-badge">${totalVistas}</span>`
                        : ''
                    }
                    <div class="estado-name">Tú</div>
                </div>
            `);

            const miItem = scroll.querySelector(
                `[data-userid="${user.id}"]`
            );

            if (miItem) {
                miItem.onclick = function () {
                    abrirEstadoUsuario(user.id);
                };
            }
        }

        for (const uid of Object.keys(porUsuario)) {
            if (uid === user.id) continue;

            const entrada = perfilCache.get(uid);

            const p = (
                entrada &&
                Date.now() - entrada.ts < TTL_PERFIL_MS &&
                entrada.data
            ) || {
                id: uid,
                nombre: 'Usuario',
                handle: 'usuario',
                avatar_url: null
            };

            const tieneNuevos = porUsuario[uid].some(estadoEsNuevo);

            scroll.insertAdjacentHTML('beforeend', `
                <div class="estado-item" data-userid="${esc(uid)}">
                    <div class="estado-circle ${tieneNuevos ? '' : 'visto'}">
                        <div class="estado-inner">
                            ${avatarInicialHTML(p.nombre, p.avatar_url)}
                        </div>
                    </div>
                    <div class="estado-name">${esc(p.nombre || 'Usuario')}</div>
                </div>
            `);

            const item = scroll.querySelector(
                `[data-userid="${uid}"]`
            );

            if (item) {
                item.onclick = function () {
                    abrirEstadoUsuario(uid);
                };
            }
        }

    } catch (e) {
        console.error('[Estados] Error cargando historias:', e);
    }
}

/* ================================================================
   VISOR DE HISTORIAS
================================================================ */

function abrirEstadoUsuario(uid) {
    const estados = estadosCache.filter(function (e) {
        return e.usuario_id === uid;
    });

    if (!estados.length) {
        toast('Este usuario no tiene estados.', 'warning');
        return;
    }

    estadoActualUserId = uid;
    estadoActualIndex = 0;
    estadoProgresoActual = 0;
    estadoPausado = false;

    estadoAplicarVisorCompleto();

    mostrarEstadoActual();

    const viewer = $('estadoViewer');

    if (viewer) {
        viewer.classList.add('show');
    }
}

async function mostrarEstadoActual() {
    const estados = estadosCache.filter(function (e) {
        return e.usuario_id === estadoActualUserId;
    });

    if (estadoActualIndex >= estados.length) {
        cerrarEstadoViewer();
        return;
    }

    const estado = estados[estadoActualIndex];
    const esMiEstado = estadoActualUserId === user.id;

    const avatar = $('evAvatar');
    const nombre = $('evName');

    if (esMiEstado) {
        if (avatar) {
            avatar.innerHTML = avatarInicialHTML(
                currentUserProfile && currentUserProfile.nombre,
                currentUserProfile && currentUserProfile.avatar_url
            );
        }

        if (nombre) nombre.textContent = 'Tú';

    } else {
        db.from('perfiles_publicos')
            .select('nombre, handle, avatar_url')
            .eq('id', estadoActualUserId)
            .maybeSingle()
            .then(function (r) {
                if (r.data && estadoActualUserId === estado.usuario_id) {
                    if (avatar) {
                        avatar.innerHTML = avatarInicialHTML(
                            r.data.nombre,
                            r.data.avatar_url
                        );
                    }

                    if (nombre) {
                        nombre.textContent = r.data.nombre || 'Usuario';
                    }
                }
            });
    }

    estadoLiberarObjectURL();

    const urlMedia = estadoObtenerURL(estado);
    const esVideo = estadoEsVideo(estado);

    const evImageEl = $('evImage');

    let videoEl = estadoObtenerElemento('evVideo');

    if (!videoEl && evImageEl && evImageEl.parentNode) {
        videoEl = document.createElement('video');
        videoEl.id = 'evVideo';
        videoEl.className = 'estado-viewer-video';
        videoEl.controls = true;
        videoEl.playsInline = true;
        videoEl.preload = 'auto';

        evImageEl.parentNode.appendChild(videoEl);
    }

    if (esVideo) {
        if (evImageEl) {
            evImageEl.classList.add('hidden');
            evImageEl.removeAttribute('src');
        }

        if (videoEl) {
            videoEl.pause();
            videoEl.classList.remove('hidden');

            videoEl.controls = true;
            videoEl.playsInline = true;
            videoEl.autoplay = true;
            videoEl.loop = false;

            estadoAplicarAjusteMedia(videoEl, true);

            videoEl.src = urlMedia;
            videoEl.load();

            const reproduccion = videoEl.play();

            if (reproduccion && reproduccion.catch) {
                reproduccion.catch(function () {});
            }
        }

    } else {
        if (videoEl) {
            videoEl.pause();
            videoEl.classList.add('hidden');
            videoEl.removeAttribute('src');
            videoEl.load();
        }

        if (evImageEl) {
            evImageEl.classList.remove('hidden');

            estadoAplicarAjusteMedia(evImageEl, false);

            evImageEl.src = urlMedia;
            evImageEl.alt = 'Historia publicada';
        }
    }

    estadoAplicarVisorCompleto();

    const evTime = $('evTime');

    if (evTime) {
        evTime.textContent = haceTiempo(estado.created_at);
    }

    const caption = $('evCaption');

    if (caption) {
        if (estado.caption) {
            caption.textContent = estado.caption;
            caption.classList.remove('hidden');
        } else {
            caption.classList.add('hidden');
        }
    }

    registrarVistaEstado(estado.id);

    const prev = $('evPrev');
    const next = $('evNext');

    if (prev) {
        prev.classList.toggle('hidden', estadoActualIndex === 0);
    }

    if (next) {
        next.classList.toggle(
            'hidden',
            estadoActualIndex >= estados.length - 1
        );
    }

    const evVistasEl = $('evVistas');
    const evEliminarEl = $('evEliminar');
    const evComentarEl = $('evComentar');

    if (esMiEstado) {
        const total = await obtenerVistasEstado(estado.id);

        if (estadoActualUserId !== estado.usuario_id) return;

        if ($('evVistasCount')) {
            $('evVistasCount').textContent = total;
        }

        if (evVistasEl) {
            evVistasEl.classList.remove('hidden');
            evVistasEl.dataset.estadoId = estado.id;

            evVistasEl.onclick = function (e) {
                e.stopPropagation();
                abrirPanelEstado(estado.id, 'vistas');
            };
        }

        if (evEliminarEl) {
            evEliminarEl.classList.remove('hidden');
            evEliminarEl.dataset.estadoId = estado.id;

            evEliminarEl.onclick = function (e) {
                e.stopPropagation();
                eliminarHistoriaMensajes(estado.id);
            };
        }

        ocultarEl('evComentar');

    } else {
        ocultarEl('evVistas');
        ocultarEl('evEliminar');

        if (evComentarEl) {
            evComentarEl.classList.remove('hidden');
            evComentarEl.dataset.estadoId = estado.id;

            evComentarEl.onclick = function (e) {
                e.stopPropagation();
                comentarHistoriaMensajes(estado.id);
            };
        }
    }

    const evSkipEl = $('evSkip');

    if (evSkipEl) {
        evSkipEl.classList.remove('hidden');

        evSkipEl.onclick = function (e) {
            e.stopPropagation();
            saltarGrupoMensajes();
        };
    }

    iniciarProgresoEstado(estado);
}

/* ================================================================
   PROGRESO
================================================================ */

function iniciarProgresoEstado(estado) {
    const progress = $('estadoProgress');

    if (estadoTimer) {
        clearInterval(estadoTimer);
    }

    if (progress) {
        progress.style.width = estadoProgresoActual + '%';
    }

    const esVideo = estadoEsVideo(estado);

    if (esVideo) {
        const videoEl = estadoObtenerElemento('evVideo');

        if (videoEl) {
            estadoTimer = setInterval(function () {
                if (estadoPausado || videoEl.paused) return;

                if (
                    videoEl.duration &&
                    isFinite(videoEl.duration)
                ) {
                    estadoProgresoActual =
                        (videoEl.currentTime / videoEl.duration) * 100;
                }

                if (progress) {
                    progress.style.width = estadoProgresoActual + '%';
                }
            }, 100);

            videoEl.onended = function () {
                if (estadoTimer) clearInterval(estadoTimer);

                estadoProgresoActual = 0;

                siguienteEstado();
            };
        }

    } else {
        const duracionMs = ESTADOS_DURACION_IMAGEN * 1000;

        estadoTimer = setInterval(function () {
            if (estadoPausado) return;

            estadoProgresoActual += 100 / (duracionMs / 50);

            if (progress) {
                progress.style.width = estadoProgresoActual + '%';
            }

            if (estadoProgresoActual >= 100) {
                clearInterval(estadoTimer);

                estadoProgresoActual = 0;

                siguienteEstado();
            }
        }, 50);
    }
}

function siguienteEstado() {
    const estados = estadosCache.filter(function (e) {
        return e.usuario_id === estadoActualUserId;
    });

    if (estadoActualIndex < estados.length - 1) {
        estadoActualIndex++;
        estadoProgresoActual = 0;
        estadoPausado = false;

        mostrarEstadoActual();
    } else {
        saltarGrupoMensajes();
    }
}

function anteriorEstado() {
    if (estadoActualIndex > 0) {
        estadoActualIndex--;
        estadoProgresoActual = 0;
        estadoPausado = false;

        mostrarEstadoActual();
    }
}

function saltarGrupoMensajes() {
    if (!estadoActualUserId) return;

    const ordenUsuarios = [];

    estadosCache.forEach(function (e) {
        if (!ordenUsuarios.includes(e.usuario_id)) {
            ordenUsuarios.push(e.usuario_id);
        }
    });

    const idxActual = ordenUsuarios.indexOf(estadoActualUserId);

    for (let i = idxActual + 1; i < ordenUsuarios.length; i++) {
        const uid = ordenUsuarios[i];

        if (estadosCache.some(function (e) {
            return e.usuario_id === uid;
        })) {
            estadoActualUserId = uid;
            estadoActualIndex = 0;
            estadoProgresoActual = 0;
            estadoPausado = false;

            mostrarEstadoActual();
            return;
        }
    }

    cerrarEstadoViewer();
}

function cerrarEstadoViewer() {
    const viewer = $('estadoViewer');

    if (viewer) {
        viewer.classList.remove('show');
    }

    if (estadoTimer) {
        clearInterval(estadoTimer);
    }

    estadoTimer = null;
    estadoPausado = false;
    estadoProgresoActual = 0;
    estadoActualUserId = null;

    const videoEl = estadoObtenerElemento('evVideo');

    if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.onended = null;
    }

    estadoLiberarObjectURL();

    cargarEstados();
}

function activarPausaEstado() {
    const viewer = $('estadoViewer');

    if (!viewer || !viewer.classList.contains('show')) return;

    estadoPausado = true;

    const videoEl = estadoObtenerElemento('evVideo');

    if (videoEl) {
        videoEl.pause();
    }
}

function desactivarPausaEstado() {
    const viewer = $('estadoViewer');

    if (!viewer || !viewer.classList.contains('show')) return;

    estadoPausado = false;

    const videoEl = estadoObtenerElemento('evVideo');

    if (videoEl && !videoEl.classList.contains('hidden')) {
        videoEl.play().catch(function () {});
    }
}

/* ================================================================
   PANEL DE VISTAS Y COMENTARIOS
================================================================ */

async function abrirPanelEstado(estadoId, tab) {
    tab = tab || 'vistas';

    if (!estadoId) return;

    const modal = $('vistasModal');
    const list = $('vistasList');
    const countEl = $('vistasModalCount');

    if (!modal || !list) return;

    modal.classList.add('show');

    list.innerHTML =
        '<div class="estado-panel-msg">Cargando...</div>';

    if (countEl) countEl.textContent = '';

    let tabsBar = document.getElementById('vistasTabsBar');

    if (!tabsBar) {
        tabsBar = document.createElement('div');
        tabsBar.id = 'vistasTabsBar';
        tabsBar.className = 'estado-tabs';

        list.parentNode.insertBefore(tabsBar, list);
    }

    tabsBar.innerHTML = `
        <button type="button" class="estado-tab ${tab === 'vistas' ? 'active' : ''}" data-tab="vistas">
            ${ICO_ESTADO.eye}<span>Vistas</span>
        </button>
        <button type="button" class="estado-tab ${tab === 'comentarios' ? 'active' : ''}" data-tab="comentarios">
            ${ICO_ESTADO.chat}<span>Comentarios</span>
        </button>
    `;

    tabsBar.querySelectorAll('button').forEach(function (btn) {
        btn.onclick = function () {
            abrirPanelEstado(estadoId, btn.dataset.tab);
        };
    });

    try {
        if (tab === 'vistas') {
            const { data: vistas, error } = await db.from('estados_vistas')
                .select('usuario_id, visto_at')
                .eq('estado_id', estadoId)
                .order('visto_at', {
                    ascending: false
                });

            if (error) throw error;

            if (!vistas || !vistas.length) {
                list.innerHTML =
                    '<div class="estado-panel-msg">Nadie ha visto este estado todavía.</div>';
                return;
            }

            if (countEl) {
                countEl.textContent = `(${vistas.length})`;
            }

            const ids = vistas.map(function (v) {
                return v.usuario_id;
            });

            const { data: perfiles } = await db.from('perfiles_publicos')
                .select('id, nombre, handle, avatar_url')
                .in('id', ids);

            const perfilMap = {};

            (perfiles || []).forEach(function (p) {
                perfilMap[p.id] = p;
            });

            list.innerHTML = '';

            vistas.forEach(function (v) {
                const p = perfilMap[v.usuario_id] || {
                    nombre: 'Usuario',
                    handle: '',
                    avatar_url: null
                };

                const url = urlPerfil(p.handle, v.usuario_id);

                list.insertAdjacentHTML('beforeend', `
                    <div class="result estado-result" ${url ? `data-url="${esc(url)}"` : ''}>
                        <div class="avatar">
                            ${avatarInicialHTML(p.nombre, p.avatar_url)}
                        </div>
                        <div class="estado-result-info">
                            <b>${esc(p.nombre || 'Usuario')}</b>
                            <div class="estado-result-meta">
                                @${esc(p.handle || 'usuario')} · ${haceTiempo(v.visto_at)}
                            </div>
                        </div>
                    </div>
                `);
            });

            list.querySelectorAll('.estado-result[data-url]')
                .forEach(function (el) {
                    el.onclick = function () {
                        window.location.href = el.dataset.url;
                    };
                });

        } else {
            const { data: comentarios, error } = await db.rpc(
                'estado_comentarios_lista',
                {
                    p_estado_id: estadoId
                }
            );

            if (error) throw error;

            const arr = Array.isArray(comentarios)
                ? comentarios
                : (comentarios && comentarios.data) || [];

            if (countEl) {
                countEl.textContent = `(${arr.length})`;
            }

            if (!arr.length) {
                list.innerHTML =
                    '<div class="estado-panel-msg">Aún no hay comentarios.</div>';
                return;
            }

            list.innerHTML = '';

            arr.forEach(function (c) {
                const nombre =
                    c.nombre || c.usuario_handle || 'Usuario';

                const texto =
                    c.comentario || c.texto || c.contenido || '';

                const cuando = c.created_at
                    ? haceTiempo(c.created_at)
                    : '';

                list.insertAdjacentHTML('beforeend', `
                    <div class="result estado-result estado-result-top">
                        <div class="avatar">
                            ${avatarInicialHTML(nombre, c.avatar_url)}
                        </div>
                        <div class="estado-result-info">
                            <b>${esc(nombre)}</b>
                            <div class="estado-comentario">${esc(texto)}</div>
                            ${cuando
                                ? `<div class="estado-result-meta">${esc(cuando)}</div>`
                                : ''
                            }
                        </div>
                    </div>
                `);
            });
        }

    } catch (e) {
        console.error('[Estados] Error cargando panel:', e);

        list.innerHTML =
            '<div class="estado-panel-msg estado-panel-error">No se pudo cargar.</div>';
    }
}

async function abrirVistasModal(estadoId) {
    return abrirPanelEstado(estadoId, 'vistas');
}

function cerrarVistasModal() {
    const modal = $('vistasModal');

    if (modal) {
        modal.classList.remove('show');
    }
}

/* ================================================================
   ELIMINAR HISTORIA
================================================================ */

function extraerPathBucketEstados(url) {
    if (!url) return null;

    const m = url.match(
        /\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+)$/
    );

    if (m) {
        return decodeURIComponent(m[1].split('?')[0]);
    }

    if (!url.startsWith('http') && url.includes('/')) {
        return url;
    }

    return null;
}

async function eliminarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;

    const confirmado = await NeonModal.confirm({
        title: 'Eliminar historia',
        message: '¿Eliminar esta historia? Se borrará para todos. No se puede deshacer.',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        danger: true
    });

    if (!confirmado) return;

    try {
        const { data: fila, error: e1 } = await db.from('estados')
            .select('id, media_url, imagen_url, usuario_id')
            .eq('id', estadoId)
            .maybeSingle();

        if (e1) throw e1;

        if (!fila || fila.usuario_id !== user.id) {
            throw new Error('No puedes eliminar esta historia.');
        }

        const urlMedia = fila.media_url || fila.imagen_url;

        const { error: e2 } = await db.from('estados')
            .delete()
            .eq('id', estadoId)
            .eq('usuario_id', user.id);

        if (e2) throw e2;

        if (urlMedia) {
            try {
                const path = extraerPathBucketEstados(urlMedia);

                if (path) {
                    await db.storage.from(ESTADOS_BUCKET).remove([path]);
                }
            } catch (e) {
                console.warn('[Estados] No se pudo borrar el archivo:', e);
            }
        }

        toast('Historia eliminada.', 'success');

        if (estadoActualUserId === user.id) {
            const indice = estadosCache.findIndex(function (e) {
                return e.id === estadoId;
            });

            if (indice !== -1) {
                estadosCache.splice(indice, 1);
            }

            if (estadoActualIndex >= estadosCache.filter(function (e) {
                return e.usuario_id === user.id;
            }).length) {
                cerrarEstadoViewer();
            } else {
                mostrarEstadoActual();
            }
        } else {
            await cargarEstados();
        }

    } catch (e) {
        console.error('[Estados] Error eliminando:', e);

        toast(
            e.message || 'No se pudo eliminar la historia.',
            'error'
        );
    }
}

/* ================================================================
   COMENTAR HISTORIA
================================================================ */

async function comentarHistoriaMensajes(estadoId) {
    if (!estadoId || !user) return;

    const texto = await NeonModal.prompt({
        title: 'Comentar historia',
        message: 'Escribe tu comentario (máximo 200 caracteres):',
        placeholder: 'Tu comentario',
        confirmText: 'Enviar',
        cancelText: 'Cancelar',
        maxlength: 200
    });

    if (!texto || !texto.trim()) return;

    try {
        const { error } = await db.rpc('estado_enviar_comentario', {
            p_estado_id: estadoId,
            p_comentario: texto.trim()
        });

        if (error) throw error;

        toast('Comentario enviado.', 'success');

    } catch (e) {
        console.error('[Estados] Error comentando:', e);

        toast(
            e.message || 'No se pudo enviar el comentario.',
            'error'
        );
    }
}

/* ================================================================
   PUBLICACIÓN MÚLTIPLE
================================================================ */

function abrirModalEstado() {
    const modal = $('estadoUploadModal');

    if (!modal) return;

    estadosArchivosSeleccionados = [];
    estadosSubiendo = false;

    const fileInput = $('estadoFileInput');
    const caption = $('estadoCaption');
    const btn = $('btnPublicarEstado');

    if (fileInput) {
        fileInput.value = '';
        fileInput.multiple = true;
        fileInput.accept = 'image/*,video/mp4,video/webm,video/quicktime';
    }

    if (caption) caption.value = '';

    if (btn) {
        btn.disabled = true;
        btn.classList.remove('is-loading');
    }

    ocultarEl('estadoPreviewWrap');

    const imagen = $('estadoPreviewImg');

    if (imagen) {
        imagen.removeAttribute('src');
        imagen.classList.remove('hidden');
    }

    const video = estadoObtenerElemento('estadoPreviewVideo');

    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.classList.add('hidden');
    }

    const modalLista = estadoObtenerElemento('estadoPreviewLista');

    if (modalLista) {
        modalLista.innerHTML = '';
    }

    modal.classList.add('show');
}

function cerrarModalEstado() {
    const modal = $('estadoUploadModal');

    if (modal) {
        modal.classList.remove('show');
    }

    const video = estadoObtenerElemento('estadoPreviewVideo');

    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }

    estadosArchivosSeleccionados = [];
}

function seleccionarArchivoEstado() {
    const input = $('estadoFileInput');

    if (!input || estadosSubiendo) return;

    input.multiple = true;
    input.click();
}

/* ================================================================
   VALIDACIÓN DE ARCHIVOS
================================================================ */

function estadoValidarArchivo(file) {
    if (!file) {
        return {
            valido: false,
            mensaje: 'Archivo no válido.'
        };
    }

    const esVideo = file.type.indexOf('video/') === 0;
    const esImagen = file.type.indexOf('image/') === 0;

    if (!esVideo && !esImagen) {
        return {
            valido: false,
            mensaje: 'Solo se permiten imágenes y videos.'
        };
    }

    if (esVideo) {
        const tiposPermitidos = [
            'video/mp4',
            'video/webm',
            'video/quicktime',
            'video/x-m4v'
        ];

        if (!tiposPermitidos.includes(file.type)) {
            return {
                valido: false,
                mensaje: 'Formato de video no compatible. Utiliza MP4, WebM o MOV.'
            };
        }

        if (file.size > ESTADOS_MAX_VIDEO_MB * 1024 * 1024) {
            return {
                valido: false,
                mensaje: 'Cada video puede pesar máximo 25 MB.'
            };
        }

    } else {
        if (file.size > ESTADOS_MAX_IMAGEN_MB * 1024 * 1024) {
            return {
                valido: false,
                mensaje: 'Cada imagen puede pesar máximo 10 MB.'
            };
        }
    }

    return {
        valido: true,
        esVideo: esVideo,
        esImagen: esImagen
    };
}

async function estadoObtenerDuracionVideo(file) {
    return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');

        video.preload = 'metadata';

        video.onloadedmetadata = function () {
            const duracion = video.duration;

            URL.revokeObjectURL(url);

            if (!isFinite(duracion) || duracion <= 0) {
                reject(new Error('No se pudo leer la duración del video.'));
                return;
            }

            resolve(duracion);
        };

        video.onerror = function () {
            URL.revokeObjectURL(url);

            reject(new Error('No se pudo abrir el video seleccionado.'));
        };

        video.src = url;
    });
}

/* ================================================================
   VISTA PREVIA MÚLTIPLE
================================================================ */

async function previewEstado(event) {
    const input = event.target;
    const archivos = Array.from(input.files || []);

    if (!archivos.length) return;

    if (estadosSubiendo) return;

    const videos = archivos.filter(function (f) {
        return f.type.indexOf('video/') === 0;
    });

    const imagenes = archivos.filter(function (f) {
        return f.type.indexOf('image/') === 0;
    });

    if (videos.length > ESTADOS_MAX_VIDEOS) {
        toast('Puedes seleccionar máximo 5 videos por publicación.', 'error');
        input.value = '';
        return;
    }

    if (imagenes.length > ESTADOS_MAX_IMAGENES) {
        toast('Puedes seleccionar máximo 10 imágenes por publicación.', 'error');
        input.value = '';
        return;
    }

    if (videos.length + imagenes.length !== archivos.length) {
        toast('Hay archivos que no son compatibles.', 'error');
        input.value = '';
        return;
    }

    const validos = [];

    try {
        for (let i = 0; i < archivos.length; i++) {
            const file = archivos[i];
            const validacion = estadoValidarArchivo(file);

            if (!validacion.valido) {
                throw new Error(validacion.mensaje);
            }

            let duracion = 0;

            if (validacion.esVideo) {
                duracion = await estadoObtenerDuracionVideo(file);

                if (duracion > ESTADOS_MAX_VIDEO_SEGUNDOS) {
                    throw new Error(
                        'Cada video debe durar máximo 1 minuto.'
                    );
                }
            }

            validos.push({
                file: file,
                tipo: validacion.esVideo ? 'video' : 'imagen',
                duracion: duracion,
                url: URL.createObjectURL(file)
            });
        }

        estadosArchivosSeleccionados.forEach(function (item) {
            if (item.url) URL.revokeObjectURL(item.url);
        });

        estadosArchivosSeleccionados = validos;

        estadoRenderizarPreviews();

        const btn = $('btnPublicarEstado');

        if (btn) {
            btn.disabled = estadosArchivosSeleccionados.length === 0;
        }

    } catch (e) {
        validos.forEach(function (item) {
            if (item.url) URL.revokeObjectURL(item.url);
        });

        estadosArchivosSeleccionados = [];

        input.value = '';

        const btn = $('btnPublicarEstado');

        if (btn) btn.disabled = true;

        ocultarEl('estadoPreviewWrap');

        toast(e.message || 'No se pudieron validar los archivos.', 'error');
    }
}

function estadoRenderizarPreviews() {
    const wrap = $('estadoPreviewWrap');

    if (!wrap) return;

    wrap.classList.remove('hidden');

    let lista = estadoObtenerElemento('estadoPreviewLista');

    if (!lista) {
        lista = document.createElement('div');
        lista.id = 'estadoPreviewLista';
        lista.className = 'estado-preview-grid';

        const referencia = $('estadoPreviewImg');

        if (referencia && referencia.parentNode) {
            referencia.parentNode.appendChild(lista);
            referencia.classList.add('hidden');
        } else {
            wrap.appendChild(lista);
        }
    }

    lista.innerHTML = '';

    estadosArchivosSeleccionados.forEach(function (item, index) {
        const tarjeta = document.createElement('div');

        tarjeta.className = 'estado-preview-item';

        tarjeta.style.setProperty('position', 'relative');
        tarjeta.style.setProperty('overflow', 'hidden');
        tarjeta.style.setProperty('background', '#000');
        tarjeta.style.setProperty('aspect-ratio', '9 / 16');
        tarjeta.style.setProperty('min-width', '0');
        tarjeta.style.setProperty('border-radius', '10px');

        let media;

        if (item.tipo === 'video') {
            media = document.createElement('video');
            media.muted = true;
            media.playsInline = true;
            media.controls = true;
            media.preload = 'metadata';
        } else {
            media = document.createElement('img');
            media.alt = 'Vista previa de imagen';
        }

        media.src = item.url;

        media.style.setProperty('width', '100%');
        media.style.setProperty('height', '100%');
        media.style.setProperty('object-fit', 'contain');
        media.style.setProperty('display', 'block');
        media.style.setProperty('background', '#000');

        const numero = document.createElement('span');

        numero.className = 'estado-preview-numero';
        numero.textContent = String(index + 1);

        numero.style.setProperty('position', 'absolute');
        numero.style.setProperty('top', '8px');
        numero.style.setProperty('left', '8px');
        numero.style.setProperty('background', 'rgba(0,0,0,.75)');
        numero.style.setProperty('color', '#fff');
        numero.style.setProperty('padding', '4px 8px');
        numero.style.setProperty('border-radius', '20px');
        numero.style.setProperty('font-size', '12px');

        tarjeta.appendChild(media);
        tarjeta.appendChild(numero);

        lista.appendChild(tarjeta);
    });

    let contador = estadoObtenerElemento('estadoPreviewContador');

    if (!contador) {
        contador = document.createElement('div');
        contador.id = 'estadoPreviewContador';
        contador.className = 'estado-preview-contador';

        wrap.appendChild(contador);
    }

    const totalVideos = estadosArchivosSeleccionados.filter(function (a) {
        return a.tipo === 'video';
    }).length;

    const totalImagenes = estadosArchivosSeleccionados.filter(function (a) {
        return a.tipo === 'imagen';
    }).length;

    contador.textContent =
        totalVideos + ' videos · ' +
        totalImagenes + ' imágenes · ' +
        estadosArchivosSeleccionados.length + ' archivos';
}

/* ================================================================
   SUBIR Y PUBLICAR
================================================================ */

async function publicarEstado() {
    if (estadosSubiendo) return;

    if (!user || !await auth()) return;

    const input = $('estadoFileInput');

    if (!estadosArchivosSeleccionados.length) {
        const archivos = Array.from(input.files || []);

        if (archivos.length) {
            await previewEstado({
                target: input
            });
        }
    }

    if (!estadosArchivosSeleccionados.length) {
        toast('Selecciona al menos una imagen o un video.', 'error');
        return;
    }

    const archivos = estadosArchivosSeleccionados.slice();

    const totalVideos = archivos.filter(function (a) {
        return a.tipo === 'video';
    }).length;

    const totalImagenes = archivos.filter(function (a) {
        return a.tipo === 'imagen';
    }).length;

    if (totalVideos > ESTADOS_MAX_VIDEOS) {
        toast('El máximo es de 5 videos.', 'error');
        return;
    }

    if (totalImagenes > ESTADOS_MAX_IMAGENES) {
        toast('El máximo es de 10 imágenes.', 'error');
        return;
    }

    estadosSubiendo = true;

    const btn = $('btnPublicarEstado');

    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-loading');
    }

    const captionInput = $('estadoCaption');

    const caption = captionInput
        ? captionInput.value.trim()
        : '';

    let publicados = 0;
    let errores = [];

    try {
        for (let i = 0; i < archivos.length; i++) {
            const item = archivos[i];

            try {
                const resultado = await subirViaBackend(
                    item.file,
                    ESTADOS_BUCKET,
                    item.tipo
                );

                if (!resultado || !resultado.url) {
                    throw new Error('El servidor no devolvió la URL del archivo.');
                }

                const expiresAt = new Date(
                    Date.now() + ESTADOS_TTL_MS
                ).toISOString();

                const { error: insertError } = await db.from('estados').insert({
                    usuario_id: user.id,
                    imagen_url: resultado.url,
                    media_url: resultado.url,
                    media_tipo: item.tipo,
                    duracion_segundos: item.tipo === 'video'
                        ? Math.ceil(item.duracion)
                        : ESTADOS_DURACION_IMAGEN,
                    caption: caption || null,
                    origen: 'mensajes',
                    expires_at: expiresAt
                });

                if (insertError) {
                    throw insertError;
                }

                publicados++;

            } catch (e) {
                console.error(
                    '[Estados] Error publicando archivo ' + (i + 1),
                    e
                );

                errores.push({
                    numero: i + 1,
                    mensaje: e.message || 'Error desconocido'
                });
            }
        }

        if (publicados > 0) {
            toast(
                publicados + ' de ' + archivos.length +
                ' historias publicadas correctamente.',
                'success'
            );

            cerrarModalEstado();

            await cargarEstados();
        }

        if (errores.length > 0) {
            console.error('[Estados] Archivos no publicados:', errores);

            toast(
                'No se pudieron publicar ' + errores.length +
                ' archivos. Revisa la conexión e inténtalo nuevamente.',
                'warning'
            );
        }

        if (publicados === 0 && errores.length > 0) {
            throw new Error('No se pudo publicar ningún archivo.');
        }

    } catch (e) {
        console.error('[Estados] Error general:', e);

        if (e.code === '42P01') {
            toast(
                'Falta una tabla de estados en Supabase. Consulta la referencia SQL.',
                'error'
            );
        } else if (e.code === '42703') {
            toast(
                'Falta una columna requerida en Supabase. Consulta la referencia SQL.',
                'error'
            );
        } else {
            toast(
                e.message || 'No se pudieron publicar las historias.',
                'error'
            );
        }

    } finally {
        estadosSubiendo = false;

        if (btn) {
            btn.disabled = false;
            btn.classList.remove('is-loading');
        }
    }
}

/* ================================================================
   NAVEGACIÓN DEL VISOR
================================================================ */

function estadoInstalarNavegacion() {
    const viewer = $('estadoViewer');

    if (!viewer || viewer.dataset.estadosEventos === '1') return;

    viewer.dataset.estadosEventos = '1';

    viewer.addEventListener('click', function (e) {
        const target = e.target;

        if (
            target.closest('#evPrev') ||
            target.closest('#evNext') ||
            target.closest('#evEliminar') ||
            target.closest('#evComentar') ||
            target.closest('#evVistas') ||
            target.closest('#evSkip') ||
            target.closest('video') ||
            target.closest('button')
        ) {
            return;
        }

        const rect = viewer.getBoundingClientRect();
        const mitad = rect.left + rect.width / 2;

        if (e.clientX < mitad) {
            anteriorEstado();
        } else {
            siguienteEstado();
        }
    });

    viewer.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches.length) return;

        const target = e.target;

        if (
            target.closest('video') ||
            target.closest('button') ||
            target.closest('input')
        ) {
            return;
        }

        estadoPausado = true;
    }, {
        passive: true
    });

    viewer.addEventListener('touchend', function () {
        if (!viewer.classList.contains('show')) return;

        estadoPausado = false;

        const video = estadoObtenerElemento('evVideo');

        if (video && !video.classList.contains('hidden')) {
            video.play().catch(function () {});
        }
    }, {
        passive: true
    });
}

/* ================================================================
   INICIALIZACIÓN
================================================================ */

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', estadoInstalarNavegacion);
} else {
    estadoInstalarNavegacion();
}

/* ================================================================
   REFERENCIA DE CONFIGURACIÓN SUPABASE
================================================================

IMPORTANTE:

Este módulo utiliza las estructuras existentes:

1. public.estados
2. public.estados_vistas
3. public.perfiles_publicos
4. RPC estados_mensajes_activos
5. RPC estado_comentarios_lista
6. RPC estado_enviar_comentario

No crea ni supone tablas adicionales.

Si public.estados no existe, verificar primero:

    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('estados', 'estados_vistas');

Si public.estados existe, verificar columnas:

    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'estados'
    ORDER BY ordinal_position;

Columnas que utiliza este módulo en public.estados:

    id
    usuario_id
    imagen_url
    media_url
    media_tipo
    duracion_segundos
    caption
    origen
    created_at
    expires_at

Columnas utilizadas en public.estados_vistas:

    id
    estado_id
    usuario_id
    visto_at

Si falta alguna tabla o columna, agregar únicamente después de
comparar el resultado con la estructura actual de producción.

IMPORTANTE PARA LOS LÍMITES:

Los límites de 5 videos y 10 imágenes se aplican a cada selección
y publicación realizada desde este módulo.

Para garantizar los mismos límites ante solicitudes externas,
deben validarse también en el servidor y mediante políticas
o restricciones de Supabase.

BUCKET:

El bucket utilizado sigue siendo:

    ESTADOS_BUCKET

El sistema de almacenamiento debe permitir la subida autenticada
y la lectura de los archivos publicados.

La duración máxima de video se valida en el navegador. Para
garantizarla, el backend debe verificar también los metadatos
reales del archivo.

=============================================================== */