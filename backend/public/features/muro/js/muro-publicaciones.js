// ================================================================
// MURO · PUBLICACIONES (feed)
// ================================================================
// Cargar feed, renderizar posts, scroll infinito, verificar like.
// Depende de: muro-config.js, muro-utils.js
//
// v2.3:
// - Iconos nuevos para comentar, compartir y eliminar (trazo fino,
//   estilo moderno). Las funciones, IDs y clases no cambian.
// - Me gusta, comentar y venta usan la clase .icon-ui para que
//   muro-acciones.css les dé color y brillo.
// ================================================================

// ================================================================
// ICONOS (SVG)
// ================================================================
var MURO_PUB_ICON = {
    diamante:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12z"/></svg>',

    verificado:
        '<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 2l2.4 3.2 3.9-.6.6 3.9L22 12l-3.1 2.5.6 3.9-3.9.6L12 22l-2.4-3.2-3.9.6-.6-3.9L2 12l3.1-2.5-.6-3.9 3.9-.6z"/>' +
            '<polyline points="8.5 12.5 11 15 16 9.5"/>' +
        '</svg>',

    alerta:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' +
            '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
        '</svg>',

    // Me gusta (corazón)
    corazon:
        '<svg class="icon-ui" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 20.5s-7.5-4.4-9.4-9.1C1.3 8.3 3.4 4.5 7.2 4.5c2.1 0 3.6 1.2 4.8 2.7 1.2-1.5 2.7-2.7 4.8-2.7 3.8 0 5.9 3.8 4.6 6.9-1.9 4.7-9.4 9.1-9.4 9.1z"/>' +
        '</svg>',

    // Comentar (burbuja con puntos)
    comentar:
        '<svg class="icon-ui" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M20.5 11.6a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.6z"/>' +
            '<path d="M8.5 11.6h.01M12 11.6h.01M15.5 11.6h.01" stroke-width="2.6"/>' +
        '</svg>',

    // Compartir (flecha curva)
    compartir:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M15 14l5-5-5-5"/>' +
            '<path d="M20 9H10.5A6.5 6.5 0 0 0 4 15.5V20"/>' +
        '</svg>',

    // Eliminar (papelera con tapa)
    eliminar:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 7h16"/>' +
            '<path d="M10 11v6M14 11v6"/>' +
            '<path d="M6 7l.9 11.2A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.8L18 7"/>' +
            '<path d="M9.5 7V4.8c0-.9.7-1.6 1.6-1.6h1.8c.9 0 1.6.7 1.6 1.6V7"/>' +
        '</svg>',

    // Reportar (bandera)
    reportar:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>' +
            '<line x1="4" y1="22" x2="4" y2="15"/>' +
        '</svg>',

    // Venta (diamante pequeño)
    venta:
        '<svg class="icon-ui" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 3h12l4 6-10 12L2 9l4-6z"/>' +
        '</svg>'
};

// ================================================================
// HELPER — Manejo de errores de moderación
// ================================================================
// Uso en cualquier archivo del muro que inserte texto:
//
//   try {
//     await supabaseClient.from('muro_comentarios').insert({...});
//   } catch (e) {
//     manejarErrorModeracion(e);
//   }
// ================================================================
function manejarErrorModeracion(e) {
    var mensaje = (e && e.message) ? String(e.message) : '';

    if (mensaje.indexOf('contenido_no_permitido') !== -1) {
        if (typeof showToast === 'function') {
            showToast('Contenido no permitido por las normas de la comunidad', 'error', 6000);
        } else {
            alert('Contenido no permitido por las normas de la comunidad');
        }
        return true;
    }

    return false;
}
window.manejarErrorModeracion = manejarErrorModeracion;

