// ================================================================
// CSARIEL'S · MURO · HISTORIAS v5.0 GALACTIC PRO
// ================================================================
// ACTUALIZACIÓN v5.0
// - Interfaz limpia y profesional, sin emojis decorativos.
// - Iconografía SVG moderna y consistente.
// - Sustituido el emoji de ojo por icono SVG de visualización.
// - Sustituidos los emojis de vistas y comentarios.
// - Miniaturas optimizadas para imágenes y videos.
// - Protección contra eventos duplicados de navegación.
// - Temporizador mejorado y sincronizado con reproducción de video.
// - Pausa y reanudación más precisas.
// - Protección para evitar doble publicación.
// - Mejor gestión de errores de carga.
// - Liberación de temporizadores y recursos.
// - Protección contra respuestas asíncronas desactualizadas.
// - Mejor accesibilidad en botones y controles.
// - Conserva tablas, RPC, parámetros y rutas existentes.
// ================================================================

var HISTORIA_MAX_IMAGEN_BYTES = 10 * 1024 * 1024;
var HISTORIA_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
var HISTORIA_MAX_VIDEO_SEG = 30;
var HISTORIA_DURACION_IMAGEN = 5;

var historiasDelFeed = [];
var historiaSeleccionada = null;
var estadosVistosIds = new Set();

var temporizadorHistoria = null;
var timerPausado = false;
var timerRestanteMs = 0;
var timerInicioMs = 0;

var panelAbierto = null;
var historiaSubiendo = false;
var historiaAvanceBloqueado = false;
var historiaVisorVersion = 0;

// ================================================================
// UTILIDADES DOM SEGURO
// ================================================================

function el(tag, props, children) {
    var nodo = document.createElement(tag);

    if (props) {
        Object.keys(props).forEach(function (k) {
            var v = props[k];

            if (v == null) return;

            if (k === 'class' || k === 'className') {
                nodo.className = v;
            }
            else if (k === 'style' && typeof v === 'object') {
                Object.keys(v).forEach(function (s) {
                    nodo.style[s] = v[s];
                });
            }
            else if (k === 'text') {
                nodo.appendChild(document.createTextNode(String(v)));
            }
            else if (k === 'on' && typeof v === 'object') {
                Object.keys(v).forEach(function (evento) {
                    if (typeof v[evento] === 'function') {
                        nodo.addEventListener(evento, v[evento]);
                    }
                });
            }
            else if (k.indexOf('on') === 0 && typeof v === 'function') {
                nodo.addEventListener(k.slice(2).toLowerCase(), v);
            }
            else if (k === 'dataset' && typeof v === 'object') {
                Object.keys(v).forEach(function (d) {
                    nodo.dataset[d] = v[d];
                });
            }
            else if (k === 'disabled') {
                nodo.disabled = !!v;
            }
            else if (k === 'autoplay' || k === 'muted' || k === 'playsinline') {
                nodo.setAttribute(k, '');
            }
            else {
                nodo.setAttribute(k, String(v));
            }
        });
    }

    if (children) {
        (Array.isArray(children) ? children : [children]).forEach(function (c) {
            if (c == null || c === false) return;

            nodo.appendChild(
                typeof c === 'string'
                    ? document.createTextNode(c)
                    : c
            );
        });
    }

    return nodo;
}

function limpiar(nodo) {
    if (!nodo) return;

    while (nodo.firstChild) {
        nodo.removeChild(nodo.firstChild);
    }
}

function svgHistoria(nombre, clase) {
    var rutas = {
        play: 'M8 5v14l11-7z',
        plus: 'M12 5v14M5 12h14',
        close: 'M18 6 6 18M6 6l12 12',
        eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
        comment: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',
        left: 'M15 18 9 12l6-6',
        right: 'M9 18l6-6-6-6',
        send: 'M22 2 11 13 M22 2 15 22 11 13 2 9 22 2',
        clock: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'
    };

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    if (clase) svg.setAttribute('class', clase);
    svg.setAttribute('aria-hidden', 'true');

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', rutas[nombre] || rutas.play);

    svg.appendChild(path);

    return svg;
}

