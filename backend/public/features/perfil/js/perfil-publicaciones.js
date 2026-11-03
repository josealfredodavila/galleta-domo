// ================================================================
// CSARIEL'S · PERFIL · PUBLICACIONES
// ================================================================
// v5.8
// - Menciones @usuario en azul eléctrico.
// - Corrección de emojis y contadores de reacciones.
// - Accesibilidad de botones de reacción.
// - Notificaciones de menciones sin duplicados.
// - Errores de notificaciones independientes de la publicación.
// - Mejor manejo de errores y validaciones.
//
// v5.7 Sistema de menciones con @ y notificación en BD.
// v5.6 Nombre, handle y avatar enlazan al perfil del autor.
// v5.5 Diseño tipo Facebook: publicaciones planas.
// v5.4 Eliminación segura de archivos mediante backend.
// v5.3 Reacciones, comentarios y medios optimizados.
// ================================================================

window.listaMultimediaPerfil = [];

// Rutas actuales de los perfiles.
var PUB_RUTA_PERFIL_PUBLICO = '/features/perfil/perfil-publico.html';
var PUB_RUTA_PERFIL_PROPIO = '/features/perfil/perfil.html';

// Emojis aceptados por la base de datos.
var PUB_EMOJIS_REACCION_DEFAULT = [
    '❤️', '😊', '👏', '😍', '😂', '🔥', '🎉', '🤩', '💎'
];

var PUB_EMOJIS_PICKER_DEFAULT = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😛','😜',
    '🤪','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤯',
    '😳','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🙄','😴','🤒','👍','👎','👏','🙌','🙏','🤝','💪','✌️',
    '🤞','👌','❤️','🧡','💛','💚','💙','💜','🖤','💔','💯','🔥','⭐','✨','🎉','🎊','🎈','🎁','🏆','🥇',
    '☕','🍕','🍔','🌮','🍩','🎵','🎶','🐶','🐱','🌹','🌈','☀️','🌙','⚡','💰','🚀','📸'
];

// Compatibilidad con páginas que ya declaran estas variables.
if (typeof window.archivosSeleccionados === 'undefined') {
    window.archivosSeleccionados = {
        imagen: null,
        video: null
    };
}

var archivosSeleccionados = window.archivosSeleccionados;

// ================================================================
// UTILIDADES
// ================================================================

function pubEmojisReaccion() {
    return Array.isArray(window.EMOJIS_REACCION) &&
        window.EMOJIS_REACCION.length
        ? window.EMOJIS_REACCION
        : PUB_EMOJIS_REACCION_DEFAULT;
}

function pubEmojisPicker() {
    return Array.isArray(window.emojisDisponibles) &&
        window.emojisDisponibles.length
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
    if (typeof url !== 'string') return false;

    if (typeof window.esUrlSegura === 'function') {
        return window.esUrlSegura(url);
    }

    return /^https?:\/\//i.test(url);
}

function pubPerfilT(clave, defecto) {
    if (typeof window.perfilT === 'function') {
        return window.perfilT(clave, defecto);
    }

    return defecto || clave;
}

