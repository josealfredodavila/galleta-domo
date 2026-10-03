// ================================================================
// MURO · PUBLICACIONES (feed)
// ================================================================
// Cargar feed, renderizar posts, scroll infinito, verificar like.
// Depende de: muro-config.js, muro-utils.js
// ================================================================

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
                var emptyMsg = filtroTemasActivo
                    ? '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24" style="width:2.5rem;height:2.5rem;margin:0 auto 16px;color:var(--gold);opacity:0.4;display:block;"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/><polygon points="12 7 16 9.5 16 14.5 12 17 8 14.5 8 9.5 12 7"/></svg><h3>Sin publicaciones con tus temas</h3><p>Prueba a explorar todo el muro</p><button onclick="toggleFiltroTemas()" class="btn-gold" style="margin-top:12px;"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Explorar todo</button></div>'
                    : '<div class="empty-state"><svg class="icon" viewBox="0 0 24 24" style="width:2.5rem;height:2.5rem;margin:0 auto 16px;color:var(--gold);opacity:0.4;display:block;"><polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/><polygon points="12 7 16 9.5 16 14.5 12 17 8 14.5 8 9.5 12 7"/></svg><h3>Sin publicaciones</h3><p>Sé el primero en compartir algo.</p></div>';
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
    var avatar = avatarUrl ? '<img src="' + escapeHTML(avatarUrl) + '">' : '◈';
    var nombre = escapeHTML(post.usuario_nombre || 'Explorador');
    var likesCount = (post.muro_likes && post.muro_likes[0]) ? post.muro_likes[0].count || 0 : 0;
    var comentariosCount = (post.muro_comentarios && post.muro_comentarios[0]) ? post.muro_comentarios[0].count || 0 : 0;
    var contenidoSanitizado = sanitizarHTML(post.contenido || '');

    // Badge de tema
    var temaBadge = '';
    if (post.tema_id && post.temas) {
        var temaInfo = Array.isArray(post.temas) ? post.temas[0] : post.temas;
        if (temaInfo) {
            temaBadge = '<div class="post-tema-badge">' + escapeHTML(temaInfo.nombre || '') + '</div>';
        }
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
                    '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/><path d="M2 9h20M12 3l-4 6 4 12 4-12-4-6"/></svg> Venta de tokens' +
                '</span>' +
                '<div style="font-weight:600;color:var(--gold);">' + post.cantidad_venta + ' tokens disponibles</div>' +
                '<div style="font-size:0.65rem;color:var(--text-muted);">Precio unitario: $' + precioPorToken + ' MXN</div>' +
            '</div>' +
            botonComprar +
        '</div>';
    }

    var fecha = new Date(post.created_at).toLocaleString();
    var imagenHtml = post.imagen_url ? '<img class="post-imagen" src="' + escapeHTML(post.imagen_url) + '" />' : '';

    div.innerHTML =
        '<div class="post-header">' +
            '<div class="post-avatar">' + avatar + '</div>' +
            '<div>' +
                '<div class="post-author">' + nombre + ' <span class="badge-verificado">✦ Verificado</span></div>' +
                '<div class="post-date">' + fecha + '</div>' +
            '</div>' +
            '<div class="post-actions-header">' +
                (sessionUser && post.usuario_id === sessionUser.id
                    ? '<button class="btn-delete" onclick="eliminarPublicacion(\'' + post.id + '\')" title="Eliminar"><svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
                    : '<button class="btn-report" onclick="reportarPublicacion(\'' + post.id + '\')" title="Reportar"><svg class="icon" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></button>') +
                '<button class="btn-share" onclick="compartirPublicacion(\'' + post.id + '\')" title="Compartir"><svg class="icon" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>' +
            '</div>' +
        '</div>' +
        temaBadge +
        '<div class="post-content">' + contenidoSanitizado + '</div>' +
        imagenHtml +
        seccionVenta +
        '<div class="post-stats">' +
            '<span class="like-btn" onclick="toggleLike(\'' + post.id + '\')" data-liked="false">' +
                '<svg class="icon" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> <span class="count">' + likesCount + '</span>' +
            '</span>' +
            '<span onclick="toggleComentarios(\'' + post.id + '\')">' +
                '<svg class="icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> <span class="count">' + comentariosCount + '</span>' +
            '</span>' +
            (post.cantidad_venta
                ? '<span style="color:var(--gold);font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/></svg> ' + post.cantidad_venta + ' tokens en venta</span>'
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