function esMiHistoria(u) {
    return !!(
        sessionUser &&
        u &&
        u.usuario_id === sessionUser.id
    );
}

// ================================================================
// CARGA
// ================================================================

async function cargarHistorias() {
    var contenedor = document.getElementById('csStoryStrip');

    if (!contenedor || !supabaseClient) return;

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
        }).filter(function (u) {
            return u.estados.length > 0;
        });

        await cargarMisVistas();

        renderizarBarraHistorias();

    } catch (e) {
        console.error('Error cargando historias:', e);
    }
}

// ================================================================
// VISTAS DEL USUARIO
// ================================================================

async function cargarMisVistas() {
    estadosVistosIds = new Set();

    if (!sessionUser) return;

    var ids = [];

    historiasDelFeed.forEach(function (u) {
        (u.estados || []).forEach(function (e) {
            if (e.id) ids.push(e.id);
        });
    });

    if (!ids.length) return;

    var res = await supabaseClient
        .from('estados_vistas')
        .select('estado_id')
        .eq('usuario_id', sessionUser.id)
        .in('estado_id', ids);

    if (res.error) throw res.error;

    (res.data || []).forEach(function (v) {
        estadosVistosIds.add(v.estado_id);
    });
}

function todosVistos(estados) {
    return (estados || []).every(function (e) {
        return estadosVistosIds.has(e.id);
    });
}

// ================================================================
// MINIATURA DEL ANILLO
// ================================================================

function miniaturaAnillo(estado, fallbackLetra) {
    if (estado && estado.media_tipo === 'video') {
        return el('span', {
            class: 'story-avatar story-video'
        }, [
            svgHistoria('play', 'icon')
        ]);
    }

    var url = estado
        ? (estado.media_url || estado.imagen_url || '')
        : '';

    if (url) {
        var img = el('img', {
            src: url,
            alt: '',
            loading: 'lazy'
        });

        img.onerror = function () {
            img.style.display = 'none';
        };

        return img;
    }

    return el('span', {
        class: 'story-avatar',
        text: fallbackLetra || '+'
    });
}

// ================================================================
// BARRA DE HISTORIAS
// ================================================================

function renderizarBarraHistorias() {
    var contenedor = document.getElementById('csStoryStrip');

    if (!contenedor) return;

    limpiar(contenedor);

    var miHistoria = historiasDelFeed.find(function (u) {
        return sessionUser && u.usuario_id === sessionUser.id;
    });

    // ------------------------------------------------------------
    // MI HISTORIA
    // ------------------------------------------------------------

    if (miHistoria && miHistoria.estados.length > 0) {
        var ultimo = miHistoria.estados[miHistoria.estados.length - 1];

        var ringMio = el('span', {
            class: 'cs-story-ring'
        }, [
            miniaturaAnillo(ultimo, 'Tú')
        ]);

        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                'aria-label': 'Ver mi historia',
                onclick: function () {
                    abrirHistoriasDe(sessionUser.id);
                }
            }, [
                ringMio,
                el('span', null, 'Tú')
            ])
        );

    } else {
        var ringAdd = el('span', {
            class: 'cs-story-ring story-add'
        }, [
            el('span', {
                class: 'cs-story-plus'
            }, [
                svgHistoria('plus', 'icon')
            ])
        ]);

        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                'aria-label': 'Crear historia',
                onclick: crearHistoria
            }, [
                ringAdd,
                el('span', null, 'Tu historia')
            ])
        );
    }

    // ------------------------------------------------------------
    // HISTORIAS DE OTROS USUARIOS
    // ------------------------------------------------------------

    historiasDelFeed.forEach(function (u) {
        if (sessionUser && u.usuario_id === sessionUser.id) return;

        var vistas = todosVistos(u.estados);

        var inicial = (u.nombre || '?')
            .charAt(0)
            .toUpperCase();

        var ring = el('span', {
            class: 'cs-story-ring' + (vistas ? ' vista' : '')
        }, [
            u.avatar_url
                ? el('img', {
                    src: u.avatar_url,
                    alt: '',
                    loading: 'lazy'
                })
                : el('span', {
                    class: 'story-avatar',
                    text: inicial
                })
        ]);

        var nombre = u.nombre || u.handle || 'Explorador';

        contenedor.appendChild(
            el('button', {
                type: 'button',
                class: 'cs-story-item',
                'aria-label': 'Ver historia de ' + nombre,
                onclick: function () {
                    abrirHistoriasDe(u.usuario_id);
                }
            }, [
                ring,
                el('span', null, nombre)
            ])
        );
    });
}

