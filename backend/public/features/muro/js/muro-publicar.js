// ================================================================
// MURO · PUBLICAR
// ================================================================
// Crear publicaciones (texto + imagen), emoji picker, hashtags.
// Depende de: muro-config.js, muro-utils.js, muro-publicaciones.js
//
// v3 (moderación completa):
// - Texto: el trigger de la base rechaza frases bloqueadas
//   ('contenido_no_permitido') y manejarErrorModeracion() lo muestra.
// - Imagen: se sube a través de /api/media/upload, que la revisa con
//   Rekognition antes de guardarla. Ya no se sube directo a Storage.
// ================================================================

// ================================================================
// TOKEN DE SESIÓN (para llamadas al backend)
// ================================================================
async function obtenerTokenMuro() {
    var resultado = await supabaseClient.auth.getSession();
    var session = resultado && resultado.data ? resultado.data.session : null;
    return session ? session.access_token : null;
}

// ================================================================
// PUBLICAR (texto)
// ================================================================
async function publicar() {
    if (publicando) {
        showToast('Ya estás publicando', 'warning');
        return;
    }
    var postContent = document.getElementById('postContent');
    var btnPublicar = document.getElementById('btnPublicar');
    var contenido = postContent ? postContent.value.trim() : '';

    if (!contenido) {
        showToast('Escribe algo para publicar', 'error');
        return;
    }
    if (contenido.length > 5000) {
        showToast('Texto muy largo', 'error');
        return;
    }
    if (!sessionUser) {
        showToast('Inicia sesión', 'error');
        return;
    }

    publicando = true;
    if (btnPublicar) {
        btnPublicar.disabled = true;
        btnPublicar.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Publicando...';
    }

    try {
        var insertData = { usuario_id: sessionUser.id, contenido: contenido };
        if (temaSeleccionado) insertData.tema_id = temaSeleccionado;

        var result = await supabaseClient
            .from('muro_posts')
            .insert(insertData)
            .select()
            .single();
        if (result.error) throw result.error;

        postContent.value = '';
        temaSeleccionado = null;
        seleccionarTema(null);
        showToast('Publicación creada', 'success');

        await cargarPublicaciones(true);
        await cargarTendencias();
        await cargarTokensDestacados();
    } catch (e) {
        console.error('Error al publicar:', e);

        var esErrorModeracion =
            typeof manejarErrorModeracion === 'function' &&
            manejarErrorModeracion(e);

        if (!esErrorModeracion) {
            showToast('Error al publicar: ' + e.message, 'error');
        }
    } finally {
        publicando = false;
        if (btnPublicar) {
            btnPublicar.disabled = false;
            btnPublicar.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Publicar';
        }
    }
}

// ================================================================
// INSERTAR HASHTAG EN EL TEXTAREA
// ================================================================
function insertarHashtag() {
    var input = document.getElementById('postContent');
    if (!input) return;
    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    input.value = input.value.substring(0, start) + '#' + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + 1;
}

// ================================================================
// TOGGLE EMOJI PICKER
// ================================================================
function toggleEmojiPicker() {
    var picker = document.getElementById('emojiPicker');
    if (!picker) return;
    if (picker.classList.contains('show')) {
        picker.classList.remove('show');
        return;
    }
    var grid = document.getElementById('emojiGrid');
    if (grid && grid.children.length === 0) {
        emojisDisponibles.forEach(function(emoji) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = emoji;
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                insertarEmojiSeleccionado(emoji);
                picker.classList.remove('show');
            });
            grid.appendChild(btn);
        });
    }
    picker.classList.add('show');
}

function insertarEmojiSeleccionado(emoji) {
    var input = document.getElementById('postContent');
    if (!input) return;
    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
}

// ================================================================
// ABRIR SELECTOR DE IMAGEN
// ================================================================
function abrirSelectorImagen() {
    var input = document.getElementById('inputImagen');
    if (input) input.click();
}

// ================================================================
// SUBIR IMAGEN AL MURO (con moderación en el backend)
// ================================================================
// El archivo pasa por /api/media/upload. Si Rekognition lo rechaza,
// el backend responde 422 y no se guarda nada en Storage.
// ================================================================
async function subirImagenMuro(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (!sessionUser) {
        showToast('Inicia sesión', 'error');
        return;
    }
    if (!file.type.startsWith('image/')) {
        showToast('Solo imágenes', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Máximo 5MB', 'error');
        return;
    }

    try {
        showToast('Revisando y subiendo imagen...', '');

        var token = await obtenerTokenMuro();
        if (!token) throw new Error('Inicia sesión de nuevo');

        var fd = new FormData();
        fd.append('file', file);
        fd.append('destino', 'muro-imagenes');
        fd.append('tipo', 'imagen');

        var respuesta = await fetch('/api/media/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
        });
        var data = await respuesta.json().catch(function() { return {}; });

        if (!respuesta.ok || !data.ok) {
            // 422 = contenido rechazado por la moderación de imagen
            throw new Error(data.error || 'No se pudo subir la imagen');
        }

        var contenido = document.getElementById('postContent').value.trim();
        var insertData = {
            usuario_id: sessionUser.id,
            contenido: contenido,
            imagen_url: data.url
        };
        if (temaSeleccionado) insertData.tema_id = temaSeleccionado;

        var insertResult = await supabaseClient.from('muro_posts').insert(insertData);
        if (insertResult.error) throw insertResult.error;

        document.getElementById('postContent').value = '';
        temaSeleccionado = null;
        seleccionarTema(null);

        showToast('Publicación con imagen creada', 'success');
        event.target.value = '';

        await cargarPublicaciones(true);
    } catch (e) {
        console.error('Error subiendo imagen:', e);

        var esErrorModeracion =
            typeof manejarErrorModeracion === 'function' &&
            manejarErrorModeracion(e);

        if (!esErrorModeracion) {
            showToast(e.message, 'error');
        }
        event.target.value = '';
    }
}