function pubCrearAvatar(nombre, url) {
    if (typeof window.crearAvatar === 'function') {
        return window.crearAvatar(nombre, url);
    }

    var avatar = document.createElement('div');
    avatar.className = 'avatar-placeholder';
    avatar.textContent =
        String(nombre || '?').trim().charAt(0).toUpperCase() || '?';

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
            if (imagen.parentNode) {
                imagen.parentNode.removeChild(imagen);
            }
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

function pubMostrarToast(mensaje, tipo, duracion) {
    if (typeof window.showToast === 'function') {
        window.showToast(mensaje, tipo || 'info', duracion);
    }
}

// ================================================================
// ENLACES AL PERFIL DEL AUTOR
// ================================================================

function pubUrlPerfilAutor(usuarioId, miId) {
    if (!usuarioId) return null;

    if (miId && String(usuarioId) === String(miId)) {
        return PUB_RUTA_PERFIL_PROPIO;
    }

    return PUB_RUTA_PERFIL_PUBLICO +
        '?id=' + encodeURIComponent(usuarioId);
}

// ================================================================
// MENCIONES @USUARIO
// ================================================================

function formatearTextoConMenciones(texto) {
    if (!texto) return '';

    var textoLimpio = pubEscapeHtml(texto);
    var regex = /@([a-zA-Z0-9_]+)/g;

    return textoLimpio.replace(
        regex,
        function (match, username) {
            var urlPerfil =
                PUB_RUTA_PERFIL_PUBLICO +
                '?u=' + encodeURIComponent(username);

            return '<a class="pub-mencion" ' +
                'href="' + pubEscapeHtml(urlPerfil) + '" ' +
                'aria-label="Ver perfil de ' + pubEscapeHtml(username) + '">' +
                '@' + username +
                '</a>';
        }
    );
}

// ================================================================
// ESTILOS
// ================================================================

(function inyectarEstilosReaccionesPerfil() {
    if (document.getElementById('perfil-reacciones-fb-styles')) {
        return;
    }

    var style = document.createElement('style');
    style.id = 'perfil-reacciones-fb-styles';

    style.appendChild(document.createTextNode(`

        /* ========================================================
           PUBLICACIONES PLANAS
        ======================================================== */

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

        #misPublicacionesList .publicacion-card:hover {
            background: transparent !important;
            border-color: rgba(255,255,255,.09) !important;
            box-shadow: none !important;
        }

        /* ========================================================
           ENCABEZADO
        ======================================================== */

        #misPublicacionesList .publicacion-card .header {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 10px !important;
            padding: 0 !important;
            margin: 0 0 10px 0 !important;
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
        }

        #misPublicacionesList .publicacion-card .header > .avatar {
            width: 40px !important;
            height: 40px !important;
            min-width: 40px !important;
            flex: 0 0 40px !important;
            border: 0 !important;
            border-radius: 50% !important;
            box-shadow: none !important;
            overflow: hidden !important;
        }

        #misPublicacionesList .publicacion-card .header > div:not(.avatar) {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            text-align: left !important;
            line-height: 1.25 !important;
        }

        #misPublicacionesList .publicacion-card .nombre {
            font-weight: 700 !important;
            font-size: .92rem !important;
            color: var(--text-primary, #f0f4f8) !important;
            white-space: normal !important;
            word-break: break-word !important;
        }

        #misPublicacionesList .publicacion-card .fecha {
            font-size: .72rem !important;
            color: var(--text-muted, #8aa8b8) !important;
            margin-top: 2px !important;
        }

        /* ========================================================
           MENCIONES AZULES
        ======================================================== */

        .pub-mencion {
            color: #3B82F6 !important;
            font-weight: 800 !important;
            text-decoration: none !important;
            cursor: pointer;
            transition: color .18s ease, text-shadow .18s ease;
            overflow-wrap: anywhere;
        }

        .pub-mencion:hover {
            color: #60A5FA !important;
            text-decoration: underline !important;
            text-shadow: 0 0 10px rgba(59,130,246,.25);
        }

        .pub-mencion:focus-visible {
            outline: 2px solid #3B82F6;
            outline-offset: 3px;
            border-radius: 3px;
        }

        /* ========================================================
           ENLACES DEL AUTOR
        ======================================================== */

        .pub-autor-enlace {
            color: inherit;
            text-decoration: none;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        .pub-autor-enlace:hover .pub-autor-nombre,
        .pub-autor-enlace:focus-visible .pub-autor-nombre {
            text-decoration: underline;
        }

        .pub-autor-enlace:focus-visible {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
            border-radius: 4px;
        }

        .pub-autor-avatar-enlace {
            display: block;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            flex: 0 0 40px;
            cursor: pointer;
        }

        /* ========================================================
           CONTENIDO Y MEDIOS
        ======================================================== */

        .publicacion-card .contenido {
            display: flex;
            flex-direction: column;
            gap: 8px;
            color: var(--text-secondary, #c0d8e8);
            font-size: .95rem;
            line-height: 1.5;
            overflow-wrap: anywhere;
            margin: 0 !important;
        }

        .publicacion-card .contenido img,
        .publicacion-card .contenido video {
            display: block;
            width: calc(100% + 0px);
            max-width: 100%;
            height: auto;
            max-height: 620px;
            object-fit: contain;
            background: #000;
            border: 0 !important;
            border-radius: 0 !important;
            margin: 6px 0 0 0 !important;
            cursor: pointer;
        }

        /* ========================================================
           MODERACIÓN
        ======================================================== */

        .perfil-aviso-moderacion {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 0;
            margin: 4px 0;
            background: transparent;
            border: 0;
            color: #f7d44a;
            font-size: .72rem;
        }

        .perfil-aviso-moderacion-icono {
            font-size: .95rem;
            flex: 0 0 auto;
        }

        /* ========================================================
           REACCIONES
        ======================================================== */

        .reaccion-wrap {
            position: relative;
            display: inline-block;
            margin: 8px 0 0 0;
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
            color: var(--text-muted, #8aa8b8);
            font-size: .82rem;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }

        .reaccion-trigger:hover {
            background: rgba(255,255,255,.05);
        }

        .reaccion-trigger.activa {
            color: #3b82f6;
        }

        .reaccion-trigger .emoji-actual {
            font-size: 1.05rem;
            line-height: 1;
        }

        .reaccion-trigger .count {
            font-size: .78rem;
            font-weight: 500;
        }

        .reaccion-trigger:disabled {
            opacity: .65;
            cursor: wait;
        }

        .reaccion-dropdown {
            position: absolute;
            bottom: 100%;
            left: 0;
            margin-bottom: 8px;
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px;
            max-width: min(280px, calc(100vw - 32px));
            padding: 6px 10px;
            background: #1c1f24;
            border: 0;
            border-radius: 24px;
            box-shadow: 0 6px 18px rgba(0,0,0,.5);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(8px) scale(.95);
            transform-origin: bottom left;
            transition: opacity .18s ease, transform .18s ease, visibility .18s ease;
            z-index: 100;
        }

        .reaccion-dropdown.show {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translateY(0) scale(1);
        }

        .reaccion-dropdown button {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: transparent;
            font-size: 1.55rem;
            cursor: pointer;
            touch-action: manipulation;
            transition: transform .15s ease, background .15s ease;
        }

        .reaccion-dropdown button:hover,
        .reaccion-dropdown button:focus-visible {
            transform: scale(1.15);
            background: rgba(255,255,255,.1);
        }

        .reaccion-dropdown button.activa {
            background: rgba(59,130,246,.28);
        }

        .reaccion-dropdown .mini-count {
            position: absolute;
            bottom: -3px;
            right: -3px;
            padding: 1px 4px;
            border-radius: 10px;
            background: #3b82f6;
            color: #fff;
            font-size: .58rem;
            font-weight: bold;
            line-height: 1.2;
            pointer-events: none;
        }

        /* ========================================================
           ACCIONES
        ======================================================== */

        .publicacion-card .stats {
            display: flex;
            align-items: center;
            gap: 4px;
            margin: 2px 0 0 0 !important;
            padding: 6px 0 0 0 !important;
            border-top: 1px solid rgba(255,255,255,.09);
            flex-wrap: wrap;
        }

        .btn-accion-pub {
            background: transparent !important;
            border: 0 !important;
            border-radius: 6px !important;
            padding: 6px 10px !important;
            color: var(--text-muted, #8aa8b8) !important;
            font-size: .82rem !important;
            font-weight: 600 !important;
            box-shadow: none !important;
        }

        .btn-accion-pub:hover {
            background: rgba(255,255,255,.05) !important;
            color: var(--text-primary, #f0f4f8) !important;
        }

        .btn-accion-pub.danger {
            color: var(--danger, #ff3366) !important;
        }

        .btn-accion-pub.danger:hover {
            background: rgba(255,51,102,.08) !important;
        }

        /* ========================================================
           COMENTARIOS
        ======================================================== */

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
        }

        .comentario-input-row button {
            background: transparent !important;
            color: var(--gold, #D4AF37) !important;
            border: 0 !important;
            font-weight: 700 !important;
        }

        .comentario-eliminar {
            display: inline-block;
            margin-top: 2px;
            padding: 2px 0;
            border: 0;
            background: transparent;
            color: var(--danger, #ff3366);
            font-size: .7rem;
            font-weight: 700;
            cursor: pointer;
        }

        /* ========================================================
           VISTAS PREVIAS
        ======================================================== */

        .preview-item {
            position: relative;
        }

        .preview-item img,
        .preview-item video {
            display: block;
            width: 100%;
            max-height: 280px;
            object-fit: contain;
            border-radius: 8px;
        }

        .preview-download-control {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            font-size: .8rem;
            color: var(--text-muted, #8aa8b8);
        }

        .preview-download-control input {
            width: 16px;
            height: 16px;
            accent-color: #3b82f6;
        }

        .preview-download-control label {
            cursor: pointer;
        }

        /* ========================================================
           AVATAR
        ======================================================== */

        .avatar-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: #3b82f6;
            color: #fff;
            font-weight: 600;
            overflow: hidden;
        }

        /* ========================================================
           ACCESIBILIDAD
        ======================================================== */

        #misPublicacionesList .publicacion-card button:focus-visible,
        .comentarios-container input:focus-visible {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
            .reaccion-dropdown,
            .reaccion-dropdown button,
            .reaccion-trigger,
            .pub-mencion {
                transition: none !important;
            }
        }

    `));

    document.head.appendChild(style);
})();

// ================================================================
// MODERACIÓN Y AVISOS
// ================================================================

function esErrorModeracionPerfil(error) {
    var msg = '';

    if (error) {
        msg = String(error.message || '') + ' ' +
            String(error.code || '');
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
    texto.textContent =
        'Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.';

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
            data && data.error
                ? data.error
                : 'No se pudo subir el archivo'
        );

        error.status = respuesta.status;
        error.code = data && data.code ? data.code : null;

        throw error;
    }

    if (!data.url || !pubEsUrlSegura(data.url)) {
        throw new Error(
            'El servidor no devolvió una URL válida para el archivo.'
        );
    }

    return data;
}

async function descargarArchivoForzado(url, nombreOriginal) {
    var blobUrl = null;

    try {
        if (!pubEsUrlSegura(url)) {
            throw new Error('La dirección del archivo no es válida.');
        }

        pubMostrarToast('Preparando descarga...', 'info', 2000);

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

        var nombreDescarga =
            'descarga_' + Date.now() + '.' + extension;

        blobUrl = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = blobUrl;
        a.download = nombreDescarga;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        pubMostrarToast('✅ Descarga iniciada', 'success', 2000);

    } catch (error) {
        console.error('Error descargando:', error);

        pubMostrarToast(
            '❌ Error al descargar el archivo',
            'error'
        );

    } finally {
        if (blobUrl) {
            setTimeout(function () {
                URL.revokeObjectURL(blobUrl);
            }, 1000);
        }
    }
}

// ================================================================
// EMOJIS Y HASHTAGS
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
            btn.setAttribute('aria-label', 'Insertar emoji ' + emoji);

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

    input.value =
        texto.substring(0, start) +
        emoji +
        texto.substring(end);

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

    input.value =
        texto.substring(0, start) +
        '#' +
        texto.substring(end);

    input.focus();

    input.selectionStart = start + 1;
    input.selectionEnd = start + 1;
}

