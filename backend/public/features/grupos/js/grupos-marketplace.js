// ================================================================
// GRUPOS · MARKETPLACE, COMPRAS Y DONACIONES
// ================================================================
// v4:
// - Publicar: guarda la descripción (antes se perdía), stock opcional
//   (vacío = sin límite) y wallet_cobro (0x…, validada).
// - Compra de producto con pasarela NOWPayments en Polygon (USDT/USDC):
//     1) RPC crear_compra_marketplace (valida stock, precio y wallet)
//     2) POST /api/marketplace/canal/pago (backend) → enlace de pago
//     3) El backend confirma con confirmar_compra_marketplace (baja stock)
// - Tarjeta de compra: mkTarjetaCompraHTML(p) y clic delegado en
//   [data-mk-comprar]. El feed (grupos-interno.js) la incluye en v4.
// - Donaciones: sin cambios.
// Depende de: grupos-config.js, grupos-utils.js, grupos-interno.js
// ================================================================

// ================================================================
// CONSTANTES Y ESTADO
// ================================================================
var MK_WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;
var MK_COMISION_PLATAFORMA = 0.03;
var MK_PAY_REDES = [
    { id: 'usdtmatic', label: 'USDT · Polygon' },
    { id: 'usdcmatic', label: 'USDC · Polygon' }
];
var MK_POLL_INTERVAL_MS = 5000;
var MK_POLL_TIMEOUT_MS = 30 * 60 * 1000;
var MK_ICON_CARRITO = '<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

var _mkCompra = null;          // { pub, moneda, red }
var _mkCompraId = null;
var _mkPollTimer = null;
var _mkPollInicio = 0;

// ================================================================
// ESTILOS (se inyectan una sola vez, paleta oscura + naranja + dorado)
// ================================================================
function mkInyectarEstilos() {
    if (document.getElementById('mkEstilos')) return;
    var st = document.createElement('style');
    st.id = 'mkEstilos';
    st.textContent =
        '.mk-compra-card{display:flex;align-items:center;justify-content:space-between;gap:12px;' +
            'margin:10px 0;padding:12px 14px;border-radius:14px;' +
            'background:linear-gradient(135deg,rgba(255,122,0,.10),rgba(212,175,55,.06) 60%,rgba(8,12,10,.6));' +
            'border:1px solid rgba(255,122,0,.35);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}' +
        '.mk-compra-info{display:flex;flex-direction:column;gap:4px;min-width:0;}' +
        '.mk-compra-precios{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;}' +
        '.mk-precio{font-family:Orbitron,monospace;font-size:1.05rem;font-weight:700;color:#f7d44a;}' +
        '.mk-precio small{font-size:.6rem;color:#c9b27a;font-weight:600;letter-spacing:.5px;}' +
        '.mk-precio-usdt{color:#ff9e4a;}' +
        '.mk-compra-stock{font-size:.66rem;color:#9fb3a8;letter-spacing:.3px;}' +
        '.mk-compra-btn{display:inline-flex;align-items:center;gap:7px;flex-shrink:0;padding:9px 16px;' +
            'border:none;border-radius:999px;cursor:pointer;color:#0b0f0c;font-weight:800;font-size:.72rem;letter-spacing:.4px;' +
            'background:linear-gradient(135deg,#ff7a00 0%,#f7d44a 100%);box-shadow:0 6px 18px rgba(255,122,0,.35);' +
            'transition:transform .15s ease,box-shadow .2s ease;}' +
        '.mk-compra-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(255,122,0,.5);}' +
        '.mk-compra-btn:active{transform:scale(.97);}' +
        '.mk-compra-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}' +
        '.mk-compra-btn .icon{width:15px;height:15px;}' +
        '.mk-chips{display:flex;flex-wrap:wrap;gap:8px;}' +
        '.mk-chip{padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);' +
            'background:rgba(0,0,0,.3);color:#e8efe9;font-size:.7rem;font-weight:700;cursor:pointer;}' +
        '.mk-chip.activo{border-color:#f7d44a;color:#f7d44a;background:rgba(247,212,74,.10);' +
            'box-shadow:0 0 0 1px rgba(247,212,74,.25);}' +
        '.mk-resumen{margin:12px 0;padding:12px;border-radius:12px;background:rgba(0,0,0,.28);' +
            'border:1px solid rgba(255,122,0,.2);display:flex;flex-direction:column;gap:6px;font-size:.7rem;color:#9fb3a8;}' +
        '.mk-resumen div{display:flex;justify-content:space-between;gap:10px;}' +
        '.mk-resumen strong{color:#f7d44a;font-family:Orbitron,monospace;}' +
        '.mk-status{margin-top:10px;font-size:.7rem;text-align:center;color:#9fb3a8;min-height:1em;}' +
        '.mk-campo-extra{margin-bottom:12px;}';
    document.head.appendChild(st);
}

