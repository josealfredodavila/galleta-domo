// ================================================================
// GRUPOS · MARKETPLACE Y REGALOS
// ================================================================
// Publicación en Marketplace + sistema de donaciones/regalos.
// Depende de: grupos-config.js, grupos-utils.js, grupos-interno.js
// ================================================================

// ================================================================
// ABRIR / CERRAR MODAL MARKETPLACE
// ================================================================
function abrirModalMarketplace() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro del grupo para vender', 'error'); return; }
    if (!grupoActual.marketplace_activo) { grpShowToast('El Marketplace no está activo en este grupo', 'warning'); return; }

    document.getElementById('inputTipoMarketplace').value = '';
    document.getElementById('inputTituloMarketplace').value = '';
    document.getElementById('inputDescripcionMarketplace').value = '';
    document.getElementById('inputPrecioMxnMarketplace').value = '';
    document.getElementById('inputPrecioUsdtMarketplace').value = '';
    document.getElementById('inputEstadoMarketplace').value = grupoActual.estado_region || '';
    document.getElementById('inputMunicipioMarketplace').value = grupoActual.municipio || '';
    document.getElementById('inputWhatsappMarketplace').value = '';
    document.getElementById('inputTelefonoMarketplace').value = '';
    document.getElementById('inputImagenMarketplace').value = '';
    document.getElementById('inputVideoMarketplace').value = '';
    document.getElementById('marketplaceStatus').textContent = '';
    document.getElementById('modalMarketplace').classList.add('show');
}

function cerrarModalMarketplace() {
    document.getElementById('modalMarketplace').classList.remove('show');
}

// ================================================================
// VALIDAR DURACIÓN DE VIDEO (máx 40s)
// ================================================================
function validarDuracionVideo(file) {
    return new Promise(function(resolve) {
        var video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
            window.URL.revokeObjectURL(video.src);
            resolve({ duracion: video.duration, valido: video.duration <= 40 });
        };
        video.onerror = function() {
            window.URL.revokeObjectURL(video.src);
            resolve({ duracion: 0, valido: false });
        };
        video.src = URL.createObjectURL(file);
    });
}

// ================================================================
// PUBLICAR EN MARKETPLACE
// ================================================================
async function publicarMarketplace() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro del grupo', 'error'); return; }
    if (!grupoActual.marketplace_activo) { grpShowToast('El Marketplace no está activo', 'error'); return; }

    var tipo = document.getElementById('inputTipoMarketplace').value;
    var titulo = document.getElementById('inputTituloMarketplace').value.trim();
    var descripcion = document.getElementById('inputDescripcionMarketplace').value.trim();
    var precioMxn = parseFloat(document.getElementById('inputPrecioMxnMarketplace').value) || null;
    var precioUsdt = parseFloat(document.getElementById('inputPrecioUsdtMarketplace').value) || null;
    var estado = document.getElementById('inputEstadoMarketplace').value.trim();
    var municipio = document.getElementById('inputMunicipioMarketplace').value.trim();
    var whatsapp = document.getElementById('inputWhatsappMarketplace').value.trim();
    var telefono = document.getElementById('inputTelefonoMarketplace').value.trim();
    var imagenInput = document.getElementById('inputImagenMarketplace');
    var videoInput = document.getElementById('inputVideoMarketplace');
    var statusEl = document.getElementById('marketplaceStatus');
    var btn = document.getElementById('btnPublicarMarketplace');

    if (!tipo) { statusEl.textContent = 'Selecciona el tipo'; statusEl.style.color = 'var(--warning)'; return; }
    if (!titulo) { statusEl.textContent = 'Escribe un título'; statusEl.style.color = 'var(--warning)'; return; }
    if (!descripcion) { statusEl.textContent = 'Escribe una descripción'; statusEl.style.color = 'var(--warning)'; return; }
    if (!municipio) { statusEl.textContent = 'Escribe el municipio'; statusEl.style.color = 'var(--warning)'; return; }

    var infTitulo = detectarInfraccion(titulo);
    if (infTitulo.bloqueado) {
        statusEl.innerHTML = 'No permitido.<br>Categoría: ' + infTitulo.categorias.join(', ');
        statusEl.style.color = 'var(--danger)';
        return;
    }
    var infDesc = detectarInfraccion(descripcion);
    if (infDesc.bloqueado) {
        statusEl.innerHTML = 'No permitido.<br>Categoría: ' + infDesc.categorias.join(', ');
        statusEl.style.color = 'var(--danger)';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Publicando...';
    statusEl.textContent = 'Subiendo...';

    try {
        var imagenUrl = null, videoUrl = null;

        if (imagenInput.files && imagenInput.files[0]) {
            var file = imagenInput.files[0];
            if (file.size > 10 * 1024 * 1024) throw new Error('Imagen > 10MB');
            var fileExt = file.name.split('.').pop();
            var filePath = grupoActualId + '/marketplace/' + sessionUser.id + '/' + Date.now() + '.' + fileExt;
            var uploadResult = await window.supabaseClient.storage
                .from('grupos-publicaciones')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });
            if (uploadResult.error) throw uploadResult.error;
            imagenUrl = window.supabaseClient.storage
                .from('grupos-publicaciones')
                .getPublicUrl(filePath).data.publicUrl;
        }

        if (videoInput.files && videoInput.files[0]) {
            var vfile = videoInput.files[0];
            if (vfile.size > 50 * 1024 * 1024) throw new Error('Video > 50MB');
            var validacion = await validarDuracionVideo(vfile);
            if (!validacion.valido) throw new Error('Video > 40s');
            var vext = vfile.name.split('.').pop();
            var vfilePath = grupoActualId + '/marketplace/' + sessionUser.id + '/video_' + Date.now() + '.' + vext;
            var vuploadResult = await window.supabaseClient.storage
                .from('grupos-publicaciones')
                .upload(vfilePath, vfile, { cacheControl: '3600', upsert: true });
            if (vuploadResult.error) throw vuploadResult.error;
            videoUrl = window.supabaseClient.storage
                .from('grupos-publicaciones')
                .getPublicUrl(vfilePath).data.publicUrl;
        }

        var result = await window.supabaseClient.from('grupos_video_publicaciones').insert({
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            contenido: titulo,
            tipo: 'marketplace',
            estado: 'publicado',
            tipo_marketplace: tipo,
            precio_mxn: precioMxn,
            precio_usdt: precioUsdt,
            municipio: municipio,
            estado_region: estado || null,
            telefono_contacto: telefono || null,
            whatsapp: whatsapp || null,
            imagen_url: imagenUrl,
            video_url: videoUrl
        }).select().single();

        if (result.error) throw result.error;

        statusEl.textContent = 'Publicado';
        statusEl.style.color = 'var(--success)';
        grpShowToast('Publicación creada', 'success');

        setTimeout(function() {
            cerrarModalMarketplace();
            cargarPublicacionesGrupo(grupoActualId);
        }, 800);
    } catch (e) {
        statusEl.textContent = 'Error: ' + e.message;
        statusEl.style.color = 'var(--danger)';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Publicar en Marketplace';
    }
}

