// ================================================================
// INTERNET · PLANES
// ================================================================
// Cargar planes, renderizar packs, selector de paquete,
// filtrado de redes de pago por monto mínimo.
// Depende de: internet-config.js, internet-utils.js
// ================================================================

// ================================================================
// CARGAR PLANES DESDE SUPABASE
// ================================================================
async function cargarPlanes() {
    try {
        var result = await supabaseClient
            .from('paquetes_internet')
            .select('*')
            .eq('activo', true)
            .order('orden', { ascending: true });

        if (result.error) throw result.error;

        planes = result.data || [];
        renderPacks();
        return planes;
    } catch (error) {
        console.error('Error cargando planes:', error);
        showToast('✕ Error al cargar paquetes', 'error');
        planes = [];
        renderPacks();
        return [];
    }
}

// ================================================================
// RENDERIZAR TARJETAS DE PACKS
// ================================================================
function renderPacks() {
    var grid = document.getElementById('internetGrid');
    if (!grid) return;

    if (!planes || planes.length === 0) {
        grid.innerHTML =
            '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">' +
                '<span style="font-size:3rem;color:var(--gold-cosmic);opacity:0.6;text-shadow:0 0 30px color-mix(in srgb, var(--accent, #D4AF37) 50%, transparent);display:inline-block;">◈</span>' +
                '<p style="margin-top:12px;font-family:\'Orbitron\',monospace;color:var(--gold-cosmic);letter-spacing:1px;">Sin paquetes disponibles</p>' +
                '<p style="font-size:0.7rem;">Vuelve más tarde</p>' +
            '</div>';
        return;
    }

    grid.innerHTML = planes.map(function(p, index) {
        return '<div onclick="selectPack(' + Number(p.id) + ')" id="pack-' + Number(p.id) + '" class="pack-card ' + (index === 2 ? 'popular' : '') + '">' +
            (index === 2 ? '<div class="popular-badge">◈ POPULAR</div>' : '') +
            '<div class="pack-header">' +
                '<span class="pack-name">' + escapeHTML(p.nombre) + '</span>' +
                '<span class="pack-vel">4G/5G</span>' +
            '</div>' +
            '<div class="pack-data">' +
                '<span class="size">' + escapeHTML(p.datos_gb) + ' <span>GB</span></span>' +
                '<span class="days"> / ' + escapeHTML(p.duracion_dias) + ' días</span>' +
            '</div>' +
            '<div class="pack-price">' +
                '<span style="font-size:0.7rem;color:var(--text-muted);">MXN</span> $' + escapeHTML(p.precio_mxn) +
                ' <span style="font-size:0.6rem;color:var(--text-muted);margin-left:8px;">·</span> ' +
                '<span style="font-size:0.7rem;color:var(--text-muted);">USDT</span> $' + escapeHTML(p.precio_usdt) +
            '</div>' +
            '<div class="pack-features">' +
                '<span>◈ Hotspot</span>' +
                '<span>◆ Sin contrato</span>' +
                '<span>◉ Activa al instante</span>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ================================================================
// FILTRAR REDES DE PAGO SEGÚN MONTO MÍNIMO
// ================================================================
function getRedesDisponibles(montoMxn) {
    var monto = Number(montoMxn);
    if (!Number.isFinite(monto) || monto <= 0) return [];
    var montoUsd = monto * MXN_A_USD_APROX;
    return REDES_PAGO.filter(function(r) {
        return montoUsd >= r.min;
    });
}

function poblarRedesDePago(montoMxn) {
    var select = document.getElementById('pay-currency');
    var info = document.getElementById('red-info');
    if (!select) return;

    var monto = Number(montoMxn);

    if (!Number.isFinite(monto) || monto <= 0) {
        select.innerHTML = '<option value="">Selecciona un paquete primero…</option>';
        if (info) info.innerHTML = '◈ Elige un paquete para ver las redes disponibles.';
        return;
    }

    var redes = getRedesDisponibles(monto);

    if (redes.length === 0) {
        var minimoMxn = Math.ceil(1 / MXN_A_USD_APROX);
        select.innerHTML = '<option value="">Monto insuficiente</option>';
        if (info) info.innerHTML = '<span class="warn">◈ El paquete es menor al mínimo. Mínimo: ~$' + minimoMxn + ' MXN (1 USD).</span>';
        return;
    }

    var previo = select.value;
    select.innerHTML = redes.map(function(r) {
        return '<option value="' + r.value + '">' + r.label + ' · mín ' + r.min + ' USD</option>';
    }).join('');

    if (redes.some(function(r) { return r.value === previo; })) {
        select.value = previo;
    }

    var montoUsd = (monto * MXN_A_USD_APROX).toFixed(2);
    var descartadas = REDES_PAGO.length - redes.length;

    if (info) {
        info.innerHTML =
            '◈ Precio: <strong>$' + monto.toFixed(2) + ' MXN</strong> ≈ <strong>$' + montoUsd + ' USD</strong><br>' +
            '◈ ' + redes.length + ' red(es) disponibles' +
            (descartadas > 0 ? ' · ' + descartadas + ' ocultas por mínimo' : '');
    }
}

// ================================================================
// SELECCIONAR UN PACK
// ================================================================
function selectPack(id) {
    selectedPack = planes.find(function(p) { return p.id === id; });
    if (!selectedPack) return;

    document.querySelectorAll('.pack-card').forEach(function(el) {
        el.classList.remove('selected');
    });
    var el = document.getElementById('pack-' + id);
    if (el) el.classList.add('selected');

    var phone = document.getElementById('netPhone').value.trim() || 'tu número';
    var resumen = document.getElementById('internetResumen');
    if (resumen) {
        resumen.innerHTML =
            '<strong>' + escapeHTML(selectedPack.nombre) + '</strong> - ' + escapeHTML(selectedPack.datos_gb) + ' GB<br>' +
            escapeHTML(selectedPack.duracion_dias) + ' días<br><br>' +
            '<span class="precio-final">$' + escapeHTML(selectedPack.precio_mxn) + ' MXN</span><br>' +
            '<span style="font-size:0.65rem;">Contacto: ' + escapeHTML(phone) + '</span>';
    }

    poblarRedesDePago(selectedPack.precio_mxn);
}