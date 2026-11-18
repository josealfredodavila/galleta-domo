// ================================================================
// PERFIL · PUBLICACIONES
// v14.5 IMMERSIVE PLAYER + SCRUBBING FLUIDO + SECURE DOM
// ================================================================
// ACTUALIZACIONES v14.5:
// 1. Auto-hide controls (2.5s) para efecto inmersivo.
// 2. Tap to toggle Play/Pause en toda la pantalla.
// 3. Barra de progreso interactiva con pointermove (scrubbing).
// 4. Se mantiene toda la base de seguridad y memoria de v14.4.
// ================================================================

window.listaMultimediaPerfil = [];

var PUB_RUTA_PERFIL_PUBLICO = '/features/perfil/perfil-publico.html';
var PUB_RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';

var PUB_CSS_EMOJIS = '/features/perfil/css/emojis-animations.css';

var PUB_EMOJIS_REACCION_DEFAULT = ['❤️', '😂', '🥺', '💎'];

var PUB_CLASES_EMOJI = {
    '❤️': 'emo-corazon',
    '😂': 'emo-risa',
    '🥺': 'emo-brillo',
    '💎': 'emo-diamante',
    '🤩': 'emo-estrellas'
};

var PUB_CLASES_EMOJI_TODAS = ['emo-corazon', 'emo-risa', 'emo-brillo', 'emo-diamante', 'emo-estrellas', 'emo-fluido'];

var PUB_EMOJIS_PICKER_DEFAULT = [
'😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😛','😜',
'🤪','😎','🥳','😏','😒','😞','😔','😟','😕','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤯',
'😳','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🙄','😴','🤒','👍','👎','👏','🙌','🙏','🤝','💪','✌️',
'🤞','👌','❤️','🧡','💛','💚','💙','💜','🖤','💔','💯','🤩','⭐','✨','🎉','🎊','🎈','🎁','🏆','🥇',
'☕','🍕','🍔','🌮','🍩','🎵','🎶','🐶','🐱','🌹','🌈','☀️','🌙','⚡','💰','🚀','📸'
];

if (typeof window.archivosSeleccionados === 'undefined') {
    window.archivosSeleccionados = { imagen: null, video: null };
}

var archivosSeleccionados = window.archivosSeleccionados;

// Almacena las URLs generadas por createObjectURL para poder revocarlas
var pubPreviewObjectUrls = {};

// ================================================================
// MOTOR VISUAL DE REACCIONES
// ================================================================

function pubCargarCssEmojis() {
    if (document.querySelector('link[href="' + PUB_CSS_EMOJIS + '"]')) return;

    var link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href = PUB_CSS_EMOJIS;

    document.head.appendChild(link);
}

pubCargarCssEmojis();

function pubClaseEmoji(emoji) {
    return PUB_CLASES_EMOJI[emoji] || 'emo-fluido';
}

// Asigna la clase de animación del emoji y una combinación aleatoria
// de duración y retraso. Así los emojis nunca se mueven al mismo
// tiempo de forma robótica.
function pubAplicarMotorEmoji(el, emoji) {
    if (!el) return;

    PUB_CLASES_EMOJI_TODAS.forEach(function (clase) {
        el.classList.remove(clase);
    });

    el.classList.add(pubClaseEmoji(emoji));

    var duracion = 1.6 + Math.random() * 1.2;
    var retraso = -Math.random() * duracion;

    el.style.setProperty('--dur', duracion.toFixed(2) + 's');
    el.style.setProperty('--delay', retraso.toFixed(2) + 's');
}

// ================================================================
// UTILIDADES
// ================================================================

function pubEmojisReaccion() {
    return PUB_EMOJIS_REACCION_DEFAULT;
}

function pubEmojisPicker() {
    return Array.isArray(window.emojisDisponibles) && window.emojisDisponibles.length
        ? window.emojisDisponibles
        : PUB_EMOJIS_PICKER_DEFAULT;
}

function pubEscapeHtml(valor) {
    if (typeof window.escapeHtmlPerfil === 'function') {
        return window.escapeHtmlPerfil(valor);
    }

    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c];
    });
}

function pubEscaparHTML(valor) {
    if (typeof window.escaparHTML === 'function') {
        return window.escaparHTML(valor);
    }

    return pubEscapeHtml(valor);
}

function pubEsUrlSegura(url) {
    if (typeof url !== 'string' || !url || url.length > 2000) return false;

    try {
        var parsed = new URL(url);
        return parsed.protocol === 'https:' && Boolean(parsed.hostname);
    } catch (e) {
        return false;
    }
}

function pubCrearAvatar(nombre, url) {
    if (typeof window.crearAvatar === 'function') {
        return window.crearAvatar(nombre, url);
    }

    var avatar = document.createElement('div');
    avatar.className = 'avatar-placeholder';
    avatar.textContent = String(nombre || '?').trim().charAt(0).toUpperCase() || '?';

    if (url && pubEsUrlSegura(url)) {
        var imagen = document.createElement('img');
        imagen.src = url;
        imagen.alt = '';
        imagen.loading = 'lazy';
        imagen.style.width = '100%';
        imagen.style.height = '100%';
        imagen.style.objectFit = 'cover';
        imagen.style.borderRadius = '50%';

        imagen.onerror = function () {
            if (imagen.parentNode) imagen.parentNode.removeChild(imagen);
        };

        avatar.textContent = '';
        avatar.appendChild(imagen);
    }

    return avatar;
}

function pubCodigoIdioma() {
    try {
        if (typeof window.obtenerCodigoIdiomaActual === 'function') {
            return window.obtenerCodigoIdiomaActual();
        }
    } catch (e) {}

    return 'es-MX';
}

function pubUrlPerfilAutor(handle, usuarioId, miId) {
    if (miId && usuarioId && String(usuarioId) === String(miId)) {
        return PUB_RUTA_PERFIL_PROPIO;
    }

    var h = String(handle || '').trim();

    if (!/^[A-Za-z0-9_]{1,40}$/.test(h)) return null;

    return PUB_RUTA_PERFIL_PUBLICO + '?u=' + encodeURIComponent(h);
}

// ================================================================
// MOTOR DE REPRODUCCIÓN
// ================================================================

var pubMotorVideo = {
    videoActivo: null,
    reproduccionSolicitada: false,
    ultimaInteraccion: 0,
    restaurando: false
};

function pubEsVideoDelVisor(video) {
    var visor = document.getElementById('pubVisorFull');

    return Boolean(
        visor &&
        video &&
        visor.contains(video) &&
        visor.classList.contains('show')
    );
}

function pubEsVideoFlotante(video) {
    return Boolean(
        video &&
        document.pictureInPictureElement === video
    );
}

function pubReproducirVideo(video) {
    if (!video || !video.isConnected) return;

    var resultado = video.play();

    if (resultado && typeof resultado.catch === 'function') {
        resultado.catch(function (error) {
            if (error && error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                console.warn('No se pudo reproducir el vídeo:', error);
            }
        });
    }
}

function pubActualizarBotonReproduccion(video) {
    var visor = document.getElementById('pubVisorFull');

    if (!visor || !video || !pubEsVideoDelVisor(video)) return;

    var boton = visor.querySelector('#btnPubVfBigPlay');

    if (!boton) return;

    boton.innerHTML = video.paused
        ? '<svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

    var centro = visor.querySelector('#pubVfCenterControls');

    if (centro) {
        centro.style.display = video.paused ? 'flex' : 'none';
    }
}

// ================================================================
// VISOR PERSONALIZADO
// ================================================================

var pubVisor = {
    items: [],
    index: 0,
    tocoX: 0,
    tocoY: 0,
    postIdActual: null,
    motivoSeleccionado: '',
    esDueno: false,
    modoLleno: false,
    videoActual: null,
    timeoutOcultarControles: null,
    arrastrandoProgreso: false
};

// Controla la visibilidad de los controles (Header + Progress Bar)
function pubMostrarControles() {
    var el = document.getElementById('pubVisorFull');

    if (!el) return;

    el.classList.remove('controls-hidden');

    if (pubVisor.timeoutOcultarControles) {
        clearTimeout(pubVisor.timeoutOcultarControles);
    }

    var video = pubVisor.videoActual;

    // Solo ocultar si el video se está reproduciendo y no estamos arrastrando
    if (video && !video.paused && !pubVisor.arrastrandoProgreso) {
        pubVisor.timeoutOcultarControles = setTimeout(function () {
            el.classList.add('controls-hidden');
        }, 2500); // 2.5 segundos de inactividad
    }
}

function pubOcultarControles() {
    var el = document.getElementById('pubVisorFull');

    if (!el) return;

    el.classList.add('controls-hidden');

    if (pubVisor.timeoutOcultarControles) {
        clearTimeout(pubVisor.timeoutOcultarControles);
    }
}

