// ================================================================
// CSARIEL'S · VIDEOS · REACCIONES (v1.1)
// ================================================================
// Acciones de reacción sobre un video.
// - Elegir: crea el voto si no existe.
// - Cambiar: actualiza el voto si ya tenía otro emoji.
// - Quitar: borra el voto si toca el mismo emoji otra vez.
// Mantiene la caché local y actualiza el contador y el emoji
// en pantalla sin recargar el feed.
// Las tablas tienen RLS: el usuario solo modifica sus propios votos
// (política INSERT/UPDATE/DELETE por usuario_id = auth.uid()).
// v1.1: corregido el nombre de la lista de reacciones permitidas
//       (VA.reacciones(), definida en videos-config.js).
// Expuesto en window.VideosApp.reacciones.
// Requiere: config, utils, feed, controles.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.feed || !VA.controles) {
        console.error('[Videos] videos-reacciones.js requiere config, utils, feed y controles.');
        return;
    }
    if (VA.reacciones) return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;
    var ICONO = U.ICONO;
    var RG = window.ReaccionesGlobal;

    /* Suma o resta un voto en la caché de totales. Nunca baja de 0. */
    function ajustarTotal(videoId, tipo, delta) {
        if (!S.reaccionesCache.has(videoId)) {
            S.reaccionesCache.set(videoId, { totales: {} });
        }
        var obj = S.reaccionesCache.get(videoId);
        obj.totales[tipo] = Math.max(0, (obj.totales[tipo] || 0) + delta);
    }

    /* Repinta el botón de reacción, el contador y la marca de la barra. */
    function refrescarReaccionUI(videoId) {
        var card = document.querySelector('.video-card[data-video-id="' + videoId + '"]');
        if (!card) return;

        var miTipo = VA.feed.miReaccion(videoId);

        var btn = card.querySelector('.reac-btn');
        if (btn) {
            btn.innerHTML = miTipo
                ? '<span class="reac-emoji emoji-actual">' + U.escapeHTML(miTipo) + '</span>'
                : ICONO.corazon;
            var nuevo = btn.querySelector('.reac-emoji');
            if (nuevo && RG) RG.aplicarMotor(nuevo, miTipo);
        }

        var conteo = document.getElementById('likeCount-' + videoId);
        if (conteo) conteo.textContent = U.formatContador(VA.feed.contarReacciones(videoId, 0));

        card.querySelectorAll('.reac-op').forEach(function (op) {
            op.classList.toggle('activa', op.dataset.e === miTipo);
        });
    }

    /* Registra, cambia o quita mi reacción sobre un video.
       emoji: uno de los permitidos por ReaccionesGlobal. */
    async function elegirReaccion(videoId, emoji) {
        if (!S.sessionUser) {
            U.showToast('Inicia sesión para reaccionar', 'error');
            return;
        }
        if (VA.reacciones().indexOf(emoji) === -1) return;

        VA.controles.cerrarBarrasReacciones();

        var sb = VA.cliente();
        var clave = videoId + '_' + S.sessionUser.id;
        var previo = S.likeCache.get(clave);

        try {
            if (previo === emoji) {
                // Mismo emoji otra vez: quitar mi voto
                var d = await sb.from(CONFIG.TABLA_VIDEOS_LIKES)
                    .delete()
                    .eq('video_id', videoId)
                    .eq('usuario_id', S.sessionUser.id);
                if (d.error) throw d.error;

                S.likeCache.delete(clave);
                ajustarTotal(videoId, previo, -1);

            } else if (previo) {
                // Ya tenía otro emoji: cambiar mi voto
                var u = await sb.from(CONFIG.TABLA_VIDEOS_LIKES)
                    .update({ tipo: emoji })
                    .eq('video_id', videoId)
                    .eq('usuario_id', S.sessionUser.id);
                if (u.error) throw u.error;

                S.likeCache.set(clave, emoji);
                ajustarTotal(videoId, previo, -1);
                ajustarTotal(videoId, emoji, 1);

            } else {
                // Primera reacción: crear mi voto
                var ins = await sb.from(CONFIG.TABLA_VIDEOS_LIKES)
                    .insert({ video_id: videoId, usuario_id: S.sessionUser.id, tipo: emoji });
                if (ins.error) throw ins.error;

                S.likeCache.set(clave, emoji);
                ajustarTotal(videoId, emoji, 1);
                U.vibrar(12);
            }

            refrescarReaccionUI(videoId);
        } catch (err) {
            console.warn('[Videos] Error guardando reacción:', err && err.message ? err.message : err);
            U.showToast('No se pudo guardar tu reacción', 'error');
        }
    }

    VA.reacciones = {
        elegirReaccion: elegirReaccion,
        refrescarReaccionUI: refrescarReaccionUI,
        ajustarTotal: ajustarTotal
    };

    /* Contrato global: se usa desde los atributos del HTML si hace falta. */
    window.elegirReaccion = elegirReaccion;
})();