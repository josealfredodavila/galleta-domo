// ================================================================
// MENSAJES · ESTADOS
// ================================================================
function marcarEstadoVisto(estadoId) { estadoVistos[estadoId] = Date.now(); try { localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos)); } catch (e) {} }
function estadoEsNuevo(estado) { return !estadoVistos[estado.id]; }
function limpiarVistosAntiguos() {
    var limite = Date.now() - (48 * 60 * 60 * 1000);
    Object.keys(estadoVistos).forEach(function(k) { if (estadoVistos[k] < limite) delete estadoVistos[k]; });
    try { localStorage.setItem('sariels_estados_vistos', JSON.stringify(estadoVistos)); } catch (e) {}
}

async function registrarVistaEstado(estadoId) {
    if (!user) return;
    try { await db.from('estados_vistas').upsert({ estado_id: estadoId, usuario_id: user.id }, { onConflict: 'estado_id,usuario_id', ignoreDuplicates: true }); } catch (e) {}
}

async function obtenerVistasEstado(estadoId) {
    try { var result = await db.from('estados_vistas').select('id', { count: 'exact', head: true }).eq('estado_id', estadoId); if (result.error) return 0; return result.count || 0; } catch (e) { return 0; }
}

async function cargarEstados() {
    var scroll = $('estadosScroll'); if (!scroll) return;
    scroll.innerHTML = '';
    if (!user) return;
    try {
        var result = await db.from('estados').select('id, usuario_id, imagen_url, caption, created_at, expires_at').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true });
        if (result.error) { if (result.error.code === '42P01') { console.warn('Tabla estados no existe aún'); return; } throw result.error; }
        estadosCache = result.data || [];
        if (estadosCache.length === 0) { scroll.innerHTML = '<div style="color:var(--muted);font-size:.7rem;padding:8px 4px;text-align:center;width:100%;">Sin estados</div>'; return; }
        var porUsuario = {};
        estadosCache.forEach(function(e) { if (!porUsuario[e.usuario_id]) porUsuario[e.usuario_id] = []; porUsuario[e.usuario_id].push(e); });
        var miEstado = porUsuario[user.id];
        if (miEstado && miEstado.length > 0) {
            var tieneNuevos = miEstado.some(function(e) { return estadoEsNuevo(e); });
            var ultimoEstado = miEstado[miEstado.length - 1];
            var totalVistas = await obtenerVistasEstado(ultimoEstado.id);
            var htmlMiEstado = '<div class="estado-item" data-userid="' + user.id + '" style="position:relative;"><div class="estado-circle ' + (tieneNuevos ? '' : 'visto') + '"><div class="estado-inner"><img src="' + esc(ultimoEstado.imagen_url) + '" alt=""></div></div>' + (totalVistas > 0 ? '<span class="estado-vistas-badge">' + totalVistas + '</span>' : '') + '<div class="estado-name">Tú</div></div>';
            scroll.insertAdjacentHTML('beforeend', htmlMiEstado);
            var miEstadoEl = scroll.querySelector('[data-userid="' + user.id + '"]');
            if (miEstadoEl) miEstadoEl.onclick = function() { abrirEstadoUsuario(user.id); };
        }
        var otrosIds = Object.keys(porUsuario).filter(function(uid) { return uid !== user.id; });
        for (var i = 0; i < otrosIds.length; i++) {
            var uid = otrosIds[i];
            var p = await profile(uid);
            var estadosUsuario = porUsuario[uid];
            var tieneNuevos2 = estadosUsuario.some(function(e) { return estadoEsNuevo(e); });
            var html = '<div class="estado-item" data-userid="' + uid + '"><div class="estado-circle ' + (tieneNuevos2 ? '' : 'visto') + '"><div class="estado-inner">' + (p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="">' : esc((p.nombre || '◈').charAt(0).toUpperCase())) + '</div></div><div class="estado-name">' + esc(p.nombre || 'Usuario') + '</div></div>';
            scroll.insertAdjacentHTML('beforeend', html);
            var el = scroll.querySelector('[data-userid="' + uid + '"]');
            if (el) el.onclick = (function(id) { return function() { abrirEstadoUsuario(id); }; })(uid);
        }
    } catch (e) { console.warn('Error cargando estados:', e); }
}

function abrirEstadoUsuario(uid) {
    var estados = estadosCache.filter(function(e) { return e.usuario_id === uid; });
    if (estados.length === 0) { toast('ℹ️ Este usuario no tiene estados', 'warning'); return; }
    estadoActualUserId = uid;
    estadoActualIndex = 0;
    estadoProgresoActual = 0;
    estadoPausado = false;
    mostrarEstadoActual();
    var viewer = $('estadoViewer'); if (viewer) viewer.classList.add('show');
}

