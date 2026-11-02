// ================================================================
// MURO · PUBLICAR
// ================================================================
// Crear publicaciones (texto + imagen + venta P2P de producto),
// emoji picker, hashtags.
// Depende de: muro-config.js, muro-utils.js, muro-publicaciones.js
//
// v3.1 (Venta P2P de productos):
// - Nuevo bloque "Vender producto" en el compositor. Al activarlo
//   se piden título y precio en MXN. Se guarda en la columna
//   metadata_interactiva (jsonb) de muro_posts con el formato:
//     { tipo: 'venta_producto', titulo: string, precio_mxn: number,
//       vendedor_id: uuid, moneda: 'MXN', creado_at: ISO }
// - Se valida que el precio sea un número > 0 y el título no vacío.
// - El trigger de moderación de texto sigue aplicando al contenido.
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
// ESTADO DEL COMPOSITOR DE VENTA
// ================================================================
// Se declara aquí para que el HTML del compositor pueda leerlo
// sin depender del orden de carga de scripts.
if (typeof window.muroVentaEstado === 'undefined') {
    window.muroVentaEstado = {
        activa: false,
        titulo: '',
        precio_mxn: 0
    };
}

// ================================================================
// TOGGLE "VENDER PRODUCTO"
// ================================================================
// El botón del compositor llama a esta función. Muestra/oculta
// los campos de título y precio.
// ================================================================
function toggleVentaProducto() {
    var estado = window.muroVentaEstado;
    estado.activa = !estado.activa;

    var panel = document.getElementById('ventaProductoPanel');
    var btn = document.getElementById('btnToggleVenta');

    if (panel) {
        panel.style.display = estado.activa ? 'block' : 'none';
    }

    if (btn) {
        if (estado.activa) {
            btn.classList.add('activo');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.classList.remove('activo');
            btn.setAttribute('aria-pressed', 'false');
            // Limpiamos los campos al desactivar
            var inputTitulo = document.getElementById('ventaTitulo');
            var inputPrecio = document.getElementById('ventaPrecio');
            if (inputTitulo) inputTitulo.value = '';
            if (inputPrecio) inputPrecio.value = '';
            estado.titulo = '';
            estado.precio_mxn = 0;
            actualizarPreviewVenta();
        }
    }
}

// ================================================================
// ACTUALIZAR PREVIEW / CAPTURAR DATOS
// ================================================================
// Llamado por oninput en los campos de título y precio.
// ================================================================
function actualizarPreviewVenta() {
    var estado = window.muroVentaEstado;
    var inputTitulo = document.getElementById('ventaTitulo');
    var inputPrecio = document.getElementById('ventaPrecio');
    var preview = document.getElementById('ventaPreview');

    estado.titulo = inputTitulo ? inputTitulo.value.trim() : '';

    var precioRaw = inputPrecio ? inputPrecio.value.trim() : '';
    var precioNum = parseFloat(precioRaw);
    estado.precio_mxn = isFinite(precioNum) && precioNum > 0 ? precioNum : 0;

    if (preview) {
        if (estado.titulo && estado.precio_mxn > 0) {
            var mxn = estado.precio_mxn.toFixed(2);
            preview.innerHTML =
                '<span class="preview-label">Vista previa</span>' +
                '<span class="preview-titulo">' + escapeHTML(estado.titulo) + '</span>' +
                '<span class="preview-precio">$' + mxn + ' MXN</span>';
            preview.style.display = 'flex';
        } else {
            preview.style.display = 'none';
        }
    }
}

// ================================================================
// VALIDAR DATOS DE VENTA
// ================================================================
function validarVentaProducto() {
    var estado = window.muroVentaEstado;
    if (!estado.activa) return { ok: true };

    if (!estado.titulo || estado.titulo.length < 3) {
        return { ok: false, error: 'El título debe tener al menos 3 caracteres' };
    }
    if (estado.titulo.length > 120) {
        return { ok: false, error: 'El título es demasiado largo (máx. 120)' };
    }
    if (!isFinite(estado.precio_mxn) || estado.precio_mxn <= 0) {
        return { ok: false, error: 'Ingresa un precio válido en MXN' };
    }
    if (estado.precio_mxn > 1000000) {
        return { ok: false, error: 'El precio máximo es $1,000,000 MXN' };
    }
    return { ok: true };
}

// ================================================================
// CONSTRUIR METADATA INTERACTIVA
// ================================================================
function construirMetadataInteractiva() {
    var estado = window.muroVentaEstado;
    if (!estado.activa) return null;

    return {
        tipo: 'venta_producto',
        titulo: estado.titulo,
        precio_mxn: Number(estado.precio_mxn.toFixed(2)),
        moneda: 'MXN',
        vendedor_id: sessionUser ? sessionUser.id : null,
        creado_at: new Date().toISOString()
    };
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

    // Validación de venta P2P
    var validacionVenta = validarVentaProducto();
    if (!validacionVenta.ok) {
        showToast(validacionVenta.error, 'error');
        return;
    }

    // Si hay venta activa, permitimos publicar incluso sin texto
    // (el título/precio describen el producto).
    var ventaActiva = window.muroVentaEstado.activa;
    if (!contenido && !ventaActiva) {
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

        // === NUEVO: metadata de venta de producto ===
        var metadata = construirMetadataInteractiva();
        if (metadata) {
            insertData.metadata_interactiva = metadata;
        }

        var result = await supabaseClient
            .from('muro_posts')
            .insert(insertData)
            .select()
            .single();
        if (result.error) throw result.error;

        // Limpiar compositor
        postContent.value = '';
        temaSeleccionado = null;
        seleccionarTema(null);

        // Resetear estado de venta
        if (window.muroVentaEstado.activa) {
            toggleVentaProducto();
        }

        showToast(
            metadata ? 'Producto publicado' : 'Publicación creada',
            'success'
        );

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
            throw new Error(data.error || 'No se pudo subir la imagen');
        }

        var contenido = document.getElementById('postContent').value.trim();
        var insertData = {
            usuario_id: sessionUser.id,
            contenido: contenido,
            imagen_url: data.url
        };
        if (temaSeleccionado) insertData.tema_id = temaSeleccionado;

        // Permitir venta de producto también con imagen
        var validacionVenta = validarVentaProducto();
        if (!validacionVenta.ok) {
            throw new Error(validacionVenta.error);
        }
        var metadata = construirMetadataInteractiva();
        if (metadata) insertData.metadata_interactiva = metadata;

        var insertResult = await supabaseClient.from('muro_posts').insert(insertData);
        if (insertResult.error) throw insertResult.error;

        document.getElementById('postContent').value = '';
        temaSeleccionado = null;
        seleccionarTema(null);

        // Resetear estado de venta
        if (window.muroVentaEstado.activa) {
            toggleVentaProducto();
        }

        showToast('Publicación creada', 'success');
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

// Exponer funciones usadas desde el HTML
window.toggleVentaProducto = toggleVentaProducto;
window.actualizarPreviewVenta = actualizarPreviewVenta;