function pubVisorEl() {
    var el = document.getElementById('pubVisorFull');

    if (el) return el;

    el = document.createElement('div');
    el.id = 'pubVisorFull';
    el.className = 'pub-vf';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Visor multimedia');

    var svgClose = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    var svgDots = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';

    var svgDownload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';

    var svgEyeOff = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    var svgReport = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';

    var svgTrash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>';

    var svgExpand = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';

    var svgShrink = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>';

    var svgSpeed = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';

    var svgPip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><rect x="11" y="11" width="8" height="6" rx="1"></rect></svg>';

    el.innerHTML =
        '<div class="pub-vf-header">' +
            '<button type="button" class="pub-vf-cerrar" aria-label="Cerrar">' + svgClose + '</button>' +
            '<button type="button" class="pub-vf-menu-btn" aria-label="Opciones">' + svgDots + '</button>' +
        '</div>' +

        '<div class="pub-vf-media"></div>' +

        // Se mantiene el contenedor central por compatibilidad, pero ahora es invisible
        // y solo se usa para alojar los iconos si el video está pausado.
        '<div class="pub-vf-center-controls" id="pubVfCenterControls" style="display:none;">' +
            '<button type="button" class="pub-vf-big-play" id="btnPubVfBigPlay" aria-label="Reproducir">' +
                '<svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' +
            '</button>' +
            '<button type="button" class="pub-vf-big-close" id="btnPubVfBigClose" aria-label="Cerrar">' + svgClose + '</button>' +
        '</div>' +

        '<div class="pub-vf-controls" id="pubVfControls" style="display:none;">' +
            '<div class="pub-vf-progress-bar" id="pubVfProgressBar" role="slider" aria-label="Progreso del vídeo" tabindex="0">' +
                '<div class="pub-vf-progress" id="pubVfProgress"></div>' +
            '</div>' +
            '<div class="pub-vf-bottom-row">' +
                '<div class="pub-vf-time" id="pubVfTime">0:00 / 0:00</div>' +
                '<div class="pub-vf-actions">' +
                    '<button type="button" class="pub-vf-ctrl-btn" id="btnPubVfSpeed" title="Velocidad">' + svgSpeed + '</button>' +
                    '<button type="button" class="pub-vf-ctrl-btn" id="btnPubVfPip" title="Ventana flotante">' + svgPip + '</button>' +
                    '<button type="button" class="pub-vf-ctrl-btn" id="btnPubVfExpand" title="Expandir">' + svgExpand + '</button>' +
                '</div>' +
            '</div>' +
        '</div>' +

        '<div class="pub-vf-bottom-sheet" id="pubVfSheet">' +
            '<div class="pub-vf-drag-handle"></div>' +
            '<button type="button" class="pub-vf-sheet-btn" id="btnPubVfGuardar"><span class="icon">' + svgDownload + '</span> Guardar</button>' +
            '<button type="button" class="pub-vf-sheet-btn" id="btnPubVfOcultar" data-solo-ajeno="1"><span class="icon">' + svgEyeOff + '</span> No quiero ver esto</button>' +
            '<button type="button" class="pub-vf-sheet-btn" id="btnPubVfReportar" data-solo-ajeno="1"><span class="icon">' + svgReport + '</span> Buscar ayuda o reportar contenido</button>' +
            '<button type="button" class="pub-vf-sheet-btn pub-vf-peligro" id="btnPubVfEliminar" data-solo-dueno="1"><span class="icon">' + svgTrash + '</span> Eliminar publicación</button>' +
        '</div>' +

        '<div class="pub-vf-report-sheet" id="pubVfReportSheet1">' +
            '<div class="pub-vf-report-header">' +
                '<button type="button" class="pub-vf-report-back" id="btnPubVfBack1">‹</button>' +
                '<span>Reportar</span>' +
                '<button type="button" class="pub-vf-report-cerrar" data-cerrar-hoja="pubVfReportSheet1">×</button>' +
            '</div>' +
            '<div class="pub-vf-report-content">' +
                '<h2>¿Por qué quieres reportar este contenido?</h2>' +
                '<p>Si alguien se encuentra en peligro inminente, busca ayuda antes de enviar un reporte.</p>' +
                '<button class="pub-vf-report-option" data-motivo="Problema que involucra a un menor de 18 años">Problema que involucra a un menor de 18 años ›</button>' +
                '<button class="pub-vf-report-option" data-motivo="Bullying, acoso o abuso">Bullying, acoso o abuso ›</button>' +
                '<button class="pub-vf-report-option" data-motivo="Suicidio o autolesión">Suicidio o autolesión ›</button>' +
                '<button class="pub-vf-report-option" data-motivo="Contenido violento, perturbador o que incita al odio">Contenido violento o de odio ›</button>' +
                '<button class="pub-vf-report-option" data-motivo="Venta o promoción de artículos restringidos">Artículos restringidos ›</button>' +
                '<button class="pub-vf-report-option" data-motivo="Contenido para adultos">Contenido para adultos ›</button>' +
                '<button class="pub-vf-report-option" data-motivo="Estafa, fraude o información falsa">Estafa, fraude o información falsa ›</button>' +
                '<button class="pub-vf-report-option" data-motivo="Propiedad intelectual">Propiedad intelectual ›</button>' +
            '</div>' +
        '</div>' +

        '<div class="pub-vf-report-sheet" id="pubVfReportSheet2">' +
            '<div class="pub-vf-report-header">' +
                '<button type="button" class="pub-vf-report-back" id="btnPubVfBack2">‹</button>' +
                '<span>Reportar</span>' +
                '<button type="button" class="pub-vf-report-cerrar" data-cerrar-hoja="pubVfReportSheet2">×</button>' +
            '</div>' +
            '<div class="pub-vf-report-content pub-vf-report-resumen">' +
                '<h2>Vas a enviar un reporte</h2>' +
                '<p>Solo eliminamos contenido que infringe nuestras <strong>Normas comunitarias</strong>.</p>' +
                '<h3>Detalles del reporte</h3>' +
                '<p class="pub-vf-etiqueta">Motivo:</p>' +
                '<div id="pubVfResumenMotivo" class="pub-vf-motivo"></div>' +
            '</div>' +
            '<div class="pub-vf-report-footer">' +
                '<button type="button" class="pub-vf-btn-enviar" id="btnPubVfEnviarFinal">Enviar</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(el);

    // Cerrar visor
    el.querySelector('.pub-vf-cerrar').addEventListener('click', function (e) {
        e.stopPropagation();
        pubCerrarVisor();
    });

    // Menú
    el.querySelector('.pub-vf-menu-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        pubAjustarOpcionesMenu();
        document.getElementById('pubVfSheet').classList.add('show');
    });

    el.querySelector('#btnPubVfBigClose').addEventListener('click', function (e) {
        e.stopPropagation();
        pubCerrarVisor();
    });

    // Play / pausa manual (botón central oculto)
    el.querySelector('#btnPubVfBigPlay').addEventListener('click', function (e) {
        e.stopPropagation();

        var video = pubVisor.videoActual;

        if (!video) return;

        if (video.paused) {
            pubReproducirVideo(video);
        } else {
            video.pause();
        }
    });

    // Expandir sin reconstruir ni reiniciar el vídeo
    el.querySelector('#btnPubVfExpand').addEventListener('click', function (e) {
        e.stopPropagation();

        var video = pubVisor.videoActual;
        var tiempo = video ? video.currentTime : 0;
        var estabaReproduciendo = video ? !video.paused : false;

        pubVisor.modoLleno = !pubVisor.modoLleno;

        el.classList.toggle('is-fullscreen', pubVisor.modoLleno);

        if (video) {
            video.style.objectFit = pubVisor.modoLleno ? 'cover' : 'contain';

            if (Math.abs(video.currentTime - tiempo) > 0.5) {
                try {
                    video.currentTime = tiempo;
                } catch (error) {}
            }

            if (estabaReproduciendo && video.paused) {
                pubReproducirVideo(video);
            }
        }

        this.innerHTML = pubVisor.modoLleno ? svgShrink : svgExpand;

        if (window.showToast) {
            window.showToast(
                pubVisor.modoLleno ? 'Vista expandida' : 'Vista normal',
                'info',
                1200
            );
        }
    });

    // Picture-in-Picture real
    el.querySelector('#btnPubVfPip').addEventListener('click', async function (e) {
        e.stopPropagation();

        var video = pubVisor.videoActual;

        if (!video) return;

        try {
            if (document.pictureInPictureElement === video) {
                await document.exitPictureInPicture();
                return;
            }

            if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) {
                if (window.showToast) {
                    window.showToast('Tu navegador no admite ventana flotante.', 'warning');
                }
                return;
            }

            if (video.paused) {
                await video.play();
            }

            await video.requestPictureInPicture();

        } catch (error) {
            console.warn('Picture-in-Picture:', error);

            if (window.showToast) {
                window.showToast('No se pudo activar la ventana flotante.', 'warning');
            }
        }
    });

    // Velocidad
    el.querySelector('#btnPubVfSpeed').addEventListener('click', function (e) {
        e.stopPropagation();

        var video = pubVisor.videoActual;

        if (!video) return;

        if (video.playbackRate === 1) {
            video.playbackRate = 1.5;
        } else if (video.playbackRate === 1.5) {
            video.playbackRate = 2;
        } else {
            video.playbackRate = 1;
        }

        if (window.showToast) {
            window.showToast('Velocidad: ' + video.playbackRate + 'x', 'info', 1500);
        }
    });

    // Barra de progreso interactiva (Scrubbing fluido)
    var progressBar = el.querySelector('#pubVfProgressBar');

    function pubActualizarTiempoDesdePosicion(clientX) {
        var video = pubVisor.videoActual;

        if (!video || !video.duration || !isFinite(video.duration)) return;

        var rect = progressBar.getBoundingClientRect();
        var posicion = (clientX - rect.left) / rect.width;

        posicion = Math.max(0, Math.min(1, posicion));

        video.currentTime = posicion * video.duration;
    }

    progressBar.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        pubVisor.arrastrandoProgreso = true;
        pubMostrarControles();
        pubActualizarTiempoDesdePosicion(e.clientX);
        progressBar.setPointerCapture(e.pointerId);
    });

    progressBar.addEventListener('pointermove', function (e) {
        if (!pubVisor.arrastrandoProgreso) return;
        e.stopPropagation();
        pubActualizarTiempoDesdePosicion(e.clientX);
    });

    progressBar.addEventListener('pointerup', function (e) {
        e.stopPropagation();
        pubVisor.arrastrandoProgreso = false;
        pubMostrarControles(); // Reinicia el temporizador de auto-ocultar
    });

    progressBar.addEventListener('pointercancel', function (e) {
        e.stopPropagation();
        pubVisor.arrastrandoProgreso = false;
        pubMostrarControles();
    });

    // Guardar
    el.querySelector('#btnPubVfGuardar').addEventListener('click', function (e) {
        e.stopPropagation();

        var item = pubVisor.items[pubVisor.index];

        if (item && item.permiteDescarga !== false) {
            if (typeof window.descargarArchivoForzado === 'function') {
                window.descargarArchivoForzado(item.url);
            }
        } else if (window.showToast) {
            window.showToast('La descarga no está permitida para este contenido.', 'warning');
        }

        document.getElementById('pubVfSheet').classList.remove('show');
    });

    // Ocultar
    el.querySelector('#btnPubVfOcultar').addEventListener('click', async function (e) {
        e.stopPropagation();

        if (pubVisor.esDueno) return;

        var btn = this;
        btn.disabled = true;

        try {
            var client = window.supabaseClient;

            if (!client) throw new Error('Supabase no está disponible.');

            var sessionResult = await client.auth.getSession();
            var session = sessionResult.data ? sessionResult.data.session : null;

            if (!session) throw new Error('No hay sesión');

            var ins = await client.from('publicaciones_ocultas').insert({
                usuario_id: session.user.id,
                publicacion_id: pubVisor.postIdActual
            });

            if (ins.error && ins.error.code !== '23505') throw ins.error;

            if (window.showToast) {
                window.showToast('Publicación oculta para ti.', 'success');
            }

            document.getElementById('pubVfSheet').classList.remove('show');
            pubCerrarVisor();

        } catch (err) {
            if (window.showToast) {
                window.showToast('Error al ocultar la publicación.', 'error');
            }
        } finally {
            btn.disabled = false;
        }
    });

    // Eliminar
    el.querySelector('#btnPubVfEliminar').addEventListener('click', async function (e) {
        e.stopPropagation();

        if (!pubVisor.esDueno || !pubVisor.postIdActual) return;

        var postId = pubVisor.postIdActual;

        document.getElementById('pubVfSheet').classList.remove('show');
        pubCerrarVisor();

        await eliminarMiPublicacion(postId, null);
    });

    // Reportar
    el.querySelector('#btnPubVfReportar').addEventListener('click', function (e) {
        e.stopPropagation();

        if (pubVisor.esDueno) return;

        document.getElementById('pubVfSheet').classList.remove('show');
        document.getElementById('pubVfReportSheet1').classList.add('show');
    });

    el.querySelector('#btnPubVfBack1').addEventListener('click', function (e) {
        e.stopPropagation();

        document.getElementById('pubVfReportSheet1').classList.remove('show');
        document.getElementById('pubVfSheet').classList.add('show');
    });

    el.querySelector('#btnPubVfBack2').addEventListener('click', function (e) {
        e.stopPropagation();

        document.getElementById('pubVfReportSheet2').classList.remove('show');
        document.getElementById('pubVfReportSheet1').classList.add('show');
    });

    el.querySelectorAll('[data-cerrar-hoja]').forEach(function (b) {
        b.addEventListener('click', function (e) {
            e.stopPropagation();

            document.getElementById(b.getAttribute('data-cerrar-hoja')).classList.remove('show');
        });
    });

    el.querySelectorAll('.pub-vf-report-option').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();

            pubVisor.motivoSeleccionado = this.getAttribute('data-motivo');

            document.getElementById('pubVfResumenMotivo').textContent = pubVisor.motivoSeleccionado;
            document.getElementById('pubVfReportSheet1').classList.remove('show');
            document.getElementById('pubVfReportSheet2').classList.add('show');
        });
    });

    // Enviar reporte
    el.querySelector('#btnPubVfEnviarFinal').addEventListener('click', async function (e) {
        e.stopPropagation();

        if (pubVisor.esDueno || !pubVisor.motivoSeleccionado) return;

        var btn = this;
        btn.disabled = true;
        btn.textContent = 'Enviando...';

        try {
            var client = window.supabaseClient;

            if (!client) throw new Error('Supabase no está disponible.');

            var sessionResult = await client.auth.getSession();
            var session = sessionResult.data ? sessionResult.data.session : null;

            if (!session) throw new Error('No hay sesión');

            var ins = await client.from('publicacion_reportes').insert({
                publicacion_id: pubVisor.postIdActual,
                usuario_id: session.user.id,
                motivo: pubVisor.motivoSeleccionado,
                estado: 'pendiente'
            });

            if (ins.error && ins.error.code !== '23505') throw ins.error;

            if (window.showToast) {
                window.showToast(
                    ins.error ? 'Ya habías reportado esta publicación.' : 'Reporte enviado con éxito.',
                    ins.error ? 'warning' : 'success'
                );
            }

            document.getElementById('pubVfReportSheet2').classList.remove('show');
            pubCerrarVisor();

        } catch (err) {
            if (window.showToast) {
                window.showToast('Error al enviar el reporte.', 'error');
            }
        } finally {
            btn.disabled = false;
            btn.textContent = 'Enviar';
        }
    });

    // Gestos táctiles (Tap to toggle)
    el.addEventListener('touchstart', function (e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;

        pubVisor.tocoX = e.changedTouches[0].clientX;
        pubVisor.tocoY = e.changedTouches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchend', function (e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;

        // No navegar si el usuario interactuó con controles.
        if (e.target.closest('button, .pub-vf-progress-bar, .pub-vf-bottom-sheet, .pub-vf-report-sheet')) {
            return;
        }

        var dx = e.changedTouches[0].clientX - pubVisor.tocoX;
        var dy = e.changedTouches[0].clientY - pubVisor.tocoY;

        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
            pubNavegar(dx < 0 ? 1 : -1);
        } else if (dy > 120 && Math.abs(dy) > Math.abs(dx)) {
            pubCerrarVisor();
        } else if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
            // TAP SIMPLE: Alternar Play/Pause y mostrar controles
            var video = pubVisor.videoActual;

            if (video) {
                if (video.paused) {
                    pubReproducirVideo(video);
                    // Si el video arranca, ocultamos los controles automáticamente
                    setTimeout(function () { pubOcultarControles(); }, 300);
                } else {
                    video.pause();
                    // Si el video se pausa, forzamos los controles a mostrarse
                    pubMostrarControles();
                }
            }
        }
    }, { passive: true });

    return el;
}