// ================================================================
// SELECCIÓN Y VISTA PREVIA DE ARCHIVOS
// ================================================================

function seleccionarArchivoPerfil(event, tipo) {
    var input = event && event.target ? event.target : null;
    var file = input && input.files ? input.files[0] : null;

    if (!file) return;

    if (tipo !== 'imagen' && tipo !== 'video') {
        pubMostrarToast('Tipo de archivo no válido', 'error');

        if (input) input.value = '';

        return;
    }

    var otroTipo = tipo === 'imagen' ? 'video' : 'imagen';

    if (archivosSeleccionados[otroTipo]) {
        pubMostrarToast(
            'Por ahora puedes adjuntar una imagen o un video por publicación.',
            'warning'
        );

        if (input) input.value = '';

        return;
    }

    if (tipo === 'imagen') {
        if (file.size > 5 * 1024 * 1024) {
            pubMostrarToast('Imagen mayor a 5 MB', 'error');
            input.value = '';
            return;
        }

        if (!file.type || file.type.indexOf('image/') !== 0) {
            pubMostrarToast('Solo se permiten imágenes', 'error');
            input.value = '';
            return;
        }

    } else {
        if (file.size > 100 * 1024 * 1024) {
            pubMostrarToast('Video mayor a 100 MB', 'error');
            input.value = '';
            return;
        }

        if (!file.type || file.type.indexOf('video/') !== 0) {
            pubMostrarToast('Solo se permiten videos', 'error');
            input.value = '';
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

    Object.keys(archivosSeleccionados).forEach(function (tipo) {
        var file = archivosSeleccionados[tipo];

        if (!file) return;

        var wrapper = document.createElement('div');
        wrapper.className = 'preview-item';

        var reader = new FileReader();

        reader.onload = function (e) {
            if (!e.target || typeof e.target.result !== 'string') {
                return;
            }

            wrapper.innerHTML = '';

            var media;

            if (tipo === 'imagen') {
                media = document.createElement('img');
                media.alt = 'Vista previa de la imagen';

            } else if (tipo === 'video') {
                media = document.createElement('video');
                media.muted = true;
                media.controls = true;
                media.preload = 'metadata';

            } else {
                return;
            }

            media.src = e.target.result;

            var quitar = document.createElement('button');

            quitar.type = 'button';
            quitar.className = 'remove-btn';
            quitar.textContent = '×';
            quitar.setAttribute('aria-label', 'Quitar archivo adjunto');

            quitar.addEventListener('click', function () {
                quitarArchivoPerfil(tipo);
            });

            wrapper.appendChild(media);
            wrapper.appendChild(quitar);
        };

        reader.onerror = function () {
            pubMostrarToast(
                'No se pudo mostrar la vista previa del archivo.',
                'error'
            );
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
        label.textContent =
            'Permitir que otros descarguen este archivo';

        controlDiv.appendChild(checkbox);
        controlDiv.appendChild(label);

        container.appendChild(controlDiv);
    }
}

function quitarArchivoPerfil(tipo) {
    if (tipo !== 'imagen' && tipo !== 'video') return;

    archivosSeleccionados[tipo] = null;

    var inputId =
        tipo === 'imagen'
            ? 'inputFotoPerfilPost'
            : 'inputVideoPerfilPost';

    var input = document.getElementById(inputId);

    if (input) input.value = '';

    renderizarPreviewPerfil();
}

// ================================================================
// NOTIFICACIONES DE MENCIONES
// ================================================================
// Esta función se ejecuta de forma independiente después de guardar
// una publicación. Un fallo de notificaciones no revierte la publicación.
// ================================================================

async function pubNotificarMenciones(contenido, session, publicacionId) {
    if (!contenido || !session || !session.user) return;

    var client = window.supabaseClient;

    if (!client) return;

    try {
        var regex = /@([a-zA-Z0-9_]+)/g;
        var coincidencias = [];
        var match;

        while ((match = regex.exec(contenido)) !== null) {
            coincidencias.push(match[1]);
        }

        if (coincidencias.length === 0) return;

        // Eliminar duplicados sin distinguir mayúsculas/minúsculas.
        var handlesUnicos = [];
        var handlesVistos = {};

        coincidencias.forEach(function (handle) {
            var clave = String(handle).toLowerCase();

            if (!handlesVistos[clave]) {
                handlesVistos[clave] = true;
                handlesUnicos.push(handle);
            }
        });

        if (handlesUnicos.length === 0) return;

        // Buscar los perfiles mencionados.
        var resUsuarios = await client
            .from('perfiles_publicos')
            .select('id, handle')
            .in('handle', handlesUnicos);

        if (resUsuarios.error) {
            console.error(
                'Error buscando usuarios mencionados:',
                resUsuarios.error
            );
            return;
        }

        if (!resUsuarios.data || resUsuarios.data.length === 0) {
            return;
        }

        var usuariosNotificados = {};

        for (var i = 0; i < resUsuarios.data.length; i++) {
            var usuario = resUsuarios.data[i];

            if (!usuario || !usuario.id) continue;

            // No notificarse a sí mismo.
            if (String(usuario.id) === String(session.user.id)) {
                continue;
            }

            // Evitar duplicar notificaciones al mismo usuario.
            if (usuariosNotificados[String(usuario.id)]) {
                continue;
            }

            usuariosNotificados[String(usuario.id)] = true;

            try {
                // Consultar preferencias del usuario.
                var prefRes = await client
                    .from('preferencias_usuario')
                    .select('prefs')
                    .eq('usuario_id', usuario.id)
                    .maybeSingle();

                if (prefRes.error) {
                    console.warn(
                        'No se pudieron consultar preferencias:',
                        prefRes.error
                    );
                }

                var quiereMenciones = true;

                if (
                    prefRes.data &&
                    prefRes.data.prefs &&
                    prefRes.data.prefs.notif_menciones === false
                ) {
                    quiereMenciones = false;
                }

                if (!quiereMenciones) continue;

                var metadata = {
                    enlace: '/features/muro/muro.html',
                    publicacion_id: publicacionId || null,
                    handle_emisor:
                        session.user.user_metadata &&
                        session.user.user_metadata.handle
                            ? session.user.user_metadata.handle
                            : 'Alguien'
                };

                var notificacion = await client
                    .from('notificaciones')
                    .insert({
                        user_id: usuario.id,
                        emisor_id: session.user.id,
                        tipo: 'mencion',
                        mensaje: 'Te mencionó en una publicación.',
                        metadata: metadata
                    });

                if (notificacion.error) {
                    console.warn(
                        'No se pudo registrar la notificación de mención:',
                        notificacion.error
                    );
                }

            } catch (errorIndividual) {
                console.warn(
                    'Error procesando notificación de mención:',
                    errorIndividual
                );
            }
        }

    } catch (error) {
        console.error(
            'Error general en notificaciones de menciones:',
            error
        );
    }
}

// ================================================================
// PUBLICAR
// ================================================================

var pubPublicacionEnProceso = false;

async function publicarDesdePerfil() {
    var btn = document.getElementById('btnPublicarPerfil');
    var input = document.getElementById('inputNuevaPublicacion');

    var contenido = input ? input.value.trim() : '';

    if (
        !contenido &&
        !archivosSeleccionados.imagen &&
        !archivosSeleccionados.video
    ) {
        pubMostrarToast(
            'Escribe algo o sube una foto/video',
            'warning'
        );
        return;
    }

    if (pubPublicacionEnProceso) return;

    var textoOriginalBtn = btn ? btn.innerHTML : 'Publicar';

    if (btn && btn.disabled) return;

    pubPublicacionEnProceso = true;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Publicando...';
    }

    try {
        var client = window.supabaseClient;

        if (!client) {
            throw new Error('Supabase no está listo.');
        }

        var sessionResult = await client.auth.getSession();

        if (sessionResult.error) {
            throw sessionResult.error;
        }

        var session = sessionResult.data
            ? sessionResult.data.session
            : null;

        if (!session) {
            pubMostrarToast('Inicia sesión para publicar', 'error');
            return;
        }

        var token = session.access_token;
        var mediaUrl = null;
        var mediaType = null;

        var chkDescarga =
            document.getElementById('chkPermitirDescarga');

        var permitirDescarga =
            chkDescarga ? chkDescarga.checked : true;

        if (archivosSeleccionados.imagen) {
            pubMostrarToast('Subiendo imagen...', 'info', 5000);

            var resImg = await subirArchivoConModeracion(
                archivosSeleccionados.imagen,
                'muro-videos',
                'imagen',
                token
            );

            mediaUrl = resImg.url;
            mediaType = 'imagen';

        } else if (archivosSeleccionados.video) {
            pubMostrarToast('Subiendo video...', 'info', 15000);

            var resVid = await subirArchivoConModeracion(
                archivosSeleccionados.video,
                'muro-videos',
                'video',
                token
            );

            mediaUrl = resVid.url;
            mediaType = 'video';
        }

        var insertPayload = {
            usuario_id: session.user.id,
            contenido: contenido,
            media_url: mediaUrl,
            media_type: mediaType,
            estado: 'publicado',
            permitir_descarga: permitirDescarga
        };

        var insertResult = await client
            .from('publicaciones')
            .insert(insertPayload)
            .select()
            .single();

        if (insertResult.error) {
            var errorPublicacion = new Error(
                insertResult.error.message
            );

            errorPublicacion.code = insertResult.error.code;

            throw errorPublicacion;
        }

        var publicacionCreada = insertResult.data;

        pubMostrarToast('¡Publicación creada!', 'success');

        if (input) input.value = '';

        archivosSeleccionados.imagen = null;
        archivosSeleccionados.video = null;

        var inputFoto =
            document.getElementById('inputFotoPerfilPost');

        var inputVideo =
            document.getElementById('inputVideoPerfilPost');

        if (inputFoto) inputFoto.value = '';
        if (inputVideo) inputVideo.value = '';

        renderizarPreviewPerfil();

        // Las notificaciones no deben impedir que se actualice
        // una publicación que ya fue guardada correctamente.
        await pubNotificarMenciones(
            contenido,
            session,
            publicacionCreada ? publicacionCreada.id : null
        );

        await cargarMisPublicaciones(true);

    } catch (error) {
        console.error('Error publicando:', error);

        pubMostrarToast(
            esErrorModeracionPerfil(error)
                ? '❌ Contenido no permitido'
                : '❌ ' + (
                    error.message ||
                    'No se pudo crear la publicación'
                ),
            'error'
        );

    } finally {
        pubPublicacionEnProceso = false;

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginalBtn;
        }
    }
}

// ================================================================
// REPRODUCCIÓN DE VIDEO
// ================================================================

var videoObserverPerfil = null;

if (typeof IntersectionObserver !== 'undefined') {
    videoObserverPerfil = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                var video = entry.target;
                var autoPlayPref = 'true';

                try {
                    autoPlayPref = localStorage.getItem(
                        'contenido_auto_reproducir'
                    );
                } catch (e) {}

                var activarAutoplay =
                    autoPlayPref === null ||
                    autoPlayPref === 'true';

                if (entry.isIntersecting) {
                    if (activarAutoplay) {
                        video.muted = true;

                        var playResult = video.play();

                        if (
                            playResult &&
                            typeof playResult.catch === 'function'
                        ) {
                            playResult.catch(function () {});
                        }
                    }

                } else {
                    video.pause();
                }
            });
        },
        {
            threshold: 0.5
        }
    );
}