// ================================================================
// CREAR HISTORIA
// ================================================================

function crearHistoria() {
    if (!sessionUser) {
        showToast('Inicia sesión para subir una historia', 'error');
        return;
    }

    if (historiaSubiendo) return;

    var input = document.getElementById('inputHistoria');

    if (!input) {
        input = document.createElement('input');

        input.type = 'file';
        input.id = 'inputHistoria';
        input.accept = 'image/*,video/*';

        input.style.cssText =
            'position:fixed;' +
            'left:-9999px;' +
            'top:0;' +
            'width:1px;' +
            'height:1px;' +
            'opacity:0;';

        input.setAttribute('tabindex', '-1');
        input.setAttribute('aria-hidden', 'true');

        input.addEventListener('change', subirHistoria);

        document.body.appendChild(input);
    }

    input.value = '';
    input.click();
}

// ================================================================
// DURACIÓN DEL VIDEO
// ================================================================

function leerDuracionVideo(file) {
    return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');

        video.preload = 'metadata';

        var finalizado = false;

        function limpiarRecursos() {
            if (finalizado) return;

            finalizado = true;

            video.removeAttribute('src');
            video.load();

            URL.revokeObjectURL(url);
        }

        video.onloadedmetadata = function () {
            var segundos = video.duration;

            limpiarRecursos();

            if (!isFinite(segundos) || segundos <= 0) {
                reject(new Error('Duración de video inválida'));
                return;
            }

            resolve(segundos);
        };

        video.onerror = function () {
            limpiarRecursos();
            reject(new Error('No se pudo leer el video'));
        };

        video.src = url;
    });
}

// ================================================================
// SUBIR HISTORIA
// ================================================================

async function subirHistoria(event) {
    var input = event.target;
    var file = input.files && input.files[0];

    if (!file || historiaSubiendo) return;

    var esImagen = file.type.indexOf('image/') === 0;
    var esVideo = file.type.indexOf('video/') === 0;

    if (!esImagen && !esVideo) {
        showToast('Solo se permiten imágenes o videos', 'error');
        input.value = '';
        return;
    }

    var tipo = esVideo ? 'video' : 'imagen';

    var maxBytes = esVideo
        ? HISTORIA_MAX_VIDEO_BYTES
        : HISTORIA_MAX_IMAGEN_BYTES;

    if (file.size > maxBytes) {
        showToast(
            esVideo
                ? 'Video máximo 25 MB'
                : 'Imagen máxima 10 MB',
            'error'
        );

        input.value = '';
        return;
    }

    historiaSubiendo = true;

    var duracion = HISTORIA_DURACION_IMAGEN;

    try {
        if (esVideo) {
            var segundos = await leerDuracionVideo(file);

            if (segundos > HISTORIA_MAX_VIDEO_SEG) {
                throw new Error(
                    'El video debe durar máximo ' +
                    HISTORIA_MAX_VIDEO_SEG +
                    ' segundos'
                );
            }

            duracion = Math.max(1, Math.ceil(segundos));
        }

        showToast('Subiendo historia...', '');

        var sesion = await supabaseClient.auth.getSession();

        var token = sesion &&
            sesion.data &&
            sesion.data.session
            ? sesion.data.session.access_token
            : null;

        if (!token) {
            throw new Error('Sesión expirada');
        }

        var fd = new FormData();

        fd.append('file', file);
        fd.append('destino', 'sariels-estados');
        fd.append('tipo', tipo);

        var resp = await fetch('/api/media/upload', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            },
            body: fd
        });

        var data = await resp.json().catch(function () {
            return {};
        });

        if (!resp.ok || !data.ok || !data.url) {
            throw new Error(
                data.error || 'No se pudo subir la historia'
            );
        }

        var insert = await supabaseClient
            .from('estados')
            .insert({
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

        showToast(
            e.message || 'Error al subir la historia',
            'error'
        );

    } finally {
        historiaSubiendo = false;

        if (input) input.value = '';
    }
}