// ================================================================
// CARGAR PUBLICACIONES (con scroll infinito)
// ================================================================
async function cargarPublicaciones(reset) {
    if (reset === undefined) reset = true;
    if (isLoading) return;
    if (reset) {
        currentPage = 0;
        hasMorePosts = true;
        var fc = document.getElementById('feedContainer');
        if (fc) fc.innerHTML = '';
    }
    if (!hasMorePosts) return;

    isLoading = true;
    var feedContainer = document.getElementById('feedContainer');

    try {
        var from = currentPage * POSTS_PER_PAGE;
        var to = from + POSTS_PER_PAGE - 1;

        // La vista muro_posts_publicos ya expone aviso_moderacion.
        var query = supabaseClient
            .from('muro_posts_publicos')
            .select('*, temas:tema_id (id, nombre, emoji, slug), muro_likes(count), muro_comentarios(count)')
            .order('created_at', { ascending: false })
            .range(from, to);

        if (filtroTemasActivo && temasUsuario.length > 0) {
            query = query.in('tema_id', temasUsuario);
        }

        var result = await query;
        if (result.error) throw result.error;
        var data = result.data;

        if (!data || data.length === 0) {
            hasMorePosts = false;
            if (currentPage === 0 && feedContainer) {
                var iconoVacio = MURO_PUB_ICON.diamante.replace(
                    'class="icon"',
                    'class="icon" style="width:2.5rem;height:2.5rem;margin:0 auto 16px;color:var(--gold);opacity:0.4;display:block;"'
                );
                var emptyMsg = filtroTemasActivo
                    ? '<div class="empty-state">' + iconoVacio +
                      '<h3>Sin publicaciones con tus temas</h3><p>Prueba a explorar todo el muro</p>' +
                      '<button onclick="toggleFiltroTemas()" class="btn-gold" style="margin-top:12px;"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Explorar todo</button></div>'
                    : '<div class="empty-state">' + iconoVacio +
                      '<h3>Sin publicaciones</h3><p>Sé el primero en compartir algo.</p></div>';
                feedContainer.innerHTML = emptyMsg;
            }
            isLoading = false;
            return;
        }

        if (currentPage === 0 && feedContainer) feedContainer.innerHTML = '';

        data.forEach(function(post) {
            var postElement = renderizarPost(post);
            if (feedContainer) feedContainer.appendChild(postElement);
        });

        currentPage++;
        hasMorePosts = data.length === POSTS_PER_PAGE;

        // Scroll infinito
        if (hasMorePosts && feedContainer) {
            var lastPost = feedContainer.lastElementChild;
            if (lastPost) {
                if (observerGlobal) observerGlobal.disconnect();
                observerGlobal = new IntersectionObserver(function(entries) {
                    if (entries[0].isIntersecting && !isLoading) {
                        cargarPublicaciones(false);
                    }
                }, { threshold: 0.1 });
                observerGlobal.observe(lastPost);
            }
        }
    } catch (e) {
        console.error('Error cargando publicaciones:', e);
        showToast('Error al cargar publicaciones', 'error');
    } finally {
        isLoading = false;
    }
}