// ================================================================
// TARJETA DE COMPRA (se inserta en cada publicación de marketplace)
// ================================================================
function mkTarjetaCompraHTML(p) {
    if (!p || !p.tipo_marketplace) return '';
    var mxn = Number(p.precio_mxn) || 0;
    var usdt = Number(p.precio_usdt) || 0;
    if (mxn <= 0 && usdt <= 0) return '';

    var precios = '';
    if (mxn > 0) precios += '<span class="mk-precio">$' + mxn.toFixed(2) + ' <small>MXN</small></span>';
    if (usdt > 0) precios += '<span class="mk-precio mk-precio-usdt">' + usdt.toFixed(2) + ' <small>USDT</small></span>';

    var tieneStock = p.stock !== null && p.stock !== undefined;
    var agotado = tieneStock && Number(p.stock) <= 0;
    var stockTxt = !tieneStock ? 'Disponible' : (agotado ? 'Agotado' : 'Stock: ' + Number(p.stock));

    var esMio = !!(sessionUser && p.usuario_id === sessionUser.id);
    var deshabilitado = agotado || esMio;
    var etiqueta = esMio ? 'Tu publicación' : (agotado ? 'Agotado' : 'Comprar');

    return '<div class="mk-compra-card">' +
        '<div class="mk-compra-info">' +
            '<div class="mk-compra-precios">' + precios + '</div>' +
            '<div class="mk-compra-stock">' + grpEscapeHTML(stockTxt) + '</div>' +
        '</div>' +
        '<button type="button" class="mk-compra-btn" data-mk-comprar="' + Number(p.id) + '"' +
            (deshabilitado ? ' disabled' : '') + '>' +
            (deshabilitado ? '' : MK_ICON_CARRITO) +
            '<span>' + etiqueta + '</span>' +
        '</button>' +
    '</div>';
}

// Clic delegado: abre el modal de compra desde cualquier tarjeta del feed
document.addEventListener('click', function(e) {
    var boton = e.target && e.target.closest ? e.target.closest('[data-mk-comprar]') : null;
    if (!boton || boton.disabled) return;
    e.preventDefault();
    abrirCompraMarketplace(boton.getAttribute('data-mk-comprar'));
});

// ================================================================
// MODAL DE COMPRA (se crea una vez, con DOM seguro)
// ================================================================
function mkEl(tag, attrs, texto) {
    var n = document.createElement(tag);
    if (attrs) {
        Object.keys(attrs).forEach(function(k) {
            if (k === 'class') n.className = attrs[k];
            else n.setAttribute(k, attrs[k]);
        });
    }
    if (texto !== undefined && texto !== null) n.textContent = String(texto);
    return n;
}

