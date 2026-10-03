// ================================================================
// MURO · TENDENCIAS
// ================================================================
// Cargar tendencias dinámicas + tokens destacados del backend.
// Depende de: muro-config.js, muro-utils.js, muro-temas.js
// ================================================================

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

        if (actualizado) {
            actualizado.textContent = 'Actualizado ' + new Date().toLocaleTimeString().slice(0, 5);
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
                ? '<img src="' + escapeHTML(t.vendedor_avatar) + '">'
                : '◈';
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