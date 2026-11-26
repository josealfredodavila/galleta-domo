// ================================================================
// CSARIEL'S · VIDEOS · COMENTARIOS (v2)
// ================================================================
// Hoja de comentarios de un video.
// - Abrir: muestra la hoja y carga los comentarios del video.
// - Enviar: inserta un comentario propio (RLS: usuario_id = auth.uid()),
//   protegido contra dobles envíos por toques rápidos o Enter repetido.
// - Eliminar: lo puede borrar el autor del comentario o el dueño del video.
//   Permisos en Supabase:
//     · "Videos comentarios DELETE propietario"  → autor del comentario
//     · "Videos comentarios DELETE dueño del video" → dueño del video
// - Actualiza el contador de la tarjeta sin recargar el feed.
// Expuesto en window.VideosApp.comentarios y window.abrirComentarios.
// Requiere: config, utils, feed, hojas.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.feed || !VA.hojas) {
        console.error('[Videos] videos-comentarios.js requiere config, utils, feed y hojas.');
        return;
    }
    if (VA.comentarios) return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;

    // Bandera anti-doble-envío.
    var enviandoComentario = false;
    // Token para evitar temporizadores de scroll colgados tras cambiar de video.
    var tokenCarga = 0;

    /* Fecha corta en español de México para cada comentario. */
    function formatearFecha(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString('es-MX', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /* Suma o resta uno al contador de comentarios de la tarjeta. */
    function ajustarContadorTarjeta(videoId, delta) {
        if (!videoId) return;
        var contEl = document.getElementById('comentCount-' + videoId);
        if (!contEl) return;
        var actual = U.leerContadorMostrado(contEl.textContent);
        contEl.textContent = U.formatContador(Math.max(0, actual + delta));
    }

    /* Abre la hoja de comentarios y carga los del video. */
    function abrirComentarios(videoId) {
        if (!videoId) return;
        S.videoIdComentariosActual = videoId;

        var lista = document.getElementById('comentariosLista');
        if (lista) lista.innerHTML = '<div class="vacio">Cargando…</div>';

        var contador = document.getElementById('sheetContador');
        if (contador) contador.textContent = '0';

        VA.hojas.abrirHoja('hojaComentarios');
        cargarComentarios(videoId);
    }

    /* Consulta los comentarios con el autor y los pinta en la hoja. */
    async function cargarComentarios(videoId) {
        if (!videoId) return;
        var lista = document.getElementById('comentariosLista');
        if (!lista) return;

        var miToken = ++tokenCarga;
        var sb = VA.cliente();
        if (!sb) return;

        try {
            var result = await sb.from(CONFIG.TABLA_VIDEOS_COMENTARIOS)
                .select('*, usuarios:usuario_id (id, nombre, handle, avatar_url)')
                .eq('video_id', videoId)
                .order('created_at', { ascending: true });
            if (result.error) throw result.error;

            // Descartar resultados si el usuario cambió de video mientras se cargaba.
            if (miToken !== tokenCarga) return;
            if (S.videoIdComentariosActual && S.videoIdComentariosActual !== videoId) return;

            // Revalidar que la lista siga en el DOM.
            lista = document.getElementById('comentariosLista');
            if (!lista) return;

            var data = result.data || [];

            var contador = document.getElementById('sheetContador');
            if (contador) contador.textContent = data.length;

            if (data.length === 0) {
                lista.innerHTML = '<div class="vacio">Sin comentarios todavía.</div>';
                return;
            }

            // ¿Soy el dueño del video? Puedo borrar cualquier comentario de mi video.
            var videoData = S.videosPublicados.find(function (x) { return x.id === videoId; });
            var soyDuenoDelVideo = !!(S.sessionUser && videoData && videoData.usuario_id === S.sessionUser.id);

            var html = '';
            data.forEach(function (c) {
                var u = c.usuarios || {};
                var avatar = u.avatar_url
                    ? '<img src="' + U.safeAttr(u.avatar_url) + '" alt="">'
                    : U.escapeHTML((u.nombre || 'U').charAt(0).toUpperCase());

                var puedoEliminar = !!(S.sessionUser &&
                    (c.usuario_id === S.sessionUser.id || soyDuenoDelVideo));

                html += '<div class="comentario"><div class="avatar">' + avatar + '</div><div class="cuerpo">';
                html += '<div class="nombre">' + U.escapeHTML(u.nombre || 'Usuario') +
                    (u.handle ? '<span class="handle">@' + U.escapeHTML(u.handle) + '</span>' : '') + '</div>';
                html += '<div class="texto">' + U.escapeHTML(c.contenido || '') + '</div>';
                html += '<div class="fecha">' + U.escapeHTML(formatearFecha(c.created_at)) + '</div></div>';
                if (puedoEliminar) {
                    html += '<button type="button" class="borrar" data-borrar-comentario="' +
                        U.escapeHTML(c.id) + '">Eliminar</button>';
                }
                html += '</div>';
            });

            lista.innerHTML = html;

            // Scroll al final con revalidación del token para evitar timers colgados.
            setTimeout(function () {
                if (miToken !== tokenCarga) return;
                var listaActual = document.getElementById('comentariosLista');
                if (!listaActual || !listaActual.isConnected) return;
                if (S.videoIdComentariosActual && S.videoIdComentariosActual !== videoId) return;
                listaActual.scrollTop = listaActual.scrollHeight;
            }, 80);
        } catch (e) {
            if (miToken !== tokenCarga) return;
            console.warn('[Videos] Error cargando comentarios:', e && e.message ? e.message : e);
            var listaErr = document.getElementById('comentariosLista');
            if (listaErr) listaErr.innerHTML = '<div class="vacio">No se pudieron cargar los comentarios.</div>';
        }
    }

    /* Envía el texto del campo de la hoja como comentario del video abierto. */
    async function enviarComentario() {
        var videoId = S.videoIdComentariosActual;
        if (!videoId || !S.sessionUser) {
            U.showToast('Inicia sesión para comentar', 'error');
            return;
        }

        var input = document.getElementById('inputComentarioSheet');
        var btn = document.getElementById('btnEnviarComentarioSheet');
        if (!input) return;

        var texto = input.value.trim();
        if (!texto) return;

        if (texto.length > CONFIG.MAX_CARACTERES_DESCRIPCION) {
            U.showToast('El comentario es demasiado largo', 'warning');
            return;
        }

        // Evitar envíos simultáneos por toques rápidos o Enter repetido.
        if (enviandoComentario) return;
        enviandoComentario = true;
        if (btn) btn.disabled = true;

        try {
            var sb = VA.cliente();
            var ins = await sb.from(CONFIG.TABLA_VIDEOS_COMENTARIOS).insert({
                video_id: videoId,
                usuario_id: S.sessionUser.id,
                contenido: texto
            });
            if (ins.error) throw ins.error;

            input.value = '';
            ajustarContadorTarjeta(videoId, 1);

            // Refrescar solo si seguimos en el mismo video.
            if (S.videoIdComentariosActual === videoId) {
                await cargarComentarios(videoId);
            }
        } catch (e) {
            console.warn('[Videos] Error enviando comentario:', e && e.message ? e.message : e);
            U.showToast('No se pudo enviar el comentario', 'error');
        } finally {
            enviandoComentario = false;
            if (btn) btn.disabled = false;
        }
    }

    /* Borra un comentario. Supabase decide si el usuario tiene permiso;
       aquí solo se confirma con el usuario y se refresca la lista. */
    async function eliminarComentario(comentarioId, videoId) {
        if (!S.sessionUser) return;
        if (!comentarioId || !videoId) return;
        if (!confirm('¿Eliminar este comentario?')) return;

        try {
            var sb = VA.cliente();
            if (!sb) return;

            var del = await sb.from(CONFIG.TABLA_VIDEOS_COMENTARIOS)
                .delete()
                .eq('id', comentarioId);
            if (del.error) throw del.error;

            // Comprobación de permiso: si no se eliminó, Supabase no lo permitió.
            var verifica = await sb.from(CONFIG.TABLA_VIDEOS_COMENTARIOS)
                .select('id')
                .eq('id', comentarioId)
                .maybeSingle();
            if (verifica.data) {
                U.showToast('No tienes permiso para eliminar este comentario', 'error');
                return;
            }

            ajustarContadorTarjeta(videoId, -1);

            // Refrescar solo si seguimos en el mismo video.
            if (S.videoIdComentariosActual === videoId) {
                await cargarComentarios(videoId);
            }
        } catch (e) {
            console.warn('[Videos] Error eliminando comentario:', e && e.message ? e.message : e);
            U.showToast('No se pudo eliminar', 'error');
        }
    }

    VA.comentarios = {
        abrirComentarios: abrirComentarios,
        cargarComentarios: cargarComentarios,
        enviarComentario: enviarComentario,
        eliminarComentario: eliminarComentario
    };

    /* Contrato global: los usa el HTML y videos-init.js. */
    window.abrirComentarios = abrirComentarios;
})();