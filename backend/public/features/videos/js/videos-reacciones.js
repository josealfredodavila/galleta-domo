// ================================================================
// CSARIEL'S · VIDEOS · REACCIONES (v1.2)
// ================================================================
// Acciones de reacción sobre un video.
// - Elegir: crea el voto si no existe.
// - Cambiar: actualiza el voto si ya tenía otro emoji.
// - Quitar: borra el voto si toca el mismo emoji otra vez.
// Mantiene S.likeCache y S.reaccionesCache sincronizadas y actualiza
// el contador y el emoji en pantalla sin recargar el feed.
// Candado por videoId: un toque rápido no lanza dos operaciones a la vez.
// Tabla: CONFIG.TABLA_VIDEOS_LIKES (videos_likes), con UNIQUE (video_id, usuario_id)
// y RLS: SELECT público; INSERT/UPDATE/DELETE solo sobre usuario_id = auth.uid().
// Expuesto en window.VideosApp.reacciones y window.elegirReaccion.
// Requiere: config, utils, feed, controles.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.feed || !VA.controles) {
        console.error('[Videos] videos-reacciones.js requiere config, utils, feed y controles.');
        return;
    }
    if (VA.reacciones && typeof VA.reacciones.elegirReaccion === 'function') return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;
    var ICONO = U.ICONO;
    var RG = window.ReaccionesGlobal;

    /* videos-config.js define VA.reacciones() como función que devuelve la lista
       de emojis permitidos. Se guarda la referencia antes de montar el objeto público. */
    var listaPermitidas = typeof VA.reacciones === 'function' ? VA.reacciones : null;

    /* Candado por videoId: evita operaciones simultáneas sobre el mismo video. */
    var enCurso = {};

    function emojisPermitidos() {
        if (!listaPermitidas) return [];
        var lista = listaPermitidas();
        return Array.isArray(lista) ? lista : [];
    }

    /* Suma o resta un voto en la caché de totales. Nunca baja de 0. */
    function ajustarTotal(videoId, tipo, delta) {
        if (!tipo) return;
        if (!S.reaccionesCache.has(videoId)) {
            S.reaccionesCache.set(videoId, { totales: {} });
        }
        var obj = S.reaccionesCache.get(videoId);
        obj.totales[tipo] = Math.max(0, (obj.totales[tipo] || 0) + delta);
    }

    /* Repinta el botón, el contador y la marca de la barra en cada tarjeta
       conectada de ese video. */
    function refrescarReaccionUI(videoId) {
        var tarjetas = document.querySelectorAll('.video-card[data-video-id="' + videoId + '"]');
        if (!tarjetas.length) return;

        var miTipo = VA.feed.miReaccion(videoId);
        var conteo = document.getElementById('likeCount-' + videoId);
        if (conteo) {
            conteo.textContent = U.formatContador(VA.feed.contarReacciones(videoId, 0));
        }

        for (var i = 0; i < tarjetas.length; i++) {
            var card = tarjetas[i];
            if (!card || !card.isConnected) continue;

            var btn = card.querySelector('.reac-btn');
            if (btn) {
                btn.innerHTML = miTipo
                    ? '<span class="reac-emoji emoji-actual">' + U.escapeHTML(miTipo) + '</span>'
                    : ICONO.corazon;
                var nuevo = btn.querySelector('.reac-emoji');
                if (nuevo && RG) RG.aplicarMotor(nuevo, miTipo);
            }

            card.querySelectorAll('.reac-op').forEach(function (op) {
                op.classList.toggle('activa', op.dataset.e === miTipo);
            });
        }
    }

    /* Lee mi voto real en Supabase y alinea S.likeCache con el servidor.
       Una sola lectura, sin reintentos. Devuelve el tipo real o null. */
    async function sincronizarMiVoto(videoId, clave) {
        var r = await VA.cliente()
            .from(CONFIG.TABLA_VIDEOS_LIKES)
            .select('tipo')
            .eq('video_id', videoId)
            .eq('usuario_id', S.sessionUser.id)
            .maybeSingle();
        if (r.error) throw r.error;

        var tipoReal = r.data && r.data.tipo ? r.data.tipo : null;
        if (tipoReal) S.likeCache.set(clave, tipoReal);
        else S.likeCache.delete(clave);
        return tipoReal;
    }

    /* Registra, cambia o quita mi reacción sobre un video.
       emoji: uno de los permitidos por ReaccionesGlobal. */
    async function elegirReaccion(videoId, emoji) {
        if (!S.sessionUser) {
            U.showToast('Inicia sesión para reaccionar', 'error');
            return;
        }
        if (!videoId) return;

        var permitidos = emojisPermitidos();
        if (permitidos.indexOf(emoji) === -1) return;

        if (enCurso[videoId]) return;
        enCurso[videoId] = true;

        VA.controles.cerrarBarrasReacciones();

        var clave = videoId + '_' + S.sessionUser.id;
        var usuarioId = S.sessionUser.id;
        var previo = S.likeCache.get(clave) || null;

        try {
            var sb = VA.cliente();
            var tabla = CONFIG.TABLA_VIDEOS_LIKES;

            if (previo === emoji) {
                /* Estado 1: quitar mi voto (mismo emoji otra vez) */
                var d = await sb.from(tabla)
                    .delete()
                    .eq('video_id', videoId)
                    .eq('usuario_id', usuarioId)
                    .select('id');
                if (d.error) throw d.error;

                if (!d.data || d.data.length === 0) {
                    /* El voto ya no existía en el servidor: alinear caché y salir */
                    await sincronizarMiVoto(videoId, clave);
                    U.showToast('Tu reacción ya no estaba registrada', 'info');
                } else {
                    S.likeCache.delete(clave);
                    ajustarTotal(videoId, previo, -1);
                }

            } else if (previo) {
                /* Estado 2: cambiar mi voto (otro emoji) */
                var u = await sb.from(tabla)
                    .update({ tipo: emoji })
                    .eq('video_id', videoId)
                    .eq('usuario_id', usuarioId)
                    .select('id');
                if (u.error) throw u.error;

                if (!u.data || u.data.length === 0) {
                    await sincronizarMiVoto(videoId, clave);
                    U.showToast('Tu reacción cambió en otro dispositivo', 'info');
                } else {
                    S.likeCache.set(clave, emoji);
                    ajustarTotal(videoId, previo, -1);
                    ajustarTotal(videoId, emoji, 1);
                }

            } else {
                /* Estado 3: crear mi voto (sin reacción previa) */
                var ins = await sb.from(tabla)
                    .insert({ video_id: videoId, usuario_id: usuarioId, tipo: emoji });

                if (ins.error) {
                    /* 23505: ya existe un voto mío (otro dispositivo o caché vieja) */
                    if (ins.error.code === '23505') {
                        var real = await sincronizarMiVoto(videoId, clave);
                        if (real) ajustarTotal(videoId, real, 1);
                        U.showToast('Tu reacción ya estaba registrada', 'info');
                    } else {
                        throw ins.error;
                    }
                } else {
                    S.likeCache.set(clave, emoji);
                    ajustarTotal(videoId, emoji, 1);
                    U.vibrar(12);
                }
            }

            refrescarReaccionUI(videoId);
        } catch (err) {
            console.warn('[Videos] Error guardando reacción:', err && err.message ? err.message : err);
            U.showToast('No se pudo guardar tu reacción', 'error');
        } finally {
            /* El candado se libera siempre, con éxito o con error */
            delete enCurso[videoId];
        }
    }

    /* Contrato público: VA.reacciones sigue siendo invocable como lista de emojis
       (lo usan otros módulos) y expone elegirReaccion, refrescarReaccionUI y ajustarTotal. */
    var reaccionesPublico = function () {
        return emojisPermitidos();
    };
    reaccionesPublico.elegirReaccion = elegirReaccion;
    reaccionesPublico.refrescarReaccionUI = refrescarReaccionUI;
    reaccionesPublico.ajustarTotal = ajustarTotal;

    VA.reacciones = reaccionesPublico;

    /* Contrato global: se usa desde los atributos del HTML si hace falta. */
    window.elegirReaccion = elegirReaccion;
})();
