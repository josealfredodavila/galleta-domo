// ================================================================
// MENSAJES · ESTADOS (VERSIÓN WHATSAPP-LIKE)
// ================================================================
// Estados con barra segmentada blanca, auto-avance, pausa con
// dedo, flecha ←, menú ⋮, footer "Responder" + emojis.
// Depende de: config, utils, auth, conversaciones.
// ================================================================

// ================================================================
// VARIABLES LOCALES DEL VISOR
// ================================================================
var _estadosViewerActuales = [];
var _estadoTimerRAF = null;
var _estadoInicioMs = 0;
var _estadoPausadoAcum = 0;
var _estadoPausaInicio = 0;
var _cerrandoViewer = false;

// ================================================================
// MARCAR ESTADO COMO VISTO (localStorage)
// ================================================================
function marcarEstadoVisto(estadoId) {
    estadoVistos[estadoId] = Date.now();
    try {
        localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos));
    } catch (e) {}
    limpiarVistosAntiguos();
}

function estadoEsNuevo(estado) {
    return !estadoVistos[estado.id];
}

function limpiarVistosAntiguos() {
    var limite = Date.now() - (48 * 60 * 60 * 1000);
    var cambio = false;
    Object.keys(estadoVistos).forEach(function(k) {
        if (estadoVistos[k] < limite) {
            delete estadoVistos[k];
            cambio = true;
        }
    });
    if (cambio) {
        try {
            localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos));
        } catch (e) {}
    }
}

// ================================================================
// REGISTRAR VISTA EN SUPABASE
// ================================================================
async function registrarVistaEstado(estadoId) {
    if (!user) return;
    try {
        await db.from('estados_vistas').upsert({
            estado_id: estadoId,
            usuario_id: user.id
        }, {
            onConflict: 'estado_id,usuario_id',
            ignoreDuplicates: true
        });
    } catch (e) {}
}

// ================================================================
// OBTENER NÚMERO DE VISTAS
// ================================================================
async function obtenerVistasEstado(estadoId) {
    try {
        var r = await db
            .from('estados_vistas')
            .select('id', { count: 'exact', head: true })
            .eq('estado_id', estadoId);
        if (r.error) return 0;
        return r.count || 0;
    } catch (e) {
        return 0;
    }
}

// ================================================================
// CARGAR ESTADOS ACTIVOS
// ================================================================
async function cargarEstados() {
    var scroll = $('estadosScroll');
    if (!scroll) return;
    scroll.innerHTML = '';
    if (!user) return;

    try {
        var r = await db
            .from('estados')
            .select('id, usuario_id, imagen_url, caption, created_at, expires_at')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true });

        if (r.error) {
            if (r.error.code === '42P01') {
                console.warn('[Estados] Tabla estados no existe aún');
                return;
            }
            throw r.error;
        }

        estadosCache = r.data || [];

        if (estadosCache.length === 0) {
            scroll.innerHTML = '<div style="color:var(--muted);font-size:.7rem;padding:8px 4px;text-align:center;width:100%;">Sin estados</div>';
            return;
        }

        // Agrupar por usuario
        var porUsuario = {};
        estadosCache.forEach(function(e) {
            if (!porUsuario[e.usuario_id]) porUsuario[e.usuario_id] = [];
            porUsuario[e.usuario_id].push(e);
        });

        // ---- MI ESTADO PRIMERO ----
        var miEstado = porUsuario[user.id];
        if (miEstado && miEstado.length > 0) {
            var tieneNuevos = miEstado.some(function(e) { return estadoEsNuevo(e); });
            var ultimoEstado = miEstado[miEstado.length - 1];
            var totalVistas = await obtenerVistasEstado(ultimoEstado.id);

            var htmlMiEstado =
                '<div class="estado-item" data-userid="' + user.id + '" style="position:relative;">' +
                    '<div class="estado-circle ' + (tieneNuevos ? '' : 'visto') + '">' +
                        '<div class="estado-inner">' +
                            '<img src="' + esc(ultimoEstado.imagen_url) + '" alt="">' +
                        '</div>' +
                    '</div>' +
                    (totalVistas > 0 ? '<span class="estado-vistas-badge">' + totalVistas + '</span>' : '') +
                    '<div class="estado-name">Tú</div>' +
                '</div>';

            scroll.insertAdjacentHTML('beforeend', htmlMiEstado);

            var miEstadoEl = scroll.querySelector('[data-userid="' + user.id + '"]');
            if (miEstadoEl) {
                miEstadoEl.onclick = function() { abrirEstadoUsuario(user.id); };
            }
        }

        // ---- ESTADOS DE OTROS USUARIOS ----
        var otrosIds = Object.keys(porUsuario).filter(function(uid) { return uid !== user.id; });

        for (var i = 0; i < otrosIds.length; i++) {
            var uid = otrosIds[i];
            var p = await profile(uid);
            var estadosUsuario = porUsuario[uid];
            var tieneNuevos2 = estadosUsuario.some(function(e) { return estadoEsNuevo(e); });

            var html =
                '<div class="estado-item" data-userid="' + uid + '">' +
                    '<div class="estado-circle ' + (tieneNuevos2 ? '' : 'visto') + '">' +
                        '<div class="estado-inner">' +
                            avatarEstadoHTML(p) +
                        '</div>' +
                    '</div>' +
                    '<div class="estado-name">' + esc(p.nombre || 'Usuario') + '</div>' +
                '</div>';

            scroll.insertAdjacentHTML('beforeend', html);

            (function(id) {
                var el = scroll.querySelector('[data-userid="' + id + '"]');
                if (el) {
                    el.onclick = function() { abrirEstadoUsuario(id); };
                }
            })(uid);
        }
    } catch (e) {
        console.warn('[Estados] Error cargando:', e);
    }
}

