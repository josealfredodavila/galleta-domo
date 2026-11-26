// ================================================================
// CSARIEL'S · VIDEOS · REACCIONES (v1.3)
// ================================================================
// Acciones de reacción sobre un video y hoja de resumen.
// - Elegir: crea el voto si no existe.
// - Cambiar: actualiza el voto si ya tenía otro emoji.
// - Quitar: borra el voto si toca el mismo emoji otra vez.
// - Resumen (v1.3): al tocar el número de reacciones se abre la hoja
//   #hojaReacciones con cada emoji que tiene votos, el total y "Tu
//   reacción". Se pinta desde caché y luego se consulta videos_likes
//   para ese video. Cambiar reacción desde la hoja usa elegirReaccion.
// Mantiene S.likeCache y S.reaccionesCache sincronizadas.
// Candado por videoId: un toque rápido no lanza dos operaciones a la vez.
// Tabla: CONFIG.TABLA_VIDEOS_LIKES (videos_likes), UNIQUE (video_id, usuario_id)
// y RLS: SELECT público; INSERT/UPDATE/DELETE solo sobre usuario_id = auth.uid().
// Expuesto en window.VideosApp.reacciones y window.elegirReaccion.
// Requiere: config, utils, feed, controles, hojas.
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

    /* Hoja de resumen. */
    var ID_HOJA = 'hojaReacciones';
    var ID_CUERPO = 'reaccionesCuerpo';
    var resumenVideoId = null;
    var estiloInyectado = false;

    /* Nombre visible de cada reacción. Si falta alguna, se usa "Reacción". */
    var NOMBRES = {
        '❤️': 'Me gusta',
        '😂': 'Me divierte',
        '🥺': 'Me conmueve',
        '💎': 'Me encanta',
        '🤩': 'Me asombra'
    };

    function emojisPermitidos() {
        if (!listaPermitidas) return [];
        var lista = listaPermitidas();
        return Array.isArray(lista) ? lista : [];
    }

    function nombreDe(emoji) {
        return NOMBRES[emoji] || 'Reacción';
    }

    /* Miles con coma, por ejemplo 1,284. */
    function formatoNumero(n) {
        return Number(n || 0).toLocaleString('es-MX');
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

    /* ---------------- Hoja de resumen ---------------- */

    /* Indica si la hoja de resumen está abierta en pantalla. */
    function resumenAbierto() {
        var h = document.getElementById(ID_HOJA);
        return !!(h && h.classList.contains('show'));
    }

    /* Estilos transparentes de la hoja. Se inyectan una sola vez. */
    function inyectarEstiloResumen() {
        if (estiloInyectado || document.getElementById('cs-rx-estilos')) {
            estiloInyectado = true;
            return;
        }
        estiloInyectado = true;

        var st = document.createElement('style');
        st.id = 'cs-rx-estilos';
        st.textContent = [
            '#hojaReacciones{background:rgba(6,10,14,.42)!important;',
            '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
            'border-top:1px solid rgba(255,255,255,.14)!important;max-height:72vh;}',
            '#hojaReacciones .hoja-cab{border-bottom:1px solid rgba(255,255,255,.10);}',
            '#hojaReacciones .hoja-titulo{color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.7);}',
            'body:has(#hojaReacciones.show) #hojaFondo{background:transparent!important;}',
            '.rx-cuerpo{padding:6px 16px calc(16px + env(safe-area-inset-bottom,0px));',
            'overflow-y:auto;display:flex;flex-direction:column;}',
            '.rx-fila{display:flex;align-items:center;gap:12px;padding:10px 2px;',
            'background:none;border:0;border-bottom:1px solid rgba(255,255,255,.08);',
            'color:#fff;font-family:Inter,sans-serif;font-size:.9rem;text-align:left;',
            'text-shadow:0 1px 5px rgba(0,0,0,.8);}',
            '.rx-emo{font-size:1.35rem;width:34px;text-align:center;',
            'filter:drop-shadow(0 2px 6px rgba(0,0,0,.7));}',
            '.rx-nombre{flex:1;}',
            '.rx-n{font-family:Orbitron,monospace;font-size:.78rem;color:#fff;',
            'text-shadow:0 1px 5px rgba(0,0,0,.8);}',
            '.rx-linea{display:flex;justify-content:space-between;align-items:center;',
            'padding:10px 2px;color:#e6eef5;font-size:.85rem;',
            'border-bottom:1px solid rgba(255,255,255,.08);text-shadow:0 1px 5px rgba(0,0,0,.8);}',
            '.rx-mia{color:#5cc8ff;font-weight:600;}',
            '.rx-vacio{color:#e6eef5;font-size:.85rem;padding:12px 2px;text-shadow:0 1px 5px rgba(0,0,0,.8);}',
            '.rx-picker-tit{margin-top:14px;text-align:center;font-family:Orbitron,monospace;',
            'font-size:.62rem;letter-spacing:.6px;color:#e6eef5;text-shadow:0 1px 5px rgba(0,0,0,.8);}',
            '.rx-picker{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;padding:10px 0 4px;}',
            '.rx-pick{width:46px;height:46px;border-radius:50%;background:transparent;',
            'border:1px solid rgba(255,255,255,.18);font-size:1.35rem;cursor:pointer;',
            'filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));}',
            '.rx-pick:active{transform:scale(.92);}',
            '.rx-pick.activa{border-color:#5cc8ff;box-shadow:0 0 12px rgba(0,229,255,.45);}'
        ].join('');
        document.head.appendChild(st);
    }

    /* Pinta el resumen desde la caché del video. */
    function renderResumen(videoId) {
        var cont = document.getElementById(ID_CUERPO);
        if (!cont) return;

        var r = S.reaccionesCache.get(videoId);
        var totales = (r && r.totales) || {};
        var miTipo = VA.feed.miReaccion(videoId);
        var permitidos = emojisPermitidos();

        var total = 0;
        Object.keys(totales).forEach(function (k) { total += totales[k] || 0; });

        var filas = permitidos
            .filter(function (e) { return (totales[e] || 0) > 0; })
            .sort(function (a, b) { return (totales[b] || 0) - (totales[a] || 0); });

        var html = '';

        if (!filas.length) {
            html += '<div class="rx-vacio">Aún no hay reacciones</div>';
        }

        filas.forEach(function (e) {
            html += '<div class="rx-fila">' +
                '<span class="rx-emo">' + U.escapeHTML(e) + '</span>' +
                '<span class="rx-nombre">' + U.escapeHTML(nombreDe(e)) + '</span>' +
                '<span class="rx-n">' + formatoNumero(totales[e]) + '</span>' +
                '</div>';
        });

        html += '<div class="rx-linea"><span>Reacciones totales</span>' +
            '<span class="rx-n">' + formatoNumero(total) + '</span></div>';

        html += '<div class="rx-linea"><span>Tu reacción</span>' +
            '<span class="rx-mia">' + (miTipo
                ? U.escapeHTML(miTipo) + ' ' + U.escapeHTML(nombreDe(miTipo))
                : 'Aún no reaccionas') +
            '</span></div>';

        html += '<div class="rx-picker-tit">CAMBIAR MI REACCIÓN</div><div class="rx-picker">';
        permitidos.forEach(function (e) {
            html += '<button type="button" class="rx-pick' + (miTipo === e ? ' activa' : '') +
                '" data-e="' + U.escapeHTML(e) + '" aria-label="' + U.escapeHTML(nombreDe(e)) + '">' +
                U.escapeHTML(e) + '</button>';
        });
        html += '</div>';

        cont.innerHTML = html;

        if (RG) {
            cont.querySelectorAll('.rx-emo').forEach(function (n) {
                RG.aplicarMotor(n, n.textContent);
            });
        }
    }

    /* Consulta videos_likes para este video y reemplaza su entrada en la caché. */
    async function refrescarResumenServidor(videoId) {
        var sb = VA.cliente();
        if (!sb) return;

        var r = await sb.from(CONFIG.TABLA_VIDEOS_LIKES)
            .select('tipo, usuario_id')
            .eq('video_id', videoId);
        if (r.error) throw r.error;

        var totales = {};
        var miTipo = null;

        (r.data || []).forEach(function (row) {
            var tipo = RG ? RG.normalizar(row.tipo) : (row.tipo || VA.reaccionPorDefecto());
            totales[tipo] = (totales[tipo] || 0) + 1;
            if (S.sessionUser && row.usuario_id === S.sessionUser.id) miTipo = tipo;
        });

        S.reaccionesCache.set(videoId, { totales: totales });

        if (S.sessionUser) {
            var clave = videoId + '_' + S.sessionUser.id;
            if (miTipo) S.likeCache.set(clave, miTipo);
            else S.likeCache.delete(clave);
        }
    }

    /* Abre la hoja de resumen de un video. Pinta desde caché y luego actualiza. */
    function abrirResumen(videoId) {
        if (!videoId) return;
        resumenVideoId = videoId;

        var hoja = document.getElementById(ID_HOJA);
        if (!hoja) return;

        renderResumen(videoId);
        VA.hojas.abrirHoja(ID_HOJA);

        refrescarResumenServidor(videoId)
            .then(function () {
                refrescarReaccionUI(videoId);
                if (resumenAbierto() && resumenVideoId === videoId) renderResumen(videoId);
            })
            .catch(function (e) {
                console.warn('[Videos] No se pudo actualizar el resumen:', e && e.message ? e.message : e);
            });
    }

    /* Tocar un emoji de la hoja cambia mi reacción (mismo flujo que la barra). */
    function engancharHojaResumen() {
        var hoja = document.getElementById(ID_HOJA);
        if (!hoja || hoja.dataset.rxEnganchada === '1') return;
        hoja.dataset.rxEnganchada = '1';

        hoja.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('.rx-pick');
            if (!b || !resumenVideoId) return;
            elegirReaccion(resumenVideoId, b.dataset.e);
        });
    }

    /* El número de reacciones de la tarjeta abre la hoja. Captura antes de la
       lógica de reproducir/pausar, para que el toque no llegue a ella. */
    function engancharNumeroReacciones() {
        var c = document.getElementById('videosContainer');
        if (!c || c.dataset.rxNumeroEnganchado === '1') return;
        c.dataset.rxNumeroEnganchado = '1';

        c.addEventListener('click', function (e) {
            var cnt = e.target.closest && e.target.closest('.acc-n[id^="likeCount-"]');
            if (!cnt) return;
            e.stopPropagation();
            var card = cnt.closest('.video-card');
            if (card) abrirResumen(card.dataset.videoId);
        }, true);
    }

    /* ---------------- Acción de reacción ---------------- */

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
            if (resumenAbierto() && resumenVideoId === videoId) renderResumen(videoId);
        } catch (err) {
            console.warn('[Videos] Error guardando reacción:', err && err.message ? err.message : err);
            U.showToast('No se pudo guardar tu reacción', 'error');
        } finally {
            /* El candado se libera siempre, con éxito o con error */
            delete enCurso[videoId];
        }
    }

    /* ---------------- Arranque del módulo ---------------- */

    inyectarEstiloResumen();
    engancharHojaResumen();
    engancharNumeroReacciones();

    /* Contrato público: VA.reacciones sigue siendo invocable como lista de emojis
       (lo usan otros módulos) y expone elegirReaccion, refrescarReaccionUI,
       ajustarTotal y abrirResumen. */
    var reaccionesPublico = function () {
        return emojisPermitidos();
    };
    reaccionesPublico.elegirReaccion = elegirReaccion;
    reaccionesPublico.refrescarReaccionUI = refrescarReaccionUI;
    reaccionesPublico.ajustarTotal = ajustarTotal;
    reaccionesPublico.abrirResumen = abrirResumen;

    VA.reacciones = reaccionesPublico;

    /* Contrato global: se usa desde los atributos del HTML si hace falta. */
    window.elegirReaccion = elegirReaccion;
})();