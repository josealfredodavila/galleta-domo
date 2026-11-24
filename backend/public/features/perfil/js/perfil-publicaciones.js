// ================================================================
// PERFIL · PUBLICACIONES
// v15.1 — sin duplicados (visor único: VisorMediaGlobal)
// Ruta: backend/public/features/perfil/js/perfil-publicaciones.js
//
// Cambios v15.1:
//  - Un solo visor: VisorMediaGlobal. Se quitó el duplicado de visor.
//  - Se eliminaron estilos repetidos (ya están en perfil.css).
//  - Se eliminó la función de ruta de autor duplicada en el feed;
//    se usa una sola (pubUrlPerfilAutor).
// ================================================================

window.listaMultimediaPerfil = [];

var PUB_RUTA_PERFIL_PUBLICO = '/features/perfil/perfil-publico.html';
var PUB_RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';

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

var pubPreviewObjectUrls = {};

// ================================================================
// MOTOR DE REACCIONES (centralizado en reacciones-global.js)
// ================================================================

function pubEmojisReaccion() {
    return window.ReaccionesGlobal ? window.ReaccionesGlobal.emojis() : ['❤️', '😂', '🥺', '💎'];
}

function pubAplicarMotorEmoji(el, emoji) {
    if (window.ReaccionesGlobal) window.ReaccionesGlobal.aplicarMotor(el, emoji);
}

// ================================================================
// UTILIDADES
// ================================================================

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

// Única función de ruta de perfil del autor (la usan el feed y el menú).
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
    videoActivo: null
};

function pubEsVideoDelVisor(video) {
    return Boolean(window.VisorMediaGlobal && window.VisorMediaGlobal.contieneVideo(video));
}

function pubEsVideoFlotante(video) {
    return Boolean(video && document.pictureInPictureElement === video);
}

function pubVisorEstaAbierto() {
    return Boolean(window.VisorMediaGlobal && window.VisorMediaGlobal.estaAbierto());
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

// ================================================================
// VISOR ÚNICO (VisorMediaGlobal)
// ================================================================

function pubAbrirVisor(indice, postId, esDueno) {
    var lista = Array.isArray(window.listaMultimediaPerfil) ? window.listaMultimediaPerfil : [];

    if (!lista[indice] || !window.VisorMediaGlobal) return;

    window.VisorMediaGlobal.abrir({
        items: lista,
        indice: indice,
        onEliminar: function (item) {
            eliminarMiPublicacion(item.postId || postId, null);
        },
        onOcultar: function (item) {
            var card = document.querySelector('.publicacion-card[data-id="' + item.postId + '"]');
            if (card) card.remove();
        }
    });
}

function pubCerrarVisor() {
    if (window.VisorMediaGlobal) window.VisorMediaGlobal.cerrar();
}

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
// EMOJIS E HASHTAGS
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
        } else {
            media = document.createElement('video');
            media.muted = true;
            media.controls = true;
            media.playsInline = true;
        }

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

    pubRevocarUrlPreview(tipo);

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

        pubRevocarUrlPreview('imagen');
        pubRevocarUrlPreview('video');

        var inputFoto = document.getElementById('inputFotoPerfilPost');
        var inputVideo = document.getElementById('inputVideoPerfilPost');

        if (inputFoto) inputFoto.value = '';
        if (inputVideo) inputVideo.value = '';

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
// OBSERVADOR DE VIDEOS DEL FEED
// Si el visor está abierto no se toca ningún video del feed.
// ================================================================

var videoObserverPerfil = null;

if (typeof IntersectionObserver !== 'undefined') {
    videoObserverPerfil = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            var video = entry.target;

            if (!video || !video.isConnected) return;

            if (pubVisorEstaAbierto()) return;

            if (pubEsVideoDelVisor(video)) return;

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

            } else if (video !== pubMotorVideo.videoActivo) {
                video.pause();
            }
        });
    }, {
        threshold: [0, 0.25, 0.5, 0.75, 1]
    });
}

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

        if (window.ReaccionesGlobal) {
            await window.ReaccionesGlobal.preparar(client);
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
            var nombreReal = p.usuario_nombre || 'Explorador';
            var handleSeguro = p.usuario_handle || '';

            var urlAutor = pubUrlPerfilAutor(p.usuario_handle, p.usuario_id, miId);

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
                spanHandle.className = 'pub-autor-handle web3-handle';
                spanHandle.textContent = '@' + handleSeguro;
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

                    var mediaContainer = document.createElement('div');
                    mediaContainer.className = 'pub-media-container';

                    var mediaEl;

                    if (tipoMedia === 'video') {
                        mediaEl = document.createElement('video');

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

                        if (videoObserverPerfil) {
                            videoObserverPerfil.observe(mediaEl);
                        }

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

            var reaccionUsuario = reaccionesUsuario[p.id] || null;
            var conteos = conteosReacciones[p.id] || {};

            var totalReacciones = 0;

            Object.keys(conteos).forEach(function (k) {
                totalReacciones += conteos[k] || 0;
            });

            var stats = document.createElement('div');
            stats.className = 'stats';

            if (window.ReaccionesGlobal) {
                var barraRx = window.ReaccionesGlobal.crearBarra({
                    client: client,
                    publicacionId: p.id,
                    usuarioId: miId,
                    resumen: {
                        totales: conteos,
                        total: totalReacciones,
                        miTipo: reaccionUsuario
                    }
                });

                stats.appendChild(barraRx.el);
            }

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
// REACCIONAR (delegado al módulo global)
// ================================================================

async function reaccionarPublicacionPerfil(postId, emoji) {
    var client = window.supabaseClient;

    if (!client || !window.ReaccionesGlobal) return;

    var sesion = await client.auth.getSession();
    var uid = sesion.data && sesion.data.session ? sesion.data.session.user.id : null;

    try {
        await window.ReaccionesGlobal.alternar(client, postId, emoji, uid);
    } catch (e) {
        if (window.showToast) {
            window.showToast('No se pudo guardar tu reacción', 'error');
        }
    }
}

// ================================================================
// COMENTARIOS
// ================================================================

async function toggleComentariosPerfil(publicacionId) {
    var container = document.getElementById('comentarios-container-' + publicacionId);

    if (!container) return;

    if (container.classList.contains('show')) {
        container.classList.remove('show');
        return;
    }

    container.classList.add('show');

    await cargarComentariosPerfil(publicacionId);
}

async function cargarComentariosPerfil(publicacionId) {
    var lista = document.getElementById('comentarios-lista-' + publicacionId);

    if (!lista) return;

    var contenedor = document.getElementById('comentarios-container-' + publicacionId);

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
            avatarMini.appendChild(pubCrearAvatar(c.usuario_nombre, c.usuario_avatar_url));

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
    var input = document.getElementById('comentario-input-' + publicacionId);

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
// FIN · PERFIL PUBLICACIONES v15.1
// ================================================================