// ================================================================
// PERFIL · PUBLICACIONES
// v5.2 (Re-auditoría y correcciones quirúrgicas)
// - Conserva los fixes R1, R2, R3, M5, M7 y M2 de v5.1.
// - P1: comentario en forEach síncrono.
// - P2: refresco optimista de reacciones con consulta mínima.
// - P3: propagación de error.code en 3 funciones.
// - P4: aviso de moderación sin estilos inline.
// - P5: preview sin onclick inline.
// - M1: hoja de estilos mediante createTextNode.
// - M2: reset de isLongPress en pointerleave/pointercancel.
// - M3: avatar-placeholder como clase CSS.
// ================================================================

// ================================================================
// 1. BLINDAJE DE DEPENDENCIAS FANTASMA
// ================================================================
if (typeof window.EMOJIS_REACCION === 'undefined') {
    window.EMOJIS_REACCION = ['❤️', '👍', '🔥', '🥰', '😂', '😮', '😢'];
}
if (typeof window.emojisDisponibles === 'undefined') {
    window.emojisDisponibles = ['😀','😂','🥰','😎','🤔','😴','🤯','🥳','😭','😡','👍','👎','🙏','👏','💪','🔥','✨','⭐','🎉','❤️','💔','💯'];
}
if (typeof window.archivosSeleccionados === 'undefined') {
    window.archivosSeleccionados = { imagen: null, video: null };
}
var archivosSeleccionados = window.archivosSeleccionados;

// Fallbacks de funciones (Usando function clásica para hoisting)
function _safe(fn, fallback) {
    return typeof fn === 'function' ? fn : fallback;
}
var escapeHtmlPerfil = _safe(window.escapeHtmlPerfil, function(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
});
var escaparHTML = _safe(window.escaparHTML, escapeHtmlPerfil);
var esUrlSegura = _safe(window.esUrlSegura, function(u) {
    return typeof u === 'string' && /^https?:\/\//i.test(u);
});
var crearAvatar = _safe(window.crearAvatar, function(nombre) {
    // FIX M3: La apariencia del avatar se define mediante una clase CSS.
    var d = document.createElement('div');
    d.className = 'avatar-placeholder';
    d.textContent = (nombre || '?').trim().charAt(0).toUpperCase();
    return d;
});
var perfilT = _safe(window.perfilT, function(k, def) {
    return def || k;
});

// Cache de idioma
var _localeCache = null;
function pubCodigoIdioma() {
    if (_localeCache) return _localeCache;
    try {
        if (typeof window.obtenerCodigoIdiomaActual === 'function') {
            return (_localeCache = window.obtenerCodigoIdiomaActual());
        }
    } catch (e) {}
    return (_localeCache = 'es-MX');
}

// Token de versión para evitar Races (M5)
var _renderVersion = 0;

// Variable global para el visor
window.listaMultimediaPerfil = [];