// ================================================================
// MODAL REGALOS / DONACIONES
// ================================================================
function abrirModalRegalos(streamerId, streamerNombre) {
    document.getElementById('giftStreamerName').textContent = streamerNombre || 'el creador';
    document.getElementById('giftStatus').textContent = 'Selecciona un monto';
    document.getElementById('modalRegalos').classList.add('show');
}

function cerrarModalRegalos() {
    document.getElementById('modalRegalos').classList.remove('show');
}

async function enviarRegalo(monto) {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) return;
    var statusEl = document.getElementById('giftStatus');
    statusEl.textContent = 'Procesando...';
    try {
        var session = await grpGetSession();
        var response = await fetch('/api/payments/gift/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (session?.access_token || '')
            },
            body: JSON.stringify({
                grupo_id: grupoActualId,
                streamer_id: liveActivoEnGrupo ? liveActivoEnGrupo.streamer_id : grupoActual.creador_id,
                monto: monto,
                moneda: 'USDC'
            })
        });
        var data = await response.json();
        if (!data.success) throw new Error(data.error);
        statusEl.innerHTML = 'Pago iniciado<br>Monto: ' + data.monto + ' USDC<br>ID: ' + data.payment_id +
            '<button onclick="verificarRegalo(\'' + data.payment_id + '\')" style="margin-top:8px;padding:6px 20px;border-radius:20px;border:none;background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:var(--space);font-weight:700;font-size:0.7rem;cursor:pointer;">Verificar</button>';
        statusEl.style.color = 'var(--success)';
    } catch (e) {
        statusEl.textContent = 'Error: ' + e.message;
        statusEl.style.color = 'var(--danger)';
    }
}

async function verificarRegalo(paymentId) {
    var statusEl = document.getElementById('giftStatus');
    statusEl.textContent = 'Verificando...';
    try {
        var session = await grpGetSession();
        var response = await fetch('/api/payments/gift/status/' + paymentId, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
        });
        var data = await response.json();
        if (data.estado === 'finished') {
            statusEl.textContent = 'Regalo enviado';
            statusEl.style.color = 'var(--success)';
        } else if (data.estado === 'pending') {
            statusEl.textContent = 'Pendiente';
            statusEl.style.color = 'var(--warning)';
        } else {
            statusEl.textContent = 'Estado: ' + data.estado;
        }
    } catch (e) {
        console.warn(e);
    }
}