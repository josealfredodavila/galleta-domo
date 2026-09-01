/* ================================================================
   MURO - SARIEL'S ECOSYSTEM
   VERSIÓN CORREGIDA - SIN BUCLES INFINITOS
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - SIN DECLARACIÓN DUPLICADA
// ================================================================
const supabaseClient = window.supabaseClient || window.supabase.createClient(
    'https://zultnlogdoajehbswlih.supabase.co',
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu'
);

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let sessionUser = null;
let currentPage = 0;
const POSTS_PER_PAGE = 10;
let isLoading = false;
let hasMorePosts = true;
let precioActual = 4.50;
let publicando = false;
let muroChannel = null;
let isRealtimeProcessing = false; // 🔒 Evita bucles en Realtime

// ================================================================
// SHOWTOAST SEGURO - EVITA BUCLES
// ================================================================
function showToast(mensaje, tipo = 'info') {
    try {
        if (typeof window.showToast === 'function') {
            window.showToast(mensaje, tipo);
            return;
        }

        const toastEl = document.getElementById('toast');
        if (toastEl) {
            toastEl.textContent = mensaje;
            toastEl.className = 'toast show';
            if (tipo === 'error') toastEl.classList.add('error');
            else if (tipo === 'warning') toastEl.classList.add('warning');
            else if (tipo === 'success') toastEl.classList.add('success');
            else toastEl.classList.remove('error', 'warning', 'success');

            clearTimeout(toastEl._timeout);
            toastEl._timeout = setTimeout(() => {
                toastEl.classList.remove('show');
            }, 3500);
            return;
        }

        console.warn('Toast no disponible:', mensaje);
    } catch (e) {
        console.warn('Error en showToast:', e);
    }
}

// ================================================================
// OBTENER SESIÓN
// ================================================================
async function getSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session;
    } catch (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
    }
}

// ================================================================
// ESCAPE HTML
// ================================================================
function escapeHTML(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// CARGAR USUARIO ACTUAL
// ================================================================
async function cargarUsuarioActual() {
    try {
        const session = await getSession();
        if (!session) {
            sessionUser = null;
            document.getElementById('userNombre').textContent = 'Explorador';
            document.getElementById('userHandle').textContent = '@explorador';
            document.getElementById('userAvatar').textContent = '◈';
            return null;
        }

        sessionUser = session.user;

        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('nombre, handle, avatar_url, tokens')
            .eq('id', session.user.id)
            .single();

        if (error) throw error;

        if (data) {
            document.getElementById('userNombre').textContent = data.nombre || 'Explorador';
            document.getElementById('userHandle').textContent = '@' + (data.handle || 'explorador');
            document.getElementById('userAvatar').textContent = data.avatar_url ? '◈' : '◈';

            const tokenBadge = document.getElementById('tokenBadgeCantidad');
            if (tokenBadge) tokenBadge.textContent = data.tokens || 0;

            const tokensDisp = document.getElementById('tokensDisponibles');
            if (tokensDisp) tokensDisp.textContent = data.tokens || 0;
        }

        return data;

    } catch (error) {
        console.error('Error cargando usuario:', error);
        showToast('❌ Error al cargar usuario', 'error');
        return null;
    }
}

// ================================================================
// CARGAR PRECIOS DE MERCADO
// ================================================================
async function cargarPreciosMercado() {
    try {
        const { data, error } = await supabaseClient
            .from('muro_precios')
            .select('*')
            .order('ultima_actualizacion', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const precios = data[0];
            precioActual = precios.precio_actual || 4.50;

            const precioToken = document.getElementById('precioToken');
            const ofertaTotalEl = document.getElementById('ofertaTotal');
            const demandaTotalEl = document.getElementById('demandaTotal');
            const tendenciaValor = document.getElementById('tendenciaValor');

            if (precioToken) {
                precioToken.innerHTML = `${precioActual.toFixed(2)} <span class="moneda">MXN</span>`;
            }
            if (ofertaTotalEl) ofertaTotalEl.textContent = precios.oferta_total || 0;
            if (demandaTotalEl) demandaTotalEl.textContent = precios.demanda_total || 0;
            if (tendenciaValor) {
                const diff = precioActual - (precios.precio_base || precioActual);
                if (diff > 0) {
                    tendenciaValor.textContent = '📈 ALZA';
                    tendenciaValor.style.color = 'var(--success)';
                } else if (diff < 0) {
                    tendenciaValor.textContent = '📉 BAJA';
                    tendenciaValor.style.color = 'var(--danger)';
                } else {
                    tendenciaValor.textContent = '➡️ ESTABLE';
                    tendenciaValor.style.color = 'var(--text-muted)';
                }
            }

            const precioSugerido = document.getElementById('precioSugerido');
            if (precioSugerido) precioSugerido.textContent = precioActual.toFixed(2);

            const precioUsdt = document.getElementById('precioUsdtSugerido');
            if (precioUsdt) precioUsdt.textContent = `≈ $${(precioActual / 20).toFixed(2)} USDT`;

            return precios;
        }
    } catch (error) {
        console.error('Error cargando precios:', error);
        return null;
    }
}

// ================================================================
// CARGAR PUBLICACIONES - CON CONTROL DE BUCLES
// ================================================================
async function cargarPublicaciones(reset = true) {
    // ✅ Evitar cargas múltiples simultáneas
    if (isLoading) return;
    
    if (reset) {
        currentPage = 0;
        hasMorePosts = true;
        const feedContainer = document.getElementById('feedContainer');
        if (feedContainer) feedContainer.innerHTML = '';
    }
    
    if (!hasMorePosts) return;

    isLoading = true;
    const feedContainer = document.getElementById('feedContainer');

    try {
        const from = currentPage * POSTS_PER_PAGE;
        const to = from + POSTS_PER_PAGE - 1;

        const { data, error } = await supabaseClient
            .from('muro_posts')
            .select(`
                *,
                usuarios:usuario_id (id, nombre, handle, avatar_url),
                muro_likes(count),
                muro_comentarios(count)
            `)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        if (!data || data.length === 0) {
            hasMorePosts = false;
            if (currentPage === 0 && feedContainer) {
                feedContainer.innerHTML = `
                    <div class="empty-state">
                        <span class="icon">◈</span>
                        <h3>Sin publicaciones</h3>
                        <p>Sé el primero en compartir algo.</p>
                    </div>
                `;
            }
            isLoading = false;
            return;
        }

        if (currentPage === 0 && feedContainer) {
            feedContainer.innerHTML = '';
        }

        // ✅ Renderizar posts sin llamadas recursivas
        data.forEach(post => {
            const postElement = renderizarPost(post);
            if (feedContainer) feedContainer.appendChild(postElement);
        });

        currentPage++;
        hasMorePosts = data.length === POSTS_PER_PAGE;

        // ✅ Observer para carga infinita - sin recursión
        if (hasMorePosts && feedContainer) {
            const lastPost = feedContainer.lastElementChild;
            if (lastPost) {
                const observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting && !isLoading) {
                        cargarPublicaciones(false);
                    }
                }, { threshold: 0.1 });
                observer.observe(lastPost);
            }
        }

    } catch (error) {
        console.error('Error cargando publicaciones:', error);
        showToast('❌ Error al cargar publicaciones', 'error');
    } finally {
        isLoading = false;
    }
}

// ================================================================
// RENDERIZAR POST - OPTIMIZADO SIN BUCLES
// ================================================================
function renderizarPost(post) {
    const div = document.createElement('div');
    div.className = 'post-card';
    div.dataset.postId = post.id;

    const usuario = post.usuarios || {};
    const avatar = usuario.avatar_url ? `<img src="${usuario.avatar_url}">` : '◈';
    const nombre = usuario.nombre || 'Explorador';
    const handle = usuario.handle || 'explorador';
    const likesCount = post.muro_likes?.[0]?.count || 0;
    const comentariosCount = post.muro_comentarios?.[0]?.count || 0;
    const contenidoSanitizado = sanitizarHTML(post.contenido || '');

    let seccionVenta = '';
    if (post.cantidad_venta && post.cantidad_venta > 0 && post.precio_venta) {
        const precioPorToken = (post.precio_venta / post.cantidad_venta).toFixed(2);
        seccionVenta = `
            <div class="post-venta">
                <div>
                    <span style="font-size:0.7rem;color:var(--text-muted);">💎 Venta de tokens</span>
                    <div style="font-weight:600;color:var(--gold);">
                        ${post.cantidad_venta} tokens · $${precioPorToken} c/u
                    </div>
                    <div style="font-size:0.65rem;color:var(--text-muted);">
                        Total: $${post.precio_venta.toFixed(2)} MXN
                    </div>
                </div>
                <button class="btn-comprar" onclick="abrirModalCompra('${post.id}')">
                    Comprar
                </button>
            </div>
        `;
    }

    const fecha = new Date(post.created_at).toLocaleString();

    div.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">${avatar}</div>
            <div>
                <div class="post-author">${nombre} <span class="badge-verificado">✦ Verificado</span></div>
                <div class="post-date">${fecha}</div>
            </div>
            <div class="post-actions-header">
                ${post.usuario_id === sessionUser?.id ? `
                    <button class="btn-delete" onclick="eliminarPublicacion('${post.id}')" title="Eliminar">🗑️</button>
                ` : `
                    <button class="btn-report" onclick="reportarPublicacion('${post.id}')" title="Reportar">🚩</button>
                `}
                <button class="btn-share" onclick="compartirPublicacion('${post.id}')" title="Compartir">📤</button>
            </div>
        </div>
        <div class="post-content">${contenidoSanitizado}</div>
        ${post.imagen_url ? `<img src="${post.imagen_url}" style="width:100%; border-radius:12px; margin-top:12px;" />` : ''}
        ${seccionVenta}
        <div class="post-stats">
            <span class="like-btn" onclick="toggleLike('${post.id}')" data-liked="false">
                ❤️ <span class="count">${likesCount}</span>
            </span>
            <span onclick="toggleComentarios('${post.id}')">
                💬 <span class="count">${comentariosCount}</span>
            </span>
            ${post.cantidad_venta ? `<span style="color:var(--gold);font-size:0.7rem;">💎 ${post.cantidad_venta} tokens en venta</span>` : ''}
        </div>
        <div class="post-comentarios" id="comentarios-${post.id}" style="display:none;">
            <div class="comentarios-lista" id="comentarios-lista-${post.id}">
                <!-- Se cargarán dinámicamente -->
            </div>
            <div class="input-comentario">
                <input type="text" id="input-comentario-${post.id}" placeholder="Escribe un comentario..." />
                <button onclick="enviarComentario('${post.id}')">Enviar</button>
            </div>
        </div>
    `;

    // ✅ Verificar like sin recursión - solo si hay usuario
    if (sessionUser) {
        verificarLike(post.id).then(liked => {
            const likeBtn = div.querySelector('.like-btn');
            if (likeBtn && liked) {
                likeBtn.dataset.liked = 'true';
                likeBtn.innerHTML = `❤️ <span class="count">${likesCount}</span>`;
            }
        });
    }

    return div;
}

// ================================================================
// SANITIZAR HTML
// ================================================================
function sanitizarHTML(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    let sanitizado = div.innerHTML;

    sanitizado = sanitizado.replace(
        /#(\w+)/g,
        '<a href="#" class="hashtag" onclick="buscarHashtag(\'$1\');return false;">#$1</a>'
    );
    sanitizado = sanitizado.replace(
        /@(\w+)/g,
        '<a href="/perfil/$1" class="mencion">@$1</a>'
    );

    return sanitizado;
}

// ================================================================
// VERIFICAR LIKE - CON CACHE PARA EVITAR CONSULTAS REPETIDAS
// ================================================================
const likeCache = new Map();

async function verificarLike(postId) {
    if (!sessionUser) return false;
    
    // ✅ Usar cache para evitar consultas repetidas
    const cacheKey = `${postId}_${sessionUser.id}`;
    if (likeCache.has(cacheKey)) {
        return likeCache.get(cacheKey);
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('muro_likes')
            .select('id')
            .eq('post_id', postId)
            .eq('usuario_id', sessionUser.id)
            .maybeSingle();

        if (error) throw error;
        const result = !!data;
        likeCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Error verificando like:', error);
        return false;
    }
}

// ================================================================
// TOGGLE LIKE - ACTUALIZA CACHE
// ================================================================
async function toggleLike(postId) {
    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para dar like', 'error');
        return;
    }

    const likeBtn = document.querySelector(`[data-post-id="${postId}"] .like-btn`);
    const countSpan = likeBtn?.querySelector('.count');
    const cacheKey = `${postId}_${sessionUser.id}`;

    try {
        const liked = await verificarLike(postId);

        if (liked) {
            const { error } = await supabaseClient
                .from('muro_likes')
                .delete()
                .eq('post_id', postId)
                .eq('usuario_id', sessionUser.id);

            if (error) throw error;

            likeCache.set(cacheKey, false);
            if (countSpan) {
                const current = parseInt(countSpan.textContent);
                countSpan.textContent = Math.max(0, current - 1);
            }
            if (likeBtn) {
                likeBtn.dataset.liked = 'false';
                likeBtn.innerHTML = `❤️ <span class="count">${countSpan?.textContent || 0}</span>`;
            }
        } else {
            const { error } = await supabaseClient
                .from('muro_likes')
                .insert({
                    post_id: postId,
                    usuario_id: sessionUser.id
                });

            if (error) {
                if (error.code === '23505') {
                    showToast('⚠️ Ya diste like a este post', 'warning');
                    return;
                }
                throw error;
            }

            likeCache.set(cacheKey, true);
            if (countSpan) {
                const current = parseInt(countSpan.textContent);
                countSpan.textContent = current + 1;
            }
            if (likeBtn) {
                likeBtn.dataset.liked = 'true';
                likeBtn.innerHTML = `❤️ <span class="count">${countSpan?.textContent || 0}</span>`;
            }
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        showToast('❌ Error al procesar like', 'error');
    }
}

// ================================================================
// TOGGLE COMENTARIOS
// ================================================================
function toggleComentarios(postId) {
    const container = document.getElementById(`comentarios-${postId}`);
    if (!container) return;

    const isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        cargarComentarios(postId);
        setTimeout(() => {
            const input = document.getElementById(`input-comentario-${postId}`);
            if (input) input.focus();
        }, 200);
    }
}

// ================================================================
// CARGAR COMENTARIOS
// ================================================================
async function cargarComentarios(postId) {
    const lista = document.getElementById(`comentarios-lista-${postId}`);
    if (!lista) return;

    try {
        const { data, error } = await supabaseClient
            .from('muro_comentarios')
            .select(`
                *,
                usuarios:usuario_id (id, nombre, handle, avatar_url)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            lista.innerHTML = '<div style="color:var(--text-muted);font-size:0.7rem;padding:8px 0;">Sin comentarios. Sé el primero.</div>';
            return;
        }

        lista.innerHTML = data.map(c => {
            const avatar = c.usuarios?.avatar_url ? `<img src="${c.usuarios.avatar_url}">` : '◈';
            const nombre = c.usuarios?.nombre || 'Usuario';
            const esPropietario = c.usuario_id === sessionUser?.id;

            return `
                <div class="comentario">
                    <div class="avatar">${avatar}</div>
                    <div class="texto">
                        <strong>${nombre}</strong> ${sanitizarHTML(c.contenido || '')}
                        <div class="fecha">${new Date(c.created_at).toLocaleString()}</div>
                        ${esPropietario ? `<button class="btn-eliminar-comentario" onclick="eliminarComentario('${c.id}')">✕ Eliminar</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error cargando comentarios:', error);
        lista.innerHTML = '<div style="color:var(--danger);font-size:0.7rem;">Error al cargar comentarios</div>';
    }
}

// ================================================================
// ENVIAR COMENTARIO
// ================================================================
async function enviarComentario(postId) {
    const input = document.getElementById(`input-comentario-${postId}`);
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) {
        showToast('⚠️ Escribe un comentario', 'error');
        return;
    }
    if (texto.length > 2000) {
        showToast('⚠️ El comentario es demasiado largo (máx 2000 caracteres)', 'error');
        return;
    }

    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para comentar', 'error');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('muro_comentarios')
            .insert({
                post_id: postId,
                usuario_id: sessionUser.id,
                contenido: texto
            });

        if (error) throw error;

        input.value = '';
        showToast('✅ Comentario agregado', 'success');
        cargarComentarios(postId);

        const countSpan = document.querySelector(`[data-post-id="${postId}"] .post-stats span:last-child .count`);
        if (countSpan) {
            const current = parseInt(countSpan.textContent);
            countSpan.textContent = current + 1;
        }

    } catch (error) {
        console.error('Error enviando comentario:', error);
        showToast('❌ Error al comentar', 'error');
    }
}

// ================================================================
// ELIMINAR COMENTARIO
// ================================================================
async function eliminarComentario(comentarioId) {
    if (!sessionUser) {
        showToast('⚠️ Inicia sesión', 'error');
        return;
    }

    if (!confirm('¿Eliminar este comentario?')) return;

    try {
        const { error } = await supabaseClient
            .from('muro_comentarios')
            .delete()
            .eq('id', comentarioId)
            .eq('usuario_id', sessionUser.id);

        if (error) throw error;

        showToast('🗑️ Comentario eliminado', 'success');
        const postId = document.querySelector(`[data-comentario-id="${comentarioId}"]`)?.dataset.postId;
        if (postId) cargarComentarios(postId);
    } catch (error) {
        console.error('Error eliminando comentario:', error);
        showToast('❌ Error al eliminar comentario', 'error');
    }
}

// ================================================================
// ELIMINAR PUBLICACIÓN
// ================================================================
async function eliminarPublicacion(postId) {
    if (!sessionUser) {
        showToast('⚠️ Inicia sesión', 'error');
        return;
    }

    if (!confirm('¿Eliminar esta publicación?')) return;

    try {
        const { error } = await supabaseClient
            .from('muro_posts')
            .delete()
            .eq('id', postId)
            .eq('usuario_id', sessionUser.id);

        if (error) throw error;

        showToast('🗑️ Publicación eliminada', 'success');
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (postCard) postCard.remove();
    } catch (error) {
        console.error('Error eliminando publicación:', error);
        showToast('❌ Error al eliminar publicación', 'error');
    }
}

// ================================================================
// PUBLICAR NUEVA PUBLICACIÓN - CON BLOQUEO
// ================================================================
async function publicar() {
    if (publicando) {
        showToast('⏳ Ya estás publicando, espera un momento...', 'warning');
        return;
    }

    const postContent = document.getElementById('postContent');
    const btnPublicar = document.getElementById('btnPublicar');
    const contenido = postContent ? postContent.value.trim() : '';

    if (!contenido) {
        showToast('⚠️ Escribe algo para publicar', 'error');
        return;
    }

    if (contenido.length > 5000) {
        showToast('⚠️ El texto es demasiado largo (máx 5000 caracteres)', 'error');
        return;
    }

    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para publicar', 'error');
        return;
    }

    publicando = true;
    btnPublicar.disabled = true;
    btnPublicar.textContent = '⏳ Publicando...';

    try {
        const { data, error } = await supabaseClient
            .from('muro_posts')
            .insert({
                usuario_id: sessionUser.id,
                contenido: contenido
            })
            .select()
            .single();

        if (error) throw error;

        postContent.value = '';
        showToast('✅ Publicación creada', 'success');

        // ✅ Recargar feed sin recursión
        const feedContainer = document.getElementById('feedContainer');
        if (feedContainer) {
            feedContainer.innerHTML = '';
        }
        currentPage = 0;
        hasMorePosts = true;
        await cargarPublicaciones();

    } catch (error) {
        console.error('Error al publicar:', error);
        showToast('❌ Error al publicar: ' + error.message, 'error');
    } finally {
        publicando = false;
        btnPublicar.disabled = false;
        btnPublicar.textContent = '⟡ Publicar';
    }
}

// ================================================================
// COMPARTIR PUBLICACIÓN
// ================================================================
function compartirPublicacion(postId) {
    const url = `${window.location.origin}/features/muro/muro.html?post=${postId}`;
    if (navigator.share) {
        navigator.share({
            title: 'Publicación en Sariel\'s',
            text: 'Mira esta publicación en el Muro de Sariel\'s',
            url: url
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('📋 Enlace copiado al portapapeles', 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('📋 Enlace copiado al portapapeles', 'success');
        });
    }
}

// ================================================================
// REPORTAR PUBLICACIÓN
// ================================================================
async function reportarPublicacion(postId) {
    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para reportar', 'error');
        return;
    }

    const motivo = prompt('Motivo del reporte:', 'Contenido inapropiado');
    if (!motivo) return;

    try {
        const { error } = await supabaseClient
            .from('muro_reportes')
            .insert({
                post_id: postId,
                usuario_id: sessionUser.id,
                motivo: motivo
            });

        if (error) {
            if (error.code === '42P01') {
                showToast('⚠️ La tabla de reportes no está configurada. Contacta al administrador.', 'warning');
                return;
            }
            throw error;
        }

        showToast('🚩 Reporte enviado', 'success');
    } catch (error) {
        console.error('Error reportando:', error);
        showToast('❌ Error al reportar', 'error');
    }
}

// ================================================================
// BUSCAR HASHTAG
// ================================================================
async function buscarHashtag(tag) {
    if (!tag) {
        const input = document.getElementById('searchHashtag');
        if (input) tag = input.value.trim().replace('#', '');
    }
    if (!tag) {
        showToast('⚠️ Escribe un hashtag para buscar', 'warning');
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('muro_posts')
            .select(`
                *,
                usuarios:usuario_id (id, nombre, handle, avatar_url),
                muro_likes(count),
                muro_comentarios(count)
            `)
            .ilike('contenido', `%#${tag}%`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const feedContainer = document.getElementById('feedContainer');
        feedContainer.innerHTML = '';

        if (!data || data.length === 0) {
            feedContainer.innerHTML = `
                <div class="empty-state">
                    <span class="icon">◈</span>
                    <h3>#${tag}</h3>
                    <p>No se encontraron publicaciones con este hashtag</p>
                    <button class="btn-gold" onclick="cargarPublicaciones()" style="margin-top:12px;padding:8px 24px;border-radius:30px;border:none;background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:var(--space);font-weight:600;cursor:pointer;">
                        Volver al feed
                    </button>
                </div>
            `;
            return;
        }

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--glass-border);margin-bottom:16px;';
        header.innerHTML = `
            <h3 style="font-family:Orbitron,monospace;color:var(--gold);font-size:0.9rem;">
                #${tag} · ${data.length} publicaciones
            </h3>
            <button onclick="cargarPublicaciones()" style="background:transparent;border:none;color:var(--text-muted);font-size:0.7rem;cursor:pointer;">
                ← Volver al feed
            </button>
        `;
        feedContainer.appendChild(header);

        data.forEach(post => {
            const postElement = renderizarPost(post);
            feedContainer.appendChild(postElement);
        });

        showToast(`🔍 Encontradas ${data.length} publicaciones con #${tag}`, 'success');

    } catch (error) {
        console.error('Error buscando hashtag:', error);
        showToast('❌ Error al buscar hashtag', 'error');
    }
}

// ================================================================
// FUNCIONES DE VENTA
// ================================================================

function abrirModalVenta() {
    const modal = document.getElementById('modalVender');
    if (modal) {
        modal.classList.add('show');
        const tokensDisp = document.getElementById('tokensDisponibles');
        if (tokensDisp) tokensDisp.textContent = sessionUser?.tokens || 0;
        document.getElementById('inputCantidadTokens').value = 1;
        document.getElementById('inputPrecioToken').value = precioActual.toFixed(2);
    }
}

function cerrarModalVenta() {
    const modal = document.getElementById('modalVender');
    if (modal) modal.classList.remove('show');
}

async function publicarVenta() {
    const cantidadInput = document.getElementById('inputCantidadTokens');
    const precioInput = document.getElementById('inputPrecioToken');
    const btn = document.getElementById('btnPublicarVenta');

    const cantidad = parseInt(cantidadInput?.value);
    const precio = parseFloat(precioInput?.value);

    if (!cantidad || cantidad <= 0) {
        showToast('⚠️ Ingresa una cantidad válida', 'error');
        cantidadInput?.focus();
        return;
    }
    if (cantidad > 100) {
        showToast('⚠️ Máximo 100 tokens por venta', 'error');
        return;
    }
    if (!precio || precio <= 0) {
        showToast('⚠️ Ingresa un precio válido', 'error');
        precioInput?.focus();
        return;
    }

    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para publicar venta', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Publicando...';

    try {
        const { data: userData, error: userError } = await supabaseClient
            .from('usuarios')
            .select('tokens')
            .eq('id', sessionUser.id)
            .single();

        if (userError) throw userError;
        if (userData.tokens < cantidad) {
            showToast(`⚠️ No tienes suficientes tokens. Disponibles: ${userData.tokens}`, 'error');
            btn.disabled = false;
            btn.textContent = '◆ Publicar venta';
            return;
        }

        const { error } = await supabaseClient
            .from('muro_posts')
            .insert({
                usuario_id: sessionUser.id,
                contenido: `💎 Venta de ${cantidad} tokens a $${precio.toFixed(2)} c/u`,
                cantidad_venta: cantidad,
                precio_venta: precio * cantidad
            });

        if (error) throw error;

        showToast('✅ Venta publicada correctamente', 'success');
        cerrarModalVenta();
        cargarPublicaciones();

    } catch (error) {
        console.error('Error publicando venta:', error);
        showToast('❌ Error al publicar venta: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '◆ Publicar venta';
    }
}

function abrirModalCompra(postId) {
    const postCard = document.querySelector(`[data-post-id="${postId}"]`);
    if (!postCard) {
        showToast('❌ Publicación no encontrada', 'error');
        return;
    }

    const ventaInfo = postCard.querySelector('.post-venta');
    if (!ventaInfo) {
        showToast('❌ Esta publicación no tiene tokens en venta', 'error');
        return;
    }

    const modal = document.getElementById('modalConfirmarCompra');
    if (!modal) {
        showToast('❌ Modal no encontrado', 'error');
        return;
    }

    const textoVenta = ventaInfo.querySelector('div')?.textContent || '';
    const matches = textoVenta.match(/(\d+)\s*tokens.*\$\s*([\d.]+)/);
    if (!matches) {
        showToast('❌ No se pudo leer la información de venta', 'error');
        return;
    }

    const cantidad = parseInt(matches[1]);
    const precioTotal = parseFloat(matches[2]);

    document.getElementById('confirmCantidad').textContent = cantidad;
    document.getElementById('confirmPrecio').textContent = `$${precioTotal.toFixed(2)} MXN`;
    document.getElementById('confirmTotal').textContent = `$${precioTotal.toFixed(2)} MXN`;

    const usdtTotal = precioTotal / 20;
    document.getElementById('confirmTotalFinal').textContent = `${usdtTotal.toFixed(2)} USDT`;
    document.getElementById('confirmComision').textContent = `${(usdtTotal * 0.02).toFixed(2)} USDT`;

    modal.dataset.postId = postId;
    modal.classList.add('show');
}

function cerrarModalConfirmacion() {
    const modal = document.getElementById('modalConfirmarCompra');
    if (modal) modal.classList.remove('show');
}

async function confirmarCompraCrypto() {
    const modal = document.getElementById('modalConfirmarCompra');
    const postId = modal?.dataset.postId;
    if (!postId) {
        showToast('❌ No hay publicación seleccionada', 'error');
        return;
    }

    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para comprar', 'error');
        return;
    }

    try {
        const { data: post, error: postError } = await supabaseClient
            .from('muro_posts')
            .select('id, usuario_id, cantidad_venta, precio_venta')
            .eq('id', postId)
            .single();

        if (postError) throw postError;
        if (!post) {
            showToast('❌ Publicación no encontrada', 'error');
            return;
        }
        if (post.usuario_id === sessionUser.id) {
            showToast('⚠️ No puedes comprar tus propios tokens', 'error');
            return;
        }
        if (post.cantidad_venta <= 0) {
            showToast('⚠️ Estos tokens ya fueron vendidos', 'error');
            return;
        }

        const comision = post.precio_venta * 0.02;
        const montoRecibido = post.precio_venta - comision;
        const precioUsdt = post.precio_venta / 20;

        const { error: insertError } = await supabaseClient
            .from('muro_ventas_tokens')
            .insert({
                post_id: post.id,
                vendedor_id: post.usuario_id,
                comprador_id: sessionUser.id,
                cantidad: post.cantidad_venta,
                precio_mxn: post.precio_venta,
                precio_usdt: precioUsdt,
                comision_plataforma: comision,
                monto_recibido: montoRecibido,
                estado: 'pendiente'
            });

        if (insertError) throw insertError;

        showToast('✅ Orden de compra creada. Procede al pago.', 'success');
        cerrarModalConfirmacion();

        const pagoModal = document.getElementById('cryptoPaymentModal');
        if (pagoModal) {
            pagoModal.classList.add('show');
            const address = '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('');
            document.getElementById('cryptoAddress').textContent = address;
            document.getElementById('cryptoMonto').textContent = precioUsdt.toFixed(2);
            document.getElementById('cryptoStatus').textContent = '⏳ Esperando confirmación de pago...';
            const qrImg = document.getElementById('cryptoQR');
            if (qrImg) {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}`;
            }
            pagoModal.dataset.ventaId = post.id;
        }

    } catch (error) {
        console.error('Error confirmando compra:', error);
        showToast('❌ Error al confirmar compra: ' + error.message, 'error');
    }
}

function cerrarModalPago() {
    const modal = document.getElementById('cryptoPaymentModal');
    if (modal) modal.classList.remove('show');
}

function copiarDireccionCrypto() {
    const addressEl = document.getElementById('cryptoAddress');
    if (!addressEl) return;
    const address = addressEl.textContent;
    if (address && address !== 'Cargando...') {
        navigator.clipboard.writeText(address).then(() => {
            showToast('📋 Dirección copiada', 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = address;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('📋 Dirección copiada', 'success');
        });
    }
}

async function verificarPagoCrypto() {
    const btn = document.getElementById('btnVerificarPago');
    const statusEl = document.getElementById('cryptoStatus');
    const modal = document.getElementById('cryptoPaymentModal');
    const postId = modal?.dataset.ventaId;

    if (!postId) {
        showToast('❌ No hay venta para verificar', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Verificando...';
    statusEl.textContent = '⏳ Verificando pago en blockchain...';
    statusEl.style.color = 'var(--text-secondary)';

    try {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const { error } = await supabaseClient
            .from('muro_ventas_tokens')
            .update({ estado: 'pagado' })
            .eq('post_id', postId)
            .eq('comprador_id', sessionUser?.id)
            .eq('estado', 'pendiente');

        if (error) throw error;

        await supabaseClient
            .from('muro_posts')
            .update({ cantidad_venta: 0 })
            .eq('id', postId);

        statusEl.textContent = '✅ ¡Pago verificado! Tokens transferidos.';
        statusEl.style.color = 'var(--success)';
        showToast('✅ ¡Compra completada exitosamente!', 'success');

        setTimeout(() => {
            cerrarModalPago();
            cargarPublicaciones();
            cargarPreciosMercado();
        }, 2000);

    } catch (error) {
        console.error('Error verificando pago:', error);
        statusEl.textContent = '❌ Error al verificar pago';
        statusEl.style.color = 'var(--danger)';
        showToast('❌ Error al verificar pago', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Verificar Pago';
    }
}

// ================================================================
// FUNCIONES DE UTILIDAD
// ================================================================

function verTokens() {
    window.location.href = '/features/perfil/perfil.html';
}

function insertarHashtag() {
    const input = document.getElementById('postContent');
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const texto = input.value;
    const hashtag = '#';
    input.value = texto.substring(0, start) + hashtag + texto.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + hashtag.length;
}

function insertarEmoji() {
    const input = document.getElementById('postContent');
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const texto = input.value;
    const emojis = ['😊', '🔥', '❤️', '💎', '✨', '🎉', '🚀', '🌟', '💪', '🤝'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    input.value = texto.substring(0, start) + emoji + texto.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
}

function abrirSelectorImagen() {
    const input = document.getElementById('inputImagen');
    if (input) input.click();
}

async function subirImagenMuro(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!sessionUser) {
        showToast('⚠️ Inicia sesión para subir imagen', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('❌ Solo se permiten imágenes', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('❌ La imagen no puede superar los 5MB', 'error');
        return;
    }

    const fileExt = file.name.split('.').pop();
    const filePath = `${sessionUser.id}/${Date.now()}.${fileExt}`;

    try {
        showToast('⏳ Subiendo imagen...', '', 5000);

        const { error: uploadError } = await supabaseClient.storage
            .from('muro-imagenes')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            if (uploadError.message.includes('bucket')) {
                showToast('⚠️ El almacenamiento no está configurado. La imagen no se pudo subir.', 'warning');
                return;
            }
            throw uploadError;
        }

        const { data: urlData } = supabaseClient.storage
            .from('muro-imagenes')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        const { error: insertError } = await supabaseClient
            .from('muro_posts')
            .insert({
                usuario_id: sessionUser.id,
                contenido: '',
                imagen_url: publicUrl
            });

        if (insertError) throw insertError;

        showToast('✅ Imagen subida correctamente', 'success');
        event.target.value = '';
        cargarPublicaciones();

    } catch (error) {
        console.error('Error subiendo imagen:', error);
        showToast('❌ Error al subir imagen: ' + error.message, 'error');
    }
}

// ================================================================
// SUSCRIBIRSE A REALTIME - CORREGIDO (SIN BUCLES)
// ================================================================
async function suscribirseARealtime() {
    // ✅ Cerrar canal anterior si existe
    if (muroChannel) {
        try {
            await supabaseClient.removeChannel(muroChannel);
        } catch (e) {
            console.warn('Error removiendo canal anterior:', e);
        }
        muroChannel = null;
    }

    muroChannel = supabaseClient
        .channel('muro-realtime')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_posts' },
            (payload) => {
                // ✅ Evitar bucles: si está procesando Realtime, ignorar
                if (isRealtimeProcessing) return;
                isRealtimeProcessing = true;

                try {
                    // ✅ Solo agregar si el post no es del usuario actual
                    if (payload.new.usuario_id !== sessionUser?.id) {
                        const feedContainer = document.getElementById('feedContainer');
                        if (feedContainer) {
                            const emptyState = feedContainer.querySelector('.empty-state');
                            if (emptyState) emptyState.remove();

                            const postElement = renderizarPost(payload.new);
                            feedContainer.insertBefore(postElement, feedContainer.firstChild);
                            showToast('📢 Nueva publicación en el Muro', 'success');
                        }
                    }
                } catch (error) {
                    console.error('Error en Realtime INSERT:', error);
                } finally {
                    isRealtimeProcessing = false;
                }
            }
        )
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'muro_comentarios' },
            () => {
                // ✅ Solo actualizar comentarios visibles
                try {
                    document.querySelectorAll('.post-comentarios[style*="display: block"]').forEach(el => {
                        const postId = el.id.replace('comentarios-', '');
                        cargarComentarios(postId);
                    });
                } catch (error) {
                    console.error('Error en Realtime comentarios:', error);
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Muro Realtime conectado');
            } else if (status === 'CHANNEL_ERROR') {
                console.error('❌ Error en Realtime:', status);
            }
        });

    return muroChannel;
}

// ================================================================
// INICIALIZACIÓN - CORREGIDA
// ================================================================
document.addEventListener('DOMContentLoaded', async function() {
    await cargarUsuarioActual();
    await cargarPreciosMercado();
    await cargarPublicaciones();
    await suscribirseARealtime();

    // ✅ Botón Publicar - con prevención de eventos duplicados
    const btnPublicar = document.getElementById('btnPublicar');
    if (btnPublicar) {
        // Remover listeners anteriores clonando
        const newBtn = btnPublicar.cloneNode(true);
        btnPublicar.parentNode.replaceChild(newBtn, btnPublicar);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            publicar();
        });
    }

    // ✅ Búsqueda de hashtags
    const searchInput = document.getElementById('searchHashtag');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                buscarHashtag();
            }
        });
    }

    // ✅ Comentarios con Enter
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const input = e.target;
            if (input.id && input.id.startsWith('input-comentario-')) {
                e.preventDefault();
                const postId = input.id.replace('input-comentario-', '');
                enviarComentario(postId);
            }
        }
    });

    // ✅ Modal de venta
    const btnPublicarVenta = document.getElementById('btnPublicarVenta');
    if (btnPublicarVenta) {
        btnPublicarVenta.addEventListener('click', function(e) {
            e.preventDefault();
            publicarVenta();
        });
    }

    // ✅ Cerrar modales al hacer clic fuera
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('show');
            }
        });
    });

    console.log('◈ Sariel\'s - Muro');
    console.log('✅ Inicializado correctamente');
    console.log('👤 Usuario:', sessionUser?.email || 'No autenticado');
});

// ================================================================
// EXPOSICIÓN DE FUNCIONES GLOBALES
// ================================================================
window.publicar = publicar;
window.cargarPublicaciones = cargarPublicaciones;
window.cargarPreciosMercado = cargarPreciosMercado;
window.toggleLike = toggleLike;
window.toggleComentarios = toggleComentarios;
window.enviarComentario = enviarComentario;
window.eliminarComentario = eliminarComentario;
window.eliminarPublicacion = eliminarPublicacion;
window.compartirPublicacion = compartirPublicacion;
window.reportarPublicacion = reportarPublicacion;
window.buscarHashtag = buscarHashtag;
window.subirImagenMuro = subirImagenMuro;
window.abrirSelectorImagen = abrirSelectorImagen;
window.insertarHashtag = insertarHashtag;
window.insertarEmoji = insertarEmoji;
window.verTokens = verTokens;
window.showToast = showToast;

window.abrirModalVenta = abrirModalVenta;
window.cerrarModalVenta = cerrarModalVenta;
window.publicarVenta = publicarVenta;
window.abrirModalCompra = abrirModalCompra;
window.cerrarModalConfirmacion = cerrarModalConfirmacion;
window.confirmarCompraCrypto = confirmarCompraCrypto;
window.cerrarModalPago = cerrarModalPago;
window.copiarDireccionCrypto = copiarDireccionCrypto;
window.verificarPagoCrypto = verificarPagoCrypto;