// ================================================================
// ABRIR ESTADO DE UN USUARIO
// ================================================================
function abrirEstadoUsuario(uid) {
    var estadosUsuario = estadosCache.filter(function(e) { return e.usuario_id === uid; });
    estadosUsuario.sort(function(a, b) {
        return new Date(a.created_at) - new Date(b.created_at);
    });

    if (estadosUsuario.length === 0) {
        toast('ℹ️ Este usuario no tiene estados', 'warning');
        return;
    }

    _estadosViewerActuales = estadosUsuario;
    estadoActualUserId = uid;
    estadoActualIndex = 0;
    estadoProgresoActual = 0;
    estadoPausado = false;
    _cerrandoViewer = false;

    var viewer = $('estadoViewer');
    if (viewer) viewer.classList.add('show');

    construirBarraSegmentada(estadosUsuario.length);
    mostrarEstadoActual();
}

// ================================================================
// CONSTRUIR BARRA SEGMENTADA
// ================================================================
function construirBarraSegmentada(total) {
    var container = $('estadoProgress');
    if (!container) return;

    var html = '';
    for (var i = 0; i < total; i++) {
        html += '<div class="estado-segmento">' +
            '<div class="estado-segmento-fill" id="segmento-fill-' + i + '"></div>' +
        '</div>';
    }
    container.innerHTML = html;
}

// ================================================================
// ACTUALIZAR BARRA SEGMENTADA
// ================================================================
function actualizarBarraSegmentada(porcentaje) {
    for (var i = 0; i < estadoActualIndex; i++) {
        var fillAnt = document.getElementById('segmento-fill-' + i);
        if (fillAnt) fillAnt.style.width = '100%';
    }

    for (var j = estadoActualIndex + 1; j < _estadosViewerActuales.length; j++) {
        var fillPost = document.getElementById('segmento-fill-' + j);
        if (fillPost) fillPost.style.width = '0%';
    }

    var fillActual = document.getElementById('segmento-fill-' + estadoActualIndex);
    if (fillActual) fillActual.style.width = porcentaje + '%';
}