// ================================================================
// CARGAR PUBLICACIONES DEL USUARIO
// ================================================================

var pubVersionRender = 0;

async function cargarMisPublicaciones(forzarRefresco) {
    var container =
        document.getElementById('misPublicacionesList');

    var contador =
        document.getElementById('misPostsCount');

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

        if (sessionResult.error) {
            throw sessionResult.error;
        }

        var session = sessionResult.data
            ? sessionResult.data.session
            : null;

        if (!session) {
            container.innerHTML =
                '<div class="empty-state">' +
                '<h4>Inicia sesión</h4>' +
                '</div>';

            if (contador) contador.textContent = '0';

            return;
        }

        var result = await client
            .from('publicaciones_publicas')
            .select('*')
            .eq('usuario_id', session.user.id)
            .order('created_at', {
                ascending: false
            })
            .limit(50);

        if (result.error) throw result.error;

        if (versionActual !== pubVersionRender) return;

        var publicaciones = result.data || [];

        if (contador) {
            contador.textContent = String(publicaciones.length);
        }

        if (publicaciones.length === 0) {
            container.innerHTML =
                '<div class="empty-state">' +
                '<h4>Sin publicaciones aún</h4>' +
                '<p>Publica algo para verlo aquí</p>' +
                '</div>';

            window.listaMultimediaPerfil = [];

            return;
        }

        container.innerHTML = '';
        window.listaMultimediaPerfil = [];

        var reaccionesUsuario = {};
        var conteosReacciones = {};

        var idsPublicaciones = publicaciones
            .map(function (p) {
                return p.id;
            })
            .filter(function (id) {
                return id !== null && id !== undefined;
            });

        // Consultar reacciones de las publicaciones visibles.
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

                        var tipos =
                            conteosReacciones[r.publicacion_id];

                        tipos[r.tipo] =
                            (tipos[r.tipo] || 0) + 1;

                        if (r.usuario_id === session.user.id) {
                            reaccionesUsuario[r.publicacion_id] =
                                r.tipo;
                        }
                    });

                } else if (reaccResult.error) {
                    console.error(
                        'No se pudieron cargar las reacciones:',
                        reaccResult.error
                    );
                }

            } catch (errorReacciones) {
                console.error(
                    'Error cargando reacciones:',
                    errorReacciones
                );
            }
        }

        if (versionActual !== pubVersionRender) return;

        var miId = session.user.id;

        publicaciones.forEach(function (p) {
            var nombreReal = pubEscapeHtml(
                p.usuario_nombre || 'Explorador'
            );

            var handleReal = p.usuario_handle
                ? '@' + pubEscapeHtml(p.usuario_handle)
                : '';

            var urlAutor = pubUrlPerfilAutor(
                p.usuario_id,
                miId
            );

            var card = document.createElement('div');

            card.className = 'publicacion-card';
            card.dataset.id = p.id;

            var header = document.createElement('div');
            header.className = 'header';

            // Avatar enlazado al perfil.
            var avatarBox = document.createElement(
                urlAutor ? 'a' : 'div'
            );

            avatarBox.className =
                'avatar' +
                (urlAutor ? ' pub-autor-avatar-enlace' : '');

            if (urlAutor) {
                avatarBox.href = urlAutor;

                avatarBox.setAttribute(
                    'aria-label',
                    'Ver perfil de ' +
                    (p.usuario_nombre || 'Explorador')
                );
            }

            avatarBox.appendChild(
                pubCrearAvatar(
                    p.usuario_nombre,
                    p.usuario_avatar_url
                )
            );

            header.appendChild(avatarBox);

            // Nombre y handle.
            var headerMeta = document.createElement('div');

            var nombreHtml =
                '<span class="nombre" data-no-traducir="1">' +
                    '<span class="pub-autor-nombre">' +
                        nombreReal +
                    '</span>' +
                    (
                        handleReal
                            ? ' <span style="color:var(--text-muted);font-weight:400;font-size:.75rem;">' +
                                handleReal +
                              '</span>'
                            : ''
                    ) +
                '</span>';

            var nombreBloque = urlAutor
                ? '<a class="pub-autor-enlace" href="' +
                    pubEscapeHtml(urlAutor) +
                    '" aria-label="Ver perfil de ' +
                    pubEscapeHtml(
                        p.usuario_nombre || 'Explorador'
                    ) +
                    '">' +
                    nombreHtml +
                  '</a>'
                : '<div class="nombre" data-no-traducir="1">' +
                    nombreReal +
                    (
                        handleReal
                            ? ' <span style="color:var(--text-muted);font-weight:400;font-size:.75rem;">' +
                                handleReal +
                              '</span>'
                            : ''
                    ) +
                  '</div>';

            headerMeta.innerHTML =
                nombreBloque +
                '<div class="fecha" data-no-traducir="1">' +
                    (
                        p.created_at
                            ? pubEscaparHTML(
                                new Date(p.created_at)
                                    .toLocaleString(pubCodigoIdioma())
                              )
                            : ''
                    ) +
                '</div>';

            header.appendChild(headerMeta);
            card.appendChild(header);

            if (p.aviso_moderacion === 'lenguaje_inapropiado') {
                card.appendChild(
                    htmlAvisoModeracionPerfil()
                );
            }

            // ====================================================
            // CONTENIDO
            // ====================================================

            var contenido = document.createElement('div');

            contenido.className = 'contenido';
            contenido.setAttribute('data-no-traducir', '1');

            if (p.contenido) {
                var texto = document.createElement('div');

                texto.innerHTML =
                    formatearTextoConMenciones(p.contenido);

                contenido.appendChild(texto);
            }

            // ====================================================
            // MEDIOS
            // ====================================================

            if (pubEsUrlSegura(p.media_url)) {
                var permiteDescarga =
                    p.permitir_descarga !== false;

                var tipoMedia = p.media_type;

                if (
                    tipoMedia === 'video' ||
                    tipoMedia === 'imagen'
                ) {
                    var indexEnLista =
                        window.listaMultimediaPerfil.length;

                    window.listaMultimediaPerfil.push({
                        url: p.media_url,
                        tipo: tipoMedia,
                        permiteDescarga: permiteDescarga
                    });

                    if (tipoMedia === 'video') {
                        var video =
                            document.createElement('video');

                        video.controls = true;
                        video.preload = 'metadata';
                        video.src = p.media_url;
                        video.playsInline = true;

                        var autoplayInicial = 'true';

                        try {
                            autoplayInicial =
                                localStorage.getItem(
                                    'contenido_auto_reproducir'
                                );
                        } catch (e) {}

                        video.muted =
                            autoplayInicial !== 'false';

                        if (videoObserverPerfil) {
                            videoObserverPerfil.observe(video);
                        }

                        video.addEventListener(
                            'click',
                            function (e) {
                                if (e.target.tagName !== 'VIDEO') {
                                    return;
                                }

                                if (
                                    typeof window.expandirFotoPublicacion ===
                                    'function'
                                ) {
                                    window.expandirFotoPublicacion(
                                        indexEnLista
                                    );
                                }
                            }
                        );

                        contenido.appendChild(video);

                    } else {
                        var img =
                            document.createElement('img');

                        img.alt = pubPerfilT(
                            'perfil_imagen',
                            'Imagen'
                        );

                        img.loading = 'lazy';
                        img.decoding = 'async';

                        img.addEventListener('click', function () {
                            if (
                                typeof window.expandirFotoPublicacion ===
                                'function'
                            ) {
                                window.expandirFotoPublicacion(
                                    indexEnLista
                                );
                            }
                        });

                        img.src = p.media_url;

                        contenido.appendChild(img);
                    }
                }
            }

            card.appendChild(contenido);

            // ====================================================
            // REACCIONES
            // ====================================================

            var reaccionUsuario =
                reaccionesUsuario[p.id] || null;

            var conteos =
                conteosReacciones[p.id] || {};

            var totalReacciones = 0;

            Object.keys(conteos).forEach(function (k) {
                totalReacciones += conteos[k] || 0;
            });

            var emojiMostrado =
                reaccionUsuario || '❤️';

            var wrap = document.createElement('div');

            wrap.className = 'reaccion-wrap';
            wrap.setAttribute('data-no-traducir', '1');

            var dropdown = document.createElement('div');

            dropdown.className = 'reaccion-dropdown';
            dropdown.id = 'reaccion-dropdown-' + p.id;
            dropdown.setAttribute('data-no-traducir', '1');

            pubEmojisReaccion().forEach(function (emoji) {
                var b = document.createElement('button');

                b.type = 'button';

                b.setAttribute('data-no-traducir', '1');
                b.setAttribute('data-emoji', emoji);
                b.setAttribute('aria-label', 'Reaccionar ' + emoji);

                b.title = 'Reaccionar ' + emoji;
                b.textContent = emoji;

                if (reaccionUsuario === emoji) {
                    b.classList.add('activa');
                }

                b.addEventListener('click', function (ev) {
                    ev.stopPropagation();

                    reaccionarPublicacionPerfil(
                        p.id,
                        emoji
                    );
                });

                var count = conteos[emoji] || 0;

                if (count > 0) {
                    var mini = document.createElement('span');

                    mini.className = 'mini-count';
                    mini.setAttribute('data-no-traducir', '1');
                    mini.textContent = String(count);

                    b.appendChild(mini);
                }

                dropdown.appendChild(b);
            });

            var trigger = document.createElement('button');

            trigger.type = 'button';
            trigger.setAttribute('data-no-traducir', '1');

            trigger.className =
                'reaccion-trigger' +
                (reaccionUsuario ? ' activa' : '');

            trigger.setAttribute(
                'aria-label',
                'Reaccionar a la publicación'
            );

            trigger.setAttribute('aria-expanded', 'false');

            trigger.setAttribute(
                'aria-controls',
                dropdown.id
            );

            var emojiActual = document.createElement('span');

            emojiActual.className = 'emoji-actual';
            emojiActual.setAttribute('data-no-traducir', '1');
            emojiActual.textContent = emojiMostrado;

            var countActual = document.createElement('span');

            countActual.className = 'count';
            countActual.setAttribute('data-no-traducir', '1');

            countActual.textContent =
                totalReacciones > 0
                    ? String(totalReacciones)
                    : 'Reaccionar';

            trigger.appendChild(emojiActual);
            trigger.appendChild(countActual);

            // ====================================================
            // EVENTOS TÁCTILES Y TECLADO
            // ====================================================

            var pressTimer = null;
            var longPressTriggered = false;
            var pointerStartX = 0;
            var pointerStartY = 0;

            trigger.addEventListener(
                'pointerdown',
                function (e) {
                    if (e.button !== undefined && e.button !== 0) {
                        return;
                    }

                    clearTimeout(pressTimer);

                    longPressTriggered = false;

                    pointerStartX = e.clientX;
                    pointerStartY = e.clientY;

                    pressTimer = setTimeout(function () {
                        longPressTriggered = true;

                        toggleReaccionDropdown(p.id, true);

                        trigger.setAttribute(
                            'aria-expanded',
                            'true'
                        );

                        if (navigator.vibrate) {
                            try {
                                navigator.vibrate(35);
                            } catch (e) {}
                        }
                    }, 400);
                }
            );

            trigger.addEventListener(
                'pointermove',
                function (e) {
                    var distanciaX = Math.abs(
                        e.clientX - pointerStartX
                    );

                    var distanciaY = Math.abs(
                        e.clientY - pointerStartY
                    );

                    if (
                        distanciaX > 12 ||
                        distanciaY > 12
                    ) {
                        clearTimeout(pressTimer);
                    }
                }
            );

            trigger.addEventListener(
                'pointerup',
                function (e) {
                    clearTimeout(pressTimer);

                    e.preventDefault();
                    e.stopPropagation();

                    if (longPressTriggered) {
                        longPressTriggered = false;
                        return;
                    }

                    reaccionarPublicacionPerfil(
                        p.id,
                        reaccionUsuario || '❤️'
                    );
                }
            );

            trigger.addEventListener(
                'pointerleave',
                function () {
                    clearTimeout(pressTimer);
                    longPressTriggered = false;
                }
            );

            trigger.addEventListener(
                'pointercancel',
                function () {
                    clearTimeout(pressTimer);
                    longPressTriggered = false;
                }
            );

            // Accesibilidad para teclado.
            trigger.addEventListener(
                'keydown',
                function (e) {
                    if (
                        e.key === 'Enter' ||
                        e.key === ' '
                    ) {
                        e.preventDefault();

                        toggleReaccionDropdown(p.id);

                        var abierto = dropdown.classList.contains('show');

                        trigger.setAttribute(
                            'aria-expanded',
                            abierto ? 'true' : 'false'
                        );
                    }
                }
            );

            wrap.appendChild(dropdown);
            wrap.appendChild(trigger);

            // ====================================================
            // ACCIONES DE LA PUBLICACIÓN
            // ====================================================

            var stats = document.createElement('div');

            stats.className = 'stats';
            stats.setAttribute('data-no-traducir', '1');

            stats.appendChild(wrap);

            var btnComentarios =
                document.createElement('button');

            btnComentarios.type = 'button';
            btnComentarios.className = 'btn-accion-pub';
            btnComentarios.setAttribute('data-no-traducir', '1');
            btnComentarios.textContent = 'Comentarios';

            btnComentarios.addEventListener(
                'click',
                function (ev) {
                    ev.stopPropagation();

                    toggleComentariosPerfil(p.id);
                }
            );

            var btnEliminar =
                document.createElement('button');

            btnEliminar.type = 'button';
            btnEliminar.className =
                'btn-accion-pub danger';

            btnEliminar.setAttribute('data-no-traducir', '1');
            btnEliminar.textContent = 'Eliminar';

            btnEliminar.addEventListener(
                'click',
                function (ev) {
                    ev.stopPropagation();

                    eliminarMiPublicacion(p.id, ev);
                }
            );

            stats.appendChild(btnComentarios);
            stats.appendChild(btnEliminar);

            card.appendChild(stats);

            // ====================================================
            // COMENTARIOS
            // ====================================================

            var comentariosContainer =
                document.createElement('div');

            comentariosContainer.className =
                'comentarios-container';

            comentariosContainer.id =
                'comentarios-container-' + p.id;

            comentariosContainer.setAttribute(
                'data-no-traducir',
                '1'
            );

            comentariosContainer.dataset.dueno =
                p.usuario_id || '';

            var comentariosLista =
                document.createElement('div');

            comentariosLista.className =
                'comentarios-lista';

            comentariosLista.id =
                'comentarios-lista-' + p.id;

            comentariosLista.setAttribute(
                'data-no-traducir',
                '1'
            );

            var filaComentario =
                document.createElement('div');

            filaComentario.className =
                'comentario-input-row';

            filaComentario.setAttribute(
                'data-no-traducir',
                '1'
            );

            var inputComentario =
                document.createElement('input');

            inputComentario.type = 'text';

            inputComentario.id =
                'comentario-input-' + p.id;

            inputComentario.placeholder =
                'Escribe un comentario...';

            inputComentario.maxLength = 2000;

            inputComentario.setAttribute(
                'aria-label',
                'Escribe un comentario'
            );

            var btnEnviarComentario =
                document.createElement('button');

            btnEnviarComentario.type = 'button';

            btnEnviarComentario.setAttribute(
                'data-no-traducir',
                '1'
            );

            btnEnviarComentario.textContent = 'Enviar';

            btnEnviarComentario.addEventListener(
                'click',
                function () {
                    enviarComentarioPerfil(p.id);
                }
            );

            inputComentario.addEventListener(
                'keydown',
                function (ev) {
                    if (
                        ev.key === 'Enter' &&
                        !ev.shiftKey
                    ) {
                        ev.preventDefault();

                        enviarComentarioPerfil(p.id);
                    }
                }
            );

            filaComentario.appendChild(inputComentario);
            filaComentario.appendChild(btnEnviarComentario);

            comentariosContainer.appendChild(comentariosLista);
            comentariosContainer.appendChild(filaComentario);

            card.appendChild(comentariosContainer);

            container.appendChild(card);
        });

    } catch (error) {
        console.error(
            'Error cargando mis publicaciones:',
            error
        );

        if (versionActual === pubVersionRender) {
            container.innerHTML =
                '<div class="empty-state">' +
                    '<h4>Error al cargar</h4>' +
                    '<p>' +
                        pubEscapeHtml(
                            error.message ||
                            'Intenta nuevamente más tarde.'
                        ) +
                    '</p>' +
                '</div>';
        }
    }
}

