// ================================================================
// PERFIL · PUBLICACIONES
// ================================================================
// Publicar desde el perfil (texto/foto/video), listar mis posts,
// reacciones, comentarios, eliminar publicación.
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

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
        emojisDisponibles.forEach(function(emoji) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = emoji;
            btn.addEventListener('click', function(e) {
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
// SELECCIONAR ARCHIVO (foto/video para publicar)
// ================================================================
function seleccionarArchivoPerfil(event, tipo) {
    var file = event.target.files[0];
    if (!file) return;
    if (tipo === 'imagen') {
        if (file.size > 10 * 1024 * 1024) {
            if (window.showToast) window.showToast('Imagen mayor a 10 MB', 'error');
            event.target.value = '';
            return;
        }
        if (!file.type.startsWith('image/')) {
            if (window.showToast) window.showToast('Solo imágenes', 'error');
            event.target.value = '';
            return;
        }
    } else if (tipo === 'video') {
        if (file.size > 50 * 1024 * 1024) {
            if (window.showToast) window.showToast('Video mayor a 50 MB', 'error');
            event.target.value = '';
            return;
        }
        if (!file.type.startsWith('video/')) {
            if (window.showToast) window.showToast('Solo videos', 'error');
            event.target.value = '';
            return;
        }
    }
    archivosSeleccionados[tipo] = file;
    renderizarPreviewPerfil();
}

// ================================================================
// RENDERIZAR PREVIEW DE ARCHIVOS
// ================================================================
function renderizarPreviewPerfil() {
    var container = document.getElementById('previewArchivosPerfil');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(archivosSeleccionados).forEach(function(tipo) {
        var file = archivosSeleccionados[tipo];
        if (!file) return;
        var wrapper = document.createElement('div');
        wrapper.className = 'preview-item';
        var reader = new FileReader();
        reader.onload = function(e) {
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
// PUBLICAR DESDE EL PERFIL
// ================================================================
async function publicarDesdePerfil() {
    var btn = document.getElementById('btnPublicarPerfil');
    var input = document.getElementById('inputNuevaPublicacion');
    var contenido = input ? input.value.trim() : '';

    if (!contenido && !archivosSeleccionados.imagen && !archivosSeleccionados.video) {
        if (window.showToast) window.showToast('Escribe algo o sube una foto/video', 'warning');
        return;
    }

    var textoOriginalBtn = btn ? btn.innerHTML : 'Publicar';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Publicando...';
    }

    try {
        var client = window.supabaseClient;
        if (!client) throw new Error('Supabase no está listo. Recarga la página.');

        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) {
            if (window.showToast) window.showToast('Inicia sesión', 'error');
            return;
        }

        var mediaUrl = null;
        var mediaType = null;

        // Subir imagen si hay
        if (archivosSeleccionados.imagen) {
            if (window.showToast) window.showToast('Subiendo imagen...', '', 5000);
            var file = archivosSeleccionados.imagen;
            var ext = file.name.split('.').pop().toLowerCase();
            var filePath = session.user.id + '/post_' + Date.now() + '.' + ext;
            var uploadResult = await client.storage
                .from('muro-videos')
                .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
            if (uploadResult.error) throw new Error('Error subiendo imagen: ' + uploadResult.error.message);
            var urlData = client.storage.from('muro-videos').getPublicUrl(filePath);
            mediaUrl = urlData.data.publicUrl;
            mediaType = 'imagen';
        }

        // Subir video si hay
        if (archivosSeleccionados.video) {
            if (window.showToast) window.showToast('Subiendo video...', '', 15000);
            var vfile = archivosSeleccionados.video;
            var vext = vfile.name.split('.').pop().toLowerCase();
            var vfilePath = session.user.id + '/video_' + Date.now() + '.' + vext;
            var vuploadResult = await client.storage
                .from('muro-videos')
                .upload(vfilePath, vfile, { cacheControl: '3600', upsert: false, contentType: vfile.type });
            if (vuploadResult.error) throw new Error('Error subiendo video: ' + vuploadResult.error.message);
            var vurlData = client.storage.from('muro-videos').getPublicUrl(vfilePath);
            mediaUrl = vurlData.data.publicUrl;
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

        if (window.showToast) window.showToast('¡Publicación creada!', 'success');

        // Limpiar
        if (input) input.value = '';
        archivosSeleccionados.imagen = null;
        archivosSeleccionados.video = null;
        var i1 = document.getElementById('inputFotoPerfilPost');
        if (i1) i1.value = '';
        var i2 = document.getElementById('inputVideoPerfilPost');
        if (i2) i2.value = '';
        renderizarPreviewPerfil();

        await cargarMisPublicaciones();
    } catch (error) {
        console.error('Error publicando:', error);
        if (window.showToast) window.showToast('Error: ' + error.message, 'error');
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
async function cargarMisPublicaciones() {
    var container = document.getElementById('misPublicacionesList');
    var contador = document.getElementById('misPostsCount');
    if (!container) return;

    try {
        var client = window.supabaseClient;
        if (!client) {
            setTimeout(cargarMisPublicaciones, 1000);
            return;
        }
        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) {
            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/></svg><h4>Inicia sesión</h4><p>Para ver tus publicaciones</p></div>';
            return;
        }

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
            container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/></svg><h4>Sin publicaciones aún</h4><p>Publica algo para verlo aquí</p></div>';
            return;
        }
        container.innerHTML = '';

        // Cargar reacciones del usuario
        var reaccionesUsuario = {};
        try {
            var reaccResult = await client
                .from('publicaciones_reacciones')
                .select('publicacion_id, tipo')
                .eq('usuario_id', session.user.id);
            if (!reaccResult.error && reaccResult.data) {
                reaccResult.data.forEach(function(r) { reaccionesUsuario[r.publicacion_id] = r.tipo; });
            }
        } catch (e) {}

        // Cargar conteo de reacciones por post
        var conteosReacciones = {};
        try {
            var allReacc = await client.from('publicaciones_reacciones').select('publicacion_id, tipo');
            if (!allReacc.error && allReacc.data) {
                allReacc.data.forEach(function(r) {
                    if (!conteosReacciones[r.publicacion_id]) conteosReacciones[r.publicacion_id] = {};
                    conteosReacciones[r.publicacion_id][r.tipo] = (conteosReacciones[r.publicacion_id][r.tipo] || 0) + 1;
                });
            }
        } catch (e) {}

        publicaciones.forEach(function(p) {
            var nombreReal = escapeHtmlPerfil(p.usuario_nombre || 'Explorador');
            var handleReal = p.usuario_handle ? '@' + escapeHtmlPerfil(p.usuario_handle) : '';

            var card = document.createElement('div');
            card.className = 'publicacion-card';

            // ---- HEADER ----
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
                '<div class="fecha" data-no-traducir="1">' + (p.created_at ? new Date(p.created_at).toLocaleString() : '') + '</div>';
            header.appendChild(headerMeta);
            card.appendChild(header);

            // ---- CONTENIDO ----
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
                    img.alt = 'Imagen';
                    img.loading = 'lazy';
                    img.style.cursor = 'pointer';
                    img.addEventListener('click', function() {
                        if (typeof window.expandirFotoPublicacion === 'function') {
                            window.expandirFotoPublicacion(img.src);
                        }
                    });
                    img.src = p.media_url;
                    contenido.appendChild(img);
                }
            }
            card.appendChild(contenido);

            // ---- REACCIONES ----
            var reaccionUsuario = reaccionesUsuario[p.id] || null;
            var conteos = conteosReacciones[p.id] || {};
            var totalReacciones = 0;
            Object.keys(conteos).forEach(function(k) { totalReacciones += (conteos[k] || 0); });
            var emojiMostrado = reaccionUsuario || '❤️';

            var wrap = document.createElement('div');
            wrap.className = 'reaccion-wrap';
            wrap.setAttribute('data-no-traducir', '1');

            var dropdown = document.createElement('div');
            dropdown.className = 'reaccion-dropdown';
            dropdown.id = 'reaccion-dropdown-' + p.id;
            dropdown.setAttribute('data-no-traducir', '1');
            EMOJIS_REACCION.forEach(function(emoji) {
                var b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('data-no-traducir', '1');
                if (reaccionUsuario === emoji) b.classList.add('activa');
                b.title = 'Reaccionar ' + emoji;
                b.textContent = emoji;
                b.addEventListener('click', function(ev) {
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
            trigger.title = 'Reaccionar';
            trigger.innerHTML =
                '<span class="emoji-actual" data-no-traducir="1">' + emojiMostrado + '</span>' +
                (totalReacciones > 0
                    ? '<span class="count" data-no-traducir="1">' + totalReacciones + '</span>'
                    : '<span class="count" data-no-traducir="1">Reaccionar</span>');
            trigger.addEventListener('click', function(ev) {
                ev.stopPropagation();
                toggleReaccionDropdown(p.id);
            });

            wrap.appendChild(dropdown);
            wrap.appendChild(trigger);
            card.appendChild(wrap);

            // ---- STATS ----
            var stats = document.createElement('div');
            stats.className = 'stats';
            stats.setAttribute('data-no-traducir', '1');

            var btnComentarios = document.createElement('button');
            btnComentarios.type = 'button';
            btnComentarios.className = 'btn-accion-pub';
            btnComentarios.setAttribute('data-no-traducir', '1');
            btnComentarios.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Comentarios';
            btnComentarios.addEventListener('click', function(ev) {
                ev.stopPropagation();
                toggleComentariosPerfil(p.id);
            });

            var btnEliminar = document.createElement('button');
            btnEliminar.type = 'button';
            btnEliminar.className = 'btn-accion-pub danger';
            btnEliminar.setAttribute('data-no-traducir', '1');
            btnEliminar.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> Eliminar';
            btnEliminar.addEventListener('click', function(ev) {
                ev.stopPropagation();
                eliminarMiPublicacion(p.id, ev);
            });

            stats.appendChild(btnComentarios);
            stats.appendChild(btnEliminar);
            card.appendChild(stats);

            // ---- COMENTARIOS (contenedor oculto) ----
            var comentariosContainer = document.createElement('div');
            comentariosContainer.className = 'comentarios-container';
            comentariosContainer.id = 'comentarios-container-' + p.id;
            comentariosContainer.setAttribute('data-no-traducir', '1');
            comentariosContainer.innerHTML =
                '<div class="comentarios-lista" data-no-traducir="1" id="comentarios-lista-' + p.id + '"></div>' +
                '<div class="comentario-input-row" data-no-traducir="1">' +
                    '<input type="text" id="comentario-input-' + p.id + '" placeholder="Escribe un comentario..." />' +
                    '<button type="button" data-no-traducir="1">Enviar</button>' +
                '</div>';
            comentariosContainer.querySelector('button').addEventListener('click', function() {
                enviarComentarioPerfil(p.id);
            });
            card.appendChild(comentariosContainer);

            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error cargando mis publicaciones:', error);
        container.innerHTML = '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h4>Error al cargar</h4><p>' + escapeHtmlPerfil(error.message) + '</p></div>';
    }
}

// ================================================================
// TOGGLE DROPDOWN DE REACCIONES
// ================================================================
function toggleReaccionDropdown(postId) {
    var dd = document.getElementById('reaccion-dropdown-' + postId);
    if (!dd) return;
    var esta = dd.classList.contains('show');
    document.querySelectorAll('.reaccion-dropdown.show').forEach(function(el) {
        el.classList.remove('show');
    });
    if (!esta) dd.classList.add('show');
}

// ================================================================
// REACCIONAR A UNA PUBLICACIÓN
// ================================================================
async function reaccionarPublicacionPerfil(postId, emoji) {
    if (!EMOJIS_REACCION.includes(emoji)) return;
    try {
        var client = window.supabaseClient;
        if (!client) return;
        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) {
            if (window.showToast) window.showToast('Inicia sesión', 'error');
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
            await client.from('publicaciones_reacciones').delete().eq('id', existing.data.id);
            if (window.showToast) window.showToast('Reacción eliminada', 'warning', 2000);
        } else {
            if (existing.data) {
                await client.from('publicaciones_reacciones').update({ tipo: emoji }).eq('id', existing.data.id);
            } else {
                var insert = await client.from('publicaciones_reacciones').insert({
                    publicacion_id: postId,
                    usuario_id: session.user.id,
                    tipo: emoji
                });
                if (insert.error) throw insert.error;
            }
            if (window.showToast) window.showToast(emoji + ' Reacción registrada', 'success', 2000);
        }
        await recargarBarraReacciones(postId);
    } catch (error) {
        console.error('Error reaccionando:', error);
    }
}

// ================================================================
// RECARGAR BARRA DE REACCIONES
// ================================================================
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
        (allReacc.data || []).forEach(function(r) {
            conteos[r.tipo] = (conteos[r.tipo] || 0) + 1;
            if (r.usuario_id === session.user.id) reaccionUsuario = r.tipo;
        });

        var dd = document.getElementById('reaccion-dropdown-' + postId);
        if (!dd) return;
        var wrap = dd.parentElement;
        if (!wrap) return;

        var total = 0;
        Object.keys(conteos).forEach(function(k) { total += conteos[k]; });
        var emojiMostrado = reaccionUsuario || '❤️';

        dd.innerHTML = '';
        EMOJIS_REACCION.forEach(function(emoji) {
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('data-no-traducir', '1');
            if (reaccionUsuario === emoji) b.classList.add('activa');
            b.title = 'Reaccionar ' + emoji;
            b.textContent = emoji;
            b.addEventListener('click', function(ev) {
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
                    : '<span class="count" data-no-traducir="1">Reaccionar</span>');
        }
    } catch (e) {}
}

// ================================================================
// TOGGLE COMENTARIOS
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

// ================================================================
// CARGAR COMENTARIOS
// ================================================================
async function cargarComentariosPerfil(publicacionId) {
    var lista = document.getElementById('comentarios-lista-' + publicacionId);
    if (!lista) return;
    lista.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);padding:4px;">Cargando...</div>';

    try {
        var client = window.supabaseClient;
        if (!client) return;
        var result = await client
            .from('publicaciones_comentarios_publicos')
            .select('*')
            .eq('publicacion_id', publicacionId)
            .order('created_at', { ascending: true });

        if (result.error) throw result.error;
        var comentarios = result.data || [];
        if (comentarios.length === 0) {
            lista.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);padding:4px;">Sin comentarios. ¡Sé el primero!</div>';
            return;
        }
        lista.innerHTML = '';
        comentarios.forEach(function(c) {
            var item = document.createElement('div');
            item.className = 'comentario-item';

            var nombre = escapeHtmlPerfil(c.usuario_nombre || 'Usuario');
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

            var fechaDiv = document.createElement('div');
            fechaDiv.className = 'fecha';
            fechaDiv.textContent = c.created_at ? new Date(c.created_at).toLocaleString() : '';
            contenidoDiv.appendChild(fechaDiv);

            item.appendChild(contenidoDiv);
            lista.appendChild(item);
        });
    } catch (error) {
        console.error('Error cargando comentarios:', error);
        lista.innerHTML = '<div style="font-size:0.7rem;color:var(--danger);padding:4px;">Error al cargar comentarios</div>';
    }
}

// ================================================================
// ENVIAR COMENTARIO
// ================================================================
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
        if (window.showToast) window.showToast('Comentario publicado', 'success');
        await cargarComentariosPerfil(publicacionId);
    } catch (error) {
        console.error('Error enviando comentario:', error);
    }
}

// ================================================================
// ELIMINAR MI PUBLICACIÓN (con borrado de media en Storage)
// ================================================================
async function eliminarMiPublicacion(publicacionId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    var confirmMsg = '¿Seguro que quieres eliminar esta publicación?';
    if (!confirm(confirmMsg)) return;

    try {
        var client = window.supabaseClient;
        if (!client) {
            if (window.showToast) window.showToast('Supabase no disponible', 'error');
            return;
        }

        // Intentar borrar media del storage
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

        if (window.showToast) window.showToast('Publicación eliminada', 'success');
        await cargarMisPublicaciones();
    } catch (error) {
        console.error('Error eliminando:', error);
        if (window.showToast) window.showToast('Error al eliminar: ' + error.message, 'error');
    }
}