function mkAsegurarModalCompra() {
    if (document.getElementById('mkCompraModal')) return;

    var overlay = mkEl('div', { class: 'modal-overlay', id: 'mkCompraModal' });
    var modal = mkEl('div', { class: 'modal' });

    var header = mkEl('div', { class: 'modal-header' });
    var h2 = mkEl('h2', null, 'Comprar producto');
    var btnCerrar = mkEl('button', { class: 'btn-cerrar', type: 'button', id: 'mkCompraCerrar', 'aria-label': 'Cerrar' }, '×');
    header.append(h2, btnCerrar);

    var titulo = mkEl('div', { id: 'mkCompraTitulo', style: 'font-size:0.85rem;font-weight:700;margin-bottom:12px;color:var(--text-primary);' });

    var grupoMoneda = mkEl('div', { class: 'form-group' });
    grupoMoneda.appendChild(mkEl('label', null, 'Moneda de pago'));
    grupoMoneda.appendChild(mkEl('div', { class: 'mk-chips', id: 'mkCompraMonedas' }));

    var grupoCant = mkEl('div', { class: 'form-group' });
    grupoCant.appendChild(mkEl('label', { for: 'mkCompraCantidad' }, 'Cantidad'));
    grupoCant.appendChild(mkEl('input', { type: 'number', id: 'mkCompraCantidad', min: '1', step: '1', value: '1' }));

    var resumen = mkEl('div', { class: 'mk-resumen' });
    var filaSub = mkEl('div'); filaSub.append(mkEl('span', null, 'Subtotal'), mkEl('strong', { id: 'mkResSubtotal' }, '—'));
    var filaCom = mkEl('div'); filaCom.append(mkEl('span', null, 'Comisión Csariel\'s (3%)'), mkEl('span', { id: 'mkResComision' }, '—'));
    var filaVen = mkEl('div'); filaVen.append(mkEl('span', null, 'Vendedor recibe (97%)'), mkEl('span', { id: 'mkResVendedor' }, '—'));
    resumen.append(filaSub, filaCom, filaVen);

    var grupoRed = mkEl('div', { class: 'form-group' });
    grupoRed.appendChild(mkEl('label', null, 'Red de pago (Polygon)'));
    var chipsRed = mkEl('div', { class: 'mk-chips', id: 'mkCompraRedes' });
    MK_PAY_REDES.forEach(function(r) {
        var b = mkEl('button', { type: 'button', class: 'mk-chip', 'data-red': r.id }, r.label);
        b.addEventListener('click', function() { mkSeleccionarRed(r.id); });
        chipsRed.appendChild(b);
    });
    grupoRed.appendChild(chipsRed);

    var btnConfirmar = mkEl('button', { type: 'button', class: 'btn-guardar', id: 'mkCompraConfirmar' }, 'Generar pago');
    var status = mkEl('div', { class: 'mk-status', id: 'mkCompraStatus' });

    modal.append(header, titulo, grupoMoneda, grupoCant, resumen, grupoRed, btnConfirmar, status);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    btnCerrar.addEventListener('click', cerrarCompraMarketplace);
    btnConfirmar.addEventListener('click', confirmarCompraMarketplace);
    grupoCant.querySelector('input').addEventListener('input', mkActualizarResumen);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) cerrarCompraMarketplace(); });
}

function mkSetStatus(texto, color) {
    var st = document.getElementById('mkCompraStatus');
    if (!st) return;
    st.replaceChildren();
    st.textContent = texto || '';
    st.style.color = color || '#9fb3a8';
}

