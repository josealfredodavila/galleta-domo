// ================================================================
// MURO · PUBLICACIONES (feed) · v3.0
// ================================================================
// Cargar feed, renderizar posts estilo plataforma tipo X,
// scroll infinito por cursor, verificación de like.
// Depende de: muro-config.js, muro-utils.js
//
// v3.0:
// - Tarjeta tipo X: cabecera en una línea (nombre, handle, fecha),
//   texto, media y barra de acciones (responder, republicar, me gusta,
//   compartir).
// - Media con data-xv-* para abrir el visor a pantalla completa
//   definido en muro.html.
// - Eliminar y reportar pasan al menú de tres puntos (sin perder funciones).
// - Se conservan: paginación por cursor, caché de likes, moderación,
//   temas, aviso de lenguaje, venta de tokens y todas las funciones
//   que llaman otros archivos del muro.
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

    corazon:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' +
        '</svg>',

    comentar:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>' +
        '</svg>',

    republicar:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
            '<path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' +
        '</svg>',

    compartir:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
            '<line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>' +
        '</svg>',

    mas:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>' +
        '</svg>',

    eliminar:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/>' +
            '<path d="M6 7l.9 11.2A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.8L18 7"/>' +
            '<path d="M9.5 7V4.8c0-.9.7-1.6 1.6-1.6h1.8c.9 0 1.6.7 1.6 1.6V7"/>' +
        '</svg>',

    reportar:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>' +
            '<line x1="4" y1="22" x2="4" y2="15"/>' +
        '</svg>',

    venta:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/></svg>'
};

// ================================================================
// HELPER — Manejo de errores de moderación
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
// CURSOR DEL FEED
// ================================================================
var feedCursor = null; // { created_at: string, id: number } | null

function construirFiltroCursor(cursor) {
    if (!cursor || !cursor.created_at || cursor.id == null) return null;
    var ts = String(cursor.created_at);
    var id = Number(cursor.id);
    if (!Number.isInteger(id)) return null;
    return 'created_at.lt."' + ts + '",and(created_at.eq."' + ts + '",id.lt.' + id + ')';
}

