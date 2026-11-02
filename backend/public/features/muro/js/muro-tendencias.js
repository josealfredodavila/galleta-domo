// ================================================================
// MURO · TENDENCIAS
// ================================================================
// Cargar tendencias dinámicas + tokens destacados del backend.
// Depende de: muro-config.js, muro-utils.js, muro-temas.js
//
// v2:
// - Sin emojis: sol, amanecer y luna son SVG con degradado 3D.
// - La franja horaria no cambia: amanecer 5:00–11:59, sol 12:00–18:59,
//   luna 19:00–4:59.
// ================================================================

// ================================================================
// ICONOS (SVG, sin emojis)
// ================================================================
var MURO_TEND_ICON = {
    amanecer:
        '<svg class="icon-hora" viewBox="0 0 24 24" aria-hidden="true">' +
            '<defs>' +
                '<linearGradient id="csAmanecerG" x1="0" y1="0" x2="0" y2="1">' +
                    '<stop offset="0" stop-color="#ffe08a"/>' +
                    '<stop offset="1" stop-color="#ff8a3d"/>' +
                '</linearGradient>' +
            '</defs>' +
            '<path d="M6 17a6 6 0 0 1 12 0z" fill="url(#csAmanecerG)"/>' +
            '<line x1="2" y1="18" x2="22" y2="18" stroke="#ffb35c" stroke-width="2" stroke-linecap="round"/>' +
            '<path d="M12 4v3M4.9 8.2l2.1 2.1M19.1 8.2l-2.1 2.1M2.5 14.5h2.5M19 14.5h2.5" stroke="#ffd27a" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
        '</svg>',

    sol:
        '<svg class="icon-hora" viewBox="0 0 24 24" aria-hidden="true">' +
            '<defs>' +
                '<radialGradient id="csSolG" cx="35%" cy="35%" r="70%">' +
                    '<stop offset="0" stop-color="#fff6c2"/>' +
                    '<stop offset="0.45" stop-color="#ffd24a"/>' +
                    '<stop offset="1" stop-color="#e08a00"/>' +
                '</radialGradient>' +
                '<radialGradient id="csSolHalo" cx="50%" cy="50%" r="50%">' +
                    '<stop offset="0" stop-color="#ffd24a" stop-opacity="0.45"/>' +
                    '<stop offset="1" stop-color="#ffd24a" stop-opacity="0"/>' +
                '</radialGradient>' +
            '</defs>' +
            '<circle cx="12" cy="12" r="11" fill="url(#csSolHalo)"/>' +
            '<circle cx="12" cy="12" r="5.2" fill="url(#csSolG)"/>' +
            '<path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" stroke="#ffcf4d" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
        '</svg>',

    luna:
        '<svg class="icon-hora" viewBox="0 0 24 24" aria-hidden="true">' +
            '<defs>' +
                '<radialGradient id="csLunaG" cx="30%" cy="30%" r="75%">' +
                    '<stop offset="0" stop-color="#ffffff"/>' +
                    '<stop offset="0.5" stop-color="#c9d6ee"/>' +
                    '<stop offset="1" stop-color="#5a6c92"/>' +
                '</radialGradient>' +
                '<radialGradient id="csLunaHalo" cx="50%" cy="50%" r="50%">' +
                    '<stop offset="0" stop-color="#9fb8ff" stop-opacity="0.35"/>' +
                    '<stop offset="1" stop-color="#9fb8ff" stop-opacity="0"/>' +
                '</radialGradient>' +
            '</defs>' +
            '<circle cx="12" cy="12" r="11" fill="url(#csLunaHalo)"/>' +
            '<path d="M14.6 3.1A8.9 8.9 0 1 0 20.9 16.2 7.2 7.2 0 0 1 14.6 3.1z" fill="url(#csLunaG)"/>' +
            '<circle cx="9.5" cy="9" r="1.2" fill="#8095c0" opacity="0.55"/>' +
            '<circle cx="7.2" cy="14.2" r="0.9" fill="#8095c0" opacity="0.45"/>' +
            '<circle cx="19.5" cy="4.5" r="0.7" fill="#dbe6ff"/>' +
            '<circle cx="21" cy="9" r="0.5" fill="#dbe6ff"/>' +
        '</svg>',

    rombo:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 2 22 12 12 22 2 12z"/>' +
        '</svg>'
};

// Devuelve el icono según la franja horaria local
function muroIconoHora(hora) {
    if (hora >= 5 && hora < 12) return MURO_TEND_ICON.amanecer;   // 5:00 - 11:59
    if (hora >= 12 && hora < 19) return MURO_TEND_ICON.sol;       // 12:00 - 18:59
    return MURO_TEND_ICON.luna;                                    // 19:00 - 4:59
}