// ================================================================
// OPCIONES DEL MENÚ
// ================================================================

function pubAjustarOpcionesMenu() {
    var el = document.getElementById('pubVisorFull');

    if (!el) return;

    el.querySelectorAll('[data-solo-ajeno]').forEach(function (b) {
        b.style.display = pubVisor.esDueno ? 'none' : '';
    });

    el.querySelectorAll('[data-solo-dueno]').forEach(function (b) {
        b.style.display = pubVisor.esDueno ? '' : 'none';
    });
}

// ================================================================
// MOSTRAR ELEMENTO DEL VISOR
// ================================================================

function pubMostrarItem() {
    var el = pubVisorEl();
    var caja = el.querySelector('.pub-vf-media');
    var item = pubVisor.items[pubVisor.index];

    var controls = el.querySelector('#pubVfControls');
    var centerControls = el.querySelector('#pubVfCenterControls');
    var btnExpand = el.querySelector('#btnPubVfExpand');

    if (!item) return;

    document.getElementById('pubVfSheet').classList.remove('show');
    document.getElementById('pubVfReportSheet1').classList.remove('show');
    document.getElementById('pubVfReportSheet2').classList.remove('show');

    // Al cambiar de contenido se libera el vídeo anterior.
    if (pubVisor.videoActual) {
        try {
            pubVisor.videoActual.pause();
            pubVisor.videoActual.removeAttribute('src');
            pubVisor.videoActual.load();
        } catch (e) {}
    }

    pubVisor.videoActual = null;

    pubVisor.modoLleno = false;

    el.classList.remove('is-fullscreen');
    el.classList.remove('controls-hidden');

    if (btnExpand) {
        btnExpand.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
    }

    caja.innerHTML = '';

    if (item.tipo === 'video') {
        controls.style.display = 'flex';
        centerControls.style.display = 'none';

        var video = document.createElement('video');

        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        video.controls = false;
        video.preload = 'auto';
        video.autoplay = true;
        video.muted = false;
        video.setAttribute('disableRemotePlayback', '');

        video.src = item.url;

        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.background = '#000';

        video.addEventListener('loadedmetadata', function () {
            var tiempo = el.querySelector('#pubVfTime');

            if (tiempo && isFinite(video.duration)) {
                var minutos = Math.floor(video.duration / 60);
                var segundos = Math.floor(video.duration % 60);

                tiempo.textContent = '0:00 / ' + minutos + ':' + String(segundos).padStart(2, '0');
            }
        });

        video.addEventListener('timeupdate', function () {
            var prog = el.querySelector('#pubVfProgress');
            var time = el.querySelector('#pubVfTime');

            if (video.duration && isFinite(video.duration)) {
                var percent = (video.currentTime / video.duration) * 100;

                if (prog) prog.style.width = percent + '%';

                if (time) {
                    var curM = Math.floor(video.currentTime / 60);
                    var curS = Math.floor(video.currentTime % 60);
                    var durM = Math.floor(video.duration / 60);
                    var durS = Math.floor(video.duration % 60);

                    time.textContent =
                        curM + ':' + String(curS).padStart(2, '0') +
                        ' / ' +
                        durM + ':' + String(durS).padStart(2, '0');
                }
            }
        });

        video.addEventListener('play', function () {
            pubMotorVideo.videoActivo = video;
            pubMotorVideo.reproduccionSolicitada = true;

            pubActualizarBotonReproduccion(video);
            pubMostrarControles();
        });

        video.addEventListener('pause', function () {
            pubActualizarBotonReproduccion(video);
            pubMostrarControles();
        });

        video.addEventListener('ended', function () {
            pubMotorVideo.reproduccionSolicitada = false;
            pubActualizarBotonReproduccion(video);
            pubMostrarControles();
        });

        video.addEventListener('error', function () {
            if (window.showToast) {
                window.showToast('No se pudo cargar este vídeo.', 'error');
            }
        });

        // Ya no se maneja click en video directamente para alternar play,
        // ahora el gesto táctil maneja la reproducción sin molestar con botones gigantes.

        video.addEventListener('enterpictureinpicture', function () {
            pubOcultarControles();
            if (window.showToast) {
                window.showToast('Vídeo en ventana flotante.', 'success', 1500);
            }
        });

        video.addEventListener('leavepictureinpicture', function () {
            // No se pausa al salir de la ventana flotante.
            if (video.isConnected && video.paused && pubMotorVideo.reproduccionSolicitada) {
                pubReproducirVideo(video);
            }
            pubMostrarControles();
        });

        caja.appendChild(video);

        pubVisor.videoActual = video;
        pubMotorVideo.videoActivo = video;

        // La reproducción comienza después de la interacción de apertura.
        pubReproducirVideo(video);

        // Iniciar el timer para ocultar controles tras 2.5 segundos.
        pubMostrarControles();

    } else {
        controls.style.display = 'none';
        centerControls.style.display = 'none';

        var imagen = document.createElement('img');

        imagen.alt = 'Publicación';
        imagen.src = item.url;
        imagen.draggable = false;

        caja.appendChild(imagen);
    }
}

// ================================================================
// NAVEGACIÓN DEL VISOR
// ================================================================

function pubNavegar(direccion) {
    var nuevo = pubVisor.index + direccion;

    if (nuevo < 0 || nuevo >= pubVisor.items.length) return;

    pubVisor.index = nuevo;

    pubMostrarItem();
}

function pubAbrirVisor(indice, postId, esDueno) {
    var lista = Array.isArray(window.listaMultimediaPerfil)
        ? window.listaMultimediaPerfil
        : [];

    if (!lista[indice]) return;

    pubVisor.items = lista.slice();
    pubVisor.index = indice;
    pubVisor.postIdActual = postId;
    pubVisor.esDueno = esDueno === true;
    pubVisor.arrastrandoProgreso = false;

    pubMostrarItem();
    pubAjustarOpcionesMenu();

    pubVisorEl().classList.add('show');

    document.body.style.overflow = 'hidden';
}