function abrirCompraMarketplace(publicacionId) {
    if (!sessionUser) { grpShowToast('Inicia sesión para comprar', 'error'); return; }

    var pub = (typeof publicacionesCache !== 'undefined' && publicacionesCache || [])
        .find(function(p) { return String(p.id) === String(publicacionId); });
    if (!pub || !pub.tipo_marketplace) { grpShowToast('Publicación no disponible', 'error'); return; }
    if (pub.usuario_id === sessionUser.id) { grpShowToast('No puedes comprar tu propia publicación', 'warning'); return; }

    mkInyectarEstilos();
    mkAsegurarModalCompra();

    var monedas = [];
    if (Number(pub.precio_mxn) > 0) monedas.push({ id: 'MXN', label: 'MXN', precio: Number(pub.precio_mxn) });
    if (Number(pub.precio_usdt) > 0) monedas.push({ id: 'USDT', label: 'USDT', precio: Number(pub.precio_usdt) });
    if (monedas.length === 0) { grpShowToast('Este producto no tiene precio de venta', 'warning'); return; }

    _mkCompra = { pub: pub, monedas: monedas, moneda: null, red: null };

    document.getElementById('mkCompraTitulo').textContent = pub.contenido || 'Producto';

    var chips = document.getElementById('mkCompraMonedas');
    chips.replaceChildren();
    monedas.forEach(function(m) {
        var b = mkEl('button', { type: 'button', class: 'mk-chip', 'data-moneda': m.id }, m.label + ' · $' + m.precio.toFixed(2));
        b.addEventListener('click', function() { mkSeleccionarMoneda(m.id); });
        chips.appendChild(b);
    });

    var inputCant = document.getElementById('mkCompraCantidad');
    var max = (pub.stock === null || pub.stock === undefined) ? 99 : Math.max(0, Number(pub.stock));
    inputCant.value = '1';
    inputCant.max = String(max);

    document.querySelectorAll('#mkCompraRedes .mk-chip').forEach(function(c) { c.classList.remove('activo'); });
    mkSetStatus('Elige moneda y red para continuar.');
    mkSeleccionarMoneda(monedas[0].id);
    document.getElementById('mkCompraModal').classList.add('show');
}

function mkSeleccionarMoneda(id) {
    if (!_mkCompra) return;
    _mkCompra.moneda = id;
    document.querySelectorAll('#mkCompraMonedas .mk-chip').forEach(function(c) {
        c.classList.toggle('activo', c.getAttribute('data-moneda') === id);
    });
    mkActualizarResumen();
}

function mkSeleccionarRed(id) {
    if (!_mkCompra) return;
    _mkCompra.red = id;
    document.querySelectorAll('#mkCompraRedes .mk-chip').forEach(function(c) {
        c.classList.toggle('activo', c.getAttribute('data-red') === id);
    });
}

function mkCantidadActual() {
    var input = document.getElementById('mkCompraCantidad');
    var n = parseInt(input.value, 10);
    var max = parseInt(input.max, 10) || 99;
    if (!Number.isInteger(n) || n < 1) n = 1;
    if (n > max) n = max;
    input.value = String(n);
    return n;
}

// Resumen solo informativo: el servidor recalcula los montos con la base de datos
function mkActualizarResumen() {
    if (!_mkCompra || !_mkCompra.moneda) return;
    var moneda = _mkCompra.monedas.find(function(m) { return m.id === _mkCompra.moneda; });
    if (!moneda) return;
    var cantidad = mkCantidadActual();
    var subtotal = Math.round(moneda.precio * cantidad * 100) / 100;
    var comision = Math.round(subtotal * MK_COMISION_PLATAFORMA * 100) / 100;
    var vendedor = Math.round((subtotal - comision) * 100) / 100;
    document.getElementById('mkResSubtotal').textContent = '$' + subtotal.toFixed(2) + ' ' + moneda.label;
    document.getElementById('mkResComision').textContent = '$' + comision.toFixed(2) + ' ' + moneda.label;
    document.getElementById('mkResVendedor').textContent = '$' + vendedor.toFixed(2) + ' ' + moneda.label;
}

function mkMensajeErrorCompra(msg) {
    var m = String(msg || '');
    if (m.indexOf('sin_stock') !== -1) return 'Ya no hay stock disponible.';
    if (m.indexOf('publicacion_no_disponible') !== -1) return 'La publicación ya no está disponible.';
    if (m.indexOf('marketplace_no_activo') !== -1) return 'El Marketplace de este canal no está activo.';
    if (m.indexOf('no_puedes_comprarte') !== -1) return 'No puedes comprar tu propia publicación.';
    if (m.indexOf('sin_wallet_cobro') !== -1) return 'El vendedor aún no configuró su wallet de cobro.';
    if (m.indexOf('precio_no_definido') !== -1) return 'La moneda elegida no tiene precio.';
    if (m.indexOf('no_autenticado') !== -1) return 'Inicia sesión para comprar.';
    if (m.indexOf('pagos_no_configurados') !== -1) return 'Los pagos no están disponibles en este momento.';
    return 'No se pudo crear la compra. Intenta de nuevo.';
}

