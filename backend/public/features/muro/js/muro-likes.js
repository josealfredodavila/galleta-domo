// ================================================================
// MURO · LIKES Y COMENTARIOS
// ================================================================
// Toggle likes, cargar/enviar/eliminar comentarios, eliminar posts,
// compartir, reportar.
// Depende de: muro-config.js, muro-utils.js, muro-publicaciones.js
// ================================================================

// ================================================================
// TOGGLE LIKE
// ================================================================
async function toggleLike(postId) {
    if (!sessionUser) {
        showToast('Inicia sesión para dar like', 'error');
        return;
    }

    var likeBtn = document.querySelector('[data-post-id="' + postId + '"] .like-btn');
    var countSpan = likeBtn ? likeBtn.querySelector('.count') : null;
    var cacheKey = postId + '_' + sessionUser.id;

    try {
        var liked = await verificarLike(postId);

        if (liked) {
            var result = await supabaseClient
                .from('muro_likes')
                .delete()
                .eq('post_id', postId)
                .eq('usuario_id', sessionUser.id);
            if (result.error) throw result.error;

            likeCache.set(cacheKey, false);
            if (countSpan) countSpan.textContent = Math.max(0, parseInt(countSpan.textContent) - 1);
            if (likeBtn) likeBtn.dataset.liked = 'false';
        } else {
            var result2 = await supabaseClient
                .from('muro_likes')
                .insert({ post_id: postId, usuario_id: sessionUser.id });
            if (result2.error) {
                if (result2.error.code === '23505') {
                    showToast('Ya diste like a este post', 'warning');
                    return;
                }
                throw result2.error;
            }

            likeCache.set(cacheKey, true);
            if (countSpan) countSpan.textContent = parseInt(countSpan.textContent) + 1;
            if (likeBtn) likeBtn.dataset.liked = 'true';
        }
    } catch (e) {
        console.error('Error toggling like:', e);
        showToast('Error al procesar like', 'error');
    }
}

// ================================================================
// TOGGLE COMENTARIOS (mostrar/ocultar)
// ================================================================
function toggleComentarios(postId) {
    var container = document.getElementById('comentarios-' + postId);
    if (!container) return;

    var isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
        cargarComentarios(postId);
        setTimeout(function() {
            var input = document.getElementById('input-comentario-' + postId);
            if (input) input.focus();
        }, 200);
    }
}

// ================================================================
// CARGAR COMENTARIOS
// ================================================================
async function cargarComentarios(postId) {
    var lista = document.getElementById('comentarios-lista-' + postId);
    if (!lista) return;

    try {
        var result = await supabaseClient
            .from('muro_comentarios_publicos')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });
        if (result.error) throw result.error;

        var data = result.data;
        if (!data || data.length === 0) {
            lista.innerHTML = '<div style="color:var(--text-muted);font-size:0.7rem;padding:8px 0;">Sin comentarios. Sé el primero.</div>';
            return;
        }

        lista.innerHTML = data.map(function(c) {
            var avatarUrl = c.usuario_avatar_url;
            var avatar = avatarUrl ? '<img src="' + escapeHTML(avatarUrl) + '">' : '◈';
            var nombre = escapeHTML(c.usuario_nombre || 'Usuario');
            var esPropietario = sessionUser && c.usuario_id === sessionUser.id;

            return '<div class="comentario">' +
                '<div class="avatar">' + avatar + '</div>' +
                '<div class="texto">' +
                    '<strong>' + nombre + '</strong> ' + sanitizarHTML(c.contenido || '') +
                    '<div class="fecha">' + new Date(c.created_at).toLocaleString() + '</div>' +
                    (esPropietario
                        ? '<button class="btn-eliminar-comentario" onclick="eliminarComentario(\'' + c.id + '\', \'' + postId + '\')"><svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Eliminar</button>'
                        : '') +
                '</div>' +
            '</div>';
        }).join('');
    } catch (e) {
        console.error('Error cargando comentarios:', e);
        lista.innerHTML = '<div style="color:var(--danger);font-size:0.7rem;">Error al cargar</div>';
    }
}