function pubCerrarVisor() {
    var el = document.getElementById('pubVisorFull');

    if (!el) return;

    if (pubVisor.timeoutOcultarControles) {
        clearTimeout(pubVisor.timeoutOcultarControles);
    }

    var video = pubVisor.videoActual;

    // Si está en PiP, se intenta salir antes de liberar el recurso.
    if (video && document.pictureInPictureElement === video) {
        try {
            document.exitPictureInPicture();
        } catch (e) {}
    }

    if (video) {
        try {
            video.pause();
            video.removeAttribute('src');
            video.load();
        } catch (e) {}
    }

    pubVisor.videoActual = null;
    pubMotorVideo.videoActivo = null;
    pubMotorVideo.reproduccionSolicitada = false;

    el.querySelector('.pub-vf-media').innerHTML = '';

    el.classList.remove('show');
    el.classList.remove('is-fullscreen');
    el.classList.remove('controls-hidden');

    document.body.style.overflow = '';

    pubVisor.postIdActual = null;
    pubVisor.motivoSeleccionado = '';
    pubVisor.esDueno = false;
    pubVisor.modoLleno = false;
    pubVisor.arrastrandoProgreso = false;
}

// ================================================================
// ESTILOS (UNIFORMIDAD VISUAL 9:16 Y OTROS)
// ================================================================

(function inyectarEstilosReaccionesPerfil() {
    if (document.getElementById('perfil-reacciones-fb-styles')) return;

    var style = document.createElement('style');
    style.id = 'perfil-reacciones-fb-styles';

    style.appendChild(document.createTextNode(`

    #misPublicacionesList .publicacion-card {
        background: transparent !important;
        border: 0 !important;
        border-bottom: 1px solid rgba(255,255,255,.09) !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        padding: 14px 0 12px !important;
        margin: 0 !important;
        width: 100%;
    }

    #misPublicacionesList .publicacion-card .header {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 0 !important;
        margin: 0 0 10px 0 !important;
        background: transparent !important;
    }

    #misPublicacionesList .publicacion-card .header > .avatar {
        width: 40px !important;
        height: 40px !important;
        min-width: 40px !important;
        flex: 0 0 40px !important;
        border-radius: 50% !important;
        overflow: hidden !important;
    }

    #misPublicacionesList .publicacion-card .nombre {
        font-weight: 700 !important;
        font-size: .92rem !important;
        color: var(--text-primary, #f0f4f8) !important;
    }

    #misPublicacionesList .publicacion-card .fecha {
        font-size: .72rem !important;
        color: var(--text-muted, #8c949c) !important;
        margin-top: 2px !important;
    }

    .pub-autor-enlace {
        color: inherit;
        text-decoration: none;
    }

    .pub-autor-handle {
        color: var(--cyan, #00e5ff) !important;
        font-weight: 500 !important;
        font-size: .75rem !important;
    }

    .publicacion-card .contenido {
        display: flex;
        flex-direction: column;
        gap: 8px;
        color: var(--text-secondary, #c0d8e8);
        font-size: .95rem;
        line-height: 1.5;
    }

    .pub-media-wrap {
        position: relative;
        margin-top: 6px;
        display: flex;
        justify-content: center;
    }

    .pub-media-container {
        width: 100%;
        aspect-ratio: 9 / 16;
        position: relative;
        overflow: hidden;
        background: #000;
        border-radius: 8px;
    }

    .pub-media-container video {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
        max-width: 100%;
    }

    .pub-media-container img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
    }

    /* VISOR */

    .pub-vf {
        position: fixed;
        inset: 0;
        z-index: 100060;
        background: #000;
        display: none;
        align-items: center;
        justify-content: center;
        touch-action: pan-y;
        flex-direction: column;
        overflow: hidden;
    }

    .pub-vf.show {
        display: flex;
    }

    .pub-vf-media {
        flex: 1;
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        overflow: hidden;
        background: #000;
    }

    .pub-vf-media img,
    .pub-vf-media video {
        display: block;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        user-select: none;
        -webkit-user-select: none;
        background: #000;
    }

    .pub-vf-media video {
        width: 100%;
        height: 100%;
    }

    .pub-vf.is-fullscreen {
        position: fixed !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        height: 100dvh !important;
        z-index: 999999 !important;
        background: #000 !important;
    }

    .pub-vf.is-fullscreen .pub-vf-media {
        flex: 1 !important;
        height: 100% !important;
    }

    .pub-vf.is-fullscreen .pub-vf-media video {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
    }

    .pub-vf.is-fullscreen .pub-vf-controls {
        padding-bottom: calc(20px + env(safe-area-inset-bottom, 20px)) !important;
    }

    /* AUTO-HIDE (IMMERSIVE) */
    .pub-vf-header,
    .pub-vf-controls {
        transition: opacity 0.3s ease, visibility 0.3s ease;
    }

    .pub-vf.controls-hidden .pub-vf-header,
    .pub-vf.controls-hidden .pub-vf-controls {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
    }

    /* CABECERA */

    .pub-vf-header {
        position: absolute;
        top: calc(12px + env(safe-area-inset-top, 0px));
        left: 12px;
        right: 12px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        z-index: 10;
        pointer-events: none;
    }

    .pub-vf-cerrar,
    .pub-vf-menu-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 0;
        background: rgba(0,0,0,.65);
        color: #f0f4f8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        pointer-events: auto;
    }

    .pub-vf-cerrar:hover,
    .pub-vf-menu-btn:hover {
        background: rgba(212,175,55,.8);
        color: #000;
    }

    /* CONTROLES CENTRALES (Ocultos por defecto, solo accesibles por código) */
    .pub-vf-center-controls {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 30px;
        z-index: 5;
        pointer-events: none;
    }

    .pub-vf-center-controls button {
        pointer-events: auto;
        border: 0;
        border-radius: 50%;
        width: 70px;
        height: 70px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .pub-vf-big-play {
        background: rgba(255,255,255,.2);
        color: #fff;
        backdrop-filter: blur(8px);
    }

    .pub-vf-big-close {
        background: rgba(255,0,80,.8);
        color: #fff;
    }

    /* CONTROLES INFERIORES */

    .pub-vf-controls {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(to top, rgba(0,0,0,.92), transparent);
        padding: 20px 15px calc(15px + env(safe-area-inset-bottom, 0px));
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 15;
    }

    .pub-vf-progress-bar {
        width: 100%;
        height: 5px;
        background: rgba(255,255,255,.3);
        border-radius: 5px;
        cursor: pointer;
        position: relative;
        touch-action: none;
    }

    /* Ampliar el área de toque para hacer más fácil el scrubbing en móvil */
    .pub-vf-progress-bar::after {
        content: '';
        position: absolute;
        top: -10px;
        left: 0;
        right: 0;
        bottom: -10px;
    }

    .pub-vf-progress {
        height: 100%;
        background: #D4AF37;
        border-radius: 5px;
        width: 0%;
        pointer-events: none;
    }

    .pub-vf-bottom-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .pub-vf-time {
        color: #fff;
        font-size: 12px;
        font-family: monospace;
    }

    .pub-vf-actions {
        display: flex;
        align-items: center;
        gap: 15px;
    }

    .pub-vf-ctrl-btn {
        background: transparent;
        border: 0;
        color: #fff;
        cursor: pointer;
        padding: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .pub-vf-ctrl-btn:active {
        color: #D4AF37;
        transform: scale(.94);
    }

    /* MENÚ INFERIOR */

    .pub-vf-bottom-sheet {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: #0b1016;
        border-top: 1px solid rgba(212,175,55,.16);
        border-top-left-radius: 18px;
        border-top-right-radius: 18px;
        transform: translateY(100%);
        transition: transform .3s cubic-bezier(.2,.8,.2,1);
        z-index: 20;
        padding-bottom: env(safe-area-inset-bottom, 20px);
        display: flex;
        flex-direction: column;
    }

    .pub-vf-bottom-sheet.show {
        transform: translateY(0);
    }

    .pub-vf-drag-handle {
        width: 40px;
        height: 4px;
        background: rgba(255,255,255,.2);
        border-radius: 2px;
        margin: 10px auto 15px;
    }

    .pub-vf-sheet-btn {
        display: flex;
        align-items: center;
        gap: 15px;
        width: 100%;
        padding: 16px 20px;
        border: 0;
        border-top: 1px solid rgba(255,255,255,.08);
        background: transparent;
        color: #f0f4f8;
        font-size: 16px;
        text-align: left;
        cursor: pointer;
    }

    .pub-vf-sheet-btn .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #D4AF37;
    }

    .pub-vf-sheet-btn.pub-vf-peligro,
    .pub-vf-sheet-btn.pub-vf-peligro .icon {
        color: #ff3366;
    }

    /* REPORTES */

    .pub-vf-report-sheet {
        position: absolute;
        inset: 0;
        background: #05080f;
        z-index: 30;
        display: flex;
        flex-direction: column;
        transform: translateX(100%);
        transition: transform .3s cubic-bezier(.2,.8,.2,1);
        color: #f0f4f8;
    }

    .pub-vf-report-sheet.show {
        transform: translateX(0);
    }

    .pub-vf-report-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px;
        border-bottom: 1px solid rgba(212,175,55,.16);
    }

    .pub-vf-report-header span {
        font-weight: 700;
        font-size: 1.1rem;
        color: #D4AF37;
    }

    .pub-vf-report-back,
    .pub-vf-report-cerrar {
        background: transparent;
        border: 0;
        color: #f0f4f8;
        cursor: pointer;
        padding: 5px;
        font-size: 25px;
    }

    .pub-vf-report-content {
        padding: 20px;
        overflow-y: auto;
    }

    .pub-vf-report-content h2 {
        font-size: 1.2rem;
        color: #f0f4f8;
        margin: 0 0 8px;
    }

    .pub-vf-report-content h3 {
        margin: 20px 0 10px;
        font-size: 1.05rem;
        color: #f0f4f8;
    }

    .pub-vf-report-content p {
        font-size: .85rem;
        color: #8c949c;
        margin: 0 0 20px;
    }

    .pub-vf-report-content p strong {
        color: #00e5ff;
    }

    .pub-vf-etiqueta {
        font-size: .9rem !important;
        margin-bottom: 5px !important;
    }

    .pub-vf-motivo {
        font-weight: 700;
        font-size: 1.05rem;
        color: #D4AF37;
        margin-bottom: 20px;
    }

    .pub-vf-report-option {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        padding: 16px 0;
        border: 0;
        border-bottom: 1px solid rgba(255,255,255,.08);
        background: transparent;
        font-size: 1rem;
        font-weight: 600;
        color: #f0f4f8;
        text-align: left;
        cursor: pointer;
    }

    .pub-vf-report-footer {
        padding: 15px 20px;
        border-top: 1px solid rgba(212,175,55,.16);
        background: #0b1016;
        padding-bottom: calc(15px + env(safe-area-inset-bottom, 0px));
    }

    .pub-vf-btn-enviar {
        width: 100%;
        padding: 16px;
        background: linear-gradient(120deg,#00e5ff 0%,#3b82f6 55%,#8b5cf6 100%);
        color: #04070d;
        font-size: 1.05rem;
        font-weight: 700;
        border: 0;
        border-radius: 12px;
        cursor: pointer;
    }

    .pub-vf-btn-enviar:disabled {
        opacity: .6;
    }

    /* REACCIONES (estructura; animaciones en emojis-animations.css) */

    .reaccion-wrap {
        position: relative;
        display: inline-block;
        margin: 8px 0 0;
        padding: 0;
    }

    .reaccion-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted,#8c949c);
        font-size: .82rem;
        font-weight: 600;
        cursor: pointer;
    }

    .reaccion-trigger.activa {
        color: var(--gold,#D4AF37);
    }

    .reaccion-dropdown {
        position: absolute;
        bottom: 100%;
        left: 0;
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: auto;
        padding: 6px;
        background: #0b1016;
        border: 1px solid rgba(212,175,55,.16);
        border-radius: 24px;
        box-shadow: 0 6px 18px rgba(0,0,0,.6);
        opacity: 0;
        visibility: hidden;
        transform: translateY(8px) scale(.95);
        transition: opacity .18s ease, transform .18s ease;
        z-index: 100;
    }

    .reaccion-dropdown.show {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0) scale(1);
    }

    .reaccion-dropdown button {
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        font-size: 1.55rem;
        cursor: pointer;
        position: relative;
    }

    .reaccion-dropdown button.activa {
        background: rgba(212,175,55,.2);
    }

    .reaccion-dropdown .mini-count {
        position: absolute;
        top: -2px;
        right: -2px;
        background: #D4AF37;
        color: #04070d;
        font-size: .55rem;
        font-weight: bold;
        padding: 2px 5px;
        border-radius: 10px;
    }

    .publicacion-card .stats {
        display: flex;
        align-items: center;
        gap: 4px;
        margin: 2px 0 0 !important;
        padding: 6px 0 0 !important;
        border-top: 1px solid rgba(255,255,255,.09);
        flex-wrap: wrap;
    }

    .btn-accion-pub {
        background: transparent !important;
        border: 0 !important;
        border-radius: 6px !important;
        padding: 6px 10px !important;
        color: var(--text-muted,#8c949c) !important;
        font-size: .82rem !important;
        font-weight: 600 !important;
    }

    .btn-accion-pub.danger {
        color: var(--danger,#ff3366) !important;
    }

    .comentarios-container {
        display: none;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,.09);
    }

    .comentarios-container.show {
        display: block;
    }

    .comentario-item {
        border-bottom: 0;
        padding: 6px 0;
    }

    .comentario-input-row input {
        background: transparent !important;
        border: 0 !important;
        border-bottom: 1px solid rgba(255,255,255,.12) !important;
        border-radius: 0 !important;
        padding: 6px 2px !important;
        color: #f0f4f8;
    }

    .comentario-input-row button {
        background: transparent !important;
        color: var(--gold,#D4AF37) !important;
        border: 0 !important;
        font-weight: 700 !important;
    }

    .avatar-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: linear-gradient(135deg,#1a4a2a,#a855f7);
        color: #fff;
        font-weight: 600;
        overflow: hidden;
    }

    `));

    document.head.appendChild(style);
})();

