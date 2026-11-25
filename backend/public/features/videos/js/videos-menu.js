// ================================================================
// CSARIEL'S · VIDEOS · MENÚ DEL VIDEO (v1)
// ================================================================
// Menú de opciones de cada video (hoja inferior #hojaMenu).
// - Descargar el video.
// - Compartir enlace (Web Share o copiar al portapapeles).
// - Reportar: guarda en videos_reportes (RLS: usuario_id = auth.uid()).
//   Un usuario solo puede reportar un video una vez (restricción única).
// - Eliminar: solo el dueño del video (Supabase valida con
//   la política "Videos DELETE propietario").
// Expuesto en window.VideosApp.menu.
// Requiere: config, utils, feed, hojas.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.feed || !VA.hojas) {
        console.error('[Videos] videos-menu.js requiere config, utils, feed y hojas.');
        return;
    }
    if (VA.menu) return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;
    var ICONO = U.ICONO;

    /* Agrega una opción a la lista de la hoja del menú. */
    function opcionMenu(lista, icono, texto, accion, peligro) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'hoja-op' + (peligro ? ' peligro' : '');
        b.innerHTML = icono + '<span>' + U.escapeHTML(texto) + '</span>';
        b.addEventListener('click', accion);
        lista.appendChild(b);
    }

    /* Abre el menú de un video. Pausa el video para que no siga sonando. */
    function abrirMenuVideo(videoId) {
        var v = VA.feed.buscarVideoPorId(videoId);
        if (!v) return;

        var card = document.querySelector('.video-card[data-video-id="' + videoId + '"]');
        var video = card ? card.querySelector('video') : null;
        if (video && !video.paused) video.pause();

        var titulo = document.getElementById('menuTitulo');
        if (titulo) titulo.textContent = 'Opciones';

        var lista = document.getElementById('menuLista');
        if (!lista) return;
        lista.innerHTML = '';

        opcionMenu(lista, ICONO.descargar, 'Descargar video', function () {
            VA.hojas.cerrarHoja('hojaMenu');
            descargarVideo(videoId);
        });

        opcionMenu(lista, ICONO.compartirMenu, 'Compartir', function () {
            VA.hojas.cerrarHoja('hojaMenu');
            compartirVideo(videoId);
        });

        opcionMenu(lista, ICONO.reportar, 'Reportar publicación', function () {
            mostrarMotivosReporte(videoId);
        });

        if (S.sessionUser && v.usuario_id === S.sessionUser.id) {
            opcionMenu(lista, ICONO.eliminar, 'Eliminar publicación', function () {
                VA.hojas.cerrarHoja('hojaMenu');
                eliminarMiVideo(videoId);
            }, true);
        }

        VA.hojas.abrirHoja('hojaMenu');
    }

    /* Segunda pantalla del menú: elegir el motivo del reporte. */
    function mostrarMotivosReporte(videoId) {
        var titulo = document.getElementById('menuTitulo');
        if (titulo) titulo.textContent = 'Motivo del reporte';

        var lista = document.getElementById('menuLista');
        if (!lista) return;
        lista.innerHTML = '';

        CONFIG.MOTIVOS_REPORTE.forEach(function (motivo) {
            opcionMenu(lista, ICONO.reportar, motivo, function () {
                VA.hojas.cerrarHoja('hojaMenu');
                reportarVideo(videoId, motivo);
            });
        });
    }

    /* Guarda el reporte en videos_reportes. */
    async function reportarVideo(videoId, motivo) {
        if (!S.sessionUser) {
            U.showToast('Inicia sesión para reportar', 'error');
            return;
        }

        var sb = VA.cliente();
        try {
            // Revisa si ya reportó este video (RLS: solo veo mis reportes)
            var previo = await sb.from(CONFIG.TABLA_VIDEOS_REPORTES)
                .select('id')
                .eq('usuario_id', S.sessionUser.id)
                .eq('video_id', videoId)
                .maybeSingle();
            if (previo.data) {
                U.showToast('Ya reportaste esta publicación', 'warning');
                return;
            }

            var ins = await sb.from(CONFIG.TABLA_VIDEOS_REPORTES).insert({
                usuario_id: S.sessionUser.id,
                video_id: videoId,
                motivo: motivo,
                estado: 'pendiente'
            });
            if (ins.error) throw ins.error;

            U.showToast('Gracias. Revisaremos la publicación.', 'success');
        } catch (e) {
            console.warn('[Videos] Error reportando:', e && e.message ? e.message : e);
            U.showToast('No se pudo enviar el reporte', 'error');
        }
    }

    /* Descarga un enlace como archivo. */
    function descargarEnlace(href, nombre) {
        var a = document.createElement('a');
        a.href = href;
        a.download = nombre;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    /* Descarga el video como blob; si falla (CORS u otro), abre el enlace directo. */
    async function descargarVideo(videoId) {
        var v = VA.feed.buscarVideoPorId(videoId);
        if (!v || !v.url_video) return;

        var nombre = 'csariels-' + videoId + '.mp4';
        try {
            var r = await fetch(v.url_video);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            var blob = await r.blob();
            var url = URL.createObjectURL(blob);
            descargarEnlace(url, nombre);
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        } catch (e) {
            descargarEnlace(v.url_video, nombre);
        }
    }

    /* Comparte el enlace del video (?v=id). El feed abre ese video al llegar. */
    async function compartirVideo(videoId) {
        var url = window.location.origin + CONFIG.RUTA_VIDEO_COMPARTIR + videoId;
        try {
            if (navigator.share) {
                await navigator.share({ title: "Csariel's Video", url: url });
            } else {
                await navigator.clipboard.writeText(url);
                U.showToast('Enlace copiado', 'success');
            }
        } catch (e) {
            if (e.name !== 'AbortError') U.showToast('No se pudo compartir', 'warning');
        }
    }

    /* Elimina mi video. Supabase valida que sea el dueño. */
    async function eliminarMiVideo(videoId) {
        if (!videoId || !confirm('¿Eliminar este video?')) return;

        var session = await U.getSession();
        if (!session) {
            U.showToast('Inicia sesión', 'error');
            return;
        }

        try {
            var sb = VA.cliente();
            var del = await sb.from(CONFIG.TABLA_VIDEOS)
                .delete()
                .eq('id', videoId);
            if (del.error) throw del.error;

            U.showToast('Video eliminado', 'success');
            await VA.feed.cargarVideos();
        } catch (e) {
            console.warn('[Videos] Error eliminando video:', e && e.message ? e.message : e);
            U.showToast('No se pudo eliminar', 'error');
        }
    }

    VA.menu = {
        abrirMenuVideo: abrirMenuVideo,
        reportarVideo: reportarVideo,
        descargarVideo: descargarVideo,
        compartirVideo: compartirVideo,
        eliminarMiVideo: eliminarMiVideo
    };

    /* Contrato global: el HTML y otros módulos los pueden llamar. */
    window.compartirVideo = compartirVideo;
    window.eliminarMiVideo = eliminarMiVideo;
})();