async function confirmarCompraMarketplace() {
    if (!_mkCompra || !_mkCompra.pub) return;
    if (!sessionUser) { mkSetStatus('Inicia sesión para comprar.', 'var(--danger)'); return; }
    if (!_mkCompra.moneda) { mkSetStatus('Elige la moneda.', 'var(--warning)'); return; }
    if (!_mkCompra.red) { mkSetStatus('Elige la red de pago.', 'var(--warning)'); return; }

    var btn = document.getElementById('mkCompraConfirmar');
    btn.disabled = true;
    mkSetStatus('Creando tu compra…');

    try {
        var cantidad = mkCantidadActual();
        var rpc = await window.supabaseClient.rpc('crear_compra_marketplace', {
            p_publicacion_id: Number(_mkCompra.pub.id),
            p_cantidad: cantidad,
            p_moneda: _mkCompra.moneda
        });
        if (rpc.error) throw new Error(mkMensajeErrorCompra(rpc.error.message));
        var compraId = rpc.data;
        if (!compraId) throw new Error('No se pudo crear la compra.');

        var session = await grpGetSession();
        if (!session) throw new Error('Inicia sesión para comprar.');

        var r = await fetch('/api/marketplace/canal/pago', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + session.access_token
            },
            body: JSON.stringify({ compra_id: compraId, pay_currency: _mkCompra.red })
        });
        var data = await r.json().catch(function() { return {}; });
        if (!r.ok || !data.success) throw new Error(mkMensajeErrorCompra(data.error));

        _mkCompraId = compraId;
        mkMostrarEnlacePago(data.payment_url);
        mkIniciarSondeo(compraId);
    } catch (e) {
        mkSetStatus('Error: ' + (e.message || 'desconocido'), 'var(--danger)');
    } finally {
        btn.disabled = false;
    }
}

function mkMostrarEnlacePago(url) {
    var st = document.getElementById('mkCompraStatus');
    if (!st) return;
    st.replaceChildren();
    st.style.color = 'var(--success)';
    st.appendChild(document.createTextNode('Pago listo. Completa el pago en Polygon para confirmar tu compra.'));

    var enlace = mkEl('a', {
        href: grpSafeUrl(url) || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'btn-gold btn-sm',
        style: 'display:block;margin-top:10px;text-align:center;text-decoration:none;'
    }, 'Abrir pago');
    st.appendChild(enlace);

    var espera = mkEl('div', { id: 'mkEstadoEspera', style: 'margin-top:8px;font-size:0.65rem;color:var(--text-muted);' }, 'Esperando confirmación…');
    st.appendChild(espera);
}

// Consulta el estado de la compra (RLS: el comprador puede leer su compra)
function mkIniciarSondeo(compraId) {
    mkDetenerSondeo();
    _mkPollInicio = Date.now();
    _mkPollTimer = setInterval(async function() {
        if (Date.now() - _mkPollInicio > MK_POLL_TIMEOUT_MS) {
            mkDetenerSondeo();
            var espera = document.getElementById('mkEstadoEspera');
            if (espera) espera.textContent = 'Tiempo de espera agotado. Si ya pagaste, se confirmará en breve.';
            return;
        }
        var r = await window.supabaseClient
            .from('grupos_marketplace_compras')
            .select('estado')
            .eq('id', compraId)
            .maybeSingle();
        if (r.error || !r.data) return;

        var estado = r.data.estado;
        if (estado === 'pagada') {
            mkDetenerSondeo();
            mkSetStatus('¡Compra confirmada! El vendedor recibirá su pago.', 'var(--success)');
            grpShowToast('Compra confirmada', 'success');
            if (typeof cargarPublicacionesGrupo === 'function' && typeof grupoActualId !== 'undefined' && grupoActualId) {
                cargarPublicacionesGrupo(grupoActualId);
            }
        } else if (estado === 'sin_stock') {
            mkDetenerSondeo();
            mkSetStatus('Se agotó el stock antes de confirmar. Tu pago será reembolsado.', 'var(--danger)');
        } else if (estado === 'fallida' || estado === 'cancelada') {
            mkDetenerSondeo();
            mkSetStatus('La compra no se completó.', 'var(--danger)');
        }
    }, MK_POLL_INTERVAL_MS);
}