// ================================================================
// MODERACIÓN
// ================================================================

function esErrorModeracionPerfil(error) {
    var msg = '';

    if (error) {
        msg = String(error.message || '') + ' ' + String(error.code || '');
    }

    return msg.indexOf('contenido_no_permitido') !== -1;
}

function htmlAvisoModeracionPerfil() {
    var aviso = document.createElement('div');
    aviso.className = 'perfil-aviso-moderacion';

    var icono = document.createElement('span');
    icono.className = 'perfil-aviso-moderacion-icono';
    icono.textContent = '⚠️';

    var texto = document.createElement('span');
    texto.textContent = 'Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.';

    aviso.appendChild(icono);
    aviso.appendChild(texto);

    return aviso;
}

// ================================================================
// SUBIDA DE ARCHIVOS
// ================================================================

async function subirArchivoConModeracion(archivo, destino, tipo, token) {
    var fd = new FormData();

    fd.append('file', archivo);
    fd.append('destino', destino);
    fd.append('tipo', tipo);

    var respuesta = await fetch('/api/media/upload', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: fd
    });

    var data = null;

    try {
        data = await respuesta.json();
    } catch (e) {
        data = {};
    }

    if (!respuesta.ok || !data.ok) {
        var error = new Error(
            data && data.error ? data.error : 'No se pudo subir el archivo'
        );

        error.status = respuesta.status;
        throw error;
    }

    if (!data.url || !pubEsUrlSegura(data.url)) {
        throw new Error('El servidor no devolvió una URL válida para el archivo.');
    }

    return data;
}

// ================================================================
// DESCARGAS
// ================================================================

async function descargarArchivoForzado(url, nombreOriginal) {
    var blobUrl = null;

    try {
        if (!pubEsUrlSegura(url)) {
            throw new Error('La dirección del archivo no es válida.');
        }

        if (window.showToast) {
            window.showToast('Preparando descarga...', 'info', 2000);
        }

        var response = await fetch(url);

        if (!response.ok) {
            throw new Error('Error al descargar el archivo');
        }

        var blob = await response.blob();
        var extension = '';

        if (nombreOriginal && nombreOriginal.indexOf('.') !== -1) {
            extension = nombreOriginal.split('.').pop().split('?')[0];
        } else if (blob.type) {
            var mimeMap = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'video/mp4': 'mp4',
                'video/webm': 'webm'
            };

            extension = mimeMap[blob.type] || 'file';
        }

        var nombreDescarga = 'descarga_' + Date.now() + '.' + extension;

        blobUrl = URL.createObjectURL(blob);

        var a = document.createElement('a');

        a.href = blobUrl;
        a.download = nombreDescarga;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (window.showToast) {
            window.showToast('Descarga iniciada', 'success', 2000);
        }

    } catch (error) {
        if (window.showToast) {
            window.showToast('Error al descargar el archivo', 'error');
        }
    } finally {
        if (blobUrl) {
            setTimeout(function () {
                URL.revokeObjectURL(blobUrl);
            }, 1000);
        }
    }
}

// ================================================================
// EMOJIS
// ================================================================

function toggleEmojiPickerPerfil() {
    var picker = document.getElementById('emojiPickerPerfil');

    if (!picker) return;

    if (picker.classList.contains('show')) {
        picker.classList.remove('show');
        return;
    }

    var grid = document.getElementById('emojiGridPerfil');

    if (grid && grid.children.length === 0) {
        pubEmojisPicker().forEach(function (emoji) {
            var btn = document.createElement('button');

            btn.type = 'button';
            btn.textContent = emoji;

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                insertarEmojiEnPerfil(emoji);
                picker.classList.remove('show');
            });

            grid.appendChild(btn);
        });
    }

    picker.classList.add('show');
}

function insertarEmojiEnPerfil(emoji) {
    var input = document.getElementById('inputNuevaPublicacion');

    if (!input) return;

    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    var texto = input.value;

    input.value = texto.substring(0, start) + emoji + texto.substring(end);

    input.focus();

    var posicion = start + emoji.length;

    input.selectionStart = posicion;
    input.selectionEnd = posicion;
}

function insertarHashtagPerfil() {
    var input = document.getElementById('inputNuevaPublicacion');

    if (!input) return;

    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    var texto = input.value;

    input.value = texto.substring(0, start) + '#' + texto.substring(end);

    input.focus();
    input.selectionStart = start + 1;
    input.selectionEnd = start + 1;
}

// ================================================================
// SELECCIÓN DE ARCHIVOS
// ================================================================

function seleccionarArchivoPerfil(event, tipo) {
    var input = event && event.target ? event.target : null;
    var file = input && input.files ? input.files[0] : null;

    if (!file) return;

    if (tipo !== 'imagen' && tipo !== 'video') {
        if (window.showToast) window.showToast('Tipo de archivo no válido', 'error');
        if (input) input.value = '';
        return;
    }

    var otroTipo = tipo === 'imagen' ? 'video' : 'imagen';

    if (archivosSeleccionados[otroTipo]) {
        if (window.showToast) {
            window.showToast('Por ahora puedes adjuntar una imagen o un video por publicación.', 'warning');
        }

        if (input) input.value = '';

        return;
    }

    if (tipo === 'imagen') {
        if (file.size > 5 * 1024 * 1024) {
            if (window.showToast) window.showToast('Imagen mayor a 5 MB', 'error');
            input.value = '';
            return;
        }

        if (!file.type || file.type.indexOf('image/') !== 0) {
            if (window.showToast) window.showToast('Solo se permiten imágenes', 'error');
            input.value = '';
            return;
        }
    } else {
        if (file.size > 100 * 1024 * 1024) {
            if (window.showToast) window.showToast('Video mayor a 100 MB', 'error');
            input.value = '';
            return;
        }

        if (!file.type || file.type.indexOf('video/') !== 0) {
            if (window.showToast) window.showToast('Solo se permiten videos', 'error');
            input.value = '';
            return;
        }
    }

    archivosSeleccionados[tipo] = file;

    renderizarPreviewPerfil();
}

// ================================================================
// PREVISUALIZACIÓN
// ================================================================

// Función auxiliar para revocar URLs de objeto y liberar memoria RAM
function pubRevocarUrlPreview(tipo) {
    if (pubPreviewObjectUrls[tipo]) {
        try {
            URL.revokeObjectURL(pubPreviewObjectUrls[tipo]);
        } catch (e) {}
        pubPreviewObjectUrls[tipo] = null;
    }
}

