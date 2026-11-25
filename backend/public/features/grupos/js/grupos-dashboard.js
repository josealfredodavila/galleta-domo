// ================================================================
// GRUPOS · DASHBOARD (v4)
// ================================================================
// Carga "Mis Canales", "En Vivo Ahora" y el switch de pestañas móviles.
// v4:
//  - Se eliminó la inyección de estilos UVDE: ahora vive en grupos.css.
//  - Tarjetas en vivo en contenedor 9:16 con marca de agua "C".
//  - IDs de canal escapados en los atributos onclick.
// Depende de: grupos-config.js (sessionUser, misCanalesCache),
//             grupos-utils.js (grpEscapeHTML, grpSafeUrl, esperarSupabase)
// ================================================================

var _timerTarjetaTiempo = null;

// Icono de marca de agua (mismo diseño que el feed de videos)
var MARCA_AGUA_SVG =
    '<span class="marca-agua" aria-hidden="true">' +
        '<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="2" y="2" width="56" height="76" rx="8" fill="none" stroke="#D4AF37" stroke-width="3"/>' +
            '<text x="30" y="58" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="50" fill="#D4AF37">C</text>' +
        '</svg>' +
    '</span>';

// Icono de canal con marketplace activo
var ICONO_MARKETPLACE_SVG =
    '<svg class="icon icon-sm" viewBox="0 0 24 24" style="vertical-align:middle;">' +
        '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
        '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
    '</svg>';

// ================================================================
// TARJETA DE TIEMPO DEL CREADOR
// ================================================================
function asegurarTarjetaTiempo() {
    var cont = document.getElementById('colMisCanales');
    if (!cont) return null;

    var card = document.getElementById('tiempoCanalCard');
    if (card) return card;

    card = document.createElement('div');
    card.id = 'tiempoCanalCard';
    card.style.cssText =
        'margin:0 0 14px 0;padding:14px 16px;border-radius:16px;' +
        'background:rgba(0,0,0,0.35);border:1px solid var(--glass-border);';

    var lista = document.getElementById('misCanalesLista');
    cont.insertBefore(card, lista || cont.firstChild);
    return card;
}

function formatoTiempoCanal(minutos) {
    var m = Math.max(0, Math.floor(Number(minutos) || 0));
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h > 0 ? h + ' h ' + r + ' min' : r + ' min';
}

async function obtenerTiempoCanalDashboard() {
    var rpc = await window.supabaseClient.rpc('obtener_tiempo_canal');
    if (rpc.error) throw rpc.error;

    var r = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    return {
        limite: Number(r && r.limite) || 120,
        usados: Number(r && r.usados) || 0,
        restantes: Number(r && r.restantes) || 0
    };
}

async function actualizarTarjetaTiempo() {
    var card = asegurarTarjetaTiempo();
    if (!card) return;

    if (!sessionUser) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';

    try {
        var t = await obtenerTiempoCanalDashboard();
        var porcentajeUsado = t.limite > 0
            ? Math.min(100, Math.round((t.usados / t.limite) * 100))
            : 0;
        var agotado = t.restantes <= 0;
        var colorBarra = t.restantes <= 10
            ? 'var(--danger)'
            : 'linear-gradient(90deg,#00d68f,#D4AF37)';
        var mensaje = agotado
            ? 'Ya usaste tus 2 horas de hoy. Se reinician a medianoche (hora de México).'
            : 'Te quedan ' + formatoTiempoCanal(t.restantes) + ' hoy.';

        card.innerHTML =
            '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">' +
                'Tu tiempo de hoy en canales' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;">' +
                '<span style="font-family:Orbitron,monospace;font-size:1rem;color:var(--gold);">' +
                    grpEscapeHTML(formatoTiempoCanal(t.restantes)) +
                '</span>' +
                '<span style="font-size:0.65rem;color:var(--text-muted);">' +
                    'de ' + grpEscapeHTML(formatoTiempoCanal(t.limite)) +
                    ' · usados ' + grpEscapeHTML(formatoTiempoCanal(t.usados)) +
                '</span>' +
            '</div>' +
            '<div style="height:6px;border-radius:4px;background:rgba(255,255,255,0.1);overflow:hidden;margin:8px 0;">' +
                '<div style="height:100%;width:' + porcentajeUsado + '%;background:' + colorBarra + ';transition:width 0.6s ease;"></div>' +
            '</div>' +
            '<div style="font-size:0.65rem;color:' + (agotado ? 'var(--danger)' : 'var(--text-secondary)') + ';line-height:1.5;">' +
                grpEscapeHTML(mensaje) +
            '</div>' +
            '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:6px;line-height:1.5;">' +
                'El límite es personal: suma todas tus transmisiones en todos tus canales. Al agotarse, tu live se cierra solo.' +
            '</div>';
    } catch (e) {
        card.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);">No se pudo cargar tu tiempo de hoy.</div>';
        console.warn('[Grupos] Tiempo de canal:', e && e.message ? e.message : e);
    }
}