// ================================================================
// 2. INYECCIÓN DE ESTILOS CSS
// ================================================================
(function inyectarEstilosReaccionesPerfil() {
    if (document.getElementById('perfil-reacciones-fb-styles')) return;

    var style = document.createElement('style');
    style.id = 'perfil-reacciones-fb-styles';

    // FIX M1: Insertar CSS como texto sin interpretarlo como HTML.
    style.appendChild(document.createTextNode(`
        .reaccion-wrap { position: relative; display: inline-block; margin-top: 10px; }
        .reaccion-dropdown {
            position: absolute; bottom: 100%; left: 0; margin-bottom: 8px;
            display: flex; flex-direction: row; align-items: center; gap: 4px;
            padding: 6px 10px; background: rgba(20, 20, 20, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 30px;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            opacity: 0; visibility: hidden; transform: translateY(10px) scale(0.9);
            transform-origin: bottom left; transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            z-index: 100; pointer-events: auto;
        }
        .reaccion-dropdown.show { opacity: 1; visibility: visible; transform: translateY(0) scale(1); animation: popupEmojiBar 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes popupEmojiBar { 0% { transform: translateY(10px) scale(0.8); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
        .reaccion-dropdown button { background: transparent; border: none; font-size: 1.6rem; cursor: pointer; padding: 0; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: transform 0.15s, background 0.15s; position: relative; }
        .reaccion-dropdown button:hover, .reaccion-dropdown button:active { transform: scale(1.4) translateY(-6px); background: rgba(255, 255, 255, 0.1); z-index: 2; }
        .reaccion-dropdown button .mini-count { position: absolute; bottom: -4px; right: -4px; background: #3b82f6; color: white; font-size: 0.55rem; font-weight: bold; padding: 1px 4px; border-radius: 10px; line-height: 1; opacity: 0; transition: opacity 0.15s; }
        .reaccion-dropdown button:hover .mini-count { opacity: 1; }

        .reaccion-trigger { background: transparent; border: none; color: var(--text-muted, #a1a1aa); font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: background 0.2s, color 0.2s; user-select: none; touch-action: manipulation; }
        .reaccion-trigger:hover { background: rgba(255, 255, 255, 0.05); }
        .reaccion-trigger.activa { color: #3b82f6; }
        .reaccion-trigger .emoji-actual { font-size: 1.1rem; line-height: 1; }
        .reaccion-trigger .count { font-size: 0.75rem; font-weight: 500; }

        .preview-download-control { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; font-size: 0.8rem; color: var(--text-muted, #a1a1aa); cursor: pointer; }
        .preview-download-control input { cursor: pointer; width: 16px; height: 16px; accent-color: #3b82f6; }

        .publicacion-card .contenido { display: flex; flex-direction: column; gap: 10px; align-items: center; }
        .publicacion-card .contenido img,
        .publicacion-card .contenido video { width: 100%; height: auto; max-height: 600px; object-fit: contain; background: transparent; border-radius: 12px; display: block; }

        /* Botón de expandir video (R2) */
        .media-wrapper { position: relative; width: 100%; display: flex; justify-content: center; }
        .btn-expandir-media {
            position: absolute; top: 8px; right: 8px; z-index: 2;
            background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 6px;
            padding: 6px 10px; cursor: pointer; font-size: 1rem; transition: background 0.2s;
        }
        .btn-expandir-media:hover { background: rgba(0,0,0,0.9); }

        /* FIX P4: Aviso de moderación sin estilos inline. */
        .perfil-aviso-moderacion {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            margin: 8px 0;
            border-radius: 10px;
            background: rgba(247,212,74,0.12);
            border: 1px solid rgba(247,212,74,0.4);
            color: #f7d44a;
            font-size: 0.72rem;
        }
        .perfil-aviso-icono { font-size: 1rem; }

        /* FIX M3: Estilos del avatar de respaldo en CSS. */
        .avatar-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #3b82f6;
            color: #fff;
            border-radius: 50%;
            font-weight: 600;
            width: 100%;
            height: 100%;
        }
    `));

    document.head.appendChild(style);
})();

// ================================================================
// 3. HELPERS Y UTILIDADES
// ================================================================
function esErrorModeracionPerfil(error) {
    if (!error) return false;
    var msg = String(error.message || '') + ' ' + String(error.code || '');
    return msg.indexOf('contenido_no_permitido') !== -1;
}

function htmlAvisoModeracionPerfil() {
    // FIX P4: La presentación se controla desde la hoja CSS.
    return '<div class="perfil-aviso-moderacion" data-no-traducir="1"><span class="perfil-aviso-icono">⚠️</span><span>Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.</span></div>';
}

async function subirArchivoConModeracion(archivo, destino, tipo, token) {
    const fd = new FormData();
    fd.append('file', archivo);
    fd.append('destino', destino);
    fd.append('tipo', tipo);

    const respuesta = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: fd
    });

    let data = null;
    try {
        data = await respuesta.json();
    } catch (e) {
        data = {};
    }

    if (!respuesta.ok || !data.ok) {
        // FIX P3: Preservar el código de moderación del servidor.
        const error = new Error(data && data.error ? data.error : 'No se pudo subir el archivo');
        error.status = respuesta.status;
        if (data && data.code) error.code = data.code;
        throw error;
    }

    return data;
}