// ================================================================
// MENÚ DE REACCIONES
// ================================================================

function toggleReaccionDropdown(postId, forzarApertura) {
    var dd = document.getElementById(
        'reaccion-dropdown-' + postId
    );

    if (!dd) return;

    var esta = dd.classList.contains('show');

    document.querySelectorAll(
        '.reaccion-dropdown.show'
    ).forEach(function (el) {
        el.classList.remove('show');

        var wrap = el.closest('.reaccion-wrap');

        if (wrap) {
            var trigger =
                wrap.querySelector('.reaccion-trigger');

            if (trigger) {
                trigger.setAttribute(
                    'aria-expanded',
                    'false'
                );
            }
        }
    });

    if (forzarApertura === true || !esta) {
        dd.classList.add('show');

        var triggerActual = dd.parentNode
            ? dd.parentNode.querySelector('.reaccion-trigger')
            : null;

        if (triggerActual) {
            triggerActual.setAttribute(
                'aria-expanded',
                'true'
            );
        }
    }
}

// Cerrar los menús al tocar fuera.
document.addEventListener('click', function (e) {
    if (
        !e.target.closest ||
        !e.target.closest('.reaccion-wrap')
    ) {
        document.querySelectorAll(
            '.reaccion-dropdown.show'
        ).forEach(function (el) {
            el.classList.remove('show');

            var wrap = el.closest('.reaccion-wrap');

            if (wrap) {
                var trigger =
                    wrap.querySelector('.reaccion-trigger');

                if (trigger) {
                    trigger.setAttribute(
                        'aria-expanded',
                        'false'
                    );
                }
            }
        });
    }
});