// ================================================================
// ABRIR HISTORIAS
// ================================================================

function abrirHistoriasDe(usuarioId) {
    var usuario = historiasDelFeed.find(function (u) {
        return u.usuario_id === usuarioId;
    });

    if (!usuario || !usuario.estados.length) {
        showToast('Este usuario no tiene historias activas', 'warning');
        return;
    }

    limpiarTemporizadorHistoria();

    historiaSeleccionada = {
        usuario: usuario,
        indice: 0
    };

    historiaAvanceBloqueado = false;

    mostrarVisorHistoria(true);
    renderizarVisorHistoria();
}

// ================================================================
// VISOR PRINCIPAL
// ================================================================

function renderizarVisorHistoria() {
    var visor = document.getElementById('csHistoriaVisor');

    if (!visor || !historiaSeleccionada) return;

    var versionActual = ++historiaVisorVersion;

    var u = historiaSeleccionada.usuario;

    var estado = u.estados[historiaSeleccionada.indice];

    if (!estado) return;

    var nombre = u.nombre || u.handle || 'Explorador';

    var soyDueno = esMiHistoria(u);

    limpiarTemporizadorHistoria();

    panelAbierto = null;

    timerPausado = false;

    limpiar(visor);

    // ------------------------------------------------------------
    // BARRAS DE PROGRESO
    // ------------------------------------------------------------

    var barras = el('div', {
        class: 'cs-historia-barras'
    });

    u.estados.forEach(function (_, i) {
        var clase = i < historiaSeleccionada.indice
            ? 'completada'
            : (i === historiaSeleccionada.indice ? 'activa' : '');

        barras.appendChild(
            el('div', {
                class: 'cs-historia-barra ' + clase
            })
        );
    });

    // ------------------------------------------------------------
    // ENCABEZADO
    // ------------------------------------------------------------

    var header = el('div', {
        class: 'cs-historia-header'
    }, [
        el('span', {
            class: 'cs-historia-autor'
        }, nombre),

        el('button', {
            type: 'button',
            class: 'cs-historia-cerrar',
            onclick: cerrarVisorHistoria,
            'aria-label': 'Cerrar historias'
        }, [
            svgHistoria('close', 'icon')
        ])
    ]);

    // ------------------------------------------------------------
    // CONTENEDOR MULTIMEDIA
    // ------------------------------------------------------------

    var media = el('div', {
        class: 'cs-historia-media'
    });

    var urlMedia = estado.media_url || estado.imagen_url || '';

    if (estado.media_tipo === 'video') {
        var video = el('video', {
            id: 'csHistoriaVideo',
            src: urlMedia,
            autoplay: true,
            muted: true,
            playsinline: true,
            preload: 'auto',
            class: 'cs-historia-media-el'
        });

        video.addEventListener('ended', function () {
            if (
                versionActual !== historiaVisorVersion ||
                !historiaSeleccionada
            ) return;

            historiaSiguiente();
        });

        video.addEventListener('error', function () {
            if (versionActual !== historiaVisorVersion) return;

            console.warn('No se pudo reproducir el video de la historia');
        });

        media.appendChild(video);

    } else {
        var imagen = el('img', {
            src: urlMedia,
            alt: 'Historia',
            class: 'cs-historia-media-el',
            loading: 'eager'
        });

        imagen.onerror = function () {
            imagen.alt = 'No se pudo cargar esta imagen';
        };

        media.appendChild(imagen);
    }

    // ------------------------------------------------------------
    // DESCRIPCIÓN
    // ------------------------------------------------------------

    var caption = null;

    if (estado.caption) {
        caption = el('div', {
            class: 'cs-historia-caption'
        }, estado.caption);
    }

    // ------------------------------------------------------------
    // PIE DEL PROPIETARIO
    // ------------------------------------------------------------

    var pie = null;

    if (soyDueno) {
        pie = el('div', {
            class: 'cs-historia-pie'
        }, [
            el('div', {
                class: 'cs-historia-resumen',
                id: 'csResumenEstado'
            }, 'Cargando resumen...'),

            el('div', {
                class: 'cs-historia-acciones'
            }, [
                el('button', {
                    type: 'button',
                    class: 'cs-historia-pie-btn',
                    onclick: function () {
                        abrirPanel('vistas');
                    }
                }, [
                    svgHistoria('eye', 'icon'),
                    el('span', null, 'Vistas')
                ]),

                el('button', {
                    type: 'button',
                    class: 'cs-historia-pie-btn',
                    onclick: function () {
                        abrirPanel('comentarios');
                    }
                }, [
                    svgHistoria('comment', 'icon'),
                    el('span', null, 'Comentarios')
                ])
            ])
        ]);

    } else {

        // --------------------------------------------------------
        // CAMPO DE COMENTARIOS
        // --------------------------------------------------------

        var inputComentario = el('input', {
            type: 'text',
            id: 'csComentarioInput',
            class: 'cs-historia-input',
            maxlength: '200',
            placeholder: 'Escribe un comentario...',
            autocomplete: 'off'
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
            type: 'button',
            class: 'cs-historia-enviar',
            'aria-label': 'Enviar comentario',
            onclick: function () {
                enviarComentarioHistoria(inputComentario);
            }
        }, [
            svgHistoria('send', 'icon')
        ]);

        pie = el('div', {
            class: 'cs-historia-pie'
        }, [
            el('div', {
                class: 'cs-historia-comentar'
            }, [
                inputComentario,
                btnEnviar
            ])
        ]);
    }

    // ------------------------------------------------------------
    // NAVEGACIÓN
    // ------------------------------------------------------------

    var nav = el('div', {
        class: 'cs-historia-nav'
    }, [
        el('button', {
            type: 'button',
            onclick: historiaAnterior,
            disabled: historiaSeleccionada.indice === 0,
            'aria-label': 'Historia anterior'
        }, [
            svgHistoria('left', 'icon')
        ]),

        el('button', {
            type: 'button',
            onclick: historiaSiguiente,
            'aria-label': 'Siguiente historia'
        }, [
            svgHistoria('right', 'icon')
        ])
    ]);

    // ------------------------------------------------------------
    // TARJETA
    // ------------------------------------------------------------

    var card = el('div', {
        class: 'cs-historia-card',
        onclick: function (e) {
            e.stopPropagation();
        }
    }, [
        barras,
        header,
        media,
        caption,
        pie,
        nav
    ]);

    // ------------------------------------------------------------
    // PAUSA POR INTERACCIÓN
    // ------------------------------------------------------------

    card.addEventListener('mousedown', pausarTimer);
    card.addEventListener('mouseup', reanudarTimer);
    card.addEventListener('mouseleave', reanudarTimer);

    card.addEventListener('touchstart', pausarTimer, {
        passive: true
    });

    card.addEventListener('touchend', reanudarTimer, {
        passive: true
    });

    card.addEventListener('touchcancel', reanudarTimer, {
        passive: true
    });

    // ------------------------------------------------------------
    // FONDO
    // ------------------------------------------------------------

    var backdrop = el('div', {
        class: 'cs-historia-backdrop',
        onclick: cerrarVisorHistoria
    });

    visor.appendChild(backdrop);
    visor.appendChild(card);

    // ------------------------------------------------------------
    // REGISTRAR VISTA
    // ------------------------------------------------------------

    registrarVista(estado.id, soyDueno);

    // ------------------------------------------------------------
    // RESUMEN DEL PROPIETARIO
    // ------------------------------------------------------------

    if (soyDueno) {
        cargarResumenEstado(estado.id);
    }

    // ------------------------------------------------------------
    // TEMPORIZADOR
    // ------------------------------------------------------------

    iniciarTimer(estado);
}