// ================================================================
// CARGAR TENDENCIAS DINÁMICAS
// ================================================================
async function cargarTendencias() {
    var contenedor = document.getElementById('trendingTags');
    var actualizado = document.getElementById('trendingActualizado');
    if (!contenedor) return;

    try {
        var resp = await fetch(BACKEND_URL + '/api/tendencias');
        var json = await resp.json();

        if (!json.success || !json.data) {
            contenedor.innerHTML = '<span class="tag loading">Sin tendencias</span>';
            return;
        }

        var d = json.data;
        var html = '';

        (d.top_temas || []).forEach(function(t) {
            html += '<span class="tag tema" onclick="buscarPorTema(\'' + escapeHTML(t.slug || '') + '\')">' +
                    escapeHTML(t.nombre || '') +
                    ' <span style="opacity:0.6;font-size:0.6rem;">' + (t.posts_count || 0) + '</span>' +
                    '</span>';
        });

        // Fallback si no hay temas
        if (!d.top_temas || d.top_temas.length === 0) {
            ['Sariels', 'GalletaDomo', 'Web3', 'EsStoks', 'NFT'].forEach(function(tag) {
                html += '<span class="tag" onclick="buscarHashtag(\'' + tag + '\')">#' + tag + '</span>';
            });
        }

        contenedor.innerHTML = html;

        // Hora en formato 12h + AM/PM + icono SVG según la franja horaria
        if (actualizado) {
            var ahora = new Date();
            var hora = ahora.getHours();
            var h12 = hora % 12 || 12;
            var minutos = String(ahora.getMinutes()).padStart(2, '0');
            var ampm = hora < 12 ? 'AM' : 'PM';

            actualizado.innerHTML =
                '<span class="emoji-hora" aria-hidden="true">' + muroIconoHora(hora) + '</span> ' +
                h12 + ':' + minutos + ' ' + ampm;
        }
    } catch (e) {
        console.error('Error cargando tendencias:', e);
        contenedor.innerHTML = '<span class="tag" onclick="buscarHashtag(\'Sariels\')">#Sariels</span>' +
                                '<span class="tag" onclick="buscarHashtag(\'Web3\')">#Web3</span>' +
                                '<span class="tag" onclick="buscarHashtag(\'EsStoks\')">#EsStoks</span>';
    }
}

// ================================================================
// CARGAR TOKENS DESTACADOS
// ================================================================
async function cargarTokensDestacados() {
    var contenedor = document.getElementById('tokensDestacados');
    var lista = document.getElementById('tokensDestacadosLista');
    if (!contenedor || !lista) return;

    try {
        var resp = await fetch(BACKEND_URL + '/api/tendencias');
        var json = await resp.json();

        if (!json.success || !json.data ||
            !json.data.tokens_destacados ||
            json.data.tokens_destacados.length === 0) {
            contenedor.style.display = 'none';
            return;
        }

        contenedor.style.display = 'block';

        lista.innerHTML = json.data.tokens_destacados.slice(0, 5).map(function(t) {
            var avatar = t.vendedor_avatar
                ? '<img src="' + escapeHTML(t.vendedor_avatar) + '" alt="">'
                : MURO_TEND_ICON.rombo;
            var handle = t.vendedor_handle ? '@' + escapeHTML(t.vendedor_handle) : '';

            return '<div class="token-item" onclick="irAPost(\'' + t.id + '\')">' +
                '<div class="avatar">' + avatar + '</div>' +
                '<div class="info">' +
                    '<div class="vendedor">' + escapeHTML(t.vendedor_nombre || 'Usuario') +
                        ' <span style="opacity:0.6;font-weight:400;">' + handle + '</span>' +
                    '</div>' +
                    '<div class="detalle">' + t.cantidad_venta + ' tokens · $' +
                        parseFloat(t.precio_venta).toFixed(2) + ' c/u</div>' +
                '</div>' +
                '<div class="valor">' +
                    '<span class="label">Total</span>' +
                    '$' + parseFloat(t.valor_total).toFixed(2) +
                '</div>' +
            '</div>';
        }).join('');
    } catch (e) {
        console.error('Error cargando tokens destacados:', e);
        contenedor.style.display = 'none';
    }
}

// ================================================================
// IR A UN POST ESPECÍFICO
// ================================================================
function irAPost(postId) {
    var el = document.querySelector('[data-post-id="' + postId + '"]');
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'all 0.3s';
        el.style.boxShadow = '0 0 30px rgba(212,175,55,0.6)';
        setTimeout(function() {
            el.style.boxShadow = '';
        }, 2000);
    } else {
        buscarHashtag('venta');
    }
}

// ================================================================
// BUSCAR POR TEMA (wrapper)
// ================================================================
function buscarPorTema(slug) {
    if (!slug) return;
    if (typeof buscarPorTemaSlug === 'function') {
        buscarPorTemaSlug(slug);
    }
}