// ================================================================
// MOSTRAR ESTADO ACTUAL
// ================================================================
async function mostrarEstadoActual() {
    if (estadoActualIndex >= _estadosViewerActuales.length) {
        cerrarEstadoViewer();
        return;
    }

    var estado = _estadosViewerActuales[estadoActualIndex];
    var esMiEstado = user && (estadoActualUserId === user.id);

    // ---- CABECERA ----
    if (esMiEstado) {
        var evAvatar = $('evAvatar');
        if (evAvatar) {
            evAvatar.innerHTML = avatarEstadoHTML(currentUserProfile, '◈');
        }
        var evName = $('evName');
        if (evName) evName.textContent = 'Tú';
    } else {
        var indexCapturado = estadoActualIndex;
        var uidCapturado = estadoActualUserId;

        db.from('perfiles_publicos')
            .select('nombre, handle, avatar_url')
            .eq('id', uidCapturado)
            .maybeSingle()
            .then(function(r) {
                if (estadoActualIndex !== indexCapturado) return;
                if (estadoActualUserId !== uidCapturado) return;
                if (r.data) {
                    var evAvatar2 = $('evAvatar');
                    if (evAvatar2) evAvatar2.innerHTML = avatarEstadoHTML(r.data, '◈');
                    var evName2 = $('evName');
                    if (evName2) evName2.textContent = r.data.nombre || 'Usuario';
                }
            });
    }

    // ---- IMAGEN ----
    var evImage = $('evImage');
    if (evImage) {
        evImage.onerror = function() {
            evImage.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23111"/><text x="100" y="110" fill="%23888" text-anchor="middle" font-size="14">Imagen no disponible</text></svg>';
        };
        evImage.src = estado.imagen_url;
    }

    // ---- HORA Y CAPTION ----
    var evTime = $('evTime');
    if (evTime) evTime.textContent = haceTiempo(estado.created_at);

    var evCaption = $('evCaption');
    if (evCaption) {
        if (estado.caption) {
            evCaption.textContent = estado.caption;
            evCaption.classList.remove('hidden');
        } else {
            evCaption.classList.add('hidden');
        }
    }

    // ---- MARCAR VISTO (solo si NO es mi estado) ----
    if (!esMiEstado) {
        marcarEstadoVisto(estado.id);
        registrarVistaEstado(estado.id);
    }

    // ---- NAVEGACIÓN ----
    var evPrev = $('evPrev');
    if (evPrev) evPrev.classList.toggle('hidden', estadoActualIndex === 0);

    var evNext = $('evNext');
    if (evNext) {
        evNext.classList.toggle('hidden', estadoActualIndex >= _estadosViewerActuales.length - 1);
    }

    // ---- ARRANCAR TIMER ----
    iniciarTemporizadorEstado();
}

// ================================================================
// TIMER CON requestAnimationFrame
// ================================================================
function iniciarTemporizadorEstado() {
    if (_estadoTimerRAF) {
        cancelAnimationFrame(_estadoTimerRAF);
        _estadoTimerRAF = null;
    }

    _estadoInicioMs = performance.now();
    _estadoPausadoAcum = 0;
    _estadoPausaInicio = 0;
    estadoProgresoActual = 0;
    estadoPausado = false;

    function tick(ahora) {
        if (estadoPausado) {
            _estadoTimerRAF = requestAnimationFrame(tick);
            return;
        }

        var elapsed = ahora - _estadoInicioMs - _estadoPausadoAcum;
        var porcentaje = Math.min(100, (elapsed / ESTADO_DURACION_MS) * 100);
        estadoProgresoActual = porcentaje;

        actualizarBarraSegmentada(porcentaje);

        if (porcentaje >= 100) {
            _estadoTimerRAF = null;
            setTimeout(function() { siguienteEstado(); }, 60);
            return;
        }

        _estadoTimerRAF = requestAnimationFrame(tick);
    }

    _estadoTimerRAF = requestAnimationFrame(tick);
}

// ================================================================
// SIGUIENTE ESTADO
// ================================================================
function siguienteEstado() {
    if (_cerrandoViewer) return;
    if (_estadoTimerRAF) {
        cancelAnimationFrame(_estadoTimerRAF);
        _estadoTimerRAF = null;
    }

    if (estadoActualIndex < _estadosViewerActuales.length - 1) {
        var fillActual = document.getElementById('segmento-fill-' + estadoActualIndex);
        if (fillActual) fillActual.style.width = '100%';

        estadoActualIndex++;
        estadoProgresoActual = 0;
        estadoPausado = false;
        mostrarEstadoActual();
    } else {
        var fillUltimo = document.getElementById('segmento-fill-' + estadoActualIndex);
        if (fillUltimo) fillUltimo.style.width = '100%';

        _cerrandoViewer = true;
        setTimeout(function() {
            _cerrandoViewer = false;
            cerrarEstadoViewer();
        }, 250);
    }
}