function mkDetenerSondeo() {
    if (_mkPollTimer) {
        clearInterval(_mkPollTimer);
        _mkPollTimer = null;
    }
}

function cerrarCompraMarketplace() {
    mkDetenerSondeo();
    _mkCompra = null;
    _mkCompraId = null;
    var m = document.getElementById('mkCompraModal');
    if (m) m.classList.remove('show');
}

// ================================================================
// ABRIR / CERRAR MODAL MARKETPLACE (publicar)
// ================================================================
// Agrega stock y wallet al formulario de publicación sin tocar el HTML.
function mkAsegurarCamposPublicar() {
    if (document.getElementById('inputStockMarketplace')) return;
    var btn = document.getElementById('btnPublicarMarketplace');
    if (!btn || !btn.parentNode) return;

    var grupoStock = mkEl('div', { class: 'form-group mk-campo-extra' });
    grupoStock.appendChild(mkEl('label', { for: 'inputStockMarketplace' }, 'Stock disponible (opcional, vacío = sin límite)'));
    grupoStock.appendChild(mkEl('input', { type: 'number', id: 'inputStockMarketplace', min: '0', step: '1', placeholder: 'Ej: 10' }));

    var grupoWallet = mkEl('div', { class: 'form-group mk-campo-extra' });
    grupoWallet.appendChild(mkEl('label', { for: 'inputWalletMarketplace' }, 'Wallet de cobro Polygon (obligatoria si pones precio)'));
    grupoWallet.appendChild(mkEl('input', { type: 'text', id: 'inputWalletMarketplace', placeholder: '0x…', maxlength: '42', autocomplete: 'off', spellcheck: 'false' }));

    btn.parentNode.insertBefore(grupoStock, btn);
    btn.parentNode.insertBefore(grupoWallet, btn);
}

function abrirModalMarketplace() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!grupoActualId) { grpShowToast('No hay canal', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro del grupo para vender', 'error'); return; }
    if (!grupoActual.marketplace_activo) { grpShowToast('El Marketplace no está activo en este grupo', 'warning'); return; }

    mkInyectarEstilos();
    mkAsegurarCamposPublicar();

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
    document.getElementById('inputStockMarketplace').value = '';
    document.getElementById('inputWalletMarketplace').value = '';
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
// SUBIR IMAGEN O VIDEO DEL MARKETPLACE VÍA BACKEND (con moderación)
// ================================================================
async function subirMediaMarketplace(archivo, tipo) {
    var session = await grpGetSession();
    if (!session) throw new Error('Sesión no válida');

    var fd = new FormData();
    fd.append('file', archivo);
    fd.append('destino', 'grupos-publicaciones');
    fd.append('tipo', tipo);

    var respuesta = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token },
        body: fd
    });
    var data = await respuesta.json().catch(function() { return {}; });

    if (!respuesta.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo subir el archivo');
    }
    return data.url;
}