// ================================================================
// TEMPORIZADOR
// ================================================================

function limpiarTemporizadorHistoria() {
    if (temporizadorHistoria) {
        clearTimeout(temporizadorHistoria);
        temporizadorHistoria = null;
    }

    timerRestanteMs = 0;
    timerInicioMs = 0;
    timerPausado = false;
}

function iniciarTimer(estado) {
    limpiarTemporizadorHistoria();

    historiaAvanceBloqueado = false;

    var duracionMs = (
        estado.duracion_segundos ||
        HISTORIA_DURACION_IMAGEN
    ) * 1000;

    if (estado.media_tipo === 'video') {
        var video = document.getElementById('csHistoriaVideo');

        if (video && video.duration && isFinite(video.duration)) {
            duracionMs = Math.max(
                duracionMs,
                video.duration * 1000
            );
        }

        // Margen de seguridad para evitar avanzar antes de terminar.
        duracionMs += 1500;
    }

    programarTimer(duracionMs);
}

function programarTimer(ms) {
    if (historiaAvanceBloqueado) return;

    clearTimeout(temporizadorHistoria);

    timerRestanteMs = Math.max(0, ms);
    timerInicioMs = Date.now();

    if (timerPausado) return;

    temporizadorHistoria = setTimeout(function () {
        temporizadorHistoria = null;

        if (!historiaSeleccionada) return;

        if (estaEscribiendoComentario()) {
            timerPausado = true;
            timerRestanteMs = 1000;
            return;
        }

        historiaSiguiente();

    }, timerRestanteMs);
}

