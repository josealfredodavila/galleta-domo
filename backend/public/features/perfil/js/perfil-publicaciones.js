// ================================================================
// PERFIL · PUBLICACIONES
// ================================================================
// Publicar desde el perfil (texto/foto/video), listar mis posts,
// reacciones, comentarios, eliminar publicación.
// Depende de: perfil-config.js, perfil-utils.js
//
// v4.2 (Reacciones estilo Facebook):
// - Inyección de CSS para barra tipo píldora (blur), animación popup
//   y zoom en emojis (scale 1.4).
// - Lógica de Long Press (~350ms) para desplegar la barra de reacciones
//   y toque rápido para reaccionar con el emoji por defecto.
// ================================================================

// ================================================================
// INYECCIÓN DE ESTILOS CSS PARA REACCIONES (Estilo Facebook)
// ================================================================
(function inyectarEstilosReaccionesPerfil() {
    if (document.getElementById('perfil-reacciones-fb-styles')) return;
    var style = document.createElement('style');
    style.id = 'perfil-reacciones-fb-styles';
    style.innerHTML = `
        /* Contenedor principal de la reacción */
        .reaccion-wrap {
            position: relative;
            display: inline-block;
            margin-top: 10px;
        }

        /* Barra flotante tipo píldora */
        .reaccion-dropdown {
            position: absolute;
            bottom: 100%;
            left: 0;
            margin-bottom: 8px;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 4px;
            padding: 6px 10px;
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 30px;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            opacity: 0;
            visibility: hidden;
            transform: translateY(10px) scale(0.9);
            transform-origin: bottom left;
            transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), visibility 0.2s;
            z-index: 100;
        }

        /* Clase para mostrar la barra */
        .reaccion-dropdown.show {
            opacity: 1;
            visibility: visible;
            transform: translateY(0) scale(1);
            animation: popupEmojiBar 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        @keyframes popupEmojiBar {
            0% { transform: translateY(10px) scale(0.8); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
        }

        /* Botones de emojis dentro de la barra */
        .reaccion-dropdown button {
            background: transparent;
            border: none;
            font-size: 1.6rem;
            cursor: pointer;
            padding: 0;
            margin: 0;
            width: 38px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.15s;
            position: relative;
            user-select: none;
            -webkit-user-select: none;
        }

        /* Zoom al pasar el cursor o presionar */
        .reaccion-dropdown button:hover,
        .reaccion-dropdown button:active {
            transform: scale(1.4) translateY(-6px);
            background: rgba(255, 255, 255, 0.1);
            z-index: 2;
        }

        /* Mini contador en cada emoji */
        .reaccion-dropdown button .mini-count {
            position: absolute;
            bottom: -4px;
            right: -4px;
            background: #3b82f6;
            color: white;
            font-size: 0.55rem;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 10px;
            line-height: 1;
            opacity: 0;
            transition: opacity 0.15s;
        }

        .reaccion-dropdown button:hover .mini-count {
            opacity: 1;
        }

        /* Botón trigger (Me gusta / Reaccionar) */
        .reaccion-trigger {
            background: transparent;
            border: none;
            color: var(--text-muted, #a1a1aa);
            font-size: 0.8rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s, color 0.2s;
            user-select: none;
            -webkit-user-select: none;
            touch-action: manipulation;
        }

        .reaccion-trigger:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .reaccion-trigger.activa {
            color: #3b82f6;
        }

        .reaccion-trigger .emoji-actual {
            font-size: 1.1rem;
            line-height: 1;
        }

        .reaccion-trigger .count {
            font-size: 0.75rem;
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);
})();

// Código de idioma actual para formatear fechas
function pubCodigoIdioma() {
    try {
        if (typeof window.obtenerCodigoIdiomaActual === 'function') {
            return window.obtenerCodigoIdiomaActual();
        }
    } catch (e) {}
    return 'es-MX';
}

// ================================================================
// HELPER — Detectar error de moderación
// ================================================================
function esErrorModeracionPerfil(error) {
    var msg = (error && error.message) ? String(error.message) : '';
    return msg.indexOf('contenido_no_permitido') !== -1;
}

// ================================================================
// HELPER — Cartel amarillo ⚠️
// ================================================================
function htmlAvisoModeracionPerfil() {
    return '<div class="perfil-aviso-moderacion" style="' +
        'display:flex;align-items:center;gap:8px;' +
        'padding:8px 12px;margin:8px 0;border-radius:10px;' +
        'background:rgba(247,212,74,0.12);' +
        'border:1px solid rgba(247,212,74,0.4);' +
        'color:#f7d44a;font-size:0.72rem;' +
    '">' +
        '<span style="font-size:1rem;">⚠️</span>' +
        '<span>Este mensaje contiene lenguaje inapropiado. ' +
            'Considera expresarte con respeto.</span>' +
    '</div>';
}

// ================================================================
// HELPER — Subida segura con moderación
// ================================================================
async function subirArchivoConModeracion(archivo, destino, tipo, token) {
    const fd = new FormData();
    fd.append('file', archivo);
    fd.append('destino', destino);
    fd.append('tipo', tipo);

    const respuesta = await fetch('/api/media/upload', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: fd
    });

    let data = null;
    try {
        data = await respuesta.json();
    } catch (e) {
        data = {};
    }

    if (!respuesta.ok || !data.ok) {
        const mensaje = data && data.error
            ? data.error
            : 'No se pudo subir el archivo';
        const error = new Error(mensaje);
        error.status = respuesta.status;
        throw error;
    }

    return data;
}

// ================================================================
// EMOJI PICKER
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
        emojisDisponibles.forEach(function (emoji) {
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
    input.selectionStart = input.selectionEnd = start + emoji.length;
}

// ================================================================
// INSERTAR HASHTAG
// ================================================================
function insertarHashtagPerfil() {
    var input = document.getElementById('inputNuevaPublicacion');
    if (!input) return;
    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    var texto = input.value;
    input.value = texto.substring(0, start) + '#' + texto.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + 1;
}

// ================================================================
// SELECCIONAR ARCHIVO
// ================================================================
function seleccionarArchivoPerfil(event, tipo) {
    var file = event.target.files[0];
    if (!file) return;
    if (tipo === 'imagen') {
        if (file.size > 5 * 1024 * 1024) {
            if (window.showToast) window.showToast(perfilT('perfil_pub_imagen_max', 'Imagen mayor a 5 MB'), 'error');
            event.target.value = '';
            return;
        }
        if (!file.type.startsWith('image/')) {
            if (window.showToast) window.showToast(perfilT('perfil_pub_solo_imagenes', 'Solo imágenes'), 'error');
            event.target.value = '';
            return;
        }
    } else if (tipo === 'video') {
        if (file.size > 100 * 1024 * 1024) {
            if (window.showToast) window.showToast(perfilT('perfil_pub_video_max', 'Video mayor a 100 MB'), 'error');
            event.target.value = '';
            return;
        }
        if (!file.type.startsWith('video/')) {
            if (window.showToast) window.showToast(perfilT('perfil_pub_solo_videos', 'Solo videos'), 'error');
            event.target.value = '';
            return;
        }
    }
    archivosSeleccionados[tipo] = file;
    renderizarPreviewPerfil();
}

// ================================================================
// RENDERIZAR PREVIEW
// ================================================================
function renderizarPreviewPerfil() {
    var container = document.getElementById('previewArchivosPerfil');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(archivosSeleccionados).forEach(function (tipo) {
        var file = archivosSeleccionados[tipo];
        if (!file) return;
        var wrapper = document.createElement('div');
        wrapper.className = 'preview-item';
        var reader = new FileReader();
        reader.onload = function (e) {
            if (tipo === 'imagen') {
                wrapper.innerHTML = '<img src="' + e.target.result + '" alt="preview"><button type="button" class="remove-btn" onclick="window.quitarArchivoPerfil(\'' + tipo + '\')">×</button>';
            } else if (tipo === 'video') {
                wrapper.innerHTML = '<video src="' + e.target.result + '" muted></video><button type="button" class="remove-btn" onclick="window.quitarArchivoPerfil(\'' + tipo + '\')">×</button>';
            }
        };
        reader.readAsDataURL(file);
        container.appendChild(wrapper);
    });
}

function quitarArchivoPerfil(tipo) {
    archivosSeleccionados[tipo] = null;
    var inputId = tipo === 'imagen' ? 'inputFotoPerfilPost' : 'inputVideoPerfilPost';
    var input = document.getElementById(inputId);
    if (input) input.value = '';
    renderizarPreviewPerfil();
}

// ================================================================
// PUBLICAR DESDE EL PERFIL — con moderación
// ================================================================
async function publicarDesdePerfil() {
    var btn = document.getElementById('btnPublicarPerfil');
    var input = document.getElementById('inputNuevaPublicacion');
    var contenido = input ? input.value.trim() : '';

    if (!contenido && !archivosSeleccionados.imagen && !archivosSeleccionados.video) {
        if (window.showToast) window.showToast(perfilT('perfil_pub_vacio', 'Escribe algo o sube una foto/video'), 'warning');
        return;
    }

    var textoOriginalBtn = btn ? btn.innerHTML : perfilT('perfil_publicar', 'Publicar');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> '
            + escaparHTML(perfilT('perfil_pub_publicando', 'Publicando...'));
    }

    try {
        var client = window.supabaseClient;
        if (!client) throw new Error(perfilT('perfil_pub_supabase_listo', 'Supabase no está listo. Recarga la página.'));

        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) {
            if (window.showToast) window.showToast(perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        var token = session.access_token;

        var mediaUrl = null;
        var mediaType = null;

        // Subir imagen (con moderación)
        if (archivosSeleccionados.imagen) {
            if (window.showToast) window.showToast(perfilT('perfil_pub_subiendo_imagen', 'Subiendo imagen...'), '', 5000);
            var file = archivosSeleccionados.imagen;
            var resultadoImagen = await subirArchivoConModeracion(
                file,
                'muro-videos',
                'imagen',
                token
            );
            mediaUrl = resultadoImagen.url;
            mediaType = 'imagen';
        }

        // Subir video (con moderación)
        if (archivosSeleccionados.video) {
            if (window.showToast) window.showToast(perfilT('perfil_pub_subiendo_video', 'Subiendo video...'), '', 15000);
            var vfile = archivosSeleccionados.video;
            var resultadoVideo = await subirArchivoConModeracion(
                vfile,
                'muro-videos',
                'video',
                token
            );
            mediaUrl = resultadoVideo.url;
            mediaType = 'video';
        }

        // Insertar publicación
        var insertPayload = {
            usuario_id: session.user.id,
            contenido: contenido || '',
            media_url: mediaUrl,
            media_type: mediaType,
            estado: 'publicado'
        };
        var insertResult = await client.from('publicaciones').insert(insertPayload).select().single();
        if (insertResult.error) throw new Error(insertResult.error.message);

        if (window.showToast) window.showToast(perfilT('perfil_pub_creada', '¡Publicación creada!'), 'success');

        if (input) input.value = '';
        archivosSeleccionados.imagen = null;
        archivosSeleccionados.video = null;
        var i1 = document.getElementById('inputFotoPerfilPost');
        if (i1) i1.value = '';
        var i2 = document.getElementById('inputVideoPerfilPost');
        if (i2) i2.value = '';
        renderizarPreviewPerfil();

        await cargarMisPublicaciones(true);
    } catch (error) {
        console.error('Error publicando:', error);
        if (window.showToast) {
            if (esErrorModeracionPerfil(error)) {
                window.showToast('❌ Contenido no permitido por las normas de la comunidad', 'error', 6000);
            } else {
                window.showToast('❌ ' + (error.message || perfilT('perfil_error_generico', 'Error')), 'error');
            }
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginalBtn;
        }
    }
}

// ================================================================
// CARGAR MIS PUBLICACIONES
// ================================================================
async function cargarMisPublicaciones(forzarRefresco) {
    var container = document.getElementById('misPublicacionesList');
    var contador = document.getElementById('misPostsCount');
    if (!container) return;

    try {
        var client = window.supabaseClient;
        if (!client) {
            if (!forzarRefresco) {
                setTimeout(function () { cargarMisPublicaciones(true); }, 1000);
            }
            return;
        }

        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;

        if (!session) {
            if (!container._intentos) container._intentos = 0;
            container._intentos++;

            if (container._intentos <= 5) {
                if (container._intentos === 1) {
                    container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><h4>'
                        + escaparHTML(perfilT('perfil_cargando', 'Cargando...')) + '</h4></div>';
                }
                setTimeout(function () { cargarMisPublicaciones(true); }, 800);
                return;
            }

            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/></svg><h4>'
                + escaparHTML(perfilT('perfil_inicia_sesion', 'Inicia sesión')) + '</h4><p>'
                + escaparHTML(perfilT('perfil_pub_inicia_ver', 'Para ver tus publicaciones')) + '</p></div>';
            return;
        }

        container._intentos = 0;

        // La vista ya expone aviso_moderacion: se usa '*'
        var result = await client
            .from('publicaciones_publicas')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (result.error) throw result.error;
        var publicaciones = result.data || [];
        if (contador) contador.textContent = publicaciones.length;

        if (publicaciones.length === 0) {
            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/></svg><h4>'
                + escaparHTML(perfilT('perfil_sin_publicaciones', 'Sin publicaciones aún')) + '</h4><p>'
                + escaparHTML(perfilT('perfil_crea_primera', 'Publica algo para verlo aquí')) + '</p></div>';
            return;
        }
        container.innerHTML = '';

        // Reacciones del usuario
        var reaccionesUsuario = {};
        try {
            var reaccResult = await client
                .from('publicaciones_reacciones')
                .select('publicacion_id, tipo')
                .eq('usuario_id', session.user.id);
            if (!reaccResult.error && reaccResult.data) {
                reaccResult.data.forEach(function (r) { reaccionesUsuario[r.publicacion_id] = r.tipo; });
            }
        } catch (e) {}

        // Conteos de reacciones
        var conteosReacciones = {};
        try {
            var allReacc = await client.from('publicaciones_reacciones').select('publicacion_id, tipo');
            if (!allReacc.error && allReacc.data) {
                allReacc.data.forEach(function (r) {
                    if (!conteosReacciones[r.publicacion_id]) conteosReacciones[r.publicacion_id] = {};
                    conteosReacciones[r.publicacion_id][r.tipo] = (conteosReacciones[r.publicacion_id][r.tipo] || 0) + 1;
                });
            }
        } catch (e) {}

        publicaciones.forEach(function (p) {
            var nombreReal = escapeHtmlPerfil(p.usuario_nombre || perfilT('perfil_nombre_usuario', 'Explorador'));
            var handleReal = p.usuario_handle ? '@' + escapeHtmlPerfil(p.usuario_handle) : '';

            var card = document.createElement('div');
            card.className = 'publicacion-card';

            // HEADER
            var header = document.createElement('div');
            header.className = 'header';
            var avatarBox = document.createElement('div');
            avatarBox.className = 'avatar';
            avatarBox.appendChild(crearAvatar(p.usuario_nombre, p.usuario_avatar_url));
            header.appendChild(avatarBox);

            var headerMeta = document.createElement('div');
            headerMeta.innerHTML =
                '<div class="nombre" data-no-traducir="1">' + nombreReal +
                    (handleReal ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.75rem;">' + handleReal + '</span>' : '') +
                '</div>' +
                '<div class="fecha" data-no-traducir="1">' + (p.created_at ? escaparHTML(new Date(p.created_at).toLocaleString(pubCodigoIdioma())) : '') + '</div>';
            header.appendChild(headerMeta);
            card.appendChild(header);

            // Cartel amarillo si hay aviso_moderacion
            if (p.aviso_moderacion === 'lenguaje_inapropiado') {
                var avisoDiv = document.createElement('div');
                avisoDiv.innerHTML = htmlAvisoModeracionPerfil();
                card.appendChild(avisoDiv.firstChild);
            }

            // CONTENIDO
            var contenido = document.createElement('div');
            contenido.className = 'contenido';
            contenido.setAttribute('data-no-traducir', '1');
            contenido.appendChild(document.createTextNode(p.contenido || ''));
            if (esUrlSegura(p.media_url)) {
                if (p.media_type === 'video') {
                    var video = document.createElement('video');
                    video.controls = true;
                    video.preload = 'metadata';
                    video.src = p.media_url;
                    contenido.appendChild(video);
                } else if (p.media_type === 'imagen') {
                    var img = document.createElement('img');
                    img.alt = perfilT('perfil_imagen', 'Imagen');
                    img.loading = 'lazy';
                    img.style.cursor = 'pointer';
                    img.addEventListener('click', function () {
                        if (typeof window.expandirFotoPublicacion === 'function') {
                            window.expandirFotoPublicacion(img.src);
                        }
                    });
                    img.src = p.media_url;
                    contenido.appendChild(img);
                }
            }
            card.appendChild(contenido);

            // ==========================================
            // REACCIONES (Lógica Facebook)
            // ==========================================
            var reaccionUsuario = reaccionesUsuario[p.id] || null;
            var conteos = conteosReacciones[p.id] || {};
            var totalReacciones = 0;
            Object.keys(conteos).forEach(function (k) { totalReacciones += (conteos[k] || 0); });
            var emojiMostrado = reaccionUsuario || '❤️';

            var wrap = document.createElement('div');
            wrap.className = 'reaccion-wrap';
            wrap.setAttribute('data-no-traducir', '1');

            var dropdown = document.createElement('div');
            dropdown.className = 'reaccion-dropdown';
            dropdown.id = 'reaccion-dropdown-' + p.id;
            dropdown.setAttribute('data-no-traducir', '1');
            
            EMOJIS_REACCION.forEach(function (emoji) {
                var b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('data-no-traducir', '1');
                if (reaccionUsuario === emoji) b.classList.add('activa');
                b.title = perfilT('perfil_reaccionar', 'Reaccionar') + ' ' + emoji;
                b.textContent = emoji;
                
                b.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    reaccionarPublicacionPerfil(p.id, emoji);
                });
                
                var count = conteos[emoji] || 0;
                if (count > 0) {
                    var mini = document.createElement('span');
                    mini.className = 'mini-count';
                    mini.setAttribute('data-no-traducir', '1');
                    mini.textContent = count;
                    b.appendChild(mini);
                }
                dropdown.appendChild(b);
            });

            var trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.setAttribute('data-no-traducir', '1');
            trigger.className = 'reaccion-trigger' + (reaccionUsuario ? ' activa' : '');
            trigger.title = perfilT('perfil_reaccionar', 'Reaccionar');
            trigger.innerHTML =
                '<span class="emoji-actual" data-no-traducir="1">' + emojiMostrado + '</span>' +
                (totalReacciones > 0
                    ? '<span class="count" data-no-traducir="1">' + totalReacciones + '</span>'
                    : '<span class="count" data-no-traducir="1">' + escaparHTML(perfilT('perfil_reaccionar', 'Reaccionar')) + '</span>');

            // Lógica de Long Press (Toque prolongado)
            var pressTimer;
            var isLongPress = false;

            function startPress(e) {
                // Ignorar clics derechos
                if (e.type === 'mousedown' && e.button !== 0) return;
                
                isLongPress = false;
                clearTimeout(pressTimer);
                
                pressTimer = setTimeout(function () {
                    isLongPress = true;
                    toggleReaccionDropdown(p.id, true); // force show
                    if (navigator.vibrate) navigator.vibrate(50); // Vibración háptica opcional
                }, 350); // 350ms
            }

            function cancelPress(e) {
                clearTimeout(pressTimer);
                if (!isLongPress) {
                    // Fue un toque rápido
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Si ya hay una reacción, se elimina. Si no, se pone la por defecto.
                    var emojiPorDefecto = '❤️';
                    reaccionarPublicacionPerfil(p.id, reaccionUsuario || emojiPorDefecto);
                }
                isLongPress = false;
            }

            trigger.addEventListener('mousedown', startPress);
            trigger.addEventListener('touchstart', startPress, { passive: true });
            
            trigger.addEventListener('mouseup', cancelPress);
            trigger.addEventListener('mouseleave', function() { clearTimeout(pressTimer); });
            trigger.addEventListener('touchend', cancelPress);
            trigger.addEventListener('touchcancel', function() { clearTimeout(pressTimer); });

            wrap.appendChild(dropdown);
            wrap.appendChild(trigger);
            card.appendChild(wrap);

            // STATS
            var stats = document.createElement('div');
            stats.className = 'stats';
            stats.setAttribute('data-no-traducir', '1');

            var btnComentarios = document.createElement('button');
            btnComentarios.type = 'button';
            btnComentarios.className = 'btn-accion-pub';
            btnComentarios.setAttribute('data-no-traducir', '1');
            btnComentarios.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> '
                + escaparHTML(perfilT('perfil_comentarios', 'Comentarios'));
            btnComentarios.addEventListener('click', function (ev) {
                ev.stopPropagation();
                toggleComentariosPerfil(p.id);
            });

            var btnEliminar = document.createElement('button');
            btnEliminar.type = 'button';
            btnEliminar.className = 'btn-accion-pub danger';
            btnEliminar.setAttribute('data-no-traducir', '1');
            btnEliminar.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> '
                + escaparHTML(perfilT('perfil_eliminar', 'Eliminar'));
            btnEliminar.addEventListener('click', function (ev) {
                ev.stopPropagation();
                eliminarMiPublicacion(p.id, ev);
            });

            stats.appendChild(btnComentarios);
            stats.appendChild(btnEliminar);
            card.appendChild(stats);

            // COMENTARIOS
            var comentariosContainer = document.createElement('div');
            comentariosContainer.className = 'comentarios-container';
            comentariosContainer.id = 'comentarios-container-' + p.id;
            comentariosContainer.setAttribute('data-no-traducir', '1');
            comentariosContainer.innerHTML =
                '<div class="comentarios-lista" data-no-traducir="1" id="comentarios-lista-' + p.id + '"></div>' +
                '<div class="comentario-input-row" data-no-traducir="1">' +
                    '<input type="text" id="comentario-input-' + p.id + '" placeholder="' + escaparHTML(perfilT('perfil_comentario_placeholder', 'Escribe un comentario...')) + '" />' +
                    '<button type="button" data-no-traducir="1">' + escaparHTML(perfilT('perfil_enviar', 'Enviar')) + '</button>' +
                '</div>';
            comentariosContainer.querySelector('button').addEventListener('click', function () {
                enviarComentarioPerfil(p.id);
            });
            card.appendChild(comentariosContainer);

            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error cargando mis publicaciones:', error);
        container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h4>'
            + escaparHTML(perfilT('perfil_pub_error_cargar', 'Error al cargar')) + '</h4><p>' + escapeHtmlPerfil(error.message) + '</p></div>';
    }
}

// ================================================================
// TOGGLE DROPDOWN DE REACCIONES
// ================================================================
function toggleReaccionDropdown(postId, forzarApertura) {
    var dd = document.getElementById('reaccion-dropdown-' + postId);
    if (!dd) return;
    var esta = dd.classList.contains('show');
    
    // Cerrar todos los demás dropdowns abiertos
    document.querySelectorAll('.reaccion-dropdown.show').forEach(function (el) {
        el.classList.remove('show');
    });

    if (forzarApertura === true) {
        dd.classList.add('show');
    } else if (!esta) {
        dd.classList.add('show');
    }
}

// Cerrar dropdowns si se hace clic fuera
document.addEventListener('click', function(e) {
    if (!e.target.closest('.reaccion-wrap')) {
        document.querySelectorAll('.reaccion-dropdown.show').forEach(function (el) {
            el.classList.remove('show');
        });
    }
});

// ================================================================
// REACCIONAR
// ================================================================
async function reaccionarPublicacionPerfil(postId, emoji) {
    if (!EMOJIS_REACCION.includes(emoji)) return;
    try {
        var client = window.supabaseClient;
        if (!client) return;
        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) {
            if (window.showToast) window.showToast(perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        var dd = document.getElementById('reaccion-dropdown-' + postId);
        if (dd) dd.classList.remove('show');

        var existing = await client
            .from('publicaciones_reacciones')
            .select('id, tipo')
            .eq('publicacion_id', postId)
            .eq('usuario_id', session.user.id)
            .maybeSingle();

        if (existing.data && existing.data.tipo === emoji) {
            // Si hace clic en el mismo emoji, se elimina la reacción
            await client.from('publicaciones_reacciones').delete().eq('id', existing.data.id);
            if (window.showToast) {
                window.showToast(perfilT('perfil_pub_reaccion_eliminada', 'Reacción eliminada'), 'warning', 2000);
            }
        } else {
            if (existing.data) {
                // Actualizar reacción
                await client.from('publicaciones_reacciones').update({ tipo: emoji }).eq('id', existing.data.id);
            } else {
                // Insertar nueva reacción
                var insert = await client.from('publicaciones_reacciones').insert({
                    publicacion_id: postId,
                    usuario_id: session.user.id,
                    tipo: emoji
                });
                if (insert.error) throw insert.error;
            }
            if (window.showToast) {
                window.showToast(emoji + ' ' + perfilT('perfil_pub_reaccion_registrada', 'Reacción registrada'), 'success', 2000);
            }
        }
        await recargarBarraReacciones(postId);
    } catch (error) {
        console.error('Error reaccionando:', error);
    }
}

async function recargarBarraReacciones(postId) {
    try {
        var client = window.supabaseClient;
        if (!client) return;
        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) return;

        var allReacc = await client
            .from('publicaciones_reacciones')
            .select('tipo, usuario_id')
            .eq('publicacion_id', postId);
        if (allReacc.error) return;

        var conteos = {};
        var reaccionUsuario = null;
        (allReacc.data || []).forEach(function (r) {
            conteos[r.tipo] = (conteos[r.tipo] || 0) + 1;
            if (r.usuario_id === session.user.id) reaccionUsuario = r.tipo;
        });

        var dd = document.getElementById('reaccion-dropdown-' + postId);
        if (!dd) return;
        var wrap = dd.parentElement;
        if (!wrap) return;

        var total = 0;
        Object.keys(conteos).forEach(function (k) { total += conteos[k]; });
        var emojiMostrado = reaccionUsuario || '❤️';

        dd.innerHTML = '';
        EMOJIS_REACCION.forEach(function (emoji) {
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('data-no-traducir', '1');
            if (reaccionUsuario === emoji) b.classList.add('activa');
            b.title = perfilT('perfil_reaccionar', 'Reaccionar') + ' ' + emoji;
            b.textContent = emoji;
            b.addEventListener('click', function (ev) {
                ev.stopPropagation();
                reaccionarPublicacionPerfil(postId, emoji);
            });
            var count = conteos[emoji] || 0;
            if (count > 0) {
                var mini = document.createElement('span');
                mini.className = 'mini-count';
                mini.setAttribute('data-no-traducir', '1');
                mini.textContent = count;
                b.appendChild(mini);
            }
            dd.appendChild(b);
        });

        var trigger = wrap.querySelector('.reaccion-trigger');
        if (trigger) {
            trigger.className = 'reaccion-trigger' + (reaccionUsuario ? ' activa' : '');
            trigger.innerHTML =
                '<span class="emoji-actual" data-no-traducir="1">' + emojiMostrado + '</span>' +
                (total > 0
                    ? '<span class="count" data-no-traducir="1">' + total + '</span>'
                    : '<span class="count" data-no-traducir="1">' + escaparHTML(perfilT('perfil_reaccionar', 'Reaccionar')) + '</span>');
        }
    } catch (e) {}
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
    lista.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);padding:4px;">'
        + escaparHTML(perfilT('perfil_cargando', 'Cargando...')) + '</div>';

    try {
        var client = window.supabaseClient;
        if (!client) return;

        // La vista ya expone aviso_moderacion: se usa '*'
        var result = await client
            .from('publicaciones_comentarios_publicos')
            .select('*')
            .eq('publicacion_id', publicacionId)
            .order('created_at', { ascending: true });

        if (result.error) throw result.error;
        var comentarios = result.data || [];
        if (comentarios.length === 0) {
            lista.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);padding:4px;">'
                + escaparHTML(perfilT('perfil_pub_sin_comentarios', 'Sin comentarios. ¡Sé el primero!')) + '</div>';
            return;
        }
        lista.innerHTML = '';
        comentarios.forEach(function (c) {
            var item = document.createElement('div');
            item.className = 'comentario-item';

            var nombre = escapeHtmlPerfil(c.usuario_nombre || perfilT('perfil_usuario', 'Usuario'));
            var handle = c.usuario_handle ? '@' + escapeHtmlPerfil(c.usuario_handle) : '';

            var avatarMini = document.createElement('div');
            avatarMini.className = 'avatar-mini';
            avatarMini.appendChild(crearAvatar(c.usuario_nombre, c.usuario_avatar_url));
            item.appendChild(avatarMini);

            var contenidoDiv = document.createElement('div');
            contenidoDiv.className = 'contenido-comentario';

            var textoDiv = document.createElement('div');
            textoDiv.className = 'texto';
            textoDiv.textContent = c.contenido || '';
            contenidoDiv.innerHTML =
                '<div class="nombre">' + nombre +
                    (handle ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.65rem;">' + handle + '</span>' : '') +
                '</div>';
            contenidoDiv.appendChild(textoDiv);

            // Cartel amarillo si hay aviso_moderacion
            if (c.aviso_moderacion === 'lenguaje_inapropiado') {
                var avisoMini = document.createElement('div');
                avisoMini.innerHTML = htmlAvisoModeracionPerfil();
                avisoMini.style.marginTop = '4px';
                contenidoDiv.appendChild(avisoMini.firstChild);
            }

            var fechaDiv = document.createElement('div');
            fechaDiv.className = 'fecha';
            fechaDiv.textContent = c.created_at ? new Date(c.created_at).toLocaleString(pubCodigoIdioma()) : '';
            contenidoDiv.appendChild(fechaDiv);

            item.appendChild(contenidoDiv);
            lista.appendChild(item);
        });
    } catch (error) {
        console.error('Error cargando comentarios:', error);
        lista.innerHTML = '<div style="font-size:0.7rem;color:var(--danger);padding:4px;">'
            + escaparHTML(perfilT('perfil_pub_error_comentarios', 'Error al cargar comentarios')) + '</div>';
    }
}

async function enviarComentarioPerfil(publicacionId) {
    var input = document.getElementById('comentario-input-' + publicacionId);
    var texto = input ? input.value.trim() : '';
    if (!texto) return;

    try {
        var client = window.supabaseClient;
        if (!client) return;
        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) return;

        var payload = {
            publicacion_id: publicacionId,
            usuario_id: session.user.id,
            contenido: texto,
            created_at: new Date().toISOString()
        };
        var result = await client.from('publicaciones_comentarios').insert(payload);
        if (result.error) throw new Error(result.error.message);

        if (input) input.value = '';
        if (window.showToast) {
            window.showToast(perfilT('perfil_pub_comentario_ok', 'Comentario publicado'), 'success');
        }
        await cargarComentariosPerfil(publicacionId);
    } catch (error) {
        console.error('Error enviando comentario:', error);

        if (window.showToast) {
            if (esErrorModeracionPerfil(error)) {
                window.showToast('❌ Contenido no permitido por las normas de la comunidad', 'error', 6000);
            } else {
                window.showToast('Error al enviar comentario: ' + error.message, 'error');
            }
        }
    }
}

// ================================================================
// ELIMINAR PUBLICACIÓN
// ================================================================
async function eliminarMiPublicacion(publicacionId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!confirm(perfilT('perfil_pub_confirma_eliminar', '¿Seguro que quieres eliminar esta publicación?'))) return;

    try {
        var client = window.supabaseClient;
        if (!client) {
            if (window.showToast) {
                window.showToast(perfilT('perfil_supabase_no_disponible', 'Supabase no disponible'), 'error');
            }
            return;
        }

        try {
            var pubRes = await client
                .from('publicaciones')
                .select('media_url')
                .eq('id', publicacionId)
                .maybeSingle();
            if (pubRes && pubRes.data && pubRes.data.media_url) {
                var mediaUrl = pubRes.data.media_url;
                var marker = '/storage/v1/object/public/muro-videos/';
                var idx = mediaUrl.indexOf(marker);
                if (idx !== -1) {
                    var filePath = mediaUrl.substring(idx + marker.length);
                    var qIdx = filePath.indexOf('?');
                    if (qIdx !== -1) filePath = filePath.substring(0, qIdx);
                    try {
                        await client.storage.from('muro-videos').remove([filePath]);
                    } catch (storageErr) {
                        console.warn('No se pudo borrar el archivo del bucket:', storageErr);
                    }
                }
            }
        } catch (storageErr) {
            console.warn('Error obteniendo media_url:', storageErr);
        }

        var result = await client.from('publicaciones').delete().eq('id', publicacionId);
        if (result.error) throw new Error(result.error.message);

        if (window.showToast) {
            window.showToast(perfilT('perfil_pub_eliminada', 'Publicación eliminada'), 'success');
        }
        await cargarMisPublicaciones(true);
    } catch (error) {
        console.error('Error eliminando:', error);
        if (window.showToast) {
            window.showToast(perfilT('perfil_pub_error_eliminar', 'Error al eliminar:') + ' ' + error.message, 'error');
        }
    }
}