// ================================================================
// ACTUALIZAR REACCIONES SIN RECARGAR TODO EL MURO
// ================================================================

async function refrescarReaccionesPublicacion(postId) {
    var client = window.supabaseClient;

    if (!client) return;

    var card = document.querySelector(
        '.publicacion-card[data-id="' + postId + '"]'
    );

    if (!card) return;

    var sessionResult = await client.auth.getSession();

    if (sessionResult.error) {
        throw sessionResult.error;
    }

    var session = sessionResult.data
        ? sessionResult.data.session
        : null;

    var uid = session ? session.user.id : null;

    var result = await client
        .from('publicaciones_reacciones')
        .select('tipo, usuario_id')
        .eq('publicacion_id', postId);

    if (result.error) throw result.error;

    var conteos = {};
    var usuarioTipo = null;

    (result.data || []).forEach(function (r) {
        conteos[r.tipo] =
            (conteos[r.tipo] || 0) + 1;

        if (uid && r.usuario_id === uid) {
            usuarioTipo = r.tipo;
        }
    });

    var total = 0;

    Object.keys(conteos).forEach(function (tipo) {
        total += conteos[tipo];
    });

    var dominante = Object.keys(conteos).sort(
        function (a, b) {
            return conteos[b] - conteos[a];
        }
    )[0];

    var emojiMostrado =
        usuarioTipo || dominante || '❤️';

    var trigger =
        card.querySelector('.reaccion-trigger');

    if (trigger) {
        trigger.classList.toggle(
            'activa',
            Boolean(usuarioTipo)
        );

        var emojiActual =
            trigger.querySelector('.emoji-actual');

        var countActual =
            trigger.querySelector('.count');

        if (emojiActual) {
            emojiActual.textContent = emojiMostrado;
        }

        if (countActual) {
            countActual.textContent =
                total > 0
                    ? String(total)
                    : 'Reaccionar';
        }
    }

    var dd = document.getElementById(
        'reaccion-dropdown-' + postId
    );

    if (dd) {
        dd.querySelectorAll('button').forEach(
            function (btn) {
                // IMPORTANTE:
                // No usar textContent para identificar el emoji.
                // textContent también incluye el contador mini-count.
                var emoji = btn.getAttribute('data-emoji');

                if (!emoji) return;

                var mini =
                    btn.querySelector('.mini-count');

                btn.classList.toggle(
                    'activa',
                    usuarioTipo === emoji
                );

                var cantidad = conteos[emoji] || 0;

                if (cantidad > 0) {
                    if (!mini) {
                        mini = document.createElement('span');

                        mini.className = 'mini-count';

                        mini.setAttribute(
                            'data-no-traducir',
                            '1'
                        );

                        btn.appendChild(mini);
                    }

                    mini.textContent = String(cantidad);

                } else if (mini) {
                    mini.remove();
                }
            }
        );
    }
}