function pausarTimer() {
    if (timerPausado || !historiaSeleccionada) return;

    timerPausado = true;

    clearTimeout(temporizadorHistoria);
    temporizadorHistoria = null;

    var transcurrido = timerInicioMs
        ? Date.now() - timerInicioMs
        : 0;

    timerRestanteMs = Math.max(
        0,
        timerRestanteMs - transcurrido
    );

    var video = document.getElementById('csHistoriaVideo');

    if (video && !video.paused) {
        video.pause();
    }
}

function estaEscribiendoComentario() {
    var input = document.getElementById('csComentarioInput');

    return !!(
        input &&
        document.activeElement === input
    );
}

function reanudarTimer() {
    if (!timerPausado || !historiaSeleccionada) return;

    if (estaEscribiendoComentario()) return;

    timerPausado = false;

    var video = document.getElementById('csHistoriaVideo');

    if (video && video.paused && !video.ended) {
        var promesa = video.play();

        if (promesa && typeof promesa.catch === 'function') {
            promesa.catch(function () {
                console.warn('No se pudo reanudar el video');
            });
        }
    }

    programarTimer(
        timerRestanteMs > 0 ? timerRestanteMs : 1000
    );
}

// ================================================================
// REGISTRO DE VISTAS
// ================================================================

async function registrarVista(estadoId, soyDueno) {
    if (soyDueno) return;

    if (!sessionUser || !estadoId) return;

    if (estadosVistosIds.has(estadoId)) return;

    estadosVistosIds.add(estadoId);

    try {
        var res = await supabaseClient
            .from('estados_vistas')
            .upsert(
                {
                    estado_id: estadoId,
                    usuario_id: sessionUser.id,
                    visto_at: new Date().toISOString()
                },
                {
                    onConflict: 'estado_id,usuario_id',
                    ignoreDuplicates: true
                }
            );

        if (res.error) throw res.error;

    } catch (e) {
        console.error('No se pudo registrar la vista:', e);

        estadosVistosIds.delete(estadoId);
    }
}

// ================================================================
// RESUMEN DEL PROPIETARIO
// ================================================================