async function mostrarEstadoActual() {
    var estados = estadosCache.filter(function(e) { return e.usuario_id === estadoActualUserId; });
    if (estadoActualIndex >= estados.length) { cerrarEstadoViewer(); return; }
    var estado = estados[estadoActualIndex];
    var esMiEstado = (estadoActualUserId === user.id);
    if (esMiEstado) {
        var evAvatar = $('evAvatar'); if (evAvatar) evAvatar.innerHTML = (currentUserProfile && currentUserProfile.avatar_url) ? '<img src="' + esc(currentUserProfile.avatar_url) + '" alt="">' : esc((currentUserProfile && currentUserProfile.nombre || '◈').charAt(0).toUpperCase());
        var evName = $('evName'); if (evName) evName.textContent = 'Tú';
    } else {
        db.from('perfiles_publicos').select('nombre, handle, avatar_url').eq('id', estadoActualUserId).maybeSingle().then(function(r) {
            if (r.data) {
                var evAvatar2 = $('evAvatar'); if (evAvatar2) evAvatar2.innerHTML = r.data.avatar_url ? '<img src="' + esc(r.data.avatar_url) + '" alt="">' : esc((r.data.nombre || '◈').charAt(0).toUpperCase());
                var evName2 = $('evName'); if (evName2) evName2.textContent = r.data.nombre || 'Usuario';
            }
        });
    }
    var evImage = $('evImage'); if (evImage) evImage.src = estado.imagen_url;
    var evTime = $('evTime'); if (evTime) evTime.textContent = haceTiempo(estado.created_at);
    var evCaption = $('evCaption');
    if (evCaption) { if (estado.caption) { evCaption.textContent = estado.caption; evCaption.classList.remove('hidden'); } else evCaption.classList.add('hidden'); }
    marcarEstadoVisto(estado.id);
    registrarVistaEstado(estado.id);
    var evPrev = $('evPrev'); if (evPrev) evPrev.classList.toggle('hidden', estadoActualIndex === 0);
    var evNext = $('evNext'); if (evNext) evNext.classList.toggle('hidden', estadoActualIndex >= estados.length - 1);
    if (esMiEstado) {
        var total = await obtenerVistasEstado(estado.id);
        var evVistasCount = $('evVistasCount'); if (evVistasCount) evVistasCount.textContent = total;
        var evVistas = $('evVistas'); if (evVistas) { evVistas.classList.remove('hidden'); evVistas.dataset.estadoId = estado.id; }
    } else { var evVistas2 = $('evVistas'); if (evVistas2) evVistas2.classList.add('hidden'); }
    iniciarProgresoEstado();
}

function iniciarProgresoEstado() {
    var progress = $('estadoProgress'); if (!progress) return;
    if (estadoTimer) clearInterval(estadoTimer);
    progress.style.width = estadoProgresoActual + '%';
    estadoTimer = setInterval(function() {
        if (estadoPausado) return;
        estadoProgresoActual += 1;
        progress.style.width = estadoProgresoActual + '%';
        if (estadoProgresoActual >= 100) { clearInterval(estadoTimer); estadoProgresoActual = 0; siguienteEstado(); }
    }, 50);
}

function siguienteEstado() {
    var estados = estadosCache.filter(function(e) { return e.usuario_id === estadoActualUserId; });
    if (estadoActualIndex < estados.length - 1) { estadoActualIndex++; estadoProgresoActual = 0; estadoPausado = false; mostrarEstadoActual(); }
    else cerrarEstadoViewer();
}
function anteriorEstado() { if (estadoActualIndex > 0) { estadoActualIndex--; estadoProgresoActual = 0; estadoPausado = false; mostrarEstadoActual(); } }

function cerrarEstadoViewer() {
    var viewer = $('estadoViewer'); if (viewer) viewer.classList.remove('show');
    if (estadoTimer) clearInterval(estadoTimer);
    estadoTimer = null; estadoPausado = false; estadoProgresoActual = 0; estadoActualUserId = null;
    cargarEstados();
}
function activarPausaEstado() { var viewer = $('estadoViewer'); if (!viewer || !viewer.classList.contains('show')) return; estadoPausado = true; }
function desactivarPausaEstado() { var viewer = $('estadoViewer'); if (!viewer || !viewer.classList.contains('show')) return; estadoPausado = false; }