function iniciarTarjetaTiempo() {
    if (_timerTarjetaTiempo) clearInterval(_timerTarjetaTiempo);
    _timerTarjetaTiempo = setInterval(function () {
        if (document.visibilityState === 'visible') actualizarTarjetaTiempo();
    }, 60000);
}

// ================================================================
// MIS CANALES
// ================================================================
function htmlMisCanales(canales) {
    return canales.map(function (g) {
        var avatarUrl = grpSafeUrl(g.avatar_url);
        var avatar = avatarUrl
            ? '<img src="' + grpEscapeHTML(avatarUrl) + '" alt="">'
            : '◈';
        var precio = g.precio_usdt > 0 ? '$' + g.precio_usdt + ' USDT' : 'Gratis';
        var mkIcon = g.marketplace_activo ? ICONO_MARKETPLACE_SVG : '';

        return '<div class="canal-item" onclick="abrirGrupo(\'' + grpEscapeHTML(g.id) + '\')">' +
            '<div class="avatar-mini">' + avatar + '</div>' +
            '<div class="info">' +
                '<div class="nombre">' + grpEscapeHTML(g.nombre) + ' ' + mkIcon + '</div>' +
                '<div class="stats">' + precio + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

async function cargarMisCanales(misCanalesDiv) {
    if (!sessionUser) {
        misCanalesDiv.innerHTML =
            '<div class="empty-state" style="padding:20px;">' +
                '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg>' +
                '<p style="font-size:0.7rem;">Inicia sesión para ver tus canales.</p>' +
            '</div>';
        return;
    }

    var misGruposResult = await window.supabaseClient
        .from('grupos_video_miembros')
        .select('grupo_id')
        .eq('usuario_id', sessionUser.id)
        .eq('estado', 'activo');

    var ids = (misGruposResult.data || []).map(function (m) { return m.grupo_id; });

    if (ids.length === 0) {
        misCanalesDiv.innerHTML =
            '<div class="empty-state" style="padding:20px;">' +
                '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg>' +
                '<p style="font-size:0.7rem;">No sigues ningún canal aún.</p>' +
            '</div>';
        return;
    }

    var misCanalesData = await window.supabaseClient
        .from('grupos_video')
        .select('id, nombre, avatar_url, precio_usdt, marketplace_activo')
        .in('id', ids);

    misCanalesCache = misCanalesData.data || [];
    misCanalesDiv.innerHTML = htmlMisCanales(misCanalesCache);
}

// ================================================================
// EN VIVO AHORA
// ================================================================
function htmlBotonSalirAire() {
    if (misCanalesCache && misCanalesCache.length > 0) {
        return '<button class="btn-salir-aire" onclick="abrirGrupo(\'' + grpEscapeHTML(misCanalesCache[0].id) + '\')">' +
            '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg>' +
            'SALIR AL AIRE EN ' + grpEscapeHTML(String(misCanalesCache[0].nombre || '').toUpperCase()) +
        '</button>';
    }
    return '<button class="btn-salir-aire" onclick="abrirModalCrearGrupo()">' +
        '<svg class="icon icon-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg>' +
        'Crear mi canal' +
    '</button>';
}

function htmlSinLives() {
    return '<div class="no-live-box">' +
        '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/></svg>' +
        '<h3>Nadie al aire por ahora</h3>' +
        '<p>Sé el primero en transmitir en tu canal</p>' +
        htmlBotonSalirAire() +
    '</div>';
}

// Tarjeta del live: contenedor 9:16 con portada y marca de agua
function htmlTarjetaLive(l) {
    var g = l.grupo || {};
    var portada = grpSafeUrl(g.avatar_url);
    var idCanal = grpEscapeHTML(g.id);

    var mediaPortada = portada
        ? '<img src="' + grpEscapeHTML(portada) + '" alt="Portada">'
        : '<div class="en-vivo-sin-portada">◈</div>';

    var avatarOverlay = portada
        ? '<img src="' + grpEscapeHTML(portada) + '" alt="" class="en-vivo-avatar">'
        : '';

    return '<div class="en-vivo-card" onclick="abrirGrupo(\'' + idCanal + '\')">' +
        '<div class="live-tag-small">' +
            '<svg class="icon icon-sm" viewBox="0 0 24 24" style="color:#fff;fill:currentColor;stroke:none;"><circle cx="12" cy="12" r="6"/></svg>' +
            'EN VIVO' +
        '</div>' +
        '<div class="video-9x16 uvde-live-container">' +
            mediaPortada +
            '<div class="uvde-live-overlay">' + avatarOverlay + '</div>' +
            MARCA_AGUA_SVG +
        '</div>' +
        '<div class="info">' +
            '<div class="titulo">' + grpEscapeHTML(l.titulo || 'Sin título') + '</div>' +
            '<div class="canal">' + grpEscapeHTML(g.nombre || 'Canal') + '</div>' +
            '<div class="stats">' +
                '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
                grpEscapeHTML(l.espectadores || 0) + ' viendo' +
            '</div>' +
        '</div>' +
    '</div>';
}

async function cargarEnVivo(enVivoDiv) {
    // Transmisiones activas. La política de RLS decide qué canales privados se ven.
    var livesResult = await window.supabaseClient
        .from('transmisiones')
        .select('*, grupo:grupos_video(id, nombre, avatar_url)')
        .eq('estado', 'en_vivo')
        .eq('is_live', true)
        .order('created_at', { ascending: false })
        .limit(20);

    var lives = livesResult.data || [];

    enVivoDiv.innerHTML = lives.length === 0
        ? htmlSinLives()
        : lives.map(htmlTarjetaLive).join('');
}

// ================================================================
// CARGAR DASHBOARD
// ================================================================
async function cargarDashboard() {
    var misCanalesDiv = document.getElementById('misCanalesLista');
    var enVivoDiv = document.getElementById('enVivoGrid');
    if (!misCanalesDiv || !enVivoDiv) return;

    if (!(await esperarSupabase())) {
        console.warn('[Grupos] cargarDashboard: supabaseClient no disponible');
        return;
    }

    try {
        await actualizarTarjetaTiempo();
        iniciarTarjetaTiempo();

        await cargarMisCanales(misCanalesDiv);
        await cargarEnVivo(enVivoDiv);
    } catch (e) {
        console.warn('[Grupos] Error cargando dashboard:', e);
    }
}

// ================================================================
// SWITCH ENTRE PESTAÑAS MÓVILES (Mis Canales / En Vivo)
// ================================================================
function switchTab(tab) {
    var tabMis = document.getElementById('tabMisCanales');
    var tabVivo = document.getElementById('tabEnVivo');
    var colMis = document.getElementById('colMisCanales');
    var colVivo = document.getElementById('colEnVivo');
    if (!tabMis || !tabVivo || !colMis || !colVivo) return;

    var mostrarMis = tab === 'mis-canales';
    tabMis.classList.toggle('active', mostrarMis);
    tabVivo.classList.toggle('active', !mostrarMis);
    colMis.style.display = mostrarMis ? 'block' : 'none';
    colVivo.style.display = mostrarMis ? 'none' : 'block';
}