async function cargarResumenEstado(estadoId) {
    var resumenEl = document.getElementById('csResumenEstado');

    if (!resumenEl) return;

    try {
        var resultados = await Promise.all([
            supabaseClient.rpc('estado_vistas_lista', {
                p_estado_id: estadoId
            }),

            supabaseClient.rpc('estado_comentarios_lista', {
                p_estado_id: estadoId
            })
        ]);

        var rv = resultados[0];
        var rc = resultados[1];

        if (rv.error) console.warn('vistas_lista:', rv.error);
        if (rc.error) console.warn('comentarios_lista:', rc.error);

        var vistas = rv.data || [];
        var comentarios = rc.data || [];

        // Evitar actualizar una historia que ya no está abierta.
        if (!historiaSeleccionada) return;

        var estadoActual = historiaSeleccionada.usuario.estados[
            historiaSeleccionada.indice
        ];

        if (!estadoActual || estadoActual.id !== estadoId) return;

        resumenEl = document.getElementById('csResumenEstado');

        if (!resumenEl) return;

        limpiar(resumenEl);

        resumenEl.appendChild(
            el('span', {
                class: 'cs-historia-total-vistas'
            }, [
                svgHistoria('eye', 'icon'),
                el('span', null,
                    vistas.length + ' vista' +
                    (vistas.length === 1 ? '' : 's')
                )
            ])
        );

        resumenEl.appendChild(
            el('span', {
                class: 'cs-historia-total-comentarios'
            }, [
                svgHistoria('comment', 'icon'),
                el('span', null,
                    comentarios.length + ' comentario' +
                    (comentarios.length === 1 ? '' : 's')
                )
            ])
        );

        window.__csVistasCache = vistas;
        window.__csComentariosCache = comentarios;

    } catch (e) {
        console.error('Error cargando resumen:', e);

        var actual = document.getElementById('csResumenEstado');

        if (actual) {
            actual.textContent = 'No se pudo cargar el resumen.';
        }
    }
}

// ================================================================
// PANELES · VISTAS / COMENTARIOS
// ================================================================

function abrirPanel(tipo) {
    if (!historiaSeleccionada) return;

    pausarTimer();

    panelAbierto = tipo;

    var card = document.querySelector('.cs-historia-card');

    if (!card) return;

    var prev = card.querySelector('.cs-historia-panel');

    if (prev) prev.remove();

    var datos = tipo === 'vistas'
        ? (window.__csVistasCache || [])
        : (window.__csComentariosCache || []);

    var tituloTexto = tipo === 'vistas'
        ? 'Vistas'
        : 'Comentarios';

    var lista = el('div', {
        class: 'cs-panel-lista'
    });

    if (!datos.length) {
        lista.appendChild(
            el('div', {
                class: 'cs-panel-vacio'
            }, tipo === 'vistas'
                ? 'Aún no hay vistas.'
                : 'Aún no hay comentarios.'
            )
        );

    } else {

        datos.forEach(function (row) {
            var fila = el('div', {
                class: 'cs-panel-fila' +
                    (tipo === 'comentarios' ? ' alto' : '')
            });

            // ----------------------------------------------------
            // AVATAR
            // ----------------------------------------------------

            var avatar = el('div', {
                class: 'cs-panel-avatar'
            });

            if (row.avatar_url) {
                var avatarImg = el('img', {
                    src: row.avatar_url,
                    alt: '',
                    loading: 'lazy'
                });

                avatar.appendChild(avatarImg);

            } else {
                avatar.appendChild(
                    document.createTextNode(
                        (
                            row.nombre ||
                            row.usuario_handle ||
                            '?'
                        ).charAt(0).toUpperCase()
                    )
                );
            }

            fila.appendChild(avatar);

            // ----------------------------------------------------
            // INFORMACIÓN
            // ----------------------------------------------------

            var info = el('div', {
                class: 'cs-panel-info'
            });

            var nombre = row.nombre ||
                row.usuario_handle ||
                'Usuario';

            info.appendChild(
                el('div', {
                    class: 'cs-panel-nombre'
                }, nombre)
            );

            var sub = '';

            if (tipo === 'vistas') {
                sub = row.visto_at
                    ? new Date(row.visto_at).toLocaleString()
                    : '';

            } else {
                var textoComentario =
                    row.comentario ||
                    row.texto ||
                    row.contenido ||
                    '';

                info.appendChild(
                    el('div', {
                        class: 'cs-panel-texto'
                    }, textoComentario)
                );

                sub = row.created_at
                    ? new Date(row.created_at).toLocaleString()
                    : '';
            }

            if (sub) {
                info.appendChild(
                    el('div', {
                        class: 'cs-panel-sub'
                    }, sub)
                );
            }

            fila.appendChild(info);

            lista.appendChild(fila);
        });
    }

    var btnCerrar = el('button', {
        type: 'button',
        class: 'cs-panel-cerrar',
        onclick: cerrarPanel,
        'aria-label': 'Cerrar panel'
    }, [
        svgHistoria('close', 'icon')
    ]);

    var panel = el('div', {
        class: 'cs-historia-panel'
    }, [
        el('div', {
            class: 'cs-panel-titulo'
        }, [
            el('span', null, tituloTexto),
            btnCerrar
        ]),

        lista
    ]);

    card.appendChild(panel);
}