// ================================================================
// RENDERIZAR POST (HTML)
// ================================================================
function renderizarPost(post) {
    var div = document.createElement('div');
    div.className = 'post-card';
    div.dataset.postId = post.id;

    var avatarUrl = post.usuario_avatar_url;
    var avatar = avatarUrl ? '<img src="' + escapeHTML(avatarUrl) + '" alt="">' : MURO_PUB_ICON.diamante;
    var nombre = escapeHTML(post.usuario_nombre || 'Explorador');
    var likesCount = (post.muro_likes && post.muro_likes[0]) ? post.muro_likes[0].count || 0 : 0;
    var comentariosCount = (post.muro_comentarios && post.muro_comentarios[0]) ? post.muro_comentarios[0].count || 0 : 0;
    var contenidoSanitizado = sanitizarHTML(post.contenido || '');

    // Enlace al perfil del autor
    var esMiPost = sessionUser && post.usuario_id === sessionUser.id;
    var perfilHref = null;
    if (esMiPost) {
        perfilHref = '/features/perfil/perfil.html';
    } else if (post.usuario_handle) {
        perfilHref = '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(post.usuario_handle);
    }

    var avatarHtml = avatar;
    var nombreHtml = nombre;
    if (perfilHref) {
        avatarHtml = '<a href="' + perfilHref + '" style="display:block;width:100%;height:100%;color:inherit;text-decoration:none;">' + avatar + '</a>';
        nombreHtml = '<a href="' + perfilHref + '" style="color:inherit;text-decoration:none;">' + nombre + '</a>';
    }

    // Badge de tema
    var temaBadge = '';
    if (post.tema_id && post.temas) {
        var temaInfo = Array.isArray(post.temas) ? post.temas[0] : post.temas;
        if (temaInfo) {
            temaBadge = '<div class="post-tema-badge">' + escapeHTML(temaInfo.nombre || '') + '</div>';
        }
    }

    // Aviso de lenguaje inapropiado
    var avisoBadge = '';
    if (post.aviso_moderacion === 'lenguaje_inapropiado') {
        avisoBadge =
            '<div class="post-aviso-moderacion" style="' +
                'display:flex;align-items:center;gap:8px;' +
                'padding:8px 12px;margin:8px 0;border-radius:10px;' +
                'background:rgba(247,212,74,0.12);' +
                'border:1px solid rgba(247,212,74,0.4);' +
                'color:#f7d44a;font-size:0.72rem;' +
            '">' +
                '<span style="display:inline-flex;width:16px;height:16px;flex-shrink:0;">' +
                    MURO_PUB_ICON.alerta.replace('class="icon"', 'class="icon" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"') +
                '</span>' +
                '<span>Este mensaje contiene lenguaje inapropiado. ' +
                    'Considera expresarte con respeto.</span>' +
            '</div>';
    }

    // Sección de venta de tokens
    var seccionVenta = '';
    if (post.cantidad_venta && post.cantidad_venta > 0 && post.precio_venta) {
        var precioPorToken = parseFloat(post.precio_venta).toFixed(2);
        var esMiPropiaVenta = sessionUser && post.usuario_id === sessionUser.id;
        var botonComprar = esMiPropiaVenta
            ? '<button class="btn-comprar" disabled style="opacity:0.5;cursor:not-allowed;">Tu venta</button>'
            : '<button class="btn-comprar" onclick="abrirModalCompra(\'' + post.id + '\')">Comprar</button>';
        seccionVenta = '<div class="post-venta">' +
            '<div>' +
                '<span style="font-size:0.7rem;color:var(--text-muted);display:inline-flex;align-items:center;gap:4px;">' +
                    MURO_PUB_ICON.venta.replace('class="icon-ui"', 'class="icon-ui icon-sm-ui"') + ' Venta de tokens' +
                '</span>' +
                '<div style="font-weight:600;color:var(--gold);">' + post.cantidad_venta + ' tokens disponibles</div>' +
                '<div style="font-size:0.65rem;color:var(--text-muted);">Precio unitario: $' + precioPorToken + ' MXN</div>' +
            '</div>' +
            botonComprar +
        '</div>';
    }

    var fecha = new Date(post.created_at).toLocaleString();
    var imagenHtml = post.imagen_url ? '<img class="post-imagen" src="' + escapeHTML(post.imagen_url) + '" alt="" />' : '';

    div.innerHTML =
        '<div class="post-header">' +
            '<div class="post-avatar">' + avatarHtml + '</div>' +
            '<div>' +
                '<div class="post-author">' + nombreHtml + ' <span class="badge-verificado">' + MURO_PUB_ICON.verificado + ' Verificado</span></div>' +
                '<div class="post-date">' + fecha + '</div>' +
            '</div>' +
            '<div class="post-actions-header">' +
                (esMiPost
                    ? '<button class="btn-delete" onclick="eliminarPublicacion(\'' + post.id + '\')" title="Eliminar" aria-label="Eliminar publicación">' + MURO_PUB_ICON.eliminar + '</button>'
                    : '<button class="btn-report" onclick="reportarPublicacion(\'' + post.id + '\')" title="Reportar" aria-label="Reportar publicación">' + MURO_PUB_ICON.reportar + '</button>') +
                '<button class="btn-share" onclick="compartirPublicacion(\'' + post.id + '\')" title="Compartir" aria-label="Compartir publicación">' + MURO_PUB_ICON.compartir + '</button>' +
            '</div>' +
        '</div>' +
        temaBadge +
        avisoBadge +
        '<div class="post-content">' + contenidoSanitizado + '</div>' +
        imagenHtml +
        seccionVenta +
        '<div class="post-stats">' +
            '<span class="like-btn" onclick="toggleLike(\'' + post.id + '\')" data-liked="false" role="button" aria-label="Me gusta">' +
                MURO_PUB_ICON.corazon + ' <span class="count">' + likesCount + '</span>' +
            '</span>' +
            '<span class="comment-btn" onclick="toggleComentarios(\'' + post.id + '\')" role="button" aria-label="Comentarios">' +
                MURO_PUB_ICON.comentar + ' <span class="count">' + comentariosCount + '</span>' +
            '</span>' +
            (post.cantidad_venta
                ? '<span class="venta-activa">' + MURO_PUB_ICON.venta.replace('class="icon-ui"', 'class="icon-ui icon-sm-ui"') + ' ' + post.cantidad_venta + ' tokens en venta</span>'
                : '') +
        '</div>' +
        '<div class="post-comentarios" id="comentarios-' + post.id + '" style="display:none;">' +
            '<div class="comentarios-lista" id="comentarios-lista-' + post.id + '"></div>' +
            '<div class="input-comentario">' +
                '<input type="text" id="input-comentario-' + post.id + '" placeholder="Escribe un comentario..." />' +
                '<button type="button" class="btn-enviar-comentario" data-post-id="' + post.id + '">Enviar</button>' +
            '</div>' +
        '</div>';

    // Verificar like en paralelo
    if (sessionUser) {
        verificarLike(post.id).then(function(liked) {
            var likeBtn = div.querySelector('.like-btn');
            if (likeBtn && liked) likeBtn.dataset.liked = 'true';
        });
    }

    return div;
}

// ================================================================
// VERIFICAR LIKE (con cache)
// ================================================================
async function verificarLike(postId) {
    if (!sessionUser) return false;
    var cacheKey = postId + '_' + sessionUser.id;
    if (likeCache.has(cacheKey)) return likeCache.get(cacheKey);

    try {
        var result = await supabaseClient
            .from('muro_likes')
            .select('id')
            .eq('post_id', postId)
            .eq('usuario_id', sessionUser.id)
            .maybeSingle();
        if (result.error) throw result.error;

        var liked = !!result.data;
        likeCache.set(cacheKey, liked);
        likeCacheOrden.push(cacheKey);
        if (likeCacheOrden.length > 100) {
            likeCache.delete(likeCacheOrden.shift());
        }
        return liked;
    } catch (e) {
        console.error('Error verificando like:', e);
        return false;
    }
}