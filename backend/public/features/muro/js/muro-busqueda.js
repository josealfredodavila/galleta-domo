// ================================================================
// MURO · BÚSQUEDA
// ================================================================
// Buscar por hashtag y por tema (slug).
// Depende de: muro-config.js, muro-utils.js, muro-publicaciones.js, muro-temas.js
// ================================================================

// ================================================================
// BUSCAR POR HASHTAG
// ================================================================
async function buscarHashtag(tag) {
    if (!tag) return;
    try {
        var result = await supabaseClient
            .from('muro_posts_publicos')
            .select('*, temas:tema_id (id, nombre, emoji, slug), muro_likes(count), muro_comentarios(count)')
            .ilike('contenido', '%#' + tag + '%')
            .order('created_at', { ascending: false })
            .limit(50);
        if (result.error) throw result.error;

        var data = result.data;
        var feedContainer = document.getElementById('feedContainer');
        if (!feedContainer) return;

        feedContainer.innerHTML = '';

        if (!data || data.length === 0) {
            feedContainer.innerHTML = '<div class="empty-state">' +
                '<svg class="icon" viewBox="0 0 24 24" style="width:2.5rem;height:2.5rem;margin:0 auto 16px;color:var(--gold);opacity:0.4;display:block;">' +
                    '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>' +
                    '<line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>' +
                '</svg>' +
                '<h3>#' + tag + '</h3>' +
                '<p>No se encontraron publicaciones</p>' +
                '<button class="btn-gold" onclick="cargarPublicaciones()" style="margin-top:12px;padding:8px 24px;">Volver</button>' +
            '</div>';
            return;
        }

        // Header con info de búsqueda
        var header = document.createElement('div');
        header.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--glass-border);margin-bottom:16px;';
        header.innerHTML = '<h3 style="font-family:Orbitron,monospace;color:var(--gold);font-size:0.9rem;">#' + tag + ' · ' + data.length + ' publicaciones</h3>' +
            '<button onclick="cargarPublicaciones()" style="background:transparent;border:none;color:var(--text-muted);font-size:0.7rem;cursor:pointer;">← Volver al feed</button>';
        feedContainer.appendChild(header);

        data.forEach(function(post) {
            feedContainer.appendChild(renderizarPost(post));
        });
    } catch (e) {
        console.error('Error buscando hashtag:', e);
        showToast('Error al buscar', 'error');
    }
}

// ================================================================
// BUSCAR POR TEMA (slug)
// ================================================================
async function buscarPorTemaSlug(slug) {
    try {
        var tema = temasDisponibles.find(function(t) { return t.slug === slug; });
        if (!tema) {
            showToast('Tema no encontrado', 'error');
            return;
        }

        var result = await supabaseClient
            .from('muro_posts_publicos')
            .select('*, temas:tema_id (id, nombre, emoji, slug), muro_likes(count), muro_comentarios(count)')
            .eq('tema_id', tema.id)
            .order('created_at', { ascending: false })
            .limit(50);
        if (result.error) throw result.error;

        var data = result.data;
        var feedContainer = document.getElementById('feedContainer');
        if (!feedContainer) return;

        feedContainer.innerHTML = '';

        if (!data || data.length === 0) {
            feedContainer.innerHTML = '<div class="empty-state">' +
                '<svg class="icon" viewBox="0 0 24 24" style="width:2.5rem;height:2.5rem;margin:0 auto 16px;color:var(--gold);opacity:0.4;display:block;">' +
                    '<polygon points="12 2 20 7 20 17 12 22 4 17 4 7 12 2"/>' +
                    '<polygon points="12 7 16 9.5 16 14.5 12 17 8 14.5 8 9.5 12 7"/>' +
                '</svg>' +
                '<h3>' + escapeHTML(tema.nombre) + '</h3>' +
                '<p>Sin publicaciones de este tema todavía</p>' +
                '<button class="btn-gold" onclick="cargarPublicaciones()" style="margin-top:12px;padding:8px 24px;">Volver</button>' +
            '</div>';
            return;
        }

        // Header con info de búsqueda
        var header = document.createElement('div');
        header.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--glass-border);margin-bottom:16px;';
        header.innerHTML = '<h3 style="font-family:Orbitron,monospace;color:var(--gold);font-size:0.9rem;">' +
                escapeHTML(tema.nombre) + ' · ' + data.length + ' publicaciones' +
            '</h3>' +
            '<button onclick="cargarPublicaciones()" style="background:transparent;border:none;color:var(--text-muted);font-size:0.7rem;cursor:pointer;">← Volver al feed</button>';
        feedContainer.appendChild(header);

        data.forEach(function(post) {
            feedContainer.appendChild(renderizarPost(post));
        });
    } catch (e) {
        console.error('Error buscando por tema:', e);
        showToast('Error al buscar', 'error');
    }
}