// ================================================================
// CARGAR PUBLICACIONES (scroll infinito por cursor)
// ================================================================
async function cargarPublicaciones(reset) {
    if (reset === undefined) reset = true;
    if (isLoading) return;
    if (reset) {
        currentPage = 0;
        feedCursor = null;
        hasMorePosts = true;
        var fc = document.getElementById('feedContainer');
        if (fc) fc.innerHTML = '';
    }
    if (!hasMorePosts) return;

    isLoading = true;
    var feedContainer = document.getElementById('feedContainer');

    try {
        var query = supabaseClient
            .from('muro_posts_publicos')
            .select('*, temas:tema_id (id, nombre, emoji, slug), muro_likes(count), muro_comentarios(count)')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(POSTS_PER_PAGE);

        var filtroCursor = construirFiltroCursor(feedCursor);
        if (filtroCursor) {
            query = query.or(filtroCursor);
        }

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
                    'class="icon" style="width:2.5rem;height:2.5rem;margin:0 auto 14px;color:var(--cyan);opacity:0.5;display:block;"'
                );
                var emptyMsg = filtroTemasActivo
                    ? '<div class="empty-state">' + iconoVacio +
                      '<h3>Sin publicaciones con tus temas</h3><p>Prueba a explorar todo el muro</p>' +
                      '<button onclick="toggleFiltroTemas()" class="btn-gold" style="margin-top:12px;">Explorar todo</button></div>'
                    : '<div class="empty-state">' + iconoVacio +
                      '<h3>Sin publicaciones</h3><p>Sé el primero en compartir algo.</p></div>';
                feedContainer.innerHTML = emptyMsg;
            }
            isLoading = false;
            return;
        }

        if (currentPage === 0 && feedContainer) feedContainer.innerHTML = '';

        data.forEach(function (post) {
            var postElement = renderizarPost(post);
            if (feedContainer) feedContainer.appendChild(postElement);
        });

        var ultima = data[data.length - 1];
        feedCursor = { created_at: ultima.created_at, id: ultima.id };

        currentPage++;
        hasMorePosts = data.length === POSTS_PER_PAGE;

        if (hasMorePosts && feedContainer) {
            var lastPost = feedContainer.lastElementChild;
            if (lastPost) {
                if (observerGlobal) observerGlobal.disconnect();
                observerGlobal = new IntersectionObserver(function (entries) {
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
// MENÚ DE TRES PUNTOS (eliminar / reportar)
// ================================================================
function cerrarMenusPublicacion() {
    document.querySelectorAll('.post-menu-flotante').forEach(function (m) { m.remove(); });
}

function abrirMenuPublicacion(boton, post, esMiPost) {
    cerrarMenusPublicacion();
    var menu = document.createElement('div');
    menu.className = 'post-menu-flotante';
    menu.style.cssText =
        'position:fixed;z-index:7000;min-width:180px;background:#000;' +
        'border:1px solid #2f353d;border-radius:14px;padding:6px;' +
        'box-shadow:0 16px 40px rgba(0,0,0,.7);';

    var opciones = [];
    if (esMiPost) {
        opciones.push({ texto: 'Eliminar publicación', icono: MURO_PUB_ICON.eliminar, peligro: true, accion: function () { eliminarPublicacion(post.id); } });
    } else {
        opciones.push({ texto: 'Reportar publicación', icono: MURO_PUB_ICON.reportar, peligro: true, accion: function () { reportarPublicacion(post.id); } });
    }

    opciones.forEach(function (op) {
        var b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = op.icono + '<span>' + op.texto + '</span>';
        b.style.cssText =
            'display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;' +
            'background:transparent;border:0;border-radius:10px;cursor:pointer;' +
            'font-size:.88rem;font-weight:700;color:' + (op.peligro ? '#f4212e' : '#e7e9ea') + ';';
        b.querySelector('svg').style.cssText = 'width:18px;height:18px;flex-shrink:0;';
        b.addEventListener('mouseenter', function () { b.style.background = 'rgba(255,255,255,.06)'; });
        b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
        b.addEventListener('click', function () { cerrarMenusPublicacion(); op.accion(); });
        menu.appendChild(b);
    });

    document.body.appendChild(menu);
    var r = boton.getBoundingClientRect();
    var left = Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';

    setTimeout(function () {
        document.addEventListener('click', cerrarMenusPublicacion, { once: true });
    }, 0);
}

// ================================================================
// RENDERIZAR POST (HTML · estilo X)
// ================================================================
function renderizarPost(post) {
    var div = document.createElement('article');
    div.className = 'post-card';
    div.dataset.postId = post.id;

    var avatarUrl = post.usuario_avatar_url;
    var inicial = escapeHTML((post.usuario_nombre || 'E').charAt(0).toUpperCase());
    var avatar = avatarUrl
        ? '<img src="' + escapeHTML(avatarUrl) + '" alt="">'
        : inicial;
    var nombre = escapeHTML(post.usuario_nombre || 'Explorador');
    var handle = escapeHTML(post.usuario_handle || 'usuario');
    var likesCount = (post.muro_likes && post.muro_likes[0]) ? post.muro_likes[0].count || 0 : 0;
    var comentariosCount = (post.muro_comentarios && post.muro_comentarios[0]) ? post.muro_comentarios[0].count || 0 : 0;
    var contenidoSanitizado = sanitizarHTML(post.contenido || '');

    var esMiPost = sessionUser && post.usuario_id === sessionUser.id;
    var perfilHref = esMiPost
        ? '/features/perfil/perfil.html'
        : (post.usuario_handle ? '/features/perfil/perfil-publico.html?u=' + encodeURIComponent(post.usuario_handle) : null);

    var avatarHtml = perfilHref
        ? '<a href="' + perfilHref + '" class="post-avatar-link" aria-label="Ver perfil de ' + nombre + '">' + avatar + '</a>'
        : avatar;
    var nombreHtml = perfilHref
        ? '<a href="' + perfilHref + '">' + nombre + '</a>'
        : nombre;

    var temaBadge = '';
    if (post.tema_id && post.temas) {
        var temaInfo = Array.isArray(post.temas) ? post.temas[0] : post.temas;
        if (temaInfo) {
            temaBadge = '<div class="post-tema-badge">' + escapeHTML(temaInfo.nombre || '') + '</div>';
        }
    }

    var avisoBadge = '';
    if (post.aviso_moderacion === 'lenguaje_inapropiado') {
        avisoBadge =
            '<div class="post-aviso-moderacion" style="' +
                'display:flex;align-items:center;gap:8px;padding:8px 12px;margin:8px 0;border-radius:12px;' +
                'background:rgba(247,212,74,.10);border:1px solid rgba(247,212,74,.35);color:#f7d44a;font-size:.8rem;' +
            '">' +
                '<span style="display:inline-flex;width:16px;height:16px;flex-shrink:0;">' +
                    MURO_PUB_ICON.alerta.replace('class="icon"', 'class="icon" style="width:16px;height:16px;"') +
                '</span>' +
                '<span>Este mensaje contiene lenguaje inapropiado. Considera expresarte con respeto.</span>' +
            '</div>';
    }

    var mediaHtml = '';
    if (post.imagen_url) {
        var srcEsc = escapeHTML(post.imagen_url);
        var tipo = (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(post.imagen_url)) ? 'video' : 'imagen';
        var atributosVisor =
            ' data-xv-src="' + srcEsc + '"' +
            ' data-xv-type="' + tipo + '"' +
            ' data-xv-name="' + nombre + '"' +
            ' data-xv-handle="' + handle + '"' +
            ' data-xv-avatar="' + escapeHTML(avatarUrl || '') + '"' +
            ' data-xv-text="' + escapeHTML(post.contenido || '') + '"' +
            ' data-xv-likes="' + likesCount + '"' +
            ' data-xv-comments="' + comentariosCount + '"' +
            ' data-xv-reposts="0"' +
            ' data-xv-id="' + post.id + '"';

        if (tipo === 'video') {
            mediaHtml =
                '<div class="post-media post-media-video" role="button" tabindex="0" aria-label="Ver video a pantalla completa"' + atributosVisor + '>' +
                    '<video class="post-imagen" src="' + srcEsc + '" muted playsinline preload="metadata"></video>' +
                    '<span class="post-media-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg></span>' +
                '</div>';
        } else {
            mediaHtml =
                '<div class="post-media" role="button" tabindex="0" aria-label="Ver imagen a pantalla completa"' + atributosVisor + '>' +
                    '<img class="post-imagen" src="' + srcEsc + '" alt="" loading="lazy" />' +
                '</div>';
        }
    }

    var seccionVenta = '';
    if (post.cantidad_venta && post.cantidad_venta > 0 && post.precio_venta) {
        var precioPorToken = parseFloat(post.precio_venta).toFixed(2);
        var esMiPropiaVenta = sessionUser && post.usuario_id === sessionUser.id;
        var botonComprar = esMiPropiaVenta
            ? '<button class="btn-comprar" disabled>Tu venta</button>'
            : '<button class="btn-comprar" onclick="abrirModalCompra(\'' + post.id + '\')">Comprar</button>';
        seccionVenta =
            '<div class="post-venta">' +
                '<div class="post-venta-info">' +
                    '<span class="post-venta-etiqueta">' + MURO_PUB_ICON.venta.replace('class="icon"', 'class="icon icon-sm"') + ' Venta de tokens</span>' +
                    '<strong>' + post.cantidad_venta + ' tokens disponibles</strong>' +
                    '<span class="post-venta-precio">Precio unitario: $' + precioPorToken + ' MXN</span>' +
                '</div>' +
                botonComprar +
            '</div>';
    }

    var fecha = new Date(post.created_at);
    var fechaCorta = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    var fechaCompleta = fecha.toLocaleString();

    div.innerHTML =
        '<div class="post-row">' +
            '<div class="post-avatar">' + avatarHtml + '</div>' +
            '<div class="post-body">' +

                '<div class="post-header">' +
                    '<div class="post-author-line">' +
                        '<span class="post-author">' + nombreHtml + '</span>' +
                        '<span class="post-handle">@' + handle + '</span>' +
                        '<span class="post-dot" aria-hidden="true">·</span>' +
                        '<time class="post-date" datetime="' + escapeHTML(post.created_at) + '" title="' + escapeHTML(fechaCompleta) + '">' + fechaCorta + '</time>' +
                        '<span class="badge-verificado" title="Verificado">' + MURO_PUB_ICON.verificado + '</span>' +
                    '</div>' +
                    '<button type="button" class="post-menu-btn" aria-label="Más opciones" title="Más">' + MURO_PUB_ICON.mas + '</button>' +
                '</div>' +

                temaBadge +
                avisoBadge +
                '<div class="post-content">' + contenidoSanitizado + '</div>' +
                mediaHtml +
                seccionVenta +

                '<div class="post-actions" role="group" aria-label="Acciones">' +
                    '<button type="button" class="post-act comment-btn" onclick="toggleComentarios(\'' + post.id + '\')" aria-label="Responder">' +
                        MURO_PUB_ICON.comentar + '<span class="count">' + comentariosCount + '</span>' +
                    '</button>' +
                    '<button type="button" class="post-act repost-btn" onclick="compartirPublicacion(\'' + post.id + '\')" aria-label="Republicar">' +
                        MURO_PUB_ICON.republicar + '<span class="count">0</span>' +
                    '</button>' +
                    '<button type="button" class="post-act like-btn" data-liked="false" onclick="toggleLike(\'' + post.id + '\')" aria-label="Me gusta">' +
                        MURO_PUB_ICON.corazon + '<span class="count">' + likesCount + '</span>' +
                    '</button>' +
                    '<button type="button" class="post-act share-btn" onclick="compartirPublicacion(\'' + post.id + '\')" aria-label="Compartir">' +
                        MURO_PUB_ICON.compartir +
                    '</button>' +
                '</div>' +

                '<div class="post-comentarios" id="comentarios-' + post.id + '" style="display:none;">' +
                    '<div class="comentarios-lista" id="comentarios-lista-' + post.id + '"></div>' +
                    '<div class="input-comentario">' +
                        '<input type="text" id="input-comentario-' + post.id + '" placeholder="Publica tu respuesta" />' +
                        '<button type="button" class="btn-enviar-comentario" data-post-id="' + post.id + '">Responder</button>' +
                    '</div>' +
                '</div>' +

            '</div>' +
        '</div>';

    var btnMenu = div.querySelector('.post-menu-btn');
    if (btnMenu) {
        btnMenu.addEventListener('click', function (e) {
            e.stopPropagation();
            abrirMenuPublicacion(btnMenu, post, esMiPost);
        });
    }

    if (sessionUser) {
        verificarLike(post.id).then(function (liked) {
            var likeBtn = div.querySelector('.like-btn');
            if (likeBtn && liked) likeBtn.dataset.liked = 'true';
        });
    }

    return div;
}

// ================================================================
// VERIFICAR LIKE (con caché)
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