function renderizarPreviewPerfil() {
    var container = document.getElementById('previewArchivosPerfil');

    if (!container) return;

    container.innerHTML = '';

    // Revocar cualquier URL previa antes de volver a renderizar
    Object.keys(pubPreviewObjectUrls).forEach(function (t) {
        pubRevocarUrlPreview(t);
    });

    Object.keys(archivosSeleccionados).forEach(function (tipo) {
        var file = archivosSeleccionados[tipo];

        if (!file) return;

        var wrapper = document.createElement('div');
        wrapper.className = 'preview-item';

        var media;

        if (tipo === 'imagen') {
            media = document.createElement('img');
            media.alt = 'Vista previa';
        } else if (tipo === 'video') {
            media = document.createElement('video');
            media.muted = true;
            media.controls = true;
            media.playsInline = true;
        } else {
            return;
        }

        // Se usa createObjectURL para no saturar la RAM (evita base64 masivo)
        var objectUrl = URL.createObjectURL(file);
        pubPreviewObjectUrls[tipo] = objectUrl;

        media.src = objectUrl;

        var quitar = document.createElement('button');

        quitar.type = 'button';
        quitar.className = 'remove-btn';
        quitar.textContent = '×';

        quitar.addEventListener('click', function () {
            quitarArchivoPerfil(tipo);
        });

        wrapper.appendChild(media);
        wrapper.appendChild(quitar);

        container.appendChild(wrapper);
    });

    if (archivosSeleccionados.imagen || archivosSeleccionados.video) {
        var controlDiv = document.createElement('div');
        controlDiv.className = 'preview-download-control';

        var checkbox = document.createElement('input');

        checkbox.type = 'checkbox';
        checkbox.id = 'chkPermitirDescarga';
        checkbox.checked = true;

        var label = document.createElement('label');

        label.htmlFor = 'chkPermitirDescarga';
        label.textContent = 'Permitir que otros descarguen este archivo';

        controlDiv.appendChild(checkbox);
        controlDiv.appendChild(label);

        container.appendChild(controlDiv);
    }
}

function quitarArchivoPerfil(tipo) {
    if (tipo !== 'imagen' && tipo !== 'video') return;

    archivosSeleccionados[tipo] = null;

    pubRevocarUrlPreview(tipo); // Liberar la RAM de esa previsualización

    var inputId = tipo === 'imagen'
        ? 'inputFotoPerfilPost'
        : 'inputVideoPerfilPost';

    var input = document.getElementById(inputId);

    if (input) input.value = '';

    renderizarPreviewPerfil();
}

// ================================================================
// PUBLICAR
// ================================================================

async function publicarDesdePerfil() {
    var btn = document.getElementById('btnPublicarPerfil');
    var input = document.getElementById('inputNuevaPublicacion');

    var contenido = input ? input.value.trim() : '';

    if (!contenido && !archivosSeleccionados.imagen && !archivosSeleccionados.video) {
        if (window.showToast) {
            window.showToast('Escribe algo o sube una foto/video', 'warning');
        }

        return;
    }

    var textoOriginalBtn = btn ? btn.innerHTML : 'Publicar';

    if (btn && btn.disabled) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Publicando...';
    }

    try {
        var client = window.supabaseClient;

        if (!client) throw new Error('Supabase no está listo.');

        var sessionResult = await client.auth.getSession();

        if (sessionResult.error) throw sessionResult.error;

        var session = sessionResult.data ? sessionResult.data.session : null;

        if (!session) {
            if (window.showToast) {
                window.showToast('Inicia sesión para publicar', 'error');
            }

            return;
        }

        var token = session.access_token;
        var mediaUrl = null;
        var mediaType = null;

        var chkDescarga = document.getElementById('chkPermitirDescarga');
        var permitirDescarga = chkDescarga ? chkDescarga.checked : true;

        if (archivosSeleccionados.imagen) {
            var resImg = await subirArchivoConModeracion(
                archivosSeleccionados.imagen,
                'muro-videos',
                'imagen',
                token
            );

            mediaUrl = resImg.url;
            mediaType = 'imagen';

        } else if (archivosSeleccionados.video) {
            var resVid = await subirArchivoConModeracion(
                archivosSeleccionados.video,
                'muro-videos',
                'video',
                token
            );

            mediaUrl = resVid.url;
            mediaType = 'video';
        }

        var insertResult = await client.from('publicaciones').insert({
            usuario_id: session.user.id,
            contenido: contenido,
            media_url: mediaUrl,
            media_type: mediaType,
            estado: 'publicado',
            permitir_descarga: permitirDescarga
        }).select().single();

        if (insertResult.error) throw insertResult.error;

        if (window.showToast) {
            window.showToast('Publicación creada', 'success');
        }

        if (input) input.value = '';

        archivosSeleccionados.imagen = null;
        archivosSeleccionados.video = null;

        // Liberar memoria de las previews
        pubRevocarUrlPreview('imagen');
        pubRevocarUrlPreview('video');

        if (document.getElementById('inputFotoPerfilPost')) {
            document.getElementById('inputFotoPerfilPost').value = '';
        }

        if (document.getElementById('inputVideoPerfilPost')) {
            document.getElementById('inputVideoPerfilPost').value = '';
        }

        renderizarPreviewPerfil();

        await cargarMisPublicaciones(true);

    } catch (error) {
        if (window.showToast) {
            window.showToast(
                esErrorModeracionPerfil(error)
                    ? 'Contenido no permitido'
                    : (error.message || 'No se pudo crear la publicación'),
                'error'
            );
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginalBtn;
        }
    }
}

// ================================================================
// OBSERVADOR DE VÍDEOS DEL FEED
// ================================================================

var videoObserverPerfil = null;

if (typeof IntersectionObserver !== 'undefined') {
    videoObserverPerfil = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            var video = entry.target;

            if (!video || !video.isConnected) return;

            // Nunca detener el vídeo activo del visor.
            if (pubEsVideoDelVisor(video)) return;

            // Nunca detener un vídeo que esté en ventana flotante.
            if (pubEsVideoFlotante(video)) return;

            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                var autoPlayPref = 'true';

                try {
                    autoPlayPref = localStorage.getItem('contenido_auto_reproducir');
                } catch (e) {}

                if (autoPlayPref !== 'false') {
                    video.muted = true;

                    if (video.paused) {
                        pubReproducirVideo(video);
                    }
                }

            } else {
                if (
                    video !== pubMotorVideo.videoActivo &&
                    document.pictureInPictureElement !== video
                ) {
                    video.pause();
                }
            }
        });
    }, {
        threshold: [0, 0.25, 0.5, 0.75, 1]
    });
}

// ================================================================
// VISIBILIDAD DE LA PÁGINA
// ================================================================

document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;

    var visor = document.getElementById('pubVisorFull');
    var video = pubVisor.videoActual;

    if (
        video &&
        visor &&
        visor.classList.contains('show') &&
        !video.paused &&
        document.pictureInPictureElement !== video
    ) {
        pubMotorVideo.reproduccionSolicitada = true;
    }
});

// ================================================================
// CARGA DE PUBLICACIONES
// ================================================================

var pubVersionRender = 0;

