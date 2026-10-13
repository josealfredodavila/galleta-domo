// ================================================================
// GRUPOS · MARKETPLACE Y DONACIONES
// ================================================================
// Publicación en Marketplace + donaciones al creador del canal.
// v2: las donaciones solo se hacen con un live activo en el canal.
//     Montos de 20 USD en adelante. El servidor decide el creador
//     y reparte 50% creador / 50% plataforma.
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
// DONACIONES AL CREADOR DEL CANAL
// ================================================================
var GIFT_MONTOS = [20, 50, 100, 200];
var GIFT_REDES = [
    { id: 'usdttrc20', label: 'USDT · TRC20' },
    { id: 'usdcpolygon', label: 'USDC · Polygon' }
];
var _giftMonto = null;
var _giftRed = null;
var _giftPollTimer = null;
var _giftInicio = 0;
var GIFT_TIMEOUT_MS = 10 * 60 * 1000;

function giftCrearEl(tag, attrs, texto) {
    var n = document.createElement(tag);
    if (attrs) {
        Object.keys(attrs).forEach(function(k) {
            if (k === 'class') n.className = attrs[k];
            else if (k === 'style') n.style.cssText = attrs[k];
            else n.setAttribute(k, attrs[k]);
        });
    }
    if (texto !== undefined) n.textContent = texto;
    return n;
}

function giftSetStatus(texto, color) {
    var st = document.getElementById('giftStatus');
    if (!st) return;
    st.replaceChildren();
    st.textContent = texto;
    st.style.color = color || 'var(--text-muted)';
}

function giftActualizarBotonPagar() {
    var btn = document.getElementById('btnPagarDonacion');
    if (btn) btn.disabled = !(_giftMonto && _giftRed);
}

// Muestra las opciones de monto y red, y solo habilita donar si hay live activo
async function abrirModalRegalos(streamerId, streamerNombre) {
    if (!sessionUser) { grpShowToast('Inicia sesión para donar', 'error'); return; }
    if (!grupoActualId) return;

    _giftMonto = null;
    _giftRed = null;
    detenerSondeoDonacion();

    document.getElementById('giftStreamerName').textContent = streamerNombre || 'el creador';
    var contenedor = document.getElementById('giftOptions');
    contenedor.replaceChildren();
    document.getElementById('modalRegalos').classList.add('show');

    var live = await verificarLiveActivoGrupo(grupoActualId);
    if (!live) {
        giftSetStatus('Las donaciones se hacen durante un live. Este canal no está en vivo ahora.', 'var(--warning)');
        return;
    }
    if (live.streamer_id === sessionUser.id) {
        giftSetStatus('No puedes donarte a ti mismo.', 'var(--warning)');
        return;
    }

    var etiquetaMonto = giftCrearEl('div', { style: 'font-size:0.65rem;color:var(--text-muted);margin-bottom:6px;' }, 'Monto (USD)');
    var filaMontos = giftCrearEl('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px;' });
    GIFT_MONTOS.forEach(function(m) {
        var b = giftCrearEl('button', { class: 'gift-btn', 'data-monto': String(m), type: 'button' });
        b.appendChild(giftCrearEl('span', { class: 'monto' }, '$' + m));
        b.addEventListener('click', function() { seleccionarMontoGift(m); });
        filaMontos.appendChild(b);
    });

    var etiquetaRed = giftCrearEl('div', { style: 'font-size:0.65rem;color:var(--text-muted);margin-bottom:6px;' }, 'Red');
    var filaRedes = giftCrearEl('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px;' });
    GIFT_REDES.forEach(function(r) {
        var b = giftCrearEl('button', { class: 'gift-btn', 'data-red': r.id, type: 'button', style: 'min-width:130px;' });
        b.appendChild(giftCrearEl('span', { class: 'label' }, r.label));
        b.addEventListener('click', function() { seleccionarRedGift(r.id); });
        filaRedes.appendChild(b);
    });

    var btnPagar = giftCrearEl('button', {
        id: 'btnPagarDonacion',
        type: 'button',
        class: 'btn-gold btn-sm',
        disabled: 'true',
        style: 'width:100%;justify-content:center;margin-top:4px;'
    }, 'Generar pago');
    btnPagar.addEventListener('click', function() { enviarRegalo(); });

    contenedor.append(etiquetaMonto, filaMontos, etiquetaRed, filaRedes, btnPagar);
    giftSetStatus('Elige el monto y la red para donar. Mínimo $20 USD.');
}

function cerrarModalRegalos() {
    detenerSondeoDonacion();
    document.getElementById('modalRegalos').classList.remove('show');
}

function seleccionarMontoGift(monto) {
    if (GIFT_MONTOS.indexOf(monto) === -1) return;
    _giftMonto = monto;
    document.querySelectorAll('#giftOptions [data-monto]').forEach(function(b) {
        b.style.borderColor = Number(b.dataset.monto) === monto ? 'var(--gold)' : '';
    });
    giftActualizarBotonPagar();
}