// ================================================================
// ENVIAR COMENTARIO
// ================================================================
async function enviarComentario(postId) {
    var input = document.getElementById('input-comentario-' + postId);
    if (!input) return;

    var texto = input.value.trim();
    if (!texto) {
        showToast('Escribe un comentario', 'error');
        return;
    }
    if (texto.length > 2000) {
        showToast('Comentario muy largo', 'error');
        return;
    }
    if (!sessionUser) {
        showToast('Inicia sesión', 'error');
        return;
    }

    try {
        var result = await supabaseClient
            .from('muro_comentarios')
            .insert({ post_id: postId, usuario_id: sessionUser.id, contenido: texto });
        if (result.error) {
            console.error('Error insertando comentario:', result.error);
            throw new Error(result.error.message || 'Error al insertar');
        }

        input.value = '';
        showToast('Comentario agregado', 'success');
        cargarComentarios(postId);

        var countSpan = document.querySelector('[data-post-id="' + postId + '"] .post-stats span:nth-child(2) .count');
        if (countSpan) countSpan.textContent = parseInt(countSpan.textContent) + 1;
    } catch (e) {
        console.error('Error enviando comentario:', e);
        showToast('Error al comentar: ' + e.message, 'error');
    }
}

// ================================================================
// ELIMINAR COMENTARIO
// ================================================================
async function eliminarComentario(comentarioId, postId) {
    if (!sessionUser) return;
    if (!confirm('¿Eliminar este comentario?')) return;

    try {
        var result = await supabaseClient
            .from('muro_comentarios')
            .delete()
            .eq('id', comentarioId)
            .eq('usuario_id', sessionUser.id);
        if (result.error) throw result.error;

        showToast('Comentario eliminado', 'success');
        if (postId) cargarComentarios(postId);
    } catch (e) {
        showToast('Error al eliminar', 'error');
    }
}

// ================================================================
// ELIMINAR PUBLICACIÓN
// ================================================================
async function eliminarPublicacion(postId) {
    if (!sessionUser) return;
    if (!confirm('¿Eliminar esta publicación?')) return;

    try {
        var result = await supabaseClient
            .from('muro_posts')
            .delete()
            .eq('id', postId)
            .eq('usuario_id', sessionUser.id);
        if (result.error) throw result.error;

        showToast('Publicación eliminada', 'success');
        var postCard = document.querySelector('[data-post-id="' + postId + '"]');
        if (postCard) postCard.remove();
    } catch (e) {
        showToast('Error al eliminar', 'error');
    }
}

// ================================================================
// COMPARTIR PUBLICACIÓN
// ================================================================
function compartirPublicacion(postId) {
    var url = window.location.origin + '/features/muro/muro.html?post=' + postId;
    if (navigator.share) {
        navigator.share({ title: 'Publicación en Sariel\'s', url: url }).catch(function() {});
    } else {
        navigator.clipboard.writeText(url)
            .then(function() { showToast('Enlace copiado', 'success'); })
            .catch(function() { showToast('Enlace copiado', 'success'); });
    }
}

// ================================================================
// REPORTAR PUBLICACIÓN
// ================================================================
async function reportarPublicacion(postId) {
    if (!sessionUser) {
        showToast('Inicia sesión', 'error');
        return;
    }
    var motivo = prompt('Motivo del reporte:', 'Contenido inapropiado');
    if (!motivo) return;

    try {
        var result = await supabaseClient
            .from('muro_reportes')
            .insert({ post_id: postId, usuario_id: sessionUser.id, motivo: motivo });
        if (result.error) throw result.error;
        showToast('Reporte enviado', 'success');
    } catch (e) {
        showToast('Error al reportar', 'error');
    }
}