// ================================================================
// PUBLICAR EN MARKETPLACE
// ================================================================
async function publicarMarketplace() {
    if (!sessionUser) { grpShowToast('Inicia sesión', 'error'); return; }
    if (!esMiembro()) { grpShowToast('Debes ser miembro del grupo', 'error'); return; }
    if (!grupoActual.marketplace_activo) { grpShowToast('El Marketplace no está activo', 'error'); return; }

    mkAsegurarCamposPublicar();

    var tipo = document.getElementById('inputTipoMarketplace').value;
    var titulo = document.getElementById('inputTituloMarketplace').value.trim();
    var descripcion = document.getElementById('inputDescripcionMarketplace').value.trim();
    var precioMxn = parseFloat(document.getElementById('inputPrecioMxnMarketplace').value) || null;
    var precioUsdt = parseFloat(document.getElementById('inputPrecioUsdtMarketplace').value) || null;
    var estado = document.getElementById('inputEstadoMarketplace').value.trim();
    var municipio = document.getElementById('inputMunicipioMarketplace').value.trim();
    var whatsapp = document.getElementById('inputWhatsappMarketplace').value.trim();
    var telefono = document.getElementById('inputTelefonoMarketplace').value.trim();
    var stockRaw = document.getElementById('inputStockMarketplace').value.trim();
    var walletRaw = document.getElementById('inputWalletMarketplace').value.trim();
    var imagenInput = document.getElementById('inputImagenMarketplace');
    var videoInput = document.getElementById('inputVideoMarketplace');
    var statusEl = document.getElementById('marketplaceStatus');
    var btn = document.getElementById('btnPublicarMarketplace');

    function error(msg) {
        statusEl.textContent = msg;
        statusEl.style.color = 'var(--warning)';
    }

    if (!tipo) return error('Selecciona el tipo');
    if (!titulo) return error('Escribe un título');
    if (!descripcion) return error('Escribe una descripción');
    if (!municipio) return error('Escribe el municipio');
    if ((precioMxn !== null && precioMxn < 0) || (precioUsdt !== null && precioUsdt < 0)) {
        return error('Los precios no pueden ser negativos');
    }

    var stock = null;
    if (stockRaw !== '') {
        stock = parseInt(stockRaw, 10);
        if (!Number.isInteger(stock) || stock < 0) return error('Stock inválido');
    }

    var tienePrecio = !!(precioMxn || precioUsdt);
    var wallet = walletRaw || null;
    if (tienePrecio && !wallet) return error('Escribe la wallet de cobro (0x…) para vender con precio');
    if (wallet && !MK_WALLET_REGEX.test(wallet)) return error('Wallet inválida: debe empezar con 0x y tener 40 caracteres hexadecimales');

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
    statusEl.textContent = 'Revisando y subiendo...';
    statusEl.style.color = 'var(--text-muted)';

    try {
        var imagenUrl = null, videoUrl = null;

        if (imagenInput.files && imagenInput.files[0]) {
            var file = imagenInput.files[0];
            if (file.size > 5 * 1024 * 1024) throw new Error('Imagen > 5MB');
            imagenUrl = await subirMediaMarketplace(file, 'imagen');
        }

        if (videoInput.files && videoInput.files[0]) {
            var vfile = videoInput.files[0];
            if (vfile.size > 50 * 1024 * 1024) throw new Error('Video > 50MB');
            var validacion = await validarDuracionVideo(vfile);
            if (!validacion.valido) throw new Error('Video > 40s');
            videoUrl = await subirMediaMarketplace(vfile, 'video');
        }

        var result = await window.supabaseClient.from('grupos_video_publicaciones').insert({
            grupo_id: grupoActualId,
            usuario_id: sessionUser.id,
            contenido: titulo,
            descripcion: descripcion,
            tipo: 'marketplace',
            estado: 'publicado',
            tipo_marketplace: tipo,
            precio_mxn: precioMxn,
            precio_usdt: precioUsdt,
            stock: stock,
            wallet_cobro: wallet,
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
// DONACIONES AL CREADOR DEL CANAL (sin cambios)
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

async function verificarRegalo(donacionId) {
    var estado = await consultarEstadoDonacion(donacionId);
    if (estado === 'pagada') giftSetStatus('Donación confirmada', 'var(--success)');
    else if (estado === 'fallida') giftSetStatus('La donación no se completó', 'var(--danger)');
    else if (estado === 'pendiente') giftSetStatus('Pendiente de confirmación', 'var(--warning)');
    else giftSetStatus('No se pudo verificar la donación', 'var(--text-muted)');
}