// ================================================================
// GUARDAR, CAMBIAR O QUITAR REACCIÓN
// ================================================================

var pubReaccionesEnProceso = {};

async function reaccionarPublicacionPerfil(postId, emoji) {
    if (!pubEmojisReaccion().includes(emoji)) return;

    if (pubReaccionesEnProceso[postId]) return;

    var client = window.supabaseClient;

    if (!client) {
        pubMostrarToast(
            'La conexión aún no está lista.',
            'warning'
        );

        return;
    }

    pubReaccionesEnProceso[postId] = true;

    var card = document.querySelector(
        '.publicacion-card[data-id="' + postId + '"]'
    );

    var trigger = card
        ? card.querySelector('.reaccion-trigger')
        : null;

    var dd = document.getElementById(
        'reaccion-dropdown-' + postId
    );

    var estadoAnterior = null;

    if (trigger) {
        estadoAnterior = {
            html: trigger.innerHTML,
            activa: trigger.classList.contains('activa')
        };

        trigger.disabled = true;
    }

    if (dd) {
        dd.classList.remove('show');
    }

    try {
        var sessionResult = await client.auth.getSession();

        if (sessionResult.error) {
            throw sessionResult.error;
        }

        var session = sessionResult.data
            ? sessionResult.data.session
            : null;

        if (!session) {
            pubMostrarToast(
                'Inicia sesión para reaccionar.',
                'warning'
            );

            return;
        }

        var existing = await client
            .from('publicaciones_reacciones')
            .select('id, tipo')
            .eq('publicacion_id', postId)
            .eq('usuario_id', session.user.id)
            .maybeSingle();

        if (existing.error) {
            throw existing.error;
        }

        if (
            existing.data &&
            existing.data.tipo === emoji
        ) {
            // Tocar la misma reacción la elimina.
            var del = await client
                .from('publicaciones_reacciones')
                .delete()
                .eq('id', existing.data.id);

            if (del.error) throw del.error;

        } else if (existing.data) {
            // Cambiar la reacción existente.
            var upd = await client
                .from('publicaciones_reacciones')
                .update({
                    tipo: emoji
                })
                .eq('id', existing.data.id);

            if (upd.error) throw upd.error;

        } else {
            // Crear una nueva reacción.
            var ins = await client
                .from('publicaciones_reacciones')
                .insert({
                    publicacion_id: postId,
                    usuario_id: session.user.id,
                    tipo: emoji
                });

            if (ins.error) throw ins.error;
        }

        await refrescarReaccionesPublicacion(postId);

    } catch (error) {
        console.error('Error reaccionando:', error);

        if (trigger && estadoAnterior) {
            trigger.innerHTML = estadoAnterior.html;

            trigger.classList.toggle(
                'activa',
                estadoAnterior.activa
            );
        }

        pubMostrarToast(
            '❌ No se pudo guardar la reacción. Inténtalo nuevamente.',
            'error'
        );

    } finally {
        delete pubReaccionesEnProceso[postId];

        if (trigger && trigger.isConnected) {
            trigger.disabled = false;
        }
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

    var duenoId = contenedor
        ? contenedor.dataset.dueno
        : '';

    lista.textContent = 'Cargando...';

    try {
        var client = window.supabaseClient;

        if (!client) {
            throw new Error('Supabase no está listo.');
        }

        var sessionResult = await client.auth.getSession();

        if (sessionResult.error) {
            throw sessionResult.error;
        }

        var session = sessionResult.data
            ? sessionResult.data.session
            : null;

        var uid = session ? session.user.id : null;

        var soyDueno = Boolean(
            uid &&
            duenoId &&
            uid === duenoId
        );

        var result = await client
            .from('publicaciones_comentarios_publicos')
            .select('*')
            .eq('publicacion_id', publicacionId)
            .order('created_at', {
                ascending: true
            });

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

            var avatarMini =
                document.createElement('div');

            avatarMini.className = 'avatar-mini';

            avatarMini.appendChild(
                pubCrearAvatar(
                    c.usuario_nombre,
                    c.usuario_avatar_url
                )
            );

            item.appendChild(avatarMini);

            var contenidoDiv =
                document.createElement('div');

            contenidoDiv.className =
                'contenido-comentario';

            var nombre =
                document.createElement('div');

            nombre.className = 'nombre';

            nombre.textContent =
                c.usuario_nombre || 'Usuario';

            contenidoDiv.appendChild(nombre);

            var textoDiv =
                document.createElement('div');

            textoDiv.className = 'texto';

            // Texto plano para evitar interpretación de HTML.
            textoDiv.textContent = c.contenido || '';

            contenidoDiv.appendChild(textoDiv);

            if (
                c.aviso_moderacion ===
                'lenguaje_inapropiado'
            ) {
                contenidoDiv.appendChild(
                    htmlAvisoModeracionPerfil()
                );
            }

            var fechaDiv =
                document.createElement('div');

            fechaDiv.className = 'fecha';

            fechaDiv.textContent = c.created_at
                ? new Date(c.created_at)
                    .toLocaleString(pubCodigoIdioma())
                : '';

            contenidoDiv.appendChild(fechaDiv);

            // El autor o el dueño pueden eliminar el comentario.
            var puedeEliminar = Boolean(
                uid &&
                (
                    c.usuario_id === uid ||
                    soyDueno
                )
            );

            if (puedeEliminar) {
                var btnDel =
                    document.createElement('button');

                btnDel.type = 'button';
                btnDel.className = 'comentario-eliminar';

                btnDel.setAttribute(
                    'data-no-traducir',
                    '1'
                );

                btnDel.textContent = 'Eliminar';

                btnDel.addEventListener(
                    'click',
                    function (ev) {
                        ev.stopPropagation();

                        eliminarComentarioPerfil(
                            c.id,
                            publicacionId
                        );
                    }
                );

                contenidoDiv.appendChild(btnDel);
            }

            item.appendChild(contenidoDiv);

            lista.appendChild(item);
        });

    } catch (error) {
        console.error(
            'Error cargando comentarios:',
            error
        );

        lista.textContent =
            'No se pudieron cargar los comentarios. Intenta nuevamente.';
    }
}