function seleccionarRedGift(redId) {
    if (!GIFT_REDES.some(function(r) { return r.id === redId; })) return;
    _giftRed = redId;
    document.querySelectorAll('#giftOptions [data-red]').forEach(function(b) {
        b.style.borderColor = b.dataset.red === redId ? 'var(--gold)' : '';
    });
    giftActualizarBotonPagar();
}

// Crea la donación en el servidor y muestra el enlace de pago
async function enviarRegalo(montoOpcional) {
    if (montoOpcional) seleccionarMontoGift(Number(montoOpcional));
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) return;
    if (!_giftMonto || !_giftRed) { giftSetStatus('Elige monto y red', 'var(--warning)'); return; }

    var btn = document.getElementById('btnPagarDonacion');
    if (btn) btn.disabled = true;
    giftSetStatus('Creando tu pago…', 'var(--text-muted)');

    try {
        var session = await grpGetSession();
        if (!session) throw new Error('Inicia sesión para donar');

        var response = await fetch('/api/live/donacion/canal/crear', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + session.access_token
            },
            body: JSON.stringify({
                grupo_id: grupoActualId,
                monto_usd: _giftMonto,
                pay_currency: _giftRed
            })
        });
        var data = await response.json().catch(function() { return {}; });

        if (response.status !== 201 || !data.success) {
            throw new Error(giftMensajeError(data.error));
        }

        mostrarEnlacePagoGift(data.payment_url, data.donacion_id);
        iniciarSondeoDonacion(data.donacion_id);
    } catch (e) {
        giftSetStatus('Error: ' + e.message, 'var(--danger)');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function giftMensajeError(codigo) {
    var mapa = {
        sin_live_activo: 'Este canal no está en vivo ahora.',
        no_puedes_donarte: 'No puedes donarte a ti mismo.',
        monto_invalido: 'Monto no válido. El mínimo es $20 USD.',
        red_invalida: 'Red no válida.',
        pagos_no_configurados: 'Los pagos no están disponibles en este momento.',
        pago_no_creado: 'No se pudo crear el pago. Intenta de nuevo.'
    };
    return mapa[codigo] || 'No se pudo crear la donación';
}

function mostrarEnlacePagoGift(url, donacionId) {
    var st = document.getElementById('giftStatus');
    if (!st) return;
    st.replaceChildren();
    st.style.color = 'var(--success)';
    st.appendChild(document.createTextNode('Pago listo. Toca el botón para completar tu donación de $' + _giftMonto + ' USD.'));

    var enlace = giftCrearEl('a', {
        href: grpSafeUrl(url) || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'btn-gold btn-sm',
        style: 'display:block;margin-top:10px;text-align:center;text-decoration:none;'
    }, 'Abrir pago');
    st.appendChild(enlace);

    var esperando = giftCrearEl('div', { style: 'margin-top:8px;font-size:0.65rem;color:var(--text-muted);' }, 'Esperando confirmación…');
    esperando.id = 'giftEstadoEspera';
    st.appendChild(esperando);
}

// Revisa cada 5 s el estado de la donación hasta que se confirme o falle
function iniciarSondeoDonacion(donacionId) {
    detenerSondeoDonacion();
    _giftInicio = Date.now();
    _giftPollTimer = setInterval(async function() {
        if (Date.now() - _giftInicio > GIFT_TIMEOUT_MS) {
            detenerSondeoDonacion();
            var espera = document.getElementById('giftEstadoEspera');
            if (espera) espera.textContent = 'Tiempo de espera agotado. Si ya pagaste, se confirmará en breve.';
            return;
        }
        var estado = await consultarEstadoDonacion(donacionId);
        if (estado === 'pagada') {
            detenerSondeoDonacion();
            giftSetStatus('¡Donación confirmada! Gracias por apoyar el canal.', 'var(--success)');
            grpShowToast('Donación confirmada', 'success');
        } else if (estado === 'fallida') {
            detenerSondeoDonacion();
            giftSetStatus('La donación no se completó.', 'var(--danger)');
        }
    }, 5000);
}

function detenerSondeoDonacion() {
    if (_giftPollTimer) {
        clearInterval(_giftPollTimer);
        _giftPollTimer = null;
    }
}

async function consultarEstadoDonacion(donacionId) {
    try {
        var session = await grpGetSession();
        if (!session) return null;
        var r = await fetch('/api/live/donacion/' + encodeURIComponent(donacionId) + '/estado', {
            headers: { 'Authorization': 'Bearer ' + session.access_token }
        });
        if (!r.ok) return null;
        var d = await r.json();
        return d.estado || null;
    } catch (e) {
        return null;
    }
}

// Verificación manual (se expone para compatibilidad)
async function verificarRegalo(donacionId) {
    var estado = await consultarEstadoDonacion(donacionId);
    if (estado === 'pagada') giftSetStatus('Donación confirmada', 'var(--success)');
    else if (estado === 'fallida') giftSetStatus('La donación no se completó', 'var(--danger)');
    else if (estado === 'pendiente') giftSetStatus('Pendiente de confirmación', 'var(--warning)');
    else giftSetStatus('No se pudo verificar la donación', 'var(--text-muted)');
}