async function descargarArchivoForzado(url, nombreOriginal) {
    try {
        if (window.showToast) window.showToast('Preparando descarga...', 'info', 2000);

        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al descargar el archivo');

        const blob = await response.blob();
        let extension = '';

        if (nombreOriginal && nombreOriginal.includes('.')) {
            extension = nombreOriginal.split('.').pop().split('?')[0];
        } else if (blob.type) {
            const mimeMap = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'video/mp4': 'mp4',
                'video/webm': 'webm'
            };
            extension = mimeMap[blob.type] || 'file';
        }

        const nombreDescarga = `descarga_${Date.now()}.${extension}`;
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = nombreDescarga;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(function() {
            URL.revokeObjectURL(blobUrl);
        }, 1000);

        if (window.showToast) window.showToast('✅ Descarga completada', 'success', 2000);
    } catch (error) {
        console.error('Error descargando:', error);
        if (window.showToast) window.showToast('❌ Error al descargar el archivo', 'error');
    }
}

// ================================================================
// 4. EMOJI PICKER Y HASHTAG
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
        window.emojisDisponibles.forEach(function(emoji) {
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
// 5. SELECCIONAR ARCHIVO Y PREVIEW
// ================================================================
function seleccionarArchivoPerfil(event, tipo) {
    var file = event.target.files[0];
    if (!file) return;

    if (tipo === 'imagen') {
        if (file.size > 5 * 1024 * 1024) {
            if (window.showToast) window.showToast('Imagen mayor a 5 MB', 'error');
            event.target.value = '';
            return;
        }
        if (!file.type.startsWith('image/')) {
            if (window.showToast) window.showToast('Solo imágenes', 'error');
            event.target.value = '';
            return;
        }
    } else if (tipo === 'video') {
        if (file.size > 100 * 1024 * 1024) {
            if (window.showToast) window.showToast('Video mayor a 100 MB', 'error');
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

function renderizarPreviewPerfil() {
    var container = document.getElementById('previewArchivosPerfil');
    if (!container) return;

    container.innerHTML = '';

    Object.keys(archivosSeleccionados).forEach(function(tipo) {
        var file = archivosSeleccionados[tipo];
        if (!file) return;

        var wrapper = document.createElement('div');
        wrapper.className = 'preview-item';
        wrapper.style.position = 'relative';

        var reader = new FileReader();

        reader.onload = function(e) {
            // FIX P5: Crear los nodos del preview sin onclick inline.
            var mediaPreview;

            if (tipo === 'imagen') {
                mediaPreview = document.createElement('img');
                mediaPreview.src = e.target.result;
                mediaPreview.alt = 'preview';
            } else if (tipo === 'video') {
                mediaPreview = document.createElement('video');
                mediaPreview.src = e.target.result;
                mediaPreview.muted = true;
            } else {
                return;
            }

            var btnQuitar = document.createElement('button');
            btnQuitar.type = 'button';
            btnQuitar.className = 'remove-btn';
            btnQuitar.textContent = '×';
            btnQuitar.addEventListener('click', function() {
                quitarArchivoPerfil(tipo);
            });

            wrapper.appendChild(mediaPreview);
            wrapper.appendChild(btnQuitar);
        };

        reader.readAsDataURL(file);
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
        label.style.cursor = 'pointer';

        controlDiv.appendChild(checkbox);
        controlDiv.appendChild(label);
        container.appendChild(controlDiv);
    }
}

function quitarArchivoPerfil(tipo) {
    archivosSeleccionados[tipo] = null;

    var inputId = tipo === 'imagen' ? 'inputFotoPerfilPost' : 'inputVideoPerfilPost';
    var input = document.getElementById(inputId);
    if (input) input.value = '';

    renderizarPreviewPerfil();
}

// ================================================================
// 6. PUBLICAR DESDE EL PERFIL
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
        if (!client) throw new Error('Supabase no está listo.');

        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;

        if (!session) {
            if (window.showToast) window.showToast('Inicia sesión', 'error');
            return;
        }

        var token = session.access_token;
        var mediaUrl = null;
        var mediaType = null;

        var chkDescarga = document.getElementById('chkPermitirDescarga');
        var permitirDescarga = chkDescarga ? chkDescarga.checked : true;

        if (archivosSeleccionados.imagen) {
            if (window.showToast) window.showToast('Subiendo imagen...', '', 5000);
            var resImg = await subirArchivoConModeracion(archivosSeleccionados.imagen, 'muro-videos', 'imagen', token);
            mediaUrl = resImg.url;
            mediaType = 'imagen';
        }

        if (archivosSeleccionados.video) {
            if (window.showToast) window.showToast('Subiendo video...', '', 15000);
            var resVid = await subirArchivoConModeracion(archivosSeleccionados.video, 'muro-videos', 'video', token);
            mediaUrl = resVid.url;
            mediaType = 'video';
        }

        var insertPayload = {
            usuario_id: session.user.id,
            contenido: contenido || null,
            media_url: mediaUrl,
            media_type: mediaType,
            estado: 'publicado',
            permitir_descarga: permitirDescarga
        };

        var insertResult = await client.from('publicaciones').insert(insertPayload).select().single();

        // FIX P3: Preservar el código original de error de Supabase.
        if (insertResult.error) {
            var errorPublicacion = new Error(insertResult.error.message);
            errorPublicacion.code = insertResult.error.code;
            throw errorPublicacion;
        }

        if (window.showToast) window.showToast('¡Publicación creada!', 'success');

        if (input) input.value = '';
        archivosSeleccionados.imagen = null;
        archivosSeleccionados.video = null;

        document.getElementById('inputFotoPerfilPost').value = '';
        document.getElementById('inputVideoPerfilPost').value = '';

        renderizarPreviewPerfil();
        await cargarMisPublicaciones(true);
    } catch (error) {
        console.error('Error publicando:', error);
        if (window.showToast) {
            window.showToast(
                esErrorModeracionPerfil(error) ? '❌ Contenido no permitido' : '❌ ' + error.message,
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
// 7. CARGAR MIS PUBLICACIONES
// ================================================================
async function cargarMisPublicaciones(forzarRefresco) {
    var container = document.getElementById('misPublicacionesList');
    var contador = document.getElementById('misPostsCount');
    if (!container) return;

    var myVersion = ++_renderVersion;

    try {
        var client = window.supabaseClient;

        if (!client) {
            if (forzarRefresco === undefined) {
                setTimeout(function() {
                    cargarMisPublicaciones(true);
                }, 1000);
            }
            return;
        }

        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;

        if (!session) {
            container.innerHTML = '<div class="empty-state"><h4>Inicia sesión</h4></div>';
            return;
        }

        var result = await client.from('publicaciones_publicas')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (myVersion !== _renderVersion) return;
        if (result.error) throw result.error;

        var publicaciones = result.data || [];
        if (contador) contador.textContent = publicaciones.length;

        if (publicaciones.length === 0) {
            container.innerHTML = '<div class="empty-state"><h4>Sin publicaciones aún</h4><p>Publica algo para verlo aquí</p></div>';
            return;
        }

        container.innerHTML = '';
        window.listaMultimediaPerfil = [];

        var reaccionesUsuario = {};
        var conteosReacciones = {};

        try {
            var ids = publicaciones.map(function(p) {
                return p.id;
            });

            if (ids.length) {
                var reaccResult = await client.from('publicaciones_reacciones')
                    .select('publicacion_id, tipo, usuario_id')
                    .in('publicacion_id', ids);

                if (myVersion !== _renderVersion) return;

                if (!reaccResult.error && reaccResult.data) {
                    reaccResult.data.forEach(function(r) {
                        if (!conteosReacciones[r.publicacion_id]) {
                            conteosReacciones[r.publicacion_id] = {};
                        }

                        conteosReacciones[r.publicacion_id][r.tipo] =
                            (conteosReacciones[r.publicacion_id][r.tipo] || 0) + 1;

                        if (r.usuario_id === session.user.id) {
                            reaccionesUsuario[r.publicacion_id] = r.tipo;
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('[perfil-publicaciones] reacciones:', e);
        }

        // FIX P1: Este forEach es síncrono; las consultas asíncronas previas ya se esperaron.
        publicaciones.forEach(function(p) {
            var nombreReal = escapeHtmlPerfil(p.usuario_nombre || 'Explorador');
            var handleReal = p.usuario_handle ? '@' + escapeHtmlPerfil(p.usuario_handle) : '';

            var card = document.createElement('div');
            card.className = 'publicacion-card';
            card.dataset.id = p.id;

            var header = document.createElement('div');
            header.className = 'header';

            var avatarBox = document.createElement('div');
            avatarBox.className = 'avatar';
            avatarBox.appendChild(crearAvatar(p.usuario_nombre, p.usuario_avatar_url));
            header.appendChild(avatarBox);

            var headerMeta = document.createElement('div');
            headerMeta.innerHTML =
                '<div class="nombre" data-no-traducir="1">' +
                nombreReal +
                (handleReal ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.75rem;">' + handleReal + '</span>' : '') +
                '</div>' +
                '<div class="fecha" data-no-traducir="1">' +
                (p.created_at ? escaparHTML(new Date(p.created_at).toLocaleString(pubCodigoIdioma())) : '') +
                '</div>';

            header.appendChild(headerMeta);
            card.appendChild(header);

            if (p.aviso_moderacion === 'lenguaje_inapropiado') {
                var avisoDiv = document.createElement('div');
                avisoDiv.innerHTML = htmlAvisoModeracionPerfil();
                card.appendChild(avisoDiv.firstChild);
            }

            var contenido = document.createElement('div');
            contenido.className = 'contenido';
            contenido.setAttribute('data-no-traducir', '1');
            contenido.appendChild(document.createTextNode(p.contenido || ''));

            if (esUrlSegura(p.media_url)) {
                var permiteDescarga = p.permitir_descarga !== false;

                if (p.media_type === 'video' || p.media_type === 'imagen') {
                    var indexEnLista = window.listaMultimediaPerfil.length;

                    window.listaMultimediaPerfil.push({
                        url: p.media_url,
                        tipo: p.media_type,
                        permiteDescarga: permiteDescarga
                    });

                    if (p.media_type === 'video') {
                        var mediaWrap = document.createElement('div');
                        mediaWrap.className = 'media-wrapper';

                        var video = document.createElement('video');
                        video.controls = true;
                        video.preload = 'metadata';
                        video.src = p.media_url;

                        const autoPlayPrefInicial = localStorage.getItem('contenido_auto_reproducir');
                        if (autoPlayPrefInicial !== 'false') {
                            video.muted = true;
                        }

                        // FIX R2: Botón overlay en lugar de dblclick.
                        var btnExpand = document.createElement('button');
                        btnExpand.type = 'button';
                        btnExpand.className = 'btn-expandir-media';
                        btnExpand.innerHTML = '⛶';
                        btnExpand.title = 'Ver en pantalla completa';

                        btnExpand.addEventListener('click', function(e) {
                            e.stopPropagation();
                            e.preventDefault();

                            if (typeof window.expandirFotoPublicacion === 'function') {
                                window.expandirFotoPublicacion(indexEnLista);
                            }
                        });

                        mediaWrap.appendChild(video);
                        mediaWrap.appendChild(btnExpand);
                        contenido.appendChild(mediaWrap);
                    } else if (p.media_type === 'imagen') {
                        var mediaWrapImg = document.createElement('div');
                        mediaWrapImg.className = 'media-wrapper';

                        var img = document.createElement('img');
                        img.alt = perfilT('perfil_imagen', 'Imagen');
                        img.loading = 'lazy';
                        img.style.cursor = 'pointer';

                        img.addEventListener('click', function() {
                            if (typeof window.expandirFotoPublicacion === 'function') {
                                window.expandirFotoPublicacion(indexEnLista);
                            }
                        });

                        img.src = p.media_url;
                        mediaWrapImg.appendChild(img);
                        contenido.appendChild(mediaWrapImg);
                    }
                }
            }

            card.appendChild(contenido);

            var reaccionUsuario = reaccionesUsuario[p.id] || null;
            var conteos = conteosReacciones[p.id] || {};
            var totalReacciones = 0;

            Object.keys(conteos).forEach(function(k) {
                totalReacciones += (conteos[k] || 0);
            });

            var emojiDominante = Object.keys(conteos).sort(function(a, b) {
                return conteos[b] - conteos[a];
            })[0];

            var emojiMostrado = reaccionUsuario || emojiDominante || '❤️';

            var wrap = document.createElement('div');
            wrap.className = 'reaccion-wrap';
            wrap.setAttribute('data-no-traducir', '1');

            var dropdown = document.createElement('div');
            dropdown.className = 'reaccion-dropdown';
            dropdown.id = 'reaccion-dropdown-' + p.id;
            dropdown.setAttribute('data-no-traducir', '1');

            window.EMOJIS_REACCION.forEach(function(emoji) {
                var b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('data-no-traducir', '1');

                if (reaccionUsuario === emoji) b.classList.add('activa');

                b.title = 'Reaccionar ' + emoji;
                b.textContent = emoji;
                b.dataset.emoji = emoji;

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

            trigger.innerHTML =
                '<span class="emoji-actual" data-no-traducir="1">' + emojiMostrado + '</span>' +
                (totalReacciones > 0
                    ? '<span class="count" data-no-traducir="1">' + totalReacciones + '</span>'
                    : '<span class="count" data-no-traducir="1">Reaccionar</span>');

            // FIX R3: Pointer Events para evitar el doble disparo en móvil.
            var pressTimer;
            var isLongPress = false;

            function startPress(e) {
                isLongPress = false;
                clearTimeout(pressTimer);

                pressTimer = setTimeout(function() {
                    isLongPress = true;
                    toggleReaccionDropdown(p.id, true);
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 350);
            }

            function cancelPress(e) {
                clearTimeout(pressTimer);

                if (!isLongPress && !dropdown.classList.contains('show')) {
                    reaccionarPublicacionPerfil(p.id, reaccionUsuario || '❤️');
                }

                isLongPress = false;
            }

            trigger.addEventListener('pointerdown', startPress);
            trigger.addEventListener('pointerup', cancelPress);

            // FIX M2: Restablecer el estado cuando se abandona o cancela el puntero.
            trigger.addEventListener('pointerleave', function() {
                clearTimeout(pressTimer);
                isLongPress = false;
            });

            trigger.addEventListener('pointercancel', function() {
                clearTimeout(pressTimer);
                isLongPress = false;
            });

            wrap.appendChild(dropdown);
            wrap.appendChild(trigger);
            card.appendChild(wrap);

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

            var comentariosContainer = document.createElement('div');
            comentariosContainer.className = 'comentarios-container';
            comentariosContainer.id = 'comentarios-container-' + p.id;
            comentariosContainer.setAttribute('data-no-traducir', '1');

            comentariosContainer.innerHTML =
                '<div class="comentarios-lista" data-no-traducir="1" id="comentarios-lista-' + p.id + '"></div>' +
                '<div class="comentario-input-row" data-no-traducir="1">' +
                '<input type="text" id="comentario-input-' + p.id + '" placeholder="Escribe un comentario..." />' +
                '<button type="button" data-no-traducir="1">Enviar</button></div>';

            comentariosContainer.querySelector('button').addEventListener('click', function() {
                enviarComentarioPerfil(p.id);
            });

            card.appendChild(comentariosContainer);
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error cargando mis publicaciones:', error);
        container.innerHTML = '<div class="empty-state"><h4>Error al cargar</h4><p>' + escapeHtmlPerfil(error.message) + '</p></div>';
    }
}

// ================================================================
// 8. REACCIONES
// ================================================================
function toggleReaccionDropdown(postId, forzarApertura) {
    var dd = document.getElementById('reaccion-dropdown-' + postId);
    if (!dd) return;

    var esta = dd.classList.contains('show');

    document.querySelectorAll('.reaccion-dropdown.show').forEach(function(el) {
        el.classList.remove('show');
    });

    if (forzarApertura === true || !esta) {
        dd.classList.add('show');
    }
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.reaccion-wrap')) {
        document.querySelectorAll('.reaccion-dropdown.show').forEach(function(el) {
            el.classList.remove('show');
        });
    }
});

// FIX R1 + P2: Actualización in-situ, optimista y reconciliada con el servidor.
async function _refrescarTriggerReaccion(postId, emojiUsuario) {
    var card = document.querySelector('.publicacion-card[data-id="' + postId + '"]');
    if (!card) return;

    var trigger = card.querySelector('.reaccion-trigger');

    // FIX P2: Mostrar el emoji solicitado de inmediato, sin redibujar la tarjeta.
    if (trigger && emojiUsuario) {
        var emojiActual = trigger.querySelector('.emoji-actual');
        if (emojiActual) emojiActual.textContent = emojiUsuario;
    }

    var client = window.supabaseClient;
    if (!client) return;

    try {
        // FIX P2: Solo se consultan las columnas necesarias para recalcular conteos.
        var res = await client.from('publicaciones_reacciones')
            .select('tipo, usuario_id')
            .eq('publicacion_id', postId);

        if (res.error) throw res.error;

        var sessionResult = await client.auth.getSession();
        var uid = sessionResult.data.session
            ? sessionResult.data.session.user.id
            : null;

        var conteos = {};
        var usuarioTipo = null;

        (res.data || []).forEach(function(r) {
            conteos[r.tipo] = (conteos[r.tipo] || 0) + 1;
            if (r.usuario_id === uid) usuarioTipo = r.tipo;
        });

        var total = Object.keys(conteos).reduce(function(a, b) {
            return a + conteos[b];
        }, 0);

        var dominante = Object.keys(conteos).sort(function(a, b) {
            return conteos[b] - conteos[a];
        })[0];

        var emojiMostrado = usuarioTipo || dominante || '❤️';

        if (trigger) {
            trigger.classList.toggle('activa', !!usuarioTipo);
            trigger.innerHTML =
                '<span class="emoji-actual" data-no-traducir="1">' + emojiMostrado + '</span>' +
                (total > 0
                    ? '<span class="count" data-no-traducir="1">' + total + '</span>'
                    : '<span class="count" data-no-traducir="1">Reaccionar</span>');
        }

        // Refrescar mini-counts del dropdown.
        var dd = document.getElementById('reaccion-dropdown-' + postId);

        if (dd) {
            dd.querySelectorAll('button').forEach(function(btn) {
                var em = btn.dataset.emoji;
                if (!em) return;

                var count = conteos[em] || 0;
                var mini = btn.querySelector('.mini-count');

                if (count > 0) {
                    if (!mini) {
                        mini = document.createElement('span');
                        mini.className = 'mini-count';
                        mini.setAttribute('data-no-traducir', '1');
                        btn.appendChild(mini);
                    }
                    mini.textContent = count;
                } else if (mini) {
                    mini.remove();
                }

                btn.classList.toggle('activa', em === usuarioTipo);
            });
        }
    } catch (error) {
        console.error('Error actualizando reacciones:', error);
    }
}

async function reaccionarPublicacionPerfil(postId, emoji) {
    if (!window.EMOJIS_REACCION.includes(emoji)) return;

    try {
        var client = window.supabaseClient;
        if (!client) return;

        var sessionResult = await client.auth.getSession();
        var session = sessionResult.data.session;
        if (!session) return;

        var dd = document.getElementById('reaccion-dropdown-' + postId);
        if (dd) dd.classList.remove('show');

        var existing = await client.from('publicaciones_reacciones')
            .select('id, tipo')
            .eq('publicacion_id', postId)
            .eq('usuario_id', session.user.id)
            .maybeSingle();

        if (existing.error) throw existing.error;

        if (existing.data && existing.data.tipo === emoji) {
            var deleteResult = await client.from('publicaciones_reacciones')
                .delete()
                .eq('id', existing.data.id);

            if (deleteResult.error) throw deleteResult.error;
        } else {
            if (existing.data) {
                var updateResult = await client.from('publicaciones_reacciones')
                    .update({ tipo: emoji })
                    .eq('id', existing.data.id);

                if (updateResult.error) throw updateResult.error;
            } else {
                var insertResult = await client.from('publicaciones_reacciones')
                    .insert({
                        publicacion_id: postId,
                        usuario_id: session.user.id,
                        tipo: emoji
                    });

                if (insertResult.error) throw insertResult.error;
            }
        }

        // FIX R1: Actualización quirúrgica del control, sin reconstruir la publicación.
        await _refrescarTriggerReaccion(postId, emoji);
    } catch (error) {
        console.error('Error reaccionando:', error);
    }
}

// ================================================================
// 9. COMENTARIOS
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

    lista.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);padding:4px;">Cargando...</div>';

    try {
        var client = window.supabaseClient;
        if (!client) return;

        var result = await client.from('publicaciones_comentarios_publicos')
            .select('*')
            .eq('publicacion_id', publicacionId)
            .order('created_at', { ascending: true });

        if (result.error) throw result.error;

        var comentarios = result.data || [];

        if (comentarios.length === 0) {
            lista.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);padding:4px;">Sin comentarios.</div>';
            return;
        }

        lista.innerHTML = '';

        comentarios.forEach(function(c) {
            var item = document.createElement('div');
            item.className = 'comentario-item';

            var nombre = escapeHtmlPerfil(c.usuario_nombre || 'Usuario');

            var avatarMini = document.createElement('div');
            avatarMini.className = 'avatar-mini';
            avatarMini.appendChild(crearAvatar(c.usuario_nombre, c.usuario_avatar_url));
            item.appendChild(avatarMini);

            var contenidoDiv = document.createElement('div');
            contenidoDiv.className = 'contenido-comentario';

            var textoDiv = document.createElement('div');
            textoDiv.className = 'texto';
            textoDiv.textContent = c.contenido || '';

            contenidoDiv.innerHTML = '<div class="nombre">' + nombre + '</div>';
            contenidoDiv.appendChild(textoDiv);

            if (c.aviso_moderacion === 'lenguaje_inapropiado') {
                var avisoMini = document.createElement('div');
                avisoMini.innerHTML = htmlAvisoModeracionPerfil();
                avisoMini.style.marginTop = '4px';
                contenidoDiv.appendChild(avisoMini.firstChild);
            }

            var fechaDiv = document.createElement('div');
            fechaDiv.className = 'fecha';
            fechaDiv.textContent = c.created_at
                ? new Date(c.created_at).toLocaleString(pubCodigoIdioma())
                : '';

            contenidoDiv.appendChild(fechaDiv);
            item.appendChild(contenidoDiv);
            lista.appendChild(item);
        });
    } catch (error) {
        console.error('Error cargando comentarios:', error);
        lista.innerHTML = '<div style="font-size:0.7rem;color:var(--danger);padding:4px;">Error al cargar comentarios</div>';
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

        // FIX P3: Conservar el código original de Supabase.
        if (result.error) {
            var errorComentario = new Error(result.error.message);
            errorComentario.code = result.error.code;
            throw errorComentario;
        }

        if (input) input.value = '';
        if (window.showToast) window.showToast('Comentario publicado', 'success');

        await cargarComentariosPerfil(publicacionId);
    } catch (error) {
        console.error('Error enviando comentario:', error);

        if (window.showToast) {
            if (esErrorModeracionPerfil(error)) {
                window.showToast('❌ Contenido no permitido', 'error', 6000);
            } else {
                window.showToast('Error al enviar comentario: ' + error.message, 'error');
            }
        }
    }
}

// ================================================================
// 10. ELIMINAR PUBLICACIÓN
// ================================================================
async function eliminarMiPublicacion(publicacionId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!confirm('¿Seguro que quieres eliminar esta publicación?')) return;

    try {
        var client = window.supabaseClient;
        if (!client) return;

        try {
            var pubRes = await client.from('publicaciones')
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
                        console.warn('Storage remove:', storageErr);
                    }
                }
            }
        } catch (storageErr) {
            console.warn('Error getting media_url:', storageErr);
        }

        var result = await client.from('publicaciones')
            .delete()
            .eq('id', publicacionId);

        if (result.error) throw new Error(result.error.message);

        if (window.showToast) window.showToast('Publicación eliminada', 'success');
        await cargarMisPublicaciones(true);
    } catch (error) {
        console.error('Error eliminando:', error);
        if (window.showToast) window.showToast('Error al eliminar: ' + error.message, 'error');
    }
}

// Exponer funciones globales
window.descargarArchivoForzado = descargarArchivoForzado;
window.publicarDesdePerfil = publicarDesdePerfil;
window.seleccionarArchivoPerfil = seleccionarArchivoPerfil;
window.quitarArchivoPerfil = quitarArchivoPerfil;
window.toggleEmojiPickerPerfil = toggleEmojiPickerPerfil;
window.insertarHashtagPerfil = insertarHashtagPerfil;

// ================================================================
// CHANGELOG v5.1 → v5.2
// - P1: comentario en forEach síncrono
// - P2: _refrescarTriggerReaccion optimista con queries mínimas
// - P3: propagación de error.code en 3 funciones
// - P4: htmlAvisoModeracionPerfil sin estilos inline
// - P5: preview sin onclick inline
// - M1: style con createTextNode
// - M2: reset de isLongPress en pointerleave/pointercancel
// - M3: avatar-placeholder como clase CSS
// ================================================================