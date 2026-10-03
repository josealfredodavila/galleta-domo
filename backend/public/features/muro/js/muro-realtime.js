// ================================================================
// MURO · REALTIME
// ================================================================
// Suscripción a nuevas publicaciones en tiempo real + limpieza
// de recursos al cerrar la página.
// Depende de: muro-config.js, muro-publicaciones.js
// ================================================================

// ================================================================
// SUSCRIPCIÓN A POSTS EN TIEMPO REAL
// ================================================================
async function suscribirseARealtime() {
    // Limpiar canal previo si existe
    if (muroChannel) {
        try { await supabaseClient.removeChannel(muroChannel); } catch (e) {}
    }

    muroChannel = supabaseClient
        .channel('muro-realtime')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'muro_posts'
        }, function(payload) {
            // Ignorar si ya se está procesando otro realtime
            if (isRealtimeProcessing) return;

            // Ignorar si es un post propio (ya se agregó por publicar())
            if (sessionUser && payload.new.usuario_id === sessionUser.id) return;

            isRealtimeProcessing = true;

            setTimeout(async function() {
                try {
                    var fc = document.getElementById('feedContainer');
                    if (!fc) return;

                    // Quitar estado vacío si existe
                    var empty = fc.querySelector('.empty-state');
                    if (empty) empty.remove();

                    var postId = payload.new.id;

                    // Cargar el post con sus relaciones
                    var result = await supabaseClient
                        .from('muro_posts_publicos')
                        .select('*, temas:tema_id (id, nombre, emoji, slug), muro_likes(count), muro_comentarios(count)')
                        .eq('id', postId)
                        .single();

                    if (!result.error && result.data) {
                        // Insertar al principio del feed
                        fc.insertBefore(renderizarPost(result.data), fc.firstChild);
                    }
                } catch (e) {
                    console.warn('Error realtime:', e);
                } finally {
                    isRealtimeProcessing = false;
                }
            }, 500);
        })
        .subscribe();

    return muroChannel;
}

// ================================================================
// LIMPIAR RECURSOS AL CERRAR LA PÁGINA
// ================================================================
function limpiarRecursosMuro() {
    try {
        if (muroChannel) {
            supabaseClient.removeChannel(muroChannel);
            muroChannel = null;
        }
    } catch (e) {}

    try {
        if (observerGlobal) {
            observerGlobal.disconnect();
            observerGlobal = null;
        }
    } catch (e) {}

    try {
        if (pagoActual.pollingInterval) {
            clearInterval(pagoActual.pollingInterval);
            pagoActual.pollingInterval = null;
        }
        if (pagoActual.contadorInterval) {
            clearInterval(pagoActual.contadorInterval);
            pagoActual.contadorInterval = null;
        }
    } catch (e) {}
}

window.addEventListener('beforeunload', limpiarRecursosMuro);