async function cargarMisPublicaciones(forzarRefresco) {
    var container = document.getElementById('misPublicacionesList');
    var contador = document.getElementById('misPostsCount');

    if (!container) return;

    var versionActual = ++pubVersionRender;

    try {
        var client = window.supabaseClient;

        if (!client) {
            if (!forzarRefresco) {
                setTimeout(function () {
                    cargarMisPublicaciones(true);
                }, 1000);
            }

            return;
        }

        var sessionResult = await client.auth.getSession();

        if (sessionResult.error) throw sessionResult.error;

        var session = sessionResult.data ? sessionResult.data.session : null;

        if (!session) {
            container.innerHTML = '<div class="empty-state"><h4>Inicia sesión</h4></div>';

            if (contador) contador.textContent = '0';

            return;
        }

        var result = await client
            .from('publicaciones_publicas')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (result.error) throw result.error;

        if (versionActual !== pubVersionRender) return;

        var publicaciones = result.data || [];

        if (contador) contador.textContent = publicaciones.length;

        if (publicaciones.length === 0) {
            container.innerHTML = '<div class="empty-state"><h4>Sin publicaciones aún</h4><p>Publica algo para verlo aquí</p></div>';

            window.listaMultimediaPerfil = [];

            return;
        }

        container.innerHTML = '';
        window.listaMultimediaPerfil = [];

        var reaccionesUsuario = {};
        var conteosReacciones = {};

        var idsPublicaciones = publicaciones.map(function (p) {
            return p.id;
        }).filter(Boolean);

        if (idsPublicaciones.length > 0) {
            try {
                var reaccResult = await client
                    .from('publicaciones_reacciones')
                    .select('publicacion_id, tipo, usuario_id')
                    .in('publicacion_id', idsPublicaciones);

                if (!reaccResult.error && reaccResult.data) {
                    reaccResult.data.forEach(function (r) {
                        if (!conteosReacciones[r.publicacion_id]) {
                            conteosReacciones[r.publicacion_id] = {};
                        }

                        var tipos = conteosReacciones[r.publicacion_id];

                        tipos[r.tipo] = (tipos[r.tipo] || 0) + 1;

                        if (r.usuario_id === session.user.id) {
                            reaccionesUsuario[r.publicacion_id] = r.tipo;
                        }
                    });
                }

            } catch (errorReacciones) {
                console.error(errorReacciones);
            }
        }

        if (versionActual !== pubVersionRender) return;

        var miId = session.user.id;

        publicaciones.forEach(function (p) {
            // ========================================================
            // REFACTORIZACIÓN DE SEGURIDAD (XSS MITIGATION)
            // ========================================================
            var nombreReal = p.usuario_nombre || 'Explorador';
            var handleSeguro = p.usuario_handle || '';

            var urlAutor = pubUrlPerfilAutor(
                p.usuario_handle,
                p.usuario_id,
                miId
            );

            var esDueno = String(p.usuario_id) === String(miId);

            var card = document.createElement('div');

            card.className = 'publicacion-card';
            card.dataset.id = p.id;

            var header = document.createElement('div');
            header.className = 'header';

            var avatarBox = document.createElement(urlAutor ? 'a' : 'div');

            avatarBox.className = 'avatar' + (urlAutor ? ' pub-autor-avatar-enlace' : '');

            if (urlAutor) {
                avatarBox.href = urlAutor;
            }

            avatarBox.appendChild(pubCrearAvatar(p.usuario_nombre, p.usuario_avatar_url));

            header.appendChild(avatarBox);

            var headerMeta = document.createElement('div');

            var nombreBloque = document.createElement(urlAutor ? 'a' : 'div');
            nombreBloque.className = urlAutor ? 'pub-autor-enlace' : 'nombre';
            nombreBloque.setAttribute('data-no-traducir', '1');

            if (urlAutor) {
                nombreBloque.href = urlAutor;
            }

            var spanNombre = document.createElement('span');
            spanNombre.className = urlAutor ? 'nombre' : 'pub-autor-nombre';
            spanNombre.setAttribute('data-no-traducir', '1');
            spanNombre.textContent = nombreReal;
            nombreBloque.appendChild(spanNombre);

            if (handleSeguro) {
                var spanHandle = document.createElement('span');
                spanHandle.className = 'pub-autor-handle';
                spanHandle.textContent = ' @' + handleSeguro;
                nombreBloque.appendChild(spanHandle);
            }

            var fechaDiv = document.createElement('div');
            fechaDiv.className = 'fecha';
            fechaDiv.setAttribute('data-no-traducir', '1');
            fechaDiv.textContent = p.created_at
                ? new Date(p.created_at).toLocaleString(pubCodigoIdioma())
                : '';

            headerMeta.appendChild(nombreBloque);
            headerMeta.appendChild(fechaDiv);

            header.appendChild(headerMeta);
            card.appendChild(header);

            if (p.aviso_moderacion === 'lenguaje_inapropiado') {
                card.appendChild(htmlAvisoModeracionPerfil());
            }

            var contenido = document.createElement('div');

            contenido.className = 'contenido';
            contenido.setAttribute('data-no-traducir', '1');

            if (p.contenido) {
                var texto = document.createElement('div');

                texto.textContent = p.contenido;

                contenido.appendChild(texto);
            }

            if (pubEsUrlSegura(p.media_url)) {
                var tipoMedia = p.media_type;

                if (tipoMedia === 'video' || tipoMedia === 'imagen') {
                    var indexEnLista = window.listaMultimediaPerfil.length;

                    window.listaMultimediaPerfil.push({
                        url: p.media_url,
                        tipo: tipoMedia,
                        permiteDescarga: p.permitir_descarga !== false,
                        postId: p.id,
                        esDueno: esDueno
                    });

                    var wrapMedia = document.createElement('div');

                    wrapMedia.className = 'pub-media-wrap';

                    // NUEVO: Contenedor uniforme 9:16
                    var mediaContainer = document.createElement('div');
                    mediaContainer.className = 'pub-media-container';

                    var mediaEl;

                    if (tipoMedia === 'video') {
                        mediaEl = document.createElement('video');

                        // Deshabilitar controles nativos para que el visor tenga el control
                        mediaEl.controls = false;
                        mediaEl.preload = 'metadata';
                        mediaEl.src = p.media_url;
                        mediaEl.playsInline = true;

                        mediaEl.setAttribute('playsinline', '');

                        var autoplayInicial = 'true';

                        try {
                            autoplayInicial = localStorage.getItem('contenido_auto_reproducir');
                        } catch (e) {}

                        mediaEl.muted = autoplayInicial !== 'false';

                        // No se permite que el observer gestione el vídeo del visor.
                        if (videoObserverPerfil) {
                            videoObserverPerfil.observe(mediaEl);
                        }

                        // Evitar reproducción accidental de varios vídeos.
                        mediaEl.addEventListener('play', function () {
                            if (pubMotorVideo.videoActivo && pubMotorVideo.videoActivo !== mediaEl) {
                                var anterior = pubMotorVideo.videoActivo;

                                if (
                                    anterior.isConnected &&
                                    !pubEsVideoDelVisor(anterior) &&
                                    !pubEsVideoFlotante(anterior)
                                ) {
                                    anterior.pause();
                                }
                            }

                            pubMotorVideo.videoActivo = mediaEl;
                        });

                        // Abrir visor al hacer clic en el video
                        mediaEl.addEventListener('click', function (e) {
                            e.stopPropagation();
                            pubAbrirVisor(indexEnLista, p.id, esDueno);
                        });

                    } else {
                        mediaEl = document.createElement('img');

                        mediaEl.alt = 'Imagen';
                        mediaEl.loading = 'lazy';
                        mediaEl.src = p.media_url;

                        mediaEl.addEventListener('click', function (e) {
                            e.stopPropagation();

                            pubAbrirVisor(indexEnLista, p.id, esDueno);
                        });
                    }

                    mediaContainer.appendChild(mediaEl);
                    wrapMedia.appendChild(mediaContainer);
                    contenido.appendChild(wrapMedia);
                }
            }

            card.appendChild(contenido);

            // Reacciones
            var reaccionUsuario = reaccionesUsuario[p.id] || null;
            var conteos = conteosReacciones[p.id] || {};

            var totalReacciones = 0;

            Object.keys(conteos).forEach(function (k) {
                totalReacciones += conteos[k] || 0;
            });

            var emojiMostrado = reaccionUsuario || '❤️';

            var wrap = document.createElement('div');
            wrap.className = 'reaccion-wrap';

            var dropdown = document.createElement('div');

            dropdown.className = 'reaccion-dropdown';
            dropdown.id = 'reaccion-dropdown-' + p.id;

            pubEmojisReaccion().forEach(function (emoji) {
                var b = document.createElement('button');

                b.textContent = emoji;
                // Identificador fijo del emoji: no depende del texto del botón
                // (que cambia cuando se muestra el contador).
                b.setAttribute('data-emoji', emoji);

                // El motor visual asigna clase y entropía (--delay / --dur).
                pubAplicarMotorEmoji(b, emoji);

                if (reaccionUsuario === emoji) {
                    b.classList.add('activa');
                }

                b.addEventListener('click', function (ev) {
                    ev.stopPropagation();

                    dropdown.classList.remove('show');

                    reaccionarPublicacionPerfil(p.id, emoji);
                });

                if (conteos[emoji] > 0) {
                    var mini = document.createElement('span');

                    mini.className = 'mini-count';
                    mini.textContent = conteos[emoji];

                    b.appendChild(mini);
                }

                dropdown.appendChild(b);
            });

            var trigger = document.createElement('button');

            trigger.className = 'reaccion-trigger' + (reaccionUsuario ? ' activa' : '');

            var emojiActual = document.createElement('span');

            emojiActual.className = 'emoji-actual';
            emojiActual.textContent = emojiMostrado;

            pubAplicarMotorEmoji(emojiActual, emojiMostrado);

            var countActual = document.createElement('span');

            countActual.className = 'count';
            countActual.textContent = totalReacciones > 0
                ? String(totalReacciones)
                : 'Reaccionar';

            trigger.appendChild(emojiActual);
            trigger.appendChild(countActual);

            trigger.addEventListener('click', function (e) {
                e.stopPropagation();

                var estaAbierto = dropdown.classList.contains('show');

                document.querySelectorAll('.reaccion-dropdown.show').forEach(function (el) {
                    el.classList.remove('show');
                });

                if (!estaAbierto) {
                    dropdown.classList.add('show');
                }
            });

            wrap.appendChild(dropdown);
            wrap.appendChild(trigger);

            var stats = document.createElement('div');

            stats.className = 'stats';
            stats.appendChild(wrap);

            var btnComentarios = document.createElement('button');

            btnComentarios.className = 'btn-accion-pub';
            btnComentarios.textContent = 'Comentarios';

            btnComentarios.addEventListener('click', function (ev) {
                ev.stopPropagation();
                toggleComentariosPerfil(p.id);
            });

            var btnEliminar = document.createElement('button');

            btnEliminar.className = 'btn-accion-pub danger';
            btnEliminar.textContent = 'Eliminar';

            btnEliminar.addEventListener('click', function (ev) {
                ev.stopPropagation();
                eliminarMiPublicacion(p.id, ev);
            });

            stats.appendChild(btnComentarios);
            stats.appendChild(btnEliminar);

            card.appendChild(stats);

            // Comentarios
            var comentariosContainer = document.createElement('div');

            comentariosContainer.className = 'comentarios-container';
            comentariosContainer.id = 'comentarios-container-' + p.id;
            comentariosContainer.dataset.dueno = p.usuario_id || '';

            var comentariosLista = document.createElement('div');

            comentariosLista.className = 'comentarios-lista';
            comentariosLista.id = 'comentarios-lista-' + p.id;

            var filaComentario = document.createElement('div');

            filaComentario.className = 'comentario-input-row';

            var inputComentario = document.createElement('input');

            inputComentario.type = 'text';
            inputComentario.id = 'comentario-input-' + p.id;
            inputComentario.placeholder = 'Escribe un comentario...';
            inputComentario.maxLength = 2000;

            var btnEnviarComentario = document.createElement('button');

            btnEnviarComentario.textContent = 'Enviar';

            btnEnviarComentario.addEventListener('click', function () {
                enviarComentarioPerfil(p.id);
            });

            inputComentario.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault();
                    enviarComentarioPerfil(p.id);
                }
            });

            filaComentario.appendChild(inputComentario);
            filaComentario.appendChild(btnEnviarComentario);

            comentariosContainer.appendChild(comentariosLista);
            comentariosContainer.appendChild(filaComentario);

            card.appendChild(comentariosContainer);

            container.appendChild(card);
        });

    } catch (error) {
        if (versionActual === pubVersionRender) {
            container.innerHTML =
                '<div class="empty-state"><h4>Error al cargar</h4><p>' +
                pubEscapeHtml(error.message || 'Intenta nuevamente.') +
                '</p></div>';
        }
    }
}

// ================================================================
// CERRAR MENÚS DE REACCIONES
// ================================================================

document.addEventListener('click', function (e) {
    if (!e.target.closest('.reaccion-wrap')) {
        document.querySelectorAll('.reaccion-dropdown.show').forEach(function (el) {
            el.classList.remove('show');
        });
    }
});

// ================================================================
// ACTUALIZAR REACCIONES (barra, contadores por emoji y resaltado)
// ================================================================

function pubActualizarMenuReacciones(card, conteos, usuarioTipo) {
    if (!card) return;

    card.querySelectorAll('.reaccion-dropdown button[data-emoji]').forEach(function (b) {
        var emoji = b.getAttribute('data-emoji');

        b.classList.toggle('activa', emoji === usuarioTipo);

        var anterior = b.querySelector('.mini-count');

        if (anterior) anterior.remove();

        var cantidad = conteos[emoji] || 0;

        if (cantidad > 0) {
            var mini = document.createElement('span');

            mini.className = 'mini-count';
            mini.textContent = String(cantidad);

            b.appendChild(mini);
        }
    });
}