// ================================================================
// ESTADO ANTERIOR
// ================================================================
function anteriorEstado() {
    if (_cerrandoViewer) return;
    if (_estadoTimerRAF) {
        cancelAnimationFrame(_estadoTimerRAF);
        _estadoTimerRAF = null;
    }

    if (estadoActualIndex > 0) {
        estadoActualIndex--;
        estadoProgresoActual = 0;
        estadoPausado = false;
        mostrarEstadoActual();
    }
}

// ================================================================
// CERRAR VISOR
// ================================================================
function cerrarEstadoViewer() {
    if (_estadoTimerRAF) {
        cancelAnimationFrame(_estadoTimerRAF);
        _estadoTimerRAF = null;
    }

    estadoPausado = false;
    estadoProgresoActual = 0;
    estadoActualIndex = 0;
    estadoActualUserId = null;
    _estadosViewerActuales = [];
    _estadoPausadoAcum = 0;
    _estadoPausaInicio = 0;

    var viewer = $('estadoViewer');
    if (viewer) viewer.classList.remove('show');

    var container = $('estadoProgress');
    if (container) container.innerHTML = '';

    cargarEstados();
}

// ================================================================
// PAUSAR / REANUDAR
// ================================================================
function activarPausaEstado() {
    var viewer = $('estadoViewer');
    if (!viewer || !viewer.classList.contains('show')) return;
    if (estadoPausado) return;
    estadoPausado = true;
    _estadoPausaInicio = performance.now();
}

function desactivarPausaEstado() {
    var viewer = $('estadoViewer');
    if (!viewer || !viewer.classList.contains('show')) return;
    if (!estadoPausado) return;
    estadoPausado = false;
    _estadoPausadoAcum += performance.now() - _estadoPausaInicio;
    _estadoPausaInicio = 0;
}

// ================================================================
// MODAL DE VISTAS
// ================================================================
async function abrirVistasModal(estadoId) {
    if (!estadoId) return;
    activarPausaEstado();

    var modal = $('vistasModal');
    if (modal) modal.classList.add('show');

    var list = $('vistasList');
    if (list) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>';
    }

    var countEl = $('vistasModalCount');
    if (countEl) countEl.textContent = '';

    try {
        var r = await db
            .from('estados_vistas')
            .select('usuario_id, visto_at')
            .eq('estado_id', estadoId)
            .order('visto_at', { ascending: false });

        if (r.error) throw r.error;

        var vistas = r.data || [];

        if (vistas.length === 0) {
            if (list) {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Nadie ha visto este estado aún</div>';
            }
            return;
        }

        if (countEl) countEl.textContent = '(' + vistas.length + ')';

        var ids = vistas.map(function(v) { return v.usuario_id; });
        var perfilesResult = await db
            .from('perfiles_publicos')
            .select('id, nombre, handle, avatar_url')
            .in('id', ids);

        var perfilMap = {};
        (perfilesResult.data || []).forEach(function(p) { perfilMap[p.id] = p; });

        if (!list) return;
        list.innerHTML = '';

        vistas.forEach(function(v) {
            var p = perfilMap[v.usuario_id] || { nombre: 'Usuario', handle: '', avatar_url: null };
            var inicial = (p.nombre || '◈').charAt(0).toUpperCase();
            var avatarHTML = p.avatar_url
                ? '<img src="' + esc(p.avatar_url) + '" alt="">'
                : esc(inicial);

            list.insertAdjacentHTML('beforeend',
                '<div class="result" style="cursor:pointer;" data-handle="' + esc(p.handle || '') + '">' +
                    '<div class="avatar">' + avatarHTML + '</div>' +
                    '<div style="flex:1;min-width:0;">' +
                        '<b>' + esc(p.nombre || 'Usuario') + '</b>' +
                        '<div style="font-size:.68rem;color:var(--muted);">@' + esc(p.handle || 'usuario') + ' · ' + haceTiempo(v.visto_at) + '</div>' +
                    '</div>' +
                '</div>');
        });

        list.querySelectorAll('.result').forEach(function(el) {
            el.onclick = function() {
                var handle = el.dataset.handle;
                if (handle) window.location.href = '/perfil/' + handle;
            };
        });
    } catch (e) {
        console.error('[Estados] Error cargando vistas:', e);
        if (list) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:.8rem;">Error al cargar vistas</div>';
        }
    }
}