var pubComentariosEnProceso = {};

async function enviarComentarioPerfil(publicacionId) {
    var input = document.getElementById(
        'comentario-input-' + publicacionId
    );

    var texto = input ? input.value.trim() : '';

    if (!texto) {
        pubMostrarToast(
            'Escribe un comentario antes de enviarlo.',
            'warning'
        );

        return;
    }

    if (pubComentariosEnProceso[publicacionId]) return;

    var client = window.supabaseClient;

    if (!client) {
        pubMostrarToast(
            'La conexión aún no está lista.',
            'warning'
        );

        return;
    }

    pubComentariosEnProceso[publicacionId] = true;

    var fila = input ? input.parentNode : null;

    var btn = fila
        ? fila.querySelector('button')
        : null;

    var textoOriginal = btn
        ? btn.textContent
        : 'Enviar';

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Enviando...';
    }

    try {
        var sessionResult = await client.auth.getSession();

        if (sessionResult.error) {
            throw sessionResult.error;
        }

        var session = sessionResult.data
            ? sessionResult.data.session
            : null;

        if (!session) {
            pubMostrarToast(
                'Inicia sesión para comentar.',
                'warning'
            );

            return;
        }

        var payload = {
            publicacion_id: publicacionId,
            usuario_id: session.user.id,
            contenido: texto,
            created_at: new Date().toISOString()
        };

        var result = await client
            .from('publicaciones_comentarios')
            .insert(payload);

        if (result.error) {
            var errorComentario = new Error(
                result.error.message
            );

            errorComentario.code = result.error.code;

            throw errorComentario;
        }

        if (input) input.value = '';

        pubMostrarToast(
            'Comentario publicado',
            'success'
        );

        await cargarComentariosPerfil(publicacionId);

    } catch (error) {
        console.error(
            'Error enviando comentario:',
            error
        );

        if (esErrorModeracionPerfil(error)) {
            pubMostrarToast(
                '❌ Contenido no permitido',
                'error',
                6000
            );

        } else {
            pubMostrarToast(
                'Error al enviar comentario: ' +
                (
                    error.message ||
                    'Inténtalo nuevamente.'
                ),
                'error'
            );
        }

    } finally {
        delete pubComentariosEnProceso[publicacionId];

        if (btn && btn.isConnected) {
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    }
}

var pubEliminacionesComentarioEnProceso = {};

async function eliminarComentarioPerfil(
    comentarioId,
    publicacionId
) {
    if (pubEliminacionesComentarioEnProceso[comentarioId]) {
        return;
    }

    if (!confirm('¿Eliminar este comentario?')) return;

    pubEliminacionesComentarioEnProceso[comentarioId] = true;

    try {
        var client = window.supabaseClient;

        if (!client) {
            throw new Error('Supabase no está listo.');
        }

        var res = await client
            .from('publicaciones_comentarios')
            .delete()
            .eq('id', comentarioId)
            .select('id');

        if (res.error) throw res.error;

        if (!res.data || res.data.length === 0) {
            throw new Error(
                'No tienes permiso para eliminar este comentario.'
            );
        }

        pubMostrarToast(
            'Comentario eliminado',
            'success'
        );

        await cargarComentariosPerfil(publicacionId);

    } catch (error) {
        console.error(
            'Error eliminando comentario:',
            error
        );

        pubMostrarToast(
            'Error al eliminar: ' +
            (
                error.message ||
                'Inténtalo nuevamente.'
            ),
            'error'
        );

    } finally {
        delete pubEliminacionesComentarioEnProceso[comentarioId];
    }
}

// ================================================================
// ELIMINAR PUBLICACIÓN PROPIA
// ================================================================

async function liberarArchivoPublicacion(mediaUrl) {
    if (!mediaUrl) return;

    try {
        var client = window.supabaseClient;

        if (!client) return;

        var sessionResult = await client.auth.getSession();

        var token =
            sessionResult.data &&
            sessionResult.data.session
                ? sessionResult.data.session.access_token
                : null;

        if (!token) return;

        var respuesta = await fetch(
            '/api/media/liberar',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },

                body: JSON.stringify({
                    url: mediaUrl
                })
            }
        );

        if (!respuesta.ok) {
            console.warn(
                'No se pudo liberar el archivo:',
                respuesta.status
            );
        }

    } catch (e) {
        console.warn(
            'Error liberando archivo:',
            e
        );
    }
}

var pubEliminacionesEnProceso = {};

async function eliminarMiPublicacion(
    publicacionId,
    event
) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (pubEliminacionesEnProceso[publicacionId]) {
        return;
    }

    if (
        !confirm(
            '¿Seguro que quieres eliminar esta publicación?'
        )
    ) {
        return;
    }

    pubEliminacionesEnProceso[publicacionId] = true;

    try {
        var client = window.supabaseClient;

        if (!client) {
            throw new Error('Supabase no está listo.');
        }

        var pubRes = await client
            .from('publicaciones')
            .select('media_url')
            .eq('id', publicacionId)
            .maybeSingle();

        if (pubRes.error) throw pubRes.error;

        var mediaUrl = pubRes.data
            ? pubRes.data.media_url
            : null;

        var result = await client
            .from('publicaciones')
            .delete()
            .eq('id', publicacionId)
            .select('id');

        if (result.error) throw result.error;

        if (!result.data || result.data.length === 0) {
            throw new Error(
                'No tienes permiso para eliminar esta publicación.'
            );
        }

        // El backend decide si el archivo todavía está referenciado.
        await liberarArchivoPublicacion(mediaUrl);

        pubMostrarToast(
            'Publicación eliminada',
            'success'
        );

        await cargarMisPublicaciones(true);

    } catch (error) {
        console.error(
            'Error eliminando publicación:',
            error
        );

        pubMostrarToast(
            'Error al eliminar: ' +
            (
                error.message ||
                'Inténtalo nuevamente.'
            ),
            'error'
        );

    } finally {
        delete pubEliminacionesEnProceso[publicacionId];
    }
}

// ================================================================
// EXPORTACIONES PÚBLICAS
// ================================================================

window.descargarArchivoForzado =
    descargarArchivoForzado;

window.publicarDesdePerfil =
    publicarDesdePerfil;

window.seleccionarArchivoPerfil =
    seleccionarArchivoPerfil;

window.quitarArchivoPerfil =
    quitarArchivoPerfil;

window.toggleEmojiPickerPerfil =
    toggleEmojiPickerPerfil;

window.insertarHashtagPerfil =
    insertarHashtagPerfil;

window.eliminarComentarioPerfil =
    eliminarComentarioPerfil;

window.cargarMisPublicaciones =
    cargarMisPublicaciones;

window.reaccionarPublicacionPerfil =
    reaccionarPublicacionPerfil;

window.toggleComentariosPerfil =
    toggleComentariosPerfil;

window.enviarComentarioPerfil =
    enviarComentarioPerfil;

window.pubUrlPerfilAutor =
    pubUrlPerfilAutor;

window.formatearTextoConMenciones =
    formatearTextoConMenciones;

// ================================================================
// FIN · CSARIEL'S · PERFIL · PUBLICACIONES v5.8
// ================================================================