async function refrescarReaccionesPublicacion(postId) {
    var client = window.supabaseClient;

    if (!client) return;

    var card = document.querySelector(
        '.publicacion-card[data-id="' + postId + '"]'
    );

    if (!card) return;

    var sessionResult = await client.auth.getSession();

    var session = sessionResult.data ? sessionResult.data.session : null;
    var uid = session ? session.user.id : null;

    var result = await client
        .from('publicaciones_reacciones')
        .select('tipo, usuario_id')
        .eq('publicacion_id', postId);

    if (result.error) throw result.error;

    var conteos = {};
    var usuarioTipo = null;

    (result.data || []).forEach(function (r) {
        conteos[r.tipo] = (conteos[r.tipo] || 0) + 1;

        if (uid && r.usuario_id === uid) {
            usuarioTipo = r.tipo;
        }
    });

    var total = 0;

    Object.keys(conteos).forEach(function (tipo) {
        total += conteos[tipo];
    });

    var dominante = Object.keys(conteos).sort(function (a, b) {
        return conteos[b] - conteos[a];
    })[0];

    var emojiMostrado = usuarioTipo || dominante || '❤️';

    var trigger = card.querySelector('.reaccion-trigger');

    if (trigger) {
        trigger.classList.toggle('activa', Boolean(usuarioTipo));

        var emojiActual = trigger.querySelector('.emoji-actual');
        var countActual = trigger.querySelector('.count');

        if (emojiActual) {
            emojiActual.textContent = emojiMostrado;
            pubAplicarMotorEmoji(emojiActual, emojiMostrado);
        }

        if (countActual) {
            countActual.textContent = total > 0 ? String(total) : 'Reaccionar';
        }
    }

    pubActualizarMenuReacciones(card, conteos, usuarioTipo);
}

// ================================================================
// REACCIONAR
// ================================================================

var pubReaccionesEnProceso = {};

async function reaccionarPublicacionPerfil(postId, emoji) {
    if (
        !pubEmojisReaccion().includes(emoji) ||
        pubReaccionesEnProceso[postId]
    ) {
        return;
    }

    var client = window.supabaseClient;

    if (!client) {
        if (window.showToast) {
            window.showToast('No se pudo conectar. Recarga la página.', 'error');
        }

        return;
    }

    pubReaccionesEnProceso[postId] = true;

    try {
        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data ? sessionResult.data.session : null;

        if (!session) {
            if (window.showToast) {
                window.showToast('Inicia sesión para reaccionar.', 'warning');
            }

            return;
        }

        var existing = await client
            .from('publicaciones_reacciones')
            .select('id, tipo')
            .eq('publicacion_id', postId)
            .eq('usuario_id', session.user.id)
            .maybeSingle();

        if (existing.error) throw existing.error;

        if (existing.data && existing.data.tipo === emoji) {
            var eliminar = await client
                .from('publicaciones_reacciones')
                .delete()
                .eq('id', existing.data.id);

            if (eliminar.error) throw eliminar.error;

        } else if (existing.data) {
            var actualizar = await client
                .from('publicaciones_reacciones')
                .update({ tipo: emoji })
                .eq('id', existing.data.id);

            if (actualizar.error) throw actualizar.error;

        } else {
            var insertar = await client
                .from('publicaciones_reacciones')
                .insert({
                    publicacion_id: postId,
                    usuario_id: session.user.id,
                    tipo: emoji
                });

            if (insertar.error) throw insertar.error;
        }

        await refrescarReaccionesPublicacion(postId);

    } catch (error) {
        // Se registra el detalle para depuración y se avisa al usuario.
        console.error('[Reacciones] Error al guardar la reacción:', error);

        if (window.showToast) {
            var detalle = error && error.message ? ' (' + error.message + ')' : '';

            window.showToast('No se pudo guardar tu reacción' + detalle, 'error');
        }
    } finally {
        delete pubReaccionesEnProceso[postId];
    }
}

// ================================================================
// COMENTARIOS
// ================================================================

async function toggleComentariosPerfil(publicacionId) {
    var container = document.getElementById(
        'comentarios-container-' + publicacionId
    );

    if (!container) return;

    if (container.classList.contains('show')) {
        container.classList.remove('show');
        return;
    }

    container.classList.add('show');

    await cargarComentariosPerfil(publicacionId);
}

async function cargarComentariosPerfil(publicacionId) {
    var lista = document.getElementById(
        'comentarios-lista-' + publicacionId
    );

    if (!lista) return;

    var contenedor = document.getElementById(
        'comentarios-container-' + publicacionId
    );

    var duenoId = contenedor ? contenedor.dataset.dueno : '';

    lista.textContent = 'Cargando...';

    try {
        var client = window.supabaseClient;

        if (!client) throw new Error('Supabase no está disponible.');

        var sessionResult = await client.auth.getSession();

        var session = sessionResult.data ? sessionResult.data.session : null;
        var uid = session ? session.user.id : null;

        var soyDueno = Boolean(uid && duenoId && uid === duenoId);

        var result = await client
            .from('publicaciones_comentarios_publicos')
            .select('*')
            .eq('publicacion_id', publicacionId)
            .order('created_at', { ascending: true });

        if (result.error) throw result.error;

        var comentarios = result.data || [];

        if (comentarios.length === 0) {
            lista.textContent = 'Sin comentarios.';
            return;
        }

        lista.innerHTML = '';

        comentarios.forEach(function (c) {
            var item = document.createElement('div');

            item.className = 'comentario-item';

            var avatarMini = document.createElement('div');

            avatarMini.className = 'avatar-mini';
            avatarMini.appendChild(
                pubCrearAvatar(c.usuario_nombre, c.usuario_avatar_url)
            );

            item.appendChild(avatarMini);

            var contenidoDiv = document.createElement('div');

            contenidoDiv.className = 'contenido-comentario';

            var nombre = document.createElement('div');

            nombre.className = 'nombre';
            nombre.textContent = c.usuario_nombre || 'Usuario';

            contenidoDiv.appendChild(nombre);

            var textoDiv = document.createElement('div');

            textoDiv.className = 'texto';
            textoDiv.textContent = c.contenido || '';

            contenidoDiv.appendChild(textoDiv);

            var fechaDiv = document.createElement('div');

            fechaDiv.className = 'fecha';

            fechaDiv.textContent = c.created_at
                ? new Date(c.created_at).toLocaleString(pubCodigoIdioma())
                : '';

            contenidoDiv.appendChild(fechaDiv);

            if (uid && (c.usuario_id === uid || soyDueno)) {
                var btnDel = document.createElement('button');

                btnDel.className = 'comentario-eliminar';
                btnDel.textContent = 'Eliminar';

                btnDel.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    eliminarComentarioPerfil(c.id, publicacionId);
                });

                contenidoDiv.appendChild(btnDel);
            }

            item.appendChild(contenidoDiv);
            lista.appendChild(item);
        });

    } catch (error) {
        console.error(error);
        lista.textContent = 'Error al cargar comentarios.';
    }
}

// ================================================================
// ENVIAR COMENTARIOS
// ================================================================

var pubComentariosEnProceso = {};

async function enviarComentarioPerfil(publicacionId) {
    var input = document.getElementById(
        'comentario-input-' + publicacionId
    );

    var texto = input ? input.value.trim() : '';

    if (!texto || pubComentariosEnProceso[publicacionId]) return;

    var client = window.supabaseClient;

    if (!client) return;

    pubComentariosEnProceso[publicacionId] = true;

    try {
        var sessionResult = await client.auth.getSession();

        var session = sessionResult.data ? sessionResult.data.session : null;

        if (!session) return;

        var resultado = await client
            .from('publicaciones_comentarios')
            .insert({
                publicacion_id: publicacionId,
                usuario_id: session.user.id,
                contenido: texto,
                created_at: new Date().toISOString()
            });

        if (resultado.error) throw resultado.error;

        if (input) input.value = '';

        await cargarComentariosPerfil(publicacionId);

    } catch (error) {
        if (window.showToast) {
            window.showToast('Error al enviar comentario', 'error');
        }
    } finally {
        delete pubComentariosEnProceso[publicacionId];
    }
}

// ================================================================
// ELIMINAR COMENTARIOS
// ================================================================

async function eliminarComentarioPerfil(comentarioId, publicacionId) {
    if (!confirm('¿Eliminar este comentario?')) return;

    try {
        var client = window.supabaseClient;

        if (!client) throw new Error('Supabase no está disponible.');

        var resultado = await client
            .from('publicaciones_comentarios')
            .delete()
            .eq('id', comentarioId);

        if (resultado.error) throw resultado.error;

        await cargarComentariosPerfil(publicacionId);

    } catch (e) {
        if (window.showToast) {
            window.showToast('Error al eliminar comentario', 'error');
        }
    }
}

// ================================================================
// LIBERAR ARCHIVO
// ================================================================

async function liberarArchivoPublicacion(mediaUrl) {
    if (!mediaUrl) return;

    try {
        var client = window.supabaseClient;

        var sessionResult = await client.auth.getSession();

        var token = sessionResult.data &&
            sessionResult.data.session
            ? sessionResult.data.session.access_token
            : null;

        if (!token) return;

        await fetch('/api/media/liberar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                url: mediaUrl
            })
        });

    } catch (e) {}
}

// ================================================================
// ELIMINAR PUBLICACIÓN
// ================================================================

async function eliminarMiPublicacion(publicacionId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!confirm('¿Seguro que quieres eliminar esta publicación?')) return;

    try {
        var client = window.supabaseClient;

        if (!client) throw new Error('Supabase no está disponible.');

        var pubRes = await client
            .from('publicaciones')
            .select('media_url')
            .eq('id', publicacionId)
            .maybeSingle();

        if (pubRes.error) throw pubRes.error;

        var mediaUrl = pubRes.data ? pubRes.data.media_url : null;

        var eliminar = await client
            .from('publicaciones')
            .delete()
            .eq('id', publicacionId);

        if (eliminar.error) throw eliminar.error;

        await liberarArchivoPublicacion(mediaUrl);

        await cargarMisPublicaciones(true);

    } catch (error) {
        if (window.showToast) {
            window.showToast('Error al eliminar publicación', 'error');
        }
    }
}

// ================================================================
// EXPORTAR FUNCIONES GLOBALES
// ================================================================

window.descargarArchivoForzado = descargarArchivoForzado;
window.publicarDesdePerfil = publicarDesdePerfil;
window.seleccionarArchivoPerfil = seleccionarArchivoPerfil;
window.quitarArchivoPerfil = quitarArchivoPerfil;
window.toggleEmojiPickerPerfil = toggleEmojiPickerPerfil;
window.insertarHashtagPerfil = insertarHashtagPerfil;
window.eliminarComentarioPerfil = eliminarComentarioPerfil;
window.cargarMisPublicaciones = cargarMisPublicaciones;
window.reaccionarPublicacionPerfil = reaccionarPublicacionPerfil;
window.toggleComentariosPerfil = toggleComentariosPerfil;
window.enviarComentarioPerfil = enviarComentarioPerfil;
window.pubUrlPerfilAutor = pubUrlPerfilAutor;
window.pubAbrirVisor = pubAbrirVisor;
window.pubCerrarVisor = pubCerrarVisor;

// ================================================================
// FIN · PERFIL PUBLICACIONES v14.5
// ================================================================