function cerrarVistasModal() {
    var modal = $('vistasModal');
    if (modal) modal.classList.remove('show');
    desactivarPausaEstado();
}

// ================================================================
// MODAL DE SUBIR ESTADO
// ================================================================
function abrirModalEstado() {
    var modal = $('estadoUploadModal');
    if (modal) modal.classList.add('show');

    var wrap = $('estadoPreviewWrap');
    if (wrap) wrap.style.display = 'none';

    var img = $('estadoPreviewImg');
    if (img) img.src = '';

    var caption = $('estadoCaption');
    if (caption) caption.value = '';

    var btn = $('btnPublicarEstado');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Publicar estado';
    }

    var fileInput = $('estadoFileInput');
    if (fileInput) fileInput.value = '';
}

function cerrarModalEstado() {
    var modal = $('estadoUploadModal');
    if (modal) modal.classList.remove('show');
}

function seleccionarArchivoEstado() {
    var fileInput = $('estadoFileInput');
    if (fileInput) fileInput.click();
}

function previewEstado(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE) {
        toast('❌ La imagen no puede superar 5 MB', 'error');
        event.target.value = '';
        return;
    }
    if (file.type.indexOf('image/') !== 0) {
        toast('❌ Solo se permiten imágenes', 'error');
        event.target.value = '';
        return;
    }

    var reader = new FileReader();
    reader.onload = function(e) {
        var img = $('estadoPreviewImg');
        if (img) img.src = e.target.result;

        var wrap = $('estadoPreviewWrap');
        if (wrap) wrap.style.display = 'block';

        var btn = $('btnPublicarEstado');
        if (btn) btn.disabled = false;
    };
    reader.readAsDataURL(file);
}

async function publicarEstado() {
    var fileInput = $('estadoFileInput');
    var file = fileInput ? fileInput.files[0] : null;
    if (!file) {
        toast('⚠️ Selecciona una imagen', 'error');
        return;
    }
    if (!await auth()) return;

    var captionEl = $('estadoCaption');
    var caption = captionEl ? captionEl.value.trim() : '';

    var btn = $('btnPublicarEstado');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Publicando...';
    }

    try {
        var fileExt = file.name.split('.').pop().toLowerCase();
        var filePath = user.id + '/' + Date.now() + '.' + fileExt;

        var uploadResult = await db.storage
            .from(ESTADOS_BUCKET)
            .upload(filePath, file, { upsert: false, contentType: file.type });

        if (uploadResult.error) throw uploadResult.error;

        var urlData = db.storage.from(ESTADOS_BUCKET).getPublicUrl(filePath);
        var publicUrl = urlData.data.publicUrl;

        var insertResult = await db.from('estados').insert({
            usuario_id: user.id,
            imagen_url: publicUrl,
            caption: caption || null
        });

        if (insertResult.error) throw insertResult.error;

        toast('✅ Estado publicado (24h)', 'success');
        cerrarModalEstado();
        await cargarEstados();
    } catch (e) {
        console.error('[Estados] Error publicando:', e);

        if (e.message && (e.message.indexOf('Bucket') !== -1 || e.message.indexOf('not found') !== -1)) {
            toast('❌ Bucket "' + ESTADOS_BUCKET + '" no existe. Créalo en Supabase.', 'error');
        } else if (e.code === '42P01') {
            toast('❌ Tabla "estados" no existe. Ejecuta el SQL.', 'error');
        } else {
            toast('❌ Error: ' + e.message, 'error');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Publicar estado';
        }
    }
}

console.log('[Mensajes] ✅ Estados cargado');