// ================================================================
// CERRAR PANEL
// ================================================================

function cerrarPanel() {
    panelAbierto = null;

    var card = document.querySelector('.cs-historia-card');

    if (!card) return;

    var panel = card.querySelector('.cs-historia-panel');

    if (panel) panel.remove();

    reanudarTimer();
}

// ================================================================
// ENVIAR COMENTARIO
// ================================================================

async function enviarComentarioHistoria(inputEl) {
    if (!historiaSeleccionada || !inputEl) return;

    var texto = (inputEl.value || '').trim();

    if (!texto) return;

    if (texto.length > 200) {
        showToast('Máximo 200 caracteres', 'error');
        return;
    }

    var estado = historiaSeleccionada.usuario.estados[
        historiaSeleccionada.indice
    ];

    if (!estado) return;

    var contenedor = inputEl.parentElement;

    var btn = contenedor
        ? contenedor.querySelector('.cs-historia-enviar')
        : null;

    if (btn && btn.disabled) return;

    if (btn) btn.disabled = true;

    try {
        var res = await supabaseClient.rpc(
            'estado_enviar_comentario',
            {
                p_estado_id: estado.id,
                p_texto: texto
            }
        );

        if (res.error) throw res.error;

        inputEl.value = '';

        showToast('Comentario enviado', 'success');

        if (esMiHistoria(historiaSeleccionada.usuario)) {
            await cargarResumenEstado(estado.id);
        }

    } catch (e) {
        console.error('Error al enviar comentario:', e);

        showToast(
            e.message || 'No se pudo enviar el comentario',
            'error'
        );

    } finally {
        if (btn) btn.disabled = false;
    }
}

// ================================================================
// NAVEGACIÓN
// ================================================================

function historiaSiguiente() {
    if (!historiaSeleccionada) return;

    if (historiaAvanceBloqueado) return;

    historiaAvanceBloqueado = true;

    var u = historiaSeleccionada.usuario;

    if (historiaSeleccionada.indice < u.estados.length - 1) {
        historiaSeleccionada.indice++;

        limpiarTemporizadorHistoria();

        panelAbierto = null;

        renderizarVisorHistoria();

    } else {
        cerrarVisorHistoria();
        renderizarBarraHistorias();
    }
}

function historiaAnterior() {
    if (!historiaSeleccionada) return;

    if (historiaSeleccionada.indice === 0) return;

    limpiarTemporizadorHistoria();

    historiaAvanceBloqueado = false;

    historiaSeleccionada.indice--;

    panelAbierto = null;

    renderizarVisorHistoria();
}

// ================================================================
// MOSTRAR / OCULTAR VISOR
// ================================================================

function mostrarVisorHistoria(mostrar) {
    var visor = document.getElementById('csHistoriaVisor');

    if (!visor) return;

    visor.style.display = mostrar ? 'flex' : 'none';

    visor.setAttribute(
        'aria-hidden',
        mostrar ? 'false' : 'true'
    );
}

// ================================================================
// CERRAR VISOR
// ================================================================

function cerrarVisorHistoria() {
    limpiarTemporizadorHistoria();

    historiaVisorVersion++;

    historiaAvanceBloqueado = false;

    panelAbierto = null;

    historiaSeleccionada = null;

    window.__csVistasCache = null;
    window.__csComentariosCache = null;

    var video = document.getElementById('csHistoriaVideo');

    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }

    mostrarVisorHistoria(false);
}

// ================================================================
// EXPORTACIONES GLOBALES
// ================================================================

window.cargarHistorias = cargarHistorias;
window.crearHistoria = crearHistoria;
window.abrirHistoriasDe = abrirHistoriasDe;
window.historiaSiguiente = historiaSiguiente;
window.historiaAnterior = historiaAnterior;
window.cerrarVisorHistoria = cerrarVisorHistoria;