async function abrirVistasModal(estadoId) {
    if (!estadoId) return;
    var modal = $('vistasModal'); if (modal) modal.classList.add('show');
    var list = $('vistasList'); if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Cargando…</div>';
    var countEl = $('vistasModalCount'); if (countEl) countEl.textContent = '';
    try {
        var result = await db.from('estados_vistas').select('usuario_id, visto_at').eq('estado_id', estadoId).order('visto_at', { ascending: false });
        if (result.error) throw result.error;
        var vistas = result.data || [];
        if (vistas.length === 0) { if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;">Nadie ha visto este estado aún</div>'; return; }
        if (countEl) countEl.textContent = '(' + vistas.length + ')';
        var ids = vistas.map(function(v) { return v.usuario_id; });
        var perfilesResult = await db.from('perfiles_publicos').select('id, nombre, handle, avatar_url').in('id', ids);
        var perfilMap = {};
        (perfilesResult.data || []).forEach(function(p) { perfilMap[p.id] = p; });
        if (!list) return;
        list.innerHTML = '';
        vistas.forEach(function(v) {
            var p = perfilMap[v.usuario_id] || { nombre: 'Usuario', handle: '', avatar_url: null };
            var inicial = (p.nombre || '◈').charAt(0).toUpperCase();
            var avatarHTML = p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="">' : esc(inicial);
            list.insertAdjacentHTML('beforeend', '<div class="result" style="cursor:pointer;" data-handle="' + esc(p.handle || '') + '"><div class="avatar">' + avatarHTML + '</div><div style="flex:1;min-width:0;"><b>' + esc(p.nombre || 'Usuario') + '</b><div style="font-size:.68rem;color:var(--muted);">@' + esc(p.handle || 'usuario') + ' · ' + haceTiempo(v.visto_at) + '</div></div></div>');
        });
        list.querySelectorAll('.result').forEach(function(el) { el.onclick = function() { var handle = el.dataset.handle; if (handle) window.location.href = '/perfil/' + handle; }; });
    } catch (e) { console.error('Error cargando vistas:', e); if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:.8rem;">Error al cargar vistas</div>'; }
}

function cerrarVistasModal() { var modal = $('vistasModal'); if (modal) modal.classList.remove('show'); }

function abrirModalEstado() {
    var modal = $('estadoUploadModal'); if (modal) modal.classList.add('show');
    var wrap = $('estadoPreviewWrap'); if (wrap) wrap.style.display = 'none';
    var img = $('estadoPreviewImg'); if (img) img.src = '';
    var caption = $('estadoCaption'); if (caption) caption.value = '';
    var btn = $('btnPublicarEstado'); if (btn) btn.disabled = true;
    var fileInput = $('estadoFileInput'); if (fileInput) fileInput.value = '';
}
function cerrarModalEstado() { var modal = $('estadoUploadModal'); if (modal) modal.classList.remove('show'); }
function seleccionarArchivoEstado() { var fileInput = $('estadoFileInput'); if (fileInput) fileInput.click(); }

async function previewEstado(event) {
    var file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('❌ La imagen no puede superar 5 MB', 'error'); event.target.value = ''; return; }
    if (file.type.indexOf('image/') !== 0) { toast('❌ Solo se permiten imágenes', 'error'); event.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = $('estadoPreviewImg'); if (img) img.src = e.target.result;
        var wrap = $('estadoPreviewWrap'); if (wrap) wrap.style.display = 'block';
        var btn = $('btnPublicarEstado'); if (btn) btn.disabled = false;
    };
    reader.readAsDataURL(file);
}

async function publicarEstado() {
    var fileInput = $('estadoFileInput');
    var file = fileInput ? fileInput.files[0] : null;
    if (!file) { toast('⚠️ Selecciona una imagen', 'error'); return; }
    if (!await auth()) return;
    var captionEl = $('estadoCaption');
    var caption = captionEl ? captionEl.value.trim() : '';
    var btn = $('btnPublicarEstado');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando...'; }
    try {
        var fileExt = file.name.split('.').pop().toLowerCase();
        var filePath = user.id + '/' + Date.now() + '.' + fileExt;
        var uploadResult = await db.storage.from(ESTADOS_BUCKET).upload(filePath, file, { upsert: false, contentType: file.type });
        if (uploadResult.error) throw uploadResult.error;
        var urlData = db.storage.from(ESTADOS_BUCKET).getPublicUrl(filePath);
        var publicUrl = urlData.data.publicUrl;
        var insertResult = await db.from('estados').insert({ usuario_id: user.id, imagen_url: publicUrl, caption: caption || null });
        if (insertResult.error) throw insertResult.error;
        toast('✅ Estado publicado (24h)', 'success');
        cerrarModalEstado();
        await cargarEstados();
    } catch (e) {
        console.error('Error publicando estado:', e);
        if (e.message && (e.message.indexOf('Bucket') !== -1 || e.message.indexOf('not found') !== -1)) toast('❌ Bucket "sariels-estados" no existe. Créalo en Supabase.', 'error');
        else if (e.code === '42P01') toast('❌ Tabla "estados" no existe. Ejecuta el SQL.', 'error');
        else toast('❌ Error: ' + e.message, 'error');
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Publicar estado'; } }
}
console.log('[Mensajes] ✅ Estados cargado');